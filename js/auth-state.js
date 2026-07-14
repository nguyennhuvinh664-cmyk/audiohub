(function () {
  var TOKEN_KEY = 'audiohub-auth-token';
  var PROFILE_KEY = 'audiohub-auth-profile';
  var AVATAR_KEY = 'audiohub-account-avatar-v1';

  /* ═══ SINGLE SOURCE OF TRUTH ════════════════════════════════════════
     All auth state lives in localStorage:
       - audiohub-auth-token     → JWT token (string)
       - audiohub-auth-profile   → user profile (JSON object)
     Header, Account, Router all read from these two keys.
     ══════════════════════════════════════════════════════════════════ */

  var defaultProfile = {
    isLoggedIn: false,
    name: '',
    email: '',
    initials: 'AH',
    tier: 'Thành viên'
  };

  /* ── Token helpers ──────────────────────────────────────────────── */

  function getToken() {
    try { return window.localStorage.getItem(TOKEN_KEY) || ''; }
    catch (e) { return ''; }
  }

  function setToken(token) {
    try {
      if (token) { window.localStorage.setItem(TOKEN_KEY, token); }
      else { window.localStorage.removeItem(TOKEN_KEY); }
    } catch (e) {}
  }

  /* ── Profile helpers ────────────────────────────────────────────── */

  function readProfile() {
    try {
      var raw = window.localStorage.getItem(PROFILE_KEY);
      if (!raw) return null;
      var p = JSON.parse(raw);
      if (!p || !p.isLoggedIn) return null;
      return p;
    } catch (e) { return null; }
  }

  function writeProfile(profile) {
    try { window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); }
    catch (e) {}
  }

  function clearProfile() {
    try {
      window.localStorage.removeItem(PROFILE_KEY);
      window.localStorage.removeItem(TOKEN_KEY);
      window.localStorage.removeItem(AVATAR_KEY);
    } catch (e) {}
  }

  function deriveInitials(name) {
    var s = String(name || '').trim();
    if (!s) return 'AH';
    var parts = s.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  /* ── Backend fetch helper ───────────────────────────────────────── */

  function fetchMe() {
    if (!window.AudioHubApi || typeof window.AudioHubApi.request !== 'function') {
      return Promise.resolve(null);
    }
    var token = getToken();
    if (!token || token === 'demo-local-token') return Promise.resolve(null);
    return window.AudioHubApi.request('/auth/me', { method: 'GET' })
      .then(function (user) { return user || null; })
      .catch(function () { return null; });
  }

  /* ── Save profile from backend user object ──────────────────────── */

  function saveProfileFromUser(user) {
    if (!user) return false;
    var name = user.displayName || user.name || '';
    var email = user.email || '';
    if (!name && !email) return false;

    var adminEmails = ['admin@audiohub.vn', 'admin-test@audiohub.vn'];

    var profile = {
      isLoggedIn: true,
      name: name,
      email: email,
      initials: deriveInitials(name),
      tier: user.tier || user.membership || 'Thành viên',
      isAdmin: !!user.isAdmin || adminEmails.indexOf(email.toLowerCase()) !== -1,
      id: user.id || ''
    };

    writeProfile(profile);

    if (user.avatarDataUrl) {
      try { window.localStorage.setItem(AVATAR_KEY, String(user.avatarDataUrl)); }
      catch (e) {}
    }

    return true;
  }

  /* ── Clear everything ───────────────────────────────────────────── */

  function clearAuth() {
    clearProfile();
    if (window.AudioHubApi && typeof window.AudioHubApi.setToken === 'function') {
      window.AudioHubApi.setToken('');
    }
  }

  /* ── Access helpers ─────────────────────────────────────────────── */

  function isMemberSession() {
    return !!(getToken() && getToken() !== 'demo-local-token') || !!readProfile();
  }

  function canAccessStory(story) {
    if (!story) return true;
    var vis = String(story.visibility || '').trim();
    if (vis !== 'Không công khai') return true;
    return isMemberSession();
  }

  window.AudioHubAccess = {
    isMember: isMemberSession,
    canAccessStory: canAccessStory
  };

  /* ═══ UPDATE MOBILE/DRAWER LINKS ══════════════════════════════════════ */

  function updateAccountLinks() {
    var acctUrl = getAccountUrl().replace('/html/', '');
    // Bottom nav
    document.querySelectorAll('.m-bottomnav__item').forEach(function (link) {
      if (link.textContent.trim() === 'Tài khoản' || link.querySelector('.fa-user')) {
        link.href = acctUrl;
      }
    });
    // Mobile drawer
    document.querySelectorAll('.m-drawer__link').forEach(function (link) {
      var text = link.textContent.trim();
      if (text === 'Lịch sử nghe' || text === 'Yêu thích' || text === 'Playlist' || text === 'Chương đã mở khóa') {
        link.href = acctUrl + link.getAttribute('href').replace(/^account\.html/, '');
      }
    });
  }

  /* ═══ HEADER RENDERING ════════════════════════════════════════════════ */

  function renderHeaderAuth() {
    var containers = document.querySelectorAll('[data-auth-container]');
    if (!containers.length) return;

    var profile = readProfile();

    containers.forEach(function (container) {
      if (!profile || !profile.isLoggedIn) {
        buildGuestActions(container);
        return;
      }
      var isMobile = container.dataset.authVariant === 'mobile';
      container.innerHTML = buildMenuMarkup(profile, isMobile);
      bindMenu(container);
    });

    applyHeaderAvatars();
    updateAccountLinks();
  }

  function buildGuestActions(container) {
    if (container.dataset.authVariant === 'mobile') {
      container.innerHTML =
        '<a href="login.html" class="btn btn--outline btn--blk">Đăng Nhập</a>' +
        '<a href="register.html" class="btn btn--primary btn--blk"><i class="fa-solid fa-user-plus"></i> Đăng Ký</a>';
      return;
    }
    if (container.dataset.authVariant === 'home') {
      container.innerHTML =
        '<a href="login.html" class="btn btn--outline"><i class="fa-regular fa-user"></i> Đăng Nhập</a>' +
        '<a href="register.html" class="btn btn--primary"><i class="fa-solid fa-user-plus"></i> Đăng Ký</a>';
      return;
    }
    container.innerHTML =
      '<a href="login.html" class="btn btn--outline">Đăng Nhập</a>' +
      '<a href="register.html" class="btn btn--primary">Đăng Ký</a>';
  }

  function buildMenuMarkup(profile, mobile) {
    var meta = '<span class="auth-menu__meta"><span class="auth-menu__label">' + profile.name + '</span><span class="auth-menu__email">' + profile.email + '</span></span>';

    var isAdmin = !!(profile && profile.isAdmin);
    var uploadLink = isAdmin
      ? '<a href="upload-story.html" class="auth-menu__link"><i class="fa-solid fa-upload"></i> Đăng truyện</a>'
      : '';

    var accountUrl = getAccountUrl().replace('/html/', '');

    return '<div class="auth-menu">'
      + '<button type="button" class="btn btn--outline auth-menu__trigger" aria-expanded="false">'
      + '<span class="auth-menu__avatar">' + (profile.initials || 'AH') + '</span>'
      + meta
      + '<i class="fa-solid fa-chevron-down auth-menu__chevron"></i>'
      + '</button>'
      + '<div class="auth-menu__dropdown" hidden>'
      + '<div class="auth-menu__summary"><strong class="auth-menu__name">' + profile.name + '</strong><span class="auth-menu__tier">' + (profile.tier || 'Thành viên') + '</span></div>'
      + '<a href="' + accountUrl + '" class="auth-menu__link"><i class="fa-regular fa-user"></i> Tài khoản</a>'
      + uploadLink
      + '<a href="change-password.html" class="auth-menu__link"><i class="fa-solid fa-key"></i> Đổi mật khẩu</a>'
      + '<button type="button" class="auth-menu__action" data-auth-switch><i class="fa-solid fa-repeat"></i> Chuyển đổi tài khoản</button>'
      + '<button type="button" class="auth-menu__action auth-menu__action--danger" data-auth-logout><i class="fa-solid fa-right-from-bracket"></i> Đăng xuất</button>'
      + '</div>'
      + '</div>';
  }

  function getAccountUrl() {
    var profile = readProfile();
    if (profile && profile.isAdmin) return '/html/account.html';
    return '/html/user-account.html';
  }

  /* ── Menu interaction ───────────────────────────────────────────── */

  function closeAllMenus() {
    document.querySelectorAll('.auth-menu.is-open').forEach(function (menu) {
      menu.classList.remove('is-open');
      var trigger = menu.querySelector('.auth-menu__trigger');
      var dropdown = menu.querySelector('.auth-menu__dropdown');
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
      if (dropdown) dropdown.hidden = true;
    });
  }

  function bindMenu(container) {
    var menu = container.querySelector('.auth-menu');
    if (!menu) return;

    var trigger = menu.querySelector('.auth-menu__trigger');
    var dropdown = menu.querySelector('.auth-menu__dropdown');
    var logout = menu.querySelector('[data-auth-logout]');
    var switchBtn = menu.querySelector('[data-auth-switch]');

    trigger.addEventListener('click', function (e) {
      e.preventDefault();
      var isOpen = menu.classList.contains('is-open');
      closeAllMenus();
      if (!isOpen) {
        menu.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        dropdown.hidden = false;
      }
    });

    if (logout) {
      logout.addEventListener('click', function () {
        logoutAndRedirect();
      });
    }

    if (switchBtn) {
      switchBtn.addEventListener('click', function () {
        switchAccountRedirect();
      });
    }
  }

  function applyHeaderAvatars() {
    try {
      var avatarUrl = window.localStorage.getItem(AVATAR_KEY);
      if (!avatarUrl) return;
      document.querySelectorAll('.auth-menu__avatar').forEach(function (node) {
        node.style.backgroundImage = 'url("' + avatarUrl.replace(/"/g, '&quot;') + '")';
        node.style.backgroundSize = 'cover';
        node.style.backgroundPosition = 'center';
        node.textContent = '';
      });
    } catch (e) {}
  }

  /* ═══ ACCOUNT PROFILE ════════════════════════════════════════════════ */

  function renderAccountProfile() {
    var profile = readProfile();
    if (!profile) return;

    var nameNode = document.querySelector('[data-account-name]');
    var emailNode = document.querySelector('[data-account-email]');
    var avatarNode = document.querySelector('[data-account-avatar]');

    if (nameNode) nameNode.textContent = profile.name || '';
    if (emailNode) emailNode.textContent = profile.email || '';
    if (avatarNode) avatarNode.textContent = profile.initials || deriveInitials(profile.name);
  }

  /* ═══ SPA NAVIGATION ═════════════════════════════════════════════════ */

  function spaNavigate(path) {
    if (window.AudioHubRouter) { window.AudioHubRouter.navigate(path); }
    else { window.location.href = path; }
  }

  function notifyAuthUpdated() {
    try { window.dispatchEvent(new CustomEvent('audiohub:auth-updated')); } catch (e) {}
  }

  /* ═══ LOGIN / REGISTER / LOGOUT ══════════════════════════════════════ */

  function handleLoginSuccess(token, user) {
    // 1. Save token
    if (token) setToken(token);

    // 2. If API returned user, save directly
    if (user && (user.displayName || user.email)) {
      saveProfileFromUser(user);
      renderHeaderAuth();
      renderAccountProfile();
      notifyAuthUpdated();
      return;
    }

    // 3. If no user object, fetch from /auth/me
    fetchMe().then(function (me) {
      if (me) {
        saveProfileFromUser(me);
      } else {
        // Fallback: save minimal profile from token
        writeProfile({
          isLoggedIn: true,
          name: 'Người dùng',
          email: '',
          initials: 'ND',
          tier: 'Thành viên',
          isAdmin: false
        });
      }
      renderHeaderAuth();
      renderAccountProfile();
      notifyAuthUpdated();
    });
  }

  function handleLoginError(email) {
    // Demo fallback when API is unreachable
    var demoProfile = {
      isLoggedIn: true,
      name: email.split('@')[0] || 'Người dùng',
      email: email,
      initials: deriveInitials(email.split('@')[0] || 'ND'),
      tier: 'Thành viên',
      isAdmin: false
    };
    writeProfile(demoProfile);
    setToken('demo-local-token');
    renderHeaderAuth();
    renderAccountProfile();
    notifyAuthUpdated();
  }

  function logoutAndRedirect() {
    clearAuth();
    renderHeaderAuth();
    notifyAuthUpdated();
    spaNavigate('/index.html');
  }

  function switchAccountRedirect() {
    clearAuth();
    renderHeaderAuth();
    notifyAuthUpdated();
    spaNavigate('/html/login.html');
  }

  /* ═══ FORM BINDING ═══════════════════════════════════════════════════ */

  function bindAuthForms() {
    if (!window.AudioHubApi || typeof window.AudioHubApi.request !== 'function') return;

    // ── Login ──
    var loginBtn = document.querySelector('[data-auth-login]');
    if (loginBtn && !loginBtn._authBound) {
      loginBtn._authBound = true;
      loginBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var email = String((document.querySelector('#login-email') || {}).value || '').trim();
        var password = String((document.querySelector('#login-password') || {}).value || '');
        if (!email || !password) { alert('Vui lòng nhập email và mật khẩu.'); return; }

        var prev = loginBtn.textContent;
        loginBtn.textContent = 'Đang đăng nhập...';

        window.AudioHubApi.request('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password })
        }).then(function (result) {
          handleLoginSuccess(result && result.token, result && result.user);
          var acctUrl = getAccountUrl();
          spaNavigate(acctUrl);
        }).catch(function () {
          handleLoginError(email);
          spaNavigate(getAccountUrl());
        }).then(function () {
          loginBtn.textContent = prev;
        });
      });
    }

    // ── Register ──
    var registerBtn = document.querySelector('[data-auth-register]');
    if (registerBtn && !registerBtn._authBound) {
      registerBtn._authBound = true;
      registerBtn.addEventListener('click', function (e) {
        e.preventDefault();
        var displayName = String((document.querySelector('#register-name') || {}).value || '').trim();
        var email = String((document.querySelector('#register-email') || {}).value || '').trim();
        var password = String((document.querySelector('#register-password') || {}).value || '');
        var confirm = String((document.querySelector('#register-confirm') || {}).value || '');
        if (!displayName || !email || !password) { alert('Vui lòng nhập đầy đủ thông tin.'); return; }
        if (password !== confirm) { alert('Mật khẩu xác nhận không khớp.'); return; }

        var prev = registerBtn.textContent;
        registerBtn.textContent = 'Đang tạo tài khoản...';

        window.AudioHubApi.request('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password, displayName: displayName })
        }).then(function (result) {
          handleLoginSuccess(result && result.token, result && result.user || { displayName: displayName, email: email });
          spaNavigate(getAccountUrl());
        }).catch(function () {
          handleLoginError(email);
          spaNavigate(getAccountUrl());
        }).then(function () {
          registerBtn.textContent = prev;
        });
      });
    }
  }

  /* ═══ HYDRATE ON PAGE LOAD ═══════════════════════════════════════════
     Single entry point: runs once on shell load.
     Always fetches /auth/me if token exists, to ensure profile is fresh.
     ══════════════════════════════════════════════════════════════════ */

  var _guestTokenPromise = null;

  function ensureGuestToken() {
    var token = getToken();
    // Already have a real token (not demo, not local fallback)
    if (token && token !== 'demo-local-token' && token.indexOf('guest-') !== 0) {
      return Promise.resolve(token);
    }
    // Already fetching — reuse the same promise
    if (_guestTokenPromise) {
      return _guestTokenPromise;
    }
    // Use local fallback immediately (so API calls don't fail)
    var localToken = useLocalFallback();

    // Fetch real JWT from backend, then cache it
    var guestId = window.AudioHubApi && window.AudioHubApi.getGuestId ? window.AudioHubApi.getGuestId() : ('g_' + Date.now().toString(36));
    _guestTokenPromise = window.AudioHubApi.request('/auth/guest', {
      method: 'POST',
      body: JSON.stringify({ guestId: guestId })
    }).then(function (result) {
      if (result && result.token) {
        setToken(result.token);
        if (window.AudioHubApi && typeof window.AudioHubApi.setToken === 'function') {
          window.AudioHubApi.setToken(result.token);
        }
        return result.token;
      }
      return localToken;
    }).catch(function () {
      return localToken;
    });

    return _guestTokenPromise;
  }

  function useLocalFallback() {
    var fallback = 'guest-' + (window.AudioHubApi && window.AudioHubApi.getGuestId ? window.AudioHubApi.getGuestId() : Date.now().toString(36));
    setToken(fallback);
    if (window.AudioHubApi && typeof window.AudioHubApi.setToken === 'function') {
      window.AudioHubApi.setToken(fallback);
    }
    return fallback;
  }

  function hydrateAuth() {
    var token = getToken();

    // No token → try guest registration first
    if (!token || token === 'demo-local-token') {
      ensureGuestToken().then(function () {
        renderHeaderAuth();
        renderAccountProfile();
      });
      return;
    }

    // Has token → fetch fresh profile from backend
    fetchMe().then(function (user) {
      if (user && (user.displayName || user.email)) {
        saveProfileFromUser(user);
      }
      renderHeaderAuth();
      renderAccountProfile();
    }).catch(function () {
      renderHeaderAuth();
      renderAccountProfile();
    });
  }

  // Auto-register guest token on page load (before other scripts run)
  ensureGuestToken();

  /* ═══ INIT ═══════════════════════════════════════════════════════════ */

  // Global listeners
  document.addEventListener('click', function (e) {
    if (!e.target.closest('.auth-menu')) closeAllMenus();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeAllMenus();
  });

  // Bind forms + hydrate auth state
  bindAuthForms();
  hydrateAuth();

  // Re-render header on pageshow (handles back/forward navigation, bfcache)
  window.addEventListener('pageshow', function () {
    renderHeaderAuth();
    renderAccountProfile();
  });

  // Hide admin-only elements for non-admin users
  (function hideAdminOnly() {
    var profile = readProfile();
    if (!profile || !profile.isAdmin) {
      document.querySelectorAll('[data-admin-only]').forEach(function (el) {
        el.style.display = 'none';
      });
    }
  })();

  /* ═══ PUBLIC API ══════════════════════════════════════════════════════ */

  window.AudioHubAuth = {
    readProfile: readProfile,
    getToken: getToken,
    logout: logoutAndRedirect,
    renderHeader: renderHeaderAuth,
    ensureGuestToken: ensureGuestToken
  };

  // Expose for SPA router
  window.AudioHubAuthRebind = function () {
    bindAuthForms();
    hydrateAuth();
  };

  /* ═══ HALL OF FAME (unchanged) ══════════════════════════════════════ */

  var HALL_STORE_KEY = 'audiohub-hall-contributions-v1';

  function readHallContributions() {
    try {
      var raw = window.localStorage.getItem(HALL_STORE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (e) { return {}; }
  }

  function writeHallContributions(data) {
    try { window.localStorage.setItem(HALL_STORE_KEY, JSON.stringify(data || {})); }
    catch (e) {}
  }

  function toContributionSeed(profile) {
    var name = profile && profile.name ? String(profile.name) : 'Người dùng';
    return {
      id: String(name).toLowerCase().replace(/\\s+/g, '-'),
      name: name,
      avatar: deriveInitials(name),
      week: 0, month: 0, all: 0,
      updatedAt: new Date().toISOString()
    };
  }

  function addContribution(delta, profileOverride) {
    var points = Number(delta);
    if (isNaN(points) || points <= 0) return;
    var profile = profileOverride || readProfile() || defaultProfile;
    var seed = toContributionSeed(profile);
    var store = readHallContributions();
    var current = store[seed.id] || seed;
    current.id = seed.id;
    current.name = profile && profile.name ? String(profile.name) : current.name;
    current.avatar = deriveInitials(current.name || seed.name);
    current.week = Math.max(0, Number(current.week || 0) + points);
    current.month = Math.max(0, Number(current.month || 0) + points);
    current.all = Math.max(0, Number(current.all || 0) + points);
    current.updatedAt = new Date().toISOString();
    store[seed.id] = current;
    writeHallContributions(store);
    try {
      window.dispatchEvent(new CustomEvent('audiohub:hall-contribution-updated', { detail: { id: seed.id, delta: points } }));
    } catch (e) {}
  }

  window.AudioHubHall = {
    read: readHallContributions,
    write: writeHallContributions,
    add: addContribution
  };
})();
