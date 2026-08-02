// functions/api/playlists/[[catchall]].js
// Playlists API - CRUD operations

import { getPlaylists, upsertPlaylist, deletePlaylist } from '../../lib/db.js';

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
    const playlistId = pathParts[0];

    // GET /api/playlists - List all playlists
    if (method === 'GET' && !playlistId) {
      const playlists = await getPlaylists(env.DB);
      return Response.json(playlists, { headers: corsHeaders });
    }

    // GET /api/playlists/:id - Get single playlist (future use)
    if (method === 'GET' && playlistId) {
      const playlists = await getPlaylists(env.DB);
      const playlist = playlists.find(p => p.id === playlistId);

      if (!playlist) {
        return Response.json({ error: 'Playlist not found' }, { status: 404, headers: corsHeaders });
      }

      return Response.json(playlist, { headers: corsHeaders });
    }

    // POST /api/playlists - Create/Update playlist
    if (method === 'POST' && !playlistId) {
      const playlist = await request.json();

      // Validate required fields
      if (!playlist.id) {
        return Response.json({ error: 'Playlist ID is required' }, { status: 400, headers: corsHeaders });
      }

      // Set timestamps
      if (!playlist.created_at) {
        playlist.created_at = new Date().toISOString();
      }
      playlist.updated_at = new Date().toISOString();

      await upsertPlaylist(env.DB, playlist);
      return Response.json({ success: true, id: playlist.id }, { headers: corsHeaders });
    }

    // PUT /api/playlists/:id - Update playlist
    if (method === 'PUT' && playlistId) {
      const updates = await request.json();
      updates.id = playlistId;
      updates.updated_at = new Date().toISOString();

      await upsertPlaylist(env.DB, updates);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // DELETE /api/playlists/:id - Delete playlist
    if (method === 'DELETE' && playlistId) {
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
