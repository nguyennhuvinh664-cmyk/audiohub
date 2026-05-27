const { chromium } = require('playwright');

(async () => {
  const baseApi = 'http://localhost:4000/api/v1';
  const web = 'http://127.0.0.1:5500/html';

  async function req(method, path, body, token) {
    const res = await fetch(baseApi + path, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json = null; try { json = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, json, text };
  }

  const email = `verify_final_${Date.now()}@audiohub.local`;
  const password = '12345678';

  const reg = await req('POST', '/auth/register', { email, password, displayName: 'Verify Final' });
  const login = await req('POST', '/auth/login', { email, password });
  const token = login.json && login.json.data ? login.json.data.token : '';

  const create = await req('POST', '/playlists', { name: 'Final Playlist', status: 'Đang nghe' }, token);
  const playlistId = create.json && create.json.data ? String(create.json.data.id || '') : '';
  const rename = await req('PATCH', `/playlists/${encodeURIComponent(playlistId)}`, { name: 'Final Renamed' }, token);
  const done = await req('PATCH', `/playlists/${encodeURIComponent(playlistId)}`, { status: 'Đã hoàn thành' }, token);
  const add = await req('POST', `/playlists/${encodeURIComponent(playlistId)}/items`, { storyId: 'demo6', storyTitle: 'demo6', storyAuthor: 'vinhbanh', chapterLabel: 'Chương 1', chapterIndex: 0 }, token);
  const list = await req('GET', '/playlists', null, token);

  const rows = list.json && Array.isArray(list.json.data) ? list.json.data : [];
  const target = rows.find(p => String((p && p.id) || '') === playlistId) || null;
  const apiPass = !!(reg.ok && login.ok && create.ok && rename.ok && done.ok && add.ok && list.ok && target && target.name === 'Final Renamed' && target.status === 'Đã hoàn thành' && Array.isArray(target.items) && target.items.length > 0);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(web + '/account.html', { waitUntil: 'domcontentloaded' });
  await page.evaluate(({ t }) => {
    localStorage.setItem('audiohub-auth-token', t);
    localStorage.setItem('audiohub-api-base', 'http://localhost:4000/api/v1');
    localStorage.setItem('audiohub-demo-auth', JSON.stringify({ isLoggedIn: true, profile: { displayName: 'Verify Final' } }));
  }, { t: token });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);

  await page.goto(web + '/index.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const indexTitles = (await page.locator('[data-home-completed-grid] .sc__nm').allTextContents()).map(t => (t || '').trim()).filter(Boolean);

  await page.goto(web + '/completed.html', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const completedTitles = (await page.locator('.sc__nm').allTextContents()).map(t => (t || '').trim()).filter(Boolean);

  await browser.close();

  const uiIndexPass = indexTitles.includes('Final Renamed');
  const uiCompletedPass = completedTitles.includes('Final Renamed');

  const result = {
    api: {
      register: reg.status,
      login: login.status,
      create: create.status,
      rename: rename.status,
      markCompleted: done.status,
      addItem: add.status,
      list: list.status,
      playlistId,
      persistencePass: apiPass
    },
    ui: {
      indexContainsRenamed: uiIndexPass,
      completedContainsRenamed: uiCompletedPass,
      indexSample: indexTitles.slice(0, 8),
      completedSample: completedTitles.slice(0, 8)
    },
    overallPass: apiPass && uiIndexPass && uiCompletedPass
  };

  console.log(JSON.stringify(result, null, 2));
})();
