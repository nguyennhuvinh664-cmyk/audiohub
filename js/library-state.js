(function () {
  var STORAGE_KEY = 'audiohub-library';
  var DEFAULT_LIBRARY = {
    favorites: [],
    history: []
  };

  function cloneDefault() {
    return {
      favorites: DEFAULT_LIBRARY.favorites.slice(),
      history: DEFAULT_LIBRARY.history.slice()
    };
  }

  function readLibrary() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return cloneDefault();
      }

      var parsed = JSON.parse(raw);
      return {
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
        history: Array.isArray(parsed.history) ? parsed.history : []
      };
    } catch (error) {
      return cloneDefault();
    }
  }

  function writeLibrary(library) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
  }

  function storyKey(story) {
    return (story.href || 'story-detail') + '::' + (story.title || 'story');
  }

  function normalizeText(value, fallback) {
    return value ? value.trim() : fallback;
  }

  function buildStoryData(source) {
    if (!source) {
      return null;
    }

    var href = source.getAttribute('href') || '';
    if (!href) {
      var id = source.dataset.storyId || '';
      if (!id && window.location && window.location.search) {
        try {
          var params = new URLSearchParams(window.location.search);
          id = params.get('id') || '';
        } catch (error) {
          id = '';
        }
      }
      href = id ? ('/story-detail?id=' + encodeURIComponent(String(id))) : 'story-detail';
    }

    var storyId = String(source.dataset.storyId || '').trim();
    var title = normalizeText(source.dataset.title, 'AudioHub Story');
    var author = normalizeText(source.dataset.author, 'AudioHub');
    var genre = normalizeText(source.dataset.genre, 'Truyện audio');
    var coverKey = String(source.dataset.coverKey || '').trim();

    // Always try AudioHubStories store first (authoritative source)
    if (storyId && window.AudioHubStories && typeof window.AudioHubStories.getById === 'function') {
      var story = window.AudioHubStories.getById(storyId);
      if (story) {
        title = story.title || title;
        author = story.author || author;
        genre = story.genre || genre;
        coverKey = story.coverKey ? String(story.coverKey) : coverKey;
      }
    }

    // Fallback: resolve storyId from URL if not in dataset
    if (!storyId && window.location && window.location.search) {
      try {
        storyId = new URLSearchParams(window.location.search).get('id') || '';
      } catch (e) {}
    }

    return {
      key: source.dataset.storyKey || (storyId ? ('story::' + storyId) : (href + '::' + title)),
      title: title,
      author: author,
      genre: genre,
      progress: normalizeText(source.dataset.progress, 'Đang cập nhật'),
      note: normalizeText(source.dataset.note, 'Đồng bộ trong thư viện cá nhân.'),
      href: href,
      coverKey: coverKey
    };
  }

  function upsertItem(list, story, extras) {
    var key = story.key || storyKey(story);
    var existingIndex = list.findIndex(function (item) {
      return item.key === key;
    });
    var entry = {
      key: key,
      title: story.title,
      author: story.author,
      genre: story.genre,
      progress: story.progress,
      note: story.note,
      href: story.href,
      coverKey: story.coverKey ? String(story.coverKey) : '',
      savedAt: new Date().toISOString()
    };

    if (extras) {
      Object.keys(extras).forEach(function (field) {
        entry[field] = extras[field];
      });
    }

    if (existingIndex >= 0) {
      list.splice(existingIndex, 1);
    }

    list.unshift(entry);
    return list;
  }

  function removeItem(list, key) {
    return list.filter(function (item) {
      return item.key !== key;
    });
  }

  function hasItem(list, key) {
    return list.some(function (item) {
      return item.key === key;
    });
  }

  function hasItemByStory(story, list) {
    var key = story && story.key ? String(story.key) : '';
    if (key && hasItem(list, key)) return true;
    var storyHref = String(story && story.href || '');
    var storyId = storyIdFromHref(storyHref);
    if (!storyId) return false;
    return (Array.isArray(list) ? list : []).some(function (item) {
      return storyIdFromHref(item && item.href) === storyId;
    });
  }

  function setActiveState(button, active) {
    if (!button) return;
    button.classList.toggle('is-active', !!active);
    button.setAttribute('aria-pressed', active ? 'true' : 'false');
  }

  function refreshDetailButtonLabels() {
    var favoriteButton = document.querySelector('[data-detail-favorite]');
    if (favoriteButton && favoriteButton.textContent.indexOf('Yêu thích') < 0) favoriteButton.innerHTML = '<i class="fa-solid fa-heart"></i> Yêu thích';
  }

  function hydrateDetailStoryIdentity() {
    var detail = document.querySelector('[data-detail-story]');
    if (!detail) return;
    var href = detail.getAttribute('href') || '';
    var id = detail.getAttribute('data-story-id') || storyIdFromHref(href);
    if (!id && window.location && window.location.search) {
      try { id = new URLSearchParams(window.location.search).get('id') || ''; } catch (error) {}
    }
    if (id && !detail.getAttribute('data-story-id')) detail.setAttribute('data-story-id', String(id));
    if ((!href || href === 'story-detail' || href.indexOf('story-detail') === 0) && id) detail.setAttribute('href', '/story-detail?id=' + encodeURIComponent(String(id)));
  }

  function syncDetailActionsDeferred() {
    hydrateDetailStoryIdentity();
    refreshDetailButtonLabels();
    syncDetailActions();
  }

  window.addEventListener('audiohub:stories-updated', syncDetailActionsDeferred);
  window.addEventListener('load', syncDetailActionsDeferred);
  setTimeout(syncDetailActionsDeferred, 80);
  setTimeout(syncDetailActionsDeferred, 280);
  setTimeout(syncDetailActionsDeferred, 620);

  function toggleCollection(type, story) {
    var library = readLibrary();
    var key = story.key || storyKey(story);
    var list = library[type];

    if (hasItem(list, key)) {
      library[type] = removeItem(list, key);
      writeLibrary(library);
      return false;
    }

    library[type] = upsertItem(list, story);
    writeLibrary(library);
    return true;
  }

  function removeFromCollection(type, key) {
    var library = readLibrary();
    library[type] = removeItem(library[type], key);
    writeLibrary(library);
  }

  function renderStat(type, value) {
    document.querySelectorAll('[data-library-stat="' + type + '"]').forEach(function (node) {
      node.textContent = String(value);
    });
  }

  function buildEmpty(message) {
    return '<div class="library-empty">' + message + '</div>';
  }

  function deriveThumbLabel(item) {
    var title = String(item && item.title || '').trim();
    if (!title) return 'AH';
    return title.split(/\s+/).filter(Boolean).slice(0, 2).map(function (part) {
      return part.charAt(0).toUpperCase();
    }).join('') || 'AH';
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

  function storyIdFromHref(href) {
    var text = String(href || '');
    var marker = 'id=';
    var idx = text.indexOf(marker);
    if (idx < 0) return '';
    var value = text.slice(idx + marker.length).split('&')[0];
    try {
      return decodeURIComponent(value).trim();
    } catch (error) {
      return String(value || '').trim();
    }
  }

  var libraryCoverUrlByNode = new WeakMap();

  function hydrateLibraryThumbs(root) {
    if (!root || !window.AudioHubStories || typeof window.AudioHubStories.getById !== 'function') {
      return;
    }
    if (!window.AudioHubStoryCover || typeof window.AudioHubStoryCover.get !== 'function') {
      return;
    }

    root.querySelectorAll('[data-library-thumb]').forEach(function (node) {
      node.classList.remove('is-cover-ready');
      var coverKey = String(node.getAttribute('data-library-cover-key') || '').trim();
      var href = node.getAttribute('data-library-href') || node.getAttribute('href') || '';
      var storyId = storyIdFromHref(href);

      // Build list of keys to try: coverKey first, then storyId variants
      var tryKeys = [];
      if (coverKey) tryKeys.push(coverKey);
      if (storyId) {
        tryKeys.push(storyId);
        if (!String(storyId).startsWith('s_')) tryKeys.push('s_' + storyId);
      }
      if (!tryKeys.length) return;

      function tryNext(idx) {
        if (idx >= tryKeys.length) return;
        window.AudioHubStoryCover.get(tryKeys[idx])
          .then(function (blob) {
            if (!blob) { tryNext(idx + 1); return; }
            var prev = libraryCoverUrlByNode.get(node);
            if (prev) URL.revokeObjectURL(prev);
            var url = URL.createObjectURL(blob);
            libraryCoverUrlByNode.set(node, url);
            node.style.backgroundImage = 'url("' + url + '")';
            node.style.backgroundSize = 'cover';
            node.style.backgroundPosition = 'center';
            node.classList.add('is-cover-ready');
          })
          .catch(function () { tryNext(idx + 1); });
      }
      tryNext(0);
    });
  }

  function hydrateAccountThumbs() {
    hydrateLibraryThumbs(document.querySelector('[data-library-history]'));
    hydrateLibraryThumbs(document.querySelector('[data-library-favorites]'));
  }

  function escapeAttr(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function buildThumbDataAttrs(item) {
    return ' data-library-thumb="true" data-library-href="' + escapeAttr(item && item.href || '') + '" data-library-cover-key="' + escapeAttr(item && item.coverKey || '') + '"';
  }

  function storyIdFromHrefCompat(href) {
    return storyIdFromHref(href);
  }

  function getExistingStoryIds() {
    if (!window.AudioHubStories || typeof window.AudioHubStories.read !== 'function') {
      return null;
    }
    var stories = window.AudioHubStories.read() || [];
    var map = {};
    stories.forEach(function (story) {
      var id = story && story.id ? String(story.id).trim() : '';
      if (id) map[id] = true;
    });
    return map;
  }

  function filterExistingItems(items, existingIds) {
    if (!existingIds) return Array.isArray(items) ? items : [];
    return (Array.isArray(items) ? items : []).filter(function (item) {
      var id = storyIdFromHrefCompat(item && item.href);
      return !!(id && existingIds[id]);
    });
  }

  function parseListenTimestamp(story) {
    var history = Array.isArray(story && story.listenHistory) ? story.listenHistory : [];
    var latest = 0;
    history.forEach(function (value) {
      var time = Number(value);
      if (!isNaN(time) && time > latest) latest = time;
    });
    return latest;
  }

  // Cache for API listen history — prevents 5s interval from wiping rendered data
  var cachedApiHistory = null;

  function deriveHistoryEventsFromStories(limit) {
    if (!window.AudioHubStories || typeof window.AudioHubStories.read !== 'function') {
      return cachedApiHistory || [];
    }

    var stories = window.AudioHubStories.read() || [];
    var items = [];

    stories.forEach(function (story) {
      var history = Array.isArray(story && story.listenHistory) ? story.listenHistory : [];
      var id = String(story && story.id || '').trim();
      if (!id || !history.length) return;

      history.forEach(function (value, index) {
        var time = Number(value);
        if (isNaN(time) || time <= 0) return;
        items.push({
          key: 'story::' + id + '::' + time + '::' + index,
          title: String(story.title || 'AudioHub Story'),
          author: String(story.author || 'AudioHub'),
          genre: String(story.genre || 'Truyện audio'),
          progress: 'Đã nghe',
          note: 'Tự động từ lịch sử phát',
          href: '/story-detail?id=' + encodeURIComponent(id),
          coverKey: story && story.coverKey ? String(story.coverKey) : '',
          savedAt: new Date(time).toISOString(),
          listenAt: time
        });
      });
    });

    // Merge with cached API history (deduplicate by storyId)
    if (cachedApiHistory && cachedApiHistory.length) {
      var localIds = {};
      items.forEach(function (item) {
        var m = (item.href || '').match(/id=([^&]*)/);
        if (m) localIds[m[1]] = true;
      });
      cachedApiHistory.forEach(function (item) {
        var m = (item.href || '').match(/id=([^&]*)/);
        var sid = m ? m[1] : '';
        if (sid && !localIds[sid]) {
          items.push(item);
        }
      });
    }

    items.sort(function (a, b) {
      return Number(b.listenAt || 0) - Number(a.listenAt || 0);
    });

    var out = typeof limit === 'number' ? items.slice(0, limit) : items;
    return out.map(function (item) {
      delete item.listenAt;
      return item;
    });
  }

  function renderAccountLibrary() {
    if (!document.body.classList.contains('account-page')) {
      return;
    }

    var library = readLibrary();
    var existingIds = getExistingStoryIds();
    var filtered = {
      favorites: filterExistingItems(library.favorites, existingIds),
      history: filterExistingItems(library.history, existingIds)
    };
    var recentHistory = deriveHistoryEventsFromStories();
    var totalHistoryCount = recentHistory.length;
    var totalStoryCount = (window.AudioHubStories && typeof window.AudioHubStories.read === 'function' ? (window.AudioHubStories.read() || []).length : 0);

    var changed = filtered.favorites.length !== library.favorites.length
      || filtered.history.length !== library.history.length;

    if (changed) {
      writeLibrary(filtered);
    }

    renderStat('favorites', filtered.favorites.length);
    renderStat('history', totalHistoryCount);
    renderStat('stories', totalStoryCount);

    renderCollection('[data-library-history]', recentHistory, 'history', 'Bạn chưa có lịch sử nghe nào. Hãy mở một truyện và lưu tiến độ để bắt đầu.');
    renderCollection('[data-library-favorites]', filtered.favorites, 'favorites', 'Chưa có truyện yêu thích nào được lưu.');

    hydrateAccountThumbs();

    // Fetch API history for logged-in users and merge with local
    if (window.AudioHubApi && typeof window.AudioHubApi.request === 'function'
        && window.AudioHubApi.isEnabled && window.AudioHubApi.isEnabled()) {
      window.AudioHubApi.request('/stories/listen-history', { method: 'GET' })
        .then(function (apiHistory) {
          if (!Array.isArray(apiHistory) || !apiHistory.length) return;
          // Convert API history to the same format as derived local history
          var apiItems = apiHistory.map(function (item) {
            return {
              key: 'api::' + item.storyId + '::' + new Date(item.listenedAt).getTime(),
              title: String(item.title || 'AudioHub Story'),
              author: String(item.author || 'AudioHub'),
              genre: String(item.genre || 'Truyện audio'),
              progress: 'Đã nghe',
              note: 'Từ lịch sử nghe',
              href: '/story-detail?id=' + encodeURIComponent(item.storyId),
              coverKey: String(item.coverKey || ''),
              coverData: item.coverData || '',
              savedAt: new Date(item.listenedAt).toISOString()
            };
          });
          // Merge: deduplicate by storyId, prefer API items (newer)
          var seenIds = {};
          var merged = [];
          apiItems.concat(recentHistory).forEach(function (item) {
            var sid = (item.href || '').match(/id=([^&]*)/);
            sid = sid ? sid[1] : item.key;
            if (seenIds[sid]) return;
            seenIds[sid] = true;
            merged.push(item);
          });
          merged.sort(function (a, b) {
            return Date.parse(b.savedAt || '') - Date.parse(a.savedAt || '');
          });
          cachedApiHistory = merged.slice(0, 36);
          renderCollection('[data-library-history]', cachedApiHistory, 'history', 'Bạn chưa có lịch sử nghe nào. Hãy mở một truyện và lưu tiến độ để bắt đầu.');
          renderStat('history', merged.length);
          hydrateAccountThumbs();
        })
        .catch(function () {});
    }
  }

  function removeDuplicateLegacyHelpers() {}

  function buildHistoryItem(item) {
    return '<li class="history-youtube-item">'
      + '<a href="' + item.href + '" class="history-youtube-thumb" style="background:' + deriveThumbStyle(item) + '"' + buildThumbDataAttrs(item) + '><span>' + deriveThumbLabel(item) + '</span></a>'
      + '<div class="history-youtube-body">'
      + '<a href="' + item.href + '" class="history-youtube-title">' + item.title + '</a>'
      + '<p class="history-youtube-meta">' + item.author + ' • ' + item.genre + '</p>'
      + '<p class="history-youtube-note">' + (item.progress || 'Đang nghe') + ' • ' + (item.note || '') + '</p>'
      + '<div class="history-youtube-actions">'
      + '<a href="' + item.href + '" class="library-open"><i class="fa-solid fa-play"></i> Tiếp tục</a>'
      + '<button type="button" class="library-remove" data-library-remove="history" data-story-key="' + item.key + '"><i class="fa-solid fa-xmark"></i> Xóa</button>'
      + '</div>'
      + '</div>'
      + '</li>';
  }

  function buildFavoriteItem(item) {
    return '<li class="favorite-youtube-card">'
      + '<a href="' + item.href + '" class="favorite-youtube-thumb" style="background:' + deriveThumbStyle(item) + '"' + buildThumbDataAttrs(item) + '><span>' + deriveThumbLabel(item) + '</span></a>'
      + '<div class="favorite-youtube-body">'
      + '<a href="' + item.href + '" class="favorite-youtube-title">' + item.title + '</a>'
      + '<p class="favorite-youtube-meta">' + item.author + '</p>'
      + '<p class="favorite-youtube-sub">' + item.genre + ' • ' + (item.progress || 'Đang cập nhật') + '</p>'
      + '<div class="favorite-youtube-actions">'
      + '<a href="' + item.href + '" class="library-open"><i class="fa-solid fa-arrow-up-right-from-square"></i> Mở</a>'
      + '<button type="button" class="library-remove" data-library-remove="favorites" data-story-key="' + item.key + '"><i class="fa-solid fa-xmark"></i> Bỏ lưu</button>'
      + '</div>'
      + '</div>'
      + '</li>';
  }

  function buildDefaultItem(item, type) {
    var tags = [];
    if (item.genre) tags.push('<span class="library-tag"><i class="fa-solid fa-bookmark"></i>' + item.genre + '</span>');
    if (item.progress) tags.push('<span class="library-tag"><i class="fa-solid fa-wave-square"></i>' + item.progress + '</span>');
    return '<li class="library-item">'
      + '<div class="library-item__top"><div><strong class="library-item__title">' + item.title + '</strong><p class="library-item__meta">' + item.author + '</p></div>'
      + '<button type="button" class="library-remove" data-library-remove="' + type + '" data-story-key="' + item.key + '"><i class="fa-solid fa-xmark"></i> Xóa</button></div>'
      + '<p class="library-item__sub">' + item.note + '</p><div class="library-item__tags">' + tags.join('') + '</div>'
      + '<a href="' + item.href + '" class="library-open"><i class="fa-solid fa-arrow-up-right-from-square"></i> Mở truyện</a></li>';
  }

  function renderCollection(selector, items, type, emptyMessage) {
    var root = document.querySelector(selector);
    if (!root) return;
    if (!items.length) {
      root.innerHTML = buildEmpty(emptyMessage);
      return;
    }

    if (type === 'history') {
      root.innerHTML = '<ul class="history-youtube-list">' + items.map(buildHistoryItem).join('') + '</ul>';
      return;
    }

    if (type === 'favorites') {
      root.innerHTML = '<ul class="favorites-youtube-grid">' + items.map(buildFavoriteItem).join('') + '</ul>';
      return;
    }

    root.innerHTML = '<ul class="library-list">' + items.map(function (item) {
      return buildDefaultItem(item, type);
    }).join('') + '</ul>';
  }


  function syncFavoriteButtons() {
    var library = readLibrary();
    document.querySelectorAll('[data-library-favorite]').forEach(function (button) {
      var card = button.closest('[data-story-card]');
      if (!card) {
        return;
      }

      var story = buildStoryData(card);
      var active = hasItem(library.favorites, story.key);
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
      button.innerHTML = active
        ? '<i class="fa-solid fa-heart"></i>'
        : '<i class="fa-regular fa-heart"></i>';
    });
  }

  function syncDetailActions() {
    var detail = document.querySelector('[data-detail-story]');
    if (!detail) {
      return;
    }

    var story = buildStoryData(detail);
    var library = readLibrary();
    var favoriteButton = document.querySelector('[data-detail-favorite]');

    if (favoriteButton) {
      var favActive = hasItemByStory(story, library.favorites);
      setActiveState(favoriteButton, favActive);
    }
  }

  function bindFavoriteButtons() {
    document.querySelectorAll('[data-library-favorite]').forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        var card = button.closest('[data-story-card]');
        if (!card) {
          return;
        }
        var story = buildStoryData(card);
        toggleCollection('favorites', story);
        syncFavoriteButtons();
        renderAccountLibrary();
      });
    });
  }

  function bindDetailActions() {
    var detail = document.querySelector('[data-detail-story]');
    if (!detail) {
      return;
    }

    var favoriteButton = document.querySelector('[data-detail-favorite]');

    function currentStory() {
      return buildStoryData(detail);
    }

    if (favoriteButton) {
      favoriteButton.addEventListener('click', function () {
        toggleCollection('favorites', currentStory());
        syncDetailActions();
        renderAccountLibrary();
      });
    }
  }

  document.addEventListener('click', function (event) {
    var removeButton = event.target.closest('[data-library-remove]');
    if (!removeButton) {
      return;
    }

    var type = removeButton.getAttribute('data-library-remove');
    var key = removeButton.getAttribute('data-story-key');

    // Xóa item khỏi danh sách (history hoặc favorites)
    removeFromCollection(type, key);

    // Nếu là history, xóa cả listenHistory của story
    // Key format: 'story::id::time::index' hoặc chỉ 'id'
    if (type === 'history') {
      var keyStr = String(key || '');
      var storyId = '';
      if (keyStr.indexOf('story::') === 0) {
        // Parse 'story::id::time::index' -> extract id
        var parts = keyStr.slice('story::'.length).split('::');
        storyId = parts[0] || '';
      } else {
        storyId = keyStr;
      }

      if (storyId && window.AudioHubStories && typeof window.AudioHubStories.clearListenHistory === 'function') {
        window.AudioHubStories.clearListenHistory(storyId);
      }
    }

    renderAccountLibrary();
    syncFavoriteButtons();
    syncDetailActions();
  });

  renderAccountLibrary();
  syncFavoriteButtons();
  syncDetailActions();

  window.hydrateLibraryThumbs = hydrateLibraryThumbs;
  window.renderAccountLibrary = renderAccountLibrary;

  window.AudioHubLibrary = {
    toggleFavorite: function (story) {
      if (!story) return;
      return toggleCollection('favorites', story);
    },
    isFavorited: function (story) {
      var library = readLibrary();
      var key = story.key || storyKey(story);
      return hasItem(library.favorites, key);
    }
  };

  window.addEventListener('audiohub:stories-updated', function () {
    renderAccountLibrary();
  });

  setInterval(function () {
    if (document.body.classList.contains('account-page')) {
      renderAccountLibrary();
    }
  }, 30000);
  bindFavoriteButtons();
  bindDetailActions();
})();
