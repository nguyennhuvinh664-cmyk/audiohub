/**
 * shell-inject.js
 * Injects SPA shell elements (mobile header, desktop header, drawer, bottom nav)
 * into standalone subpages loaded directly (not via SPA router).
 * Skipped automatically when the SPA shell is already present.
 */
(function () {
  'use strict';

  // If SPA shell is already present, do nothing
  if (document.querySelector('.m-bottomnav')) return;

  // Page is hidden by inline <style>html{opacity:0!important}</style> in <head>
  // We'll remove it after CSS loads (see showPage below)

  // Load required CSS
  var cssFiles = ['style-index', 'mobile-shared', 'header-enhancements', 'auth-state', 'mobile-app'];
  var loadedHrefs = [];
  document.querySelectorAll('link[rel="stylesheet"]').forEach(function (l) {
    loadedHrefs.push(l.getAttribute('href') || '');
  });
  cssFiles.forEach(function (name) {
    var href = '/css/' + name + '.css';
    if (loadedHrefs.some(function (h) { return h.indexOf(name) !== -1; })) return;
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = href;
    document.head.appendChild(link);
  });

  // Load Google Fonts if not present
  if (!document.querySelector('link[href*="fonts.googleapis.com"]')) {
    var gf1 = document.createElement('link');
    gf1.rel = 'preconnect';
    gf1.href = 'https://fonts.googleapis.com';
    document.head.appendChild(gf1);
    var gf2 = document.createElement('link');
    gf2.rel = 'preconnect';
    gf2.href = 'https://fonts.gstatic.com';
    gf2.crossOrigin = 'anonymous';
    document.head.appendChild(gf2);
    var gfLink = document.createElement('link');
    gfLink.rel = 'stylesheet';
    gfLink.href = 'https://fonts.googleapis.com/css2?family=Baloo+2:wght@600;700;800&family=Nunito:wght@400;600;700&display=swap';
    document.head.appendChild(gfLink);
  }

  // Determine link prefix (subpages are in /html/)
  var isSubpage = window.location.pathname.indexOf('/html/') === 0;
  var p = isSubpage ? '../' : '';

  // ── Desktop header ──
  var desktopHeader = document.createElement('header');
  desktopHeader.className = 'header';
  desktopHeader.innerHTML =
    '<div class="container header__in">'
    + '<a href="' + p + 'index.html" class="logo"><i class="fa-solid fa-headphones"></i><span>Audio<em>HuB</em></span></a>'
    + '<nav class="nav" id="nav">'
    + '<button class="nav__close" id="navClose"><i class="fa-solid fa-xmark"></i></button>'
    + '<a href="' + p + 'index.html" class="nav__link"><i class="fa-solid fa-house"></i><span>Trang Chủ</span></a>'
    + '<div class="nav__dropdown">'
    + '<a href="' + p + 'categories.html" class="nav__link"><i class="fa-solid fa-layer-group"></i><span>Thể Loại</span></a>'
    + '<ul class="nav__submenu">'
    + '<li><a href="' + p + 'categories.html">Cổ Đại</a></li>'
    + '<li><a href="' + p + 'categories.html">Cổ Tích</a></li>'
    + '<li><a href="' + p + 'categories.html">Đam Mỹ</a></li>'
    + '<li><a href="' + p + 'categories.html">Dị Năng</a></li>'
    + '<li><a href="' + p + 'categories.html">Fanfic</a></li>'
    + '<li><a href="' + p + 'categories.html">Hệ Thống</a></li>'
    + '<li><a href="' + p + 'categories.html">Hiện Đại</a></li>'
    + '<li><a href="' + p + 'categories.html">Hoàng Đế</a></li>'
    + '<li class="nav__submenu__all"><a href="' + p + 'categories.html">Xem tất cả thể loại <i class="fa-solid fa-chevron-right"></i></a></li>'
    + '</ul>'
    + '</div>'
    + '<a href="' + p + 'trending.html" class="nav__link"><i class="fa-solid fa-fire"></i><span>Truyện Hot</span></a>'
    + '<a href="' + p + 'completed.html" class="nav__link"><i class="fa-solid fa-circle-check"></i><span>Hoàn Thành</span></a>'
    + '<a href="' + p + 'hall-of-fame.html" class="nav__link"><i class="fa-solid fa-trophy"></i><span>Vinh Danh</span></a>'
    + '<div class="nav__mbtns" data-auth-container data-auth-variant="mobile">'
    + '<a href="' + p + 'login.html" class="btn btn--outline btn--blk">Đăng Nhập</a>'
    + '<a href="' + p + 'register.html" class="btn btn--primary btn--blk"><i class="fa-solid fa-user-plus"></i> Đăng Ký</a>'
    + '</div>'
    + '</nav>'
    + '<div class="header__acts" data-auth-container data-auth-variant="home">'
    + '<a href="' + p + 'login.html" class="btn btn--outline"><i class="fa-regular fa-user"></i> Đăng Nhập</a>'
    + '<a href="' + p + 'register.html" class="btn btn--primary"><i class="fa-solid fa-user-plus"></i> Đăng Ký</a>'
    + '</div>'
    + '<button class="hamburger" id="hamburger" aria-label="Menu" aria-expanded="false"><i class="fa-solid fa-bars"></i></button>'
    + '</div>';

  // Desktop nav overlay
  var navOv = document.createElement('div');
  navOv.className = 'nav-ov';
  navOv.id = 'navOv';

  // ── Mobile header ──
  var header = document.createElement('header');
  header.className = 'm-header';
  header.innerHTML =
    '<div class="m-header__left">'
    + '<a href="' + p + 'index.html" class="m-header__logo">'
    + '<i class="fa-solid fa-headphones"></i><span>Audio<em>HuB</em></span></a>'
    + '</div>'
    + '<div class="m-header__right">'
    + '<button class="m-header__notif" aria-label="Thông báo">'
    + '<i class="fa-solid fa-bell"></i><span class="m-badge"></span></button>'
    + '</div>';

  // ── Mobile drawer ──
  var drawerOverlay = document.createElement('div');
  drawerOverlay.className = 'm-drawer-overlay';
  drawerOverlay.id = 'mDrawerOverlay';

  var drawer = document.createElement('nav');
  drawer.className = 'm-drawer';
  drawer.id = 'mDrawer';
  drawer.innerHTML =
    '<div class="m-drawer__header">'
    + '<div class="m-drawer__brand"><i class="fa-solid fa-headphones"></i><span>Audio<em>HuB</em></span></div>'
    + '<div class="m-drawer__tagline">Nghe truyện hay mỗi ngày</div>'
    + '</div>'
    + '<div class="m-drawer__section">'
    + '<div class="m-drawer__label">Điều hướng</div>'
    + '<a href="' + p + 'index.html" class="m-drawer__link"><i class="fa-solid fa-house"></i> Trang chủ</a>'
    + '<a href="' + p + 'categories.html" class="m-drawer__link"><i class="fa-solid fa-layer-group"></i> Thể loại</a>'
    + '<a href="' + p + 'new-posts.html" class="m-drawer__link"><i class="fa-solid fa-clock-rotate-left"></i> Mới đăng</a>'
    + '<a href="' + p + 'hall-of-fame.html" class="m-drawer__link"><i class="fa-solid fa-trophy"></i> Vinh danh</a>'
    + '</div>'
    + '<div class="m-drawer__divider"></div>'
    + '<div class="m-drawer__section">'
    + '<div class="m-drawer__label">Cá nhân</div>'
    + '<a href="' + p + 'account.html#history" class="m-drawer__link"><i class="fa-solid fa-clock-rotate-left"></i> Lịch sử nghe</a>'
    + '<a href="' + p + 'account.html#favorites" class="m-drawer__link"><i class="fa-solid fa-heart"></i> Yêu thích</a>'
    + '<a href="' + p + 'account.html#playlists" class="m-drawer__link"><i class="fa-solid fa-list"></i> Playlist</a>'
    + '<a href="' + p + 'account.html#unlocked" class="m-drawer__link"><i class="fa-solid fa-lock-open"></i> Chương đã mở khóa</a>'
    + '</div>'
    + '<div class="m-drawer__divider"></div>'
    + '<div class="m-drawer__logout">'
    + '<button class="m-drawer__logout-btn"><i class="fa-solid fa-right-from-bracket"></i> Đăng xuất</button>'
    + '</div>';

  // ── Mobile bottom nav ──
  var bottomNav = document.createElement('nav');
  bottomNav.className = 'm-bottomnav';
  bottomNav.setAttribute('aria-label', 'Điều hướng di động');
  bottomNav.innerHTML =
    '<a href="' + p + 'index.html" class="m-bottomnav__item"><i class="fa-solid fa-house"></i><span>Trang chủ</span></a>'
    + '<a href="' + p + 'categories.html" class="m-bottomnav__item"><i class="fa-solid fa-layer-group"></i><span>Thể loại</span></a>'
    + '<a href="' + p + 'new-posts.html" class="m-bottomnav__item"><i class="fa-solid fa-fire"></i><span>Mới</span></a>'
    + '<a href="' + p + 'hall-of-fame.html" class="m-bottomnav__item"><i class="fa-solid fa-trophy"></i><span>Vinh danh</span></a>'
    + '<a href="' + p + 'account.html" class="m-bottomnav__item"><i class="fa-solid fa-user"></i><span>Tài khoản</span></a>';

  // ── Insert all elements ──
  // Mobile: bottom nav → header → drawer
  document.body.insertBefore(bottomNav, document.body.firstChild);
  document.body.insertBefore(header, document.body.firstChild);
  document.body.insertBefore(drawer, document.body.firstChild);
  document.body.insertBefore(drawerOverlay, document.body.firstChild);
  // Desktop: header + nav overlay
  document.body.insertBefore(desktopHeader, document.body.firstChild);
  document.body.insertBefore(navOv, document.body.firstChild);

  // ── Desktop hamburger toggle ──
  var hamburger = desktopHeader.querySelector('#hamburger');
  var navEl = desktopHeader.querySelector('#nav');
  var navClose = desktopHeader.querySelector('#navClose');
  if (hamburger && navEl) {
    hamburger.addEventListener('click', function () {
      navEl.classList.add('is-open');
      navOv.classList.add('is-open');
    });
  }
  if (navClose && navEl) {
    navClose.addEventListener('click', function () {
      navEl.classList.remove('is-open');
      navOv.classList.remove('is-open');
    });
  }
  if (navOv) {
    navOv.addEventListener('click', function () {
      navEl && navEl.classList.remove('is-open');
      navOv.classList.remove('is-open');
    });
  }

  // Mark body so other scripts know shell is present
  document.body.setAttribute('data-shell-injected', '1');

  // ── Set active nav link based on current URL ──
  var currentPath = window.location.pathname;
  // Extract just the filename: "/trending.html" → "trending.html", "/html/trending.html" → "trending.html"
  var currentPage = currentPath.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav__link, .m-bottomnav__item, .m-drawer__link').forEach(function (link) {
    var href = link.getAttribute('href') || '';
    // Extract filename from href: "../trending.html" → "trending.html"
    var linkPage = href.split('/').pop().split('?')[0].split('#')[0];
    if (linkPage && linkPage === currentPage) {
      link.classList.add('active');
    }
  });

  // Load Font Awesome if not present
  if (!document.querySelector('link[href*="font-awesome"]')) {
    var fa = document.createElement('link');
    fa.rel = 'stylesheet';
    fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css';
    document.head.appendChild(fa);
  }

  // Load SPA router so navigation between standalone pages is smooth (SPA)
  if (!document.querySelector('script[src*="spa-router"]')) {
    var routerScript = document.createElement('script');
    routerScript.src = p + 'js/spa-router.js?v=20260804-1';
    document.body.appendChild(routerScript);
  }

  // Show page after CSS loads — remove the inline FOUC-hiding <style>
  var _pageShown = false;
  function showPage() {
    if (_pageShown) return;
    _pageShown = true;
    // Remove the inline <style>html{opacity:0!important}</style> from <head>
    var s = document.querySelector('style');
    if (s && s.textContent.indexOf('opacity:0') !== -1) s.remove();
    document.documentElement.style.opacity = '';
  }
  // Wait for the main CSS file to load, then show
  var mainCSS = document.querySelector('link[href*="style-index"]');
  if (mainCSS) {
    if (mainCSS.sheet) { showPage(); }
    else { mainCSS.addEventListener('load', showPage); mainCSS.addEventListener('error', showPage); }
  }
  // Fallback: show after 800ms no matter what
  setTimeout(showPage, 800);

})();
