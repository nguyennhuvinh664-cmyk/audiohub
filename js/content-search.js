/**
 * Content Search Functionality
 * Handles search for Published Stories, Drafts, and Playlists
 */

class ContentSearch {
  constructor() {
    this.searchInputs = {
      published: document.querySelector('[data-search="published"]'),
      draft: document.querySelector('[data-search="draft"]'),
      playlist: document.querySelector('[data-search="playlist"]')
    };

    this.clearButtons = {
      published: document.querySelector('[data-search-clear="published"]'),
      draft: document.querySelector('[data-search-clear="draft"]'),
      playlist: document.querySelector('[data-search-clear="playlist"]')
    };

    this.containers = {
      published: document.querySelector('[data-stories-published]'),
      draft: document.querySelector('[data-stories-drafts]'),
      playlist: document.querySelector('[data-playlist-list]')
    };

    this.originalData = {
      published: [],
      draft: [],
      playlist: []
    };

    this.init();
  }

  init() {
    // Store original data when elements are loaded
    this.storeOriginalData();

    // Setup search event listeners
    Object.keys(this.searchInputs).forEach(type => {
      if (this.searchInputs[type]) {
        this.setupSearchInput(type);
      }
    });

    // Setup clear button listeners
    Object.keys(this.clearButtons).forEach(type => {
      if (this.clearButtons[type]) {
        this.setupClearButton(type);
      }
    });

    // Listen for data updates from other scripts
    document.addEventListener('contentDataUpdated', (e) => {
      if (e.detail && e.detail.type) {
        this.updateOriginalData(e.detail.type, e.detail.data);
      }
    });
  }

  storeOriginalData() {
    // Store data when DOM is ready or when data is loaded
    setTimeout(() => {
      Object.keys(this.containers).forEach(type => {
        this.updateOriginalData(type);
      });
    }, 1000);
  }

  updateOriginalData(type, data = null) {
    if (data) {
      this.originalData[type] = data;
      return;
    }

    // Extract data from DOM
    const container = this.containers[type];
    if (!container) return;

    const items = Array.from(container.children);
    this.originalData[type] = items.map(item => ({
      element: item,
      title: this.extractTitle(item),
      author: this.extractAuthor(item),
      category: this.extractCategory(item),
      searchText: this.extractSearchText(item)
    }));
  }

  extractTitle(element) {
    const titleEl = element.querySelector('.library-title, .playlist-item h4, h4');
    return titleEl ? titleEl.textContent.trim() : '';
  }

  extractAuthor(element) {
    const authorEl = element.querySelector('.library-author, .playlist-item .author, .author');
    return authorEl ? authorEl.textContent.trim() : '';
  }

  extractCategory(element) {
    const categoryEl = element.querySelector('.library-category, .category');
    return categoryEl ? categoryEl.textContent.trim() : '';
  }

  extractSearchText(element) {
    // Create searchable text from all relevant content
    const title = this.extractTitle(element);
    const author = this.extractAuthor(element);
    const category = this.extractCategory(element);

    return [title, author, category].join(' ').toLowerCase();
  }

  setupSearchInput(type) {
    const input = this.searchInputs[type];
    const clearBtn = this.clearButtons[type];

    let searchTimeout;

    input.addEventListener('input', (e) => {
      const query = e.target.value.trim();

      // Show/hide clear button
      if (clearBtn) {
        clearBtn.style.display = query ? 'flex' : 'none';
      }

      // Add loading state
      input.parentElement.classList.add('content-search-loading');

      // Debounce search
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        this.performSearch(type, query);
        input.parentElement.classList.remove('content-search-loading');
      }, 300);
    });

    // Handle Enter key
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        clearTimeout(searchTimeout);
        this.performSearch(type, input.value.trim());
        input.parentElement.classList.remove('content-search-loading');
      }
    });
  }

  setupClearButton(type) {
    const clearBtn = this.clearButtons[type];
    const input = this.searchInputs[type];

    clearBtn.addEventListener('click', () => {
      input.value = '';
      clearBtn.style.display = 'none';
      this.performSearch(type, '');
      input.focus();
    });
  }

  performSearch(type, query) {
    const container = this.containers[type];
    const data = this.originalData[type];

    if (!container || !data.length) {
      return;
    }

    // Clear current content
    container.innerHTML = '';

    if (!query) {
      // Show all original items
      data.forEach(item => {
        this.clearHighlights(item.element);
        container.appendChild(item.element);
      });
      return;
    }

    // Filter and highlight results
    const queryLower = query.toLowerCase();
    const matchedItems = data.filter(item =>
      item.searchText.includes(queryLower)
    );

    if (matchedItems.length === 0) {
      this.showNoResults(container, query, type);
      return;
    }

    // Show matched items with highlights
    matchedItems.forEach(item => {
      this.highlightText(item.element, query);
      container.appendChild(item.element);
    });
  }

  highlightText(element, query) {
    if (!query) return;

    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    const regex = new RegExp(`(${this.escapeRegExp(query)})`, 'gi');

    textNodes.forEach(textNode => {
      const parent = textNode.parentNode;
      if (parent.tagName === 'SCRIPT' || parent.tagName === 'STYLE') return;

      const text = textNode.textContent;
      if (regex.test(text)) {
        const highlighted = text.replace(regex, '<span class="search-highlight">$1</span>');
        const wrapper = document.createElement('span');
        wrapper.innerHTML = highlighted;
        parent.replaceChild(wrapper, textNode);
      }
    });
  }

  clearHighlights(element) {
    const highlights = element.querySelectorAll('.search-highlight');
    highlights.forEach(highlight => {
      const parent = highlight.parentNode;
      parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
      parent.normalize();
    });
  }

  showNoResults(container, query, type) {
    const typeNames = {
      published: 'truyện đã đăng',
      draft: 'bản nháp',
      playlist: 'playlist'
    };

    container.innerHTML = `
      <div class="search-no-results">
        <i class="fa-solid fa-magnifying-glass"></i>
        <h3>Không tìm thấy kết quả</h3>
        <p>Không có ${typeNames[type]} nào khớp với từ khóa "<strong>${this.escapeHtml(query)}</strong>"</p>
      </div>
    `;
  }

  escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Public method to update data from external scripts
  updateData(type, data) {
    this.updateOriginalData(type, data);
  }

  // Public method to clear all searches
  clearAllSearches() {
    Object.keys(this.searchInputs).forEach(type => {
      const input = this.searchInputs[type];
      const clearBtn = this.clearButtons[type];

      if (input) {
        input.value = '';
      }
      if (clearBtn) {
        clearBtn.style.display = 'none';
      }

      this.performSearch(type, '');
    });
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  if (document.body.classList.contains('account-page')) {
    window.contentSearch = new ContentSearch();
  }
});

// Export for external use
window.ContentSearch = ContentSearch;