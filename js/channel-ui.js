(function() {
  'use strict';

  // Get author name from URL parameter
  const urlParams = new URLSearchParams(window.location.search);
  const authorName = urlParams.get('author');

  if (!authorName) {
    console.error('No author parameter found');
    return;
  }

  // Load stories from localStorage
  let allStories = [];
  try {
    const stored = localStorage.getItem('audiohub-stories');
    allStories = stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('Error loading stories:', e);
    allStories = [];
  }

  // Filter stories by author
  const authorStories = allStories.filter(story =>
    story.author && story.author.toLowerCase() === authorName.toLowerCase()
  );

  // Update channel info
  const channelName = document.querySelector('[data-channel-name]');
  if (channelName) channelName.textContent = authorName;

  const channelStats = document.querySelector('[data-channel-stats]');
  if (channelStats) {
    const subscriberCount = authorStories.reduce((sum, s) => sum + (s.subscribers || 0), 0);
    channelStats.textContent = `${subscriberCount} người đăng ký · ${authorStories.length} truyện`;
  }

  const channelDesc = document.querySelector('[data-channel-desc]');
  if (channelDesc) {
    channelDesc.textContent = authorStories[0]?.authorDesc || 'Tác giả truyện audio trên AudioHub.';
  }

  const channelInitials = document.querySelector('[data-channel-initials]');
  if (channelInitials) {
    const words = authorName.split(' ');
    const initials = words.map(w => w[0]).join('').toUpperCase().slice(0, 2);
    channelInitials.textContent = initials;
  }

  // Render featured audio (first story)
  const featured = document.querySelector('[data-featured]');
  if (featured && authorStories.length > 0) {
    const first = authorStories[0];
    const featuredTitle = featured.querySelector('[data-featured-title]');
    const featuredMeta = featured.querySelector('[data-featured-meta]');
    const featuredDesc = featured.querySelector('[data-featured-desc]');
    const featuredThumb = featured.querySelector('.audio-thumb span');

    if (featuredTitle) featuredTitle.textContent = first.title;
    if (featuredMeta) featuredMeta.textContent = `${first.views || 0} lượt nghe · ${first.date || 'Gần đây'}`;
    if (featuredDesc) featuredDesc.textContent = first.description || '';
    if (featuredThumb) {
      const initials = (first.title || 'TH').substring(0, 2).toUpperCase();
      featuredThumb.textContent = initials;
    }
  }

  // Render audios grid (home tab)
  const audiosGrid = document.querySelector('[data-audios-grid]');
  if (audiosGrid) {
    if (authorStories.length === 0) {
      audiosGrid.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-book"></i>
          <p>Tác giả chưa có truyện nào</p>
        </div>
      `;
    } else {
      const gridHtml = authorStories.map(story => {
        const initials = (story.title || 'TH').substring(0, 2).toUpperCase();
        return `
          <a href="story-detail.html?id=${story.id}" class="audio-card">
            <div class="card-thumb">
              <span>${initials}</span>
              ${story.duration ? `<div class="duration">${story.duration}</div>` : ''}
            </div>
            <div class="card-info">
              <h4>${story.title}</h4>
              <p class="card-meta">${story.views || 0} lượt nghe · ${story.date || 'Gần đây'}</p>
            </div>
          </a>
        `;
      }).join('');
      audiosGrid.innerHTML = gridHtml;
    }
  }

  // Render audios list (audios tab)
  const audiosList = document.querySelector('[data-audios-list]');
  function renderAudiosList(stories, container) {
    if (stories.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-book"></i>
          <p>Tác giả chưa có truyện nào</p>
        </div>
      `;
    } else {
      const listHtml = stories.map(story => {
        const initials = (story.title || 'TH').substring(0, 2).toUpperCase();
        return `
          <a href="story-detail.html?id=${story.id}" class="audio-row">
            <div class="row-thumb">
              <span>${initials}</span>
              ${story.duration ? `<div class="duration">${story.duration}</div>` : ''}
            </div>
            <div class="row-info">
              <h4>${story.title}</h4>
              <p class="row-meta">${story.views || 0} lượt nghe · ${story.date || 'Gần đây'}</p>
              <p class="row-desc">${story.description || ''}</p>
            </div>
          </a>
        `;
      }).join('');
      container.innerHTML = listHtml;
    }
  }

  if (audiosList) {
    renderAudiosList(authorStories, audiosList);
  }

  // Tab switching
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-tab');

      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const content = document.querySelector(`[data-tab-content="${tab}"]`);
      if (content) content.classList.add('active');
    });
  });

  // Sort functionality
  const sortBtns = document.querySelectorAll('.sort-btn');
  sortBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sortBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const sortType = btn.textContent.toLowerCase();
      let sorted = [...authorStories];

      if (sortType === 'phổ biến') {
        sorted.sort((a, b) => (b.views || 0) - (a.views || 0));
      } else if (sortType === 'cũ nhất') {
        sorted.reverse();
      }

      if (audiosList) {
        renderAudiosList(sorted, audiosList);
      }
    });
  });

  // Update about section
  const aboutDesc = document.querySelector('[data-about-desc]');
  const aboutJoined = document.querySelector('[data-about-joined]');
  const aboutViews = document.querySelector('[data-about-views]');

  if (aboutDesc && authorStories.length > 0) {
    aboutDesc.textContent = authorStories[0].authorDesc || 'Tác giả truyện audio trên AudioHub.';
  }

  if (aboutJoined && authorStories.length > 0) {
    const oldestStory = [...authorStories].sort((a, b) =>
      new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
    )[0];
    if (oldestStory.createdAt) {
      const date = new Date(oldestStory.createdAt);
      aboutJoined.textContent = date.toLocaleDateString('vi-VN');
    }
  }

  if (aboutViews) {
    const totalViews = authorStories.reduce((sum, s) => sum + (s.views || 0), 0);
    aboutViews.textContent = totalViews.toLocaleString();
  }
})();
