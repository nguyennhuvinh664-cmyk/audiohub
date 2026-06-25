/**
 * Content Search Module - Fixed Version
 * Handles search functionality for Published, Draft, and Playlist tabs
 * Searches across ALL data, not just current page
 */

class ContentSearch {
  constructor() {
    this.searchInputs = {};
    this.clearButtons = {};
    this.searchContainers = {};
    this.debounceTimers = {};
    this.allData = {
      published: [],
      draft: [],
      playlist: []
    };

    this.init();
  }

  init() {
    // Initialize search for all tabs
    this.initSearchTab('published');
    this.initSearchTab('draft');
    this.initSearchTab('playlist');

    // Bind bulk actions for search result lists
    this.initBulkActions();

    // Load initial data
    this.loadAllData();
  }

  initSearchTab(tabType) {
    // Get search elements
    this.searchInputs[tabType] = document.querySelector(`[data-search-${tabType}]`);
    this.clearButtons[tabType] = document.querySelector(`[data-search-clear="${tabType}"]`);
    this.searchContainers[tabType] = this.getResultContainer(tabType);

    if (!this.searchInputs[tabType]) return;

    // Add event listeners
    this.searchInputs[tabType].addEventListener('input', (e) => {
      this.handleSearch(tabType, e.target.value);
    });

    this.searchInputs[tabType].addEventListener('keyup', (e) => {
      if (e.key === 'Escape') {
        this.clearSearch(tabType);
      }
    });

    if (this.clearButtons[tabType]) {
      this.clearButtons[tabType].addEventListener('click', () => {
        this.clearSearch(tabType);
      });
    }
  }

  handleSearch(tabType, query) {
    // Clear previous debounce
    if (this.debounceTimers[tabType]) {
      clearTimeout(this.debounceTimers[tabType]);
    }

    // Show/hide clear button
    this.toggleClearButton(tabType, query);

    // Add loading state
    this.setLoadingState(tabType, true);

    // Debounce search
    this.debounceTimers[tabType] = setTimeout(() => {
      this.performSearch(tabType, query);
      this.setLoadingState(tabType, false);
    }, 300);
  }

  performSearch(tabType, query) {
    if (!query.trim()) {
      this.showAllResults(tabType);
      return;
    }

    // Search in ALL data, but show only one page of results
    const results = this.searchInData(tabType, query.toLowerCase());
    const pageResults = results.slice(0, this.pageSize);

    if (pageResults.length === 0) {
      this.showNoResults(tabType, query);
    } else {
      this.displaySearchResults(tabType, pageResults, query);
    }
  }

  searchInData(tabType, query) {
    // Refresh playlist data before searching (it may have changed since init)
    if (tabType === 'playlist') {
      this.refreshPlaylistData();
    }
    const data = this.allData[tabType];

    return data.filter(item => {
      const searchText = [
        item.title,
        item.author,
        item.category,
        item.description
      ].join(' ').toLowerCase();

      return searchText.includes(query);
    });
  }

  displaySearchResults(tabType, results, query) {
    const container = this.getResultContainer(tabType);
    if (!container) return;

    // Clear container
    container.innerHTML = '';

    // Add search results
    results.forEach(item => {
      const element = this.createResultElement(tabType, item, query);
      container.appendChild(element);
    });

    if (results.length >= this.pageSize) {
      const notice = document.createElement('div');
      notice.className = 'search-results-limit';
      notice.textContent = `Hiển thị ${this.pageSize} truyện đầu tiên. Hãy thu hẹp tìm kiếm để xem kết quả chính xác hơn.`;
      container.appendChild(notice);
    }

    // Hide pagination during search
    this.hidePagination(tabType);
  }

  createResultElement(tabType, item, query) {
    const div = document.createElement('div');

    if (tabType === 'playlist') {
      div.className = 'playlist-item';
      div.innerHTML = `
        <div class="playlist-item-content">
          <div class="playlist-item-info">
            <h3 class="playlist-item-title">${this.highlightText(item.title, query)}</h3>
            <p class="playlist-item-meta">${item.count || 0} truyện • ${item.duration || 'Đang cập nhật'}</p>
          </div>
          <div class="playlist-item-actions">
            <button type="button" class="btn btn--outline btn--sm playlist-item-edit" data-playlist-edit="${item.id}">
              <i class="fa-solid fa-pencil"></i>
            </button>
            <button type="button" class="btn btn--danger btn--sm playlist-item-delete" data-playlist-delete="${item.id}">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      `;
    } else {
      var storyHref = '/story-detail.html?id=' + encodeURIComponent(String(item.id || ''));
      var editHref = '/html/upload-story.html?edit=' + encodeURIComponent(String(item.id || ''));
      div.className = 'account-list-item';
      div.innerHTML = `
        <div class="account-list-item-checkbox">
          <input type="checkbox" id="story-${item.id}" data-story-checkbox>
        </div>
        <div class="account-list-item-thumb">
          <img src="${item.cover || '/images/placeholder.jpg'}" alt="${item.title}">
        </div>
        <div class="account-list-item-content">
          <h3 class="account-list-item-title">${this.highlightText(item.title, query)}</h3>
          <p class="account-list-item-meta">
            ${this.highlightText(item.author, query)} •
            ${this.highlightText(item.category, query)} •
            Cập nhật ${item.updateTime}
          </p>
        </div>
        <div class="account-item-menu-wrap">
          <button type="button" class="account-item-menu-btn" data-story-menu="${item.id}" aria-label="Tùy chọn" title="Tùy chọn">
            <i class="fa-solid fa-ellipsis-vertical"></i>
          </button>
          <div class="account-item-menu is-hidden" data-story-menu-panel="${item.id}">
            <a href="${storyHref}" class="account-item-menu-option">Xem truyện</a>
            <button type="button" class="account-item-menu-option" data-story-add-playlist="${item.id}" data-story-title="${item.title || ''}" data-story-author="${item.author || ''}" data-story-genre="${item.category || ''}" data-story-href="${storyHref}">Thêm vào playlist</button>
            <a href="${editHref}" class="account-item-menu-option">Sửa audio</a>
            <button type="button" class="account-item-menu-option account-item-menu-option--danger" data-story-delete-one="${item.id}">Xóa truyện</button>
          </div>
        </div>
      `;
    }

    return div;
  }

  highlightText(text, query) {
    if (!text || !query) return text;

    const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
    return text.replace(regex, '<span class="search-highlight">$1</span>');
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  showNoResults(tabType, query) {
    const container = this.getResultContainer(tabType);
    if (!container) return;

    container.innerHTML = `
      <div class="search-no-results">
        <i class="fa-solid fa-magnifying-glass"></i>
        <h3>Không tìm thấy kết quả</h3>
        <p>Không có nội dung nào khớp với "<strong>${query}</strong>"</p>
        <p>Hãy thử từ khóa khác hoặc kiểm tra chính tả.</p>
      </div>
    `;

    this.hidePagination(tabType);
  }

  showAllResults(tabType) {
    // Dispatch event to let stories-account.js re-render instead of rendering ourselves
    window.dispatchEvent(new CustomEvent('audiohub:stories-updated'));
    this.showPagination(tabType);
  }

  loadAllData() {
    // Read real data from AudioHubStories store - do NOT generate sample data
    this.pageSize = 10;
    this.refreshDataFromStore();
    // Do NOT call loadTabData() here - let stories-account.js handle rendering
  }

  refreshDataFromStore() {
    // Read stories from AudioHubStories
    var stories = [];
    if (window.AudioHubStories && typeof window.AudioHubStories.read === 'function') {
      var raw = window.AudioHubStories.read();
      stories = Array.isArray(raw) ? raw : [];
    }

    // Check if real login (API mode)
    var isRealLogin = window.AudioHubApi &&
      typeof window.AudioHubApi.isEnabled === 'function' &&
      window.AudioHubApi.isEnabled();

    // Filter local-only stories (s_ prefix) for real login
    if (isRealLogin) {
      stories = stories.filter(function(s) {
        return !String(s && s.id || '').startsWith('s_');
      });
    }

    // Separate published and draft
    var published = [];
    var draft = [];
    stories.forEach(function(story) {
      var visibility = String(story && story.visibility || '').trim().toLowerCase();
      var isDraft = visibility === 'draft' || visibility === 'private' ||
        visibility === 'không công khai' || visibility === 'riêng tư';

      var item = {
        id: story.id || '',
        title: story.title || 'Truyện mới',
        author: story.author || 'Ẩn danh',
        category: story.genre || 'Truyện audio',
        updateTime: story.updatedAt || story.createdAt || '',
        cover: null,
        description: story.description || ''
      };

      if (isDraft) {
        draft.push(item);
      } else {
        published.push(item);
      }
    });

    this.allData.published = published;
    this.allData.draft = draft;

    // Read playlists from localStorage
    var playlists = [];
    try {
      var rawPl = window.localStorage.getItem('audiohub-playlists-v1');
      if (rawPl) {
        var parsed = JSON.parse(rawPl);
        playlists = Array.isArray(parsed) ? parsed.map(function(pl) {
          return {
            id: pl.id || '',
            title: pl.name || 'Playlist',
            count: Array.isArray(pl.entries) ? pl.entries.length : 0,
            duration: 'Đang cập nhật',
            description: ''
          };
        }) : [];
      }
    } catch (e) {}
    this.allData.playlist = playlists;
  }

  refreshPlaylistData() {
    var playlists = [];
    try {
      var rawPl = window.localStorage.getItem('audiohub-playlists-v1');
      if (rawPl) {
        var parsed = JSON.parse(rawPl);
        playlists = Array.isArray(parsed) ? parsed.map(function(pl) {
          return {
            id: pl.id || '',
            title: pl.name || 'Playlist',
            count: Array.isArray(pl.entries) ? pl.entries.length : 0,
            duration: 'Đang cập nhật',
            description: ''
          };
        }) : [];
      }
    } catch (e) {}
    this.allData.playlist = playlists;
  }

  loadTabData(tabType) {
    // This method is only used during search - do NOT render on init
    const container = this.getResultContainer(tabType);
    if (!container) return;

    const pageData = this.allData[tabType].slice(0, this.pageSize);

    container.innerHTML = '';
    if (tabType !== 'playlist') {
      const toolbar = document.createElement('div');
      toolbar.className = 'search-action-bar';
      toolbar.innerHTML = `
        <button type="button" class="btn btn--outline" data-search-select-all><i class="fa-solid fa-check"></i> chọn tất cả</button>
        <button type="button" class="btn btn--outline" data-search-deselect-all><i class="fa-solid fa-xmark"></i> bỏ chọn</button>
        <button type="button" class="btn btn--danger" data-search-delete-selected><i class="fa-solid fa-trash"></i> xóa tất cả mục đã chọn</button>
      `;
      container.appendChild(toolbar);
    }

    pageData.forEach(item => {
      const element = this.createResultElement(tabType, item, '');
      container.appendChild(element);
    });
  }

  getResultContainer(tabType) {
    if (tabType === 'playlist') {
      return document.querySelector('[data-playlist-list]');
    }
    if (tabType === 'draft') {
      return document.querySelector('[data-stories-drafts]');
    }
    return document.querySelector('[data-stories-published]');
  }

  hidePagination(tabType) {
    const pagination = document.querySelector(`[data-pagination-wrap="${tabType}"]`);
    if (pagination) {
      pagination.style.display = 'none';
    }
  }

  initBulkActions() {
    document.addEventListener('click', (event) => {
      var selectAllBtn = event.target.closest('[data-search-select-all]');
      var deselectAllBtn = event.target.closest('[data-search-deselect-all]');
      var deleteSelectedBtn = event.target.closest('[data-search-delete-selected]');

      if (selectAllBtn || deselectAllBtn || deleteSelectedBtn) {
        var panel = event.target.closest('[data-content-panel]');
        if (!panel) return;
        var listRoot = panel.querySelector('[data-stories-published], [data-stories-drafts]');
        if (!listRoot) return;

        if (selectAllBtn) {
          listRoot.querySelectorAll('[data-story-checkbox]').forEach(function (checkbox) {
            checkbox.checked = true;
          });
          var toggle = listRoot.querySelector('[data-select-all]');
          if (toggle) toggle.checked = true;
          return;
        }

        if (deselectAllBtn) {
          listRoot.querySelectorAll('[data-story-checkbox]').forEach(function (checkbox) {
            checkbox.checked = false;
          });
          var toggle = listRoot.querySelector('[data-select-all]');
          if (toggle) toggle.checked = false;
          return;
        }

        if (deleteSelectedBtn) {
          var ids = Array.prototype.slice.call(listRoot.querySelectorAll('[data-story-checkbox]:checked')).map(function (checkbox) {
            return checkbox.getAttribute('id') && checkbox.getAttribute('id').replace(/^story-/, '');
          }).filter(Boolean);
          if (!ids.length) return;
          if (!window.confirm('Xóa ' + ids.length + ' truyện đã chọn?')) return;
          if (typeof window.AudioHubStories === 'object' && typeof window.AudioHubStories.deleteById === 'function') {
            ids.forEach(function (id) { window.AudioHubStories.deleteById(id); });
          }
          this.loadAllData();
          return;
        }
      }
    });
  }

  showPagination(tabType) {
    const pagination = document.querySelector(`[data-pagination-wrap="${tabType}"]`);
    if (pagination) {
      pagination.style.display = 'block';
    }
  }

  toggleClearButton(tabType, query) {
    if (this.clearButtons[tabType]) {
      this.clearButtons[tabType].style.display = query ? 'flex' : 'none';
    }
  }

  setLoadingState(tabType, loading) {
    const searchBar = this.searchInputs[tabType]?.closest('.content-search-bar');
    if (searchBar) {
      if (loading) {
        searchBar.classList.add('content-search-loading');
      } else {
        searchBar.classList.remove('content-search-loading');
      }
    }
  }

  clearSearch(tabType) {
    if (this.searchInputs[tabType]) {
      this.searchInputs[tabType].value = '';
      this.toggleClearButton(tabType, '');
      this.showAllResults(tabType);
      this.searchInputs[tabType].focus();
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ContentSearch();
  });
} else {
  new ContentSearch();
}