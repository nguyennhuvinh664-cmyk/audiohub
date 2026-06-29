/**
 * AudioHub Developer Mode
 * ─────────────────────────
 * DEV_MODE = true   → activates
 * DEV_MODE = false  → completely disabled, no DOM injected
 *
 * Remove this file + dev-mode.css + dev-mode-config.js before production.
 */
(function () {
  'use strict';

  /* ═══ GATE: Only run when DEV_MODE is true ═══ */
  if (typeof window.DEV_MODE === 'undefined' || window.DEV_MODE !== true) return;

  /* ═══ HELPERS ═══ */
  var $ = function (s, p) { return (p || document).querySelector(s); };
  var $$ = function (s, p) { return (p || document).querySelectorAll(s); };
  function esc(t) { var d = document.createElement('div'); d.textContent = t; return d.innerHTML; }

  /* ═══ TOAST ═══ */
  var toastTimer;
  function showToast(msg) {
    var el = $('#dm-toast');
    if (!el) return;
    el.textContent = msg;
    el.style.display = '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.style.display = 'none'; }, 2500);
  }

  /* ═══ AUTH HELPERS ═══ */
  var AUTH_KEY = 'audiohub-demo-auth';
  var LIB_KEY = 'audiohub-library';
  var WALLET_KEY = 'audiohub-wallet-v1';
  var PL_KEY = 'audiohub-playlists-v1';

  var defaultProfiles = {
    visitor: null,
    user: { isLoggedIn: true, name: 'Anh Ngoc', email: 'anhngoc@audiohub.vn', initials: 'AN', tier: 'Hoi vien Kim Cuong' },
    admin: { isLoggedIn: true, name: 'Admin AudioHub', email: 'admin@audiohub.vn', initials: 'AD', tier: 'Quan tri vien', isAdmin: true }
  };

  function getAuth() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { return null; }
  }
  function setAuth(data) {
    if (data) localStorage.setItem(AUTH_KEY, JSON.stringify(data));
    else localStorage.removeItem(AUTH_KEY);
  }
  function getWallet() {
    try { return JSON.parse(localStorage.getItem(WALLET_KEY)) || { balance: 0, transactions: [] }; }
    catch (e) { return { balance: 0, transactions: [] }; }
  }
  function saveWallet(w) { localStorage.setItem(WALLET_KEY, JSON.stringify(w)); }
  function getLibrary() {
    try { return JSON.parse(localStorage.getItem(LIB_KEY)) || { favorites: [], history: [] }; }
    catch (e) { return { favorites: [], history: [] }; }
  }
  function saveLibrary(l) { localStorage.setItem(LIB_KEY, JSON.stringify(l)); }

  /* ═══ DETECT CURRENT ROLE ═══ */
  function detectRole() {
    var auth = getAuth();
    if (!auth) return 'visitor';
    if (auth.isAdmin) return 'admin';
    return 'user';
  }

  /* ═══ BUILD DOM ═══ */
  // FAB button
  var fab = document.createElement('button');
  fab.className = 'dm-fab';
  fab.id = 'dm-fab';
  fab.innerHTML = '<i class="fa-solid fa-bug"></i> Developer Mode';

  // Backdrop
  var backdrop = document.createElement('div');
  backdrop.className = 'dm-backdrop';
  backdrop.id = 'dm-backdrop';

  // Drawer
  var drawer = document.createElement('div');
  drawer.className = 'dm-drawer';
  drawer.id = 'dm-drawer';

  function buildDrawerHTML() {
    var role = detectRole();
    var auth = getAuth();
    var wallet = getWallet();
    var lib = getLibrary();
    var w = window.innerWidth;
    var h = window.innerHeight;

    return ''
      /* Header */
      + '<div class="dm-header">'
      + '<div class="dm-header__title"><i class="fa-solid fa-bug"></i> Developer Mode</div>'
      + '<button class="dm-header__close" id="dm-close"><i class="fa-solid fa-xmark"></i></button>'
      + '</div>'

      + '<div class="dm-body">'

      /* ── 1. Role Switcher ── */
      + '<div class="dm-section">'
      + '<div class="dm-section__title"><i class="fa-solid fa-users"></i> Chuyen Role</div>'
      + '<div class="dm-roles">'
      + '<button class="dm-role-btn' + (role === 'visitor' ? ' is-active' : '') + '" data-dm-role="visitor">'
      + '<i class="fa-solid fa-eye"></i> Visitor</button>'
      + '<button class="dm-role-btn' + (role === 'user' ? ' is-active' : '') + '" data-dm-role="user">'
      + '<i class="fa-solid fa-user"></i> User</button>'
      + '<button class="dm-role-btn' + (role === 'admin' ? ' is-active' : '') + '" data-dm-role="admin">'
      + '<i class="fa-solid fa-shield-halved"></i> Admin</button>'
      + '</div></div>'

      /* ── 2. Current Info ── */
      + '<div class="dm-section">'
      + '<div class="dm-section__title"><i class="fa-solid fa-circle-info"></i> Thong tin hien tai</div>'
      + '<div class="dm-info">'
      + '<div class="dm-info-row"><span class="dm-info-label">Role</span><span class="dm-info-value dm-info-value--accent" id="dm-role-display">' + esc(role) + '</span></div>'
      + '<div class="dm-info-row"><span class="dm-info-label">Username</span><span class="dm-info-value" id="dm-name-display">' + esc(auth ? auth.name : 'Khach') + '</span></div>'
      + '<div class="dm-info-row"><span class="dm-info-label">Email</span><span class="dm-info-value" id="dm-email-display">' + esc(auth ? auth.email : '--') + '</span></div>'
      + '<div class="dm-info-row"><span class="dm-info-label">Wallet</span><span class="dm-info-value dm-info-value--accent" id="dm-wallet-display">' + (wallet.balance || 0) + ' Xu</span></div>'
      + '<div class="dm-info-row"><span class="dm-info-label">Favorites</span><span class="dm-info-value">' + (lib.favorites ? lib.favorites.length : 0) + '</span></div>'
      + '</div></div>'

      /* ── 3. Tools ── */
      + '<div class="dm-section">'
      + '<div class="dm-section__title"><i class="fa-solid fa-screwdriver-wrench"></i> Cong cu test</div>'
      + '<div class="dm-btn-grid">'
      + '<button class="dm-btn" id="dm-reset-storage"><i class="fa-solid fa-trash"></i> Reset LocalStorage</button>'
      + '<button class="dm-btn" id="dm-clear-session"><i class="fa-solid fa-broom"></i> Clear Session</button>'
      + '<button class="dm-btn" id="dm-reset-cache"><i class="fa-solid fa-database"></i> Reset Cache</button>'
      + '<button class="dm-btn dm-btn--danger" id="dm-logout"><i class="fa-solid fa-right-from-bracket"></i> Dang xuat</button>'
      + '<button class="dm-btn dm-btn--full dm-btn--primary" id="dm-reload"><i class="fa-solid fa-rotate-right"></i> Reload App</button>'
      + '</div></div>'

      /* ── 4. Wallet Test ── */
      + '<div class="dm-section">'
      + '<div class="dm-section__title"><i class="fa-solid fa-wallet"></i> Wallet Test</div>'
      + '<div class="dm-btn-grid dm-btn-grid--3">'
      + '<button class="dm-btn dm-btn--success" data-dm-wallet="+100">+100 Xu</button>'
      + '<button class="dm-btn dm-btn--success" data-dm-wallet="+500">+500 Xu</button>'
      + '<button class="dm-btn dm-btn--success" data-dm-wallet="+1000">+1000 Xu</button>'
      + '</div>'
      + '<div class="dm-btn-grid" style="margin-top:8px">'
      + '<button class="dm-btn dm-btn--danger dm-btn--full" data-dm-wallet="reset"><i class="fa-solid fa-rotate-left"></i> Reset Xu</button>'
      + '</div></div>'

      /* ── 5. Unlock Test ── */
      + '<div class="dm-section">'
      + '<div class="dm-section__title"><i class="fa-solid fa-lock-open"></i> Unlock Test</div>'
      + '<div class="dm-btn-grid">'
      + '<button class="dm-btn dm-btn--primary" id="dm-unlock-current"><i class="fa-solid fa-lock-open"></i> Unlock Current Story</button>'
      + '<button class="dm-btn dm-btn--success" id="dm-unlock-all"><i class="fa-solid fa-unlock"></i> Unlock All</button>'
      + '<button class="dm-btn dm-btn--danger dm-btn--full" id="dm-lock-all"><i class="fa-solid fa-lock"></i> Lock All Chapters</button>'
      + '</div></div>'

      /* ── 6. Story Test ── */
      + '<div class="dm-section">'
      + '<div class="dm-section__title"><i class="fa-solid fa-book"></i> Story Test</div>'
      + '<div class="dm-btn-grid">'
      + '<button class="dm-btn" id="dm-toggle-fav"><i class="fa-solid fa-heart"></i> Toggle Yeu thich</button>'
      + '<button class="dm-btn" id="dm-add-playlist"><i class="fa-solid fa-list"></i> Them Playlist</button>'
      + '<button class="dm-btn dm-btn--danger" id="dm-clear-favs"><i class="fa-solid fa-heart-crack"></i> Xoa tat ca Yeu thich</button>'
      + '<button class="dm-btn dm-btn--danger" id="dm-clear-playlists"><i class="fa-solid fa-list-ul"></i> Xoa tat ca Playlist</button>'
      + '</div></div>'

      /* ── 7. Responsive Test ── */
      + '<div class="dm-section">'
      + '<div class="dm-section__title"><i class="fa-solid fa-mobile-screen-button"></i> Responsive Test</div>'
      + '<div class="dm-responsive-bar">'
      + '<button class="dm-resp-chip is-active" data-dm-resp="desktop">Desktop</button>'
      + '<button class="dm-resp-chip" data-dm-resp="laptop">Laptop</button>'
      + '<button class="dm-resp-chip" data-dm-resp="tablet">Tablet</button>'
      + '<button class="dm-resp-chip" data-dm-resp="mobile">Mobile</button>'
      + '</div>'
      + '<div class="dm-screen-info" id="dm-screen-info">Screen: ' + w + ' x ' + h + ' px</div>'
      + '</div>'

      + '</div>' /* end dm-body */
      ;
  }

  function openDrawer() {
    drawer.innerHTML = buildDrawerHTML();
    fab.classList.add('is-open');
    backdrop.classList.add('is-open');
    drawer.classList.add('is-open');
    document.body.style.overflow = 'hidden';
    bindEvents();
  }

  function closeDrawer() {
    fab.classList.remove('is-open');
    backdrop.classList.remove('is-open');
    drawer.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function refreshInfo() {
    var role = detectRole();
    var auth = getAuth();
    var wallet = getWallet();
    var el = function (id) { return document.getElementById(id); };
    if (el('dm-role-display')) el('dm-role-display').textContent = role;
    if (el('dm-name-display')) el('dm-name-display').textContent = auth ? auth.name : 'Khach';
    if (el('dm-email-display')) el('dm-email-display').textContent = auth ? auth.email : '--';
    if (el('dm-wallet-display')) el('dm-wallet-display').textContent = (wallet.balance || 0) + ' Xu';
    // Update role buttons
    $$('.dm-role-btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.getAttribute('data-dm-role') === role);
    });
  }

  /* ═══ EVENT BINDING ═══ */
  function bindEvents() {
    /* Close */
    var closeBtn = $('#dm-close');
    if (closeBtn) closeBtn.addEventListener('click', closeDrawer);

    /* Role Switcher */
    $$('.dm-role-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var role = btn.getAttribute('data-dm-role');
        var profile = defaultProfiles[role];
        setAuth(profile);
        // Set token
        if (role === 'visitor') {
          localStorage.removeItem('audiohub-auth-token');
        } else if (role === 'admin') {
          localStorage.setItem('audiohub-auth-token', 'dev-admin-token');
        } else {
          localStorage.setItem('audiohub-auth-token', 'dev-user-token');
        }
        refreshInfo();
        showToast('Chuyen sang role: ' + role.toUpperCase());
        // Detect if we're in root or html/ folder
        var inHtmlFolder = (window.location.pathname.indexOf('/html/') > -1 || window.location.pathname.indexOf('\\html\\') > -1);
        var prefix = inHtmlFolder ? '' : 'html/';
        // Redirect to appropriate page based on role
        setTimeout(function () {
          if (role === 'visitor') {
            window.location.href = inHtmlFolder ? '../index.html' : 'index.html';
          } else if (role === 'user') {
            window.location.href = prefix + 'user-account.html';
          } else if (role === 'admin') {
            window.location.href = prefix + 'account.html';
          }
        }, 400);
      });
    });

    /* Reset LocalStorage */
    var resetStorage = $('#dm-reset-storage');
    if (resetStorage) resetStorage.addEventListener('click', function () {
      if (confirm('Xoa tat ca LocalStorage? Hanh dong nay khong the hoan tac.')) {
        localStorage.clear();
        showToast('Da xoa tat ca LocalStorage');
        setTimeout(function () { location.reload(); }, 500);
      }
    });

    /* Clear Session */
    var clearSession = $('#dm-clear-session');
    if (clearSession) clearSession.addEventListener('click', function () {
      sessionStorage.clear();
      showToast('Da xoa Session Storage');
    });

    /* Reset Cache */
    var resetCache = $('#dm-reset-cache');
    if (resetCache) resetCache.addEventListener('click', function () {
      if ('caches' in window) {
        caches.keys().then(function (names) {
          names.forEach(function (name) { caches.delete(name); });
        });
      }
      showToast('Da xoa Cache');
    });

    /* Logout */
    var logoutBtn = $('#dm-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', function () {
      localStorage.removeItem('audiohub-auth-token');
      localStorage.removeItem(AUTH_KEY);
      showToast('Da dang xuat');
      setTimeout(function () { location.reload(); }, 500);
    });

    /* Reload */
    var reloadBtn = $('#dm-reload');
    if (reloadBtn) reloadBtn.addEventListener('click', function () {
      location.reload();
    });

    /* Wallet Test */
    $$('[data-dm-wallet]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var action = btn.getAttribute('data-dm-wallet');
        var wallet = getWallet();
        if (action === 'reset') {
          wallet.balance = 0;
          wallet.transactions = [];
          saveWallet(wallet);
          showToast('Da reset Wallet ve 0');
        } else {
          var amount = parseInt(action.replace('+', ''), 10);
          wallet.balance += amount;
          wallet.transactions.push({
            id: 'dev_' + Date.now(),
            type: 'TOPUP',
            amount: amount,
            description: 'Dev Mode: + ' + amount + ' Xu',
            createdAt: new Date().toISOString()
          });
          saveWallet(wallet);
          showToast('Da them ' + amount + ' Xu');
        }
        refreshInfo();
      });
    });

    /* Unlock Test */
    var unlockCurrent = $('#dm-unlock-current');
    if (unlockCurrent) unlockCurrent.addEventListener('click', function () {
      var params = new URLSearchParams(window.location.search);
      var storyId = params.get('id');
      if (!storyId) { showToast('Khong co storyId trong URL'); return; }
      var key = 'audiohub-unlocked-chapters-v1';
      var list = [];
      try { list = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { list = []; }
      // Unlock first 5 chapters
      for (var i = 0; i < 5; i++) {
        var exists = list.some(function (c) { return c.storyId === storyId && c.chapterIdx === i; });
        if (!exists) {
          list.push({ storyId: storyId, chapterIdx: i, unlockedAt: new Date().toISOString() });
        }
      }
      localStorage.setItem(key, JSON.stringify(list));
      showToast('Da unlock 5 chapter dau tien');
    });

    var unlockAll = $('#dm-unlock-all');
    if (unlockAll) unlockAll.addEventListener('click', function () {
      var key = 'audiohub-unlocked-chapters-v1';
      var list = [];
      try { list = JSON.parse(localStorage.getItem(key)) || []; } catch (e) { list = []; }
      // Unlock 50 chapters for current story or a demo story
      var params = new URLSearchParams(window.location.search);
      var storyId = params.get('id') || 'demo-story-1';
      for (var i = 0; i < 50; i++) {
        var exists = list.some(function (c) { return c.storyId === storyId && c.chapterIdx === i; });
        if (!exists) {
          list.push({ storyId: storyId, chapterIdx: i, unlockedAt: new Date().toISOString() });
        }
      }
      localStorage.setItem(key, JSON.stringify(list));
      showToast('Da unlock tat ca 50 chapter');
    });

    var lockAll = $('#dm-lock-all');
    if (lockAll) lockAll.addEventListener('click', function () {
      localStorage.removeItem('audiohub-unlocked-chapters-v1');
      showToast('Da lock tat ca chapter');
    });

    /* Story Test */
    var toggleFav = $('#dm-toggle-fav');
    if (toggleFav) toggleFav.addEventListener('click', function () {
      var params = new URLSearchParams(window.location.search);
      var storyId = params.get('id') || 'demo-story-1';
      var lib = getLibrary();
      if (!lib.favorites) lib.favorites = [];
      var idx = lib.favorites.indexOf(storyId);
      if (idx >= 0) {
        lib.favorites.splice(idx, 1);
        showToast('Da bo yeu thich');
      } else {
        lib.favorites.push(storyId);
        showToast('Da them vao yeu thich');
      }
      saveLibrary(lib);
      refreshInfo();
    });

    var addPlaylist = $('#dm-add-playlist');
    if (addPlaylist) addPlaylist.addEventListener('click', function () {
      var playlists = [];
      try { playlists = JSON.parse(localStorage.getItem(PL_KEY)) || []; } catch (e) { playlists = []; }
      var name = 'Dev Playlist ' + (playlists.length + 1);
      playlists.push({
        id: 'dev-pl-' + Date.now(),
        name: name,
        entries: [],
        state: 'ongoing',
        createdAt: new Date().toISOString()
      });
      localStorage.setItem(PL_KEY, JSON.stringify(playlists));
      showToast('Da tao playlist: ' + name);
    });

    var clearFavs = $('#dm-clear-favs');
    if (clearFavs) clearFavs.addEventListener('click', function () {
      var lib = getLibrary();
      lib.favorites = [];
      saveLibrary(lib);
      showToast('Da xoa tat ca yeu thich');
      refreshInfo();
    });

    var clearPlaylists = $('#dm-clear-playlists');
    if (clearPlaylists) clearPlaylists.addEventListener('click', function () {
      localStorage.removeItem(PL_KEY);
      showToast('Da xoa tat ca playlist');
    });

    /* Responsive Test */
    var respMap = { desktop: 1920, laptop: 1024, tablet: 768, mobile: 375 };
    $$('[data-dm-resp]').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var size = chip.getAttribute('data-dm-resp');
        $$('.dm-resp-chip').forEach(function (c) { c.classList.remove('is-active'); });
        chip.classList.add('is-active');
        var info = $('#dm-screen-info');
        if (size === 'desktop') {
          if (info) info.textContent = 'Screen: 1920 x 1080 px (mau)';
          showToast('Responsive: Desktop 1920px');
        } else {
          var w = respMap[size] || 375;
          if (info) info.textContent = 'Screen: ' + w + ' px (mau) | Hien tai: ' + window.innerWidth + ' x ' + window.innerHeight;
          showToast('Responsive: ' + size + ' ' + w + 'px');
        }
      });
    });
  }

  /* ═══ INJECT DOM ═══ */
  document.body.appendChild(fab);
  document.body.appendChild(backdrop);
  document.body.appendChild(drawer);

  /* Toast container */
  var toastEl = document.createElement('div');
  toastEl.className = 'dm-toast';
  toastEl.id = 'dm-toast';
  toastEl.style.display = 'none';
  document.body.appendChild(toastEl);

  /* ═══ LISTENERS ═══ */
  fab.addEventListener('click', function () {
    if (drawer.classList.contains('is-open')) closeDrawer();
    else openDrawer();
  });
  backdrop.addEventListener('click', closeDrawer);

  /* Keyboard: Escape to close */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && drawer.classList.contains('is-open')) closeDrawer();
  });

  /* Update screen info on resize */
  window.addEventListener('resize', function () {
    var info = $('#dm-screen-info');
    if (info) info.textContent = 'Screen: ' + window.innerWidth + ' x ' + window.innerHeight + ' px';
  });

  /* ═══ CONSOLE LOG ═══ */
  console.log(
    '%c AudioHub Developer Mode %c Active ',
    'background: #f59e0b; color: #000; font-weight: bold; padding: 4px 8px; border-radius: 4px 0 0 4px;',
    'background: #1e293b; color: #f59e0b; font-weight: bold; padding: 4px 8px; border-radius: 0 4px 4px 0;'
  );

})();
