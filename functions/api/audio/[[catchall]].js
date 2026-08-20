// functions/api/audio/[[catchall]].js
// Audio API - R2 primary, Supabase Storage fallback (streaming, no buffering)

import { uploadAudio, deleteAudio } from '../../lib/r2.js';

const SUPABASE_URL = 'https://oatwyxkzonhjfdzapjyb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BP2pN_2F9YOgC2K3yZPjIA_nDYxmGie';
const AUDIO_BUCKET = 'story-audio';

export async function onRequest(context) {
  const { request, env, params } = context;
  const method = request.method;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const pathParts = params.catchall || [];
    const storyId = pathParts[0];

    if (!storyId) {
      return Response.json({ error: 'Story ID is required' }, { status: 400, headers: corsHeaders });
    }

    // Support ?key=xxx for chapter-level audio (custom R2 key instead of {storyId}.mp3)
    const url = new URL(request.url);
    const customKey = url.searchParams.get('key');
    const r2Key = customKey || `${storyId}.mp3`;

    // ── PUT /api/audio/:storyId/presign — get presigned URL for direct R2 upload ──
    // This lets the browser upload directly to R2, bypassing the Worker's30s timeout
    if (method === 'POST' && pathParts[1] === 'presign') {
      if (!env.AUDIO) {
        return Response.json({ error: 'R2 AUDIO binding not configured' }, { status: 500, headers: corsHeaders });
      }
      const keyToSign = customKey || `${storyId}.mp3`;
      const expiresIn = url.searchParams.get('expires') || '3600';
      try {
        const presignedUrl = env.AUDIO.createPresignedUrl({
          key: keyToSign,
          method: 'PUT',
          expiresIn: Number(expiresIn)
        });
        console.log('[audio] ✅ Presigned URL created for:', keyToSign);
        return Response.json({ success: true, url: presignedUrl.toString(), key: keyToSign }, { headers: corsHeaders });
      } catch (e) {
        console.error('[audio] Presign error:', e.message);
        return Response.json({ error: 'Failed to create presigned URL: ' + e.message }, { status: 500, headers: corsHeaders });
      }
    }

    // ── HEAD /api/audio/:storyId — check if audio exists (no body) ──
    if (method === 'HEAD') {
      // r2Key already defined above from ?key= param or {storyId}.mp3 default
      if (env.AUDIO) {
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
      }
      return new Response(null, { status: 404, headers: corsHeaders });
    }

    // ── GET /api/audio/:storyId — R2 first, Supabase fallback ──
    if (method === 'GET') {
      // r2Key already defined above from ?key= param or {storyId}.mp3 default
      const rangeHeader = request.headers.get('Range') || '';

      // 1) Try R2 (same-domain, fast, never sleeps)
      if (env.AUDIO) {
        try {
          // First get the file metadata (size) via HEAD for Range support
          const headObj = await env.AUDIO.head(r2Key);
          if (!headObj) { /* fall through to Supabase */ }
          else {
            const contentType = headObj.httpMetadata?.contentType || 'audio/mpeg';
            const size = headObj.size || 0;

            const headers = {
              'Content-Type': contentType,
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'private, max-age=3600',
              ...corsHeaders
            };

            // Parse Range header for partial content (206)
            // Browsers ALWAYS send Range for <audio> — without 206 support
            // the audio element fails with MEDIA_ERR_SRC_NOT_SUPPORTED.
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
                // Range out of bounds → 416 Range Not Satisfiable
                headers['Content-Range'] = `bytes */${size}`;
                return new Response(null, { status: 416, headers });
              }
            }

            // No Range header → full file (200)
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

      // 2) R2 miss → try Supabase Storage (public, streaming)
      // Try customKey first (per-chapter audio), then storyId.mp3 fallback
      const supaKeys = [r2Key, `${storyId}.mp3`];
      const triedSupa = new Set();
      for (const supaKey of supaKeys) {
        if (triedSupa.has(supaKey)) continue;
        triedSupa.add(supaKey);
        try {
          const supaUrl = `${SUPABASE_URL}/storage/v1/object/public/${AUDIO_BUCKET}/${encodeURIComponent(supaKey)}`;
          console.log('[audio] R2 miss, trying Supabase:', supaKey);
          const supaRes = await fetch(supaUrl, {
            headers: {
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`
            }
          });

          if (supaRes.ok && supaRes.body) {
            // Tee the stream: one branch → client, one branch → R2 cache (background)
            const [clientStream, r2Stream] = supaRes.body.tee();

            // Background: cache to R2 (don't block response)
            if (env.AUDIO) {
              try {
                await env.AUDIO.put(r2Key, r2Stream, {
                  httpMetadata: { contentType: supaRes.headers.get('Content-Type') || 'audio/mpeg' }
                });
                console.log('[audio] ✅ Cached Supabase → R2:', supaKey);
              } catch (e) {
                console.error('[audio] R2 cache write error:', e.message);
              }
            }

            // Return Supabase stream to client immediately
            return new Response(clientStream, {
              status: 200,
              headers: {
                'Content-Type': supaRes.headers.get('Content-Type') || 'audio/mpeg',
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'private, no-cache',
                ...corsHeaders
              }
            });
          }
          console.log('[audio] Supabase miss:', supaKey, supaRes.status);
        } catch (e) {
          console.error('[audio] Supabase fallback error:', e.message);
        }
      }

      // 3) Both R2 and Supabase miss
      return Response.json({ error: 'Audio not found' }, { status: 404, headers: corsHeaders });
    }

    // ── PUT /api/audio/:storyId — stream to R2 ──
    if (method === 'PUT') {
      if (!env.AUDIO) {
        return Response.json({ error: 'R2 AUDIO binding not configured' }, { status: 500, headers: corsHeaders });
      }

      // r2Key already defined above from ?key= param or {storyId}.mp3 default
      const contentType = request.headers.get('Content-Type') || 'audio/mpeg';
      const contentLength = Number(request.headers.get('Content-Length') || 0);

      // Stream the request body straight into R2 — do NOT buffer large files
      // (e.g. 91MB audio) into memory; that either exceeds the Worker's CPU/memory
      // limit and silently drops the PUT, or the buffered Blob becomes corrupt so the
      // final object is empty/missing. Streaming avoids both.
      await env.AUDIO.put(r2Key, request.body, {
        httpMetadata: { contentType }
      });

      console.log('[audio] ✅ R2 PUT OK:', r2Key, '| declared size:', contentLength);
      return Response.json({ success: true, key: r2Key, size: contentLength }, { headers: corsHeaders });
    }

    // ── DELETE /api/audio/:storyId ──
    if (method === 'DELETE') {
      if (!env.AUDIO) {
        return Response.json({ error: 'R2 AUDIO binding not configured' }, { status: 500, headers: corsHeaders });
      }
      // r2Key already defined above from ?key= param or {storyId}.mp3 default
      await env.AUDIO.delete(r2Key);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // Unknown method
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error('[audio] Error:', error);
    return Response.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
