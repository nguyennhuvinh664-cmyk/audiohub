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

  /* ── Image compression (WebP with JPEG fallback) ── */
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
          // Try WebP first, fallback to JPEG for older browsers
          var webpDataUrl = canvas.toDataURL('image/webp', quality);
          if (webpDataUrl && webpDataUrl.indexOf('data:image/webp') === 0 && webpDataUrl.length > 22) {
            resolve(webpDataUrl);
          } else {
            resolve(canvas.toDataURL('image/jpeg', quality));
          }
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
        // 2. entryKey DISABLED — playlist entryKey can be stale/wrong from previous stories
        // Each story must match by title, not by blindly trusting entryKey
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
        // 4. Search audiohub-chapters-v1 for real CUID key — MATCH by title, not just pick any
        if (!editStoryId) {
          try {
            var _chStore = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
            var _normSelTitle = _normTxt(story.title || '');
            var _realKeys = Object.keys(_chStore).filter(function (k) {
              return k && !k.startsWith('pl-') && !k.startsWith('s_pl-') && !k.startsWith('s_') &&
                Array.isArray(_chStore[k]) && _chStore[k].length > 0;
            });
            // Try to match by title first — find CUID whose chapters match the selected story title
            var _matchedCuid = null;
            for (var _ki = 0; _ki < _realKeys.length; _ki++) {
              var _chs = _chStore[_realKeys[_ki]] || [];
              var _chTitles = _chs.map(function (c) { return _normTxt(c && c.title || ''); });
              // If any chapter title matches the selected story title, or story title is in chapter titles
              if (_chTitles.some(function (t) { return t && t.indexOf(_normSelTitle) !== -1; }) ||
                  _normSelTitle && _chTitles.some(function (t) { return t && _normSelTitle.indexOf(t) !== -1; })) {
                _matchedCuid = _realKeys[_ki];
                break;
              }
            }
            if (_matchedCuid) {
              editStoryId = _matchedCuid;
              console.log('[upload] 🔍 Found real CUID from chapters store (title match):', editStoryId);
            }
            // DON'T pick any CUID if title doesn't match — let server generate fresh CUID
          } catch (e) {}
        }
        // 5. Last resort: DISABLED — entryKey can be stale/wrong, never use as editStoryId
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

      // sessionStorage persist DISABLED — causes editStoryId leak on next upload visit
      try {
        if (editStoryId && !String(editStoryId).startsWith('pl-')) {
          // Restore hashtags + cover from story (form restoration only, no sessionStorage)
          var _tags = story.hashtags || story.tags || '';
          if (hashtagsInput && !hashtagsInput.value) hashtagsInput.value = Array.isArray(_tags) ? _tags.join(', ') : (_tags || '');
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

    // AUTO-SELECT DISABLED: sessionStorage auto-select causes editStoryId leak
    // User edits "tam quốc" → sessionStorage saves CUID → comes back to upload page
    // → auto-selects "tam quốc" → changes title to "thủy hử" → publishes →
    // chapter appended to "tam quốc" instead of creating new story!
    // Each new upload should start with editStoryId = '' (fresh CUID from server).
    setTimeout(function () {
      try {
        sessionStorage.removeItem('audiohub-editStoryId');
        sessionStorage.removeItem('audiohub-editStoryTitle');
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
        visibility: forceDraft ? 'Riêng tư' : 'Công khai', // Story-level always Công khai — chapter visibility is per-chapter
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
    // RESTORE DISABLED: sessionStorage restore causes story overwrites
    // (old editStoryId leaks into new story creation → PATCH overwrites wrong story)
    // Each new story must get a fresh CUID from the server.
    // if (!targetId) {
    //   try {
    //     var savedId = sessionStorage.getItem('audiohub-editStoryId') || '';
    //     ...
    //   } catch (e) {}
    // }
    console.log('[upload] 📖 CHAPTER APPEND — targetId:', targetId, '| chapterTitle:', built.payload.chapterTitle);

    // TITLE-BASED MATCH DISABLED: caused stories with similar titles to overwrite each other
    // TITLE-BASED MATCH DISABLED: caused stories with similar titles to overwrite each other.
    // Each story must use its own CUID — never match by title.

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
        readingText: built.payload.readingText || '',
        visibility: state.visibility || 'Công khai'
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
        readingText: built.payload.readingText || '',
        visibility: state.visibility || 'Công khai'
      };
      built.payload.chapters = [_firstChapter];
      built.payload.chapterCount = 1;
      console.log('[upload] 📖 NEW STORY — saving first chapter:', _firstChapter.title, '| audioKey:', _firstChapter.audioKey || '(empty)');
    }

    // ── UPSERT ──
    var story;
    try {
      story = window.AudioHubStories.upsert(built.payload, { skipD1Sync: true });
      console.log('[upload] upsert:', story ? story.id + ' | chapters: ' + (story.chapters ? story.chapters.length : 0) : 'NULL');

      // VERIFY: Read back from localStorage to confirm chapters saved correctly
      try {
        var _verifyStore = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
        var _verifyChapters = Array.isArray(_verifyStore[story.id]) ? _verifyStore[story.id] : [];
        console.log('[upload] VERIFY from localStorage — chapters:', _verifyChapters.length, '| expected:', built.payload.chapters ? built.payload.chapters.length : '?');
        _verifyChapters.forEach(function (ch, i) {
          console.log('[upload]   ch' + (i+1) + ':', { title: ch.title, audioKey: ch.audioKey || '(EMPTY)' });
        });
        // AUTO-REPAIR: if localStorage has fewer chapters, rewrite with all fields (including readingText)
        var _expectedCount = built.payload.chapters ? built.payload.chapters.length : 0;
        if (_verifyChapters.length < _expectedCount) {
          console.warn('[upload] ⚠ MISMATCH — localStorage has', _verifyChapters.length, 'chapters, expected', _expectedCount);
          try {
            var _slimChapters = built.payload.chapters.map(function (ch) {
              if (!ch) return ch;
              return { title: ch.title || '', audioKey: ch.audioKey || '', coverKey: ch.coverKey || '', readingText: ch.readingText || '', visibility: ch.visibility || 'Công khai' };
            });
            _verifyStore[story.id] = _slimChapters;
            localStorage.setItem('audiohub-chapters-v1', JSON.stringify(_verifyStore));
            var _reCheck = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
            var _reCount = Array.isArray(_reCheck[story.id]) ? _reCheck[story.id].length : 0;
            console.log('[upload] Repair result:', _reCount, 'chapters (with readingText)');
          } catch (e) { console.error('[upload] ❌ Repair failed — localStorage critically full:', e && e.message); }
        }
      } catch (e) { console.warn('[upload] Verify failed:', e); }
      // Always clear sessionStorage to prevent auto-select leak on next visit
      try {
        sessionStorage.removeItem('audiohub-editStoryId');
        sessionStorage.removeItem('audiohub-editStoryTitle');
        sessionStorage.removeItem('audiohub-editHashtags');
        sessionStorage.removeItem('audiohub-editCoverData');
        sessionStorage.removeItem('audiohub-editCoverKey');
      } catch (e) {}
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
        // Always use CUID as audio_key in D1. The upload flow (_uploadAudioToCloud) uploads
        // audio to R2 under the CUID key, so D1 must reference the CUID, not the a_* temp key.
        // Using a_* here causes 404 because R2 only has the CUID copy.
        _origAudioKey = story.id;

        // Story always "Công khai" on homepage — visibility is per-chapter (premium lock)
        var _allChapters = (_chaptersForD1.length ? _chaptersForD1 : (story.chapters || [])).map(function (c) {
          // Keep original audioKey — each chapter has its own R2 file under its audioKey
          // Do NOT replace a_* keys with CUID — that makes all chapters share the same audio
          var _ak = (c && c.audioKey) || '';
          return { title: (c && c.title) || '', audioKey: _ak, visibility: (c && c.visibility) || 'Công khai', readingText: (c && c.readingText) || '' };
        });
        console.log('[upload] 📊 Chapters:', _allChapters.map(function(c) { return c.title + ':' + (c.audioKey || 'NO_KEY') + ':' + (c.visibility || 'Công khai'); }));

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
            audio_key: _origAudioKey,
            chapters: _allChapters
          })
        }).then(function () {
          console.log('[upload] ✅ PATCH to D1 success:', story.id);

          // Safe redirect: only redirect once, after upload confirms
          var _patchRedirectDone = false;
          var _patchUploadConfirmed = false;
          function _patchSafeRedirect() {
            try { var ov = document.getElementById('upload-progress-overlay'); if (ov) ov.remove(); } catch(e) {}
            if (!_patchRedirectDone) {
              _patchRedirectDone = true;
              doRedirect(story.id);
            }
          }
          // Safety timeout: 120s — warn but do NOT redirect if upload still in progress
          setTimeout(function () {
            if (!_patchUploadConfirmed) {
              console.warn('[upload] ⚠ PATCH 120s timeout — upload may not have completed');
              try { var txt = document.getElementById('upload-progress-text'); if (txt) txt.textContent = 'Đang upload lâu hơn dự kiến...'; } catch(e) {}
            }
          }, 120000);

          // Force-sync chapter audioKeys via sync-chapters endpoint (PATCH uses COALESCE which may not overwrite null)
          try {
            var _chsForSync = (built.payload.chapters || []).map(function(c) {
              var _k = (c && c.audioKey) || '';
              // Keep original audioKey — each chapter has its own R2 file under its audioKey
              return { title: (c && c.title) || '', audioKey: _k, visibility: (c && c.visibility) || 'Công khai', readingText: (c && c.readingText) || '' };
            });
            if (_chsForSync.length) {
              fetch('/api/stories/' + encodeURIComponent(story.id) + '/sync-chapters', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + (localStorage.getItem('audiohub-auth-token') || '') },
                body: JSON.stringify({ chapters: _chsForSync })
              }).then(function(r) { return r.json(); }).then(function(d) {
                if (d && d.success) console.log('[upload] ✅ Synced chapter audioKeys to D1');
              }).catch(function() {});
            }
          } catch(e) {}
          // Upload audio to cloud (R2/Supabase) for this chapter
          function _patchUploadDone() { _patchSafeRedirect(); }

          // Chunked upload via Worker → R2 (replaces Supabase direct upload)
          var _CHUNK_SIZE = 10 * 1024 * 1024; // 10MB

          function _chunkedUpload(blob, key) {
            console.log('[upload] 🔧 Chunked upload:', key, '| size:', blob.size);
            var chunks = [];
            for (var i = 0; i < blob.size; i += _CHUNK_SIZE) {
              chunks.push(blob.slice(i, i + _CHUNK_SIZE));
            }
            var totalChunks = chunks.length;
            var storyId = String(story.id || window.currentStoryId || window._editStoryId || '');
            var _PAR = 3, _done = 0, _fail = false;

            return new Promise(function(resolve, reject) {
              function _uploadOne(idx) {
                if (_fail) return;
                var url = '/api/audio/' + encodeURIComponent(storyId) + '?key=' + encodeURIComponent(key) + '&action=chunk&index=' + idx;
                fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: chunks[idx] })
                  .then(function(r) { if (!r.ok) throw new Error('Chunk ' + idx + ' ' + r.status); return r.json(); })
                  .then(function() {
                    _done++;
                    console.log('[upload] ✅ Chunk', idx, 'OK (' + _done + '/' + totalChunks + ')');
                    if (_done >= totalChunks) {
                      var asmUrl = '/api/audio/' + encodeURIComponent(storyId) + '?key=' + encodeURIComponent(key) + '&action=assemble';
                      fetch(asmUrl, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ totalChunks: totalChunks, totalSize: blob.size, contentType: blob.type || 'audio/mpeg' })
                      }).then(function(r) { if (!r.ok) throw new Error('Assemble ' + r.status); return r.json(); })
                        .then(resolve).catch(reject);
                    } else if (_done + _PAR <= totalChunks) {
                      _uploadOne(_done + _PAR - 1);
                    }
                  })
                  .catch(function(err) { _fail = true; reject(err); });
              }
              for (var p = 0; p < Math.min(_PAR, totalChunks); p++) _uploadOne(p);
            });
          }

          // Verify R2 has the file
          function _verifyR2(key) {
            var url = '/api/audio/' + encodeURIComponent(String(story.id)) + '?key=' + encodeURIComponent(key);
            return fetch(url, { method: 'HEAD' }).then(function (res) {
              console.log('[upload] R2 VERIFY:', key, '→', res.status);
              return res.ok;
            }).catch(function () { return false; });
          }

          // PATCH: Upload EACH chapter's audio separately to R2 using its own audioKey
          (function _patchUploadAllChapters() {
            var _chapters = [];
            try {
              var _cs = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
              _chapters = Array.isArray(_cs[story.id]) ? _cs[story.id] : [];
            } catch (e) {}
            if (!_chapters.length) {
              _chapters = [{ title: '', audioKey: state.audioKey || story.id }];
            }

            var _hasStore = window.AudioHubStoryAudio && typeof window.AudioHubStoryAudio.get === 'function';
            var _uploaded = 0;
            var _total = _chapters.length;

            console.log('[upload] 📋 PATCH chapters to upload:', _total);

            // Show loading overlay for PATCH flow
            try {
              var _overlay = document.createElement('div');
              _overlay.id = 'upload-progress-overlay';
              _overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:system-ui,sans-serif;';
              _overlay.innerHTML = '<div style="font-size:48px;margin-bottom:16px">🎵</div>' +
                '<div style="font-size:20px;font-weight:600;margin-bottom:8px">Đang tải audio lên đám mây...</div>' +
                '<div id="upload-progress-text" style="font-size:14px;color:#aaa">Chuẩn bị upload ' + _total + ' chương</div>' +
                '<div style="margin-top:16px;width:300px;height:6px;background:#333;border-radius:3px;overflow:hidden">' +
                '<div id="upload-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#f59e0b,#ef4444);border-radius:3px;transition:width 0.3s"></div></div>' +
                '<div style="margin-top:24px;font-size:12px;color:#666">Không rời khỏi trang này cho đến khi hoàn tất</div>';
              document.body.appendChild(_overlay);
            } catch(e) {}

            function _patchUpdateProgress(pct, msg) {
              try {
                var bar = document.getElementById('upload-progress-bar');
                var txt = document.getElementById('upload-progress-text');
                if (bar) bar.style.width = pct + '%';
                if (txt) txt.textContent = msg || '';
              } catch(e) {}
            }

            function _patchUploadChapter(idx) {
              if (idx >= _total) {
                console.log('[upload] ✅ PATCH: all', _uploaded, '/', _total, 'chapters uploaded');
                _patchUploadConfirmed = true;
                state.audioFile = null;
                _patchUpdateProgress(100, 'Hoàn tất! Đang chuyển trang...');
                try { var ov = document.getElementById('upload-progress-overlay'); if (ov) ov.remove(); } catch(e) {}
                _patchUploadDone();
                return;
              }
              _patchUpdateProgress(Math.round((idx / _total) * 90), 'Đang upload chương ' + (idx + 1) + '/' + _total + '...');
              var ch = _chapters[idx];
              // Skip chapters without audioKey — do NOT fallback to story.id (CUID)
              // Fallback causes multiple chapters to share the same audio file
              if (!ch.audioKey) {
                console.log('[upload] ⚠ PATCH: Skipping chapter', idx + 1, '— no audioKey');
                _uploaded++;
                _patchUploadChapter(idx + 1);
                return;
              }
              var chKey = ch.audioKey;

              // Always use IndexedDB lookup — state.audioFile is only the LAST selected file
              var _blobPromise;
              if (_hasStore) {
                _blobPromise = window.AudioHubStoryAudio.get(chKey).then(function(blob) {
                  if (blob && blob.size > 1000) return blob;
                  return window.AudioHubStoryAudio.get(story.id).then(function(b2) {
                    if (b2 && b2.size > 1000) return b2;
                    // Fallback: use state.audioFile (still in memory from file input)
                    if (state.audioFile && state.audioFile.size > 1000) {
                      console.log('[upload] ℹ️ PATCH: Using state.audioFile as fallback for chapter', idx);
                      return state.audioFile;
                    }
                    return null;
                  });
                });
              } else {
                _blobPromise = Promise.resolve(
                  (state.audioFile && state.audioFile.size > 1000) ? state.audioFile : null
                );
              }

              _blobPromise.then(function(blob) {
                if (!blob || blob.size === 0) {
                  console.warn('[upload] ⚠ PATCH: no blob for chapter', idx, '| key:', chKey);
                  _uploaded++;
                  _patchUploadChapter(idx + 1);
                  return;
                }
                _chunkedUpload(blob, chKey).then(function() {
                  console.log('[upload] ✅ PATCH chapter', idx, 'uploaded | key:', chKey);
                  _uploaded++;
                  _patchUploadChapter(idx + 1);
                }).catch(function(e) {
                  console.warn('[upload] ⚠ PATCH chapter', idx, 'failed:', e && e.message);
                  _uploaded++;
                  _patchUploadChapter(idx + 1);
                });
              }).catch(function() {
                _uploaded++;
                _patchUploadChapter(idx + 1);
              });
            }

            _patchUploadChapter(0);
          })();
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
      visibility: 'Công khai',
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

        // 3. Upload audio to cloud (R2) under the chapter's audioKey (a_*).
        // The player reads chapter.audioKey from D1/localStorage, so the R2 file MUST
        // exist at that key. CUID copy is uploaded in background as backup.

        // Safe redirect: only redirect once, AFTER upload confirms or all retries exhausted
        var _redirectDone = false;
        var _uploadConfirmed = false;
        function _safeRedirect() {
          // Remove loading overlay before redirect
          try { var ov = document.getElementById('upload-progress-overlay'); if (ov) ov.remove(); } catch(e) {}
          if (!_redirectDone) {
            _redirectDone = true;
            doRedirect(realId);
          }
        }

        // Safety timeout: 120s — warn but do NOT redirect if upload still in progress
        setTimeout(function () {
          if (!_uploadConfirmed) {
            console.warn('[upload] ⚠ 120s safety timeout — upload may not have completed');
            try { var txt = document.getElementById('upload-progress-text'); if (txt) txt.textContent = 'Đang upload lâu hơn dự kiến...'; } catch(e) {}
          }
        }, 120000);

        console.log('[upload] 🔍 Pre-upload check | state.audioFile:', !!state.audioFile, '| size:', state.audioFile && state.audioFile.size, '| state.audioKey:', state.audioKey, '| realId:', realId);

        // SIMPLE UPLOAD: state.audioFile is the File object the user selected.
        // Upload it DIRECTLY to R2 — no IndexedDB lookup chain.
        // Then sync chapters to D1 so incognito/other devices know the audioKey.
        (function _uploadAndRedirect() {
          var _blob = state.audioFile;
          if (!_blob || _blob.size < 1000) {
            console.warn('[upload] ⚠ No state.audioFile to upload — redirecting anyway');
            _uploadConfirmed = true;
            _safeRedirect();
            return;
          }

          // Show loading overlay with progress
          var _totalMB = (_blob.size / 1024 / 1024).toFixed(1);
          try {
            var _overlay = document.createElement('div');
            _overlay.id = 'upload-progress-overlay';
            _overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:system-ui,sans-serif;';
            _overlay.innerHTML = '<div style="font-size:48px;margin-bottom:16px">🎵</div>' +
              '<div style="font-size:20px;font-weight:600;margin-bottom:8px">Đang tải audio lên đám mây...</div>' +
              '<div id="upload-progress-text" style="font-size:14px;color:#aaa">Chuẩn bị upload ' + _totalMB + ' MB</div>' +
              '<div style="margin-top:16px;width:300px;height:6px;background:#333;border-radius:3px;overflow:hidden">' +
              '<div id="upload-progress-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#f59e0b,#ef4444);border-radius:3px;transition:width 0.3s"></div></div>' +
              '<div style="margin-top:24px;font-size:12px;color:#666">Không rời khỏi trang này cho đến khi hoàn tất</div>';
            document.body.appendChild(_overlay);
          } catch(e) {}

          function _updateProgress(pct, msg) {
            try {
              var bar = document.getElementById('upload-progress-bar');
              var txt = document.getElementById('upload-progress-text');
              if (bar) bar.style.width = pct + '%';
              if (txt) txt.textContent = msg || '';
            } catch(e) {}
          }

          // Upload under the a_* key (per-chapter audioKey) — player reads this directly
          var _aKey = state.audioKey || '';
          var _r2Key = _aKey || realId;
          var _CHUNK_SIZE = 10 * 1024 * 1024; // 10MB per chunk

          console.log('[upload] 🎵 Chunked upload', _blob.size, 'bytes | key:', _r2Key);
          _updateProgress(2, 'Đang upload ' + _totalMB + ' MB...');

          // Split blob into chunks
          function _splitChunks(blob, size) {
            var chunks = [];
            for (var i = 0; i < blob.size; i += size) {
              chunks.push(blob.slice(i, i + size));
            }
            return chunks;
          }

          // Upload a single chunk via fetch
          function _uploadChunk(storyId, key, index, chunk) {
            var url = '/api/audio/' + encodeURIComponent(storyId) + '?key=' + encodeURIComponent(key) + '&action=chunk&index=' + index;
            return fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/octet-stream' }, body: chunk })
              .then(function(r) { if (!r.ok) throw new Error('Chunk ' + index + ' failed: ' + r.status); return r.json(); });
          }

          // Assemble all chunks into final file on R2
          function _assembleChunks(storyId, key, totalChunks, totalSize, contentType) {
            var url = '/api/audio/' + encodeURIComponent(storyId) + '?key=' + encodeURIComponent(key) + '&action=assemble';
            return fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ totalChunks: totalChunks, totalSize: totalSize, contentType: contentType || 'audio/mpeg' })
            }).then(function(r) { if (!r.ok) throw new Error('Assemble failed: ' + r.status); return r.json(); });
          }

          var _chunks = _splitChunks(_blob, _CHUNK_SIZE);
          var _totalChunks = _chunks.length;
          console.log('[upload] Split into', _totalChunks, 'chunks of', (_CHUNK_SIZE / 1024 / 1024), 'MB');

          // Upload chunks in parallel (3 at a time for speed)
          var _PARALLEL = 3;
          var _doneCount = 0;
          var _failed = false;

          function _onAllDone() {
            // All chunks uploaded — fire-and-forget assembly with retry (audio plays via chunk fallback while assembling)
            _uploadConfirmed = true;
            state.audioFile = null;
            _updateProgress(92, 'Đã upload xong! Đang ghép file...');
            console.log('[upload] All', _totalChunks, 'chunks uploaded. Firing assembly...');

            // Fire assembly in background — don't block redirect
            function _tryAssembly(retries) {
              _assembleChunks(realId, _r2Key, _totalChunks, _blob.size, _blob.type || 'audio/mpeg')
                .then(function() {
                  console.log('[upload] ✅ Assembled OK:', _r2Key, '| size:', _blob.size);
                })
                .catch(function(err) {
                  console.warn('[upload] ⚠ Assemble attempt failed (retries left:', retries, '):', err && err.message);
                  if (retries > 0) {
                    setTimeout(function() { _tryAssembly(retries - 1); }, 5000);
                  } else {
                    console.log('[upload] Assembly skipped — audio plays via chunk streaming fallback');
                  }
                });
            }
            _tryAssembly(3);

            // Sync chapters to D1
            try {
              var _cs = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
              var _chs = Array.isArray(_cs[realId]) ? _cs[realId] : [];
              if (_chs.length) {
                if (_chs[0]) _chs[0].audioKey = _r2Key;
                _cs[realId] = _chs;
                localStorage.setItem('audiohub-chapters-v1', JSON.stringify(_cs));

                var _token = localStorage.getItem('audiohub-auth-token') || '';
                if (_token) {
                  fetch('/api/stories/' + encodeURIComponent(realId) + '/sync-chapters', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + _token },
                    body: JSON.stringify({ chapters: _chs.map(function(c) {
                      return { title: (c && c.title) || '', audioKey: (c && c.audioKey) || '', visibility: (c && c.visibility) || 'Công khai', readingText: (c && c.readingText) || '' };
                    }) })
                  }).then(function(r) { return r.json(); }).then(function(d) {
                    if (d && d.success) console.log('[upload] ✅ Synced', _chs.length, 'chapters to D1 with audioKey:', _chs[0] && _chs[0].audioKey);
                  }).catch(function(e3) { console.warn('[upload] ⚠ D1 sync failed:', e3 && e3.message); });
                }
              }
            } catch (e) {}

            _updateProgress(100, 'Hoàn tất! Đang chuyển trang...');
            setTimeout(function() { _safeRedirect(); }, 300);
          }

          function _uploadOneChunk(idx) {
            if (_failed) return;
            _uploadChunk(realId, _r2Key, idx, _chunks[idx])
              .then(function() {
                _doneCount++;
                console.log('[upload] ✅ Chunk', idx, 'OK (' + _doneCount + '/' + _totalChunks + ')');
                var pct = Math.round((_doneCount / _totalChunks) * 88) + 2;
                _updateProgress(pct, 'Đã upload ' + _doneCount + '/' + _totalChunks + ' chunks...');
                if (_doneCount >= _totalChunks) _onAllDone();
                else if (_doneCount + _PARALLEL <= _totalChunks) _uploadOneChunk(_doneCount + _PARALLEL - 1);
              })
              .catch(function(err) {
                _failed = true;
                console.error('[upload] ❌ Chunk', idx, 'failed:', err && err.message);
                _updateProgress(0, '❌ Upload chunk ' + (idx + 1) + ' thất bại! Kiểm tra kết nối.');
                var _overlay = document.getElementById('upload-progress-overlay');
                if (_overlay) {
                  var _retryBtn = document.createElement('button');
                  _retryBtn.textContent = '↻ Thử lại';
                  _retryBtn.style.cssText = 'margin-top:16px;padding:10px 24px;background:#f59e0b;color:#000;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;';
                  _retryBtn.onclick = function() { location.reload(); };
                  _overlay.appendChild(_retryBtn);
                }
              });
          }

          // Kick off first batch
          for (var _pi = 0; _pi < Math.min(_PARALLEL, _totalChunks); _pi++) {
            _uploadOneChunk(_pi);
          }
        })();
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
    // NOTE: visibility will be set from chapter data below (after chapters are loaded)

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

    // Set visibility from CHAPTER's visibility (not story-level)
    var chapterVisibility = chapter.visibility || 'Công khai';
    setFieldValue(visibilitySelect, chapterVisibility);
    state.visibility = chapterVisibility;
    syncVisibilityButtons();

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
