/**
 * AudioHub SPA Router
 * Lightweight client-side router for SPA-like navigation.
 * Intercepts link clicks, fetches pages via fetch(), swaps only #page-content.
 * Persistent elements (header, drawer, bottom nav) are never destroyed.
 */
(function () {
  'use strict';

  /* ── Config ─────────────────────────────────────────────────────────── */
  var SHELL_ID = 'page-content';
  var ASSET_VERSION = Date.now().toString(); // dynamic — fresh version on every page load, busts all caches

  /** Pages that live in /html/ directory */
  var HTML_PAGES = [
    'account.html', 'affiliate.html', 'authors.html', 'blog.html',
    'categories.html', 'change-password.html', 'channel.html',
    'completed.html', 'contact.html', 'drafts.html', 'edit-profile.html',
    'hall-of-fame.html', 'hall-of-hearts.html', 'login.html',
    'new-posts.html', 'popular.html', 'privacy.html', 'register.html',
    'terms.html', 'trending.html',
    'upload-story.html', 'user-account.html'
  ];

  /** Pages that live in root directory */
  var ROOT_PAGES = ['index.html', 'story-detail.html', 'story-detail'];

  /** All known SPA routes (normalized: no leading slash) */
  var KNOWN_ROUTES = {};
  ROOT_PAGES.forEach(function (p) { KNOWN_ROUTES[p] = ''; });
  HTML_PAGES.forEach(function (p) { KNOWN_ROUTES[p] = 'html/'; });

  /**
   * Page-specific CSS (without .css extension, relative to /css/).
   * Shared CSS is loaded once and never removed.
   */
  var SHARED_CSS = [
    'style-index', 'style-categories', 'mobile-shared', 'header-enhancements', 'auth-state', 'mobile-app', 'dev-mode'
  ];

  var PAGE_CSS = {
    'index.html':           ['home-mobile'],
    'account.html':         ['account', 'account-mobile', 'playlist-clean', 'content-search', 'library-state'],
    'story-detail':         ['style-index', 'style-categories', 'mobile-shared', 'header-enhancements', 'auth-state', 'mobile-app', 'library-state', 'story-detail-ui', 'story-detail-mobile'],
    'categories.html':      ['categories-mobile'],
    'new-posts.html':       ['story-filters', 'library-state'],
    'popular.html':         ['story-filters', 'library-state'],
    'trending.html':        ['story-filters', 'library-state'],
    'completed.html':       ['story-filters', 'library-state'],
    'upload-story.html':    ['upload-story'],
    'edit-profile.html':    ['edit-profile'],
    'hall-of-fame.html':    ['hall-of-fame'],
    'hall-of-hearts.html':  ['hall-of-fame', 'info-pages'],
    'channel.html':         ['channel'],
    'about.html':           ['info-pages'],
    'blog.html':            ['info-pages'],
    'contact.html':         ['info-pages'],
    'privacy.html':         ['info-pages'],
    'terms.html':           ['info-pages'],
    'affiliate.html':       ['info-pages'],
    'authors.html':         ['info-pages'],
    'login.html':           [],
    'register.html':        [],
    'change-password.html': ['account'],
    'user-account.html':    ['user-account', 'mobile-account'],
    'drafts.html':          ['drafts']
  };

  /**
   * Page-specific JS modules (without .js extension, relative to /js/).
   * Shared JS is loaded once and never removed.
   */
  var SHARED_JS = [
    'api-client', 'auth-state', 'cloudflare-client', 'stories-store'
  ];

  var PAGE_JS = {
    'index.html':           ['story-filters', 'stories-home'],
    'account.html':         ['stories-cover-store', 'stories-audio-store', 'library-state', 'stories-account', 'content-search'],
    'story-detail':         ['library-state', 'stories-cover-store', 'stories-audio-store', 'story-detail-ui'],
    'categories.html':      ['categories'],
    'new-posts.html':       ['story-filters', 'library-state', 'stories-cover-store', 'stories-listing'],
    'popular.html':         ['story-filters', 'library-state', 'stories-cover-store', 'stories-listing'],
    'trending.html':        ['story-filters', 'library-state', 'stories-cover-store', 'stories-listing'],
    'completed.html':       ['library-state', 'stories-cover-store', 'stories-listing'],
    'upload-story.html':    ['stories-cover-store', 'stories-audio-store', 'upload-story-ui', 'drafts-ui'],
    'edit-profile.html':    ['edit-profile-ui'],
    'channel.html':         ['stories-cover-store', 'channel-ui'],
    'user-account.html':    ['stories-cover-store', 'library-state', 'user-account', 'user-account-mobile'],
    'drafts.html':          ['stories-cover-store', 'stories-audio-store', 'drafts-ui']
  };

  /* ── State ──────────────────────────────────────────────────────────── */
  var loadedPageCSS = [];   // currently loaded page-specific <link> elements
  var loadedPageJS = [];    // currently loaded page-specific <script> elements
  var transitioning = false;
  var isInitialLoad = true;

  /** Hide the loading overlay after initial page load */
  function hideSpaLoader() {
    var loader = document.getElementById('spa-loader');
    if (!loader) return;
    loader.classList.add('fade-out');
    setTimeout(function () { loader.remove(); }, 350);
  }

  /* ── Helpers ────────────────────────────────────────────────────────── */

  /** Get the base path for a given page path */
  function getBasePath(pagePath) {
    // pagePath example: /html/account.html or /index.html or /
    var parts = pagePath.replace(/^\//, '').split('/');
    if (parts.length > 1 && parts[0] === 'html') {
      return 'html/';
    }
    return '';
  }

  /** Normalize a URL path to a route key */
  function normalizePath(pathname) {
    var p = pathname.replace(/^\//, '');
    // Handle root path
    if (!p || p === '') return 'index.html';
    // Already has html/ prefix
    if (p.indexOf('html/') === 0) return p.replace('html/', '');
    // It's a known root page
    if (ROOT_PAGES.indexOf(p) >= 0) return p;
    // It's a known HTML page without prefix
    if (HTML_PAGES.indexOf(p) >= 0) return p;
    return p;
  }

  /** Check if a route is a known SPA route */
  function isKnownRoute(route) {
    return KNOWN_ROUTES.hasOwnProperty(route);
  }

  /** Check if a link element should be handled by the SPA router */
  function shouldIntercept(anchor) {
    // Skip if not an anchor
    if (!anchor || !anchor.href) return false;
    // Skip if has data-spa-ignore
    if (anchor.hasAttribute('data-spa-ignore')) return false;
    // Skip external links
    if (anchor.origin !== window.location.origin) return false;
    // Skip target="_blank"
    if (anchor.target === '_blank') return false;
    // Skip download links
    if (anchor.hasAttribute('download')) return false;
    // Skip javascript: links
    if (anchor.protocol === 'javascript:') return false;
    // Skip hash-only links (same page)
    var url = new URL(anchor.href);
    var currentPath = window.location.pathname;
    var targetPath = url.pathname;
    if (targetPath === currentPath && url.hash) return false;

    // Check if target is a known route
    var route = normalizePath(targetPath);
    return isKnownRoute(route);
  }

  /** Get the full URL path for a route (used for fetch) */
  function getRouteUrl(route) {
    // story-detail is served by Pages Function to bypass _redirects catch-all
    if (route === 'story-detail' || route === 'story-detail.html') {
      return '/story-detail';
    }
    var prefix = KNOWN_ROUTES[route] || '';
    // Root pages without .html extension need .html appended for fetch
    // (e.g., 'something' → '/something.html')
    var fetchRoute = (prefix === '' && route.indexOf('.html') === -1) ? route + '.html' : route;
    return '/' + prefix + fetchRoute;
  }

  /** Extract the page filename from a URL path */
  function extractPageName(pathname) {
    var parts = pathname.replace(/^\//, '').split('/');
    return parts[parts.length - 1] || 'index.html';
  }

  /** CSS helpers */
  function getLoadedHrefs() {
    var hrefs = [];
    document.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
      hrefs.push(link.getAttribute('href'));
    });
    return hrefs;
  }

  function loadCSS(href) {
    // Add cache-busting version
    var versionedHref = href + (href.indexOf('?') >= 0 ? '&' : '?') + 'v=' + ASSET_VERSION;
    if (getLoadedHrefs().indexOf(href) >= 0) return Promise.resolve();
    return new Promise(function (resolve) {
      var link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = versionedHref;
      link.setAttribute('data-page-css', '');
      link.onload = resolve;
      link.onerror = resolve;
      document.head.appendChild(link);
    });
  }

  function removePageCSS() {
    document.querySelectorAll('link[data-page-css]').forEach(function (link) {
      link.remove();
    });
    // Remove stale CSS-based active nav rules from previous standalone page
    document.querySelectorAll('style[data-active-nav]').forEach(function (s) {
      s.remove();
    });
  }

  /** Script helpers */
  function removePageScripts() {
    // Call page cleanup functions before removing scripts (frees document/window listeners)
    if (typeof window.__pageCleanup === 'function') {
      try { window.__pageCleanup(); } catch (e) {}
    }
    // Reset singleton guards so scripts can re-register on next visit
    window.__playlistActionsBound = false;
    document.querySelectorAll('script[data-page-script]').forEach(function (s) {
      s.remove();
    });
  }

  function loadScript(src) {
    // Add cache-busting version
    var versionedSrc = src + (src.indexOf('?') >= 0 ? '&' : '?') + 'v=' + ASSET_VERSION;
    return new Promise(function (resolve) {
      var script = document.createElement('script');
      script.src = versionedSrc;
      script.setAttribute('data-page-script', '');
      script.onload = resolve;
      script.onerror = resolve;
      document.body.appendChild(script);
    });
  }

  /** Active link highlighting */
  function updateActiveLinks(route) {
    // Bottom nav
    document.querySelectorAll('.bnav__item, .m-bottomnav__item').forEach(function (link) {
      var href = link.getAttribute('href') || '';
      var linkRoute = normalizePath(new URL(href, window.location.origin).pathname);
      link.classList.toggle('active', linkRoute === route);
    });

    // Desktop nav
    document.querySelectorAll('.nav__link').forEach(function (link) {
      var href = link.getAttribute('href') || '';
      var linkRoute = normalizePath(new URL(href, window.location.origin).pathname);
      link.classList.toggle('active', linkRoute === route);
    });

    // Drawer links
    document.querySelectorAll('.m-drawer__link').forEach(function (link) {
      var href = link.getAttribute('href') || '';
      var linkRoute = normalizePath(new URL(href, window.location.origin).pathname);
      link.classList.toggle('active', linkRoute === route);
    });
  }

  /** Close mobile drawer if open */
  function closeMobileUI() {
    var drawer = document.getElementById('mDrawer');
    var overlay = document.getElementById('mDrawerOverlay');
    if (drawer) drawer.classList.remove('is-open');
    if (overlay) overlay.classList.remove('is-open');
    document.body.style.overflow = '';

    // Close desktop nav if open
    var nav = document.getElementById('nav');
    var navOv = document.getElementById('navOv');
    if (nav) nav.classList.remove('open');
    if (navOv) navOv.classList.remove('show');
  }

  /* ── Core Navigation ────────────────────────────────────────────────── */

  function navigateTo(url, pushState) {
    if (transitioning) return;
    transitioning = true;

    closeMobileUI();

    var targetUrl = new URL(url, window.location.origin);
    var route = normalizePath(targetUrl.pathname);
    var pageName = extractPageName(targetUrl.pathname);

    // FIX: Save current path to sessionStorage so hard refresh can restore it
    // Cloudflare Pages redirects .html URLs to / — sessionStorage preserves the intent
    if (route !== 'index.html') {
      try { sessionStorage.setItem('audiohub-last-route', route); } catch (e) {}
    } else {
      try { sessionStorage.removeItem('audiohub-last-route'); } catch (e) {}
    }

    // Preserve query string and hash
    var search = targetUrl.search || '';
    var hash = targetUrl.hash || '';
    // Browser URL stays clean (e.g., /story-detail?id=xxx)
    var fullPath = '/' + route + search + hash;
    // Fetch URL points to actual file (e.g., /story-detail.html?id=xxx)
    // Add _t timestamp to bust Cloudflare edge cache on deployments
    var fetchUrl = getRouteUrl(route) + search + (search ? '&' : '?') + '_t=' + Date.now();

    fetch(fetchUrl, { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('Navigation failed: ' + res.status);
        return res.text();
      })
      .then(function (html) {
        // Parse the fetched HTML
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');

        // Extract content
        var newContent = doc.getElementById(SHELL_ID);
        var newBodyClass = doc.body ? doc.body.className : '';
        var newTitle = doc.title || document.title;

        if (!newContent) {
          // Fallback: no content marker found, do a full navigation
          window.location.href = fullPath;
          return;
        }

        // Use View Transitions API if available
        var updateDOM = function () {
          // Signal that SPA navigation is in progress — old observers must not interfere
          window.__spaNavigating = true;

          // 0. Disconnect old page observers (story-filters.js MutationObserver, etc.)
          if (typeof window.__storyFiltersCleanup === 'function') {
            try { window.__storyFiltersCleanup(); } catch (e) {}
          }

          // 1. Remove old page scripts (CSS stays — no re-execution, avoids FOUC)
          removePageScripts();

          // 2. Swap content — show new page IMMEDIATELY
          var container = document.getElementById(SHELL_ID);
          if (container) {
            container.innerHTML = newContent.innerHTML;
          }

          // 3. Update body class + title
          document.body.className = newBodyClass;
          document.title = newTitle;

          // 4. Update active links + scroll (instant)
          updateActiveLinks(route);
          window.scrollTo(0, 0);

          // 5. Dispatch custom event for page initialization
          document.dispatchEvent(new CustomEvent('spa:navigated', {
            detail: { route: route, page: pageName, path: fullPath }
          }));

          // 6. Reinitialize shared modules that depend on DOM
          reinitSharedModules();

          // 7. Clear SPA navigation flag — content is visible, user can navigate again
          window.__spaNavigating = false;

          // 8. Load page CSS + JS in BACKGROUND (non-blocking)
          removePageCSS();
          var pageCSS = PAGE_CSS[pageName] || [];
          var pageJS = PAGE_JS[pageName] || [];
          pageCSS.forEach(function (name) { loadCSS('/css/' + name + '.css'); });
          pageJS.forEach(function (name) { loadScript('/js/' + name + '.js'); });

          // 9. Also load any CSS from fetched HTML <head> (for Function-served pages)
          doc.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
            var href = link.getAttribute('href');
            if (href && getLoadedHrefs().indexOf(href) === -1) {
              var el = document.createElement('link');
              el.rel = 'stylesheet';
              el.href = href;
              el.setAttribute('data-page-css', '');
              document.head.appendChild(el);
            }
          });
        };

        if (!isInitialLoad && document.startViewTransition && false) {
          document.startViewTransition(updateDOM).finished.then(function() { transitioning = false; }).catch(function() { transitioning = false; });
        } else {
          try { updateDOM(); } catch (e) {}
          transitioning = false;
        }

        isInitialLoad = false;
      })
      .catch(function (err) {
        console.warn('[SPA Router] Fetch failed, falling back to full navigation:', err);
        window.location.href = fullPath;
        transitioning = false;
      });

    // Update browser history
    if (pushState !== false) {
      history.pushState({ route: route, page: pageName }, '', fullPath);
    }
  }

  /** Re-initialize shared modules that need DOM access after content swap */
  function reinitSharedModules() {
    // Re-render auth header
    if (window.AudioHubAuth && typeof window.AudioHubAuth.renderHeader === 'function') {
      window.AudioHubAuth.renderHeader();
    }
    // Re-run auth-state.js renderHeaderAuth if it's a global
    if (typeof renderHeaderAuth === 'function') {
      renderHeaderAuth();
    }
    // Re-sync auth from token
    if (typeof hydrateAuthFromToken === 'function') {
      hydrateAuthFromToken();
    }
    // Re-render account profile
    if (typeof renderAccountProfile === 'function') {
      renderAccountProfile();
    }
    // Re-bind auth forms (login/register) after page swap
    if (typeof window.AudioHubAuthRebind === 'function') {
      window.AudioHubAuthRebind();
    }
    // Re-sync stories (async — don't block navigation)
    if (window.AudioHubStories && typeof window.AudioHubStories.sync === 'function') {
      window.AudioHubStories.sync();
    }
  }

  /* ── Event Listeners ────────────────────────────────────────────────── */

  /** Intercept link clicks */
  document.addEventListener('click', function (event) {
    var anchor = event.target.closest('a');
    if (!anchor) return;
    if (!shouldIntercept(anchor)) return;

    event.preventDefault();
    navigateTo(anchor.href);
  });

  /** Handle browser back/forward */
  window.addEventListener('popstate', function (event) {
    navigateTo(window.location.href, false);
  });

  /** Handle initial page load */
  window.addEventListener('DOMContentLoaded', function () {
    // Mark initial state
    var route = normalizePath(window.location.pathname);
    var pageName = extractPageName(window.location.pathname);
    history.replaceState({ route: route, page: pageName }, '', window.location.href);

    // If standalone page (loaded directly, not via SPA shell), content is already present
    // Just set up link interception — skip the fetch
    if (document.body.getAttribute('data-shell-injected') === '1') {
      isInitialLoad = false;
      hideSpaLoader();
      return;
    }

    // FIX: If we're on root but user was on a subpage (Cloudflare redirect), restore it
    if (pageName === 'index.html' && window.location.pathname === '/') {
      var savedRoute = null;
      try { savedRoute = sessionStorage.getItem('audiohub-last-route'); } catch (e) {}
      if (savedRoute && isKnownRoute(savedRoute) && savedRoute !== 'index.html') {
        // Restore the subpage — update URL and load content
        var savedPageName = extractPageName('/' + savedRoute);
        history.replaceState({ route: savedRoute, page: savedPageName }, '', '/' + savedRoute);
        route = savedRoute;
        pageName = savedPageName;
      }
    }

    // If this is a subpage (not root index.html), load its content into the shell
    if (isKnownRoute(route) && pageName !== 'index.html') {
      var fetchUrl = getRouteUrl(route);
      fetch(fetchUrl, { cache: 'no-store' })
        .then(function (res) {
          if (!res.ok) throw new Error('Failed to load page');
          return res.text();
        })
        .then(function (html) {
          var parser = new DOMParser();
          var doc = parser.parseFromString(html, 'text/html');
          var newContent = doc.getElementById(SHELL_ID);
          if (!newContent) return;

          var container = document.getElementById(SHELL_ID);
          if (container) {
            container.innerHTML = newContent.innerHTML;
          }

          // Update title
          if (doc.title) document.title = doc.title;

          // Update body class
          if (doc.body) document.body.className = doc.body.className;

          // Update active links + reinit immediately
          updateActiveLinks(route);
          reinitSharedModules();
          document.dispatchEvent(new CustomEvent('spa:navigated', {
            detail: { route: route, page: pageName, path: window.location.href }
          }));

          // Load page-specific CSS + JS in BACKGROUND (non-blocking)
          removePageCSS();
          var pageCSS = PAGE_CSS[pageName] || [];
          var pageJS = PAGE_JS[pageName] || [];
          pageCSS.forEach(function (name) { loadCSS('/css/' + name + '.css'); });
          pageJS.forEach(function (name) { loadScript('/js/' + name + '.js'); });

          // Also load any CSS from fetched HTML <head> (for Function-served pages)
          doc.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
            var href = link.getAttribute('href');
            if (href && getLoadedHrefs().indexOf(href) === -1) {
              var el = document.createElement('link');
              el.rel = 'stylesheet';
              el.href = href;
              el.setAttribute('data-page-css', '');
              document.head.appendChild(el);
            }
          });
        })
        .catch(function () {
          // If fetch fails, the shell is already loaded (root content)
        })
        .then(function () {
          isInitialLoad = false;
          transitioning = false;
          hideSpaLoader();
        });
    } else {
      // Root page — just mark existing CSS/JS for cleanup on navigation
      var initialJS = PAGE_JS[pageName] || [];
      document.querySelectorAll('script[src]').forEach(function (s) {
        var src = s.getAttribute('src') || '';
        initialJS.forEach(function (name) {
          if (src.indexOf(name) !== -1) {
            s.setAttribute('data-page-script', '');
          }
        });
      });

      var initialCSS = PAGE_CSS[pageName] || [];
      document.querySelectorAll('link[rel="stylesheet"]').forEach(function (link) {
        var href = link.getAttribute('href') || '';
        initialCSS.forEach(function (name) {
          if (href.indexOf(name + '.css') !== -1) {
            link.setAttribute('data-page-css', '');
          }
        });
      });

      isInitialLoad = false;
      hideSpaLoader();
    }
  });

  /** Prevent duplicate navigation on same URL */
  // (Handled by the transitioning flag)

  /* ── Public API ─────────────────────────────────────────────────────── */
  window.AudioHubRouter = {
    navigate: function (url) {
      navigateTo(url, true);
    },
    replace: function (url) {
      navigateTo(url, false);
    },
    prefetch: function (url) {
      var targetUrl = new URL(url, window.location.origin);
      var route = normalizePath(targetUrl.pathname);
      var pageName = extractPageName(targetUrl.pathname);
      if (isKnownRoute(route)) {
        // Silently prefetch HTML
        fetch(getRouteUrl(route) + (targetUrl.search || ''), { method: 'GET' }).catch(function () {});
        // Preload page-specific CSS + JS in parallel
        var css = PAGE_CSS[pageName] || [];
        var js = PAGE_JS[pageName] || [];
        css.forEach(function (name) { loadCSS('/css/' + name + '.css'); });
        js.forEach(function (name) { loadScript('/js/' + name + '.js'); });
      }
    }
  };

  /* ── Prefetch on hover (optional enhancement) ──────────────────────── */
  var prefetchTimeout = null;
  document.addEventListener('mouseover', function (event) {
    var anchor = event.target.closest('a');
    if (!anchor || !shouldIntercept(anchor)) return;
    // Skip prefetch inside account/playlist sections to avoid flicker
    if (anchor.closest('[data-playlist-detail]') || anchor.closest('[data-story-item]') || anchor.closest('.playlist-entry')) return;
    if (prefetchTimeout) clearTimeout(prefetchTimeout);
    prefetchTimeout = setTimeout(function () {
      window.AudioHubRouter.prefetch(anchor.href);
    }, 200);
  });

  document.addEventListener('mouseout', function () {
    if (prefetchTimeout) {
      clearTimeout(prefetchTimeout);
      prefetchTimeout = null;
    }
  });

})();
