(function () {
  function normalize(value) {
    return (value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getParams() {
    const params = new URLSearchParams(window.location.search);
    return {
      q: params.get('q') || '',
      author: params.get('author') || '',
      genre: params.get('genre') || '',
      hashtag: params.get('hashtag') || '',
      status: params.get('status') || '',
      page: Math.max(1, parseInt(params.get('page') || '1', 10) || 1)
    };
  }

  function normalizeTagValue(value) {
    return normalize(String(value || '').replace(/-/g, ' '));
  }

  function extractNormalizedHashtags(text) {
    var tags = [];
    var regex = /#([^#\n]+)/gu;
    var match = null;
    while ((match = regex.exec(String(text || '')))) {
      var rawTag = String(match[1] || '').trim().replace(/[.,;:!?]+$/g, '');
      var normalizedTag = normalizeTagValue(rawTag);
      if (!normalizedTag) continue;
      if (tags.indexOf(normalizedTag) >= 0) continue;
      tags.push(normalizedTag);
    }
    return tags;
  }

  function storyHasTag(story, tagValue) {
    if (!tagValue) return false;
    var tags = [];

    var directTags = Array.isArray(story && story.hashtags) ? story.hashtags : [];
    directTags.forEach(function (tag) {
      var normalized = normalizeTagValue(String(tag || '').replace(/-/g, ' '));
      if (!normalized) return;
      if (tags.indexOf(normalized) >= 0) return;
      tags.push(normalized);
    });

    extractNormalizedHashtags(story && story.description).forEach(function (tag) {
      if (tags.indexOf(tag) < 0) tags.push(tag);
    });

    return tags.indexOf(tagValue) >= 0;
  }

  function getStoryByCard(card, stories, storiesById) {
    if (!card) return null;

    var id = String(card.getAttribute('data-story-id') || '').trim();
    if (id && storiesById && storiesById.has(id)) return storiesById.get(id);

    var cardTitle = normalize(card.dataset.title || '');
    var cardAuthor = normalize(card.dataset.author || '');
    return (stories || []).find(function (story) {
      var storyTitle = normalize(story && story.title || '');
      var storyAuthor = normalize(story && (story.authorName || story.author) || '');
      return storyTitle === cardTitle && storyAuthor === cardAuthor;
    }) || null;
  }

  function getActiveHashtag(initial) {
    return normalizeTagValue(initial && initial.hashtag);
  }

  function setParams(values) {
    const params = new URLSearchParams();
    if (values.q) params.set('q', values.q);
    if (values.author) params.set('author', values.author);
    if (values.genre) params.set('genre', values.genre);
    if (values.status) params.set('status', values.status);
    if (values.hashtag) params.set('hashtag', values.hashtag);
    if (values.page && Number(values.page) > 1) params.set('page', String(values.page));
    const query = params.toString();
    const nextUrl = query ? window.location.pathname + '?' + query : window.location.pathname;
    window.history.replaceState({}, '', nextUrl);
  }

  function initCustomListingGenreDropdown(nativeSelect) {
    if (!nativeSelect || nativeSelect.dataset.customized === 'true') return null;

    const field = nativeSelect.closest('.story-filter-field');
    if (!field) return null;

    field.classList.add('story-filter-field--genre');

    const wrapper = document.createElement('div');
    wrapper.className = 'filter-genre-dd';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'filter-genre-dd__trigger';
    trigger.setAttribute('aria-expanded', 'false');

    const menu = document.createElement('div');
    menu.className = 'filter-genre-dd__menu is-hidden';

    const options = Array.from(nativeSelect.options || []);

    function syncFromSelect() {
      const selectedIndex = nativeSelect.selectedIndex >= 0 ? nativeSelect.selectedIndex : 0;
      const selectedOption = options[selectedIndex] || options[0];
      const label = selectedOption ? String(selectedOption.textContent || 'Tất cả thể loại') : 'Tất cả thể loại';
      trigger.innerHTML = label + ' <i class="fa-solid fa-chevron-down"></i>';
      Array.from(menu.querySelectorAll('.filter-genre-dd__item')).forEach(function (item) {
        item.classList.toggle('is-active', String(item.getAttribute('data-value') || '') === String(nativeSelect.value || ''));
      });
    }

    options.forEach(function (option) {
      const value = String(option.value || '');
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'filter-genre-dd__item';
      item.setAttribute('data-value', value);
      item.textContent = String(option.textContent || '');
      item.addEventListener('click', function () {
        nativeSelect.value = value;
        syncFromSelect();
        menu.classList.add('is-hidden');
        trigger.setAttribute('aria-expanded', 'false');
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
      });
      menu.appendChild(item);
    });

    trigger.addEventListener('click', function () {
      const isHidden = menu.classList.toggle('is-hidden');
      trigger.setAttribute('aria-expanded', isHidden ? 'false' : 'true');
    });

    document.addEventListener('click', function (event) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (target.closest('.filter-genre-dd') === wrapper) return;
      menu.classList.add('is-hidden');
      trigger.setAttribute('aria-expanded', 'false');
    });

    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);
    nativeSelect.classList.add('is-hidden-native');
    nativeSelect.dataset.customized = 'true';
    field.appendChild(wrapper);

    syncFromSelect();

    return {
      refresh: syncFromSelect,
      reset: function () {
        nativeSelect.value = '';
        syncFromSelect();
      }
    };
  }

  function isMember() {
    try {
      var raw = window.localStorage.getItem('audiohub-demo-auth');
      var parsed = raw ? JSON.parse(raw) : null;
      var hasProfile = !!(parsed && parsed.isLoggedIn);
      var hasToken = !!(window.AudioHubApi && typeof window.AudioHubApi.getToken === 'function' && window.AudioHubApi.getToken());
      return hasProfile || hasToken;
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
      + '<p>Nội dung trang này cần quyền hội viên để xem.</p>'
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

  function initListingFilters() {
    const root = document.querySelector('[data-story-filter-root]');
    if (!root) return;

    const form = document.querySelector('[data-story-filter-form]');
    const titleInput = document.querySelector('[data-filter-title]');
    const authorInput = document.querySelector('[data-filter-author]');
    const genreSelect = document.querySelector('[data-filter-genre]');
    const resetButton = document.querySelector('[data-filter-reset]');
    const summary = document.querySelector('[data-filter-summary]');
    const empty = document.querySelector('[data-filter-empty]');

    if (!form || !titleInput || !authorInput || !genreSelect || !resetButton || !summary || !empty) return;

    const initial = getParams();
    titleInput.value = initial.q;
    authorInput.value = initial.author;
    genreSelect.value = initial.genre || initial.hashtag;

    const customGenre = initCustomListingGenreDropdown(genreSelect);
    if (customGenre && typeof customGenre.refresh === 'function') {
      customGenre.refresh();
    }

    genreSelect.addEventListener('change', function () {
      applyFilters(true, 1);
    });

    function debounce(fn, waitMs) {
      var timer = 0;
      return function () {
        var args = arguments;
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(function () {
          timer = 0;
          fn.apply(null, args);
        }, waitMs);
      };
    }

    var applyFiltersDebounced = debounce(function () {
      applyFilters(true, 1);
    }, 180);

    titleInput.addEventListener('input', function () {
      applyFiltersDebounced();
    });

    authorInput.addEventListener('input', function () {
      applyFiltersDebounced();
    });

    genreSelect.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyFilters(true, 1);
      }
    });

    titleInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyFilters(true, 1);
      }
    });

    authorInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        applyFilters(true, 1);
      }
    });

    function getStoriesContext() {
      var stories = (window.AudioHubStories && typeof window.AudioHubStories.read === 'function')
        ? (window.AudioHubStories.read() || [])
        : [];
      var storiesById = new Map(stories.map(function (story) {
        return [String(story && story.id || ''), story];
      }));
      return { stories: stories, storiesById: storiesById };
    }

    function applyFilters(updateUrl, forcedPage) {
      var storiesContext = getStoriesContext();
      var stories = storiesContext.stories;
      var storiesById = storiesContext.storiesById;
      var currentParams = new URLSearchParams(window.location.search);
      const activeHashtag = getActiveHashtag({ hashtag: currentParams.get('hashtag') || initial.hashtag });
      const filters = {
        q: normalize(titleInput.value),
        author: normalize(authorInput.value),
        genre: normalize(genreSelect.value || initial.hashtag)
      };
      var member = isMember();

      const cards = Array.from(root.querySelectorAll('.story-card'));
      const matchedCards = [];

      cards.forEach(function (card) {
        const title = normalize(card.dataset.title || '');
        const author = normalize(card.dataset.author || '');
        const genre = normalize(card.dataset.genre || '');

        const matchesKeyword = !filters.q || title.includes(filters.q) || author.includes(filters.q);
        const matchesAuthor = !filters.author || author.includes(filters.author);
        const matchesGenre = !filters.genre || genre === filters.genre;
        const story = getStoryByCard(card, stories, storiesById);
        const matchesHashtag = !activeHashtag || storyHasTag(story || {
          genre: card.dataset.genre || '',
          description: card.dataset.description || ''
        }, activeHashtag);
        const matches = activeHashtag
          ? matchesHashtag
          : (matchesKeyword && matchesAuthor && matchesGenre);

        if (matches) {
          matchedCards.push(card);
        }
      });

      var pagination = document.querySelector('.pagination');
      var pageSize = 12;
      var totalItems = matchedCards.length;
      var totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
      var requestedPage = typeof forcedPage === 'number' && forcedPage > 0
        ? forcedPage
        : (Math.max(1, parseInt(currentParams.get('page') || String(initial.page || 1), 10) || 1));
      var page = Math.min(requestedPage, totalPages);
      if (!member && page > 1) {
        page = 1;
      }
      var start = (page - 1) * pageSize;
      var end = start + pageSize;

      cards.forEach(function (card) {
        card.classList.add('is-hidden');
      });
      matchedCards.slice(start, end).forEach(function (card) {
        card.classList.remove('is-hidden');
      });

      empty.classList.toggle('is-visible', totalItems === 0);
      summary.textContent = totalItems === cards.length && !filters.q && !filters.author && !filters.genre && !activeHashtag
        ? 'Hiển thị tất cả truyện trong danh sách.'
        : 'Tìm thấy ' + totalItems + ' truyện phù hợp.';

      if (pagination) {
        pagination.classList.toggle('is-locked', !member);
        var maxButtons = 5;
        var startPage = Math.max(1, page - Math.floor(maxButtons / 2));
        var endPage = Math.min(totalPages, startPage + maxButtons - 1);
        startPage = Math.max(1, endPage - maxButtons + 1);
        var baseParams = {
          q: titleInput.value.trim(),
          author: authorInput.value.trim(),
          genre: activeHashtag ? '' : genreSelect.value.trim(),
          hashtag: activeHashtag
        };

        function buildHref(nextPage) {
          var params = new URLSearchParams();
          if (baseParams.q) params.set('q', baseParams.q);
          if (baseParams.author) params.set('author', baseParams.author);
          if (baseParams.genre) params.set('genre', baseParams.genre);
          if (baseParams.hashtag) params.set('hashtag', baseParams.hashtag);
          if (nextPage > 1) params.set('page', String(nextPage));
          var query = params.toString();
          return query ? (window.location.pathname + '?' + query) : window.location.pathname;
        }

        var html = '';
        if (page > 1) {
          html += '<a href="' + buildHref(page - 1) + '" class="pagination__item pagination__prev" aria-label="Trang trước"><i class="fa-solid fa-chevron-left"></i></a>';
        }
        for (var p = startPage; p <= endPage; p += 1) {
          html += '<a href="' + buildHref(p) + '" class="pagination__item' + (p === page ? ' is-active' : '') + '" data-page="' + p + '">' + p + '</a>';
        }
        if (endPage < totalPages) {
          html += '<span class="pagination__dots">...</span>';
          html += '<a href="' + buildHref(totalPages) + '" class="pagination__item" data-page="' + totalPages + '">' + totalPages + '</a>';
        }
        if (page < totalPages) {
          html += '<a href="' + buildHref(page + 1) + '" class="pagination__item pagination__next" aria-label="Trang tiếp theo"><i class="fa-solid fa-chevron-right"></i></a>';
        }
        pagination.innerHTML = html;
      }

      if (updateUrl) {
        setParams({
          q: titleInput.value.trim(),
          author: authorInput.value.trim(),
          genre: activeHashtag ? '' : genreSelect.value.trim(),
          hashtag: activeHashtag,
          page: page
        });
      }
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      applyFilters(true, 1);
    });

    resetButton.addEventListener('click', function () {
      titleInput.value = '';
      authorInput.value = '';
      genreSelect.value = '';
      if (customGenre && typeof customGenre.reset === 'function') {
        customGenre.reset();
      }
      applyFilters(true, 1);
    });

    const pagination = document.querySelector('.pagination');
    if (pagination) {
      pagination.addEventListener('click', function (event) {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const link = target.closest('a.pagination__item');
        if (!link) return;

        var pageAttr = String(link.getAttribute('data-page') || '').trim();
        var requestedPage = Math.max(1, parseInt(pageAttr || '1', 10) || 1);
        var isActive = link.classList.contains('is-active');

        if (!isActive && !isMember()) {
          event.preventDefault();
          event.stopPropagation();
          if (typeof event.stopImmediatePropagation === 'function') {
            event.stopImmediatePropagation();
          }
          showLoginRequiredModal();
          return;
        }

        event.preventDefault();
        applyFilters(true, requestedPage);
      }, true);
    }

    window.addEventListener('audiohub:stories-updated', function () {
      applyFilters(false);
    });

    applyFilters(false);
  }

  function initHomepageSearch() {
    const form = document.querySelector('[data-home-search-form]');
    if (!form) return;

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      const titleInput = form.querySelector('[data-home-search-input]');
      const genreSelect = form.querySelector('[data-home-genre-select]');
      const statusSelect = form.querySelector('[data-home-status-select]');
      const titleValue = titleInput ? titleInput.value.trim() : '';
      const genreValue = genreSelect ? genreSelect.value.trim() : '';
      const statusValue = statusSelect ? statusSelect.value.trim() : '';
      const params = new URLSearchParams();

      if (titleValue) params.set('q', titleValue);
      if (genreValue) params.set('genre', genreValue);
      if (statusValue) params.set('status', statusValue);

      const url = '/html/new-posts.html' + (params.toString() ? '?' + params.toString() : '');
      window.location.href = url;
    });
  }

  initHomepageSearch();
  initListingFilters();
})();
