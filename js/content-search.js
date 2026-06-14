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

    // Load initial data
    this.loadAllData();
  }

  initSearchTab(tabType) {
    // Get search elements
    this.searchInputs[tabType] = document.querySelector(`[data-search-${tabType}]`);
    this.clearButtons[tabType] = document.querySelector(`[data-search-clear="${tabType}"]`);
    this.searchContainers[tabType] = document.querySelector(`[data-stories-${tabType}], [data-playlist-list], [data-playlist-root]`);

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

    // Search in ALL data, not just current page
    const results = this.searchInData(tabType, query.toLowerCase());

    if (results.length === 0) {
      this.showNoResults(tabType, query);
    } else {
      this.displaySearchResults(tabType, results, query);
    }
  }

  searchInData(tabType, query) {
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
      div.className = 'account-list-item';
      div.innerHTML = `
        <div class="account-list-item-checkbox">
          <input type="checkbox" id="story-${item.id}">
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
        <div class="account-list-item-actions">
          <button type="button" class="account-list-item-menu" data-story-menu="${item.id}">
            <i class="fa-solid fa-ellipsis-vertical"></i>
          </button>
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
    // Restore original content by reloading data
    this.loadTabData(tabType);
    this.showPagination(tabType);
  }

  loadAllData() {
    // Load sample data - replace with real API calls
    this.allData.published = this.generateSampleData('published', 50);
    this.allData.draft = this.generateSampleData('draft', 20);
    this.allData.playlist = this.generateSamplePlaylists(30);

    // Load initial display data
    this.loadTabData('published');
    this.loadTabData('draft');
    this.loadTabData('playlist');
  }

  generateSampleData(type, count) {
    const stories = [];
    const categories = ['Hành Động', 'Lãng Mạn', 'Hài Hước', 'Kinh Dị', 'Viễn Tưởng', 'Lịch Sử'];
    const authors = ['Nguyễn Văn A', 'Trần Thị B', 'Lê Văn C', 'Phạm Thị D', 'Hoàng Văn E'];

    for (let i = 1; i <= count; i++) {
      stories.push({
        id: `${type}-${i}`,
        title: `${type === 'draft' ? 'Bản nháp' : 'Truyện'} số ${i}`,
        author: authors[Math.floor(Math.random() * authors.length)],
        category: categories[Math.floor(Math.random() * categories.length)],
        updateTime: `${Math.floor(Math.random() * 24)}:${Math.floor(Math.random() * 60).toString().padStart(2, '0')} ${Math.floor(Math.random() * 30) + 1}/06/2026`,
        cover: null,
        description: `Mô tả cho ${type} số ${i}`
      });
    }

    return stories;
  }

  generateSamplePlaylists(count) {
    const playlists = [];
    const names = ['Thiên Long Bát Bộ', 'Thúy Hỷ', 'Tây Du Ký', 'Hồng Lâu Mộng', 'Tam Quốc', 'Conan', 'One Piece'];

    for (let i = 1; i <= count; i++) {
      playlists.push({
        id: `playlist-${i}`,
        title: i <= names.length ? names[i-1] : `Playlist ${i}`,
        count: Math.floor(Math.random() * 50) + 1,
        duration: `${Math.floor(Math.random() * 100) + 10} giờ`,
        description: `Mô tả playlist ${i}`
      });
    }

    return playlists;
  }

  loadTabData(tabType) {
    const container = this.getResultContainer(tabType);
    if (!container) return;

    // Show first page of data (simulate pagination)
    const pageSize = 10;
    const pageData = this.allData[tabType].slice(0, pageSize);

    container.innerHTML = '';
    pageData.forEach(item => {
      const element = this.createResultElement(tabType, item, '');
      container.appendChild(element);
    });
  }

  getResultContainer(tabType) {
    if (tabType === 'playlist') {
      return document.querySelector('[data-playlist-list]');
    }
    return document.querySelector(`[data-stories-${tabType}]`);
  }

  hidePagination(tabType) {
    const pagination = document.querySelector(`[data-pagination-wrap="${tabType}"]`);
    if (pagination) {
      pagination.style.display = 'none';
    }
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
document.addEventListener('DOMContentLoaded', () => {
  new ContentSearch();
});

// Also initialize if DOM is already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ContentSearch();
  });
} else {
  new ContentSearch();
}