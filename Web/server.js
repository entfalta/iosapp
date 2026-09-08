const http = require('http');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const port = Number(process.env.PORT || 5500);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.map': 'application/json; charset=utf-8'
};

function safeResolve(basePath, requestPath) {
  const normalized = path.normalize(requestPath).replace(/^\/+/, '');
  if (normalized.startsWith('..')) return null;
  return path.join(basePath, normalized);
}

function serveFile(res, filePath) {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://localhost:${port}`);
  let pathname = decodeURIComponent(requestUrl.pathname);

  if (pathname === '/' || pathname === '/index.html') {
    serveFile(res, path.join(rootDir, 'index.html'));
    return;
  }

  const requestedPath = safeResolve(rootDir, pathname);
  const hasFileExtension = path.extname(pathname) !== "";

  if (requestedPath && fs.existsSync(requestedPath) && fs.statSync(requestedPath).isFile()) {
    serveFile(res, requestedPath);
    return;
  }

  if (pathname.startsWith('/.netlify/functions/')) {
    res.statusCode = 404;
    res.end('Local Netlify function not available in plain localhost mode.');
    return;
  }

  if (!hasFileExtension) {
    const indexFile = path.join(rootDir, 'index.html');
    if (fs.existsSync(indexFile)) {
      serveFile(res, indexFile);
      return;
    }
  }

  res.statusCode = 404;
  res.end('Not found');
});

server.listen(port, () => {
  console.log(`Local shop server running at http://localhost:${port}`);
});
