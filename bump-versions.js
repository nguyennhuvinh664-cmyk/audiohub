#!/usr/bin/env node
/**
 * bump-versions.js
 * Gán / cập nhật version string (?v=...) cho mọi asset JS/CSS cục bộ
 * trong tất cả file HTML, để có thể cache immutable an toàn.
 *
 * Cách dùng:
 *   node bump-versions.js            # tự sinh version theo ngày + counter
 *   node bump-versions.js 20260828-2 # dùng version chỉ định
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;

// ── Xác định version ──
function nextVersion() {
  const d = new Date();
  const stamp =
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
  // Đọc version gần nhất từ package.json để tăng counter
  let counter = 1;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    if (pkg._assetVersion && pkg._assetVersion.startsWith(stamp + '-')) {
      counter = parseInt(pkg._assetVersion.split('-')[1], 10) + 1;
    }
    pkg._assetVersion = stamp + '-' + counter;
    fs.writeFileSync(path.join(ROOT, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  } catch (e) {
    counter = 1;
  }
  return stamp + '-' + counter;
}

const VERSION = process.argv[2] || nextVersion();
console.log('→ Asset version:', VERSION);

// ── Gom tất cả file HTML ──
function findHtml(dir, out) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const full = path.join(dir, name);
    const st = fs.statSync(full);
    if (st.isDirectory()) findHtml(full, out);
    else if (name.endsWith('.html')) out.push(full);
  }
  return out;
}
const htmlFiles = findHtml(ROOT, []);

// ── Kiểm tra có phải asset cục bộ không ──
function isLocalAsset(url) {
  if (!url) return false;
  if (/^(https?:)?\/\//i.test(url)) return false; // CDN / external
  if (url.startsWith('data:')) return false;
  if (url.startsWith('#')) return false;
  return /\.(js|css)(\?|$)/i.test(url);
}

// ── Thay / gắn version ──
let totalChanged = 0;
for (const file of htmlFiles) {
  let src = fs.readFileSync(file, 'utf8');
  let count = 0;

  // src="..." và href="..."
  src = src.replace(/(src|href)=("([^"]+)"|'([^']+)')/g, (m, attr, quoted, dq, sq) => {
    const url = dq !== undefined ? dq : sq;
    if (!isLocalAsset(url)) return m;
    const quote = dq !== undefined ? '"' : "'";
    // Tách phần path và query
    const [base, query] = url.split('?');
    let newUrl;
    if (query === undefined) {
      newUrl = base + '?v=' + VERSION;
    } else {
      // thay v= cũ nếu có, giữ các param khác
      const params = query.split('&').filter((p) => p && !p.startsWith('v='));
      params.push('v=' + VERSION);
      newUrl = base + '?' + params.join('&');
    }
    count++;
    return attr + '=' + quote + newUrl + quote;
  });

  if (count > 0) {
    fs.writeFileSync(file, src);
    totalChanged += count;
    console.log('  ✓', path.relative(ROOT, file), '(' + count + ' assets)');
  }
}

console.log('\nĐã version hóa', totalChanged, 'asset trong', htmlFiles.length, 'file HTML.');

// ── Đồng bộ ASSET_VERSION trong spa-router.js ──
const routerPath = path.join(ROOT, 'js', 'spa-router.js');
if (fs.existsSync(routerPath)) {
  let routerSrc = fs.readFileSync(routerPath, 'utf8');
  const updated = routerSrc.replace(
    /var ASSET_VERSION = '[^']*';/,
    "var ASSET_VERSION = '" + VERSION + "';"
  );
  if (updated !== routerSrc) {
    fs.writeFileSync(routerPath, updated);
    console.log('  ✓ js/spa-router.js ASSET_VERSION →', VERSION);
  }
}

console.log('Version:', VERSION);
