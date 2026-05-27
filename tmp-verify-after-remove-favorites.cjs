const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const outDir = path.join(process.cwd(), 'tmp-verify-artifacts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  const base = 'http://127.0.0.1:5500/html';

  // seed
  await page.goto(base + '/new-posts.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const now = Date.now();
    const stories = [];
    for (let i = 1; i <= 26; i++) {
      stories.push({
        id: 'seed_' + i,
        title: 'Story Seed ' + i,
        author: i % 2 ? 'Author A' : 'Author B',
        genre: i % 3 ? 'Tiên Hiệp' : 'Kiếm Hiệp',
        description: i % 4 === 0 ? '#kiem-hiep content' : 'content',
        hashtags: i % 4 === 0 ? ['kiem-hiep'] : ['thuong'],
        chapterTitle: 'Chương ' + i,
        visibility: 'Công khai',
        status: i % 5 === 0 ? 'Hoàn thành' : 'Đang cập nhật',
        isCompleted: i % 5 === 0,
        coverKey: '',
        listenHistory: [],
        listenCount: 0,
        listenCount2d: 0,
        listenCount7d: 0,
        createdAt: new Date(now - i * 1000).toISOString(),
        updatedAt: new Date(now - i * 1000).toISOString()
      });
    }
    localStorage.setItem('audiohub-stories', JSON.stringify(stories));
    localStorage.setItem('audiohub-library', JSON.stringify({ favorites: [], following: [], history: [{ key:'story::seed_8', title:'Story Seed 8', author:'Author B', genre:'Kiếm Hiệp', progress:'Đang dừng ở Chương 1', note:'test', href:'story-detail.html?id=seed_8', coverKey:'', savedAt:new Date().toISOString() }] }));
    localStorage.removeItem('audiohub-demo-auth');
    localStorage.removeItem('audiohub-playlists-v1');
  });

  const result = {};

  await page.goto(base + '/new-posts.html', { waitUntil: 'networkidle' });
  const visible = await page.$$eval('[data-story-filter-root] .story-card:not(.is-hidden)', els => els.length);
  await page.locator('[data-filter-title]').fill('Seed 1');
  await page.locator('[data-filter-title]').press('Enter');
  await page.waitForTimeout(200);
  const urlEnter = page.url();
  await page.locator('[data-filter-reset]').click();
  await page.waitForTimeout(200);
  const urlReset = page.url();
  result.listing = { visible, urlEnter, urlReset };

  await page.goto(base + '/new-posts.html?page=2', { waitUntil: 'networkidle' });
  const nonMemberFirst = await page.locator('[data-story-filter-root] .story-card:not(.is-hidden)').first().getAttribute('data-story-id');
  await page.evaluate(() => localStorage.setItem('audiohub-demo-auth', JSON.stringify({ isLoggedIn:true, name:'M', email:'m@m.com', initials:'M', tier:'T' })));
  await page.goto(base + '/new-posts.html?page=2', { waitUntil: 'networkidle' });
  const memberFirst = await page.locator('[data-story-filter-root] .story-card:not(.is-hidden)').first().getAttribute('data-story-id');
  result.authGate = { nonMemberFirst, memberFirst };

  await page.goto(base + '/account.html', { waitUntil: 'networkidle' });
  const hasFavoritesSection = await page.locator('text=Tủ truyện yêu thích').count();
  const historyCards = await page.$$eval('[data-library-history] .history-youtube-item', els => els.length).catch(() => 0);
  result.account = { hasFavoritesSection, historyCards };

  await page.goto(base + '/index.html', { waitUntil: 'networkidle' });
  const homeCompleted = await page.$$eval('[data-home-completed-grid] a.sc', els => els.length).catch(() => 0);
  await page.goto(base + '/completed.html', { waitUntil: 'networkidle' });
  const completedCount = await page.$$eval('[data-story-filter-root] .story-card:not(.is-hidden)', els => els.length).catch(() => 0);
  result.completed = { homeCompleted, completedCount };

  const fp = path.join(outDir, 'verify-after-remove-favorites.json');
  fs.writeFileSync(fp, JSON.stringify(result, null, 2));
  console.log(fp);
  await browser.close();
})();
