(function () {
  var root = document.querySelector('[data-story-filter-root]');
  if (!root) {
    return;
  }

  if (!window.AudioHubStories || typeof window.AudioHubStories.read !== 'function') {
    return;
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function buildStoryCard(story) {
    var title = escapeHtml(story.title);
    var author = escapeHtml(story.author);
    var genre = escapeHtml(story.genre);
    var href = 'story-detail?id=' + encodeURIComponent(story.id);

    var note = story.visibility ? ('Visibility: ' + story.visibility) : 'Truyện demo từ AudioHub Studio.';

    var description = escapeHtml(story.description || '');

    return (
      '<a href="' + href + '" class="story-card" data-story-card ' +
      'data-story-id="' + escapeHtml(story.id) + '" data-title="' + title + '" data-author="' + author + '" data-genre="' + genre + '" data-description="' + description + '" ' +
      'data-progress="Demo" data-note="' + escapeHtml(note) + '">' +
      '<div class="story-card__thumb" data-cover-key="' + escapeHtml(story.coverKey || '') + '">' +
      '<button class="story-fav" type="button" data-library-favorite aria-label="Yêu thích" aria-pressed="false"><i class="fa-regular fa-heart"></i></button>' +
      '<span class="story-chapters">Demo</span>' +
      '</div>' +
      '<div class="story-card__body">' +
      '<div class="story-meta"><span>' + genre + '</span><span><i class="fa-regular fa-eye"></i> —</span></div>' +
      '<h2 class="story-title">' + title + '</h2>' +
      '<div class="story-footer"><span><i class="fa-regular fa-user"></i> ' + author + '</span><span class="story-rating"><i class="fa-solid fa-star"></i> —</span></div>' +
      '</div>' +
      '</a>'
    );
  }

  var coverUrlByNode = new WeakMap();

  function applyCoverUrl(node, blob) {
    if (!node || !blob) return;
    try {
      var prev = coverUrlByNode.get(node);
      if (prev) {
        URL.revokeObjectURL(prev);
      }
      var url = URL.createObjectURL(blob);
      coverUrlByNode.set(node, url);
      node.style.backgroundImage = 'url("' + url + '")';
      node.style.backgroundSize = 'cover';
      node.style.backgroundPosition = 'center';
    } catch (error) {
    }
  }

  function hydrateCovers(container) {
    if (!window.AudioHubStoryCover || typeof window.AudioHubStoryCover.get !== 'function') {
      return;
    }

    var nodes = Array.prototype.slice.call(container.querySelectorAll('[data-cover-key]'));
    nodes.forEach(function (node) {
      var key = node.getAttribute('data-cover-key');
      if (!key) {
        return;
      }

      window.AudioHubStoryCover.get(key)
        .then(function (blob) {
          if (!blob) {
            return;
          }
          applyCoverUrl(node, blob);
        })
        .catch(function () {
        });
    });
  }

  function isMember() {
    if (window.AudioHubAccess && typeof window.AudioHubAccess.isMember === 'function') {
      return !!window.AudioHubAccess.isMember();
    }
    try {
      var raw = window.localStorage.getItem('audiohub-demo-auth');
      var parsed = raw ? JSON.parse(raw) : null;
      return !!(parsed && parsed.isLoggedIn);
    } catch (error) {
      return false;
    }
  }

  function showLoginRequiredModal() {
    var existing = document.querySelector('[data-auth-required-inline-modal]');
    if (existing) {
      existing.classList.remove('is-hidden');
      return;
    }

    var modal = document.createElement('div');
    modal.className = 'auth-required-modal';
    modal.setAttribute('data-auth-required-inline-modal', 'true');
    modal.innerHTML = '<div class="auth-required-modal__backdrop" data-auth-required-close></div>'
      + '<div class="auth-required-modal__panel" role="dialog" aria-modal="true" aria-labelledby="auth-required-title-inline">'
      + '<button type="button" class="auth-required-modal__close" data-auth-required-close aria-label="Đóng">×</button>'
      + '<div class="auth-required-modal__icon"><i class="fa-solid fa-lock"></i></div>'
      + '<h3 id="auth-required-title-inline">Yêu cầu đăng nhập</h3>'
      + '<p>Bạn cần đăng nhập tài khoản để nghe chương này.</p>'
      + '<a href="login.html" class="auth-required-modal__primary">Đăng nhập ngay</a>'
      + '<button type="button" class="auth-required-modal__secondary" data-auth-required-close>Đóng lại</button>'
      + '</div>';

    document.body.appendChild(modal);
    modal.querySelectorAll('[data-auth-required-close]').forEach(function (node) {
      node.addEventListener('click', function () {
        modal.classList.add('is-hidden');
      });
    });
  }

  function parseTime(value) {
    var time = Date.parse(String(value || ''));
    return isNaN(time) ? 0 : time;
  }

  function normalizeVisibility(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isPublicVisibility(story) {
    var raw = String(story && story.visibility || '').trim();
    if (!raw) {
      return true;
    }
    var normalized = normalizeVisibility(raw);
    return normalized === 'công khai' || normalized === 'public';
  }

  function isUnlistedVisibility(story) {
    return normalizeVisibility(story && story.visibility) === 'không công khai';
  }

  var playlistsCache = { raw: null, parsed: [] };

  function readLocalPlaylistsCached() {
    try {
      var raw = window.localStorage.getItem('audiohub-playlists-v1') || '';
      if (playlistsCache.raw === raw) {
        return playlistsCache.parsed;
      }
      var parsed = raw ? JSON.parse(raw) : [];
      playlistsCache.raw = raw;
      playlistsCache.parsed = Array.isArray(parsed) ? parsed : [];
      return playlistsCache.parsed;
    } catch (error) {
      playlistsCache.raw = null;
      playlistsCache.parsed = [];
      return [];
    }
  }

  function pickCompletedStoriesFromPlaylists(publicStories, apiPlaylists) {
    try {
      var source = Array.isArray(apiPlaylists)
        ? apiPlaylists
        : readLocalPlaylistsCached();

      var picked = [];
      source.forEach(function (playlist) {
        var status = String(playlist && playlist.status || '').trim();
        if (status !== 'Đã hoàn thành') return;
        var items = Array.isArray(playlist && playlist.items) ? playlist.items : [];
        if (!items.length) return;
        var firstItem = items[0] || {};
        var storyId = firstItem.storyId ? String(firstItem.storyId).trim() : '';
        var playlistName = String(playlist && playlist.name || '').trim();
        var fallbackTitle = playlistName || String(firstItem.storyTitle || 'Playlist hoàn thành').trim();
        var fallbackAuthor = String(firstItem.storyAuthor || 'AudioHub').trim();
        var updatedAt = String(playlist && playlist.updatedAt || playlist && playlist.createdAt || new Date().toISOString());

        picked.push({
          id: storyId || ('playlist-' + String(playlist && playlist.id || 'x')),
          title: fallbackTitle,
          author: fallbackAuthor,
          genre: 'Playlist',
          description: 'Nội dung lấy từ playlist đã hoàn thành.',
          visibility: 'Công khai',
          coverKey: '',
          createdAt: updatedAt,
          updatedAt: updatedAt,
          listenCount7d: 0,
          listenCount: 0
        });
      });

      return picked.sort(function (a, b) {
        return parseTime(b.updatedAt || b.createdAt) - parseTime(a.updatedAt || a.createdAt);
      });
    } catch (error) {
      return [];
    }
  }

  function canUsePlaylistApi() {
    return !!(window.AudioHubApi && typeof window.AudioHubApi.request === 'function' && window.AudioHubApi.isEnabled && window.AudioHubApi.isEnabled());
  }

  function canReadPublicStoriesApi() {
    return !!(window.AudioHubApi && typeof window.AudioHubApi.request === 'function');
  }

  function fetchPublicStories() {
    if (!canReadPublicStoriesApi()) {
      return Promise.resolve([]);
    }

    return window.AudioHubApi.request('/stories/public', { method: 'GET' })
      .then(function (rows) {
        return Array.isArray(rows) ? rows : [];
      })
      .catch(function () {
        return [];
      });
  }

  function pickByPage(stories) {
    var page = String(window.location.pathname || '').toLowerCase();
    var publicStories = stories.filter(function (story) {
      return isPublicVisibility(story);
    });

    if (page.indexOf('trending.html') >= 0) {
      return publicStories.slice().sort(function (a, b) {
        var diff = Number(b.listenCount2d || 0) - Number(a.listenCount2d || 0);
        if (diff !== 0) return diff;
        return parseTime(b.updatedAt || b.createdAt) - parseTime(a.updatedAt || a.createdAt);
      });
    }

    if (page.indexOf('popular.html') >= 0) {
      return publicStories.slice().sort(function (a, b) {
        var diff7d = Number(b.listenCount7d || 0) - Number(a.listenCount7d || 0);
        if (diff7d !== 0) return diff7d;
        return Number(b.listenCount || 0) - Number(a.listenCount || 0);
      });
    }

    if (page.indexOf('completed.html') >= 0) {
      return pickCompletedStoriesFromPlaylists(publicStories);
    }

    return publicStories;
  }

  function readSeedStoriesFromCards() {
    var cards = Array.prototype.slice.call(root.querySelectorAll('a.story-card[data-title][data-author][data-genre]'));
    return cards.map(function (card, index) {
      var title = String(card.getAttribute('data-title') || '').trim();
      var author = String(card.getAttribute('data-author') || '').trim();
      var genre = String(card.getAttribute('data-genre') || '').trim();
      if (!title) return null;
      return {
        id: 'seed-card-' + index,
        title: title,
        author: author || 'Ẩn danh',
        genre: genre || 'Khác',
        description: '',
        visibility: 'Công khai',
        coverKey: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        listenCount2d: 0,
        listenCount7d: 0,
        listenCount: 0
      };
    }).filter(Boolean);
  }

  function renderStories(sourceStories) {
    var stories = Array.isArray(sourceStories) ? sourceStories : (window.AudioHubStories.read() || []);
    if (!stories.length) {
      stories = readSeedStoriesFromCards();
    }
    var page = String(window.location.pathname || '').toLowerCase();
    var publicStories = stories.filter(function (story) {
      return isPublicVisibility(story);
    });

    if (page.indexOf('completed.html') >= 0) {
      if (canUsePlaylistApi()) {
        window.AudioHubApi.request('/playlists', { method: 'GET' })
          .then(function (rows) {
            var pickedFromApi = pickCompletedStoriesFromPlaylists(publicStories, rows);
            if (!pickedFromApi.length) {
              var fallbackLocal = pickCompletedStoriesFromPlaylists(publicStories);
              if (!fallbackLocal.length) {
                root.innerHTML = '';
                return;
              }
              root.innerHTML = fallbackLocal.map(buildStoryCard).join('');
              hydrateCovers(root);
              return;
            }
            root.innerHTML = pickedFromApi.map(buildStoryCard).join('');
            hydrateCovers(root);
          })
          .catch(function () {
            var fallbackLocal = pickCompletedStoriesFromPlaylists(publicStories);
            if (!fallbackLocal.length) {
              root.innerHTML = '';
              return;
            }
            root.innerHTML = fallbackLocal.map(buildStoryCard).join('');
            hydrateCovers(root);
          });
        return;
      }

      var fallback = pickCompletedStoriesFromPlaylists(publicStories);
      if (!fallback.length) {
        root.innerHTML = '';
        return;
      }
      root.innerHTML = fallback.map(buildStoryCard).join('');
      hydrateCovers(root);
      return;
    }

    if (!stories.length) {
      return;
    }

    var picked = pickByPage(stories);
    if (!picked.length) {
      return;
    }

    root.innerHTML = picked.map(buildStoryCard).join('');
    hydrateCovers(root);
  }

  root.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    var card = target.closest('a.story-card');
    if (!card) return;

    var href = String(card.getAttribute('href') || '');
    if (href === 'story-detail' || href.indexOf('story-detail?id=') < 0) {
      event.preventDefault();
      return;
    }

    var storyId = String(card.getAttribute('data-story-id') || '').trim();
    if (!storyId) {
      event.preventDefault();
      return;
    }

    var stories = window.AudioHubStories.read() || [];
    var matched = stories.find(function (story) {
      return String(story && story.id || '').trim() === storyId;
    });

    if (matched && isUnlistedVisibility(matched) && !isMember()) {
      event.preventDefault();
      showLoginRequiredModal();
    }
  });

  function loadAndRenderStories() {
    var localStories = window.AudioHubStories.read() || [];
    var localPublic = localStories.filter(function (story) {
      return isPublicVisibility(story);
    });

    if (localPublic.length) {
      renderStories(localStories);
      return;
    }

    fetchPublicStories().then(function (publicStories) {
      if (publicStories.length) {
        renderStories(publicStories);
        return;
      }
      renderStories(localStories);
    });
  }

  loadAndRenderStories();

  window.addEventListener('audiohub:stories-updated', function () {
    loadAndRenderStories();
  });

  if (typeof window.AudioHubStories.sync === 'function') {
    window.AudioHubStories.sync();
  }
})();
