(function () {
  var grid = document.querySelector('.cgrid');
  if (!grid) {
    return;
  }

  if (!window.AudioHubStories || typeof window.AudioHubStories.read !== 'function') {
    return;
  }

  function makeInitials(title) {
    var words = String(title || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) {
      return 'AH';
    }
    var first = words[0] ? words[0][0] : '';
    var last = words.length > 1 ? words[words.length - 1][0] : '';
    var initials = (first + last).toUpperCase();
    return initials || 'AH';
  }

  function setThumbImage(thumb, story) {
    if (!thumb || !story || !story.coverKey) {
      return;
    }

    if (!window.AudioHubStoryCover || typeof window.AudioHubStoryCover.get !== 'function') {
      return;
    }

    window.AudioHubStoryCover.get(story.coverKey)
      .then(function (blob) {
        if (!blob) {
          return;
        }
        try {
          var url = URL.createObjectURL(blob);
          thumb.style.backgroundImage = 'url("' + url + '")';
          thumb.style.backgroundSize = 'cover';
          thumb.style.backgroundPosition = 'center';
        } catch (error) {
        }
      })
      .catch(function () {
      });
  }

  function setCard(card, story) {
    if (!card || !story) {
      return;
    }

    card.href = 'story-detail.html?id=' + encodeURIComponent(story.id);
    card.setAttribute('data-story-id', String(story.id || ''));
    card.setAttribute('data-story-visibility', String(story.visibility || ''));

    var nameNode = card.querySelector('.sc__nm');
    if (nameNode) {
      nameNode.textContent = story.title || 'Truyện mới';
    }

    var genreNode = card.querySelector('.sc__genre');
    if (genreNode) {
      genreNode.textContent = story.genre || 'Khác';
    }

    var authorNode = card.querySelector('.sc__author');
    if (authorNode) {
      authorNode.innerHTML = '<i class="fa-regular fa-user"></i> ' + (story.author || 'Ẩn danh');
    }

    var thumb = card.querySelector('.sc__th');
    if (thumb) {
      setThumbImage(thumb, story);

      var si = thumb.querySelector('.si');
      if (si) {
        si.textContent = makeInitials(story.title);
      }

      var badge = thumb.querySelector('.bx');
      if (badge) {
        badge.textContent = 'Demo';
      } else {
        var span = document.createElement('span');
        span.className = 'bx bn';
        span.textContent = 'Demo';
        thumb.insertBefore(span, thumb.firstChild);
      }
    }
  }

  var genreSelect = document.querySelector('[data-home-genre-select]');

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
      var hidden = dropdownMenu.classList.toggle('is-hidden');
      dropdownTrigger.setAttribute('aria-expanded', hidden ? 'false' : 'true');
    });

    dropdownItems.forEach(function (item) {
      item.addEventListener('click', function () {
        var value = String(item.getAttribute('data-genre-value') || '');
        genreSelect.value = value;
        dropdownItems.forEach(function (entry) { entry.classList.remove('is-active'); });
        item.classList.add('is-active');
        dropdownTrigger.innerHTML = (value || 'Thể loại') + ' <i class="fa-solid fa-chevron-down"></i>';
        dropdownMenu.classList.add('is-hidden');
        dropdownTrigger.setAttribute('aria-expanded', 'false');
        renderHomeStories();
      });
    });

    document.addEventListener('click', function (event) {
      var target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('[data-home-genre-dropdown]')) return;
      dropdownMenu.classList.add('is-hidden');
      dropdownTrigger.setAttribute('aria-expanded', 'false');
    });
  }

  function parseTime(value) {
    var time = Date.parse(String(value || ''));
    return isNaN(time) ? 0 : time;
  }

  function pickTrendingStories(stories) {
    return stories.slice().sort(function (a, b) {
      var diff = Number(b.listenCount2d || 0) - Number(a.listenCount2d || 0);
      if (diff !== 0) return diff;
      return parseTime(b.updatedAt || b.createdAt) - parseTime(a.updatedAt || a.createdAt);
    });
  }

  function pickPopularStories(stories) {
    return stories.slice().sort(function (a, b) {
      var diff7d = Number(b.listenCount7d || 0) - Number(a.listenCount7d || 0);
      if (diff7d !== 0) return diff7d;
      return Number(b.listenCount || 0) - Number(a.listenCount || 0);
    });
  }

  function isCompletedStory(story) {
    if (!story) return false;
    if (story.isCompleted === true) return true;
    var status = String(story.status || '').trim().toLowerCase();
    return status === 'hoàn thành' || status === 'hoan thanh' || status === 'completed' || status === 'full';
  }

  function pickCompletedStories(stories) {
    try {
      var raw = window.localStorage.getItem('audiohub-playlists-v1');
      var playlists = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(playlists)) return [];
      var storyMap = {};
      (stories || []).forEach(function (story) {
        if (story && story.id) {
          storyMap[String(story.id)] = story;
        }
      });

      var firstChapterStories = [];
      playlists.forEach(function (playlist) {
        var status = String(playlist && playlist.status || '').trim();
        if (status !== 'Đã hoàn thành') return;
        var items = Array.isArray(playlist && playlist.items) ? playlist.items : [];
        if (!items.length) return;
        var firstItem = items[0];
        var storyId = firstItem && firstItem.storyId ? String(firstItem.storyId).trim() : '';
        if (!storyId || !storyMap[storyId]) return;

        var baseStory = storyMap[storyId];
        var playlistName = String(playlist && playlist.name || '').trim();
        var displayStory = Object.assign({}, baseStory);
        if (playlistName) {
          displayStory.title = playlistName;
        }

        firstChapterStories.push(displayStory);
      });

      return firstChapterStories.sort(function (a, b) {
        var diff7d = Number(b.listenCount7d || 0) - Number(a.listenCount7d || 0);
        if (diff7d !== 0) return diff7d;
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

  function isPublicVisibility(story) {
    var visibility = String(story && story.visibility || '').trim().toLowerCase();
    return !visibility || visibility === 'công khai' || visibility === 'public';
  }

  function loadStoriesForHome() {
    var localStories = window.AudioHubStories.read() || [];
    var localPublic = localStories.filter(function (story) { return isPublicVisibility(story); });
    if (localPublic.length) {
      return Promise.resolve(localStories);
    }

    return fetchPublicStories().then(function (publicStories) {
      return publicStories.length ? publicStories : localStories;
    });
  }

  function renderFallbackSections() {
    var fallbackStories = buildFallbackStories(12);
    renderCardList(document.querySelector('.cgrid'), fallbackStories);
    renderTrendingList(document.querySelector('[data-home-trending-list]'), fallbackStories.slice(0, 12));
    renderCardList(document.querySelector('[data-home-popular-grid]'), fallbackStories);
    renderCardList(document.querySelector('[data-home-completed-grid]'), fallbackStories);
  }

  function renderHomeStoriesFrom(stories) {
    if (!stories || !stories.length) {
      renderFallbackSections();
      return;
    }

    var publicStories = stories.filter(function (story) {
      return isPublicVisibility(story);
    });

    if (!publicStories.length) {
      renderFallbackSections();
      return;
    }

    var selectedGenre = genreSelect ? String(genreSelect.value || '').trim() : '';
    var newStoriesBase = publicStories.slice().sort(function (a, b) {
      return parseTime(b.createdAt) - parseTime(a.createdAt);
    });

    var newStories = selectedGenre
      ? newStoriesBase.filter(function (story) { return String(story && story.genre || '').trim() === selectedGenre; })
      : newStoriesBase;

    if (!newStories.length) {
      newStories = newStoriesBase;
    }

    var completedStories = pickCompletedStories(publicStories);
    if (!completedStories.length) {
      completedStories = publicStories.filter(isCompletedStory).sort(function (a, b) {
        var diff7d = Number(b.listenCount7d || 0) - Number(a.listenCount7d || 0);
        if (diff7d !== 0) return diff7d;
        return parseTime(b.updatedAt || b.createdAt) - parseTime(a.updatedAt || a.createdAt);
      });
    }
    if (!completedStories.length) {
      completedStories = pickPopularStories(publicStories);
    }

    renderCardList(document.querySelector('.cgrid'), newStories.slice(0, 12));
    renderTrendingList(document.querySelector('[data-home-trending-list]'), pickTrendingStories(publicStories).slice(0, 12));
    renderCardList(document.querySelector('[data-home-popular-grid]'), pickPopularStories(publicStories).slice(0, 12));
    renderCardList(document.querySelector('[data-home-completed-grid]'), completedStories.slice(0, 12));

    if (canUsePlaylistApi()) {
      window.AudioHubApi.request('/playlists', { method: 'GET' })
        .then(function (rows) {
          var derived = deriveCompletedStoriesFromPlaylists(publicStories, rows);
          if (derived.length) {
            renderCardList(document.querySelector('[data-home-completed-grid]'), derived.slice(0, 12));
          }
        })
        .catch(function () {});
    }
  }

  function renderHomeStories() {
    loadStoriesForHome().then(function (stories) {
      renderHomeStoriesFrom(stories);
    });
  }

  function normalizePlaylistStatus(value) {
    return String(value || '').trim() === 'Đã hoàn thành' ? 'Đã hoàn thành' : 'Đang ra';
  }

  function deriveCompletedStoriesFromPlaylists(stories, playlists) {
    var storyMap = {};
    (stories || []).forEach(function (story) {
      if (story && story.id) storyMap[String(story.id)] = story;
    });

    var firstChapterStories = [];
    (Array.isArray(playlists) ? playlists : []).forEach(function (playlist) {
      if (normalizePlaylistStatus(playlist && playlist.status) !== 'Đã hoàn thành') return;
      var items = Array.isArray(playlist && playlist.items) ? playlist.items : [];
      if (!items.length) return;
      var firstItem = items[0];
      var storyId = firstItem && firstItem.storyId ? String(firstItem.storyId).trim() : '';
      var matchedStory = storyId ? storyMap[storyId] : null;
      if (!matchedStory) {
        var firstTitle = String(firstItem && firstItem.storyTitle || '').trim().toLowerCase();
        if (firstTitle) {
          matchedStory = (stories || []).find(function (story) {
            return String(story && story.title || '').trim().toLowerCase() === firstTitle;
          }) || null;
        }
      }
      var playlistName = String(playlist && playlist.name || '').trim();
      if (!matchedStory) {
        var fallbackTitle = playlistName || String(firstItem && firstItem.storyTitle || 'Playlist hoàn thành').trim();
        var fallbackAuthor = String(firstItem && firstItem.storyAuthor || 'AudioHub').trim();
        firstChapterStories.push({
          id: storyId || ('playlist-' + String(playlist && playlist.id || 'x')),
          title: fallbackTitle,
          author: fallbackAuthor,
          genre: 'Playlist',
          coverKey: '',
          visibility: 'Công khai',
          listenCount7d: 0,
          listenCount: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        return;
      }
      var displayStory = Object.assign({}, matchedStory);
      if (playlistName) displayStory.title = playlistName;
      firstChapterStories.push(displayStory);
    });

    return firstChapterStories.sort(function (a, b) {
      return parseTime(b.updatedAt || b.createdAt) - parseTime(a.updatedAt || a.createdAt);
    });
  }

  function setTrendingItem(item, story, rank, maxScore) {
    if (!item || !story) return;
    item.href = 'story-detail.html?id=' + encodeURIComponent(story.id);
    item.setAttribute('data-story-id', String(story.id || ''));
    item.setAttribute('data-story-visibility', String(story.visibility || ''));

    var rankNode = item.querySelector('.trk');
    if (rankNode) rankNode.textContent = String(rank);

    var thumbNode = item.querySelector('.tth');
    if (thumbNode) {
      thumbNode.textContent = makeInitials(story.title);
      setThumbImage(thumbNode, story);
    }

    var nameNode = item.querySelector('.tnm');
    if (nameNode) nameNode.textContent = story.title || 'Truyện mới';

    var metaNode = item.querySelector('.tmt');
    if (metaNode) metaNode.textContent = (story.genre || 'Khác') + ' • ' + Number(story.listenCount2d || 0) + ' lượt nghe (2 ngày)';

    var fillNode = item.querySelector('.tfill');
    if (fillNode) {
      var score = Number(story.listenCount2d || 0);
      var width = maxScore > 0 ? Math.max(10, Math.round(score * 100 / maxScore)) : 10;
      fillNode.style.width = width + '%';
    }
  }

  function buildHomeCardHtml(story) {
    var storyId = String(story && story.id || '').trim();
    var href = storyId ? ('story-detail.html?id=' + encodeURIComponent(storyId)) : '#';
    var title = String(story.title || 'Truyện mới');
    var genre = String(story.genre || 'Khác');
    var author = String(story.author || 'Ẩn danh');
    var initials = makeInitials(title);
    var visibility = String(story.visibility || 'Công khai');

    return '<a href="' + href + '" class="sc" data-story-id="' + String(story.id || '') + '" data-story-visibility="' + visibility + '">'
      + '<div class="sc__th">'
      + '<span class="bx bn">Demo</span>'
      + '<span class="si">' + initials + '</span>'
      + '<div class="pov"><i class="fa-solid fa-play"></i></div>'
      + '</div>'
      + '<div class="sc__in">'
      + '<p class="sc__genre">' + genre + '</p>'
      + '<p class="sc__nm">' + title + '</p>'
      + '<p class="sc__author"><i class="fa-regular fa-user"></i> ' + author + '</p>'
      + '</div></a>';
  }

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
      setTrendingItem(item, list[idx], idx + 1, maxScore);
    });
  }

  function renderHomeStories() {
    var stories = window.AudioHubStories.read();
    if (!stories || !stories.length) {
      return;
    }

    var publicStories = stories.filter(function (story) {
      var visibility = String(story && story.visibility || '').trim();
      return visibility === 'Công khai' || visibility === 'PUBLIC' || visibility === '';
    });

    if (!publicStories.length) {
      return;
    }

    var selectedGenre = genreSelect ? String(genreSelect.value || '').trim() : '';
    var newStoriesBase = publicStories.slice().sort(function (a, b) {
      return parseTime(b.createdAt) - parseTime(a.createdAt);
    });

    var newStories = selectedGenre
      ? newStoriesBase.filter(function (story) { return String(story && story.genre || '').trim() === selectedGenre; })
      : newStoriesBase;

    if (!newStories.length) {
      newStories = newStoriesBase;
    }

    var completedStories = pickCompletedStories(publicStories);
    if (!completedStories.length) {
      completedStories = publicStories.filter(isCompletedStory).sort(function (a, b) {
        var diff7d = Number(b.listenCount7d || 0) - Number(a.listenCount7d || 0);
        if (diff7d !== 0) return diff7d;
        return parseTime(b.updatedAt || b.createdAt) - parseTime(a.updatedAt || a.createdAt);
      });
    }
    if (!completedStories.length) {
      completedStories = pickPopularStories(publicStories);
    }

    renderCardList(document.querySelector('.cgrid'), newStories.slice(0, 6));
    renderTrendingList(document.querySelector('[data-home-trending-list]'), pickTrendingStories(publicStories).slice(0, 6));
    renderCardList(document.querySelector('[data-home-popular-grid]'), pickPopularStories(publicStories).slice(0, 6));
    renderCardList(document.querySelector('[data-home-completed-grid]'), completedStories.slice(0, 6));

    if (canUsePlaylistApi()) {
      window.AudioHubApi.request('/playlists', { method: 'GET' })
        .then(function (rows) {
          var derived = deriveCompletedStoriesFromPlaylists(publicStories, rows);
          if (derived.length) {
            renderCardList(document.querySelector('[data-home-completed-grid]'), derived.slice(0, 6));
          }
        })
        .catch(function () {});
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

  grid.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    var card = target.closest('a.sc, a.ti');
    if (!card) return;

    var visibility = String(card.getAttribute('data-story-visibility') || '').trim();
    if (visibility === 'Không công khai' && !isMember()) {
      event.preventDefault();
      showLoginRequiredModal();
      return;
    }

    var href = String(card.getAttribute('href') || '').trim();
    if (!href || href === 'story-detail.html' || href.indexOf('story-detail.html?id=') < 0) {
      var storyId = String(card.getAttribute('data-story-id') || '').trim();
      if (storyId) {
        card.setAttribute('href', 'story-detail.html?id=' + encodeURIComponent(storyId));
      } else {
        event.preventDefault();
      }
    }
  });

  bindHomeGenreDropdown();
  renderHomeStories();
  window.addEventListener('audiohub:stories-updated', renderHomeStories);
  if (typeof window.AudioHubStories.sync === 'function') {
    window.AudioHubStories.sync();
  }
})();
