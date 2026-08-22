/**
 * Super Admin UI - AudioHub
 * Manages user roles and admin privileges
 */
(function () {
  'use strict';

  /* ═══ STORAGE KEYS ═══════════════════════════════════════════════════ */
  var USERS_KEY = 'audiohub-users-list';
  var SUPER_ADMIN_KEY = 'audiohub-super-admin';
  var ADMIN_REQUESTS_KEY = 'audiohub-admin-requests';

  /* ═══ DOM REFERENCES ══════════════════════════════════════════════════ */
  var els = {
    accessDenied: document.querySelector('[data-access-denied]'),
    adminPanel: document.querySelectorAll('[data-admin-panel]'),
    totalUsers: document.querySelector('[data-total-users]'),
    totalAdmins: document.querySelector('[data-total-admins]'),
    totalMembers: document.querySelector('[data-total-members]'),
    usersList: document.querySelector('[data-users-list]'),
    emptyUsers: document.querySelector('[data-empty-users]'),
    emptyRequests: document.querySelector('[data-empty-requests]'),
    adminRequests: document.querySelector('[data-admin-requests]'),
    searchInput: document.querySelector('#search-users'),
    newAdminInput: document.querySelector('#new-admin-email'),
    addAdminBtn: document.querySelector('[data-add-admin]'),
    resetAllBtn: document.querySelector('[data-reset-all]'),
    exportDataBtn: document.querySelector('[data-export-data]'),
    confirmModal: document.querySelector('[data-confirm-modal]'),
    confirmTitle: document.querySelector('[data-confirm-title]'),
    confirmMessage: document.querySelector('[data-confirm-message]'),
    confirmOk: document.querySelector('[data-confirm-ok]'),
    confirmCancel: document.querySelectorAll('[data-confirm-cancel]')
  };

  /* ═══ HELPERS ═════════════════════════════════════════════════════════ */

  // Fetch users from API (production PostgreSQL)
  async function fetchUsersFromAPI() {
    try {
      var profile = null;
      try {
        var raw = localStorage.getItem('audiohub-auth-profile');
        profile = raw ? JSON.parse(raw) : null;
      } catch (e) {}

      if (!profile || !profile.isLoggedIn || !profile.token) {
        return null;
      }

      var response = await fetch('/api/v1/auth/admin/users', {
        headers: {
          'Authorization': 'Bearer ' + profile.token
        }
      });

      if (!response.ok) {
        return null;
      }

      var data = await response.json();
      return data;
    } catch (e) {
      return null;
    }
  }

  // Read users from localStorage (fallback)
  function readUsersLocal() {
    try {
      var raw = localStorage.getItem(USERS_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  // Write users to localStorage
  function writeUsers(users) {
    try {
      localStorage.setItem(USERS_KEY, JSON.stringify(users));
    } catch (e) {}
  }

  // Main readUsers function - tries API first, falls back to localStorage
  async function readUsers() {
    // Try fetching from API first
    var apiUsers = await fetchUsersFromAPI();
    if (apiUsers && Array.isArray(apiUsers)) {
      // Transform API data to match expected format
      var users = apiUsers.map(function(u) {
        return {
          id: u.id,
          name: u.displayName,
          email: u.email,
          role: u.isAdmin ? 'admin' : 'member',
          createdAt: u.createdAt,
          status: 'active'
        };
      });
      // Update localStorage with fresh data
      writeUsers(users);
      return users;
    }

    // Fallback to localStorage
    return readUsersLocal();
  }

  function getSuperAdmin() {
    try {
      return localStorage.getItem(SUPER_ADMIN_KEY) || '';
    } catch (e) { return ''; }
  }

  function setSuperAdmin(email) {
    try {
      localStorage.setItem(SUPER_ADMIN_KEY, email.toLowerCase());
    } catch (e) {}
  }

  function readAdminRequests() {
    try {
      var raw = localStorage.getItem(ADMIN_REQUESTS_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) { return []; }
  }

  function writeAdminRequests(requests) {
    try {
      localStorage.setItem(ADMIN_REQUESTS_KEY, JSON.stringify(requests));
    } catch (e) {}
  }

  function deriveInitials(name) {
    var s = String(name || '').trim();
    if (!s) return '??';
    var parts = s.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    try {
      var d = new Date(dateStr);
      return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (e) { return dateStr; }
  }

  /* ═══ AUTH CHECK ══════════════════════════════════════════════════════ */

  function checkAccess() {
    var profile = null;
    try {
      var raw = localStorage.getItem('audiohub-auth-profile');
      profile = raw ? JSON.parse(raw) : null;
    } catch (e) {}

    var superAdmin = getSuperAdmin();
    var userEmail = (profile && profile.email || '').toLowerCase();
    var isLoggedIn = profile && profile.isLoggedIn;

    // First time setup: if no super admin exists and user is logged in
    if (!superAdmin && isLoggedIn && userEmail) {
      setSuperAdmin(userEmail);
      showAdminPanel();
      showNotification('Chào mừng Super Admin! Bạn là quản trị viên đầu tiên.', 'success');
      return;
    }

    // Check if current user is super admin
    if (isLoggedIn && userEmail === superAdmin) {
      showAdminPanel();
      return;
    }

    // Access denied
    showAccessDenied();
  }

  function showAdminPanel() {
    if (els.accessDenied) els.accessDenied.classList.add('is-hidden');
    els.adminPanel.forEach(function (panel) {
      panel.classList.remove('is-hidden');
    });
    renderAll();
  }

  function showAccessDenied() {
    if (els.accessDenied) els.accessDenied.classList.remove('is-hidden');
    els.adminPanel.forEach(function (panel) {
      panel.classList.add('is-hidden');
    });
  }

  /* ═══ RENDER ══════════════════════════════════════════════════════════ */

  async function renderAll() {
    await renderStats();
    await renderUsersList();
    renderAdminRequests();
  }

  async function renderStats() {
    var users = await readUsers();
    var admins = users.filter(function (u) { return u.role === 'admin'; });

    if (els.totalUsers) els.totalUsers.textContent = users.length;
    if (els.totalAdmins) els.totalAdmins.textContent = admins.length;
    if (els.totalMembers) els.totalMembers.textContent = users.length - admins.length;
  }

  async function renderUsersList(filter) {
    var users = await readUsers();
    var tbody = els.usersList;
    if (!tbody) return;

    // Apply filter
    if (filter) {
      var f = filter.toLowerCase();
      users = users.filter(function (u) {
        return (u.name || '').toLowerCase().includes(f) ||
               (u.email || '').toLowerCase().includes(f);
      });
    }

    if (users.length === 0) {
      tbody.innerHTML = '';
      if (els.emptyUsers) els.emptyUsers.classList.remove('is-hidden');
      return;
    }

    if (els.emptyUsers) els.emptyUsers.classList.add('is-hidden');

    var superAdmin = getSuperAdmin();

    tbody.innerHTML = users.map(function (user) {
      var isSuperAdmin = user.email === superAdmin;
      var isAdmin = user.role === 'admin' || isSuperAdmin;
      var roleClass = isSuperAdmin ? 'super-admin' : (isAdmin ? 'admin' : 'member');
      var roleName = isSuperAdmin ? 'Super Admin' : (isAdmin ? 'Admin' : 'Thành viên');

      var avatar = '<div class="user-cell__avatar">' + deriveInitials(user.name) + '</div>';
      var nameCell = '<div class="user-cell">' + avatar + '<span class="user-cell__name">' + escapeHtml(user.name) + '</span></div>';
      var emailCell = escapeHtml(user.email);
      var roleCell = '<span class="role-badge role-badge--' + roleClass + '">' + roleName + '</span>';
      var dateCell = formatDate(user.createdAt);

      // Action buttons
      var actions = '';
      if (isSuperAdmin) {
        actions = '<span style="color: var(--text-secondary); font-size: 0.8rem;">—</span>';
      } else if (isAdmin) {
        actions = '<button class="action-btn action-btn--revoke" data-revoke="' + escapeHtml(user.email) + '" title="Thu hồi Admin"><i class="fa-solid fa-user-minus"></i></button>';
      } else {
        actions = '<button class="action-btn action-btn--grant" data-grant="' + escapeHtml(user.email) + '" title="Cấp Admin"><i class="fa-solid fa-user-plus"></i></button>';
      }

      return '<tr>' +
        '<td>' + nameCell + '</td>' +
        '<td>' + emailCell + '</td>' +
        '<td>' + roleCell + '</td>' +
        '<td>' + dateCell + '</td>' +
        '<td><div class="action-btns">' + actions + '</div></td>' +
      '</tr>';
    }).join('');

    // Bind action buttons
    tbody.querySelectorAll('[data-grant]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var email = btn.getAttribute('data-grant');
        grantAdmin(email);
      });
    });

    tbody.querySelectorAll('[data-revoke]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var email = btn.getAttribute('data-revoke');
        revokeAdmin(email);
      });
    });
  }

  function renderAdminRequests() {
    var requests = readAdminRequests();
    var container = els.adminRequests;
    if (!container) return;

    if (requests.length === 0) {
      container.innerHTML = '';
      if (els.emptyRequests) els.emptyRequests.classList.remove('is-hidden');
      return;
    }

    if (els.emptyRequests) els.emptyRequests.classList.add('is-hidden');

    container.innerHTML = requests.map(function (req) {
      return '<div class="request-item">' +
        '<div class="user-cell">' +
          '<div class="user-cell__avatar">' + deriveInitials(req.name) + '</div>' +
          '<div>' +
            '<div class="user-cell__name">' + escapeHtml(req.name) + '</div>' +
            '<div style="font-size: 0.8rem; color: var(--text-secondary);">' + escapeHtml(req.email) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="request-actions">' +
          '<button class="action-btn action-btn--grant" data-grant="' + escapeHtml(req.email) + '" title="Chấp nhận"><i class="fa-solid fa-check"></i></button>' +
          '<button class="action-btn action-btn--delete" data-deny="' + escapeHtml(req.email) + '" title="Từ chối"><i class="fa-solid fa-times"></i></button>' +
        '</div>' +
      '</div>';
    }).join('');

    // Bind buttons
    container.querySelectorAll('[data-grant]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var email = btn.getAttribute('data-grant');
        grantAdmin(email);
        denyRequest(email);
      });
    });

    container.querySelectorAll('[data-deny]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var email = btn.getAttribute('data-deny');
        denyRequest(email);
      });
    });
  }

  /* ═══ ACTIONS ═════════════════════════════════════════════════════════ */

  async function grantAdmin(email) {
    email = (email || '').toLowerCase().trim();
    if (!email) return;

    var users = await readUsers();
    var user = users.find(function (u) { return u.email.toLowerCase() === email; });

    if (user) {
      user.role = 'admin';
      writeUsers(users);
    } else {
      // Create new user entry
      users.push({
        name: email.split('@')[0],
        email: email,
        role: 'admin',
        createdAt: new Date().toISOString()
      });
      writeUsers(users);
    }

    // Update profile if it's the current user
    updateCurrentProfile(email, true);

    showNotification('Đã cấp quyền Admin cho ' + email, 'success');
    await renderAll();
  }

  async function revokeAdmin(email) {
    email = (email || '').toLowerCase().trim();
    if (!email) return;

    var superAdmin = getSuperAdmin();
    if (email === superAdmin) {
      showNotification('Không thể thu hồi quyền Super Admin!', 'error');
      return;
    }

    var users = await readUsers();
    var user = users.find(function (u) { return u.email.toLowerCase() === email; });
    if (user) {
      user.role = 'member';
      writeUsers(users);
    }

    // Update profile if it's the current user
    updateCurrentProfile(email, false);

    showNotification('Đã thu hồi quyền Admin của ' + email, 'success');
    await renderAll();
  }

  function addAdminByEmail(email) {
    email = (email || '').toLowerCase().trim();
    if (!email) {
      showNotification('Vui lòng nhập email!', 'error');
      return;
    }

    if (!email.includes('@')) {
      showNotification('Email không hợp lệ!', 'error');
      return;
    }

    grantAdmin(email);
    if (els.newAdminInput) els.newAdminInput.value = '';
  }

  function updateCurrentProfile(email, isAdmin) {
    try {
      var raw = localStorage.getItem('audiohub-auth-profile');
      var profile = raw ? JSON.parse(raw) : null;
      if (profile && profile.email && profile.email.toLowerCase() === email) {
        profile.isAdmin = isAdmin;
        localStorage.setItem('audiohub-auth-profile', JSON.stringify(profile));
      }
    } catch (e) {}
  }

  function denyRequest(email) {
    var requests = readAdminRequests().filter(function (r) {
      return r.email.toLowerCase() !== email.toLowerCase();
    });
    writeAdminRequests(requests);
    renderAdminRequests();
  }

  /* ═══ CONFIRM MODAL ═══════════════════════════════════════════════════ */

  var confirmCallback = null;

  function showConfirm(title, message, callback) {
    if (els.confirmTitle) els.confirmTitle.textContent = title;
    if (els.confirmMessage) els.confirmMessage.textContent = message;
    if (els.confirmModal) els.confirmModal.classList.remove('is-hidden');
    confirmCallback = callback;
  }

  function hideConfirm() {
    if (els.confirmModal) els.confirmModal.classList.add('is-hidden');
    confirmCallback = null;
  }

  /* ═══ NOTIFICATION ════════════════════════════════════════════════════ */

  function showNotification(message, type) {
    var existing = document.querySelector('.sa-notification');
    if (existing) existing.remove();

    var div = document.createElement('div');
    div.className = 'sa-notification sa-notification--' + (type || 'info');
    div.innerHTML = '<i class="fa-solid fa-' + (type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle') + '"></i> ' + escapeHtml(message);
    document.body.appendChild(div);

    setTimeout(function () {
      div.classList.add('sa-notification--show');
    }, 10);

    setTimeout(function () {
      div.classList.remove('sa-notification--show');
      setTimeout(function () { div.remove(); }, 300);
    }, 3000);
  }

  /* ═══ EXPORT DATA ═════════════════════════════════════════════════════ */

  async function exportAllData() {
    var users = await readUsers();
    var data = {
      users: users,
      superAdmin: getSuperAdmin(),
      adminRequests: readAdminRequests(),
      exportedAt: new Date().toISOString()
    };

    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'audiohub-admin-data-' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);

    showNotification('Đã xuất dữ liệu thành công!', 'success');
  }

  function resetAllData() {
    showConfirm(
      'Xóa tất cả dữ liệu?',
      'Hành động này sẽ xóa toàn bộ dữ liệu người dùng và không thể hoàn tác. Bạn có chắc chắn?',
      function () {
        localStorage.removeItem(USERS_KEY);
        localStorage.removeItem(SUPER_ADMIN_KEY);
        localStorage.removeItem(ADMIN_REQUESTS_KEY);
        showNotification('Đã xóa tất cả dữ liệu!', 'success');
        renderAll();
      }
    );
  }

  /* ═══ UTILITY ═════════════════════════════════════════════════════════ */

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  /* ═══ EVENT LISTENERS ═════════════════════════════════════════════════ */

  // Add admin button
  if (els.addAdminBtn) {
    els.addAdminBtn.addEventListener('click', function () {
      addAdminByEmail(els.newAdminInput ? els.newAdminInput.value : '');
    });
  }

  // Enter key on input
  if (els.newAdminInput) {
    els.newAdminInput.addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        addAdminByEmail(els.newAdminInput.value);
      }
    });
  }

  // Search users
  if (els.searchInput) {
    els.searchInput.addEventListener('input', function () {
      renderUsersList(els.searchInput.value);
    });
  }

  // Reset all button
  if (els.resetAllBtn) {
    els.resetAllBtn.addEventListener('click', resetAllData);
  }

  // Export data button
  if (els.exportDataBtn) {
    els.exportDataBtn.addEventListener('click', exportAllData);
  }

  // Confirm modal
  if (els.confirmOk) {
    els.confirmOk.addEventListener('click', function () {
      if (confirmCallback) confirmCallback();
      hideConfirm();
    });
  }

  els.confirmCancel.forEach(function (btn) {
    btn.addEventListener('click', hideConfirm);
  });

  /* ═══ SEED DEMO DATA ═════════════════════════════════════════════════ */

  async function seedDemoData() {
    var users = await readUsers();
    if (users.length > 0) return; // Already has data

    // Add current user if logged in
    try {
      var raw = localStorage.getItem('audiohub-auth-profile');
      var profile = raw ? JSON.parse(raw) : null;
      if (profile && profile.isLoggedIn) {
        users.push({
          name: profile.name || 'Admin',
          email: profile.email || 'admin@audiohub.com',
          role: 'admin',
          createdAt: new Date().toISOString()
        });
        writeUsers(users);
        setSuperAdmin(profile.email || 'admin@audiohub.com');
      }
    } catch (e) {}
  }

  /* ═══ INIT ════════════════════════════════════════════════════════════ */

  // Add notification styles
  var style = document.createElement('style');
  style.textContent = [
    '.sa-notification {',
    '  position: fixed; top: 20px; right: 20px; z-index: 9999;',
    '  padding: 14px 20px; border-radius: 12px;',
    '  background: #1a1a2e; border: 1px solid rgba(255,255,255,0.1);',
    '  color: #fff; font-size: 0.95rem; font-weight: 500;',
    '  display: flex; align-items: center; gap: 10px;',
    '  box-shadow: 0 10px 40px rgba(0,0,0,0.4);',
    '  transform: translateX(120%); transition: transform 0.3s ease;',
    '}',
    '.sa-notification--show { transform: translateX(0); }',
    '.sa-notification--success { border-color: rgba(34,197,94,0.4); }',
    '.sa-notification--success i { color: #22c55e; }',
    '.sa-notification--error { border-color: rgba(239,68,68,0.4); }',
    '.sa-notification--error i { color: #ef4444; }',
    '.request-item {',
    '  display: flex; align-items: center; justify-content: space-between;',
    '  padding: 12px 16px; background: rgba(255,255,255,0.03);',
    '  border-radius: 12px; margin-bottom: 8px;',
    '}',
    '.request-actions { display: flex; gap: 8px; }'
  ].join('\n');
  document.head.appendChild(style);

  // Initialize async
  (async function() {
    await seedDemoData();
    checkAccess();
  })();
})();
