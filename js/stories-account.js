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
    return Array.isArray(window.AudioHubStories.read()) ? window.AudioHubStories.read() : [];
  }

  function isDraft(story) {
    var visibility = String(story && story.visibility || '').trim().toLowerCase();
    return !visibility || visibility === 'riêng tư' || visibility === 'không công khai' || visibility === 'private' || visibility === 'draft';
  }

  function sortRecentDesc(list) {
    return list.slice().sort(function (a, b) {
      var ta = Date.parse(String((b && b.updatedAt) || (b && b.createdAt) || '')) || 0;
      var tb = Date.parse(String((a && a.updatedAt) || (a && a.createdAt) || '')) || 0;
      return ta - tb;
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

  function renderStoriesSection() {
    var stories = sortRecentDesc(getStories());
    var published = stories.filter(function (story) { return !isDraft(story); });
    var drafts = stories.filter(isDraft);

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
      var playlistTab = document.querySelector('[data-content-tab="playlist"]');
      playlistTab.textContent = 'Danh sách phát';
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

    var stats = {
      favorites: (lib.favorites || []).length,
      history: (lib.history || []).length,
      stories: getStories().length
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
      }
    });
  }

  function bindBulkActions() {
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
      var deleteBtn = event.target.closest('[data-delete-selected]');
      if (!deleteBtn) return;
      var container = deleteBtn.closest('[data-stories-published], [data-stories-drafts]');
      if (!container) return;
      var checked = Array.prototype.slice.call(container.querySelectorAll('[data-story-checkbox]:checked'));
      if (!checked.length) return;
      var ids = checked.map(function (cb) { return cb.getAttribute('data-story-id'); }).filter(Boolean);
      if (!ids.length) return;
      if (!window.confirm('Xóa ' + ids.length + ' truyện đã chọn?')) return;
      deleteStoriesByIds(ids);
      renderStoriesSection();
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
    if (!window.AudioHubStories || typeof window.AudioHubStories.deleteById !== 'function') return;
    ids.forEach(function (id) {
      window.AudioHubStories.deleteById(id);
    });
  }

  function bindCollectionActions() {
    document.addEventListener('click', function (event) {
      var button = event.target && event.target.closest ? event.target.closest('[data-library-remove]') : null;
      if (!button) return;
      var type = button.getAttribute('data-library-remove');
      var key = button.getAttribute('data-story-key');
      if (!type || !key) return;
      removeFromCollection(type, key);
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

    if (totalPages > 1) {
      html += buildPagination(page, totalPages, 'history');
    }

    historyMount.innerHTML = html;
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

    if (totalPages > 1) {
      html += buildPagination(page, totalPages, 'favorites');
    }

    favoritesMount.innerHTML = html;
    hydrateLibraryThumbs(favoritesMount);
  }

  function buildPagination(current, total, type) {
    var html = '<div class="account-pagination">';
    html += '<button type="button" class="account-page-btn" data-page-prev data-page-type="' + type + '" ' + (current === 1 ? 'disabled' : '') + '><i class="fa-solid fa-chevron-left"></i></button>';
    html += '<span class="account-page-info">Trang ' + current + ' / ' + total + '</span>';
    html += '<button type="button" class="account-page-btn" data-page-next data-page-type="' + type + '" ' + (current === total ? 'disabled' : '') + '><i class="fa-solid fa-chevron-right"></i></button>';
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
      html += '<label class="account-checkbox-all"><input type="checkbox" data-select-all /> <span>Chọn tất cả</span></label>';
      html += '<button type="button" class="btn btn--outline btn--danger" data-delete-selected disabled><i class="fa-solid fa-trash"></i> Xóa đã chọn</button>';
      html += '</div>';
    }

    html += '<ul class="account-list account-list--selectable">' + paged.map(function (story) {
      var title = escapeHtml(story.title || 'Truyện mới');
      var author = escapeHtml(story.author || 'Ẩn danh');
      var genre = escapeHtml(story.genre || 'Truyện audio');
      var updated = formatTime(story.updatedAt || story.createdAt);
      var storyId = String(story.id || '').trim();
      var coverKey = story.coverKey ? String(story.coverKey) : '';
      var thumbStyle = 'background: linear-gradient(135deg, #6366f1, #8b5cf6)';

      return '' +
        '<li data-story-item>' +
          '<label class="account-item-checkbox"><input type="checkbox" data-story-checkbox data-story-id="' + escapeHtml(storyId) + '" /></label>' +
          '<div class="account-item-thumb" data-story-thumb data-story-id="' + escapeHtml(storyId) + '" data-cover-key="' + escapeHtml(coverKey) + '" style="' + thumbStyle + '">' +
            '<span>' + escapeHtml((story.title || 'ST').slice(0, 2).toUpperCase()) + '</span>' +
          '</div>' +
          '<div class="account-item-body">' +
            '<strong><a href="' + escapeHtml(storyHref(story)) + '">' + title + '</a></strong>' +
            '<small>' + author + ' · ' + genre + (updated ? (' · Cập nhật ' + escapeHtml(updated)) : '') + '</small>' +
          '</div>' +
        '</li>';
    }).join('') + '</ul>';

    if (totalPages > 1) {
      html += buildPagination(page, totalPages, type);
    }

    mount.innerHTML = html;
    hydrateStoryThumbs(mount);
  }

  function hydrateStoryThumbs(root) {
    if (!root || !window.AudioHubStories || typeof window.AudioHubStories.getById !== 'function') return;
    if (!window.AudioHubStoryCover || typeof window.AudioHubStoryCover.get !== 'function') return;

    root.querySelectorAll('[data-story-thumb]').forEach(function (node) {
      node.classList.remove('is-cover-ready');
      var coverKey = String(node.getAttribute('data-cover-key') || '').trim();
      if (!coverKey) return;

      window.AudioHubStoryCover.get(coverKey)
        .then(function (blob) {
          if (!blob) return;
          var url = URL.createObjectURL(blob);
          node.style.backgroundImage = 'url("' + url + '")';
          node.classList.add('is-cover-ready');
        })
        .catch(function () {});
    });
  }

  function buildFavoriteList(items) {
    if (!favoritesMount) return;
    if (!items.length) {
      favoritesMount.innerHTML = '<p class="library-empty">Chưa có truyện yêu thích nào được lưu.</p>';
      return;
    }
    favoritesMount.innerHTML = '<ul class="favorites-youtube-grid">' + items.map(function (item) {
      return '' +
        '<li class="favorite-youtube-card">' +
          '<a class="favorite-youtube-thumb" href="' + escapeHtml(item.href) + '">' + escapeHtml((item.title || 'AH').slice(0, 2).toUpperCase()) + '</a>' +
          '<div class="favorite-youtube-body">' +
            '<a class="favorite-youtube-title" href="' + escapeHtml(item.href) + '">' + escapeHtml(item.title || 'AudioHub Story') + '</a>' +
            '<p class="favorite-youtube-meta">' + escapeHtml(item.author || 'Ẩn danh') + '</p>' +
            '<p class="favorite-youtube-sub">' + escapeHtml(item.genre || 'Truyện audio') + '</p>' +
          '</div>' +
        '</li>';
    }).join('') + '</ul>';
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
    buildHistoryList(sortRecentDesc(lib.history || []));
    buildFavoriteList(lib.favorites || []);

    var stats = {
      favorites: (lib.favorites || []).length,
      history: (lib.history || []).length,
      stories: getStories().length
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
    var initial = readTab();
    if (!contentButtons.some(function (button) {
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
    setMainTab('history');
    mainTabButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        setMainTab(button.getAttribute('data-main-tab'));
      });
    });
  }

  function refreshAll() {
    renderStoriesSection();
    renderLibrarySections();
    renderTrash();
  }

  initAvatar();
  initTabs();
  initMainTabs();
  initContentTabs();
  bindBulkActions();
  bindCollectionActions();
  bindPagination();
  refreshAll();
  setContentPanel('published');

  window.addEventListener('audiohub:stories-updated', refreshAll);
  window.addEventListener('storage', function (event) {
    if (!event || !event.key) return;
    if (event.key === 'audiohub-library' || event.key === AVATAR_STORAGE_KEY) {
      refreshAll();
    }
  });
})();
