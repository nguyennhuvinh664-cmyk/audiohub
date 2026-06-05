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
  var youtubeInput = document.querySelector('[data-upload-youtube-url]');
  var visibilitySelect = document.querySelector('[data-upload-visibility]');

  function extractYoutubeId(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    if (/^[a-zA-Z0-9_-]{11}$/.test(raw)) return raw;
    var patterns = [
      /[?&]v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/
    ];
    for (var i = 0; i < patterns.length; i += 1) {
      var match = raw.match(patterns[i]);
      if (match && match[1]) return match[1];
    }
    return '';
  }

  function normalizeYoutubeUrl(value) {
    var raw = String(value || '').trim();
    if (!raw) return '';
    var id = extractYoutubeId(raw);
    return id ? ('https://www.youtube.com/watch?v=' + id) : raw;
  }

  function normalizeYoutubeId(value, fallbackUrl) {
    return extractYoutubeId(value) || extractYoutubeId(fallbackUrl) || '';
  }

  function validateYoutubeUrl(value) {
    var raw = String(value || '').trim();
    if (!raw) return { ok: true, url: '', id: '' };
    var normalizedUrl = normalizeYoutubeUrl(raw);
    var id = normalizeYoutubeId('', normalizedUrl);
    if (!id) {
      return { ok: false, url: raw, id: '', message: 'Link YouTube không hợp lệ.' };
    }
    return { ok: true, url: normalizedUrl, id: id };
  }

  function getYoutubePayload() {
    return validateYoutubeUrl(youtubeInput ? youtubeInput.value : '');
  }
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

  function readHeaderName() {
    var node = document.querySelector('.auth-menu__label');
    return node ? String(node.textContent || '').trim() : '';
  }

  function getAuthorFromSession() {
    var profile = readAuthProfile();
    if (profile && profile.name) return profile.name;
    return readHeaderName();
  }

  function syncAuthorInput() {
    if (!authorInput) return '';
    var authorName = getAuthorFromSession();
    authorInput.value = authorName || '';
    authorInput.readOnly = true;
    authorInput.setAttribute('readonly', 'readonly');
    authorInput.setAttribute('aria-readonly', 'true');
    authorInput.placeholder = 'Tự động theo tài khoản đăng nhập';
    authorInput.title = authorName ? 'Tác giả được lấy theo tài khoản đăng nhập' : 'Vui lòng đăng nhập để tự động điền tác giả';
    return authorName;
  }

  syncAuthorInput();
  window.setTimeout(syncAuthorInput, 0);
  window.setTimeout(syncAuthorInput, 300);
  window.setTimeout(syncAuthorInput, 1000);
  window.addEventListener('focus', syncAuthorInput);
  window.addEventListener('pageshow', syncAuthorInput);
  window.addEventListener('audiohub:auth-updated', syncAuthorInput);
  window.addEventListener('storage', function (event) {
    if (event && event.key && event.key !== AUTH_STORAGE_KEY) return;
    syncAuthorInput();
  });

  if (authorInput) {
    authorInput.addEventListener('beforeinput', function (event) { event.preventDefault(); });
    authorInput.addEventListener('input', function () { syncAuthorInput(); });
    authorInput.addEventListener('paste', function (event) { event.preventDefault(); });
    authorInput.addEventListener('drop', function (event) { event.preventDefault(); });
  }

  var authorSyncTimer = window.setInterval(function () {
    var name = syncAuthorInput();
    if (name) window.clearInterval(authorSyncTimer);
  }, 500);
  window.setTimeout(function () { window.clearInterval(authorSyncTimer); }, 15000);

  if (window.AudioHubApi && typeof window.AudioHubApi.getToken === 'function' && typeof window.AudioHubApi.request === 'function') {
    var token = window.AudioHubApi.getToken();
    if (token && !getAuthorFromSession()) {
      window.AudioHubApi.request('/auth/me', { method: 'GET' })
        .then(function (user) {
          var name = user && user.displayName ? String(user.displayName).trim() : '';
          var email = user && user.email ? String(user.email).trim() : '';
          if (!name) return;
          try {
            window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
              isLoggedIn: true,
              name: name,
              email: email
            }));
          } catch (error) {}
          syncAuthorInput();
          render();
        })
        .catch(function () {});
    }
  }

  function getEffectiveAuthorName() {
    var authorName = getAuthorFromSession();
    if (authorName) return authorName;

    var profile = readAuthProfile();
    var email = profile && profile.email ? String(profile.email).trim() : '';
    if (email && email.indexOf('@') > 0) {
      return email.split('@')[0];
    }

    var rawValue = authorInput ? String(authorInput.value || '').trim() : '';
    if (rawValue) return rawValue;

    return 'Tài khoản AudioHub';
  }

  window.AudioHubUploadAuthor = {
    getAuthorFromSession: getAuthorFromSession,
    syncAuthorInput: syncAuthorInput
  };

  syncAuthorInput();

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
    var author = getEffectiveAuthorName();
    var genre = genreSelect ? genreSelect.value : '';

    if (authorInput && authorInput.value !== author) {
      authorInput.value = author;
    }
    syncAuthorInput();

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

  function openPreviewCard() {
    var previewCard = document.querySelector('[data-upload-preview-card]');
    if (!previewCard) {
      showBanner('Không tìm thấy khung xem trước.', false);
      return;
    }

    previewCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
    previewCard.classList.add('is-highlighted');
    window.setTimeout(function () {
      previewCard.classList.remove('is-highlighted');
    }, 1800);
    render();
    showBanner('Đang hiển thị bản xem trước bên dưới.', false);
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
  if (youtubeInput) {
    youtubeInput.addEventListener('input', render);
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

  function buildStoryPayload(forcePublished) {
    var youtubePayload = getYoutubePayload();
    if (!youtubePayload.ok) {
      return { ok: false, message: youtubePayload.message || 'Link YouTube không hợp lệ.' };
    }

    var resolvedAuthor = getEffectiveAuthorName();
    if (!resolvedAuthor || resolvedAuthor === 'Tài khoản AudioHub') {
      return { ok: false, message: 'Chưa lấy được tên tác giả từ tài khoản. Vui lòng đăng nhập lại.' };
    }

    return {
      ok: true,
      payload: {
        title: titleInput ? titleInput.value.trim() : '',
        description: descriptionInput ? descriptionInput.value.trim() : '',
        author: resolvedAuthor,
        channelName: resolvedAuthor,
        genre: genreSelect ? genreSelect.value : '',
        chapterTitle: chapterInput ? chapterInput.value.trim() : '',
        youtubeUrl: youtubePayload.url,
        youtubeId: youtubePayload.id,
        visibility: forcePublished ? 'Công khai' : (state.visibility || 'Riêng tư'),
        coverKey: state.coverKey || '',
        audioKey: state.audioKey || '',
        readingText: state.readingText || '',
        hashtags: getCombinedHashtags()
      }
    };
  }

  function saveDraftStory(statusLabel) {
    if (state.submitting) {
      return;
    }

    var built = buildStoryPayload(false);
    if (!built.ok) {
      showBanner(built.message, false);
      return;
    }

    if (!window.AudioHubStories) {
      showBanner('Chưa thể lưu vì thiếu stories-store.js.', false);
      return;
    }

    if (authorInput) {
      authorInput.value = built.payload.author;
      authorInput.readOnly = true;
    }

    var story = null;
    try {
      story = window.AudioHubStories.upsert(built.payload);
    } catch (error) {
      showBanner('Không thể lưu nháp demo. Trình duyệt có thể đang đầy bộ nhớ (localStorage).', false);
      return;
    }

    showBanner(statusLabel + ' Đã lưu vào danh sách demo.', false);
    return story;
  }

  function saveStory(statusLabel, published) {
    if (state.submitting) {
      return;
    }

    var built = buildStoryPayload(!!published);
    if (!built.ok) {
      showBanner(built.message, false);
      return;
    }

    if (authorInput) {
      authorInput.value = built.payload.author;
      authorInput.readOnly = true;
    }

    render();

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

    var story = null;
    try {
      story = window.AudioHubStories.upsert(built.payload);
    } catch (error) {
      showBanner('Không thể lưu truyện demo. Trình duyệt có thể đang đầy bộ nhớ (localStorage). Hãy thử xoá dữ liệu site hoặc dùng file nhỏ hơn.', false);
      return;
    }

    if (published && !state.coverKey) {
      showBanner('Ảnh bìa chưa lưu xong (IndexedDB). Đợi vài giây rồi bấm lại.', false);
      return;
    }

    if (published && !state.audioKey) {
      showBanner('Audio chưa lưu xong (IndexedDB). Đợi vài giây rồi bấm lại.', false);
      return;
    }

    showBanner(statusLabel + ' Đã lưu vào danh sách demo.', published);

    if (published && story && story.id) {
      window.location.href = '/story-detail.html?id=' + encodeURIComponent(story.id);
    }
  }

  draftButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      if (button.hasAttribute('data-upload-preview')) {
        openPreviewCard();
        return;
      }
      if (button.hasAttribute('data-upload-draft')) {
        saveDraftStory('Bản nháp giao diện');
        showBanner('Đã lưu nháp trong trình duyệt. Bạn có thể tiếp tục chỉnh sửa sau.', false);
        if (banner) {
          banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        return;
      }
      saveStory('Bản nháp giao diện', false);
      showBanner('Đã lưu nháp trong trình duyệt. Bạn có thể tiếp tục chỉnh sửa sau.', false);
      if (banner) {
        banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  });

  if (publishButton) {
    publishButton.addEventListener('click', function () {
      saveStory('Truyện demo đã được đưa vào trạng thái sẵn sàng xuất bản.', true);
      if (banner) {
        banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  render();
})();
