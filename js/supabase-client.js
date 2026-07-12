/**
 * Supabase Client — connects directly to Supabase, bypassing Render backend.
 * Used for cross-tab / cross-device story visibility.
 */
(function () {
  'use strict';

  var SUPABASE_URL = 'https://oatwyxkzonhjfdzapjyb.supabase.co';
  var SUPABASE_KEY = 'sb_publishable_BP2pN_2F9YOgC2K3yZPjIA_nDYxmGie';

  var REST_URL = SUPABASE_URL + '/rest/v1';

  function authHeaders() {
    return {
      'apikey': SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  }

  /**
   * Fetch all public stories from Supabase
   */
  function fetchPublicStories() {
    return fetch(
      REST_URL + '/stories?visibility=eq.PUBLIC&order=created_at.desc&limit=100',
      { headers: authHeaders() }
    )
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (rows) {
        return rows.map(mapRowToStory);
      });
  }

  /**
   * Upsert a story to Supabase
   */
  function upsertStory(story, userId) {
    var row = mapStoryToRow(story, userId);
    return fetch(
      REST_URL + '/stories',
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(row)
      }
    )
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) { return data[0] || data; });
  }

  /**
   * Delete a story from Supabase
   */
  function deleteStory(storyId) {
    return fetch(
      REST_URL + '/stories?id=eq.' + encodeURIComponent(storyId),
      { method: 'DELETE', headers: authHeaders() }
    );
  }

  /**
   * Track a listen event
   */
  function trackListen(storyId, userId) {
    return fetch(
      REST_URL + '/story_listen_events',
      {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ story_id: storyId, user_id: userId })
      }
    ).catch(function () {}); // best effort
  }

  /**
   * Get userId from local guest token (JWT decode)
   */
  function getUserId() {
    var token = localStorage.getItem('audiohub-auth-token');
    if (!token || token === 'demo-local-token') return null;
    try {
      var payload = JSON.parse(atob(token.split('.')[1]));
      return payload.userId || null;
    } catch (e) {
      return null;
    }
  }

  /* ---- Mapping helpers ---- */

  function mapRowToStory(row) {
    var chapters = [];
    try {
      chapters = typeof row.chapters === 'string' ? JSON.parse(row.chapters) : (row.chapters || []);
    } catch (e) { chapters = []; }

    return {
      id: row.id,
      title: row.title || '',
      author: row.author || '',
      genre: row.genre || '',
      description: row.description || '',
      readingText: row.reading_text || '',
      hashtags: [],
      chapterTitle: row.chapter_title || 'Chương 1',
      chapters: chapters,
      chapterCount: row.chapter_count || chapters.length || 0,
      visibility: row.visibility === 'PUBLIC' ? 'Công khai' : (row.visibility === 'PRIVATE' ? 'Riêng tư' : 'Không công khai'),
      audioStatus: row.audio_status === 'READY' ? 'Sẵn sàng' : 'Chưa có',
      status: row.status || '',
      isCompleted: row.is_completed || false,
      coverKey: row.cover_key || null,
      coverData: row.cover_data || '',
      audioKey: row.audio_key || null,
      youtubeUrl: row.youtube_url || '',
      youtubeId: row.youtube_id || '',
      listenCount: row.listen_count || 0,
      listenCount2d: row.listen_count2d || 0,
      listenCount7d: row.listen_count7d || 0,
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || new Date().toISOString()
    };
  }

  function mapStoryToRow(story, userId) {
    var visMap = { 'Công khai': 'PUBLIC', 'Không công khai': 'UNLISTED', 'Riêng tư': 'PRIVATE' };
    var audioMap = { 'Sẵn sàng': 'READY', 'Chưa có': 'HIDDEN' };
    return {
      title: story.title || 'Truyện mới',
      author: story.author || '',
      genre: story.genre || '',
      description: story.description || '',
      reading_text: story.readingText || '',
      chapter_title: story.chapterTitle || 'Chương 1',
      chapters: JSON.stringify(story.chapters || []),
      chapter_count: story.chapterCount || (story.chapters ? story.chapters.length : 0),
      visibility: visMap[story.visibility] || 'PUBLIC',
      audio_status: audioMap[story.audioStatus] || 'READY',
      status: story.status || '',
      is_completed: story.isCompleted || false,
      cover_key: story.coverKey || null,
      cover_data: story.coverData || story.coverDataUrl || null,
      audio_key: story.audioKey || null,
      youtube_url: story.youtubeUrl || '',
      youtube_id: story.youtubeId || '',
      listen_count: story.listenCount || 0,
      listen_count2d: story.listenCount2d || 0,
      listen_count7d: story.listenCount7d || 0,
      user_id: userId || '00000000-0000-0000-0000-000000000000',
      created_at: story.createdAt || new Date().toISOString(),
      updated_at: story.updatedAt || new Date().toISOString()
    };
  }

  /* ---- Public API ---- */
  window.AudioHubSupabase = {
    fetchPublicStories: fetchPublicStories,
    upsertStory: upsertStory,
    deleteStory: deleteStory,
    trackListen: trackListen,
    getUserId: getUserId,
    isAvailable: function () { return true; }
  };

  console.log('[Supabase] Client initialized —', SUPABASE_URL);
})();
