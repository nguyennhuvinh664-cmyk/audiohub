const { chromium } = require('playwright');

(async () => {
  const base = 'http://127.0.0.1:5500/html';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${base}/new-posts.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  const result = await page.evaluate(() => {
    // Force local-only mode for deterministic runtime verify
    localStorage.removeItem('audiohub-auth-token');
    localStorage.removeItem('audiohub-api-base');

    const storiesKey = 'audiohub-stories';
    const playlistsKey = 'audiohub-playlists-v1';
    const now = Date.now();

    const stories = [];
    for (let i = 1; i <= 30; i++) {
      stories.push({
        id: `bulk_${i}`,
        title: `Truyen Demo ${i}`,
        author: i % 2 ? 'Tac Gia A' : 'Tac Gia B',
        genre: i % 3 === 0 ? 'Ngôn Tình' : (i % 3 === 1 ? 'Cổ Đại' : 'Trọng Sinh'),
        description: `Noi dung #demo${i}`,
        readingText: '',
        chapterTitle: 'Chương 1',
        status: '',
        isCompleted: false,
        visibility: i % 9 === 0 ? 'Không công khai' : 'Công khai',
        audioStatus: 'Sẵn sàng',
        coverKey: '',
        audioKey: '',
        createdAt: new Date(now - i * 60000).toISOString(),
        updatedAt: new Date(now - i * 60000).toISOString(),
        listenCount2d: 100 - i,
        listenCount7d: 300 - i,
        listenCount: 700 - i
      });
    }

    const completedPlaylist = {
      id: 'pl_completed_1',
      name: 'Playlist Hoan Thanh Demo',
      status: 'Đã hoàn thành',
      createdAt: new Date(now - 5000).toISOString(),
      updatedAt: new Date(now - 1000).toISOString(),
      items: [
        { id: 'pli_1', storyId: 'bulk_2', storyTitle: 'Truyen Demo 2', storyAuthor: 'Tac Gia B', chapterLabel: 'Chương 1', chapterIndex: 0 },
        { id: 'pli_2', storyId: 'bulk_3', storyTitle: 'Truyen Demo 3', storyAuthor: 'Tac Gia A', chapterLabel: 'Chương 2', chapterIndex: 1 }
      ]
    };

    localStorage.setItem(storiesKey, JSON.stringify(stories));
    localStorage.setItem(playlistsKey, JSON.stringify([completedPlaylist]));

    return {
      stories: stories.length,
      publicStories: stories.filter(s => s.visibility === 'Công khai').length,
      playlists: 1,
      token: localStorage.getItem('audiohub-auth-token'),
      apiBase: localStorage.getItem('audiohub-api-base')
    };
  });

  await browser.close();
  console.log(JSON.stringify(result, null, 2));
})();
