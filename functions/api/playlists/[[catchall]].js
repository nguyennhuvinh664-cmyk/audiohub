// functions/api/playlists/[[catchall]].js
// Playlists API — CRUD operations, scoped to authenticated user via user_id

import { getPlaylistsByUser, upsertPlaylist, deletePlaylist } from '../../lib/db.js';

// ── Auth helpers ──────────────────────────────────────────────────────────
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload));
  } catch (e) { return null; }
}

function getUserIdFromRequest(request) {
  try {
    const auth = request.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return null;
    const token = auth.slice(7);
    const payload = decodeJwtPayload(token);
    return payload && payload.sub ? String(payload.sub).trim().toLowerCase() : null;
  } catch (e) { return null; }
}

// Auto-migrate: add user_id column to playlists table if missing
let _migrationDone = false;
async function ensureUserIdColumn(db) {
  if (_migrationDone) return;
  try {
    await db.prepare("ALTER TABLE playlists ADD COLUMN user_id TEXT DEFAULT ''").run();
  } catch (e) {
    // Column already exists — ignore
  }
  _migrationDone = true;
}

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
    // Ensure D1 schema has user_id column
    await ensureUserIdColumn(env.DB);

    const userId = getUserIdFromRequest(request);
    const pathParts = params.catchall || [];
    const playlistId = pathParts[0];

    // GET /api/playlists — List playlists for current user ONLY
    if (method === 'GET' && !playlistId) {
      if (!userId) {
        return Response.json([], { headers: corsHeaders });
      }
      const playlists = await getPlaylistsByUser(env.DB, userId);
      return Response.json(playlists, { headers: corsHeaders });
    }

    // GET /api/playlists/:id — Get single playlist (owned by current user)
    if (method === 'GET' && playlistId) {
      if (!userId) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
      }
      const playlists = await getPlaylistsByUser(env.DB, userId);
      const playlist = playlists.find(p => p.id === playlistId);
      if (!playlist) {
        return Response.json({ error: 'Playlist not found' }, { status: 404, headers: corsHeaders });
      }
      return Response.json(playlist, { headers: corsHeaders });
    }

    // POST /api/playlists — Create/Update playlist (owned by current user)
    if (method === 'POST' && !playlistId) {
      if (!userId) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
      }
      const playlist = await request.json();

      if (!playlist.id) {
        return Response.json({ error: 'Playlist ID is required' }, { status: 400, headers: corsHeaders });
      }

      if (!playlist.created_at) {
        playlist.created_at = new Date().toISOString();
      }
      playlist.updated_at = new Date().toISOString();
      playlist.user_id = userId; // Force user_id from JWT — cannot be spoofed

      await upsertPlaylist(env.DB, playlist);
      return Response.json({ success: true, id: playlist.id }, { headers: corsHeaders });
    }

    // PUT /api/playlists/:id — Update playlist (must own it)
    if (method === 'PUT' && playlistId) {
      if (!userId) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
      }
      // Verify ownership
      const existing = await env.DB.prepare('SELECT user_id FROM playlists WHERE id = ?').bind(playlistId).first();
      if (existing && existing.user_id && existing.user_id !== userId) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
      }
      const updates = await request.json();
      updates.id = playlistId;
      updates.updated_at = new Date().toISOString();
      updates.user_id = userId;
      await upsertPlaylist(env.DB, updates);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // DELETE /api/playlists/:id — Delete playlist (must own it)
    if (method === 'DELETE' && playlistId) {
      if (!userId) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
      }
      // Verify ownership
      const existing = await env.DB.prepare('SELECT user_id FROM playlists WHERE id = ?').bind(playlistId).first();
      if (existing && existing.user_id && existing.user_id !== userId) {
        return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
      }
      await deletePlaylist(env.DB, playlistId);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // Unknown endpoint
    return Response.json({ error: 'Not found' }, { status: 404, headers: corsHeaders });

  } catch (error) {
    console.error('Playlists API error:', error);
    return Response.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: corsHeaders }
    );
  }
}
