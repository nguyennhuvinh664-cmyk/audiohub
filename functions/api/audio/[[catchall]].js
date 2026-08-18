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

    // ── HEAD /api/audio/:storyId — check if audio exists (no body) ──
    if (method === 'HEAD') {
      const r2Key = `${storyId}.mp3`;
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
      const r2Key = `${storyId}.mp3`;

      // 1) Try R2 (same-domain, fast, never sleeps)
      if (env.AUDIO) {
        try {
          const object = await env.AUDIO.get(r2Key);
          if (object && object.body) {
            const contentType = object.httpMetadata?.contentType || 'audio/mpeg';
            const size = object.size || 0;
            // Stream the R2 object body directly (don't arrayBuffer the whole file
            // into memory first) — lets the <audio> element start playing
            // progressively instead of waiting for the full download.
            const headers = {
              'Content-Type': contentType,
              'Accept-Ranges': 'bytes',
              // Allow in-session HTTP caching so repeat plays (especially in
              // incognito, where there's no IndexedDB cache) are instant.
              'Cache-Control': 'private, max-age=3600',
              ...corsHeaders
            };
            if (size) headers['Content-Length'] = String(size);
            return new Response(object.body, { headers });
          }
        } catch (e) {
          console.error('[audio] R2 GET error:', e.message);
        }
      }

      // 2) R2 miss → try Supabase Storage (public, streaming)
      try {
        const supaPath = `${storyId}.mp3`;
        const supaUrl = `${SUPABASE_URL}/storage/v1/object/public/${AUDIO_BUCKET}/${encodeURIComponent(supaPath)}`;
        console.log('[audio] R2 miss, trying Supabase:', storyId);
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
              console.log('[audio] ✅ Cached Supabase → R2:', storyId);
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
        console.log('[audio] Supabase also miss:', storyId, supaRes.status);
      } catch (e) {
        console.error('[audio] Supabase fallback error:', e.message);
      }

      // 3) Both R2 and Supabase miss
      return Response.json({ error: 'Audio not found' }, { status: 404, headers: corsHeaders });
    }

    // ── PUT /api/audio/:storyId — stream to R2 ──
    if (method === 'PUT') {
      if (!env.AUDIO) {
        return Response.json({ error: 'R2 AUDIO binding not configured' }, { status: 500, headers: corsHeaders });
      }

      const r2Key = `${storyId}.mp3`;
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
      return Response.json({ success: true, key: storyId, size: contentLength }, { headers: corsHeaders });
    }

    // ── DELETE /api/audio/:storyId ──
    if (method === 'DELETE') {
      if (!env.AUDIO) {
        return Response.json({ error: 'R2 AUDIO binding not configured' }, { status: 500, headers: corsHeaders });
      }
      const r2Key = `${storyId}.mp3`;
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
