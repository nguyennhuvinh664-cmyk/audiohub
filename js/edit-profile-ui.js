(function () {
  var root = document.querySelector('.edit-profile-page');
  if (!root) return;

  var STORAGE_KEY = 'audiohub-demo-auth';
  var form = document.querySelector('[data-edit-profile-form]');
  var nameInput = document.querySelector('[data-edit-name]');
  var statusNode = document.querySelector('[data-edit-status]');
  var saveButton = document.querySelector('[data-edit-save]');
  var avatarNode = document.querySelector('[data-edit-avatar]');
  var avatarInput = document.querySelector('[data-edit-avatar-input]');
  var avatarPickButton = document.querySelector('[data-edit-avatar-pick]');
  var currentPasswordInput = document.querySelector('[data-edit-password-current]');
  var nextPasswordInput = document.querySelector('[data-edit-password-next]');
  var confirmPasswordInput = document.querySelector('[data-edit-password-confirm]');
  var AVATAR_STORAGE_KEY = 'audiohub-account-avatar-v1';
  var PASSWORD_KEY = 'audiohub-demo-password';
  var pendingAvatarDataUrl = '';

  function deriveInitials(name) {
    var source = String(name || '').trim();
    if (!source) return 'AH';
    var parts = source.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function readProfile() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !parsed.isLoggedIn) {
        return {
          isLoggedIn: true,
          name: 'Anh Ngọc',
          email: 'anhngoc@audiohub.vn',
          initials: 'AN',
          tier: 'Hội viên Kim Cương'
        };
      }
      return {
        isLoggedIn: true,
        name: String(parsed.name || 'Anh Ngọc'),
        email: String(parsed.email || 'anhngoc@audiohub.vn'),
        initials: String(parsed.initials || deriveInitials(parsed.name || 'Anh Ngọc')),
        tier: String(parsed.tier || 'Hội viên Kim Cương')
      };
    } catch (error) {
      return {
        isLoggedIn: true,
        name: 'Anh Ngọc',
        email: 'anhngoc@audiohub.vn',
        initials: 'AN',
        tier: 'Hội viên Kim Cương'
      };
    }
  }

  function writeProfile(profile) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }

  function readAvatar() {
    try {
      return String(window.localStorage.getItem(AVATAR_STORAGE_KEY) || '');
    } catch (error) {
      return '';
    }
  }

  function writeAvatar(value) {
    try {
      if (!value) {
        window.localStorage.removeItem(AVATAR_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(AVATAR_STORAGE_KEY, String(value));
    } catch (error) {
    }
  }

  function readPassword() {
    try {
      return String(window.localStorage.getItem(PASSWORD_KEY) || '123456');
    } catch (error) {
      return '123456';
    }
  }

  function writePassword(value) {
    try {
      window.localStorage.setItem(PASSWORD_KEY, String(value || '123456'));
    } catch (error) {
    }
  }

  function applyAvatar(dataUrl, fallbackInitials) {
    if (!avatarNode) return;
    if (!dataUrl) {
      avatarNode.style.backgroundImage = '';
      avatarNode.textContent = fallbackInitials || 'AH';
      return;
    }
    avatarNode.style.backgroundImage = 'url("' + String(dataUrl).replace(/"/g, '&quot;') + '")';
    avatarNode.textContent = '';
  }

  function bindAvatarPicker(initials) {
    if (!avatarPickButton || !avatarInput) return;
    avatarPickButton.addEventListener('click', function () {
      avatarInput.click();
    });
    avatarInput.addEventListener('change', function () {
      var file = avatarInput.files && avatarInput.files[0];
      if (!file) return;
      if (!/^image\//.test(String(file.type || ''))) {
        showStatus('Ảnh đại diện phải là file ảnh hợp lệ.', 'error');
        try { avatarInput.value = ''; } catch (error) {}
        return;
      }
      if (typeof file.size === 'number' && file.size > 3 * 1024 * 1024) {
        showStatus('Ảnh đại diện tối đa 3MB.', 'error');
        try { avatarInput.value = ''; } catch (error) {}
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        pendingAvatarDataUrl = typeof reader.result === 'string' ? reader.result : '';
        applyAvatar(pendingAvatarDataUrl, initials);
      };
      reader.readAsDataURL(file);
      try { avatarInput.value = ''; } catch (error) {}
    });
  }

  function validatePasswordChange() {
    var currentValue = currentPasswordInput ? String(currentPasswordInput.value || '') : '';
    var nextValue = nextPasswordInput ? String(nextPasswordInput.value || '') : '';
    var confirmValue = confirmPasswordInput ? String(confirmPasswordInput.value || '') : '';

    if (!currentValue && !nextValue && !confirmValue) {
      return { ok: true, changed: false, nextPassword: '' };
    }

    if (!currentValue || !nextValue || !confirmValue) {
      return { ok: false, message: 'Vui lòng nhập đủ 3 trường mật khẩu.' };
    }

    if (currentValue !== readPassword()) {
      return { ok: false, message: 'Mật khẩu hiện tại không đúng.' };
    }

    if (nextValue.length < 6) {
      return { ok: false, message: 'Mật khẩu mới tối thiểu 6 ký tự.' };
    }

    if (nextValue !== confirmValue) {
      return { ok: false, message: 'Xác nhận mật khẩu mới không khớp.' };
    }

    return { ok: true, changed: true, nextPassword: nextValue };
  }

  function clearPasswordInputs() {
    if (currentPasswordInput) currentPasswordInput.value = '';
    if (nextPasswordInput) nextPasswordInput.value = '';
    if (confirmPasswordInput) confirmPasswordInput.value = '';
  }

  function updateProfileViaApi(name, passwordCheck) {
    if (!window.AudioHubApi || typeof window.AudioHubApi.request !== 'function' || typeof window.AudioHubApi.isEnabled !== 'function' || !window.AudioHubApi.isEnabled()) {
      return Promise.resolve(null);
    }

    var payload = { displayName: name };
    if (pendingAvatarDataUrl) {
      payload.avatarDataUrl = pendingAvatarDataUrl;
    }
    if (passwordCheck && passwordCheck.changed) {
      payload.currentPassword = currentPasswordInput ? String(currentPasswordInput.value || '') : '';
      payload.newPassword = passwordCheck.nextPassword;
    }

    return window.AudioHubApi.request('/auth/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  function showStatus(message, tone) {
    if (!statusNode) return;
    statusNode.textContent = message;
    statusNode.classList.remove('is-hidden', 'is-error', 'is-success');
    statusNode.classList.add(tone === 'error' ? 'is-error' : 'is-success');
  }

  function isUnauthorizedError(error) {
    var message = error && error.message ? String(error.message).trim().toLowerCase() : '';
    return message === 'unauthorized' || message.indexOf('unauthor') >= 0 || message.indexOf('401') >= 0;
  }

  function clearAuthToken() {
    try {
      window.localStorage.removeItem('audiohub-auth-token');
    } catch (error) {
    }
  }

  function hydrate() {
    var profile = readProfile();
    if (nameInput) nameInput.value = profile.name;
    pendingAvatarDataUrl = readAvatar();
    applyAvatar(pendingAvatarDataUrl, profile.initials);
    bindAvatarPicker(profile.initials);
  }

  if (!form) return;

  hydrate();

  form.addEventListener('submit', function (event) {
    event.preventDefault();

    var profile = readProfile();
    var name = nameInput ? String(nameInput.value || '').trim() : '';

    if (!name) {
      showStatus('Vui lòng nhập họ tên.', 'error');
      return;
    }

    var passwordCheck = validatePasswordChange();
    if (!passwordCheck.ok) {
      showStatus(passwordCheck.message || 'Không thể đổi mật khẩu.', 'error');
      return;
    }

    var initials = deriveInitials(name);
    var nextProfile = {
      isLoggedIn: true,
      name: name,
      email: profile.email,
      initials: initials,
      tier: profile.tier || 'Hội viên Kim Cương'
    };

    if (saveButton) saveButton.disabled = true;

    writeProfile(nextProfile);
    if (pendingAvatarDataUrl) {
      writeAvatar(pendingAvatarDataUrl);
    }
    if (passwordCheck.changed) {
      writePassword(passwordCheck.nextPassword);
    }
    clearPasswordInputs();

    updateProfileViaApi(name, passwordCheck)
      .then(function (apiUser) {
        if (apiUser && apiUser.displayName) {
          nextProfile.name = String(apiUser.displayName);
          nextProfile.initials = deriveInitials(nextProfile.name);
        }
        if (apiUser && apiUser.email) {
          nextProfile.email = String(apiUser.email);
        }
        if (apiUser && apiUser.avatarDataUrl) {
          pendingAvatarDataUrl = String(apiUser.avatarDataUrl);
        }
        writeProfile(nextProfile);
        if (pendingAvatarDataUrl) {
          writeAvatar(pendingAvatarDataUrl);
        }
        showStatus('Đã lưu thay đổi hồ sơ.', 'success');
        window.setTimeout(function () {
          window.location.href = 'account.html';
        }, 600);
      })
      .catch(function (error) {
        if (isUnauthorizedError(error)) {
          clearAuthToken();
          showStatus('Đã lưu thay đổi hồ sơ.', 'success');
          window.setTimeout(function () {
            window.location.href = 'account.html';
          }, 600);
          return;
        }
        var message = error && error.message ? error.message : 'Đã lưu cục bộ nhưng chưa đồng bộ máy chủ.';
        showStatus(message, 'error');
      })
      .then(function () {
        if (saveButton) saveButton.disabled = false;
      });
  });
})();
