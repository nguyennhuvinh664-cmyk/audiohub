// js/cloudflare-client.js
// Cloudflare D1 + R2 API Client
// Replaces supabase-client.js

(function () {
  'use strict';

  // API base URL (Cloudflare Pages Functions)
  var API_BASE = '/api';

  /**
   * Get auth token from localStorage
   */
  function getToken() {
    try {
      return localStorage.getItem('audiohub-auth-token') || '';
    } catch (e) {
      return '';
    }
  }

  /**
   * Make API request
   */
  async function apiRequest(path, options = {}) {
    const { method = 'GET', body, headers = {} } = options;

    const requestHeaders = {
      'Content-Type': 'application/json',
      ...headers
    };

    // Add auth token if available
    const token = getToken();
    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }

    const fetchOptions = {
      method,
      headers: requestHeaders
    };

    if (body && method !== 'GET') {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${path}`, fetchOptions);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Map row to story object (normalize field names)
   */
  function mapRowToStory(row) {
    if (!row) return null;
    return {
      id: row.id,
      title: row.title || 'Truyen moi',
      author: row.author,
      genre: row.genre,
      description: row.description,
      readingText: row.reading_text,
      chapterTitle: row.chapter_title,
      chapters: (function() {
        if (!row.chapters) return [];
        if (typeof row.chapters === 'object') return row.chapters;
        if (typeof row.chapters === 'string') {
          try { return JSON.parse(row.chapters); }
          catch(e) { console.warn('[cloudflare] Failed to parse chapters:', e); return []; }
        }
        return [];
      })(),
      chapterCount: row.chapter_count,
      visibility: row.visibility || 'Private',
      audioStatus: row.audio_status,
      status: row.status,
      isCompleted: row.is_completed === 1 || row.is_completed === true,
      coverKey: row.cover_key,
      coverData: row.cover_data || '',
      audioKey: row.audio_key,
      youtubeUrl: row.youtube_url,
      youtubeId: row.youtube_id,
      listenCount: row.listen_count || 0,
      listenCount2d: row.listen_count2d || 0,
      listenCount7d: row.listen_count7d || 0,
      userId: row.user_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      // Compatibility aliases
      listen_count: row.listen_count || 0,
      listen_count2d: row.listen_count2d || 0,
      listen_count7d: row.listen_count7d || 0,
      created_at: row.created_at,
      updated_at: row.updated_at
    };
  }

  /**
   * Map story object to row for API
   */
  function mapStoryToRow(story) {
    if (!story) return null;
    return {
      id: story.id || null,
      title: story.title || 'Truyen moi',
      author: story.author || '',
      genre: story.genre || '',
      description: story.description || '',
      reading_text: story.readingText || story.reading_text || '',
      chapter_title: story.chapterTitle || story.chapter_title || 'Chuong 1',
      chapters: story.chapters ? (typeof story.chapters === 'string' ? story.chapters : JSON.stringify(story.chapters)) : '[]',
      chapter_count: story.chapterCount || story.chapter_count || 1,
      visibility: story.visibility || 'Private',
      audio_status: story.audioStatus || story.audio_status || '',
      status: story.status || '',
      is_completed: story.isCompleted || story.is_completed ? 1 : 0,
      cover_key: story.coverKey || story.cover_key || null,
      cover_data: story.coverData || story.cover_data || null,
      audio_key: story.audioKey || story.audio_key || null,
      youtube_url: story.youtubeUrl || story.youtube_url || null,
      youtube_id: story.youtubeId || story.youtube_id || null,
      listen_count: story.listenCount || story.listen_count || 0,
      listen_count2d: story.listenCount2d || story.listen_count2d || 0,
      listen_count7d: story.listenCount7d || story.listen_count7d || 0,
      user_id: story.userId || story.user_id || null,
      created_at: story.createdAt || story.created_at || new Date().toISOString(),
      updated_at: story.updatedAt || story.updated_at || new Date().toISOString()
    };
  }

  /**
   * Fetch public stories
   */
  async function fetchPublicStories(options = {}) {
    const { genre, status, limit = 50, offset = 0 } = options;

    const params = new URLSearchParams();
    params.set('limit', limit);
    params.set('offset', offset);
    if (genre) params.set('genre', genre);
    if (status) params.set('status', status);

    const rows = await apiRequest(`/stories?${params.toString()}`);
    return rows.map(mapRowToStory);
  }

  /**
   * Fetch user's stories
   */
  async function fetchUserStories(userId, options = {}) {
    const { limit = 50, offset = 0 } = options;

    const params = new URLSearchParams();
    params.set('user_id', userId);
    params.set('limit', limit);
    params.set('offset', offset);

    const rows = await apiRequest(`/stories?${params.toString()}`);
    return rows.map(mapRowToStory);
  }

  /**
   * Fetch story by ID
   */
  async function fetchStoryById(storyId) {
    const row = await apiRequest(`/stories/${storyId}`);
    return mapRowToStory(row);
  }

  /**
   * Upsert story
   */
  async function upsertStory(story, userId) {
    const row = mapStoryToRow(story);
    if (userId) row.user_id = userId;
    const result = await apiRequest('/stories', {
      method: 'POST',
      body: row
    });
    return result;
  }

  /**
   * Delete story
   */
  async function deleteStory(storyId) {
    const result = await apiRequest(`/stories/${storyId}`, {
      method: 'DELETE'
    });
    return result;
  }

  /**
   * Track listen
   */
  async function trackListen(storyId, userId) {
    const result = await apiRequest(`/stories/${storyId}/listen`, {
      method: 'POST',
      body: { user_id: userId }
    });
    return result;
  }

  /**
   * Get user ID from auth token
   */
  function getUserId() {
    try {
      const profile = JSON.parse(localStorage.getItem('audiohub-auth-profile') || '{}');
      return profile.id || null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Check if Cloudflare API is available
   */
  function isAvailable() {
    return true; // Always available when using Cloudflare
  }

  // Expose globally
  window.AudioHubSupabase = {
    fetchPublicStories: fetchPublicStories,
    fetchUserStories: fetchUserStories,
    fetchStoryById: fetchStoryById,
    upsertStory: upsertStory,
    deleteStory: deleteStory,
    trackListen: trackListen,
    getUserId: getUserId,
    isAvailable: isAvailable
  };

  // Also expose under a Cloudflare-specific name
  window.AudioHubCloudflare = window.AudioHubSupabase;

  console.log('[cloudflare-client] Cloudflare API client initialized');
})();
