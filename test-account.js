const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  // Navigate to account page
  const accountPath = path.join(__dirname, 'html', 'account.html');
  const fileUrl = 'file:///' + accountPath.replace(/\/g, '/');
  
  console.log('Loading:', fileUrl);
  await page.goto(fileUrl, { waitUntil: 'networkidle' });
  
  // Wait a bit for scripts to load
  await page.waitForTimeout(2000);
  
  // Check if API is being called
  const logs = [];
  page.on('console', msg => logs.push(`[${msg.type()}] ${msg.text()}`));
  
  // Try to get stories from the page
  const storiesCount = await page.evaluate(() => {
    const items = document.querySelectorAll('[data-stories-published] li');
    return items.length;
  });
  
  console.log('Stories published count:', storiesCount);
  
  // Check what's in the published section
  const publishedHTML = await page.evaluate(() => {
    const section = document.querySelector('[data-stories-published]');
    return section ? section.innerHTML.substring(0, 500) : 'NOT FOUND';
  });
  
  console.log('Published section HTML:', publishedHTML);
  
  // Screenshot
  await page.screenshot({ path: 'account-page.png' });
  console.log('Screenshot saved: account-page.png');
  
  console.log('\n--- Console logs ---');
  logs.forEach(log => console.log(log));
  
  await browser.close();
})();
