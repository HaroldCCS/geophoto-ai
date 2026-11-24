/**
 * GeoPhoto Report AI - Servidor HTTP Local para PWA y Service Worker
 * Ejecuta un servidor local ligero sin dependencias externas
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8080;
const BASE_DIR = path.resolve(__dirname, '..', 'app');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pdf': 'application/pdf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

const server = http.createServer((req, res) => {
  // Manejo de URL y ruta segura
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  const filePath = path.normalize(path.join(BASE_DIR, reqPath));

  // Prevenir Directory Traversal
  if (!filePath.startsWith(BASE_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Prohibido');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 No Encontrado');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    // Headers de caché y Service Worker
    const headers = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    };

    // Service-Worker-Allowed header para sw.js
    if (path.basename(filePath) === 'sw.js') {
      headers['Service-Worker-Allowed'] = '/';
    }

    res.writeHead(200, headers);
    const readStream = fs.createReadStream(filePath);
    readStream.pipe(res);
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`========================================================`);
  console.log(`  GeoPhoto Report AI - Servidor PWA Offline Activo`);
  console.log(`  URL: http://localhost:${PORT}`);
  console.log(`  Directorio: ${BASE_DIR}`);
  console.log(`========================================================`);
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`[PWA Server] Puerto ${PORT} en uso, el servidor ya se encuentra activo.`);
    process.exit(0);
  } else {
    console.error('[PWA Server] Error:', e.message);
  }
});
