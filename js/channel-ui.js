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
  function parseDate(v) { var t = Date.parse(String(v || '')); return isNaN(t) ? 0 : t; }

  // ── Genre colors (must be defined before any code calls genreColor) ──
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

  // ── Load stories ──
  var allStories = [];
  try {
    if (window.AudioHubStories && typeof window.AudioHubStories.read === 'function') {
      allStories = window.AudioHubStories.read() || [];
    } else {
      // Fallback: try user-specific key, then default
      var raw = null;
      try {
        var authRaw = localStorage.getItem('audiohub-auth');
        var auth = authRaw ? JSON.parse(authRaw) : null;
        var uid = auth && (auth.userId || auth.user_id || auth.id);
        if (uid) raw = localStorage.getItem('audiohub-stories-' + uid);
      } catch (e2) {}
      if (!raw) raw = localStorage.getItem('audiohub-stories');
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

  // Handle
  var handleEl = document.querySelector('[data-channel-handle]');
  if (handleEl) {
    var handleSlug = authorName.toLowerCase().replace(/[^a-z0-9]+/g, '').replace(/[^a-z0-9]/g, '');
    handleEl.textContent = '@' + handleSlug;
  }

  // Bio
  var bioEl = document.querySelector('[data-channel-bio]');
  if (bioEl && stories.length) {
    bioEl.textContent = stories[0].authorDesc || 'Chia sẻ những câu chuyện hay, chạm đến cảm xúc.';
  }

  // Compute total chapters
  var totalChapters = 0;
  try {
    var chapStore = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
    stories.forEach(function(s) {
      var chs = Array.isArray(chapStore[s.id]) ? chapStore[s.id] : [];
      totalChapters += chs.length || s.chapterCount || 0;
    });
  } catch (e) {}

  // Stats
  var statsEl = document.querySelector('[data-channel-stats]');
  if (statsEl) {
    statsEl.textContent = fmt(stories.length) + ' truyện • ' + fmt(totalViews) + ' lượt nghe';
  }

  // ── Banner cover ──
  var banner = document.querySelector('[data-channel-banner]');
  if (banner && stories.length && window.AudioHubStoryCover) {
    var bannerKeys = [];
    if (stories[0].coverKey) bannerKeys.push(stories[0].coverKey);
    if (stories[0].id) {
      bannerKeys.push(stories[0].id);
      if (!String(stories[0].id).startsWith('s_')) bannerKeys.push('s_' + stories[0].id);
    }
    function tryBanner(idx) {
      if (idx >= bannerKeys.length) return;
      window.AudioHubStoryCover.get(bannerKeys[idx]).then(function(blob) {
        if (!blob) { tryBanner(idx + 1); return; }
        banner.style.backgroundImage = 'url("' + URL.createObjectURL(blob) + '")';
        banner.style.backgroundSize = 'cover';
        banner.style.backgroundPosition = 'center';
      }).catch(function() { tryBanner(idx + 1); });
    }
    if (bannerKeys.length) tryBanner(0);
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

  // ── Featured (most listened) ──
  if (stories.length) {
    var featured = stories.slice().sort(function(a, b) {
      return (b.listenCount || b.views || 0) - (a.listenCount || a.views || 0);
    })[0];

    var ft = document.querySelector('[data-featured-title]');
    var fm = document.querySelector('[data-featured-meta]');
    var fd = document.querySelector('[data-featured-desc]');
    var fi = document.querySelector('[data-featured-initials]');
    if (ft) ft.textContent = featured.title;

    // Featured meta: listens + chapters
    var featChapters = 0;
    try {
      var _csFeat = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
      featChapters = Array.isArray(_csFeat[featured.id]) ? _csFeat[featured.id].length : (featured.chapterCount || 0);
    } catch (e) {}
    var metaParts = [fmt(featured.listenCount || featured.views) + ' lượt nghe'];
    if (featChapters) metaParts.push(featChapters + ' chương');
    if (fm) fm.textContent = metaParts.join(' • ');
    if (fd) fd.textContent = featured.description || '';
    if (fi) fi.textContent = (featured.title || 'AH').substring(0, 2).toUpperCase();

    // Featured genre tag
    var genreEl = document.querySelector('[data-featured-genre]');
    if (genreEl && featured.genre) {
      genreEl.textContent = featured.genre;
      genreEl.style.background = genreColor(featured.genre);
    }

    // Set featured "Nghe ngay" link
    var featListenBtn = document.querySelector('[data-featured-section] .btn--primary');
    if (featListenBtn && featured.id) {
      featListenBtn.href = 'story-detail?id=' + encodeURIComponent(featured.id);
    }

    if (window.AudioHubStoryCover) {
      var thumb = document.querySelector('.ch-featured__thumb');
      if (thumb) {
        var tryKeys = [];
        if (featured.coverKey) tryKeys.push(featured.coverKey);
        if (featured.id) {
          tryKeys.push(featured.id);
          if (!String(featured.id).startsWith('s_')) tryKeys.push('s_' + featured.id);
        }
        function tryFeatCover(idx) {
          if (idx >= tryKeys.length) {
            // IDB failed — try API fallback for cover_data
            if (featured.id && !String(featured.id).startsWith('s_')) {
              fetch('/api/stories/' + encodeURIComponent(featured.id))
                .then(function(r) { return r.ok ? r.json() : null; })
                .then(function(data) {
                  var coverData = data && (data.cover_data || data.coverData);
                  if (coverData && String(coverData).indexOf('data:') === 0) {
                    thumb.style.backgroundImage = 'url("' + coverData + '")';
                    thumb.style.backgroundSize = 'cover';
                    thumb.style.backgroundPosition = 'center';
                  }
                }).catch(function() {});
            }
            return;
          }
          window.AudioHubStoryCover.get(tryKeys[idx]).then(function(blob) {
            if (!blob) { tryFeatCover(idx + 1); return; }
            thumb.style.backgroundImage = 'url("' + URL.createObjectURL(blob) + '")';
            thumb.style.backgroundSize = 'cover';
            thumb.style.backgroundPosition = 'center';
          }).catch(function() { tryFeatCover(idx + 1); });
        }
        if (tryKeys.length) tryFeatCover(0);
      }
    }

    // Featured favorite
    var featFavBtn = document.querySelector('[data-featured-fav]');
    if (featFavBtn && window.AudioHubLibrary) {
      function updateFeatFav() {
        var isFav = window.AudioHubLibrary.isFavorited(featured);
        featFavBtn.innerHTML = isFav
          ? '<i class="fa-solid fa-heart"></i> Đã yêu thích'
          : '<i class="fa-regular fa-heart"></i> Yêu thích';
      }
      updateFeatFav();
      featFavBtn.addEventListener('click', function(e) {
        e.preventDefault();
        window.AudioHubLibrary.toggleFavorite(featured);
        updateFeatFav();
      });
    }
  }

  // ── Build card ──
  function buildCard(story) {
    var storyId = String(story && story.id || '').trim();
    var href = storyId ? ('story-detail?id=' + encodeURIComponent(storyId)) : '#';
    var title = String(story.title || 'Truyện mới');
    var genre = String(story.genre || 'Khác');
    var author = String(story.author || 'Ẩn danh');
    var visibility = String(story.visibility || 'Công khai');
    var color = genreColor(genre);
    var listens = fmt(story.listenCount || story.views || 0);

    // Chapter count from localStorage
    var chapCount = 0;
    try {
      var _csB = JSON.parse(localStorage.getItem('audiohub-chapters-v1') || '{}');
      chapCount = Array.isArray(_csB[storyId]) ? _csB[storyId].length : (story.chapterCount || 0);
    } catch (e) {}
    var chapLabel = chapCount > 0 ? ('Chương 1 - Chương ' + chapCount) : 'Demo';

    // data-cover: always include storyId so hydrateCovers can find it
    var coverVal = story.coverKey || storyId || '';

    return '<div class="story-card" data-story-id="' + storyId + '" data-story-visibility="' + visibility + '">'
      + '<a href="' + href + '" class="story-card__link">'
      + '<div class="story-card__thumb" data-cover="' + coverVal + '" style="background:linear-gradient(135deg,' + color + ',' + color + 'aa)">'
      + '<span class="story-card__chapters">' + esc(chapLabel) + '</span>'
      + '</div>'
      + '<div class="story-card__body">'
      + '<h2 class="story-title">' + esc(title) + '</h2>'
      + '<p class="story-card__chapters">' + esc(chapLabel) + '</p>'
      + '<div class="story-footer"><span><i class="fa-solid fa-headphones"></i> ' + listens + ' lượt nghe</span></div>'
      + '</div></a>'
      + '<div class="story-card__actions">'
      + '<button type="button" class="story-card__listen" onclick="window.location.href=\'' + href + '\'" aria-label="Nghe ngay"><i class="fa-solid fa-play"></i> Nghe ngay</button>'
      + '<button type="button" class="story-card__fav" data-fav><i class="fa-regular fa-heart"></i> Yêu thích</button>'
      + '</div>'
      + '</div>';
  }

  // ── Hydrate covers ──
  function hydrateCovers(root) {
    root.querySelectorAll('[data-cover]').forEach(function(el) {
      var key = el.getAttribute('data-cover');
      var href = el.closest('a') ? el.closest('a').getAttribute('href') || '' : '';
      // Extract storyId from href as fallback
      var sidMatch = href.match(/id=([^&]*)/);
      var sid = sidMatch ? decodeURIComponent(sidMatch[1]) : '';
      if (!window.AudioHubStoryCover) return;
      var tryKeys = [];
      if (key) tryKeys.push(key);
      if (sid) {
        tryKeys.push(sid);
        if (!String(sid).startsWith('s_')) tryKeys.push('s_' + sid);
      }
      if (!tryKeys.length) return;
      function tryNext(idx) {
        if (idx >= tryKeys.length) {
          // All IDB keys failed — try API fallback
          if (sid && !String(sid).startsWith('s_')) {
            fetch('/api/stories/' + encodeURIComponent(sid))
              .then(function(r) { return r.ok ? r.json() : null; })
              .then(function(data) {
                var coverData = data && (data.cover_data || data.coverData);
                if (coverData && String(coverData).indexOf('data:') === 0) {
                  el.style.backgroundImage = 'url("' + coverData + '")';
                  el.style.backgroundSize = 'cover';
                  el.style.backgroundPosition = 'center';
                  var icon = el.querySelector('i');
                  if (icon) icon.style.display = 'none';
                }
              }).catch(function() {});
          }
          return;
        }
        window.AudioHubStoryCover.get(tryKeys[idx]).then(function(blob) {
          if (!blob) { tryNext(idx + 1); return; }
          var url = URL.createObjectURL(blob);
          el.style.backgroundImage = 'url("' + url + '")';
          el.style.backgroundSize = 'cover';
          el.style.backgroundPosition = 'center';
          var icon = el.querySelector('i');
          if (icon) icon.style.display = 'none';
        }).catch(function() { tryNext(idx + 1); });
      }
      tryNext(0);
    });
  }

  // ── Attach favorite handlers ──
  function attachFavHandlers(root) {
    if (!window.AudioHubLibrary) return;
    root.querySelectorAll('[data-fav]').forEach(function(btn) {
      var card = btn.closest('[data-story-id]');
      var sid = card ? card.getAttribute('data-story-id') : '';
      var story = stories.find(function(s) { return String(s.id) === sid; });
      if (!story) return;
      function updateUI() {
        var isFav = window.AudioHubLibrary.isFavorited(story);
        btn.innerHTML = isFav ? '<i class="fa-solid fa-heart"></i> Đã yêu thích' : '<i class="fa-regular fa-heart"></i> Yêu thích';
        btn.classList.toggle('is-active', isFav);
      }
      updateUI();
      btn.addEventListener('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        window.AudioHubLibrary.toggleFavorite(story);
        updateUI();
      });
    });
  }

  // ── Render grid (single source of truth) ──
  var grid = document.querySelector('[data-stories-grid]');
  function renderGrid(items) {
    if (!grid) return;
    if (!items.length) {
      grid.innerHTML = '<div class="ch-empty"><i class="fa-solid fa-book"></i><p>Không có audio</p></div>';
      return;
    }
    grid.innerHTML = items.map(buildCard).join('');
    hydrateCovers(grid);
    attachFavHandlers(grid);
  }

  // Initial render: newest first
  renderGrid(stories.slice().sort(function(a, b) { return parseDate(b.createdAt) - parseDate(a.createdAt); }));

  // ── Sort ──
  var sortBtns = document.querySelectorAll('.ch-sort-btn');
  sortBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      sortBtns.forEach(function(b) { b.classList.remove('is-active'); });
      btn.classList.add('is-active');
      var type = btn.getAttribute('data-sort');
      var sorted = stories.slice();
      if (type === 'popular') {
        sorted.sort(function(a, b) { return (b.listenCount || b.views || 0) - (a.listenCount || a.views || 0); });
      } else if (type === 'oldest') {
        sorted.sort(function(a, b) { return parseDate(a.createdAt) - parseDate(b.createdAt); });
      } else {
        sorted.sort(function(a, b) { return parseDate(b.createdAt) - parseDate(a.createdAt); });
      }
      renderGrid(sorted);
    });
  });

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

  // ── About ──
  var aboutDesc = document.querySelector('[data-about-desc]');
  var aboutJoined = document.querySelector('[data-about-joined]');
  var aboutViews = document.querySelector('[data-about-views]');
  var aboutAudios = document.querySelector('[data-about-audios]');

  if (aboutDesc && stories.length) aboutDesc.textContent = stories[0].authorDesc || 'Tác giả truyện audio trên AudioHub.';
  if (aboutJoined && stories.length) {
    var oldest = stories.slice().sort(function(a, b) { return parseDate(a.createdAt) - parseDate(b.createdAt); })[0];
    if (oldest.createdAt) aboutJoined.textContent = new Date(oldest.createdAt).toLocaleDateString('vi-VN');
  }
  if (aboutViews) aboutViews.textContent = fmt(totalViews);
  if (aboutAudios) aboutAudios.textContent = totalChapters || stories.length;

  // ── Social links ──
  var socialData = {};
  if (stories.length && stories[0].authorSocials) {
    socialData = stories[0].authorSocials;
  }
  function updateSocialLinks() {
    var fb = document.querySelector('[data-social-facebook]');
    var yt = document.querySelector('[data-social-youtube]');
    var web = document.querySelector('[data-social-website]');
    if (fb) {
      if (socialData.facebook) { fb.href = socialData.facebook; fb.classList.remove('is-empty'); }
      else { fb.classList.add('is-empty'); }
    }
    if (yt) {
      if (socialData.youtube) { yt.href = socialData.youtube; yt.classList.remove('is-empty'); }
      else { yt.classList.add('is-empty'); }
    }
    if (web) {
      if (socialData.website) { web.href = socialData.website; web.classList.remove('is-empty'); }
      else { web.classList.add('is-empty'); }
    }
  }
  updateSocialLinks();

  // ── Edit Profile (owner only) ──
  var editBtn = document.querySelector('[data-edit-profile-btn]');
  var editModal = document.querySelector('[data-edit-profile-modal]');
  var editDesc = document.querySelector('[data-edit-profile-desc]');
  var editFacebook = document.querySelector('[data-edit-profile-facebook]');
  var editYoutube = document.querySelector('[data-edit-profile-youtube]');
  var editWebsite = document.querySelector('[data-edit-profile-website]');
  var editSave = document.querySelector('[data-edit-profile-save]');

  // Check if current user is the owner (check multiple fields)
  var isOwner = false;
  try {
    var authRaw = localStorage.getItem('audiohub-auth-profile');
    var authObj = authRaw ? JSON.parse(authRaw) : null;
    if (authObj) {
      var userName = (authObj.displayName || authObj.name || '').toLowerCase();
      var userEmail = (authObj.email || '').toLowerCase();
      var authorLower = authorName.toLowerCase();
      isOwner = userName === authorLower || userEmail === authorLower;
    }
  } catch (e) {}

  if (isOwner && editBtn) {
    editBtn.classList.remove('is-hidden');
  }

  function openEditModal() {
    if (!editModal) return;
    editDesc.value = aboutDesc ? aboutDesc.textContent : '';
    editFacebook.value = socialData.facebook || '';
    editYoutube.value = socialData.youtube || '';
    editWebsite.value = socialData.website || '';
    editModal.classList.remove('is-hidden');
  }

  function closeEditModal() {
    if (editModal) editModal.classList.add('is-hidden');
  }

  if (editBtn) editBtn.addEventListener('click', openEditModal);
  document.querySelectorAll('[data-edit-profile-close]').forEach(function(el) {
    el.addEventListener('click', closeEditModal);
  });

  if (editSave) {
    editSave.addEventListener('click', function() {
      var newDesc = (editDesc.value || '').trim();
      var newSocials = {
        facebook: (editFacebook.value || '').trim(),
        youtube: (editYoutube.value || '').trim(),
        website: (editWebsite.value || '').trim()
      };

      // Update UI immediately
      if (aboutDesc) aboutDesc.textContent = newDesc || 'Tác giả truyện audio trên AudioHub.';
      socialData = newSocials;
      updateSocialLinks();

      // Save to localStorage (all stories by this author)
      try {
        var allStories = window.AudioHubStories && typeof window.AudioHubStories.read === 'function'
          ? window.AudioHubStories.read() : [];
        allStories.forEach(function(s) {
          if (s.author && s.author.toLowerCase() === authorName.toLowerCase()) {
            s.authorDesc = newDesc;
            s.authorSocials = newSocials;
          }
        });
        if (window.AudioHubStories && typeof window.AudioHubStories.write === 'function') {
          window.AudioHubStories.write(allStories);
        }
      } catch (e) {}

      // Save to API
      if (window.AudioHubApi && typeof window.AudioHubApi.request === 'function') {
        window.AudioHubApi.request('/authors/' + encodeURIComponent(authorName), {
          method: 'PUT',
          body: { authorDesc: newDesc, authorSocials: newSocials }
        }).catch(function(err) {
          console.warn('[channel] Failed to save profile to API:', err);
        });
      }

      closeEditModal();
    });
  }

})();
