(function () {
  var root = document.querySelector('.account-page');
  if (!root) {
    return;
  }

  var mount = document.querySelector('[data-stories-mine]');
  if (!mount) {
    return;
  }

  var deleteAllButton = document.querySelector('[data-stories-delete-all]');
  var cleanupButton = document.querySelector('[data-stories-cleanup]');
  var actionNote = document.querySelector('[data-stories-action-note]');

  var trashMount = document.querySelector('[data-audio-trash]');
  var trashNote = document.querySelector('[data-audio-trash-note]');
  var playlistRoot = document.querySelector('[data-playlist-root]');
  var playlistNote = document.querySelector('[data-playlist-note]');
  var TRASH_RETENTION_DAYS = 7;
  var TRASH_FALLBACK_KEY = 'audiohub_trash_fallback_v1';
  var PLAYLISTS_KEY = 'audiohub-playlists-v1';
  var PLAYLIST_CONTEXT_KEY = 'audiohub-playlist-context-v1';
  var PLAYLIST_LAST_ACTIVE_KEY = 'audiohub-playlist-last-active-v1';
  var trashBusy = false;
  var activePlaylistId = '';
  var pendingStoryIdForPlaylist = '';
  var playlistDropdown = null;
  var AVATAR_STORAGE_KEY = 'audiohub-account-avatar-v1';

  function readAvatarDataUrl() {
    try {
      if (!window.localStorage) return '';
      return String(window.localStorage.getItem(AVATAR_STORAGE_KEY) || '');
    } catch (error) {
      return '';
    }
  }

  function writeAvatarDataUrl(value) {
    try {
      if (!window.localStorage) return;
      if (!value) {
        window.localStorage.removeItem(AVATAR_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(AVATAR_STORAGE_KEY, String(value));
    } catch (error) {
    }
  }

  function applyAvatar(dataUrl) {
    var avatarNode = document.querySelector('[data-account-avatar]');
    if (!avatarNode) return;
    if (!dataUrl) {
      avatarNode.style.backgroundImage = '';
      return;
    }
    avatarNode.style.backgroundImage = 'url("' + String(dataUrl).replace(/"/g, '&quot;') + '")';
    avatarNode.textContent = '';
  }

  function initAvatarUpload() {
    var editButton = document.querySelector('[data-account-avatar-edit]');
    var fileInput = document.querySelector('[data-account-avatar-input]');
    if (!editButton || !fileInput) return;

    applyAvatar(readAvatarDataUrl());

    editButton.addEventListener('click', function () {
      fileInput.click();
    });

    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var isImage = /^image\//.test(String(file.type || ''));
      if (!isImage) {
        window.alert('Vui lòng chọn file ảnh hợp lệ.');
        try { fileInput.value = ''; } catch (error) {}
        return;
      }
      if (typeof file.size === 'number' && file.size > 3 * 1024 * 1024) {
        window.alert('Ảnh đại diện tối đa 3MB.');
        try { fileInput.value = ''; } catch (error) {}
        return;
      }
      var reader = new FileReader();
      reader.onload = function () {
        var dataUrl = typeof reader.result === 'string' ? reader.result : '';
        if (!dataUrl) return;
        applyAvatar(dataUrl);
        writeAvatarDataUrl(dataUrl);
      };
      reader.readAsDataURL(file);
      try { fileInput.value = ''; } catch (error) {}
    });
  }

  initAvatarUpload();

  function closePlaylistPicker() {
    pendingStoryIdForPlaylist = '';
    if (!playlistDropdown) {
      return;
    }
    try {
      playlistDropdown.remove();
    } catch (error) {
    }
    playlistDropdown = null;
  }

  function openPlaylistPicker(storyId, anchorButton) {
    var playlists = readPlaylists().map(normalizePlaylist);
    if (!playlists.length) {
      setPlaylistNote('Bạn chưa có playlist. Hãy tạo playlist trước.', 'warning');
      return;
    }

    closePlaylistPicker();
    pendingStoryIdForPlaylist = String(storyId || '');

    var dropdown = document.createElement('div');
    dropdown.className = 'playlist-dropdown';
    dropdown.innerHTML = '<div class="playlist-dropdown__title">Chọn playlist</div>'
      + playlists.map(function (playlist) {
        return '<button type="button" class="playlist-dropdown__item" data-playlist-choice="' + escapeHtml(playlist.id) + '">'
          + escapeHtml(playlist.name)
          + '<span class="playlist-dropdown__meta">' + ((playlist.items || []).length) + ' mục</span></button>';
      }).join('')
      + '<button type="button" class="playlist-dropdown__close" data-playlist-choice-close>Đóng</button>';

    document.body.appendChild(dropdown);
    playlistDropdown = dropdown;

    var rect = anchorButton && anchorButton.getBoundingClientRect ? anchorButton.getBoundingClientRect() : null;
    var scrollY = window.scrollY || window.pageYOffset || 0;
    var scrollX = window.scrollX || window.pageXOffset || 0;
    var top = rect ? (rect.bottom + scrollY + 6) : (120 + scrollY);
    var left = rect ? (rect.left + scrollX) : (20 + scrollX);

    dropdown.style.top = Math.max(12, top) + 'px';
    dropdown.style.left = Math.max(12, left) + 'px';

    dropdown.addEventListener('click', function (event) {
      var closeBtn = event.target && event.target.closest ? event.target.closest('[data-playlist-choice-close]') : null;
      if (closeBtn) {
        closePlaylistPicker();
        return;
      }
      var choice = event.target && event.target.closest ? event.target.closest('[data-playlist-choice]') : null;
      if (!choice) {
        return;
      }
      var playlistId = choice.getAttribute('data-playlist-choice') || '';
      if (!playlistId || !pendingStoryIdForPlaylist) {
        closePlaylistPicker();
        return;
      }
      activePlaylistId = playlistId;
      saveLastActivePlaylist(activePlaylistId);
      addStoryToPlaylist(playlistId, pendingStoryIdForPlaylist);
      closePlaylistPicker();
    });
  }

  document.addEventListener('click', function (event) {
    if (!playlistDropdown) {
      return;
    }
    var inDropdown = event.target && event.target.closest ? event.target.closest('.playlist-dropdown') : null;
    var trigger = event.target && event.target.closest ? event.target.closest('[data-story-add-playlist]') : null;
    if (!inDropdown && !trigger) {
      closePlaylistPicker();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      closePlaylistPicker();
    }
  });

  function readPlaylists() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem(PLAYLISTS_KEY) : '';
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writePlaylists(playlists) {
    try {
      if (!window.localStorage) {
        return;
      }
      window.localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(Array.isArray(playlists) ? playlists : []));
    } catch (error) {
    }
  }

  function canUsePlaylistApi() {
    return !!(window.AudioHubApi && typeof window.AudioHubApi.request === 'function' && window.AudioHubApi.isEnabled && window.AudioHubApi.isEnabled());
  }

  function mapPlaylistForApi(playlist) {
    var normalized = normalizePlaylist(playlist);
    return {
      name: normalized.name,
      status: normalized.status
    };
  }

  function syncPlaylistsFromApi() {
    if (!canUsePlaylistApi()) {
      return Promise.resolve(readPlaylists());
    }
    return window.AudioHubApi.request('/playlists', { method: 'GET' })
      .then(function (rows) {
        var next = (Array.isArray(rows) ? rows : []).map(normalizePlaylist);
        writePlaylists(next);
        return next;
      })
      .catch(function () {
        return readPlaylists();
      });
  }

  function setPlaylistNote(message, tone) {
    if (!playlistNote) {
      return;
    }
    if (!message) {
      playlistNote.textContent = '';
      playlistNote.classList.add('is-hidden');
      playlistNote.classList.remove('is-success', 'is-warning');
      return;
    }
    playlistNote.textContent = message;
    playlistNote.classList.remove('is-hidden');
    playlistNote.classList.toggle('is-success', tone === 'success');
    playlistNote.classList.toggle('is-warning', tone === 'warning');
  }

  function makePlaylistId() {
    return 'pl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function makePlaylistItemId() {
    return 'pli_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  function normalizePlaylistItem(item) {
    return {
      id: item && item.id ? String(item.id) : makePlaylistItemId(),
      storyId: item && item.storyId ? String(item.storyId) : '',
      storyTitle: item && item.storyTitle ? String(item.storyTitle) : 'Truyện mới',
      storyAuthor: item && item.storyAuthor ? String(item.storyAuthor) : 'Ẩn danh',
      chapterLabel: item && item.chapterLabel ? String(item.chapterLabel) : 'Chương 1',
      chapterIndex: item && typeof item.chapterIndex === 'number' ? item.chapterIndex : 0,
      createdAt: item && item.createdAt ? String(item.createdAt) : new Date().toISOString()
    };
  }

  function normalizePlaylist(playlist) {
    var status = playlist && playlist.status ? String(playlist.status) : 'Đang ra';
    if (status !== 'Đã hoàn thành') {
      status = 'Đang ra';
    }
    return {
      id: playlist && playlist.id ? String(playlist.id) : makePlaylistId(),
      name: playlist && playlist.name ? String(playlist.name) : 'Playlist mới',
      status: status,
      createdAt: playlist && playlist.createdAt ? String(playlist.createdAt) : new Date().toISOString(),
      updatedAt: playlist && playlist.updatedAt ? String(playlist.updatedAt) : new Date().toISOString(),
      items: Array.isArray(playlist && playlist.items) ? playlist.items.map(normalizePlaylistItem) : []
    };
  }

  function savePlaylistContext(context) {
    try {
      if (!window.localStorage) {
        return;
      }
      window.localStorage.setItem(PLAYLIST_CONTEXT_KEY, JSON.stringify(context || {}));
    } catch (error) {
    }
  }

  function saveLastActivePlaylist(playlistId) {
    try {
      if (!window.localStorage || !playlistId) {
        return;
      }
      window.localStorage.setItem(PLAYLIST_LAST_ACTIVE_KEY, String(playlistId));
    } catch (error) {
    }
  }

  function readLastActivePlaylist() {
    try {
      if (!window.localStorage) {
        return '';
      }
      return String(window.localStorage.getItem(PLAYLIST_LAST_ACTIVE_KEY) || '');
    } catch (error) {
      return '';
    }
  }

  function addStoryToPlaylist(playlistId, storyId) {
    var story = window.AudioHubStories && typeof window.AudioHubStories.getById === 'function'
      ? window.AudioHubStories.getById(storyId)
      : null;
    if (!story) {
      setPlaylistNote('Không tìm thấy truyện để thêm vào playlist.', 'warning');
      return;
    }

    var next = readPlaylists().map(function (playlist) {
      if (!playlist || String(playlist.id) !== String(playlistId)) {
        return normalizePlaylist(playlist);
      }
      var normalized = normalizePlaylist(playlist);
      var nextChapterNumber = (normalized.items || []).length + 1;
      normalized.items.push(normalizePlaylistItem({
        storyId: story.id,
        storyTitle: story.title,
        storyAuthor: story.author,
        chapterLabel: 'Chương ' + nextChapterNumber,
        chapterIndex: nextChapterNumber - 1
      }));
      normalized.items = (normalized.items || []).map(function (item, index) {
        var mapped = normalizePlaylistItem(item);
        mapped.chapterLabel = 'Chương ' + (index + 1);
        mapped.chapterIndex = index;
        return mapped;
      });
      normalized.updatedAt = new Date().toISOString();
      return normalized;
    });
    writePlaylists(next);

    if (canUsePlaylistApi()) {
      var current = next.find(function (playlist) { return String((playlist && playlist.id) || '') === String(playlistId); });
      var items = current && Array.isArray(current.items) ? current.items : [];
      var last = items.length ? items[items.length - 1] : null;
      if (last) {
        window.AudioHubApi.request('/playlists/' + encodeURIComponent(String(playlistId)) + '/items', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storyId: String(story.id || ''),
            storyTitle: String(story.title || 'Truyện mới'),
            storyAuthor: String(story.author || 'Ẩn danh'),
            chapterLabel: String(last.chapterLabel || ('Chương ' + items.length)),
            chapterIndex: Number(last.chapterIndex || (items.length - 1))
          })
        }).then(function () {
          return syncPlaylistsFromApi();
        }).then(function () {
          renderPlaylists();
        }).catch(function () {});
      }
    }

    setPlaylistNote('Đã thêm truyện vào playlist.', 'success');
    renderPlaylists();
  }

  function openPlaylistItem(playlistId, itemId) {
    var playlists = readPlaylists();
    var playlist = playlists.find(function (entry) { return entry && String(entry.id) === String(playlistId); });
    if (!playlist) {
      return;
    }
    var item = (playlist.items || []).find(function (entry) { return entry && String(entry.id) === String(itemId); });
    if (!item || !item.storyId) {
      return;
    }
    var context = {
      playlistId: String(playlist.id),
      storyId: String(item.storyId),
      chapterLabel: String(item.chapterLabel || 'Chương 1'),
      chapterIndex: typeof item.chapterIndex === 'number' ? item.chapterIndex : 0
    };
    savePlaylistContext(context);
    saveLastActivePlaylist(context.playlistId);
    var params = new URLSearchParams();
    params.set('id', context.storyId);
    params.set('playlistId', context.playlistId);
    params.set('chapter', context.chapterLabel);
    params.set('chapterIndex', String(context.chapterIndex));
    window.location.href = 'story-detail.html?' + params.toString();
  }

  function renderPlaylists() {
    if (!playlistRoot) {
      return;
    }
    var listNode = playlistRoot.querySelector('[data-playlist-list]');
    var detailNode = playlistRoot.querySelector('[data-playlist-detail]');
    if (!listNode || !detailNode) {
      return;
    }
    var playlists = readPlaylists().map(normalizePlaylist);
    if (!playlists.length) {
      listNode.innerHTML = '<p class="playlist-empty">Chưa có playlist nào.</p>';
      detailNode.innerHTML = '<p class="playlist-empty">Tạo playlist mới để thêm truyện/chương.</p>';
      return;
    }
    if (!activePlaylistId || !playlists.some(function (entry) { return String(entry.id) === String(activePlaylistId); })) {
      activePlaylistId = String(playlists[0].id);
    }

    listNode.innerHTML = playlists.map(function (playlist) {
      var id = String(playlist.id);
      var activeClass = id === String(activePlaylistId) ? ' is-active' : '';
      return '' +
        '<div class="playlist-item' + activeClass + '" data-playlist-select="' + escapeHtml(id) + '">' +
        '<div><div class="playlist-name">' + escapeHtml(playlist.name) + '</div><div class="playlist-meta">' + (playlist.items || []).length + ' mục · ' + escapeHtml(playlist.status || 'Đang ra') + '</div></div>' +
        '<div class="playlist-actions">' +
        '<div class="playlist-status-wrap" data-playlist-status-wrap="' + escapeHtml(id) + '">' +
        '<span class="playlist-status-label">Trạng thái</span>' +
        '<button type="button" class="playlist-status-trigger" data-playlist-status-trigger="' + escapeHtml(id) + '" aria-expanded="false">' + escapeHtml(playlist.status || 'Đang ra') + '</button>' +
        '<div class="playlist-status-menu is-hidden" data-playlist-status-menu="' + escapeHtml(id) + '">' +
        '<button type="button" class="playlist-status-option" data-playlist-status-option="' + escapeHtml(id) + '::Đang ra">Đang ra</button>' +
        '<button type="button" class="playlist-status-option" data-playlist-status-option="' + escapeHtml(id) + '::Đã hoàn thành">Hoàn thành</button>' +
        '</div>' +
        '</div>' +
        '<button type="button" class="playlist-btn" data-playlist-rename="' + escapeHtml(id) + '">Đổi tên</button>' +
        '<button type="button" class="playlist-btn" data-playlist-delete="' + escapeHtml(id) + '">Xóa</button>' +
        '</div>' +
        '</div>';
    }).join('');

    var activePlaylist = playlists.find(function (playlist) { return String(playlist.id) === String(activePlaylistId); }) || playlists[0];
    var items = (activePlaylist && activePlaylist.items) || [];

    detailNode.innerHTML = '' +
      '<div class="playlist-item">' +
      '<div><div class="playlist-name">' + escapeHtml(activePlaylist.name) + '</div><div class="playlist-meta">' + items.length + ' mục trong playlist</div></div>' +
      '</div>' +
      (items.length ? items.map(function (item) {
        return '' +
          '<div class="playlist-entry" data-playlist-item-id="' + escapeHtml(item.id) + '">' +
          '<div><strong>' + escapeHtml(item.storyTitle || 'Truyện mới') + '</strong><small>' + escapeHtml(item.chapterLabel || 'Chương 1') + ' · ' + escapeHtml(item.storyAuthor || 'Ẩn danh') + '</small></div>' +
          '<div class="playlist-entry-actions">' +
          '<button type="button" class="playlist-btn" data-playlist-open="' + escapeHtml(activePlaylist.id) + '::' + escapeHtml(item.id) + '">Mở</button>' +
          '<button type="button" class="playlist-btn" data-playlist-remove-item="' + escapeHtml(activePlaylist.id) + '::' + escapeHtml(item.id) + '">Xóa</button>' +
          '</div>' +
          '</div>';
      }).join('') : '<p class="playlist-empty">Playlist này chưa có mục nào.</p>');
  }

  function initPlaylists() {
    if (!playlistRoot) {
      return;
    }
    var createButton = playlistRoot.querySelector('[data-playlist-create]');
    var nameInput = playlistRoot.querySelector('[data-playlist-create-name]');

    if (createButton) {
      createButton.addEventListener('click', function () {
        var name = nameInput ? String(nameInput.value || '').trim() : '';
        if (!name) {
          setPlaylistNote('Nhập tên playlist trước khi tạo.', 'warning');
          return;
        }
        var playlists = readPlaylists().map(normalizePlaylist);
        var created = normalizePlaylist({ name: name, items: [] });
        playlists.unshift(created);
        writePlaylists(playlists);
        activePlaylistId = created.id;

        if (canUsePlaylistApi()) {
          window.AudioHubApi.request('/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mapPlaylistForApi(created))
          }).then(function () {
            return syncPlaylistsFromApi();
          }).then(function (synced) {
            var rows = Array.isArray(synced) ? synced : [];
            if (rows.length) {
              activePlaylistId = String(rows[0].id || '');
            }
            renderPlaylists();
          }).catch(function () {});
        }

        if (nameInput) {
          nameInput.value = '';
        }
        setPlaylistNote('Đã tạo playlist mới.', 'success');
        renderPlaylists();
      });
    }

    function closeAllStatusMenus() {
      playlistRoot.querySelectorAll('[data-playlist-status-menu]').forEach(function (menu) {
        menu.classList.add('is-hidden');
      });
      playlistRoot.querySelectorAll('[data-playlist-status-trigger]').forEach(function (trigger) {
        trigger.setAttribute('aria-expanded', 'false');
      });
    }

    playlistRoot.addEventListener('click', function (event) {
      var statusTrigger = event.target && event.target.closest ? event.target.closest('[data-playlist-status-trigger]') : null;
      if (statusTrigger) {
        event.preventDefault();
        event.stopPropagation();
        var triggerId = statusTrigger.getAttribute('data-playlist-status-trigger') || '';
        var menu = playlistRoot.querySelector('[data-playlist-status-menu="' + triggerId.replace(/"/g, '\\"') + '"]');
        var isOpen = !!(menu && !menu.classList.contains('is-hidden'));
        closeAllStatusMenus();
        if (menu && !isOpen) {
          menu.classList.remove('is-hidden');
          statusTrigger.setAttribute('aria-expanded', 'true');
        }
        return;
      }

      var statusOption = event.target && event.target.closest ? event.target.closest('[data-playlist-status-option]') : null;
      if (statusOption) {
        event.preventDefault();
        event.stopPropagation();
        var raw = statusOption.getAttribute('data-playlist-status-option') || '';
        var parts = raw.split('::');
        if (parts.length !== 2) {
          closeAllStatusMenus();
          return;
        }
        var statusId = parts[0];
        var nextStatus = parts[1] === 'Đã hoàn thành' ? 'Đã hoàn thành' : 'Đang ra';

        var statusUpdated = readPlaylists().map(function (playlist) {
          var normalized = normalizePlaylist(playlist);
          if (String(normalized.id) === String(statusId)) {
            normalized.status = nextStatus;
            normalized.updatedAt = new Date().toISOString();
          }
          return normalized;
        });
        writePlaylists(statusUpdated);

        if (canUsePlaylistApi()) {
          window.AudioHubApi.request('/playlists/' + encodeURIComponent(String(statusId)), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: nextStatus })
          }).then(function () {
            return syncPlaylistsFromApi();
          }).then(function () {
            renderPlaylists();
          }).catch(function () {});
        }

        var wrap = statusOption.closest ? statusOption.closest('[data-playlist-status-wrap]') : null;
        var row = statusOption.closest ? statusOption.closest('[data-playlist-select]') : null;
        if (wrap) {
          var trigger = wrap.querySelector('[data-playlist-status-trigger]');
          if (trigger) {
            trigger.textContent = nextStatus === 'Đã hoàn thành' ? 'Hoàn thành' : 'Đang ra';
          }
        }
        if (row) {
          var metaNode = row.querySelector('.playlist-meta');
          if (metaNode) {
            var countText = '0 mục';
            var oldMeta = String(metaNode.textContent || '');
            var match = oldMeta.match(/\d+\s+mục/);
            if (match && match[0]) {
              countText = match[0];
            }
            metaNode.textContent = countText + ' · ' + nextStatus;
          }
        }

        closeAllStatusMenus();
        setPlaylistNote('Đã cập nhật trạng thái playlist.', 'success');
        return;
      }

      closeAllStatusMenus();

      var renameBtn = event.target && event.target.closest ? event.target.closest('[data-playlist-rename]') : null;
      if (renameBtn) {
        event.preventDefault();
        event.stopPropagation();
        var renameId = renameBtn.getAttribute('data-playlist-rename') || '';
        var nextName = '';
        try { nextName = window.prompt('Tên playlist mới?', '') || ''; } catch (error) { nextName = ''; }
        nextName = String(nextName || '').trim();
        if (!nextName) {
          return;
        }
        var renamed = readPlaylists().map(function (playlist) {
          var normalized = normalizePlaylist(playlist);
          if (String(normalized.id) === String(renameId)) {
            normalized.name = nextName;
            normalized.updatedAt = new Date().toISOString();
          }
          return normalized;
        });
        writePlaylists(renamed);

        if (canUsePlaylistApi()) {
          window.AudioHubApi.request('/playlists/' + encodeURIComponent(String(renameId)), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: nextName })
          }).then(function () {
            return syncPlaylistsFromApi();
          }).then(function () {
            renderPlaylists();
          }).catch(function () {});
        }

        setPlaylistNote('Đã đổi tên playlist.', 'success');
        renderPlaylists();
        return;
      }

      var deleteBtn = event.target && event.target.closest ? event.target.closest('[data-playlist-delete]') : null;
      if (deleteBtn) {
        event.preventDefault();
        event.stopPropagation();
        var deleteId = deleteBtn.getAttribute('data-playlist-delete') || '';
        var okDelete = true;
        try { okDelete = window.confirm('Xóa playlist này?'); } catch (error) { okDelete = true; }
        if (!okDelete) {
          return;
        }
        var next = readPlaylists().filter(function (playlist) {
          return String((playlist && playlist.id) || '') !== String(deleteId);
        });
        writePlaylists(next);

        if (canUsePlaylistApi()) {
          window.AudioHubApi.request('/playlists/' + encodeURIComponent(String(deleteId)), {
            method: 'DELETE'
          }).then(function () {
            return syncPlaylistsFromApi();
          }).then(function (syncedRows) {
            var rows = Array.isArray(syncedRows) ? syncedRows : [];
            if (String(activePlaylistId) === String(deleteId)) {
              activePlaylistId = rows.length ? String((rows[0] && rows[0].id) || '') : '';
            }
            renderPlaylists();
          }).catch(function () {});
        }

        if (String(activePlaylistId) === String(deleteId)) {
          activePlaylistId = next.length ? String((next[0] && next[0].id) || '') : '';
        }
        setPlaylistNote('Đã xóa playlist.', 'success');
        renderPlaylists();
        return;
      }

      var select = event.target && event.target.closest ? event.target.closest('[data-playlist-select]') : null;
      if (select) {
        var selectId = select.getAttribute('data-playlist-select') || '';
        activePlaylistId = selectId;
        renderPlaylists();
        return;
      }

      var openItem = event.target && event.target.closest ? event.target.closest('[data-playlist-open]') : null;
      if (openItem) {
        var openRaw = openItem.getAttribute('data-playlist-open') || '';
        var openParts = openRaw.split('::');
        if (openParts.length === 2) {
          openPlaylistItem(openParts[0], openParts[1]);
        }
        return;
      }

      var removeItem = event.target && event.target.closest ? event.target.closest('[data-playlist-remove-item]') : null;
      if (removeItem) {
        var removeRaw = removeItem.getAttribute('data-playlist-remove-item') || '';
        var removeParts = removeRaw.split('::');
        if (removeParts.length !== 2) {
          return;
        }
        var playlistId = removeParts[0];
        var itemId = removeParts[1];
        var updated = readPlaylists().map(function (playlist) {
          var normalized = normalizePlaylist(playlist);
          if (String(normalized.id) !== String(playlistId)) {
            return normalized;
          }
          normalized.items = (normalized.items || []).filter(function (item) {
            return String((item && item.id) || '') !== String(itemId);
          });
          normalized.updatedAt = new Date().toISOString();
          return normalized;
        });
        writePlaylists(updated);

        if (canUsePlaylistApi()) {
          window.AudioHubApi.request('/playlists/' + encodeURIComponent(String(playlistId)) + '/items/' + encodeURIComponent(String(itemId)), {
            method: 'DELETE'
          }).then(function () {
            return syncPlaylistsFromApi();
          }).then(function () {
            renderPlaylists();
          }).catch(function () {});
        }

        setPlaylistNote('Đã bỏ mục khỏi playlist.', 'success');
        renderPlaylists();
      }
    });

    syncPlaylistsFromApi().then(function (rows) {
      var list = Array.isArray(rows) ? rows : [];
      if (!activePlaylistId || !list.some(function (entry) { return String((entry && entry.id) || '') === String(activePlaylistId); })) {
        activePlaylistId = list.length ? String((list[0] && list[0].id) || '') : activePlaylistId;
      }
      renderPlaylists();
    });
  }

  function readTrashFallbackQueue() {
    try {
      var raw = window.localStorage ? window.localStorage.getItem(TRASH_FALLBACK_KEY) : '';
      var parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      return [];
    }
  }

  function writeTrashFallbackQueue(items) {
    try {
      if (!window.localStorage) {
        return;
      }
      window.localStorage.setItem(TRASH_FALLBACK_KEY, JSON.stringify(Array.isArray(items) ? items : []));
    } catch (error) {
    }
  }

  function upsertTrashFallbackItem(item) {
    if (!item || !item.key) {
      return;
    }
    var key = String(item.key);
    var queue = readTrashFallbackQueue();
    var found = false;
    var next = queue.map(function (existing) {
      if (!existing || String(existing.key || '') !== key) {
        return existing;
      }
      found = true;
      return item;
    });
    if (!found) {
      next.push(item);
    }
    writeTrashFallbackQueue(next);
  }

  function removeTrashFallbackItemByKey(key) {
    var normalized = String(key || '');
    if (!normalized) {
      return;
    }
    var queue = readTrashFallbackQueue();
    var next = queue.filter(function (item) {
      return String((item && item.key) || '') !== normalized;
    });
    writeTrashFallbackQueue(next);
  }

  function clearTrashFallbackQueue() {
    writeTrashFallbackQueue([]);
  }

  function createFallbackTrashItem(story) {
    if (!story) {
      return null;
    }
    var now = new Date().toISOString();
    var syntheticBase = story.id ? String(story.id) : ('unknown-' + Date.now().toString(36));
    var key = String(story.audioKey || ('missing-audio-' + syntheticBase + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)));
    return {
      key: key,
      blob: null,
      fileName: '',
      size: 0,
      createdAt: story.createdAt || now,
      deletedAt: now,
      story: {
        id: story.id || '',
        title: story.title || '',
        author: story.author || '',
        genre: story.genre || '',
        description: story.description || '',
        chapterTitle: story.chapterTitle || '',
        visibility: story.visibility || 'Riêng tư',
        audioStatus: story.audioStatus || 'Sẵn sàng',
        coverKey: story.coverKey || '',
        createdAt: story.createdAt || ''
      }
    };
  }

  function mergeTrashItems(primaryItems, fallbackItems) {
    var mergedByKey = {};
    (primaryItems || []).forEach(function (item) {
      if (!item || !item.key) {
        return;
      }
      mergedByKey[String(item.key)] = item;
    });
    (fallbackItems || []).forEach(function (item) {
      if (!item || !item.key) {
        return;
      }
      var key = String(item.key);
      if (!mergedByKey[key]) {
        mergedByKey[key] = item;
      }
    });
    return Object.keys(mergedByKey).map(function (key) { return mergedByKey[key]; }).sort(function (a, b) {
      return String((b && b.deletedAt) || '').localeCompare(String((a && a.deletedAt) || ''));
    });
  }

  function syncFallbackQueueWithTrash(primaryItems) {
    var primarySet = {};
    (primaryItems || []).forEach(function (item) {
      if (item && item.key) {
        primarySet[String(item.key)] = true;
      }
    });
    var queue = readTrashFallbackQueue();
    var next = queue.filter(function (item) {
      return !primarySet[String((item && item.key) || '')];
    });
    writeTrashFallbackQueue(next);
  }

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatTime(isoString) {
    if (!isoString) {
      return '';
    }
    var date = new Date(isoString);
    if (isNaN(date.getTime())) {
      return '';
    }
    try {
      return date.toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch (error) {
      return '';
    }
  }

  function formatSize(size) {
    var bytes = typeof size === 'number' ? size : 0;
    if (bytes >= 1024 * 1024) {
      return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }
    if (bytes >= 1024) {
      return (bytes / 1024).toFixed(1) + ' KB';
    }
    return bytes + ' B';
  }

  function setActionNote(message, tone) {
    if (!actionNote) {
      return;
    }
    if (!message) {
      actionNote.textContent = '';
      actionNote.classList.add('is-hidden');
      actionNote.classList.remove('is-success', 'is-warning');
      return;
    }
    actionNote.textContent = message;
    actionNote.classList.remove('is-hidden');
    actionNote.classList.toggle('is-success', tone === 'success');
    actionNote.classList.toggle('is-warning', tone === 'warning');
  }

  function setTrashNote(message) {
    if (!trashNote) {
      return;
    }
    if (!message) {
      trashNote.textContent = '';
      trashNote.classList.add('is-hidden');
      return;
    }
    trashNote.textContent = message;
    trashNote.classList.remove('is-hidden');
  }

  function renderEmpty() {
    mount.innerHTML = '<p class="library-empty">Chưa có truyện demo nào. Hãy vào <a href="upload-story.html">Đăng truyện</a> để tạo truyện đầu tiên.</p>';
  }

  function renderError() {
    mount.innerHTML = '<p class="library-empty">Chưa thể tải danh sách vì thiếu stories-store.js.</p>';
  }

  function cleanupMedia(story) {
    var tasks = [];
    if (story && window.AudioHubStoryAudio && typeof window.AudioHubStoryAudio.moveToTrash === 'function') {
      var snapshot = {
        id: story.id || '',
        title: story.title || '',
        author: story.author || '',
        genre: story.genre || '',
        description: story.description || '',
        chapterTitle: story.chapterTitle || '',
        visibility: story.visibility || '',
        audioStatus: story.audioStatus || 'Sẵn sàng',
        coverKey: story.coverKey || '',
        createdAt: story.createdAt || ''
      };
      var audioKey = story.audioKey || ('missing-audio-' + String(story.id || 'unknown'));
      tasks.push(window.AudioHubStoryAudio.moveToTrash(audioKey, snapshot).catch(function () { return false; }));

      if (!story.audioKey && window.indexedDB) {
        tasks.push(new Promise(function (resolve) {
          try {
            var request = window.indexedDB.open('audiohub-media', 3);
            request.onupgradeneeded = function (event) {
              var db = event.target.result;
              if (!db.objectStoreNames.contains('storyAudioTrash')) {
                db.createObjectStore('storyAudioTrash', { keyPath: 'key' });
              }
            };
            request.onsuccess = function () {
              var db = request.result;
              var tx = db.transaction('storyAudioTrash', 'readwrite');
              var store = tx.objectStore('storyAudioTrash');
              var now = new Date().toISOString();
              store.put({
                key: audioKey,
                blob: null,
                fileName: '',
                size: 0,
                createdAt: story.createdAt || now,
                deletedAt: now,
                story: snapshot
              });
              tx.oncomplete = function () {
                try { db.close(); } catch (error) {}
                resolve(true);
              };
              tx.onerror = function () {
                try { db.close(); } catch (error) {}
                resolve(false);
              };
            };
            request.onerror = function () {
              resolve(false);
            };
          } catch (error) {
            resolve(false);
          }
        }));
      }
    }
    return Promise.all(tasks);
  }

  function collectTrashCoverKeys() {
    if (!window.AudioHubStoryAudio || typeof window.AudioHubStoryAudio.listTrash !== 'function') {
      return Promise.resolve([]);
    }
    return window.AudioHubStoryAudio.listTrash().then(function (items) {
      return (items || []).map(function (item) {
        return item && item.story && item.story.coverKey ? String(item.story.coverKey) : '';
      }).filter(Boolean);
    }).catch(function () { return []; });
  }

  function maybeDeleteCoverIfUnused(coverKey) {
    if (!coverKey || !window.AudioHubStoryCover || typeof window.AudioHubStoryCover.delete !== 'function') {
      return Promise.resolve(false);
    }
    var stories = window.AudioHubStories && typeof window.AudioHubStories.read === 'function' ? window.AudioHubStories.read() : [];
    var storyStillUses = (stories || []).some(function (story) {
      return story && String(story.coverKey || '') === String(coverKey);
    });
    if (storyStillUses) {
      return Promise.resolve(false);
    }
    return collectTrashCoverKeys().then(function (trashCoverKeys) {
      var trashStillUses = (trashCoverKeys || []).some(function (key) {
        return String(key) === String(coverKey);
      });
      if (trashStillUses) {
        return false;
      }
      return window.AudioHubStoryCover.delete(coverKey).then(function () { return true; }).catch(function () { return false; });
    });
  }

  function hydrateCovers(container) {
    if (!window.AudioHubStoryCover || typeof window.AudioHubStoryCover.get !== 'function') {
      return;
    }
    var scope = container || document;
    var nodes = Array.prototype.slice.call(scope.querySelectorAll('[data-cover-key]'));
    nodes.forEach(function (node) {
      var key = node.getAttribute('data-cover-key');
      if (!key) {
        return;
      }
      window.AudioHubStoryCover.get(key).then(function (blob) {
        if (!blob) {
          return;
        }
        try {
          var url = URL.createObjectURL(blob);
          node.style.backgroundImage = 'url("' + url + '")';
          node.style.backgroundSize = 'cover';
          node.style.backgroundPosition = 'center';
        } catch (error) {
        }
      }).catch(function () {});
    });
  }

  function renderStories(stories) {
    if (!stories || !stories.length) {
      renderEmpty();
      return;
    }

    var seen = {};
    var uniqueStories = stories.filter(function (story) {
      var id = String(story && story.id || '');
      if (!id) return false;
      if (seen[id]) return false;
      seen[id] = true;
      return true;
    }).sort(function (a, b) {
      var timeA = Date.parse(String((a && (a.updatedAt || a.createdAt)) || ''));
      var timeB = Date.parse(String((b && (b.updatedAt || b.createdAt)) || ''));
      return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
    });
    if (!uniqueStories.length) {
      renderEmpty();
      return;
    }

    var cards = uniqueStories.filter(function (story) {
      return !!String(story && story.id || '').trim();
    }).map(function (story) {
      var title = escapeHtml(story.title);
      var meta = [story.author, story.genre, story.visibility, story.audioStatus].filter(Boolean).map(escapeHtml).join(' · ');
      var updated = formatTime(story.updatedAt);
      var selectedVisibility = String(story.visibility || 'Riêng tư');
      var selectedAudioStatus = String(story.audioStatus || 'Sẵn sàng');
      return '' +
        '<div class="demo-story-row">' +
        '<label class="demo-story-check"><input type="checkbox" data-story-select value="' + escapeHtml(story.id) + '" /></label>' +
        '<div class="demo-story-item-wrap">' +
        '<div class="story-row-header">' +
        '<a class="demo-story-item" href="' + (story && story.id ? ('story-detail.html?id=' + encodeURIComponent(story.id)) : '#') + '">' +
        '<span class="demo-story-thumb" data-cover-key="' + escapeHtml(story.coverKey || '') + '"></span>' +
        '<span class="demo-story-body">' +
        '<strong>' + title + '</strong>' +
        '<small>' + meta + (updated ? (' · Cập nhật ' + escapeHtml(updated)) : '') + '</small>' +
        '</span>' +
        '</a>' +
        '<div class="story-row-actions">' +
        '<button type="button" class="library-delete" data-story-edit="' + escapeHtml(story.id) + '">Chỉnh sửa</button>' +
        '<button type="button" class="library-delete" data-story-add-playlist="' + escapeHtml(story.id) + '">Thêm vào playlists</button>' +
        '<button type="button" class="library-delete" data-story-delete="' + escapeHtml(story.id) + '">Xoá</button>' +
        '</div>' +
        '</div>' +
        '<form class="story-edit is-hidden" data-story-edit-form="' + escapeHtml(story.id) + '">' +
        '<div class="story-edit-layout">' +
        '<div class="story-edit-main">' +
        '<label>Tên truyện<input type="text" data-edit-title value="' + title + '" /></label>' +
        '<label>Tác giả<input type="text" data-edit-author value="' + escapeHtml(story.author || '') + '" /></label>' +
        '<label>Hashtag<input type="text" data-edit-hashtags value="' + escapeHtml('#' + ((story.hashtags || []).join(' #'))) + '" /></label>' +
        '<label>Trạng thái hiển thị<select data-edit-visibility>' +
        '<option value="Riêng tư"' + (selectedVisibility === 'Riêng tư' ? ' selected' : '') + '>Riêng tư</option>' +
        '<option value="Không công khai"' + (selectedVisibility === 'Không công khai' ? ' selected' : '') + '>Không công khai</option>' +
        '<option value="Công khai"' + (selectedVisibility === 'Công khai' ? ' selected' : '') + '>Công khai</option>' +
        '</select></label>' +
        '<label>Trạng thái audio<select data-edit-audio-status>' +
        '<option value="Sẵn sàng"' + (selectedAudioStatus === 'Sẵn sàng' ? ' selected' : '') + '>Sẵn sàng</option>' +
        '<option value="Đang xử lý"' + (selectedAudioStatus === 'Đang xử lý' ? ' selected' : '') + '>Đang xử lý</option>' +
        '<option value="Tạm ẩn"' + (selectedAudioStatus === 'Tạm ẩn' ? ' selected' : '') + '>Tạm ẩn</option>' +
        '</select></label>' +
        '<label>Đổi ảnh bìa<input type="file" accept="image/*" data-edit-cover-file /></label>' +
        '</div>' +
        '<div class="story-edit-side">' +
        '<label>File chữ (.txt)<input type="file" accept=".txt,text/plain" data-edit-text-file /></label>' +
        '<label>Nội dung chữ<textarea rows="10" data-edit-reading-text>' + escapeHtml(story.readingText || '') + '</textarea></label>' +
        '</div>' +
        '</div>' +
        '<div class="story-edit-actions">' +
        '<button type="submit" class="btn btn--primary">Lưu</button>' +
        '<button type="button" class="btn btn--outline" data-story-edit-cancel>Huỷ</button>' +
        '</div>' +
        '</form>' +
        '</div>' +
        '</div>';
    }).join('');

    mount.innerHTML = '' +
      '<div class="stories-actions">' +
      '<button type="button" class="btn btn--outline" data-stories-delete-selected>Xoá mục đã chọn</button>' +
      '<button type="button" class="btn btn--outline" data-stories-select-all>Chọn tất cả</button>' +
      '<button type="button" class="btn btn--outline" data-stories-clear-selection>Bỏ chọn</button>' +
      '</div>' +
      '<div class="library-list">' + cards + '</div>';
  }

  function refresh() {
    var stories = window.AudioHubStories.read();
    if (refresh._lastRaw === stories) {
      return;
    }
    refresh._lastRaw = stories;
    renderStories(stories);
    hydrateCovers(mount);
    updateStoriesBulkButtons();
  }

  function getSelectedStoryIds() {
    var nodes = Array.prototype.slice.call(mount.querySelectorAll('[data-story-select]:checked'));
    return nodes.map(function (node) { return node.value || ''; }).filter(Boolean);
  }

  function updateStoriesBulkButtons() {
    var selectedCount = getSelectedStoryIds().length;
    var deleteSelected = mount.querySelector('[data-stories-delete-selected]');
    var clearSelected = mount.querySelector('[data-stories-clear-selection]');
    if (deleteSelected) {
      deleteSelected.disabled = selectedCount === 0;
    }
    if (clearSelected) {
      clearSelected.disabled = selectedCount === 0;
    }
  }

  function setAllStoriesSelected(selected) {
    var nodes = Array.prototype.slice.call(mount.querySelectorAll('[data-story-select]'));
    nodes.forEach(function (node) { node.checked = !!selected; });
    updateStoriesBulkButtons();
  }

  function handleStoriesSelectionChange(event) {
    var checkbox = event.target && event.target.closest ? event.target.closest('[data-story-select]') : null;
    if (!checkbox) {
      return;
    }
    updateStoriesBulkButtons();
  }

  function handleStoriesBulkAction(event) {
    var selectAll = event.target && event.target.closest ? event.target.closest('[data-stories-select-all]') : null;
    if (selectAll) {
      event.preventDefault();
      setAllStoriesSelected(true);
      return;
    }
    var clear = event.target && event.target.closest ? event.target.closest('[data-stories-clear-selection]') : null;
    if (clear) {
      event.preventDefault();
      setAllStoriesSelected(false);
      return;
    }
    var del = event.target && event.target.closest ? event.target.closest('[data-stories-delete-selected]') : null;
    if (!del || del.disabled) {
      return;
    }
    event.preventDefault();
    var ids = getSelectedStoryIds();
    if (!ids.length) {
      return;
    }

    var ok = true;
    try { ok = window.confirm('Xoá ' + ids.length + ' truyện demo đã chọn? Ảnh bìa sẽ giữ trong trash, audio sẽ chuyển vào thùng rác.'); } catch (error) { ok = true; }
    if (!ok) {
      return;
    }

    var prev = del.textContent;
    del.disabled = true;
    del.textContent = 'Đang xoá…';

    Promise.all(ids.map(function (id) {
      var story = window.AudioHubStories.getById(id);
      var fallbackItem = createFallbackTrashItem(story);
      if (fallbackItem) {
        upsertTrashFallbackItem(fallbackItem);
      }
      return cleanupMedia(story).catch(function () { return false; }).then(function () {
        try { window.AudioHubStories.remove(id); } catch (error) {}
      });
    })).then(function () {
      setActionNote('Đã xoá ' + ids.length + ' truyện demo.', 'success');
    }).catch(function () {
      setActionNote('Không thể xoá các truyện đã chọn.', 'warning');
    }).then(function () {
      refresh();
      return refreshTrash();
    }).then(function () {
      del.disabled = false;
      del.textContent = prev;
    });
  }

  function handleEditToggleClick(event) {
    var editButton = event.target && event.target.closest ? event.target.closest('[data-story-edit]') : null;
    if (!editButton || editButton.disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    var storyId = editButton.getAttribute('data-story-edit');
    if (!storyId) {
      return;
    }
    var form = mount.querySelector('[data-story-edit-form="' + storyId.replace(/"/g, '\\"') + '"]');
    if (!form) {
      return;
    }
    form.classList.toggle('is-hidden');
  }

  function handleEditCancelClick(event) {
    var cancelButton = event.target && event.target.closest ? event.target.closest('[data-story-edit-cancel]') : null;
    if (!cancelButton) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    var form = cancelButton.closest ? cancelButton.closest('[data-story-edit-form]') : null;
    if (!form) {
      return;
    }
    form.classList.add('is-hidden');
  }

  function normalizeHashtagToken(value) {
    return String(value || '').trim().replace(/^#+/, '').replace(/\s+/g, '-').toLowerCase();
  }

  function parseHashtags(value) {
    var tokens = String(value || '').split(/[\s,]+/g);
    var seen = {};
    return tokens.map(normalizeHashtagToken).filter(function (tag) {
      if (!tag) return false;
      if (seen[tag]) return false;
      seen[tag] = true;
      return true;
    });
  }

  function handleEditSubmit(event) {
    var form = event.target && event.target.closest ? event.target.closest('[data-story-edit-form]') : null;
    if (!form) {
      return;
    }
    event.preventDefault();

    var storyId = form.getAttribute('data-story-edit-form');
    if (!storyId) {
      return;
    }
    var story = window.AudioHubStories.getById(storyId);
    if (!story) {
      return;
    }

    var titleInput = form.querySelector('[data-edit-title]');
    var authorInput = form.querySelector('[data-edit-author]');
    var visibilitySelect = form.querySelector('[data-edit-visibility]');
    var audioStatusSelect = form.querySelector('[data-edit-audio-status]');
    var readingTextInput = form.querySelector('[data-edit-reading-text]');
    var hashtagsInput = form.querySelector('[data-edit-hashtags]');
    var coverFileInput = form.querySelector('[data-edit-cover-file]');
    var coverFile = coverFileInput && coverFileInput.files ? coverFileInput.files[0] : null;

    function saveStory(nextCoverKey) {
      window.AudioHubStories.upsert({
        id: story.id,
        title: titleInput ? String(titleInput.value || '').trim() : story.title,
        author: authorInput ? String(authorInput.value || '').trim() : story.author,
        genre: story.genre,
        description: story.description,
        readingText: readingTextInput ? String(readingTextInput.value || '') : (story.readingText || ''),
        hashtags: hashtagsInput ? parseHashtags(hashtagsInput.value) : (story.hashtags || []),
        chapterTitle: story.chapterTitle,
        visibility: visibilitySelect ? String(visibilitySelect.value || story.visibility) : story.visibility,
        audioStatus: audioStatusSelect ? String(audioStatusSelect.value || story.audioStatus || 'Sẵn sàng') : (story.audioStatus || 'Sẵn sàng'),
        coverKey: nextCoverKey || story.coverKey,
        audioKey: story.audioKey,
        createdAt: story.createdAt
      });

      setActionNote('Đã cập nhật thông tin truyện.', 'success');
      refresh();
    }

    if (coverFile && window.AudioHubStoryCover && typeof window.AudioHubStoryCover.put === 'function') {
      window.AudioHubStoryCover.put(coverFile).then(function (nextCoverKey) {
        saveStory(nextCoverKey || story.coverKey);
      }).catch(function () {
        setActionNote('Không thể cập nhật ảnh bìa.', 'warning');
      });
      return;
    }

    saveStory(story.coverKey);
  }

  function handleAddToPlaylistClick(event) {
    var button = event.target && event.target.closest ? event.target.closest('[data-story-add-playlist]') : null;
    if (!button || button.disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    var storyId = button.getAttribute('data-story-add-playlist');
    if (!storyId) {
      return;
    }

    openPlaylistPicker(storyId, button);
  }

  function handleDeleteClick(event) {
    var button = event.target && event.target.closest ? event.target.closest('[data-story-delete]') : null;
    if (!button || button.disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();

    var storyId = button.getAttribute('data-story-delete');
    if (!storyId) {
      return;
    }

    var ok = true;
    try { ok = window.confirm('Xoá truyện demo này?'); } catch (error) { ok = true; }
    if (!ok) {
      return;
    }

    var prev = button.textContent;
    button.disabled = true;
    button.textContent = 'Đang xoá…';

    var story = window.AudioHubStories.getById(storyId);
    var fallbackItem = createFallbackTrashItem(story);
    if (fallbackItem) {
      upsertTrashFallbackItem(fallbackItem);
    }
    cleanupMedia(story).catch(function () { return false; }).then(function () {
      try { window.AudioHubStories.remove(storyId); } catch (error) {}
      refresh();
      return refreshTrash();
    }).then(function () {
      setActionNote('Đã chuyển audio của truyện vào thùng rác.', 'success');
    }).catch(function () {
      setActionNote('Không thể chuyển audio vào thùng rác.', 'warning');
    }).then(function () {
      if (button && button.isConnected) {
        button.disabled = false;
        button.textContent = prev;
      }
    });
  }

  function getSelectedTrashKeys() {
    if (!trashMount) {
      return [];
    }
    var nodes = Array.prototype.slice.call(trashMount.querySelectorAll('[data-trash-select]:checked'));
    return nodes.map(function (node) { return node.value || ''; }).filter(Boolean);
  }

  function updateTrashBulkButtons() {
    if (!trashMount) {
      return;
    }
    var selectedCount = getSelectedTrashKeys().length;
    var restoreSelected = trashMount.querySelector('[data-trash-restore-selected]');
    var deleteSelected = trashMount.querySelector('[data-trash-delete-selected]');
    var clearSelected = trashMount.querySelector('[data-trash-clear-selection]');

    if (restoreSelected) {
      restoreSelected.disabled = selectedCount === 0;
    }
    if (deleteSelected) {
      deleteSelected.disabled = selectedCount === 0;
    }
    if (clearSelected) {
      clearSelected.disabled = selectedCount === 0;
    }
  }

  function setAllTrashSelected(selected) {
    if (!trashMount) {
      return;
    }
    var nodes = Array.prototype.slice.call(trashMount.querySelectorAll('[data-trash-select]'));
    nodes.forEach(function (node) { node.checked = !!selected; });
    updateTrashBulkButtons();
  }

  function handleTrashSelectionChange(event) {
    var checkbox = event.target && event.target.closest ? event.target.closest('[data-trash-select]') : null;
    if (!checkbox) {
      return;
    }
    updateTrashBulkButtons();
  }

  function restoreTrashEntryToStories(key) {
    var entryPromise = window.AudioHubStoryAudio.getTrash && typeof window.AudioHubStoryAudio.getTrash === 'function'
      ? window.AudioHubStoryAudio.getTrash(key).catch(function () { return null; })
      : Promise.resolve(null);

    return entryPromise.then(function (trashEntry) {
      return window.AudioHubStoryAudio.restoreFromTrash(key).catch(function () { return false; }).then(function () {
        removeTrashFallbackItemByKey(key);
        return trashEntry;
      });
    }).then(function (trashEntry) {
      if (trashEntry && trashEntry.story && window.AudioHubStories && typeof window.AudioHubStories.upsert === 'function') {
        try {
          window.AudioHubStories.upsert({
            id: trashEntry.story.id || '',
            title: trashEntry.story.title || '',
            author: trashEntry.story.author || '',
            genre: trashEntry.story.genre || '',
            description: trashEntry.story.description || '',
            chapterTitle: trashEntry.story.chapterTitle || '',
            visibility: trashEntry.story.visibility || 'Riêng tư',
            audioStatus: trashEntry.story.audioStatus || 'Sẵn sàng',
            coverKey: trashEntry.story.coverKey || '',
            audioKey: key,
            createdAt: trashEntry.story.createdAt || ''
          });
        } catch (error) {}
      }
    });
  }

  function renderTrash(items) {
    if (!trashMount) {
      return;
    }

    if (!items || !items.length) {
      trashMount.innerHTML = '';
      setTrashNote('Thùng rác ang trng.');
      return;
    }

    setTrashNote('');

    var cards = items.map(function (item) {
      var deleted = formatTime(item.deletedAt);
      var storyTitle = item && item.story && item.story.title ? item.story.title : '';
      var title = storyTitle || (item.fileName ? item.fileName : 'Audio demo');
      var coverKey = item && item.story && item.story.coverKey ? item.story.coverKey : '';
      return '' +
        '<div class="trash-item" data-trash-key="' + escapeHtml(item.key) + '">' +
        '<label class="trash-check"><input type="checkbox" data-trash-select value="' + escapeHtml(item.key) + '" /></label>' +
        '<div class="trash-story">' +
        '<span class="trash-thumb" data-cover-key="' + escapeHtml(coverKey) + '"></span>' +
        '<div class="trash-body"><strong>' + escapeHtml(title) + '</strong><small>' + formatSize(item.size || 0) + (deleted ? (' · Đã xoá lúc ' + escapeHtml(deleted)) : '') + '</small></div>' +
        '</div>' +
        '<div class="trash-buttons">' +
        '<button type="button" class="trash-restore" data-trash-restore="' + escapeHtml(item.key) + '">Khôi phục</button>' +
        '<button type="button" class="trash-delete" data-trash-delete="' + escapeHtml(item.key) + '">Xoá vĩnh viễn</button>' +
        '</div></div>';
    }).join('');

    trashMount.innerHTML = '' +
      '<div class="trash-actions">' +
      '<button type="button" class="btn btn--outline" data-trash-restore-selected>Khôi phục mục ã chọn</button>' +
      '<button type="button" class="btn btn--outline" data-trash-delete-selected>Xoá mục ã chọn</button>' +
      '<button type="button" class="btn btn--outline" data-trash-select-all>Chọn tất cả</button>' +
      '<button type="button" class="btn btn--outline" data-trash-clear-selection>Bỏ chọn</button>' +
      '<button type="button" class="btn btn--outline" data-trash-empty>Dọn sạch thùng rác</button>' +
      '</div>' +
      '<div class="trash-list">' + cards + '</div>';

    setTimeout(function () {
      hydrateCovers(trashMount);
      updateTrashBulkButtons();
    }, 0);
  }

  function refreshTrash() {
    if (!trashMount || trashBusy) {
      return Promise.resolve();
    }
    if (!window.AudioHubStoryAudio || typeof window.AudioHubStoryAudio.listTrash !== 'function') {
      renderTrash([]);
      setTrashNote('Chưa thể tải thùng rác vì thiếu stories-audio-store.js.');
      return Promise.resolve();
    }

    trashBusy = true;
    return window.AudioHubStoryAudio.cleanupTrash(TRASH_RETENTION_DAYS).catch(function () { return 0; }).then(function () {
      return window.AudioHubStoryAudio.listTrash();
    }).then(function (items) {
      var primaryItems = items || [];
      syncFallbackQueueWithTrash(primaryItems);
      var merged = mergeTrashItems(primaryItems, readTrashFallbackQueue());
      renderTrash(merged);
    }).catch(function () {
      var fallback = readTrashFallbackQueue();
      renderTrash(mergeTrashItems([], fallback));
      if (!fallback.length) {
        setTrashNote('Không thể tải thùng rác audio.');
      }
    }).then(function () {
      trashBusy = false;
    });
  }

  function handleTrashBulkAction(event) {
    var selectAll = event.target && event.target.closest ? event.target.closest('[data-trash-select-all]') : null;
    if (selectAll) {
      event.preventDefault();
      setAllTrashSelected(true);
      return;
    }

    var clear = event.target && event.target.closest ? event.target.closest('[data-trash-clear-selection]') : null;
    if (clear) {
      event.preventDefault();
      setAllTrashSelected(false);
      return;
    }

    var restoreSelected = event.target && event.target.closest ? event.target.closest('[data-trash-restore-selected]') : null;
    if (restoreSelected && !restoreSelected.disabled) {
      event.preventDefault();
      var restoreKeys = getSelectedTrashKeys();
      if (!restoreKeys.length) {
        return;
      }
      var prevRestore = restoreSelected.textContent;
      restoreSelected.disabled = true;
      restoreSelected.textContent = 'Đang khôi phục…';
      Promise.all(restoreKeys.map(function (key) { return restoreTrashEntryToStories(key).catch(function () { return false; }); }))
        .then(function () { setActionNote('Đã khôi phục ' + restoreKeys.length + ' audio.', 'success'); })
        .catch(function () { setActionNote('Không thể khôi phục audio đã chọn.', 'warning'); })
        .then(function () { refresh(); return refreshTrash(); })
        .then(function () {
          restoreSelected.disabled = false;
          restoreSelected.textContent = prevRestore;
        });
      return;
    }

    var deleteSelected = event.target && event.target.closest ? event.target.closest('[data-trash-delete-selected]') : null;
    if (deleteSelected && !deleteSelected.disabled) {
      event.preventDefault();
      var deleteKeys = getSelectedTrashKeys();
      if (!deleteKeys.length) {
        return;
      }
      var ok = true;
      try { ok = window.confirm('Xoá vĩnh viễn ' + deleteKeys.length + ' audio đã chọn?'); } catch (error) { ok = true; }
      if (!ok) {
        return;
      }

      var prevDelete = deleteSelected.textContent;
      deleteSelected.disabled = true;
      deleteSelected.textContent = 'Đang xoá…';

      var coverKeysByTrashKey = {};
      deleteKeys.forEach(function (key) {
        var row = trashMount.querySelector('[data-trash-key="' + key.replace(/"/g, '\\"') + '"]');
        if (!row) {
          return;
        }
        var thumb = row.querySelector('[data-cover-key]');
        if (!thumb) {
          return;
        }
        coverKeysByTrashKey[key] = thumb.getAttribute('data-cover-key') || '';
      });

      Promise.all(deleteKeys.map(function (key) {
        return window.AudioHubStoryAudio.deleteFromTrash(key).catch(function () { return false; }).then(function () {
          removeTrashFallbackItemByKey(key);
          return maybeDeleteCoverIfUnused(coverKeysByTrashKey[key] || '');
        });
      })).then(function () {
        setActionNote('Đã xoá vĩnh vi.n ' + deleteKeys.length + ' audio.', 'success');
      }).catch(function () {
        setActionNote('Không thể xoá audio đã chọn.', 'warning');
      }).then(function () {
        return refreshTrash();
      }).then(function () {
        deleteSelected.disabled = false;
        deleteSelected.textContent = prevDelete;
      });
      return;
    }

    var emptyTrash = event.target && event.target.closest ? event.target.closest('[data-trash-empty]') : null;
    if (emptyTrash && !emptyTrash.disabled) {
      event.preventDefault();
      var okEmpty = true;
      try { okEmpty = window.confirm('Xoá vĩnh viễn toàn bộ audio trong thùng rác?'); } catch (error) { okEmpty = true; }
      if (!okEmpty) {
        return;
      }

      var prevEmpty = emptyTrash.textContent;
      emptyTrash.disabled = true;
      emptyTrash.textContent = 'Đang dọn…';

      window.AudioHubStoryAudio.listTrash().then(function (items) {
        var list = items || [];
        var keys = list.map(function (item) { return item.key; }).filter(Boolean);
        var coverKeys = list.map(function (item) { return item && item.story && item.story.coverKey ? String(item.story.coverKey) : ''; }).filter(Boolean);

        return Promise.all(keys.map(function (key) { return window.AudioHubStoryAudio.deleteFromTrash(key).catch(function () { return false; }); }))
          .then(function () {
            return Promise.all(coverKeys.map(function (coverKey) { return maybeDeleteCoverIfUnused(coverKey); }));
          }).then(function () {
            return keys.length;
          });
      }).then(function (count) {
        clearTrashFallbackQueue();
        setActionNote('Đã dọn sạch thùng rác (' + count + ' audio).', 'success');
      }).catch(function () {
        setActionNote('Không thể dọn sạch thùng rác.', 'warning');
      }).then(function () {
        return refreshTrash();
      }).then(function () {
        emptyTrash.disabled = false;
        emptyTrash.textContent = prevEmpty;
      });
    }
  }

  function handleTrashRowAction(event) {
    var restore = event.target && event.target.closest ? event.target.closest('[data-trash-restore]') : null;
    if (restore && !restore.disabled) {
      event.preventDefault();
      var restoreKey = restore.getAttribute('data-trash-restore');
      if (!restoreKey) {
        return;
      }
      var prevRestore = restore.textContent;
      restore.disabled = true;
      restore.textContent = 'Đang khôi phục…';
      restoreTrashEntryToStories(restoreKey).catch(function () { return false; }).then(function () {
        refresh();
        return refreshTrash();
      }).then(function () {
        if (restore && restore.isConnected) {
          restore.disabled = false;
          restore.textContent = prevRestore;
        }
      });
      return;
    }

    var del = event.target && event.target.closest ? event.target.closest('[data-trash-delete]') : null;
    if (del && !del.disabled) {
      event.preventDefault();
      var key = del.getAttribute('data-trash-delete');
      if (!key) {
        return;
      }
      var ok = true;
      try { ok = window.confirm('Xoá vĩnh viễn audio này?'); } catch (error) { ok = true; }
      if (!ok) {
        return;
      }
      var prev = del.textContent;
      del.disabled = true;
      del.textContent = 'Đang xoá…';
      var row = del.closest ? del.closest('[data-trash-key]') : null;
      var coverKey = '';
      if (row) {
        var thumb = row.querySelector('[data-cover-key]');
        coverKey = thumb ? (thumb.getAttribute('data-cover-key') || '') : '';
      }
      window.AudioHubStoryAudio.deleteFromTrash(key).catch(function () { return false; }).then(function () {
        removeTrashFallbackItemByKey(key);
        return maybeDeleteCoverIfUnused(coverKey);
      }).then(function () {
        return refreshTrash();
      }).then(function () {
        if (del && del.isConnected) {
          del.disabled = false;
          del.textContent = prev;
        }
      });
    }
  }

  function normalizeKeys(values) {
    var result = {};
    (values || []).forEach(function (value) {
      if (!value) {
        return;
      }
      result[String(value)] = true;
    });
    return result;
  }

  function withBusy(button, label, task) {
    if (!button || typeof task !== 'function') {
      return Promise.resolve().then(task);
    }
    var previousLabel = button.textContent;
    button.textContent = label;
    button.disabled = true;
    return Promise.resolve().then(task).then(function (value) {
      button.textContent = previousLabel;
      button.disabled = false;
      return value;
    }).catch(function (error) {
      button.textContent = previousLabel;
      button.disabled = false;
      throw error;
    });
  }

  function cleanupOrphanMedia(stories) {
    var coverKeysInUse = [];
    var audioKeysInUse = [];

    (stories || []).forEach(function (story) {
      if (story && story.coverKey) {
        coverKeysInUse.push(story.coverKey);
      }
      if (story && story.audioKey) {
        audioKeysInUse.push(story.audioKey);
      }
    });

    var audioSet = normalizeKeys(audioKeysInUse);
    var coverListPromise = window.AudioHubStoryCover && typeof window.AudioHubStoryCover.listKeys === 'function' ? window.AudioHubStoryCover.listKeys() : Promise.resolve([]);
    var audioListPromise = window.AudioHubStoryAudio && typeof window.AudioHubStoryAudio.listKeys === 'function' ? window.AudioHubStoryAudio.listKeys() : Promise.resolve([]);

    return Promise.all([coverListPromise, audioListPromise, collectTrashCoverKeys()]).then(function (result) {
      var coverKeys = result[0] || [];
      var audioKeys = result[1] || [];
      var trashCoverSet = normalizeKeys(result[2] || []);
      var storyCoverSet = normalizeKeys(coverKeysInUse);

      var coverDeletes = coverKeys.filter(function (key) {
        return key && !storyCoverSet[key] && !trashCoverSet[key];
      }).map(function (key) {
        return window.AudioHubStoryCover.delete(key).catch(function () { return false; });
      });

      var audioDeletes = audioKeys.filter(function (key) {
        return key && !audioSet[key];
      }).map(function (key) {
        return window.AudioHubStoryAudio.moveToTrash && typeof window.AudioHubStoryAudio.moveToTrash === 'function'
          ? window.AudioHubStoryAudio.moveToTrash(key).catch(function () { return false; })
          : window.AudioHubStoryAudio.delete(key).catch(function () { return false; });
      });

      return Promise.all([Promise.all(coverDeletes), Promise.all(audioDeletes)]).then(function () {
        return {
          removedCover: coverDeletes.length,
          removedAudio: audioDeletes.length
        };
      });
    });
  }

  function deleteAllStories() {
    var stories = window.AudioHubStories.read();
    if (!stories || !stories.length) {
      setActionNote('Không có truyện demo để xoá.', 'warning');
      return Promise.resolve();
    }

    var ok = true;
    try { ok = window.confirm('Xoá TẤT CẢ truyện demo?'); } catch (error) { ok = true; }
    if (!ok) {
      return Promise.resolve();
    }

    var tasks = stories.map(function (story) {
      var fallbackItem = createFallbackTrashItem(story);
      if (fallbackItem) {
        upsertTrashFallbackItem(fallbackItem);
      }
      return cleanupMedia(story);
    });

    return Promise.all(tasks).then(function () {
      stories.forEach(function (story) {
        try { window.AudioHubStories.remove(story.id); } catch (error) {}
      });
    }).then(function () {
      setActionNote('Đã xoá toàn bộ truy?n demo. Audio ã ược chuyfn vào thùng rác.', 'success');
      refresh();
      return refreshTrash();
    });
  }

  function handleDeleteAllClick(event) {
    event.preventDefault();
    withBusy(deleteAllButton, 'Đang xoá…', deleteAllStories).catch(function () {
      setActionNote('Không thf xoá toàn bộ truy?n demo. Thử refresh trang r"i làm lại.', 'warning');
    });
  }

  function handleCleanupClick(event) {
    event.preventDefault();
    withBusy(cleanupButton, 'Đang dọn…', function () {
      var stories = window.AudioHubStories.read();
      return cleanupOrphanMedia(stories).then(function (result) {
        setActionNote('Đã dọn bộ nhớ: xoá ' + (result.removedCover || 0) + ' ảnh bìa mồ côi, ' + (result.removedAudio || 0) + ' audio mồ côi.', 'success');
      });
    }).catch(function () {
      setActionNote('Không thể dọn bộ nhớ. Thử refresh trang rồi làm lại.', 'warning');
    });
  }

  mount.addEventListener('click', function (event) {
    var checkbox = event.target && event.target.closest ? event.target.closest('[data-story-select]') : null;
    if (checkbox) {
      event.stopPropagation();
    }
  });
  mount.addEventListener('change', handleStoriesSelectionChange);
  mount.addEventListener('change', function (event) {
    var textFileInput = event.target && event.target.closest ? event.target.closest('[data-edit-text-file]') : null;
    if (!textFileInput) return;
    var form = textFileInput.closest ? textFileInput.closest('[data-story-edit-form]') : null;
    var textarea = form ? form.querySelector('[data-edit-reading-text]') : null;
    var file = textFileInput.files && textFileInput.files[0];
    if (!file || !textarea) return;
    var reader = new FileReader();
    reader.onload = function () {
      textarea.value = typeof reader.result === 'string' ? reader.result : '';
    };
    reader.readAsText(file, 'utf-8');
  });
  mount.addEventListener('submit', handleEditSubmit);
  mount.addEventListener('click', handleStoriesBulkAction);
  mount.addEventListener('click', handleEditToggleClick);
  mount.addEventListener('click', handleEditCancelClick);
  mount.addEventListener('click', handleAddToPlaylistClick);
  mount.addEventListener('click', handleDeleteClick);

  if (trashMount) {
    trashMount.addEventListener('click', function (event) {
      var checkbox = event.target && event.target.closest ? event.target.closest('[data-trash-select]') : null;
      if (checkbox) {
        event.stopPropagation();
      }
    });
    trashMount.addEventListener('change', handleTrashSelectionChange);
    trashMount.addEventListener('click', handleTrashBulkAction);
    trashMount.addEventListener('click', handleTrashRowAction);
  }

  if (deleteAllButton) {
    deleteAllButton.addEventListener('click', handleDeleteAllClick);
  }

  if (cleanupButton) {
    cleanupButton.addEventListener('click', handleCleanupClick);
  }

  if (!window.AudioHubStories || typeof window.AudioHubStories.read !== 'function') {
    renderError();
    return;
  }

  setActionNote('', '');
  refresh();
  refreshTrash();
  setPlaylistNote('', '');
  initPlaylists();
})();


