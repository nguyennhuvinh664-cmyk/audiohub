/**
 * AudioHub Shell — persistent UI initialization
 * Handles hamburger menu, mobile drawer, and global keyboard shortcuts.
 * Safe to call multiple times (idempotent — skips if already bound).
 */
(function () {
  'use strict';

  var _bound = false;

  function init() {
    if (_bound) return;
    _bound = true;

    /* ── Desktop hamburger ──────────────────────────────── */
    var ham  = document.getElementById('hamburger');
    var nav  = document.getElementById('nav');
    var ov   = document.getElementById('navOv');
    var cls  = document.getElementById('navClose');

    function openNav() {
      if (!nav) return;
      nav.classList.add('open');
      if (ov) ov.classList.add('show');
      document.body.style.overflow = 'hidden';
      if (ham) ham.setAttribute('aria-expanded', 'true');
    }
    function closeNav() {
      if (!nav) return;
      nav.classList.remove('open');
      if (ov) ov.classList.remove('show');
      document.body.style.overflow = '';
      if (ham) ham.setAttribute('aria-expanded', 'false');
    }

    if (ham)  ham.addEventListener('click', function () {
      nav && nav.classList.contains('open') ? closeNav() : openNav();
    });
    if (ov)   ov.addEventListener('click', closeNav);
    if (cls)  cls.addEventListener('click', closeNav);
    if (nav) {
      nav.querySelectorAll('.nav__link').forEach(function (l) {
        l.addEventListener('click', closeNav);
      });
    }

    /* ── Mobile drawer ──────────────────────────────────── */
    var mH = document.getElementById('mHamburger');
    var mD = document.getElementById('mDrawer');
    var mO = document.getElementById('mDrawerOverlay');

    function openDrawer() {
      if (!mD) return;
      mD.classList.add('is-open');
      if (mO) mO.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }
    function closeDrawer() {
      if (!mD) return;
      mD.classList.remove('is-open');
      if (mO) mO.classList.remove('is-open');
      document.body.style.overflow = '';
    }

    if (mH) mH.addEventListener('click', openDrawer);
    if (mO) mO.addEventListener('click', closeDrawer);
    if (mD) {
      mD.querySelectorAll('.m-drawer__link').forEach(function (link) {
        link.addEventListener('click', closeDrawer);
      });
    }

    /* ── Global keyboard shortcuts ──────────────────────── */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeNav();
        closeDrawer();
      }
    });
  }

  /* Run immediately if DOM is ready, otherwise wait */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  /* Expose for SPA router to re-init after page swap */
  window.AudioHubShell = { init: init };
})();
