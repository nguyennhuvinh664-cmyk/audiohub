/**
 * shell-inject.js
 * Injects SPA shell elements (header, drawer, bottom nav, desktop header)
 * into standalone subpages loaded directly (not via SPA router).
 * Skipped automatically when the SPA shell is already present.
 */
(function () {
  'use strict';

  // If SPA shell is already present, do nothing
  if (document.querySelector('.m-bottomnav')) return;

  // Load required CSS
  var cssFiles = ['mobile-shared', 'header-enhancements', 'auth-state', 'mobile-app'];
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

  // Determine link prefix (subpages are in /html/)
  var isSubpage = window.location.pathname.indexOf('/html/') === 0;
  var p = isSubpage ? '../' : '';

  // Mobile header
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

  // Bottom nav
  var nav = document.createElement('nav');
  nav.className = 'm-bottomnav';
  nav.setAttribute('aria-label', 'Điều hướng di động');
  nav.innerHTML =
    '<a href="' + p + 'index.html" class="m-bottomnav__item"><i class="fa-solid fa-house"></i><span>Trang chủ</span></a>'
    + '<a href="' + p + 'categories.html" class="m-bottomnav__item"><i class="fa-solid fa-layer-group"></i><span>Thể loại</span></a>'
    + '<a href="' + p + 'new-posts.html" class="m-bottomnav__item"><i class="fa-solid fa-fire"></i><span>Mới</span></a>'
    + '<a href="' + p + 'hall-of-fame.html" class="m-bottomnav__item"><i class="fa-solid fa-trophy"></i><span>Vinh danh</span></a>'
    + '<a href="' + p + 'account.html" class="m-bottomnav__item"><i class="fa-solid fa-user"></i><span>Tài khoản</span></a>';

  // Insert at start of body
  document.body.insertBefore(nav, document.body.firstChild);
  document.body.insertBefore(header, document.body.firstChild);

  // Mark body so redirect script knows shell is present
  document.body.setAttribute('data-shell-injected', '1');

  // Load Font Awesome if not present
  if (!document.querySelector('link[href*="font-awesome"]')) {
    var fa = document.createElement('link');
    fa.rel = 'stylesheet';
    fa.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css';
    document.head.appendChild(fa);
  }
})();
