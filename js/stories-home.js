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
    'nu cuong': '#9333ea', 'sát thủ': '#991b1b', 'thú nhân': '#065f46',
    'khác': '#6366f1'
  };

  function genreColor(genre) {
    var key = String(genre || '').trim().toLowerCase();
    if (!key) key = 'khác';
    return genreColors[key] || '#6366f1';
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

  /* ── Supabase direct URL (bypass proxy, faster) ──────── */
  var SUPABASE_DIRECT = 'https://oatwyxkzonhjfdzapjyb.supabase.co';
  var SUPABASE_STORAGE_DIRECT = SUPABASE_DIRECT + '/storage/v1/object/public/story-covers/';
  var SUPABASE_KEY = 'sb_publishable_BP2pN_2F9YOgC2K3yZPjIA_nDYxmGie';
  var COVER_CACHE_KEY = 'audiohub-cover-cache-v1';
  var PLAYLISTS_STORAGE_URL = SUPABASE_STORAGE_DIRECT + 'playlists/index.json';
  var PLAYLISTS_LOCAL_KEY = 'audiohub-playlists-v1';

  /** Fetch playlists from D1 (shared across all users) */
  function fetchPlaylistsFromStorage() {
    return fetch('/api/playlists')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (data) {
        return (Array.isArray(data) ? data : []).map(function (p) {
          return { id: p.id, name: p.name, entries: p.items || [], state: p.state || 'ongoing' };
        });
      })
      .catch(function () { return []; });
  }

  /** Load playlists: try Storage first, fallback to localStorage */
  function loadPlaylists() {
    return fetchPlaylistsFromStorage().then(function (storagePlaylists) {
      if (storagePlaylists.length > 0) {
        // Sync to localStorage for offline fallback
        try { localStorage.setItem(PLAYLISTS_LOCAL_KEY, JSON.stringify(storagePlaylists)); } catch (e) {}
        return storagePlaylists;
      }
      // Fallback to localStorage
      try {
        var raw = localStorage.getItem(PLAYLISTS_LOCAL_KEY) || '';
        var parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch (e) { return []; }
    });
  }

  function readCoverCache() {
    try { return JSON.parse(localStorage.getItem(COVER_CACHE_KEY) || '{}'); } catch (e) { return {}; }
  }
  function writeCoverCache(obj) {
    try { localStorage.setItem(COVER_CACHE_KEY, JSON.stringify(obj)); } catch (e) {}
  }

  /** Fast cover URL: direct to Supabase Storage (no proxy, no IndexedDB) */
  function getCoverUrl(storyId) {
    if (!storyId || String(storyId).length < 10) return '';
    return SUPABASE_STORAGE_DIRECT + encodeURIComponent(storyId) + '/cover';
  }

  /**
   * Fetch a Supabase Storage cover URL and apply it as background-image.
   * Storage files may contain data-URL text instead of raw image bytes,
   * so we fetch as text first, detect the format, and apply accordingly.
   */
  function applyCoverFromStorageUrl(node, url) {
    if (!node || !url) return;
    fetch(url).then(function (r) {
      if (!r.ok) return null;
      // Peek first 30 bytes to detect format without corrupting binary
      return r.clone().arrayBuffer().then(function (buf) {
        var head = new Uint8Array(buf).slice(0, 30);
        var ascii = String.fromCharCode.apply(null, head);
        if (ascii.indexOf('data:image/') === 0) {
          return r.text().then(function (txt) { return { type: 'dataurl', data: txt }; });
        } else if (ascii.indexOf('data:video/') === 0) {
          return { type: 'skip' };
        } else {
          return r.blob().then(function (blob) { return { type: 'blob', data: blob }; });
        }
      });
    }).then(function (result) {
      if (!result || result.type === 'skip') return;
      if (result.type === 'dataurl') {
        node.style.backgroundImage = 'url("' + result.data + '")';
      } else if (result.type === 'blob') {
        node.style.backgroundImage = 'url("' + URL.createObjectURL(result.data) + '")';
      }
      node.style.backgroundSize = 'cover';
      node.style.backgroundPosition = 'center';
      node.classList.add('has-cover');
      var si = node.querySelector('.si');
      if (si) si.style.display = 'none';
    }).catch(function () {});
  }

  /** Apply cover to a thumb node — fetch Storage URL, detect data-URL, apply as <img> */
  function applyCoverToThumb(thumb, url) {
    if (!thumb || !url) return;

    // If URL is a data:image, apply directly (no fetch needed)
    if (url.indexOf('data:image') === 0) {
      var oldImg = thumb.querySelector('.sc__cover-img');
      if (oldImg) oldImg.remove();
      var directImg = document.createElement('img');
      directImg.src = url;
      directImg.className = 'sc__cover-img';
      directImg.alt = '';
      directImg.loading = 'lazy';
      directImg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;z-index:1;';
      directImg.onload = function () {
        var si = thumb.querySelector('.si');
        if (si) si.style.display = 'none';
      };
      thumb.insertBefore(directImg, thumb.firstChild);
      return;
    }

    fetch(url).then(function (r) {
      if (!r.ok) return null;
      // Peek first 30 bytes to detect format without corrupting binary
      return r.clone().arrayBuffer().then(function (buf) {
        var head = new Uint8Array(buf).slice(0, 30);
        var ascii = String.fromCharCode.apply(null, head);
        if (ascii.indexOf('data:image/') === 0) {
          return r.text().then(function (txt) { return { type: 'dataurl', data: txt }; });
        } else if (ascii.indexOf('data:video/') === 0) {
          return { type: 'skip' };
        } else {
          return r.blob().then(function (blob) { return { type: 'blob', data: blob }; });
        }
      });
    }).then(function (result) {
      if (!result || result.type === 'skip') return;
      var imgUrl;
      if (result.type === 'dataurl') {
        imgUrl = result.data;
      } else if (result.type === 'blob') {
        imgUrl = URL.createObjectURL(result.data);
      }
      if (!imgUrl) return;
      var oldImg = thumb.querySelector('.sc__cover-img');
      if (oldImg) oldImg.remove();
      var img = document.createElement('img');
      img.src = imgUrl;
      img.className = 'sc__cover-img';
      img.alt = '';
      img.loading = 'lazy';
      img.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;z-index:1;';
      img.onload = function () {
        var si = thumb.querySelector('.si');
        if (si) si.style.display = 'none';
      };
      thumb.insertBefore(img, thumb.firstChild);
    }).catch(function () {});
  }

  /* ── thumbnail loader ────────────────────────────────── */
  function setThumbImage(thumb, story) {
    if (!thumb || !story) return;

    // Skip if cover already applied (by loadHomeCovers or previous render)
    if (thumb.querySelector('.sc__cover-img')) return;

    // 1) Default: genre color gradient
    var color = genreColor(story.genre);
    thumb.style.background = 'linear-gradient(135deg, ' + color + ' 0%, ' + color + 'cc 100%)';
    thumb.classList.add('has-cover');

    // 2) Try coverData (base64) — instant, no network
    //    Also check cover_data (snake_case from D1 API)
    var coverRaw = story.coverData || story.cover_data || '';
    if (coverRaw) {
      var imgUrl = String(coverRaw);
      if (imgUrl.indexOf('data:image') === 0 || imgUrl.indexOf('http') === 0) {
        applyCoverToThumb(thumb, imgUrl);
      }
      return;
    }

    // 3) Fallback: coverDataUrl (base64 or http URL)
    if (story.coverDataUrl) {
      var imgUrl2 = String(story.coverDataUrl);
      if (imgUrl2.indexOf('data:image') === 0 || imgUrl2.indexOf('http') === 0) {
        applyCoverToThumb(thumb, imgUrl2);
      }
      return;
    }

    // 4) Cloud story: let loadHomeCovers() handle Storage URL with probe + self-heal
    //    (don't apply Storage URL here — it would skip the probe in loadHomeCovers)

    // 5) Legacy: coverKey → IndexedDB (fallback: try story ID as key)
    if (window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function') {
      var idbKey5 = story.coverKey && String(story.coverKey).indexOf('c_') === 0 ? story.coverKey : (story.id || '');
      if (idbKey5) {
        window.AudioHubStoryCover.get(idbKey5)
          .then(function (blob) {
            if (blob) applyCoverToThumb(thumb, URL.createObjectURL(blob));
          })
          .catch(function () {});
      }
    }
  }

  /* ── card builder ────────────────────────────────────── */
  function buildHomeCardHtml(story) {
    var storyId = String(story && story.id || '').trim();
    var href = storyId ? ('/story-detail?id=' + encodeURIComponent(storyId)) : '#';
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

  /* ── card builder for playlists (series) ─────────────── */
  function buildPlaylistCardHtml(pl, coverMap) {
    var entries = pl.entries || pl.items || [];
    var count = entries.length;
    var firstEntry = entries[0] || {};
    var firstStoryId = String(firstEntry.storyId || firstEntry.key || '');
    var href = firstStoryId
      ? '/story-detail?id=' + encodeURIComponent(firstStoryId) + '&playlistId=' + encodeURIComponent(pl.id)
      : '#';
    var title = String(pl.name || 'Truyện mới');
    var initials = makeInitials(title);
    var isDone = String(pl.state || '').trim() === 'done';
    var badgeText = isDone ? 'Full' : 'Mới';
    var color = isDone ? '#10b981' : '#f59e0b';

    // Determine cover URL
    var coverUrl = '';
    if (coverMap && coverMap[firstStoryId]) {
      coverUrl = coverMap[firstStoryId];
    }

    // Embed cover as <img> with data attribute for JS fallback
    var coverAttr = coverUrl ? (' data-cover-url="' + coverUrl + '"') : '';

    return '<a href="' + href + '" class="sc" data-playlist-id="' + escapeHtml(pl.id) + '">'
      + '<div class="sc__th" style="--c:' + color + '"' + coverAttr + '>'
      + '<span class="bx ' + (isDone ? 'bf' : 'bn') + '">' + badgeText + '</span>'
      + '<span class="si">' + escapeHtml(initials) + '</span>'
      + '<div class="pov"><i class="fa-solid fa-play"></i></div>'
      + '</div>'
      + '<div class="sc__in">'
      + '<p class="sc__genre">' + escapeHtml(title) + '</p>'
      + '<p class="sc__nm">' + escapeHtml(title) + '</p>'
      + '<p class="sc__mt"><i class="fa-solid fa-layer-group"></i> ' + count + ' tập</p>'
      + '</div></a>';
  }

  /* ── card updater ────────────────────────────────────── */
  function setCard(card, story) {
    if (!card || !story) return;

    card.href = '/story-detail?id=' + encodeURIComponent(story.id);
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

  /* ── batch fetch cover_data from Supabase DB ────────── */
  function fetchCoverDataMap(storyIds) {
    var unique = [];
    var seen = {};
    (storyIds || []).forEach(function (id) {
      if (!id || seen[id]) return;
      seen[id] = true;
      unique.push(id);
    });
    if (!unique.length) return Promise.resolve({});
    var idsParam = unique.map(encodeURIComponent).join(',');
    var url = '/api/stories/batch?ids=' + idsParam + '&fields=id,cover_data';
    return fetch(url)
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var map = {};
        (rows || []).forEach(function (row) {
          if (row.id && row.cover_data) map[row.id] = row.cover_data;
        });
        return map;
      }).catch(function () { return {}; });
  }

  /* ── render playlist list ────────────────────────────── */
  function renderPlaylistCardList(root, playlists, coverMap) {
    if (!root) return;
    var list = (playlists || []).filter(function (pl) {
      return pl && pl.id && pl.name;
    });
    root.innerHTML = list.map(function (pl) { return buildPlaylistCardHtml(pl, coverMap); }).join('');

    // Apply covers — fetch Storage URL, detect data-URL content, apply as bg
    root.querySelectorAll('[data-cover-url]').forEach(function (node) {
      var url = node.getAttribute('data-cover-url');
      if (!url) return;
      applyCoverFromStorageUrl(node, url);
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
      var color = genreColor(story.genre);
      return '<a href="story-detail?id=' + encodeURIComponent(story.id) + '" class="ti" data-story-id="' + String(story.id || '') + '" data-story-visibility="' + String(story.visibility || '') + '">'
        + '<span class="trk' + rankClass + '">' + rank + '</span>'
        + '<div class="tth" style="background:linear-gradient(135deg,' + color + ',' + color + 'cc)" data-cover-story-id="' + String(story.id || '') + '">' + makeInitials(story.title) + '</div>'
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

    dropdownTrigger.addEventListener('click', function (e) {
      e.stopPropagation();
      var isOpen = !dropdownMenu.classList.contains('is-hidden');
      dropdownMenu.classList.toggle('is-hidden', isOpen);
      dropdownTrigger.setAttribute('aria-expanded', String(!isOpen));
    });

    dropdownItems.forEach(function (item) {
      item.addEventListener('click', function () {
        var value = item.getAttribute('data-genre-value') || '';
        genreSelect.value = value;
        dropdownMenu.classList.add('is-hidden');
        dropdownTrigger.setAttribute('aria-expanded', 'false');
        renderHomeStories();
      });
    });

    document.addEventListener('click', function (e) {
      if (!dropdownRoot.contains(e.target)) {
        dropdownMenu.classList.add('is-hidden');
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
      var apiTitles = {};  // normalized title fingerprint (dedup by title only)
      (apiStories || []).forEach(function (s) {
        apiIds[s.id] = true;
        var key = (s.title || '').trim().toLowerCase();
        if (key) apiTitles[key] = true;
      });
      // Filter local stories: skip if same ID or same title as API story
      var localOnly = localPublic.filter(function (s) {
        if (apiIds[s.id]) return false;
        var key = (s.title || '').trim().toLowerCase();
        if (key && apiTitles[key]) return false;
        return true;
      });
      var merged = (apiStories || []).concat(localOnly);
      // Dedup by title (keep first occurrence = newest from API)
      var deduped = [];
      var seenTitles = {};
      merged.forEach(function (s) {
        var key = (s.title || '').trim().toLowerCase();
        if (!key) { deduped.push(s); return; }
        if (seenTitles[key]) return;
        seenTitles[key] = true;
        deduped.push(s);
      });
      return deduped;
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

  function renderCompletedPlaylistsHome(completed) {
    var grid = document.querySelector('[data-home-completed-grid]');
    if (!grid) return;

    completed = completed || [];

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

      var color = '#10b981';
      var href = firstStoryId
        ? 'story-detail?id=' + encodeURIComponent(firstStoryId) + '&playlistId=' + encodeURIComponent(pl.id)
        : '#';

      return '<a href="' + href + '" class="sc">'
        + '<div class="sc__th" style="--c:' + color + '" data-cover-story-id="' + escapeHtml(firstStoryId) + '">'
        + '<span class="bx bf">Full</span>'
        + '<span class="si">' + escapeHtml((pl.name || 'PL').slice(0, 3).toUpperCase()) + '</span>'
        + '<div class="pov"><i class="fa-solid fa-play"></i></div>'
        + '</div>'
        + '<div class="sc__in">'
        + '<p class="sc__nm">' + escapeHtml(pl.name || 'Playlist') + '</p>'
        + '<p class="sc__mt"><i class="fa-solid fa-circle-check"></i> ' + doneCount + '/' + count + ' truyện</p>'
        + '</div></a>';
    }).join('');

    // Hydrate cover images via IndexedDB (Supabase Storage no longer used)
    grid.querySelectorAll('[data-cover-story-id]').forEach(function (node) {
      var id = node.getAttribute('data-cover-story-id') || '';
      if (!id || id.length < 10) return;
      node.classList.add('has-cover');
      // Try IndexedDB for cover
      if (window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function') {
        window.AudioHubStoryCover.get(id).then(function (blob) {
          if (blob && blob.size > 0) applyCoverToThumb(node, URL.createObjectURL(blob));
        }).catch(function () {});
      }
    });
  }

  function renderHomeStories() {
    // Fetch stories from API for all sections
    loadStoriesForHome().then(function (stories) {
      var publicStories = stories.filter(function (story) { return isPublicVisibility(story); });

      // Sort newest first for "Truyện Mới Đăng" section
      var newestStories = publicStories.slice().sort(function (a, b) {
        return parseTime(b.createdAt || b.updatedAt) - parseTime(a.createdAt || a.updatedAt);
      });

      // Render newest stories in main grid (Truyện Mới Đăng)
      renderCardList(document.querySelector('.cgrid'), newestStories.slice(0, 8));

      // Render trending (top by listen count)
      renderTrendingList(document.querySelector('[data-home-trending-list]'), publicStories.slice(0, 8));

      // Render popular (top by listen count)
      renderCardList(document.querySelector('[data-home-popular-grid]'), pickPopularStories(publicStories).slice(0, 12));

      // Load covers for all cards
      loadHomeCovers();

      // Bind search form
      var form = document.querySelector('[data-home-search-form]');
      if (form && !form._bound) {
        form._bound = true;
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          renderTrendingList(document.querySelector('[data-home-trending-list]'), publicStories.slice(0, 8));
          renderCardList(document.querySelector('[data-home-popular-grid]'), pickPopularStories(publicStories).slice(0, 12));
        });
      }
    });

    // Load completed playlists separately
    loadPlaylists().then(function (playlists) {
      var completed = playlists.filter(function (pl) { return pl.state === 'done'; });
      renderCompletedPlaylistsHome(completed);
    });

    bindHomeGenreDropdown();
  }

  /* Scan IndexedDB storyCover store to find a cover by trying all keys */
  function scanIndexedDbForCover(storyId) {
    return new Promise(function (resolve) {
      try {
        var req = indexedDB.open('audiohub-media');
        req.onerror = function () { resolve(null); };
        req.onsuccess = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains('storyCover')) { resolve(null); return; }
          var tx = db.transaction('storyCover', 'readonly');
          var store = tx.objectStore('storyCover');
          var getAllKeysReq = store.getAllKeys ? store.getAllKeys() : null;
          if (!getAllKeysReq) { resolve(null); return; }
          getAllKeysReq.onsuccess = function () {
            var keys = getAllKeysReq.result || [];
            if (!keys.length) { resolve(null); return; }
            var idx = 0;
            function tryNext() {
              if (idx >= keys.length) { resolve(null); return; }
              var key = keys[idx++];
              var getReq = store.get(key);
              getReq.onsuccess = function () {
                var blob = getReq.result;
                if (blob && blob.size > 100) {
                  // Save under cloud ID for next time
                  try { store.put(blob, storyId).catch(function () {}); } catch (e) {}
                  resolve(blob);
                } else {
                  tryNext();
                }
              };
              getReq.onerror = function () { tryNext(); };
            };
            tryNext();
          };
          getAllKeysReq.onerror = function () { resolve(null); };
        };
      } catch (e) { resolve(null); }
    });
  }

  /* ── load covers for trending/popular (non-playlist sections) ── */
  function loadHomeCovers() {
    var nodes = document.querySelectorAll('[data-cover-story-id]');
    console.log('[home-covers] found', nodes.length, 'cover nodes');
    var localNodes = [];
    var cloudIds = [];

    nodes.forEach(function (node) {
      if (node.querySelector('.sc__cover-img')) return;
      if (node.style.backgroundImage && node.style.backgroundImage.indexOf('url(') !== -1) return;
      var id = node.getAttribute('data-cover-story-id') || '';
      if (!id || id.length < 10) return;

      // Local stories (s_ prefix): try IndexedDB
      if (id.indexOf('s_') === 0) {
        localNodes.push({ node: node, id: id });
        return;
      }
      cloudIds.push(id);
    });

    // Try IndexedDB for local stories
    localNodes.forEach(function (n) {
      if (window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function') {
        window.AudioHubStoryCover.get(n.id).then(function (blob) {
          if (blob) applyCoverToThumb(n.node, URL.createObjectURL(blob));
        }).catch(function () {});
      }
    });

    // Batch-fetch cover_data from Supabase DB for cloud stories
    if (cloudIds.length) {
      console.log('[home-covers] cloud IDs:', cloudIds);
      fetchCoverDataMap(cloudIds).then(function (coverMap) {
        console.log('[home-covers] coverMap keys:', Object.keys(coverMap));
        cloudIds.forEach(function (id) {
          var nodes = document.querySelectorAll('[data-cover-story-id="' + id + '"]');
          if (!nodes.length) return;
          Array.prototype.forEach.call(nodes, function (node) {
            if (node.querySelector('.sc__cover-img')) return;
            if (node.style.backgroundImage && node.style.backgroundImage.indexOf('url(') !== -1) return;
            if (coverMap[id]) {
              applyCoverToThumb(node, coverMap[id]);
            }
          });
          // Self-heal for nodes still without cover
          if (!coverMap[id]) {
            // Try IndexedDB first, then Supabase Storage URL
            var idbPromise = (window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function')
              ? window.AudioHubStoryCover.get(id).then(function (blob) {
                  if (blob && blob.size > 0) return blob;
                  return scanIndexedDbForCover(id);
                })
              : Promise.resolve(null);

            idbPromise.then(function (blob) {
              if (blob && blob.size > 0) {
                var reader = new FileReader();
                reader.onload = function () {
                  var dataUrl = reader.result;
                  if (!dataUrl || dataUrl.indexOf('data:image') !== 0) return;
                  fetch('/api/stories/' + encodeURIComponent(id), {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: id, cover_data: dataUrl })
                  }).then(function (r) {
                    if (r.ok) console.log('[self-heal] ✅ cover saved to D1 for', id);
                  }).catch(function () {});
                  Array.prototype.forEach.call(nodes, function (n) {
                    if (!n.querySelector('.sc__cover-img')) applyCoverToThumb(n, dataUrl);
                  });
                };
                reader.readAsDataURL(blob);
                return; // done
              }
              // Fallback: try Supabase Storage URL directly
              var storageUrl = SUPABASE_STORAGE_DIRECT + encodeURIComponent(id) + '/cover';
              Array.prototype.forEach.call(nodes, function (n) {
                if (!n.querySelector('.sc__cover-img') && !(n.style.backgroundImage && n.style.backgroundImage.indexOf('url(') !== -1)) {
                  applyCoverToThumb(n, storageUrl);
                }
              });
            }).catch(function () {
              // Final fallback: Supabase Storage URL
              var storageUrl = SUPABASE_STORAGE_DIRECT + encodeURIComponent(id) + '/cover';
              Array.prototype.forEach.call(nodes, function (n) {
                if (!n.querySelector('.sc__cover-img') && !(n.style.backgroundImage && n.style.backgroundImage.indexOf('url(') !== -1)) {
                  applyCoverToThumb(n, storageUrl);
                }
              });
            });
          }
        });
      }).catch(function () {});
    }
  }


  /* ── Store story context in sessionStorage for detail page fallback ── */
  document.addEventListener('click', function (e) {
    var card = e.target.closest('.sc[data-story-id]');
    if (!card) return;
    var storyId = card.getAttribute('data-story-id');
    if (!storyId) return;
    var titleEl = card.querySelector('.sc__nm');
    var authorEl = card.querySelector('.sc__author');
    var title = titleEl ? titleEl.textContent.trim() : '';
    var author = authorEl ? authorEl.textContent.replace(/^\s*/, '').trim() : '';
    try {
      sessionStorage.setItem('audiohub-home-detail-context', JSON.stringify({
        source: 'home',
        storyId: storyId,
        title: title,
        author: author,
        savedAt: Date.now()
      }));
    } catch (e) {}
  });

  renderHomeStories();
})();
