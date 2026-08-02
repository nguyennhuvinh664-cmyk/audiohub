// functions/api/audio/[[catchall]].js
// Audio API - Audio file storage via R2

import { getAudio, uploadAudio, deleteAudio } from '../../lib/r2.js';

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

    // GET /api/audio/:storyId - Get audio file
    if (method === 'GET') {
      const response = await getAudio(env, storyId);

      if (!response) {
        return Response.json({ error: 'Audio not found' }, { status: 404, headers: corsHeaders });
      }

      // Add CORS headers to response
      const newResponse = new Response(response.body, response);
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
      return newResponse;
    }

    // PUT /api/audio/:storyId - Upload audio file
    if (method === 'PUT') {
      const file = await request.blob();

      if (!file || file.size === 0) {
        return Response.json({ error: 'No file provided' }, { status: 400, headers: corsHeaders });
      }

      await uploadAudio(env, storyId, file);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // DELETE /api/audio/:storyId - Delete audio file
    if (method === 'DELETE') {
      await deleteAudio(env, storyId);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // Unknown method
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });

  } catch (error) {
    console.error('Audio API error:', error);
    return Response.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
