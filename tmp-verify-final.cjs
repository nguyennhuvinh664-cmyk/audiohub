const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const outDir = path.join(process.cwd(), 'tmp-verify-artifacts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1536, height: 864 } });
  const page = await context.newPage();
  const base = 'http://127.0.0.1:5500/html';

  await page.goto(base + '/new-posts.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    const now = Date.now();
    const stories = [];
    for (let i = 1; i <= 26; i++) {
      stories.push({
        id: 'seed_' + i,
        title: 'Truyen Seed ' + i,
        author: i % 2 ? 'Tac Gia A' : 'Tac Gia B',
        genre: i % 3 ? 'Tiên Hiệp' : 'Kiếm Hiệp',
        description: i % 4 === 0 ? '#phi-thuong story ' + i : 'story ' + i,
        hashtags: i % 4 === 0 ? ['phi-thuong'] : ['thuong'],
        chapterTitle: 'Chuong ' + i,
        visibility: i <= 18 ? 'Công khai' : 'Không công khai',
        status: i % 5 === 0 ? 'Hoàn thành' : 'Đang cập nhật',
        isCompleted: i % 5 === 0,
        listenHistory: [],
        listenCount: 0,
        listenCount2d: 0,
        listenCount7d: 0,
        createdAt: new Date(now - i * 100000).toISOString(),
        updatedAt: new Date(now - i * 100000).toISOString()
      });
    }
    localStorage.setItem('audiohub-stories', JSON.stringify(stories));

    const lib = {
      favorites: [
        { key: 'a', title: 'Fav New', author: 'A', genre: 'G1', progress: 'P1', note: 'N1', href: 'story-detail.html?id=seed_1', savedAt: new Date(now).toISOString() },
        { key: 'b', title: 'Fav Old', author: 'B', genre: 'G2', progress: 'P2', note: 'N2', href: 'story-detail.html?id=seed_2', savedAt: new Date(now - 10000).toISOString() }
      ],
      following: [],
      history: [
        { key: 'h1', title: 'Hist New', author: 'A', genre: 'G1', progress: 'P1', note: 'N1', href: 'story-detail.html?id=seed_3', savedAt: new Date(now).toISOString() },
        { key: 'h2', title: 'Hist Old', author: 'B', genre: 'G2', progress: 'P2', note: 'N2', href: 'story-detail.html?id=seed_4', savedAt: new Date(now - 10000).toISOString() }
      ]
    };
    localStorage.setItem('audiohub-library', JSON.stringify(lib));
    localStorage.removeItem('audiohub-demo-auth');
  });

  const result = {};

  await page.goto(base + '/new-posts.html', { waitUntil: 'networkidle' });
  const vis1 = await page.$$eval('[data-story-filter-root] .story-card:not(.is-hidden)', els => els.length).catch(() => -1);
  const pageItems = await page.$$eval('.pagination a.pagination__item', els => els.length).catch(() => 0);
  await page.locator('[data-filter-title]').fill('seed 1');
  await page.locator('[data-filter-title]').press('Enter');
  await page.waitForTimeout(300);
  const urlAfterEnter = page.url();
  await page.locator('[data-filter-reset]').click();
  await page.waitForTimeout(300);
  const urlAfterReset = page.url();
  result.listing = { vis1, pageItems, urlAfterEnter, urlAfterReset };

  await page.goto(base + '/account.html', { waitUntil: 'networkidle' });
  const firstHist = await page.locator('[data-library-history] .history-youtube-title').first().textContent().catch(() => null);
  const firstFav = await page.locator('[data-library-favorites] .favorite-youtube-title').first().textContent().catch(() => null);
  result.account = { firstHist, firstFav };

  await page.goto(base + '/new-posts.html?page=2', { waitUntil: 'networkidle' });
  await page.locator('.pagination a.pagination__item').nth(1).click({ force: true }).catch(() => {});
  await page.waitForTimeout(300);
  const urlNonMember = page.url();

  await page.evaluate(() => {
    localStorage.setItem('audiohub-demo-auth', JSON.stringify({ isLoggedIn: true, name: 'Member', email: 'm@a.com', initials: 'MB', tier: 'T' }));
  });
  await page.goto(base + '/new-posts.html?page=2', { waitUntil: 'networkidle' });
  await page.locator('.pagination a.pagination__item').nth(2).click({ force: true }).catch(() => {});
  await page.waitForTimeout(300);
  const urlMember = page.url();
  result.authGate = { urlNonMember, urlMember };

  await page.goto(base + '/index.html', { waitUntil: 'networkidle' });
  const homeCompleted = await page.$$eval('[data-home-completed-list] .story-card', els => els.length).catch(() => 0);
  await page.goto(base + '/completed.html', { waitUntil: 'networkidle' });
  const completedCount = await page.$$eval('[data-story-filter-root] .story-card:not(.is-hidden)', els => els.length).catch(() => 0);
  result.completed = { homeCompleted, completedCount };

  const outFile = path.join(outDir, 'verify-final.json');
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(outFile);
  await browser.close();
})();
