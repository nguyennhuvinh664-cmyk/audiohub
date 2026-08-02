// functions/api/covers/[[catchall]].js
// Covers API - Image storage via R2

import { getCover, uploadCover, deleteCover } from '../../lib/r2.js';

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

    // GET /api/covers/:storyId - Get cover image
    if (method === 'GET') {
      const response = await getCover(env, storyId);

      if (!response) {
        return Response.json({ error: 'Cover not found' }, { status: 404, headers: corsHeaders });
      }

      // Add CORS headers to response
      const newResponse = new Response(response.body, response);
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
      return newResponse;
    }

    // PUT /api/covers/:storyId - Upload cover image
    if (method === 'PUT') {
      const contentType = request.headers.get('Content-Type');

      // Handle JSON body with base64 data
      if (contentType?.includes('application/json')) {
        const body = await request.json();
        const { data } = body; // data is base64 string

        if (!data) {
          return Response.json({ error: 'No image data provided' }, { status: 400, headers: corsHeaders });
        }

        // Convert base64 to blob
        const base64Data = data.split(',')[1] || data;
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'image/jpeg' });

        await uploadCover(env, storyId, blob);
        return Response.json({ success: true }, { headers: corsHeaders });
      }

      // Handle raw file upload
      const file = await request.blob();
      if (!file || file.size === 0) {
        return Response.json({ error: 'No file provided' }, { status: 400, headers: corsHeaders });
      }

      await uploadCover(env, storyId, file);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // DELETE /api/covers/:storyId - Delete cover image
    if (method === 'DELETE') {
      await deleteCover(env, storyId);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // Unknown method
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error('Covers API error:', error);
    return Response.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
