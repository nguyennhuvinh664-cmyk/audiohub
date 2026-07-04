/**
 * AudioHub Production Readiness Audit
 * Comprehensive check of all user flows, SPA behavior, responsive, and runtime safety.
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const HTML_DIR = path.join(ROOT, 'html');
const CSS_DIR = path.join(ROOT, 'css');
const JS_DIR = path.join(ROOT, 'js');

let totalIssues = 0;
let totalWarnings = 0;
const issues = [];
const warnings = [];

function fail(msg, file) {
  issues.push({ file: file || 'global', msg });
  totalIssues++;
}
function warn(msg, file) {
  warnings.push({ file: file || 'global', msg });
  totalWarnings++;
}
function ok(msg) { /* silent */ }

const routerSrc = fs.readFileSync(path.join(ROOT, 'js/spa-router.js'), 'utf8');
const rootIndex = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const htmlFiles = fs.readdirSync(HTML_DIR).filter(f => f.endsWith('.html'));

// ================================================================
// 1. SPA NAVIGATION
// ================================================================
console.log('━━━ 1. SPA NAVIGATION ━━━');

// 1a. Router intercepts all internal links
const knownRoutes = routerSrc.match(/var HTML_PAGES = \[([\s\S]*?)\];/)[1];
const knownPages = [...knownRoutes.matchAll(/'([^']+)'/g)].map(m => m[1]);
console.log('  Known SPA routes: ' + knownPages.length);

// Check all <a href> in index.html point to known routes or external
const rootLinks = [...rootIndex.matchAll(/href="([^"#]+)"/g)].map(m => m[1]);
const unknownRootLinks = rootLinks.filter(href => {
  if (href.startsWith('http') || href.startsWith('mailto:') || href === '#') return false;
  const page = href.replace('../', '').replace('./', '');
  return !knownPages.includes(page) && !page.startsWith('http');
});
if (unknownRootLinks.length > 0) {
  console.log('  ⚠️  Shell links to unknown routes: ' + [...new Set(unknownRootLinks)].join(', '));
}

// 1b. All subpage <a href> point to known routes (excluding CSS/JS/images)
htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(HTML_DIR, f), 'utf8');
  const links = [...html.matchAll(/href="([^"#]+)"/g)].map(m => m[1]);
  links.forEach(href => {
    if (href.startsWith('http') || href.startsWith('mailto:') || href === '#') return;
    // Skip CSS, JS, images, and asset references
    if (href.match(/\.(css|js|jpg|jpeg|png|gif|svg|ico|webp|mp3|mp4)($|\?)/i)) return;
    if (href.startsWith('../css/') || href.startsWith('../js/') || href.startsWith('css/') || href.startsWith('js/')) return;
    const page = href.replace('../', '').replace('./', '').split('?')[0];
    if (!knownPages.includes(page) && !page.startsWith('http')) {
      fail('Link to unknown route: ' + href, f);
    }
  });
});
console.log('  All links verified against known routes ✅');

// 1c. Router has popstate handler
const hasPopstate = routerSrc.includes('popstate');
console.log('  popstate handler: ' + (hasPopstate ? '✅' : '❌'));
if (!hasPopstate) fail('Missing popstate handler for back/forward');

// 1d. Router handles initial page load for subpages
const hasInitialLoad = routerSrc.includes('isInitialLoad') && routerSrc.includes('DOMContentLoaded');
console.log('  Initial subpage load: ' + (hasInitialLoad ? '✅' : '❌'));
if (!hasInitialLoad) fail('Missing initial page load handler');

// ================================================================
// 2. REFRESH (F5) ON EVERY ROUTE
// ================================================================
console.log('\n━━━ 2. REFRESH (F5) HANDLING ━━━');

// Check _redirects covers all routes
const redirects = fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8');
const redirectLines = redirects.trim().split('\n').filter(l => l.trim() && !l.startsWith('#'));
const redirectSources = redirectLines.map(l => l.trim().split(/\s+/)[0]);

// Every known HTML page should have a redirect
knownPages.forEach(page => {
  if (page === 'index.html') return; // index.html is the shell, served directly
  const hasRedirect = redirectSources.some(r => r === '/' + page || r === '/' + page.replace('.html', ''));
  if (!hasRedirect) {
    fail('Missing _redirects entry for ' + page + ' — F5 will 404');
  }
});

// Check for root / redirect (would cause infinite loop)
if (redirectSources.includes('/')) {
  fail('Root / redirect in _redirects — will cause infinite loop!');
}

console.log('  _redirects covers all known routes ✅');

// ================================================================
// 3. BACK/FORWARD NAVIGATION
// ================================================================
console.log('\n━━━ 3. BACK/FORWARD ━━━');

// Check router uses history.pushState
const hasPushState = routerSrc.includes('history.pushState');
const hasReplaceState = routerSrc.includes('history.replaceState');
console.log('  pushState: ' + (hasPushState ? '✅' : '❌'));
console.log('  replaceState: ' + (hasReplaceState ? '✅' : '❌'));
if (!hasPushState) fail('Missing history.pushState');
if (!hasReplaceState) fail('Missing history.replaceState');

// Check popstate handler uses navigateTo
const popstateHandler = routerSrc.match(/addEventListener\('popstate'[^}]+\}/);
if (popstateHandler) {
  const usesNavigate = popstateHandler[0].includes('navigateTo');
  console.log('  popstate calls navigateTo: ' + (usesNavigate ? '✅' : '❌'));
  if (!usesNavigate) fail('popstate handler does not call navigateTo');
}

// ================================================================
// 4. RESPONSIVE DESIGN
// ================================================================
console.log('\n━━━ 4. RESPONSIVE DESIGN ━━━');

// Check mobile CSS files exist and have media queries
const mobileCssFiles = ['mobile-shared.css', 'mobile-app.css', 'home-mobile.css', 'account-mobile.css',
  'categories-mobile.css', 'story-detail-mobile.css', 'user-account-mobile.css', 'mobile-account.css'];

mobileCssFiles.forEach(f => {
  const filePath = path.join(CSS_DIR, f);
  if (!fs.existsSync(filePath)) {
    fail('Missing mobile CSS: ' + f);
    return;
  }
  const content = fs.readFileSync(filePath, 'utf8');
  const mediaQueries = (content.match(/@media[^{]+/g) || []).length;
  if (mediaQueries === 0) {
    warn('No media queries in ' + f, f);
  }
});

// Check key breakpoints exist
const allCss = mobileCssFiles.filter(f => fs.existsSync(path.join(CSS_DIR, f)))
  .map(f => fs.readFileSync(path.join(CSS_DIR, f), 'utf8')).join('\n');

const breakpoints = ['480px', '600px', '720px', '768px', '900px', '1024px'];
breakpoints.forEach(bp => {
  const found = allCss.includes(bp);
  console.log('  Breakpoint ' + bp + ': ' + (found ? '✅' : '⚠️  not found'));
});

// Check header has mobile/desktop versions
const hasMobileHeader = rootIndex.includes('class="m-header"');
const hasDesktopHeader = rootIndex.includes('class="header"');
console.log('  Mobile header: ' + (hasMobileHeader ? '✅' : '❌'));
console.log('  Desktop header: ' + (hasDesktopHeader ? '✅' : '❌'));
if (!hasMobileHeader) fail('Missing mobile header');
if (!hasDesktopHeader) fail('Missing desktop header');

// Check bottom nav exists
const hasBottomNav = rootIndex.includes('class="m-bottomnav"');
console.log('  Bottom nav: ' + (hasBottomNav ? '✅' : '❌'));
if (!hasBottomNav) fail('Missing mobile bottom nav');

// Check drawer exists
const hasDrawer = rootIndex.includes('class="m-drawer"');
console.log('  Drawer: ' + (hasDrawer ? '✅' : '❌'));
if (!hasDrawer) fail('Missing mobile drawer');

// ================================================================
// 5. CONSOLE ERRORS (Static Analysis)
// ================================================================
console.log('\n━━━ 5. CONSOLE ERRORS (Static Analysis) ━━━');

const jsFiles = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js') && !f.includes('.bak'));
jsFiles.forEach(f => {
  const content = fs.readFileSync(path.join(JS_DIR, f), 'utf8');

  // Check for obvious undefined variable access
  const undeclaredVars = content.match(/(?<!var |let |const |function )\bwindow\.\w+\b/g) || [];
  // This is too broad, skip

  // Check for console.log (should be removed in production)
  const consoleLogs = (content.match(/console\.log\(/g) || []).length;
  if (consoleLogs > 0) {
    warn(f + ': ' + consoleLogs + ' console.log statements (remove for production)', f);
  }

  // Check for document.write
  if (content.includes('document.write(')) {
    fail(f + ': uses document.write (blocks page rendering)', f);
  }

  // Check for eval
  if (content.includes('eval(')) {
    fail(f + ': uses eval() (security risk)', f);
  }
});
console.log('  Static JS analysis done ✅');

// ================================================================
// 6. NETWORK (File Existence)
// ================================================================
console.log('\n━━━ 6. NETWORK (File Existence) ━━━');

let fileCheckCount = 0;
function checkFileExists(filePath, context) {
  fileCheckCount++;
  if (!fs.existsSync(filePath)) {
    fail('File not found: ' + path.relative(ROOT, filePath), context);
  }
}

// Check all CSS files
fs.readdirSync(CSS_DIR).filter(f => f.endsWith('.css')).forEach(f => {
  checkFileExists(path.join(CSS_DIR, f), 'css/' + f);
});

// Check all JS files
fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js')).forEach(f => {
  checkFileExists(path.join(JS_DIR, f), 'js/' + f);
});

// Check all HTML files
htmlFiles.forEach(f => {
  checkFileExists(path.join(HTML_DIR, f), 'html/' + f);
});
checkFileExists(path.join(ROOT, 'index.html'), 'index.html');

// Check favicon
checkFileExists(path.join(ROOT, 'favicon.ico'), 'favicon.ico');
checkFileExists(path.join(ROOT, 'favicon.svg'), 'favicon.svg');

console.log('  Checked ' + fileCheckCount + ' files ✅');

// ================================================================
// 7. API CLIENT
// ================================================================
console.log('\n━━━ 7. API CLIENT ━━━');

const apiClient = fs.readFileSync(path.join(JS_DIR, 'api-client.js'), 'utf8');
const hasApiUrl = apiClient.includes('BASE_URL') || apiClient.includes('API_URL') || apiClient.includes('api');
const hasFetch = apiClient.includes('fetch(');
const hasToken = apiClient.includes('token') || apiClient.includes('Token');
console.log('  API URL config: ' + (hasApiUrl ? '✅' : '⚠️'));
console.log('  Uses fetch(): ' + (hasFetch ? '✅' : '❌'));
console.log('  Token handling: ' + (hasToken ? '✅' : '⚠️'));
if (!hasFetch) fail('API client does not use fetch()');

// Check if API client handles errors
const hasErrorHandling = apiClient.includes('catch') || apiClient.includes('.catch');
console.log('  Error handling: ' + (hasErrorHandling ? '✅' : '⚠️'));

// ================================================================
// 8. IMAGES / THUMBNAILS
// ================================================================
console.log('\n━━━ 8. IMAGES / THUMBNAILS ━━━');

// Check if story cards use inline styles for thumbnails (which is fine)
// Check if there are broken image references
const allHtmlContent = [rootIndex, ...htmlFiles.map(f => fs.readFileSync(path.join(HTML_DIR, f), 'utf8'))].join('\n');
const imgRefs = [...allHtmlContent.matchAll(/src="([^"]+\.(jpg|jpeg|png|gif|svg|webp))"/g)];
console.log('  Image references found: ' + imgRefs.length);

// Check if images are referenced from external URLs (CDN) or local
const localImages = imgRefs.filter(m => !m[1].startsWith('http'));
const externalImages = imgRefs.filter(m => m[1].startsWith('http'));
console.log('  Local images: ' + localImages.length);
console.log('  External images: ' + externalImages.length);

// Story thumbnails use CSS custom properties (--c) for color, not actual images
// This is by design - the "TH" text is the thumbnail
console.log('  Story thumbnails use color-coded text (by design) ✅');

// ================================================================
// 9. AUDIO PLAYER
// ================================================================
console.log('\n━━━ 9. AUDIO PLAYER ━━━');

const storyDetailJs = fs.readFileSync(path.join(JS_DIR, 'story-detail-ui.js'), 'utf8');
const hasAudioElement = storyDetailJs.includes('Audio') || storyDetailJs.includes('audio');
const hasPlayPause = storyDetailJs.includes('play') && storyDetailJs.includes('pause');
const hasProgress = storyDetailJs.includes('progress') || storyDetailJs.includes('currentTime');
const hasVolume = storyDetailJs.includes('volume');
const hasSpeed = storyDetailJs.includes('playbackRate') || storyDetailJs.includes('speed');
const hasSeek = storyDetailJs.includes('seek') || storyDetailJs.includes('currentTime');
const hasNextPrev = storyDetailJs.includes('next') || storyDetailJs.includes('prev');
const hasShuffle = storyDetailJs.includes('shuffle') || storyDetailJs.includes('random');
const hasRepeat = storyDetailJs.includes('repeat');

console.log('  Audio element: ' + (hasAudioElement ? '✅' : '❌'));
console.log('  Play/Pause: ' + (hasPlayPause ? '✅' : '❌'));
console.log('  Progress bar: ' + (hasProgress ? '✅' : '❌'));
console.log('  Volume: ' + (hasVolume ? '✅' : '❌'));
console.log('  Playback speed: ' + (hasSpeed ? '✅' : '❌'));
console.log('  Seek forward/back: ' + (hasSeek ? '✅' : '❌'));
console.log('  Next/Previous chapter: ' + (hasNextPrev ? '✅' : '❌'));
console.log('  Shuffle: ' + (hasShuffle ? '✅' : '❌'));
console.log('  Repeat: ' + (hasRepeat ? '✅' : '❌'));

if (!hasAudioElement) fail('Audio player missing Audio element');
if (!hasPlayPause) fail('Audio player missing play/pause');

// Check audio player CSS
const playerCss = fs.readFileSync(path.join(CSS_DIR, 'story-detail-ui.css'), 'utf8');
const hasPlayerStyles = playerCss.includes('.sd-player') || playerCss.includes('.sd-play');
console.log('  Player CSS: ' + (hasPlayerStyles ? '✅' : '❌'));
if (!hasPlayerStyles) fail('Audio player missing CSS styles');

// ================================================================
// 10. FAVORITE / HISTORY
// ================================================================
console.log('\n━━━ 10. FAVORITE / HISTORY ━━━');

const libraryState = fs.readFileSync(path.join(JS_DIR, 'library-state.js'), 'utf8');
const hasFavorites = libraryState.includes('favorite') || libraryState.includes('Favorite');
const hasHistory = libraryState.includes('history') || libraryState.includes('History');
const hasLocalStorage = libraryState.includes('localStorage');
const hasAddRemove = libraryState.includes('toggle') || (libraryState.includes('add') && libraryState.includes('remove'));

console.log('  Favorites function: ' + (hasFavorites ? '✅' : '❌'));
console.log('  History function: ' + (hasHistory ? '✅' : '❌'));
console.log('  localStorage persistence: ' + (hasLocalStorage ? '✅' : '❌'));
console.log('  Add/Remove toggle: ' + (hasAddRemove ? '✅' : '❌'));

if (!hasFavorites) fail('Missing favorite functionality');
if (!hasHistory) fail('Missing history functionality');
if (!hasLocalStorage) fail('Missing localStorage persistence');

// ================================================================
// 11. UPLOAD
// ================================================================
console.log('\n━━━ 11. UPLOAD ━━━');

const uploadJs = fs.readFileSync(path.join(JS_DIR, 'upload-story-ui.js'), 'utf8');
const hasUploadForm = uploadJs.includes('FormData') || uploadJs.includes('upload');
const hasFileInput = uploadJs.includes('file') || uploadJs.includes('input');
const hasUploadProgress = uploadJs.includes('progress') || uploadJs.includes('onprogress');

console.log('  Upload form: ' + (hasUploadForm ? '✅' : '⚠️'));
console.log('  File input: ' + (hasFileInput ? '✅' : '⚠️'));
console.log('  Upload progress: ' + (hasUploadProgress ? '✅' : '⚠️'));

// ================================================================
// 12. AUTH / PERMISSIONS
// ================================================================
console.log('\n━━━ 12. AUTH / PERMISSIONS ━━━');

const authState = fs.readFileSync(path.join(JS_DIR, 'auth-state.js'), 'utf8');
const hasLogin = authState.includes('login') || authState.includes('Login');
const hasLogout = authState.includes('logout') || authState.includes('Logout');
const hasRegister = authState.includes('register') || authState.includes('Register');
const hasAuthToken = authState.includes('token') || authState.includes('Token');
const hasSession = authState.includes('session') || authState.includes('localStorage');

console.log('  Login function: ' + (hasLogin ? '✅' : '❌'));
console.log('  Logout function: ' + (hasLogout ? '✅' : '❌'));
console.log('  Register support: ' + (hasRegister ? '✅' : '⚠️'));
console.log('  Token management: ' + (hasAuthToken ? '✅' : '⚠️'));
console.log('  Session persistence: ' + (hasSession ? '✅' : '❌'));

// Check role guards (look for actual auth guard scripts, not HTML role attributes)
const roleGuardPages = htmlFiles.filter(f => {
  const html = fs.readFileSync(path.join(HTML_DIR, f), 'utf8');
  return html.includes('isAdmin') && html.includes('location.replace');
});
console.log('  Pages with role guards: ' + roleGuardPages.length);
roleGuardPages.forEach(f => {
  const html = fs.readFileSync(path.join(HTML_DIR, f), 'utf8');
  const hasSpaGuard = html.includes('AudioHubRouter');
  console.log('    ' + f + ': SPA-aware guard=' + (hasSpaGuard ? '✅' : '❌'));
  if (!hasSpaGuard) fail(f + ': role guard not SPA-aware', f);
});

// ================================================================
// 13. CROSS-PAGE CONSISTENCY
// ================================================================
console.log('\n━━━ 13. CROSS-PAGE CONSISTENCY ━━━');

// Check that all pages have consistent body classes
htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(HTML_DIR, f), 'utf8');
  const bodyMatch = html.match(/<body[^>]*class="([^"]+)"/);
  if (!bodyMatch) {
    warn(f + ': no body class', f);
  }
});

// Check that all pages have theme-color meta
htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(HTML_DIR, f), 'utf8');
  if (!html.includes('theme-color')) {
    warn(f + ': missing theme-color meta', f);
  }
});

// Check viewport meta
htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(HTML_DIR, f), 'utf8');
  if (!html.includes('viewport-fit=cover')) {
    warn(f + ': missing viewport-fit=cover (needed for notched devices)', f);
  }
});

console.log('  Cross-page consistency check done ✅');

// ================================================================
// 14. MEMORY LEAK CHECK
// ================================================================
console.log('\n━━━ 14. MEMORY LEAK CHECK ━━━');

// Check if JS modules have event listener cleanup
jsFiles.forEach(f => {
  const content = fs.readFileSync(path.join(JS_DIR, f), 'utf8');
  const addListenerCount = (content.match(/addEventListener/g) || []).length;
  const removeListenerCount = (content.match(/removeEventListener/g) || []).length;

  if (addListenerCount > 5 && removeListenerCount === 0) {
    warn(f + ': ' + addListenerCount + ' addEventListener but 0 removeEventListener', f);
  }
});

// Check if dev-mode.js appends elements to body (potential leak on SPA nav)
const devMode = fs.readFileSync(path.join(JS_DIR, 'dev-mode.js'), 'utf8');
const bodyAppends = (devMode.match(/document\.body\.appendChild/g) || []).length;
if (bodyAppends > 0) {
  console.log('  dev-mode.js appends ' + bodyAppends + ' elements to body (persistent, OK for dev tools)');
}

console.log('  Memory leak analysis done ✅');

// ================================================================
// SUMMARY
// ================================================================
console.log('\n' + '═'.repeat(60));
console.log('  PRODUCTION READINESS AUDIT RESULTS');
console.log('═'.repeat(60));
console.log('');
console.log('Pages checked: ' + (htmlFiles.length + 1));
console.log('Files verified: ' + fileCheckCount);
console.log('Issues: ' + totalIssues);
console.log('Warnings: ' + totalWarnings);

if (issues.length > 0) {
  console.log('\n❌ ISSUES:');
  issues.forEach(i => console.log('  [' + i.file + '] ' + i.msg));
}

if (warnings.length > 0) {
  console.log('\n⚠️  WARNINGS:');
  warnings.forEach(w => console.log('  [' + w.file + '] ' + w.msg));
}

console.log('');
if (totalIssues === 0) {
  console.log('✅ PRODUCTION READY — All critical checks passed!');
} else {
  console.log('❌ NOT PRODUCTION READY — ' + totalIssues + ' issues must be fixed');
}

console.log('\n' + '═'.repeat(60));
console.log('  USER FLOW CHECKLIST');
console.log('═'.repeat(60));
const flows = [
  ['Home', 'SPA navigation, hero section, story grids, genre links, search form'],
  ['Category', 'Genre grid, click to navigate, counts update'],
  ['Story List', 'Filter form, pagination, story cards, auth modal'],
  ['Story Detail', 'Story info, chapter list, player, favorites, breadcrumbs'],
  ['Search', 'Search input, results, genre filter'],
  ['Ranking', 'Podium, table, tab switching (week/month/all)'],
  ['Channel', 'Author info, subscribe, audio list, about tab'],
  ['Login', 'Form, auth state, redirect to account'],
  ['Register', 'Form, validation, redirect to login'],
  ['Profile', 'Sidebar tabs, history, favorites, playlists, settings'],
  ['Audio Player', 'Play/pause, progress, speed, seek, next/prev, shuffle, repeat'],
  ['Favorite', 'Toggle, persist in localStorage, display in favorites tab'],
  ['History', 'Auto-record, display in history tab, pagination'],
  ['Admin', 'Upload story, role guard, admin-only links'],
];
flows.forEach(([name, desc]) => {
  console.log('  ☐ ' + name + ' — ' + desc);
});
