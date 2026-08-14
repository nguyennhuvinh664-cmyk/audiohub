// functions/api/stories/[[catchall]].js
// Stories API - CRUD operations

import { getStoryById, getPublicStories, getStoriesByUser, upsertStory, deleteStory, trackListen } from '../../lib/db.js';
import { uploadAudio as r2UploadAudio } from '../../lib/r2.js';

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const method = request.method;

  // Extract user_id from JWT payload (base64 decode, no verification needed for scoping)
  function extractUserIdFromToken() {
    try {
      const authHeader = request.headers.get('Authorization') || '';
      const token = authHeader.replace(/^Bearer\s+/i, '');
      if (!token || token.startsWith('guest-') || token === 'demo-local-token') return null;
      const parts = token.split('.');
      if (parts.length !== 3) return null;
      const payload = JSON.parse(atob(parts[1]));
      return payload.sub || payload.userId || payload.id || payload.user_id || null;
    } catch (e) { return null; }
  }

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

    // POST /api/stories/fix-user-id - Maintenance: find story by title and update user_id
    if (method === 'POST' && storyId === 'fix-user-id') {
      const body = await request.json();
      const title = (body.title || '').trim();
      const newUserId = (body.user_id || '').trim();
      if (!title) return Response.json({ error: 'title is required' }, { status: 400, headers: corsHeaders });
      // Find story by title (any user)
      const found = await env.DB.prepare('SELECT id, title, user_id FROM stories WHERE title = ?').bind(title).first();
      if (!found) return Response.json({ error: 'Story not found: ' + title }, { status: 404, headers: corsHeaders });
      // Update user_id
      await env.DB.prepare('UPDATE stories SET user_id = ?, updated_at = ? WHERE id = ?').bind(newUserId || null, new Date().toISOString(), found.id).run();
      return Response.json({ success: true, id: found.id, old_user_id: found.user_id, new_user_id: newUserId }, { headers: corsHeaders });
    }

    // POST /api/stories/fix-all-null-user - Fix ALL stories with NULL/empty user_id for current user
    if (method === 'POST' && storyId === 'fix-all-null-user') {
      const tokenUserId = extractUserIdFromToken();
      if (!tokenUserId) return Response.json({ error: 'Auth required' }, { status: 401, headers: corsHeaders });
      const result = await env.DB.prepare('UPDATE stories SET user_id = ?, updated_at = ? WHERE (user_id IS NULL OR user_id = ?)').bind(tokenUserId, new Date().toISOString(), '').run();
      return Response.json({ success: true, updated: result.meta?.changes || 0, user_id: tokenUserId }, { headers: corsHeaders });
    }

    // POST /api/stories/cleanup - Delete orphaned stories (Truyện mới, etc.)
    if (method === 'POST' && storyId === 'cleanup') {
      const body = await request.json().catch(() => ({}));
      const titles = body.titles || [];
      if (!titles.length) return Response.json({ error: 'titles array required' }, { status: 400, headers: corsHeaders });
      let deleted = 0;
      for (const t of titles) {
        const result = await env.DB.prepare('DELETE FROM stories WHERE title = ?').bind(t).run();
        deleted += result.meta?.changes || 0;
      }
      return Response.json({ success: true, deleted }, { headers: corsHeaders });
    }

    // POST /api/stories/dedup - Remove duplicate stories (keep newest per title)
    if (method === 'POST' && storyId === 'dedup') {
      // Find all titles with more than 1 story
      const dupes = await env.DB.prepare(
        'SELECT title, COUNT(*) as cnt FROM stories GROUP BY title HAVING cnt > 1'
      ).all();
      let deleted = 0;
      for (const row of (dupes.results || [])) {
        // Keep the newest story with real CUID (not s_ prefix), delete the rest
        const all = await env.DB.prepare(
          'SELECT id, title, created_at FROM stories WHERE title = ? ORDER BY created_at DESC'
        ).bind(row.title).all();
        const stories = all.results || [];
        // Prefer the one with real CUID (no s_ prefix)
        let keepId = null;
        for (const s of stories) {
          if (s.id && !String(s.id).startsWith('s_')) { keepId = s.id; break; }
        }
        // If no real CUID, keep the newest
        if (!keepId && stories.length) keepId = stories[0].id;
        // Delete all except the kept one
        for (const s of stories) {
          if (s.id !== keepId) {
            await env.DB.prepare('DELETE FROM stories WHERE id = ?').bind(s.id).run();
            deleted++;
          }
        }
      }
      return Response.json({ success: true, deleted, duplicates_found: dupes.results?.length || 0 }, { headers: corsHeaders });
    }

    // GET /api/stories/listen-history - Listen history (stub: returns empty for now)
    if (method === 'GET' && storyId === 'listen-history') {
      return Response.json([], { headers: corsHeaders });
    }

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

    // POST /api/stories - Create story (ALWAYS create new — never dedup by title)
    if (method === 'POST' && !storyId) {
      const story = await request.json();

      // Auto-set user_id from token if not provided
      if (!story.user_id) {
        const tokenUserId = extractUserIdFromToken();
        if (tokenUserId) story.user_id = tokenUserId;
      }

      // Dedup: ONLY match if client sends a REAL CUID (not s_ prefix, not empty)
      // This handles POST being called twice for the same story (retry).
      // NEVER dedup by title — different stories can have similar titles,
      // and title-based dedup causes stories to overwrite each other.
      const clientId = (story.id || '').trim();
      const isRealCuid = clientId && !String(clientId).startsWith('s_') && clientId.length > 5;
      if (isRealCuid) {
        const existing = await env.DB.prepare('SELECT id FROM stories WHERE id = ?').bind(clientId).first();
        if (existing && existing.id) {
          // Same CUID — this is a retry/update of the same story
          story.updated_at = new Date().toISOString();
          await upsertStory(env.DB, story);
          const saved = await getStoryById(env.DB, story.id);
          return Response.json(saved || { success: true, id: story.id }, { headers: corsHeaders });
        }
      }

      // ALWAYS generate fresh CUID — each story gets a unique ID
      story.id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

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

    // POST /api/stories/:id/sync-chapters - Sync chapter audioKeys from client to D1
    if (method === 'POST' && storyId && action === 'sync-chapters') {
      const body = await request.json().catch(() => ({}));
      const chapters = body.chapters;
      if (!Array.isArray(chapters) || !chapters.length) {
        return Response.json({ error: 'chapters array required' }, { status: 400, headers: corsHeaders });
      }
      // Read existing story to merge chapters
      const existing = await getStoryById(env.DB, storyId);
      if (!existing) {
        return Response.json({ error: 'Story not found' }, { status: 404, headers: corsHeaders });
      }
      // Merge: keep existing chapter fields, add/overwrite audioKey from request
      let existingChapters = [];
      if (existing.chapters) {
        try { existingChapters = typeof existing.chapters === 'string' ? JSON.parse(existing.chapters) : existing.chapters; } catch (e) { existingChapters = []; }
      }
      const merged = chapters.map((ch, i) => {
        const old = existingChapters[i] || {};
        return {
          id: ch.id || old.id || '',
          title: ch.title || old.title || '',
          audioKey: ch.audioKey || old.audioKey || '',
          coverKey: ch.coverKey || old.coverKey || '',
          readingText: ch.readingText || old.readingText || ''
        };
      });
      // Save to D1 — use direct SQL UPDATE to bypass COALESCE (force overwrite chapters)
      await env.DB.prepare('UPDATE stories SET chapters = ?, updated_at = ? WHERE id = ?')
        .bind(JSON.stringify(merged), new Date().toISOString(), storyId)
        .run();
      return Response.json({ success: true, chapters: merged.length }, { headers: corsHeaders });
    }

    // POST /api/stories/:id/listen - Track listen
    if (method === 'POST' && storyId && action === 'listen') {
      const body = await request.json().catch(() => ({}));
      const userId = body.user_id || null;

      await trackListen(env.DB, storyId, userId);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // POST /api/stories/:id/cover - Upload cover image for story
    if (method === 'POST' && storyId && action === 'cover') {
      const contentType = request.headers.get('content-type') || '';
      if (!contentType.includes('multipart/form-data')) {
        return Response.json({ error: 'Expected multipart/form-data' }, { status: 400, headers: corsHeaders });
      }

      const formData = await request.formData();
      const file = formData.get('cover');
      if (!file || file.size === 0) {
        return Response.json({ error: 'No cover file provided' }, { status: 400, headers: corsHeaders });
      }

      // Upload to R2 COVERS bucket
      if (env.COVERS) {
        try {
          const key = `${storyId}/cover`;
          const ct = file.type || 'image/jpeg';
          await env.COVERS.put(key, file.stream(), { httpMetadata: { contentType: ct } });
          return Response.json({ success: true, coverKey: key }, { headers: corsHeaders });
        } catch (e) {
          console.error('[stories] R2 cover upload failed:', e);
        }
      }

      return Response.json({ success: true, coverKey: storyId + '/cover' }, { headers: corsHeaders });
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

      // Use chapter-specific audioKey if provided, otherwise fallback to storyId
      const audioKey = formData.get('audioKey') || storyId;

      // Upload to R2 if available
      if (env.AUDIO) {
        try {
          await r2UploadAudio(env, audioKey, file);
          // Update audio_key in D1 with chapter-specific key
          return Response.json({ success: true, audioKey: audioKey + '.mp3' }, { headers: corsHeaders });
        } catch (e) {
          console.error('[stories] R2 audio upload failed:', e);
        }
      }

      return Response.json({ success: true, audioKey: audioKey }, { headers: corsHeaders });
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
