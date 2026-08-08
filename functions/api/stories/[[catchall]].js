// functions/api/stories/[[catchall]].js
// Stories API - CRUD operations

import { getStoryById, getPublicStories, getStoriesByUser, upsertStory, deleteStory, trackListen } from '../../lib/db.js';
import { uploadAudio as r2UploadAudio } from '../../lib/r2.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const method = request.method;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
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

      // Dedup: check if story with same title already exists → update instead of create
      const title = (story.title || '').trim();
      if (title) {
        const existing = await env.DB.prepare('SELECT id FROM stories WHERE title = ?').bind(title).first();
        if (existing && existing.id) {
          // Story with same title exists — update it
          story.id = existing.id;
          story.updated_at = new Date().toISOString();
          await upsertStory(env.DB, story);
          const saved = await getStoryById(env.DB, story.id);
          return Response.json(saved || { success: true, id: story.id }, { headers: corsHeaders });
        }
      }

      // Generate CUID if client sends null OR s_ prefix (local temp ID)
      if (!story.id || String(story.id).startsWith('s_')) {
        story.id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      }

      // Set timestamps
      if (!story.created_at) {
        story.created_at = new Date().toISOString();
      }
      story.updated_at = new Date().toISOString();

      await upsertStory(env.DB, story);

      // Return full story so client can update localStorage with correct data
      const saved = await getStoryById(env.DB, story.id);
      return Response.json(saved || { success: true, id: story.id }, { headers: corsHeaders });
    }

    // PUT or PATCH /api/stories/:id - Update story
    if ((method === 'PUT' || method === 'PATCH') && storyId) {
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

    // POST /api/stories/:id/audio - Upload audio file for story
    if (method === 'POST' && storyId && action === 'audio') {
      const contentType = request.headers.get('content-type') || '';
      if (!contentType.includes('multipart/form-data')) {
        return Response.json({ error: 'Expected multipart/form-data' }, { status: 400, headers: corsHeaders });
      }

      const formData = await request.formData();
      const file = formData.get('audio');
      if (!file || file.size === 0) {
        return Response.json({ error: 'No audio file provided' }, { status: 400, headers: corsHeaders });
      }

      // Upload to R2 if available
      if (env.AUDIO) {
        try {
          await r2UploadAudio(env, storyId, file);
          // Update audio_key in D1
          await upsertStory(env.DB, { id: storyId, audio_key: storyId + '.mp3', updated_at: new Date().toISOString() });
          return Response.json({ success: true, audioKey: storyId + '.mp3' }, { headers: corsHeaders });
        } catch (e) {
          console.error('[stories] R2 audio upload failed:', e);
        }
      }

      // R2 not available — just update the audio_key reference in D1
      await upsertStory(env.DB, { id: storyId, audio_key: storyId, updated_at: new Date().toISOString() });
      return Response.json({ success: true, audioKey: storyId }, { headers: corsHeaders });
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
