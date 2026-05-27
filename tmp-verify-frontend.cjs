const { chromium } = require('playwright');

(async () => {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJjbXBtM2Q1NWEwMDAwdWczNDZxbHVjNnQzIiwiZW1haWwiOiJ2ZXJpZnkzXzIwMjYwNTI2MTA0NDM2QGF1ZGlvaHViLmxvY2FsIiwiaWF0IjoxNzc5NzY3MDc2LCJleHAiOjE3ODAzNzE4NzZ9.98fYNcP1ie7upJopHURafiOXxsmawy-S-m1pnNucmp0';
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('http://127.0.0.1:5500/html/account.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate((t) => {
    localStorage.setItem('audiohub-auth-token', t);
    localStorage.setItem('audiohub-api-base', 'http://localhost:4000/api/v1');
    localStorage.setItem('audiohub-demo-auth', JSON.stringify({ isLoggedIn: true, profile: { displayName: 'Verifier3', email: 'verify3@audiohub.local' } }));
  }, token);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await page.waitForTimeout(800);
  const createInput = page.locator('[data-playlist-create-name]');
  await createInput.fill('UI Verify Playlist');
  await page.locator('[data-playlist-create]').click();
  await page.waitForTimeout(1200);

  const firstPlaylist = page.locator('[data-playlist-item]').first();
  const playlistNameBefore = (await firstPlaylist.locator('[data-playlist-name]').first().textContent() || '').trim();

  await firstPlaylist.locator('[data-playlist-status]').click();
  await page.waitForTimeout(900);

  await firstPlaylist.locator('[data-playlist-rename]').click();
  const renameInput = firstPlaylist.locator('[data-playlist-rename-input]');
  await renameInput.fill('UI Verify Renamed');
  await firstPlaylist.locator('[data-playlist-rename-save]').click();
  await page.waitForTimeout(900);

  await page.goto('http://127.0.0.1:5500/html/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const completedTitles = await page.locator('[data-home-completed-grid] .sc__nm').allTextContents();

  await page.goto('http://127.0.0.1:5500/html/completed.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const completedPageTitles = await page.locator('.sc__nm, .story-title, [data-story-title]').allTextContents();

  const result = {
    playlistNameBefore,
    indexCompletedContainsRenamed: completedTitles.map(t => (t || '').trim()).includes('UI Verify Renamed'),
    indexCompletedSample: completedTitles.slice(0, 6).map(t => (t || '').trim()),
    completedPageContainsRenamed: completedPageTitles.map(t => (t || '').trim()).includes('UI Verify Renamed'),
    completedPageSample: completedPageTitles.slice(0, 8).map(t => (t || '').trim())
  };

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
