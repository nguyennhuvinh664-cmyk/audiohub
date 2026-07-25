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

  var genreColors = {
    'tiên hiệp': '#7c3aed', 'kiem hiep': '#0891b2', 'kiếm hiệp': '#0891b2',
    'ngôn tình': '#be185d', 'huyền huyễn': '#065f46', 'huyen huyen': '#065f46',
    'đô thị': '#b45309', 'do thi': '#b45309', 'xuyên không': '#4338ca',
    'xuyen khong': '#4338ca', 'cổ đại': '#9333ea', 'co dai': '#9333ea',
    'trọng sinh': '#1d4ed8', 'trong sinh': '#1d4ed8', 'đam mỹ': '#ec4899',
    'dam my': '#ec4899', 'hệ thống': '#0f766e', 'he thong': '#0f766e',
    'mạt thế': '#dc2626', 'mat the': '#dc2626', 'linh dị': '#7e22ce',
    'linh di': '#7e22ce', 'ngọt sủng': '#e11d48', 'nu cuong': '#9333ea',
    'nữ cường': '#9333ea', 'sát thủ': '#991b1b', 'thú nhân': '#065f46'
  };

  function genreColor(genre) {
    var key = String(genre || '').trim().toLowerCase();
    return genreColors[key] || '#334155';
  }

  function buildStoryCard(story) {
    var title = escapeHtml(story.title);
    var author = escapeHtml(story.author);
    var genre = escapeHtml(story.genre);
    var href = '/story-detail.html?id=' + encodeURIComponent(story.id);
    var color = genreColor(story.genre);

    var note = story.visibility ? ('Visibility: ' + story.visibility) : 'Truyện demo từ AudioHub Studio.';

    var description = escapeHtml(story.description || '');

    var views = story.listenCount || story.listenCount7d || 0;
    var viewsLabel = views >= 1000 ? (views / 1000).toFixed(1) + 'K' : String(views);

    // Include coverData inline if available (for incognito/fast loading)
    var coverDataAttr = story.coverData ? (' data-cover-data="' + escapeHtml(story.coverData).substring(0, 100) + '"') : '';

    return (
      '<div class="story-card" data-story-card ' +
      'data-story-id="' + escapeHtml(story.id) + '" data-title="' + title + '" data-author="' + author + '" data-genre="' + genre + '" data-description="' + description + '" ' +
      'data-progress="Demo" data-note="' + escapeHtml(note) + '">' +
      '<a href="' + href + '" class="story-card__link">' +
      '<div class="story-card__thumb" data-cover-key="' + escapeHtml(story.coverKey || '') + '"' + coverDataAttr + ' style="background:linear-gradient(135deg,' + color + ',' + color + 'aa)">' +
      '<span class="story-chapters">Demo</span>' +
      '</div>' +
      '<div class="story-card__body">' +
      '<div class="story-meta"><span>' + genre + '</span><span><i class="fa-regular fa-eye"></i> ' + viewsLabel + '</span></div>' +
      '<h2 class="story-title">' + title + '</h2>' +
      '<div class="story-footer"><a href="channel.html?author=' + encodeURIComponent(story.author || '') + '" style="color:inherit;text-decoration:none;" onclick="event.stopPropagation()"><span><i class="fa-regular fa-user"></i> ' + author + '</span></a><span class="story-rating"><i class="fa-solid fa-star"></i> —</span></div>' +
      '<div class="story-card__actions">' +
      '<button type="button" class="story-card__fav" data-library-favorite aria-label="Yêu thích" aria-pressed="false"><i class="fa-regular fa-heart"></i> Yêu thích</button>' +
      '<a href="' + href + '" class="story-card__listen"><i class="fa-solid fa-play"></i> Nghe ngay</a>' +
      '</div>' +
      '</div>' +
      '</a>' +
      '</div>'
    );
  }

  function buildPlaylistCard(playlist) {
    var name = escapeHtml(playlist.name || 'Playlist');
    var entries = playlist.entries || playlist.items || [];
    var count = entries.length;
    var firstEntry = entries[0] || {};
    var firstStoryId = String(firstEntry.storyId || firstEntry.key || '');
    var coverKey = String(firstEntry.coverKey || '');

    if (!coverKey && firstStoryId && window.AudioHubStories && typeof window.AudioHubStories.getById === 'function') {
      var story = window.AudioHubStories.getById(firstStoryId);
      if (story && story.coverKey) coverKey = String(story.coverKey);
    }

    var href = firstStoryId
      ? '/story-detail.html?id=' + encodeURIComponent(firstStoryId) + '&playlistId=' + encodeURIComponent(playlist.id)
      : '#';

    return (
      '<div class="story-card" data-story-card data-playlist-card ' +
      'data-story-id="' + escapeHtml(playlist.id) + '" data-title="' + name + '" data-author="Admin" data-genre="Playlist" data-description="Playlist đã hoàn thành">' +
      '<a href="' + href + '" class="story-card__link">' +
      '<div class="story-card__thumb" data-cover-key="' + escapeHtml(coverKey) + '" style="background:linear-gradient(135deg,#10b981,#10b981aa)">' +
      '<span class="story-chapters">' + count + ' truyện</span>' +
      '</div>' +
      '<div class="story-card__body">' +
      '<div class="story-meta"><span>Playlist</span><span><i class="fa-solid fa-circle-check"></i> Đã hoàn thành</span></div>' +
      '<h2 class="story-title">' + name + '</h2>' +
      '<div class="story-footer"><span><i class="fa-regular fa-user"></i> Admin</span><span class="story-rating"><i class="fa-solid fa-star"></i> —</span></div>' +
      '<div class="story-card__actions">' +
      '<a href="' + href + '" class="story-card__listen"><i class="fa-solid fa-play"></i> Nghe ngay</a>' +
      '</div>' +
      '</div>' +
      '</a>' +
      '</div>'
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
    var nodes = Array.prototype.slice.call(container.querySelectorAll('[data-cover-key]'));
    var LISTING_SUPABASE_DIRECT_STORAGE = 'https://oatwyxkzonhjfdzapjyb.supabase.co/storage/v1/object/public/story-covers/';
    var SUPABASE_DIRECT = 'https://oatwyxkzonhjfdzapjyb.supabase.co';

    nodes.forEach(function (node) {
      // For playlist cards, try IndexedDB with coverKey (playlist.id won't have a cover in Storage)
      var isPlaylist = node.closest('[data-playlist-card]');
      if (isPlaylist) {
        var pk = node.getAttribute('data-cover-key');
        if (pk && window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function') {
          window.AudioHubStoryCover.get(pk).then(function (blob) {
            if (blob) applyCoverUrl(node, blob);
          }).catch(function () {});
        }
        return;
      }

      var storyId = (node.closest('[data-story-id]') || node).getAttribute('data-story-id') || '';
      if (!storyId || storyId.length < 5) return;

      // Skip if cover already applied
      if (node.querySelector('.sc__cover-img')) return;

      // Local stories (s_ prefix): try IndexedDB
      if (storyId.indexOf('s_') === 0 && window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function') {
        window.AudioHubStoryCover.get(storyId).then(function (blob) {
          if (blob) {
            var objUrl = URL.createObjectURL(blob);
            insertCoverImg(node, objUrl);
          }
        }).catch(function () {});
        return;
      }

      // Cloud stories: fetch Storage URL, detect data-URL content, apply as <img>
      var url = LISTING_SUPABASE_DIRECT_STORAGE + encodeURIComponent(storyId) + '/cover';
      fetch(url).then(function(r) {
        if (!r.ok) return null;
        // Read first 30 bytes to detect format without corrupting binary
        return r.clone().arrayBuffer().then(function(buf) {
          var head = new Uint8Array(buf).slice(0, 30);
          var ascii = String.fromCharCode.apply(null, head);
          if (ascii.indexOf('data:image/') === 0) {
            // Data-URL text — read full body as text
            return r.text().then(function(txt) { return { type: 'dataurl', data: txt }; });
          } else if (ascii.indexOf('data:video/') === 0) {
            return { type: 'skip' };
          } else {
            // Raw image bytes — use blob
            return r.blob().then(function(blob) { return { type: 'blob', data: blob }; });
          }
        });
      }).then(function(result) {
        if (!result || result.type === 'skip') return;
        if (result.type === 'dataurl') {
          insertCoverImg(node, result.data);
        } else if (result.type === 'blob') {
          insertCoverImg(node, URL.createObjectURL(result.data));
        }
      }).catch(function () {});
    });

    function insertCoverImg(thumb, url) {
      if (!thumb || !url) return;
      var img = document.createElement('img');
      img.src = url;
      img.className = 'sc__cover-img';
      img.alt = '';
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;z-index:0;';
      thumb.insertBefore(img, thumb.firstChild);
      // Hide "Demo" text
      var chapters = thumb.querySelector('.story-chapters');
      if (chapters) chapters.style.display = 'none';
    }
  }

  function isMember() {
    if (window.AudioHubAccess && typeof window.AudioHubAccess.isMember === 'function') {
      return !!window.AudioHubAccess.isMember();
    }
    try {
      var raw = window.localStorage.getItem('audiohub-auth-profile');
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

  function pickCompletedPlaylists(apiPlaylists) {
    try {
      var source = Array.isArray(apiPlaylists)
        ? apiPlaylists
        : readLocalPlaylistsCached();

      var picked = [];
      source.forEach(function (playlist) {
        // Check both 'state' (done/ongoing) and 'status' for compatibility
        var state = String(playlist && playlist.state || '').trim();
        var status = String(playlist && playlist.status || '').trim();
        if (state !== 'done' && status !== 'Đã hoàn thành') return;
        var entries = playlist.entries || playlist.items || [];
        if (!entries.length) return;
        picked.push(playlist);
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
      return []; // completed.html uses playlist cards, not story cards
    }

    return publicStories.slice().sort(function (a, b) {
      return parseTime(b.createdAt || b.updatedAt) - parseTime(a.createdAt || a.updatedAt);
    });
  }

  function readSeedStoriesFromCards() {
    var cards = Array.prototype.slice.call(root.querySelectorAll('.story-card[data-title][data-author][data-genre]'));
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

    function emitRendered() {
      window.dispatchEvent(new CustomEvent('audiohub:cards-rendered'));
    }

    // BULLETPROOF: detect completed page by hero title (not pathname)
    var heroTitle = document.querySelector('.stories-hero__title');
    var isCompletedPage = heroTitle && heroTitle.textContent.indexOf('Hoàn Thành') >= 0;
    if (isCompletedPage) {
      window.__completedPlaylistsMode = true;
      root.setAttribute('data-completed-playlists', '');
    }

    // If playlists already rendered, NEVER re-render
    if (root.querySelector('[data-playlist-card]')) {
      return;
    }

    if (isCompletedPage) {
      if (canUsePlaylistApi()) {
        window.AudioHubApi.request('/playlists', { method: 'GET' })
          .then(function (rows) {
            var pickedFromApi = pickCompletedPlaylists(rows);
            if (!pickedFromApi.length) {
              var fallbackLocal = pickCompletedPlaylists();
              if (!fallbackLocal.length) {
                root.innerHTML = '<p style="color:var(--t3);font-size:.9rem;padding:20px 0;text-align:center;">Chưa có playlist nào hoàn thành.</p>';
                emitRendered();
                return;
              }
              root.innerHTML = fallbackLocal.map(buildPlaylistCard).join('');
              hydrateCovers(root);
              emitRendered();
              return;
            }
            root.innerHTML = pickedFromApi.map(buildPlaylistCard).join('');
            hydrateCovers(root);
            emitRendered();
          })
          .catch(function () {
            var fallbackLocal = pickCompletedPlaylists();
            if (!fallbackLocal.length) {
              root.innerHTML = '<p style="color:var(--t3);font-size:.9rem;padding:20px 0;text-align:center;">Chưa có playlist nào hoàn thành.</p>';
              emitRendered();
              return;
            }
            root.innerHTML = fallbackLocal.map(buildPlaylistCard).join('');
            hydrateCovers(root);
            emitRendered();
          });
        return;
      }

      var fallback = pickCompletedPlaylists();
      if (!fallback.length) {
        root.innerHTML = '<p style="color:var(--t3);font-size:.9rem;padding:20px 0;text-align:center;">Chưa có playlist nào hoàn thành.</p>';
        emitRendered();
        return;
      }
      root.innerHTML = fallback.map(buildPlaylistCard).join('');
      hydrateCovers(root);
      emitRendered();
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
    emitRendered();
  }

  root.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;

    var favBtn = target.closest('[data-library-favorite]');
    if (favBtn) {
      event.preventDefault();
      event.stopPropagation();
      var card = favBtn.closest('.story-card');
      if (card && window.AudioHubLibrary && typeof window.AudioHubLibrary.toggleFavorite === 'function') {
        var sid = card.getAttribute('data-story-id') || '';
        var storyData = {
          key: 'story::' + sid,
          title: card.querySelector('.story-title') ? card.querySelector('.story-title').textContent : '',
          author: card.querySelector('.story-footer span') ? card.querySelector('.story-footer span').textContent.trim() : '',
          genre: card.querySelector('.story-meta span') ? card.querySelector('.story-meta span').textContent : '',
          href: '/story-detail.html?id=' + encodeURIComponent(sid),
          coverKey: card.querySelector('[data-cover-key]') ? card.querySelector('[data-cover-key]').getAttribute('data-cover-key') : ''
        };
        var isFav = window.AudioHubLibrary.toggleFavorite(storyData);
        favBtn.classList.toggle('is-active', isFav);
        favBtn.querySelector('i').className = isFav ? 'fa-solid fa-heart' : 'fa-regular fa-heart';
      }
      return;
    }

    var card = target.closest('.story-card');
    if (!card) return;

    var storyId = String(card.getAttribute('data-story-id') || '').trim();
    if (!storyId) return;

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
    // Render local stories first (instant feedback)
    var localStories = window.AudioHubStories.read() || [];
    var localPublic = localStories.filter(function (story) {
      return isPublicVisibility(story);
    });
    if (localPublic.length) {
      renderStories(localPublic);
    }

    // Always fetch fresh from API, then merge with local (like stories-home.js)
    fetchPublicStories().then(function (apiStories) {
      if (!apiStories || !apiStories.length) {
        // No API stories — keep local render if any
        if (!localPublic.length) {
          renderStories(localStories);
        }
        return;
      }
      // Merge: API stories + local-only stories (not in API)
      var apiIds = {};
      var apiTitles = {};
      apiStories.forEach(function (s) {
        apiIds[s.id] = true;
        if (s.title) apiTitles[s.title.trim().toLowerCase()] = true;
      });
      var localOnly = localPublic.filter(function (s) {
        if (apiIds[s.id]) return false;
        if (s.title && apiTitles[s.title.trim().toLowerCase()]) return false;
        return true;
      });
      var merged = apiStories.concat(localOnly);
      renderStories(merged);
    }).catch(function () {
      // API failed — keep local render if any
      if (!localPublic.length) {
        renderStories(localStories);
      }
    });
  }

  loadAndRenderStories();

  window.addEventListener('audiohub:stories-updated', function () {
    loadAndRenderStories();
  });

  if (typeof window.AudioHubStories.sync === 'function') {
    window.AudioHubStories.sync();
  }

  // Completed page: playlist filter panel
  (function initCompletedFilter() {
    var filterForm = document.querySelector('[data-completed-filter-form]');
    var titleInput = document.getElementById('completed-filter-title');
    var authorInput = document.getElementById('completed-filter-author');
    var genreSelect = document.getElementById('completed-filter-genre');
    var resetBtn = document.querySelector('[data-completed-filter-reset]');
    var summaryEl = document.querySelector('[data-completed-filter-summary]');
    var emptyEl = document.querySelector('[data-completed-filter-empty]');
    if (!filterForm || !titleInput) return;

    function normalizeText(value) {
      return String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
    }

    function applyFilter() {
      var qTitle = normalizeText(titleInput.value);
      var qAuthor = normalizeText(authorInput ? authorInput.value : '');
      var qGenre = normalizeText(genreSelect ? genreSelect.value : '');
      var cards = root.querySelectorAll('[data-playlist-card]');
      var visible = 0;
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var title = normalizeText(card.getAttribute('data-title'));
        var author = normalizeText(card.getAttribute('data-author'));
        var genre = normalizeText(card.getAttribute('data-genre'));
        var match = true;
        if (qTitle && title.indexOf(qTitle) < 0) match = false;
        if (qAuthor && author.indexOf(qAuthor) < 0) match = false;
        if (qGenre && genre.indexOf(qGenre) < 0) match = false;
        card.style.display = match ? '' : 'none';
        if (match) visible++;
      }
      var hasQuery = qTitle || qAuthor || qGenre;
      if (summaryEl) {
        summaryEl.textContent = hasQuery
          ? 'Tìm thấy ' + visible + ' truyện phù hợp.'
          : 'Hiển thị tất cả truyện trong danh sách.';
      }
      if (emptyEl) {
        emptyEl.style.display = visible === 0 ? '' : 'none';
      }
    }

    filterForm.addEventListener('submit', function (e) {
      e.preventDefault();
      applyFilter();
    });

    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        titleInput.value = '';
        if (authorInput) authorInput.value = '';
        if (genreSelect) genreSelect.value = '';
        applyFilter();
      });
    }

    // Re-apply filter after playlist cards are rendered asynchronously
    window.addEventListener('audiohub:cards-rendered', function () {
      var hasQuery = (titleInput.value || '').trim() || (authorInput && authorInput.value || '').trim() || (genreSelect && genreSelect.value || '').trim();
      if (hasQuery) applyFilter();
    });
  })();
})();
