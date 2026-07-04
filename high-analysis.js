/**
 * HIGH Phase Analysis Script
 * Identifies all High priority issues before fixing
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const HTML_DIR = path.join(ROOT, 'html');
const CSS_DIR = path.join(ROOT, 'css');
const JS_DIR = path.join(ROOT, 'js');

const routerSrc = fs.readFileSync(path.join(ROOT, 'js/spa-router.js'), 'utf8');
const sharedCssBlock = routerSrc.match(/var SHARED_CSS = \[([\s\S]*?)\];/)[1];
const sharedCss = [...sharedCssBlock.matchAll(/'([^']+)'/g)].map(m => m[1]);
const pageCssBlock = routerSrc.match(/var PAGE_CSS = \{([\s\S]*?)\};/)[1];
const pageJsBlock = routerSrc.match(/var PAGE_JS = \{([\s\S]*?)\};/)[1];

const htmlFiles = fs.readdirSync(HTML_DIR).filter(f => f.endsWith('.html'));

// ============================================================
// HIGH-1: Missing CSS on SPA navigation
// ============================================================
console.log('=== HIGH-1: Missing CSS on SPA navigation ===');
htmlFiles.forEach(f => {
  const html = fs.readFileSync(path.join(HTML_DIR, f), 'utf8');
  const htmlCssRefs = [...html.matchAll(/href="(?:\.\.\/css\/|css\/)([^"?]+)\.css/g)].map(m => m[1]);
  const missingOnSpa = htmlCssRefs.filter(c => {
    if (sharedCss.includes(c)) return false;
    const escaped = f.replace(/\./g, '\\.');
    const regex = new RegExp("'" + escaped + "':\\s*\\[([^\\]]*)\\]");
    const pageCssEntry = pageCssBlock.match(regex);
    if (pageCssEntry) {
      const routerCss = [...pageCssEntry[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
      return !routerCss.includes(c);
    }
    return true;
  });
  if (missingOnSpa.length > 0) {
    console.log('  ' + f + ': MISSING -> ' + missingOnSpa.join(', '));
  }
});
console.log('');

// ============================================================
// HIGH-2: Component CSS coverage
// ============================================================
console.log('=== HIGH-2: Component CSS coverage ===');

// Check auth pages styling
const authStateCss = fs.readFileSync(path.join(CSS_DIR, 'auth-state.css'), 'utf8');
const styleCategoriesCss = fs.readFileSync(path.join(CSS_DIR, 'style-categories.css'), 'utf8');
const mobileAppCss = fs.readFileSync(path.join(CSS_DIR, 'mobile-app.css'), 'utf8');

const authClasses = ['auth-main', 'auth-shell', 'auth-card', 'auth-form', 'auth-title', 'auth-socials', 'auth-benefits', 'auth-kicker', 'auth-subtitle', 'auth-divider', 'auth-link', 'auth-switch', 'auth-submit', 'auth-note', 'auth-statbox', 'auth-stat', 'auth-required-modal'];
console.log('Auth class coverage:');
authClasses.forEach(cls => {
  const inAuth = authStateCss.includes('.' + cls);
  const inCat = styleCategoriesCss.includes('.' + cls);
  const inMobile = mobileAppCss.includes('.' + cls);
  const sources = [];
  if (inAuth) sources.push('auth-state');
  if (inCat) sources.push('style-categories');
  if (inMobile) sources.push('mobile-app');
  if (sources.length === 0) console.log('  ⚠️  .' + cls + ': NOT DEFINED IN ANY CSS');
  else if (sources.length === 1) console.log('  .' + cls + ': only in ' + sources[0]);
});

// Check header components in style-index.css
const styleIndexCss = fs.readFileSync(path.join(CSS_DIR, 'style-index.css'), 'utf8');
console.log('\nHeader/footer in style-index.css:');
const headerClasses = ['header', 'header__in', 'logo', 'nav', 'nav__link', 'footer', 'ft-grid', 'ft-brand', 'ft-col', 'ft-btm'];
headerClasses.forEach(cls => {
  const inIndex = styleIndexCss.includes('.' + cls);
  const inCat = styleCategoriesCss.includes('.' + cls);
  console.log('  .' + cls + ': style-index=' + inIndex + ', style-categories=' + inCat);
});

// ============================================================
// HIGH-3: Layout issues - check m-page nesting
// ============================================================
console.log('\n=== HIGH-3: Layout nesting impact ===');
console.log('Shell has: <div class="m-page"> inside #page-content');
console.log('Subpages have: <div class="m-page"> inside their #page-content');
console.log('Result: double nesting <div class="m-page"><div class="m-page">');
console.log('Check if m-page CSS handles this...');

const mPageRules = [];
[styleIndexCss, styleCategoriesCss, mobileAppCss, mobileSharedCss = ''].forEach((css, i) => {
  const names = ['style-index', 'style-categories', 'mobile-app', 'mobile-shared'];
  const matches = [...css.matchAll(/\.m-page\s*\{[^}]+\}/g)];
  if (matches.length > 0) {
    console.log('  ' + names[i] + ': ' + matches.length + ' .m-page rules');
    matches.forEach(m => console.log('    ' + m[0].substring(0, 100)));
  }
});

// ============================================================
// HIGH-4: Missing JS functionality
// ============================================================
console.log('\n=== HIGH-4: Missing JS on SPA navigation ===');
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
    const missing = pageSpecificJs.filter(js => !routerJs.includes(js));
    if (missing.length > 0) {
      console.log('  ' + f + ': MISSING JS -> ' + missing.join(', '));
    }
  } else if (pageSpecificJs.length > 0) {
    console.log('  ' + f + ': NO ROUTER ENTRY, has JS: ' + pageSpecificJs.join(', '));
  }
});

// ============================================================
// HIGH-5: Shared component issues
// ============================================================
console.log('\n=== HIGH-5: Shared component analysis ===');

// Check if auth-state.js properly handles SPA re-render
const authStateJs = fs.readFileSync(path.join(JS_DIR, 'auth-state.js'), 'utf8');
const hasSpaListener = authStateJs.includes('spa:navigated');
const hasRenderFunction = authStateJs.includes('renderHeaderAuth');
console.log('auth-state.js:');
console.log('  Has renderHeaderAuth: ' + hasRenderFunction);
console.log('  Listens to spa:navigated: ' + hasSpaListener);
console.log('  Called by router reinitSharedModules: ' + routerSrc.includes('renderHeaderAuth'));

// Check stories-store.js
const storiesStoreJs = fs.readFileSync(path.join(JS_DIR, 'stories-store.js'), 'utf8');
const hasSync = storiesStoreJs.includes('sync');
const hasRead = storiesStoreJs.includes('read');
console.log('\nstories-store.js:');
console.log('  Has sync: ' + hasSync);
console.log('  Has read: ' + hasRead);

// Check if channel-ui.js depends on m-page
const channelUiJs = fs.readFileSync(path.join(JS_DIR, 'channel-ui.js'), 'utf8');
const channelDependsOn = [...channelUiJs.matchAll(/document\.querySelector\('([^']+)'\)/g)].map(m => m[1]);
console.log('\nchannel-ui.js depends on:');
channelDependsOn.forEach(sel => console.log('  ' + sel));

// Check story-detail-ui.js dependencies
const storyDetailJs = fs.readFileSync(path.join(JS_DIR, 'story-detail-ui.js'), 'utf8');
const detailDeps = [...storyDetailJs.matchAll(/document\.querySelector\('([^']+)'\)/g)].slice(0, 10).map(m => m[1]);
console.log('\nstory-detail-ui.js depends on (first 10):');
detailDeps.forEach(sel => console.log('  ' + sel));
