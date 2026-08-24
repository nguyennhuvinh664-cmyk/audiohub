// Cloudflare Pages Function: catch-all proxy for /api/*
// - R2 audio/cover: handled directly (streaming, no buffering)
// - Everything else: forwarded to Render backend

const BACKEND = 'https://audiohub-276v.onrender.com';
const SUPABASE_URL = 'https://oatwyxkzonhjfdzapjyb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_BP2pN_2F9YOgC2K3yZPjIA_nDYxmGie';
const AUDIO_BUCKET = 'story-audio';

// ═══ AUTH HELPERS ════════════════════════════════════════════════════════
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const decoded = atob(payload);
    return JSON.parse(decoded);
  } catch (e) { return null; }
}

function getUserIdFromRequest(request) {
  try {
    const auth = request.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7);
    const payload = decodeJwtPayload(token);
    return payload && payload.sub ? payload.sub : null;
  } catch (e) { return null; }
}

export async function onRequest(context) {
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

  // ══════════════════════════════════════════════════════════════════════
  // R2 AUDIO (GET/PUT/DELETE /api/audio/:key)
  // GET: R2 → Supabase Storage fallback (streaming)
  // PUT: stream directly to R2 (no Worker memory buffering)
  // ══════════════════════════════════════════════════════════════════════
  if (/^\/api\/audio\/.+/.test(pathname) && (method === 'GET' || method === 'HEAD' || method === 'PUT' || method === 'DELETE')) {
    const env = context.env;
    if (!env || !env.AUDIO) {
      // R2 not available — try forwarding to Render as last resort
      // (but Render may not have the audio either)
    } else {
      const audioKey = decodeURIComponent(pathname.replace(/^\/api\/audio\//, ''));
      const r2Key = audioKey + '.mp3';

      try {
        // ── HEAD: check if audio exists ──
        if (method === 'HEAD') {
          const head = await env.AUDIO.head(r2Key);
          if (head) {
            return new Response(null, {
              status: 200,
              headers: {
                'Content-Type': head.httpMetadata?.contentType || 'audio/mpeg',
                'Content-Length': String(head.size || 0),
                'Accept-Ranges': 'bytes',
                'Access-Control-Allow-Origin': '*'
              }
            });
          }
          return new Response(null, { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } });
        }
        // ── GET: R2 → Supabase fallback ──
        if (method === 'GET') {
          // ── ACCESS CHECK: verify chapter unlock status ──
          try {
            const userId = getUserIdFromRequest(context.request);
            const storyId = audioKey; // audioKey in path is the storyId

            if (env.DB && storyId) {
              const story = await env.DB.prepare('SELECT chapters FROM stories WHERE id = ?').bind(storyId).first();
              if (story && story.chapters) {
                let chapters = [];
                try { chapters = JSON.parse(story.chapters); } catch (e) {}
                // Find which chapter index has this audioKey
                const customKey = url.searchParams.get('key');
                const targetKey = customKey || storyId;
                let lockedChapterIdx = -1;
                for (let ci = 0; ci < chapters.length; ci++) {
                  const ch = chapters[ci];
                  if (ch && ch.audioKey && ch.audioKey === targetKey) {
                    if (String(ch.visibility || '').trim() === 'Không công khai') {
                      lockedChapterIdx = ci;
                    }
                    break;
                  }
                }
                // If chapter is locked, verify user has unlocked it
                if (lockedChapterIdx >= 0) {
                  if (!userId) {
                    return new Response(JSON.stringify({ error: 'Chương này cần đăng nhập để nghe' }), {
                      status: 403,
                      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
                    });
                  }
                  // Check unlock status via backend API
                  const checkUrl = `${BACKEND}/api/v1/chapters/check?storyId=${encodeURIComponent(storyId)}&chapterIdx=${lockedChapterIdx}`;
                  const checkRes = await fetch(checkUrl, {
                    headers: { 'Authorization': `Bearer ${context.request.headers.get('Authorization')?.slice(7) || ''}` }
                  });
                  if (checkRes.ok) {
                    const checkData = await checkRes.json();
                    if (!checkData.unlocked) {
                      return new Response(JSON.stringify({ error: 'Chương này chưa được mở khóa' }), {
                        status: 403,
                        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
                      });
                    }
                  } else {
                    return new Response(JSON.stringify({ error: 'Không thể kiểm tra quyền truy cập' }), {
                      status: 403,
                      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
                    });
                  }
                }
              }
            }
          } catch (e) {
            console.error('[audio] Access check error:', e.message);
            // On error, allow access (fail-open for availability)
          }

          // 1) Try R2
          const object = await env.AUDIO.get(r2Key);
          if (object) {
            const contentType = object.httpMetadata?.contentType || 'audio/mpeg';
            const body = await object.arrayBuffer();
            return new Response(body, {
              status: 200,
              headers: {
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'private, no-cache, no-store',
                'Access-Control-Allow-Origin': '*'
              }
            });
          }

          // 2) R2 miss → Supabase Storage (streaming)
          try {
            const supaPath = `${audioKey}.mp3`;
            const supaUrl = `${SUPABASE_URL}/storage/v1/object/public/${AUDIO_BUCKET}/${encodeURIComponent(supaPath)}`;
            console.log('[proxy] R2 miss, trying Supabase:', audioKey);
            const supaRes = await fetch(supaUrl, {
              headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`
              }
            });

            if (supaRes.ok && supaRes.body) {
              const [clientStream, r2Stream] = supaRes.body.tee();

              // Background: cache to R2
              env.AUDIO.put(r2Key, r2Stream, {
                httpMetadata: { contentType: supaRes.headers.get('Content-Type') || 'audio/mpeg' }
              }).then(() => {
                console.log('[proxy] ✅ Cached Supabase → R2:', audioKey);
              }).catch(() => {});

              return new Response(clientStream, {
                status: 200,
                headers: {
                  'Content-Type': supaRes.headers.get('Content-Type') || 'audio/mpeg',
                  'Accept-Ranges': 'bytes',
                  'Cache-Control': 'private, no-cache',
                  'Access-Control-Allow-Origin': '*'
                }
              });
            }
          } catch (e) {
            console.error('[proxy] Supabase fallback error:', e.message);
          }

          // 3) Both miss
          return new Response(JSON.stringify({ error: 'Audio not found' }), {
            status: 404,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*'
            }
          });
        }

        // ── PUT: stream directly to R2 (no buffering) ──
        if (method === 'PUT') {
          await env.AUDIO.put(r2Key, context.request.body, {
            httpMetadata: { contentType: context.request.headers.get('Content-Type') || 'audio/mpeg' }
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

        // ── DELETE ──
        if (method === 'DELETE') {
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

  // ══════════════════════════════════════════════════════════════════════
  // R2 COVER (GET/PUT/POST/DELETE /api/stories/:id/cover)
  // ══════════════════════════════════════════════════════════════════════
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
          const r2Key = storyId + '/cover';
          await env.COVERS.put(r2Key, context.request.body, {
            httpMetadata: { contentType: context.request.headers.get('Content-Type') || 'image/jpeg' }
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

  // ══════════════════════════════════════════════════════════════════════
  // FORWARD ALL OTHER REQUESTS TO RENDER BACKEND
  // ══════════════════════════════════════════════════════════════════════
  var backendPath = pathname.replace(/^\/api\/v1/, '').replace(/^\/api/, '') || '/';
  const targetUrl = BACKEND + '/api/v1' + backendPath + url.search;

  const headers = new Headers(context.request.headers);
  headers.set('Origin', new URL(BACKEND).origin);

  // Stream request body to backend (don't buffer)
  const response = await fetch(targetUrl, {
    method: method,
    headers: headers,
    body: method !== 'GET' && method !== 'HEAD'
      ? context.request.body
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
