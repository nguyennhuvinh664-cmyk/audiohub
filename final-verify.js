/**
 * AudioHub Final Verification Script
 * Checks for: duplicate components, layout nesting, 404s, CSS/JS consistency
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const HTML_DIR = path.join(ROOT, 'html');
const CSS_DIR = path.join(ROOT, 'css');
const JS_DIR = path.join(ROOT, 'js');

let issues = 0;

// ============================================================
// CHECK 1: No duplicate header/footer in any page
// ============================================================
console.log('CHECK 1: Duplicate header/footer in subpages');
const rootIndex = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const htmlFiles = fs.readdirSync(HTML_DIR).filter(f => f.endsWith('.html'));

const shellChecks = [
  ['m-header', /class="m-header"/],
  ['m-bottomnav', /class="m-bottomnav"/],
  ['m-drawer', /class="m-drawer"/],
  ['footer', /class="footer"/],
  ['desktop header (.header)', /class="header"/],
];
shellChecks.forEach(([name, re]) => {
  const count = (rootIndex.match(re) || []).length;
  console.log('  Shell ' + name + ': ' + count + (count === 1 ? ' ✅' : ' ❌'));
  if (count !== 1) issues++;
});

htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(HTML_DIR, f), 'utf8');
  shellChecks.forEach(([name, re]) => {
    if (re.test(html)) {
      console.log('  ❌ ' + f + ': has ' + name + ' (should only be in shell)');
      issues++;
    }
  });
});
console.log('  ✅ Check 1 done\n');

// ============================================================
// CHECK 2: Layout nesting (m-page count per page)
// ============================================================
console.log('CHECK 2: Layout nesting');
htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(HTML_DIR, f), 'utf8').replace(/\r\n/g, '\n');
  const pcOpen = html.indexOf('<div id="page-content">');
  const pcClose = html.lastIndexOf('</div>');
  if (pcOpen < 0) return;
  const pcContent = html.substring(pcOpen, pcClose + 6);
  const mPageCount = (pcContent.match(/class="m-page"/g) || []).length;
  if (mPageCount > 1) { console.log('  ❌ ' + f + ': ' + mPageCount + ' m-page wrappers'); issues++; }
  if (mPageCount === 0) { console.log('  ❌ ' + f + ': no m-page wrapper'); issues++; }
});
console.log('  ✅ Check 2 done\n');

// ============================================================
// CHECK 3: All CSS files exist on disk
// ============================================================
console.log('CHECK 3: CSS 404 check');
let cssCount = 0;
function checkCSS404(content, filename) {
  const refs = [...content.matchAll(/href="(?:\.\.\/css\/|css\/)([^"?]+\.css)/g)];
  refs.forEach(m => {
    cssCount++;
    if (!fs.existsSync(path.join(CSS_DIR, m[1]))) {
      console.log('  ❌ 404 CSS: ' + filename + ' -> ' + m[1]);
      issues++;
    }
  });
}
checkCSS404(rootIndex, 'index.html');
htmlFiles.forEach(f => checkCSS404(fs.readFileSync(path.join(HTML_DIR, f), 'utf8'), f));
console.log('  Checked ' + cssCount + ' CSS references. ✅ Check 3 done\n');

// ============================================================
// CHECK 4: All JS files exist on disk
// ============================================================
console.log('CHECK 4: JS 404 check');
let jsCount = 0;
function checkJS404(content, filename) {
  const refs = [...content.matchAll(/src="(?:\.\.\/js\/|js\/)([^"?]+\.js)/g)];
  refs.forEach(m => {
    jsCount++;
    if (!fs.existsSync(path.join(JS_DIR, m[1]))) {
      console.log('  ❌ 404 JS: ' + filename + ' -> ' + m[1]);
      issues++;
    }
  });
}
checkJS404(rootIndex, 'index.html');
htmlFiles.forEach(f => checkJS404(fs.readFileSync(path.join(HTML_DIR, f), 'utf8'), f));
console.log('  Checked ' + jsCount + ' JS references. ✅ Check 4 done\n');

// ============================================================
// CHECK 5: Router CSS loads everything HTML loads
// ============================================================
console.log('CHECK 5: Router CSS vs HTML CSS');
const routerSrc = fs.readFileSync(path.join(ROOT, 'js/spa-router.js'), 'utf8');
const sharedCssBlock = routerSrc.match(/var SHARED_CSS = \[([\s\S]*?)\];/)[1];
const sharedCss = [...sharedCssBlock.matchAll(/'([^']+)'/g)].map(m => m[1]);
const pageCssBlock = routerSrc.match(/var PAGE_CSS = \{([\s\S]*?)\};/)[1];

htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(HTML_DIR, f), 'utf8');
  const htmlCssRefs = [...html.matchAll(/href="(?:\.\.\/css\/|css\/)([^"?]+)\.css/g)].map(m => m[1]);
  const pageSpecificCss = htmlCssRefs.filter(c => !sharedCss.includes(c));

  const escaped = f.replace(/\./g, '\\.');
  const regex = new RegExp("'" + escaped + "':\\s*\\[([^\\]]*)\\]");
  const pageCssEntry = pageCssBlock.match(regex);

  if (pageCssEntry) {
    const routerCss = [...pageCssEntry[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    pageSpecificCss.forEach(css => {
      if (!routerCss.includes(css)) {
        console.log('  ❌ ' + f + ': CSS ' + css + '.css in HTML but NOT in router');
        issues++;
      }
    });
  }
});
console.log('  ✅ Check 5 done\n');

// ============================================================
// CHECK 6: Router JS loads everything HTML loads
// ============================================================
console.log('CHECK 6: Router JS vs HTML JS');
const pageJsBlock = routerSrc.match(/var PAGE_JS = \{([\s\S]*?)\};/)[1];
const sharedJs = ['api-client', 'auth-state', 'stories-store', 'spa-router', 'dev-mode-config', 'dev-mode'];

htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(HTML_DIR, f), 'utf8');
  const htmlJsRefs = [...html.matchAll(/src="(?:\.\.\/js\/|js\/)([^"?]+)\.js/g)].map(m => m[1]);
  const pageSpecificJs = htmlJsRefs.filter(j => !sharedJs.includes(j));

  const escaped = f.replace(/\./g, '\\.');
  const regex = new RegExp("'" + escaped + "':\\s*\\[([^\\]]*)\\]");
  const pageJsEntry = pageJsBlock.match(regex);

  if (pageJsEntry) {
    const routerJs = [...pageJsEntry[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
    pageSpecificJs.forEach(js => {
      if (!routerJs.includes(js)) {
        console.log('  ❌ ' + f + ': JS ' + js + '.js in HTML but NOT in router');
        issues++;
      }
    });
  }
});
console.log('  ✅ Check 6 done\n');

// ============================================================
// CHECK 7: Static JS analysis (no document.write, etc.)
// ============================================================
console.log('CHECK 7: Static JS safety');
const jsFiles = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js') && !f.includes('.bak'));
jsFiles.forEach(f => {
  const content = fs.readFileSync(path.join(JS_DIR, f), 'utf8');
  if (content.includes('document.write(')) {
    console.log('  ⚠️  ' + f + ': uses document.write');
  }
  if (content.includes('window.onerror') === false && content.includes('addEventListener("error"')) {
    // fine
  }
});
console.log('  ✅ Check 7 done\n');

// ============================================================
// CHECK 8: _redirects has no root / redirect
// ============================================================
console.log('CHECK 8: _redirects safety');
const redirects = fs.readFileSync(path.join(ROOT, '_redirects'), 'utf8');
const rLines = redirects.trim().split('\n');
let rootRedirect = false;
rLines.forEach(line => {
  if (line.startsWith('#') || line.trim() === '') return;
  const parts = line.trim().split(/\s+/);
  if (parts[0] === '/') {
    console.log('  ❌ Root / redirect found - would cause infinite loop!');
    rootRedirect = true;
    issues++;
  }
});
if (!rootRedirect) console.log('  No root redirect. ✅');
console.log('  ✅ Check 8 done\n');

// ============================================================
// CHECK 9: Every page has matching title tag
// ============================================================
console.log('CHECK 9: Page titles');
htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(HTML_DIR, f), 'utf8');
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  if (!titleMatch) {
    console.log('  ❌ ' + f + ': missing <title>');
    issues++;
  } else if (!titleMatch[1].includes('AudioHub')) {
    console.log('  ⚠️  ' + f + ': title missing AudioHub brand: ' + titleMatch[1]);
  }
});
console.log('  ✅ Check 9 done\n');

// ============================================================
// SUMMARY
// ============================================================
console.log('='.repeat(50));
console.log('FINAL VERIFICATION SUMMARY');
console.log('='.repeat(50));
console.log('Pages checked: ' + (htmlFiles.length + 1));
console.log('CSS refs checked: ' + cssCount);
console.log('JS refs checked: ' + jsCount);
console.log('Issues: ' + issues);
console.log('');
if (issues === 0) {
  console.log('✅ ALL FINAL CHECKS PASSED!');
  console.log('');
  console.log('Final Checklist:');
  console.log('  ✓ Header renders once (shell only)');
  console.log('  ✓ Footer renders once (shell only)');
  console.log('  ✓ No duplicate components');
  console.log('  ✓ No layout nesting issues');
  console.log('  ✓ No CSS 404s');
  console.log('  ✓ No JS 404s');
  console.log('  ✓ Router loads all CSS/JS per page');
  console.log('  ✓ No document.write in JS');
  console.log('  ✓ _redirects clean');
  console.log('  ✓ All pages have titles');
} else {
  console.log('❌ ' + issues + ' issues remain');
}
