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
    audioUploading: false,  // True while audio is being saved to IndexedDB
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
  var editChapterIndexFromUrl = false; // true when URL had explicit ?chapter=N
  var selectedPlaylistId = null;

  // Read URL params (with retry for SPA race)
  function readUrlParams() {
    try {
      var p = new URL(window.location.href).searchParams;
      editStoryId = p.get('id') || '';
      // If ?chapter is provided we use that index, otherwise -1 to indicate append mode
      var rawChapter = p.get('chapter');
      editChapterIndex = rawChapter !== null ? Math.max(0, parseInt(rawChapter || '0', 10)) : -1;
      editChapterIndexFromUrl = rawChapter !== null;
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

    // Prevent <label> click from stealing focus to hidden input (blocks dropdown on some browsers)
    var parentLabel = selectRoot.closest('label');
    if (parentLabel) {
      parentLabel.addEventListener('click', function (e) {
        if (selectRoot.contains(e.target)) e.preventDefault();
      });
    }

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
      if (!editChapterIndexFromUrl) editChapterIndex = -1; // Reset only if not explicitly set from URL

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

    // Auto-select story from sessionStorage (after publish redirect back)
    setTimeout(function () {
      try {
        var savedId = sessionStorage.getItem('audiohub-editStoryId') || '';
        var savedTitle = sessionStorage.getItem('audiohub-editStoryTitle') || '';
        if (savedId && savedTitle && allStories.length) {
          var match = allStories.find(function (s) { return String(s.id) === savedId || (s.title || '').trim().toLowerCase() === savedTitle.trim().toLowerCase(); });
          if (match) {
            console.log('[upload] 🔄 Auto-selecting story from sessionStorage:', match.title, '| id:', match.id);
            selectStory(match);
          }
        }
      } catch (e) {}
    }, 800); // wait for API fetch to complete
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
      state.audioUploading = true;  // Block submit until IndexedDB save completes
      if (audioZone) audioZone.classList.add('is-processing');
      if (audioLabel) audioLabel.textContent = 'Đang xử lý audio…';

      stopAudio();
      clearObjectUrl(audioObjectUrl);
      audioObjectUrl = URL.createObjectURL(file);

      console.log('[upload] 🎵 Audio file selected:', file.name, '| editChapterIndex:', editChapterIndex, '| editStoryId:', editStoryId);

      // Save to IndexedDB — generates unique key for this audio file
      var storePromise = (window.AudioHubStoryAudio && typeof window.AudioHubStoryAudio.put === 'function')
        ? window.AudioHubStoryAudio.put(file)
        : Promise.reject(new Error('missing audio store'));

      storePromise.then(function (audioKey) {
        console.log('[upload] ✅ IndexedDB save complete — audioKey:', audioKey, '| file:', file.name);
        state.audioKey = audioKey;
        state.audioUploading = false;  // Ready to submit
        // Update chapter in localStorage if it was already saved with empty audioKey
        try {
          var _targetId = editStoryId || '';
          if (_targetId && typeof editChapterIndex === 'number' && editChapterIndex >= 0) {
            var _cs = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
            var _chs = Array.isArray(_cs[_targetId]) ? _cs[_targetId] : [];
            if (_chs[editChapterIndex] && !_chs[editChapterIndex].audioKey) {
              _chs[editChapterIndex].audioKey = audioKey;
              _cs[_targetId] = _chs;
              localStorage.setItem('audiohub-chapters-v1', JSON.stringify(_cs));
              console.log('[upload] ✅ Updated chapter audioKey in localStorage:', editChapterIndex, '→', audioKey);
            }
          }
        } catch (e) {}
      }).catch(function () {
        state.audioKey = '';
        state.audioUploading = false;
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
        visibility: forceDraft ? 'Riêng tư' : (state.visibility || 'Công khai'),
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
    // Block submit while audio is still being saved to IndexedDB
    if (published && state.audioUploading) {
      showBanner('Audio đang lưu xong. Đợi vài giây rồi bấm lại.', false);
      return;
    }
    if (published && !state.audioKey) {
      // Check if editing existing chapter that already has audio in storage
      var _existingHasAudio = false;
      if (typeof editChapterIndex === 'number' && editChapterIndex >= 0 && targetId) {
        try {
          var _vcs = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
          var _vchs = Array.isArray(_vcs[targetId]) ? _vcs[targetId] : [];
          if (_vchs[editChapterIndex] && _vchs[editChapterIndex].audioKey) _existingHasAudio = true;
        } catch (e) {}
      }
      if (!_existingHasAudio) {
        showBanner('Audio chưa lưu xong (IndexedDB). Đợi vài giây rồi bấm lại.', false);
        return;
      }
    }
    // Reading text is now optional — no validation required

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

      console.log('[upload] 🔍 SAVE DEBUG — editChapterIndex:', editChapterIndex);
      console.log('[upload]   state.audioKey:', state.audioKey || '(EMPTY)');
      console.log('[upload]   newChapter.audioKey:', newChapter.audioKey || '(EMPTY)');
      console.log('[upload]   existingChapters:', existingChapters.length);
      if (existingChapters.length) {
        existingChapters.forEach(function (ch, i) {
          console.log('[upload]     ch' + (i+1) + '.audioKey:', ch.audioKey || '(EMPTY)');
        });
      }

      // If editing specific chapter index, replace; otherwise append as new chapter
      if (typeof editChapterIndex === 'number' && editChapterIndex >= 0 && editChapterIndex < existingChapters.length) {
        // ROOT FIX: Compare state.audioKey with old chapter's audioKey.
        // If same → no new upload → preserve old. If different → new upload → use new.
        var oldCh = existingChapters[editChapterIndex] || {};
        console.log('[upload] ✏️ EDITING existing chapter', editChapterIndex + 1);
        console.log('[upload]   oldCh.audioKey:', oldCh.audioKey || '(EMPTY)');
        console.log('[upload]   state.audioKey:', state.audioKey || '(EMPTY)');
        if (state.audioKey === (oldCh.audioKey || '')) {
          // Same audioKey as stored — no new upload → preserve old chapter's audioKey
          newChapter.audioKey = oldCh.audioKey || '';
          console.log('[upload]   → Preserving old audioKey (no new upload)');
        } else {
          console.log('[upload]   → Using new audioKey:', newChapter.audioKey || '(EMPTY)');
        }
        if (!newChapter.coverKey && oldCh.coverKey) newChapter.coverKey = oldCh.coverKey;
        if (!newChapter.readingText && oldCh.readingText) newChapter.readingText = oldCh.readingText;
        existingChapters[editChapterIndex] = newChapter;
      } else {
        console.log('[upload] ➕ APPENDING new chapter — audioKey:', newChapter.audioKey || '(EMPTY)');
        existingChapters.push(newChapter);
      }

      built.payload.chapters = existingChapters;
      built.payload.chapterCount = existingChapters.length;

      if (!built.payload.readingText && existingStory && existingStory.readingText) {
        built.payload.readingText = existingStory.readingText;
      }

      console.log('[upload] ✅ Chapter merged/appended — total:', existingChapters.length, '| targetId:', targetId);
      console.log('[upload] 📋 ALL chapters audioKeys:', existingChapters.map(function(c, i) { return 'ch' + (i + 1) + ':' + (c.audioKey || '(empty)'); }));
    } else {
      console.log('[upload] ℹ No targetId — creating NEW story');
      // FIX: Save first chapter to chapters store (audiohub-chapters-v1)
      // Without this, Chapter 1's audioKey and readingText are lost when Chapter 2 is added later
      var _firstChapter = {
        title: built.payload.chapterTitle || '',
        audioKey: built.payload.audioKey || '',
        coverKey: built.payload.coverKey || '',
        readingText: built.payload.readingText || ''
      };
      built.payload.chapters = [_firstChapter];
      built.payload.chapterCount = 1;
      console.log('[upload] 📖 NEW STORY — saving first chapter:', _firstChapter.title, '| audioKey:', _firstChapter.audioKey || '(empty)');
    }

    // ── UPSERT ──
    var story;
    try {
      story = window.AudioHubStories.upsert(built.payload);
      console.log('[upload] upsert:', story ? story.id + ' | chapters: ' + (story.chapters ? story.chapters.length : 0) : 'NULL');

      // VERIFY: Read back from localStorage to confirm chapters saved correctly
      try {
        var _verifyStore = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
        var _verifyChapters = Array.isArray(_verifyStore[story.id]) ? _verifyStore[story.id] : [];
        console.log('[upload] VERIFY from localStorage — chapters:', _verifyChapters.length, '| expected:', built.payload.chapters ? built.payload.chapters.length : '?');
        _verifyChapters.forEach(function (ch, i) {
          console.log('[upload]   ch' + (i+1) + ':', { title: ch.title, audioKey: ch.audioKey || '(EMPTY)' });
        });
        // AUTO-REPAIR: if localStorage has fewer chapters, try writing slimmed version (no readingText)
        var _expectedCount = built.payload.chapters ? built.payload.chapters.length : 0;
        if (_verifyChapters.length < _expectedCount) {
          console.warn('[upload] ⚠ MISMATCH — localStorage has', _verifyChapters.length, 'chapters, expected', _expectedCount);
          try {
            // Slim chapters: strip readingText to reduce size
            var _slimChapters = built.payload.chapters.map(function (ch) {
              if (!ch) return ch;
              return { title: ch.title || '', audioKey: ch.audioKey || '', coverKey: ch.coverKey || '' };
            });
            _verifyStore[story.id] = _slimChapters;
            localStorage.setItem('audiohub-chapters-v1', JSON.stringify(_verifyStore));
            var _reCheck = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
            var _reCount = Array.isArray(_reCheck[story.id]) ? _reCheck[story.id].length : 0;
            console.log('[upload] Repair result:', _reCount, 'chapters (slimmed, no readingText)');
          } catch (e) { console.error('[upload] ❌ Repair failed — localStorage critically full:', e && e.message); }
        }
      } catch (e) { console.warn('[upload] Verify failed:', e); }
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
      syncToCloudAndRedirect(story, built.payload.chapters || []);
    }
  }

  /* ═══════════════════════════════════════════════════════════════════
     13. CLOUD SYNC (single poll loop)
     ═══════════════════════════════════════════════════════════════════ */
  function syncToCloudAndRedirect(story, mergedChapters) {
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
        // Use merged chapters passed from saveStory (already correct, no localStorage re-read needed)
        var _chaptersForD1 = mergedChapters || story.chapters || [];
        console.log('[upload] syncToCloudAndRedirect — chapters to sync:', _chaptersForD1.length);

        // Preserve original audio_key (chapter 1) — don't let new chapter overwrite it
        var _existingStory = null;
        try {
          var _allStories = window.AudioHubStories && typeof window.AudioHubStories.read === 'function' ? window.AudioHubStories.read() : [];
          _existingStory = (_allStories || []).find(function (s) { return s && String(s.id) === String(story.id); });
        } catch (e) {}
        var _origAudioKey = (_existingStory && (_existingStory.audioKey || _existingStory.audio_key)) || story.audioKey || story.audio_key || '';
        // FIX: If audio key is local (a_*), use story ID instead so R2 can find it
        if (_origAudioKey && String(_origAudioKey).indexOf('a_') === 0) {
          _origAudioKey = story.id;
        }

        window.AudioHubApi.request('/stories/' + encodeURIComponent(story.id), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: story.id,
            title: story.title,
            author: story.author || 'Admin AudioHub',
            genre: story.genre || '',
            description: story.description || '',
            visibility: story.visibility || 'Công khai',
            user_id: userId,
            reading_text: story.readingText || story.reading_text || '',
            hashtags: story.hashtags || '',
            cover_key: story.coverKey || story.cover_key || '',
            audio_key: _origAudioKey,
            chapters: _chaptersForD1.length ? _chaptersForD1 : (story.chapters || [])
          })
        }).then(function () {
          console.log('[upload] ✅ PATCH to D1 success:', story.id);
          // Upload audio to cloud (R2/Supabase) for this chapter
          function _patchUploadDone() { doRedirect(story.id); }

          // Direct R2 upload — bypasses AudioHubStoryAudio.put which may silently fail
          function _directR2Upload(blob, key) {
            var url = '/api/audio/' + encodeURIComponent(String(key));
            console.log('[upload] 🔧 Direct R2 PUT:', url, '| size:', blob.size);
            return fetch(url, { method: 'PUT', headers: { 'Content-Type': blob.type || 'audio/mpeg' }, body: blob })
              .then(function (res) {
                console.log('[upload] R2 PUT response:', res.status, res.statusText);
                if (!res.ok) throw new Error('R2 PUT failed: ' + res.status);
                return true;
              });
          }

          // Verify R2 has the file
          function _verifyR2(key) {
            var url = '/api/audio/' + encodeURIComponent(String(key));
            return fetch(url, { method: 'HEAD' }).then(function (res) {
              console.log('[upload] R2 VERIFY:', key, '→', res.status);
              return res.ok;
            }).catch(function () { return false; });
          }

          function _doPatchAudioUpload(blob, uploadKey) {
            var _patchAudioKey = uploadKey || state.audioKey || story.id;
            console.log('[upload] 🎵 Uploading audio to cloud for PATCH story:', story.id, '| audioKey:', _patchAudioKey, '| blob.size:', blob ? blob.size : 'NULL');

            if (!blob || blob.size === 0) {
              console.warn('[upload] ⚠ No audio blob to upload');
              _patchUploadDone();
              return;
            }

            // Try 1: Direct R2 upload with the audioKey
            _directR2Upload(blob, _patchAudioKey).then(function () {
              console.log('[upload] ✅ R2 upload OK (PATCH) with key:', _patchAudioKey);
              state.audioFile = null;
              _patchUploadDone();
            }).catch(function (e) {
              console.warn('[upload] ⚠ R2 upload failed with key:', _patchAudioKey, '| trying story.id:', e && e.message);
              // Try 2: Direct R2 upload with story.id
              _directR2Upload(blob, story.id).then(function () {
                console.log('[upload] ✅ R2 upload OK (PATCH) with story.id:', story.id);
                state.audioFile = null;
                _patchUploadDone();
              }).catch(function (e2) {
                console.warn('[upload] ⚠ R2 upload failed with story.id:', e2 && e.message);
                // Try 3: AudioHubStoryAudio.put as last resort (includes Supabase fallback)
                window.AudioHubStoryAudio && window.AudioHubStoryAudio.put
                  ? window.AudioHubStoryAudio.put(blob, story.id, _patchAudioKey).then(function () {
                      console.log('[upload] ✅ AudioHubStoryAudio.put OK (PATCH)');
                      state.audioFile = null;
                    }).catch(function () {
                      console.warn('[upload] ❌ All upload methods failed (PATCH)');
                    }).then(function () { _patchUploadDone(); })
                  : _patchUploadDone();
              });
            });
          }
          if (state.audioFile && window.AudioHubStoryAudio && typeof window.AudioHubStoryAudio.put === 'function') {
            _doPatchAudioUpload(state.audioFile);
          } else if (window.AudioHubStoryAudio && typeof window.AudioHubStoryAudio.get === 'function') {
            // Fallback: audioFile may have been GC'd — try all possible audioKeys
            var _candidateKeys = [];
            if (state.audioKey) _candidateKeys.push(state.audioKey);
            // Also try chapter audioKeys (in case state.audioKey is wrong)
            try {
              var _chs = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
              var _chArr = Array.isArray(_chs[String(story.id)]) ? _chs[String(story.id)] : [];
              _chArr.forEach(function (ch) {
                if (ch && ch.audioKey && _candidateKeys.indexOf(ch.audioKey) === -1) _candidateKeys.push(ch.audioKey);
              });
            } catch (e) {}
            // Always include story.id as last resort
            if (_candidateKeys.indexOf(story.id) === -1) _candidateKeys.push(story.id);
            console.log('[upload] 🔄 PATCH fallback: trying keys', _candidateKeys);

            function _tryNextKey(idx) {
              if (idx >= _candidateKeys.length) {
                console.warn('[upload] ⚠ No audio blob found in any key, redirecting');
                _patchUploadDone();
                return;
              }
              var key = _candidateKeys[idx];
              window.AudioHubStoryAudio.get(key).then(function (blob) {
                if (blob && blob.size > 0) {
                  console.log('[upload] ✅ Found audio blob for key:', key, '| size:', blob.size);
                  _doPatchAudioUpload(blob, key);
                } else {
                  _tryNextKey(idx + 1);
                }
              }).catch(function () {
                _tryNextKey(idx + 1);
              });
            }
            _tryNextKey(0);
          } else {
            _patchUploadDone();
          }
        }).catch(function (err) {
          console.warn('[upload] ⚠ PATCH to D1 failed, redirect anyway:', err);
          doRedirect(story.id);
        });
      } else {
        doRedirect(story.id);
      }
      return;
    }

    // POST to D1 to get CUID immediately (no polling needed)
    var userId = getMyUserId() || '';
    // Use merged chapters passed from saveStory (already correct)
    var _chaptersForD1_init = mergedChapters || story.chapters || [];

    var _postBody = {
      id: story.id,
      title: story.title,
      author: story.author || 'Admin AudioHub',
      genre: story.genre || '',
      description: story.description || '',
      visibility: story.visibility || 'Công khai',
      user_id: userId,
      reading_text: story.readingText || story.reading_text || '',
      hashtags: story.hashtags || '',
      cover_key: story.coverKey || story.cover_key || '',
      cover_data: state.coverData || '',
      audio_key: story.id,
      chapters: _chaptersForD1_init.length ? _chaptersForD1_init : (story.chapters || []),
      chapter_count: (_chaptersForD1_init.length || (story.chapters || []).length) || 0
    };

    fetch('/api/stories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(_postBody)
    }).then(function (r) { return r.json(); }).then(function (saved) {
      var realId = (saved && saved.id) ? saved.id : story.id;
      console.log('[upload] ✅ CUID received:', realId);

      // Update localStorage with real CUID immediately
      if (realId !== story.id && window.AudioHubStories && typeof window.AudioHubStories.read === 'function' && typeof window.AudioHubStories.upsert === 'function') {
        var stories = window.AudioHubStories.read();
        var current = (stories || []).find(function (s) { return s && s.id === story.id; });
        if (current) {
          current.id = realId;
          window.AudioHubStories.upsert(current);
          // CRITICAL: Remove old s_ entry to prevent duplicates
          // Without this, next publish finds stale s_ entry → loses chapters
          try {
            var allStories = window.AudioHubStories.read();
            var oldEntries = allStories.filter(function (s) { return s && s.id === story.id; });
            oldEntries.forEach(function (s) { window.AudioHubStories.remove(s.id); });
            if (oldEntries.length) console.log('[upload] ✅ Removed', oldEntries.length, 'old s_ entries from localStorage');
          } catch (e) {}
          console.log('[upload] ✅ Updated localStorage with CUID:', realId);
        }
      }

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

        // 3. Upload audio to cloud (R2/Supabase) using audioKey for R2 + storyId as fallback
        function _uploadAudioToCloud(blob, uploadKey) {
          if (!blob || blob.size === 0) {
            console.warn('[upload] ⚠ No audio blob to upload');
            doRedirect(realId);
            return;
          }
          var _uploadAudioKey = uploadKey || state.audioKey || realId;
          console.log('[upload] 🎵 Uploading audio | storyId:', realId, '| audioKey:', _uploadAudioKey, '| size:', blob.size);

          // Direct R2 upload — bypasses AudioHubStoryAudio.put which may silently fail
          var _r2Url = '/api/audio/' + encodeURIComponent(String(_uploadAudioKey));
          fetch(_r2Url, { method: 'PUT', headers: { 'Content-Type': blob.type || 'audio/mpeg' }, body: blob })
            .then(function (res) {
              console.log('[upload] R2 PUT response:', res.status, res.statusText);
              if (!res.ok) throw new Error('R2 PUT ' + res.status);
              // Verify R2 actually has it
              return fetch(_r2Url, { method: 'HEAD' });
            })
            .then(function (verifyRes) {
              console.log('[upload] R2 VERIFY:', verifyRes.status);
              if (!verifyRes.ok) throw new Error('R2 VERIFY ' + verifyRes.status);
              console.log('[upload] ✅ Audio confirmed on R2 | key:', _uploadAudioKey);
              state.audioFile = null;
              if (!state.audioKey) state.audioKey = realId;
              if (typeof editChapterIndex === 'number' && Array.isArray(current.chapters) && current.chapters[editChapterIndex]) {
                current.chapters[editChapterIndex].audioKey = realId;
              }
              if (!editChapterIndex || editChapterIndex === 0) {
                current.audioKey = realId;
              }
              window.AudioHubStories.upsert(current);
              fetch('/api/stories/' + encodeURIComponent(realId), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: realId, audio_key: realId })
              }).then(function () { doRedirect(realId); }).catch(function () { doRedirect(realId); });
            })
            .catch(function (e) {
              console.warn('[upload] ⚠ R2 upload/verify failed:', e && e.message, '| trying story.id as key');
              // Retry with story.id as key
              var _r2Url2 = '/api/audio/' + encodeURIComponent(String(realId));
              fetch(_r2Url2, { method: 'PUT', headers: { 'Content-Type': blob.type || 'audio/mpeg' }, body: blob })
                .then(function (res) {
                  console.log('[upload] R2 PUT (story.id) response:', res.status);
                  if (!res.ok) throw new Error('R2 PUT ' + res.status);
                  return fetch(_r2Url2, { method: 'HEAD' });
                })
                .then(function (verifyRes) {
                  console.log('[upload] R2 VERIFY (story.id):', verifyRes.status);
                  if (!verifyRes.ok) throw new Error('R2 VERIFY failed');
                  console.log('[upload] ✅ Audio confirmed on R2 (story.id):', realId);
                  state.audioFile = null;
                })
                .catch(function (e2) {
                  console.warn('[upload] ❌ All R2 uploads failed:', e2 && e2.message);
                })
                .then(function () { doRedirect(realId); });
            });
        }

        if (state.audioFile) {
          // User selected a new audio file — upload directly
          _uploadAudioToCloud(state.audioFile);
        } else if (window.AudioHubStoryAudio && typeof window.AudioHubStoryAudio.get === 'function') {
          // Try all possible audioKeys (state.audioKey, chapter audioKeys, story ID)
          var _candidateKeys = [];
          if (state.audioKey) _candidateKeys.push(state.audioKey);
          try {
            var _chs2 = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
            var _chArr2 = Array.isArray(_chs2[story.id]) ? _chs2[story.id] : [];
            _chArr2.forEach(function (ch) {
              if (ch && ch.audioKey && _candidateKeys.indexOf(ch.audioKey) === -1) _candidateKeys.push(ch.audioKey);
            });
          } catch (e) {}
          if (_candidateKeys.indexOf(realId) === -1) _candidateKeys.push(realId);
          if (_candidateKeys.indexOf(story.id) === -1) _candidateKeys.push(story.id);
          console.log('[upload] 🔄 POST fallback: trying keys', _candidateKeys);

          function _tryPostKey(idx) {
            if (idx >= _candidateKeys.length) {
              console.warn('[upload] ⚠ No audio blob found in any key');
              doRedirect(realId);
              return;
            }
            var key = _candidateKeys[idx];
            window.AudioHubStoryAudio.get(key).then(function (blob) {
              if (blob && blob.size > 0) {
                console.log('[upload] ✅ Found audio blob for key:', key, '| size:', blob.size);
                _uploadAudioToCloud(blob, key);
              } else {
                _tryPostKey(idx + 1);
              }
            }).catch(function () {
              _tryPostKey(idx + 1);
            });
          }
          _tryPostKey(0);
        } else {
          doRedirect(realId);
        }
    }).catch(function (err) {
      console.warn('[upload] ⚠ POST to D1 failed:', err);
      doRedirect(story.id);
    });
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

  /* ── Playlist entry helper — adds ALL chapters at once ── */
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

      // Check if this story already has entries in the playlist
      var existingEntries = entries.filter(function (e) { return String(e.key || '') === String(storyId); });
      var existingChapterIndices = {};
      existingEntries.forEach(function (e) {
        if (typeof e.chapterIndex === 'number') existingChapterIndices[e.chapterIndex] = true;
      });

      // Read ALL chapters from audiohub-chapters-v1
      var chapStore2 = {};
      try { chapStore2 = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}'); } catch (e) {}
      var chapters2 = Array.isArray(chapStore2[storyId]) ? chapStore2[storyId] : [];

      // Find chapters that are NOT yet in the playlist
      var newChapters = chapters2.filter(function (ch, i) { return !existingChapterIndices[i]; });

      if (newChapters.length === 0) {
        console.log('[upload] ℹ️ All chapters already in playlist, skipping.');
        return;
      }

      // Add only the new chapter entries
      newChapters.forEach(function (ch, i) {
        var globalIdx = chapters2.indexOf(ch);
        entries.push({
          key: storyId,
          title: story.title || '',
          chapterTitle: ch.title || ('Chương ' + (globalIdx + 1)),
          chapterIndex: globalIdx,
          author: story.author || '',
          genre: story.genre || '',
          href: '/story-detail?id=' + encodeURIComponent(storyId) + '&playlistId=' + encodeURIComponent(pl.id),
          status: 'listening',
          progress: 0,
          addedAt: new Date().toISOString()
        });
      });
      console.log('[upload] ✅ Added ' + newChapters.length + ' new chapter entries to playlist:', pl.name);

      // Save playlists
      pl.entries = entries;
      localStorage.setItem('audiohub-playlists', JSON.stringify(playlists));
      syncPlaylistsToStorage(pl.id);
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
    // Only use chapter's own audioKey — don't fallback to story.audioKey (that's chapter 1's audio)
    var chapterAudioKey = chapter.audioKey || '';
    // FIX: Only use chapter's own readingText — don't fallback to story.readingText
    // When append mode (editChapterIndex=-1), chapter={} so fallback would leak old text
    var chapterReadingText = (editChapterIndex >= 0 && chapters[editChapterIndex]) ? (chapters[editChapterIndex].readingText || '') : '';

    setFieldValue(chapterInput, chapterTitle);
    // ROOT FIX: Only set state.audioKey from storage if it's empty (no fresh upload).
    // If state.audioKey already has a value from a fresh upload, preserve it.
    console.log('[upload] 📖 loadDraftFromQuery — editChapterIndex:', editChapterIndex, '| chapterAudioKey:', chapterAudioKey || '(empty)', '| state.audioKey BEFORE:', state.audioKey || '(empty)');
    if (!state.audioKey) {
      state.audioKey = chapterAudioKey;
      state.audioReady = false;
    }
    console.log('[upload] 📖 loadDraftFromQuery — state.audioKey AFTER:', state.audioKey || '(empty)');
    // FIX: Always reset readingText — prevents old chapter's text from leaking into new chapter
    state.readingText = chapterReadingText || '';
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
      editChapterIndexFromUrl = rawChapter !== null;
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
