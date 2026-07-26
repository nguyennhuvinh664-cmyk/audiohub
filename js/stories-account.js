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

  function getStories() {
    if (!window.AudioHubStories || typeof window.AudioHubStories.read !== 'function') return [];
    var stories = window.AudioHubStories.read();
    return Array.isArray(stories) ? stories : [];
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
    return '/story-detail.html?id=' + encodeURIComponent(String(story && story.id || ''));
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
    var sorted = sortRecentDesc(stories);
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

    // Then fetch from API in background (if logged in)
    if (isRealLogin()) {
      window.AudioHubApi.request('/stories', { method: 'GET' })
        .then(function (response) {
          var stories = Array.isArray(response) ? response : [];
          if (stories.length) {
            renderStoriesFromList(stories);
          }
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

    document.addEventListener('click', function (event) {
      // close all menus if clicking outside
      if (!event.target.closest('[data-story-menu-panel]') && !event.target.closest('[data-story-menu]')) {
        document.querySelectorAll('[data-story-menu-panel]').forEach(function (p) { p.classList.add('is-hidden'); });
      }

      // toggle 3-dot menu
      var menuBtn = event.target.closest('[data-story-menu], .account-item-menu-btn');
      if (menuBtn) {
        var sid = menuBtn.getAttribute('data-story-menu');
        var panel = document.querySelector('[data-story-menu-panel="' + sid + '"]');
        if (!panel) return;
        var isOpen = !panel.classList.contains('is-hidden');
        document.querySelectorAll('[data-story-menu-panel]').forEach(function (p) { p.classList.add('is-hidden'); });
        document.querySelectorAll('.account-item-menu-wrap').forEach(function (wrap) { wrap.classList.remove('is-open'); });
        if (!isOpen) {
          panel.classList.remove('is-hidden');
          var wrap = panel.closest('.account-item-menu-wrap');
          if (wrap) wrap.classList.add('is-open');
        }
        event.stopPropagation();
        return;
      }

      // add to playlist
      var addPlaylistBtn = event.target.closest('[data-story-add-playlist]');
      if (addPlaylistBtn) {
        var storyId = addPlaylistBtn.getAttribute('data-story-add-playlist');
        var playlists = readPlaylists();
        document.querySelectorAll('[data-story-menu-panel]').forEach(function (p) { p.classList.add('is-hidden'); });

        // remove existing modal
        var existing = document.getElementById('playlist-picker-modal');
        if (existing) existing.remove();

        if (!playlists.length) {
          // show mini toast
          showToast('Bạn chưa có truyện nào. Hãy tạo trong tab "Truyện đã lưu".');
          return;
        }

        var entry = {
          key: storyId,
          title: addPlaylistBtn.getAttribute('data-story-title') || '',
          chapterTitle: addPlaylistBtn.getAttribute('data-story-chapter-title') || '',
          chapterIndex: 0,
          author: addPlaylistBtn.getAttribute('data-story-author') || '',
          genre: addPlaylistBtn.getAttribute('data-story-genre') || '',
          href: addPlaylistBtn.getAttribute('data-story-href') || '',
          status: 'listening',
          progress: 0
        };

        var modal = document.createElement('div');
        modal.id = 'playlist-picker-modal';
        modal.className = 'pl-picker-backdrop';
        modal.innerHTML = '' +
          '<div class="pl-picker">' +
            '<div class="pl-picker__header">' +
              '<span>Lưu vào truyện</span>' +
              '<button type="button" class="pl-picker__close" id="pl-picker-close"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            '<ul class="pl-picker__list">' +
              playlists.map(function (pl) {
                var inList = (pl.entries || []).some(function (e) { return e.key === storyId; });
                return '<li>' +
                  '<button type="button" class="pl-picker__item' + (inList ? ' is-added' : '') + '" data-pick-pl="' + escapeHtml(pl.id) + '">' +
                    '<span class="pl-picker__check"><i class="fa-solid fa-check"></i></span>' +
                    '<span class="pl-picker__name">' + escapeHtml(pl.name) + '</span>' +
                    '<span class="pl-picker__count">' + (pl.entries || []).length + ' truyện</span>' +
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
          var alreadyIn = (target.entries || []).some(function (e) { return e.key === storyId; });
          if (alreadyIn) {
            // remove from playlist
            target.entries = target.entries.filter(function (e) { return e.key !== storyId; });
            writePlaylists(lists);
            pickBtn.classList.remove('is-added');
            showToast('Đã xóa khỏi "' + target.name + '".');
          } else {
            target.entries = target.entries || [];
            // Ensure href includes playlistId
            var baseHref = entry.href || '';
            if (baseHref && baseHref.indexOf('playlistId=') === -1) {
              baseHref += (baseHref.indexOf('?') >= 0 ? '&' : '?') + 'playlistId=' + encodeURIComponent(plId);
            }
            entry.href = baseHref;
            target.entries.push(entry);
            writePlaylists(lists);
            pickBtn.classList.add('is-added');
            showToast('Đã thêm vào "' + target.name + '".');
          }
          renderPlaylist();
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
        var container = deleteBtn.closest('[data-stories-published], [data-stories-drafts]');
        if (!container) return;
        var checked = Array.prototype.slice.call(container.querySelectorAll('[data-story-checkbox]:checked'));
        if (!checked.length) return;
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
      deleteBtn.textContent = checked > 0 ? ('Xóa ' + checked + ' đã chọn') : 'Xóa đã chọn';
    }
  }

  function deleteStoriesByIds(ids) {
    if (!window.AudioHubStories || typeof window.AudioHubStories.remove !== 'function') return;
    ids.forEach(function (id) {
      window.AudioHubStories.remove(id);
      // Also delete from Supabase database
      try {
        var SUPABASE_DIRECT = 'https://oatwyxkzonhjfdzapjyb.supabase.co';
        var SUPABASE_KEY = 'sb_publishable_BP2pN_2F9YOgC2K3yZPjIA_nDYxmGie';
        fetch(SUPABASE_DIRECT + '/rest/v1/stories?id=eq.' + encodeURIComponent(id), {
          method: 'DELETE',
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
        }).then(function (r) {
          if (r.ok) console.log('[account] Deleted story from DB:', id);
        }).catch(function (e) { console.warn('[account] DB delete failed:', e); });
      } catch (e) {}
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
    root.querySelectorAll('[data-library-thumb]').forEach(function (node) {
      var coverKey = String(node.getAttribute('data-library-cover-key') || '').trim();
      if (!coverKey) return;
      window.AudioHubStoryCover.get(coverKey).then(function (blob) {
        if (!blob) return;
        var url = URL.createObjectURL(blob);
        node.style.backgroundImage = 'url("' + url + '")';
        node.style.backgroundSize = 'cover';
        node.style.backgroundPosition = 'center';
        node.classList.add('is-cover-ready');
      }).catch(function () {});
    });
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
      var coverKey = story.coverKey ? String(story.coverKey) : '';
      var thumbStyle = 'background: linear-gradient(135deg, #1a1040, #2d1b69)';
      var metaLine = author + ' · ' + genre + (updated ? (' · Cập nhật ' + escapeHtml(updated)) : '');

      var editHref = '/html/upload-story.html?id=' + encodeURIComponent(storyId);
      return '' +
        '<div class="yt-card" data-story-item>' +
          '<label class="yt-card__checkbox"><input type="checkbox" data-story-checkbox data-story-id="' + escapeHtml(storyId) + '" /></label>' +
          '<div class="yt-card__thumb-wrap">' +
            '<div class="yt-card__thumb" data-story-thumb data-story-id="' + escapeHtml(storyId) + '" data-cover-key="' + escapeHtml(coverKey) + '" style="' + thumbStyle + '">' +
              '<span>' + escapeHtml((story.title || 'ST').slice(0, 2).toUpperCase()) + '</span>' +
            '</div>' +
          '</div>' +
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

    var paginationWrap = document.querySelector('[data-pagination-wrap="' + type + '"]');
    if (paginationWrap) {
      paginationWrap.innerHTML = totalPages > 1 ? buildPagination(page, totalPages, type) : '';
    }

    hydrateStoryThumbs(mount);
  }

  function hydrateStoryThumbs(root) {
    if (!root || !window.AudioHubStories || typeof window.AudioHubStories.getById !== 'function') return;
    if (!window.AudioHubStoryCover || typeof window.AudioHubStoryCover.get !== 'function') return;

    root.querySelectorAll('[data-story-thumb]').forEach(function (node) {
      node.classList.remove('is-cover-ready');
      var storyId = String(node.getAttribute('data-story-id') || '').trim();
      var coverKey = String(node.getAttribute('data-cover-key') || '').trim();

      if (!coverKey && storyId) {
        var story = window.AudioHubStories.getById(storyId);
        coverKey = story && story.coverKey ? String(story.coverKey) : '';
        if (coverKey) node.setAttribute('data-cover-key', coverKey);
      }

      if (!coverKey) return;

      window.AudioHubStoryCover.get(coverKey)
        .then(function (blob) {
          if (!blob) return;
          var url = URL.createObjectURL(blob);
          node.style.backgroundImage = 'url("' + url + '")';
          node.style.backgroundSize = 'cover';
          node.style.backgroundPosition = 'center';
          node.classList.add('is-cover-ready');
        })
        .catch(function (err) {
          console.warn('Failed to load cover:', coverKey, err);
        });
    });
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
    if (!mainTabButtons.length) return;
    // Check if URL has hash to switch to mycontent tab
    var hash = window.location.hash;
    var initialMainTab = 'history';
    if (hash === '#mycontent-draft' || hash === '#mycontent') {
      initialMainTab = 'mycontent';
    }
    setMainTab(initialMainTab);
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
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function writePlaylists(list) {
    try {
      window.localStorage.setItem(PLAYLIST_STORAGE_KEY, JSON.stringify(list));
    } catch (e) {}
    // Sync to Supabase Storage (shared across all users)
    try {
      var SUPABASE_DIRECT = 'https://oatwyxkzonhjfdzapjyb.supabase.co';
      var SUPABASE_KEY = 'sb_publishable_BP2pN_2F9YOgC2K3yZPjIA_nDYxmGie';
      fetch(SUPABASE_DIRECT + '/storage/v1/object/story-covers/playlists/index.json', {
        method: 'PUT',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(list)
      }).catch(function () {});
    } catch (e) {}
  }

  function generateId() {
    return 'pl-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now();
  }

  function createPlaylist(name) {
    var list = readPlaylists();
    var playlist = { id: generateId(), name: String(name || '').trim(), entries: [], createdBy: 'admin', createdAt: new Date().toISOString() };
    list.push(playlist);
    writePlaylists(list);
    return playlist;
  }

  function deletePlaylist(id) {
    var list = readPlaylists().filter(function (p) { return p.id !== id; });
    writePlaylists(list);
    if (activePlaylistId === id) activePlaylistId = null;
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
    var list = readPlaylists().filter(function (p) {
      return String(p.createdBy || 'admin') === 'admin';
    });

    if (playlistNote) playlistNote.classList.toggle('is-hidden', true);

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

    renderPlaylistDetail();
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
              '<button type="button" class="playlist-btn playlist-btn--remove" data-entry-remove="' + escapeHtml(entry.key) + '" data-playlist-id="' + escapeHtml(pl.id) + '" title="Xóa khỏi truyện"><i class="fa-solid fa-xmark"></i></button>' +
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

      // hydrate covers
      var detailMount2 = document.querySelector('[data-playlist-detail]');
      if (detailMount2) {
        // Build a map: title → first non-s_ entry key (for s_ entries to share cover)
        var titleToCloudKey = {};
        entries.forEach(function (e) {
          var t = String(e.title || '').trim().toLowerCase();
          if (t && !String(e.key || '').startsWith('s_') && !titleToCloudKey[t]) {
            titleToCloudKey[t] = e.key;
          }
        });

        detailMount2.querySelectorAll('[data-playlist-entry-thumb]').forEach(function (node) {
          if (node.classList.contains('is-cover-ready')) return;
          var coverKey = String(node.getAttribute('data-playlist-entry-cover-key') || '').trim();
          var entryKey = String(node.getAttribute('data-entry-key') || '').trim();
          var isLocal = String(entryKey).startsWith('s_');
          // Find matching entry object for title lookup
          var matchedEntry = null;
          entries.forEach(function (e) { if (!matchedEntry && String(e.key) === entryKey) matchedEntry = e; });

          if (coverKey && window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function') {
            window.AudioHubStoryCover.get(coverKey).then(function (blob) {
              if (!blob) return;
              applyCoverToNode(node, URL.createObjectURL(blob));
            }).catch(function () {});
          } else if (entryKey && !isLocal) {
            // Cloud story: fetch cover from Supabase Storage
            var storageUrl = 'https://oatwyxkzonhjfdzapjyb.supabase.co/storage/v1/object/public/story-covers/' + entryKey + '/cover';
            fetchCoverFromUrl(node, storageUrl);
          } else if (isLocal) {
            // Local story: find cloud key by same title, use its cover
            // matchedEntry.title is the story name (e.g. "Thiên Long Bát Bộ")
            var t2 = String((matchedEntry && matchedEntry.title) || '').trim().toLowerCase();
            var cloudKey = titleToCloudKey[t2];
            if (cloudKey) {
              var storageUrl2 = 'https://oatwyxkzonhjfdzapjyb.supabase.co/storage/v1/object/public/story-covers/' + cloudKey + '/cover';
              fetchCoverFromUrl(node, storageUrl2);
            }
          }
        });
      }

      function applyCoverToNode(node, src) {
        if (!src || !node) return;
        node.textContent = '';
        node.style.background = 'none';
        var img = document.createElement('img');
        img.src = src;
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block';
        node.appendChild(img);
        node.classList.add('is-cover-ready');
      }

      function fetchCoverFromUrl(node, url) {
        fetch(url).then(function (r) {
          if (!r.ok) return null;
          return r.clone().arrayBuffer().then(function (buf) {
            var head = new Uint8Array(buf).slice(0, 30);
            var ascii = String.fromCharCode.apply(null, head);
            if (ascii.indexOf('data:video/') === 0) return null;
            if (ascii.indexOf('data:image/') === 0) {
              // Text file containing data-URL — decode to blob for reliable cross-device display
              var txt = String.fromCharCode.apply(null, new Uint8Array(buf));
              var m = txt.match(/^data:image\/(\w+);base64,([\s\S]+)$/);
              if (m) {
                var bin = atob(m[2]);
                var arr = new Uint8Array(bin.length);
                for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
                return URL.createObjectURL(new Blob([arr], { type: 'image/' + m[1] }));
              }
              return null;
            }
            // Raw image bytes — create blob directly
            return r.blob().then(function (b) { return URL.createObjectURL(b); });
          });
        }).then(function (src) {
          applyCoverToNode(node, src);
        }).catch(function () {});
      }

      // Batch-fetch missing chapter titles from Supabase for entries without chapterTitle
      if (detailMount2) {
        var nodesNeedingTitle = detailMount2.querySelectorAll('[data-needs-chapter-title]');
        if (nodesNeedingTitle.length) {
          // Count ALL entries per key in DOM (including those that already have chapterTitle)
          // to determine correct chapterIndex offset for entries needing titles
          var allEntryNodes = detailMount2.querySelectorAll('[data-entry-key]');
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
            fetch('https://oatwyxkzonhjfdzapjyb.supabase.co/rest/v1/stories?id=in.(' + idsParam + ')&select=id,chapter_title,chapters,cover_data', {
              headers: { 'apikey': 'sb_publishable_BP2pN_2F9YOgC2K3yZPjIA_nDYxmGie', 'Authorization': 'Bearer sb_publishable_BP2pN_2F9YOgC2K3yZPjIA_nDYxmGie' }
            }).then(function (r) { return r.ok ? r.json() : []; }).then(function (rows) {
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

      if (detailMount2) detailMount2.querySelectorAll('.playlist-progress-slider').forEach(function (slider) {
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

  function bindPlaylistActions() {
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

      var removeBtn = event.target.closest('[data-entry-remove]');
      if (removeBtn) {
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
          deletePlaylist(plId);
          renderPlaylist();
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
    });

    document.addEventListener('keydown', function (e) {
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
              href: entry.href || ''
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

  // ── End Playlist ──────────────────────────────────────────────────────────

  function refreshAll() {
    try { renderStoriesSection(); } catch (e) {}
    try { renderLibrarySections(); } catch (e) {}
    try { renderTrash(); } catch (e) {}
    try { renderPlaylist(); } catch (e) {}
  }

  initAvatar();
  initTabs();
  initMainTabs();
  initContentTabs();
  bindStoryMenuActions();
  bindCollectionActions();
  bindPagination();
  bindPlaylistActions();
  clearLocalDemoStories();
  refreshAll();

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
})();
