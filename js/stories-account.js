(function () {
  var root = document.querySelector('.account-page');
  if (!root) return;

  var TAB_STORAGE_KEY = 'audiohub-account-tab-v1';
  var AVATAR_STORAGE_KEY = 'audiohub-account-avatar-v1';

  var tabButtons = Array.prototype.slice.call(document.querySelectorAll('[data-account-tab]'));
  var tabPanels = Array.prototype.slice.call(document.querySelectorAll('[data-account-panel]'));
  var tabCards = Array.prototype.slice.call(document.querySelectorAll('[data-account-tab]'));
  var contentButtons = Array.prototype.slice.call(document.querySelectorAll('[data-content-tab]'));
  var contentPanels = Array.prototype.slice.call(document.querySelectorAll('[data-content-panel]'));

  var avatarNode = document.querySelector('[data-account-avatar]');
  var avatarEditButton = document.querySelector('[data-account-avatar-edit]');
  var avatarInput = document.querySelector('[data-account-avatar-input]');

  var currentHistoryPage = 1;
  var currentFavoritesPage = 1;
  var currentPublishedPage = 1;
  var currentDraftPage = 1;
  var ITEMS_PER_PAGE = 20;
  var PLAYLIST_LIST_ITEMS_PER_PAGE = 6;
  var PLAYLIST_ITEMS_PER_PAGE = 10;

  var currentPlaylistListPage = 1;
  var currentPlaylistDetailPage = 1;

  // Track recently deleted story IDs so background API re-fetch doesn't bring them back
  var deletedStoryIds = {};
  // Skip background API re-fetch after delete (prevents re-render that resets checkbox state)
  var skipNextApiFetch = false;

  var mainTabButtons = Array.prototype.slice.call(document.querySelectorAll('[data-main-tab]'));
  var mainTabPanels = Array.prototype.slice.call(document.querySelectorAll('[data-main-panel]'));

  var storiesPublished = document.querySelector('[data-stories-published]');
  var storiesDrafts = document.querySelector('[data-stories-drafts]');
  var storiesPublishedNote = document.querySelector('[data-stories-published-note]');
  var storiesDraftsNote = document.querySelector('[data-stories-drafts-note]');
  var trashMount = document.querySelector('[data-audio-trash]');
  var trashNote = document.querySelector('[data-audio-trash-note]');
  var historyMount = document.querySelector('[data-library-history]');
  var favoritesMount = document.querySelector('[data-library-favorites]');

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function showToast(msg) {
    var t = document.createElement('div');
    t.className = 'account-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('is-visible'); }, 10);
    setTimeout(function () {
      t.classList.remove('is-visible');
      setTimeout(function () { t.remove(); }, 300);
    }, 2500);
  }

  function readTab() {
    try {
      return String(window.localStorage.getItem(TAB_STORAGE_KEY) || 'content');
    } catch (error) {
      return 'content';
    }
  }

  function writeTab(value) {
    try {
      window.localStorage.setItem(TAB_STORAGE_KEY, String(value || 'content'));
    } catch (error) {}
  }

  function setTab(name) {
    var next = String(name || 'content');
    var found = false;

    tabButtons.forEach(function (button) {
      var active = String(button.getAttribute('data-account-tab') || '') === next;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.setAttribute('tabindex', active ? '0' : '-1');
      if (active) found = true;
    });

    tabPanels.forEach(function (panel) {
      var active = String(panel.getAttribute('data-account-panel') || '') === next;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });

    tabCards.forEach(function (card) {
      var active = String(card.getAttribute('data-account-tab') || '') === next;
      card.classList.toggle('is-active', active);
      card.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    if (found) writeTab(next);
  }

  function initTabs() {
    if (!tabButtons.length || !tabPanels.length) return;
    var initial = readTab();
    if (!tabButtons.some(function (button) {
      return String(button.getAttribute('data-account-tab') || '') === initial;
    })) {
      initial = String(tabButtons[0].getAttribute('data-account-tab') || 'content');
    }

    setTab(initial);

    tabButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        setTab(button.getAttribute('data-account-tab'));
      });
    });

    window.addEventListener('storage', function (event) {
      if (event && event.key === TAB_STORAGE_KEY) setTab(readTab());
    });

    window.addEventListener('pageshow', function () {
      setTab(readTab());
    });
  }

  function readAvatar() {
    try {
      return String(window.localStorage.getItem(AVATAR_STORAGE_KEY) || '');
    } catch (error) {
      return '';
    }
  }

  function writeAvatar(value) {
    try {
      if (!value) window.localStorage.removeItem(AVATAR_STORAGE_KEY);
      else window.localStorage.setItem(AVATAR_STORAGE_KEY, String(value));
    } catch (error) {}
  }

  function applyAvatar(dataUrl) {
    if (!avatarNode) return;
    if (!dataUrl) {
      avatarNode.style.backgroundImage = '';
      avatarNode.textContent = 'AN';
      return;
    }
    avatarNode.style.backgroundImage = 'url("' + String(dataUrl).replace(/"/g, '&quot;') + '")';
    avatarNode.textContent = '';
  }

  function initAvatar() {
    if (!avatarNode || !avatarEditButton || !avatarInput) return;
    applyAvatar(readAvatar());
    avatarEditButton.addEventListener('click', function () { avatarInput.click(); });
    avatarInput.addEventListener('change', function () {
      var file = avatarInput.files && avatarInput.files[0];
      if (!file) return;
      if (!/^image\//.test(String(file.type || ''))) {
        window.alert('Vui lòng chọn ảnh hợp lệ.');
        return;
      }
      if (typeof file.size === 'number' && file.size > 3 * 1024 * 1024) {
        window.alert('Ảnh đại diện tối đa 3MB.');
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = typeof reader.result === 'string' ? reader.result : '';
        if (!dataUrl) return;
        applyAvatar(dataUrl);
        writeAvatar(dataUrl);
      };
      reader.readAsDataURL(file);
      try { avatarInput.value = ''; } catch (error) {}
    });
  }

  function normalizeText(value, fallback) {
    var text = String(value || '').trim();
    return text || fallback;
  }

  // Read persistent deleted IDs from localStorage (set by AudioHubStories.remove → addDeletedId)
  function getPersistentDeletedIds() {
    var uid = getMyUserId();
    var key = uid ? 'audiohub-deleted-stories-' + uid : 'audiohub-deleted-stories';
    try {
      return JSON.parse(localStorage.getItem(key) || '[]');
    } catch (e) { return []; }
  }

  // Get current user's ID from auth profile (for API filtering)
  function getMyUserId() {
    try {
      var raw = localStorage.getItem('audiohub-auth-profile');
      var p = raw ? JSON.parse(raw) : null;
      if (!p || !p.isLoggedIn) return null;
      return (p.id && String(p.id).trim()) || (p.email && String(p.email).trim().toLowerCase()) || null;
    } catch (e) { return null; }
  }

  function getStories() {
    if (!window.AudioHubStories || typeof window.AudioHubStories.read !== 'function') return [];
    var stories = window.AudioHubStories.read();
    if (!Array.isArray(stories)) return [];
    // Build lookup of ALL deleted IDs (in-memory + persistent localStorage)
    // In-memory: fast check during current session after delete
    // Persistent: survives page reload, covers race where syncFromApiFallback re-writes localStorage
    var persistentDeleted = getPersistentDeletedIds();
    var i, id;
    for (i = 0; i < persistentDeleted.length; i++) {
      id = persistentDeleted[i];
      if (id && !deletedStoryIds[id]) deletedStoryIds[id] = true;
    }
    var userId = getMyUserId();
    return stories.filter(function (s) {
      if (!s || !s.id || deletedStoryIds[s.id]) return false;
      // When logged in, only show stories that belong to this user
      // (localStorage may contain public stories from other users merged by syncFromApiFallback)
      if (userId) {
        var storyUserId = String(s.userId || s.user_id || '').trim().toLowerCase();
        var storyAuthor = String(s.author || '').trim().toLowerCase();
        // Local-only drafts (s_ prefix) always belong to current user
        if (String(s.id).startsWith('s_')) return true;
        // Match by userId if available
        if (storyUserId && storyUserId === userId) return true;
        // Fallback: match by author name === logged-in user's name
        var myName = String(localStorage.getItem('audiohub-auth-profile'));
        try { myName = JSON.parse(myName); myName = String(myName && myName.name || '').trim().toLowerCase(); } catch (e) { myName = ''; }
        if (myName && storyAuthor === myName) return true;
        // If no userId and author doesn't match, exclude (foreign story)
        if (!storyUserId) return false;
        return false;
      }
      // Not logged in — show all (demo mode)
      return true;
    });
  }

  // Truyện chỉ lưu local (chưa upload lên backend) có ID bắt đầu bằng 's_'
  function isLocalOnlyStory(story) {
    return String(story && story.id || '').startsWith('s_');
  }

  // Kiểm tra có đang dùng tài khoản thật (không phải demo)
  function isRealLogin() {
    return !!(window.AudioHubApi &&
      typeof window.AudioHubApi.isEnabled === 'function' &&
      window.AudioHubApi.isEnabled());
  }

  // Tự động xóa dữ liệu demo (s_ prefix) khỏi localStorage khi đăng nhập thật
  // Giữ lại tất cả stories thật (có ID từ backend) và listening history
  function clearLocalDemoStories() {
    if (!isRealLogin()) return;
    try {
      var raw = window.localStorage.getItem('audiohub-stories');
      if (!raw) return;
      var stories = JSON.parse(raw);
      if (!Array.isArray(stories) || !stories.length) return;
      var cleaned = stories.filter(function (s) {
        return s && s.id && !String(s.id).startsWith('s_');
      });
      if (cleaned.length !== stories.length) {
        window.localStorage.setItem('audiohub-stories', JSON.stringify(cleaned));
      }
    } catch (e) {}
  }

  function isDraft(story) {
    var visibility = String(story && story.visibility || '').trim().toLowerCase();
    return !visibility || visibility === 'riêng tư' || visibility === 'không công khai' || visibility === 'private' || visibility === 'draft';
  }

  function sortRecentDesc(list) {
    return list.slice().sort(function (a, b) {
      var ta = Date.parse(String((a && a.updatedAt) || (a && a.createdAt) || '')) || 0;
      var tb = Date.parse(String((b && b.updatedAt) || (b && b.createdAt) || '')) || 0;
      return tb - ta;
    });
  }

  function formatTime(value) {
    var time = Date.parse(String(value || ''));
    if (isNaN(time)) return '';
    return new Date(time).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function storyHref(story) {
    return '/story-detail?id=' + encodeURIComponent(String(story && story.id || ''));
  }

  function renderSimpleList(rootNode, items, emptyText, kind) {
    if (!rootNode) return;
    if (!items.length) {
      rootNode.innerHTML = '<p class="library-empty">' + escapeHtml(emptyText) + '</p>';
      return;
    }
    rootNode.innerHTML = '<ul class="account-list">' + items.map(function (story) {
      var title = escapeHtml(story.title || 'Truyện mới');
      var author = escapeHtml(story.author || 'Ẩn danh');
      var genre = escapeHtml(story.genre || 'Truyện audio');
      var updated = formatTime(story.updatedAt || story.createdAt);
      return '' +
        '<li>' +
          '<strong><a href="' + storyHref(story) + '">' + title + '</a></strong>' +
          '<small>' + author + ' · ' + genre + (updated ? (' · Cập nhật ' + escapeHtml(updated)) : '') + '</small>' +
          (kind === 'draft' ? '<div class="account-note">Bản nháp lưu trong trình duyệt.</div>' : '') +
        '</li>';
    }).join('') + '</ul>';
  }

  function renderStoriesFromList(stories) {
    // Deduplicate by title (DB may have duplicate rows from repeated syncs)
    var deduped = [];
    var seenTitles = {};
    (stories || []).forEach(function (s) {
      var key = (s.title || '').trim().toLowerCase();
      if (!key) { deduped.push(s); return; }
      if (seenTitles[key]) return;
      seenTitles[key] = true;
      deduped.push(s);
    });
    var sorted = sortRecentDesc(deduped);
    var published = sorted.filter(function (story) { return !isDraft(story); });
    var drafts = sorted.filter(isDraft);

    renderStorySection(published, storiesPublished, 'Chưa có truyện nào được đăng.', currentPublishedPage, 'published');
    renderStorySection(drafts, storiesDrafts, 'Chưa có bản nháp nào.', currentDraftPage, 'draft');

    if (storiesPublishedNote) {
      storiesPublishedNote.classList.toggle('is-hidden', !!published.length);
      storiesPublishedNote.textContent = published.length ? '' : 'Chưa có truyện đã đăng.';
    }
    if (storiesDraftsNote) {
      storiesDraftsNote.classList.toggle('is-hidden', !!drafts.length);
      storiesDraftsNote.textContent = drafts.length ? '' : 'Chưa có nháp nào.';
    }
    if (document.querySelector('[data-content-tab="playlist"]')) {
      document.querySelector('[data-content-tab="playlist"]').textContent = 'Truyện đã lưu';
    }
  }

  function renderStoriesSection() {
    // Always render local stories first (instant)
    var allStories = getStories();
    var nonLocal = allStories.filter(function (s) { return !isLocalOnlyStory(s); });
    var localDrafts = allStories.filter(isLocalOnlyStory);
    renderStoriesFromList(nonLocal.concat(localDrafts));

    // Skip background API re-fetch right after delete (prevents re-render that undoes the delete)
    if (skipNextApiFetch) {
      skipNextApiFetch = false;
      return;
    }

    // Then fetch from API in background (if logged in)
    if (isRealLogin()) {
      var userId = getMyUserId();
      var apiUrl = userId ? '/stories?user_id=' + encodeURIComponent(userId) : '/stories';
      window.AudioHubApi.request(apiUrl, { method: 'GET' })
        .then(function (response) {
          var apiStories = Array.isArray(response) ? response : [];
          // ALWAYS re-read persistent deleted IDs from localStorage (not just in-memory cache)
          // This ensures stories deleted in another session/tab are still filtered
          var persistentDeleted = getPersistentDeletedIds();
          var deletedMap = {};
          var i, id;
          for (i = 0; i < persistentDeleted.length; i++) {
            id = persistentDeleted[i];
            if (id) deletedMap[id] = true;
          }
          // Also merge in-memory deletions (current session)
          for (var k in deletedStoryIds) {
            if (deletedStoryIds[k]) deletedMap[k] = true;
          }
          // Filter out deleted stories from API response
          var filtered = apiStories.filter(function (s) { return s && s.id && !deletedMap[s.id]; });
          // Merge with local stories (don't let API response replace entire list)
          var localStories = getStories();
          var localById = {};
          localStories.forEach(function (s) { if (s && s.id) localById[s.id] = s; });
          var apiById = {};
          filtered.forEach(function (s) { apiById[s.id] = s; });
          // Local stories NOT in API response (e.g. s_ drafts, or API missed them)
          var localOnly = localStories.filter(function (s) { return s && s.id && !apiById[s.id]; });
          var merged = filtered.concat(localOnly);
          // Always render (even if empty — clears stale list when all stories deleted)
          renderStoriesFromList(merged);
        })
        .catch(function () {});
    }
  }

  function readLibrary() {
    try {
      var raw = window.localStorage.getItem('audiohub-library');
      var parsed = raw ? JSON.parse(raw) : {};
      return {
        history: Array.isArray(parsed.history) ? parsed.history : [],
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : []
      };
    } catch (error) {
      return { history: [], favorites: [] };
    }
  }

  function renderLibrarySections() {
    var lib = readLibrary();
    buildHistoryList(sortRecentDesc(lib.history || []), currentHistoryPage);
    buildFavoriteList(lib.favorites || [], currentFavoritesPage);

    var allStories = getStories();
    var storiesCount = isRealLogin()
      ? allStories.filter(function(s) { return !isLocalOnlyStory(s); }).length
      : allStories.length;

    var stats = {
      favorites: (lib.favorites || []).length,
      history: (lib.history || []).length,
      stories: storiesCount
    };
    document.querySelectorAll('[data-library-stat="favorites"]').forEach(function (node) { node.textContent = String(stats.favorites); });
    document.querySelectorAll('[data-library-stat="history"]').forEach(function (node) { node.textContent = String(stats.history); });
    document.querySelectorAll('[data-library-stat="stories"]').forEach(function (node) { node.textContent = String(stats.stories); });
    var cards = Array.prototype.slice.call(document.querySelectorAll('[data-account-tab]'));
    cards.forEach(function (card) {
      var key = card.getAttribute('data-account-tab') || '';
      var countNode = card.querySelector('strong');
      if (!countNode) return;
      if (key === 'content') countNode.textContent = String(stats.stories);
      if (key === 'history') countNode.textContent = String(stats.history);
      if (key === 'favorites') countNode.textContent = String(stats.favorites);
    });

    if (typeof window.renderAccountLibrary === 'function') {
      window.renderAccountLibrary();
    }
  }

  function removeFromCollection(type, key) {
    var lib = readLibrary();
    lib[type] = (lib[type] || []).filter(function (item) { return item.key !== key; });
    try {
      window.localStorage.setItem('audiohub-library', JSON.stringify(lib));
    } catch (error) {}
  }

  function bindPagination() {
    document.addEventListener('click', function (event) {
      var pageNumBtn = event.target.closest('[data-page-num]');
      if (pageNumBtn) {
        var type = pageNumBtn.getAttribute('data-page-type');
        var num = Math.max(1, parseInt(pageNumBtn.getAttribute('data-page-num') || '1', 10));
        var plId = pageNumBtn.getAttribute('data-playlist-id');
        if (type === 'history') { currentHistoryPage = num; renderLibrarySections(); return; }
        if (type === 'favorites') { currentFavoritesPage = num; renderLibrarySections(); return; }
        if (type === 'published') { currentPublishedPage = num; renderStoriesSection(); return; }
        if (type === 'draft') { currentDraftPage = num; renderStoriesSection(); return; }
        if (type === 'playlist-list') { currentPlaylistListPage = num; renderPlaylist(); return; }
        if (type === 'playlist') { currentPlaylistDetailPage = num; renderPlaylistDetail(); return; }
      }

      var prevBtn = event.target.closest('[data-page-prev]');
      var nextBtn = event.target.closest('[data-page-next]');
      if (!prevBtn && !nextBtn) return;

      var btn = prevBtn || nextBtn;
      var type = btn.getAttribute('data-page-type');

      if (type === 'history') {
        if (prevBtn) currentHistoryPage = Math.max(1, currentHistoryPage - 1);
        if (nextBtn) currentHistoryPage++;
        renderLibrarySections();
      } else if (type === 'favorites') {
        if (prevBtn) currentFavoritesPage = Math.max(1, currentFavoritesPage - 1);
        if (nextBtn) currentFavoritesPage++;
        renderLibrarySections();
      } else if (type === 'published') {
        if (prevBtn) currentPublishedPage = Math.max(1, currentPublishedPage - 1);
        if (nextBtn) currentPublishedPage++;
        renderStoriesSection();
      } else if (type === 'draft') {
        if (prevBtn) currentDraftPage = Math.max(1, currentDraftPage - 1);
        if (nextBtn) currentDraftPage++;
        renderStoriesSection();
      } else if (type === 'playlist-list') {
        if (prevBtn) currentPlaylistListPage = Math.max(1, currentPlaylistListPage - 1);
        if (nextBtn) currentPlaylistListPage++;
        renderPlaylist();
      } else if (type === 'playlist') {
        if (prevBtn) currentPlaylistDetailPage = Math.max(1, currentPlaylistDetailPage - 1);
        if (nextBtn) currentPlaylistDetailPage++;
        renderPlaylistDetail();
      }
    });
  }

  function positionStoryMenu(panel, menuBtn) {
    if (!panel || !menuBtn) return;
    var rect = menuBtn.getBoundingClientRect();
    var viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    var viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    var panelWidth = panel.offsetWidth || 180;
    var panelHeight = panel.offsetHeight || 220;
    var left = Math.min(rect.right - panelWidth, viewportWidth - panelWidth - 8);
    var top = Math.min(rect.bottom + 4, viewportHeight - panelHeight - 8);

    left = Math.max(8, left);
    top = Math.max(8, top);

    panel.style.position = 'fixed';
    panel.style.top = top + 'px';
    panel.style.left = left + 'px';
    panel.style.right = 'auto';
    panel.style.zIndex = '10000';
  }

  function updateStoryMenuPositions() {
    document.querySelectorAll('[data-story-menu-panel]').forEach(function (panel) {
      if (panel.classList.contains('is-hidden')) return;
      var storyId = panel.getAttribute('data-story-menu-panel');
      var menuBtn = storyId ? document.querySelector('[data-story-menu="' + storyId + '"]') : null;
      if (menuBtn) positionStoryMenu(panel, menuBtn);
    });
  }

  function openStoryMenu(storyId, menuBtn) {
    if (!storyId || !menuBtn) return;
    var panel = document.querySelector('[data-story-menu-panel="' + storyId + '"]');
    if (!panel) return;

    var isOpen = !panel.classList.contains('is-hidden');
    closeAllMenus();
    if (isOpen) return;

    panel.classList.remove('is-hidden');
    document.body.appendChild(panel);
    positionStoryMenu(panel, menuBtn);

    var scrollParent = menuBtn.closest('.account-scroll-list');
    if (scrollParent) {
      scrollParent.addEventListener('scroll', function () {
        positionStoryMenu(panel, menuBtn);
      }, { passive: true });
    }
  }

  function bindStoryMenuActions() {
    document.addEventListener('change', function (event) {
      var selectAll = event.target.closest('[data-select-all]');
      if (selectAll) {
        var container = selectAll.closest('[data-stories-published], [data-stories-drafts]');
        if (!container) return;
        var checkboxes = container.querySelectorAll('[data-story-checkbox]');
        checkboxes.forEach(function (cb) { cb.checked = selectAll.checked; });
        updateDeleteButton(container);
        return;
      }

      var storyCheckbox = event.target.closest('[data-story-checkbox]');
      if (storyCheckbox) {
        var container = storyCheckbox.closest('[data-stories-published], [data-stories-drafts]');
        if (container) updateDeleteButton(container);
        return;
      }
    });

    function closeAllMenus() {
      document.querySelectorAll('[data-story-menu-panel]').forEach(function (p) {
        p.classList.add('is-hidden');
        p.style.position = '';
        p.style.top = '';
        p.style.left = '';
        p.style.right = '';
        p.style.zIndex = '';
        // Move back to original parent if it was moved to body
        try {
          if (p.parentElement === document.body) {
            var storyId = p.getAttribute('data-story-menu-panel');
            var btn = document.querySelector('[data-story-menu="' + storyId + '"]');
            if (btn) {
              var wrap = btn.closest('.yt-card__menu-wrap');
              if (wrap) wrap.appendChild(p);
            }
          }
        } catch (e) {}
      });
      document.querySelectorAll('.account-item-menu-wrap').forEach(function (wrap) { wrap.classList.remove('is-open'); });
    }

    // Close menus on SPA navigation (popstate, hashchange, spa:navigated)
    window.addEventListener('popstate', closeAllMenus);
    window.addEventListener('hashchange', closeAllMenus);
    window.addEventListener('resize', updateStoryMenuPositions);
    window.addEventListener('scroll', updateStoryMenuPositions, true);
    document.addEventListener('spa:navigated', closeAllMenus);

    document.addEventListener('click', function (event) {
      // close all menus if clicking outside
      if (!event.target.closest('[data-story-menu-panel]') && !event.target.closest('[data-story-menu]')) {
        closeAllMenus();
      }

      // toggle 3-dot menu
      var menuBtn = event.target.closest('[data-story-menu], .account-item-menu-btn');
      if (menuBtn) {
        event.preventDefault();
        event.stopPropagation();
        var sid = menuBtn.getAttribute('data-story-menu');
        if (!sid) return;
        openStoryMenu(sid, menuBtn);
        return;
      }

      // add to playlist (bộ truyện) — show chapter picker
      var addPlaylistBtn = event.target.closest('[data-story-add-playlist]');
      if (addPlaylistBtn) {
        var storyId = addPlaylistBtn.getAttribute('data-story-add-playlist');
        var storyTitle = addPlaylistBtn.getAttribute('data-story-title') || '';
        var storyAuthor = addPlaylistBtn.getAttribute('data-story-author') || '';
        var storyGenre = addPlaylistBtn.getAttribute('data-story-genre') || '';
        var storyHref = addPlaylistBtn.getAttribute('data-story-href') || '';
        var playlists = readPlaylists();
        document.querySelectorAll('[data-story-menu-panel]').forEach(function (p) { p.classList.add('is-hidden'); });

        var existing = document.getElementById('playlist-picker-modal');
        if (existing) existing.remove();

        if (!playlists.length) {
          showToast('Bạn chưa có bộ truyện nào. Hãy tạo trong tab "Truyện đã lưu".');
          return;
        }

        // Get story chapters from localStorage
        var storyObj = null;
        if (window.AudioHubStories && typeof window.AudioHubStories.getById === 'function') {
          storyObj = window.AudioHubStories.getById(storyId);
        }
        var chapters = (storyObj && Array.isArray(storyObj.chapters) && storyObj.chapters.length)
          ? storyObj.chapters
          : [];
        // Fallback: parse readingText for chapter headers
        if (!chapters.length && storyObj && storyObj.readingText) {
          var lines = String(storyObj.readingText).split(/\r?\n/);
          lines.forEach(function (line) {
            var m = line.trim().match(/^(?:#*\s*)?(?:Chương|Chuong|Chapter)\s+(\d+)\s*[:\-–—:]\s*(.*)/i);
            if (m) chapters.push({ chapterNumber: Number(m[1]), title: m[2].trim() || '' });
          });
        }
        // If still no chapters, create a single "chapter 1"
        if (!chapters.length) {
          chapters.push({ chapterNumber: 1, title: storyObj && storyObj.chapterTitle ? storyObj.chapterTitle : '' });
        }

        // Find which chapters are already in each playlist
        function _chaptersInPlaylist(pl) {
          var entries = pl.entries || [];
          var keys = {};
          entries.forEach(function (e) {
            if (e.key === storyId && typeof e.chapterIndex === 'number') keys[e.chapterIndex] = true;
          });
          return keys;
        }

        var modal = document.createElement('div');
        modal.id = 'playlist-picker-modal';
        modal.className = 'pl-picker-backdrop';

        // Step 1: Pick playlist
        modal.innerHTML = '' +
          '<div class="pl-picker">' +
            '<div class="pl-picker__header">' +
              '<span>Thêm "' + escapeHtml(storyTitle) + '" vào bộ truyện</span>' +
              '<button type="button" class="pl-picker__close" id="pl-picker-close"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            '<ul class="pl-picker__list">' +
              playlists.map(function (pl) {
                var added = _chaptersInPlaylist(pl);
                var addedCount = Object.keys(added).length;
                return '<li>' +
                  '<button type="button" class="pl-picker__item" data-pick-pl="' + escapeHtml(pl.id) + '">' +
                    '<span class="pl-picker__check"><i class="fa-solid fa-check"></i></span>' +
                    '<span class="pl-picker__name">' + escapeHtml(pl.name) + '</span>' +
                    '<span class="pl-picker__count">' + addedCount + '/' + chapters.length + ' chương</span>' +
                  '</button>' +
                '</li>';
              }).join('') +
            '</ul>' +
          '</div>';

        document.body.appendChild(modal);

        modal.addEventListener('click', function (e) {
          if (e.target === modal || e.target.closest('#pl-picker-close')) {
            modal.remove();
            return;
          }
          var pickBtn = e.target.closest('[data-pick-pl]');
          if (!pickBtn) return;
          var plId = pickBtn.getAttribute('data-pick-pl');
          var lists = readPlaylists();
          var target = null;
          lists.forEach(function (p) { if (p.id === plId) target = p; });
          if (!target) return;

          // Step 2: Show chapter picker for this playlist
          var added = _chaptersInPlaylist(target);
          var allAdded = chapters.length === Object.keys(added).length;

          var chapterHtml = '<div class="pl-picker__chapters">' +
            '<div class="pl-picker__ch-header">' +
              '<button type="button" class="pl-picker__back" id="pl-picker-back"><i class="fa-solid fa-arrow-left"></i></button>' +
              '<span>Chọn chương — ' + escapeHtml(target.name) + '</span>' +
            '</div>' +
            '<label class="pl-picker__select-all"><input type="checkbox" id="pl-select-all"' + (allAdded ? ' checked' : '') + ' /> Chọn tất cả (' + chapters.length + ' chương)</label>' +
            '<ul class="pl-picker__ch-list">' +
              chapters.map(function (ch, i) {
                var chTitle = ch.title || ('Chương ' + (i + 1));
                var isChecked = !!added[i];
                return '<li><label class="pl-picker__ch-item"><input type="checkbox" data-ch-idx="' + i + '"' + (isChecked ? ' checked' : '') + ' /><span>Chương ' + (i + 1) + ': ' + escapeHtml(chTitle) + '</span></label></li>';
              }).join('') +
            '</ul>' +
            '<div class="pl-picker__ch-actions"><button type="button" class="btn btn--primary" id="pl-save-chapters">Lưu</button></div>' +
          '</div>';

          // Replace modal content
          var pickerEl = modal.querySelector('.pl-picker');
          if (pickerEl) pickerEl.innerHTML = chapterHtml;

          // Back button
          var backBtn = modal.querySelector('#pl-picker-back');
          if (backBtn) backBtn.addEventListener('click', function () { modal.remove(); });

          // Select all checkbox
          var selectAllCb = modal.querySelector('#pl-select-all');
          if (selectAllCb) selectAllCb.addEventListener('change', function () {
            var checked = this.checked;
            modal.querySelectorAll('[data-ch-idx]').forEach(function (cb) { cb.checked = checked; });
          });

          // Save button
          var saveBtn = modal.querySelector('#pl-save-chapters');
          if (saveBtn) saveBtn.addEventListener('click', function () {
            var lists2 = readPlaylists();
            var target2 = null;
            lists2.forEach(function (p) { if (p.id === plId) target2 = p; });
            if (!target2) return;
            target2.entries = target2.entries || [];

            // Remove existing entries for this story
            target2.entries = target2.entries.filter(function (e) { return e.key !== storyId; });

            // Add selected chapters
            var addedCount = 0;
            modal.querySelectorAll('[data-ch-idx]').forEach(function (cb) {
              if (!cb.checked) return;
              var idx = Number(cb.getAttribute('data-ch-idx'));
              var ch = chapters[idx] || {};
              var chNum = idx + 1;
              var chTitle = ch.title || ('Chương ' + chNum);
              var baseHref = storyHref || ('story-detail?id=' + encodeURIComponent(storyId));
              if (baseHref.indexOf('playlistId=') === -1) {
                baseHref += (baseHref.indexOf('?') >= 0 ? '&' : '?') + 'playlistId=' + encodeURIComponent(plId);
              }
              target2.entries.push({
                key: storyId,
                title: storyTitle,
                chapterTitle: chTitle,
                chapterIndex: idx,
                author: storyAuthor,
                genre: storyGenre,
                href: baseHref,
                status: 'listening',
                progress: 0,
                addedAt: new Date().toISOString()
              });
              addedCount++;
            });

            writePlaylists(lists2);
            modal.remove();
            renderPlaylist();
            if (addedCount) {
              showToast('Đã thêm ' + addedCount + ' chương vào "' + target2.name + '".');
            } else {
              showToast('Đã xóa tất cả chương khỏi "' + target2.name + '".');
            }
          });
        });
        return;
      }

      // delete single story
      var deleteOneBtn = event.target.closest('[data-story-delete-one]');
      if (deleteOneBtn) {
        var sid = deleteOneBtn.getAttribute('data-story-delete-one');
        if (!sid) return;
        if (!window.confirm('Xóa truyện này?')) return;
        deleteStoriesByIds([sid]);
        currentPublishedPage = 1;
        currentDraftPage = 1;
        renderStoriesSection();
        return;
      }

      var selectAllBtn = event.target.closest('[data-select-all-items]');
      if (selectAllBtn) {
        var container = selectAllBtn.closest('[data-stories-published], [data-stories-drafts]');
        if (container) {
          var checkboxes = container.querySelectorAll('[data-story-checkbox]');
          checkboxes.forEach(function (cb) { cb.checked = true; });
          var selectToggle = container.querySelector('[data-select-all]');
          if (selectToggle) selectToggle.checked = true;
          updateDeleteButton(container);
        }
        return;
      }

      var deselectAllBtn = event.target.closest('[data-deselect-all-items]');
      if (deselectAllBtn) {
        var container = deselectAllBtn.closest('[data-stories-published], [data-stories-drafts]');
        if (container) {
          var checkboxes = container.querySelectorAll('[data-story-checkbox]');
          checkboxes.forEach(function (cb) { cb.checked = false; });
          var selectToggle = container.querySelector('[data-select-all]');
          if (selectToggle) selectToggle.checked = false;
          updateDeleteButton(container);
        }
        return;
      }

      var deleteBtn = event.target.closest('[data-delete-selected]');
      if (deleteBtn) {
        // Find checked checkboxes — try container first, fallback to whole page
        var container = deleteBtn.closest('[data-stories-published], [data-stories-drafts]');
        var checked = Array.prototype.slice.call(
          (container || document).querySelectorAll('[data-story-checkbox]:checked')
        );
        if (!checked.length) { alert('Hãy chọn ít nhất 1 truyện trước khi xóa.'); return; }
        var ids = checked.map(function (cb) { return cb.getAttribute('data-story-id'); }).filter(Boolean);
        if (!ids.length) return;
        if (!window.confirm('Xóa ' + ids.length + ' truyện đã chọn?')) return;
        deleteStoriesByIds(ids);
        currentPublishedPage = 1;
        currentDraftPage = 1;
        renderStoriesSection();
        return;
      }

      var pagePrev = event.target.closest('[data-page-prev]');
      var pageNext = event.target.closest('[data-page-next]');
      if (pagePrev || pageNext) {
        var btn = pagePrev || pageNext;
        var type = btn.getAttribute('data-page-type');
        if (type === 'history') {
          currentHistoryPage = Math.max(1, currentHistoryPage + (pageNext ? 1 : -1));
          renderLibrarySections();
        } else if (type === 'favorites') {
          currentFavoritesPage = Math.max(1, currentFavoritesPage + (pageNext ? 1 : -1));
          renderLibrarySections();
        } else if (type === 'published') {
          currentPublishedPage = Math.max(1, currentPublishedPage + (pageNext ? 1 : -1));
          renderStoriesSection();
        } else if (type === 'draft') {
          currentDraftPage = Math.max(1, currentDraftPage + (pageNext ? 1 : -1));
          renderStoriesSection();
        }
      }
    });
  }

  function updateDeleteButton(container) {
    if (!container) return;
    var checked = container.querySelectorAll('[data-story-checkbox]:checked').length;
    var deleteBtn = container.querySelector('[data-delete-selected]');
    if (deleteBtn) {
      deleteBtn.disabled = checked === 0;
      deleteBtn.innerHTML = '<i class="fa-solid fa-trash"></i> ' + (checked > 0 ? ('Xóa ' + checked + ' đã chọn') : 'Xóa đã chọn');
    }
  }

  function deleteStoriesByIds(ids) {
    if (!window.AudioHubStories || typeof window.AudioHubStories.remove !== 'function') return;
    // Skip the background API re-fetch so deleted stories don't reappear from server
    skipNextApiFetch = true;
    ids.forEach(function (id) {
      // Track as deleted so background API re-fetch won't bring it back
      deletedStoryIds[id] = true;
      window.AudioHubStories.remove(id);
    });
  }

  function bindCollectionActions() {
    document.addEventListener('click', function (event) {
      var button = event.target && event.target.closest ? event.target.closest('[data-library-remove]') : null;
      if (!button) return;
      var type = button.getAttribute('data-library-remove');
      var key = button.getAttribute('data-story-key');
      if (!type || !key) return;

      // Xóa item khỏi collection (history hoặc favorites)
      removeFromCollection(type, key);

      // Nếu là history, xóa cả listenHistory của story
      if (type === 'history') {
        if (window.AudioHubStories && typeof window.AudioHubStories.clearListenHistory === 'function') {
          window.AudioHubStories.clearListenHistory(key);
        }
      }

      renderLibrarySections();
    });
  }

  function buildHistoryList(items, page) {
    if (!historyMount) return;
    if (!items.length) {
      historyMount.innerHTML = '<p class="library-empty">Chưa có lịch sử nghe nào.</p>';
      return;
    }

    var start = (page - 1) * ITEMS_PER_PAGE;
    var end = start + ITEMS_PER_PAGE;
    var paged = items.slice(start, end);
    var totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);

    var html = '<ul class="history-youtube-list">' + paged.map(function (item) {
      return '' +
        '<li class="history-youtube-item">' +
          '<a class="history-youtube-thumb" href="' + escapeHtml(item.href) + '" style="background:' + deriveThumbStyle(item) + '"' + buildThumbDataAttrs(item) + '><span>' + escapeHtml(deriveThumbLabel(item)) + '</span></a>' +
          '<div class="history-youtube-body">' +
            '<a class="history-youtube-title" href="' + escapeHtml(item.href) + '">' + escapeHtml(item.title || 'AudioHub Story') + '</a>' +
            '<p class="history-youtube-meta">' + escapeHtml(item.author || 'Ẩn danh') + ' · ' + escapeHtml(item.genre || 'Truyện audio') + '</p>' +
            '<p class="history-youtube-note">' + escapeHtml(item.progress || 'Đang nghe') + (item.note ? (' · ' + escapeHtml(item.note)) : '') + '</p>' +
            '<div class="history-youtube-actions">' +
              '<a href="' + escapeHtml(item.href) + '" class="library-open"><i class="fa-solid fa-play"></i> Tiếp tục</a>' +
              '<button type="button" class="library-remove" data-library-remove="history" data-story-key="' + escapeHtml(item.key) + '"><i class="fa-solid fa-xmark"></i> Xóa</button>' +
            '</div>' +
          '</div>' +
        '</li>';
    }).join('') + '</ul>';

    historyMount.innerHTML = html;

    var paginationWrap = document.querySelector('[data-pagination-wrap="history"]');
    if (paginationWrap) {
      paginationWrap.innerHTML = totalPages > 1 ? buildPagination(page, totalPages, 'history') : '';
    }

    hydrateLibraryThumbs(historyMount);
  }

  function buildFavoriteList(items, page) {
    if (!favoritesMount) return;
    if (!items.length) {
      favoritesMount.innerHTML = '<p class="library-empty">Chưa có truyện yêu thích nào được lưu.</p>';
      return;
    }

    var start = (page - 1) * ITEMS_PER_PAGE;
    var end = start + ITEMS_PER_PAGE;
    var paged = items.slice(start, end);
    var totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);

    var html = '<ul class="favorites-youtube-grid">' + paged.map(function (item) {
      return '' +
        '<li class="favorite-youtube-card">' +
          '<a class="favorite-youtube-thumb" href="' + escapeHtml(item.href) + '" style="background:' + deriveThumbStyle(item) + '"' + buildThumbDataAttrs(item) + '><span>' + escapeHtml(deriveThumbLabel(item)) + '</span></a>' +
          '<div class="favorite-youtube-body">' +
            '<a class="favorite-youtube-title" href="' + escapeHtml(item.href) + '">' + escapeHtml(item.title || 'AudioHub Story') + '</a>' +
            '<p class="favorite-youtube-meta">' + escapeHtml(item.author || 'Ẩn danh') + '</p>' +
            '<p class="favorite-youtube-sub">' + escapeHtml(item.genre || 'Truyện audio') + '</p>' +
            '<div class="favorite-youtube-actions">' +
              '<a href="' + escapeHtml(item.href) + '" class="library-open"><i class="fa-solid fa-arrow-up-right-from-square"></i> Mở</a>' +
              '<button type="button" class="library-remove" data-library-remove="favorites" data-story-key="' + escapeHtml(item.key) + '"><i class="fa-solid fa-xmark"></i> Bỏ lưu</button>' +
            '</div>' +
          '</div>' +
        '</li>';
    }).join('') + '</ul>';

    favoritesMount.innerHTML = html;

    var paginationWrap = document.querySelector('[data-pagination-wrap="favorites"]');
    if (paginationWrap) {
      paginationWrap.innerHTML = totalPages > 1 ? buildPagination(page, totalPages, 'favorites') : '';
    }

    hydrateLibraryThumbs(favoritesMount);
  }

  function buildPagination(current, total, type, playlistId) {
    var attr = playlistId ? ' data-playlist-id="' + playlistId + '"' : '';
    var html = '<div class="account-pagination">';
    // prev
    html += '<button type="button" class="account-page-btn" data-page-prev data-page-type="' + type + '"' + attr + ' ' + (current === 1 ? 'disabled' : '') + '><i class="fa-solid fa-chevron-left"></i></button>';

    // numeric pages
    function pushPage(num, isActive) {
      html += '<button type="button" class="account-page-btn' + (isActive ? ' is-active' : '') + '" data-page-num="' + num + '" data-page-type="' + type + '"' + (playlistId ? ' data-playlist-id="' + playlistId + '"' : '') + '>' + num + '</button>';
    }

    if (total <= 7) {
      for (var i = 1; i <= total; i++) { pushPage(i, i === current); }
    } else {
      pushPage(1, current === 1);
      if (current > 4) html += '<span class="account-page-ellipsis">...</span>';
      var start = Math.max(2, current - 2);
      var end = Math.min(total - 1, current + 2);
      for (var j = start; j <= end; j++) pushPage(j, j === current);
      if (current < total - 3) html += '<span class="account-page-ellipsis">...</span>';
      pushPage(total, current === total);
    }

    // next
    html += '<button type="button" class="account-page-btn" data-page-next data-page-type="' + type + '"' + attr + ' ' + (current === total ? 'disabled' : '') + '><i class="fa-solid fa-chevron-right"></i></button>';

    html += '</div>';
    return html;
  }

  function hydrateLibraryThumbs(root) {
    if (!root) return;
    if (typeof window.hydrateLibraryThumbs === 'function') {
      window.hydrateLibraryThumbs(root);
      return;
    }
    if (!window.AudioHubStoryCover || typeof window.AudioHubStoryCover.get !== 'function') return;

    var nodesToFetch = [];

    root.querySelectorAll('[data-library-thumb]').forEach(function (node) {
      var coverKey = String(node.getAttribute('data-library-cover-key') || '').trim();
      var href = String(node.getAttribute('data-library-href') || '').trim();

      // Extract story ID from href (e.g. /story-detail?id=xxx)
      var storyId = '';
      if (href) {
        try {
          var urlObj = new URL(href, window.location.origin);
          storyId = urlObj.searchParams.get('id') || '';
        } catch (e) {
          var m = href.match(/[?&]id=([^&]+)/);
          if (m) storyId = decodeURIComponent(m[1]);
        }
      }

      // Try IndexedDB: coverKey first, then story ID
      var idbKey = coverKey && coverKey.indexOf('c_') === 0 ? coverKey : (storyId || '');
      if (!idbKey) return;

      window.AudioHubStoryCover.get(idbKey).then(function (blob) {
        if (blob) {
          var url = URL.createObjectURL(blob);
          node.style.backgroundImage = 'url("' + url + '")';
          node.style.backgroundSize = 'cover';
          node.style.backgroundPosition = 'center';
          node.classList.add('is-cover-ready');
        } else if (storyId && storyId.indexOf('s_') !== 0) {
          nodesToFetch.push({ node: node, id: storyId });
        }
      }).catch(function () {
        if (storyId && storyId.indexOf('s_') !== 0) {
          nodesToFetch.push({ node: node, id: storyId });
        }
      });
    });

    // Fallback: batch fetch cover_data from D1
    if (nodesToFetch.length) {
      var ids = nodesToFetch.map(function (n) { return n.id; });
      var idsParam = ids.map(encodeURIComponent).join(',');
      fetch('/api/stories/batch?ids=' + idsParam + '&fields=id,cover_data')
        .then(function (r) { return r.ok ? r.json() : []; })
        .then(function (rows) {
          var dataMap = {};
          (rows || []).forEach(function (r) { if (r.cover_data) dataMap[r.id] = r.cover_data; });
          nodesToFetch.forEach(function (n) {
            if (dataMap[n.id]) {
              n.node.style.backgroundImage = 'url("' + dataMap[n.id] + '")';
              n.node.style.backgroundSize = 'cover';
              n.node.style.backgroundPosition = 'center';
              n.node.classList.add('is-cover-ready');
            }
          });
        }).catch(function () {});
    }
  }

  function deriveThumbStyle(item) {
    var key = String(item && (item.genre || item.title) || '').toLowerCase();
    var palettes = [
      'linear-gradient(135deg,#0ea5e9,#2563eb)',
      'linear-gradient(135deg,#f97316,#f59e0b)',
      'linear-gradient(135deg,#a855f7,#7c3aed)',
      'linear-gradient(135deg,#14b8a6,#0d9488)',
      'linear-gradient(135deg,#ec4899,#db2777)'
    ];
    var idx = 0;
    for (var i = 0; i < key.length; i += 1) idx += key.charCodeAt(i);
    return palettes[idx % palettes.length];
  }

  function deriveThumbLabel(item) {
    var title = String(item && item.title || '').trim();
    if (!title) return 'AH';
    return title.split(/\s+/).filter(Boolean).slice(0, 2).map(function (part) {
      return part.charAt(0).toUpperCase();
    }).join('') || 'AH';
  }

  function buildThumbDataAttrs(item) {
    var href = escapeHtml(item && item.href || '');
    var coverKey = escapeHtml(item && item.coverKey || '');
    return ' data-library-thumb="true" data-library-href="' + href + '" data-library-cover-key="' + coverKey + '"';
  }

  function renderStorySection(items, mount, emptyText, page, type) {
    if (!mount) return;
    if (!items.length) {
      mount.innerHTML = '<p class="library-empty">' + escapeHtml(emptyText) + '</p>';
      return;
    }

    var start = (page - 1) * ITEMS_PER_PAGE;
    var end = start + ITEMS_PER_PAGE;
    var paged = items.slice(start, end);
    var totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);

    var hasItems = paged.length > 0;
    var html = '';

    if (hasItems) {
      html += '<div class="account-bulk-actions">';
      html += '<div class="account-bulk-action-buttons">';
      html += '<button type="button" class="btn btn--outline" data-select-all-items><i class="fa-solid fa-check"></i> chọn tất cả</button>';
      html += '<button type="button" class="btn btn--outline" data-deselect-all-items><i class="fa-solid fa-xmark"></i> bỏ chọn</button>';
      html += '</div>';
      html += '<button type="button" class="btn btn--danger" data-delete-selected disabled><i class="fa-solid fa-trash"></i> xóa tất cả mục đã chọn</button>';
      html += '</div>';
    }

    html += '<div class="yt-grid">' + paged.map(function (story) {
      var title = escapeHtml(story.title || 'Truyện mới');
      var author = escapeHtml(story.author || 'Ẩn danh');
      var genre = escapeHtml(story.genre || 'Truyện audio');
      var updated = formatTime(story.updatedAt || story.createdAt);
      var storyId = String(story.id || '').trim();
      var metaLine = author + ' · ' + genre + (updated ? (' · Cập nhật ' + escapeHtml(updated)) : '');

      var editHref = '/html/upload-story.html?id=' + encodeURIComponent(storyId);
      return '' +
        '<div class="yt-card" data-story-item>' +
          '<label class="yt-card__checkbox"><input type="checkbox" data-story-checkbox data-story-id="' + escapeHtml(storyId) + '" /></label>' +
          '<div class="yt-card__body">' +
            '<h3 class="yt-card__title"><a href="' + escapeHtml(storyHref(story)) + '">' + title + '</a></h3>' +
            '<p class="yt-card__meta">' + metaLine + '</p>' +
          '</div>' +
          '<div class="yt-card__menu-wrap">' +
            '<button type="button" class="yt-card__menu-btn" data-story-menu="' + escapeHtml(storyId) + '" aria-label="Tùy chọn" title="Tùy chọn"><i class="fa-solid fa-ellipsis-vertical"></i></button>' +
            '<div class="yt-card__menu is-hidden" data-story-menu-panel="' + escapeHtml(storyId) + '">' +
              '<a href="' + escapeHtml(storyHref(story)) + '" class="yt-card__menu-item"><i class="fa-solid fa-eye"></i> Xem truyện</a>' +
              '<button type="button" class="yt-card__menu-item" data-story-add-playlist="' + escapeHtml(storyId) + '" data-story-title="' + escapeHtml(story.title || '') + '" data-story-chapter-title="' + escapeHtml(story.chapterTitle || '') + '" data-story-author="' + escapeHtml(story.author || '') + '" data-story-genre="' + escapeHtml(story.genre || '') + '" data-story-href="' + escapeHtml(storyHref(story)) + '"><i class="fa-solid fa-list"></i> Thêm vào truyện</button>' +
              '<a href="' + escapeHtml(editHref) + '" class="yt-card__menu-item"><i class="fa-solid fa-pen"></i> Chỉnh sửa</a>' +
              '<button type="button" class="yt-card__menu-item yt-card__menu-item--danger" data-story-delete-one="' + escapeHtml(storyId) + '"><i class="fa-solid fa-trash"></i> Xóa truyện</button>' +
            '</div>' +
          '</div>' +
        '</div>';
    }).join('') + '</div>';

    mount.innerHTML = html;

    mount.querySelectorAll('[data-story-menu]').forEach(function (menuBtn) {
      menuBtn.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        openStoryMenu(menuBtn.getAttribute('data-story-menu'), menuBtn);
      });
    });

    var paginationWrap = document.querySelector('[data-pagination-wrap="' + type + '"]');
    if (paginationWrap) {
      paginationWrap.innerHTML = totalPages > 1 ? buildPagination(page, totalPages, type) : '';
    }
  }

  function renderTrash() {
    if (!trashMount) return;
    trashMount.innerHTML = '<p class="library-empty">Thùng rác audio sẽ hiển thị ở đây.</p>';
    if (trashNote) trashNote.textContent = '';
  }

  function setContentPanel(name) {
    var next = String(name || 'published');
    var found = false;

    contentButtons.forEach(function (button) {
      var active = String(button.getAttribute('data-content-tab') || '') === next;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      if (active) found = true;
    });
    contentPanels.forEach(function (panel) {
      var active = String(panel.getAttribute('data-content-panel') || '') === next;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
    if (found) writeTab(next);
  }

  function initContentTabs() {
    if (!contentButtons.length || !contentPanels.length) return;

    // Check hash for tab selection
    var hash = window.location.hash;
    var initial = readTab();

    if (hash === '#mycontent-draft') {
        initial = 'draft';
    } else if (!contentButtons.some(function (button) {
      return String(button.getAttribute('data-content-tab') || '') === initial;
    })) {
      initial = 'published';
    }

    contentButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        setContentPanel(button.getAttribute('data-content-tab'));
      });
    });
    setContentPanel(initial);
  }

  function setMainTab(name) {
    var next = String(name || 'history');
    mainTabButtons.forEach(function (button) {
      var active = String(button.getAttribute('data-main-tab') || '') === next;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    mainTabPanels.forEach(function (panel) {
      var active = String(panel.getAttribute('data-main-panel') || '') === next;
      panel.classList.toggle('is-active', active);
      panel.hidden = !active;
    });
  }

  function initMainTabs() {
    // Check if URL has hash to switch to mycontent tab
    var hash = window.location.hash;
    var initialMainTab = 'history';
    if (hash === '#mycontent-draft' || hash === '#mycontent') {
      initialMainTab = 'mycontent';
    }
    setMainTab(initialMainTab);

    // Use event delegation on the navcards container for reliable click handling
    var navcardsContainer = document.querySelector('.account-navcards');
    if (navcardsContainer) {
      navcardsContainer.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-main-tab]');
        if (btn) {
          e.preventDefault();
          setMainTab(btn.getAttribute('data-main-tab'));
        }
      });
    }

    // Also bind directly to buttons as fallback
    mainTabButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        setMainTab(button.getAttribute('data-main-tab'));
      });
    });
  }

  // ── Playlist ─────────────────────────────────────────────────────────────

  var PLAYLIST_STORAGE_KEY = 'audiohub-playlists-v1';
  var activePlaylistId = null;
  var playlistNote = document.querySelector('[data-playlist-note]');

  function readPlaylists() {
    try {
      var raw = window.localStorage.getItem(PLAYLIST_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return [];
      // Migration: fix playlists with empty names (deep clone to detect changes)
      var original = JSON.parse(JSON.stringify(parsed));
      var migrated = parsed.map(function (pl) {
        if (pl && !pl.name) {
          pl.name = 'Truyện mới';
        }
        return pl;
      });
      // Write back if any names were fixed
      var changed = migrated.some(function (pl, i) { return pl.name !== original[i].name; });
      if (changed) {
        window.localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(migrated));
      }
      return migrated;
    } catch (e) {
      return [];
    }
  }

  /** Fetch playlists from D1 and merge with localStorage */
  function syncPlaylistsFromD1() {
    return fetch('/api/playlists')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (d1Playlists) {
        if (!Array.isArray(d1Playlists) || !d1Playlists.length) return readPlaylists();

        try {
        var local = readPlaylists();
        var localMap = {};
        local.forEach(function (pl) { localMap[pl.id] = pl; });

        // Merge: D1 playlists + local playlists (dedupe by ID)
        var merged = [];
        var seenIds = {};

        // Add D1 playlists first
        d1Playlists.forEach(function (pl) {
          if (!pl || !pl.id || seenIds[pl.id]) return;
          seenIds[pl.id] = true;
          // Parse items if string (handle double-stringify from D1)
          var entries = pl.items || pl.entries || [];
          if (typeof entries === 'string') {
            try { entries = JSON.parse(entries); } catch (e) { entries = []; }
            // Double-stringify fix: if still string after first parse, parse again
            if (typeof entries === 'string') {
              try { entries = JSON.parse(entries); } catch (e2) { entries = []; }
            }
          }
          merged.push({
            id: pl.id,
            name: pl.name || 'Truyện mới',
            entries: Array.isArray(entries) ? entries : [],
            createdBy: pl.created_by || pl.createdBy || 'admin',
            state: pl.state || 'ongoing',
            createdAt: pl.created_at || pl.createdAt || '',
            updatedAt: pl.updated_at || pl.updatedAt || ''
          });
        });

        // Add local playlists not in D1
        local.forEach(function (pl) {
          if (!pl || !pl.id || seenIds[pl.id]) return;
          seenIds[pl.id] = true;
          merged.push(pl);
        });

        // Reconcile: if D1 playlist has 0 entries but localStorage has entries for same ID, use local entries
        var localMap2 = {};
        local.forEach(function (pl) { if (pl && pl.id) localMap2[pl.id] = pl; });
        merged.forEach(function (pl) {
          if (pl && pl.id && (!pl.entries || !pl.entries.length)) {
            var localPl = localMap2[pl.id];
            if (localPl && localPl.entries && localPl.entries.length) {
              pl.entries = localPl.entries;
              console.log('[account] ✅ Reconciled entries from localStorage for playlist:', pl.name);
              // Re-sync to D1
              try {
                fetch('/api/playlists', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: pl.id, name: pl.name, items: JSON.stringify(pl.entries) })
                }).catch(function () {});
              } catch (e) {}
            }
          }
        });

        // Auto-populate: if playlist still has 0 entries, scan stories for matches
        var hasEmpty = merged.some(function (pl) { return pl && (!pl.entries || !pl.entries.length); });
        if (hasEmpty) {
          try {
            var _plUserId = getMyUserId();
            var _plStoriesKey = _plUserId ? 'audiohub-stories-' + _plUserId : 'audiohub-stories';
            var storiesRaw = localStorage.getItem(_plStoriesKey);
            var allStories = storiesRaw ? JSON.parse(storiesRaw) : [];
            if (Array.isArray(allStories) && allStories.length) {
              merged.forEach(function (pl) {
                if (pl && (!pl.entries || !pl.entries.length)) {
                  // Match stories by name similarity or created_by
                  var matched = allStories.filter(function (s) {
                    if (!s || !s.id) return false;
                    // Match by title containing playlist name or vice versa
                    var plName = (pl.name || '').toLowerCase();
                    var sTitle = (s.title || '').toLowerCase();
                    if (plName && sTitle && (sTitle.indexOf(plName) !== -1 || plName.indexOf(sTitle) !== -1)) return true;
                    // Match by author
                    var sAuthor = String(s.author || s.created_by || '').toLowerCase();
                    var plAuthor = String(pl.createdBy || pl.created_by || '').toLowerCase();
                    if (sAuthor && plAuthor && sAuthor === plAuthor) return true;
                    return false;
                  });
                  if (matched.length) {
                    pl.entries = matched.map(function (s, i) {
                      return {
                        key: s.id,
                        title: s.title || '',
                        chapterTitle: '',
                        chapterIndex: i,
                        author: s.author || '',
                        genre: s.genre || '',
                        href: '/story-detail?id=' + encodeURIComponent(s.id) + (pl.id ? ('&playlistId=' + encodeURIComponent(pl.id)) : ''),
                        status: 'listening',
                        progress: 0,
                        addedAt: s.createdAt || new Date().toISOString()
                      };
                    });
                    console.log('[account] ✅ Auto-populated playlist:', pl.name, '| entries:', pl.entries.length);
                    // Sync to D1
                    try {
                      fetch('/api/playlists', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: pl.id, name: pl.name, items: JSON.stringify(pl.entries) })
                      }).catch(function () {});
                    } catch (e) {}
                  }
                }
              });
            }
          } catch (e) {}
        }

        // Save merged to localStorage
        try { localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(merged)); } catch (e) {}

        return merged;
        } catch (mergeErr) {
          console.error('[account] Merge error, falling back to localStorage:', mergeErr);
          return readPlaylists();
        }
      })
      .catch(function () {
        return readPlaylists();
      });
  }

  function writePlaylists(list) {
    try {
      window.localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {}
    // Sync each playlist to D1
    try {
      (list || []).forEach(function (pl) {
        fetch('/api/playlists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pl)
        }).catch(function () {});
      });
    } catch (e) {}
  }

  function generateId() {
    return 'pl-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now();
  }

  function createPlaylist(name) {
    var list = readPlaylists();
    var playlistName = String(name || '').trim() || 'Truyện mới';
    var playlist = { id: generateId(), name: playlistName, entries: [], createdBy: 'admin', userId: getMyUserId() || '', createdAt: new Date().toISOString() };
    list.push(playlist);
    writePlaylists(list);
    return playlist;
  }

  function deletePlaylist(id) {
    // Find the playlist to get story keys before deleting
    var list = readPlaylists();
    var pl = null;
    list.forEach(function (p) { if (p.id === id) pl = p; });
    if (pl && pl.entries) {
      // Delete each story from D1
      pl.entries.forEach(function (entry) {
        var key = String(entry.key || '');
        if (key && key.indexOf('s_') !== 0) {
          // Cloud story — delete from D1
          fetch('/api/stories/' + encodeURIComponent(key), {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' }
          }).then(function () {
            // Also delete cover from R2 (if available)
            fetch('/api/covers/' + encodeURIComponent(key), {
              method: 'DELETE'
            }).catch(function () {});
          }).catch(function () {});
        }
      });
    }
    // Delete playlist from D1 and wait for completion
    var deletePromise = fetch('/api/playlists/' + encodeURIComponent(id), {
      method: 'DELETE'
    }).catch(function () {});
    // Remove from localStorage
    var newList = list.filter(function (p) { return p.id !== id; });
    writePlaylists(newList);
    if (activePlaylistId === id) activePlaylistId = null;
    return deletePromise;
  }

  function renamePlaylist(id, newName) {
    var list = readPlaylists();
    list.forEach(function (p) { if (p.id === id) p.name = String(newName || '').trim() || p.name; });
    writePlaylists(list);
  }

  function setPlaylistState(id, state) {
    var isDone = state === 'done';
    var list = readPlaylists();
    list.forEach(function (p) {
      if (p.id === id) {
        p.state = isDone ? 'done' : 'ongoing';
        // Sync isCompleted on stories in this playlist
        if (p.entries && Array.isArray(p.entries)) {
          p.entries.forEach(function (entry) {
            if (entry.key && window.AudioHubStories && typeof window.AudioHubStories.getById === 'function') {
              var story = window.AudioHubStories.getById(entry.key);
              if (story) {
                story.isCompleted = isDone;
                story.status = isDone ? 'Hoàn thành' : '';
                story.updatedAt = new Date().toISOString();
                window.AudioHubStories.upsert(story);
              }
            }
          });
        }
      }
    });
    writePlaylists(list);
  }

  function togglePlaylistStateMenu(playlistId) {
    var menu = document.querySelector('[data-playlist-state-menu="' + playlistId + '"]');
    if (!menu) return;
    var isOpen = !menu.classList.contains('is-hidden');
    document.querySelectorAll('[data-playlist-state-menu]').forEach(function (node) {
      node.classList.add('is-hidden');
    });
    if (!isOpen) {
      menu.classList.remove('is-hidden');
      // Position the fixed dropdown
      var trigger = document.querySelector('[data-playlist-state-trigger="' + playlistId + '"]');
      if (trigger) {
        var rect = trigger.getBoundingClientRect();
        menu.style.left = rect.left + 'px';
        menu.style.top = (rect.bottom + 6) + 'px';
      }
    }
  }

  function closePlaylistStateMenus() {
    document.querySelectorAll('[data-playlist-state-menu]').forEach(function (node) {
      node.classList.add('is-hidden');
    });
  }

  document.addEventListener('click', function (event) {
    if (!event.target.closest('[data-playlist-state-trigger]') && !event.target.closest('[data-playlist-state-menu]')) {
      closePlaylistStateMenus();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closePlaylistStateMenus();
  });

  function removeEntryFromPlaylist(playlistId, entryKey) {
    var list = readPlaylists();
    list.forEach(function (p) {
      if (p.id === playlistId) {
        p.entries = (p.entries || []).filter(function (e) { return e.key !== entryKey; });
      }
    });
    writePlaylists(list);
  }

  function renderPlaylist() {
    var playlistListMount = document.querySelector('[data-playlist-list]');
    var playlistDetailMount = document.querySelector('[data-playlist-detail]');
    if (!playlistListMount) return;

    if (playlistNote) playlistNote.classList.toggle('is-hidden', true);

    // Show loading state only if list is empty or shows loading
    if (!playlistListMount.children.length || playlistListMount.textContent.indexOf('Đang tải') >= 0) {
      playlistListMount.innerHTML = '<p class="playlist-empty">Đang tải...</p>';
    }

    // Fetch from D1 and merge with localStorage
    syncPlaylistsFromD1().then(function (allPlaylists) {
      console.log('[account] syncPlaylistsFromD1 result:', allPlaylists ? allPlaylists.length : 'null', 'playlists');
      try {
      var _plUserId = getMyUserId();
      var list = (allPlaylists || readPlaylists() || []).filter(function (p) {
        // Filter by userId when logged in
        if (_plUserId) {
          var pUserId = String(p.userId || p.user_id || '').trim().toLowerCase();
          if (pUserId && pUserId !== _plUserId) return false;
        }
        var cb = String(p.createdBy || p.created_by || 'admin').toLowerCase();
        return cb === 'admin' || cb === 'user' || !cb;
      });

      if (!list.length) {
        playlistListMount.innerHTML = '<p class="playlist-empty">Chưa có truyện nào. Tạo truyện đầu tiên của bạn.</p>';
        if (playlistDetailMount) playlistDetailMount.innerHTML = '<p class="playlist-empty">Chọn một truyện để xem chi tiết.</p>';
        return;
      }

    var listStart = (currentPlaylistListPage - 1) * PLAYLIST_LIST_ITEMS_PER_PAGE;
    var listEnd = listStart + PLAYLIST_LIST_ITEMS_PER_PAGE;
    var pagedList = list.slice(listStart, listEnd);
    var totalListPages = Math.max(1, Math.ceil(list.length / PLAYLIST_LIST_ITEMS_PER_PAGE));

    playlistListMount.innerHTML = pagedList.map(function (pl) {
      var isActive = pl.id === activePlaylistId;
      var entries = pl.entries || [];
      var count = entries.length;
      var doneCount = entries.filter(function (e) { return e.status === 'done'; }).length;
      var listeningCount = count - doneCount;
      var statusLabel = '';
      if (count > 0) {
        if (listeningCount > 0 && doneCount > 0) {
          statusLabel = listeningCount + ' đang nghe · ' + doneCount + ' đã xong';
        } else if (listeningCount > 0) {
          statusLabel = listeningCount + ' đang nghe';
        } else if (doneCount > 0) {
          statusLabel = doneCount + ' đã xong';
        }
      }
      var state = String(pl.state || (doneCount > 0 ? 'done' : 'ongoing'));
      var stateLabel = state === 'done' ? 'Đã hoàn thành' : 'Đang ra';
      var stateIcon = state === 'done' ? 'fa-solid fa-check' : 'fa-solid fa-play';
      var stateClass = state === 'done' ? 'pl-badge--done' : 'pl-badge--ongoing';

      return '' +
        '<div class="pl-card' + (isActive ? ' is-active' : '') + '" data-playlist-id="' + escapeHtml(pl.id) + '">' +
          '<div class="pl-card__name" data-playlist-name-display="' + escapeHtml(pl.id) + '">' + escapeHtml(pl.name || 'Truyện') + '</div>' +
          '<div class="pl-card__meta">' + count + ' truyện' + (statusLabel ? (' · ' + statusLabel) : '') + '</div>' +
          '<div class="pl-card__actions">' +
            '<div class="pl-card__state-wrap">' +
              '<button type="button" class="pl-badge ' + stateClass + '" data-playlist-state-trigger="' + escapeHtml(pl.id) + '">' +
                '<i class="' + stateIcon + '"></i> ' + escapeHtml(stateLabel) +
              '</button>' +
              '<div class="pl-card__state-menu is-hidden" data-playlist-state-menu="' + escapeHtml(pl.id) + '">' +
                '<button type="button" class="pl-card__state-option" data-playlist-state="ongoing" data-playlist-state-set="' + escapeHtml(pl.id) + '"><i class="fa-solid fa-play"></i> Đang ra</button>' +
                '<button type="button" class="pl-card__state-option" data-playlist-state="done" data-playlist-state-set="' + escapeHtml(pl.id) + '"><i class="fa-solid fa-check"></i> Đã hoàn thành</button>' +
              '</div>' +
            '</div>' +
            '<button type="button" class="pl-icon-btn" data-playlist-rename="' + escapeHtml(pl.id) + '" title="Đổi tên"><i class="fa-solid fa-pen"></i></button>' +
            '<button type="button" class="pl-icon-btn pl-icon-btn--danger" data-playlist-delete="' + escapeHtml(pl.id) + '" title="Xóa truyện"><i class="fa-solid fa-trash"></i></button>' +
          '</div>' +
        '</div>';
    }).join('');

      var paginationWrapLeft = document.querySelector('[data-pagination-wrap="playlist-list"]');
      if (paginationWrapLeft) {
        paginationWrapLeft.innerHTML = totalListPages > 1 ? buildPagination(currentPlaylistListPage, totalListPages, 'playlist-list') : '';
      }

      // Scroll playlist list to top on page change
      playlistListMount.scrollTop = 0;

      try { renderPlaylistDetail(); } catch (detailErr) {
        console.error('[account] renderPlaylistDetail error:', detailErr);
      }
      } catch (renderErr) {
        console.error('[account] renderPlaylist error:', renderErr);
        playlistListMount.innerHTML = '<p class="playlist-empty">Lỗi hiển thị. Thử lại sau.</p>';
      }
    }).catch(function (err) {
      console.error('[account] syncPlaylistsFromD1 catch:', err && err.message ? err.message : err);
      // Fallback: use localStorage directly
      try {
        var fallback = readPlaylists() || [];
        var _plUserId2 = getMyUserId();
        var list2 = (Array.isArray(fallback) ? fallback : []).filter(function (p) {
          if (_plUserId2) {
            var pUserId = String(p.userId || p.user_id || '').trim().toLowerCase();
            if (pUserId && pUserId !== _plUserId2) return false;
          }
          var cb = String(p.createdBy || p.created_by || 'admin').toLowerCase();
          return cb === 'admin' || cb === 'user' || !cb;
        });
        if (list2.length) {
          playlistListMount.innerHTML = list2.map(function (pl) {
            var count = (pl.entries || []).length;
            return '<div class="pl-card" data-playlist-id="' + escapeHtml(pl.id) + '">' +
              '<div class="pl-card__name">' + escapeHtml(pl.name || 'Truyện') + '</div>' +
              '<div class="pl-card__meta">' + count + ' truyện</div>' +
            '</div>';
          }).join('');
        } else {
          playlistListMount.innerHTML = '<p class="playlist-empty">Lỗi tải dữ liệu. Thử lại sau.</p>';
        }
      } catch (e2) {
        playlistListMount.innerHTML = '<p class="playlist-empty">Lỗi tải dữ liệu. Thử lại sau.</p>';
      }
    });
  }

  var STATUS_LABELS = {
    'listening': 'Đang nghe',
    'done': 'Đã hoàn thành'
  };

  function updateEntryStatus(playlistId, entryKey, status) {
    var list = readPlaylists();
    list.forEach(function (p) {
      if (p.id === playlistId) {
        (p.entries || []).forEach(function (e) {
          if (e.key === entryKey) e.status = status;
        });
      }
    });
    writePlaylists(list);
  }

  function updateEntryProgress(playlistId, entryKey, progress) {
    var list = readPlaylists();
    list.forEach(function (p) {
      if (p.id === playlistId) {
        (p.entries || []).forEach(function (e) {
          if (e.key === entryKey) e.progress = Math.min(100, Math.max(0, Number(progress) || 0));
        });
      }
    });
    writePlaylists(list);
  }

  function renderPlaylistDetail(skipFade) {
    var playlistDetailMount = document.querySelector('[data-playlist-detail]');
    if (!playlistDetailMount) return;

    function renderContent() {
      if (!activePlaylistId) {
        playlistDetailMount.innerHTML = '<p class="playlist-empty">Chọn một truyện để xem chi tiết.</p>';
        return;
      }
      var list = readPlaylists();
      var pl = null;
      list.forEach(function (p) { if (p.id === activePlaylistId) pl = p; });
      if (!pl) {
        playlistDetailMount.innerHTML = '<p class="playlist-empty">Truyện không tồn tại.</p>';
        return;
      }
      var entries = pl.entries || [];
      if (!entries.length) {
        playlistDetailMount.innerHTML = '<p class="playlist-empty">Truyện chưa có nội dung nào.</p>';
        return;
      }

      var start = (currentPlaylistDetailPage - 1) * PLAYLIST_ITEMS_PER_PAGE;
      var end = start + PLAYLIST_ITEMS_PER_PAGE;
      var paged = entries.slice(start, end);
      var totalPages = Math.max(1, Math.ceil(entries.length / PLAYLIST_ITEMS_PER_PAGE));

      // Auto-fix: add playlistId to old entries missing it
      var needSave = false;
      entries.forEach(function (e) {
        if (e.href && e.href.indexOf('playlistId=') === -1) {
          e.href += (e.href.indexOf('?') >= 0 ? '&' : '?') + 'playlistId=' + encodeURIComponent(pl.id);
          needSave = true;
        }
      });
      if (needSave) {
        var allPls = readPlaylists();
        allPls.forEach(function (p) { if (p.id === pl.id) p.entries = entries; });
        writePlaylists(allPls);
      }

      // Count how many times each title appears (to auto-assign chapterIndex for duplicates)
      var titleSeenCount = {};
      entries.forEach(function (e) {
        var t = String(e.title || '').trim().toLowerCase();
        if (t) titleSeenCount[t] = (titleSeenCount[t] || 0) + 1;
      });
      // Track per-title occurrence during render
      var titleOrderCounter = {};

      playlistDetailMount.innerHTML = paged.map(function (entry) {
        var progress = Number(entry.progress) || 0;
        var status = entry.status || 'listening';
        var isDone = status === 'done';
        var coverKey = String(entry.coverKey || '');
        var chapterIndex = Number(entry.chapterIndex) || 0;
        var chapterTitle = entry.chapterTitle || '';
        // For duplicate-title entries, ALWAYS assign chapterIndex by position
        var entryTitleKey = String(entry.title || '').trim().toLowerCase();
        var isDuplicate = entryTitleKey && titleSeenCount[entryTitleKey] > 1;
        if (isDuplicate) {
          if (!titleOrderCounter[entryTitleKey]) titleOrderCounter[entryTitleKey] = 0;
          chapterIndex = titleOrderCounter[entryTitleKey];
          titleOrderCounter[entryTitleKey]++;
        }
        // Try local story store first
        if (!coverKey || !chapterTitle) {
          var story = window.AudioHubStories && typeof window.AudioHubStories.getById === 'function'
            ? window.AudioHubStories.getById(entry.key) : null;
          if (story) {
            if (!coverKey) coverKey = story.coverKey ? String(story.coverKey) : '';
            if (!chapterTitle) {
              var chapters = Array.isArray(story.chapters) ? story.chapters : [];
              if (chapters[chapterIndex] && chapters[chapterIndex].title) {
                chapterTitle = chapters[chapterIndex].title;
              } else {
                chapterTitle = story.chapterTitle || '';
              }
            }
          }
        }
        var chapterLabel;
        if (chapterTitle) {
          chapterLabel = 'Chương ' + (chapterIndex + 1) + ': ' + chapterTitle;
        } else if (isDuplicate) {
          chapterLabel = 'Chương ' + (chapterIndex + 1);
        } else {
          chapterLabel = entry.title || 'Truyện audio';
        }
        var thumbStyle = coverKey ? '' : 'background: linear-gradient(135deg, #1a1040, #2d1b69)';
        var genreBadge = entry.genre ? '<span class="genre-badge">' + escapeHtml(entry.genre) + '</span>' : '';
        // Ensure entry href includes playlistId
        var entryHref = entry.href || '#';
        if (entryHref !== '#' && entryHref.indexOf('playlistId=') === -1) {
          entryHref += (entryHref.indexOf('?') >= 0 ? '&' : '?') + 'playlistId=' + encodeURIComponent(pl.id);
        }
        var needsFetch = !chapterTitle && !String(entry.key || '').startsWith('s_');
        return '' +
          '<div class="playlist-entry' + (isDone ? ' is-done' : '') + '" data-entry-key="' + escapeHtml(entry.key) + '" data-chapter-index="' + chapterIndex + '"' + (needsFetch ? ' data-needs-chapter-title="1"' : '') + '>' +
            '<a class="playlist-entry-thumb" href="' + escapeHtml(entryHref) + '" data-playlist-entry-thumb="true" data-playlist-entry-cover-key="' + escapeHtml(coverKey) + '" data-entry-key="' + escapeHtml(entry.key) + '" style="' + thumbStyle + '">' +
              '<span>' + escapeHtml((chapterLabel || 'AH').slice(0,2).toUpperCase()) + '</span>' +
            '</a>' +
            '<div class="playlist-entry-main">' +
              '<a class="playlist-entry-title" href="' + escapeHtml(entryHref) + '">' + escapeHtml(chapterLabel) + '</a>' +
              '<div class="playlist-entry-meta"><span>' + escapeHtml(entry.author || 'Ẩn danh') + '</span>' + genreBadge + '</div>' +
            '</div>' +
            '<div class="playlist-entry-actions">' +
              '<a href="' + escapeHtml(entryHref) + '" class="playlist-btn" title="Nghe"><i class="fa-solid fa-play"></i></a>' +
              '<div class="playlist-kebab-wrap">' +
                '<button type="button" class="playlist-btn playlist-btn--kebab" data-kebab-toggle="' + escapeHtml(entry.key) + '" title="Chỉnh sửa"><i class="fa-solid fa-ellipsis-vertical"></i></button>' +
                '<div class="playlist-kebab-menu" data-kebab-menu="' + escapeHtml(entry.key) + '">' +
                  '<button type="button" class="playlist-kebab-item" data-entry-edit="' + escapeHtml(entry.key) + '"><i class="fa-solid fa-pen-to-square"></i> Chỉnh sửa</button>' +
                  '<button type="button" class="playlist-kebab-item" data-entry-rename="' + escapeHtml(entry.key) + '" data-playlist-id="' + escapeHtml(pl.id) + '"><i class="fa-solid fa-pen"></i> Đổi tên</button>' +
                  '<button type="button" class="playlist-kebab-item playlist-kebab-item--danger" data-entry-remove="' + escapeHtml(entry.key) + '" data-playlist-id="' + escapeHtml(pl.id) + '"><i class="fa-solid fa-trash"></i> Xóa</button>' +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>';
      }).join('');

      var paginationWrapPlaylist = document.querySelector('[data-pagination-wrap="playlist"]');
      if (paginationWrapPlaylist) {
        paginationWrapPlaylist.innerHTML = totalPages > 1 ? buildPagination(currentPlaylistDetailPage, totalPages, 'playlist', pl.id) : '';
      }

      // Persist auto-assigned chapterIndex for duplicate entries
      var needSaveChapters = false;
      var dupTitleCounter2 = {};
      entries.forEach(function (e) {
        var t = String(e.title || '').trim().toLowerCase();
        if (titleSeenCount[t] > 1) {
          if (!dupTitleCounter2[t]) dupTitleCounter2[t] = 0;
          var newIdx = dupTitleCounter2[t];
          dupTitleCounter2[t]++;
          if (!e.chapterTitle && Number(e.chapterIndex) !== newIdx) {
            e.chapterIndex = newIdx;
            needSaveChapters = true;
          }
        }
      });
      if (needSaveChapters) {
        try {
          var allPls2 = readPlaylists();
          allPls2.forEach(function (p) { if (p.id === pl.id) p.entries = entries; });
          writePlaylists(allPls2);
        } catch (e) {}
      }

      // hydrate covers — delegated to IIFE-scope hydratePlaylistCovers() via MutationObserver
      hydratePlaylistCovers();

      // Batch-fetch missing chapter titles from Supabase for entries without chapterTitle
      if (playlistDetailMount) {
        var nodesNeedingTitle = playlistDetailMount.querySelectorAll('[data-needs-chapter-title]');
        if (nodesNeedingTitle.length && !playlistDetailMount.dataset.titlesFetched) {
          playlistDetailMount.dataset.titlesFetched = '1';
          // Count ALL entries per key in DOM (including those that already have chapterTitle)
          // to determine correct chapterIndex offset for entries needing titles
          var allEntryNodes = playlistDetailMount.querySelectorAll('[data-entry-key]');
          var keyExistingCount = {};
          allEntryNodes.forEach(function (n) {
            var k = n.getAttribute('data-entry-key');
            if (n.hasAttribute('data-needs-chapter-title')) return; // skip needing-ones
            keyExistingCount[k] = (keyExistingCount[k] || 0) + 1;
          });
          var idsToFetch = [];
          nodesNeedingTitle.forEach(function (n) {
            var k = n.getAttribute('data-entry-key');
            if (k && !String(k).startsWith('s_') && idsToFetch.indexOf(k) === -1) idsToFetch.push(k);
          });
          if (idsToFetch.length) {
            var idsParam = idsToFetch.map(encodeURIComponent).join(',');
            fetch('/api/stories/batch?ids=' + idsParam + '&fields=id,chapter_title,chapters,cover_data')
              .then(function (r) { return r.ok ? r.json() : []; })
              .then(function (rows) {
              var rowMap = {};
              (rows || []).forEach(function (r) { rowMap[r.id] = r; });
              var updatedKeys = [];
              // Start counter from existing count (entries that already have titles)
              var keySeen2 = {};
              // Initialize with existing counts
              for (var ek in keyExistingCount) { keySeen2[ek] = keyExistingCount[ek]; }
              nodesNeedingTitle.forEach(function (node) {
                var k = node.getAttribute('data-entry-key');
                var row = rowMap[k];
                if (!row) return;
                // Assign chapterIndex starting after existing entries
                if (keySeen2[k] === undefined) keySeen2[k] = 0;
                var chIdx = keySeen2[k];
                keySeen2[k]++;
                // Parse chapters array from Supabase
                var allChapters = [];
                try { allChapters = typeof row.chapters === 'string' ? JSON.parse(row.chapters) : (row.chapters || []); } catch (e) { allChapters = []; }
                // Get chapter title: prefer chapters[chIdx].title, fallback to chapter_title
                var chTitle = '';
                if (allChapters[chIdx] && allChapters[chIdx].title) {
                  chTitle = allChapters[chIdx].title;
                } else if (row.chapter_title) {
                  // chapters array empty — use chapter_title for all entries
                  chTitle = row.chapter_title;
                } else if (allChapters.length) {
                  chTitle = allChapters[allChapters.length - 1].title || '';
                }
                if (chTitle) {
                  var label = 'Chương ' + (chIdx + 1) + ': ' + chTitle;
                  var titleNode = node.querySelector('.playlist-entry-title');
                  if (titleNode) titleNode.textContent = label;
                  // Don't touch thumb if cover hydration already added an <img>
                  var thumbEl = node.querySelector('.playlist-entry-thumb');
                  if (thumbEl && !thumbEl.querySelector('img') && !thumbEl.classList.contains('is-cover-ready')) {
                    var thumbSpan = thumbEl.querySelector('span');
                    if (thumbSpan) thumbSpan.textContent = 'CH';
                  }
                  updatedKeys.push({ key: k, chapterTitle: chTitle, chapterIndex: chIdx, entryIndex: chIdx });
                }
              });
              // Persist fetched chapter titles back to localStorage
              if (updatedKeys.length) {
                try {
                  var allPls = readPlaylists();
                  allPls.forEach(function (pl) {
                    // For each unique key in updatedKeys, collect the chapter assignments
                    var keyUpdates = {};
                    updatedKeys.forEach(function (u) {
                      if (!keyUpdates[u.key]) keyUpdates[u.key] = [];
                      keyUpdates[u.key].push({ chapterTitle: u.chapterTitle, chapterIndex: u.chapterIndex });
                    });
                    // Apply to matching entries in order
                    var plKeyIdx = {};
                    (pl.entries || []).forEach(function (e) {
                      if (keyUpdates[e.key]) {
                        if (!plKeyIdx[e.key]) plKeyIdx[e.key] = 0;
                        var idx = plKeyIdx[e.key];
                        if (idx < keyUpdates[e.key].length) {
                          e.chapterTitle = keyUpdates[e.key][idx].chapterTitle;
                          e.chapterIndex = keyUpdates[e.key][idx].chapterIndex;
                        }
                        plKeyIdx[e.key]++;
                      }
                    });
                  });
                  writePlaylists(allPls);
                } catch (e) {}
              }
            }).catch(function () {});
          }
        }
      }

      if (playlistDetailMount) playlistDetailMount.querySelectorAll('.playlist-progress-slider').forEach(function (slider) {
        slider.addEventListener('input', function () {
          var val = slider.value;
          var fill = slider.closest('.playlist-entry').querySelector('.playlist-progress-fill');
          var pct = slider.closest('.playlist-entry').querySelector('.playlist-progress-pct');
          if (fill) fill.style.width = val + '%';
          if (pct) pct.textContent = val + '%';
        });
        slider.addEventListener('change', function () {
          var key = slider.getAttribute('data-slider-key');
          var plId = slider.getAttribute('data-slider-pl');
          updateEntryProgress(plId, key, slider.value);
        });
      });
    }

    // Fade transition on page change (skip for entry removal)
    if (skipFade) {
      renderContent();
    } else {
      playlistDetailMount.classList.add('is-fading');
      setTimeout(function () {
        renderContent();
        playlistDetailMount.classList.remove('is-fading');
        playlistDetailMount.scrollTop = 0;
      }, 150);
    }
  }

  function closeAllKebabMenus() {
    var floating = document.querySelector('.playlist-kebab-floating');
    if (floating) floating.remove();
  }

  function bindPlaylistActions() {
    // Singleton guard: only register once to avoid duplicate handlers
    if (window.__playlistActionsBound) return;
    window.__playlistActionsBound = true;
    // dùng event delegation để tránh null khi bind
    document.addEventListener('click', function (event) {
      if (event.target.closest('[data-playlist-create]')) {
        var input = document.querySelector('[data-playlist-create-name]');
        var name = input ? String(input.value || '').trim() : '';
        if (!name) { if (input) input.focus(); return; }
        createPlaylist(name);
        if (input) input.value = '';
        renderPlaylist();
        return;
      }

      var toggleBtn = event.target.closest('[data-toggle-key]');
      if (toggleBtn) {
        var entryKey = toggleBtn.getAttribute('data-toggle-key');
        var plId = toggleBtn.getAttribute('data-toggle-pl');
        var nextStatus = toggleBtn.getAttribute('data-toggle-next');
        if (entryKey && plId && nextStatus) {
          updateEntryStatus(plId, entryKey, nextStatus);
          renderPlaylistDetail();
        }
        return;
      }

      // Kebab menu toggle — clone into floating position:fixed element
      var kebabToggle = event.target.closest('[data-kebab-toggle]');
      if (kebabToggle) {
        event.stopPropagation();
        event.preventDefault();
        var key = kebabToggle.getAttribute('data-kebab-toggle');
        closeAllKebabMenus();
        // Find the source menu template in the playlist detail
        var detailEl = document.querySelector('[data-playlist-detail]');
        if (!detailEl) return;
        var srcMenu = detailEl.querySelector('[data-kebab-menu="' + key + '"]');
        if (!srcMenu) return;
        // Clone the menu and create a floating element
        var floating = document.createElement('div');
        floating.className = 'playlist-kebab-floating';
        floating.innerHTML = srcMenu.innerHTML;
        floating.style.cssText = 'position:fixed;z-index:999999;background:#1e1b2e;border:1px solid rgba(255,255,255,0.1);border-radius:10px;min-width:150px;box-shadow:0 8px 24px rgba(0,0,0,0.4);padding:4px;display:block;';
        // Position below the ⋮ button
        var rect = kebabToggle.getBoundingClientRect();
        var topPos = rect.bottom + 4;
        var leftPos = rect.right - 160;
        if (leftPos < 8) leftPos = 8;
        if (topPos + 130 > window.innerHeight) {
          topPos = rect.top - 130 - 4;
        }
        floating.style.top = topPos + 'px';
        floating.style.left = leftPos + 'px';
        document.body.appendChild(floating);
        // Close on scroll or resize
        var _closeOnScroll = function () { closeAllKebabMenus(); window.removeEventListener('scroll', _closeOnScroll); };
        window.addEventListener('scroll', _closeOnScroll, { passive: true });
        window.addEventListener('resize', _closeOnScroll, { passive: true, once: true });
        return;
      }

      // Edit chapter (navigate to upload-story with chapter index)
      var editBtn = event.target.closest('[data-entry-edit]');
      if (editBtn) {
        var editKey = editBtn.getAttribute('data-entry-edit');
        closeAllKebabMenus();
        if (editKey) {
          // Find the entry's chapter index from the DOM
          var entryEl = editBtn.closest('.playlist-entry');
          var chIdx = entryEl ? (Number(entryEl.getAttribute('data-chapter-index')) || 0) : 0;
          var editUrl = '/upload-story.html?id=' + encodeURIComponent(editKey) + '&chapter=' + chIdx;
          if (window.AudioHubRouter && window.AudioHubRouter.navigate) {
            window.AudioHubRouter.navigate(editUrl);
          } else {
            window.location.href = editUrl;
          }
        }
        return;
      }

      // Rename chapter
      var renameBtn = event.target.closest('[data-entry-rename]');
      if (renameBtn) {
        var entryKey = renameBtn.getAttribute('data-entry-rename');
        var plId = renameBtn.getAttribute('data-playlist-id');
        closeAllKebabMenus();
        if (entryKey && plId) {
          // Find current chapter title
          var allPls = readPlaylists();
          var matchedPl = allPls.find(function (p) { return p.id === plId; });
          var matchedEntry = matchedPl ? (matchedPl.entries || []).find(function (e) { return e.key === entryKey; }) : null;
          var currentTitle = matchedEntry ? (matchedEntry.chapterTitle || matchedEntry.title || '') : '';
          var newTitle = window.prompt('Tên chương:', currentTitle);
          if (newTitle !== null && newTitle.trim() !== currentTitle) {
            if (matchedPl && matchedEntry) {
              matchedEntry.chapterTitle = newTitle.trim();
              writePlaylists(allPls);
              syncPlaylistsToStorage(plId);
              renderPlaylistDetail(true);
            }
          }
        }
        return;
      }

      var removeBtn = event.target.closest('[data-entry-remove]');
      if (removeBtn) {
        closeAllKebabMenus();
        var entryKey = removeBtn.getAttribute('data-entry-remove');
        var plId = removeBtn.getAttribute('data-playlist-id');
        if (entryKey && plId) {
          // Animate item out then update
          var itemEl = removeBtn.closest('.playlist-entry');
          if (itemEl) {
            itemEl.style.transition = 'opacity .15s ease, max-height .2s ease, margin .2s ease, padding .2s ease';
            itemEl.style.opacity = '0';
            itemEl.style.maxHeight = '0';
            itemEl.style.margin = '0';
            itemEl.style.padding = '0';
            itemEl.style.overflow = 'hidden';
            setTimeout(function () {
              removeEntryFromPlaylist(plId, entryKey);
              // Only re-render detail panel, not full playlist, no fade
              renderPlaylistDetail(true);
            }, 200);
          } else {
            removeEntryFromPlaylist(plId, entryKey);
            renderPlaylistDetail(true);
          }
        }
        return;
      }

      var deleteBtn = event.target.closest('[data-playlist-delete]');
      if (deleteBtn) {
        var plId = deleteBtn.getAttribute('data-playlist-delete');
        if (plId && window.confirm('Xóa truyện này?')) {
          deleteBtn.disabled = true;
          deleteBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
          deletePlaylist(plId).then(function () {
            renderPlaylist();
          }).catch(function () {
            renderPlaylist();
          });
        }
        return;
      }

      var stateTrigger = event.target.closest('[data-playlist-state-trigger]');
      if (stateTrigger) {
        var plId = stateTrigger.getAttribute('data-playlist-state-trigger');
        closePlaylistStateMenus();
        togglePlaylistStateMenu(plId);
        return;
      }

      var stateOption = event.target.closest('[data-playlist-state-set]');
      if (stateOption) {
        var plId = stateOption.getAttribute('data-playlist-state-set');
        var nextState = stateOption.getAttribute('data-playlist-state');
        if (plId && nextState) {
          setPlaylistState(plId, nextState);
          closePlaylistStateMenus();
          renderPlaylist();
        }
        return;
      }

      var playBtn = event.target.closest('.playlist-play-btn');
      if (playBtn) {
        var card = playBtn.closest('[data-playlist-id]');
        if (card) {
          var plId = card.getAttribute('data-playlist-id');
          var playlists = readPlaylists();
          var target = null;
          playlists.forEach(function (p) { if (p.id === plId) target = p; });
          if (target && (target.entries || []).length) {
            var first = target.entries[0];
            if (first && first.href) {
              var navHref = first.href;
              if (navHref.indexOf('playlistId=') === -1) navHref += (navHref.indexOf('?') >= 0 ? '&' : '?') + 'playlistId=' + encodeURIComponent(plId);
              if (window.AudioHubRouter) { window.AudioHubRouter.navigate(navHref); } else { window.location.href = navHref; }
            }
          }
        }
        return;
      }

      var renameBtn = event.target.closest('[data-playlist-rename]');
      if (renameBtn) {
        var plId = renameBtn.getAttribute('data-playlist-rename');
        var nameDisplay = document.querySelector('[data-playlist-name-display="' + plId + '"]');
        if (!nameDisplay) return;
        var currentName = nameDisplay.textContent || '';
        var input = document.createElement('input');
        input.type = 'text';
        input.value = currentName;
        input.className = 'playlist-rename-input';
        nameDisplay.replaceWith(input);
        input.focus();
        input.select();
        function commitRename() {
          var newName = input.value.trim();
          if (newName && newName !== currentName) {
            renamePlaylist(plId, newName);
          }
          renderPlaylist();
        }
        input.addEventListener('blur', commitRename);
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
          if (e.key === 'Escape') { input.value = currentName; input.blur(); }
        });
        return;
      }

      var item = event.target.closest('[data-playlist-id]');
      if (item
        && !event.target.closest('[data-playlist-rename]')
        && !event.target.closest('[data-playlist-delete]')
        && !event.target.closest('[data-page-num]')
        && !event.target.closest('[data-page-prev]')
        && !event.target.closest('[data-page-next]')) {
        var plId = item.getAttribute('data-playlist-id');
        if (plId && plId !== activePlaylistId) {
          currentPlaylistListPage = 1;
          activePlaylistId = plId;
          renderPlaylist();
        }
      }

      // Close kebab menus when clicking outside
      if (!event.target.closest('.playlist-kebab-wrap') && !event.target.closest('.playlist-kebab-menu') && !event.target.closest('.playlist-kebab-floating')) {
        closeAllKebabMenus();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { closeAllKebabMenus(); return; }
      if (e.key !== 'Enter') return;
      var input = document.querySelector('[data-playlist-create-name]');
      if (document.activeElement !== input) return;
      e.preventDefault();
      var name = String(input.value || '').trim();
      if (!name) return;
      createPlaylist(name);
      input.value = '';
      renderPlaylist();
    });

    /* Close on window resize */
    window.addEventListener('resize', function () {
      var open = document.querySelector('.playlist-kebab-menu.is-open');
      if (open) closeAllKebabMenus();
    }, { passive: true });
  }

  // Global API for other pages to add entries to a playlist
  window.AudioHubPlaylist = {
    list: readPlaylists,
    create: function (name) { var pl = createPlaylist(name); renderPlaylist(); return pl; },
    addEntry: function (playlistId, entry) {
      if (!playlistId || !entry || !entry.key) return false;
      var list = readPlaylists();
      var found = false;
      list.forEach(function (p) {
        if (p.id === playlistId) {
          var exists = (p.entries || []).some(function (e) { return e.key === entry.key; });
          if (!exists) {
            p.entries = p.entries || [];
            p.entries.push({
              key: entry.key,
              title: entry.title || '',
              chapterTitle: entry.chapterTitle || '',
              chapterIndex: entry.chapterIndex || 0,
              author: entry.author || '',
              genre: entry.genre || '',
              href: entry.href || '',
              addedAt: new Date().toISOString()
            });
          }
          found = true;
        }
      });
      if (found) { writePlaylists(list); renderPlaylist(); }
      return found;
    },
    remove: function (playlistId, entryKey) { removeEntryFromPlaylist(playlistId, entryKey); renderPlaylistDetail(); }
  };

  // ── Cover Hydration (IIFE scope) ─────────────────────────────────────────
  var STORAGE_BASE = '/api/covers/'; // maps to R2 covers endpoint

  function applyCoverToNode(node, src) {
    if (!src || !node) return;
    node.textContent = '';
    node.style.background = 'none';
    var img = document.createElement('img');
    img.src = src;
    img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
    node.appendChild(img);
    node.setAttribute('data-cover-state', 'loaded');
  }

  function fetchCoverFromStorage(node, url) {
    node.setAttribute('data-cover-state', 'pending');
    fetch(url).then(function (r) {
      if (!r.ok) return null;
      // Try to read as text first to detect data-URL strings
      return r.clone().text().then(function (txt) {
        if (!txt || txt.indexOf('data:video/') === 0) return null;
        if (txt.indexOf('data:image/') === 0) {
          // Response is a text file containing a data-URL string
          var m = txt.match(/^data:image\/(\w+);base64,([\s\S]+)$/);
          if (m) {
            var bin = atob(m[2]);
            var arr = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return URL.createObjectURL(new Blob([arr], { type: 'image/' + m[1] }));
          }
          return null;
        }
        // Response is raw image bytes — read as blob
        return r.blob().then(function (blob) { return blob.size > 0 ? URL.createObjectURL(blob) : null; });
      });
    }).then(function (src) {
      if (src) { applyCoverToNode(node, src); }
      else { node.setAttribute('data-cover-state', 'no-cover'); }
    }).catch(function () { node.setAttribute('data-cover-state', 'no-cover'); });
  }

  var _coverHydrating = false;
  var _coverHydrateTimer = null;
  function hydratePlaylistCovers() {
    // Debounce: prevent rapid consecutive calls (observer fires on each img append)
    if (_coverHydrateTimer) clearTimeout(_coverHydrateTimer);
    _coverHydrateTimer = setTimeout(function () { _doHydrateCovers(); }, 150);
  }
  function _doHydrateCovers() {
    if (_coverHydrating) return;
    _coverHydrating = true;
    var detail = document.querySelector('[data-playlist-detail]');
    if (!detail) { _coverHydrating = false; return; }
    // Build title→cloudKey map from current playlist entries
    var titleToCloudKey = {};
    try {
      var list = readPlaylists();
      var pl = null;
      list.forEach(function (p) { if (p.id === activePlaylistId) pl = p; });
      if (pl) {
        (pl.entries || []).forEach(function (e) {
          var t = String(e.title || '').trim().toLowerCase();
          if (t && !String(e.key || '').startsWith('s_') && !titleToCloudKey[t]) titleToCloudKey[t] = e.key;
        });
      }
    } catch (e) {}

    detail.querySelectorAll('[data-playlist-entry-thumb]').forEach(function (node) {
      var state = node.getAttribute('data-cover-state');
      if (state === 'loaded' || state === 'pending') return;
      var coverKey = String(node.getAttribute('data-playlist-entry-cover-key') || '').trim();
      var entryKey = String(node.getAttribute('data-entry-key') || '').trim();
      var isLocal = String(entryKey).startsWith('s_');

      if (coverKey && window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function') {
        node.setAttribute('data-cover-state', 'pending');
        window.AudioHubStoryCover.get(coverKey).then(function (blob) {
          if (blob) applyCoverToNode(node, URL.createObjectURL(blob));
          else node.setAttribute('data-cover-state', 'no-cover');
        }).catch(function () { node.setAttribute('data-cover-state', 'no-cover'); });
      } else if (!isLocal && entryKey) {
        fetchCoverFromStorage(node, STORAGE_BASE + entryKey);
      } else if (isLocal) {
        // Find matching entry's title, then look up cloud key
        var matchedEntry = null;
        try {
          var list2 = readPlaylists();
          var pl2 = null;
          list2.forEach(function (p) { if (p.id === activePlaylistId) pl2 = p; });
          if (pl2) (pl2.entries || []).forEach(function (e) { if (!matchedEntry && String(e.key) === entryKey) matchedEntry = e; });
        } catch (e) {}
        var t2 = String((matchedEntry && matchedEntry.title) || '').trim().toLowerCase();
        var cloudKey = titleToCloudKey[t2];
        if (cloudKey) fetchCoverFromStorage(node, STORAGE_BASE + cloudKey);
        else node.setAttribute('data-cover-state', 'no-cover');
      } else {
        node.setAttribute('data-cover-state', 'no-cover');
      }
    });
    _coverHydrating = false;
  }

  // MutationObserver: auto-hydrate covers whenever playlist detail DOM changes
  (function () {
    var _observerTimer = null;
    var observer = new MutationObserver(function () {
      // Debounce observer: avoid rapid fire when hydration appends <img> elements
      if (_observerTimer) clearTimeout(_observerTimer);
      _observerTimer = setTimeout(function () { hydratePlaylistCovers(); }, 200);
    });
    var target = document.querySelector('[data-playlist-detail]');
    if (target) {
      observer.observe(target, { childList: true, subtree: true });
    } else {
      // Wait for it to appear (throttled — body observer is expensive)
      var _obs2Timer = null;
      var obs2 = new MutationObserver(function () {
        if (_obs2Timer) return;
        _obs2Timer = setTimeout(function () {
          _obs2Timer = null;
          var t = document.querySelector('[data-playlist-detail]');
          if (t) {
            obs2.disconnect();
            observer.observe(t, { childList: true, subtree: true });
            hydratePlaylistCovers();
          }
        }, 300);
      });
      obs2.observe(document.body, { childList: true, subtree: true });
    }
  })();

  // Also hydrate on DOMContentLoaded as a fallback
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () { hydratePlaylistCovers(); }, 200);
    setTimeout(function () { hydratePlaylistCovers(); }, 500);
    setTimeout(function () { hydratePlaylistCovers(); }, 1000);
  });

  // ── End Playlist ──────────────────────────────────────────────────────────

  function _doRefreshAll() {
    try { renderStoriesSection(); } catch (e) {}
    try { renderLibrarySections(); } catch (e) {}
    try { renderTrash(); } catch (e) {}
    try { renderPlaylist(); } catch (e) {}
  }
  var _refreshTimer = null;
  function refreshAll() {
    // Debounce: prevent rapid consecutive refreshes (storage events, sync events)
    if (_refreshTimer) clearTimeout(_refreshTimer);
    _refreshTimer = setTimeout(_doRefreshAll, 200);
  }

  initAvatar();
  initTabs();
  initMainTabs();
  initContentTabs();

  // Global tab switch function (used by onclick in HTML as failsafe)
  window.AudioHubSwitchMainTab = function (name) {
    setMainTab(name);
  };
  bindStoryMenuActions();
  bindCollectionActions();
  bindPagination();
  bindPlaylistActions();
  clearLocalDemoStories();
  _doRefreshAll(); // Immediate render on init (no debounce)

  // ── ROBUST FALLBACK: document-level click delegation for main tabs ──
  // SPA router loads scripts in parallel — initMainTabs() may run before DOM is ready.
  // This ensures clicks work even if the IIFE handlers didn't bind.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-main-tab]');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    var tabName = btn.getAttribute('data-main-tab');
    if (!tabName) return;
    // Update button states
    document.querySelectorAll('[data-main-tab]').forEach(function (b) {
      var active = b.getAttribute('data-main-tab') === tabName;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    // Update panels
    document.querySelectorAll('[data-main-panel]').forEach(function (p) {
      var active = p.getAttribute('data-main-panel') === tabName;
      p.classList.toggle('is-active', active);
      p.hidden = !active;
    });
  }, true);

  // ── ROBUST FALLBACK: document-level click delegation for content tabs ──
  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-content-tab]');
    if (!btn) return;
    e.preventDefault();
    var tabName = btn.getAttribute('data-content-tab');
    if (!tabName) return;
    document.querySelectorAll('[data-content-tab]').forEach(function (b) {
      var active = b.getAttribute('data-content-tab') === tabName;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-content-panel]').forEach(function (p) {
      var active = p.getAttribute('data-content-panel') === tabName;
      p.classList.toggle('is-active', active);
      p.hidden = !active;
    });
  }, true);

  window.addEventListener('audiohub:stories-updated', refreshAll);
  window.addEventListener('audiohub:stories-synced', refreshAll);

  // Force sync from API when page loads
  if (window.AudioHubStories && typeof window.AudioHubStories.sync === 'function') {
    window.AudioHubStories.sync();
  }

  window.addEventListener('storage', function (event) {
    if (!event || !event.key) return;
    if (event.key === 'audiohub-library' || event.key === AVATAR_STORAGE_KEY || event.key === PLAYLIST_STORAGE_KEY) {
      refreshAll();
    }
  });

  // ── Mobile nav drawer ──────────────────────────────────
  var navToggle = document.querySelector('[data-nav-toggle]');
  var navDrawer = document.querySelector('[data-nav-drawer]');
  var navOverlay = document.querySelector('[data-nav-overlay]');
  var navClose = document.querySelector('[data-nav-close]');

  function openNav() {
    if (navDrawer) navDrawer.classList.add('is-open');
    if (navOverlay) navOverlay.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }

  function closeNav() {
    if (navDrawer) navDrawer.classList.remove('is-open');
    if (navOverlay) navOverlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  if (navToggle) navToggle.addEventListener('click', openNav);
  if (navClose) navClose.addEventListener('click', closeNav);
  if (navOverlay) navOverlay.addEventListener('click', closeNav);

  // ── Deferred retry: SPA router loads scripts in parallel ──
  // AudioHubStoryCover / AudioHubStories may not be available on first run.
  // Re-hydrate after a short delay to catch late-loading dependencies.
  setTimeout(function () {
    try { refreshAll(); } catch (e) {}
  }, 800);
  setTimeout(function () {
    try { refreshAll(); } catch (e) {}
  }, 2000);
})();
