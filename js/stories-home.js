(function () {
  var grid = document.querySelector('.cgrid');
  if (!grid) {
    return;
  }

  if (!window.AudioHubStories || typeof window.AudioHubStories.read !== 'function') {
    return;
  }

  var genreSelect = document.querySelector('[data-home-genre-select]');

  /* ── genre colors ───────────────────────────────────── */
  var genreColors = {
    'tiên hiệp': '#7c3aed', 'kiem hiep': '#0891b2', 'kiếm hiệp': '#0891b2',
    'ngôn tình': '#be185d', 'huyền huyễn': '#065f46', 'huyen huyen': '#065f46',
    'đô thị': '#b45309', 'do thi': '#b45309', 'xuyên không': '#4338ca',
    'xuyen khong': '#4338ca', 'cổ đại': '#9333ea', 'co dai': '#9333ea',
    'trọng sinh': '#1d4ed8', 'trong sinh': '#1d4ed8', 'đam mỹ': '#ec4899',
    'dam my': '#ec4899', 'hệ thống': '#0f766e', 'he thong': '#0f766e',
    'mạt thế': '#dc2626', 'mat the': '#dc2626', 'linh dị': '#7e22ce',
    'linh di': '#7e22ce', 'ngọt sủng': '#e11d48', 'nữ cường': '#9333ea',
    'nu cuong': '#9333ea', 'sát thủ': '#991b1b', 'thú nhân': '#065f46'
  };

  function genreColor(genre) {
    var key = String(genre || '').trim().toLowerCase();
    return genreColors[key] || '#334155';
  }

  function makeInitials(title) {
    var words = String(title || 'AH').trim().split(/\s+/).filter(Boolean);
    var first = words[0] ? words[0][0] : '';
    var last = words.length > 1 ? words[words.length - 1][0] : '';
    return (first + last).toUpperCase() || 'AH';
  }

  function parseTime(value) {
    var t = Date.parse(String(value || ''));
    return isNaN(t) ? 0 : t;
  }

  /* ── Supabase Storage URL helper ──────────────────────── */
  var SUPABASE_STORAGE_BASE = '/supabase/storage/v1/object/public/story-covers/';

  /** Try loading cover from Supabase Storage by story ID */
  function loadCoverFromStorage(storyId, thumb) {
    if (!storyId || !thumb || String(storyId).length < 10) return;
    var url = SUPABASE_STORAGE_BASE + encodeURIComponent(storyId) + '/cover';
    fetch(url).then(function (r) {
      if (!r.ok) throw new Error('not found');
      return r.blob();
    }).then(function (blob) {
      if (!blob || blob.size === 0) return;
      try {
        var objUrl = URL.createObjectURL(blob);
        thumb.style.background = '';
        thumb.style.backgroundImage = 'url("' + objUrl + '")';
        thumb.style.backgroundSize = 'cover';
        thumb.style.backgroundPosition = 'center';
        var si = thumb.querySelector('.si');
        if (si) si.textContent = '';
      } catch (e) {}
    }).catch(function () {});
  }

  /* ── thumbnail loader ────────────────────────────────── */
  function setThumbImage(thumb, story) {
    if (!thumb || !story) return;

    // Skip if cover already applied (by loadHomeCovers or previous render)
    if (thumb.style.backgroundImage && thumb.style.backgroundImage.indexOf('url(') !== -1) return;

    // 1) Set gradient background based on genre
    var color = genreColor(story.genre);
    thumb.style.background = 'linear-gradient(135deg, ' + color + ' 0%, ' + color + 'cc 100%)';

    // 2) Try coverData (base64) — new method
    if (story.coverData) {
      var imgUrl = String(story.coverData);
      if (imgUrl.indexOf('data:image') === 0 || imgUrl.indexOf('http') === 0) {
        thumb.style.background = '';
        thumb.style.backgroundImage = 'url("' + imgUrl + '")';
        thumb.style.backgroundSize = 'cover';
        thumb.style.backgroundPosition = 'center';
        var si = thumb.querySelector('.si');
        if (si) si.textContent = '';
      }
      return;
    }

    // 3) Fallback: coverDataUrl (base64 or http URL)
    if (story.coverDataUrl) {
      var imgUrl = String(story.coverDataUrl);
      if (imgUrl.indexOf('data:image') === 0 || imgUrl.indexOf('http') === 0) {
        thumb.style.background = '';
        thumb.style.backgroundImage = 'url("' + imgUrl + '")';
        thumb.style.backgroundSize = 'cover';
        thumb.style.backgroundPosition = 'center';
        var si2 = thumb.querySelector('.si');
        if (si2) si2.textContent = '';
      }
      return;
    }

    // 4) Legacy: coverKey → IndexedDB → Supabase Storage
    if (story.coverKey && window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function') {
      window.AudioHubStoryCover.get(story.coverKey)
        .then(function (blob) {
          if (!blob) return;
          try {
            var url = URL.createObjectURL(blob);
            thumb.style.background = '';
            thumb.style.backgroundImage = 'url("' + url + '")';
            thumb.style.backgroundSize = 'cover';
            thumb.style.backgroundPosition = 'center';
            var si3 = thumb.querySelector('.si');
            if (si3) si3.textContent = '';
          } catch (e) {}
        })
        .catch(function () {});
      return;
    }

    // 5) Last resort: Supabase Storage by story ID (works in incognito / other devices)
    loadCoverFromStorage(story.id, thumb);
  }

  /* ── card builder ────────────────────────────────────── */
  function buildHomeCardHtml(story) {
    var storyId = String(story && story.id || '').trim();
    var href = storyId ? ('/story-detail.html?id=' + encodeURIComponent(storyId)) : '#';
    var title = String(story.title || 'Truyện mới');
    var genre = String(story.genre || 'Khác');
    var author = String(story.author || 'Ẩn danh');
    var initials = makeInitials(title);
    var visibility = String(story.visibility || 'Công khai');
    var color = genreColor(genre);

    var badgeText = story.isCompleted ? 'Full' : (story.listenCount2d > 5 ? 'Hot' : 'Mới');
    return '<a href="' + href + '" class="sc" data-story-id="' + String(story.id || '') + '" data-story-visibility="' + visibility + '">'
      + '<div class="sc__th" data-cover-story-id="' + String(story.id || '') + '" style="--c:' + color + '">'
      + '<span class="bx bn">' + badgeText + '</span>'
      + '<span class="si">' + initials + '</span>'
      + '<div class="pov"><i class="fa-solid fa-play"></i></div>'
      + '</div>'
      + '<div class="sc__in">'
      + '<p class="sc__genre">' + genre + '</p>'
      + '<p class="sc__nm">' + title + '</p>'
      + '<p class="sc__author"><i class="fa-regular fa-user"></i> ' + author + '</p>'
      + '</div></a>';
  }

  /* ── card updater ────────────────────────────────────── */
  function setCard(card, story) {
    if (!card || !story) return;

    card.href = '/story-detail.html?id=' + encodeURIComponent(story.id);
    card.setAttribute('data-story-id', String(story.id || ''));
    card.setAttribute('data-story-visibility', String(story.visibility || ''));

    var nameNode = card.querySelector('.sc__nm');
    if (nameNode) nameNode.textContent = story.title || 'Truyện mới';

    var genreNode = card.querySelector('.sc__genre');
    if (genreNode) genreNode.textContent = story.genre || 'Khác';

    var authorNode = card.querySelector('.sc__author');
    if (authorNode) {
      var authorName = story.author || 'Ẩn danh';
      authorNode.innerHTML = '<a href="channel.html?author=' + encodeURIComponent(authorName) + '" style="color:inherit;text-decoration:none" onclick="event.stopPropagation()"><i class="fa-regular fa-user"></i> ' + authorName + '</a>';
    }

    var thumb = card.querySelector('.sc__th');
    if (thumb) {
      setThumbImage(thumb, story);

      var si = thumb.querySelector('.si');
      if (si) si.textContent = makeInitials(story.title);

      var badge = thumb.querySelector('.bx');
      var badgeText = story.isCompleted ? 'Full' : (story.listenCount2d > 5 ? 'Hot' : 'Mới');
      if (badge) {
        badge.textContent = badgeText;
      } else {
        var span = document.createElement('span');
        span.className = 'bx bn';
        span.textContent = badgeText;
        thumb.insertBefore(span, thumb.firstChild);
      }
    }
  }

  /* ── render list ─────────────────────────────────────── */
  function renderCardList(root, stories) {
    if (!root) return;
    var list = (stories || []).filter(function (story) {
      return !!String(story && story.id || '').trim();
    });
    root.innerHTML = list.map(buildHomeCardHtml).join('');
    Array.prototype.slice.call(root.querySelectorAll('a.sc')).forEach(function (card, index) {
      setCard(card, list[index]);
    });
  }

  /* ── render trending ─────────────────────────────────── */
  function renderTrendingList(root, stories) {
    if (!root) return;
    var list = (stories || []).filter(function (story) {
      return !!String(story && story.id || '').trim();
    });
    if (!list.length) {
      root.innerHTML = '';
      return;
    }

    var maxScore = Number(list[0].listenCount2d || 0);
    root.innerHTML = list.map(function (story, index) {
      var rank = index + 1;
      var score = Number(story.listenCount2d || 0);
      var width = maxScore > 0 ? Math.max(10, Math.round(score * 100 / maxScore)) : 10;
      var rankClass = rank === 1 ? ' gold' : (rank === 2 ? ' silver' : (rank === 3 ? ' bronze' : ''));
      return '<a href="story-detail.html?id=' + encodeURIComponent(story.id) + '" class="ti" data-story-id="' + String(story.id || '') + '" data-story-visibility="' + String(story.visibility || '') + '">'
        + '<span class="trk' + rankClass + '">' + rank + '</span>'
        + '<div class="tth">' + makeInitials(story.title) + '</div>'
        + '<div class="tin"><p class="tnm">' + String(story.title || 'Truyện mới') + '</p><p class="tmt">' + String(story.genre || 'Khác') + ' • ' + score + ' lượt nghe (2 ngày)</p></div>'
        + '<div class="tbar"><div class="tfill" style="width:' + width + '%"></div></div></a>';
    }).join('');

    Array.prototype.slice.call(root.querySelectorAll('a.ti')).forEach(function (item, idx) {
      var story = list[idx];
      var thumb = item.querySelector('.tth');
      if (thumb && story) {
        setThumbImage(thumb, story);
      }
    });
  }

  /* ── genre dropdown ──────────────────────────────────── */
  function bindHomeGenreDropdown() {
    var dropdownRoot = document.querySelector('[data-home-genre-dropdown]');
    var dropdownTrigger = document.querySelector('[data-home-genre-trigger]');
    var dropdownMenu = document.querySelector('[data-home-genre-menu]');
    var dropdownItems = Array.prototype.slice.call(document.querySelectorAll('.genre-dd__item'));

    if (!dropdownRoot || !dropdownTrigger || !dropdownMenu || !genreSelect) {
      return;
    }
    if (dropdownRoot.dataset.bound === 'true') {
      return;
    }
    dropdownRoot.dataset.bound = 'true';

    dropdownTrigger.addEventListener('click', function () {
      var isOpen = dropdownMenu.hidden;
      dropdownMenu.hidden = !isOpen;
      dropdownTrigger.setAttribute('aria-expanded', String(isOpen));
    });

    dropdownItems.forEach(function (item) {
      item.addEventListener('click', function () {
        var value = item.getAttribute('data-genre-value') || '';
        genreSelect.value = value;
        dropdownMenu.hidden = true;
        dropdownTrigger.setAttribute('aria-expanded', 'false');
        renderHomeStories();
      });
    });

    document.addEventListener('click', function (e) {
      if (!dropdownRoot.contains(e.target)) {
        dropdownMenu.hidden = true;
        dropdownTrigger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* ── public stories fetch ────────────────────────────── */
  function fetchPublicStories() {
    // Try Supabase first (direct, no Render dependency)
    if (window.AudioHubSupabase && window.AudioHubSupabase.isAvailable()) {
      return window.AudioHubSupabase.fetchPublicStories()
        .then(function (rows) {
          return Array.isArray(rows) ? rows : [];
        })
        .catch(function () {
          return fetchPublicStoriesFallback();
        });
    }
    return fetchPublicStoriesFallback();
  }

  function fetchPublicStoriesFallback() {
    if (!window.AudioHubApi || typeof window.AudioHubApi.request !== 'function') {
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

  function isPublicVisibility(story) {
    var visibility = String(story && story.visibility || '').trim().toLowerCase();
    return !visibility || visibility === 'công khai' || visibility === 'public';
  }

  function loadStoriesForHome() {
    var localStories = window.AudioHubStories.read() || [];
    var localPublic = localStories.filter(function (story) { return isPublicVisibility(story); });

    // Always fetch fresh from API, merge with local
    return fetchPublicStories().then(function (apiStories) {
      var apiIds = {};
      var apiKeys = {};  // normalized title+author fingerprint
      (apiStories || []).forEach(function (s) {
        apiIds[s.id] = true;
        var key = (s.title || '').trim().toLowerCase() + '::' + (s.author || '').trim().toLowerCase();
        if (key !== '::') apiKeys[key] = true;
      });
      // Filter local stories: skip if same ID or same title+author as API story
      var localOnly = localPublic.filter(function (s) {
        if (apiIds[s.id]) return false;
        var key = (s.title || '').trim().toLowerCase() + '::' + (s.author || '').trim().toLowerCase();
        if (key !== '::' && apiKeys[key]) return false;
        return true;
      });
      return (apiStories || []).concat(localOnly);
    }).catch(function () {
      return localPublic.length ? localPublic : localStories;
    });
  }

  /* ── render sections ─────────────────────────────────── */
  function pickPopularStories(stories) {
    return stories.slice().sort(function (a, b) {
      return (b.listenCount || b.views || 0) - (a.listenCount || a.views || 0);
    });
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderCompletedPlaylistsHome() {
    var grid = document.querySelector('[data-home-completed-grid]');
    if (!grid) return;

    var playlists = [];
    try {
      var raw = window.localStorage.getItem('audiohub-playlists-v1');
      var parsed = raw ? JSON.parse(raw) : [];
      playlists = Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      playlists = [];
    }

    var completed = playlists.filter(function (p) {
      return String(p.state || '').trim() === 'done' && String(p.createdBy || 'admin') === 'admin';
    });

    if (!completed.length) {
      grid.innerHTML = '<p style="color:var(--t3);font-size:.9rem;padding:20px 0;text-align:center;grid-column:1/-1;">Chưa có playlist nào hoàn thành. Hãy tạo playlist và đánh dấu hoàn thành trên trang Tài khoản.</p>';
      return;
    }

    grid.innerHTML = completed.slice(0, 12).map(function (pl) {
      var entries = pl.entries || pl.items || [];
      var count = entries.length;
      var doneCount = entries.filter(function (e) { return (e.status || '') === 'done'; }).length;
      var firstEntry = entries[0] || {};
      var firstStoryId = String(firstEntry.storyId || firstEntry.key || '');
      var coverKey = String(firstEntry.coverKey || '');

      if (!coverKey && firstStoryId && window.AudioHubStories && typeof window.AudioHubStories.getById === 'function') {
        var story = window.AudioHubStories.getById(firstStoryId);
        if (story && story.coverKey) coverKey = String(story.coverKey);
      }

      var color = '#10b981';
      var href = firstStoryId
        ? 'story-detail.html?id=' + encodeURIComponent(firstStoryId) + '&playlistId=' + encodeURIComponent(pl.id)
        : '#';

      return '<a href="' + href + '" class="sc">'
        + '<div class="sc__th" style="--c:' + color + '" data-cover-key="' + escapeHtml(coverKey) + '">'
        + '<span class="bx bf">Full</span>'
        + '<span class="si">' + escapeHtml((pl.name || 'PL').slice(0, 3).toUpperCase()) + '</span>'
        + '<div class="pov"><i class="fa-solid fa-play"></i></div>'
        + '</div>'
        + '<div class="sc__in">'
        + '<p class="sc__nm">' + escapeHtml(pl.name || 'Playlist') + '</p>'
        + '<p class="sc__mt"><i class="fa-solid fa-circle-check"></i> ' + doneCount + '/' + count + ' truyện</p>'
        + '</div></a>';
    }).join('');

    // Hydrate cover images
    if (window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function') {
      grid.querySelectorAll('[data-cover-key]').forEach(function (node) {
        var key = node.getAttribute('data-cover-key');
        if (!key) return;
        window.AudioHubStoryCover.get(key).then(function (blob) {
          if (!blob) return;
          var url = URL.createObjectURL(blob);
          node.style.backgroundImage = 'url("' + url + '")';
          node.style.backgroundSize = 'cover';
          node.style.backgroundPosition = 'center';
        }).catch(function () {});
      });
    }
  }

  function renderHomeStoriesFrom(stories) {
    if (!stories || !stories.length) {
      return;
    }

    var publicStories = stories.filter(function (story) {
      return isPublicVisibility(story);
    });

    if (!publicStories.length) {
      return;
    }

    var selectedGenre = genreSelect ? String(genreSelect.value || '').trim() : '';
    var newStoriesBase = publicStories.slice().sort(function (a, b) {
      return parseTime(b.createdAt) - parseTime(a.createdAt);
    });

    function normalizeGenre(v) {
      return String(v || '').trim().toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd');
    }
    var selNorm = normalizeGenre(selectedGenre);
    var newStories = selectedGenre
      ? newStoriesBase.filter(function (story) {
          return normalizeGenre(story.genre) === selNorm;
        })
      : newStoriesBase;

    var completedStories = publicStories.filter(function (story) {
      return story.isCompleted;
    });

    renderCardList(document.querySelector('.cgrid'), newStories.slice(0, 12));
    renderTrendingList(document.querySelector('[data-home-trending-list]'), publicStories.slice(0, 8));
    renderCardList(document.querySelector('[data-home-popular-grid]'), pickPopularStories(publicStories).slice(0, 12));

    // Render completed playlists from localStorage
    renderCompletedPlaylistsHome();
  }

  function renderHomeStories() {
    // Render local stories first (instant)
    var localStories = window.AudioHubStories.read() || [];
    var localPublic = localStories.filter(function (story) { return isPublicVisibility(story); });
    if (localPublic.length) {
      renderHomeStoriesFrom(localPublic);
      bindHomeGenreDropdown();
    }

    // Then fetch from API in background
    loadStoriesForHome().then(function (stories) {
      renderHomeStoriesFrom(stories);
      bindHomeGenreDropdown();
      loadHomeCovers();

      var form = document.querySelector('[data-home-search-form]');
      if (form && !form._bound) {
        form._bound = true;
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          renderHomeStoriesFrom(stories);
        });
      }
    });
  }

  /* ── load covers from Supabase (separate from story list) ── */
  function loadHomeCovers() {
    if (!window.AudioHubSupabase || !window.AudioHubSupabase.isAvailable()) { return; }
    var SUPABASE_REST = '/supabase/rest/v1';
    var SUPABASE_KEY = 'sb_publishable_BP2pN_2F9YOgC2K3yZPjIA_nDYxmGie';
    var nodes = document.querySelectorAll('[data-cover-story-id]');
    var idsToFetch = [];
    var nodeMap = {};
    nodes.forEach(function (node) {
      if (node.style.backgroundImage && node.style.backgroundImage.indexOf('url(') !== -1) return;
      var id = node.getAttribute('data-cover-story-id') || '';
      if (!id || id.length < 10) return;
      if (idsToFetch.indexOf(id) === -1) idsToFetch.push(id);
      if (!nodeMap[id]) nodeMap[id] = [];
      nodeMap[id].push(node);
    });
    if (!idsToFetch.length) return;
    var idsParam = idsToFetch.map(encodeURIComponent).join(',');

    /** Apply cover image to all nodes for a story ID */
    function applyCoverToNodes(storyId, imgUrl) {
      var nodeList = nodeMap[storyId];
      if (!nodeList) return;
      nodeList.forEach(function (node) {
        try {
          node.style.background = '';
          node.style.backgroundImage = 'url("' + imgUrl + '")';
          node.style.backgroundSize = 'cover';
          node.style.backgroundPosition = 'center';
          var si = node.querySelector('.si');
          if (si) si.textContent = '';
        } catch (e) {}
      });
    }

    /** Try Supabase Storage for stories that have no cover_data */
    function tryStorageFallback(idsWithoutCover) {
      idsWithoutCover.forEach(function (storyId) {
        if (!nodeMap[storyId] || !nodeMap[storyId].length) return;
        // Skip nodes that already got a cover from cover_data
        var allHaveCover = nodeMap[storyId].every(function (n) {
          return n.style.backgroundImage && n.style.backgroundImage.indexOf('url(') !== -1;
        });
        if (allHaveCover) return;
        var storageUrl = SUPABASE_STORAGE_BASE + encodeURIComponent(storyId) + '/cover';
        fetch(storageUrl).then(function (r) {
          if (!r.ok) throw new Error('not found');
          return r.blob();
        }).then(function (blob) {
          if (!blob || blob.size === 0) return;
          var objUrl = URL.createObjectURL(blob);
          applyCoverToNodes(storyId, objUrl);
        }).catch(function () {});
      });
    }

    fetch(SUPABASE_REST + '/stories?id=in.(' + idsParam + ')&select=id,cover_data,cover_key', {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
    }).then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var idsWithoutCover = [];
        (rows || []).forEach(function (row) {
          if (row.cover_data && nodeMap[row.id]) {
            applyCoverToNodes(row.id, row.cover_data);
            // Cache to localStorage
            try {
              var allLocal = window.AudioHubStories.read() || [];
              var target = allLocal.find(function (s) { return String(s.id) === String(row.id); });
              if (target && !target.coverData) {
                target.coverData = row.cover_data;
                window.AudioHubStories.write(allLocal);
              }
            } catch (e) {}
          } else if (nodeMap[row.id]) {
            idsWithoutCover.push(row.id);
          }
        });
        // Fallback: try Supabase Storage for stories without cover_data
        if (idsWithoutCover.length) {
          tryStorageFallback(idsWithoutCover);
        }
      }).catch(function () {
        // API failed — try Storage fallback for ALL ids
        tryStorageFallback(idsToFetch);
      });
  }

  renderHomeStories();
})();
