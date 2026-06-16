const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const accountPath = path.join(__dirname, 'html', 'account.html');
  const fileUrl = 'file:///' + accountPath.split(path.sep).join('/');

  console.log('Loading:', fileUrl);
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const storiesCount = await page.evaluate(() => {
    const items = document.querySelectorAll('[data-stories-published] li');
    return items.length;
  });

  console.log('Stories count:', storiesCount);

  await page.screenshot({ path: 'account-page.png' });
  console.log('Screenshot saved');

  await browser.close();
})();
