// functions/api/stories/[[catchall]].js
// Stories API - CRUD operations

import { getStoryById, getPublicStories, getStoriesByUser, upsertStory, deleteStory, trackListen } from '../../lib/db.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
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
    const action = pathParts[1]; // e.g., 'listen'

    // GET /api/stories/public - Public stories (must be before :id catch)
    if (method === 'GET' && storyId === 'public' && !action) {
      const genre = url.searchParams.get('genre');
      const status = url.searchParams.get('status');
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');
      const stories = await getPublicStories(env.DB, { genre, status, limit, offset });
      return Response.json(stories, { headers: corsHeaders });
    }

    // GET /api/stories/public/:id - Single public story by ID
    if (method === 'GET' && storyId === 'public' && action) {
      const story = await getStoryById(env.DB, action);
      if (!story) {
        return Response.json({ error: 'Story not found' }, { status: 404, headers: corsHeaders });
      }
      return Response.json(story, { headers: corsHeaders });
    }

    // GET /api/stories - List stories
    if (method === 'GET' && !storyId) {
      const genre = url.searchParams.get('genre');
      const status = url.searchParams.get('status');
      const userId = url.searchParams.get('user_id');
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      let stories;
      if (userId) {
        stories = await getStoriesByUser(env.DB, userId, { limit, offset });
      } else {
        stories = await getPublicStories(env.DB, { genre, status, limit, offset });
      }

      return Response.json(stories, { headers: corsHeaders });
    }

    // GET /api/stories/:id - Get story by ID
    if (method === 'GET' && storyId) {
      const story = await getStoryById(env.DB, storyId);
      if (!story) {
        return Response.json({ error: 'Story not found' }, { status: 404, headers: corsHeaders });
      }
      return Response.json(story, { headers: corsHeaders });
    }

    // POST /api/stories - Create/Update story
    if (method === 'POST' && !storyId) {
      const story = await request.json();

      // Validate required fields
      if (!story.id) {
        return Response.json({ error: 'Story ID is required' }, { status: 400, headers: corsHeaders });
      }

      // Set timestamps
      if (!story.created_at) {
        story.created_at = new Date().toISOString();
      }
      story.updated_at = new Date().toISOString();

      await upsertStory(env.DB, story);
      return Response.json({ success: true, id: story.id }, { headers: corsHeaders });
    }

    // PUT /api/stories/:id - Update story
    if (method === 'PUT' && storyId) {
      const updates = await request.json();
      updates.id = storyId;
      updates.updated_at = new Date().toISOString();

      await upsertStory(env.DB, updates);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // DELETE /api/stories/:id - Delete story
    if (method === 'DELETE' && storyId) {
      await deleteStory(env.DB, storyId);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // POST /api/stories/:id/listen - Track listen
    if (method === 'POST' && storyId && action === 'listen') {
      const body = await request.json().catch(() => ({}));
      const userId = body.user_id || null;

      await trackListen(env.DB, storyId, userId);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // Unknown endpoint
    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });

  } catch (error) {
    console.error('Stories API error:', error);
    return Response.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
