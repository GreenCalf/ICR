const http = require('http');
const fs = require('fs');
const path = require('path');

const app = (req, res) => {
  if (req.url === '/' || req.url === '/index.html' || req.url === '/login') {
    const filePath = path.join(__dirname, 'src', 'index.html');
    const content = fs.readFileSync(filePath);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(content);
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, type: 'frontend-placeholder' }));
  }
  res.writeHead(404);
  return res.end('Not found');
};

const server = http.createServer(app);
const port = Number(process.env.PORT || 3030);
server.listen(port, () => {
  console.log(`Frontend placeholder running at http://localhost:${port}`);
});
