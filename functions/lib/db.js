// functions/lib/db.js
// D1 Database helper functions

/**
 * Get story by ID
 */
export async function getStoryById(db, storyId) {
  const result = await db.prepare('SELECT * FROM stories WHERE id = ?').bind(storyId).first();
  return result || null;
}

/**
 * Get public stories with optional filters
 */
export async function getPublicStories(db, options = {}) {
  const { genre, status, limit = 50, offset = 0 } = options;

  let query = 'SELECT * FROM stories WHERE visibility = ?';
  const params = ['Công khai'];

  if (genre) {
    query += ' AND genre = ?';
    params.push(genre);
  }

  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }

  query += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  const result = await db.prepare(query).bind(...params).all();
  return result.results || [];
}

/**
 * Get stories by user ID
 */
export async function getStoriesByUser(db, userId, options = {}) {
  const { limit = 50, offset = 0 } = options;

  const result = await db.prepare(
    'SELECT * FROM stories WHERE user_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?'
  ).bind(userId, limit, offset).all();

  return result.results || [];
}

/**
 * Upsert story (insert or update)
 */
export async function upsertStory(db, story) {
  const id = story.id || null;
  const title = story.title || 'Truyen moi';
  const author = story.author || '';
  const genre = story.genre || '';
  const description = story.description || '';
  const reading_text = story.reading_text || '';
  const chapter_title = story.chapter_title || 'Chuong 1';
  const chapters = story.chapters || '[]';
  const chapter_count = story.chapter_count || 1;
  const visibility = story.visibility || 'Private';
  const audio_status = story.audio_status || '';
  const status = story.status || '';
  const is_completed = story.is_completed || 0;
  const cover_key = story.cover_key || null;
  const cover_data = story.cover_data || null;
  const audio_key = story.audio_key || null;
  const youtube_url = story.youtube_url || null;
  const youtube_id = story.youtube_id || null;
  const listen_count = story.listen_count || 0;
  const listen_count2d = story.listen_count2d || 0;
  const listen_count7d = story.listen_count7d || 0;
  const user_id = story.user_id || null;
  const created_at = story.created_at || new Date().toISOString();
  const updated_at = story.updated_at || new Date().toISOString();

  if (!id) {
    throw new Error('Story ID is required');
  }

  await db.prepare(`
    INSERT INTO stories (
      id, title, author, genre, description, reading_text,
      chapter_title, chapters, chapter_count, visibility,
      audio_status, status, is_completed, cover_key, cover_data, audio_key,
      youtube_url, youtube_id, listen_count, listen_count2d,
      listen_count7d, user_id, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      author = excluded.author,
      genre = excluded.genre,
      description = excluded.description,
      reading_text = excluded.reading_text,
      chapter_title = excluded.chapter_title,
      chapters = excluded.chapters,
      chapter_count = excluded.chapter_count,
      visibility = excluded.visibility,
      audio_status = excluded.audio_status,
      status = excluded.status,
      is_completed = excluded.is_completed,
      cover_key = excluded.cover_key,
      cover_data = CASE WHEN excluded.cover_data IS NOT NULL AND excluded.cover_data != '' THEN excluded.cover_data ELSE stories.cover_data END,
      audio_key = excluded.audio_key,
      youtube_url = excluded.youtube_url,
      youtube_id = excluded.youtube_id,
      listen_count = excluded.listen_count,
      listen_count2d = excluded.listen_count2d,
      listen_count7d = excluded.listen_count7d,
      user_id = excluded.user_id,
      updated_at = excluded.updated_at
  `).bind(
    id, title, author, genre, description, reading_text,
    chapter_title, chapters, chapter_count, visibility,
    audio_status, status, is_completed, cover_key, cover_data, audio_key,
    youtube_url, youtube_id, listen_count, listen_count2d,
    listen_count7d, user_id, created_at, updated_at
  ).run();
}

/**
 * Delete story by ID
 */
export async function deleteStory(db, storyId) {
  await db.prepare('DELETE FROM stories WHERE id = ?').bind(storyId).run();
}

/**
 * Track listen event and increment counters
 */
export async function trackListen(db, storyId, userId) {
  // Insert listen event
  await db.prepare(
    'INSERT INTO story_listen_events (story_id, user_id) VALUES (?, ?)'
  ).bind(storyId, userId || null).run();

  // Increment listen counts
  await db.prepare(`
    UPDATE stories SET
      listen_count = listen_count + 1,
      listen_count2d = listen_count2d + 1,
      listen_count7d = listen_count7d + 1
    WHERE id = ?
  `).bind(storyId).run();
}

/**
 * Get all playlists
 */
export async function getPlaylists(db) {
  const result = await db.prepare('SELECT * FROM playlists ORDER BY updated_at DESC').all();
  return (result.results || []).map(p => {
    let items = [];
    try {
      items = JSON.parse(p.items || '[]');
    } catch (e) {
      console.error('[db] Failed to parse playlist items:', e);
    }
    return { ...p, items };
  });
}

/**
 * Upsert playlist
 */
export async function upsertPlaylist(db, playlist) {
  const { id, name, state, created_by, created_at, updated_at, items } = playlist;

  await db.prepare(`
    INSERT INTO playlists (id, name, state, created_by, created_at, updated_at, items)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      state = excluded.state,
      updated_at = excluded.updated_at,
      items = excluded.items
  `).bind(
    id, name, state || 'ongoing', created_by || 'admin',
    created_at || new Date().toISOString(),
    updated_at || new Date().toISOString(),
    JSON.stringify(items || [])
  ).run();
}

/**
 * Delete playlist by ID
 */
export async function deletePlaylist(db, playlistId) {
  await db.prepare('DELETE FROM playlists WHERE id = ?').bind(playlistId).run();
}
