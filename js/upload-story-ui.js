/**
 * upload-story-ui.js — Clean rewrite
 * Handles: story name dropdown, cover/audio/reading uploads, draft/publish, cloud sync
 */
(function () {
  var root = document.querySelector('.upload-page');
  if (!root) return;

  /* ═══════════════════════════════════════════════════════════════════
     1. DOM REFERENCES
     ═══════════════════════════════════════════════════════════════════ */
  var $ = function (sel) { return document.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); };

  var titleInput = $('[data-upload-title]');
  var descriptionInput = $('[data-upload-description]');
  var authorInput = $('[data-upload-author]');
  var genreSelect = $('[data-upload-genre]');
  var chapterInput = $('[data-upload-chapter]');
  var youtubeInput = $('[data-upload-youtube-url]');
  var visibilitySelect = $('[data-upload-visibility]');

  var coverZone = $('[data-upload-cover]');
  var coverInput = $('[data-upload-cover-input]');
  var coverLabel = $('[data-upload-cover-label]');
  var coverHint = $('[data-upload-cover-hint]');
  var coverPreview = $('[data-upload-cover-preview]');

  var audioZone = $('[data-upload-audio]');
  var audioInput = $('[data-upload-audio-input]');
  var audioLabel = $('[data-upload-audio-label]');
  var audioHint = $('[data-upload-audio-hint]');
  var audioPreview = $('[data-upload-audio-preview]');
  var audioPreviewName = $('[data-upload-audio-preview-name]');
  var audioPlayer = $('[data-upload-audio-player]');

  var readingZone = $('[data-upload-reading]');
  var readingInput = $('[data-upload-reading-input]');
  var readingLabel = $('[data-upload-reading-label]');
  var readingHint = $('[data-upload-reading-hint]');

  var previewTitle = $('[data-upload-preview-title]');
  var previewMeta = $('[data-upload-preview-meta]');
  var previewVisibility = $('[data-upload-preview-visibility]');
  var previewCover = $('[data-upload-preview-cover]');
  var titleCount = $('[data-upload-title-count]');
  var descriptionCount = $('[data-upload-description-count]');
  var mediaNote = $('[data-upload-media-note]');
  var banner = $('[data-upload-banner]');
  var publishButton = $('[data-upload-publish]');
  var draftButtons = $$('[data-upload-draft]');
  var visibilityButtons = $$('[data-upload-visibility-option]');
  var hashtagsInput = null;

  var checklist = {
    title: $('[data-check-item="title"]'),
    description: $('[data-check-item="description"]'),
    metadata: $('[data-check-item="metadata"]'),
    media: $('[data-check-item="media"]')
  };

  /* ═══════════════════════════════════════════════════════════════════
     2. STATE
     ═══════════════════════════════════════════════════════════════════ */
  var AUTH_KEY = 'audiohub-auth-profile';
  var PLAYLIST_KEY = 'audiohub-playlists-v1';

  function getMyUserId() {
    try {
      var raw = localStorage.getItem(AUTH_KEY);
      var p = raw ? JSON.parse(raw) : null;
      if (!p || !p.isLoggedIn) return null;
      return (p.id && String(p.id).trim()) || (p.email && String(p.email).trim().toLowerCase()) || null;
    } catch (e) { return null; }
  }
  // Read stories from user-scoped localStorage key (NOT the old unscoped 'audiohub-stories')
  function _readScopedStories() {
    try {
      var uid = getMyUserId();
      var key = uid ? 'audiohub-stories-' + uid : 'audiohub-stories';
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) { return []; }
  }
  var defaultCoverBg = previewCover ? getComputedStyle(previewCover).backgroundImage : '';

  var state = {
    coverReady: false,
    audioReady: false,
    coverProcessing: false,
    audioProcessing: false,
    visibility: 'Công khai',
    coverName: '',
    audioName: '',
    coverData: '',      // base64 data URL (compressed JPEG)
    coverKey: '',
    audioKey: '',
    audioFile: null,     // File object for upload after CUID
    readingText: '',
    submitting: false
  };

  var editStoryId = '';
  // -1 means not editing a specific chapter (append mode). Default used to be 0 which caused new uploads to replace chapter 0.
  var editChapterIndex = -1;
  var selectedPlaylistId = null;

  // Read URL params (with retry for SPA race)
  function readUrlParams() {
    try {
      var p = new URL(window.location.href).searchParams;
      editStoryId = p.get('id') || '';
      // If ?chapter is provided we use that index, otherwise -1 to indicate append mode
      var rawChapter = p.get('chapter');
      editChapterIndex = rawChapter !== null ? Math.max(0, parseInt(rawChapter || '0', 10)) : -1;
    } catch (e) {
      editStoryId = '';
      editChapterIndex = -1;
    }
  }
  readUrlParams();

  /* ═══════════════════════════════════════════════════════════════════
     3. UTILITIES
     ═══════════════════════════════════════════════════════════════════ */
  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function clearObjectUrl(url) {
    if (url) { try { URL.revokeObjectURL(url); } catch (e) {} }
  }

  function setFieldValue(node, value) {
    if (node) node.value = value || '';
  }

  function showBanner(message, published) {
    if (!banner) return;
    banner.textContent = message;
    banner.classList.remove('is-hidden');
    banner.classList.toggle('is-published', !!published);
  }

  /* ── YouTube helpers ── */
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
    for (var i = 0; i < patterns.length; i++) {
      var m = raw.match(patterns[i]);
      if (m && m[1]) return m[1];
    }
    return '';
  }

  function getYoutubePayload() {
    var raw = String(youtubeInput ? youtubeInput.value : '').trim();
    if (!raw) return { ok: true, url: '', id: '' };
    var id = extractYoutubeId(raw);
    if (!id) return { ok: false, url: raw, id: '', message: 'Link YouTube không hợp lệ.' };
    return { ok: true, url: 'https://www.youtube.com/watch?v=' + id, id: id };
  }

  /* ── Hashtag helpers ── */
  function normalizeHashtagToken(v) {
    return String(v || '').trim().replace(/^#+/, '').replace(/\s+/g, '-').toLowerCase();
  }

  function parseHashtags(value) {
    var tokens = String(value || '').split(/[\s,]+/g);
    var seen = {};
    return tokens.map(normalizeHashtagToken).filter(function (t) {
      if (!t || seen[t]) return false;
      seen[t] = true;
      return true;
    });
  }

  function extractHashtagsFromDescription(value) {
    var tags = [];
    var re = /#([^#\n]+)/gu;
    var m;
    while ((m = re.exec(String(value || '')))) {
      var tag = normalizeHashtagToken(String(m[1] || '').replace(/[.,;:!?]+$/g, ''));
      if (tag) tags.push(tag);
    }
    return parseHashtags(tags.join(' '));
  }

  function getCombinedHashtags() {
    var manual = parseHashtags(hashtagsInput ? hashtagsInput.value : '');
    var fromDesc = extractHashtagsFromDescription(descriptionInput ? descriptionInput.value : '');
    return parseHashtags(manual.concat(fromDesc).join(' '));
  }

  /* ── Image compression ── */
  function compressImage(file, maxWidth, quality) {
    return new Promise(function (resolve) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var canvas = document.createElement('canvas');
          var w = img.width, h = img.height;
          if (w > maxWidth) { h = Math.round(h * maxWidth / w); w = maxWidth; }
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     4. AUTHOR SYNC (from auth profile)
     ═══════════════════════════════════════════════════════════════════ */
  function readAuthProfile() {
    try {
      var raw = localStorage.getItem(AUTH_KEY);
      var p = raw ? JSON.parse(raw) : null;
      if (!p || !p.isLoggedIn) return null;
      return { name: String(p.name || '').trim(), email: String(p.email || '').trim() };
    } catch (e) { return null; }
  }

  function readHeaderName() {
    var n = $('.auth-menu__label');
    return n ? String(n.textContent || '').trim() : '';
  }

  function getAuthorFromSession() {
    var profile = readAuthProfile();
    if (profile && profile.name) return profile.name;
    return readHeaderName();
  }

  function getEffectiveAuthorName() {
    var name = getAuthorFromSession();
    if (name) return name;
    var profile = readAuthProfile();
    var email = profile && profile.email ? String(profile.email).trim() : '';
    if (email && email.indexOf('@') > 0) return email.split('@')[0];
    var raw = authorInput ? String(authorInput.value || '').trim() : '';
    if (raw) return raw;
    return 'Anh Ngọc';
  }

  function syncAuthorInput() {
    if (!authorInput) return '';
    var name = getAuthorFromSession();
    authorInput.value = name || '';
    authorInput.readOnly = true;
    authorInput.setAttribute('readonly', 'readonly');
    authorInput.placeholder = 'Tự động theo tài khoản đăng nhập';
    return name;
  }

  syncAuthorInput();
  setTimeout(syncAuthorInput, 0);
  setTimeout(syncAuthorInput, 300);
  setTimeout(syncAuthorInput, 1000);
  window.addEventListener('focus', syncAuthorInput);
  window.addEventListener('pageshow', syncAuthorInput);
  window.addEventListener('audiohub:auth-updated', syncAuthorInput);
  window.addEventListener('storage', function (e) {
    if (e && e.key && e.key !== AUTH_KEY) return;
    syncAuthorInput();
  });

  if (authorInput) {
    authorInput.addEventListener('beforeinput', function (e) { e.preventDefault(); });
    authorInput.addEventListener('input', syncAuthorInput);
    authorInput.addEventListener('paste', function (e) { e.preventDefault(); });
    authorInput.addEventListener('drop', function (e) { e.preventDefault(); });
  }

  // Try fetching author from API if not set
  if (window.AudioHubApi && typeof window.AudioHubApi.getToken === 'function' && typeof window.AudioHubApi.request === 'function') {
    var token = window.AudioHubApi.getToken();
    if (token && !getAuthorFromSession()) {
      window.AudioHubApi.request('/auth/me', { method: 'GET' }).then(function (user) {
        var name = user && user.displayName ? String(user.displayName).trim() : '';
        var email = user && user.email ? String(user.email).trim() : '';
        if (!name) return;
        try {
          localStorage.setItem(AUTH_KEY, JSON.stringify({ isLoggedIn: true, name: name, email: email }));
        } catch (e) {}
        syncAuthorInput();
        render();
      }).catch(function () {});
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     5. STORY NAME DROPDOWN
     ═══════════════════════════════════════════════════════════════════ */
  (function initStoryNameSelect() {
    var selectRoot = $('[data-story-name-select]');
    var trigger = $('[data-story-name-trigger]');
    var nameInput = $('[data-story-name-input]');
    var menu = $('[data-story-name-menu]');
    var list = $('[data-story-name-list]');
    var searchInput = $('[data-story-name-search]');
    var addBtn = $('[data-story-name-add]');
    if (!selectRoot || !trigger || !menu || !list) return;

    var allStories = [];
    var isAddingNew = false;
    var _uid = getMyUserId();

    function fetchAllStories() {
      var plMap = {}, storyMap = {}, plOrder = [], storyOrder = [];

      // Playlists from localStorage (only this user's playlists)
      try {
        var plRaw = localStorage.getItem(PLAYLIST_KEY) || '';
        var playlists = plRaw ? JSON.parse(plRaw) : [];
        if (Array.isArray(playlists)) {
          playlists.forEach(function (pl) {
            if (!pl || !pl.name) return;
            // Filter by userId when logged in
            if (_uid) {
              var plUserId = String(pl.userId || pl.user_id || '').trim().toLowerCase();
              var plCreatedBy = String(pl.createdBy || pl.created_by || '').trim().toLowerCase();
              // Include if: has matching userId, or createdBy matches user name, or no userId set (legacy)
              var myName = '';
              try { var _ap = JSON.parse(localStorage.getItem(AUTH_KEY) || '{}'); myName = String(_ap.name || '').trim().toLowerCase(); } catch (e) {}
              if (plUserId && plUserId !== _uid) return;
              if (!plUserId && plCreatedBy && myName && plCreatedBy !== myName && plCreatedBy !== 'admin') return;
            }
            var key = String(pl.name || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
            if (plMap[key]) return;
            plMap[key] = { id: pl.id || ('pl_' + pl.name), title: pl.name, entries: pl.entries || [], _playlistObj: pl };
            plOrder.push(key);
          });
        }
      } catch (e) {}

      function mergeAndRender() {
        var items = [], seen = {};
        console.log('[upload] mergeAndRender — storyMap keys:', Object.keys(storyMap).length, '| plMap keys:', Object.keys(plMap).length, '| uid:', _uid);
        plOrder.forEach(function (key) {
          var pl = plMap[key], st = storyMap[key];
          items.push({
            id: pl.id, title: pl.title, _isPlaylist: true, _entries: pl.entries,
            genre: st ? (st.genre || '') : '', description: st ? (st.description || '') : '',
            author: st ? (st.author || 'Ẩn danh') : 'Admin', _storyData: st || null
          });
          seen[key] = true;
        });
        storyOrder.forEach(function (key) {
          if (seen[key]) return;
          var st = storyMap[key];
          items.push({
            id: st.id, title: st.title, author: st.author || 'Ẩn danh',
            genre: st.genre || '', description: st.description || '',
            hashtags: st.hashtags || '', coverKey: st.cover_key || st.coverKey || '',
            coverData: st.coverData || '', audioKey: st.audioKey || '',
            _isPlaylist: false, _story: st
          });
        });
        allStories = items;
        renderList(searchInput ? searchInput.value : '');
      }

      // Fetch from D1 API (only this user's stories) — use AudioHubApi for Authorization header
      _uid = getMyUserId();
      var _apiPath = _uid ? '/stories?user_id=' + encodeURIComponent(_uid) : '/stories';
      var _apiCall = (window.AudioHubApi && typeof window.AudioHubApi.request === 'function')
        ? window.AudioHubApi.request(_apiPath, { method: 'GET' })
        : fetch('/api' + _apiPath).then(function (r) { return r.ok ? r.json() : []; });
      _apiCall
        .then(function (d1) {
          if (!Array.isArray(d1)) return;
          console.log('[upload] API stories for user ' + (_uid || 'NONE') + ':', d1.length, 'stories');
          d1.forEach(function (s) {
            if (!s || !s.id || !s.title) return;
            var key = String(s.title || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
            if (storyMap[key]) return;
            storyMap[key] = s;
            storyOrder.push(key);
          });
          mergeAndRender();
        })
        .catch(function () { mergeAndRender(); });

      // Local stories — MERGE with API stories (preserves hashtags, coverData not in API)
      try {
        if (window.AudioHubStories && typeof window.AudioHubStories.read === 'function') {
          (window.AudioHubStories.read() || []).forEach(function (s) {
            if (!s || !s.id || !s.title) return;
            // When logged in, only include stories belonging to this user
            if (_uid) {
              var _sUserId = String(s.userId || s.user_id || '').trim().toLowerCase();
              if (String(s.id).startsWith('s_')) { /* local draft — always include */ }
              else if (!_sUserId) return; // legacy story without user_id — exclude
              else if (_sUserId !== _uid) return; // different user's story — exclude
            }
            var key = String(s.title || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
            if (storyMap[key]) {
              // Merge: fill missing fields from localStorage (API doesn't have hashtags)
              var existing = storyMap[key];
              if (!existing.hashtags && s.hashtags) existing.hashtags = s.hashtags;
              if (!existing.coverData && s.coverData) existing.coverData = s.coverData;
              if (!existing.audioKey && s.audioKey) existing.audioKey = s.audioKey;
              if (!existing.readingText && s.readingText) existing.readingText = s.readingText;
              return;
            }
            storyMap[key] = s;
            storyOrder.push(key);
          });
        }
      } catch (e) {}

      // Cleanup: remove orphaned stories from localStorage (no userId, not local draft)
      // This ensures old synced data from other users doesn't persist
      if (_uid && window.AudioHubStories && typeof window.AudioHubStories.read === 'function') {
        try {
          var _allLocal = window.AudioHubStories.read() || [];
          var _orphaned = _allLocal.filter(function (s) {
            if (!s || !s.id) return false;
            if (String(s.id).startsWith('s_')) return false; // keep local drafts
            var _sUid = String(s.userId || s.user_id || '').trim().toLowerCase();
            return !_sUid; // orphaned: no userId
          });
          if (_orphaned.length) {
            _orphaned.forEach(function (s) {
              if (window.AudioHubStories && typeof window.AudioHubStories.remove === 'function') {
                window.AudioHubStories.remove(s.id);
              }
            });
            console.log('[upload] Cleaned up', _orphaned.length, 'orphaned stories from localStorage');
          }
        } catch (e) {}
      }

      mergeAndRender();
    }

    function renderList(query) {
      var q = String(query || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
      var filtered = allStories.filter(function (s) {
        if (!q) return true;
        var t = String(s.title || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
        var a = String(s.author || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
        return t.indexOf(q) >= 0 || a.indexOf(q) >= 0;
      });
      filtered.sort(function (a, b) {
        return (Date.parse(b.createdAt || b.updatedAt || 0) || 0) - (Date.parse(a.createdAt || a.updatedAt || 0) || 0);
      });
      var html = '';
      filtered.forEach(function (s) {
        var title = escapeHtml(s.title);
        var genre = escapeHtml(s.genre || '');
        var tag = (s._isPlaylist && !s._storyData) ? '<span class="story-name-select__item-tag story-name-select__item-tag--playlist">Truyện</span>' : '';
        html += '<button type="button" class="story-name-select__item" data-story-id="' + escapeHtml(s.id) + '" data-story-title="' + title + '" data-is-playlist="' + (s._isPlaylist ? '1' : '0') + '">' +
          '<span class="story-name-select__item-title">' + title + '</span>' +
          '<span class="story-name-select__item-meta">' + tag + (genre ? '<span class="story-name-select__item-genre">' + genre + '</span>' : '') + '</span>' +
          '</button>';
      });
      if (!filtered.length && !isAddingNew) {
        html = '<div class="story-name-select__empty">Không tìm thấy truyện</div>';
      }
      list.innerHTML = html;
    }

    function autoFillFromStoryData(storyData) {
      if (!storyData) return;
      if (genreSelect && storyData.genre) genreSelect.value = storyData.genre;
      if (descriptionInput && storyData.description) descriptionInput.value = storyData.description;
      var hashtagEl = $('[data-upload-hashtags]');
      if (hashtagEl) {
        var tags = storyData.hashtags || storyData.tags || '';
        hashtagEl.value = Array.isArray(tags) ? tags.join(', ') : (tags || '');
      }
      if (chapterInput) chapterInput.value = '';

      // Load cover — prefer base64 data URL if available (fast, no IDB lookup needed)
      if (storyData.coverData && String(storyData.coverData).indexOf('data:') === 0) {
        if (coverPreview) coverPreview.innerHTML = '<img src="' + storyData.coverData + '" alt="Ảnh bìa" />';
        if (coverZone) coverZone.classList.add('is-ready');
        if (coverLabel) coverLabel.textContent = 'Đã có ảnh bìa';
        if (coverHint) coverHint.textContent = 'Chọn file khác để thay đổi';
        state.coverReady = true;
        state.coverData = storyData.coverData;
        state.coverName = 'cover-' + storyData.id + '.jpg';
      }

      // Load cover image from IDB — try all possible key variants (skip if coverData already loaded)
      if (!state.coverReady && storyData.id && coverZone && window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function') {
        var sid = String(storyData.id);
        var tryKeys = [];
        // Priority: coverKey (c_ prefix) > s_ prefix > raw id > stripped id
        if (storyData.coverKey) tryKeys.push(storyData.coverKey);
        if (!sid.startsWith('s_')) {
          tryKeys.push('s_' + sid);
          tryKeys.push(sid);
        } else {
          tryKeys.push(sid);
          tryKeys.push(sid.substring(2)); // strip s_ prefix
        }

        // Fallback: find old s_ prefix story with matching title (pre-CUID migration)
        if (!sid.startsWith('s_') && storyData.title) {
          try {
            var _nfcTit = function (s) { return String(s || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
            var _normTitle = _nfcTit(storyData.title);
            var rawStories = _readScopedStories();
            (rawStories || []).forEach(function (s) {
              if (s && s.id && String(s.id).startsWith('s_') && _nfcTit(s.title) === _normTitle) {
                if (tryKeys.indexOf(String(s.id)) === -1) tryKeys.push(String(s.id));
              }
            });
          } catch (e) {}
        }

        (function tryLoad(idx) {
          if (idx >= tryKeys.length) return;
          window.AudioHubStoryCover.get(tryKeys[idx]).then(function (blob) {
            if (!blob || !blob.size) { tryLoad(idx + 1); return; }
            var url = URL.createObjectURL(blob);
            if (coverPreview) coverPreview.innerHTML = '<img src="' + url + '" alt="Ảnh bìa" />';
            coverZone.classList.add('is-ready');
            if (coverLabel) coverLabel.textContent = 'Đã có ảnh bìa';
            if (coverHint) coverHint.textContent = 'Chọn file khác để thay đổi';
            state.coverReady = true;
            state.coverName = 'cover-' + storyData.id + '.jpg';
            var reader = new FileReader();
            reader.onload = function () { state.coverData = reader.result; };
            reader.readAsDataURL(blob);
          }).catch(function () { tryLoad(idx + 1); });
        })(0);
      }
    }

    function clearFormFields() {
      if (genreSelect) genreSelect.value = '';
      if (descriptionInput) descriptionInput.value = '';
      if (chapterInput) chapterInput.value = '';
      if (coverZone) {
        coverZone.classList.remove('is-ready');
        if (coverLabel) coverLabel.textContent = 'Thêm ảnh bìa';
        if (coverHint) coverHint.textContent = 'PNG/JPG • Tối đa 5MB';
      }
      if (coverPreview) coverPreview.innerHTML = '<i class="fa-regular fa-image upload-cover-zone__placeholder-icon"></i>';
      state.coverReady = false;
      state.coverName = '';
    }

    function selectStory(story) {
      if (!story) return;
      isAddingNew = false;
      selectedPlaylistId = story._isPlaylist ? story.id : null;

      // ── Resolve the REAL story CUID (NOT playlist ID!) ──
      function _normTxt(s) {
        return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
      }

      editStoryId = '';
      if (story._isPlaylist) {
        // Playlist: try multiple sources to find real story CUID
        var entries = story._entries || [];
        var entryKey = (entries.length && entries[0] && entries[0].key) ? String(entries[0].key) : '';

        // 1. Try _storyData (matched by title from API/localStorage)
        if (story._storyData && story._storyData.id && !String(story._storyData.id).startsWith('pl-')) {
          editStoryId = String(story._storyData.id);
        }
        // 2. Try entries[0].key if it's a real CUID (not pl- or s_pl-)
        if (!editStoryId && entryKey && entryKey.indexOf('pl-') !== 0) {
          editStoryId = entryKey;
        }
        // 3. Search audiohub-stories raw localStorage for matching title with real CUID
        if (!editStoryId) {
          try {
            var normTitle = _normTxt(story.title);
            var rawStories = _readScopedStories();
            if (Array.isArray(rawStories)) {
              // Prefer entries with real CUID (non-pl-, non-s_)
              var realCuidMatch = rawStories.find(function (s) {
                return s && s.id && !String(s.id).startsWith('pl-') && !String(s.id).startsWith('s_pl-') && !String(s.id).startsWith('s_') &&
                  _normTxt(s.title) === normTitle;
              });
              if (realCuidMatch) {
                editStoryId = String(realCuidMatch.id);
                console.log('[upload] 🔍 Found real CUID from audiohub-stories:', editStoryId, '|', realCuidMatch.title);
              }
            }
          } catch (e) {}
        }
        // 4. Search audiohub-chapters-v1 for real CUID key
        if (!editStoryId) {
          try {
            var _chStore = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
            var _realKeys = Object.keys(_chStore).filter(function (k) {
              return k && !k.startsWith('pl-') && !k.startsWith('s_pl-') && !k.startsWith('s_') &&
                Array.isArray(_chStore[k]) && _chStore[k].length > 0;
            });
            if (_realKeys.length === 1) {
              editStoryId = _realKeys[0];
              console.log('[upload] 🔍 Found real CUID from chapters store:', editStoryId);
            } else if (_realKeys.length > 1) {
              editStoryId = _realKeys[_realKeys.length - 1];
              console.log('[upload] 🔍 Using latest real CUID from chapters:', editStoryId);
            }
          } catch (e) {}
        }
        // 5. Last resort: use entryKey even if it's pl-
        if (!editStoryId && entryKey) {
          editStoryId = entryKey;
        }
        console.log('[upload] 📖 selectStory (PLAYLIST) — playlistId:', story.id, '| resolved editStoryId:', editStoryId, '| entryKey:', entryKey);
      } else {
        // Regular story
        var realId = story.id || '';
        if (realId && !String(realId).startsWith('s_')) {
          editStoryId = realId;
        } else if (story._storyData && story._storyData.id) {
          editStoryId = String(story._storyData.id);
        }
      }
      editChapterIndex = -1; // Always append new chapter when selecting from dropdown

      // Persist editStoryId + story meta across page reloads (SPA redirect)
      try {
        if (editStoryId && !String(editStoryId).startsWith('pl-')) {
          sessionStorage.setItem('audiohub-editStoryId', editStoryId);
          sessionStorage.setItem('audiohub-editStoryTitle', story.title || '');
          sessionStorage.setItem('audiohub-editStoryAuthor', story.author || '');
          // Save hashtags + cover for form restoration
          var _tags = story.hashtags || story.tags || '';
          if (hashtagsInput && !hashtagsInput.value) hashtagsInput.value = Array.isArray(_tags) ? _tags.join(', ') : (_tags || '');
          if (hashtagsInput && hashtagsInput.value) sessionStorage.setItem('audiohub-editHashtags', hashtagsInput.value);
          if (story.coverKey) sessionStorage.setItem('audiohub-editCoverKey', story.coverKey);
          if (story.coverData && String(story.coverData).indexOf('data:') === 0) sessionStorage.setItem('audiohub-editCoverData', story.coverData);
        }
      } catch (e) {}

      // Pre-load existing chapters from audiohub-chapters-v1 for diagnostics
      if (editStoryId && !String(editStoryId).startsWith('pl-')) {
        try {
          var _cs = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
          var _existing = Array.isArray(_cs[editStoryId]) ? _cs[editStoryId] : [];
          console.log('[upload] 📖 selectStory — editStoryId:', editStoryId, '| existing chapters:', _existing.length, _existing.map(function(c) { return c.title; }));
        } catch (e) {}
      }

      if (titleInput) titleInput.value = story.title || '';

      if (!story._isPlaylist) {
        autoFillFromStoryData(story);
      } else if (story._storyData) {
        autoFillFromStoryData(story._storyData);
      } else {
        clearFormFields();
      }

      trigger.innerHTML = escapeHtml(story.title) + ' <i class="fa-solid fa-chevron-down"></i>';
      trigger.classList.add('is-selected');
      menu.classList.add('is-hidden');
      trigger.setAttribute('aria-expanded', 'false');
      render();
    }

    function startAddNew() {
      isAddingNew = true;
      selectedPlaylistId = null;
      trigger.classList.add('is-hidden');
      if (nameInput) { nameInput.classList.remove('is-hidden'); nameInput.value = ''; nameInput.focus(); }
      menu.classList.add('is-hidden');
      trigger.setAttribute('aria-expanded', 'false');
    }

    function confirmAddNew() {
      var val = nameInput ? nameInput.value.trim() : '';
      if (!val) return;
      var newPlaylistId = 'pl-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now();
      try {
        var raw = localStorage.getItem(PLAYLIST_KEY) || '';
        var playlists = raw ? JSON.parse(raw) : [];
        if (!Array.isArray(playlists)) playlists = [];
        playlists.push({ id: newPlaylistId, name: val, entries: [], createdBy: 'admin', userId: _uid || '', createdAt: new Date().toISOString() });
        localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlists));
        syncPlaylistsToStorage();
      } catch (e) {}

      selectedPlaylistId = newPlaylistId;
      if (titleInput) titleInput.value = val;
      trigger.innerHTML = escapeHtml(val) + ' <i class="fa-solid fa-chevron-down"></i>';
      trigger.classList.add('is-selected');
      if (nameInput) nameInput.classList.add('is-hidden');
      trigger.classList.remove('is-hidden');
      isAddingNew = false;
      fetchAllStories();
    }

    function cancelAddNew() {
      if (nameInput) nameInput.classList.add('is-hidden');
      trigger.classList.remove('is-hidden');
      isAddingNew = false;
    }

    trigger.addEventListener('click', function () {
      var hidden = menu.classList.toggle('is-hidden');
      trigger.setAttribute('aria-expanded', hidden ? 'false' : 'true');
      if (!hidden) {
        isAddingNew = false;
        if (searchInput) { searchInput.value = ''; searchInput.focus(); }
        renderList('');
      }
    });

    if (searchInput) searchInput.addEventListener('input', function () { renderList(searchInput.value); });

    if (nameInput) {
      nameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); confirmAddNew(); }
        else if (e.key === 'Escape') cancelAddNew();
      });
      nameInput.addEventListener('blur', function () {
        setTimeout(function () {
          if (isAddingNew && nameInput && nameInput.value.trim()) confirmAddNew();
          else if (isAddingNew) cancelAddNew();
        }, 150);
      });
    }

    document.addEventListener('click', function (e) {
      if (!selectRoot.contains(e.target)) {
        menu.classList.add('is-hidden');
        trigger.setAttribute('aria-expanded', 'false');
      }
    });

    list.addEventListener('click', function (e) {
      var btn = e.target.closest('.story-name-select__item');
      if (!btn) return;
      var id = btn.getAttribute('data-story-id');
      var story = allStories.find(function (s) { return String(s.id) === id; });
      if (story) selectStory(story);
    });

    if (addBtn) addBtn.addEventListener('click', startAddNew);

    fetchAllStories();
    syncPlaylistsToStorage();

    // Re-fetch when auth profile is ready (fixes timing: auth hydrates async after page load)
    window.addEventListener('audiohub:auth-updated', function () {
      var newUid = getMyUserId();
      console.log('[upload] auth-updated — uid:', newUid, '(was:', _uid, ')');
      _uid = newUid;
      fetchAllStories();
    });
    // Also re-fetch when dropdown opens (ensures fresh data after auth is ready)
    trigger.addEventListener('click', function () {
      if (!menu.classList.contains('is-hidden')) return; // already open
      var currentUid = getMyUserId();
      if (currentUid && currentUid !== _uid) {
        _uid = currentUid;
        fetchAllStories();
      }
    });
  })();

  /* ═══════════════════════════════════════════════════════════════════
     6. PLAYLIST SYNC TO D1
     ═══════════════════════════════════════════════════════════════════ */
  function syncPlaylistsToStorage(specificPlaylistId) {
    try {
      var raw = localStorage.getItem(PLAYLIST_KEY) || '';
      var playlists = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(playlists)) return;
      playlists.forEach(function (pl) {
        if (specificPlaylistId && pl.id !== specificPlaylistId) return;
        fetch('/api/playlists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: pl.id, name: pl.name, items: JSON.stringify(pl.entries || []) })
        }).then(function (r) {
          if (r.ok) console.log('[upload] Playlist synced:', pl.name);
        }).catch(function () {});
      });
    } catch (e) {}
  }

  /* ═══════════════════════════════════════════════════════════════════
     7. HASHTAG INPUT (auto-create if not in HTML)
     ═══════════════════════════════════════════════════════════════════ */
  function ensureHashtagInput() {
    if (!descriptionInput || hashtagsInput) return;
    var field = document.createElement('label');
    field.className = 'upload-field';
    field.innerHTML = 'Hashtag (nhập tay)<input type="text" data-upload-hashtags placeholder="#aothatday, #satthu" />';
    var parent = descriptionInput.parentElement;
    if (!parent || !parent.parentElement) return;
    parent.parentElement.insertBefore(field, parent.nextSibling);
  }
  ensureHashtagInput();
  hashtagsInput = $('[data-upload-hashtags]');

  /* ═══════════════════════════════════════════════════════════════════
     8. RENDERING
     ═══════════════════════════════════════════════════════════════════ */
  function render() {
    var title = titleInput ? titleInput.value.trim() : '';
    var description = descriptionInput ? descriptionInput.value.trim() : '';
    var author = getEffectiveAuthorName();
    var genre = genreSelect ? genreSelect.value : '';

    if (authorInput && authorInput.value !== author) authorInput.value = author;
    syncAuthorInput();

    if (titleCount && titleInput) titleCount.textContent = titleInput.value.length + ' / 120';
    if (descriptionCount && descriptionInput) descriptionCount.textContent = descriptionInput.value.length + ' / 5000';
    if (previewTitle) previewTitle.textContent = title || 'Tiêu đề truyện của bạn sẽ hiện ở đây';
    if (previewMeta) previewMeta.textContent = [author || 'Tác giả', genre || 'Thể loại', state.visibility].join(' · ');
    if (previewVisibility) previewVisibility.textContent = state.visibility;
    if (previewCover) previewCover.classList.toggle('is-ready', state.coverReady);

    setChecklistItem(checklist.title, !!title);
    setChecklistItem(checklist.description, description.length >= 30);
    setChecklistItem(checklist.metadata, !!author && !!genre);
    setChecklistItem(checklist.media, state.coverReady && state.audioReady);
    syncVisibilityButtons();
    updateMediaNote();
  }

  function setChecklistItem(node, done) {
    if (!node) return;
    var icon = node.querySelector('i');
    node.classList.toggle('is-done', done);
    if (icon) icon.className = done ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle';
  }

  function syncVisibilityButtons() {
    visibilityButtons.forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-upload-visibility-option') === state.visibility);
    });
  }

  function updateMediaNote() {
    if (!mediaNote) return;
    mediaNote.classList.remove('is-success', 'is-partial', 'is-empty');
    if (state.coverReady && state.audioReady) {
      mediaNote.textContent = 'Đã chọn ảnh bìa và file audio từ máy của bạn.';
      mediaNote.classList.add('is-success');
    } else if (state.coverReady || state.audioReady) {
      mediaNote.textContent = state.coverReady ? 'Đã có ảnh bìa, còn thiếu file audio.' : 'Đã có file audio, còn thiếu ảnh bìa.';
      mediaNote.classList.add('is-partial');
    } else {
      mediaNote.textContent = 'Chưa chọn ảnh bìa và file audio.';
      mediaNote.classList.add('is-empty');
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     9. FILE UPLOAD HANDLERS
     ═══════════════════════════════════════════════════════════════════ */
  var coverObjectUrl = '';
  var audioObjectUrl = '';

  // ── Cover ──
  if (coverInput) {
    coverInput.addEventListener('change', function () {
      var file = coverInput.files && coverInput.files[0];
      if (!file) {
        state.coverReady = false;
        state.coverName = '';
        if (coverZone) coverZone.classList.remove('is-ready');
        if (coverLabel) coverLabel.textContent = 'Thêm ảnh bìa';
        if (coverHint) coverHint.textContent = 'PNG/JPG • Tối đa 5MB';
        if (previewCover) {
          clearObjectUrl(coverObjectUrl);
          coverObjectUrl = '';
          previewCover.style.backgroundImage = defaultCoverBg;
          previewCover.classList.remove('has-uploaded-image');
        }
        if (coverPreview) coverPreview.innerHTML = '<i class="fa-regular fa-image upload-cover-zone__placeholder-icon"></i>';
        render();
        return;
      }

      state.coverReady = false;
      state.coverName = file.name;
      state.coverData = '';
      state.coverKey = '';
      if (coverLabel) coverLabel.textContent = 'Đang xử lý ảnh…';
      if (coverZone) coverZone.classList.add('is-processing');

      clearObjectUrl(coverObjectUrl);
      coverObjectUrl = URL.createObjectURL(file);
      if (coverPreview) coverPreview.innerHTML = '<img src="' + coverObjectUrl + '" alt="Ảnh bìa" />';

      compressImage(file, 800, 0.7).then(function (dataUrl) {
        state.coverData = dataUrl;
        try { sessionStorage.setItem('audiohub-editCoverData', dataUrl); } catch (e) {}
        state.coverReady = true;
        if (coverZone) coverZone.classList.remove('is-processing');
        if (previewCover) {
          previewCover.style.backgroundImage = 'url("' + coverObjectUrl + '")';
          previewCover.classList.add('has-uploaded-image');
        }
        if (coverLabel) coverLabel.textContent = 'Ảnh bìa đã chọn';
        render();
      });
      try { coverInput.value = ''; } catch (e) {}
    });
  }

  // ── Audio ──
  function stopAudio() {
    if (audioPlayer) { try { audioPlayer.pause(); audioPlayer.currentTime = 0; } catch (e) {} }
  }

  function setAudioPreviewDisabled(disabled) {
    if (audioPreview) audioPreview.classList.toggle('is-disabled', disabled);
    if (audioPlayer) { audioPlayer.controls = !disabled; }
  }

  setAudioPreviewDisabled(true);

  if (audioInput) {
    audioInput.addEventListener('change', function () {
      var file = audioInput.files && audioInput.files[0];
      if (!file) {
        state.audioReady = false;
        state.audioName = '';
        state.audioFile = null;
        if (audioZone) audioZone.classList.remove('is-ready');
        if (audioLabel) audioLabel.textContent = 'Thêm file audio demo';
        if (audioHint) audioHint.textContent = 'MP3/WAV • Tối đa 50MB';
        stopAudio();
        clearObjectUrl(audioObjectUrl);
        audioObjectUrl = '';
        if (audioPlayer) { audioPlayer.removeAttribute('src'); audioPlayer.load(); }
        if (audioPreviewName) audioPreviewName.textContent = 'Chưa chọn file audio';
        setAudioPreviewDisabled(true);
        render();
        return;
      }

      state.audioReady = false;
      state.audioName = file.name;
      state.audioFile = file;
      state.audioKey = '';
      if (audioZone) audioZone.classList.add('is-processing');
      if (audioLabel) audioLabel.textContent = 'Đang xử lý audio…';

      stopAudio();
      clearObjectUrl(audioObjectUrl);
      audioObjectUrl = URL.createObjectURL(file);

      // Save to IndexedDB
      var storePromise = (window.AudioHubStoryAudio && typeof window.AudioHubStoryAudio.put === 'function')
        ? window.AudioHubStoryAudio.put(file)
        : Promise.reject(new Error('missing audio store'));

      storePromise.then(function (audioKey) {
        state.audioKey = audioKey;
      }).catch(function () {
        state.audioKey = '';
      });

      // Show preview after delay (let IndexedDB save)
      setTimeout(function () {
        state.audioReady = true;
        if (audioZone) audioZone.classList.remove('is-processing');
        if (audioLabel) audioLabel.textContent = state.audioKey ? 'Audio đã chọn' : 'Audio đã chọn (chưa lưu)';
        if (audioPreviewName) audioPreviewName.textContent = file.name;
        if (audioPlayer) { audioPlayer.src = audioObjectUrl; audioPlayer.load(); }
        setAudioPreviewDisabled(false);
        render();
      }, 1100);

      try { audioInput.value = ''; } catch (e) {}
    });
  }

  // ── Reading text (.txt/.md) ──
  if (readingInput) {
    readingInput.addEventListener('change', function () {
      var file = readingInput.files && readingInput.files[0];
      if (!file) {
        state.readingText = '';
        if (readingLabel) readingLabel.textContent = 'Thêm file truyện chữ';
        if (readingHint) readingHint.textContent = 'TXT/MD • Tối đa 2MB';
        render();
        return;
      }

      var isValidType = /text\/plain|text\/markdown/.test(String(file.type || '')) || /\.(txt|md)$/i.test(String(file.name || ''));
      if (!isValidType) {
        showBanner('File truyện chữ chỉ hỗ trợ .txt hoặc .md', false);
        try { readingInput.value = ''; } catch (e) {}
        return;
      }
      if (typeof file.size === 'number' && file.size > 2 * 1024 * 1024) {
        showBanner('File truyện chữ vượt quá 2MB.', false);
        try { readingInput.value = ''; } catch (e) {}
        return;
      }

      var reader = new FileReader();
      reader.onload = function () {
        state.readingText = typeof reader.result === 'string' ? reader.result : '';
        if (readingLabel) readingLabel.textContent = 'Đã tải truyện chữ';
        if (readingHint) readingHint.innerHTML = 'Tệp: <span class="upload-dropzone__filename">' + escapeHtml(file.name) + '</span>';
        if (readingZone) readingZone.classList.add('is-ready');
        render();
        console.log('[upload] ✅ readingText loaded:', state.readingText.length, 'chars');
      };
      reader.onerror = function () { showBanner('Không thể đọc file truyện chữ.', false); };
      reader.readAsText(file, 'utf-8');
      try { readingInput.value = ''; } catch (e) {}
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     10. EVENT LISTENERS
     ═══════════════════════════════════════════════════════════════════ */
  if (titleInput) titleInput.addEventListener('input', render);
  if (descriptionInput) descriptionInput.addEventListener('input', render);
  if (authorInput) authorInput.addEventListener('input', render);
  if (genreSelect) genreSelect.addEventListener('change', render);
  if (chapterInput) chapterInput.addEventListener('input', render);
  if (youtubeInput) youtubeInput.addEventListener('input', render);
  if (hashtagsInput) hashtagsInput.addEventListener('input', function () {
    try { sessionStorage.setItem('audiohub-editHashtags', hashtagsInput.value); } catch (e) {}
    render();
  });

  if (visibilitySelect) {
    visibilitySelect.addEventListener('change', function () {
      state.visibility = visibilitySelect.value;
      render();
    });
  }

  visibilityButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.visibility = btn.getAttribute('data-upload-visibility-option') || 'Công khai';
      if (visibilitySelect) visibilitySelect.value = state.visibility;
      render();
    });
  });

  if (!visibilitySelect && visibilityButtons.length) {
    var def = visibilityButtons.find(function (b) { return b.classList.contains('is-active'); }) || visibilityButtons[0];
    if (def) state.visibility = def.getAttribute('data-upload-visibility-option') || 'Công khai';
  }

  /* ═══════════════════════════════════════════════════════════════════
     11. BUILD PAYLOAD
     ═══════════════════════════════════════════════════════════════════ */
  function buildStoryPayload(forcePublished, forceDraft) {
    var ytPayload = getYoutubePayload();
    if (!ytPayload.ok) return { ok: false, message: ytPayload.message || 'Link YouTube không hợp lệ.' };

    var resolvedAuthor = getEffectiveAuthorName();
    if (!resolvedAuthor) return { ok: false, message: 'Vui lòng nhập tên tác giả.' };

    // Get current story ID (from URL or state)
    var currentId = editStoryId || '';
    if (!currentId) {
      try {
        var idFromUrl = new URL(window.location.href).searchParams.get('id') || '';
        if (idFromUrl) currentId = idFromUrl;
      } catch (e) {}
    }

    return {
      ok: true,
      payload: {
        id: currentId || undefined,
        title: titleInput ? titleInput.value.trim() : '',
        description: descriptionInput ? descriptionInput.value.trim() : '',
        author: resolvedAuthor,
        channelName: resolvedAuthor,
        genre: genreSelect ? genreSelect.value : '',
        chapterTitle: chapterInput ? chapterInput.value.trim() : '',
        youtubeUrl: ytPayload.url,
        youtubeId: ytPayload.id,
        visibility: forcePublished ? 'Công khai' : (forceDraft ? 'Riêng tư' : (state.visibility || 'Công khai')),
        coverKey: state.coverKey || '',
        coverData: state.coverData || '',
        audioKey: state.audioKey || '',
        readingText: state.readingText || '',
        hashtags: getCombinedHashtags(),
        userId: getMyUserId() || ''
      }
    };
  }

  /* ═══════════════════════════════════════════════════════════════════
     12. SAVE / PUBLISH
     ═══════════════════════════════════════════════════════════════════ */
  function setSubmitting(v) {
    state.submitting = !!v;
    draftButtons.forEach(function (b) { b.disabled = state.submitting; });
    if (publishButton) publishButton.disabled = state.submitting;
  }

  function saveDraftStory() {
    if (state.submitting) return;
    var built = buildStoryPayload(false, true);
    if (!built.ok) { showBanner(built.message, false); return; }
    if (!window.AudioHubStories) { showBanner('Thiếu stories-store.js.', false); return; }

    var story;
    try {
      story = window.AudioHubStories.upsert(built.payload);
    } catch (e) {
      showBanner('Không thể lưu nháp. Bộ nhớ trình duyệt có thể đầy.', false);
      return;
    }
    showBanner('Bản nháp giao diện. Đã lưu vào danh sách demo.', false);
    return story;
  }

  function saveStory(published) {
    if (state.submitting) return;

    var built = buildStoryPayload(!!published);
    if (!built.ok) { showBanner(built.message, false); return; }
    if (!window.AudioHubStories) { showBanner('Thiếu stories-store.js.', false); return; }

    // Validate publish requirements
    if (published && !state.coverData && !state.coverKey) {
      showBanner('Ảnh bìa chưa lưu xong. Đợi vài giây rồi bấm lại.', false);
      return;
    }
    if (published && !state.audioKey) {
      showBanner('Audio chưa lưu xong (IndexedDB). Đợi vài giây rồi bấm lại.', false);
      return;
    }
    if (published && !state.readingText) {
      showBanner('Chưa có nội dung truyện chữ. Hãy tải file .txt hoặc .md trước khi đăng.', false);
      return;
    }

    // Debounce
    try {
      var last = Number(sessionStorage.getItem('audiohub-upload-last-submit-at') || '0');
      if (!isNaN(last) && Date.now() - last < 1200) {
        showBanner('Bạn vừa thao tác quá nhanh, vui lòng chờ một chút.', false);
        return;
      }
      sessionStorage.setItem('audiohub-upload-last-submit-at', String(Date.now()));
    } catch (e) {}

    setSubmitting(true);
    setTimeout(function () { setSubmitting(false); }, 1500);

    // ── CHAPTER APPEND LOGIC ──
    // If editing existing story (editStoryId set), append or merge chapter instead of blindly creating new story
    var targetId = editStoryId || '';
    // SAFEGUARD: reject playlist IDs — they're not real story IDs
    if (targetId && (String(targetId).indexOf('pl-') === 0 || String(targetId).indexOf('s_pl-') === 0)) {
      console.error('[upload] 🚨 SAFETY: targetId is a playlist ID, not story ID! Clearing.', targetId);
      targetId = '';
      editStoryId = '';
    }
    // Restore from sessionStorage if empty (after SPA redirect)
    if (!targetId) {
      try {
        var savedId = sessionStorage.getItem('audiohub-editStoryId') || '';
        var savedTitle = sessionStorage.getItem('audiohub-editStoryTitle') || '';
        if (savedId && !String(savedId).startsWith('pl-') && !String(savedId).startsWith('s_')) {
          targetId = savedId;
          editStoryId = savedId;
          built.payload.id = savedId;
          console.log('[upload] 🔄 Restored targetId from sessionStorage:', savedId, '|', savedTitle);
        }
      } catch (e) {}
    }
    console.log('[upload] 📖 CHAPTER APPEND — targetId:', targetId, '| chapterTitle:', built.payload.chapterTitle);

    // Fallback: match by title+author if editStoryId is empty (SPA race / page reload)
    // Use NFD normalization for Vietnamese diacritics (ô ≠ ố)
    if (!targetId && built.payload.title && window.AudioHubStories && typeof window.AudioHubStories.read === 'function') {
      var _nfcFallback = function (s) { return String(s || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
      var normPayloadTitle = _nfcFallback(built.payload.title);
      var allStories = window.AudioHubStories.read();
      // Find existing story with matching title (including s_ prefix local stories)
      var match = (allStories || []).find(function (s) {
        return s && _nfcFallback(s.title) === normPayloadTitle;
      });
      if (match && match.id) {
        targetId = String(match.id);
        built.payload.id = targetId;
        console.log('[upload] ⚠ Fallback matched by title:', targetId, '| match.id:', match.id);
      }
      // Also search audiohub-chapters-v1 for any key with matching chapters (including s_ prefix)
      if (!targetId) {
        try {
          var _cs = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
          Object.keys(_cs).forEach(function (k) {
            if (targetId || !Array.isArray(_cs[k]) || !_cs[k].length) return;
            // Check if this key's story has matching title in audiohub-stories
            var _rawStories = JSON.parse(localStorage.getItem('audiohub-stories') || '[]');
            var _match = (_rawStories || []).find(function (s) {
              return s && s.id === k && _nfcFallback(s.title) === normPayloadTitle;
            });
            if (_match) {
              targetId = k;
              built.payload.id = k;
              console.log('[upload] ⚠ Found chapters under key:', k);
            }
          });
        } catch (e) {}
      }
    }

    var existingStory = null;
    var existingChapters = [];
    if (targetId && window.AudioHubStories) {
      if (typeof window.AudioHubStories.getById === 'function') {
        existingStory = window.AudioHubStories.getById(targetId);
      }
      if ((!existingStory || !existingStory.id) && typeof window.AudioHubStories.read === 'function') {
        var allStories = window.AudioHubStories.read() || [];
        var found = allStories.find(function (s) { return s && String(s.id) === String(targetId); });
        if (found) existingStory = found;
      }
    }

    if (existingStory && existingStory.id) {
      existingChapters = Array.isArray(existingStory.chapters) ? existingStory.chapters.slice() : [];
    }

    // Load stored chapters and merge with existingStory chapters
    // Always prefer audiohub-chapters-v1 (authoritative store) over story.chapters
    if (targetId) {
      try {
        var chapStore = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
        var storedChapters = Array.isArray(chapStore[targetId]) ? chapStore[targetId].slice() : [];
        // Fallback: check s_ prefix variants
        if (!storedChapters.length && String(targetId).indexOf('s_') !== 0 && Array.isArray(chapStore['s_' + targetId])) {
          storedChapters = chapStore['s_' + targetId].slice();
        }
        if (!storedChapters.length && String(targetId).indexOf('s_') === 0) {
          var plainId = targetId.replace(/^s_/, '');
          if (plainId && Array.isArray(chapStore[plainId])) {
            storedChapters = chapStore[plainId].slice();
          }
        }
        // Last resort: search ALL s_ prefix keys for chapters that match this title
        if (!storedChapters.length && built.payload.title) {
          var _nfcSearch = function (s) { return String(s || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
          var _normTitle = _nfcSearch(built.payload.title);
          var _rawStories = JSON.parse(localStorage.getItem('audiohub-stories') || '[]');
          Object.keys(chapStore).forEach(function (k) {
            if (storedChapters.length) return;
            if (!Array.isArray(chapStore[k]) || !chapStore[k].length) return;
            var _s = (_rawStories || []).find(function (st) { return st && st.id === k && _nfcSearch(st.title) === _normTitle; });
            if (_s) {
              storedChapters = chapStore[k].slice();
              console.log('[upload] 🔍 Found chapters under fallback key:', k, '(', storedChapters.length, 'chapters)');
              // Migrate to targetId
              if (k !== targetId) {
                chapStore[targetId] = storedChapters;
                try { delete chapStore[k]; } catch (e) {}
                localStorage.setItem('audiohub-chapters-v1', JSON.stringify(chapStore));
                console.log('[upload] ✅ Migrated chapters from', k, '→', targetId);
              }
            }
          });
        }

        // ALWAYS prefer storedChapters (audiohub-chapters-v1) — it's the authoritative chapter store
        // existingStory.chapters from API/localStorage may be stale or missing chapters
        if (storedChapters.length) {
          existingChapters = storedChapters;
          console.log('[upload] 📖 Using storedChapters from audiohub-chapters-v1:', storedChapters.length, 'chapters');
        } else if (existingChapters.length) {
          console.log('[upload] 📖 Using existingStory.chapters:', existingChapters.length, 'chapters');
        } else {
          console.log('[upload] 📖 No existing chapters found for targetId:', targetId);
        }
      } catch (e) {
        console.warn('[upload] ⚠ Failed to load storedChapters:', e);
        existingChapters = existingChapters || [];
      }
    }

    if (targetId) {
      if (!existingStory) {
        console.log('[upload] ⚠ No local story object found for targetId, preserving available local chapters:', targetId);
      }

      var newChapter = {
        title: built.payload.chapterTitle || '',
        audioKey: built.payload.audioKey || '',
        coverKey: built.payload.coverKey || '',
        readingText: built.payload.readingText || ''
      };

      // If editing specific chapter index, replace; otherwise append as new chapter
      if (typeof editChapterIndex === 'number' && editChapterIndex >= 0 && editChapterIndex < existingChapters.length) {
        existingChapters[editChapterIndex] = newChapter;
      } else {
        existingChapters.push(newChapter);
      }

      built.payload.chapters = existingChapters;
      built.payload.chapterCount = existingChapters.length;

      if (!built.payload.readingText && existingStory && existingStory.readingText) {
        built.payload.readingText = existingStory.readingText;
      }

      console.log('[upload] ✅ Chapter merged/appended — total:', existingChapters.length, '| targetId:', targetId);
    } else {
      console.log('[upload] ℹ No targetId — creating NEW story');
    }

    // ── UPSERT ──
    var story;
    try {
      story = window.AudioHubStories.upsert(built.payload);
      console.log('[upload] upsert:', story ? story.id + ' | chapters: ' + (story.chapters ? story.chapters.length : 0) : 'NULL');
      // Keep sessionStorage if appending to existing story; clear if creating new
      if (!targetId) {
        try {
          sessionStorage.removeItem('audiohub-editStoryId');
          sessionStorage.removeItem('audiohub-editHashtags');
          sessionStorage.removeItem('audiohub-editCoverData');
          sessionStorage.removeItem('audiohub-editCoverKey');
        } catch (e) {}
      }
    } catch (e) {
      showBanner('Không thể lưu. Bộ nhớ trình duyệt có thể đầy.', false);
      return;
    }

    // Save cover to IndexedDB immediately
    if (story && story.id && state.coverData && window.AudioHubStoryCover && typeof window.AudioHubStoryCover.put === 'function') {
      try {
        var parts = String(state.coverData).split(',');
        var mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
        var raw = atob(parts[1] || '');
        var arr = new Uint8Array(raw.length);
        for (var i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
        var blob = new Blob([arr], { type: mime });
        window.AudioHubStoryCover.put(blob, story.id).then(function () {
          console.log('[upload] ✅ Cover saved to IndexedDB:', story.id);
        }).catch(function (e) { console.warn('[upload] Cover save failed:', e); });
      } catch (e) { console.warn('[upload] Cover save error:', e); }
    }

    showBanner(published ? 'Truyện demo đã được đưa vào trạng thái sẵn sàng xuất bản.' : 'Đã lưu nháp.', published);

    if (published && story && story.id) {
      syncToCloudAndRedirect(story);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     13. CLOUD SYNC (single poll loop)
     ═══════════════════════════════════════════════════════════════════ */
  function syncToCloudAndRedirect(story) {
    var isLocal = String(story.id).indexOf('s_') === 0;

    function doRedirect(realId) {
      var url = '/story-detail?id=' + encodeURIComponent(realId);
      // Force full page reload (not SPA navigate) to ensure fresh code + cache bust
      window.location.href = url;
    }

    if (!isLocal) {
      // Already has real CUID — PATCH to D1 (ensure user_id + visibility) then redirect
      var userId = getMyUserId() || '';
      addPlaylistEntry(story.id, story);
      if (userId && window.AudioHubApi && typeof window.AudioHubApi.request === 'function') {
        console.log('[upload] syncToCloudAndRedirect — PATCH existing CUID story to D1:', story.id, '| userId:', userId);
        window.AudioHubApi.request('/stories/' + encodeURIComponent(story.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: story.id,
            title: story.title,
            author: story.author || 'Admin AudioHub',
            genre: story.genre || '',
            description: story.description || '',
            visibility: 'Công khai',
            user_id: userId,
            reading_text: story.readingText || story.reading_text || '',
            hashtags: story.hashtags || '',
            cover_key: story.coverKey || story.cover_key || '',
            audio_key: story.audioKey || story.audio_key || ''
          })
        }).then(function () {
          console.log('[upload] ✅ PATCH to D1 success:', story.id);
          doRedirect(story.id);
        }).catch(function (err) {
          console.warn('[upload] ⚠ PATCH to D1 failed, redirect anyway:', err);
          doRedirect(story.id);
        });
      } else {
        doRedirect(story.id);
      }
      return;
    }

    // Poll for real CUID
    var attempts = 0;
    // NFD-normalized title comparison (handles Vietnamese diacritics: ô ≠ ố)
    function _nfc(s) {
      return String(s || '').trim().normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    }
    var normalizedTitle = _nfc(story.title);
    var poll = setInterval(function () {
      attempts++;
      if (attempts > 30) { clearInterval(poll); doRedirect(story.id); return; } // 15s timeout

      var stories = window.AudioHubStories && typeof window.AudioHubStories.read === 'function' ? window.AudioHubStories.read() : [];
      var current = (stories || []).find(function (s) {
        return s && _nfc(s.title) === normalizedTitle;
      });

      if (current && current.id && String(current.id).indexOf('s_') !== 0) {
        clearInterval(poll);
        var realId = current.id;
        console.log('[upload] ✅ CUID received:', realId);

        // --- MIGRATE chapter store from local draft id -> real id (prevent lost chapters) ---
        try {
          var cs = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
          var oldKey = story.id;
          // Migrate from s_ key to real CUID
          if (oldKey && cs && !Array.isArray(cs[realId])) {
            var srcKey = cs[oldKey] ? oldKey : (cs['s_' + oldKey] ? 's_' + oldKey : '');
            if (srcKey && Array.isArray(cs[srcKey]) && cs[srcKey].length) {
              cs[realId] = cs[srcKey];
              console.log('[upload] ✅ Migrated chapters from', srcKey, '→', realId, '(', cs[srcKey].length, 'chapters)');
            }
          }
          // Clean up ALL s_ prefix variants
          try { delete cs[story.id]; } catch (e) {}
          try { delete cs['s_' + story.id]; } catch (e) {}
          try { delete cs['s_' + realId]; } catch (e) {}
          localStorage.setItem('audiohub-chapters-v1', JSON.stringify(cs));
        } catch (e) { console.warn('[upload] ⚠ Chapter migration failed:', e); }

        // --- MIGRATE cover + audio IndexedDB from s_ prefix → real CUID ---
        var oldStoryId = story.id;
        if (oldStoryId && oldStoryId !== realId) {
          // Cover
          if (window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function' && typeof window.AudioHubStoryCover.put === 'function') {
            var coverKeys = [oldStoryId, 's_' + oldStoryId];
            (function tryMigrateCover(idx) {
              if (idx >= coverKeys.length) return;
              window.AudioHubStoryCover.get(coverKeys[idx]).then(function (blob) {
                if (!blob || !blob.size) { tryMigrateCover(idx + 1); return; }
                window.AudioHubStoryCover.put(blob, realId).then(function () {
                  console.log('[upload] ✅ Migrated cover from', coverKeys[idx], '→', realId);
                }).catch(function () {});
              }).catch(function () { tryMigrateCover(idx + 1); });
            })(0);
          }
          // Audio
          if (window.AudioHubStoryAudio && typeof window.AudioHubStoryAudio.get === 'function' && typeof window.AudioHubStoryAudio.put === 'function') {
            var audioKeys = [oldStoryId, 's_' + oldStoryId];
            (function tryMigrateAudio(idx) {
              if (idx >= audioKeys.length) return;
              window.AudioHubStoryAudio.get(audioKeys[idx]).then(function (blob) {
                if (!blob || !blob.size) { tryMigrateAudio(idx + 1); return; }
                window.AudioHubStoryAudio.put(blob, realId).then(function () {
                  console.log('[upload] ✅ Migrated audio from', audioKeys[idx], '→', realId);
                }).catch(function () {});
              }).catch(function () { tryMigrateAudio(idx + 1); });
            })(0);
          }
        }

        // 1. Update playlist entry keys from s_ to real CUID
        updatePlaylistEntryKeys(story.id, realId);

        // 2. Add playlist entry
        addPlaylistEntry(realId, story);

        // 3. Upload cover_data to D1
        if (state.coverData) {
          fetch('/api/stories/' + encodeURIComponent(realId), {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: realId, cover_data: state.coverData })
          }).then(function (r) {
            if (r.ok) console.log('[upload] ✅ cover_data saved to D1');
          }).catch(function () {});
        }

        // 3. Upload audio if new file selected
        if (state.audioFile && window.AudioHubStoryAudio && typeof window.AudioHubStoryAudio.put === 'function') {
          window.AudioHubStoryAudio.put(state.audioFile, realId).then(function (newKey) {
            state.audioFile = null;
            if (newKey && newKey !== state.audioKey) {
              state.audioKey = newKey;
              current.audioKey = newKey;
              window.AudioHubStories.upsert(current);
              fetch('/api/stories/' + encodeURIComponent(realId), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: realId, audio_key: newKey })
              }).then(function () { doRedirect(realId); }).catch(function () { doRedirect(realId); });
            } else {
              doRedirect(realId);
            }
          }).catch(function () { doRedirect(realId); });
        } else {
          doRedirect(realId);
        }
      }
    }, 500);
  }

  /* ── Update playlist entry keys from s_ to real CUID ── */
  function updatePlaylistEntryKeys(oldId, newId) {
    if (!oldId || !newId || oldId === newId) return;
    try {
      var raw = localStorage.getItem(PLAYLIST_KEY) || '';
      var playlists = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(playlists)) return;
      var changed = false;
      playlists.forEach(function (pl) {
        (pl.entries || []).forEach(function (e) {
          if (String(e.key) === String(oldId)) {
            e.key = newId;
            if (e.href) e.href = e.href.replace(encodeURIComponent(oldId), encodeURIComponent(newId));
            changed = true;
          }
        });
      });
      if (changed) {
        localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlists));
        console.log('[upload] ✅ Updated playlist entry keys:', oldId, '→', newId);
        syncPlaylistsToStorage();
      }
    } catch (e) {}
  }

  /* ── Playlist entry helper (single code path) ── */
  function addPlaylistEntry(storyId, story) {
    try {
      var raw = localStorage.getItem(PLAYLIST_KEY) || '';
      var playlists = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(playlists)) playlists = [];

      // Auto-create playlist if none selected
      if (!selectedPlaylistId) {
        var storyTitle = (story && story.title) || 'Truyện mới';
        var newPlId = 'pl-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now();
        var newPl = { id: newPlId, name: storyTitle, entries: [], createdBy: 'admin', userId: getMyUserId() || '', createdAt: new Date().toISOString() };
        playlists.push(newPl);
        localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlists));
        selectedPlaylistId = newPlId;
        syncPlaylistsToStorage(newPlId);
        console.log('[upload] ✅ Auto-created playlist:', storyTitle);
      }

      var pl = playlists.find(function (p) { return p && p.id === selectedPlaylistId; });
      if (!pl) return;
      var entries = pl.entries || [];
      // Dedup
      if (entries.some(function (e) { return String(e.key || '') === String(storyId); })) return;

      var chapterTitle = (chapterInput ? chapterInput.value.trim() : '') || '';
      entries.push({
        key: storyId,
        title: story.title || '',
        chapterTitle: chapterTitle,
        chapterIndex: entries.length,
        author: story.author || '',
        genre: story.genre || '',
        href: '/story-detail?id=' + encodeURIComponent(storyId) + '&playlistId=' + encodeURIComponent(pl.id),
        status: 'listening',
        progress: 0,
        addedAt: new Date().toISOString()
      });
      pl.entries = entries;
      localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlists));
      syncPlaylistsToStorage(pl.id);
      console.log('[upload] ✅ Playlist entry added:', pl.name, '| chapter:', chapterTitle);
    } catch (e) { console.warn('[upload] Playlist entry failed:', e); }
  }

  /* ═══════════════════════════════════════════════════════════════════
     14. BUTTON HANDLERS
     ═══════════════════════════════════════════════════════════════════ */
  draftButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      if (btn.hasAttribute('data-upload-preview')) {
        var card = $('[data-upload-preview-card]');
        if (card) {
          card.scrollIntoView({ behavior: 'smooth', block: 'center' });
          card.classList.add('is-highlighted');
          setTimeout(function () { card.classList.remove('is-highlighted'); }, 1800);
          render();
          showBanner('Đang hiển thị bản xem trước bên dưới.', false);
        }
        return;
      }
      saveDraftStory();
    });
  });

  if (publishButton) {
    publishButton.addEventListener('click', function () {
      saveStory(true);
      if (banner) banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════
     15. DRAFT HYDRATION (load existing story into form)
     ═══════════════════════════════════════════════════════════════════ */
  function hydrateDraft(story) {
    if (!story) return false;

    console.log('[upload] hydrateDraft:', story.id, '| title:', story.title);
    editStoryId = String(story.id);
    if (root) root.setAttribute('data-editing-draft', editStoryId);
    if (banner) {
      banner.textContent = 'Đang chỉnh sửa: ' + story.title;
      banner.classList.remove('is-hidden');
      banner.classList.remove('is-published');
    }

    setFieldValue(titleInput, story.title);
    setFieldValue(descriptionInput, story.description);
    setFieldValue(genreSelect, story.genre);
    setFieldValue(youtubeInput, story.youtubeUrl);
    setFieldValue(visibilitySelect, story.visibility || 'Riêng tư');
    state.visibility = (visibilitySelect && visibilitySelect.value) || story.visibility || 'Riêng tư';

    // Update story name trigger
    var trigger = $('[data-story-name-trigger]');
    if (trigger && story.title) {
      trigger.innerHTML = escapeHtml(story.title) + ' <i class="fa-solid fa-chevron-down"></i>';
      trigger.classList.add('is-selected');
    }

    // Auto-detect playlist
    if (story.title) {
      try {
        var pls = JSON.parse(localStorage.getItem(PLAYLIST_KEY) || '[]');
        if (Array.isArray(pls)) {
          var matched = pls.find(function (pl) {
            return pl && pl.name && pl.name.toLowerCase() === String(story.title).toLowerCase();
          });
          if (matched) {
            selectedPlaylistId = matched.id;
            console.log('[upload] 🎵 Auto-detected playlist:', matched.name);
          }
        }
      } catch (e) {}
    }

    // Hashtags — fallback to sessionStorage if story has none
    var hashtagEl = $('[data-upload-hashtags]');
    if (hashtagEl) {
      var tags = story.hashtags || story.tags || '';
      var tagStr = Array.isArray(tags) ? tags.join(', ') : (tags || '');
      if (!tagStr) {
        try { tagStr = sessionStorage.getItem('audiohub-editHashtags') || ''; } catch (e) {}
      }
      hashtagEl.value = tagStr;
    }

    // Chapters — load from separate store if needed
    var chapters = Array.isArray(story.chapters) ? story.chapters : [];
    if (!chapters.length && story.id) {
      try {
        var cs = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
        chapters = Array.isArray(cs[story.id]) ? cs[story.id] : [];
      } catch (e) {}
    }
    var chapter = chapters[editChapterIndex] || {};
    var chapterTitle = chapter.title || story.chapterTitle || '';
    var chapterAudioKey = chapter.audioKey || story.audioKey || '';
    var chapterReadingText = chapter.readingText || story.readingText || '';

    setFieldValue(chapterInput, chapterTitle);
    if (chapterAudioKey) state.audioKey = chapterAudioKey;
    if (chapterReadingText) state.readingText = chapterReadingText;
    state.coverReady = !!(state.coverKey || story.coverKey);
    state.audioReady = !!(state.audioKey);

    // ── Load cover image ──
    state.coverName = 'Ảnh bìa đã lưu';
    if (coverZone) coverZone.classList.add('is-ready');

    if (story.coverData && String(story.coverData).indexOf('data:') === 0) {
      state.coverData = story.coverData;
      state.coverReady = true;
      if (coverPreview) coverPreview.innerHTML = '<img src="' + story.coverData + '" alt="Ảnh bìa" />';
      if (coverLabel) coverLabel.textContent = 'Đã có ảnh bìa';
      if (coverHint) coverHint.textContent = 'Chọn file khác để thay đổi';
    } else if (window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function') {
      var coverKey = story.coverKey || '';
      var idbKey = coverKey && String(coverKey).indexOf('c_') === 0 ? coverKey : story.id;
      if (idbKey) {
        if (coverLabel) coverLabel.textContent = 'Đang tải ảnh bìa…';
        var tryKeys = [idbKey];
        if (!String(idbKey).startsWith('s_')) tryKeys.unshift('s_' + idbKey);

        (function tryLoadCover(idx) {
          if (idx >= tryKeys.length) {
            if (coverLabel) coverLabel.textContent = 'Ảnh bìa đã lưu';
            return;
          }
          window.AudioHubStoryCover.get(tryKeys[idx]).then(function (blob) {
            if (!blob || !blob.size) { tryLoadCover(idx + 1); return; }
            var url = URL.createObjectURL(blob);
            if (coverPreview) coverPreview.innerHTML = '<img src="' + url + '" alt="Ảnh bìa" />';
            if (coverLabel) coverLabel.textContent = 'Đã có ảnh bìa';
            if (coverHint) coverHint.textContent = 'Chọn file khác để thay đổi';
            state.coverReady = true;
            var reader = new FileReader();
            reader.onload = function () { state.coverData = reader.result; };
            reader.readAsDataURL(blob);
          }).catch(function () { tryLoadCover(idx + 1); });
        })(0);
      }
    }

    // ── Last resort: restore cover from sessionStorage ──
    if (!state.coverData && !state.coverReady) {
      try {
        var savedCover = sessionStorage.getItem('audiohub-editCoverData') || '';
        if (savedCover && savedCover.indexOf('data:') === 0) {
          state.coverData = savedCover;
          state.coverReady = true;
          if (coverPreview) coverPreview.innerHTML = '<img src="' + savedCover + '" alt="Ảnh bìa" />';
          if (coverLabel) coverLabel.textContent = 'Đã có ảnh bìa';
          if (coverHint) coverHint.textContent = 'Chọn file khác để thay đổi';
        }
      } catch (e) {}
    }

    // ── Load audio (try s_ prefix fallback) ──
    if (state.audioKey) {
      state.audioName = 'Audio đã lưu';
      if (audioLabel) audioLabel.textContent = 'Audio đã lưu';
      if (audioZone) audioZone.classList.add('is-ready');
      if (window.AudioHubStoryAudio && typeof window.AudioHubStoryAudio.get === 'function') {
        var audioTryKeys = [state.audioKey];
        if (!String(state.audioKey).startsWith('s_')) audioTryKeys.unshift('s_' + state.audioKey);
        (function tryLoadAudio(idx) {
          if (idx >= audioTryKeys.length) {
            setAudioPreviewDisabled(false);
            return;
          }
          window.AudioHubStoryAudio.get(audioTryKeys[idx]).then(function (blob) {
            if (blob && audioPlayer) {
              audioPlayer.src = URL.createObjectURL(blob);
              audioPlayer.load();
              setAudioPreviewDisabled(false);
              if (audioPreviewName) audioPreviewName.textContent = state.audioName;
            } else {
              tryLoadAudio(idx + 1);
            }
          }).catch(function () { tryLoadAudio(idx + 1); });
        })(0);
      } else {
        setAudioPreviewDisabled(false);
      }
    }

    // ── Reading text label ──
    if (state.readingText && readingLabel) {
      readingLabel.textContent = 'Đã có nội dung truyện chữ';
      if (readingHint) readingHint.textContent = 'Chọn file khác để thay đổi';
      if (readingZone) readingZone.classList.add('is-ready');
    }

    if (chapterTitle) showBanner('Đang chỉnh sửa: ' + story.title + ' — ' + chapterTitle, false);

    render();
    return true;
  }

  function loadDraftFromQuery() {
    console.log('[upload] loadDraftFromQuery — editStoryId:', editStoryId);
    if (!editStoryId || !window.AudioHubStories || typeof window.AudioHubStories.getById !== 'function') {
      console.log('[upload] ⚠ loadDraftFromQuery skipped');
      return false;
    }
    var story = window.AudioHubStories.getById(editStoryId);
    if (story) {
      console.log('[upload] ✅ Found in localStorage:', story.id);
      return hydrateDraft(story);
    }

    // Fetch from API
    console.log('[upload] 🔄 Fetching from API:', editStoryId);
    fetch('/api/stories/' + encodeURIComponent(editStoryId))
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (remote) {
        if (!remote || !remote.id) return;
        var normalized = remote;
        if (window.AudioHubStories && typeof window.AudioHubStories.upsert === 'function') {
          normalized = window.AudioHubStories.upsert(remote);
        }
        // Load chapters from separate store
        if (normalized && normalized.id && (!normalized.chapters || !normalized.chapters.length)) {
          try {
            var cs = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
            var sid = String(normalized.id);
            var localCh = Array.isArray(cs[sid]) ? cs[sid] : [];
            if (!localCh.length && !sid.startsWith('s_')) {
              localCh = Array.isArray(cs['s_' + sid]) ? cs['s_' + sid] : [];
            }
            if (localCh.length) {
              normalized.chapters = localCh;
              normalized.chapterCount = localCh.length;
            }
          } catch (e) {}
        }
        hydrateDraft(normalized);
      })
      .catch(function (e) { console.log('[upload] ⚠ API fetch failed:', e); });
    return false;
  }

  // Retry on stories-updated (SPA race fix)
  window.addEventListener('audiohub:stories-updated', function () {
    if (editStoryId) { loadDraftFromQuery(); return; }
    try {
      var p = new URL(window.location.href).searchParams;
      var id = p.get('id') || '';
      if (id) {
        editStoryId = id;
      var rawChapter = p.get('chapter');
      editChapterIndex = rawChapter !== null ? Math.max(0, parseInt(rawChapter || '0', 10)) : -1;
      loadDraftFromQuery();
    }
  } catch (e) {}
  });

  /* ═══════════════════════════════════════════════════════════════════
     16. INIT
     ═══════════════════════════════════════════════════════════════════ */
  loadDraftFromQuery();
  render();

  // Global for other modules
  window.AudioHubUploadAuthor = {
    getAuthorFromSession: getAuthorFromSession,
    syncAuthorInput: syncAuthorInput
  };
})();
