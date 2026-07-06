/**
 * User Account - Mobile Menu Tabs
 * Handles tab switching in the mobile account view
 */
(function () {
  function initMobileTabs() {
    var menuItems = document.querySelectorAll('.m-menu-item');
    var panels = document.querySelectorAll('.m-content-section');

    if (!menuItems.length || !panels.length) return;

    function switchTab(tab) {
      menuItems.forEach(function (item) {
        item.classList.toggle('is-active', item.getAttribute('data-m-tab') === tab);
      });
      panels.forEach(function (panel) {
        var isActive = panel.getAttribute('data-m-panel') === tab;
        panel.classList.toggle('is-active', isActive);
        panel.hidden = !isActive;
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    menuItems.forEach(function (item) {
      item.addEventListener('click', function () {
        switchTab(item.getAttribute('data-m-tab'));
      });
    });
  }

  // Run on initial load
  initMobileTabs();

  // Re-run after SPA navigation
  window.addEventListener('audiohub:navigated', initMobileTabs);
  if (window.AudioHubRouter && typeof window.AudioHubRouter.on === 'function') {
    window.AudioHubRouter.on('navigate', initMobileTabs);
  }
})();
