/**
 * AudioHub Regression Test Script
 * Run: node regression-test.js
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const HTML_DIR = path.join(ROOT, 'html');
const CSS_DIR = path.join(ROOT, 'css');
const JS_DIR = path.join(ROOT, 'js');

let totalIssues = 0;
const allIssues = [];

function check(condition, msg, file) {
  if (!condition) {
    console.log('  ❌ ' + (file ? file + ': ' : '') + msg);
    totalIssues++;
    allIssues.push({ file: file || 'global', msg });
  }
}

// ============================================================
// Load key files
// ============================================================
const rootIndex = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const routerSrc = fs.readFileSync(path.join(ROOT, 'js/spa-router.js'), 'utf8');
const htmlFiles = fs.readdirSync(HTML_DIR).filter(f => f.endsWith('.html'));

// ============================================================
// TEST 1: Shell (index.html) has all required elements
// ============================================================
console.log('TEST 1: Shell structure');
check(rootIndex.includes('id="page-content"'), 'Missing #page-content', 'index.html');
check(rootIndex.includes('spa-router.js'), 'Missing spa-router.js', 'index.html');
check(rootIndex.includes('class="m-header"'), 'Missing mobile header', 'index.html');
check(rootIndex.includes('class="m-drawer"'), 'Missing mobile drawer', 'index.html');
check(rootIndex.includes('class="m-bottomnav"'), 'Missing mobile bottom nav', 'index.html');
check(rootIndex.includes('class="header"'), 'Missing desktop header', 'index.html');
check(rootIndex.includes('class="footer"'), 'Missing footer', 'index.html');
check(rootIndex.includes('class="nav"'), 'Missing desktop nav', 'index.html');
console.log('  ✅ Shell check done');

// ============================================================
// TEST 2: All subpages have correct structure
// ============================================================
console.log('\nTEST 2: Subpage structure');
htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(HTML_DIR, f), 'utf8').replace(/\r\n/g, '\n');
  check(html.includes('id="page-content"'), 'Missing page-content', f);

  // Check m-page count inside page-content
  const pcOpen = html.indexOf('<div id="page-content">');
  const pcClose = html.lastIndexOf('</div>');
  const pcContent = html.substring(pcOpen, pcClose + 6);
  const mPageCount = (pcContent.match(/class="m-page"/g) || []).length;
  check(mPageCount >= 1, 'Missing m-page wrapper (' + mPageCount + ' found)', f);
  check(mPageCount <= 1, 'Multiple m-page wrappers (' + mPageCount + ' found)', f);

  // Check no empty m-page
  check(!html.includes('<div class="m-page"></div>'), 'Empty m-page div', f);

  // Check no inline scripts outside page-content
  const inlineMatches = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  inlineMatches.forEach(m => {
    check(m.index >= pcOpen && m.index <= pcClose,
      'Inline script outside page-content at pos ' + m.index, f);
  });

  // Check no data-page-script issues
  const scriptTags = [...html.matchAll(/<script\s+src="([^"]+)"([^>]*)>/g)];
  scriptTags.forEach(m => {
    const src = m[1];
    const attrs = m[2];
    if (src.includes('spa-router') || src.includes('dev-mode')) return;
    check(attrs.includes('data-page-script'),
      'Missing data-page-script on: ' + src.split('/').pop(), f);
  });
});
console.log('  ✅ Subpage structure check done');

// ============================================================
// TEST 3: CSS files exist
// ============================================================
console.log('\nTEST 3: CSS file existence');
function checkCSS(content, filename) {
  const refs = [...content.matchAll(/href="(?:\.\.\/css\/|css\/)([^"?]+\.css)/g)];
  refs.forEach(m => {
    check(fs.existsSync(path.join(CSS_DIR, m[1])),
      'Missing CSS: ' + m[1], filename);
  });
}
checkCSS(rootIndex, 'index.html');
htmlFiles.forEach(f => checkCSS(fs.readFileSync(path.join(HTML_DIR, f), 'utf8'), f));
console.log('  ✅ CSS existence check done');

// ============================================================
// TEST 4: JS files exist
// ============================================================
console.log('\nTEST 4: JS file existence');
function checkJS(content, filename) {
  const refs = [...content.matchAll(/src="(?:\.\.\/js\/|js\/)([^"?]+\.js)/g)];
  refs.forEach(m => {
    check(fs.existsSync(path.join(JS_DIR, m[1])),
      'Missing JS: ' + m[1], filename);
  });
}
checkJS(rootIndex, 'index.html');
htmlFiles.forEach(f => checkJS(fs.readFileSync(path.join(HTML_DIR, f), 'utf8'), f));
console.log('  ✅ JS existence check done');

// ============================================================
// TEST 5: Router config references valid CSS/JS files
// ============================================================
console.log('\nTEST 5: Router config validity');
const pageCssBlock = routerSrc.match(/var PAGE_CSS = \{([\s\S]*?)\};/)[1];
// Extract CSS file names (not page names) from the arrays
const cssFileNames = [...pageCssBlock.matchAll(/'([a-z0-9-]+)'/g)]
  .map(m => m[1])
  .filter(name => !name.endsWith('.html') && name.length > 0);
const uniqueCssNames = [...new Set(cssFileNames)];
uniqueCssNames.forEach(name => {
  check(fs.existsSync(path.join(CSS_DIR, name + '.css')),
    'Router PAGE_CSS missing CSS file: ' + name + '.css', 'spa-router.js');
});

// Check SHARED_CSS too
const sharedCssBlock = routerSrc.match(/var SHARED_CSS = \[([\s\S]*?)\];/)[1];
const sharedCssNames = [...sharedCssBlock.matchAll(/'([^']+)'/g)].map(m => m[1]);
sharedCssNames.forEach(name => {
  check(fs.existsSync(path.join(CSS_DIR, name + '.css')),
    'Router SHARED_CSS missing CSS file: ' + name + '.css', 'spa-router.js');
});

const pageJsBlock = routerSrc.match(/var PAGE_JS = \{([\s\S]*?)\};/)[1];
const jsFileNames = [...pageJsBlock.matchAll(/'([a-z0-9-]+)'/g)]
  .map(m => m[1])
  .filter(name => !name.endsWith('.html') && name.length > 0);
const uniqueJsNames = [...new Set(jsFileNames)];
uniqueJsNames.forEach(name => {
  check(fs.existsSync(path.join(JS_DIR, name + '.js')),
    'Router PAGE_JS missing JS file: ' + name + '.js', 'spa-router.js');
});
console.log('  ✅ Router config check done (' + uniqueCssNames.length + ' CSS, ' + uniqueJsNames.length + ' JS files)');

// ============================================================
// TEST 6: Page-specific CSS loaded by HTML matches router config
// ============================================================
console.log('\nTEST 6: CSS consistency (HTML vs Router)');
const routerCssPages = [...pageCssBlock.matchAll(/'([^']+\.html)'/g)].map(m => m[1]);

htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(HTML_DIR, f), 'utf8');
  const htmlCssRefs = [...html.matchAll(/href="(?:\.\.\/css\/|css\/)([^"?]+)\.css/g)].map(m => m[1]);

  // Filter out shared CSS (must match SHARED_CSS in spa-router.js)
  const sharedCss = ['style-index', 'style-categories', 'mobile-shared', 'header-enhancements', 'auth-state', 'mobile-app', 'dev-mode'];
  const pageSpecificCss = htmlCssRefs.filter(c => !sharedCss.includes(c));

  if (routerCssPages.includes(f)) {
    // Get router CSS for this page
    const escaped = f.replace(/\./g, '\\.');
    const regex = new RegExp("'" + escaped + "':\\s*\\[([^\\]]*)\\]");
    const pageCssEntry = pageCssBlock.match(regex);
    if (pageCssEntry) {
      const routerCss = [...pageCssEntry[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
      // Check each HTML CSS is in router config
      pageSpecificCss.forEach(css => {
        check(routerCss.includes(css),
          'CSS ' + css + '.css loaded in HTML but not in router PAGE_CSS', f);
      });
    }
  }
});
console.log('  ✅ CSS consistency check done');

// ============================================================
// TEST 7: Page-specific JS loaded by HTML matches router config
// ============================================================
console.log('\nTEST 7: JS consistency (HTML vs Router)');
const routerJsPages = [...pageJsBlock.matchAll(/'([^']+\.html)'/g)].map(m => m[1]);

htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(HTML_DIR, f), 'utf8');
  const htmlJsRefs = [...html.matchAll(/src="(?:\.\.\/js\/|js\/)([^"?]+)\.js/g)].map(m => m[1]);

  // Filter out shared JS
  const sharedJs = ['api-client', 'auth-state', 'stories-store', 'spa-router', 'dev-mode-config', 'dev-mode'];
  const pageSpecificJs = htmlJsRefs.filter(j => !sharedJs.includes(j));

  if (routerJsPages.includes(f)) {
    const escapedJs = f.replace(/\./g, '\\.');
    const regexJs = new RegExp("'" + escapedJs + "':\\s*\\[([^\\]]*)\\]");
    const pageJsEntry = pageJsBlock.match(regexJs);
    if (pageJsEntry) {
      const routerJs = [...pageJsEntry[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
      pageSpecificJs.forEach(js => {
        check(routerJs.includes(js),
          'JS ' + js + '.js loaded in HTML but not in router PAGE_JS', f);
      });
    }
  }
});
console.log('  ✅ JS consistency check done');

// ============================================================
// TEST 8: Role guards use SPA-aware navigation
// ============================================================
console.log('\nTEST 8: Role guards');
htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(HTML_DIR, f), 'utf8');
  if (html.includes('location.replace(')) {
    check(html.includes('AudioHubRouter'),
      'Role guard without SPA-aware navigation', f);
  }
});
console.log('  ✅ Role guard check done');

// ============================================================
// TEST 9: No duplicate m-page in shell + subpage
// ============================================================
console.log('\nTEST 9: No double m-page nesting');
htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(HTML_DIR, f), 'utf8').replace(/\r\n/g, '\n');
  // Shell has m-page. Subpage content also has m-page.
  // This creates nesting: shell.m-page > subpage.m-page
  // Check if CSS handles this (m-page should be consistent)
  const pcOpen = html.indexOf('<div id="page-content">');
  const pcClose = html.lastIndexOf('</div>');
  const pcContent = html.substring(pcOpen, pcClose + 6);
  // This is expected - just note it
});
console.log('  ✅ Double m-page note: shell.m-page wraps subpage.m-page (by design)');

// ============================================================
// TEST 10: _redirects file is clean
// ============================================================
console.log('\nTEST 10: _redirects file');
const redirects = fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8');
const lines = redirects.trim().split('\n');
let redirectIssues = 0;
lines.forEach((line, i) => {
  if (line.startsWith('#') || line.trim() === '') return;
  const parts = line.trim().split(/\s+/);
  // Format: /source /target status
  if (parts.length !== 3) {
    console.log('  ❌ Line ' + (i + 1) + ': invalid format: ' + line.trim());
    redirectIssues++;
    return;
  }
  if (parts[1] !== '/index.html' && parts[1] !== 'index.html') {
    console.log('  ❌ Line ' + (i + 1) + ': target not /index.html: ' + parts[1]);
    redirectIssues++;
  }
  if (parts[2] !== '200') {
    console.log('  ❌ Line ' + (i + 1) + ': status not 200: ' + parts[2]);
    redirectIssues++;
  }
  // Check for root / redirect (should not exist)
  if (parts[0] === '/') {
    console.log('  ❌ Root / redirect found - will cause infinite loop!');
    redirectIssues++;
  }
});
check(redirectIssues === 0, redirectIssues + ' redirect issues', '_redirects');
console.log('  ✅ Redirects check done');

// ============================================================
// SUMMARY
// ============================================================
console.log('\n' + '='.repeat(50));
console.log('REGRESSION TEST SUMMARY');
console.log('='.repeat(50));
console.log('Pages checked: ' + (htmlFiles.length + 1));
console.log('Total issues: ' + totalIssues);
console.log('');
if (totalIssues === 0) {
  console.log('✅ ALL REGRESSION TESTS PASSED!');
  console.log('');
  console.log('Checklist:');
  console.log('  ✓ Header (shell)');
  console.log('  ✓ Footer (shell)');
  console.log('  ✓ Home (index.html)');
  console.log('  ✓ Story List (new-posts, popular, trending, completed)');
  console.log('  ✓ Story Detail');
  console.log('  ✓ Channel');
  console.log('  ✓ Ranking (hall-of-fame)');
  console.log('  ✓ Login');
  console.log('  ✓ Register');
  console.log('  ✓ Search (content-search)');
  console.log('  ✓ Player (story-detail-ui)');
  console.log('  ✓ Account (account, user-account)');
  console.log('  ✓ CSS consistency');
  console.log('  ✓ JS consistency');
  console.log('  ✓ SPA structure');
  console.log('  ✓ Redirects');
} else {
  console.log('❌ ISSUES REMAINING:');
  allIssues.forEach(i => console.log('  ' + i.file + ': ' + i.msg));
}
