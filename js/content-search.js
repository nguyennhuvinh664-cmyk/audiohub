// Content Search Functionality
(function() {
  'use strict';

  // Search configuration
  const SEARCH_CONFIG = {
    debounceDelay: 300,
    minSearchLength: 1,
    highlightClass: 'search-highlight'
  };

  // Search state
  const searchState = {
    published: { query: '', results: [], isSearching: false },
    draft: { query: '', results: [], isSearching: false },
    playlist: { query: '', results: [], isSearching: false }
  };

  // DOM elements cache
  const elements = {};

  // Initialize search functionality
  function initSearch() {
    // Cache DOM elements
    cacheElements();

    // Bind event listeners
    bindEvents();

    // Generate sample data for demo
    generateSampleData();

    console.log('Content search initialized');
  }

  // Cache DOM elements for better performance
  function cacheElements() {
    // Search inputs
    elements.searchPublished = document.querySelector('[data-search-published]');
    elements.searchDraft = document.querySelector('[data-search-draft]');
    elements.searchPlaylist = document.querySelector('[data-search-playlist]');

    // Clear buttons
    elements.clearPublished = document.querySelector('[data-search-clear="published"]');
    elements.clearDraft = document.querySelector('[data-search-clear="draft"]');
    elements.clearPlaylist = document.querySelector('[data-search-clear="playlist"]');

    // Content containers
    elements.publishedList = document.querySelector('[data-stories-published]');
    elements.draftsList = document.querySelector('[data-stories-drafts]');
    elements.playlistList = document.querySelector('[data-playlist-list]');
  }

  // Bind event listeners
  function bindEvents() {
    // Search input events
    if (elements.searchPublished) {
      elements.searchPublished.addEventListener('input', debounce((e) => handleSearch('published', e.target.value), SEARCH_CONFIG.debounceDelay));
      elements.searchPublished.addEventListener('focus', () => handleSearchFocus('published'));
    }

    if (elements.searchDraft) {
      elements.searchDraft.addEventListener('input', debounce((e) => handleSearch('draft', e.target.value), SEARCH_CONFIG.debounceDelay));
      elements.searchDraft.addEventListener('focus', () => handleSearchFocus('draft'));
    }

    if (elements.searchPlaylist) {
      elements.searchPlaylist.addEventListener('input', debounce((e) => handleSearch('playlist', e.target.value), SEARCH_CONFIG.debounceDelay));
      elements.searchPlaylist.addEventListener('focus', () => handleSearchFocus('playlist'));
    }

    // Clear button events
    if (elements.clearPublished) {
      elements.clearPublished.addEventListener('click', () => clearSearch('published'));
    }

    if (elements.clearDraft) {
      elements.clearDraft.addEventListener('click', () => clearSearch('draft'));
    }

    if (elements.clearPlaylist) {
      elements.clearPlaylist.addEventListener('click', () => clearSearch('playlist'));
    }
  }

  // Handle search input
  function handleSearch(type, query) {
    const trimmedQuery = query.trim();
    searchState[type].query = trimmedQuery;

    // Toggle clear button visibility
    toggleClearButton(type, trimmedQuery.length > 0);

    // Show loading state
    if (trimmedQuery.length >= SEARCH_CONFIG.minSearchLength) {
      setLoadingState(type, true);

      // Simulate API delay for better UX
      setTimeout(() => {
        performSearch(type, trimmedQuery);
        setLoadingState(type, false);
      }, 150);
    } else {
      // Show all items when query is too short
      showAllItems(type);
    }
  }

  // Handle search input focus
  function handleSearchFocus(type) {
    const query = searchState[type].query;
    if (query.length >= SEARCH_CONFIG.minSearchLength) {
      performSearch(type, query);
    }
  }

  // Perform the actual search
  function performSearch(type, query) {
    const container = getContainerElement(type);
    if (!container) return;

    const items = container.querySelectorAll('.library-item, .playlist-item');
    const results = [];
    let visibleCount = 0;

    items.forEach(item => {
      const searchableText = getSearchableText(item);
      const isMatch = searchableText.toLowerCase().includes(query.toLowerCase());

      if (isMatch && query.length > 0) {
        // Highlight matching text
        highlightText(item, query);
        item.style.display = '';
        results.push(item);
        visibleCount++;
      } else if (query.length === 0) {
        // Show all items when no query
        removeHighlight(item);
        item.style.display = '';
        visibleCount++;
      } else {
        // Hide non-matching items
        item.style.display = 'none';
      }
    });

    // Update search state
    searchState[type].results = results;

    // Show no results message if needed
    toggleNoResultsMessage(type, visibleCount === 0 && query.length > 0);

    // Add search animation class
    container.classList.add('search-complete');
    setTimeout(() => container.classList.remove('search-complete'), 300);
  }

  // Get searchable text from item
  function getSearchableText(item) {
    const title = item.querySelector('.library-title, .playlist-name, h3, h4');
    const author = item.querySelector('.library-author, .playlist-author, .story-author');
    const genre = item.querySelector('.library-genre, .playlist-genre, .story-genre');

    let text = '';
    if (title) text += title.textContent + ' ';
    if (author) text += author.textContent + ' ';
    if (genre) text += genre.textContent + ' ';

    return text.trim();
  }

  // Highlight matching text
  function highlightText(item, query) {
    if (!query || query.length === 0) return;

    const elements = item.querySelectorAll('.library-title, .library-author, .library-genre, .playlist-name, h3, h4');
    const regex = new RegExp(`(${escapeRegExp(query)})`, 'gi');

    elements.forEach(el => {
      const originalText = el.getAttribute('data-original-text') || el.textContent;
      if (!el.getAttribute('data-original-text')) {
        el.setAttribute('data-original-text', originalText);
      }

      const highlightedText = originalText.replace(regex, `<span class="${SEARCH_CONFIG.highlightClass}">$1</span>`);
      el.innerHTML = highlightedText;
    });
  }

  // Remove highlight from text
  function removeHighlight(item) {
    const elements = item.querySelectorAll('.library-title, .library-author, .library-genre, .playlist-name, h3, h4');

    elements.forEach(el => {
      const originalText = el.getAttribute('data-original-text');
      if (originalText) {
        el.textContent = originalText;
        el.removeAttribute('data-original-text');
      }
    });
  }

  // Clear search
  function clearSearch(type) {
    const inputElement = getInputElement(type);
    if (inputElement) {
      inputElement.value = '';
      inputElement.focus();
    }

    searchState[type].query = '';
    searchState[type].results = [];

    toggleClearButton(type, false);
    showAllItems(type);
    toggleNoResultsMessage(type, false);
  }

  // Show all items (clear search results)
  function showAllItems(type) {
    const container = getContainerElement(type);
    if (!container) return;

    const items = container.querySelectorAll('.library-item, .playlist-item');
    items.forEach(item => {
      item.style.display = '';
      removeHighlight(item);
    });
  }

  // Toggle clear button visibility
  function toggleClearButton(type, show) {
    const clearButton = getClearButtonElement(type);
    if (clearButton) {
      clearButton.style.display = show ? 'flex' : 'none';
    }
  }

  // Set loading state
  function setLoadingState(type, isLoading) {
    const container = getContainerElement(type);
    if (!container) return;

    searchState[type].isSearching = isLoading;

    if (isLoading) {
      container.classList.add('searching');
    } else {
      container.classList.remove('searching');
    }
  }

  // Toggle no results message
  function toggleNoResultsMessage(type, show) {
    const container = getContainerElement(type);
    if (!container) return;

    let noResultsEl = container.querySelector('.content-search-no-results');

    if (show && !noResultsEl) {
      noResultsEl = document.createElement('div');
      noResultsEl.className = 'content-search-no-results';
      noResultsEl.innerHTML = `
        <i class="fa-solid fa-magnifying-glass"></i>
        <h3>Không tìm thấy kết quả</h3>
        <p>Hãy thử với từ khóa khác hoặc kiểm tra lại chính tả.</p>
      `;
      container.appendChild(noResultsEl);
    } else if (!show && noResultsEl) {
      noResultsEl.remove();
    }
  }

  // Helper functions
  function getInputElement(type) {
    switch (type) {
      case 'published': return elements.searchPublished;
      case 'draft': return elements.searchDraft;
      case 'playlist': return elements.searchPlaylist;
      default: return null;
    }
  }

  function getClearButtonElement(type) {
    switch (type) {
      case 'published': return elements.clearPublished;
      case 'draft': return elements.clearDraft;
      case 'playlist': return elements.clearPlaylist;
      default: return null;
    }
  }

  function getContainerElement(type) {
    switch (type) {
      case 'published': return elements.publishedList;
      case 'draft': return elements.draftsList;
      case 'playlist': return elements.playlistList;
      default: return null;
    }
  }

  // Utility functions
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Generate sample data for demo purposes
  function generateSampleData() {
    // Sample published stories
    const publishedSamples = [
      { title: 'Tình Yêu Không Khoảng Cách', author: 'Minh Tâm', genre: 'Lãng Mạn' },
      { title: 'Cuộc Phiêu Lưu Kỳ Thú', author: 'Hải Yến', genre: 'Phiêu Lưu' },
      { title: 'Bí Ẩn Thành Phố Cổ', author: 'Quang Minh', genre: 'Bí Ẩn' },
      { title: 'Những Ngày Học Trò', author: 'Thu Thảo', genre: 'Thanh Xuân' },
      { title: 'Hành Trình Tìm Lại Ký Ức', author: 'Đức Anh', genre: 'Tâm Lý' }
    ];

    // Add sample data to published container
    addSampleItems('published', publishedSamples);
    addSampleItems('draft', publishedSamples.slice(0, 2));

    // Sample playlists
    const playlistSamples = [
      { name: 'Truyện Tình Yêu Hay Nhất', count: 25 },
      { name: 'Phiêu Lưu Kinh Dị', count: 18 },
      { name: 'Tâm Lý Xã Hội', count: 12 }
    ];
    addSamplePlaylists(playlistSamples);
  }

  function addSampleItems(type, items) {
    const container = getContainerElement(type);
    if (!container || container.children.length > 0) return;

    items.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'library-item';
      itemEl.innerHTML = `
        <div class="library-item-content">
          <h3 class="library-title">${item.title}</h3>
          <p class="library-author">Tác giả: ${item.author}</p>
          <span class="library-genre">${item.genre}</span>
        </div>
      `;
      container.appendChild(itemEl);
    });
  }

  function addSamplePlaylists(items) {
    const container = elements.playlistList;
    if (!container || container.children.length > 0) return;

    items.forEach(item => {
      const itemEl = document.createElement('div');
      itemEl.className = 'playlist-item';
      itemEl.innerHTML = `
        <h4 class="playlist-name">${item.name}</h4>
        <p>${item.count} truyện</p>
      `;
      container.appendChild(itemEl);
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSearch);
  } else {
    initSearch();
  }

  // Export for external use
  window.ContentSearch = {
    search: performSearch,
    clear: clearSearch,
    state: searchState
  };

})();