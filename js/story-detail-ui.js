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
    var href = 'new-posts.html?hashtag=' + encodeURIComponent(cleanTag);
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

  if (window.AudioHubStories && typeof window.AudioHubStories.sync === 'function') {
    window.AudioHubStories.sync();
  }

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
      if (!pl || !Array.isArray(pl.items)) return false;
      var idx = pl.items.findIndex(function (item) { return item && String(item.storyId || '') === String(storyId); });
      if (idx < 0) return false;
      chosen = pl;
      chosenIndex = idx;
      return true;
    });

    if (!chosen) {
      playlists.some(function (pl) {
        if (!pl || !Array.isArray(pl.items)) return false;
        var idx = pl.items.findIndex(function (item) { return item && String(item.storyId || '') === String(storyId); });
        if (idx < 0) return false;
        chosen = pl;
        chosenIndex = idx;
        return true;
      });
    }

    if (!chosen || chosenIndex < 0) return null;

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
      var raw = window.localStorage.getItem('audiohub-demo-auth');
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
      var raw = window.localStorage.getItem('audiohub-demo-auth');
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
    var chapterHeading = document.querySelector('.detail-sidebar .section-heading h3');
    var total = Math.max(6, Number(story && story.chapterCount) || 12);
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
    storyNode.setAttribute('href', 'story-detail.html?id=' + encodeURIComponent(String(story.id || '')));

    var titleNode = storyNode.querySelector('.detail-title');
    if (titleNode && story.title) titleNode.textContent = story.title;
    if (story.title) document.title = story.title + ' | AudioHub';

    if (story.genre) {
      var crumb = document.querySelector('.breadcrumb');
      if (crumb) crumb.innerHTML = '<a href="index.html">Home</a> <span>/</span> <a href="categories.html">' + story.genre + '</a> <span>/</span> <a href="new-posts.html">' + (story.title || 'Chi tiết truyện') + '</a>';
    }

    var meta = storyNode.querySelector('.detail-meta');
    if (meta) {
      var authorSpan = meta.querySelector('span');
      if (authorSpan) authorSpan.innerHTML = '<i class="fa-regular fa-user"></i> ' + escapeHtml(story.author || 'áº¨n danh');
    }
    renderStoryMeta(storyNode, story);

    var copy = storyNode.querySelector('.detail-copy');
    if (copy && story.description) {
      copy.innerHTML = buildStoryDescriptionHtml(story);
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
    var coverNode = document.querySelector('.audio-cover');
    if (!coverNode) return;

    var coverKey = story && story.coverKey ? String(story.coverKey) : '';
    if (!coverKey || !window.AudioHubStoryCover || typeof window.AudioHubStoryCover.get !== 'function') return;

    window.AudioHubStoryCover.get(coverKey)
      .then(function (blob) {
        if (!blob) return;
        try {
          var prev = coverUrlByNode.get(coverNode);
          if (prev) {
            URL.revokeObjectURL(prev);
          }
          var coverUrl = URL.createObjectURL(blob);
          coverUrlByNode.set(coverNode, coverUrl);
          coverNode.style.backgroundImage = 'url("' + coverUrl + '")';
          coverNode.style.backgroundSize = 'cover';
          coverNode.style.backgroundPosition = 'center';
        } catch (error) {}
      })
      .catch(function () {});
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
      var spans = meta.querySelectorAll('span');
      if (spans && spans[0]) spans[0].innerHTML = '<i class="fa-regular fa-user"></i> ' + escapeHtml(story.author || 'áº¨n danh');
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

    var stories = pickTrendingStories(window.AudioHubStories.read() || []).slice(0, 12);

    if (!stories.length) {
      list.innerHTML = '';
      return;
    }

    list.innerHTML = stories.map(function (item) {
      var title = escapeHtml(String(item.title || 'Truyện'));
      var views2d = Number(item.listenCount2d || 0);
      var href = 'story-detail.html?id=' + encodeURIComponent(String(item.id || ''));
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
      var author = escapeHtml(String(item.author || 'áº¨n danh'));
      var href = 'story-detail.html?id=' + encodeURIComponent(String(item.id));
      var coverKey = escapeHtml(String(item.coverKey || ''));
      var visibility = escapeHtml(String(item.visibility || ''));
      var storyId = escapeHtml(String(item.id || ''));
      return '<a href="' + href + '" class="story-card" data-related-story-id="' + storyId + '" data-related-visibility="' + visibility + '">'
        + '<div class="story-card__thumb" data-related-cover-key="' + coverKey + '">'
        + '<button class="story-fav" type="button" aria-label="Yêu thích" aria-pressed="false"><i class="fa-regular fa-heart"></i></button>'
        + '<span class="story-chapters">Demo</span>'
        + '</div>'
        + '<div class="story-card__body"><div class="story-meta"><span>' + genre + '</span><span><i class="fa-regular fa-eye"></i> — views</span></div>'
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

    var audioKey = story && story.audioKey ? String(story.audioKey) : '';
    if (!audioKey || !window.AudioHubStoryAudio || typeof window.AudioHubStoryAudio.get !== 'function') {
      showNote('Chưa có file audio cho truyện này.');
      return;
    }

    window.AudioHubStoryAudio.get(audioKey)
      .then(function (blob) {
        if (!blob) {
          showNote('Không tìm thấy file audio đã lưu.');
          return;
        }
        try {
          var audioUrl = URL.createObjectURL(blob);
          audioUrlByNode.set(audioNode, audioUrl);
          audioNode.src = audioUrl;
          audioNode.classList.remove('is-hidden');
        } catch (error) {
          showNote('Không thể tải file audio đã lưu.');
        }
      })
      .catch(function () {
        showNote('Không thể tải file audio đã lưu.');
      });
  }

  function overrideChapterList(context, currentStory) {
    var chapterList = document.querySelector('.chapter-list');
    if (!chapterList) return null;

    var chapterCountNode = document.querySelector('.detail-sidebar .section-heading span');
    var chapterHeading = document.querySelector('.detail-sidebar .section-heading h3');

    if (context && context.playlist && Array.isArray(context.playlist.items)) {
      var chapters = context.playlist.items.map(function (item, index) {
        return {
          label: item && item.chapterLabel ? String(item.chapterLabel) : ('Chương ' + (index + 1)),
          storyId: item && item.storyId ? String(item.storyId) : '',
          storyTitle: item && item.storyTitle ? String(item.storyTitle) : '',
          index: typeof item.chapterIndex === 'number' ? item.chapterIndex : index
        };
      });

      var activeIndex = chapters.findIndex(function (chapter) { return String(chapter.label) === String(context.chapterLabel); });
      if (activeIndex < 0) activeIndex = context.chapterIndex;
      if (activeIndex < 0 || activeIndex >= chapters.length) activeIndex = 0;

      chapterList.innerHTML = chapters.map(function (chapter, idx) {
        var text = chapter.storyTitle ? (chapter.label + ': ' + chapter.storyTitle) : chapter.label;
        return '<a href="#chapter-reading" class="chapter-item' + (idx === activeIndex ? ' active is-active' : '') + '" data-player-chapter="' + escapeHtml(chapter.label) + '" data-player-story-id="' + escapeHtml(chapter.storyId || '') + '"><span class="chapter-dot"></span><span>' + escapeHtml(text) + '</span></a>';
      }).join('');

      if (chapterHeading) chapterHeading.innerHTML = '<i class="fa-solid fa-music"></i> Danh sách chương';
      if (chapterCountNode) chapterCountNode.textContent = chapters.length + ' chương';

      return { chapters: chapters, activeIndex: activeIndex, chapterLabel: chapters[activeIndex] ? chapters[activeIndex].label : 'Chương 1' };
    }

    var stories = window.AudioHubStories && typeof window.AudioHubStories.read === 'function' ? window.AudioHubStories.read() : [];
    var genre = currentStory && currentStory.genre ? String(currentStory.genre) : '';
    var currentId = currentStory && currentStory.id ? String(currentStory.id) : '';
    var recommendations = (stories || []).filter(function (item) {
      if (!item || !item.id) return false;
      if (currentId && String(item.id) === currentId) return false;
      if (!genre) return true;
      return String(item.genre || '') === genre;
    }).slice(0, 12);

    chapterList.innerHTML = recommendations.length
      ? recommendations.map(function (item) {
          return '<a href="story-detail.html?id=' + encodeURIComponent(String(item.id)) + '" class="chapter-item">'
            + '<span class="chapter-dot"></span><span>' + escapeHtml(String(item.title || 'Truyện')) + '</span></a>';
        }).join('')
      : '<div class="chapter-item"><span class="chapter-dot"></span><span>Chưa có truyện cùng thể loại.</span></div>';

    if (chapterHeading) chapterHeading.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i> Gợi ý cùng thể loại';
    if (chapterCountNode) chapterCountNode.textContent = recommendations.length + ' truyện';

    return null;
  }

  function isLoggedIn() {
    try {
      var raw = window.localStorage.getItem('audiohub-demo-auth');
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
        var raw = window.localStorage.getItem('audiohub-demo-auth');
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

  function scheduleStoryDetailRetry(storyId, attempt) {
    var safeAttempt = Number(attempt) || 0;
    if (!storyId || safeAttempt > 3) return;
    window.setTimeout(function () {
      var resolved = initStoryDetailFromStore(storyId);
      if (!resolved && safeAttempt < 3) {
        scheduleStoryDetailRetry(storyId, safeAttempt + 1);
      }
    }, safeAttempt === 0 ? 120 : 450);
  }

  function initPlayer() {
    var storyId = getQueryParam('id');
    if (storyId) {
      storyId = String(storyId).trim();
    }
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
    var story = initStoryDetailFromStore(storyId);
    if (!story && storyId && !isSyntheticStoryId(storyId)) {
      markPendingStorySync(storyId);
      scheduleStoryDetailRetry(storyId, 0);
    }
    if (story && story.id) {
      trackStoryListen(story.id);
      story = window.AudioHubStories && typeof window.AudioHubStories.getById === 'function'
        ? window.AudioHubStories.getById(String(story.id))
        : story;
      var detailStoryNode = document.querySelector('[data-detail-story]');
      renderStoryMeta(detailStoryNode, story);
    }
    bindStoryCover(story);
    bindStoryAudio(story);
    updateAudioHeadingStoryTitle(story);
    renderRelatedStories(story);
    renderSidebarTrending(story);

    var playButton = document.querySelector('[data-player-toggle]');
    var playIcon = playButton ? playButton.querySelector('i') : null;
    var nativeAudio = document.querySelector('[data-story-audio]');
    var stateNode = document.querySelector('[data-player-state]');
    var progressFill = document.querySelector('[data-player-progress-fill]');
    var progressText = document.querySelector('[data-player-progress-text]');
    var chapterLabelNode = document.querySelector('[data-player-current-chapter]');
    var nextTitleNode = document.querySelector('.audio-nextup__title');
    var nextMetaNode = document.querySelector('.audio-nextup__meta');
    var speedNodes = Array.prototype.slice.call(document.querySelectorAll('[data-player-speed]'));
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
      if (stateNode) stateNode.textContent = playerState.playing ? 'Đang phát' : 'Tạm dừng';
      if (playIcon) playIcon.className = playerState.playing ? 'fa-solid fa-pause' : 'fa-solid fa-play';
      if (progressFill) progressFill.style.width = playerState.progress + '%';
      if (progressText) progressText.textContent = 'Tiếp tục từ ' + playerState.progress + '%';
      if (chapterLabelNode) chapterLabelNode.textContent = playerState.chapter;
      if (nextTitleNode) nextTitleNode.textContent = playerState.next;
      if (nextMetaNode) nextMetaNode.textContent = overrideState
        ? 'Tự động lấy chương kế tiếp từ playlist hiện tại.'
        : 'Tự động lấy chương kế tiếp từ danh sách chương hiện tại.';
      if (speedValue) speedValue.textContent = playerState.speed;
      if (volumeValue) volumeValue.textContent = playerState.volume;
      if (volumeSlider) volumeSlider.value = playerState.volume.replace('%', '');
      setActive(speedNodes, playerState.speed, 'data-player-speed');
      setActive(chapterNodes, playerState.chapter, 'data-player-chapter');
    }

    var chapterListRoot = document.querySelector('.chapter-list');
    if (chapterListRoot) {
      chapterListRoot.addEventListener('click', function (event) {
        var target = event.target;
        if (!(target instanceof Element)) return;
        var link = target.closest('a.chapter-item');
        if (!link) return;

        var href = String(link.getAttribute('href') || '');
        var currentStoryId = story && story.id ? String(story.id) : '';
        var linkedStoryId = String(link.getAttribute('data-player-story-id') || '').trim();

        if (!linkedStoryId && href.indexOf('story-detail.html') >= 0) {
          var match = href.match(/[?&]id=([^&]+)/);
          if (match && match[1]) {
            try { linkedStoryId = decodeURIComponent(match[1]); } catch (error) { linkedStoryId = match[1]; }
          }
        }

        var isDifferentStory = !!(linkedStoryId && currentStoryId && linkedStoryId !== currentStoryId);
        if (isDifferentStory && !isMember()) {
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
          showAuthRequiredModal();
        }
      }, true);
    }

    chapterNodes.forEach(function (link, index) {
      link.addEventListener('click', function (event) {
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
          event.preventDefault();
          showAuthRequiredModal();
          return;
        }

        if (linkedStory && String(linkedStory.visibility || '').trim() === 'Không công khai' && !isMember()) {
          event.preventDefault();
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

      if (overrideState && Array.isArray(overrideState.chapters) && overrideState.chapters[safeIndex]) {
        var playlistItem = overrideState.chapters[safeIndex];
        var nextStory = null;
        if (playlistItem.storyId && window.AudioHubStories && typeof window.AudioHubStories.getById === 'function') {
          nextStory = window.AudioHubStories.getById(String(playlistItem.storyId));
        }
        if (nextStory && String(nextStory.visibility || '').trim() === 'Không công khai' && !isMember()) {
          showAuthRequiredModal();
          renderPlayer();
          return;
        }
      }

      playerState.chapter = link.getAttribute('data-player-chapter') || playerState.chapter;
      playerState.progress = safeIndex === 0 ? 36 : 12 * (safeIndex + 1);
      playerState.next = getNextChapterText(safeIndex);
      playerState.playing = false;
      if (overrideState && Array.isArray(overrideState.chapters) && overrideState.chapters[safeIndex]) {
        applyStoryOverviewFromPlaylistItem(overrideState.chapters[safeIndex]);
      }
      renderPlayer();
      if (nativeAudio && nativeAudio.getAttribute('src')) {
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

    if (settingsToggle && settingsMenu) {
      settingsToggle.addEventListener('click', function () {
        var hidden = settingsMenu.classList.toggle('is-hidden');
        settingsToggle.setAttribute('aria-expanded', hidden ? 'false' : 'true');
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


