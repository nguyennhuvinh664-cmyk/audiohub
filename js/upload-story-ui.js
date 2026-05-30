(function () {
  var root = document.querySelector('.upload-page');
  if (!root) {
    return;
  }

  var titleInput = document.querySelector('[data-upload-title]');
  var descriptionInput = document.querySelector('[data-upload-description]');
  var authorInput = document.querySelector('[data-upload-author]');
  var genreSelect = document.querySelector('[data-upload-genre]');
  var chapterInput = document.querySelector('[data-upload-chapter]');
  var visibilitySelect = document.querySelector('[data-upload-visibility]');
  var visibilityButtons = Array.prototype.slice.call(document.querySelectorAll('[data-upload-visibility-option]'));
  var previewTitle = document.querySelector('[data-upload-preview-title]');
  var previewMeta = document.querySelector('[data-upload-preview-meta]');
  var previewVisibility = document.querySelector('[data-upload-preview-visibility]');
  var previewCover = document.querySelector('[data-upload-preview-cover]');
  var titleCount = document.querySelector('[data-upload-title-count]');
  var descriptionCount = document.querySelector('[data-upload-description-count]');
  var coverZone = document.querySelector('[data-upload-cover]');
  var audioZone = document.querySelector('[data-upload-audio]');
  var readingZone = document.querySelector('[data-upload-reading]');
  var hashtagsInput = null;
  var AUTH_STORAGE_KEY = 'audiohub-demo-auth';

  function readAuthProfile() {
    try {
      var raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || !parsed.isLoggedIn) {
        return null;
      }
      return {
        name: String(parsed.name || '').trim(),
        email: String(parsed.email || '').trim()
      };
    } catch (error) {
      return null;
    }
  }

  function lockAuthorFromAccount() {
    if (!authorInput) {
      return null;
    }
    var profile = readAuthProfile();
    if (!profile || !profile.name) {
      authorInput.readOnly = false;
      authorInput.removeAttribute('aria-readonly');
      authorInput.title = 'Hãy đăng nhập để tự động điền tác giả';
      return null;
    }
    authorInput.value = profile.name;
    authorInput.readOnly = true;
    authorInput.setAttribute('aria-readonly', 'true');
    authorInput.title = 'Tác giả được lấy theo tài khoản đăng nhập';
    return profile;
  }

  function readNameFromHeader() {
    try {
      var node = document.querySelector('.auth-menu__label');
      var name = node ? String(node.textContent || '').trim() : '';
      return name || '';
    } catch (error) {
      return '';
    }
  }

  function enforceAuthorFromSession() {
    if (!authorInput) return;
    var profile = lockAuthorFromAccount();
    if (profile && profile.name) {
      return;
    }
    var headerName = readNameFromHeader();
    if (headerName) {
      authorInput.value = headerName;
      authorInput.readOnly = true;
      authorInput.setAttribute('aria-readonly', 'true');
      authorInput.title = 'Tác giả được lấy theo tài khoản đăng nhập';
    }
  }

  enforceAuthorFromSession();
  window.addEventListener('focus', enforceAuthorFromSession);
  window.addEventListener('storage', function (event) {
    if (event && event.key && event.key !== AUTH_STORAGE_KEY) {
      return;
    }
    enforceAuthorFromSession();
  });

  var authorSyncAttempts = 0;
  var authorSyncTimer = window.setInterval(function () {
    authorSyncAttempts += 1;
    enforceAuthorFromSession();
    if (authorInput && authorInput.readOnly) {
      window.clearInterval(authorSyncTimer);
      return;
    }
    if (authorSyncAttempts >= 20) {
      window.clearInterval(authorSyncTimer);
    }
  }, 300);

  if (authorInput) {
    authorInput.addEventListener('input', function () {
      var profile = readAuthProfile();
      var fixedName = profile && profile.name ? profile.name : readNameFromHeader();
      if (fixedName && authorInput.value !== fixedName) {
        authorInput.value = fixedName;
      }
    });
  }

  window.addEventListener('audiohub:auth-updated', enforceAuthorFromSession);

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

  function ensureHashtagInput() {
    if (!descriptionInput || hashtagsInput) return;
    var field = document.createElement('label');
    field.className = 'upload-field';
    field.innerHTML = 'Hashtag (nhập tay)<input type="text" data-upload-hashtags placeholder="#aothatday, #satthu" />';
    var parent = descriptionInput.parentElement;
    if (!parent || !parent.parentElement) return;
    parent.parentElement.insertBefore(field, parent.nextSibling);
    hashtagsInput = field.querySelector('[data-upload-hashtags]');
  }

  ensureHashtagInput();
  hashtagsInput = document.querySelector('[data-upload-hashtags]') || hashtagsInput;

  function extractHashtagsFromDescription(value) {
    var tags = [];
    var regex = /#([^#\n]+)/gu;
    var match = null;
    while ((match = regex.exec(String(value || '')))) {
      var tag = normalizeHashtagToken(String(match[1] || '').replace(/[.,;:!?]+$/g, ''));
      if (tag) tags.push(tag);
    }
    return parseHashtags(tags.join(' '));
  }

  function getCombinedHashtags() {
    var manual = parseHashtags(hashtagsInput ? hashtagsInput.value : '');
    var fromDesc = extractHashtagsFromDescription(descriptionInput ? descriptionInput.value : '');
    return parseHashtags(manual.concat(fromDesc).join(' '));
  }

  if (hashtagsInput) {
    hashtagsInput.addEventListener('input', render);
  }

  if (descriptionInput) {
    descriptionInput.addEventListener('input', function () {
      render();
    });
  }

  function syncHashtagPreview() {
    if (!hashtagsInput) return;
    var tags = getCombinedHashtags();
    hashtagsInput.title = tags.length ? ('Hashtags: #' + tags.join(' #')) : '';
  }

  var originalRender = render;
  render = function () {
    originalRender();
    syncHashtagPreview();
  };
  var coverInput = document.querySelector('[data-upload-cover-input]');
  var audioInput = document.querySelector('[data-upload-audio-input]');
  var readingInput = document.querySelector('[data-upload-reading-input]');
  var coverLabel = document.querySelector('[data-upload-cover-label]');
  var audioLabel = document.querySelector('[data-upload-audio-label]');
  var readingLabel = document.querySelector('[data-upload-reading-label]');
  var coverHint = document.querySelector('[data-upload-cover-hint]');
  var audioHint = document.querySelector('[data-upload-audio-hint]');
  var readingHint = document.querySelector('[data-upload-reading-hint]');
  var mediaNote = document.querySelector('[data-upload-media-note]');
  var banner = document.querySelector('[data-upload-banner]');
  var audioPreview = document.querySelector('[data-upload-audio-preview]');
  var audioPreviewName = document.querySelector('[data-upload-audio-preview-name]');
  var audioPlayer = document.querySelector('[data-upload-audio-player]');
  var coverProcessing = null;
  var audioProcessing = null;
  var coverObjectUrl = '';
  var audioObjectUrl = '';
  var draftButtons = Array.prototype.slice.call(document.querySelectorAll('[data-upload-draft]'));
  var publishButton = document.querySelector('[data-upload-publish]');
  var checklist = {
    title: document.querySelector('[data-check-item="title"]'),
    description: document.querySelector('[data-check-item="description"]'),
    metadata: document.querySelector('[data-check-item="metadata"]'),
    media: document.querySelector('[data-check-item="media"]')
  };

  var defaultCoverBackground = previewCover ? window.getComputedStyle(previewCover).backgroundImage : '';
  var state = {
    coverReady: false,
    audioReady: false,
    coverProcessing: false,
    audioProcessing: false,
    visibility: visibilitySelect && visibilitySelect.value ? visibilitySelect.value : 'Riêng tư',
    coverName: '',
    audioName: '',
    coverDataUrl: '',
    coverKey: '',
    audioKey: '',
    readingText: '',
    submitting: false
  };

  function clearObjectUrl(value) {
    if (!value) {
      return;
    }
    try {
      URL.revokeObjectURL(value);
    } catch (error) {
    }
  }

  function renderProcessing(node, active, label) {
    if (!node) {
      return;
    }
    if (!active) {
      node.remove();
      return;
    }

    var fill = node.querySelector('[data-upload-processing-fill]');
    var text = node.querySelector('[data-upload-processing-text]');
    if (text) {
      text.textContent = label;
    }
    if (fill) {
      fill.style.width = '22%';
      window.setTimeout(function () {
        fill.style.width = '72%';
      }, 120);
    }
  }

  function ensureProcessingPill(target, current, label) {
    if (!target) {
      return null;
    }
    if (!current) {
      current = document.createElement('div');
      current.className = 'upload-processing';
      current.innerHTML = '<span data-upload-processing-text></span><div class="upload-processing__bar"><div class="upload-processing__fill" data-upload-processing-fill></div></div>';
      target.appendChild(current);
    }
    renderProcessing(current, true, label);
    return current;
  }

  function removeProcessingPill(current) {
    if (!current) {
      return null;
    }
    current.remove();
    return null;
  }

  function setAudioPreviewDisabled(disabled) {
    if (!audioPreview) {
      return;
    }
    audioPreview.classList.toggle('is-disabled', disabled);
    if (audioPlayer) {
      audioPlayer.toggleAttribute('disabled', disabled);
      audioPlayer.controls = !disabled;
    }
  }

  setAudioPreviewDisabled(true);

  function stopAudio() {
    if (!audioPlayer) {
      return;
    }
    try {
      audioPlayer.pause();
      audioPlayer.currentTime = 0;
    } catch (error) {
    }
  }

  function resetAudioPreview() {
    stopAudio();
    clearObjectUrl(audioObjectUrl);
    audioObjectUrl = '';
    if (audioPlayer) {
      audioPlayer.removeAttribute('src');
      audioPlayer.load();
    }
    if (audioPreviewName) {
      audioPreviewName.textContent = 'Chưa chọn file audio';
    }
    setAudioPreviewDisabled(true);
  }

  function resetCoverPreview() {
    clearObjectUrl(coverObjectUrl);
    coverObjectUrl = '';
    if (previewCover) {
      previewCover.style.backgroundImage = defaultCoverBackground;
      previewCover.classList.remove('has-uploaded-image');
    }
  }

  function markDone(title, hintNode, fileName) {
    if (hintNode) {
      hintNode.innerHTML = 'Tệp: <span class="upload-dropzone__filename">' + fileName + '</span>';
    }
  }

  function setCoverProcessing(processing) {
    state.coverProcessing = processing;
    if (!coverZone) {
      return;
    }
    coverZone.classList.toggle('is-ready', !!state.coverReady);
    coverZone.classList.toggle('is-processing', processing);
    coverProcessing = processing ? ensureProcessingPill(coverZone, coverProcessing, 'Đang xử lý ảnh…') : removeProcessingPill(coverProcessing);
  }

  function setAudioProcessing(processing) {
    state.audioProcessing = processing;
    if (!audioZone) {
      return;
    }
    audioZone.classList.toggle('is-ready', !!state.audioReady);
    audioZone.classList.toggle('is-processing', processing);
    audioProcessing = processing ? ensureProcessingPill(audioZone, audioProcessing, 'Đang xử lý audio…') : removeProcessingPill(audioProcessing);
  }

  function setChecklistItem(node, done) {
    if (!node) {
      return;
    }
    var icon = node.querySelector('i');
    node.classList.toggle('is-done', done);
    if (icon) {
      icon.className = done ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle';
    }
  }

  function syncVisibilityButtons() {
    visibilityButtons.forEach(function (button) {
      var active = button.getAttribute('data-upload-visibility-option') === state.visibility;
      button.classList.toggle('is-active', active);
    });
  }

  function updateMediaNote() {
    if (!mediaNote) {
      return;
    }

    mediaNote.classList.remove('is-success', 'is-partial', 'is-empty');

    if (state.coverReady && state.audioReady) {
      mediaNote.textContent = 'Đã chọn ảnh bìa và file audio từ máy của bạn.';
      mediaNote.classList.add('is-success');
      return;
    }

    if (state.coverReady || state.audioReady) {
      mediaNote.textContent = state.coverReady
        ? 'Đã có ảnh bìa, còn thiếu file audio.'
        : 'Đã có file audio, còn thiếu ảnh bìa.';
      mediaNote.classList.add('is-partial');
      return;
    }

    mediaNote.textContent = 'Chưa chọn ảnh bìa và file audio.';
    mediaNote.classList.add('is-empty');
  }

  function render() {
    var title = titleInput ? titleInput.value.trim() : '';
    var description = descriptionInput ? descriptionInput.value.trim() : '';
    var author = authorInput ? authorInput.value.trim() : '';
    var genre = genreSelect ? genreSelect.value : '';

    if (titleCount && titleInput) {
      titleCount.textContent = titleInput.value.length + ' / 120';
    }
    if (descriptionCount && descriptionInput) {
      descriptionCount.textContent = descriptionInput.value.length + ' / 5000';
    }
    if (previewTitle) {
      previewTitle.textContent = title || 'Tiêu đề truyện của bạn sẽ hiện ở đây';
    }
    if (previewMeta) {
      previewMeta.textContent = [author || 'Tác giả', genre || 'Thể loại', state.visibility].join(' · ');
    }
    if (previewVisibility) {
      previewVisibility.textContent = state.visibility;
    }
    if (previewCover) {
      previewCover.classList.toggle('is-ready', state.coverReady);
    }

    setChecklistItem(checklist.title, !!title);
    setChecklistItem(checklist.description, description.length >= 30);
    setChecklistItem(checklist.metadata, !!author && !!genre);
    setChecklistItem(checklist.media, state.coverReady && state.audioReady);
    syncVisibilityButtons();
    updateMediaNote();
  }

  function showBanner(message, published) {
    if (!banner) {
      return;
    }
    banner.textContent = message;
    banner.classList.remove('is-hidden');
    banner.classList.toggle('is-published', !!published);
  }

  function setCoverPreview(file) {
    if (!file || !coverZone || !previewCover) {
      return;
    }

    state.coverReady = false;
    state.coverName = file.name;
    state.coverDataUrl = '';
    state.coverKey = '';

    if (coverLabel) {
      coverLabel.textContent = 'Đang xử lý ảnh…';
    }

    markDone(coverLabel, coverHint, file.name);
    setCoverProcessing(true);

    clearObjectUrl(coverObjectUrl);
    coverObjectUrl = URL.createObjectURL(file);

    var storePromise = window.AudioHubStoryCover && typeof window.AudioHubStoryCover.put === 'function'
      ? window.AudioHubStoryCover.put(file)
      : Promise.reject(new Error('missing cover store'));

    storePromise
      .then(function (coverKey) {
        state.coverKey = coverKey;
        if (coverLabel) {
          coverLabel.textContent = 'Ảnh bìa đã chọn';
        }
        render();
      })
      .catch(function () {
        state.coverKey = '';
        if (coverLabel) {
          coverLabel.textContent = 'Ảnh bìa đã chọn (chưa lưu)';
        }
        render();
      });

    window.setTimeout(function () {
      state.coverReady = true;
      setCoverProcessing(false);
      previewCover.style.backgroundImage = 'url("' + coverObjectUrl + '")';
      previewCover.classList.add('has-uploaded-image');
      if (coverLabel) {
        coverLabel.textContent = state.coverKey ? 'Ảnh bìa đã chọn' : 'Ảnh bìa đã chọn (chưa lưu)';
      }
      render();
    }, 900);
  }

  function setAudioPreview(file) {
    if (!file || !audioZone) {
      return;
    }

    state.audioReady = false;
    state.audioName = file.name;
    state.audioKey = '';
    if (audioZone) {
      audioZone.classList.remove('is-ready');
    }

    if (audioLabel) {
      audioLabel.textContent = 'Đang xử lý audio…';
    }

    markDone(audioLabel, audioHint, file.name);
    setAudioProcessing(true);
    setAudioPreviewDisabled(true);

    stopAudio();
    clearObjectUrl(audioObjectUrl);
    audioObjectUrl = URL.createObjectURL(file);

    var storePromise = window.AudioHubStoryAudio && typeof window.AudioHubStoryAudio.put === 'function'
      ? window.AudioHubStoryAudio.put(file)
      : Promise.reject(new Error('missing audio store'));

    storePromise
      .then(function (audioKey) {
        state.audioKey = audioKey;
        if (audioLabel) {
          audioLabel.textContent = 'Audio đã chọn';
        }
        render();
      })
      .catch(function () {
        state.audioKey = '';
        if (audioLabel) {
          audioLabel.textContent = 'Audio đã chọn (chưa lưu)';
        }
        render();
      });

    window.setTimeout(function () {
      state.audioReady = true;
      setAudioProcessing(false);
      if (audioLabel) {
        audioLabel.textContent = state.audioKey ? 'Audio đã chọn' : 'Audio đã chọn (chưa lưu)';
      }
      if (audioPreviewName) {
        audioPreviewName.textContent = file.name;
      }
      if (audioPlayer) {
        audioPlayer.src = audioObjectUrl;
        audioPlayer.load();
      }
      setAudioPreviewDisabled(false);
      render();
    }, 1100);
  }

  if (titleInput) {
    titleInput.addEventListener('input', render);
  }
  if (descriptionInput) {
    descriptionInput.addEventListener('input', render);
  }
  if (authorInput) {
    authorInput.addEventListener('input', render);
  }
  if (genreSelect) {
    genreSelect.addEventListener('change', render);
  }
  if (chapterInput) {
    chapterInput.addEventListener('input', render);
  }
  if (visibilitySelect) {
    visibilitySelect.addEventListener('change', function () {
      state.visibility = visibilitySelect.value;
      render();
    });
  }

  visibilityButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      var selected = button.getAttribute('data-upload-visibility-option') || 'Riêng tư';
      state.visibility = selected;
      if (visibilitySelect) {
        visibilitySelect.value = selected;
      }
      render();
    });
  });

  if (!visibilitySelect && visibilityButtons.length) {
    var defaultButton = visibilityButtons.find(function (button) {
      return button.classList.contains('is-active');
    }) || visibilityButtons[0];
    if (defaultButton) {
      state.visibility = defaultButton.getAttribute('data-upload-visibility-option') || 'Riêng tư';
    }
  } else if (visibilitySelect && !visibilitySelect.value) {
    visibilitySelect.value = state.visibility;
  }

  if (coverInput) {
    coverInput.addEventListener('change', function () {
      var file = coverInput.files && coverInput.files[0];
      if (!file) {
        state.coverReady = false;
        state.coverName = '';
        if (coverZone) {
          coverZone.classList.remove('is-ready');
        }
        if (coverLabel) {
          coverLabel.textContent = 'Thêm ảnh bìa';
        }
        if (coverHint) {
          coverHint.textContent = 'Tỷ lệ 16:9 hoặc bìa đứng đều có thể preview trực tiếp';
        }
        if (previewCover) {
          resetCoverPreview();
        }
        setCoverProcessing(false);
        render();
        return;
      }
      setCoverPreview(file);
      try { coverInput.value = ''; } catch (error) {}
    });
  }

  if (audioInput) {
    audioInput.addEventListener('change', function () {
      var file = audioInput.files && audioInput.files[0];
      if (!file) {
        state.audioReady = false;
        state.audioName = '';
        setAudioProcessing(false);
        if (audioZone) {
          audioZone.classList.remove('is-ready');
        }
        if (audioLabel) {
          audioLabel.textContent = 'Thêm file audio demo';
        }
        if (audioHint) {
          audioHint.textContent = 'MP3 / WAV / AAC từ máy của bạn';
        }
        resetAudioPreview();
        render();
        return;
      }
      setAudioPreview(file);
      try { audioInput.value = ''; } catch (error) {}
    });
  }

  if (readingInput) {
    readingInput.addEventListener('change', function () {
      var file = readingInput.files && readingInput.files[0];
      if (!file) {
        state.readingText = '';
        if (readingLabel) readingLabel.textContent = 'Thêm file truyện chữ';
        if (readingHint) readingHint.textContent = 'TXT/MD • Tối đa 2MB';
        render();
        return;
      }

      var isValidType = /text\/plain|text\/markdown/.test(String(file.type || '')) || /\.(txt|md)$/i.test(String(file.name || ''));
      if (!isValidType) {
        showBanner('File truyện chữ chỉ hỗ trợ .txt hoặc .md', false);
        try { readingInput.value = ''; } catch (error) {}
        return;
      }

      if (typeof file.size === 'number' && file.size > 2 * 1024 * 1024) {
        showBanner('File truyện chữ vượt quá 2MB.', false);
        try { readingInput.value = ''; } catch (error) {}
        return;
      }

      var reader = new FileReader();
      reader.onload = function () {
        state.readingText = typeof reader.result === 'string' ? reader.result : '';
        if (readingLabel) readingLabel.textContent = 'Đã tải truyện chữ';
        if (readingHint) readingHint.innerHTML = 'Tệp: <span class="upload-dropzone__filename">' + file.name + '</span>';
        if (readingZone) readingZone.classList.add('is-ready');
        render();
      };
      reader.onerror = function () {
        showBanner('Không thể đọc file truyện chữ.', false);
      };
      reader.readAsText(file, 'utf-8');
      try { readingInput.value = ''; } catch (error) {}
    });
  }

  function setSubmitting(submitting) {
    state.submitting = !!submitting;
    draftButtons.forEach(function (button) {
      button.disabled = state.submitting;
    });
    if (publishButton) {
      publishButton.disabled = state.submitting;
    }
  }

  function saveStory(statusLabel, published) {
    if (state.submitting) {
      return;
    }

    if (!window.AudioHubStories) {
      showBanner('Chưa thể lưu vì thiếu stories-store.js.', false);
      return;
    }

    setSubmitting(true);
    window.setTimeout(function () {
      setSubmitting(false);
    }, 1500);

    var submitAt = Date.now();
    try {
      var lastSubmitAt = Number(window.sessionStorage.getItem('audiohub-upload-last-submit-at') || '0');
      if (!isNaN(lastSubmitAt) && submitAt - lastSubmitAt < 1200) {
        showBanner('Bạn vừa thao tác quá nhanh, vui lòng chờ một chút.', false);
        return;
      }
      window.sessionStorage.setItem('audiohub-upload-last-submit-at', String(submitAt));
    } catch (error) {
    }

    if (!window.AudioHubStories) {
      showBanner('Chưa thể lưu vì thiếu stories-store.js.', false);
      return;
    }

    var story = null;
    try {
      story = window.AudioHubStories.upsert({
        title: titleInput ? titleInput.value.trim() : '',
        description: descriptionInput ? descriptionInput.value.trim() : '',
        author: authorInput ? authorInput.value.trim() : '',
        genre: genreSelect ? genreSelect.value : '',
        chapterTitle: chapterInput ? chapterInput.value.trim() : '',
        visibility: state.visibility,
        coverKey: state.coverKey || '',
        audioKey: state.audioKey || '',
        readingText: state.readingText || '',
        hashtags: getCombinedHashtags()
      });
    } catch (error) {
      showBanner('Không thể lưu truyện demo. Trình duyệt có thể đang đầy bộ nhớ (localStorage). Hãy thử xoá dữ liệu site hoặc dùng file nhỏ hơn.', false);
      return;
    }

    if (!state.coverKey) {
      showBanner('Ảnh bìa chưa lưu xong (IndexedDB). Đợi vài giây rồi bấm lại.', false);
      return;
    }

    if (!state.audioKey) {
      showBanner('Audio chưa lưu xong (IndexedDB). Đợi vài giây rồi bấm lại.', false);
      return;
    }

    showBanner(statusLabel + ' Đã lưu vào danh sách demo.', published);

    if (published && story && story.id) {
      window.location.href = 'story-detail.html?id=' + encodeURIComponent(story.id);
    }
  }

  draftButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      saveStory('Bản nháp giao diện', false);
    });
  });

  if (publishButton) {
    publishButton.addEventListener('click', function () {
      saveStory('Truyện demo đã được đưa vào trạng thái sẵn sàng xuất bản.', true);
    });
  }

  render();
})();
