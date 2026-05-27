const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const outDir = path.join(process.cwd(), 'tmp-verify-artifacts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const page = await context.newPage();
  const base = 'http://127.0.0.1:5500/html';

  await page.goto(base + '/new-posts.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const now = Date.now();
    const stories = [];
    for (let i = 1; i <= 26; i++) {
      stories.push({ id:'seed_'+i, title:'Truyen Seed '+i, author:'TG', genre:'Tiên Hiệp', description:'d', hashtags:['x'], chapterTitle:'C'+i, visibility:'Công khai', status: i%5===0 ? 'Hoàn thành':'Đang cập nhật', isCompleted:i%5===0, listenHistory:[], listenCount:0, listenCount2d:0, listenCount7d:0, createdAt:new Date(now-i*1000).toISOString(), updatedAt:new Date(now-i*1000).toISOString() });
    }
    localStorage.setItem('audiohub-stories', JSON.stringify(stories));
    localStorage.removeItem('audiohub-demo-auth');
    localStorage.removeItem('audiohub-playlists-v1');
  });

  await page.goto(base + '/new-posts.html?page=2', { waitUntil: 'networkidle' });
  const nonMemberVisible = await page.$$eval('[data-story-filter-root] .story-card:not(.is-hidden)', els => els.length);
  const nonMemberFirst = await page.locator('[data-story-filter-root] .story-card:not(.is-hidden)').first().getAttribute('data-story-id');

  await page.evaluate(() => {
    localStorage.setItem('audiohub-demo-auth', JSON.stringify({ isLoggedIn: true, name: 'Member', email: 'm@a.com', initials: 'MB', tier: 'T' }));
  });
  await page.goto(base + '/new-posts.html?page=2', { waitUntil: 'networkidle' });
  const memberVisible = await page.$$eval('[data-story-filter-root] .story-card:not(.is-hidden)', els => els.length);
  const memberFirst = await page.locator('[data-story-filter-root] .story-card:not(.is-hidden)').first().getAttribute('data-story-id');

  await page.goto(base + '/index.html', { waitUntil: 'networkidle' });
  const homeCompleted = await page.$$eval('[data-home-completed-grid] a.sc', els => els.length);
  await page.goto(base + '/completed.html', { waitUntil: 'networkidle' });
  const completedPage = await page.$$eval('[data-story-filter-root] .story-card:not(.is-hidden)', els => els.length);

  const result = { authGate: { nonMemberVisible, nonMemberFirst, memberVisible, memberFirst }, completed: { homeCompleted, completedPage } };
  fs.writeFileSync(path.join(outDir, 'verify-patch.json'), JSON.stringify(result, null, 2));
  console.log(path.join(outDir, 'verify-patch.json'));
  await browser.close();
})();
