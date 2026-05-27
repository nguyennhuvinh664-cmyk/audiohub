const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.goto('http://127.0.0.1:5500/html/index.html', { waitUntil: 'networkidle' });
  const firstCardHref = await page.getAttribute('.cgrid a.sc', 'href');
  const firstCardStoryId = await page.getAttribute('.cgrid a.sc', 'data-story-id');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'networkidle' }),
    page.click('.cgrid a.sc')
  ]);
  const finalUrl = page.url();
  const title = await page.textContent('.detail-title');
  console.log(JSON.stringify({ firstCardHref, firstCardStoryId, finalUrl, title: String(title || '').trim() }, null, 2));
  await browser.close();
})();
