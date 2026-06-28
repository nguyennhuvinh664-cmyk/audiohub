(function() {
  'use strict';

  var SUBS_KEY = 'audiohub-channel-subs';
  var params = new URLSearchParams(window.location.search);
  var authorName = params.get('author');
  if (!authorName) return;

  // ── Helpers ──
  function readSubs() { try { return JSON.parse(localStorage.getItem(SUBS_KEY) || '[]'); } catch (e) { return []; } }
  function writeSubs(list) { localStorage.setItem(SUBS_KEY, JSON.stringify(list)); }
  function isSubbed(a) { return readSubs().some(function(s) { return s.toLowerCase() === a.toLowerCase(); }); }
  function toggleSub(a) {
    var list = readSubs(); var idx = list.findIndex(function(s) { return s.toLowerCase() === a.toLowerCase(); });
    if (idx >= 0) list.splice(idx, 1); else list.push(a);
    writeSubs(list); return idx < 0;
  }
  function esc(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
  function fmt(n) { return (n || 0).toLocaleString(); }

  // ── Load stories ──
  var allStories = [];
  try {
    if (window.AudioHubStories && typeof window.AudioHubStories.read === 'function') {
      allStories = window.AudioHubStories.read() || [];
    } else {
      var raw = localStorage.getItem('audiohub-stories');
      allStories = raw ? JSON.parse(raw) : [];
    }
  } catch (e) { allStories = []; }

  var stories = allStories.filter(function(s) {
    return s.author && s.author.toLowerCase() === authorName.toLowerCase();
  });

  var totalViews = stories.reduce(function(sum, s) { return sum + (s.listenCount || s.views || 0); }, 0);

  // ── Channel info ──
  var nameEl = document.querySelector('[data-channel-name]');
  if (nameEl) nameEl.textContent = authorName;

  var initials = authorName.split(' ').map(function(w) { return w[0]; }).join('').toUpperCase().slice(0, 2);
  var iniEl = document.querySelector('[data-channel-initials]');
  if (iniEl) iniEl.textContent = initials;

  // Stats in header
  var statsEl = document.querySelector('[data-channel-stats]');
  if (statsEl) {
    statsEl.innerHTML =
      '<div class="ch-stat"><strong>' + fmt(totalViews) + '</strong><span>Lượt nghe</span></div>' +
      '<div class="ch-stat"><strong>' + stories.length + '</strong><span>Audio</span></div>' +
      '<div class="ch-stat"><strong>0</strong><span>Playlist</span></div>' +
      '<div class="ch-stat"><strong>0</strong><span>Follower</span></div>';
  }

  // Stats cards (home tab)
  var sl = document.querySelector('[data-stat-listens]');
  var sa = document.querySelector('[data-stat-audios]');
  var sp = document.querySelector('[data-stat-playlists]');
  var sf = document.querySelector('[data-stat-followers]');
  if (sl) sl.textContent = fmt(totalViews);
  if (sa) sa.textContent = stories.length;
  if (sp) sp.textContent = '0';
  if (sf) sf.textContent = '0';

  // ── Banner cover ──
  var banner = document.querySelector('[data-channel-banner]');
  if (banner && stories.length && stories[0].coverKey && window.AudioHubStoryCover) {
    window.AudioHubStoryCover.get(stories[0].coverKey).then(function(blob) {
      if (blob) { banner.style.backgroundImage = 'url("' + URL.createObjectURL(blob) + '")'; banner.style.backgroundSize = 'cover'; banner.style.backgroundPosition = 'center'; }
    }).catch(function() {});
  }

  // ── Subscribe ──
  var subBtn = document.querySelector('[data-subscribe-btn]');
  var subBtnActive = document.querySelector('[data-subscribe-btn-subscribed]');
  function updateSubUI() {
    var sub = isSubbed(authorName);
    if (subBtn) subBtn.style.display = sub ? 'none' : '';
    if (subBtnActive) subBtnActive.style.display = sub ? '' : 'none';
  }
  if (subBtn) subBtn.addEventListener('click', function() { toggleSub(authorName); updateSubUI(); });
  if (subBtnActive) subBtnActive.addEventListener('click', function() { toggleSub(authorName); updateSubUI(); });
  updateSubUI();

  // ── Featured ──
  if (stories.length) {
    var first = stories[0];
    var ft = document.querySelector('[data-featured-title]');
    var fm = document.querySelector('[data-featured-meta]');
    var fd = document.querySelector('[data-featured-desc]');
    var fi = document.querySelector('[data-featured-initials]');
    if (ft) ft.textContent = first.title;
    if (fm) fm.textContent = fmt(first.listenCount || first.views) + ' lượt nghe';
    if (fd) fd.textContent = first.description || '';
    if (fi) fi.textContent = (first.title || 'AH').substring(0, 2).toUpperCase();

    if (first.coverKey && window.AudioHubStoryCover) {
      var thumb = document.querySelector('.ch-featured__thumb');
      if (thumb) {
        window.AudioHubStoryCover.get(first.coverKey).then(function(blob) {
          if (blob) { thumb.style.backgroundImage = 'url("' + URL.createObjectURL(blob) + '")'; thumb.style.backgroundSize = 'cover'; thumb.style.backgroundPosition = 'center'; }
        }).catch(function() {});
      }
    }
  }

  // ── Grid (home) ──
  var grid = document.querySelector('[data-audios-grid]');
  if (grid) {
    if (!stories.length) {
      grid.innerHTML = '<div class="ch-empty"><i class="fa-solid fa-book"></i><p>Tác giả chưa có audio nào</p></div>';
    } else {
      grid.innerHTML = stories.slice(0, 8).map(function(s) { return buildStoryCard(s); }).join('');
      hydrateCovers(grid);
    }
  }

  // ── Genre colors (same as homepage) ──
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
  function genreColor(genre) { return genreColors[String(genre || '').trim().toLowerCase()] || '#334155'; }
  function makeInitials(title) { return String(title || 'AH').split(/\s+/).filter(Boolean).slice(0, 2).map(function(w) { return w[0]; }).join('').toUpperCase(); }

  // ── Build homepage-style card ──
  function buildStoryCard(story) {
    var storyId = String(story && story.id || '').trim();
    var href = storyId ? ('story-detail.html?id=' + encodeURIComponent(storyId)) : '#';
    var title = String(story.title || 'Truyện mới');
    var genre = String(story.genre || 'Khác');
    var author = String(story.author || 'Ẩn danh');
    var visibility = String(story.visibility || 'Công khai');
    var color = genreColor(genre);

    return '<div class="story-card" data-story-id="' + storyId + '" data-story-visibility="' + visibility + '">'
      + '<a href="' + href + '" class="story-card__link">'
      + '<div class="story-card__thumb" data-cover="' + (story.coverKey || '') + '" style="background:linear-gradient(135deg,' + color + ',' + color + 'aa)">'
      + '<span class="story-chapters">Demo</span>'
      + '</div>'
      + '<div class="story-card__body">'
      + '<div class="story-meta"><span>' + esc(genre) + '</span><span><i class="fa-regular fa-eye"></i> ' + fmt(story.listenCount || story.views) + '</span></div>'
      + '<h2 class="story-title">' + esc(title) + '</h2>'
      + '<div class="story-footer"><span><i class="fa-regular fa-user"></i> ' + esc(author) + '</span><span class="story-rating"><i class="fa-solid fa-star"></i> —</span></div>'
      + '<div class="story-card__actions">'
      + '<a href="' + href + '" class="story-card__listen"><i class="fa-solid fa-play"></i> Nghe ngay</a>'
      + '<button type="button" class="story-card__fav" data-fav><i class="fa-regular fa-heart"></i> Yêu thích</button>'
      + '</div>'
      + '</div></a></div>';
  }

  // ── List (audios tab) ──
  var listEl = document.querySelector('[data-audios-list]');
  function renderList(items) {
    if (!listEl) return;
    if (!items.length) { listEl.innerHTML = '<div class="ch-empty"><i class="fa-solid fa-book"></i><p>Không có audio</p></div>'; return; }
    listEl.innerHTML = items.map(function(s) { return buildStoryCard(s); }).join('');
    hydrateCovers(listEl);
  }
  renderList(stories);

  // ── Covers ──
  function hydrateCovers(root) {
    if (!window.AudioHubStoryCover) return;
    root.querySelectorAll('[data-cover]').forEach(function(el) {
      var key = el.getAttribute('data-cover');
      if (!key) return;
      window.AudioHubStoryCover.get(key).then(function(blob) {
        if (!blob) return;
        var url = URL.createObjectURL(blob);
        el.style.backgroundImage = 'url("' + url + '")';
        el.style.backgroundSize = 'cover';
        el.style.backgroundPosition = 'center';
      }).catch(function() {});
    });
  }

  // ── Tabs ──
  var tabBtns = document.querySelectorAll('.ch-tab');
  var tabContents = document.querySelectorAll('.ch-tab-content');
  tabBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tab = btn.getAttribute('data-tab');
      tabBtns.forEach(function(b) { b.classList.remove('is-active'); });
      tabContents.forEach(function(c) { c.classList.remove('is-active'); c.hidden = true; });
      btn.classList.add('is-active');
      var content = document.querySelector('[data-tab-content="' + tab + '"]');
      if (content) { content.classList.add('is-active'); content.hidden = false; }
    });
  });

  // Tab link from home
  document.querySelectorAll('[data-tab-link]').forEach(function(link) {
    link.addEventListener('click', function(e) {
      e.preventDefault();
      var tab = link.getAttribute('data-tab-link');
      var btn = document.querySelector('[data-tab="' + tab + '"]');
      if (btn) btn.click();
    });
  });

  // ── Sort ──
  var sortBtns = document.querySelectorAll('.ch-sort-btn');
  sortBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      sortBtns.forEach(function(b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
      var type = btn.getAttribute('data-sort');
      var sorted = stories.slice();
      if (type === 'popular') sorted.sort(function(a, b) { return (b.listenCount || b.views || 0) - (a.listenCount || a.views || 0); });
      else if (type === 'oldest') sorted.reverse();
      renderList(sorted);
    });
  });

  // ── About ──
  var aboutDesc = document.querySelector('[data-about-desc]');
  var aboutJoined = document.querySelector('[data-about-joined]');
  var aboutViews = document.querySelector('[data-about-views]');
  var aboutAudios = document.querySelector('[data-about-audios]');
  var aboutPlaylists = document.querySelector('[data-about-playlists]');

  if (aboutDesc && stories.length) aboutDesc.textContent = stories[0].authorDesc || 'Tác giả truyện audio trên AudioHub.';
  if (aboutJoined && stories.length) {
    var oldest = stories.slice().sort(function(a, b) { return new Date(a.createdAt || 0) - new Date(b.createdAt || 0); })[0];
    if (oldest.createdAt) aboutJoined.textContent = new Date(oldest.createdAt).toLocaleDateString('vi-VN');
  }
  if (aboutViews) aboutViews.textContent = fmt(totalViews);
  if (aboutAudios) aboutAudios.textContent = stories.length;
  if (aboutPlaylists) aboutPlaylists.textContent = '0';

  // ── Mobile nav ──
  var navToggle = document.querySelector('[data-nav-toggle]');
  var navDrawer = document.querySelector('[data-nav-drawer]');
  var navOverlay = document.querySelector('[data-nav-overlay]');
  var navClose = document.querySelector('[data-nav-close]');
  function openNav() { if (navDrawer) navDrawer.classList.add('is-open'); if (navOverlay) navOverlay.classList.add('is-open'); document.body.style.overflow = 'hidden'; }
  function closeNav() { if (navDrawer) navDrawer.classList.remove('is-open'); if (navOverlay) navOverlay.classList.remove('is-open'); document.body.style.overflow = ''; }
  if (navToggle) navToggle.addEventListener('click', openNav);
  if (navClose) navClose.addEventListener('click', closeNav);
  if (navOverlay) navOverlay.addEventListener('click', closeNav);

})();
