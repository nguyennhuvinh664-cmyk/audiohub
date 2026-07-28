// Cloudflare Pages Function: proxy /api/* to Render backend (avoids CORS)
export async function onRequest(context) {
  const BACKEND = 'https://audiohub-276v.onrender.com';
  const url = new URL(context.request.url);
  // Strip /api/v1 prefix — backend routes don't have it
  var backendPath = url.pathname.replace(/^\/api\/v1/, '') || '/';
  const targetUrl = BACKEND + backendPath + url.search;

  // Handle CORS preflight
  if (context.request.method === 'OPTIONS') {
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

  // Forward request to backend
  const headers = new Headers(context.request.headers);
  headers.set('Origin', new URL(BACKEND).origin);

  const response = await fetch(targetUrl, {
    method: context.request.method,
    headers: headers,
    body: context.request.method !== 'GET' && context.request.method !== 'HEAD'
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
