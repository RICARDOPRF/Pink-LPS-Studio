'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const root = process.cwd();
const port = Number(process.env.PINK_TEST_PORT || 4173);
const types = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json; charset=utf-8',
  '.svg':'image/svg+xml', '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg'
};

const server = http.createServer((req, res) => {
  try {
    const parsed = new URL(req.url, `http://127.0.0.1:${port}`);
    const requested = decodeURIComponent(parsed.pathname === '/' ? '/index.html' : parsed.pathname);
    const file = path.resolve(root, `.${requested}`);
    if (!file.startsWith(root + path.sep)) {
      res.writeHead(403).end('Forbidden'); return;
    }
    const stat = fs.statSync(file);
    if (!stat.isFile()) throw new Error('not-file');
    res.writeHead(200, {
      'Content-Type': types[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    });
    fs.createReadStream(file).pipe(res);
  } catch (_) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Pink test server http://127.0.0.1:${port}`));

function shutdown() { server.close(() => process.exit(0)); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
