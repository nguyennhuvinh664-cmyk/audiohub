const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1200, height: 800 });

  await page.goto('file:///e:/web audio/html/account.html');
  await page.evaluate(() => {
    var playlists = [
      { id: 'pl-1', name: 'Thiên Long Bát Bộ', entries: Array(11).fill({key:'x',title:'t',author:'a',genre:'g',href:'#',status:'done'}), state: 'done', createdAt: new Date().toISOString() },
      { id: 'pl-2', name: 'Thủy Hử', entries: [], state: 'ongoing', createdAt: new Date().toISOString() },
      { id: 'pl-3', name: 'Tây Du Ký', entries: Array(5).fill({key:'x',title:'t',author:'a',genre:'g',href:'#',status:'listening'}), state: 'ongoing', createdAt: new Date().toISOString() },
    ];
    localStorage.setItem('audiohub-playlists-v1', JSON.stringify(playlists));
  });

  await page.reload();
  await page.waitForTimeout(500);

  var mycontent = await page.$('[data-main-tab="mycontent"]');
  if (mycontent) await mycontent.click();
  await page.waitForTimeout(400);

  var playlistTab = await page.$('[data-content-tab="playlist"]');
  if (playlistTab) await playlistTab.click();
  await page.waitForTimeout(600);

  await page.screenshot({ path: 'screenshot-playlist-fix.png' });
  console.log('Done');
  await browser.close();
})();
