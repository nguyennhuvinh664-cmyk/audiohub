(function () {
  var detailRoot = document.querySelector('.detail-page');
  if (!detailRoot) return;

  // AbortController for cleanup on SPA navigation (frees document/window listeners)
  var _ac = new AbortController();
  var _signal = _ac.signal;
  window.__pageCleanup = function () {
    try { stopReadingAutoScroll(); } catch (e) {}
    try { clearSleepTimer(); } catch (e) {}
    try {
      var audio = document.querySelector('[data-story-audio]');
      if (audio && !audio.paused) { audio.pause(); audio.currentTime = 0; }
    } catch (e) {}
    _ac.abort();
  };

  /* ── Load playlists from D1 → localStorage (MERGE, not overwrite) ── */
  (function syncPlaylistsFromStorage() {
    var PLAYLIST_KEY = 'audiohub-playlists-v1';
    fetch('/api/playlists')
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (data) {
        if (!Array.isArray(data) || !data.length) return;
        // Convert D1 format — items may be JSON string from upload
        var d1Pls = data.map(function (p) {
          var items = p.items || [];
          if (typeof items === 'string') {
            try { items = JSON.parse(items); } catch (e) { items = []; }
          }
          if (!Array.isArray(items)) items = [];
          return { id: p.id, name: p.name, entries: items, state: p.state || 'ongoing' };
        });
        // Read existing localStorage
        var localRaw = localStorage.getItem(PLAYLIST_KEY) || '';
        var localPls = [];
        try { localPls = localRaw ? JSON.parse(localRaw) : []; } catch (e) { localPls = []; }
        if (!Array.isArray(localPls)) localPls = [];

        // Merge: for each D1 playlist, add local entries not yet in D1
        d1Pls.forEach(function (d1Pl) {
          var localPl = localPls.find(function (lp) { return lp && lp.id === d1Pl.id; });
          if (!localPl || !Array.isArray(localPl.entries) || !localPl.entries.length) return;
          // Build set of existing keys from D1 (check both key and storyId)
          var d1Keys = {};
          (d1Pl.entries || []).forEach(function (e) {
            var k = e && (e.key || e.storyId);
            if (k) d1Keys[k] = true;
          });
          // Add local entries missing from D1
          localPl.entries.forEach(function (e) {
            var k = e && (e.key || e.storyId);
            if (k && !d1Keys[k]) {
              d1Pl.entries.push(e);
            }
          });
        });

        // Also keep local playlists that don't exist in D1 yet
        d1Pls.forEach(function (d1Pl) {
          if (!localPls.find(function (lp) { return lp && lp.id === d1Pl.id; })) {
            localPls.push(d1Pl);
          }
        });

        // Use merged result (D1 playlists + any local-only entries)
        var merged = d1Pls;
        localPls.forEach(function (lp) {
          if (!lp || !lp.id) return;
          if (!merged.find(function (m) { return m.id === lp.id; })) {
            merged.push(lp);
          }
        });

        localStorage.setItem(PLAYLIST_KEY, JSON.stringify(merged));
        // Notify page that playlists were synced — re-render chapter list
        try { window.dispatchEvent(new Event('audiohub-playlists-synced')); } catch (e) {}
      })
      .catch(function () {});
  })();

  function setActive(items, activeValue, attr) {
    items.forEach(function (item) {
      var isActive = item.getAttribute(attr) === activeValue;
      item.classList.toggle('is-active', isActive);
      item.classList.toggle('active', isActive);
      if (item.matches('button')) item.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      // Update "Đang phát" label
      var np = item.querySelector('.chapter-now-playing');
      if (isActive && !np) {
        var body = item.querySelector('.chapter-item-body');
        if (body) {
          var tag = document.createElement('span');
          tag.className = 'chapter-now-playing';
          tag.innerHTML = '<i class="fa-solid fa-volume-high"></i> Đang phát';
          body.appendChild(tag);
        }
      } else if (!isActive && np) {
        np.remove();
      }
    });
  }

  function safeParse(raw, fallback) {
    try { return raw ? JSON.parse(raw) : fallback; } catch (error) { return fallback; }
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function shouldHideReadingLine(line) {
    var normalized = String(line || '').trim();
    if (!normalized) return true;
    if (/^model\s+\d{1,2}:\d{2}\s*(am|pm)?$/i.test(normalized)) return true;
    if (/^duoi day la ban dich tieng viet/i.test(normalized.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''))) return true;
    if (/^ch[uư]ơng\s*\d+\s*:/i.test(normalized)) return true;
    return false;
  }

  function cleanReadingText(value) {
    return String(value || '')
      .split(/\r?\n/)
      .map(function (line) { return line.trim(); })
      .filter(function (line) { return !shouldHideReadingLine(line); })
      .join('\n');
  }

  function extractHashtags(text) {
    var source = String(text || '');
    var unique = [];
    var regex = /#([^#\n]+)/gu;
    var match = null;

    while ((match = regex.exec(source))) {
      var tag = String(match[1] || '')
        .trim()
        .replace(/[.,;:!?]+$/g, '')
        .toLowerCase();
      if (!tag) continue;
      if (unique.indexOf(tag) >= 0) continue;
      unique.push(tag);
    }

    return unique;
  }

  function buildHashtagLink(tag) {
    var cleanTag = String(tag || '').trim().toLowerCase();
    if (!cleanTag) return '';
    var href = '/new-posts.html?hashtag=' + encodeURIComponent(cleanTag);
    return '<a class="story-hashtag" href="' + href + '">#' + escapeHtml(cleanTag) + '</a>';
  }

  function normalizeHashtagToken(value) {
    return String(value || '')
      .trim()
      .replace(/^#+/, '')
      .replace(/\s+/g, '-')
      .toLowerCase();
  }

  function buildStoryDescriptionHtml(story) {
    var tags = [];
    var sourceTags = Array.isArray(story && story.hashtags) ? story.hashtags : [];

    sourceTags.forEach(function (tag) {
      var normalized = normalizeHashtagToken(tag);
      if (!normalized) return;
      if (tags.indexOf(normalized) >= 0) return;
      tags.push(normalized);
    });

    if (!tags.length) {
      extractHashtags(String(story && story.description || '')).forEach(function (tag) {
        var normalized = normalizeHashtagToken(tag);
        if (!normalized) return;
        if (tags.indexOf(normalized) >= 0) return;
        tags.push(normalized);
      });
    }

    var hashtagsBlock = tags.length
      ? '<div class="story-hashtags"><strong>Hashtag:</strong><div class="story-hashtags__list">' + tags.map(buildHashtagLink).join('') + '</div></div>'
      : '';

    var body = String(story && story.description || '').replace(/#[\p{L}\p{N}_-]+/gu, '').replace(/\n{3,}/g, '\n\n').trim();
    // Don't render body if it's just the placeholder text "Giới thiệu truyện"
    var isPlaceholder = /^gi[ỉi] thi[ệe]u truy[ệe]n$/i.test(body);
    var bodyHtml = body && !isPlaceholder ? '<p>' + body.replace(/\n/g, '</p><p>') + '</p>' : '';
    return '<h2>Giới thiệu truyện</h2>' + hashtagsBlock + bodyHtml;
  }

  function getQueryParam(name) {
    try { return new URLSearchParams(window.location.search).get(name); } catch (error) { return null; }
  }

  function normalizeLookup(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isSyntheticStoryId(value) {
    var id = String(value || '').trim().toLowerCase();
    return !!id && (id.indexOf('playlist-') === 0 || id.indexOf('seed-card-') === 0);
  }

  var pendingStorySyncId = '';
  var HOME_DETAIL_CONTEXT_KEY = 'audiohub-home-detail-context';

  function readHomeDetailContext() {
    try {
      var raw = window.sessionStorage.getItem(HOME_DETAIL_CONTEXT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      return null;
    }
  }

  function clearHomeDetailContext() {
    try {
      window.sessionStorage.removeItem(HOME_DETAIL_CONTEXT_KEY);
    } catch (error) {}
  }

  function resolveStoryFromHomeContext() {
    if (!window.AudioHubStories || typeof window.AudioHubStories.getById !== 'function') return null;
    var context = readHomeDetailContext();
    if (!context || String(context.source || '') !== 'home') return null;
    var storyId = String(context.storyId || '').trim();
    if (!storyId) return null;
    var queryId = String(getQueryParam('id') || '').trim();
    if (queryId && queryId !== storyId) return null;
    return window.AudioHubStories.getById(storyId) || null;
  }

  function syncStoryContextFromHome(story) {
    if (!story || !story.id) return;
    var context = readHomeDetailContext();
    if (!context || String(context.source || '') !== 'home') return;
    var queryId = String(getQueryParam('id') || '').trim();
    var contextId = String(context.storyId || '').trim();
    if (queryId && contextId && queryId !== contextId && queryId !== String(story.id)) return;
    if (contextId && contextId === String(story.id)) {
      clearHomeDetailContext();
    }
  }

  function clearStaleHomeDetailContext() {
    var context = readHomeDetailContext();
    if (!context) return;
    var savedAt = Number(context.savedAt || 0);
    if (savedAt && Date.now() - savedAt > 5 * 60 * 1000) {
      clearHomeDetailContext();
    }
  }

  clearStaleHomeDetailContext();

  function applyHomeDetailPlaceholder() {
    var context = readHomeDetailContext();
    if (!context || String(context.source || '') !== 'home') return;
    var storyId = String(context.storyId || '').trim();
    var queryId = String(getQueryParam('id') || '').trim();
    if (!storyId || (queryId && queryId !== storyId)) return;

    var storyNode = document.querySelector('[data-detail-story]');
    if (!storyNode) return;

    storyNode.setAttribute('data-story-id', storyId);
    if (context.title) storyNode.setAttribute('data-title', String(context.title));
    if (context.author) storyNode.setAttribute('data-author', String(context.author));

    var titleNode = storyNode.querySelector('.detail-title');
    if (titleNode && context.title) titleNode.textContent = String(context.title);

    var audioSubtitle = document.querySelector('.audio-headings p');
    if (audioSubtitle && context.title) audioSubtitle.textContent = String(context.title);
  }

  applyHomeDetailPlaceholder();

  function clearPendingStorySync(id) {
    var storyId = String(id || pendingStorySyncId || '').trim();
    if (!storyId) {
      pendingStorySyncId = '';
      return;
    }
    pendingStorySyncId = '';
    try {
      window.sessionStorage.removeItem('audiohub-detail-sync-reload:' + storyId);
    } catch (error) {}
  }

  function markPendingStorySync(id) {
    pendingStorySyncId = String(id || '').trim();
  }

  function tryResolvePendingStoryAfterSync() {
    if (!pendingStorySyncId || !window.AudioHubStories || typeof window.AudioHubStories.getById !== 'function') return false;
    var storyId = String(pendingStorySyncId || '').trim();
    if (!storyId || isSyntheticStoryId(storyId)) return false;
    var resolved = window.AudioHubStories.getById(storyId);
    if (!resolved || !resolved.id) return false;

    var reloadKey = 'audiohub-detail-sync-reload:' + storyId;
    try {
      if (window.sessionStorage.getItem(reloadKey) === '1') {
        clearPendingStorySync(storyId);
        return false;
      }
      window.sessionStorage.setItem(reloadKey, '1');
    } catch (error) {}

    window.location.replace(window.location.pathname + window.location.search);
    return true;
  }

  function resolveStoryByDom(storyNode) {
    if (!storyNode || !window.AudioHubStories || typeof window.AudioHubStories.read !== 'function') return null;
    var stories = window.AudioHubStories.read() || [];
    if (!stories.length) return null;

    var nodeTitle = normalizeLookup(storyNode.getAttribute('data-title') || '');
    var nodeAuthor = normalizeLookup(storyNode.getAttribute('data-author') || '');
    var titleNode = storyNode.querySelector('.detail-title');
    var nodeTitleText = normalizeLookup(titleNode ? titleNode.textContent : '');

    return stories.find(function (item) {
      return normalizeLookup(item && item.title) === nodeTitle && normalizeLookup(item && item.author) === nodeAuthor;
    }) || stories.find(function (item) {
      return normalizeLookup(item && item.title) === nodeTitle || normalizeLookup(item && item.title) === nodeTitleText;
    }) || null;
  }

  function ensureStoryContext() {
    if (!window.AudioHubStories || typeof window.AudioHubStories.read !== 'function') return null;
    var storyNode = document.querySelector('[data-detail-story]');
    if (!storyNode) return null;

    var currentId = String(getQueryParam('id') || '').trim();
    var resolved = currentId && typeof window.AudioHubStories.getById === 'function'
      ? window.AudioHubStories.getById(currentId)
      : null;

    if (!resolved) {
      resolved = resolveStoryFromHomeContext();
    }

    if (!resolved && currentId && !isSyntheticStoryId(currentId)) {
      markPendingStorySync(currentId);
    }

    if (!resolved && !currentId) {
      resolved = resolveStoryByDom(storyNode);
    }

    if (!resolved || !resolved.id) return null;

    clearPendingStorySync(String(resolved.id || currentId || ''));
    syncStoryContextFromHome(resolved);

    var params = new URLSearchParams(window.location.search || '');
    if (params.get('id') !== String(resolved.id)) {
      params.set('id', String(resolved.id));
      window.history.replaceState({}, '', window.location.pathname + '?' + params.toString());
    }

    return resolved;
  }

  ensureStoryContext();

  // NOTE: syncFromApi() is intentionally NOT called here.
  // It overwrites localStorage with only the current user's stories,
  // destroying stories fetched from the public API.
  // Story detail fetches directly from GET /stories/public/:id instead.

  window.addEventListener('audiohub:stories-updated', function () {
    ensureStoryContext();
    // FIX: When story was fetched from API async (page initially empty),
    // re-render story data + audio binding so user sees content + hears audio.
    var storyNode = document.querySelector('[data-detail-story]');
    if (storyNode) {
      var titleEl = storyNode.querySelector('.detail-title');
      var isDomEmpty = titleEl && (titleEl.textContent || '').trim() === 'Đang tải...';
      if (isDomEmpty) {
        var storyId = resolveStoryId();
        var story = window.AudioHubStories && typeof window.AudioHubStories.getById === 'function'
          ? window.AudioHubStories.getById(storyId) : null;
        if (story && story.id) {
          currentPlayingAudioKey = (story.audioKey || story.audio_key) ? String(story.audioKey || story.audio_key) : '';
          bindStoryData(story);
          try { overrideChapterList(resolvePlaylistContext(storyId || ''), story); } catch (e) {}
        }
      }
    }
  }, { signal: _signal });

  window.addEventListener('audiohub:stories-synced', function () {
    if (tryResolvePendingStoryAfterSync()) return;
    ensureStoryContext();
  }, { signal: _signal });

  function formatStoryDate(value) {
    var time = Date.parse(String(value || ''));
    if (isNaN(time)) return '—';
    var date = new Date(time);
    var day = String(date.getDate()).padStart(2, '0');
    var month = String(date.getMonth() + 1).padStart(2, '0');
    var year = date.getFullYear();
    return day + '/' + month + '/' + year;
  }

  function renderStoryMeta(storyNode, story) {
    if (!storyNode || !story || !story.id) return;

    var createdNode = storyNode.querySelector('[data-detail-created-at]');
    if (createdNode) {
      createdNode.innerHTML = '<i class="fa-regular fa-calendar"></i> ' + formatStoryDate(story.createdAt);
    }

    var listenNode = storyNode.querySelector('[data-detail-listen-count]');
    if (listenNode) {
      var totalListens = Number(story.listenCount || 0);
      listenNode.innerHTML = '<i class="fa-regular fa-eye"></i> ' + totalListens + ' lượt nghe';
    }
  }

  function resolvePlaylistContext(storyId) {
    if (!storyId) return null;
    var stored = safeParse(window.localStorage.getItem('audiohub-playlist-context-v1') || '', {});
    var lastActive = String(window.localStorage.getItem('audiohub-playlist-last-active-v1') || '');
    var playlists = safeParse(window.localStorage.getItem('audiohub-playlists-v1') || '', []);
    if (!Array.isArray(playlists)) return null;

    // Normalize: convert entries[] to items[] if needed
    playlists.forEach(function (pl) {
      if (!pl) return;
      if (Array.isArray(pl.items) && pl.items.length) return;
      if (Array.isArray(pl.entries) && pl.entries.length) {
        pl.items = pl.entries.map(function (entry, i) {
          return {
            storyId: String(entry.key || entry.storyId || ''),
            storyTitle: String(entry.title || entry.storyTitle || ''),
            storyAuthor: String(entry.author || entry.storyAuthor || ''),
            chapterTitle: String(entry.chapterTitle || ''),
            chapterLabel: String(entry.chapterTitle || entry.title || entry.storyTitle || ('Chương ' + (i + 1))),
            chapterIndex: i
          };
        });
      }
    });

    function findStoryInPl(pl, sid) {
      if (!pl || !Array.isArray(pl.items)) return -1;
      return pl.items.findIndex(function (item) { return item && String(item.storyId || '') === String(sid); });
    }

    var queryPlaylistId = getQueryParam('playlistId');
    var candidateIds = [
      queryPlaylistId,
      stored && stored.storyId === storyId ? stored.playlistId : '',
      lastActive
    ].filter(Boolean);

    var chosen = null;
    var chosenIndex = -1;

    candidateIds.some(function (id) {
      var pl = playlists.find(function (entry) { return entry && String(entry.id || '') === String(id); });
      if (!pl) return false;
      var idx = findStoryInPl(pl, storyId);
      if (idx >= 0) { chosen = pl; chosenIndex = idx; return true; }
      return false;
    });

    // Do not auto-select a playlist solely because the story exists in it.
    // Only use explicit playlist context from URL or stored navigation state.
    if (!chosen) return null;
    if (!Array.isArray(chosen.items) || !chosen.items.length) return null;
    if (chosenIndex < 0 || !chosen.items[chosenIndex]) {
      chosenIndex = findStoryInPl(chosen, storyId);
      if (chosenIndex < 0) chosenIndex = 0;
    }

    var playlistId = String(chosen.id || '');
    var matchedItem = chosen.items[chosenIndex] || {};
    var chapterLabel = getQueryParam('chapter') || (stored && stored.storyId === storyId ? stored.chapterLabel : '') || matchedItem.chapterLabel || ('Chương ' + (chosenIndex + 1));
    var chapterIndexRaw = getQueryParam('chapterIndex');
    var chapterIndex = chapterIndexRaw !== null && chapterIndexRaw !== ''
      ? Number(chapterIndexRaw)
      : Number(typeof matchedItem.chapterIndex === 'number' ? matchedItem.chapterIndex : chosenIndex);
    if (isNaN(chapterIndex) || chapterIndex < 0) chapterIndex = chosenIndex;

    try {
      window.localStorage.setItem('audiohub-playlist-last-active-v1', playlistId);
      window.localStorage.setItem('audiohub-playlist-context-v1', JSON.stringify({
        playlistId: playlistId,
        storyId: String(storyId),
        chapterLabel: String(chapterLabel || ''),
        chapterIndex: chapterIndex
      }));
    } catch (error) {}

    return {
      storyId: String(storyId),
      playlistId: playlistId,
      chapterLabel: String(chapterLabel || ''),
      chapterIndex: chapterIndex,
      playlist: chosen
    };
  }

  function readAuthProfile() {
    try {
      var raw = window.localStorage.getItem('audiohub-auth-profile');
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && parsed.isLoggedIn ? parsed : null;
    } catch (error) {
      return null;
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

  function renderLockedChapterList(story) {
    var chapterList = document.querySelector('.chapter-list');
    if (!chapterList) return;

    var chapterCountNode = document.querySelector('.detail-sidebar .section-heading span');
    var chapterHeading = document.querySelector('.detail-sidebar .section-heading h2');
    var total = Number(story && story.chapterCount) || 4;
    if (total < 1) total = 4;
    var rows = [];

    for (var i = 1; i <= total; i += 1) {
      rows.push(
        '<div class="chapter-item is-locked" aria-disabled="true">'
          + '<div class="chapter-item__main">'
          + '<span class="chapter-item__index">Chương ' + i + '</span>'
          + '<span class="chapter-item__title">Nội dung đã khóa</span>'
          + '</div>'
          + '<span class="chapter-item__meta"><i class="fa-solid fa-lock"></i> Chỉ hội viên mới có thể mở</span>'
          + '</div>'
      );
    }

    chapterList.innerHTML = rows.join('');
    if (chapterHeading) chapterHeading.innerHTML = '<i class="fa-solid fa-lock"></i> Danh sách chương';
    if (chapterCountNode) chapterCountNode.textContent = total + ' chương';
  }

  function showAuthRequiredModal() {
    var modal = document.querySelector('[data-auth-required-modal]');
    if (!modal) return;
    modal.classList.remove('is-hidden');
    modal.querySelectorAll('[data-auth-required-close]').forEach(function (button) {
      button.onclick = function () {
        modal.classList.add('is-hidden');
      };
    });
  }

  function renderAccessDenied(storyNode, story) {
    if (!storyNode) return;
    storyNode.innerHTML = '<div class="detail-copy"><h2>Không đủ quyền truy cập</h2><p>Truyện này ở chế độ Không công khai và là đặc quyền dành cho hội viên.</p><p>Vui lòng đăng nhập hội viên để mở nội dung này.</p></div>';
    var chapterCopy = document.querySelector('[data-chapter-copy]');
    if (chapterCopy) {
      chapterCopy.innerHTML = '<p>Nội dung truyện chữ bị khóa theo quyền truy cập.</p>';
    }
    renderLockedChapterList(story);
    var audioNode = document.querySelector('[data-story-audio]');
    if (audioNode) {
      audioNode.classList.add('is-hidden');
      audioNode.removeAttribute('src');
      try { audioNode.load(); } catch (error) {}
    }
    var audioNote = document.querySelector('[data-story-audio-note]');
    if (audioNote) {
      audioNote.textContent = 'Audio bị khóa: chỉ hội viên mới có thể phát.';
      audioNote.classList.remove('is-hidden');
    }
    showAuthRequiredModal();
  }

  function ensureFallbackHashtags(storyNode) {
    if (!storyNode) return;
    var copy = storyNode.querySelector('.detail-copy');
    if (!copy) return;
    if (copy.querySelector('.story-hashtags')) return;

    var fallbackStory = {
      genre: String(storyNode.getAttribute('data-genre') || '').trim(),
      description: String(copy.textContent || '').trim()
    };
    if (!fallbackStory.genre && !fallbackStory.description) return;

    copy.innerHTML = buildStoryDescriptionHtml(fallbackStory);
  }

  function setupMobileDescriptionToggle(copy) {
    if (!copy || copy.querySelector('.detail-copy__toggle')) return;
    if (!window.matchMedia('(max-width: 768px)').matches) return;

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'detail-copy__toggle';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.textContent = 'Xem thêm';
    toggle.addEventListener('click', function () {
      var expanded = copy.classList.toggle('is-expanded');
      toggle.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      toggle.textContent = expanded ? 'Thu gọn' : 'Xem thêm';
    });

    copy.appendChild(toggle);
  }

  function initStoryDetailFromStore(storyId) {
    var storyNode = document.querySelector('[data-detail-story]');
    if (!storyNode) return null;

    if (!window.AudioHubStories || typeof window.AudioHubStories.getById !== 'function') {
      ensureFallbackHashtags(storyNode);
      return null;
    }

    var story = null;
    if (storyId) {
      story = window.AudioHubStories.getById(storyId);
    }

    // Fallback: if getById failed (e.g. s_xxx was migrated to CUID),
    // try to find by title from URL param or sessionStorage context
    if (!story && typeof window.AudioHubStories.read === 'function') {
      var allStories = window.AudioHubStories.read() || [];

      // 1. Try matching by title from sessionStorage home context
      if (!story) {
        var ctx = readHomeDetailContext();
        var ctxTitle = ctx && ctx.title ? String(ctx.title).trim().toLowerCase() : '';
        if (ctxTitle) {
          story = allStories.find(function (item) {
            return String(item && item.title || '').trim().toLowerCase() === ctxTitle;
          }) || null;
        }
      }

      // 2. Try matching by title from URL ?title= param
      if (!story) {
        var queryTitle = getQueryParam('title');
        if (queryTitle) {
          var titleNeedle = normalizeLookup(queryTitle);
          story = allStories.find(function (item) {
            return normalizeLookup(item && item.title) === titleNeedle;
          }) || null;
        }
      }

      // 3. Try matching by DOM attributes (old fallback)
      if (!story && !storyId) {
        var nodeTitle = String(storyNode.getAttribute('data-title') || '').trim().toLowerCase();
        var nodeAuthor = String(storyNode.getAttribute('data-author') || '').trim().toLowerCase();
        story = allStories.find(function (item) {
          var title = String(item && item.title || '').trim().toLowerCase();
          var author = String(item && item.author || '').trim().toLowerCase();
          return !!nodeTitle && title === nodeTitle && author === nodeAuthor;
        }) || allStories.find(function (item) {
          var title = String(item && item.title || '').trim().toLowerCase();
          return !!nodeTitle && title === nodeTitle;
        }) || null;
      }
    }

    if (!story) {
      if (storyId && !isSyntheticStoryId(storyId)) {
        markPendingStorySync(storyId);
        // API fallback: fetch story from D1 when not in localStorage
        if (window.AudioHubApi && typeof window.AudioHubApi.request === 'function') {
          window.AudioHubApi.request('/stories/public/' + encodeURIComponent(storyId), { method: 'GET' })
            .then(function (apiStory) {
              if (!apiStory || !apiStory.id) return;
              // Normalize snake_case to camelCase
              if (apiStory.reading_text && !apiStory.readingText) apiStory.readingText = apiStory.reading_text;
              if (apiStory.audio_key && !apiStory.audioKey) apiStory.audioKey = apiStory.audio_key;
              if (apiStory.chapter_title && !apiStory.chapterTitle) apiStory.chapterTitle = apiStory.chapter_title;
              if (apiStory.chapter_count != null && apiStory.chapterCount == null) apiStory.chapterCount = apiStory.chapter_count;
              if (apiStory.cover_key && !apiStory.coverKey) apiStory.coverKey = apiStory.cover_key;
              if (apiStory.cover_data && !apiStory.coverData) apiStory.coverData = apiStory.cover_data;
              if (apiStory.listen_count != null && apiStory.listenCount == null) apiStory.listenCount = apiStory.listen_count;
              if (typeof apiStory.chapters === 'string') {
                try { apiStory.chapters = JSON.parse(apiStory.chapters); } catch (e) { apiStory.chapters = []; }
              }
              // Cache in localStorage for next load
              if (window.AudioHubStories && typeof window.AudioHubStories.upsert === 'function') {
                window.AudioHubStories.upsert(apiStory);
              }
              // Re-trigger render
              window.dispatchEvent(new Event('audiohub:stories-updated'));
            })
            .catch(function () {});
        }
      }
      ensureFallbackHashtags(storyNode);
      return null;
    }

    clearPendingStorySync(String(story.id || storyId || ''));

    // Update URL if found story ID differs from URL's storyId
    // (e.g. s_xxx was migrated to CUID, or found by title fallback)
    if (storyId && story.id && String(story.id) !== String(storyId)) {
      var urlParams = new URLSearchParams(window.location.search || '');
      urlParams.set('id', String(story.id));
      window.history.replaceState({}, '', window.location.pathname + '?' + urlParams.toString());
      storyId = String(story.id);
    }

    if (!storyId && story.id) {
      var params = new URLSearchParams(window.location.search || '');
      if (!params.get('id')) {
        params.set('id', String(story.id));
        var nextUrl = window.location.pathname + '?' + params.toString();
        window.history.replaceState({}, '', nextUrl);
      }
    }

    storyId = storyId || String(story.id || '');

    if (!storyId) {
      ensureFallbackHashtags(storyNode);
      return null;
    }

    story = window.AudioHubStories.getById(storyId) || story;

    if (!story) {
      ensureFallbackHashtags(storyNode);
      return null;
    }
    if (String(story.visibility || '') === 'Không công khai' && !isMember()) {
      // Owner can always see their own stories
      var _ownerId = '';
      try { var _ap = JSON.parse(localStorage.getItem('audiohub-auth-profile') || '{}'); _ownerId = _ap.id || _ap.email || ''; } catch (e) {}
      var _storyOwnerId = story.userId || story.user_id || '';
      if (!_ownerId || String(_storyOwnerId).toLowerCase() !== String(_ownerId).toLowerCase()) {
        renderAccessDenied(storyNode, story);
        return null;
      }
    }

    storyNode.setAttribute('data-story-id', String(story.id || ''));
    storyNode.setAttribute('data-title', String(story.title || ''));
    storyNode.setAttribute('data-author', String(story.author || ''));
    storyNode.setAttribute('data-genre', String(story.genre || ''));
    storyNode.setAttribute('data-cover-key', String(story.coverKey || ''));
    storyNode.setAttribute('data-youtube-url', String(story.youtubeUrl || ''));
    storyNode.setAttribute('data-youtube-id', String(story.youtubeId || ''));
    storyNode.setAttribute('href', '/story-detail?id=' + encodeURIComponent(String(story.id || '')));

    var titleNode = storyNode.querySelector('.detail-title');
    if (titleNode && story.title) titleNode.textContent = story.title;
    if (story.title) document.title = story.title + ' | AudioHub';

    if (story.genre) {
      var crumb = document.querySelector('.breadcrumb');
      if (crumb) crumb.innerHTML = '<a href="index.html">Home</a> <span>/</span> <a href="new-posts.html?genre=' + encodeURIComponent(story.genre) + '">' + escapeHtml(story.genre) + '</a> <span>/</span> <a href="new-posts.html">' + escapeHtml(story.title || 'Chi tiết truyện') + '</a>';
    }

    var meta = storyNode.querySelector('.detail-meta');
    if (meta) {
      var authorLink = meta.querySelector('a[href*="channel.html"]');
      var authorSpan = meta.querySelector('span');
      var authorName = story.author || 'Ẩn danh';
      if (authorLink) {
        authorLink.href = 'channel.html?author=' + encodeURIComponent(authorName);
        var authorInner = authorLink.querySelector('span');
        if (authorInner) {
          authorInner.innerHTML = '<i class="fa-regular fa-user"></i> ' + escapeHtml(authorName);
        } else {
          authorLink.innerHTML = '<i class="fa-regular fa-user"></i> ' + escapeHtml(authorName);
        }
      } else if (authorSpan) {
        authorSpan.innerHTML = '<a href="channel.html?author=' + encodeURIComponent(authorName) + '" style="color:inherit;text-decoration:none"><i class="fa-regular fa-user"></i> ' + escapeHtml(authorName) + '</a>';
      }
    }
    renderStoryMeta(storyNode, story);

    var copy = storyNode.querySelector('.detail-copy');
    if (copy && story.description) {
      copy.innerHTML = buildStoryDescriptionHtml(story);
      setupMobileDescriptionToggle(copy);
    }

    var chapterCopy = document.querySelector('[data-chapter-copy]');
    // Read readingText from FIRST chapter as fallback
    var chapterReadingText0 = '';
    try {
      var _cs0 = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
      var _ch0 = Array.isArray(_cs0[String(story.id)]) ? _cs0[String(story.id)] : [];
      if (_ch0[0] && _ch0[0].readingText) chapterReadingText0 = _ch0[0].readingText;
    } catch (e) {}
    var readingContent = chapterReadingText0 || story.readingText || story.description || '';

    // Track last rendered text to avoid overwriting chapter-specific text
    if (!window.__lastRenderedReadingText) window.__lastRenderedReadingText = '';

    function renderReadingText() {
      var cc = document.querySelector('[data-chapter-copy]');
      // CRITICAL: If click handler already set chapter text, DON'T overwrite it.
      // Compare current innerHTML length to detect if click handler set different text.
      if (cc && cc.innerHTML && window.__lastRenderedReadingText && cc.innerHTML !== window.__lastRenderedReadingText) {
        // DOM has different text than what we last set — click handler changed it, don't overwrite
        return true;
      }
      if (cc && readingContent) {
        var ct = cleanReadingText(readingContent);
        var bl = String(ct).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
        cc.innerHTML = bl.length ? bl.map(function (l) { return '<p>' + escapeHtml(l) + '</p>'; }).join('') : '';
        window.__lastRenderedReadingText = cc.innerHTML;
        // Force scrollable via inline style (CSS may not apply due to selector issues)
        cc.style.maxHeight = '60vh';
        cc.style.overflowY = 'auto';
        cc.style.scrollBehavior = 'smooth';
        return true;
      }
      return false;
    }
    if (!renderReadingText()) {
      // DOM not ready — retry with increasing delays
      requestAnimationFrame(function () { renderReadingText(); });
      setTimeout(function () { renderReadingText(); }, 100);
      setTimeout(function () { renderReadingText(); }, 300);
    }

    // Read chapter title from chapters store (not top-level story.chapterTitle which gets overwritten by latest upload)
    var chapterTitleForPlayer = 'Chương 1';
    try {
      var _csP = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
      var _chP = Array.isArray(_csP[String(story.id)]) ? _csP[String(story.id)] : [];
      if (_chP[0] && _chP[0].title) chapterTitleForPlayer = 'Chương 1: ' + _chP[0].title;
    } catch (e) {}
    if (chapterTitleForPlayer === 'Chương 1' && story.chapterTitle) chapterTitleForPlayer = story.chapterTitle;
    var chapterLabel = document.querySelector('[data-player-current-chapter]');
    if (chapterLabel) chapterLabel.textContent = chapterTitleForPlayer;

    var playerSubtitle = document.querySelector('.audio-headings p');
    if (playerSubtitle) playerSubtitle.textContent = story.title || '';

    return story;
  }

  function trackStoryListen(storyId) {
    if (!storyId || !window.AudioHubStories || typeof window.AudioHubStories.trackListen !== 'function') return;
    try {
      window.AudioHubStories.trackListen(String(storyId));
    } catch (error) {}
  }

  var coverUrlByNode = new WeakMap();

  // Self-heal: recover cover from IndexedDB and persist to Supabase
  function selfHealCoverFromIndexedDB(storyId, coverKey) {
    if (!window.AudioHubStoryCover || typeof window.AudioHubStoryCover.get !== 'function') return;
    if (!storyId || String(storyId).startsWith('s_')) return;
    // Try coverKey first, then story ID as fallback
    var idbKey = coverKey && String(coverKey).indexOf('c_') === 0 ? coverKey : storyId;
    window.AudioHubStoryCover.get(idbKey).then(function (blob) {
      if (!blob || !blob.size) return;
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = reader.result;
        applyCoverUrl(dataUrl);
        // Persist to D1
        fetch('/api/stories/' + encodeURIComponent(storyId), {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: storyId, cover_data: dataUrl })
        }).catch(function () {});
        // Update local cache
        if (story) story.coverData = dataUrl;
      };
      reader.readAsDataURL(blob);
    }).catch(function () {});
  }

  function bindStoryCover(story) {
    // Try coverData (base64) first — new method
    var coverData = story && story.coverData ? String(story.coverData) : '';
    if (coverData) {
      applyCoverUrl(coverData);
      return;
    }

    // Fallback: fetch coverData directly from Supabase if story has an ID
    var storyId = story && story.id ? String(story.id) : '';
    if (storyId && !String(storyId).startsWith('s_') && window.AudioHubSupabase && typeof window.AudioHubSupabase.fetchStoryById === 'function') {
      window.AudioHubSupabase.fetchStoryById(storyId).then(function (fresh) {
        if (fresh && fresh.coverData) {
          applyCoverUrl(fresh.coverData);
          // Self-heal: update local + Supabase cache
          if (story) story.coverData = fresh.coverData;
          if (window.AudioHubStories && typeof window.AudioHubStories.upsert === 'function') {
            window.AudioHubStories.upsert(Object.assign({}, story, { coverData: fresh.coverData }));
          }
        } else if (fresh && !fresh.coverData) {
          // Self-heal: recover from IndexedDB (try coverKey, then story ID) and update Supabase
          selfHealCoverFromIndexedDB(storyId, fresh.coverKey || '');
        }
      }).catch(function () {});
    }

    function applyCoverUrl(url) {
      if (!url) return;
      try {
        // Hero cover
        var heroCover = document.querySelector('[data-detail-cover]');
        if (heroCover) {
          var placeholder = heroCover.querySelector('.detail-hero__placeholder');
          if (placeholder) placeholder.style.display = 'none';
          heroCover.style.backgroundImage = 'url("' + url + '")';
          heroCover.style.backgroundSize = 'cover';
          heroCover.style.backgroundPosition = 'center';
        }

        // Player cover
        var playerCover = document.querySelector('[data-cover]');
        if (playerCover) {
          playerCover.style.backgroundImage = 'url("' + url + '")';
          playerCover.style.backgroundSize = 'cover';
          playerCover.style.backgroundPosition = 'center';
        }

        // Audio panel cover
        var audioCover = document.querySelector('.audio-cover');
        if (audioCover) {
          audioCover.style.backgroundImage = 'url("' + url + '")';
          audioCover.style.backgroundSize = 'cover';
          audioCover.style.backgroundPosition = 'center';
        }

        // Next chapter thumbnail
        var nextupThumb = document.querySelector('.sd-nextup__thumb');
        if (nextupThumb) {
          nextupThumb.style.backgroundImage = 'url("' + url + '")';
          nextupThumb.style.backgroundSize = 'cover';
          nextupThumb.style.backgroundPosition = 'center';
        }
      } catch (error) {}
    }

    // Fallback: try IndexedDB (coverKey) then Supabase Storage URL
    var coverKey = story && story.coverKey ? String(story.coverKey) : '';

    /** Fetch cover_data from D1 */
    function fetchStorageCover() {
      if (!storyId || String(storyId).startsWith('s_')) return Promise.resolve(false);
      return fetch('/api/stories/' + encodeURIComponent(storyId))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (row) {
          if (row && row.cover_data) {
            applyCoverUrl(row.cover_data);
            return true;
          }
          return false;
        }).catch(function () { return false; });
    }

    // Build list of IndexedDB keys to try (coverKey, storyId, s_+storyId)
    var idbKeys = [];
    if (coverKey) idbKeys.push(coverKey);
    if (storyId && idbKeys.indexOf(storyId) === -1) idbKeys.push(storyId);
    var syntheticCoverId = 's_' + storyId;
    if (storyId && idbKeys.indexOf(syntheticCoverId) === -1) idbKeys.push(syntheticCoverId);

    // Try IndexedDB keys first, then D1 API
    function tryCoverIdb(idx) {
      if (idx >= idbKeys.length) { fetchStorageCover(); return; }
      var key = idbKeys[idx];
      if (!window.AudioHubStoryCover || typeof window.AudioHubStoryCover.get !== 'function') { fetchStorageCover(); return; }
      window.AudioHubStoryCover.get(key)
        .then(function (blob) {
          if (blob && blob.size > 0) {
            applyCoverUrl(URL.createObjectURL(blob));
          } else {
            tryCoverIdb(idx + 1);
          }
        })
        .catch(function () { tryCoverIdb(idx + 1); });
    }
    tryCoverIdb(0);
  }

  // Batch-fetch missing coverData from D1 for sidebar/related thumbnails
  // Also self-heals: if cover exists in IndexedDB but not in D1, uploads it
  function fetchMissingCoversFromD1() {
    if (!window.AudioHubSupabase || typeof window.AudioHubSupabase.fetchStoryById !== 'function') return;
    // Find all thumb elements with data-cover-story-id
    var nodes = document.querySelectorAll('[data-cover-story-id]');
    var idsToFetch = [];
    var nodeMap = {};
    nodes.forEach(function (node) {
      // Skip if already has a real image (not gradient)
      if (node.style.backgroundImage && node.style.backgroundImage.indexOf('url(') !== -1) return;
      var id = node.getAttribute('data-cover-story-id') || '';
      if (!id || id.length < 10) return;
      if (idsToFetch.indexOf(id) === -1) idsToFetch.push(id);
      if (!nodeMap[id]) nodeMap[id] = [];
      nodeMap[id].push(node);
    });
    if (!idsToFetch.length) return;
    // Batch fetch cover_data + cover_key from D1
    var idsParam = idsToFetch.map(encodeURIComponent).join(',');
    fetch('/api/stories/batch?ids=' + idsParam + '&fields=id,cover_data,cover_key')
    .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (rows) {
        var missingCovers = [];
        (rows || []).forEach(function (row) {
          if (row.cover_data && nodeMap[row.id]) {
            nodeMap[row.id].forEach(function (node) {
              try {
                node.style.backgroundImage = 'url("' + row.cover_data + '")';
                node.style.backgroundSize = 'cover';
                node.style.backgroundPosition = 'center';
                node.textContent = '';
              } catch (e) {}
            });
            // Save cover_data back to localStorage so next load is instant
            try {
              var allLocal = window.AudioHubStories.read() || [];
              var target = allLocal.find(function (s) { return String(s.id) === String(row.id); });
              if (target && !target.coverData) {
                target.coverData = row.cover_data;
                window.AudioHubStories.write(allLocal);
              }
            } catch (e) {}
          } else if (row.cover_key && !row.cover_data) {
            missingCovers.push(row);
          } else if (!row.cover_data && !row.cover_key) {
            // Both cover_data and cover_key are NULL — try story ID in IndexedDB
            missingCovers.push({ id: row.id, cover_key: row.id });
          }
        });
        // Self-heal from IndexedDB
        if (missingCovers.length && window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function') {
          missingCovers.forEach(function (row) {
            window.AudioHubStoryCover.get(row.cover_key).then(function (blob) {
              if (!blob || !blob.size) return;
              var reader = new FileReader();
              reader.onload = function () {
                var dataUrl = reader.result;
                if (nodeMap[row.id]) {
                  nodeMap[row.id].forEach(function (node) {
                    try {
                      node.style.backgroundImage = 'url("' + dataUrl + '")';
                      node.style.backgroundSize = 'cover';
                      node.style.backgroundPosition = 'center';
                      node.textContent = '';
                    } catch (e) {}
                  });
                }
                fetch('/api/stories/' + encodeURIComponent(row.id), {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: row.id, cover_data: dataUrl })
                }).catch(function () {});
              };
              reader.readAsDataURL(blob);
            }).catch(function () {});
          });
        }
      }).catch(function () {});
  }

  /* ── Load card covers from local stories (coverData or IndexedDB by coverKey) ── */
  function loadCardCoversFromIndexedDB() {
    if (!window.AudioHubStories || typeof window.AudioHubStories.read !== 'function') return;
    if (!window.AudioHubStoryCover || typeof window.AudioHubStoryCover.get !== 'function') return;
    var allStories = window.AudioHubStories.read() || [];
    var storyMap = {};
    allStories.forEach(function (s) { if (s && s.id) storyMap[String(s.id)] = s; });

    var nodes = document.querySelectorAll('[data-cover-story-id]');
    nodes.forEach(function (node) {
      // Skip if already has a real image
      if (node.style.backgroundImage && node.style.backgroundImage.indexOf('url(') !== -1) return;
      var id = node.getAttribute('data-cover-story-id') || '';
      var story = storyMap[id];
      if (!story) return;

      // Try coverData first
      if (story.coverData) {
        try {
          node.style.backgroundImage = 'url("' + story.coverData + '")';
          node.style.backgroundSize = 'cover';
          node.style.backgroundPosition = 'center';
          node.textContent = '';
        } catch (e) {}
        return;
      }

      // Try IndexedDB via coverKey
      var coverKey = story.coverKey || '';
      if (!coverKey) return;
      window.AudioHubStoryCover.get(coverKey).then(function (blob) {
        if (!blob || !blob.size) return;
        var url = URL.createObjectURL(blob);
        try {
          node.style.backgroundImage = 'url("' + url + '")';
          node.style.backgroundSize = 'cover';
          node.style.backgroundPosition = 'center';
          node.textContent = '';
        } catch (e) {}
      }).catch(function () {});
    });
  }

  function updateAudioHeadingStoryTitle(story) {
    var playerSubtitle = document.querySelector('.audio-headings p');
    if (!playerSubtitle) return;
    playerSubtitle.textContent = story && story.title ? String(story.title) : '';
  }

  function applyStoryOverviewFromPlaylistItem(item) {
    if (!item || !item.storyId || !window.AudioHubStories || typeof window.AudioHubStories.getById !== 'function') return;
    var story = window.AudioHubStories.getById(String(item.storyId));
    if (!story) return;

    var titleNode = document.querySelector('[data-detail-story] .detail-title');
    if (titleNode) titleNode.textContent = story.title || '';
    if (story.title) document.title = story.title + ' | AudioHub';

    var meta = document.querySelector('[data-detail-story] .detail-meta');
    if (meta) {
      var authorLink = meta.querySelector('a[href*="channel.html"]');
      var authorSpan = meta.querySelector('span');
      var authorName = story.author || 'Ẩn danh';
      if (authorLink) {
        authorLink.href = 'channel.html?author=' + encodeURIComponent(authorName);
        var authorInner = authorLink.querySelector('span');
        if (authorInner) {
          authorInner.innerHTML = '<i class="fa-regular fa-user"></i> ' + escapeHtml(authorName);
        } else {
          authorLink.innerHTML = '<i class="fa-regular fa-user"></i> ' + escapeHtml(authorName);
        }
      } else if (authorSpan) {
        authorSpan.innerHTML = '<a href="channel.html?author=' + encodeURIComponent(authorName) + '" style="color:inherit;text-decoration:none"><i class="fa-regular fa-user"></i> ' + escapeHtml(authorName) + '</a>';
      }
    }

    var detailStoryNode = document.querySelector('[data-detail-story]');
    var copy = document.querySelector('[data-detail-story] .detail-copy');
    if (copy && story.description) {
      copy.innerHTML = buildStoryDescriptionHtml(story);
    }
    renderStoryMeta(detailStoryNode, story);

    var chapterCopy = document.querySelector('[data-chapter-copy]');
    if (chapterCopy) {
      // Read readingText from the SPECIFIC CHAPTER, not story level
      var chapterReadingText = '';
      try {
        var chapIdx = typeof item.chapterIndex === 'number' ? item.chapterIndex : (typeof item.index === 'number' ? item.index : 0);
        var chapStore = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
        var storyChapters = Array.isArray(chapStore[String(item.storyId)]) ? chapStore[String(item.storyId)] : [];
        if (storyChapters[chapIdx] && storyChapters[chapIdx].readingText) {
          chapterReadingText = storyChapters[chapIdx].readingText;
        }
      } catch (e) {}
      // Fallback: story-level readingText, then description
      var readingContent = chapterReadingText || story.readingText || story.description || '';
      var cleanedText = cleanReadingText(readingContent);
      var blocks = String(cleanedText).split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
      chapterCopy.innerHTML = blocks.length
        ? blocks.map(function (line) { return '<p>' + escapeHtml(line) + '</p>'; }).join('')
        : '<p>Chưa có nội dung truyện chữ cho chương này.</p>';
      chapterCopy.style.maxHeight = '60vh';
      chapterCopy.style.overflowY = 'auto';
      chapterCopy.style.scrollBehavior = 'smooth';
    }

    var chapterLabel = document.querySelector('[data-player-current-chapter]');
    // Prefer chapter label from chapters store over top-level story.chapterTitle
    var _chLabel = item.chapterLabel || 'Chương 1';
    try {
      var _csS = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
      var _chS = Array.isArray(_csS[String(story.id)]) ? _csS[String(story.id)] : [];
      var _idx = Number(item.index || item.chapterIndex || 0);
      if (_chS[_idx] && _chS[_idx].title) _chLabel = 'Chương ' + (_idx + 1) + ': ' + _chS[_idx].title;
    } catch (e) {}
    if (chapterLabel) chapterLabel.textContent = _chLabel;
  }

  function pickTrendingStories(stories) {
    return (stories || []).filter(function (item) {
      return String(item && item.visibility || '').trim() === 'Công khai';
    }).sort(function (a, b) {
      var diff = Number(b.listenCount2d || 0) - Number(a.listenCount2d || 0);
      if (diff !== 0) return diff;
      var ta = Date.parse(String(a.updatedAt || a.createdAt || '')) || 0;
      var tb = Date.parse(String(b.updatedAt || b.createdAt || '')) || 0;
      return tb - ta;
    });
  }

  function renderSidebarTrending(currentStory) {
    var list = document.querySelector('.mini-list');
    if (!list || !window.AudioHubStories || typeof window.AudioHubStories.read !== 'function') return;

    var allStories = window.AudioHubStories.read() || [];
    // If localStorage is sparse, fetch from Supabase to fill in
    if (allStories.length < 4 && window.AudioHubSupabase && window.AudioHubSupabase.isAvailable()) {
      window.AudioHubSupabase.fetchPublicStories().then(function (remote) {
        if (remote && remote.length) {
          // Write directly to localStorage — DO NOT call upsert() (triggers API PATCH calls)
          var existing = window.AudioHubStories.read() || [];
          var existingIds = {};
          existing.forEach(function(s) { if (s && s.id) existingIds[s.id] = true; });
          remote.forEach(function (s) {
            if (!existingIds[s.id]) {
              existing.push(s);
            }
          });
          try { localStorage.setItem('audiohub-library', JSON.stringify(existing)); } catch(e) {}
          renderSidebarTrending(currentStory);
          fetchMissingCoversFromD1();
          loadCardCoversFromIndexedDB();
        }
      }).catch(function () {});
      return;
    }

    // Check if current story is ACTUALLY in the playlist (not just URL has playlistId)
    var inPlaylist = false;
    var playlistIdParam = new URLSearchParams(window.location.search).get('playlistId');
    if (playlistIdParam && currentStory) {
      try {
        var plRaw = localStorage.getItem('audiohub-playlists-v1');
        var allPlaylists = plRaw ? JSON.parse(plRaw) : [];
        if (Array.isArray(allPlaylists)) {
          var matchedPl = allPlaylists.find(function(p) { return String(p.id) === String(playlistIdParam); });
          if (matchedPl) {
            var entries = matchedPl.entries || matchedPl.items || [];
            inPlaylist = entries.some(function(e) {
              return String(e.storyId || e.key || '') === String(currentStory.id || '');
            });
          }
        }
      } catch (e) {}
    }

    var stories;

    if (!inPlaylist && currentStory) {
      // Not in playlist: show same author + same genre stories
      var author = String(currentStory.author || '').trim().toLowerCase();
      var genre = String(currentStory.genre || '').trim().toLowerCase();
      var currentId = String(currentStory.id || '');
      stories = allStories.filter(function (s) {
        if (!s || !s.id || String(s.id) === currentId) return false;
        if (String(s.visibility || '').trim() !== 'Công khai') return false;
        var sAuthor = String(s.author || '').trim().toLowerCase();
        var sGenre = String(s.genre || '').trim().toLowerCase();
        return (author && sAuthor === author) || (genre && sGenre === genre);
      }).sort(function (a, b) {
        return (b.listenCount || b.views || 0) - (a.listenCount || a.views || 0);
      });
    } else {
      // In playlist: show trending
      stories = pickTrendingStories(allStories);
    }

    stories = stories.slice(0, 8);

    // Update heading based on context
    var heading = list.closest('.sidebar-panel') ? list.closest('.sidebar-panel').querySelector('.section-heading h2') : null;
    if (heading) {
      if (!inPlaylist && currentStory) {
        heading.innerHTML = '<i class="fa-solid fa-book-open"></i> Có thể bạn thích';
      } else {
        heading.innerHTML = '<i class="fa-solid fa-arrow-trend-up"></i> Truyện Trending';
      }
    }

    if (!stories.length) {
      list.innerHTML = '';
      return;
    }

    list.innerHTML = stories.map(function (item) {
      var title = escapeHtml(String(item.title || 'Truyện'));
      var views2d = Number(item.listenCount2d || 0);
      var href = '/story-detail?id=' + encodeURIComponent(String(item.id || ''));
      var storyId = escapeHtml(String(item.id || ''));
      var coverData = item.coverData ? escapeHtml(String(item.coverData)) : '';
      var initials = title.slice(0, 2).toUpperCase();
      // Generate default canvas cover
      var coverStyle = '';
      if (coverData) {
        coverStyle = 'background-image:url("' + coverData + '");background-size:cover;background-position:center;';
      }
      if (!coverStyle) {
        var hash = 0;
        for (var hi = 0; hi < title.length; hi++) hash = title.charCodeAt(hi) + ((hash << 5) - hash);
        var hue1 = Math.abs(hash) % 360;
        var hue2 = (hue1 + 40) % 360;
        coverStyle = 'background:linear-gradient(135deg, hsl(' + hue1 + ',60%,30%), hsl(' + hue2 + ',50%,20%));display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.7);font-weight:700;font-size:14px;';
      }
      return '<a href="' + href + '" class="mini-story">'
        + '<div class="mini-thumb" data-cover-story-id="' + storyId + '" style="' + coverStyle + '">' + (coverData ? '' : initials) + '</div>'
        + '<div><h3>' + title + '</h3><p><i class="fa-regular fa-eye"></i> ' + views2d + ' lượt nghe (2 ngày)</p></div></a>';
    }).join('');
  }

  function renderRelatedStories(story, forcedTag) {
    var grid = document.querySelector('[data-related-grid]');
    if (!grid || !window.AudioHubStories || typeof window.AudioHubStories.read !== 'function') return;

    if (!story) {
      var fallbackStories = window.AudioHubStories.read() || [];
      story = fallbackStories[0] || null;
    }
    if (!story) return;

    var allStories = window.AudioHubStories.read() || [];
    // If localStorage is sparse, fetch from Supabase to fill in
    if (allStories.length < 4 && window.AudioHubSupabase && window.AudioHubSupabase.isAvailable()) {
      window.AudioHubSupabase.fetchPublicStories().then(function (remote) {
        if (remote && remote.length) {
          // Write directly to localStorage — DO NOT call upsert() (triggers API PATCH calls)
          var existing = window.AudioHubStories.read() || [];
          var existingIds = {};
          existing.forEach(function(s) { if (s && s.id) existingIds[s.id] = true; });
          remote.forEach(function (s) {
            if (!existingIds[s.id]) {
              existing.push(s);
            }
          });
          try { localStorage.setItem('audiohub-library', JSON.stringify(existing)); } catch(e) {}
          renderRelatedStories(story, forcedTag);
          fetchMissingCoversFromD1();
        }
      }).catch(function () {});
      return;
    }
    var currentId = String(story.id || '');
    var currentGenre = String(story.genre || '').trim();
    var currentAuthor = String(story.author || '').trim();
    var currentTags = Array.isArray(story.hashtags) ? story.hashtags.map(normalizeHashtagToken).filter(Boolean) : [];
    if (!currentTags.length) {
      currentTags = extractHashtags(String(story.description || '')).map(normalizeHashtagToken).filter(Boolean);
    }
    var activeTag = normalizeHashtagToken(forcedTag || getQueryParam('hashtag') || '');
    if (activeTag) {
      currentTags = [activeTag];
    }

    var hashtagMatches = allStories.filter(function (item) {
      if (!item || !item.id || String(item.id) === currentId) return false;
      var tags = Array.isArray(item.hashtags) ? item.hashtags.map(normalizeHashtagToken).filter(Boolean) : [];
      if (!tags.length) {
        tags = extractHashtags(String(item.description || '')).map(normalizeHashtagToken).filter(Boolean);
      }
      if (!tags.length || !currentTags.length) return false;
      return tags.some(function (tag) { return currentTags.indexOf(tag) >= 0; });
    });

    var authorMatches = allStories.filter(function (item) {
      if (!item || !item.id || String(item.id) === currentId) return false;
      if (hashtagMatches.some(function (g) { return String(g.id) === String(item.id); })) return false;
      return currentAuthor && String(item.author || '').trim() === currentAuthor;
    });

    var genreMatches = allStories.filter(function (item) {
      if (!item || !item.id || String(item.id) === currentId) return false;
      if (hashtagMatches.some(function (g) { return String(g.id) === String(item.id); })) return false;
      if (authorMatches.some(function (a) { return String(a.id) === String(item.id); })) return false;
      return currentGenre && String(item.genre || '').trim() === currentGenre;
    });

    var picked = hashtagMatches.concat(authorMatches).concat(genreMatches);

    if (picked.length < 3) {
      var filler = allStories.filter(function (item) {
        if (!item || !item.id || String(item.id) === currentId) return false;
        return !picked.some(function (entry) { return String(entry.id) === String(item.id); });
      });
      picked = picked.concat(filler);
    }

    picked = picked.slice(0, 4);
    if (!picked.length) {
      return;
    }

    grid.setAttribute('data-related-source', currentTags.length ? 'hashtags' : 'fallback');
    grid.setAttribute('data-related-tags', currentTags.join(','));
    grid.setAttribute('data-related-active-tag', activeTag || '');

    grid.innerHTML = picked.map(function (item) {
      var title = escapeHtml(String(item.title || 'Truyện đề xuất'));
      var genre = escapeHtml(String(item.genre || 'Khác'));
      var author = escapeHtml(String(item.author || 'Ẩn danh'));
      var href = '/story-detail?id=' + encodeURIComponent(String(item.id));
      var coverData = item.coverData ? escapeHtml(String(item.coverData)) : '';
      var visibility = escapeHtml(String(item.visibility || ''));
      var storyId = escapeHtml(String(item.id || ''));
      var chapters = Number(item.chapterCount || 0) || '';
      var chaptersLabel = chapters ? (chapters + ' Chương') : '';
      var views = Number(item.listenCount || 0);
      var viewsLabel = views ? (views + ' views') : '— views';
      var isCompleted = item.isCompleted ? '<span class="story-badge story-badge--full">FULL</span>' : '';
      // Default cover: canvas-generated with title + genre
      var bgProp = '';
      var initials = title.slice(0, 2).toUpperCase();
      if (coverData) {
        bgProp = 'background-image:url("' + coverData + '");background-size:cover;background-position:center;';
      }
      if (!bgProp) {
        var hash = 0;
        for (var hi = 0; hi < title.length; hi++) hash = title.charCodeAt(hi) + ((hash << 5) - hash);
        var hue1 = Math.abs(hash) % 360;
        var hue2 = (hue1 + 40) % 360;
        bgProp = 'background:linear-gradient(135deg, hsl(' + hue1 + ',60%,30%), hsl(' + hue2 + ',50%,20%));display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.7);font-weight:700;';
      }
      return '<a href="' + href + '" style="display:block;width:200px;min-width:200px;border-radius:12px;background:#121826;border:1px solid rgba(255,255,255,.08);text-decoration:none;color:#fff;overflow:hidden;flex-shrink:0;" data-cover-story-id="' + storyId + '" data-related-story-id="' + storyId + '" data-related-visibility="' + visibility + '">'
        + '<div style="position:relative;width:100%;height:120px;' + bgProp + '">'
        + (coverData ? '' : '<span style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);font-size:22px;font-weight:700;color:rgba(255,255,255,.7)">' + initials + '</span>')
        + '<div style="position:absolute;bottom:0;left:0;right:0;padding:6px 8px;background:linear-gradient(transparent,rgba(0,0,0,.8));">'
        + '<div style="font-size:.7rem;color:rgba(255,255,255,.6);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + genre + ' · ' + viewsLabel + '</div>'
        + '<div style="font-size:.78rem;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + title + '</div>'
        + '<div style="font-size:.68rem;color:rgba(255,255,255,.5);"><i class="fa-regular fa-user"></i> ' + author + ' <i class="fa-solid fa-star" style="color:#f59e0b"></i> 5</div>'
        + '</div></div></a>';
    }).join('');

    // Add class for horizontal scroll layout (CSS in related-hscroll.css)
    grid.classList.add('related-hscroll');

    Array.prototype.slice.call(grid.querySelectorAll('.story-fav')).forEach(function (button) {
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
      });
    });

    grid.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      var card = target.closest('a.story-card');
      if (!card) return;

      var visibility = String(card.getAttribute('data-related-visibility') || '').trim();
      if (visibility === 'Không công khai' && !isMember()) {
        event.preventDefault();
        event.stopPropagation();
        if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
        showAuthRequiredModal();
      }
    }, true);
  }

  var audioUrlByNode = new WeakMap();
  var _audioLoadGen = 0; // generation counter — prevents stale async loads from overwriting

  /* ═══════════════════════════════════════════════════════════════════
     Background R2 sync — upload ALL chapter audio from IndexedDB to R2
     Runs on page load. In regular browser, IndexedDB has the audio.
     After sync, incognito users can play from R2.
     ═══════════════════════════════════════════════════════════════════ */
  function _syncAllChaptersToR2(storyId) {
    if (!storyId || !window.AudioHubStoryAudio || typeof window.AudioHubStoryAudio.get !== 'function') return;
    try {
      var _chStore = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
      var _chArr = Array.isArray(_chStore[String(storyId)]) ? _chStore[String(storyId)] : [];
      if (!_chArr.length) return;

      // Collect all unique audioKeys
      var _keys = [];
      _chArr.forEach(function (ch) {
        if (ch && ch.audioKey && _keys.indexOf(ch.audioKey) === -1) _keys.push(ch.audioKey);
      });
      if (!_keys.length) return;

      console.log('[audio-sync] Syncing', _keys.length, 'audio keys to R2...');

      // For each key: get from IndexedDB → if valid (≥1KB) → PUT to R2 (overwrite if needed)
      var _synced = 0;
      var _skipped = 0;
      function _syncNext(idx) {
        if (idx >= _keys.length) {
          console.log('[audio-sync] Done:', _synced, 'synced,', _skipped, 'skipped (no valid local blob)');
          return;
        }
        var key = _keys[idx];
        var _url = '/api/audio/' + encodeURIComponent(String(key));
        window.AudioHubStoryAudio.get(key).then(function (blob) {
          if (!blob || blob.size < 1000) {
            console.warn('[audio-sync] No valid local blob for:', key, '(size:', blob ? blob.size : 0, ')');
            _skipped++;
            _syncNext(idx + 1);
            return;
          }
          console.log('[audio-sync] Uploading to R2:', key, '| size:', blob.size);
          fetch(_url, {
            method: 'PUT',
            headers: { 'Content-Type': blob.type || 'audio/mpeg' },
            body: blob
          }).then(function (putRes) {
            console.log('[audio-sync] PUT response:', putRes.status, '| key:', key);
            if (putRes.ok) _synced++;
            _syncNext(idx + 1);
          }).catch(function (e) {
            console.warn('[audio-sync] PUT failed:', key, e && e.message);
            _syncNext(idx + 1);
          });
        }).catch(function () {
          console.warn('[audio-sync] IndexedDB get failed:', key);
          _syncNext(idx + 1);
        });
      }
      _syncNext(0);
    } catch (e) {
      console.warn('[audio-sync] Error:', e);
    }
  }

  function bindStoryAudio(story) {
    var audioNode = document.querySelector('[data-story-audio]');
    var noteNode = document.querySelector('[data-story-audio-note]');
    if (!audioNode) return;

    var _callerAudioKey = story && (story.audioKey || story.audio_key) ? String(story.audioKey || story.audio_key) : '';

    function showNote(message) {
      if (!noteNode) return;
      noteNode.textContent = message;
      noteNode.classList.remove('is-hidden');
    }

    // Increment generation — any in-flight loads from previous chapters become stale
    var myGen = ++_audioLoadGen;

    // Save prev audio URL but DON'T revoke yet — only revoke after new audio loads
    var prevAudio = audioUrlByNode.get(audioNode) || null;

    audioNode.classList.add('is-hidden');
    audioNode.removeAttribute('src');
    audioNode.load();
    if (noteNode) {
      noteNode.textContent = '';
      noteNode.classList.add('is-hidden');
    }

    var audioKey = story && (story.audioKey || story.audio_key) ? String(story.audioKey || story.audio_key) : '';
    var storyId = story && story.id ? String(story.id) : '';
    console.log('[audio-debug] story:', { id: storyId, audioKey: audioKey, title: story && story.title });
    if (!audioKey && !storyId) {
      showNote('Chưa có file audio cho truyện này.');
      return;
    }

    // Build list of paths to try — CURRENT CHAPTER FIRST (not all chapters!)
    var paths = [];
    // Determine current chapter index from DOM (active chapter)
    var _currentChIdx = 0;
    try {
      var _activeCh = document.querySelector('.chapter-item.is-active, .chapter-item.active');
      if (_activeCh) _currentChIdx = parseInt(_activeCh.getAttribute('data-chapter-index'), 10) || 0;
    } catch (e) {}

    // Try current chapter's audioKey FIRST (most likely to be correct)
    var _currentChAudioKey = '';
    try {
      var _chStore = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
      var _chArr = Array.isArray(_chStore[storyId]) ? _chStore[storyId] : [];
      if (_chArr[_currentChIdx] && _chArr[_currentChIdx].audioKey) {
        _currentChAudioKey = _chArr[_currentChIdx].audioKey;
      }
    } catch (e) {}

    // Priority: current chapter audioKey > story audioKey > storyId fallback
    if (_currentChAudioKey) paths.push(_currentChAudioKey);
    if (audioKey && paths.indexOf(audioKey) === -1) paths.push(audioKey);
    if (storyId) {
      var storyIdMp3 = storyId + '.mp3';
      if (paths.indexOf(storyIdMp3) === -1) paths.push(storyIdMp3);
    }
    if (storyId && !String(storyId).startsWith('s_')) {
      var syntheticMp3 = 's_' + storyId + '.mp3';
      if (paths.indexOf(syntheticMp3) === -1) paths.push(syntheticMp3);
    }
    console.log('[audio-debug] paths:', paths, '| currentChIdx:', _currentChIdx);

    var RENDER_BACKEND_BASE = '/api/v1';

    function fetchWithTimeout(url, timeoutMs) {
      var controller = new AbortController();
      var timer = setTimeout(function () { controller.abort(); }, timeoutMs);
      return fetch(url, { signal: controller.signal })
        .then(function (res) {
          clearTimeout(timer);
          return res.ok ? res.blob() : Promise.reject(null);
        })
        .catch(function (err) {
          clearTimeout(timer);
          return Promise.reject(null);
        });
    }

    function fetchFromR2(key) {
      if (!key) return Promise.reject(null);
      // Cloudflare R2 API — same domain, never sleeps
      // Cache-bust to avoid stale CDN cache (old 22-byte files)
      var url = '/api/audio/' + encodeURIComponent(String(key)) + '?v=' + encodeURIComponent('' + Math.floor(Date.now() / 86400000));
      console.log('[audio-debug] trying R2:', url);
      return fetchWithTimeout(url, 5000);
    }

    function fetchFromBackend(key) {
      if (!key) return Promise.reject(null);
      var url = RENDER_BACKEND_BASE + '/media/audio/' + encodeURIComponent(String(key));
      console.log('[audio-debug] trying Render:', url);
      return fetchWithTimeout(url, 15000); // 15s timeout per attempt
    }

    function tryLocalKeys() {
      // Try AudioHubStoryAudio.get() FIRST — fast, local IndexedDB + Supabase Storage fallback
      if (!window.AudioHubStoryAudio || typeof window.AudioHubStoryAudio.get !== 'function') {
        return Promise.resolve(null);
      }
      // Try each path via AudioHubStoryAudio (checks IndexedDB then Supabase Storage)
      var localIdx = 0;
      function tryNextLocal() {
        if (localIdx >= paths.length) return Promise.resolve(null);
        var key = paths[localIdx++];
        console.log('[audio-debug] trying AudioHubStoryAudio.get:', key);
        return window.AudioHubStoryAudio.get(key).then(function (blob) {
          if (blob && blob.size >= 1000) {
            console.log('[audio-debug] AudioHubStoryAudio OK:', key, blob.size);
            return blob;
          }
          if (blob) console.log('[audio-debug] AudioHubStoryAudio too small:', key, blob.size, '— skipping');
          return tryNextLocal();
        }).catch(function () {
          return tryNextLocal();
        });
      }
      return tryNextLocal();
    }

    function tryRemotePaths(idx) {
      if (idx >= paths.length) return Promise.resolve(null);
      var path = paths[idx];
      console.log('[audio-debug] tryRemotePaths[' + idx + ']:', path);

      // Try Cloudflare R2 first (same domain, fast, never sleeps)
      return fetchFromR2(path).catch(function (e) { console.log('[audio-debug] R2 failed:', path, e); return null; })
      .then(function (blob) {
        if (blob) { console.log('[audio-debug] R2 OK:', path, blob.size); return blob; }
        // Try Render backend (may be sleeping)
        return fetchFromBackend(path).catch(function (e) { console.log('[audio-debug] Render failed:', path, e); return null; });
      }).then(function (blob) {
        if (blob) { console.log('[audio-debug] Render OK:', path, blob.size); return blob; }
        return tryRemotePaths(idx + 1);
      });
    }

    // Loading chain: local (IndexedDB/Supabase) → remote (R2/Render) → retry
    var maxRetries = 4;
    var retryDelays = [0, 10000, 20000, 40000];
    var retryMessages = [
      'Đang tải audio…',
      'Đang chờ server khởi động… (lần 2)',
      'Đang chờ server khởi động… (lần 3)',
      'Đang chờ server khởi động… (lần cuối)'
    ];

    function attemptLoad(retryIdx) {
      // Stale retry — chapter was switched, abort
      if (myGen !== _audioLoadGen) return;
      if (retryIdx >= maxRetries) {
        showNote('Audio chưa có trên server. Hãy mở trang này trên trình duyệt đã upload story.');
        return;
      }
      if (retryIdx > 0) {
        showNote(retryMessages[retryIdx]);
      }
      // Step 1: Try local first (IndexedDB + Supabase Storage) — fast, per-story
      var _loadedFromLocal = false;
      tryLocalKeys().then(function (blob) {
        if (blob) { _loadedFromLocal = true; return blob; }
        // Step 2: Try remote (R2, Render) — slower, may share storage
        return tryRemotePaths(0);
      }).then(function (blob) {
        if (blob) {
          try {
            // Stale load — a newer chapter was requested, discard this result
            if (myGen !== _audioLoadGen) {
              console.log('[audio] Stale load discarded (gen', myGen, '≠', _audioLoadGen, ')');
              return;
            }
            var audioUrl = URL.createObjectURL(blob);
            // Now revoke old audio (new one is ready)
            if (prevAudio) {
              try { URL.revokeObjectURL(prevAudio); } catch (e) {}
            }
            audioUrlByNode.set(audioNode, audioUrl);
            audioNode.src = audioUrl;
            audioNode.classList.remove('is-hidden');
            showNote('');
            // Auto-play audio (user already clicked story = interaction)
            var playPromise = audioNode.play();
            if (playPromise) {
              playPromise.catch(function () {
                // Browser blocked auto-play — highlight play button
                var pb = document.querySelector('[data-player-toggle]');
                if (pb) { pb.classList.add('pulse-play'); }
              });
            }
            // BACKGROUND: If loaded from local (IndexedDB), always PUT to R2 (overwrites corrupt files)
            if (_loadedFromLocal && blob.size >= 1000) {
              var _url0 = '/api/audio/' + encodeURIComponent(String(paths[0]));
              console.log('[audio-sync] Quick upload current chapter:', paths[0], '| size:', blob.size);
              fetch(_url0, { method: 'PUT', headers: { 'Content-Type': blob.type || 'audio/mpeg' }, body: blob })
                .then(function (r) { console.log('[audio-sync] PUT:', r.status); })
                .catch(function () {});
            }
          } catch (error) {
            showNote('Không thể tải file audio đã lưu.');
          }
        } else {
          setTimeout(function () { attemptLoad(retryIdx + 1); }, retryDelays[retryIdx + 1] || 10000);
        }
      }).catch(function () {
        setTimeout(function () { attemptLoad(retryIdx + 1); }, retryDelays[retryIdx + 1] || 10000);
      });
    }

    attemptLoad(0);
  }

  function overrideChapterList(context, currentStory) {
    var chapterList = document.querySelector('.chapter-list');
    if (!chapterList) return null;

    // ── If context is null, build from localStorage by finding playlist that contains this story ──
    if (!context) {
      var _storyId = getQueryParam('id');
      var _plId = getQueryParam('playlistId');
      if (_storyId) {
        try {
          var _allPls = safeParse(window.localStorage.getItem('audiohub-playlists-v1') || '[]', []);
          // Helper: normalize playlist entries → items
          function _normalizePl(pl) {
            if (Array.isArray(pl.items) && pl.items.length) return;
            if (Array.isArray(pl.entries) && pl.entries.length) {
              pl.items = pl.entries.map(function (e, i) {
                return {
                  storyId: String(e.key || e.storyId || ''),
                  storyTitle: String(e.title || e.storyTitle || ''),
                  chapterTitle: String(e.chapterTitle || ''),
                  label: (function() { var _t = e.chapterTitle || e.storyTitle || e.title || ''; return _t ? ('Chương ' + (i + 1) + ': ' + _t) : ('Chương ' + (i + 1)); })(),
                  index: i
                };
              });
            }
          }
          // Helper: build context from playlist
          function _buildCtx(pl) {
            _normalizePl(pl);
            var ents = pl.items || [];
            var chapters = [];
            for (var i = 0; i < ents.length; i++) {
              var e = ents[i];
              chapters.push({
                label: e.label || (e.storyTitle || e.title ? ('Chương ' + (i + 1) + ': ' + (e.storyTitle || e.title)) : ('Chương ' + (i + 1))),
                storyId: String(e.storyId || e.key || ''),
                storyTitle: String(e.storyTitle || e.title || ''),
                index: typeof e.index === 'number' ? e.index : i
              });
            }
            var activeIdx = 0;
            for (var j = 0; j < chapters.length; j++) {
              if (String(chapters[j].storyId) === String(_storyId)) { activeIdx = j; break; }
            }
            return { chapters: chapters, activeIndex: activeIdx, chapterLabel: chapters[activeIdx] ? chapters[activeIdx].label : 'Chương 1', playlist: { items: ents } };
          }
          // 1. Try by playlistId first — but only if story is actually in it
          if (_plId) {
            for (var i = 0; i < _allPls.length; i++) {
              if (_allPls[i] && String(_allPls[i].id || '') === String(_plId)) {
                var _testCtx = _buildCtx(_allPls[i]);
                // Verify story is actually in this playlist
                var _found = false;
                for (var _fc = 0; _fc < _testCtx.chapters.length; _fc++) {
                  if (String(_testCtx.chapters[_fc].storyId) === String(_storyId)) { _found = true; break; }
                }
                if (_found) {
                  context = _testCtx;
                }
                break;
              }
            }
          }
          // 2. If a playlistId was explicitly provided, allow searching playlists for context.
          //    Do NOT auto-select a playlist just because it contains this story — that causes the
          //    detail page to show a partial playlist view and hide story chapters.
          if (!context && _plId) {
            for (var k = 0; k < _allPls.length; k++) {
              _normalizePl(_allPls[k]);
              var items = _allPls[k].items || [];
              for (var m = 0; m < items.length; m++) {
                if (String(items[m].storyId || '') === String(_storyId)) {
                  context = _buildCtx(_allPls[k]);
                  break;
                }
              }
              if (context) break;
            }
          }
          // Do not fallback to searching by title. Only explicit playlistId should set playlist context.
        } catch (e) {}
      }
    }

    var chapterCountNode = document.querySelector('.detail-sidebar .section-heading span');
    var chapterHeading = document.querySelector('.detail-sidebar .section-heading h2');
    var chapterSection = chapterList.closest('.detail-sidebar__section') || chapterList.parentElement;

    // ── Ensure chapter sections visible (playlist mode) ──
    if (context) {
      var _mobCh = document.querySelector('.mobile-chapter-list');
      var _deskCh = chapterList.closest('.sidebar-panel');
      if (_mobCh) _mobCh.style.display = '';
      if (_deskCh) _deskCh.style.display = '';
    }

    // ── Login status ──
    var loggedIn = isMember();

    // ── Chapter data ──
    // Playlist mode: show playlist items (stories); normal mode: show story chapters
    var playlistItemsForDisplay = null;
    if (context && context.playlist && Array.isArray(context.playlist.items) && context.playlist.items.length) {
      playlistItemsForDisplay = context.playlist.items;
    } else if (context && Array.isArray(context.chapters) && context.chapters.length) {
      playlistItemsForDisplay = context.chapters;
    }

    var storyChapters = Array.isArray(currentStory && currentStory.chapters) ? currentStory.chapters : [];
    var storedChapters = [];
    if (currentStory && currentStory.id) {
      try {
        var _chStore = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
        storedChapters = Array.isArray(_chStore[String(currentStory.id)]) ? _chStore[String(currentStory.id)] : [];
        console.log('[story-detail] 📖 READ audiohub-chapters-v1 — storyId:', currentStory.id, '| storedChapters:', storedChapters.length, '| titles:', storedChapters.map(function(c) { return c && c.title; }));
        console.log('[story-detail]   currentStory.chapters:', storyChapters.length, '| titles:', storyChapters.map(function(c) { return c && c.title; }));
        console.log('[story-detail]   all keys in store:', Object.keys(_chStore));
      } catch (e) { storedChapters = []; }
    }

    // If local stored chapters are more complete than a playlist view, prefer the story's chapters
    try {
      if (playlistItemsForDisplay && storedChapters.length > (playlistItemsForDisplay.length || 0)) {
        console.log('[story-detail] overrideChapterList: storedChapters (' + storedChapters.length + ') longer than playlist (' + (playlistItemsForDisplay.length || 0) + '), ignoring playlist and preferring story chapters');
        // Nullify playlistItemsForDisplay so normal chapter rendering is used
        playlistItemsForDisplay = null;
      }
    } catch (e) {}

    // ALWAYS prefer storedChapters (audiohub-chapters-v1) — it's the authoritative chapter store
    if (storedChapters.length) {
      storyChapters = storedChapters;
    }

    // Debug: show decision summary
    try {
      console.log('[story-detail] overrideChapterList: decision: playlistItemsForDisplay=', !!playlistItemsForDisplay, 'playlistLen=', playlistItemsForDisplay ? playlistItemsForDisplay.length : 0, 'storyChaptersLen=', storyChapters.length, 'storedChaptersLen=', storedChapters.length);
    } catch (e) {}

    var total = playlistItemsForDisplay ? playlistItemsForDisplay.length : (storyChapters.length || Number(currentStory && currentStory.chapterCount) || 0);
    // Fallback: count from audiohub-chapters-v1 localStorage when metadata underrates chapter count
    if (!total && storedChapters.length) {
      total = storedChapters.length;
    }
    // If still 0, count from readingText chapter headers
    if (!total && currentStory && currentStory.readingText) {
      var chapterMatches = String(currentStory.readingText).match(/^(?:#*\s*)?(?:Chương|Chuong|Chapter|第.+)章/gim);
      if (chapterMatches) total = chapterMatches.length;
    }
    // If still 0 but has readingText → 1 chapter (the whole text is one chapter)
    if (!total && currentStory && currentStory.readingText && String(currentStory.readingText).trim().length > 10) {
      total = 1;
    }
    // If still 0 but has no readingText but story exists → still show 1 placeholder
    if (!total && currentStory && currentStory.id) {
      total = 1;
    }
    var storyTitle = currentStory && currentStory.title ? String(currentStory.title) : '';
    var chapterTitleFallback = currentStory && currentStory.chapterTitle ? String(currentStory.chapterTitle) : '';

    // Parse chapter titles from readingText
    var chapterTitlesFromText = [];
    if (currentStory && currentStory.readingText) {
      var lines = String(currentStory.readingText).split(/\r?\n/);
      lines.forEach(function (line) {
        var trimmed = line.trim();
        var m = trimmed.match(/^(?:#*\s*)?(?:Chương|Chuong|Chapter|CHƯƠNG|CHƯONG|CHAPTER)\s+(\d+)\s*[:\-–—:]\s*(.+)/i);
        if (m) {
          chapterTitlesFromText[Number(m[1]) - 1] = m[2].trim();
        }
      });
    }

    // Use chapterTitle field as fallback for chapter 1
    if (currentStory && currentStory.chapterTitle && !chapterTitlesFromText[0]) {
      chapterTitlesFromText[0] = String(currentStory.chapterTitle).trim();
    }

    // If no chapters data, try audiohub-chapters-v1 first
    if (!storyChapters.length && currentStory && currentStory.id) {
      try {
        var _chStore2 = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
        var _chArr2 = Array.isArray(_chStore2[String(currentStory.id)]) ? _chStore2[String(currentStory.id)] : [];
        _chArr2.forEach(function (ch, ci) {
          storyChapters.push({ chapterNumber: ci + 1, title: ch.title || ch.chapterTitle || '' });
        });
      } catch (e) {}
    }
    // If still no chapters data, auto-generate from total
    if (!storyChapters.length && total > 0) {
      for (var ci = 0; ci < total; ci++) {
        var autoTitle = chapterTitlesFromText[ci] || (total === 1 ? (storyTitle || 'Nội dung truyện') : '');
        storyChapters.push({ chapterNumber: ci + 1, title: autoTitle });
      }
    } else if (storyChapters.length) {
      // Fill in missing titles from parsed text
      for (var ti = 0; ti < storyChapters.length; ti++) {
        if (!storyChapters[ti].title && chapterTitlesFromText[ti]) {
          storyChapters[ti].title = chapterTitlesFromText[ti];
        }
      }
    }

    // ── Active chapter index ──
    var activeChapterIndex = 0;
    if (playlistItemsForDisplay && context && typeof context.chapterIndex === 'number') {
      // Playlist mode: use chapterIndex from context (position in playlist)
      activeChapterIndex = Math.max(0, Math.min(total - 1, context.chapterIndex));
    } else {
      var currentChapterLabel = context && context.chapterLabel ? String(context.chapterLabel) : '';
      if (currentChapterLabel) {
        var match = currentChapterLabel.match(/(\d+)/);
        if (match) activeChapterIndex = Math.max(0, Math.min(total - 1, Number(match[1]) - 1));
      }
    }

    // ── Build chapter rows ──
    // Store chapter-specific data for click handler (readingText too long for data attributes)
    window.__chapterReadingTexts = {};
    var chapterRows = [];
    for (var i = 0; i < total; i++) {
      var chapterNum = i + 1;
      var displayName = '';
      var isActive = i === activeChapterIndex;

      // Get chapter title from story data
      var ch = storyChapters[i] || {};
      var chapterTitle = ch.title || '';
      if (!chapterTitle && chapterTitlesFromText[i]) {
        chapterTitle = chapterTitlesFromText[i];
      }
      // In playlist mode, also check playlist entry's chapterTitle
      if (!chapterTitle && playlistItemsForDisplay && playlistItemsForDisplay[i]) {
        chapterTitle = playlistItemsForDisplay[i].chapterTitle || playlistItemsForDisplay[i].storyTitle || '';
      }
      if (i === 0) {
        console.log('[story-detail] 📖 Chapter', chapterNum, '— ch.title:', ch.title, '| chapterTitle:', chapterTitle, '| ch.readingText:', ch.readingText ? ch.readingText.slice(0, 50) : 'NONE');
      }

      if (playlistItemsForDisplay) {
        // Playlist mode: "Chương X: chapterTitle" (use story's chapter data)
        displayName = chapterTitle
          ? ('Chương ' + chapterNum + ': ' + chapterTitle)
          : ('Chương ' + chapterNum);
      } else {
        // Normal mode: "Chương X: title" or "Chương X"
        displayName = chapterTitle
          ? ('Chương ' + chapterNum + ': ' + chapterTitle)
          : ('Chương ' + chapterNum);
      }

      // ── Lock state ──
      var isLocked = false;
      if (!playlistItemsForDisplay && storyChapters.length > 0 && storyChapters[i] && storyChapters[i].id) {
        var playable = storyChapters[i].isFree || storyChapters[i].isUnlocked;
        isLocked = !playable;
      }

      // ── Dot content ──
      var dotContent = isActive
        ? '<i class="fa-solid fa-play" style="font-size:10px;color:#fff;"></i>'
        : '<span class="chapter-num">' + chapterNum + '</span>';

      // ── Now-playing indicator ──
      var nowPlayingTag = isActive ? '<span class="chapter-now-playing"><i class="fa-solid fa-volume-high"></i> Đang phát</span>' : '';

      // ── Lock hint ──
      var lockHint = '';
      var lockIcon = '';
      if (isLocked) {
        lockIcon = '<span class="chapter-lock-icon"><i class="fa-solid fa-lock"></i></span>';
        if (!loggedIn) {
          lockHint = '<span class="chapter-lock-hint"><i class="fa-solid fa-lock"></i> Đăng nhập để xem lịch mở khóa.</span>';
        } else {
          lockHint = '<span class="chapter-lock-hint"><i class="fa-solid fa-lock"></i> Chưa mở khóa</span>';
        }
      }

      // Get chapter-specific audioKey and readingText from storedChapters
      var chAudioKey = (storedChapters[i] && storedChapters[i].audioKey) || (ch && ch.audioKey) || '';
      var chReadingText = (storedChapters[i] && storedChapters[i].readingText) || (ch && ch.readingText) || '';
      if (i < 5) console.log('[story-detail] Chapter', i + 1, 'audioKey:', chAudioKey || '(empty)', '| title:', ch.title || chapterTitle);
      // Store full reading text in JS for click handler
      if (chReadingText) window.__chapterReadingTexts[i] = chReadingText;
      if (i < 5) console.log('[story-detail] Chapter', i + 1, 'readingText:', chReadingText ? chReadingText.substring(0, 60) + '...' : '(empty)');

      chapterRows.push(
        '<a href="#chapter-reading" class="chapter-item' + (isActive ? ' active is-active' : '') + (isLocked ? ' is-locked' : '') + '" data-player-chapter="' + escapeHtml(displayName) + '" data-chapter-index="' + i + '" data-audio-key="' + escapeHtml(chAudioKey) + '">'
        + '<span class="chapter-dot">' + dotContent + '</span>'
        + '<div class="chapter-item-body">'
        + '<span class="chapter-item-text">' + escapeHtml(displayName) + '</span>'
        + nowPlayingTag
        + lockHint
        + '</div>'
        + lockIcon
        + '</a>'
      );
    }

    // Render to ALL .chapter-list elements (mobile + desktop sidebar)
    var allChapterLists = document.querySelectorAll('.chapter-list');
    for (var _cli = 0; _cli < allChapterLists.length; _cli++) {
      allChapterLists[_cli].innerHTML = chapterRows.join('');
    }
    var countLabel = playlistItemsForDisplay ? 'truyện' : 'chương';
    var playlistName = (context && context.playlist && context.playlist.name) || '';
    var headingText = playlistItemsForDisplay ? (playlistName || 'Danh sách phát') : 'Danh sách chương';
    var allHeadings = document.querySelectorAll('.detail-sidebar .section-heading h2, .mobile-card .mobile-card__heading h2');
    for (var _hi = 0; _hi < allHeadings.length; _hi++) {
      if (allHeadings[_hi].textContent.indexOf('Danh sách') >= 0) allHeadings[_hi].innerHTML = '<i class="fa-solid fa-music"></i> ' + headingText;
    }
    var allCounts = document.querySelectorAll('.detail-sidebar .section-heading span, .mobile-card .mobile-card__heading span');
    for (var _ci2 = 0; _ci2 < allCounts.length; _ci2++) {
      allCounts[_ci2].textContent = total + ' ' + countLabel;
    }

    // Hide chapter section if no chapters
    if (total === 0 && chapterSection) {
      chapterSection.style.display = 'none';
    }

    // Scroll to active item
    setTimeout(function () {
      var activeItem = chapterList.querySelector('.chapter-item.is-active');
      if (activeItem) activeItem.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 100);

    // ── Always show chapter list (no longer hidden without playlist) ──
    if (!context) {
      // Show mobile chapter section
      var _mobileCh = document.querySelector('.mobile-chapter-list');
      if (_mobileCh) _mobileCh.style.display = '';
      // Show desktop chapter sections
      document.querySelectorAll('.chapter-list').forEach(function(cl) {
        var parent = cl.closest('section') || cl.closest('.sidebar-panel') || cl.parentElement;
        if (parent) parent.style.display = '';
      });
      return null;
    }

    // For playlist mode, return override state
    if (context && context.playlist && Array.isArray(context.playlist.items)) {
      var chapters = context.playlist.items.map(function (item, index) {
        var _chTitle = (item && (item.chapterTitle || item.storyTitle)) || '';
        return {
          label: _chTitle ? ('Chương ' + (index + 1) + ': ' + _chTitle) : ('Chương ' + (index + 1)),
          storyId: item && item.storyId ? String(item.storyId) : '',
          storyTitle: item && item.storyTitle ? String(item.storyTitle) : '',
          index: typeof item.chapterIndex === 'number' ? item.chapterIndex : index
        };
      });
      var playlistActiveIndex = chapters.findIndex(function (ch) { return String(ch.storyId) === String(context.storyId); });
      if (playlistActiveIndex < 0) playlistActiveIndex = context.chapterIndex;
      if (playlistActiveIndex < 0 || playlistActiveIndex >= chapters.length) playlistActiveIndex = 0;
      return { chapters: chapters, activeIndex: playlistActiveIndex, chapterLabel: chapters[playlistActiveIndex] ? chapters[playlistActiveIndex].label : 'Chương 1' };
    }

    // Non-playlist mode: return chapters from story data so init code can use them
    if (total > 0 && storyChapters.length) {
      var _chapters = storyChapters.map(function (ch, idx) {
        return {
          label: ch.title ? ('Chương ' + (idx + 1) + ': ' + ch.title) : ('Chương ' + (idx + 1)),
          storyId: storyId || '',
          storyTitle: ch.title || '',
          index: idx
        };
      });
      return { chapters: _chapters, activeIndex: 0, chapterLabel: _chapters[0] ? _chapters[0].label : 'Chương 1' };
    }

    return null;
  }

  function isLoggedIn() {
    try {
      var raw = window.localStorage.getItem('audiohub-auth-profile');
      if (!raw) return false;
      var profile = JSON.parse(raw);
      return !!(profile && profile.isLoggedIn);
    } catch (error) {
      return false;
    }
  }

  function initCommentAccess() {
    var guestNode = document.querySelector('[data-comment-guest]');
    var formNode = document.querySelector('[data-comment-form]');
    var statusNode = document.querySelector('[data-comment-status]');
    var textNode = document.querySelector('[data-comment-text]');
    var listNode = document.querySelector('[data-comment-list]');
    var headingNode = document.querySelector('.comments-panel .section-heading h2');
    if (!guestNode || !formNode || !listNode) return;

    var storyId = String(getQueryParam('id') || '').trim() || 'default';
    var commentsKey = 'audiohub-comments-v2:' + storyId;

    function formatDateTime(iso) {
      var date = new Date(String(iso || ''));
      if (isNaN(date.getTime())) return '';
      var day = String(date.getDate()).padStart(2, '0');
      var month = String(date.getMonth() + 1).padStart(2, '0');
      var year = date.getFullYear();
      var hour = String(date.getHours()).padStart(2, '0');
      var minute = String(date.getMinutes()).padStart(2, '0');
      return day + '/' + month + '/' + year + ' lúc ' + hour + ':' + minute;
    }

    function getCurrentUserName() {
      var name = 'Bạn';
      try {
        var raw = window.localStorage.getItem('audiohub-auth-profile');
        var profile = raw ? JSON.parse(raw) : null;
        if (profile && profile.name) name = String(profile.name);
      } catch (error) {}
      return name;
    }

    function toInitials(name) {
      return String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (part) {
        return part.charAt(0).toUpperCase();
      }).join('') || 'B';
    }

    function readSavedComments() {
      try {
        var raw = window.localStorage.getItem(commentsKey);
        var parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        return [];
      }
    }

    function writeSavedComments(items) {
      try {
        window.localStorage.setItem(commentsKey, JSON.stringify(items || []));
      } catch (error) {}
    }

    function flattenCount(items) {
      return (items || []).reduce(function (sum, item) {
        var replies = Array.isArray(item.replies) ? item.replies.length : 0;
        return sum + 1 + replies;
      }, 0);
    }

    function updateCommentCount(items) {
      if (!headingNode) return;
      var count = flattenCount(items);
      headingNode.innerHTML = '<i class="fa-regular fa-comments"></i> Bình Luận &amp; Đánh Giá (' + count + ')';
    }

    function makeActionBar(commentId, isOwner, likeCount, liked) {
      var editDelete = isOwner
        ? '<button type="button" class="comment-action" data-comment-edit="' + escapeHtml(commentId) + '">Sửa</button>'
          + '<button type="button" class="comment-action" data-comment-delete="' + escapeHtml(commentId) + '">Xóa</button>'
        : '';
      return '<div class="comment-actions">'
        + '<button type="button" class="comment-action" data-comment-like="' + escapeHtml(commentId) + '">' + (liked ? 'Bỏ thích' : 'Thích') + ' (' + Number(likeCount || 0) + ')</button>'
        + '<button type="button" class="comment-action" data-comment-reply="' + escapeHtml(commentId) + '">Phản hồi</button>'
        + editDelete
        + '</div>'
        + '<div class="comment-inline-form is-hidden" data-comment-inline-form="' + escapeHtml(commentId) + '">'
        + '<textarea class="comment-inline-input" data-comment-inline-input="' + escapeHtml(commentId) + '" rows="2" placeholder="Nhập phản hồi..."></textarea>'
        + '<div class="comment-inline-actions">'
        + '<button type="button" class="comment-action" data-comment-inline-save="' + escapeHtml(commentId) + '">Lưu</button>'
        + '<button type="button" class="comment-action" data-comment-inline-cancel="' + escapeHtml(commentId) + '">Hủy</button>'
        + '</div></div>';
    }

    function makeRepliesToggle(commentId, replyCount, expanded) {
      if (!replyCount) return '';
      return '<button type="button" class="comment-replies-toggle" data-comment-toggle-replies="' + escapeHtml(commentId) + '">' + (expanded ? 'Ẩn phản hồi' : ('Xem ' + replyCount + ' phản hồi')) + '</button>';
    }

    function renderComments() {
      var loggedIn = isLoggedIn();
      var currentUser = getCurrentUserName();
      var comments = readSavedComments();

      if (!comments.length) {
        updateCommentCount(comments);
        return;
      }

      comments.slice().reverse().forEach(function (entry) {
        var item = document.createElement('div');
        item.className = 'comment-item';
        item.setAttribute('data-comment-id', String(entry.id || ''));

        var isOwner = String(entry.author || '') === currentUser;
        var replies = Array.isArray(entry.replies) ? entry.replies : [];
        var expanded = entry.repliesExpanded !== false;
        item.innerHTML = '<div class="comment-avatar">' + escapeHtml(entry.initials || 'B') + '</div>'
          + '<div class="comment-body">'
          + '<div class="comment-bubble"><div class="comment-head"><strong>' + escapeHtml(entry.author || 'Bạn') + '</strong><span>'
          + escapeHtml(entry.displayTime || formatDateTime(entry.createdAt))
          + '</span></div><p>' + escapeHtml(entry.text || '') + '</p></div>'
          + makeActionBar(String(entry.id || ''), isOwner && loggedIn, Number(entry.likeCount || 0), Array.isArray(entry.likedBy) && entry.likedBy.indexOf(currentUser) >= 0)
          + makeRepliesToggle(String(entry.id || ''), replies.length, expanded)
          + '<div class="comment-replies ' + (expanded ? '' : 'is-hidden') + '" data-replies-root="' + escapeHtml(String(entry.id || '')) + '">'
          + replies.map(function (reply) {
              var replyOwner = String(reply.author || '') === currentUser;
              return '<div class="comment-reply" data-comment-id="' + escapeHtml(String(reply.id || '')) + '">'
                + '<div class="comment-reply-avatar">'+ escapeHtml(reply.initials || 'B') +'</div>'
                + '<div class="comment-reply-main"><div class="comment-bubble">'
                + '<div class="comment-head"><strong>' + escapeHtml(String(reply.author || 'Bạn')) + ' &gt; ' + escapeHtml(String(reply.replyTo || entry.author || 'Bạn')) + '</strong><span>' + escapeHtml(formatDateTime(reply.createdAt)) + '</span></div>'
                + '<p>' + escapeHtml(reply.text || '') + '</p></div>'
                + makeActionBar(String(reply.id || ''), replyOwner && loggedIn, Number(reply.likeCount || 0), Array.isArray(reply.likedBy) && reply.likedBy.indexOf(currentUser) >= 0)
                + '</div></div>';
            }).join('')
          + '</div></div>';
        listNode.insertBefore(item, listNode.firstChild);
      });

      updateCommentCount(comments);
    }

    function rerender() {
      listNode.innerHTML = '';
      renderComments();
    }

    function upsertReply(comments, parentId, payload) {
      return comments.map(function (comment) {
        if (String(comment.id) === String(parentId)) {
          var replies = Array.isArray(comment.replies) ? comment.replies.slice() : [];
          replies.push(payload);
          comment.replies = replies;
        }
        return comment;
      });
    }

    function migrateStaticCommentsToStorage() {
      var saved = readSavedComments();
      if (saved.length) return;

      var existingNodes = Array.prototype.slice.call(listNode.querySelectorAll('.comment-item'));
      if (!existingNodes.length) return;

      var migrated = [];
      existingNodes.forEach(function (node, index) {
        var nameNode = node.querySelector('.comment-head strong');
        var timeNode = node.querySelector('.comment-head span');
        var textNodeLocal = node.querySelector('.comment-body p');
        var author = String(nameNode ? nameNode.textContent : '').trim() || 'Bạn';
        var text = String(textNodeLocal ? textNodeLocal.textContent : '').trim();
        if (!text) return;
        var createdAt = new Date(Date.now() - ((existingNodes.length - index) * 60000)).toISOString();
        migrated.push({
          id: 'c_mg_' + Date.now().toString(36) + '_' + index,
          author: author,
          initials: toInitials(author),
          text: text,
          createdAt: createdAt,
          displayTime: String(timeNode ? timeNode.textContent : '').trim(),
          likeCount: 0,
          likedBy: [],
          replies: []
        });
      });

      if (migrated.length) {
        writeSavedComments(migrated);
      }
    }

    migrateStaticCommentsToStorage();
    rerender();

    var loggedIn = isLoggedIn();
    guestNode.classList.toggle('is-hidden', loggedIn);
    formNode.classList.toggle('is-hidden', !loggedIn);

    if (!loggedIn) {
      if (textNode) textNode.setAttribute('disabled', 'disabled');
    } else {
      if (textNode) textNode.removeAttribute('disabled');
    }

    formNode.addEventListener('submit', function (event) {
      event.preventDefault();
      if (!isLoggedIn()) return;
      var value = textNode ? String(textNode.value || '').trim() : '';
      if (!value) {
        if (statusNode) statusNode.textContent = 'Nhập bình luận để gửi demo.';
        return;
      }

      var author = getCurrentUserName();
      var comments = readSavedComments();
      comments.push({
        id: 'c_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        author: author,
        initials: toInitials(author),
        text: value,
        createdAt: new Date().toISOString(),
        likeCount: 0,
        likedBy: [],
        replies: []
      });
      writeSavedComments(comments.slice(-100));
      rerender();

      if (statusNode) {
        statusNode.textContent = 'Đã gửi bình luận demo.';
        statusNode.classList.add('is-success');
      }
      if (textNode) textNode.value = '';
    });

    var inlineModeById = {};

    listNode.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      if (!isLoggedIn()) return;

      var currentUser = getCurrentUserName();
      var comments = readSavedComments();

      var toggleRepliesBtn = target.closest('[data-comment-toggle-replies]');
      if (toggleRepliesBtn) {
        var toggleId = String(toggleRepliesBtn.getAttribute('data-comment-toggle-replies') || '');
        comments = comments.map(function (comment) {
          if (String(comment.id) === toggleId) {
            comment.repliesExpanded = comment.repliesExpanded === false ? true : false;
          }
          return comment;
        });
        writeSavedComments(comments);
        rerender();
        return;
      }

      var likeBtn = target.closest('[data-comment-like]');
      if (likeBtn) {
        var likeId = String(likeBtn.getAttribute('data-comment-like') || '');
        comments = comments.map(function (comment) {
          if (String(comment.id) === likeId) {
            var likedBy = Array.isArray(comment.likedBy) ? comment.likedBy.slice() : [];
            var idx = likedBy.indexOf(currentUser);
            if (idx >= 0) likedBy.splice(idx, 1); else likedBy.push(currentUser);
            comment.likedBy = likedBy;
            comment.likeCount = likedBy.length;
          }
          comment.replies = (comment.replies || []).map(function (reply) {
            if (String(reply.id) === likeId) {
              var rb = Array.isArray(reply.likedBy) ? reply.likedBy.slice() : [];
              var ri = rb.indexOf(currentUser);
              if (ri >= 0) rb.splice(ri, 1); else rb.push(currentUser);
              reply.likedBy = rb;
              reply.likeCount = rb.length;
            }
            return reply;
          });
          return comment;
        });
        writeSavedComments(comments);
        rerender();
        return;
      }

      var deleteBtn = target.closest('[data-comment-delete]');
      if (deleteBtn) {
        var delId = String(deleteBtn.getAttribute('data-comment-delete') || '');
        comments = comments.filter(function (comment) {
          if (String(comment.id) === delId && String(comment.author || '') === currentUser) return false;
          comment.replies = (comment.replies || []).filter(function (reply) {
            return !(String(reply.id) === delId && String(reply.author || '') === currentUser);
          });
          return true;
        });
        writeSavedComments(comments);
        rerender();
        return;
      }

      function hideAllInlineForms() {
        listNode.querySelectorAll('[data-comment-inline-form]').forEach(function (node) {
          node.classList.add('is-hidden');
        });
      }

      function openInlineForm(id, value, mode) {
        hideAllInlineForms();
        var form = listNode.querySelector('[data-comment-inline-form="' + id + '"]');
        var input = listNode.querySelector('[data-comment-inline-input="' + id + '"]');
        if (!form || !input) return;
        inlineModeById[id] = mode || 'reply';
        form.classList.remove('is-hidden');
        input.value = value || '';
        input.focus();
      }

      var editBtn = target.closest('[data-comment-edit]');
      if (editBtn) {
        var editId = String(editBtn.getAttribute('data-comment-edit') || '');
        var oldText = '';
        comments.forEach(function (comment) {
          if (String(comment.id) === editId) oldText = String(comment.text || '');
          (comment.replies || []).forEach(function (reply) {
            if (String(reply.id) === editId) oldText = String(reply.text || '');
          });
        });
        openInlineForm(editId, oldText, 'edit');
        return;
      }

      var replyBtn = target.closest('[data-comment-reply]');
      if (replyBtn) {
        var parentId = String(replyBtn.getAttribute('data-comment-reply') || '');
        openInlineForm(parentId, '', 'reply');
        return;
      }

      var cancelBtn = target.closest('[data-comment-inline-cancel]');
      if (cancelBtn) {
        hideAllInlineForms();
        return;
      }

      var saveBtn = target.closest('[data-comment-inline-save]');
      if (saveBtn) {
        var actionId = String(saveBtn.getAttribute('data-comment-inline-save') || '');
        var inlineInput = listNode.querySelector('[data-comment-inline-input="' + actionId + '"]');
        var nextText = String(inlineInput && inlineInput.value || '').trim();
        if (!nextText) return;

        var mode = inlineModeById[actionId] || 'reply';

        if (mode === 'edit') {
          comments = comments.map(function (comment) {
            if (String(comment.id) === actionId && String(comment.author || '') === currentUser) {
              comment.text = nextText;
            }
            comment.replies = (comment.replies || []).map(function (reply) {
              if (String(reply.id) === actionId && String(reply.author || '') === currentUser) {
                reply.text = nextText;
              }
              return reply;
            });
            return comment;
          });
        } else {
          var replyPayload = {
            id: 'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            author: getCurrentUserName(),
            initials: toInitials(getCurrentUserName()),
            replyTo: '',
            text: nextText,
            createdAt: new Date().toISOString(),
            likeCount: 0,
            likedBy: []
          };

          comments.forEach(function (comment) {
            if (String(comment.id) === actionId) {
              replyPayload.replyTo = String(comment.author || '');
            }
            (comment.replies || []).forEach(function (reply) {
              if (String(reply.id) === actionId) {
                replyPayload.replyTo = String(reply.author || '');
              }
            });
          });
          if (!replyPayload.replyTo) {
            replyPayload.replyTo = 'Người dùng';
          };

          var matchedTopLevel = comments.some(function (comment) { return String(comment.id) === actionId; });
          if (matchedTopLevel) {
            comments = upsertReply(comments, actionId, replyPayload);
          } else {
            comments = comments.map(function (comment) {
              var hasReply = (comment.replies || []).some(function (reply) { return String(reply.id) === actionId; });
              if (hasReply) {
                var replies = Array.isArray(comment.replies) ? comment.replies.slice() : [];
                replies.push(replyPayload);
                comment.replies = replies;
              }
              return comment;
            });
          }
        }

        delete inlineModeById[actionId];
        writeSavedComments(comments);
        rerender();
      }
    });
  }

  /* ═══ SINGLE INITIALIZATION PATH ═══════════════════════════════════════
     1. Resolve storyId from URL
     2. Try localStorage (instant cache)
     3. If miss → fetch GET /stories/public/:id
     4. Render story data + bind player — exactly once
     ═══════════════════════════════════════════════════════════════════════ */

  function resolveStoryId() {
    var storyId = getQueryParam('id');
    if (storyId) storyId = String(storyId).trim();
    ensureStoryContext();
    storyId = String(getQueryParam('id') || storyId || '').trim();
    if (!storyId) {
      var detailNode = document.querySelector('[data-detail-story]');
      storyId = String(detailNode && detailNode.getAttribute('data-story-id') || '').trim();
    }
    if (!storyId && window.AudioHubStories && typeof window.AudioHubStories.getById === 'function') {
      var preResolved = ensureStoryContext();
      storyId = String(preResolved && preResolved.id || '').trim();
    }
    if (!storyId) {
      var queryTitle = getQueryParam('title');
      if (queryTitle && window.AudioHubStories && typeof window.AudioHubStories.read === 'function') {
        var titleNeedle = normalizeLookup(queryTitle);
        var matchedByTitle = (window.AudioHubStories.read() || []).find(function (item) {
          return normalizeLookup(item && item.title) === titleNeedle;
        }) || null;
        if (matchedByTitle && matchedByTitle.id) {
          storyId = String(matchedByTitle.id);
          var params = new URLSearchParams(window.location.search || '');
          params.set('id', storyId);
          window.history.replaceState({}, '', window.location.pathname + '?' + params.toString());
        }
      }
    }
    return storyId || '';
  }

  // Module-scope flags for audio tracking
  var _mergeRendering = false;
  var currentPlayingAudioKey = '';
  var _userSelectedChapter = false;

  function bindStoryData(story) {
    if (!story || !story.id) return;
    trackStoryListen(story.id);
    var detailStoryNode = document.querySelector('[data-detail-story]');

    // Update title + breadcrumb (initStoryDetailFromStore may have used stale cache)
    var titleNode = detailStoryNode ? detailStoryNode.querySelector('.detail-title') : null;
    if (titleNode && story.title) titleNode.textContent = story.title;
    if (story.title) document.title = story.title + ' | AudioHub';
    if (detailStoryNode) {
      detailStoryNode.setAttribute('data-title', String(story.title || ''));
      detailStoryNode.setAttribute('data-story-id', String(story.id || ''));
      detailStoryNode.setAttribute('data-author', String(story.author || ''));
      detailStoryNode.setAttribute('data-genre', String(story.genre || ''));
    }
    var audioSubtitle = document.querySelector('.audio-headings p');
    if (audioSubtitle && story.title) audioSubtitle.textContent = story.title;

    // Breadcrumb
    var crumb = document.querySelector('.breadcrumb');
    if (crumb) {
      var genrePart = story.genre ? '<a href="new-posts.html?genre=' + encodeURIComponent(story.genre) + '">' + escapeHtml(story.genre) + '</a> <span>/</span> ' : '';
      crumb.innerHTML = '<a href="index.html">Home</a> <span>/</span> ' + genrePart + '<a href="new-posts.html">' + escapeHtml(story.title || 'Chi tiết truyện') + '</a>';
    }

    // Player story title
    var playerStoryTitle = document.querySelector('[data-player-story-title]');
    if (playerStoryTitle && story.title) playerStoryTitle.textContent = story.title;

    // Description
    var descNode = document.querySelector('[data-detail-description]');
    if (descNode && story.description) {
      descNode.innerHTML = '<p>' + escapeHtml(story.description).replace(/\n/g, '</p><p>') + '</p>';
    }

    // Author
    var authorNode = detailStoryNode ? detailStoryNode.querySelector('[data-detail-author]') : null;
    if (authorNode) {
      var authorName = story.author || 'Ẩn danh';
      authorNode.innerHTML = '<i class="fa-regular fa-user"></i> ' + escapeHtml(authorName);
    }

    // Mobile info
    var mobileAuthor = document.querySelector('[data-mobile-author]');
    if (mobileAuthor) {
      mobileAuthor.href = 'channel.html?author=' + encodeURIComponent(story.author || '');
      mobileAuthor.querySelector('strong').textContent = story.author || 'Ẩn danh';
    }
    var mobileGenre = document.querySelector('[data-mobile-genre]');
    if (mobileGenre) {
      mobileGenre.href = 'new-posts.html?genre=' + encodeURIComponent(story.genre || '');
      mobileGenre.querySelector('strong').textContent = story.genre || 'Khác';
    }
    var mobileListens = document.querySelector('[data-mobile-listens] strong');
    if (mobileListens) mobileListens.textContent = (story.listenCount || 0) + ' lượt nghe';

    // Reading text — render to chapter-copy div (needed when story comes from API via mergeAndRender or cache miss)
    var chapterReadingTextN = '';
    try {
      var _csN = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
      var _chN = Array.isArray(_csN[String(story.id)]) ? _csN[String(story.id)] : [];
      if (_chN[0] && _chN[0].readingText) chapterReadingTextN = _chN[0].readingText;
    } catch (e) {}
    var readingContent = chapterReadingTextN || story.readingText || story.reading_text || story.description || '';

    function renderReadingText() {
      var chapterCopy = document.querySelector('[data-chapter-copy]');
      // CRITICAL: If click handler already set chapter text, DON'T overwrite it.
      if (chapterCopy && chapterCopy.innerHTML && window.__lastRenderedReadingText && chapterCopy.innerHTML !== window.__lastRenderedReadingText) {
        return true;
      }
      if (chapterCopy && readingContent) {
        var cleanedText = cleanReadingText(readingContent);
        var blocks = String(cleanedText).split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
        chapterCopy.innerHTML = blocks.length
          ? blocks.map(function (line) { return '<p>' + escapeHtml(line) + '</p>'; }).join('')
          : '';
        window.__lastRenderedReadingText = chapterCopy.innerHTML;
        chapterCopy.style.maxHeight = '60vh';
        chapterCopy.style.overflowY = 'auto';
        chapterCopy.style.scrollBehavior = 'smooth';
        return true;
      }
      return false;
    }

    // Try immediately, retry after DOM settles (SPA timing)
    if (!renderReadingText()) {
      requestAnimationFrame(function () { renderReadingText(); });
      setTimeout(function () { renderReadingText(); }, 100);
    }

    renderStoryMeta(detailStoryNode, story);
    bindStoryCover(story);
    // Skip audio rebind if user already selected a chapter (prevents overwrite)
    if (!_userSelectedChapter) {
      bindStoryAudio(story);
    }
    updateAudioHeadingStoryTitle(story);
    renderSidebarTrending(story);
    fetchMissingCoversFromD1();
    loadCardCoversFromIndexedDB();
  }

  function fetchStoryFromApi(storyId) {
    if (!window.AudioHubApi || typeof window.AudioHubApi.request !== 'function') {
      return Promise.resolve(null);
    }
    // s_ stories may exist in D1 (synced before the id:null fix) — fetch them too
    return window.AudioHubApi.request('/stories/public/' + encodeURIComponent(storyId), { method: 'GET' })
      .then(function (apiStory) {
        console.log('[story-detail] fetchStoryFromApi response:', apiStory ? apiStory.id : 'null', 'reading_text:', apiStory && apiStory.reading_text ? apiStory.reading_text.length + ' chars' : 'EMPTY');
        if (!apiStory || !apiStory.id) return null;
        // Normalize snake_case (D1) to camelCase so downstream code always works
        var normalized = Object.assign({}, apiStory);
        if (normalized.reading_text && !normalized.readingText) normalized.readingText = normalized.reading_text;
        if (normalized.audio_key && !normalized.audioKey) normalized.audioKey = normalized.audio_key;
        if (normalized.chapter_title && !normalized.chapterTitle) normalized.chapterTitle = normalized.chapter_title;
        if (normalized.chapter_count != null && normalized.chapterCount == null) normalized.chapterCount = normalized.chapter_count;
        if (normalized.cover_key && !normalized.coverKey) normalized.coverKey = normalized.cover_key;
        if (normalized.cover_data && !normalized.coverData) normalized.coverData = normalized.cover_data;
        if (normalized.is_completed != null && normalized.isCompleted == null) normalized.isCompleted = normalized.is_completed;
        if (normalized.listen_count != null && normalized.listenCount == null) normalized.listenCount = normalized.listen_count;
        // Cache in localStorage (additive — never overwrites)
        if (window.AudioHubStories && typeof window.AudioHubStories.upsert === 'function') {
          window.AudioHubStories.upsert(normalized);
        }
        return normalized;
      })
      .catch(function () { return null; });
  }

  function fetchStoryFromSupabase(storyId) {
    if (!storyId) return Promise.resolve(null);
    // Use D1 API (Cloudflare Pages Functions) — Supabase REST proxy not available
    if (window.AudioHubApi && typeof window.AudioHubApi.request === 'function') {
      return window.AudioHubApi.request('/stories/' + encodeURIComponent(storyId), { method: 'GET' })
        .then(function (story) {
          if (!story || !story.id) return null;
          // Normalize snake_case to camelCase
          var normalized = Object.assign({}, story);
          if (normalized.reading_text && !normalized.readingText) normalized.readingText = normalized.reading_text;
          if (normalized.audio_key && !normalized.audioKey) normalized.audioKey = normalized.audio_key;
          if (normalized.chapter_title && !normalized.chapterTitle) normalized.chapterTitle = normalized.chapter_title;
          if (normalized.chapter_count != null && normalized.chapterCount == null) normalized.chapterCount = normalized.chapter_count;
          if (normalized.cover_key && !normalized.coverKey) normalized.coverKey = normalized.cover_key;
          if (normalized.cover_data && !normalized.coverData) normalized.coverData = normalized.cover_data;
          if (normalized.is_completed != null && normalized.isCompleted == null) normalized.isCompleted = normalized.is_completed;
          if (normalized.listen_count != null && normalized.listenCount == null) normalized.listenCount = normalized.listen_count;
          if (window.AudioHubStories && typeof window.AudioHubStories.upsert === 'function') {
            window.AudioHubStories.upsert(normalized);
          }
          return normalized;
        })
        .catch(function () { return null; });
    }
    // Fallback: Supabase REST (may not be available)
    if (window.AudioHubSupabase && typeof window.AudioHubSupabase.fetchStoryById === 'function') {
      if (String(storyId).startsWith('s_')) return Promise.resolve(null);
      return window.AudioHubSupabase.fetchStoryById(storyId)
        .then(function (story) {
          if (!story || !story.id) return null;
          var normalized = Object.assign({}, story);
          if (normalized.reading_text && !normalized.readingText) normalized.readingText = normalized.reading_text;
          if (normalized.audio_key && !normalized.audioKey) normalized.audioKey = normalized.audio_key;
          if (normalized.chapter_title && !normalized.chapterTitle) normalized.chapterTitle = normalized.chapter_title;
          if (normalized.chapter_count != null && normalized.chapterCount == null) normalized.chapterCount = normalized.chapter_count;
          if (normalized.cover_key && !normalized.coverKey) normalized.coverKey = normalized.cover_key;
          if (normalized.cover_data && !normalized.coverData) normalized.coverData = normalized.cover_data;
          if (normalized.is_completed != null && normalized.isCompleted == null) normalized.isCompleted = normalized.is_completed;
          if (normalized.listen_count != null && normalized.listenCount == null) normalized.listenCount = normalized.listen_count;
          if (window.AudioHubStories && typeof window.AudioHubStories.upsert === 'function') {
            window.AudioHubStories.upsert(normalized);
          }
          return normalized;
        })
        .catch(function () { return null; });
    }
    return Promise.resolve(null);
  }

  function initPlayer() {
    var storyId = resolveStoryId();

    // STEP 1: Try localStorage (instant)
    var story = initStoryDetailFromStore(storyId);
    // Initialize module-scope tracker with story's audio key
    currentPlayingAudioKey = story && (story.audioKey || story.audio_key) ? String(story.audioKey || story.audio_key) : '';
    // Fix corrupted story.audioKey: rebuild from chapter 1's data-audio-key
    if (story && story.id && currentPlayingAudioKey) {
      try {
        var _chs = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
        var _chArr = Array.isArray(_chs[String(story.id)]) ? _chs[String(story.id)] : [];
        if (_chArr.length > 0 && _chArr[0].audioKey && _chArr[0].audioKey !== currentPlayingAudioKey) {
          console.log('[story-detail] Fixing corrupted audioKey:', currentPlayingAudioKey, '->', _chArr[0].audioKey);
          story.audioKey = _chArr[0].audioKey;
          currentPlayingAudioKey = _chArr[0].audioKey;
          if (window.AudioHubStories && typeof window.AudioHubStories.upsert === 'function') {
            window.AudioHubStories.upsert(story);
          }
        }
      } catch (e) {}
    }
    console.log('[story-detail] initStoryDetailFromStore:', story ? story.id : 'null', 'readingText:', story && story.readingText ? story.readingText.length + ' chars' : 'NONE', 'audioKey:', story && story.audioKey ? 'YES' : 'NONE');

    if (story && story.id) {
      // Cache hit — render immediately
      bindStoryData(story);
      // Render chapter list IMMEDIATELY so data-audio-key attributes exist for click handler
      try {
        var _initCtx = resolvePlaylistContext(storyId || '');
        overrideChapterList(_initCtx, story);
      } catch (e) {}

      // Always fetch from API in background to get full data (readingText, audioKey, etc.)
      // that may have been stripped from localStorage or never saved
      var hasChapters = Array.isArray(story.chapters) && story.chapters.length > 0;
      var needsApiFetch = !story.readingText || !story.audioKey || !hasChapters || !story.chapterCount;
      // Also fetch if chapters array exists but is empty (missing chapter data from DB)
      if (!needsApiFetch && story.chapters && story.chapters.length === 0) needsApiFetch = true;
      if (needsApiFetch) {
        // Helper: merge API data into local story and re-render
        function mergeAndRender(apiStory) {
          if (!apiStory || !apiStory.id) return;
          var merged = Object.assign({}, story);
          var apiReadingText = apiStory.readingText || apiStory.reading_text || '';
          var apiAudioKey = apiStory.audioKey || apiStory.audio_key || '';
          // D1 returns chapters as JSON string — parse it
          var apiChapters = apiStory.chapters || [];
          if (typeof apiChapters === 'string') {
            try { apiChapters = JSON.parse(apiChapters); } catch (e) { apiChapters = []; }
          }
          var apiChapterCount = apiStory.chapterCount || apiStory.chapter_count || 0;
          console.log('[story-detail] mergeAndRender apiStory:', apiStory.id, 'readingText:', apiReadingText ? apiReadingText.length + ' chars' : 'EMPTY', 'audioKey:', apiAudioKey || 'EMPTY', 'chapters:', Array.isArray(apiChapters) ? apiChapters.length : apiChapters);
          if (apiReadingText) merged.readingText = apiReadingText;
          if (apiAudioKey) merged.audioKey = apiAudioKey;
          if (Array.isArray(apiChapters) && apiChapters.length) {
            // FIX: Never overwrite local chapters with fewer API chapters
            var _localChCount = Array.isArray(merged.chapters) ? merged.chapters.length : 0;
            if (apiChapters.length >= _localChCount) {
              merged.chapters = apiChapters;
            } else {
              console.log('[story-detail] ⚠ Skipping API chapters (' + apiChapters.length + ') — local has more (' + _localChCount + ')');
            }
          }
          if (apiChapterCount) merged.chapterCount = apiChapterCount;
          _mergeRendering = true;
          bindStoryData(merged);
          _mergeRendering = false;
          // Re-render chapter list with fresh data
          try {
            var _ctx = resolvePlaylistContext(merged.id || '');
            overrideChapterList(_ctx, merged);
          } catch (e) {}
          // Also update localStorage so next load is instant
          // Do NOT overwrite story.audioKey — API may return chapter-level key
          // which corrupts localStorage and makes all chapters play same audio.
          if (window.AudioHubStories && typeof window.AudioHubStories.upsert === 'function') {
            var _savedAudioKey = merged.audioKey;
            delete merged.audioKey;
            window.AudioHubStories.upsert(merged);
            merged.audioKey = _savedAudioKey;
          }
        }

        // Try 1: Find CUID in localStorage
        var apiId = '';
        if (window.AudioHubStories && typeof window.AudioHubStories.read === 'function') {
          var allStories = window.AudioHubStories.read() || [];
          var storyTitle = normalizeLookup(story.title);
          var cloudStory = allStories.find(function (s) {
            return s && s.id && !String(s.id).startsWith('s_') && normalizeLookup(s.title) === storyTitle;
          }) || null;
          apiId = cloudStory ? String(cloudStory.id) : '';
        }

        if (apiId) {
          // Found CUID in localStorage — fetch directly
          fetchStoryFromApi(apiId).then(mergeAndRender).catch(function () {});
        } else if (storyId && !isSyntheticStoryId(storyId)) {
          // FIX: No CUID found in localStorage, but storyId is a real CUID —
          // fetch directly from API (getStoryById ignores visibility, works for any story)
          fetchStoryFromApi(storyId).then(mergeAndRender).catch(function () {});
        }

        // DELAYED RE-FETCH: Pick up async PATCH results from upload page
        // The upload page does PATCH to D1 then immediately redirects.
        // D1 may not have the latest data when this page first loads.
        // Re-fetch after 4s to get the updated chapter count.
        if (apiId) {
          setTimeout(function () {
            console.log('[story-detail] 🔄 Delayed re-fetch for fresh chapter data:', apiId);
            fetchStoryFromApi(apiId).then(function (freshStory) {
              if (!freshStory || !freshStory.id) return;
              var freshChapters = freshStory.chapters || [];
              if (typeof freshChapters === 'string') {
                try { freshChapters = JSON.parse(freshChapters); } catch (e) { freshChapters = []; }
              }
              var currentChCount = Array.isArray(story.chapters) ? story.chapters.length : 0;
              console.log('[story-detail] Delayed re-fetch: API has', freshChapters.length, 'chapters, current:', currentChCount);
              if (freshChapters.length > currentChCount) {
                console.log('[story-detail] ✅ Updating chapters from', currentChCount, '→', freshChapters.length);
                mergeAndRender(freshStory);
              }
              // Also sync to localStorage so future loads are correct
              if (freshChapters.length >= currentChCount && window.AudioHubStories && typeof window.AudioHubStories.upsert === 'function') {
                try {
                  var _syncStory = Object.assign({}, story, { chapters: freshChapters, chapterCount: freshChapters.length });
                  delete _syncStory.audioKey;
                  window.AudioHubStories.upsert(_syncStory);
                } catch (e) {}
              }
            }).catch(function () {});
          }, 4000);
        }

        // Try 2: Fetch all public stories from API to find by title (always try, even if Try 1 found a CUID — for robustness)
        if (!apiId || !story.readingText) {
          console.log('[story-detail] Try 2: fetching public stories, apiId:', apiId, 'story.readingText:', !!story.readingText);
          var fetchPublic = (window.AudioHubCloudflare && typeof window.AudioHubCloudflare.fetchPublicStories === 'function')
            ? window.AudioHubCloudflare.fetchPublicStories({ limit: 50 })
            : (window.AudioHubApi && typeof window.AudioHubApi.request === 'function'
              ? window.AudioHubApi.request('/stories/public', { method: 'GET' })
              : Promise.resolve([]));
          fetchPublic.then(function (stories) {
            if (!stories || !stories.length) return;
            var needle = normalizeLookup(story.title);
            console.log('[story-detail] Try 2: found', stories.length, 'stories, needle:', needle);
            var match = stories.find(function (s) {
              return s && s.id && normalizeLookup(s.title) === needle;
            });
            console.log('[story-detail] Try 2: match:', match ? match.id : 'NONE');
            if (match && match.id) {
              return fetchStoryFromApi(String(match.id));
            }
            return null;
          }).then(function (apiStory) {
            if (apiStory && apiStory.id) {
              mergeAndRender(apiStory);
            }
          }).catch(function () {});
        }
      }
    } else if (storyId) {
      // Cache miss — fetch from API (works for both s_* and CUID stories)
      console.log('[story-detail] Cache miss for storyId:', storyId);
      function handleCacheMissStory(apiStory) {
        if (!apiStory || !apiStory.id) return;
        // D1 returns chapters as JSON string — parse it
        if (typeof apiStory.chapters === 'string') {
          try { apiStory.chapters = JSON.parse(apiStory.chapters); } catch (e) { apiStory.chapters = []; }
        }
        if (!apiStory.chapterCount && apiStory.chapter_count) apiStory.chapterCount = apiStory.chapter_count;
        console.log('[story-detail] Cache miss: bindStoryData', apiStory.id, 'desc:', apiStory.description ? apiStory.description.length + ' chars' : 'NONE', 'reading:', apiStory.readingText || apiStory.reading_text ? 'YES' : 'NO');
        _mergeRendering = true;
        bindStoryData(apiStory);
        _mergeRendering = false;
        // Re-render chapter list with fresh API data (same as mergeAndRender)
        try {
          var _ctx = resolvePlaylistContext(apiStory.id || '');
          overrideChapterList(_ctx, apiStory);
        } catch (e) {}
      }

      // Try to resolve story title from multiple sources for title-matching
      function getStoryTitle() {
        var title = getQueryParam('title') || '';
        if (title) return title;
        // Try DOM
        var titleNode = document.querySelector('.detail-title');
        if (titleNode && titleNode.textContent.trim()) return titleNode.textContent.trim();
        // Try sessionStorage home context
        try {
          var ctx = JSON.parse(window.sessionStorage.getItem('audiohub-home-detail-context') || 'null');
          if (ctx && ctx.title) return ctx.title;
        } catch (e) {}
        // Try localStorage stories — find by s_ ID
        if (window.AudioHubStories && typeof window.AudioHubStories.read === 'function') {
          var allStories = window.AudioHubStories.read() || [];
          var match = allStories.find(function (s) { return s && s.id === storyId; });
          if (match && match.title) return match.title;
        }
        return '';
      }

      if (!isSyntheticStoryId(storyId)) {
        // CUID — try Supabase first (faster), then fall back to Cloudflare API
        if (window.AudioHubSupabase && window.AudioHubSupabase.isAvailable()) {
          fetchStoryFromSupabase(storyId).then(function (apiStory) {
            if (apiStory && apiStory.id) {
              handleCacheMissStory(apiStory);
            } else {
              fetchStoryFromApi(storyId).then(handleCacheMissStory).catch(function () {});
            }
          });
          return;
        }
      }

      // s_* stories or Supabase miss — fetch from Cloudflare API
      // For s_* IDs, also try title-matching from public stories list
      fetchStoryFromApi(storyId).then(function (apiStory) {
        if (apiStory && apiStory.id) {
          handleCacheMissStory(apiStory);
        } else if (isSyntheticStoryId(storyId)) {
          // s_* story not found by ID in D1 — try finding by title from public stories
          console.log('[story-detail] Cache miss: s_* not found by ID, trying title match');
          var fetchPublic = (window.AudioHubApi && typeof window.AudioHubApi.request === 'function')
            ? window.AudioHubApi.request('/stories/public', { method: 'GET' })
            : Promise.resolve([]);
          fetchPublic.then(function (stories) {
            if (!stories || !stories.length) return null;
            var storyTitle = getStoryTitle();
            console.log('[story-detail] Cache miss: title for matching:', storyTitle || '(empty)');
            if (!storyTitle) return null;
            var needle = normalizeLookup(storyTitle);
            var match = stories.find(function (s) { return s && s.id && normalizeLookup(s.title) === needle; });
            console.log('[story-detail] Cache miss: title match:', match ? match.id : 'NONE');
            if (match && match.id) return fetchStoryFromApi(String(match.id));
            return null;
          }).then(function (apiStory) {
            if (apiStory && apiStory.id) handleCacheMissStory(apiStory);
          }).catch(function () {});
        }
      }).catch(function () {});
    }

    // STEP 2.5: If audioKey is IndexedDB key (a_*), re-upload to Supabase Storage + Render backend
    if (storyId && !isSyntheticStoryId(storyId)) {
      var _sRe = initStoryDetailFromStore(storyId);
      if (_sRe && _sRe.audioKey && String(_sRe.audioKey).indexOf('a_') === 0) {
        var STORAGE_URL_CHK = '/supabase/storage/v1/object/public/story-audio/';
        var BACKEND_URL_CHK = '/api/v1/media/audio/' + encodeURIComponent(storyId);
        // Check if audio already exists on Supabase OR backend
        Promise.all([
          fetch(STORAGE_URL_CHK + encodeURIComponent(storyId + '.mp3')).then(function (r) { return r.ok; }).catch(function () { return false; }),
          fetch(BACKEND_URL_CHK).then(function (r) { return r.ok; }).catch(function () { return false; })
        ]).then(function (results) {
          if (results[0] || results[1]) return; // Audio already available somewhere
          if (!window.AudioHubStoryAudio || typeof window.AudioHubStoryAudio.get !== 'function') return;
          return window.AudioHubStoryAudio.get(_sRe.audioKey).then(function (blob) {
            if (!blob) return;
            return window.AudioHubStoryAudio.put(blob, storyId).then(function (newKey) {
              if (newKey && newKey !== _sRe.audioKey) {
                _sRe.audioKey = newKey;
                if (window.AudioHubStories && typeof window.AudioHubStories.upsert === 'function') {
                  window.AudioHubStories.upsert(_sRe);
                }
              }
            });
          });
        })
        .catch(function () {});
      }
    }

    // STEP 3: Direct audio fallback — try loading audio from Render backend
    // even when story data isn't available (e.g., incognito, backend down)
    if (storyId && !isSyntheticStoryId(storyId)) {
      setTimeout(function () {
        var audioNode = document.querySelector('[data-story-audio]');
        var noteNode = document.querySelector('[data-story-audio-note]');
        if (!audioNode || !audioNode.classList.contains('is-hidden')) return;
        if (noteNode && noteNode.textContent.indexOf('Audio chưa có') === -1 && noteNode.textContent.indexOf('Chưa có file') === -1) return;

        var RENDER_BACKEND_BASE = '/api/v1';

        function tryBackendWithTimeout(retryIdx) {
          if (retryIdx >= 3) return;
          var controller = new AbortController();
          var timer = setTimeout(function () { controller.abort(); }, 15000);
          var backendUrl = RENDER_BACKEND_BASE + '/media/audio/' + encodeURIComponent(storyId);
          fetch(backendUrl, { signal: controller.signal })
            .then(function (res) {
              clearTimeout(timer);
              return res.ok ? res.blob() : Promise.reject(null);
            })
            .then(function (blob) {
              if (!blob || !blob.size) return Promise.reject(null);
              try {
                var url = URL.createObjectURL(blob);
                audioNode.src = url;
                audioNode.classList.remove('is-hidden');
                if (noteNode) { noteNode.textContent = ''; noteNode.classList.add('is-hidden'); }
                audioNode.play().catch(function () {});
              } catch (e) {}
            })
            .catch(function () {
              clearTimeout(timer);
              setTimeout(function () { tryBackendWithTimeout(retryIdx + 1); }, 10000);
            });
        }
        tryBackendWithTimeout(0);
      }, 2000);
    }

    var playButton = document.querySelector('[data-player-toggle]');
    var playIcon = playButton ? playButton.querySelector('i') : null;
    var nativeAudio = document.querySelector('[data-story-audio]');
    var stateNode = document.querySelector('[data-player-state]');
    var progressFill = document.querySelector('[data-player-progress-fill]');
    var progressText = document.querySelector('[data-player-progress-text]');
    var progressThumb = document.querySelector('.sd-progress__thumb');
    var chapterLabelNode = document.querySelector('[data-player-current-chapter]');
    var nextTitleNode = document.querySelector('.sd-nextup__title');
    var nextMetaNode = document.querySelector('.sd-nextup__meta');
    var speedNodes = Array.prototype.slice.call(document.querySelectorAll('[data-player-speed]'));
    var speedLabel = document.querySelector('[data-player-speed-value]');
    var speedValue = document.querySelector('[data-player-speed-value]');
    var volumeSlider = document.querySelector('[data-player-volume-slider]');
    var volumeValue = document.querySelector('[data-player-volume-value]');
    var settingsToggle = document.querySelector('[data-player-settings-toggle]');
    var settingsMenu = document.querySelector('[data-player-settings-menu]');
    var shuffleButton = document.querySelector('[data-player-shuffle]');
    var prevChapterButton = document.querySelector('[data-player-prev-chapter]');
    var seekBackButton = document.querySelector('[data-player-seek-back]');
    var seekForwardButton = document.querySelector('[data-player-seek-forward]');
    var nextChapterButton = document.querySelector('[data-player-next-chapter]');
    var repeatButton = document.querySelector('[data-player-repeat]');
    var chapterCopyNode = document.querySelector('[data-chapter-copy]');
    var readingThemeButtons = Array.prototype.slice.call(document.querySelectorAll('[data-reading-theme]'));
    var readingFontSlider = document.querySelector('[data-reading-font-slider]');
    var readingFontValue = document.querySelector('[data-reading-font-value]');
    var readingFontStepButtons = Array.prototype.slice.call(document.querySelectorAll('[data-reading-font-step]'));
    var readingLineButtons = Array.prototype.slice.call(document.querySelectorAll('[data-reading-line]'));
    var readingAutoscrollButton = document.querySelector('[data-reading-autoscroll]');
    var readingAutoscrollMenu = document.querySelector('[data-reading-autoscroll-menu]');
    var readingAutoscrollSpeedButtons = Array.prototype.slice.call(document.querySelectorAll('[data-reading-autoscroll-speed]'));
    var readingFullscreenButton = document.querySelector('[data-reading-fullscreen]');

    var readingAutoScrollActive = false;
    var readingAutoScrollSpeed = 1;
    var readingAutoScrollRaf = 0;
    var readingAutoScrollLastTime = 0;
    var readingAutoScrollPxPerSecond = 60;

    function stopReadingAutoScroll() {
      readingAutoScrollActive = false;
      if (readingAutoScrollRaf) {
        window.cancelAnimationFrame(readingAutoScrollRaf);
        readingAutoScrollRaf = 0;
      }
      readingAutoScrollLastTime = 0;
      if (readingAutoscrollButton) readingAutoscrollButton.classList.remove('is-active');
    }

    var _autoScrollRemainder = 0;
    function runReadingAutoScroll(timestamp) {
      if (!readingAutoScrollActive || !chapterCopyNode) {
        readingAutoScrollRaf = 0;
        return;
      }
      if (!readingAutoScrollLastTime) readingAutoScrollLastTime = timestamp;
      var delta = (timestamp - readingAutoScrollLastTime) / 1000;
      readingAutoScrollLastTime = timestamp;
      var speed = readingAutoScrollPxPerSecond * readingAutoScrollSpeed;
      var distance = speed * delta + _autoScrollRemainder;
      var px = Math.floor(distance);
      _autoScrollRemainder = distance - px;
      if (px >= 1) {
        chapterCopyNode.scrollBy({ top: px, behavior: 'smooth' });
      }
      if (chapterCopyNode.scrollTop + chapterCopyNode.clientHeight >= chapterCopyNode.scrollHeight - 1) {
        _autoScrollRemainder = 0;
        stopReadingAutoScroll();
        return;
      }
      readingAutoScrollRaf = window.requestAnimationFrame(runReadingAutoScroll);
    }

    function startReadingAutoScroll() {
      if (!chapterCopyNode || readingAutoScrollActive) return;
      readingAutoScrollActive = true;
      readingAutoScrollLastTime = 0;
      _autoScrollRemainder = 0;
      if (readingAutoscrollButton) readingAutoscrollButton.classList.add('is-active');
      readingAutoScrollRaf = window.requestAnimationFrame(runReadingAutoScroll);
    }

    function toggleReadingAutoScroll() {
      if (readingAutoScrollActive) {
        stopReadingAutoScroll();
        return;
      }
      startReadingAutoScroll();
    }

    function applyReadingFont(px) {
      if (!chapterCopyNode) return;
      var safePx = Math.max(14, Math.min(28, Number(px) || 18));
      chapterCopyNode.style.fontSize = safePx + 'px';
      Array.prototype.slice.call(chapterCopyNode.querySelectorAll('*')).forEach(function (node) {
        node.style.fontSize = safePx + 'px';
      });
      if (readingFontSlider) readingFontSlider.value = String(safePx);
      if (readingFontValue) readingFontValue.textContent = safePx + 'px';
    }

    function applyReadingLine(heightValue) {
      if (!chapterCopyNode) return;
      var safeLine = String(heightValue || '1.8');
      chapterCopyNode.style.lineHeight = safeLine;
      Array.prototype.slice.call(chapterCopyNode.querySelectorAll('*')).forEach(function (node) {
        node.style.lineHeight = safeLine;
      });
      readingLineButtons.forEach(function (button) {
        button.classList.toggle('is-active', String(button.getAttribute('data-reading-line')) === safeLine);
      });
    }

    function applyReadingTheme(raw) {
      if (!chapterCopyNode || !raw) return;
      var parts = String(raw).split(',');
      var bg = parts[0] || '#0f172a';
      var fg = parts[1] || '#e5e7eb';
      chapterCopyNode.style.background = bg;
      chapterCopyNode.style.color = fg;
      chapterCopyNode.style.padding = '16px';
      chapterCopyNode.style.borderRadius = '12px';
      Array.prototype.slice.call(chapterCopyNode.querySelectorAll('*')).forEach(function (node) {
        node.style.color = fg;
      });
      readingThemeButtons.forEach(function (button) {
        button.classList.toggle('is-active', button.getAttribute('data-reading-theme') === raw);
      });
    }

    function toggleReadingFullscreen() {
      if (!chapterCopyNode) return;
      var root = chapterCopyNode.closest('.chapter-reading');
      if (!root) return;
      root.classList.toggle('is-fullscreen-reading');
      if (readingFullscreenButton) {
        var active = root.classList.contains('is-fullscreen-reading');
        readingFullscreenButton.classList.toggle('is-active', active);
      }
    }

    function setReadingAutoScrollSpeed(multiplier) {
      var speed = Number(multiplier);
      if (isNaN(speed) || speed < 1) speed = 1;
      readingAutoScrollSpeed = speed;
      _autoScrollRemainder = 0;
      readingAutoscrollSpeedButtons.forEach(function (button) {
        button.classList.toggle('is-active', Number(button.getAttribute('data-reading-autoscroll-speed')) === speed);
      });
    }

    readingThemeButtons.forEach(function (button) {
      var value = button.getAttribute('data-reading-theme') || '';
      var parts = value.split(',');
      button.style.background = parts[0] || '#0f172a';
      button.addEventListener('click', function () { applyReadingTheme(value); });
    });

    if (readingFontSlider) {
      readingFontSlider.addEventListener('input', function () {
        applyReadingFont(Number(readingFontSlider.value) || 18);
      });
    }

    readingFontStepButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        var delta = Number(button.getAttribute('data-reading-font-step')) || 0;
        var current = readingFontSlider ? Number(readingFontSlider.value) : 18;
        var next = Math.max(14, Math.min(28, current + delta));
        applyReadingFont(next);
      });
    });

    readingLineButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        applyReadingLine(button.getAttribute('data-reading-line') || '1.8');
      });
    });

    if (readingAutoscrollButton) {
      readingAutoscrollButton.addEventListener('click', function () {
        if (readingAutoScrollActive) {
          stopReadingAutoScroll();
          return;
        }
        if (readingAutoscrollMenu) {
          readingAutoscrollMenu.classList.remove('is-hidden');
        }
      });
    }

    var readingAutoscrollHideTimer = null;

    function clearAutoscrollHideTimer() {
      if (!readingAutoscrollHideTimer) return;
      window.clearTimeout(readingAutoscrollHideTimer);
      readingAutoscrollHideTimer = null;
    }

    function showAutoscrollMenu() {
      if (!readingAutoscrollMenu) return;
      clearAutoscrollHideTimer();
      readingAutoscrollMenu.classList.remove('is-hidden');
    }

    function hideAutoscrollMenuDelayed() {
      if (!readingAutoscrollMenu) return;
      clearAutoscrollHideTimer();
      readingAutoscrollHideTimer = window.setTimeout(function () {
        readingAutoscrollMenu.classList.add('is-hidden');
        readingAutoscrollHideTimer = null;
      }, 550);
    }

    if (readingAutoscrollButton && readingAutoscrollMenu) {
      readingAutoscrollButton.addEventListener('mouseenter', showAutoscrollMenu);
      readingAutoscrollButton.addEventListener('focus', showAutoscrollMenu);
      readingAutoscrollButton.addEventListener('mouseleave', hideAutoscrollMenuDelayed);
      readingAutoscrollMenu.addEventListener('mouseenter', showAutoscrollMenu);
      readingAutoscrollMenu.addEventListener('mouseleave', hideAutoscrollMenuDelayed);
    }

    var readingAutoscrollWrap = readingAutoscrollButton ? readingAutoscrollButton.closest('.reading-autoscroll-wrap') : null;
    if (readingAutoscrollWrap && readingAutoscrollMenu) {
      readingAutoscrollWrap.addEventListener('mouseleave', hideAutoscrollMenuDelayed);
    }

    readingAutoscrollSpeedButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        setReadingAutoScrollSpeed(button.getAttribute('data-reading-autoscroll-speed') || '1');
        if (readingAutoscrollMenu) readingAutoscrollMenu.classList.add('is-hidden');
        if (!readingAutoScrollActive) {
          startReadingAutoScroll();
        }
      });
    });


    document.addEventListener('click', function (event) {
      if (!readingAutoscrollMenu || !readingAutoscrollButton) return;
      var target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-reading-autoscroll]') || target.closest('[data-reading-autoscroll-menu]')) return;
      readingAutoscrollMenu.classList.add('is-hidden');
    }, { signal: _signal });

    if (readingAutoscrollMenu) readingAutoscrollMenu.classList.add('is-hidden');
    if (readingFullscreenButton) readingFullscreenButton.addEventListener('click', toggleReadingFullscreen);

    setReadingAutoScrollSpeed(1);
    applyReadingFont(18);
    applyReadingLine('1.8');
    if (readingThemeButtons[0]) applyReadingTheme(readingThemeButtons[0].getAttribute('data-reading-theme') || '#0f172a,#e5e7eb');

    window.addEventListener('beforeunload', function () { stopReadingAutoScroll(); }, { signal: _signal });

    var sleepToggle = document.querySelector('[data-sleep-toggle]');
    var sleepPanel = document.querySelector('[data-sleep-panel]');
    var sleepOptions = Array.prototype.slice.call(document.querySelectorAll('[data-sleep-option]'));
    var sleepCustomInput = document.querySelector('[data-sleep-custom-input]');
    var sleepCustomApply = document.querySelector('[data-sleep-custom-apply]');
    var sleepStatus = document.querySelector('[data-sleep-status]');

    var sleepTimerId = null;
    var sleepDeadline = 0;

    function clearSleepTimer() {
      if (sleepTimerId) {
        window.clearTimeout(sleepTimerId);
        sleepTimerId = null;
      }
      sleepDeadline = 0;
    }

    function setSleepStatusText(text) {
      if (sleepStatus) sleepStatus.textContent = text;
    }

    function scheduleSleep(minutes) {
      var safeMinutes = Number(minutes);
      if (isNaN(safeMinutes) || safeMinutes <= 0) {
        setSleepStatusText('Vui lòng nhập số phút hợp lệ.');
        return;
      }

      clearSleepTimer();
      sleepDeadline = Date.now() + safeMinutes * 60 * 1000;
      setSleepStatusText('Đã hẹn giờ tắt sau ' + safeMinutes + ' phút.');
      sleepTimerId = window.setTimeout(function () {
        if (nativeAudio) {
          nativeAudio.pause();
          nativeAudio.currentTime = 0;
        }
        playerState.playing = false;
        renderPlayer();
        setSleepStatusText('Đã tự tắt audio sau ' + safeMinutes + ' phút.');
        sleepTimerId = null;
        sleepDeadline = 0;
      }, safeMinutes * 60 * 1000);
    }

    function parseMinutesLabel(text) {
      var match = String(text || '').match(/(\d+)/);
      return match ? Number(match[1]) : NaN;
    }

    function attachSleepEvents() {
      if (sleepToggle && sleepPanel) {
        sleepToggle.addEventListener('click', function () {
          var hidden = sleepPanel.classList.toggle('is-hidden');
          sleepToggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
        });
      }

      sleepOptions.forEach(function (button) {
        button.addEventListener('click', function () {
          var label = button.getAttribute('data-sleep-option') || button.textContent || '';
          var minutes = parseMinutesLabel(label);
          scheduleSleep(minutes);
        });
      });

      if (sleepCustomApply) {
        sleepCustomApply.addEventListener('click', function () {
          var minutes = sleepCustomInput ? Number(sleepCustomInput.value) : NaN;
          scheduleSleep(minutes);
        });
      }
    }

    attachSleepEvents();

    if (nativeAudio) {
      nativeAudio.addEventListener('ended', function () {
        clearSleepTimer();
        setSleepStatusText('Audio đã phát xong.');
      });
    }

    window.addEventListener('beforeunload', function () {
      clearSleepTimer();
    }, { signal: _signal });

    var context = resolvePlaylistContext(storyId || '');
    var overrideState = overrideChapterList(context, story);

    // NOTE: Removed ch1 audio retry rebinding — it overwrites user's chapter selection.
    // Chapter audio is now correctly managed via currentPlayingAudioKey tracking.

    // Preload playlist story data from D1 API so getById() works immediately on chapter click
    if (overrideState && Array.isArray(overrideState.chapters) && overrideState.chapters.length > 1) {
      overrideState.chapters.forEach(function (ch) {
        if (!ch.storyId) return;
        // Skip if already in localStorage
        if (window.AudioHubStories && typeof window.AudioHubStories.getById === 'function' && window.AudioHubStories.getById(ch.storyId)) return;
        // Fetch from D1 API in background
        fetchStoryFromSupabase(ch.storyId);
      });
    }
    // Retry chapter list if empty (SPA timing issue)
    if (!overrideState || !overrideState.chapters || !overrideState.chapters.length) {
      var _retryStory = story || (window.AudioHubStories && typeof window.AudioHubStories.getById === 'function' ? window.AudioHubStories.getById(storyId) : null);
      if (_retryStory) {
        setTimeout(function () {
          var chList = document.querySelector('.chapter-list');
          if (chList && !chList.querySelector('.chapter-item')) {
            overrideChapterList(context, _retryStory);
          }
        }, 500);
        setTimeout(function () {
          var chList = document.querySelector('.chapter-list');
          if (chList && !chList.querySelector('.chapter-item')) {
            overrideChapterList(context, _retryStory);
          }
        }, 1500);
      }
    }
    // Re-render chapter list when D1 sync completes (may have new entries)
    window.addEventListener('audiohub-playlists-synced', function () {
      var _freshCtx = resolvePlaylistContext(storyId || '');
      var _freshStory = (window.AudioHubStories && typeof window.AudioHubStories.getById === 'function' ? window.AudioHubStories.getById(storyId) : null) || story;
      if (_freshStory) overrideChapterList(_freshCtx, _freshStory);
    }, { signal: _signal });
    // Helper: get fresh chapter nodes from DOM (survives innerHTML re-renders)
    function getChapterNodes() {
      var all = document.querySelectorAll('[data-chapter-index]');
      if (!all.length) all = document.querySelectorAll('[data-player-chapter]');
      return Array.prototype.slice.call(all);
    }

    var playerState = {
      playing: false,
      progress: 36,
      chapter: 'Chương 1',
      next: 'Hết danh sách chương',
      speed: '1.0x',
      volume: '72%',
      repeat: false,
      shuffle: false
    };

    function currentChapterIndex() {
      // Use data-chapter-index attribute (the actual chapter index) rather than
      // array position, because getChapterNodes() returns items from both
      // mobile and desktop lists (doubled count).
      var nodes = getChapterNodes();
      for (var i = 0; i < nodes.length; i++) {
        if ((nodes[i].getAttribute('data-player-chapter') || '') === playerState.chapter) {
          return Number(nodes[i].getAttribute('data-chapter-index')) || i;
        }
      }
      return -1;
    }

    function setControlActive(button, active) {
      if (!button) return;
      button.classList.toggle('is-active', !!active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }

    function seekAudioBy(seconds) {
      if (!nativeAudio || !nativeAudio.getAttribute('src')) return;
      var duration = Number(nativeAudio.duration);
      var current = Number(nativeAudio.currentTime);
      if (isNaN(current)) current = 0;
      var next = current + Number(seconds || 0);
      if (!isNaN(duration) && duration > 0) {
        next = Math.max(0, Math.min(duration, next));
      } else {
        next = Math.max(0, next);
      }
      nativeAudio.currentTime = next;
    }

    // Count unique chapter indices (mobile+desktop both have data-chapter-index)
    function _countChapters() {
      var _n = getChapterNodes();
      var maxIdx = -1;
      for (var ci = 0; ci < _n.length; ci++) {
        var di = Number(_n[ci].getAttribute('data-chapter-index'));
        if (!isNaN(di) && di > maxIdx) maxIdx = di;
      }
      return maxIdx + 1;
    }

    function playNextChapterAuto() {
      var index = currentChapterIndex();
      var chapterCount = _countChapters();
      if (index < 0 || !chapterCount) return false;
      if (playerState.shuffle && chapterCount > 1) {
        var randomIndex = index;
        while (randomIndex === index) {
          randomIndex = Math.floor(Math.random() * chapterCount);
        }
        playChapterAtIndex(randomIndex);
        return true;
      }
      var nextIndex = index + 1;
      if (nextIndex < chapterCount) {
        playChapterAtIndex(nextIndex);
        return true;
      }
      if (playerState.repeat) {
        playChapterAtIndex(0);
        return true;
      }
      return false;
    }

    function playPrevChapterAuto() {
      var index = currentChapterIndex();
      var chapterCount = _countChapters();
      if (index <= 0) {
        if (playerState.repeat && chapterCount) {
          playChapterAtIndex(chapterCount - 1);
          return;
        }
        if (chapterCount) playChapterAtIndex(0);
        return;
      }
      playChapterAtIndex(index - 1);
    }

    setControlActive(shuffleButton, playerState.shuffle);
    setControlActive(repeatButton, playerState.repeat);

    function getNextChapterText(currentIndex) {
      var _nodes = getChapterNodes();
      if (!_nodes.length) return 'Hết danh sách chương';
      var nextIndex = Number(currentIndex) + 1;
      // Find node by data-chapter-index (not array position, because mobile+desktop are both present)
      var nextNode = null;
      for (var ni = 0; ni < _nodes.length; ni++) {
        if (Number(_nodes[ni].getAttribute('data-chapter-index')) === nextIndex) {
          nextNode = _nodes[ni]; break;
        }
      }
      if (!nextNode) {
        return overrideState ? 'Hết danh sách phát' : 'Hết danh sách chương';
      }
      var nextTextNode = nextNode.querySelector('span:last-child');
      var nextText = nextTextNode ? String(nextTextNode.textContent || '').trim() : '';
      if (nextText) return nextText;
      var nextLabel = String(nextNode.getAttribute('data-player-chapter') || '').trim();
      return nextLabel || (overrideState ? 'Hết danh sách phát' : 'Hết danh sách chương');
    }

    if (overrideState && overrideState.chapterLabel) {
      playerState.chapter = overrideState.chapterLabel;
      playerState.next = getNextChapterText(overrideState.activeIndex);
      if (overrideState.chapters[overrideState.activeIndex]) applyStoryOverviewFromPlaylistItem(overrideState.chapters[overrideState.activeIndex]);
    } else if (getChapterNodes().length) {
      playerState.chapter = getChapterNodes()[0].getAttribute('data-player-chapter') || playerState.chapter;
      playerState.next = getNextChapterText(0);
    }

    function renderPlayer() {
      if (stateNode) {
        var dot = stateNode.querySelector('.sd-badge__dot');
        if (dot) {
          stateNode.innerHTML = '';
          stateNode.appendChild(dot);
          stateNode.appendChild(document.createTextNode(playerState.playing ? ' Đang phát' : ' Tạm dừng'));
        }
        stateNode.classList.toggle('is-paused', !playerState.playing);
      }
      // Query fresh each time — playIcon ref may be stale after DOM swap
      var livePlayIcon = (playButton || document.querySelector('[data-player-toggle]'));
      if (livePlayIcon) {
        var iconEl = livePlayIcon.querySelector('i');
        if (iconEl) iconEl.className = playerState.playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
      }
      if (progressFill) progressFill.style.width = playerState.progress + '%';
      if (progressThumb) progressThumb.style.left = playerState.progress + '%';
      if (progressText) progressText.textContent = 'Tiếp tục từ ' + playerState.progress + '%';
      if (chapterLabelNode) chapterLabelNode.textContent = playerState.chapter;
      if (nextTitleNode) nextTitleNode.textContent = playerState.next;
      if (nextMetaNode) nextMetaNode.textContent = overrideState
        ? 'Tự động từ playlist hiện tại.'
        : 'Tự động từ danh sách chương.';
      if (speedLabel) speedLabel.textContent = playerState.speed;
      if (speedValue) speedValue.textContent = playerState.speed;
      if (volumeValue) volumeValue.textContent = playerState.volume;
      if (volumeSlider) volumeSlider.value = playerState.volume.replace('%', '');
      setActive(speedNodes, playerState.speed, 'data-player-speed');
      setActive(getChapterNodes(), playerState.chapter, 'data-player-chapter');

      // Playing state animation
      var playerRoot = document.querySelector('[data-player-root]');
      if (playerRoot) playerRoot.classList.toggle('is-playing', playerState.playing);
    }

    // Event delegation on ALL .chapter-list containers (survives innerHTML re-renders)
    var _chapterListContainers = document.querySelectorAll('.chapter-list');
    for (var _clc = 0; _clc < _chapterListContainers.length; _clc++) {
      _chapterListContainers[_clc].addEventListener('click', function (event) {
        var link = event.target.closest && event.target.closest('.chapter-item');
        if (!link) return;
        event.preventDefault();

        var index = Number(link.getAttribute('data-chapter-index'));
        if (isNaN(index) || index < 0) return;

        // Stop any currently playing audio immediately
        if (nativeAudio && !nativeAudio.paused) {
          nativeAudio.pause();
          nativeAudio.currentTime = 0;
        }

        var linkedStory = null;
        var linkedStoryId = String(link.getAttribute('data-player-story-id') || '').trim();

        if (!linkedStoryId && overrideState && Array.isArray(overrideState.chapters) && overrideState.chapters[index]) {
          linkedStoryId = String(overrideState.chapters[index].storyId || '').trim();
        }

        if (linkedStoryId && window.AudioHubStories && typeof window.AudioHubStories.getById === 'function') {
          linkedStory = window.AudioHubStories.getById(linkedStoryId);
        }

        var currentStoryId = story && story.id ? String(story.id) : '';
        var isDifferentStory = !!(linkedStoryId && currentStoryId && linkedStoryId !== currentStoryId);

        if (isDifferentStory && !isMember()) {
          showAuthRequiredModal();
          return;
        }

        if (linkedStory && String(linkedStory.visibility || '').trim() === 'Không công khai' && !isMember()) {
          showAuthRequiredModal();
          return;
        }

        playChapterAtIndex(index);
      });
    }

    if (playButton) playButton.addEventListener('click', function () {
      if (nativeAudio && nativeAudio.getAttribute('src')) {
        // Don't allow play if audio is in error state or hasn't loaded metadata
        if (nativeAudio.error) {
          playerState.playing = false;
          renderPlayer();
          return;
        }
        if (nativeAudio.paused) {
          // Only play if audio has loaded enough (readyState >= 2 = HAVE_CURRENT_DATA)
          if (nativeAudio.readyState < 2) {
            // Audio not ready yet — show loading, wait for canplay
            var waitHandler = function () {
              nativeAudio.removeEventListener('canplay', waitHandler);
              nativeAudio.play().then(function () {
                playerState.playing = true;
                renderPlayer();
              }).catch(function () {
                playerState.playing = false;
                renderPlayer();
              });
            };
            nativeAudio.addEventListener('canplay', waitHandler);
            // Timeout: if audio doesn't load in 15s, reset
            setTimeout(function () {
              nativeAudio.removeEventListener('canplay', waitHandler);
              if (nativeAudio.readyState < 2) {
                playerState.playing = false;
                renderPlayer();
              }
            }, 15000);
            renderPlayer(); // show loading state
            return;
          }
          nativeAudio.play().then(function () {
            playerState.playing = true;
            renderPlayer();
          }).catch(function () {
            playerState.playing = false;
            renderPlayer();
          });
          return;
        }
        nativeAudio.pause();
        playerState.playing = false;
        renderPlayer();
        return;
      }

      // No audio src — audio still loading from API, wait for canplay then play
      if (nativeAudio) {
        var _waitPlayHandler = function () {
          nativeAudio.removeEventListener('canplay', _waitPlayHandler);
          clearTimeout(_waitPlayTimeout);
          nativeAudio.play().then(function () {
            playerState.playing = true;
            renderPlayer();
          }).catch(function () {
            playerState.playing = false;
            renderPlayer();
          });
        };
        nativeAudio.addEventListener('canplay', _waitPlayHandler);
        var _waitPlayTimeout = setTimeout(function () {
          nativeAudio.removeEventListener('canplay', _waitPlayHandler);
          if (!nativeAudio.src || nativeAudio.readyState < 2) {
            playerState.playing = false;
            renderPlayer();
            var _note = document.querySelector('[data-story-audio-note]');
            if (_note) {
              _note.textContent = 'Audio chưa tải được. Kiểm tra kết nối mạng và tải lại trang.';
              _note.classList.remove('is-hidden');
            }
          }
        }, 15000);
        renderPlayer(); // show loading state
      }
    });

    function playChapterAtIndex(index) {
      // Re-query DOM in case overrideChapterList re-rendered the chapter list
      var freshNodes = document.querySelectorAll('[data-chapter-index]');
      if (!freshNodes.length) freshNodes = document.querySelectorAll('[data-player-chapter]');
      if (!freshNodes.length) return;
      var safeIndex = Number(index);
      if (isNaN(safeIndex) || safeIndex < 0) return;
      // Find the correct node by data-chapter-index (freshNodes has duplicates from mobile+desktop)
      var link = null;
      for (var _fi = 0; _fi < freshNodes.length; _fi++) {
        if (Number(freshNodes[_fi].getAttribute('data-chapter-index')) === safeIndex) { link = freshNodes[_fi]; break; }
      }
      if (!link) return;

      // Stop current audio before switching chapter
      if (nativeAudio && !nativeAudio.paused) {
        nativeAudio.pause();
        nativeAudio.currentTime = 0;
      }
      playerState.playing = false;

      var nextStory = null;
      var playlistItem = null;
      if (overrideState && Array.isArray(overrideState.chapters) && overrideState.chapters[safeIndex]) {
        playlistItem = overrideState.chapters[safeIndex];
        if (playlistItem.storyId && window.AudioHubStories && typeof window.AudioHubStories.getById === 'function') {
          nextStory = window.AudioHubStories.getById(String(playlistItem.storyId));
        }
        // If nextStory is the SAME story (non-playlist chapter switch), treat as same-story
        // so the chapter's own data-audio-key is used instead of story-level audioKey
        if (nextStory && story && String(nextStory.id) === String(story.id)) {
          nextStory = null;
        }
        if (nextStory && String(nextStory.visibility || '').trim() === 'Không công khai' && !isMember()) {
          showAuthRequiredModal();
          renderPlayer();
          return;
        }
      } else {
      }

      // Update active chapter classes (use data-chapter-index, not array index,
      // because freshNodes contains items from BOTH mobile and desktop lists)
      freshNodes.forEach(function (node) {
        var nodeIndex = Number(node.getAttribute('data-chapter-index'));
        var isActive = nodeIndex === safeIndex;
        node.classList.toggle('active', isActive);
        node.classList.toggle('is-active', isActive);
        var dot = node.querySelector('.chapter-dot');
        if (dot) dot.innerHTML = isActive ? '<i class="fa-solid fa-play" style="font-size:10px;color:#fff;"></i>' : '<span class="chapter-num">' + (nodeIndex + 1) + '</span>';
        var oldBadge = node.querySelector('.chapter-playing-badge');
        if (oldBadge) oldBadge.remove();
        if (isActive) {
          var badge = document.createElement('span');
          badge.className = 'chapter-playing-badge';
          badge.innerHTML = '<i class="fa-solid fa-play"></i> Đang phát';
          node.appendChild(badge);
        }
      });

      playerState.chapter = link.getAttribute('data-player-chapter') || playerState.chapter;
      playerState.progress = safeIndex === 0 ? 36 : 12 * (safeIndex + 1);
      playerState.next = getNextChapterText(safeIndex);
      playerState.playing = false;

      // Update overview and URL
      if (playlistItem) {
        applyStoryOverviewFromPlaylistItem(playlistItem);
        // Update URL without reload
        var newUrl = 'story-detail?id=' + encodeURIComponent(playlistItem.storyId || '');
        if (overrideState && overrideState.chapters && overrideState.chapters[0]) {
          var playlistId = getQueryParam('playlistId') || '';
          if (playlistId) newUrl += '&playlistId=' + encodeURIComponent(playlistId);
        }
        history.replaceState({}, '', newUrl);
      }

      renderPlayer();

      // Helper: play audio after story is loaded
      function _playLoadedStory(storyObj) {
        _userSelectedChapter = true;
        bindStoryCover(storyObj);
        // CRITICAL: If user already selected a chapter, do NOT overwrite with story-level audio.
        // The chapter click handler already set the correct audio via bindStoryAudio(chapterStory).
        if (!currentPlayingAudioKey) {
          bindStoryAudio(storyObj);
          currentPlayingAudioKey = storyObj && (storyObj.audioKey || storyObj.audio_key) ? String(storyObj.audioKey || storyObj.audio_key) : '';
          // bindStoryAudio() handles auto-play when audio loads
        }
      }

      // Re-fetch audio for the new story
      if (nextStory) {
        _playLoadedStory(nextStory);
      } else if (playlistItem && playlistItem.storyId && story && String(playlistItem.storyId) !== String(story.id)) {
        // Different story (playlist) — fetch from D1 API
        fetchStoryFromSupabase(String(playlistItem.storyId)).then(function (freshStory) {
          if (freshStory) {
            _playLoadedStory(freshStory);
          } else {
            // API returned null — fallback: load chapter audio directly from data-audio-key
            console.warn('[chapter] Story not found in API:', playlistItem.storyId, '- falling back to chapter audioKey');
            var _fbKey = link.getAttribute('data-audio-key') || '';
            if (_fbKey && story) {
              _userSelectedChapter = true;
              var _fbStory = Object.assign({}, story, { audioKey: _fbKey });
              bindStoryAudio(_fbStory);
              currentPlayingAudioKey = _fbKey;
              // bindStoryAudio() handles auto-play
            }
          }
        }).catch(function (err) {
          console.error('[chapter] API fetch failed:', playlistItem.storyId, err);
          // Fallback: load chapter audio directly instead of crashing
          var _fbKey2 = link.getAttribute('data-audio-key') || '';
          if (_fbKey2 && story) {
            _userSelectedChapter = true;
            var _fbStory2 = Object.assign({}, story, { audioKey: _fbKey2 });
            bindStoryAudio(_fbStory2);
            currentPlayingAudioKey = _fbKey2;
            // bindStoryAudio() handles auto-play
          }
        });
      } else {
        // Same story — load chapter's own audioKey from DOM
        var chAudioKey = link.getAttribute('data-audio-key') || '';
        var chReadingText = (window.__chapterReadingTexts && window.__chapterReadingTexts[safeIndex]) || '';

        // Fallback: look up audioKey from audiohub-chapters-v1 if DOM attribute is empty
        if (!chAudioKey && story && story.id) {
          try {
            var _cs = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
            var _chs = Array.isArray(_cs[String(story.id)]) ? _cs[String(story.id)] : [];
            if (_chs[safeIndex] && _chs[safeIndex].audioKey) chAudioKey = _chs[safeIndex].audioKey;
          } catch (e) {}
        }

        if (chAudioKey && chAudioKey !== currentPlayingAudioKey) {
          // Chapter has different audio — load it
          _userSelectedChapter = true;
          var chapterStory = Object.assign({}, story, { audioKey: chAudioKey });
          bindStoryAudio(chapterStory);
          currentPlayingAudioKey = chAudioKey;
          // NOTE: bindStoryAudio() handles auto-play when audio loads (line 1642).
          // Do NOT use setTimeout(300) here — audio is async and not ready in 300ms,
          // causing echo of previous chapter's audio or silence in incognito mode.
        } else if (!chAudioKey) {
          // Chapter has NO audioKey — fallback to story-level audioKey
          var _storyFallbackKey = story && (story.audioKey || story.audio_key) ? String(story.audioKey || story.audio_key) : '';
          if (_storyFallbackKey && _storyFallbackKey !== currentPlayingAudioKey) {
            _userSelectedChapter = true;
            var _fallbackStory = Object.assign({}, story, { audioKey: _storyFallbackKey });
            bindStoryAudio(_fallbackStory);
            currentPlayingAudioKey = _storyFallbackKey;
            console.log('[audio] Chapter', safeIndex + 1, 'has no audioKey — using story audioKey:', _storyFallbackKey);
          } else if (_storyFallbackKey) {
            // Same story audio already playing — restart from beginning
            nativeAudio.currentTime = 0;
            nativeAudio.play().then(function () {
              playerState.playing = true;
              renderPlayer();
            }).catch(function () {
              playerState.playing = false;
              renderPlayer();
            });
          } else {
            // No audio at all — show message
            var _noteNode = document.querySelector('[data-story-audio-note]');
            if (_noteNode) {
              _noteNode.textContent = 'Chương này chưa có file audio.';
              _noteNode.classList.remove('is-hidden');
            }
            console.log('[audio] Chapter', safeIndex + 1, 'has no audioKey and story has no audioKey');
          }
        } else {
          // Same audioKey as currently playing — restart from beginning
          nativeAudio.currentTime = 0;
          nativeAudio.play().then(function () {
            playerState.playing = true;
            renderPlayer();
          }).catch(function () {
            playerState.playing = false;
            renderPlayer();
          });
        }

        // Update reading text for this chapter
        if (chReadingText) {
          var chapterCopy = document.querySelector('[data-chapter-copy]');
          if (chapterCopy) {
            var ct = cleanReadingText(chReadingText);
            var bl = String(ct).split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
            chapterCopy.innerHTML = bl.length ? bl.map(function (l) { return '<p>' + escapeHtml(l) + '</p>'; }).join('') : '';
            // Record rendered text so renderReadingText() won't overwrite it
            window.__lastRenderedReadingText = chapterCopy.innerHTML;
            chapterCopy.scrollTop = 0;
          }
        }
      }
    }

    if (nativeAudio) {
      nativeAudio.addEventListener('play', function () {
        playerState.playing = true;
        renderPlayer();
      });
      nativeAudio.addEventListener('pause', function () {
        playerState.playing = false;
        renderPlayer();
      });
      nativeAudio.addEventListener('ended', function () {
        var moved = playNextChapterAuto();
        if (!moved) {
          playerState.playing = false;
          renderPlayer();
        }
      });
      // FIX: Detect audio load errors and reset UI
      nativeAudio.addEventListener('error', function () {
        if (nativeAudio.error && nativeAudio.error.code !== MediaError.MEDIA_ERR_ABORTED) {
          console.warn('[audio-debug] Audio error:', nativeAudio.error.code, nativeAudio.error.message);
          playerState.playing = false;
          renderPlayer();
        }
      });
      // FIX: Detect audio stuck at 0:00 (silent failure — common in incognito)
      var _stuckCheckCount = 0;
      nativeAudio.addEventListener('playing', function () {
        _stuckCheckCount = 0;
        // After play starts, verify time actually advances
        var stuckInterval = setInterval(function () {
          if (nativeAudio.paused || nativeAudio.ended || nativeAudio.currentTime > 0) {
            clearInterval(stuckInterval);
            return;
          }
          _stuckCheckCount++;
          if (_stuckCheckCount >= 5) {
            // 5 seconds stuck at 0:00 — audio is silent/broken
            clearInterval(stuckInterval);
            console.warn('[audio-debug] Audio stuck at 0:00 — resetting player');
            nativeAudio.pause();
            nativeAudio.currentTime = 0;
            playerState.playing = false;
            renderPlayer();
          }
        }, 1000);
      });
    }

    if (seekBackButton) {
      seekBackButton.addEventListener('click', function () {
        seekAudioBy(-10);
      });
    }

    if (seekForwardButton) {
      seekForwardButton.addEventListener('click', function () {
        seekAudioBy(10);
      });
    }

    if (nextChapterButton) {
      nextChapterButton.addEventListener('click', function () {
        playNextChapterAuto();
      });
    }

    if (prevChapterButton) {
      prevChapterButton.addEventListener('click', function () {
        playPrevChapterAuto();
      });
    }

    if (shuffleButton) {
      shuffleButton.addEventListener('click', function () {
        playerState.shuffle = !playerState.shuffle;
        setControlActive(shuffleButton, playerState.shuffle);
      });
    }

    if (repeatButton) {
      repeatButton.addEventListener('click', function () {
        playerState.repeat = !playerState.repeat;
        setControlActive(repeatButton, playerState.repeat);
      });
    }

    // Speed button click handlers are registered below (sheetSpeedBtns)

    if (volumeSlider) volumeSlider.addEventListener('input', function () {
      playerState.volume = volumeSlider.value + '%';
      if (nativeAudio) {
        var numericVolume = Number(volumeSlider.value);
        if (!isNaN(numericVolume)) {
          nativeAudio.volume = Math.max(0, Math.min(1, numericVolume / 100));
        }
      }
      renderPlayer();
    });

    // Settings popover — toggle, click-outside, ESC
    var settingsPanel = document.querySelector('[data-settings-panel]');
    var settingsGear = document.querySelector('[data-settings-toggle]');
    var settingsWrap = document.querySelector('[data-settings-toggle-wrap]');
    var playerRoot = document.querySelector('[data-player-root]');

    function closeSettingsPopover() {
      if (settingsPanel) settingsPanel.classList.remove('is-open');
    }

    function positionSettingsPopover() {
      if (!settingsGear || !settingsPanel || !playerRoot) return;
      var gearRect = settingsGear.getBoundingClientRect();
      var playerRect = playerRoot.getBoundingClientRect();
      var popWidth = 330;
      var gap = 10;
      // Position below gear, right-aligned to gear
      var top = gearRect.bottom - playerRect.top + gap;
      var right = playerRect.right - gearRect.right;
      // Clamp to not overflow left
      if (right + popWidth > playerRect.width) {
        right = playerRect.width - popWidth - 12;
      }
      if (right < 12) right = 12;
      settingsPanel.style.top = top + 'px';
      settingsPanel.style.right = right + 'px';
    }

    if (settingsGear && settingsPanel) {
      settingsGear.addEventListener('click', function (e) {
        e.stopPropagation();
        var willOpen = !settingsPanel.classList.contains('is-open');
        settingsPanel.classList.toggle('is-open');
        if (willOpen) positionSettingsPopover();
      });
    }

    if (settingsPanel) {
      settingsPanel.addEventListener('click', function (e) {
        e.stopPropagation();
      });
    }

    document.addEventListener('click', function () {
      closeSettingsPopover();
    }, { signal: _signal });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSettingsPopover();
    }, { signal: _signal });

      // New speed buttons (sheet)
      var sheetSpeedBtns = Array.prototype.slice.call(document.querySelectorAll('[data-player-speed]'));
      sheetSpeedBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var speed = btn.getAttribute('data-player-speed');
          if (speed && nativeAudio) {
            nativeAudio.playbackRate = parseFloat(speed);
            playerState.speed = speed;
            renderPlayer();
          }
          // Update active state
          sheetSpeedBtns.forEach(function (b) { b.classList.remove('is-active'); });
          btn.classList.add('is-active');
          // Update chip text
          var chip = document.querySelector('.sd-speed-chip');
          if (chip) chip.innerHTML = speed + ' <i class="fa-solid fa-chevron-down" style="font-size:10px"></i>';
          var speedLbl = document.querySelector('[data-player-speed-value]');
          if (speedLbl) speedLbl.textContent = speed;
          var speedTag = document.querySelector('.sd-speed');
          if (speedTag) speedTag.textContent = speed;
        });
      });

      // Progress bar click to seek
      var progressBar = document.querySelector('[data-player-progress-bar]');
      if (progressBar && nativeAudio) {
        progressBar.addEventListener('click', function (e) {
          var rect = progressBar.getBoundingClientRect();
          var pct = (e.clientX - rect.left) / rect.width;
          var duration = Number(nativeAudio.duration);
          if (!isNaN(duration) && duration > 0) {
            nativeAudio.currentTime = pct * duration;
          }
        });
      }

      // Time update
      var currentTimeEl = document.querySelector('[data-player-current-time]');
      var durationEl = document.querySelector('[data-player-duration]');
      function formatTime(sec) {
        if (isNaN(sec) || sec < 0) return '0:00';
        var m = Math.floor(sec / 60);
        var s = Math.floor(sec % 60);
        return m + ':' + (s < 10 ? '0' : '') + s;
      }
      if (nativeAudio) {
        nativeAudio.addEventListener('timeupdate', function () {
          var dur = Number(nativeAudio.duration);
          var cur = Number(nativeAudio.currentTime);
          if (currentTimeEl) currentTimeEl.textContent = formatTime(cur);
          if (durationEl) durationEl.textContent = formatTime(dur);
          if (!isNaN(dur) && dur > 0) {
            var pct = (cur / dur * 100);
            if (progressFill) progressFill.style.width = pct + '%';
            if (progressThumb) progressThumb.style.left = pct + '%';
          }
        });
      }

    // Volume — inline in ubar
    var volTrack = document.querySelector('[data-vol-track]');
    var volFill = document.querySelector('[data-vol-fill]');
    var volThumb = document.querySelector('[data-vol-thumb]');
    var volTip = document.querySelector('[data-vol-value]');
    var volIcon = document.querySelector('[data-vol-icon]');

    function updateVolUI(pct) {
      if (volFill) volFill.style.width = pct + '%';
      if (volThumb) volThumb.style.left = pct + '%';
      if (volTip) volTip.textContent = Math.round(pct) + '%';
      if (volIcon) {
        if (pct === 0) volIcon.className = 'fa-solid fa-volume-xmark sd-vol-icon';
        else if (pct < 40) volIcon.className = 'fa-solid fa-volume-low sd-vol-icon';
        else volIcon.className = 'fa-solid fa-volume-high sd-vol-icon';
      }
    }

    function setVolFromEvent(e) {
      if (!volTrack) return;
      var rect = volTrack.getBoundingClientRect();
      var pct = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
      if (nativeAudio) nativeAudio.volume = pct / 100;
      playerState.volume = Math.round(pct) + '%';
      updateVolUI(pct);
      renderPlayer();
    }

    if (volTrack) {
      volTrack.addEventListener('click', setVolFromEvent);
      var volDragging = false;
      volTrack.addEventListener('mousedown', function (e) { volDragging = true; setVolFromEvent(e); });
      document.addEventListener('mousemove', function (e) { if (volDragging) setVolFromEvent(e); }, { signal: _signal });
      document.addEventListener('mouseup', function () { volDragging = false; }, { signal: _signal });
    }

    // Init
    var initVol = parseInt(playerState.volume) || 72;
    updateVolUI(initVol);

    // Speed toggle — show popup with options
    var speedToggle = document.querySelector('[data-speed-toggle]');
    var speedPopup = document.querySelector('[data-speed-popup]');
    var speedPickBtns = Array.prototype.slice.call(document.querySelectorAll('[data-pick-speed]'));

    if (speedToggle && speedPopup) {
      speedToggle.addEventListener('click', function (e) {
        e.stopPropagation();
        speedPopup.classList.toggle('is-hidden');
      });

      // Pick a speed
      speedPickBtns.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
          e.stopPropagation();
          var speed = btn.getAttribute('data-pick-speed');
          if (speed) {
            playerState.speed = speed;
            if (nativeAudio) nativeAudio.playbackRate = parseFloat(speed);
            renderPlayer();
            // Update active states
            speedPickBtns.forEach(function (b) { b.classList.remove('is-active'); });
            btn.classList.add('is-active');
          }
          speedPopup.classList.add('is-hidden');
        });
      });

      // Close popup on outside click
      document.addEventListener('click', function () {
        speedPopup.classList.add('is-hidden');
      }, { signal: _signal });
    }

    renderPlayer();
  }

  initCommentAccess();
  initPlayer();

  // BACKGROUND: Sync all chapter audio from IndexedDB to R2 (runs once on page load)
  (function () {
    var _sid = window.location.search.match(/[?&]id=([^&]+)/);
    _sid = _sid ? decodeURIComponent(_sid[1]) : '';
    if (_sid) _syncAllChaptersToR2(_sid);
  })();

  if (window.AudioHubStories && typeof window.AudioHubStories.sync === 'function') {
    window.AudioHubStories.sync();
  }

  /* ── Add Chapter Modal (Đăng chương mới vào bộ truyện) ── */
  (function initAddChapterModal() {
    var addBtn = document.querySelector('[data-add-chapter-btn]');
    var mobileAddBtn = document.querySelector('[data-mobile-add-chapter-btn]');
    var modal = document.querySelector('[data-add-chapter-modal]');
    if (!modal) return;

    var seriesNameEl = modal.querySelector('[data-add-chapter-series-name]');
    var nameInput = modal.querySelector('[data-add-chapter-name]');
    var audioInput = modal.querySelector('[data-add-chapter-audio]');
    var readingInput = modal.querySelector('[data-add-chapter-reading]');
    var descInput = modal.querySelector('[data-add-chapter-desc]');
    var submitBtn = modal.querySelector('[data-add-chapter-submit]');
    var statusEl = modal.querySelector('[data-add-chapter-status]');
    var closeBtns = modal.querySelectorAll('[data-add-chapter-close]');

    // Get current playlist context from URL or localStorage
    function getPlaylistContext() {
      var storyId = getQueryParam('id') || '';
      var playlistId = getQueryParam('playlistId') || '';
      // Also check localStorage
      try {
        var stored = JSON.parse(localStorage.getItem('audiohub-playlist-context-v1') || '{}');
        if (stored.playlistId && stored.storyId === storyId) {
          playlistId = stored.playlistId;
        }
      } catch (e) {}
      // Find playlist name
      var playlistName = '';
      if (playlistId) {
        try {
          var playlists = JSON.parse(localStorage.getItem('audiohub-playlists-v1') || '[]');
          if (Array.isArray(playlists)) {
            var pl = playlists.find(function (p) { return p.id === playlistId; });
            if (pl) playlistName = pl.name || '';
          }
        } catch (e) {}
      }
      return { storyId: storyId, playlistId: playlistId, playlistName: playlistName };
    }

    function openModal() {
      var ctx = getPlaylistContext();
      if (!ctx.playlistId) return; // no playlist context = no add chapter
      // Check if user is admin
      try {
        var auth = JSON.parse(localStorage.getItem('audiohub-auth-profile') || '{}');
        if (!auth.isAdmin) return;
      } catch (e) { return; }

      modal.classList.remove('is-hidden');
      if (seriesNameEl) seriesNameEl.textContent = 'Bộ truyện: ' + ctx.playlistName;
      if (nameInput) { nameInput.value = ''; nameInput.focus(); }
      if (audioInput) audioInput.value = '';
      if (readingInput) readingInput.value = '';
      if (descInput) descInput.value = '';
      if (statusEl) statusEl.classList.add('is-hidden');
    }

    function closeModal() {
      modal.classList.add('is-hidden');
    }

    // Show button only when playlist context + admin
    function checkShowButton() {
      var ctx = getPlaylistContext();
      var isAdmin = false;
      try {
        var auth = JSON.parse(localStorage.getItem('audiohub-auth-profile') || '{}');
        isAdmin = !!auth.isAdmin;
      } catch (e) {}
      var show = ctx.playlistId && isAdmin;
      if (addBtn) addBtn.classList.toggle('is-hidden', !show);
      if (mobileAddBtn) mobileAddBtn.classList.toggle('is-hidden', !show);
    }
    checkShowButton();
    // Re-check on URL change (SPA navigation)
    window.addEventListener('popstate', checkShowButton, { signal: _signal });
    window.addEventListener('audiohub:navigated', checkShowButton, { signal: _signal });

    // Open modal
    if (addBtn) addBtn.addEventListener('click', openModal);
    if (mobileAddBtn) mobileAddBtn.addEventListener('click', openModal);

    // Close modal
    closeBtns.forEach(function (btn) {
      btn.addEventListener('click', closeModal);
    });

    // Submit: create story + add to playlist
    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        var ctx = getPlaylistContext();
        if (!ctx.playlistId || !ctx.storyId) return;

        var chapterName = nameInput ? nameInput.value.trim() : '';
        var audioFile = audioInput && audioInput.files ? audioInput.files[0] : null;
        var readingFile = readingInput && readingInput.files ? readingInput.files[0] : null;
        var description = descInput ? descInput.value.trim() : '';

        if (!chapterName) {
          statusEl.textContent = 'Vui lòng nhập tên chương.';
          statusEl.className = 'add-chapter-modal__status is-error';
          return;
        }

        // Get existing story data to inherit metadata
        var existingStory = null;
        try {
          existingStory = window.AudioHubStories && typeof window.AudioHubStories.getById === 'function'
            ? window.AudioHubStories.getById(ctx.storyId) : null;
        } catch (e) {}

        var storyTitle = existingStory ? (existingStory.title || '') : '';
        var storyAuthor = existingStory ? (existingStory.author || '') : '';
        var storyGenre = existingStory ? (existingStory.genre || '') : '';

        // Create new story entry for this chapter
        // Use unique title to avoid dedupeStories() collision with existing series story
        var chapterStoryTitle = storyTitle + (chapterName ? ' - ' + chapterName : '');
        var newStoryPayload = {
          title: chapterStoryTitle,
          description: description || (existingStory ? existingStory.description : ''),
          author: storyAuthor,
          genre: storyGenre,
          chapterTitle: chapterName,
          visibility: 'Công khai'
        };

        statusEl.textContent = 'Đang đăng chương...';
        statusEl.className = 'add-chapter-modal__status';
        statusEl.classList.remove('is-hidden');
        submitBtn.disabled = true;

        // Save story to localStorage via AudioHubStories
        var newStory = null;
        try {
          newStory = window.AudioHubStories.upsert(newStoryPayload);
        } catch (e) {
          statusEl.textContent = 'Lỗi lưu truyện: ' + (e.message || e);
          statusEl.className = 'add-chapter-modal__status is-error';
          submitBtn.disabled = false;
          return;
        }

        if (!newStory || !newStory.id) {
          statusEl.textContent = 'Không thể tạo chương mới.';
          statusEl.className = 'add-chapter-modal__status is-error';
          submitBtn.disabled = false;
          return;
        }

        // Upload audio to IndexedDB if provided
        var audioPromise = Promise.resolve('');
        if (audioFile && window.AudioHubStoryAudio && typeof window.AudioHubStoryAudio.put === 'function') {
          audioPromise = window.AudioHubStoryAudio.put(audioFile, newStory.id).catch(function () { return ''; });
        }

        // Upload reading text if provided
        var readingPromise = Promise.resolve('');
        if (readingFile) {
          readingPromise = new Promise(function (resolve) {
            var reader = new FileReader();
            reader.onload = function () { resolve(typeof reader.result === 'string' ? reader.result : ''); };
            reader.onerror = function () { resolve(''); };
            reader.readAsText(readingFile, 'utf-8');
          });
        }

        Promise.all([audioPromise, readingPromise]).then(function (results) {
          var audioKey = results[0] || '';
          var readingText = results[1] || '';

          // Update story with audioKey and readingText
          if (audioKey || readingText) {
            if (audioKey) newStory.audioKey = audioKey;
            if (readingText) newStory.readingText = readingText;
            try { window.AudioHubStories.upsert(newStory); } catch (e) {}
          }

          // Add chapter entry to playlist
          var PLAYLIST_KEY = 'audiohub-playlists-v1';
          try {
            var plRaw = localStorage.getItem(PLAYLIST_KEY) || '[]';
            var playlists = JSON.parse(plRaw);
            if (!Array.isArray(playlists)) playlists = [];
            var matchedPl = playlists.find(function (p) { return p.id === ctx.playlistId; });
            if (matchedPl) {
              var entries = matchedPl.entries || [];
              var entryHref = '/html/story-detail?id=' + encodeURIComponent(newStory.id) + '&playlistId=' + encodeURIComponent(ctx.playlistId);
              entries.push({
                key: newStory.id,
                title: storyTitle,
                chapterTitle: chapterName,
                chapterIndex: entries.length,
                author: storyAuthor,
                genre: storyGenre,
                href: entryHref,
                status: 'listening',
                progress: 0,
                addedAt: new Date().toISOString()
              });
              matchedPl.entries = entries;
              localStorage.setItem(PLAYLIST_KEY, JSON.stringify(playlists));
              // Sync to D1
              fetch('/api/playlists', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: matchedPl.id, name: matchedPl.name, items: JSON.stringify(entries) })
              }).catch(function () {});
            }
          } catch (e) {}

          // Sync to cloud
          try {
            if (typeof window.AudioHubStories.sync === 'function') window.AudioHubStories.sync();
          } catch (e) {}

          statusEl.textContent = '✅ Đã đăng chương "' + chapterName + '" vào bộ truyện!';
          statusEl.className = 'add-chapter-modal__status';
          submitBtn.disabled = false;

          // Close modal + reload after short delay
          setTimeout(function () {
            closeModal();
            window.location.reload();
          }, 1500);

        }).catch(function (err) {
          statusEl.textContent = 'Lỗi: ' + (err.message || err);
          statusEl.className = 'add-chapter-modal__status is-error';
          submitBtn.disabled = false;
        });
      });
    }
  })();

})();


