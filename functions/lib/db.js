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
 * Upsert story (insert or update) — uses COALESCE so partial updates don't erase existing data
 */
export async function upsertStory(db, story) {
  const id = story.id || null;
  if (!id) {
    throw new Error('Story ID is required — generate one before calling upsertStory');
  }

  // Use COALESCE: only overwrite fields that are actually provided (non-null/non-empty)
  const fields = {
    title: story.title || null,
    author: story.author || null,
    genre: story.genre || null,
    description: story.description || null,
    reading_text: story.reading_text || null,
    chapter_title: story.chapter_title || null,
    chapters: story.chapters || null,
    chapter_count: story.chapter_count != null ? story.chapter_count : null,
    visibility: story.visibility || null,
    audio_status: story.audio_status || null,
    status: story.status || null,
    is_completed: story.is_completed != null ? story.is_completed : null,
    cover_key: story.cover_key || null,
    cover_data: story.cover_data || null,
    audio_key: story.audio_key || null,
    youtube_url: story.youtube_url || null,
    youtube_id: story.youtube_id || null,
    listen_count: story.listen_count != null ? story.listen_count : null,
    listen_count2d: story.listen_count2d != null ? story.listen_count2d : null,
    listen_count7d: story.listen_count7d != null ? story.listen_count7d : null,
    user_id: story.user_id || null,
    created_at: story.created_at || new Date().toISOString(),
    updated_at: story.updated_at || new Date().toISOString()
  };

  // Check if story already exists
  const existing = await db.prepare('SELECT id FROM stories WHERE id = ?').bind(id).first();

  if (!existing) {
    // INSERT — use provided values (with defaults)
    const cols = ['id', ...Object.keys(fields)];
    const vals = [id, ...Object.values(fields)];
    const placeholders = cols.map(() => '?').join(', ');
    await db.prepare(`INSERT INTO stories (${cols.join(', ')}) VALUES (${placeholders})`).bind(...vals).run();
  } else {
    // UPDATE — use COALESCE so only non-null fields overwrite existing values
    const setClauses = Object.keys(fields)
      .filter(k => k !== 'created_at' && k !== 'updated_at') // always update these
      .map(k => `${k} = COALESCE(excluded.${k}, stories.${k})`)
      .join(', ');
    await db.prepare(`
      INSERT INTO stories (id, ${Object.keys(fields).join(', ')})
      VALUES (?, ${Object.keys(fields).map(() => '?').join(', ')})
      ON CONFLICT(id) DO UPDATE SET
        ${setClauses},
        created_at = stories.created_at,
        updated_at = excluded.updated_at
    `).bind(id, ...Object.values(fields)).run();
  }
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
    typeof items === 'string' ? items : JSON.stringify(items || [])
  ).run();
}

/**
 * Delete playlist by ID
 */
export async function deletePlaylist(db, playlistId) {
  await db.prepare('DELETE FROM playlists WHERE id = ?').bind(playlistId).run();
}
