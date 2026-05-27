const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto('http://127.0.0.1:5500/html/index.html', { waitUntil: 'networkidle' });
  const beforeUrl = page.url();
  const firstCardStoryId = await page.getAttribute('.cgrid a.sc', 'data-story-id');
  await page.click('.cgrid a.sc');
  await page.waitForTimeout(700);
  const afterUrl = page.url();
  const stayedOnHome = beforeUrl === afterUrl;
  console.log(JSON.stringify({ beforeUrl, afterUrl, firstCardStoryId, stayedOnHome }, null, 2));
  await browser.close();
})();
