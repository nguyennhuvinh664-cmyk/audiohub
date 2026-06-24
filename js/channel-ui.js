(function() {
  'use strict';

  var SUBS_STORAGE_KEY = 'audiohub-channel-subs';
  var urlParams = new URLSearchParams(window.location.search);
  var authorName = urlParams.get('author');

  if (!authorName) {
    console.error('No author parameter found');
    return;
  }

  // ── Helpers ─────────────────────────────────────────────
  function readSubscriptions() {
    try {
      var raw = localStorage.getItem(SUBS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function writeSubscriptions(list) {
    localStorage.setItem(SUBS_STORAGE_KEY, JSON.stringify(list));
  }

  function isSubscribed(author) {
    return readSubscriptions().some(function(a) {
      return a.toLowerCase() === author.toLowerCase();
    });
  }

  function toggleSubscription(author) {
    var list = readSubscriptions();
    var idx = list.findIndex(function(a) {
      return a.toLowerCase() === author.toLowerCase();
    });
    if (idx >= 0) {
      list.splice(idx, 1);
    } else {
      list.push(author);
    }
    writeSubscriptions(list);
    return idx < 0;
  }

  function esc(text) {
    var d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  }

  // ── Load stories ────────────────────────────────────────
  var allStories = [];
  try {
    if (window.AudioHubStories && typeof window.AudioHubStories.read === 'function') {
      allStories = window.AudioHubStories.read() || [];
    } else {
      var stored = localStorage.getItem('audiohub-stories');
      allStories = stored ? JSON.parse(stored) : [];
    }
  } catch (e) { allStories = []; }

  var authorStories = allStories.filter(function(s) {
    return s.author && s.author.toLowerCase() === authorName.toLowerCase();
  });

  // ── Update channel info ─────────────────────────────────
  var channelName = document.querySelector('[data-channel-name]');
  if (channelName) channelName.textContent = authorName;

  var channelStats = document.querySelector('[data-channel-stats]');
  if (channelStats) {
    var totalViews = authorStories.reduce(function(sum, s) { return sum + (s.views || s.listenCount || 0); }, 0);
    channelStats.textContent = totalViews.toLocaleString() + ' lượt nghe · ' + authorStories.length + ' truyện';
  }

  var channelDesc = document.querySelector('[data-channel-desc]');
  if (channelDesc) {
    channelDesc.textContent = authorStories[0] ? (authorStories[0].authorDesc || 'Tác giả truyện audio trên AudioHub.') : 'Tác giả truyện audio trên AudioHub.';
  }

  var channelInitials = document.querySelector('[data-channel-initials]');
  if (channelInitials) {
    var words = authorName.split(' ');
    channelInitials.textContent = words.map(function(w) { return w[0]; }).join('').toUpperCase().slice(0, 2);
  }

  // ── Banner ──────────────────────────────────────────────
  var banner = document.querySelector('[data-channel-banner]');
  if (banner && authorStories.length > 0 && authorStories[0].coverKey && window.AudioHubStoryCover) {
    window.AudioHubStoryCover.get(authorStories[0].coverKey).then(function(blob) {
      if (blob) {
        var url = URL.createObjectURL(blob);
        banner.style.backgroundImage = 'url("' + url + '")';
        banner.style.backgroundSize = 'cover';
        banner.style.backgroundPosition = 'center';
      }
    }).catch(function() {});
  }

  // ── Subscribe ───────────────────────────────────────────
  var subscribeBtn = document.querySelector('.subscribe-btn');
  var bellBtn = document.querySelector('.channel-actions .icon-btn');

  function updateSubscribeUI() {
    if (!subscribeBtn) return;
    var sub = isSubscribed(authorName);
    subscribeBtn.textContent = sub ? 'Đã đăng ký' : 'Đăng ký';
    subscribeBtn.classList.toggle('subscribed', sub);
    if (bellBtn) bellBtn.classList.toggle('subscribed', sub);
  }

  if (subscribeBtn) {
    subscribeBtn.addEventListener('click', function() {
      toggleSubscription(authorName);
      updateSubscribeUI();
    });
  }

  if (bellBtn) {
    bellBtn.addEventListener('click', function() {
      if (subscribeBtn) subscribeBtn.click();
    });
  }

  updateSubscribeUI();

  // ── Featured ────────────────────────────────────────────
  var featured = document.querySelector('[data-featured]');
  if (featured && authorStories.length > 0) {
    var first = authorStories[0];
    var ft = featured.querySelector('[data-featured-title]');
    var fm = featured.querySelector('[data-featured-meta]');
    var fd = featured.querySelector('[data-featured-desc]');
    var fi = featured.querySelector('[data-featured-initials]');

    if (ft) ft.textContent = first.title;
    if (fm) fm.textContent = (first.views || first.listenCount || 0).toLocaleString() + ' lượt nghe · ' + (first.date || 'Gần đây');
    if (fd) fd.textContent = first.description || '';
    if (fi) fi.textContent = (first.title || 'TH').substring(0, 2).toUpperCase();

    // Cover
    if (first.coverKey && window.AudioHubStoryCover) {
      var thumb = featured.querySelector('.ch-featured__thumb');
      if (thumb) {
        window.AudioHubStoryCover.get(first.coverKey).then(function(blob) {
          if (blob) {
            thumb.style.backgroundImage = 'url("' + URL.createObjectURL(blob) + '")';
            thumb.style.backgroundSize = 'cover';
            thumb.style.backgroundPosition = 'center';
          }
        }).catch(function() {});
      }
    }
  }

  // ── Grid (home tab) ─────────────────────────────────────
  var grid = document.querySelector('[data-audios-grid]');
  if (grid) {
    if (authorStories.length === 0) {
      grid.innerHTML = '<div class="ch-empty"><i class="fa-solid fa-book"></i><p>Tác giả chưa có truyện nào</p></div>';
    } else {
      grid.innerHTML = authorStories.map(function(s) {
        var ini = (s.title || 'TH').substring(0, 2).toUpperCase();
        var views = (s.views || s.listenCount || 0).toLocaleString();
        return '<a href="story-detail.html?id=' + encodeURIComponent(s.id) + '" class="ch-card">'
          + '<div class="ch-card__thumb" data-cover="' + (s.coverKey || '') + '">'
          + '<span>' + ini + '</span>'
          + (s.duration ? '<div class="ch-card__duration">' + s.duration + '</div>' : '')
          + '</div>'
          + '<div class="ch-card__body">'
          + '<h4 class="ch-card__title">' + esc(s.title) + '</h4>'
          + '<p class="ch-card__meta">' + views + ' lượt nghe · ' + (s.date || 'Gần đây') + '</p>'
          + '</div></a>';
      }).join('');

      hydrateCovers(grid);
    }
  }

  // ── List (audios tab) ───────────────────────────────────
  var listEl = document.querySelector('[data-audios-list]');

  function renderList(stories, container) {
    if (!container) return;
    if (stories.length === 0) {
      container.innerHTML = '<div class="ch-empty"><i class="fa-solid fa-book"></i><p>Tác giả chưa có truyện nào</p></div>';
      return;
    }
    container.innerHTML = stories.map(function(s) {
      var ini = (s.title || 'TH').substring(0, 2).toUpperCase();
      var views = (s.views || s.listenCount || 0).toLocaleString();
      return '<a href="story-detail.html?id=' + encodeURIComponent(s.id) + '" class="ch-row">'
        + '<div class="ch-row__thumb" data-cover="' + (s.coverKey || '') + '">'
        + '<span>' + ini + '</span>'
        + '</div>'
        + '<div class="ch-row__info">'
        + '<h4 class="ch-row__title">' + esc(s.title) + '</h4>'
        + '<p class="ch-row__meta">' + views + ' lượt nghe · ' + (s.date || 'Gần đây') + '</p>'
        + '<p class="ch-row__desc">' + esc(s.description || '') + '</p>'
        + '</div></a>';
    }).join('');

    hydrateCovers(container);
  }

  if (listEl) renderList(authorStories, listEl);

  // ── Cover hydration ─────────────────────────────────────
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

  // ── Tabs ────────────────────────────────────────────────
  var tabBtns = document.querySelectorAll('.channel-tab');
  var tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      var tab = btn.getAttribute('data-tab');
      tabBtns.forEach(function(b) { b.classList.remove('active'); });
      tabContents.forEach(function(c) { c.classList.remove('active'); });
      btn.classList.add('active');
      var content = document.querySelector('[data-tab-content="' + tab + '"]');
      if (content) content.classList.add('active');
    });
  });

  // ── Sort ────────────────────────────────────────────────
  var sortBtns = document.querySelectorAll('.ch-sort-btn');
  sortBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      sortBtns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var type = btn.textContent.toLowerCase();
      var sorted = authorStories.slice();
      if (type === 'phổ biến') sorted.sort(function(a, b) { return (b.views || b.listenCount || 0) - (a.views || a.listenCount || 0); });
      else if (type === 'cũ nhất') sorted.reverse();
      renderList(sorted, listEl);
    });
  });

  // ── Play All ────────────────────────────────────────────
  var playAllBtn = document.querySelector('.play-all-btn');
  if (playAllBtn) {
    playAllBtn.addEventListener('click', function() {
      if (authorStories.length > 0) {
        window.location.href = 'story-detail.html?id=' + encodeURIComponent(authorStories[0].id);
      }
    });
  }

  // ── Search ──────────────────────────────────────────────
  var searchInput = document.querySelector('.header__inner input[type="text"], .header__inner input[type="search"]');
  var searchBtn = document.querySelector('.header__inner .btn--primary');

  function doSearch() {
    var q = searchInput ? searchInput.value.trim() : '';
    if (q) window.location.href = 'new-posts.html?q=' + encodeURIComponent(q);
  }

  if (searchInput) searchInput.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
  if (searchBtn) searchBtn.addEventListener('click', doSearch);

  // ── About ───────────────────────────────────────────────
  var aboutDesc = document.querySelector('[data-about-desc]');
  var aboutJoined = document.querySelector('[data-about-joined]');
  var aboutViews = document.querySelector('[data-about-views]');

  if (aboutDesc && authorStories.length > 0) {
    aboutDesc.textContent = authorStories[0].authorDesc || 'Tác giả truyện audio trên AudioHub.';
  }

  if (aboutJoined && authorStories.length > 0) {
    var oldest = authorStories.slice().sort(function(a, b) { return new Date(a.createdAt || 0) - new Date(b.createdAt || 0); })[0];
    if (oldest.createdAt) aboutJoined.textContent = new Date(oldest.createdAt).toLocaleDateString('vi-VN');
  }

  if (aboutViews) {
    aboutViews.textContent = authorStories.reduce(function(sum, s) { return sum + (s.views || s.listenCount || 0); }, 0).toLocaleString();
  }

})();
