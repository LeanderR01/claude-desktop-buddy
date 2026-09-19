// Tiny static server for browser-testing the renderer (mock mode).
const http = require('http');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'renderer');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

http
  .createServer((req, res) => {
    const file = path.join(dir, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
    fs.readFile(file, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'text/plain' });
      res.end(data);
    });
  })
  .listen(8917, () => console.log('serving renderer on http://localhost:8917'));
