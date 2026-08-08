(function () {
  // ── User-scoped localStorage keys ──
  function _getUserId() {
    try {
      var raw = window.localStorage.getItem('audiohub-auth-profile');
      var parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !parsed.isLoggedIn) return null;
      // Use id, or fallback to email, or fallback to name
      return (parsed.id && String(parsed.id).trim())
        || (parsed.email && String(parsed.email).trim().toLowerCase())
        || (parsed.name && String(parsed.name).trim().toLowerCase())
        || null;
    } catch (e) { return null; }
  }
  function _storiesKey() {
    var uid = _getUserId();
    return uid ? 'audiohub-stories-' + uid : 'audiohub-stories';
  }
  function _deletedKey() {
    var uid = _getUserId();
    return uid ? 'audiohub-deleted-stories-' + uid : 'audiohub-deleted-stories';
  }

  function getDeletedIds() {
    try {
      return JSON.parse(localStorage.getItem(_deletedKey()) || '[]');
    } catch (e) {
      return [];
    }
  }

  function addDeletedId(id) {
    var deleted = getDeletedIds();
    if (deleted.indexOf(id) === -1) {
      deleted.push(id);
      try { localStorage.setItem(_deletedKey(), JSON.stringify(deleted)); } catch (e) {}
    }
  }

  function isDeleted(id) {
    return getDeletedIds().indexOf(id) !== -1;
  }

  function safeParse(raw, fallback) {
    try {
      return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function dedupeStories(stories) {
    var list = Array.isArray(stories) ? stories : [];
    var byId = {};
    list.forEach(function (item) {
      if (!item || !item.id) return;
      byId[String(item.id)] = normalizeStory(item);
    });

    var values = Object.keys(byId).map(function (id) { return byId[id]; });
    var pickedByFingerprint = {};

    values.forEach(function (story) {
      var fingerprint = [
        _nfc(story.title),
        String(story.author || '').trim().toLowerCase()
      ].join('::');
      if (!fingerprint || fingerprint === '::') {
        pickedByFingerprint[String(story.id)] = story;
        return;
      }
      var current = pickedByFingerprint[fingerprint];
      if (!current) {
        pickedByFingerprint[fingerprint] = story;
        return;
      }
      var currentTime = Date.parse(String(current.updatedAt || current.createdAt || '')) || 0;
      var nextTime = Date.parse(String(story.updatedAt || story.createdAt || '')) || 0;
      if (nextTime >= currentTime) {
        // Migrate chapters from old story to new one before replacing
        try {
          var oldChapters = getChaptersForStory(current.id);
          var newChapters = getChaptersForStory(story.id);
          if (oldChapters.length && (!newChapters.length || newChapters.length < oldChapters.length)) {
            saveChaptersForStory(story.id, oldChapters);
            console.log('[stories-store] Merged chapters from', current.id, '→', story.id, '(', oldChapters.length, 'chapters)');
          }
          // Cleanup old s_ keys
          var cs = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
          try { delete cs[current.id]; } catch (e) {}
          try { delete cs['s_' + current.id]; } catch (e) {}
          localStorage.setItem('audiohub-chapters-v1', JSON.stringify(cs));
        } catch (e) {}
        pickedByFingerprint[fingerprint] = story;
      }
    });

    return Object.keys(pickedByFingerprint).map(function (key) {
      return pickedByFingerprint[key];
    }).sort(function (a, b) {
      var ta = Date.parse(String(a.updatedAt || a.createdAt || '')) || 0;
      var tb = Date.parse(String(b.updatedAt || b.createdAt || '')) || 0;
      return tb - ta;
    });
  }

  function readLocalStories() {
    var raw = window.localStorage.getItem(_storiesKey());
    var parsed = safeParse(raw, []);
    var next = dedupeStories(Array.isArray(parsed) ? parsed : []).map(function (story) {
      // Migration: fix default visibility from old 'Riêng tư' to 'Công khai'
      // Stories uploaded via UI should be public by default
      var vis = String(story && story.visibility || '').trim().toLowerCase();
      if (!vis || vis === 'riêng tư' || vis === 'private' || vis === 'draft') {
        story.visibility = 'Công khai';
      }
      var metrics = computeListenMetrics(story);
      story.listenHistory = metrics.history;
      story.listenCount = metrics.listenCount;
      story.listenCount2d = metrics.listenCount2d;
      story.listenCount7d = metrics.listenCount7d;
      return story;
    });
    // Only write back if dedup or cap changed the data
    var deduped = dedupeStories(Array.isArray(parsed) ? parsed : []);
    var needsWrite = deduped.length !== (Array.isArray(parsed) ? parsed : []).length
      || next.length !== deduped.length;
    if (needsWrite) {
      try {
        window.localStorage.setItem(_storiesKey(), JSON.stringify(next.slice(0, 50)));
      } catch (error) {}
    }
    return next;
  }

  function writeLocalStories(stories) {
    // DEFENSE-IN-DEPTH: filter out any deleted stories BEFORE writing
    // This prevents syncFromApiFallback from re-adding deleted stories
    // even if addDeletedId() failed or ID format changed after backend sync
    var deletedIds = getDeletedIds();
    if (deletedIds.length) {
      var deletedMap = {};
      deletedIds.forEach(function (id) { if (id) deletedMap[String(id)] = true; });
      stories = stories.filter(function (s) { return s && s.id && !deletedMap[String(s.id)]; });
    }
    try {
      window.localStorage.setItem(_storiesKey(), JSON.stringify(stories));
    } catch (e) {
      // localStorage full — progressively strip large fields, readingText LAST
      var slimmed = stories.map(function (s) {
        var copy = Object.assign({}, s);
        delete copy.coverData;
        delete copy.coverDataUrl;
        delete copy.coverLegacyDataUrl;
        delete copy.listenHistory;
        return copy;
      });
      try {
        window.localStorage.setItem(_storiesKey(), JSON.stringify(slimmed));
      } catch (e2) {
        // Still full — strip chapters (can be re-fetched from API)
        var evenSlimmer = slimmed.map(function (s) {
          var copy = Object.assign({}, s);
          delete copy.chapters;
          return copy;
        });
        try {
          window.localStorage.setItem(_storiesKey(), JSON.stringify(evenSlimmer));
        } catch (e3) {
          // Still full — strip readingText as absolute last resort
          var minimal = evenSlimmer.map(function (s) {
            var copy = Object.assign({}, s);
            delete copy.readingText;
            return copy;
          });
          window.localStorage.setItem(_storiesKey(), JSON.stringify(minimal.slice(0, 10)));
        }
      }
    }
  }

  function makeId() {
    return 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function normalize(value, fallback) {
    return value ? String(value).trim() : fallback;
  }

  // NFD-normalized title comparison (handles Vietnamese diacritics: ô ≠ ố, ư ≠ ứ, etc.)
  function _nfc(s) {
    return String(s || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function normalizeNumber(value) {
    var num = Number(value);
    return isNaN(num) || num < 0 ? 0 : num;
  }

  function normalizeCompleted(story) {
    var flag = story && story.isCompleted;
    if (typeof flag === 'boolean') {
      return flag;
    }
    var status = normalize(story && story.status, '');
    return status.toLowerCase() === 'hoàn thành' || status.toLowerCase() === 'hoan thanh' || status.toLowerCase() === 'completed' || status.toLowerCase() === 'full';
  }

  function normalizeHashtagToken(value) {
    return String(value || '')
      .trim()
      .replace(/^#+/, '')
      .replace(/\s+/g, '-')
      .toLowerCase();
  }

  function normalizeHashtags(values) {
    var list = Array.isArray(values) ? values : [];
    var seen = {};
    return list.map(normalizeHashtagToken).filter(function (tag) {
      if (!tag) return false;
      if (seen[tag]) return false;
      seen[tag] = true;
      return true;
    });
  }

  function extractYoutubeId(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
    var patterns = [
      /[?&]v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
    ];
    for (var i = 0; i < patterns.length; i += 1) {
      var match = raw.match(patterns[i]);
      if (match && match[1]) return match[1];
    }
    return '';
  }

  function normalizeYoutubeUrl(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    var id = extractYoutubeId(raw);
    return id ? ('https://www.youtube.com/watch?v=' + id) : raw;
  }

  function normalizeYoutubeId(value, fallbackUrl) {
    return extractYoutubeId(value) || extractYoutubeId(fallbackUrl) || '';
  }

  function resolveAuthorFallback() {
    try {
      var raw = window.localStorage.getItem('audiohub-auth-profile');
      var parsed = raw ? JSON.parse(raw) : null;
      var name = parsed && parsed.isLoggedIn ? String(parsed.name || '').trim() : '';
      if (name) return name;
      var email = parsed && parsed.isLoggedIn ? String(parsed.email || '').trim() : '';
      if (email && email.indexOf('@') > 0) return email.split('@')[0];
    } catch (error) {
    }
    return 'Tài khoản AudioHub';
  }

  function sanitizeAuthor(value) {
    var text = String(value || '').trim();
    if (!text) return '';
    var lower = text.toLowerCase();
    if (lower === 'ẩn danh' || lower === 'an danh' || lower === 'anonymous') return '';
    return text;
  }

  function normalizeStory(story) {
    var cleanedAuthor = sanitizeAuthor(story && (story.author || story.author_name));
    var youtubeUrl = normalizeYoutubeUrl(story && (story.youtubeUrl || story.youtube_url));
    var youtubeId = normalizeYoutubeId(story && (story.youtubeId || story.youtube_id), youtubeUrl);
    // Read snake_case (from D1 API) with camelCase fallback (from localStorage)
    var readingText = (story && (story.readingText || story.reading_text)) || '';
    var hashtags = story && (story.hashtags || story.hashtag_list);
    if (typeof hashtags === 'string') {
      try { hashtags = JSON.parse(hashtags); } catch (e) { hashtags = hashtags.split(/[,\s]+/); }
    }
    var chapters = story && (story.chapters || story.chapter_list);
    if (typeof chapters === 'string') {
      try { chapters = JSON.parse(chapters); } catch (e) { chapters = []; }
    }
    var audioKey = (story && (story.audioKey || story.audio_key)) || '';
    var audioStatus = (story && (story.audioStatus || story.audio_status)) || (audioKey ? 'Sẵn sàng' : 'Chưa có');
    var coverData = (story && (story.coverData || story.cover_data)) || '';
    var coverKey = (story && (story.coverKey || story.cover_key)) || '';
    var coverDataUrl = (story && (story.coverDataUrl || story.cover_data_url)) || '';
    var chapterTitle = (story && (story.chapterTitle || story.chapter_title)) || '';
    var chapterCount = normalizeNumber(story && (story.chapterCount || story.chapter_count));
    var storedChapters = [];
    if (story && story.id) {
      storedChapters = getChaptersForStory(String(story.id));
    }
    if (!Array.isArray(chapters) || !chapters.length) {
      chapters = Array.isArray(storedChapters) ? storedChapters : [];
    } else if (Array.isArray(storedChapters) && storedChapters.length > chapters.length) {
      chapters = storedChapters;
      chapterCount = storedChapters.length;
    }
    var listenCount = normalizeNumber(story && (story.listenCount || story.listen_count));
    var listenCount2d = normalizeNumber(story && (story.listenCount2d || story.listen_count2d));
    var listenCount7d = normalizeNumber(story && (story.listenCount7d || story.listen_count7d));
    var visibility = (story && story.visibility) || 'Công khai';
    var status = (story && story.status) || '';
    var createdAt = (story && (story.createdAt || story.created_at)) || new Date().toISOString();
    var updatedAt = (story && (story.updatedAt || story.updated_at)) || new Date().toISOString();
    var listenHistory = pruneListenHistory(story && story.listenHistory);
    return {
      id: story && story.id ? String(story.id) : makeId(),
      title: normalize(story && story.title, 'Truyện mới'),
      author: normalize(cleanedAuthor, resolveAuthorFallback()),
      genre: normalize(story && story.genre, 'Truyện audio'),
      description: normalize(story && story.description, ''),
      readingText: normalize(readingText, ''),
      hashtags: normalizeHashtags(hashtags),
      chapterTitle: normalize(chapterTitle, 'Chương 1'),
      visibility: normalize(visibility, 'Công khai'),
      audioStatus: normalize(audioStatus, audioKey ? 'Sẵn sàng' : 'Chưa có'),
      coverDataUrl: coverDataUrl ? String(coverDataUrl) : '',
      coverData: coverData ? String(coverData) : '',
      coverKey: coverKey ? String(coverKey) : '',
      audioKey: audioKey ? String(audioKey) : '',
      youtubeUrl: youtubeUrl,
      youtubeId: youtubeId,
      listenCount: listenCount,
      listenCount2d: listenCount2d,
      listenCount7d: listenCount7d,
      chapters: Array.isArray(chapters) ? chapters : (function () {
        var sid = story && story.id ? String(story.id) : '';
        var stored = sid ? getChaptersForStory(sid) : [];
        return stored.length ? stored : [];
      })(),
      chapterCount: chapterCount || (function () {
        var sid = story && story.id ? String(story.id) : '';
        var stored = sid ? getChaptersForStory(sid) : [];
        return stored.length ? stored.length : 0;
      })(),
      status: normalize(status, ''),
      isCompleted: normalizeCompleted(story),
      listenHistory: listenHistory,
      coverLegacyDataUrl: coverDataUrl ? String(coverDataUrl).slice(0, 30) : '',
      createdAt: createdAt,
      updatedAt: updatedAt
    };
  }

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function pruneListenHistory(history) {
    var now = Date.now();
    var maxAge = 30 * 24 * 60 * 60 * 1000;
    return toArray(history).filter(function (value) {
      var time = Number(value);
      return !isNaN(time) && time > 0 && now - time <= maxAge;
    });
  }

  function computeListenMetrics(story) {
    var now = Date.now();
    var twoDays = 2 * 24 * 60 * 60 * 1000;
    var sevenDays = 7 * 24 * 60 * 60 * 1000;
    var history = pruneListenHistory(story && story.listenHistory);
    var count2d = 0;
    var count7d = 0;
    history.forEach(function (time) {
      var diff = now - Number(time);
      if (diff <= sevenDays) count7d += 1;
      if (diff <= twoDays) count2d += 1;
    });
    return {
      history: history,
      listenCount: Math.max(normalizeNumber(story && story.listenCount), history.length),
      listenCount2d: count2d,
      listenCount7d: count7d
    };
  }

  // ── Chapters localStorage layer (backup until DB migration runs) ──
  var CHAPTERS_KEY = 'audiohub-chapters-v1';
  function readChaptersStore() {
    try { return JSON.parse(localStorage.getItem(CHAPTERS_KEY) || '{}'); } catch (e) { return {}; }
  }
  function writeChaptersStore(obj) {
    try { localStorage.setItem(CHAPTERS_KEY, JSON.stringify(obj)); } catch (e) {}
  }
  function saveChaptersForStory(sid, chapters) {
    if (!sid || !Array.isArray(chapters)) return;
    var store = readChaptersStore();
    var existing = Array.isArray(store[sid]) ? store[sid].slice() : [];
    console.log('[chapters-store] 📖 saveChaptersForStory — sid:', sid, '| incoming:', chapters.length, '| existing:', existing.length);
    console.log('[chapters-store]   incoming titles:', chapters.map(function(c) { return c && c.title; }));
    console.log('[chapters-store]   existing titles:', existing.map(function(c) { return c && c.title; }));
    // Merge existing and incoming chapters, keeping unique entries
    // Use index-based identity: incoming chapters replace existing at same index,
    // new chapters are appended. This prevents dedup from collapsing different chapters
    // that share the same audioKey or readingText.
    function chapterKey(ch, idx) {
      if (!ch) return '';
      // Use title + index as primary identity — chapters at different indices are different
      var k = String(ch.title || '') + '||idx:' + idx + '||' + String(ch.audioKey || '') + '||' + String((ch.readingText || '').slice(0, 120));
      return k.replace(/\s+/g, ' ').trim();
    }
    // Build index-based merge: incoming chapters overwrite existing at same position
    var merged = existing.slice();
    chapters.forEach(function (c, i) {
      if (!merged[i]) {
        // New index — append
        merged.push(c);
      } else {
        // Existing index — replace with incoming (it's the latest version)
        merged[i] = c;
      }
    });
    // Dedup by full key (title+audioKey+readingText 120 chars) as safety net
    var deduped = [];
    var seen = {};
    merged.forEach(function (c, i) {
      var k = chapterKey(c, i);
      if (!k || k === '||idx:' + i + '||') {
        // Empty chapter — use JSON as fallback key
        try { k = JSON.stringify(c || {}); } catch (e) { k = 'auto_' + i + '_' + Date.now(); }
      }
      if (!seen[k]) { seen[k] = true; deduped.push(c); }
    });
    store[sid] = deduped;
    if (!String(sid).startsWith('s_') && store['s_' + sid]) {
      delete store['s_' + sid];
    }
    writeChaptersStore(store);
    console.log('[chapters-store] ✅ SAVED — final:', deduped.length, '| titles:', deduped.map(function(c) { return c && c.title; }));
  }
  function getChaptersForStory(sid) {
    if (!sid) return [];
    var store = readChaptersStore();
    var chapters = Array.isArray(store[sid]) ? store[sid] : [];
    if (!chapters.length && sid && !String(sid).startsWith('s_')) {
      chapters = Array.isArray(store['s_' + sid]) ? store['s_' + sid] : chapters;
    }
    return chapters;
  }

  function upsertLocalStory(story) {
    var stories = readLocalStories();
    var entry = normalizeStory(story);

    // Save chapters to separate localStorage if present
    if (Array.isArray(story.chapters) && story.chapters.length) {
      saveChaptersForStory(entry.id, story.chapters);
      entry.chapters = story.chapters;
      entry.chapterCount = story.chapters.length;
    }

    // Merge chapters from localStorage if not in entry
    if (!entry.chapters || !entry.chapters.length) {
      var stored = getChaptersForStory(entry.id);
      if (stored.length) {
        entry.chapters = stored;
        entry.chapterCount = stored.length;
      }
    }

    var existingIndex = stories.findIndex(function (item) {
      return item.id === entry.id;
    });

    if (existingIndex >= 0) {
      stories.splice(existingIndex, 1);
    }

    stories.unshift(entry);
    writeLocalStories(stories.slice(0, 50));
    return entry;
  }

  function getLocalStoryById(id) {
    if (!id) {
      return null;
    }
    var story = readLocalStories().find(function (s) {
      return s.id === id;
    }) || null;
    // Always prefer chapters from audiohub-chapters-v1 (authoritative store)
    if (story) {
      var stored = getChaptersForStory(id);
      if (stored.length) {
        story.chapters = stored;
        story.chapterCount = stored.length;
      }
    }
    return story;
  }

  function removeLocalStory(id) {
    if (!id) {
      return false;
    }

    var stories = readLocalStories();
    var nextStories = stories.filter(function (story) {
      return story.id !== id;
    });

    if (nextStories.length === stories.length) {
      return false;
    }

    writeLocalStories(nextStories);
    return true;
  }

  function canUseApi() {
    return !!(window.AudioHubApi && typeof window.AudioHubApi.request === 'function' && window.AudioHubApi.isEnabled && window.AudioHubApi.isEnabled());
  }

  function mapStoryPayload(story) {
    var chapters = Array.isArray(story && story.chapters) ? story.chapters : [];
    return {
      id: story && story.id ? String(story.id) : null,
      title: normalize(story && story.title, 'Truyện mới'),
      author: normalize(sanitizeAuthor(story && story.author), resolveAuthorFallback()),
      genre: normalize(story && story.genre, 'Truyện audio'),
      description: normalize(story && story.description, ''),
      reading_text: normalize(story && story.readingText, ''),
      hashtags: normalizeHashtags(story && story.hashtags),
      chapter_title: normalize(story && story.chapterTitle, 'Chương 1'),
      chapters: JSON.stringify(chapters),
      chapter_count: chapters.length || Number(story && story.chapterCount) || 0,
      visibility: normalize(story && story.visibility, 'Công khai'),
      audio_status: normalize(story && story.audioStatus, story && story.audioKey ? 'Sẵn sàng' : 'Chưa có'),
      status: normalize(story && story.status, ''),
      is_completed: normalizeCompleted(story) ? 1 : 0,
      cover_key: story && story.coverKey ? String(story.coverKey) : null,
      cover_data: story && story.coverData ? String(story.coverData) : null,
      audio_key: story && story.audioKey ? String(story.audioKey) : null,
      youtube_url: story && story.youtubeUrl ? normalizeYoutubeUrl(story.youtubeUrl) : null,
      youtube_id: story && story.youtubeId ? normalizeYoutubeId(story.youtubeId, story && story.youtubeUrl) : normalizeYoutubeId('', story && story.youtubeUrl),
      user_id: story && story.userId ? String(story.userId) : null
    };
  }

  /* ── Toast helper ─────────────────────────────────────────────────── */
  var _lastToastTime = 0;
  function showToast(message, type) {
    try {
      // Cooldown: prevent toast within 5 seconds
      var now = Date.now();
      if (now - _lastToastTime < 5000) return;
      _lastToastTime = now;

      var existing = document.querySelector('.audiohub-sync-toast');
      if (existing) existing.remove();
      var toast = document.createElement('div');
      toast.className = 'audiohub-sync-toast audiohub-sync-toast--' + (type || 'info');
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(function () { toast.classList.add('is-visible'); }, 10);
      setTimeout(function () {
        toast.classList.remove('is-visible');
        setTimeout(function () { toast.remove(); }, 400);
      }, 4000);
    } catch (e) {}
  }

  /* ── Base64 data URL → Blob helper ─────────────────────────────── */
  function _dataUrlToBlob(dataUrl) {
    try {
      var parts = dataUrl.split(',');
      var mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
      var raw = atob(parts[1] || '');
      var arr = new Uint8Array(raw.length);
      for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
      return new Blob([arr], { type: mime });
    } catch (e) { return null; }
  }

  /* ── Supabase sync with retry ────────────────────────────────────── */
  var _syncingCloud = {}; // guard against duplicate syncs
  function syncToSupabaseWithRetry(localEntry, maxRetries) {
    // Skip if already syncing this story
    if (_syncingCloud[localEntry.id]) return;
    _syncingCloud[localEntry.id] = true;

    // ── Save cover to IndexedDB IMMEDIATELY (before async Supabase upsert) ──
    // This ensures the cover is available locally even if the network fails.
    if (localEntry.coverData && window.AudioHubStoryCover && typeof window.AudioHubStoryCover.put === 'function') {
      var _idbBlob = _dataUrlToBlob(localEntry.coverData);
      if (_idbBlob) {
        window.AudioHubStoryCover.put(_idbBlob, localEntry.id).then(function () {
          console.log('[stories] ✅ cover saved to IndexedDB (immediate) for', localEntry.id);
        }).catch(function () {});
      }
    }

    var retries = maxRetries || 3;
    var delay = 2000; // 2 seconds between retries

    function attempt(attemptNum) {
      var userId = window.AudioHubSupabase.getUserId();
      window.AudioHubSupabase.upsertStory(localEntry, userId)
        .then(function (created) {
          delete _syncingCloud[localEntry.id];
          console.log('[stories] ✅ Supabase sync success:', localEntry.title);
          showToast('✅ Đã đồng bộ lên cloud — có thể xem trên thiết bị khác!', 'success');

          // ── Guarantee: PATCH cover_data to D1 (initial upsert may have been too large) ──
          var _cloudId = (created && created.id) ? String(created.id) : String(localEntry.id);
          if (localEntry.coverData && _cloudId && _cloudId.indexOf('s_') !== 0) {
            fetch('/api/stories/' + encodeURIComponent(_cloudId), {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: _cloudId, cover_data: localEntry.coverData })
            }).then(function (r) {
              if (r.ok) console.log('[stories] ✅ cover_data saved to D1 for', _cloudId);
              else console.warn('[stories] cover_data save failed:', r.status);
            }).catch(function (e) {
              console.warn('[stories] cover_data save error:', e);
            });
          }
          if (created && created.id && String(created.id) !== String(localEntry.id)) {
            var savedChapters = Array.isArray(localEntry.chapters) ? localEntry.chapters : [];
            var newStoryId = String(created.id);

            // ── Migrate cover from local s_ ID to cloud UUID ──
            if (window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function' && typeof window.AudioHubStoryCover.put === 'function') {
              window.AudioHubStoryCover.get(localEntry.id).then(function (blob) {
                if (blob && blob.size > 0) {
                  // Save to IndexedDB with cloud UUID
                  window.AudioHubStoryCover.put(blob, newStoryId).catch(function () {});
                  // PATCH cover_data to Supabase DB
                  var reader = new FileReader();
                  reader.onload = function () {
                    var dataUrl = reader.result;
                    if (dataUrl && dataUrl.indexOf('data:image') === 0) {
                      fetch('/api/stories/' + encodeURIComponent(newStoryId), {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: newStoryId, cover_data: dataUrl })
                      }).then(function (r) {
                        if (r.ok) console.log('[stories] ✅ cover migrated to D1:', newStoryId);
                      }).catch(function () {});
                    }
                  };
                  reader.readAsDataURL(blob);
                }
              }).catch(function () {});
            }

            // ── Migrate audio from local s_ ID to cloud UUID ──
            if (window.AudioHubStoryAudio && typeof window.AudioHubStoryAudio.get === 'function' && typeof window.AudioHubStoryAudio.put === 'function') {
              // Try to find audio by old s_ ID
              var oldAudioKey = localEntry.audioKey || localEntry.id;
              window.AudioHubStoryAudio.get(oldAudioKey).then(function (audioBlob) {
                if (audioBlob && audioBlob.size > 0) {
                  // Re-upload to R2 with new cloud UUID
                  var r2Url = '/api/audio/' + encodeURIComponent(newStoryId);
                  fetch(r2Url, {
                    method: 'PUT',
                    headers: { 'Content-Type': audioBlob.type || 'audio/mpeg' },
                    body: audioBlob
                  }).then(function (r) {
                    if (r.ok) console.log('[stories] ✅ audio migrated to R2:', newStoryId);
                  }).catch(function () {});
                }
              }).catch(function () {});
            }

            removeLocalStory(localEntry.id);
            upsertLocalStory({
              id: newStoryId, title: localEntry.title, author: localEntry.author,
              genre: localEntry.genre, description: localEntry.description,
              readingText: localEntry.readingText, hashtags: localEntry.hashtags,
              chapterTitle: localEntry.chapterTitle, chapters: savedChapters,
              chapterCount: savedChapters.length || localEntry.chapterCount || 0,
              visibility: localEntry.visibility, audioStatus: localEntry.audioStatus,
              coverData: localEntry.coverData, coverKey: localEntry.coverKey, audioKey: localEntry.audioKey,
              youtubeUrl: localEntry.youtubeUrl, youtubeId: localEntry.youtubeId,
              createdAt: created.created_at || localEntry.createdAt,
              updatedAt: created.updated_at || new Date().toISOString()
            });

            // Update playlist entries: replace local ID with cloud ID
            try {
              var PLAYLIST_KEY = 'audiohub-playlists-v1';
              var plRaw = localStorage.getItem(PLAYLIST_KEY) || '';
              var playlists = plRaw ? JSON.parse(plRaw) : [];
              if (Array.isArray(playlists)) {
                var plChanged = false;
                playlists.forEach(function (pl) {
                  (pl.entries || []).forEach(function (e) {
                    if (String(e.storyId || e.key || '') === String(localEntry.id)) {
                      e.storyId = newStoryId;
                      e.key = newStoryId;
                      if (e.href) {
                        e.href = e.href.replace('id=' + encodeURIComponent(localEntry.id), 'id=' + encodeURIComponent(newStoryId));
                      }
                      plChanged = true;
                    }
                  });
                });
                if (plChanged) {
                  localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlists));
                  // Sync to D1 playlists
                  try {
                    playlists.forEach(function (pl) {
                      fetch('/api/playlists', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: pl.id, name: pl.name, items: JSON.stringify(pl.entries || []) })
                      }).catch(function () {});
                    });
                  } catch (e) {}
                  console.log('[stories] Updated playlist entries with cloud ID:', newStoryId);
                }
              }
            } catch (e) {}

            // Re-upload audio under real CUID so other browsers can find it
            if (localEntry.audioKey && window.AudioHubStoryAudio && typeof window.AudioHubStoryAudio.put === 'function') {
              window.AudioHubStoryAudio.get(localEntry.audioKey)
                .then(function (blob) {
                  if (!blob) return;
                  window.AudioHubStoryAudio.put(blob, newStoryId).then(function (newKey) {
                    if (newKey && newKey !== localEntry.audioKey) {
                      var updatedEntry = getLocalStoryById(newStoryId);
                      if (updatedEntry) {
                        updatedEntry.audioKey = newKey;
                        upsertLocalStory(updatedEntry);
                      }
                    }
                  });
                })
                .catch(function () {});
            }

            // Upload cover to D1 under real CUID (cover upload was skipped earlier
            // because upsertStory returns local s_ ID before async D1 sync)
            if (localEntry.coverData) {
              fetch('/api/stories/' + encodeURIComponent(newStoryId), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: newStoryId, cover_data: localEntry.coverData })
              }).then(function (r) {
                if (r.ok) console.log('[stories] ✅ cover_data saved to D1 for', newStoryId);
              }).catch(function () {});
              // Also save cover to IndexedDB under real CUID (for self-heal on other pages)
              if (window.AudioHubStoryCover && typeof window.AudioHubStoryCover.put === 'function') {
                var _coverBlob = _dataUrlToBlob(localEntry.coverData);
                if (_coverBlob) {
                  window.AudioHubStoryCover.put(_coverBlob, newStoryId).catch(function () {});
                }
              }
            }
          }
        })
        .catch(function (e) {
          var errMsg = e.message || e;
          console.warn('[stories] Supabase sync failed (attempt ' + attemptNum + '/' + retries + '):', errMsg);
          if (attemptNum < retries) {
            setTimeout(function () { attempt(attemptNum + 1); }, delay * attemptNum);
          } else {
            delete _syncingCloud[localEntry.id];
            console.error('[stories] ❌ Supabase sync FAILED after ' + retries + ' attempts:', localEntry.title);
            showToast('⚠️ Đồng bộ cloud thất bại. Truyện chỉ lưu trên thiết bị này. Kiểm tra kết nối mạng.', 'error');
          }
        });
    }

    attempt(1);
  }

  function upsertStory(story) {
    var localEntry = upsertLocalStory(story);

    // Sync to D1 via Cloudflare Pages Functions
    var hasApi = !!(window.AudioHubApi && typeof window.AudioHubApi.request === 'function');
    if (hasApi) {
      var payload = mapStoryPayload(localEntry);
      if (localEntry.id && !String(localEntry.id).startsWith('s_')) {
        // Real CUID — PATCH existing story
        window.AudioHubApi.request('/stories/' + encodeURIComponent(localEntry.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).catch(function () {});
      } else {
        // Temp s_ ID — check localStorage for existing story with same title+author
        // that already has a real CUID (prevents duplicate D1 entries)
        if (_syncingStories[localEntry.id]) {
          return localEntry;
        }

        var existingLocal = readLocalStories().find(function (s) {
          return s && s.id && !String(s.id).startsWith('s_') &&
            _nfc(s.title) === _nfc(localEntry.title);
        });

        if (existingLocal) {
          // Story with real CUID already exists locally — PATCH it instead of creating new
          _syncingStories[localEntry.id] = true;
          window.AudioHubApi.request('/stories/' + encodeURIComponent(existingLocal.id), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).then(function () {
            delete _syncingStories[localEntry.id];
            // Replace local s_ entry with real ID
            var savedChapters = Array.isArray(localEntry.chapters) ? localEntry.chapters : [];
            removeLocalStory(localEntry.id);
            upsertLocalStory({
              id: existingLocal.id, title: localEntry.title, author: localEntry.author,
              genre: localEntry.genre, description: localEntry.description,
              readingText: localEntry.readingText, hashtags: localEntry.hashtags,
              chapterTitle: localEntry.chapterTitle, chapters: savedChapters,
              chapterCount: savedChapters.length || localEntry.chapterCount || 0,
              visibility: localEntry.visibility, audioStatus: localEntry.audioStatus,
              coverData: localEntry.coverData, coverKey: localEntry.coverKey, audioKey: localEntry.audioKey,
              youtubeUrl: localEntry.youtubeUrl, youtubeId: localEntry.youtubeId,
              createdAt: existingLocal.createdAt || localEntry.createdAt,
              updatedAt: new Date().toISOString()
            });
          }).catch(function () {
            delete _syncingStories[localEntry.id];
          });
        } else {
          // No existing story — create new in D1
          _syncingStories[localEntry.id] = true;
          window.AudioHubApi.request('/stories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).then(function (created) {
            delete _syncingStories[localEntry.id];
            if (!created || !created.id) return;
            var savedChapters = Array.isArray(localEntry.chapters) ? localEntry.chapters : [];
            removeLocalStory(localEntry.id);
            upsertLocalStory({
              id: created.id, title: localEntry.title, author: localEntry.author,
              genre: localEntry.genre, description: localEntry.description,
              readingText: localEntry.readingText, hashtags: localEntry.hashtags,
              chapterTitle: localEntry.chapterTitle, chapters: savedChapters,
              chapterCount: savedChapters.length || localEntry.chapterCount || 0,
              visibility: localEntry.visibility, audioStatus: localEntry.audioStatus,
              coverData: localEntry.coverData, coverKey: localEntry.coverKey, audioKey: localEntry.audioKey,
              youtubeUrl: localEntry.youtubeUrl, youtubeId: localEntry.youtubeId,
              createdAt: created.createdAt || localEntry.createdAt,
              updatedAt: created.updatedAt || new Date().toISOString()
            });
          }).catch(function () {
            delete _syncingStories[localEntry.id];
          });
        }
      }
    }

    return localEntry;
  }

  function getStoryById(id) {
    return getLocalStoryById(id);
  }

  function clearListenHistory(id) {
    if (!id) return false;
    var story = getLocalStoryById(id);
    if (!story) return false;

    story.listenHistory = [];
    story.listenCount = normalizeNumber(story.listenCount);
    story.listenCount2d = 0;
    story.listenCount7d = 0;
    story.updatedAt = new Date().toISOString();
    upsertLocalStory(story);
    notifyStoriesUpdated();

    if (canUseApi() && !String(story.id || '').startsWith('s_')) {
      window.AudioHubApi.request('/stories/' + encodeURIComponent(String(story.id)) + '/listen/clear', { method: 'POST' })
        .catch(function (err) { console.error('Failed to clear listen history on API:', err); });
    }
    return true;
  }

  function trackListen(id) {
    if (!id) return null;
    var story = getLocalStoryById(id);

    // If story not in localStorage, still call API to record listen
    if (!story) {
      if (canUseApi() && !String(id).startsWith('s_')) {
        window.AudioHubApi.request('/stories/' + encodeURIComponent(id) + '/listen', { method: 'POST' })
          .catch(function () {});
      }
      return null;
    }

    var history = pruneListenHistory(story.listenHistory);
    history.push(Date.now());
    story.listenHistory = history;
    var metrics = computeListenMetrics(story);
    story.listenHistory = metrics.history;
    story.listenCount = metrics.listenCount;
    story.listenCount2d = metrics.listenCount2d;
    story.listenCount7d = metrics.listenCount7d;
    story.updatedAt = new Date().toISOString();
    upsertLocalStory(story);
    notifyStoriesUpdated();
    if (window.AudioHubHall && typeof window.AudioHubHall.add === 'function') {
      window.AudioHubHall.add(50);
    }

    if (canUseApi() && !String(story.id || '').startsWith('s_')) {
      window.AudioHubApi.request('/stories/' + encodeURIComponent(String(story.id)) + '/listen', { method: 'POST' })
        .then(function (result) {
          var payload = result && result.data ? result.data : result;
          if (!payload) return;
          var latest = getLocalStoryById(story.id);
          if (!latest) return;
          latest.listenCount = normalizeNumber(payload.listenCount);
          latest.listenCount2d = normalizeNumber(payload.listenCount2d);
          latest.listenCount7d = normalizeNumber(payload.listenCount7d);
          upsertLocalStory(latest);
          notifyStoriesUpdated();
        })
        .catch(function () {});
    }

    return story;
  }

  function notifyStoriesUpdated() {
    try {
      window.dispatchEvent(new CustomEvent('audiohub:stories-updated'));
    } catch (error) {
    }
  }

  function notifyStoriesSynced() {
    try {
      window.dispatchEvent(new CustomEvent('audiohub:stories-synced'));
    } catch (error) {
    }
  }

  function parseTime(value) {
    var time = Date.parse(String(value || ''));
    return isNaN(time) ? 0 : time;
  }

  function mergeStoryWithLocal(remoteEntry, localEntry) {
    if (!localEntry) {
      return remoteEntry;
    }

    var localIsDraft = String(localEntry.id || '').startsWith('s_');
    if (localIsDraft) {
      return null;
    }

    // Support both snake_case (from D1 API) and camelCase (from localStorage)
    var remoteUpdated = parseTime(remoteEntry && (remoteEntry.updatedAt || remoteEntry.updated_at));
    var localUpdated = parseTime(localEntry && localEntry.updatedAt);

    if (localUpdated > remoteUpdated) {
      return normalizeStory(localEntry);
    }

    var merged = normalizeStory(remoteEntry);
    if (!merged.coverData && localEntry.coverData) merged.coverData = String(localEntry.coverData);
    if (!merged.coverKey && localEntry.coverKey) merged.coverKey = String(localEntry.coverKey);
    if (!merged.audioKey && localEntry.audioKey) merged.audioKey = String(localEntry.audioKey);
    if (!merged.youtubeUrl && localEntry.youtubeUrl) merged.youtubeUrl = String(localEntry.youtubeUrl);
    if (!merged.youtubeId && localEntry.youtubeId) merged.youtubeId = String(localEntry.youtubeId);
    if (!merged.readingText && localEntry.readingText) merged.readingText = String(localEntry.readingText);
    // Always preserve local chapters — local is more up-to-date than API (PATCH lag)
    var remoteChCount = (merged.chapters && merged.chapters.length) || 0;
    var localChCount = (localEntry.chapters && localEntry.chapters.length) || 0;
    if (localChCount) {
      merged.chapters = localEntry.chapters;
      merged.chapterCount = localChCount;
    }

    var mergedAuthor = sanitizeAuthor(merged.author);
    var localAuthor = sanitizeAuthor(localEntry && localEntry.author);
    if (!mergedAuthor && localAuthor) {
      merged.author = localAuthor;
    }

    return merged;
  }

  /* Self-heal: upload coverData from local stories to D1 so other devices can use it */
  function uploadCoversToD1(stories) {
    stories.forEach(function (story) {
      if (!story || !story.id) return;
      if (!story.coverData) return; // need coverData to upload

      // Upload coverData to D1
      fetch('/api/stories/' + encodeURIComponent(story.id), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: story.id, cover_data: story.coverData })
      }).then(function (r) {
        if (r.ok) console.log('[stories] Uploaded cover to D1 for', story.id);
      }).catch(function () {});
    });

    // Recover covers from IndexedDB for stories that have no coverData
    if (!window.AudioHubStoryCover || typeof window.AudioHubStoryCover.get !== 'function') return;
    stories.forEach(function (story) {
      if (!story || !story.id) return;
      if (story.coverData) return; // already has coverData

      // Try coverKey first, then story ID as fallback
      var key = story.coverKey || '';
      var idbPromise;
      if (key && String(key).indexOf('c_') === 0) {
        idbPromise = window.AudioHubStoryCover.get(key);
      } else {
        idbPromise = window.AudioHubStoryCover.get(story.id);
      }

      idbPromise.then(function (blob) {
        if (!blob || !blob.size) return;
        var reader = new FileReader();
        reader.onload = function () {
          var dataUrl = reader.result;
          // Save to D1
          fetch('/api/stories/' + encodeURIComponent(story.id), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: story.id, cover_data: dataUrl })
          }).then(function (r) {
            if (r.ok) console.log('[stories] Recovered+uploaded cover to D1 for', story.id);
          }).catch(function () {});
          // Update local story with coverData
          story.coverData = dataUrl;
          writeLocalStories(readLocalStories().map(function (s) {
            return String(s.id) === String(story.id) ? story : s;
          }));
        };
        reader.readAsDataURL(blob);
      }).catch(function () {});
    });
  }

  function syncFromApi() {
    // Fetch from D1 via Cloudflare Pages Functions (Supabase deprecated)
    return syncFromApiFallback();
  }

  function syncFromApiFallback() {
    if (!canUseApi()) {
      return window.AudioHubApi.request('/stories/public', { method: 'GET' })
        .then(function (publicStories) {
          var localStories = readLocalStories();
          if (!Array.isArray(publicStories) || !publicStories.length) {
            notifyStoriesSynced();
            return localStories;
          }
          var localById = {};
          localStories.forEach(function (item) {
            if (item && item.id) localById[String(item.id)] = item;
          });

          var normalized = publicStories.map(function (story) {
            var entry = normalizeStory(story);
            var local = localById[String(entry.id)] || null;
            // Always preserve local chapters if local has more than remote
            if (local) {
              var remoteChCount = (entry.chapters && entry.chapters.length) || 0;
              var localChCount = (local.chapters && local.chapters.length) || 0;
              if (localChCount > remoteChCount) {
                entry.chapters = local.chapters;
                entry.chapterCount = localChCount;
              }
            }
            return entry;
          }).filter(Boolean).filter(function (s) { return !isDeleted(s.id); });

          // Build index of API stories by ID
          var apiIds = {};
          normalized.forEach(function (s) { apiIds[String(s.id)] = true; });

          // Keep local stories that are NOT in the API (e.g. s_ drafts not yet synced)
          var localOnly = localStories.filter(function (item) {
            if (!item || !item.id) return false;
            if (apiIds[String(item.id)]) return false;
            return true;
          });

          var merged = normalized.concat(localOnly).slice(0, 50);
          writeLocalStories(merged);
          notifyStoriesUpdated();
          notifyStoriesSynced();
          return merged;
        })
        .catch(function () {
          var localStories = readLocalStories();
          notifyStoriesSynced();
          return localStories;
        });
    }

    return window.AudioHubApi.request('/stories', { method: 'GET' })
      .then(function (remoteStories) {
        if (!Array.isArray(remoteStories)) {
          return readLocalStories();
        }

        var localStories = readLocalStories();
        var localById = {};
        localStories.forEach(function (item) {
          if (item && item.id) {
            localById[String(item.id)] = item;
          }
        });

        // Merge remote stories with local — remote wins for conflicts
        var remoteIds = {};
        var normalized = remoteStories.map(function (story) {
          var entry = normalizeStory(story);
          remoteIds[String(entry.id)] = true;
          var local = localById[String(entry.id)] || null;
          return mergeStoryWithLocal(entry, local);
        }).filter(Boolean).filter(function (s) { return !isDeleted(s.id); });

        // PRESERVE local stories not in remote response (e.g. public stories from other users)
        var localOnly = localStories.filter(function (item) {
          if (!item || !item.id) return false;
          if (remoteIds[String(item.id)]) return false;
          // Remove stale s_ drafts when backend is available
          if (canUseApi() && String(item.id).startsWith('s_')) return false;
          return true;
        });

        // Khi real login (canUseApi), bỏ local s_ drafts vì đó là demo data chưa upload thật
        var drafts = canUseApi() ? [] : localStories.filter(function (story) {
          return story && story.id && String(story.id).startsWith('s_');
        }).map(function (story) {
          return normalizeStory(story);
        });

        var mergedStories = drafts.concat(normalized).concat(localOnly).slice(0, 50);
        writeLocalStories(mergedStories);
        notifyStoriesUpdated();
        notifyStoriesSynced();
        return mergedStories;
      })
      .catch(function () {
        var fallbackStories = readLocalStories();
        notifyStoriesSynced();
        return fallbackStories;
      });
  }

  function migrateAnonymousAuthors() {
    var fallbackAuthor = resolveAuthorFallback();
    if (!fallbackAuthor) return;

    var stories = readLocalStories();
    var changed = false;
    var nextStories = stories.map(function (story) {
      var current = sanitizeAuthor(story && story.author);
      if (current) return story;
      changed = true;
      var updated = Object.assign({}, story);
      updated.author = fallbackAuthor;
      updated.updatedAt = new Date().toISOString();
      return normalizeStory(updated);
    });

    if (changed) {
      writeLocalStories(nextStories);
      notifyStoriesUpdated();
    }
  }

  function removeStory(id) {
    // ALWAYS track deleted ID — even if local removal fails (story may only exist on server)
    // This prevents syncFromApiFallback from re-adding the deleted story
    addDeletedId(id);
    var removed = removeLocalStory(id);
    // Backend DELETE with retry (Render free tier sleeps → cold start 30-60s)
    if (canUseApi() && id && !String(id).startsWith('s_')) {
      _retryDelete(id, 0);
    }
    return removed;
  }

  // Retry DELETE with wake-up for sleeping Render backend
  var _deleteRetrying = {};
  function _retryDelete(id, attempt) {
    if (_deleteRetrying[id]) return; // already retrying
    if (attempt > 0) _deleteRetrying[id] = true;
    window.AudioHubApi.request('/stories/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function () {
        delete _deleteRetrying[id];
        console.log('[stories-store] ✅ DELETE succeeded for', id, attempt > 0 ? '(attempt ' + (attempt + 1) + ')' : '');
      })
      .catch(function (err) {
        if (attempt < 2) {
          // Wake up backend, then retry after 15s
          var baseUrl = window.AudioHubApi.getBaseUrl ? window.AudioHubApi.getBaseUrl() : '/api/v1';
          var healthUrl = baseUrl.replace('/api/v1', '') + '/health';
          fetch(healthUrl, { method: 'GET', mode: 'no-cors' }).catch(function () {});
          setTimeout(function () {
            _deleteRetrying[id] = false;
            _retryDelete(id, attempt + 1);
          }, 15000);
        } else {
          delete _deleteRetrying[id];
          console.warn('[stories-store] ❌ DELETE failed after 3 attempts for', id);
        }
      });
  }

  // Force-sync ALL local stories to backend (for fixing stale localStorage)
  function forceSyncAllToApi() {
    var hasApi = !!(window.AudioHubApi && typeof window.AudioHubApi.request === 'function');
    if (!hasApi) return Promise.reject(new Error('No API client'));

    // Wake up Render free tier — it sleeps after inactivity and takes 30-60s to start
    var baseUrl = window.AudioHubApi.getBaseUrl ? window.AudioHubApi.getBaseUrl() : '/api/v1';
    var healthUrl = baseUrl.replace('/api/v1', '') + '/health';
    var maxRetries = 6;
    var attempt = 0;

    function wakeUp() {
      attempt++;
      console.log('[forceSync] Wake-up attempt ' + attempt + '/' + maxRetries + ' — pinging backend...');
      // Use no-cors to trigger wake-up without CORS blocking
      fetch(healthUrl, { method: 'GET', mode: 'no-cors' }).catch(function () {});

      // Wait 15s for Render to fully start, then check with real request
      return new Promise(function (resolve) {
        setTimeout(function () {
          console.log('[forceSync] Checking if backend is ready...');
          fetch(healthUrl, { method: 'GET' })
            .then(function (res) {
              if (res.ok) {
                console.log('[forceSync] ✅ Backend is awake and ready!');
                resolve(true);
              } else {
                retryOrGiveUp();
              }
            })
            .catch(function () {
              retryOrGiveUp();
            });

          function retryOrGiveUp() {
            if (attempt >= maxRetries) {
              console.log('[forceSync] ❌ Backend not ready after ' + maxRetries + ' attempts, proceeding anyway...');
              resolve(false);
            } else {
              console.log('[forceSync] Backend not ready, retrying in 15s...');
              resolve(wakeUp());
            }
          }
        }, 15000);
      });
    }

    return wakeUp().then(function () {
      return forceSyncAllInner();
    });
  }

  function forceSyncAllInner() {
    var localStories = readLocalStories();
    var baseUrl = window.AudioHubApi.getBaseUrl ? window.AudioHubApi.getBaseUrl() : '/api/v1';
    var healthUrl = baseUrl.replace('/api/v1', '') + '/health';
    var results = [];
    var pending = localStories.filter(function (s) { return s && s.id; });

    function keepAlive() {
      fetch(healthUrl, { method: 'GET', mode: 'no-cors' }).catch(function () {});
    }

    function syncOne(story) {
      var payload = mapStoryPayload(story);
      // Always try POST first — stories likely don't exist in backend
      return window.AudioHubApi.request('/stories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(function (created) {
        if (created && created.id) {
          var savedChapters = Array.isArray(story.chapters) ? story.chapters : [];
          removeLocalStory(story.id);
          upsertLocalStory({
            id: created.id, title: story.title, author: story.author,
            genre: story.genre, description: story.description,
            readingText: story.readingText, hashtags: story.hashtags,
            chapterTitle: story.chapterTitle, chapters: savedChapters,
            chapterCount: savedChapters.length || story.chapterCount || 0,
            visibility: story.visibility, audioStatus: story.audioStatus,
            coverData: story.coverData, coverKey: story.coverKey, audioKey: story.audioKey,
            youtubeUrl: story.youtubeUrl, youtubeId: story.youtubeId,
            createdAt: created.createdAt || created.created_at || story.createdAt,
            updatedAt: created.updatedAt || created.updated_at || new Date().toISOString()
          });
          return { oldId: story.id, newId: created.id, title: story.title, ok: true };
        }
        return { oldId: story.id, title: story.title, ok: false, reason: 'no-id' };
      }).catch(function (e) {
        var msg = String(e.message || e);
        // If 404 on POST, story might exist — try PATCH
        if (msg.indexOf('404') !== -1 || msg.indexOf('Not Found') !== -1) {
          return window.AudioHubApi.request('/stories/' + encodeURIComponent(story.id), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).then(function () {
            return { id: story.id, title: story.title, ok: true };
          }).catch(function () {
            return { oldId: story.id, title: story.title, ok: false, reason: msg };
          });
        }
        // If 502/503 — Render sleeping, wait and retry once
        if (msg.indexOf('502') !== -1 || msg.indexOf('503') !== -1 || msg.indexOf('Bad Gateway') !== -1) {
          console.log('[forceSync] Render sleeping, waiting 20s to wake...');
          keepAlive();
          return new Promise(function (resolve) {
            setTimeout(function () {
              keepAlive();
              window.AudioHubApi.request('/stories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              }).then(function (created) {
                if (created && created.id) {
                  removeLocalStory(story.id);
                  upsertLocalStory({
                    id: created.id, title: story.title, author: story.author,
                    genre: story.genre, description: story.description,
                    readingText: story.readingText, hashtags: story.hashtags,
                    chapterTitle: story.chapterTitle, chapters: Array.isArray(story.chapters) ? story.chapters : [],
                    chapterCount: (Array.isArray(story.chapters) ? story.chapters.length : 0) || story.chapterCount || 0,
                    visibility: story.visibility, audioStatus: story.audioStatus,
                    coverData: story.coverData, coverKey: story.coverKey, audioKey: story.audioKey,
                    youtubeUrl: story.youtubeUrl, youtubeId: story.youtubeId,
                    createdAt: created.createdAt || story.createdAt,
                    updatedAt: created.updatedAt || new Date().toISOString()
                  });
                  resolve({ oldId: story.id, newId: created.id, title: story.title, ok: true });
                } else {
                  resolve({ oldId: story.id, title: story.title, ok: false, reason: 'no-id-retry' });
                }
              }).catch(function (e2) {
                resolve({ oldId: story.id, title: story.title, ok: false, reason: String(e2.message || e2) });
              });
            }, 20000);
          });
        }
        return { oldId: story.id, title: story.title, ok: false, reason: msg };
      });
    }

    // Process sequentially with keepalive pings to prevent Render from sleeping
    function processNext(index) {
      if (index >= pending.length) return Promise.resolve(results);
      keepAlive();
      return syncOne(pending[index]).then(function (r) {
        results.push(r);
        if (r.ok) console.log('[forceSync] ✅ ' + (r.title || r.oldId));
        else console.log('[forceSync] ❌ ' + (r.title || r.oldId) + ': ' + r.reason);
        // Small delay between requests to keep Render alive
        return new Promise(function (resolve) {
          setTimeout(function () { resolve(processNext(index + 1)); }, 1500);
        });
      });
    }

    return processNext(0);
  }

  window.AudioHubStories = {
    read: readLocalStories,
    upsert: upsertStory,
    getById: getStoryById,
    remove: removeStory,
    sync: syncFromApi,
    trackListen: trackListen,
    clearListenHistory: clearListenHistory,
    forceSyncAll: forceSyncAllToApi
  };

  // Auto-sync local s_ stories to backend (one-time per story)
  // Track stories currently being synced to prevent duplicate POSTs
  var _syncingStories = {};
  function syncLocalStoriesToApi() {
    var hasApi = !!(window.AudioHubApi && typeof window.AudioHubApi.request === 'function');
    if (!hasApi) return;
    var localStories = readLocalStories();
    var localDrafts = localStories.filter(function (s) {
      if (!s || !s.id || !String(s.id).startsWith('s_')) return false;
      // Skip stories already being synced by upsertStory()
      if (_syncingStories[s.id]) return false;
      return true;
    });
    if (!localDrafts.length) return;

    localDrafts.forEach(function (story) {
      // Mark as syncing to prevent upsertStory() from also POSTing
      _syncingStories[story.id] = true;

      // Try to upload audio from IndexedDB first
      var audioPromise = (story.audioKey && window.AudioHubStoryAudio && typeof window.AudioHubStoryAudio.get === 'function')
        ? window.AudioHubStoryAudio.get(story.audioKey).then(function (blob) {
            return blob ? { audioKey: story.audioKey, audioBlob: blob } : { audioKey: story.audioKey };
          }).catch(function () { return { audioKey: story.audioKey }; })
        : Promise.resolve({});

      audioPromise.then(function (audioInfo) {
        var payload = mapStoryPayload(story);
        // Force D1 to generate a real CUID — don't send s_ synthetic IDs
        payload.id = null;

        window.AudioHubApi.request('/stories', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        }).then(function (created) {
          delete _syncingStories[story.id];
          if (!created || !created.id) return;

          // ── Migrate chapters from old s_ ID to new real CUID ──
          try {
            var _chapKey = 'audiohub-chapters-v1';
            var _chapStore = JSON.parse(localStorage.getItem(_chapKey) || '{}');
            var _oldChapters = Array.isArray(_chapStore[oldStoryId]) ? _chapStore[oldStoryId] : [];
            if (_oldChapters.length) {
              _chapStore[created.id] = _oldChapters;
              delete _chapStore[oldStoryId];
              localStorage.setItem(_chapKey, JSON.stringify(_chapStore));
              console.log('[sync] ✅ Chapters migrated:', oldStoryId, '→', created.id, '(' + _oldChapters.length + ' chapters)');
            }
          } catch (e) { console.warn('[sync] Chapter migration failed:', e); }

          // Upload audio blob to new story if we have one
          if (audioInfo.audioBlob) {
            var audioForm = new FormData();
            audioForm.append('audio', audioInfo.audioBlob, 'audio.mp3');
            window.AudioHubApi.request('/stories/' + encodeURIComponent(created.id) + '/audio', {
              method: 'POST',
              body: audioForm
            }).catch(function () {});
          }

          var savedChapters = Array.isArray(story.chapters) ? story.chapters : [];
          var oldStoryId = story.id;
          removeLocalStory(oldStoryId); // Remove old s_ entry
          upsertLocalStory({
            id: created.id,
            title: story.title,
            author: story.author,
            genre: story.genre,
            description: story.description,
            readingText: story.readingText,
            hashtags: story.hashtags,
            chapterTitle: story.chapterTitle,
            chapters: savedChapters,
            chapterCount: savedChapters.length || story.chapterCount || 0,
            visibility: story.visibility,
            audioStatus: story.audioStatus,
            coverData: story.coverData,
            coverKey: story.coverKey,
            audioKey: story.audioKey,
            youtubeUrl: story.youtubeUrl,
            youtubeId: story.youtubeId,
            createdAt: created.createdAt || created.created_at || story.createdAt,
            updatedAt: created.updatedAt || created.updated_at || new Date().toISOString()
          });

          // ── Update playlist entries: replace old s_ ID with real CUID ──
          try {
            var _plKey = 'audiohub-playlists-v1';
            var _plRaw = localStorage.getItem(_plKey) || '';
            var _playlists = _plRaw ? JSON.parse(_plRaw) : [];
            if (Array.isArray(_playlists)) {
              var _plChanged = false;
              _playlists.forEach(function (pl) {
                if (!pl || !Array.isArray(pl.entries)) return;
                pl.entries.forEach(function (entry) {
                  if (String(entry.key || '') === String(oldStoryId)) {
                    entry.key = created.id;
                    entry.storyId = created.id;
                    if (entry.href) {
                      entry.href = entry.href.replace('id=' + encodeURIComponent(oldStoryId), 'id=' + encodeURIComponent(created.id));
                    }
                    _plChanged = true;
                  }
                });
              });
              if (_plChanged) {
                localStorage.setItem(_plKey, JSON.stringify(_playlists));
                console.log('[sync] ✅ playlist entries updated:', oldStoryId, '→', created.id);
              }
            }
          } catch (e) { console.warn('[sync] playlist entry update failed:', e); }
        }).catch(function () {
          delete _syncingStories[story.id];
        });
      });
    });
  }

  migrateAnonymousAuthors();

  // Fetch stories from Supabase immediately (no need to wait for token)
  syncFromApi().then(function () {
    migrateAnonymousAuthors();
  });

  // Sync local drafts to Render backend in background (non-blocking, needs token + audio store)
  function trySyncLocal(attempt) {
    var hasToken = !!(window.AudioHubApi && typeof window.AudioHubApi.getToken === 'function' && window.AudioHubApi.getToken());
    var hasAudioStore = !!(window.AudioHubStoryAudio && typeof window.AudioHubStoryAudio.get === 'function');
    if ((!hasToken || !hasAudioStore) && attempt < 5) {
      setTimeout(function () { trySyncLocal(attempt + 1); }, 1000);
      return;
    }
    syncLocalStoriesToApi();
  }
  trySyncLocal(0);
})();
