/**
 * categories.js
 * Handles genre card clicks and story counts on the categories page.
 * Loaded by SPA router on categories.html navigation.
 */
(function () {
  'use strict';

  function normalize(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function updateCategoryCounts(cards) {
    if (!window.AudioHubStories || typeof window.AudioHubStories.read !== 'function') return;
    var stories = window.AudioHubStories.read() || [];
    var countMap = {};

    stories.forEach(function (story) {
      var key = normalize(story && story.genre);
      if (!key) return;
      countMap[key] = (countMap[key] || 0) + 1;
    });

    cards.forEach(function (card) {
      var genre = String(card.getAttribute('data-genre') || '').trim();
      var countNode = card.querySelector('[data-genre-count]');
      if (!countNode) return;
      var count = countMap[normalize(genre)] || 0;
      countNode.textContent = count + ' truyện';
    });
  }

  function goToGenre(genre) {
    var clean = String(genre || '').trim();
    if (!clean) return;
    window.location.href = 'new-posts.html?genre=' + encodeURIComponent(clean) + '&page=1';
  }

  function init() {
    var cards = Array.prototype.slice.call(document.querySelectorAll('.cat-card'));
    if (!cards.length) return;

    cards.forEach(function (card) {
      card.addEventListener('click', function () {
        goToGenre(card.getAttribute('data-genre'));
      });
      card.addEventListener('keydown', function (event) {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        goToGenre(card.getAttribute('data-genre'));
      });
    });

    updateCategoryCounts(cards);

    if (window.AudioHubStories && typeof window.AudioHubStories.sync === 'function') {
      window.AudioHubStories.sync().then(function () {
        updateCategoryCounts(cards);
      }).catch(function () {});
    }

    window.addEventListener('audiohub:stories-updated', function () {
      updateCategoryCounts(cards);
    });
  }

  // Run immediately (script is loaded by SPA router after DOM is ready)
  init();
})();
