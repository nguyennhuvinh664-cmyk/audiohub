// functions/api/audio/[[catchall]].js
// Audio API — R2 primary, chunked upload support for large files

import { uploadAudio, deleteAudio } from '../../lib/r2.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Chunk-Index, X-Total-Chunks, X-Content-Length'
  };

  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const pathParts = params.catchall || [];
    const storyId = pathParts[0];

    if (!storyId) {
      return Response.json({ error: 'Story ID is required' }, { status: 400, headers: corsHeaders });
    }

    const url = new URL(request.url);
    const customKey = url.searchParams.get('key');
    const r2Key = customKey || `${storyId}.mp3`;
    const action = url.searchParams.get('action');

    // ── PUT /api/audio/:storyId?action=chunk&index=N — upload single chunk ──
    if (method === 'PUT' && action === 'chunk') {
      if (!env.AUDIO) return Response.json({ error: 'R2 not configured' }, { status: 500, headers: corsHeaders });
      const idx = Number(url.searchParams.get('index'));
      if (isNaN(idx)) return Response.json({ error: 'Missing chunk index' }, { status: 400, headers: corsHeaders });

      const chunkKey = `_chunks/${r2Key}/${idx}`;
      await env.AUDIO.put(chunkKey, request.body, {
        httpMetadata: { contentType: 'application/octet-stream' }
      });
      console.log(`[audio] ✅ Chunk ${idx} stored: ${chunkKey}`);
      return Response.json({ success: true, index: idx }, { headers: corsHeaders });
    }

    // ── POST /api/audio/:storyId?action=assemble — merge chunks into final file ──
    if (method === 'POST' && action === 'assemble') {
      if (!env.AUDIO) return Response.json({ error: 'R2 not configured' }, { status: 500, headers: corsHeaders });

      const body = await request.json().catch(() => ({}));
      const totalChunks = Number(body.totalChunks);
      const contentType = body.contentType || 'audio/mpeg';
      if (!totalChunks || totalChunks < 1) return Response.json({ error: 'Invalid totalChunks' }, { status: 400, headers: corsHeaders });

      console.log(`[audio] Assembling ${totalChunks} chunks → ${r2Key}`);

      // Read all chunks, concatenate into one ReadableStream
      const readers = [];
      for (let i = 0; i < totalChunks; i++) {
        const chunkKey = `_chunks/${r2Key}/${i}`;
        const obj = await env.AUDIO.get(chunkKey);
        if (!obj || !obj.body) {
          return Response.json({ error: `Chunk ${i} missing` }, { status: 400, headers: corsHeaders });
        }
        readers.push(obj.body.getReader());
      }

      const totalSize = Number(body.totalSize) || 0;
      const stream = new ReadableStream({
        async pull(controller) {
          while (readers.length > 0) {
            const reader = readers[0];
            const { done, value } = await reader.read();
            if (!done) { controller.enqueue(value); return; }
            readers.shift();
          }
          controller.close();
        }
      });

      await env.AUDIO.put(r2Key, stream, { httpMetadata: { contentType } });
      console.log(`[audio] ✅ Assembled → ${r2Key} (${totalSize} bytes)`);

      // Cleanup chunks (fire-and-forget)
      const cleanup = [];
      for (let i = 0; i < totalChunks; i++) {
        cleanup.push(env.AUDIO.delete(`_chunks/${r2Key}/${i}`).catch(() => {}));
      }
      Promise.all(cleanup).then(() => console.log(`[audio] Cleaned ${totalChunks} chunks`));

      return Response.json({ success: true, key: r2Key, size: totalSize }, { headers: corsHeaders });
    }

    // ── HEAD — check if audio exists ──
    if (method === 'HEAD') {
      if (env.AUDIO) {
        // 1) Check assembled file
        try {
          const head = await env.AUDIO.head(r2Key);
          if (head) {
            return new Response(null, {
              status: 200,
              headers: {
                'Content-Type': head.httpMetadata?.contentType || 'audio/mpeg',
                'Content-Length': String(head.size || 0),
                'Accept-Ranges': 'bytes',
                ...corsHeaders
              }
            });
          }
        } catch (e) { /* fall through */ }
        // 2) Check chunks (not yet assembled)
        try {
          const firstChunk = await env.AUDIO.head(`_chunks/${r2Key}/0`);
          if (firstChunk) {
            console.log('[audio][HEAD] chunks exist (not assembled):', r2Key);
            return new Response(null, {
              status: 200,
              headers: {
                'Content-Type': 'audio/mpeg',
                'Accept-Ranges': 'no',
                ...corsHeaders
              }
            });
          }
        } catch (e) { /* fall through */ }
      }
      return new Response(null, { status: 404, headers: corsHeaders });
    }

    // ── GET — serve audio (assembled file, then fallback to chunks) ──
    if (method === 'GET') {
      const rangeHeader = request.headers.get('Range') || '';

      // 1) Try assembled file in R2
      if (env.AUDIO) {
        try {
          const headObj = await env.AUDIO.head(r2Key);
          if (headObj) {
            const contentType = headObj.httpMetadata?.contentType || 'audio/mpeg';
            const size = headObj.size || 0;
            const headers = {
              'Content-Type': contentType,
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'private, max-age=3600',
              ...corsHeaders
            };

            if (rangeHeader) {
              const m = rangeHeader.match(/bytes=(\d*)-(\d*)/);
              if (m) {
                const start = m[1] ? parseInt(m[1], 10) : size - 1;
                const end = m[2] ? parseInt(m[2], 10) : size - 1;
                const len = end - start + 1;
                if (start < size && start >= 0 && len > 0) {
                  const object = await env.AUDIO.get(r2Key, { range: { offset: start, length: len } });
                  if (object && object.body) {
                    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
                    headers['Content-Length'] = String(len);
                    return new Response(object.body, { status: 206, headers });
                  }
                }
                headers['Content-Range'] = `bytes */${size}`;
                return new Response(null, { status: 416, headers });
              }
            }

            const object = await env.AUDIO.get(r2Key);
            if (object && object.body) {
              if (size) headers['Content-Length'] = String(size);
              return new Response(object.body, { headers });
            }
          }
        } catch (e) {
          console.error('[audio] R2 GET error:', e.message);
        }
      }

      // 2) Fallback: find and stream chunks (browser hasn't triggered assemble yet)
      console.log('[audio] Assembled file miss, checking chunks for:', r2Key);
      const chunkParts = [];
      for (let i = 0; i < 500; i++) {
        try {
          const obj = await env.AUDIO.get(`_chunks/${r2Key}/${i}`);
          if (!obj || !obj.body) break;
          chunkParts.push(obj.body);
        } catch (e) { break; }
      }

      if (chunkParts.length > 0) {
        console.log(`[audio] Found ${chunkParts.length} chunks, streaming`);
        let offset = 0;
        const ranges = chunkParts.map((body, i) => {
          const start = offset;
          offset += body ? 0 : 0; // size unknown per chunk
          return body;
        });

        // Concatenate all chunk streams
        const readers = chunkParts.map(b => b.getReader());
        const stream = new ReadableStream({
          async pull(controller) {
            while (readers.length > 0) {
              const { done, value } = await readers[0].read();
              if (!done) { controller.enqueue(value); return; }
              readers.shift();
            }
            controller.close();
          }
        });

        return new Response(stream, {
          status: 200,
          headers: {
            'Content-Type': 'audio/mpeg',
            'Accept-Ranges': 'no',
            'Cache-Control': 'private, no-cache',
            ...corsHeaders
          }
        });
      }

      // 3) Nothing found
      return Response.json({ error: 'Audio not found' }, { status: 404, headers: corsHeaders });
    }

    // ── PUT — direct upload to R2 (for small files, kept for backwards compat) ──
    if (method === 'PUT') {
      if (!env.AUDIO) return Response.json({ error: 'R2 not configured' }, { status: 500, headers: corsHeaders });

      const contentType = request.headers.get('Content-Type') || 'audio/mpeg';
      const contentLength = Number(request.headers.get('Content-Length') || 0);

      await env.AUDIO.put(r2Key, request.body, { httpMetadata: { contentType } });
      console.log('[audio] ✅ R2 PUT OK:', r2Key, '| size:', contentLength);
      return Response.json({ success: true, key: r2Key, size: contentLength }, { headers: corsHeaders });
    }

    // ── DELETE ──
    if (method === 'DELETE') {
      if (!env.AUDIO) return Response.json({ error: 'R2 not configured' }, { status: 500, headers: corsHeaders });
      await env.AUDIO.delete(r2Key);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error('[audio] Error:', error);
    return Response.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
