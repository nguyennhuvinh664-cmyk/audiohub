const { chromium } = require('playwright');

(async () => {
  const base = 'http://127.0.0.1:5500/html';
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  await page.goto(`${base}/account.html`, { waitUntil: 'domcontentloaded', timeout: 60000 });

  // Seed minimal demo stories (public + private) if none exist.
  await page.evaluate(() => {
    const key = 'audiohub-stories';
    let raw = localStorage.getItem(key);
    let stories = [];
    try { stories = raw ? JSON.parse(raw) : []; } catch (e) { stories = []; }
    if (Array.isArray(stories) && stories.length >= 15) return { seeded: false, count: stories.length };

    const now = Date.now();
    const mk = (i, visibility) => ({
      id: `seed_${i}`,
      title: `Seed Story ${i}`,
      author: i % 2 ? 'AudioHub' : 'Demo Author',
      genre: i % 3 === 0 ? 'Tình cảm' : (i % 3 === 1 ? 'Kinh dị' : 'Phiêu lưu'),
      description: `Seed description ${i}`,
      readingText: '',
      chapterTitle: 'Chương 1',
      status: '',
      isCompleted: false,
      visibility: visibility,
      audioStatus: 'Sẵn sàng',
      coverKey: '',
      audioKey: '',
      createdAt: new Date(now - i * 3600_000).toISOString(),
      updatedAt: new Date(now - i * 3600_000).toISOString(),
      listenCount2d: Math.max(0, 60 - i),
      listenCount7d: Math.max(0, 200 - i * 2),
      listenCount: Math.max(0, 500 - i * 3)
    });

    const seeded = [];
    for (let i = 1; i <= 18; i++) {
      const visibility = i % 7 === 0 ? 'Không công khai' : 'Công khai';
      seeded.push(mk(i, visibility));
    }
    localStorage.setItem(key, JSON.stringify(seeded));
    return { seeded: true, count: seeded.length };
  });

  // Trigger store sync event if present
  await page.evaluate(() => {
    try { window.dispatchEvent(new Event('audiohub:stories-updated')); } catch (e) {}
  });

  const result = await page.evaluate(() => {
    let c = 0;
    try {
      const raw = localStorage.getItem('audiohub-stories');
      const parsed = raw ? JSON.parse(raw) : [];
      c = Array.isArray(parsed) ? parsed.length : 0;
    } catch (e) {}
    return { count: c };
  });

  await browser.close();
  console.log(JSON.stringify(result));
})();
