(function () {
  var root = document.querySelector('[data-drafts-root]');
  var emptyNode = document.querySelector('[data-drafts-empty]');
  var summaryNode = document.querySelector('[data-drafts-summary]');

  if (!root) return;
  if (!window.AudioHubStories || typeof window.AudioHubStories.read !== 'function') return;

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function normalizeVisibility(value) {
    return String(value || '').trim().toLowerCase();
  }

  function isDraft(story) {
    var visibility = normalizeVisibility(story && story.visibility);
    return !visibility || visibility === 'riêng tư' || visibility === 'không công khai' || visibility === 'private' || visibility === 'draft';
  }

  function timeLabel(value) {
    var time = Date.parse(String(value || ''));
    if (isNaN(time)) return 'Vừa tạo';
    return new Date(time).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  }

  function storyHref(story) {
    return '/story-detail?id=' + encodeURIComponent(String(story.id || ''));
  }

  function badgeLabel(story) {
    var visibility = String(story && story.visibility || '').trim();
    if (!visibility) return 'Nháp';
    return visibility;
  }

  function buildCard(story) {
    var title = escapeHtml(story.title || 'Truyện mới');
    var author = escapeHtml(story.author || 'Tác giả');
    var genre = escapeHtml(story.genre || 'Truyện audio');
    var description = escapeHtml(story.description || 'Chưa có mô tả cho bản nháp này.');
    var updatedAt = timeLabel(story.updatedAt || story.createdAt);

    return ''
      + '<article class="draft-card">'
      + '<a class="draft-card__thumb" href="' + storyHref(story) + '" aria-label="Mở ' + title + '">'
      + '<span class="draft-card__badge">' + escapeHtml(badgeLabel(story)) + '</span>'
      + '</a>'
      + '<div class="draft-card__body">'
      + '<div class="draft-card__meta"><span>' + genre + '</span><span><i class="fa-regular fa-clock"></i> ' + escapeHtml(updatedAt) + '</span></div>'
      + '<h2 class="draft-card__title">' + title + '</h2>'
      + '<p class="draft-card__desc">' + description + '</p>'
      + '<div class="draft-inline">'
      + '<span class="draft-chip"><i class="fa-regular fa-user"></i> ' + author + '</span>'
      + '<span class="draft-chip"><i class="fa-solid fa-headphones"></i> ' + escapeHtml(String(story.audioKey ? 'Có audio' : 'Chưa có audio')) + '</span>'
      + '</div>'
      + '<div class="draft-card__actions">'
      + '<a class="btn btn--outline" href="' + storyHref(story) + '">Mở nháp</a>'
      + '<a class="btn btn--primary" href="upload-story.html?id=' + encodeURIComponent(String(story.id || '')) + '">Sửa tiếp</a>'
      + '</div>'
      + '</div>'
      + '</article>';
  }

  function render() {
    var stories = window.AudioHubStories.read() || [];
    var drafts = stories.filter(isDraft);
    drafts = drafts.sort(function (a, b) {
      var ta = Date.parse(String(b.updatedAt || b.createdAt || '')) || 0;
      var tb = Date.parse(String(a.updatedAt || a.createdAt || '')) || 0;
      return ta - tb;
    });

    if (summaryNode) {
      summaryNode.textContent = drafts.length
        ? ('Bạn đang có ' + drafts.length + ' bản nháp.')
        : 'Chưa có bản nháp nào.';
    }

    if (!drafts.length) {
      root.innerHTML = '';
      if (emptyNode) emptyNode.classList.remove('is-hidden');
      return;
    }

    if (emptyNode) emptyNode.classList.add('is-hidden');
    root.innerHTML = drafts.map(buildCard).join('');
  }

  render();
  window.addEventListener('audiohub:stories-updated', render);
  if (typeof window.AudioHubStories.sync === 'function') {
    window.AudioHubStories.sync();
  }
})();