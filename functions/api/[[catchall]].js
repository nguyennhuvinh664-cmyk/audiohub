// Cloudflare Pages Function: proxy /api/* to Render backend (avoids CORS)
// Also handles R2 audio/cover uploads directly (bypass proxy for PUT/DELETE)
export async function onRequest(context) {
  const BACKEND = 'https://audiohub-276v.onrender.com';
  const url = new URL(context.request.url);
  const method = context.request.method;
  const pathname = url.pathname;

  // Handle CORS preflight
  if (method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

  // ── R2 audio (GET/PUT/DELETE /api/audio/:key) — handle directly ──
  if (/^\/api\/audio\/.+/.test(pathname) && (method === 'GET' || method === 'PUT' || method === 'DELETE')) {
    const env = context.env;
    if (env && env.AUDIO) {
      const audioKey = decodeURIComponent(pathname.replace(/^\/api\/audio\//, ''));
      try {
        if (method === 'GET') {
          const r2Key = audioKey + '.mp3';
          const object = await env.AUDIO.get(r2Key);
          if (!object) {
            return new Response(JSON.stringify({ error: 'Audio not found' }), {
              status: 404,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            });
          }
          const contentType = object.httpMetadata?.contentType || 'audio/mpeg';
          const body = await object.arrayBuffer();
          return new Response(body, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Accept-Ranges': 'bytes',
              'Cache-Control': 'public, max-age=31536000',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        if (method === 'PUT') {
          const blob = await context.request.blob();
          const r2Key = audioKey + '.mp3';
          await env.AUDIO.put(r2Key, blob.stream(), {
            httpMetadata: { contentType: blob.type || 'audio/mpeg' }
          });
          console.log('[proxy] ✅ R2 audio PUT OK:', r2Key);
          return new Response(JSON.stringify({ success: true, key: audioKey }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        if (method === 'DELETE') {
          const r2Key = audioKey + '.mp3';
          await env.AUDIO.delete(r2Key);
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
      } catch (err) {
        console.error('[proxy] R2 audio error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }
  }

  // ── R2 cover (GET/PUT/POST/DELETE /api/stories/:id/cover) — handle directly ──
  if (/^\/api\/stories\/[^/]+\/cover$/.test(pathname) && (method === 'GET' || method === 'PUT' || method === 'POST' || method === 'DELETE')) {
    const env = context.env;
    if (env && env.COVERS) {
      const storyId = pathname.replace(/^\/api\/stories\//, '').replace(/\/cover$/, '');
      try {
        if (method === 'GET') {
          const r2Key = storyId + '/cover';
          const object = await env.COVERS.get(r2Key);
          if (!object) {
            return new Response(JSON.stringify({ error: 'Cover not found' }), {
              status: 404,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
              }
            });
          }
          const contentType = object.httpMetadata?.contentType || 'image/jpeg';
          const body = await object.arrayBuffer();
          return new Response(body, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=31536000',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        if (method === 'PUT' || method === 'POST') {
          const blob = await context.request.blob();
          const r2Key = storyId + '/cover';
          await env.COVERS.put(r2Key, blob.stream(), {
            httpMetadata: { contentType: blob.type || 'image/jpeg' }
          });
          console.log('[proxy] ✅ R2 cover PUT OK:', r2Key);
          return new Response(JSON.stringify({ success: true, coverKey: r2Key }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
        if (method === 'DELETE') {
          const r2Key = storyId + '/cover';
          await env.COVERS.delete(r2Key);
          return new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }
      } catch (err) {
        console.error('[proxy] R2 cover error:', err);
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }
  }

  // ── Forward all other requests to Render backend ──
  var backendPath = pathname.replace(/^\/api\/v1/, '').replace(/^\/api/, '') || '/';
  const targetUrl = BACKEND + '/api/v1' + backendPath + url.search;

  const headers = new Headers(context.request.headers);
  headers.set('Origin', new URL(BACKEND).origin);

  const response = await fetch(targetUrl, {
    method: method,
    headers: headers,
    body: method !== 'GET' && method !== 'HEAD'
      ? await context.request.arrayBuffer()
      : undefined,
  });

  // Clone response with CORS headers
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  newResponse.headers.set('Access-Control-Allow-Origin', '*');
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', '*');

  return newResponse;
}
