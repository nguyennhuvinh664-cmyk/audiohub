(function () {
  var STORAGE_KEY = 'audiohub-demo-auth';
  var AVATAR_STORAGE_KEY = 'audiohub-account-avatar-v1';

  /** Bind auth forms (login/register) — safe to call multiple times */
  function rebindAuthForms() {
    bindAuthForms();
  }

  /** Return account URL based on user role */
  function getAccountUrl() {
    try {
      var auth = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (auth && auth.isAdmin) return '/html/account.html';
    } catch (e) {}
    return '/html/user-account.html';
  }

  /** SPA-aware navigation helper */
  function spaNavigate(path) {
    if (window.AudioHubRouter) { window.AudioHubRouter.navigate(path); } else { window.location.href = path; }
  }

  var defaultProfile = {
    isLoggedIn: true,
    name: 'Anh Ngọc',
    email: 'anhngoc@audiohub.vn',
    initials: 'AN',
    tier: 'Hội viên Kim Cương'
  };

  function readAuth() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return null;
      }

      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.isLoggedIn) {
        return null;
      }

      return {
        isLoggedIn: true,
        name: parsed.name || defaultProfile.name,
        email: parsed.email || defaultProfile.email,
        initials: parsed.initials || defaultProfile.initials,
        tier: parsed.tier || defaultProfile.tier
      };
    } catch (error) {
      return null;
    }
  }

  function writeAuth(profile) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }

  function clearAuth() {
    window.localStorage.removeItem(STORAGE_KEY);
    if (window.AudioHubApi && typeof window.AudioHubApi.setToken === 'function') {
      window.AudioHubApi.setToken('');
    }
  }

  function isMemberSession() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      var hasProfile = !!(parsed && parsed.isLoggedIn);
      var hasToken = !!(window.AudioHubApi && typeof window.AudioHubApi.getToken === 'function' && window.AudioHubApi.getToken());
      return hasProfile || hasToken;
    } catch (error) {
      return false;
    }
  }

  function canAccessStory(story) {
    if (!story) return true;
    var visibility = String(story.visibility || '').trim();
    if (visibility !== 'Không công khai') return true;
    return isMemberSession();
  }

  window.AudioHubAccess = {
    isMember: isMemberSession,
    canAccessStory: canAccessStory
  };

  function deriveInitials(name) {
    var source = String(name || '').trim();
    if (!source) {
      return 'AH';
    }
    var parts = source.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function setAuthProfileFromUser(user) {
    var name = user && user.displayName ? user.displayName : defaultProfile.name;
    var email = user && user.email ? user.email : defaultProfile.email;
    writeAuth({
      isLoggedIn: true,
      name: name,
      email: email,
      initials: deriveInitials(name),
      tier: defaultProfile.tier
    });
    if (user && user.avatarDataUrl) {
      try {
        window.localStorage.setItem(AVATAR_STORAGE_KEY, String(user.avatarDataUrl));
      } catch (error) {
      }
    }
    renderAccountProfile();
    renderHeaderAuth();
  }

  function bindAuthForms() {
    if (!window.AudioHubApi || typeof window.AudioHubApi.request !== 'function' || typeof window.AudioHubApi.setToken !== 'function') {
      return;
    }

    var loginButton = document.querySelector('[data-auth-login]');
    if (loginButton) {
      loginButton.addEventListener('click', function (event) {
        event.preventDefault();
        var emailInput = document.querySelector('#login-email');
        var passwordInput = document.querySelector('#login-password');
        var email = emailInput ? String(emailInput.value || '').trim() : '';
        var password = passwordInput ? String(passwordInput.value || '') : '';
        if (!email || !password) {
          window.alert('Vui lòng nhập email và mật khẩu.');
          return;
        }

        var prevText = loginButton.textContent;
        loginButton.textContent = 'Đang đăng nhập...';

        window.AudioHubApi.request('/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password })
        }).then(function (result) {
          if (result && result.token) {
            window.AudioHubApi.setToken(result.token);
          }
          setAuthProfileFromUser(result && result.user ? result.user : null);
          var acctUrl = getAccountUrl();
          if (window.AudioHubRouter) { window.AudioHubRouter.navigate(acctUrl); } else { window.location.href = acctUrl.replace('/html/', ''); }
        }).catch(function () {
          loginDemo({
            name: email.split('@')[0] || defaultProfile.name,
            email: email,
            initials: deriveInitials(email.split('@')[0] || defaultProfile.name),
            tier: defaultProfile.tier
          });
          spaNavigate(getAccountUrl());
        }).then(function () {
          loginButton.textContent = prevText;
        });
      });
    }

    var registerButton = document.querySelector('[data-auth-register]');
    if (registerButton) {
      registerButton.addEventListener('click', function (event) {
        event.preventDefault();
        var nameInput = document.querySelector('#register-name');
        var emailInput = document.querySelector('#register-email');
        var passwordInput = document.querySelector('#register-password');
        var confirmInput = document.querySelector('#register-confirm');

        var displayName = nameInput ? String(nameInput.value || '').trim() : '';
        var email = emailInput ? String(emailInput.value || '').trim() : '';
        var password = passwordInput ? String(passwordInput.value || '') : '';
        var confirm = confirmInput ? String(confirmInput.value || '') : '';

        if (!displayName || !email || !password) {
          window.alert('Vui lòng nhập đầy đủ thông tin đăng ký.');
          return;
        }
        if (password !== confirm) {
          window.alert('Mật khẩu xác nhận không khớp.');
          return;
        }

        var prevText = registerButton.textContent;
        registerButton.textContent = 'Đang tạo tài khoản...';

        window.AudioHubApi.request('/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: email, password: password, displayName: displayName })
        }).then(function (result) {
          if (result && result.token) {
            window.AudioHubApi.setToken(result.token);
          }
          setAuthProfileFromUser(result && result.user ? result.user : { displayName: displayName, email: email });
          spaNavigate(getAccountUrl());
        }).catch(function () {
          loginDemo({
            name: displayName,
            email: email,
            initials: deriveInitials(displayName),
            tier: defaultProfile.tier
          });
          spaNavigate(getAccountUrl());
        }).then(function () {
          registerButton.textContent = prevText;
        });
      });
    }
  }

  function hydrateAuthFromToken() {
    if (!window.AudioHubApi || typeof window.AudioHubApi.getToken !== 'function' || typeof window.AudioHubApi.request !== 'function') {
      return;
    }

    var token = window.AudioHubApi.getToken();
    if (!token) {
      return;
    }

    if (readAuth()) {
      return;
    }

    window.AudioHubApi.request('/auth/me', { method: 'GET' })
      .then(function (user) {
        setAuthProfileFromUser(user || null);
        renderHeaderAuth();
      })
      .catch(function () {
        clearAuth();
        renderHeaderAuth();
      });
  }

  function logoutAndRedirect() {
    clearAuth();
    renderHeaderAuth();
    spaNavigate('/index.html');
  }

  function switchAccountRedirect() {
    clearAuth();
    renderHeaderAuth();
    spaNavigate('/html/login.html');
  }

  function loginDemo(overrides) {
    var profile = {
      isLoggedIn: true,
      name: overrides && overrides.name ? overrides.name : defaultProfile.name,
      email: overrides && overrides.email ? overrides.email : defaultProfile.email,
      initials: overrides && overrides.initials ? overrides.initials : defaultProfile.initials,
      tier: overrides && overrides.tier ? overrides.tier : defaultProfile.tier
    };

    writeAuth(profile);
    if (window.AudioHubApi && typeof window.AudioHubApi.setToken === 'function') {
      window.AudioHubApi.setToken('demo-local-token');
    }
  }

  function buildGuestActions(container) {
    if (container.dataset.authVariant === 'mobile') {
      container.innerHTML = '<a href="login.html" class="btn btn--outline btn--blk">Đăng Nhập</a><a href="register.html" class="btn btn--primary btn--blk"><i class="fa-solid fa-user-plus"></i> Đăng Ký</a>';
      return;
    }

    if (container.dataset.authVariant === 'home') {
      container.innerHTML = '<a href="login.html" class="btn btn--outline"><i class="fa-regular fa-user"></i> Đăng Nhập</a><a href="register.html" class="btn btn--primary"><i class="fa-solid fa-user-plus"></i> Đăng Ký</a>';
      return;
    }

    container.innerHTML = '<a href="login.html" class="btn btn--outline">Đăng Nhập</a><a href="register.html" class="btn btn--primary">Đăng Ký</a>';
  }

  function readAvatarDataUrl() {
    try {
      return String(window.localStorage.getItem(AVATAR_STORAGE_KEY) || '');
    } catch (error) {
      return '';
    }
  }

  function applyHeaderAvatars() {
    var avatarDataUrl = readAvatarDataUrl();
    if (!avatarDataUrl) {
      return;
    }
    document.querySelectorAll('.auth-menu__avatar').forEach(function (node) {
      node.style.backgroundImage = 'url("' + avatarDataUrl.replace(/"/g, '&quot;') + '")';
      node.style.backgroundSize = 'cover';
      node.style.backgroundPosition = 'center';
      node.textContent = '';
    });
  }

  function buildMenuMarkup(profile, mobile) {
    var summary = '<div class="auth-menu__summary"><strong class="auth-menu__name">' + profile.name + '</strong><span class="auth-menu__tier">' + profile.tier + '</span></div>';
    var triggerMeta = mobile
      ? '<span class="auth-menu__meta"><span class="auth-menu__label">' + profile.name + '</span><span class="auth-menu__email">' + profile.email + '</span></span>'
      : '<span class="auth-menu__meta"><span class="auth-menu__label">' + profile.name + '</span><span class="auth-menu__email">' + profile.email + '</span></span>';

    // Check if user is admin
    var isAdmin = false;
    try {
      var raw = window.localStorage.getItem('audiohub-demo-auth');
      var authData = raw ? JSON.parse(raw) : null;
      isAdmin = !!(authData && authData.isAdmin);
    } catch(e) {}

    // Only show upload link for admin
    var uploadLink = isAdmin
      ? '<a href="upload-story.html" class="auth-menu__link"><i class="fa-solid fa-upload"></i> Đăng truyện</a>'
      : '';

    return '<div class="auth-menu">'
      + '<button type="button" class="btn btn--outline auth-menu__trigger" aria-expanded="false">'
      + '<span class="auth-menu__avatar">' + profile.initials + '</span>'
      + triggerMeta
      + '<i class="fa-solid fa-chevron-down auth-menu__chevron"></i>'
      + '</button>'
      + '<div class="auth-menu__dropdown" hidden>'
      + summary
      + '<a href="' + getAccountUrl().replace('/html/', '') + '" class="auth-menu__link"><i class="fa-regular fa-user"></i> Tài khoản</a>'
      + uploadLink
      + '<a href="change-password.html" class="auth-menu__link"><i class="fa-solid fa-key"></i> Đổi mật khẩu</a>'
      + '<button type="button" class="auth-menu__action" data-auth-switch><i class="fa-solid fa-repeat"></i> Chuyển đổi tài khoản</button>'
      + '<button type="button" class="auth-menu__action auth-menu__action--danger" data-auth-logout><i class="fa-solid fa-right-from-bracket"></i> Đăng xuất</button>'
      + '</div>'
      + '</div>';
  }

  function closeAllMenus() {
    document.querySelectorAll('.auth-menu.is-open').forEach(function (menu) {
      menu.classList.remove('is-open');
      var trigger = menu.querySelector('.auth-menu__trigger');
      var dropdown = menu.querySelector('.auth-menu__dropdown');
      if (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
      }
      if (dropdown) {
        dropdown.hidden = true;
      }
    });
  }

  function bindMenu(container) {
    var menu = container.querySelector('.auth-menu');
    if (!menu) {
      return;
    }

    var trigger = menu.querySelector('.auth-menu__trigger');
    var dropdown = menu.querySelector('.auth-menu__dropdown');
    var logout = menu.querySelector('[data-auth-logout]');
    var switchAccount = menu.querySelector('[data-auth-switch]');

    trigger.addEventListener('click', function (event) {
      event.preventDefault();
      var isOpen = menu.classList.contains('is-open');
      closeAllMenus();
      if (!isOpen) {
        menu.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
        dropdown.hidden = false;
      }
    });

    logout.addEventListener('click', function () {
      logoutAndRedirect();
    });

    switchAccount.addEventListener('click', function () {
      switchAccountRedirect();
    });
  }

  function renderHeaderAuth() {
    var containers = document.querySelectorAll('[data-auth-container]');
    if (!containers.length) {
      return;
    }

    var profile = readAuth();

    containers.forEach(function (container) {
      if (!profile) {
        buildGuestActions(container);
        return;
      }

      var isMobile = container.dataset.authVariant === 'mobile';
      container.innerHTML = buildMenuMarkup(profile, isMobile);
      bindMenu(container);
    });

    applyHeaderAvatars();
  }

  function renderAccountProfile() {
    var profile = readAuth();
    if (!profile) {
      return;
    }

    var nameNode = document.querySelector('[data-account-name]');
    var emailNode = document.querySelector('[data-account-email]');
    var avatarNode = document.querySelector('[data-account-avatar]');

    if (nameNode) {
      nameNode.textContent = profile.name || defaultProfile.name;
    }
    if (emailNode) {
      emailNode.textContent = profile.email || defaultProfile.email;
    }
    if (avatarNode) {
      avatarNode.textContent = profile.initials || deriveInitials(profile.name || '');
    }
  }

  var HALL_STORE_KEY = 'audiohub-hall-contributions-v1';

  function readHallContributions() {
    try {
      var raw = window.localStorage.getItem(HALL_STORE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function writeHallContributions(data) {
    try {
      window.localStorage.setItem(HALL_STORE_KEY, JSON.stringify(data || {}));
    } catch (error) {
    }
  }

  function toContributionSeed(profile) {
    var name = profile && profile.name ? String(profile.name) : defaultProfile.name;
    return {
      id: String(name).toLowerCase().replace(/\s+/g, '-'),
      name: name,
      avatar: deriveInitials(name),
      week: 0,
      month: 0,
      all: 0,
      updatedAt: new Date().toISOString()
    };
  }

  function addContribution(delta, profileOverride) {
    var points = Number(delta);
    if (isNaN(points) || points <= 0) return;
    var profile = profileOverride || readAuth() || defaultProfile;
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
    } catch (error) {
    }
  }

  window.AudioHubHall = {
    read: readHallContributions,
    write: writeHallContributions,
    add: addContribution
  };

  function bindDemoEntrypoints() {
    document.querySelectorAll('[data-auth-login], [data-auth-register]').forEach(function (link) {
      link.addEventListener('click', function () {
        loginDemo({});
      });
    });
  }

  document.addEventListener('click', function (event) {
    if (!event.target.closest('.auth-menu')) {
      closeAllMenus();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closeAllMenus();
    }
  });

  bindDemoEntrypoints();
  bindAuthForms();
  hydrateAuthFromToken();
  renderHeaderAuth();
  renderAccountProfile();

  // Expose rebind for SPA router to call after navigation
  window.AudioHubAuthRebind = rebindAuthForms;

  // Hide admin-only elements for non-admin users
  (function hideAdminOnly() {
    try {
      var raw = window.localStorage.getItem('audiohub-demo-auth');
      var auth = raw ? JSON.parse(raw) : null;
      if (!auth || !auth.isAdmin) {
        document.querySelectorAll('[data-admin-only]').forEach(function(el) {
          el.style.display = 'none';
        });
      }
    } catch(e) {}
  })();
})();
