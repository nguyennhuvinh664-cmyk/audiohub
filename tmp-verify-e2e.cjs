const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const outDir = path.join(process.cwd(), 'tmp-verify-artifacts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1536, height: 864 } });
  const page = await context.newPage();

  const results = { flows: [] };

  // Flow 3: index typography + dynamic list presence
  await page.goto('http://127.0.0.1:5500/html/index.html', { waitUntil: 'networkidle' });
  const scNmFont = await page.$eval('.sc__nm', (el) => getComputedStyle(el).fontSize).catch(() => null);
  const tnmFont = await page.$eval('.tnm', (el) => getComputedStyle(el).fontSize).catch(() => null);
  const trendingItems = await page.$$eval('[data-home-trending-list] .ti', (els) => els.length).catch(() => 0);
  await page.screenshot({ path: path.join(outDir, 'index-home.png'), fullPage: true });
  results.flows.push({
    name: 'index_typography_dynamic',
    scNmFont,
    tnmFont,
    trendingItems,
    screenshot: path.join(outDir, 'index-home.png')
  });

  // Flow 1 + 2: hashtag detail -> new-posts + filter/URL behavior
  await page.goto('http://127.0.0.1:5500/html/story-detail.html?id=demo', { waitUntil: 'networkidle' });
  const firstHashtag = await page.locator('.story-hashtag').first();
  const hasHashtag = await firstHashtag.count();
  let hashtagNavUrl = null;
  let visibleCardsAfterHashtag = null;
  let emptyVisibleAfterHashtag = null;
  let summaryAfterHashtag = null;
  let urlAfterReset = null;
  let urlAfterEnter = null;

  if (hasHashtag > 0) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle' }),
      firstHashtag.click()
    ]);
    hashtagNavUrl = page.url();
    visibleCardsAfterHashtag = await page.$$eval('[data-story-filter-root] .story-card:not(.is-hidden)', (els) => els.length).catch(() => null);
    emptyVisibleAfterHashtag = await page.$eval('[data-filter-empty]', (el) => el.classList.contains('is-visible')).catch(() => null);
    summaryAfterHashtag = await page.$eval('[data-filter-summary]', (el) => (el.textContent || '').trim()).catch(() => null);

    // reset behavior
    const resetBtn = page.locator('[data-filter-reset]');
    if (await resetBtn.count()) {
      await resetBtn.click();
      await page.waitForTimeout(300);
      urlAfterReset = page.url();
    }

    // Enter key behavior in title input
    const titleInput = page.locator('[data-filter-title]');
    if (await titleInput.count()) {
      await titleInput.fill('xuyên');
      await titleInput.press('Enter');
      await page.waitForTimeout(300);
      urlAfterEnter = page.url();
    }

    await page.screenshot({ path: path.join(outDir, 'new-posts-hashtag.png'), fullPage: true });
  }

  results.flows.push({
    name: 'hashtag_and_filters',
    hasHashtag,
    hashtagNavUrl,
    visibleCardsAfterHashtag,
    emptyVisibleAfterHashtag,
    summaryAfterHashtag,
    urlAfterReset,
    urlAfterEnter,
    screenshot: path.join(outDir, 'new-posts-hashtag.png')
  });

  // Flow 4: auth/visibility gate (non-member)
  await context.clearCookies();
  await page.goto('http://127.0.0.1:5500/html/new-posts.html', { waitUntil: 'networkidle' });
  const paginationSecond = page.locator('.pagination a.pagination__item').nth(1);
  let modalVisible = null;
  if (await paginationSecond.count()) {
    await paginationSecond.click({ force: true });
    await page.waitForTimeout(300);
    modalVisible = await page.$eval('[data-auth-required-inline-modal], .auth-required-modal', (el) => !el.classList.contains('is-hidden')).catch(() => false);
  }
  await page.screenshot({ path: path.join(outDir, 'auth-gate-nonmember.png'), fullPage: true });

  results.flows.push({
    name: 'auth_gate_non_member',
    modalVisible,
    screenshot: path.join(outDir, 'auth-gate-nonmember.png')
  });

  await browser.close();
  const outFile = path.join(outDir, 'verify-results.json');
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(outFile);
})();
