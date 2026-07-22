// Cloudflare Pages Function: proxy /supabase/* to Supabase (avoids CORS)
const SUPABASE_URL = 'https://oatwyxkzonhjfdzapjyb.supabase.co';

export async function onRequest(context) {
  const url = new URL(context.request.url);
  // /supabase/rest/v1/... → https://oatwyxkzonhjfdzapjyb.supabase.co/rest/v1/...
  const targetUrl = SUPABASE_URL + url.pathname.replace('/supabase', '') + url.search;

  const headers = new Headers(context.request.headers);
  headers.set('Origin', SUPABASE_URL);

  // Handle CORS preflight
  if (context.request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
        'Access-Control-Allow-Headers': '*',
        'Access-Control-Max-Age': '86400',
      },
    });
  }

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
  newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  newResponse.headers.set('Access-Control-Allow-Headers', '*');

  return newResponse;
}
