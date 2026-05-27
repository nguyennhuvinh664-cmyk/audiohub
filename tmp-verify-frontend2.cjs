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

  await page.waitForTimeout(1200);
  await page.locator('[data-playlist-create-name]').fill('UI Verify Playlist');
  await page.locator('[data-playlist-create]').click();
  await page.waitForTimeout(1200);

  const firstRow = page.locator('[data-playlist-select]').first();
  const playlistNameBefore = ((await firstRow.locator('.playlist-name').textContent()) || '').trim();

  const statusBtn = firstRow.locator('[data-playlist-status-trigger]');
  await statusBtn.click();
  await page.waitForTimeout(300);
  const statusOption = firstRow.locator('[data-playlist-status-option*="::Đã hoàn thành"]').first();
  if (await statusOption.count()) {
    await statusOption.click();
  }
  await page.waitForTimeout(900);

  const renameBtn = firstRow.locator('[data-playlist-rename]').first();
  const renameId = await renameBtn.getAttribute('data-playlist-rename');
  await renameBtn.click();
  page.once('dialog', async (dialog) => {
    await dialog.accept('UI Verify Renamed');
  });
  await renameBtn.click();
  await page.waitForTimeout(1200);

  await page.goto('http://127.0.0.1:5500/html/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const indexCompletedTitles = (await page.locator('[data-home-completed-grid] .sc__nm').allTextContents()).map(t => (t || '').trim()).filter(Boolean);

  await page.goto('http://127.0.0.1:5500/html/completed.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const completedTitles = (await page.locator('.sc__nm').allTextContents()).map(t => (t || '').trim()).filter(Boolean);

  const result = {
    playlistNameBefore,
    renameId,
    indexCompletedContainsRenamed: indexCompletedTitles.includes('UI Verify Renamed'),
    indexCompletedSample: indexCompletedTitles.slice(0, 6),
    completedContainsRenamed: completedTitles.includes('UI Verify Renamed'),
    completedSample: completedTitles.slice(0, 8)
  };

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})();
