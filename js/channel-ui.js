(function() {
  'use strict';

  // ── Config ──────────────────────────────────────────────
  var SUBS_STORAGE_KEY = 'audiohub-channel-subs';

  // ── URL params ──────────────────────────────────────────
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
    var list = readSubscriptions();
    return list.some(function(a) {
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
    return idx < 0; // true = now subscribed
  }

  function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
  } catch (e) {
    console.error('Error loading stories:', e);
    allStories = [];
  }

  var authorStories = allStories.filter(function(story) {
    return story.author && story.author.toLowerCase() === authorName.toLowerCase();
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
    var initials = words.map(function(w) { return w[0]; }).join('').toUpperCase().slice(0, 2);
    channelInitials.textContent = initials;
  }

  // ── Banner enhancement ──────────────────────────────────
  var banner = document.querySelector('[data-channel-banner]');
  if (banner && authorStories.length > 0) {
    var firstStory = authorStories[0];
    if (firstStory.coverKey && window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function') {
      window.AudioHubStoryCover.get(firstStory.coverKey).then(function(blob) {
        if (blob) {
          var url = URL.createObjectURL(blob);
          banner.style.backgroundImage = 'url("' + url + '")';
          banner.style.backgroundSize = 'cover';
          banner.style.backgroundPosition = 'center';
        }
      }).catch(function() {});
    }
  }

  // ── Subscribe button ────────────────────────────────────
  var subscribeBtn = document.querySelector('.subscribe-btn');
  var bellBtn = document.querySelector('.channel-actions .icon-btn');

  function updateSubscribeUI() {
    if (!subscribeBtn) return;
    var subscribed = isSubscribed(authorName);
    subscribeBtn.textContent = subscribed ? 'Đã đăng ký' : 'Đăng ký';
    subscribeBtn.classList.toggle('subscribed', subscribed);
    if (bellBtn) {
      bellBtn.classList.toggle('subscribed', subscribed);
    }
  }

  if (subscribeBtn) {
    subscribeBtn.addEventListener('click', function() {
      var nowSubscribed = toggleSubscription(authorName);
      updateSubscribeUI();
      // Update stats
      if (channelStats) {
        var subCount = readSubscriptions().length;
        var storyCount = authorStories.length;
        var totalViews = authorStories.reduce(function(sum, s) { return sum + (s.views || s.listenCount || 0); }, 0);
        channelStats.textContent = totalViews.toLocaleString() + ' lượt nghe · ' + storyCount + ' truyện';
      }
    });
  }

  if (bellBtn) {
    bellBtn.addEventListener('click', function() {
      if (subscribeBtn) subscribeBtn.click();
    });
  }

  updateSubscribeUI();

  // ── Header avatar from auth state ───────────────────────
  function updateHeaderAvatar() {
    var avatarContainer = document.querySelector('.channel-auth-container');
    if (!avatarContainer) return;

    // Check if auth-state.js already rendered something
    if (avatarContainer.querySelector('.auth-menu')) return;

    var profile = null;
    try {
      var raw = localStorage.getItem('audiohub-demo-auth');
      var parsed = raw ? JSON.parse(raw) : null;
      if (parsed && parsed.isLoggedIn) {
        profile = parsed;
      }
    } catch (e) {}

    if (profile) {
      var name = profile.name || 'User';
      var initials = profile.initials || name.split(' ').map(function(w) { return w[0]; }).join('').toUpperCase().slice(0, 2);
      var avatarHtml = '<a href="account.html" class="avatar-btn channel-avatar-link" title="' + escapeHtml(name) + '"><span>' + escapeHtml(initials) + '</span></a>';
      avatarContainer.innerHTML = avatarHtml;

      // Apply avatar image if available
      var avatarKey = 'audiohub-account-avatar-v1';
      var avatarDataUrl = localStorage.getItem(avatarKey);
      if (avatarDataUrl) {
        var avatarEl = avatarContainer.querySelector('.avatar-btn');
        if (avatarEl) {
          avatarEl.style.backgroundImage = 'url("' + avatarDataUrl.replace(/"/g, '&quot;') + '")';
          avatarEl.style.backgroundSize = 'cover';
          avatarEl.style.backgroundPosition = 'center';
          avatarEl.querySelector('span').textContent = '';
        }
      }
    } else {
      avatarContainer.innerHTML = '<a href="login.html" class="avatar-btn channel-avatar-link"><span><i class="fa-solid fa-user"></i></span></a>';
    }
  }

  // Wait for auth-state.js to potentially render, then fallback
  setTimeout(updateHeaderAvatar, 100);
  setTimeout(updateHeaderAvatar, 400);

  // ── Render featured audio ───────────────────────────────
  var featured = document.querySelector('[data-featured]');
  if (featured && authorStories.length > 0) {
    var first = authorStories[0];
    var featuredTitle = featured.querySelector('[data-featured-title]');
    var featuredMeta = featured.querySelector('[data-featured-meta]');
    var featuredDesc = featured.querySelector('[data-featured-desc]');
    var featuredThumb = featured.querySelector('.audio-thumb');

    if (featuredTitle) featuredTitle.textContent = first.title;
    if (featuredMeta) {
      var views = first.views || first.listenCount || 0;
      featuredMeta.textContent = views.toLocaleString() + ' lượt nghe · ' + (first.date || 'Gần đây');
    }
    if (featuredDesc) featuredDesc.textContent = first.description || '';
    if (featuredThumb) {
      var featuredInitials = (first.title || 'TH').substring(0, 2).toUpperCase();
      // Update thumb placeholder
      var thumbSpan = featuredThumb.querySelector('span');
      if (thumbSpan) thumbSpan.textContent = featuredInitials;

      // Hydrate cover
      if (first.coverKey && window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function') {
        window.AudioHubStoryCover.get(first.coverKey).then(function(blob) {
          if (blob) {
            var url = URL.createObjectURL(blob);
            featuredThumb.style.backgroundImage = 'url("' + url + '")';
            featuredThumb.style.backgroundSize = 'cover';
            featuredThumb.style.backgroundPosition = 'center';
          }
        }).catch(function() {});
      }
    }
  }

  // ── Render audios grid (home tab) ───────────────────────
  var audiosGrid = document.querySelector('[data-audios-grid]');
  if (audiosGrid) {
    if (authorStories.length === 0) {
      audiosGrid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-book"></i><p>Tác giả chưa có truyện nào</p></div>';
    } else {
      var gridHtml = authorStories.map(function(story) {
        var initials = (story.title || 'TH').substring(0, 2).toUpperCase();
        var views = story.views || story.listenCount || 0;
        return '<a href="story-detail.html?id=' + encodeURIComponent(story.id) + '" class="audio-card">'
          + '<div class="card-thumb" data-cover-key="' + (story.coverKey || '') + '">'
          + '<span>' + initials + '</span>'
          + (story.duration ? '<div class="duration">' + story.duration + '</div>' : '')
          + '</div>'
          + '<div class="card-info">'
          + '<h4>' + escapeHtml(story.title) + '</h4>'
          + '<p class="card-meta">' + views.toLocaleString() + ' lượt nghe · ' + (story.date || 'Gần đây') + '</p>'
          + '</div></a>';
      }).join('');
      audiosGrid.innerHTML = gridHtml;

      // Hydrate covers
      if (window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function') {
        audiosGrid.querySelectorAll('.card-thumb[data-cover-key]').forEach(function(thumb) {
          var coverKey = thumb.getAttribute('data-cover-key');
          if (!coverKey) return;
          window.AudioHubStoryCover.get(coverKey).then(function(blob) {
            if (blob) {
              var url = URL.createObjectURL(blob);
              thumb.style.backgroundImage = 'url("' + url + '")';
              thumb.style.backgroundSize = 'cover';
              thumb.style.backgroundPosition = 'center';
            }
          }).catch(function() {});
        });
      }
    }
  }

  // ── Render audios list (audios tab) ─────────────────────
  var audiosList = document.querySelector('[data-audios-list]');

  function renderAudiosList(stories, container) {
    if (!container) return;
    if (stories.length === 0) {
      container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-book"></i><p>Tác giả chưa có truyện nào</p></div>';
      return;
    }
    var listHtml = stories.map(function(story) {
      var initials = (story.title || 'TH').substring(0, 2).toUpperCase();
      var views = story.views || story.listenCount || 0;
      return '<a href="story-detail.html?id=' + encodeURIComponent(story.id) + '" class="audio-row">'
        + '<div class="row-thumb" data-cover-key="' + (story.coverKey || '') + '">'
        + '<span>' + initials + '</span>'
        + (story.duration ? '<div class="duration">' + story.duration + '</div>' : '')
        + '</div>'
        + '<div class="row-info">'
        + '<h4>' + escapeHtml(story.title) + '</h4>'
        + '<p class="row-meta">' + views.toLocaleString() + ' lượt nghe · ' + (story.date || 'Gần đây') + '</p>'
        + '<p class="row-desc">' + escapeHtml(story.description || '') + '</p>'
        + '</div></a>';
    }).join('');
    container.innerHTML = listHtml;

    // Hydrate covers
    if (window.AudioHubStoryCover && typeof window.AudioHubStoryCover.get === 'function') {
      container.querySelectorAll('.row-thumb[data-cover-key]').forEach(function(thumb) {
        var coverKey = thumb.getAttribute('data-cover-key');
        if (!coverKey) return;
        window.AudioHubStoryCover.get(coverKey).then(function(blob) {
          if (blob) {
            var url = URL.createObjectURL(blob);
            thumb.style.backgroundImage = 'url("' + url + '")';
            thumb.style.backgroundSize = 'cover';
            thumb.style.backgroundPosition = 'center';
          }
        }).catch(function() {});
      });
    }
  }

  if (audiosList) {
    renderAudiosList(authorStories, audiosList);
  }

  // ── Tab switching ───────────────────────────────────────
  var tabBtns = document.querySelectorAll('.tab-btn');
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

  // ── Sort functionality ──────────────────────────────────
  var sortBtns = document.querySelectorAll('.sort-btn');
  sortBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      sortBtns.forEach(function(b) { b.classList.remove('active'); });
      btn.classList.add('active');
      var sortType = btn.textContent.toLowerCase();
      var sorted = authorStories.slice();
      if (sortType === 'phổ biến') {
        sorted.sort(function(a, b) { return (b.views || b.listenCount || 0) - (a.views || a.listenCount || 0); });
      } else if (sortType === 'cũ nhất') {
        sorted.reverse();
      }
      renderAudiosList(sorted, audiosList);
    });
  });

  // ── Play All button ─────────────────────────────────────
  var playAllBtn = document.querySelector('.play-all-btn');
  if (playAllBtn) {
    playAllBtn.addEventListener('click', function() {
      if (authorStories.length > 0) {
        window.location.href = 'story-detail.html?id=' + encodeURIComponent(authorStories[0].id);
      }
    });
  }

  // ── Search functionality ────────────────────────────────
  var searchInput = document.querySelector('.header-search input');
  var searchBtn = document.querySelector('.header-search button');

  function doSearch() {
    var query = searchInput ? searchInput.value.trim() : '';
    if (query) {
      window.location.href = 'new-posts.html?q=' + encodeURIComponent(query);
    }
  }

  if (searchInput) {
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        doSearch();
      }
    });
  }

  if (searchBtn) {
    searchBtn.addEventListener('click', doSearch);
  }

  // ── About section ───────────────────────────────────────
  var aboutDesc = document.querySelector('[data-about-desc]');
  var aboutJoined = document.querySelector('[data-about-joined]');
  var aboutViews = document.querySelector('[data-about-views]');

  if (aboutDesc && authorStories.length > 0) {
    aboutDesc.textContent = authorStories[0].authorDesc || 'Tác giả truyện audio trên AudioHub.';
  }

  if (aboutJoined && authorStories.length > 0) {
    var oldestStory = authorStories.slice().sort(function(a, b) {
      return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
    })[0];
    if (oldestStory.createdAt) {
      var date = new Date(oldestStory.createdAt);
      aboutJoined.textContent = date.toLocaleDateString('vi-VN');
    }
  }

  if (aboutViews) {
    var totalViews = authorStories.reduce(function(sum, s) { return sum + (s.views || s.listenCount || 0); }, 0);
    aboutViews.textContent = totalViews.toLocaleString();
  }

})();
