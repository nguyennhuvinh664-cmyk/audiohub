const http = require('http');
const fs = require('fs');
const path = require('path');

const root = process.cwd();

function getPathname(urlPath) {
  return decodeURIComponent(String(urlPath || '/').split('?')[0]);
}

function toFilePath(pathname) {
  let p = String(pathname || '/');
  if (p === '/' || p === '') p = '/html/index.html';
  if (p.endsWith('/')) p = p + 'index.html';
  return path.join(root, p);
}

function contentType(fp) {
  const ext = path.extname(fp).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };
  return map[ext] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  const pathname = getPathname(req.url);

  function serve(pathnameToServe) {
    const fp = toFilePath(pathnameToServe);
    fs.stat(fp, (err, stat) => {
      if (err || !stat.isFile()) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.end('Not found');
        return;
      }
      res.statusCode = 200;
      res.setHeader('Content-Type', contentType(fp));
      fs.createReadStream(fp).pipe(res);
    });
  }

  // Support links like /new-posts.html by mapping to /html/new-posts.html
  if (pathname !== '/' && !pathname.startsWith('/html/') && pathname.endsWith('.html')) {
    return serve('/html' + pathname);
  }

  if (pathname === '/html') {
    return serve('/html/index.html');
  }

  return serve(pathname);
});

server.listen(5500, '127.0.0.1', () => {
  console.log('static server http://127.0.0.1:5500/');
});
