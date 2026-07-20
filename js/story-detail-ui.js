(function () {
  var detailRoot = document.querySelector('.detail-page');
  if (!detailRoot) return;

  function setActive(items, activeValue, attr) {
    items.forEach(function (item) {
      var isActive = item.getAttribute(attr) === activeValue;
      item.classList.toggle('is-active', isActive);
      item.classList.toggle('active', isActive);
      if (item.matches('button')) item.setAttribute('aria-pressed', isActive ? 'true' : 'false');
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
    return '<h2>Giới thiệu truyện</h2>' + hashtagsBlock + '<p>' + body.replace(/\n/g, '</p><p>') + '</p>';
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

  function ensureStoryIdInLinks() {
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

  ensureStoryContext();

  window.addEventListener('audiohub:stories-updated', function () {
    ensureStoryContext();
  });

  window.addEventListener('audiohub:stories-synced', function () {
    if (tryResolvePendingStoryAfterSync()) return;
    ensureStoryContext();
  });

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
      var listens2d = Number(story.listenCount2d || 0);
      var listens = listens2d > 0 ? listens2d : Number(story.listenCount || 0);
      listenNode.innerHTML = '<i class="fa-regular fa-eye"></i> ' + listens + ' lượt nghe (2 ngày)';
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
            chapterLabel: entry.title || entry.storyTitle || ('Chương ' + (i + 1)),
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
      if (pl.items && pl.items.length) { chosen = pl; chosenIndex = 0; return true; }
      return false;
    });

    if (!chosen) {
      playlists.some(function (pl) {
        var idx = findStoryInPl(pl, storyId);
        if (idx >= 0) { chosen = pl; chosenIndex = idx; return true; }
        return false;
      });
    }

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
    var chapterCopy = document.querySelector('.chapter-copy');
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

    if (!story && typeof window.AudioHubStories.read === 'function' && !storyId) {
      var allStories = window.AudioHubStories.read() || [];
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

    if (!story) {
      if (storyId && !isSyntheticStoryId(storyId)) {
        markPendingStorySync(storyId);
      }
      ensureFallbackHashtags(storyNode);
      return null;
    }

    clearPendingStorySync(String(story.id || storyId || ''));

    if (storyId && isSyntheticStoryId(storyId) && story.id && String(story.id) !== String(storyId)) {
      var syntheticParams = new URLSearchParams(window.location.search || '');
      syntheticParams.set('id', String(story.id));
      window.history.replaceState({}, '', window.location.pathname + '?' + syntheticParams.toString());
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
      renderAccessDenied(storyNode, story);
      return null;
    }

    storyNode.setAttribute('data-story-id', String(story.id || ''));
    storyNode.setAttribute('data-title', String(story.title || ''));
    storyNode.setAttribute('data-author', String(story.author || ''));
    storyNode.setAttribute('data-genre', String(story.genre || ''));
    storyNode.setAttribute('data-cover-key', String(story.coverKey || ''));
    storyNode.setAttribute('data-youtube-url', String(story.youtubeUrl || ''));
    storyNode.setAttribute('data-youtube-id', String(story.youtubeId || ''));
    storyNode.setAttribute('href', '/story-detail.html?id=' + encodeURIComponent(String(story.id || '')));

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

    var chapterCopy = document.querySelector('.chapter-copy');
    if (chapterCopy && story.readingText) {
      var cleanedText = cleanReadingText(story.readingText);
      var blocks = String(cleanedText).split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
      chapterCopy.innerHTML = blocks.length
        ? blocks.map(function (line) { return '<p>' + escapeHtml(line) + '</p>'; }).join('')
        : '';
    }

    var chapterTitle = story.chapterTitle || 'Chương 1';
    var chapterLabel = document.querySelector('[data-player-current-chapter]');
    if (chapterLabel) chapterLabel.textContent = chapterTitle;

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

  function bindStoryCover(story) {
    // Try coverData (base64) first — new method
    var coverData = story && story.coverData ? String(story.coverData) : '';
    if (coverData) {
      applyCoverUrl(coverData);
      return;
    }

    // Fallback to coverKey (IndexedDB/API) — legacy method
    var coverKey = story && story.coverKey ? String(story.coverKey) : '';
    if (!coverKey) return;

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
      } catch (error) {}
    }

    // Legacy: try IndexedDB then API
    if (window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function') {
      window.AudioHubStoryCover.get(coverKey)
        .then(function (blob) {
          if (blob) {
            applyCoverUrl(URL.createObjectURL(blob));
          } else if (window.AudioHubApi && typeof window.AudioHubApi.requestBlob === 'function') {
            // Fallback: fetch from API
            window.AudioHubApi.requestBlob('/media/covers/' + encodeURIComponent(coverKey))
              .then(function (blob) { if (blob) applyCoverUrl(URL.createObjectURL(blob)); })
              .catch(function () {});
          }
        })
        .catch(function () {});
    }
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

    var chapterCopy = document.querySelector('.chapter-copy');
    if (chapterCopy) {
      var cleanedText = cleanReadingText(story.readingText || '');
      var blocks = String(cleanedText).split(/\r?\n/).map(function (line) { return line.trim(); }).filter(Boolean);
      chapterCopy.innerHTML = blocks.length
        ? blocks.map(function (line) { return '<p>' + escapeHtml(line) + '</p>'; }).join('')
        : '<p>Chưa có nội dung truyện chữ cho chương này.</p>';
    }

    var chapterLabel = document.querySelector('[data-player-current-chapter]');
    if (chapterLabel) chapterLabel.textContent = story.chapterTitle || item.chapterLabel || 'Chương 1';
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

    var stories = pickTrendingStories(window.AudioHubStories.read() || []).slice(0, 8);

    if (!stories.length) {
      list.innerHTML = '';
      return;
    }

    list.innerHTML = stories.map(function (item) {
      var title = escapeHtml(String(item.title || 'Truyện'));
      var views2d = Number(item.listenCount2d || 0);
      var href = '/story-detail.html?id=' + encodeURIComponent(String(item.id || ''));
      var coverKey = escapeHtml(String(item.coverKey || ''));
      return '<a href="' + href + '" class="mini-story">'
        + '<div class="mini-thumb" data-mini-trending-cover-key="' + coverKey + '">' + escapeHtml(title.slice(0, 2).toUpperCase()) + '</div>'
        + '<div><h3>' + title + '</h3><p><i class="fa-regular fa-eye"></i> ' + views2d + ' lượt nghe (2 ngày)</p></div></a>';
    }).join('');

    if (window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function') {
      Array.prototype.slice.call(list.querySelectorAll('[data-mini-trending-cover-key]')).forEach(function (thumbNode) {
        var key = String(thumbNode.getAttribute('data-mini-trending-cover-key') || '');
        if (!key) return;
        window.AudioHubStoryCover.get(key)
          .then(function (blob) {
            if (!blob) return;
            try {
              var prev = coverUrlByNode.get(thumbNode);
              if (prev) {
                URL.revokeObjectURL(prev);
              }
              var url = URL.createObjectURL(blob);
              coverUrlByNode.set(thumbNode, url);
              thumbNode.style.backgroundImage = 'url("' + url + '")';
              thumbNode.style.backgroundSize = 'cover';
              thumbNode.style.backgroundPosition = 'center';
              thumbNode.textContent = '';
            } catch (error) {}
          })
          .catch(function () {});
      });
    }
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

    picked = picked.slice(0, 3);
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
      var href = '/story-detail.html?id=' + encodeURIComponent(String(item.id));
      var coverKey = escapeHtml(String(item.coverKey || ''));
      var visibility = escapeHtml(String(item.visibility || ''));
      var storyId = escapeHtml(String(item.id || ''));
      var chapters = Number(item.chapterCount || 0) || '';
      var chaptersLabel = chapters ? (chapters + ' Chương') : '';
      var views = Number(item.listenCount || 0);
      var viewsLabel = views ? (views + ' views') : '— views';
      var isCompleted = item.isCompleted ? '<span class="story-badge story-badge--full">FULL</span>' : '';
      return '<a href="' + href + '" class="story-card" data-related-story-id="' + storyId + '" data-related-visibility="' + visibility + '">'
        + '<div class="story-card__thumb" data-related-cover-key="' + coverKey + '">'
        + '<button class="story-fav" type="button" aria-label="Yêu thích" aria-pressed="false"><i class="fa-regular fa-heart"></i></button>'
        + isCompleted
        + (chaptersLabel ? '<span class="story-chapters">' + chaptersLabel + '</span>' : '')
        + '</div>'
        + '<div class="story-card__body"><div class="story-meta"><span>' + genre + '</span><span><i class="fa-regular fa-eye"></i> ' + viewsLabel + '</span></div>'
        + '<h3 class="story-title">' + title + '</h3><div class="story-footer"><span><i class="fa-regular fa-user"></i> ' + author + '</span>'
        + '<span class="story-rating"><i class="fa-solid fa-star"></i> 5 (1)</span></div></div></a>';
    }).join('');

    if (window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function') {
      Array.prototype.slice.call(grid.querySelectorAll('[data-related-cover-key]')).forEach(function (thumbNode) {
        var coverKey = String(thumbNode.getAttribute('data-related-cover-key') || '');
        if (!coverKey) return;
        window.AudioHubStoryCover.get(coverKey)
          .then(function (blob) {
            if (!blob) return;
            try {
              var prev = coverUrlByNode.get(thumbNode);
              if (prev) {
                URL.revokeObjectURL(prev);
              }
              var url = URL.createObjectURL(blob);
              coverUrlByNode.set(thumbNode, url);
              thumbNode.style.backgroundImage = 'url("' + url + '")';
              thumbNode.style.backgroundSize = 'cover';
              thumbNode.style.backgroundPosition = 'center';
            } catch (error) {}
          })
          .catch(function () {});
      });
    }

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
    for (var i = 0; i < patterns.length; i += 1) {
      var match = raw.match(patterns[i]);
      if (match && match[1]) return match[1];
    }
    return '';
  }

  function bindStoryVideo(story) {
    // YouTube embed removed — audio is handled by the player section
    var videoWrap = document.querySelector('[data-story-video-wrap]');
    var videoNode = document.querySelector('[data-story-video]');
    if (videoWrap) videoWrap.classList.add('is-hidden');
    if (videoNode) videoNode.innerHTML = '';
  }

  function bindStoryAudio(story) {
    var audioNode = document.querySelector('[data-story-audio]');
    var noteNode = document.querySelector('[data-story-audio-note]');
    if (!audioNode) return;

    function showNote(message) {
      if (!noteNode) return;
      noteNode.textContent = message;
      noteNode.classList.remove('is-hidden');
    }

    try {
      var prevAudio = audioUrlByNode.get(audioNode);
      if (prevAudio) {
        URL.revokeObjectURL(prevAudio);
        audioUrlByNode.delete(audioNode);
      }
    } catch (error) {}

    audioNode.classList.add('is-hidden');
    audioNode.removeAttribute('src');
    audioNode.load();
    if (noteNode) {
      noteNode.textContent = '';
      noteNode.classList.add('is-hidden');
    }

    bindStoryVideo(story);

    var audioKey = story && story.audioKey ? String(story.audioKey) : '';
    var storyId = story && story.id ? String(story.id) : '';
    if (!audioKey && !storyId) {
      showNote('Chưa có file audio cho truyện này.');
      return;
    }

    // Build list of paths to try (most likely first)
    var paths = [];
    if (audioKey) paths.push(audioKey);
    if (storyId) {
      var storyIdMp3 = storyId + '.mp3';
      if (paths.indexOf(storyIdMp3) === -1) paths.push(storyIdMp3);
    }

    var RENDER_BACKEND_BASE = 'https://audiohub-276v.onrender.com/api/v1';

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

    function fetchFromBackend(key) {
      if (!key) return Promise.reject(null);
      var url = RENDER_BACKEND_BASE + '/media/audio/' + encodeURIComponent(String(key));
      return fetchWithTimeout(url, 15000); // 15s timeout per attempt
    }

    function tryPaths(idx) {
      if (idx >= paths.length) return Promise.resolve(null);
      var path = paths[idx];

      // Try Render backend first (public, no auth)
      return fetchFromBackend(path).catch(function () { return null; })
      .then(function (blob) {
        if (blob) return blob;
        // Try AudioHubStoryAudio (IndexedDB)
        var fromStore = (window.AudioHubStoryAudio && typeof window.AudioHubStoryAudio.get === 'function')
          ? window.AudioHubStoryAudio.get(path).catch(function () { return null; })
          : Promise.resolve(null);
        return fromStore;
      }).then(function (blob) {
        return blob || tryPaths(idx + 1);
      });
    }

    // Retry loop: try up to 4 times with increasing delays (0s, 10s, 20s, 40s)
    var maxRetries = 4;
    var retryDelays = [0, 10000, 20000, 40000];
    var retryMessages = [
      'Đang tải audio…',
      'Đang chờ server khởi động… (lần 2)',
      'Đang chờ server khởi động… (lần 3)',
      'Đang chờ server khởi động… (lần cuối)'
    ];

    function attemptLoad(retryIdx) {
      if (retryIdx >= maxRetries) {
        showNote('Audio chưa có trên server. Hãy mở trang này trên trình duyệt đã upload story.');
        return;
      }
      if (retryIdx > 0) {
        showNote(retryMessages[retryIdx]);
      }
      tryPaths(0).then(function (blob) {
        if (blob) {
          try {
            var audioUrl = URL.createObjectURL(blob);
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
                return { storyId: String(e.key || e.storyId || ''), storyTitle: String(e.title || e.storyTitle || ''), label: 'Chương ' + (i + 1), index: i };
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
                label: e.label || ('Chương ' + (i + 1)),
                storyId: String(e.storyId || e.key || ''),
                storyTitle: String(e.storyTitle || e.title || ''),
                index: typeof e.index === 'number' ? e.index : i
              });
            }
            var activeIdx = 0;
            for (var j = 0; j < chapters.length; j++) {
              if (String(chapters[j].storyId) === String(_storyId)) { activeIdx = j; break; }
            }
            return { chapters: chapters, activeIndex: activeIdx, chapterLabel: chapters[activeIdx] ? chapters[activeIdx].label : 'Chương 1' };
          }
          // 1. Try by playlistId first
          if (_plId) {
            for (var i = 0; i < _allPls.length; i++) {
              if (_allPls[i] && String(_allPls[i].id || '') === String(_plId)) {
                context = _buildCtx(_allPls[i]);
                break;
              }
            }
          }
          // 2. Fallback: search ALL playlists for one containing this story
          if (!context) {
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
        } catch (e) {}
      }
    }

    var chapterCountNode = document.querySelector('.detail-sidebar .section-heading span');
    var chapterHeading = document.querySelector('.detail-sidebar .section-heading h2');
    var chapterSection = chapterList.closest('.detail-sidebar__section') || chapterList.parentElement;

    // ── Login status ──
    var loggedIn = !!(window.AudioHubAccess && typeof window.AudioHubAccess.isMember === 'function' && window.AudioHubAccess.isMember()) || isLoggedIn();

    // ── Chapter data ──
    var storyChapters = Array.isArray(currentStory && currentStory.chapters) ? currentStory.chapters : [];
    var total = storyChapters.length || Number(currentStory && currentStory.chapterCount) || 0;
    // If still 0, count from readingText
    if (!total && currentStory && currentStory.readingText) {
      var chapterMatches = String(currentStory.readingText).match(/^(?:#*\s*)?(?:Chương|Chuong|Chapter)\s+\d+/gim);
      if (chapterMatches) total = chapterMatches.length;
    }
    if (!total) total = 4; // Minimum for demo
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

    // If no chapters data, auto-generate from readingText or chapterTitle
    if (!storyChapters.length) {
      for (var ci = 0; ci < total; ci++) {
        var autoTitle = chapterTitlesFromText[ci] || '';
        storyChapters.push({ chapterNumber: ci + 1, title: autoTitle });
      }
    } else {
      // Fill in missing titles from parsed text
      for (var ti = 0; ti < storyChapters.length; ti++) {
        if (!storyChapters[ti].title && chapterTitlesFromText[ti]) {
          storyChapters[ti].title = chapterTitlesFromText[ti];
        }
      }
    }

    // ── Active chapter index ──
    var activeChapterIndex = 0;
    var currentChapterLabel = context && context.chapterLabel ? String(context.chapterLabel) : '';
    if (currentChapterLabel) {
      var match = currentChapterLabel.match(/(\d+)/);
      if (match) activeChapterIndex = Math.max(0, Math.min(total - 1, Number(match[1]) - 1));
    }

    // ── Build chapter rows ──
    var chapterRows = [];
    for (var i = 0; i < total; i++) {
      var ch = storyChapters[i] || {};
      var chapterNum = ch.chapterNumber || (i + 1);
      var chapterTitle = ch.title || '';
      var isActive = i === activeChapterIndex;

      // Fallback chain: ch.title → parsed from readingText
      if (!chapterTitle && chapterTitlesFromText[i]) {
        chapterTitle = chapterTitlesFromText[i];
      }

      // Show chapter title: "Chương X: title" or "Chương X"
      var displayName = chapterTitle
        ? ('Chương ' + chapterNum + ': ' + chapterTitle)
        : ('Chương ' + chapterNum);

      // ── Lock state: only locked if backend provides chapter data with isFree/isUnlocked ──
      var isLocked = false;
      if (storyChapters.length > 0 && ch.id) {
        var playable = ch.isFree || ch.isUnlocked || (ch.unlockAt && new Date(ch.unlockAt).getTime() <= Date.now());
        isLocked = !playable;
      }

      // ── Dot content ──
      var dotContent = isActive
        ? '<i class="fa-solid fa-play" style="font-size:10px;color:#fff;"></i>'
        : '<span class="chapter-num">' + chapterNum + '</span>';

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

      chapterRows.push(
        '<a href="#chapter-reading" class="chapter-item' + (isActive ? ' active is-active' : '') + (isLocked ? ' is-locked' : '') + '" data-player-chapter="' + escapeHtml(storyTitle || 'Chương ' + chapterNum) + '" data-chapter-index="' + i + '">'
        + '<span class="chapter-dot">' + dotContent + '</span>'
        + '<div class="chapter-item-body">'
        + '<span class="chapter-item-text">' + escapeHtml(displayName) + '</span>'
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
    var allHeadings = document.querySelectorAll('.detail-sidebar .section-heading h2, .mobile-card .mobile-card__heading h2');
    for (var _hi = 0; _hi < allHeadings.length; _hi++) {
      if (allHeadings[_hi].textContent.indexOf('Danh sách chương') >= 0) allHeadings[_hi].innerHTML = '<i class="fa-solid fa-music"></i> Danh sách chương';
    }
    var allCounts = document.querySelectorAll('.detail-sidebar .section-heading span, .mobile-card .mobile-card__heading span');
    for (var _ci2 = 0; _ci2 < allCounts.length; _ci2++) {
      allCounts[_ci2].textContent = total + ' chương';
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

    // For playlist mode, return override state
    if (context && context.playlist && Array.isArray(context.playlist.items)) {
      var chapters = context.playlist.items.map(function (item, index) {
        return {
          label: 'Chương ' + (index + 1),
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
    }
    var audioSubtitle = document.querySelector('.audio-headings p');
    if (audioSubtitle && story.title) audioSubtitle.textContent = story.title;
    if (story.genre) {
      var crumb = document.querySelector('.breadcrumb');
      if (crumb) crumb.innerHTML = '<a href="index.html">Home</a> <span>/</span> <a href="new-posts.html?genre=' + encodeURIComponent(story.genre) + '">' + escapeHtml(story.genre) + '</a> <span>/</span> <a href="new-posts.html">' + escapeHtml(story.title || 'Chi tiết truyện') + '</a>';
    }

    renderStoryMeta(detailStoryNode, story);
    bindStoryCover(story);
    bindStoryAudio(story);
    updateAudioHeadingStoryTitle(story);
    renderRelatedStories(story);
    renderSidebarTrending(story);
  }

  function fetchStoryFromApi(storyId) {
    if (!window.AudioHubApi || typeof window.AudioHubApi.request !== 'function') {
      return Promise.resolve(null);
    }
    if (String(storyId).startsWith('s_')) {
      return Promise.resolve(null);
    }
    return window.AudioHubApi.request('/stories/public/' + encodeURIComponent(storyId), { method: 'GET' })
      .then(function (apiStory) {
        if (!apiStory || !apiStory.id) return null;
        // Cache in localStorage (additive — never overwrites)
        if (window.AudioHubStories && typeof window.AudioHubStories.upsert === 'function') {
          window.AudioHubStories.upsert(apiStory);
        }
        return apiStory;
      })
      .catch(function () { return null; });
  }

  function fetchStoryFromSupabase(storyId) {
    if (!window.AudioHubSupabase || typeof window.AudioHubSupabase.fetchStoryById !== 'function') {
      return Promise.resolve(null);
    }
    if (String(storyId).startsWith('s_')) {
      return Promise.resolve(null);
    }
    return window.AudioHubSupabase.fetchStoryById(storyId)
      .then(function (story) {
        if (story && story.id && window.AudioHubStories && typeof window.AudioHubStories.upsert === 'function') {
          window.AudioHubStories.upsert(story);
        }
        return story;
      })
      .catch(function () { return null; });
  }

  function initPlayer() {
    var storyId = resolveStoryId();

    // STEP 1: Try localStorage (instant)
    var story = initStoryDetailFromStore(storyId);

    if (story && story.id) {
      // Cache hit — render immediately
      bindStoryData(story);
    } else if (storyId && !isSyntheticStoryId(storyId)) {
      // Cache miss — fetch from API, render when ready
      fetchStoryFromApi(storyId).then(function (apiStory) {
        if (apiStory && apiStory.id) {
          var resolved = initStoryDetailFromStore(storyId);
          if (resolved) {
            bindStoryData(resolved);
          } else {
            bindStoryData(apiStory);
          }
        }
      });
    }

    // STEP 2: Always fetch fresh from Supabase in background (update if newer)
    if (storyId && !isSyntheticStoryId(storyId) && window.AudioHubSupabase && window.AudioHubSupabase.isAvailable()) {
      fetchStoryFromSupabase(storyId).then(function (freshStory) {
        if (freshStory && freshStory.id) {
          // Re-render with fresh data
          bindStoryData(freshStory);
        }
      });
    }

    // STEP 2.5: If audioKey is IndexedDB key (a_*), re-upload to Supabase Storage + Render backend
    if (storyId && !isSyntheticStoryId(storyId)) {
      var _sRe = initStoryDetailFromStore(storyId);
      if (_sRe && _sRe.audioKey && String(_sRe.audioKey).indexOf('a_') === 0) {
        var STORAGE_URL_CHK = 'https://oatwyxkzonhjfdzapjyb.supabase.co/storage/v1/object/public/story-audio/';
        var BACKEND_URL_CHK = 'https://audiohub-276v.onrender.com/api/v1/media/audio/' + encodeURIComponent(storyId);
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

        var RENDER_BACKEND_BASE = 'https://audiohub-276v.onrender.com/api/v1';

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

    function runReadingAutoScroll(timestamp) {
      if (!readingAutoScrollActive || !chapterCopyNode) {
        readingAutoScrollRaf = 0;
        return;
      }
      if (!readingAutoScrollLastTime) readingAutoScrollLastTime = timestamp;
      var delta = (timestamp - readingAutoScrollLastTime) / 1000;
      readingAutoScrollLastTime = timestamp;
      var speed = readingAutoScrollPxPerSecond * readingAutoScrollSpeed;
      var distance = speed * Math.max(0, delta);
      chapterCopyNode.scrollTop += Math.max(0.9, distance);
      if (chapterCopyNode.scrollTop + chapterCopyNode.clientHeight >= chapterCopyNode.scrollHeight - 1) {
        stopReadingAutoScroll();
        return;
      }
      readingAutoScrollRaf = window.requestAnimationFrame(runReadingAutoScroll);
    }

    function startReadingAutoScroll() {
      if (!chapterCopyNode || readingAutoScrollActive) return;
      readingAutoScrollActive = true;
      readingAutoScrollLastTime = 0;
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
    });

    if (readingAutoscrollMenu) readingAutoscrollMenu.classList.add('is-hidden');
    if (readingFullscreenButton) readingFullscreenButton.addEventListener('click', toggleReadingFullscreen);

    setReadingAutoScrollSpeed(1);
    applyReadingFont(18);
    applyReadingLine('1.8');
    if (readingThemeButtons[0]) applyReadingTheme(readingThemeButtons[0].getAttribute('data-reading-theme') || '#0f172a,#e5e7eb');

    window.addEventListener('beforeunload', function () { stopReadingAutoScroll(); });

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
    });

    var context = resolvePlaylistContext(storyId || '');
    var overrideState = overrideChapterList(context, story);
    var chapterNodes = Array.prototype.slice.call(document.querySelectorAll('[data-player-chapter]'));

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
      return chapterNodes.findIndex(function (node) {
        return (node.getAttribute('data-player-chapter') || '') === playerState.chapter;
      });
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

    function playNextChapterAuto() {
      var index = currentChapterIndex();
      if (index < 0 || !chapterNodes.length) return false;
      if (playerState.shuffle && chapterNodes.length > 1) {
        var randomIndex = index;
        while (randomIndex === index) {
          randomIndex = Math.floor(Math.random() * chapterNodes.length);
        }
        playChapterAtIndex(randomIndex);
        return true;
      }
      var nextIndex = index + 1;
      if (nextIndex < chapterNodes.length) {
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
      if (index <= 0) {
        if (playerState.repeat && chapterNodes.length) {
          playChapterAtIndex(chapterNodes.length - 1);
          return;
        }
        if (chapterNodes.length) playChapterAtIndex(0);
        return;
      }
      playChapterAtIndex(index - 1);
    }

    setControlActive(shuffleButton, playerState.shuffle);
    setControlActive(repeatButton, playerState.repeat);

    function getNextChapterText(currentIndex) {
      if (!chapterNodes.length) return 'Hết danh sách chương';
      var nextIndex = Number(currentIndex) + 1;
      if (isNaN(nextIndex) || nextIndex < 0 || nextIndex >= chapterNodes.length) {
        return overrideState ? 'Hết danh sách phát' : 'Hết danh sách chương';
      }
      var nextNode = chapterNodes[nextIndex];
      var nextTextNode = nextNode ? nextNode.querySelector('span:last-child') : null;
      var nextText = nextTextNode ? String(nextTextNode.textContent || '').trim() : '';
      if (nextText) return nextText;
      var nextLabel = nextNode ? String(nextNode.getAttribute('data-player-chapter') || '').trim() : '';
      return nextLabel || (overrideState ? 'Hết danh sách phát' : 'Hết danh sách chương');
    }

    if (overrideState && overrideState.chapterLabel) {
      playerState.chapter = overrideState.chapterLabel;
      playerState.next = getNextChapterText(overrideState.activeIndex);
      if (overrideState.chapters[overrideState.activeIndex]) applyStoryOverviewFromPlaylistItem(overrideState.chapters[overrideState.activeIndex]);
    } else if (chapterNodes.length) {
      playerState.chapter = chapterNodes[0].getAttribute('data-player-chapter') || playerState.chapter;
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
      if (playIcon) playIcon.className = playerState.playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
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
      setActive(chapterNodes, playerState.chapter, 'data-player-chapter');

      // Playing state animation
      var playerRoot = document.querySelector('[data-player-root]');
      if (playerRoot) playerRoot.classList.toggle('is-playing', playerState.playing);
    }

    chapterNodes.forEach(function (link, index) {
      link.addEventListener('click', function (event) {
        event.preventDefault();

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
    });

    if (playButton) playButton.addEventListener('click', function () {
      if (nativeAudio && nativeAudio.getAttribute('src')) {
        if (nativeAudio.paused) {
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

      playerState.playing = !playerState.playing;
      renderPlayer();
    });

    function playChapterAtIndex(index) {
      if (!chapterNodes.length) return;
      var safeIndex = Number(index);
      if (isNaN(safeIndex) || safeIndex < 0 || safeIndex >= chapterNodes.length) return;
      var link = chapterNodes[safeIndex];
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
        if (nextStory && String(nextStory.visibility || '').trim() === 'Không công khai' && !isMember()) {
          showAuthRequiredModal();
          renderPlayer();
          return;
        }
      }

      // Update active chapter classes
      chapterNodes.forEach(function (node, idx) {
        node.classList.toggle('active', idx === safeIndex);
        node.classList.toggle('is-active', idx === safeIndex);
        var dot = node.querySelector('.chapter-dot');
        if (dot) dot.innerHTML = idx === safeIndex ? '<i class="fa-solid fa-play" style="font-size:10px;color:#fff;"></i>' : '';
        var oldBadge = node.querySelector('.chapter-playing-badge');
        if (oldBadge) oldBadge.remove();
        if (idx === safeIndex) {
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
        var newUrl = 'story-detail.html?id=' + encodeURIComponent(playlistItem.storyId || '');
        if (overrideState && overrideState.chapters && overrideState.chapters[0]) {
          var playlistId = getQueryParam('playlistId') || '';
          if (playlistId) newUrl += '&playlistId=' + encodeURIComponent(playlistId);
        }
        history.replaceState({}, '', newUrl);
      }

      renderPlayer();

      // Re-fetch audio for the new story
      if (nextStory) {
        bindStoryCover(nextStory);
        bindStoryAudio(nextStory);
        // Wait for audio to load then play
        setTimeout(function () {
          if (nativeAudio) {
            nativeAudio.play().then(function () {
              playerState.playing = true;
              renderPlayer();
            }).catch(function () {
              playerState.playing = false;
              renderPlayer();
            });
          }
        }, 300);
      } else if (nativeAudio && nativeAudio.getAttribute('src')) {
        nativeAudio.currentTime = 0;
        nativeAudio.play().then(function () {
          playerState.playing = true;
          renderPlayer();
        }).catch(function () {
          playerState.playing = false;
          renderPlayer();
        });
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

    speedNodes.forEach(function (button) {
      button.addEventListener('click', function () {
        playerState.speed = button.getAttribute('data-player-speed');
        if (nativeAudio) {
          var numericRate = Number(String(playerState.speed || '1').replace('x', ''));
          if (!isNaN(numericRate) && numericRate > 0) {
            nativeAudio.playbackRate = numericRate;
          }
        }
        renderPlayer();
      });
    });

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
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeSettingsPopover();
    });

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
      document.addEventListener('mousemove', function (e) { if (volDragging) setVolFromEvent(e); });
      document.addEventListener('mouseup', function () { volDragging = false; });
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
      });
    }

    renderPlayer();
  }

  initCommentAccess();
  initPlayer();

  if (window.AudioHubStories && typeof window.AudioHubStories.sync === 'function') {
    window.AudioHubStories.sync();
  }
})();


