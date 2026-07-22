// Cloudflare Pages Function: proxy /media/* to Render backend (avoids CORS)
export async function onRequest(context) {
  const BACKEND = 'https://audiohub-276v.onrender.com';
  const url = new URL(context.request.url);
  const targetUrl = BACKEND + url.pathname + url.search;

  const headers = new Headers(context.request.headers);
  headers.set('Origin', new URL(BACKEND).origin);

  const response = await fetch(targetUrl, {
    method: context.request.method,
    headers: headers,
    body: context.request.method !== 'GET' && context.request.method !== 'HEAD'
      ? await context.request.arrayBuffer()
      : undefined,
  });

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
