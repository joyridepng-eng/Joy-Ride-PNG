const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { check, sha, listFiles, TEST_API } = require('./admin-safety-web-utils.cjs');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf', '.webp': 'image/webp', '.wasm': 'application/wasm' };
function createServer(root, mapsKey = null) {
  const absolute = path.resolve(root);
  return http.createServer((req, res) => {
    try {
      if (req.headers.host !== 'localhost:8081') { res.writeHead(403); res.end(); return; }
      if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end(); return; }
      const url = new URL(req.url, 'http://localhost:8081');
      if (url.pathname === '/__joyride/maps-config') {
        if (!mapsKey || !/^AIza[0-9A-Za-z_-]{35}$/.test(mapsKey)) { res.writeHead(503, { 'Cache-Control': 'no-store' }); res.end(); return; }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
        res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ safetyTest: true, key: mapsKey }));
        return;
      }
      let name = decodeURIComponent(url.pathname);
      if (name.includes('\0') || name.includes('\\')) throw new Error();
      let file = path.resolve(absolute, `.${name}`);
      if (!file.startsWith(absolute + path.sep) && file !== absolute) throw new Error();
      if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
        if (path.extname(name)) { res.writeHead(404); res.end(); return; }
        file = path.join(absolute, 'index.html');
      }
      const bytes = fs.readFileSync(file);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'DENY' });
      res.end(req.method === 'HEAD' ? undefined : bytes);
    } catch { res.writeHead(400); res.end(); }
  });
}
if (require.main === module) {
  try {
    check(process.argv[2] && path.isAbsolute(process.argv[2]));
    const exportFolder = process.argv[2];
    const receipt = JSON.parse(fs.readFileSync(path.join(exportFolder, 'web-receipt.json'), 'utf8'));
    check(receipt.api === TEST_API && receipt.state === 'verified-repository-web-export');
    const root = path.join(exportFolder, 'dist');
    check(JSON.stringify(listFiles(root)) === JSON.stringify(receipt.files.map((item) => item.path)));
    for (const entry of receipt.files) check(sha(fs.readFileSync(path.join(root, entry.path))) === entry.sha256);
    const mapsKey = process.env.JR_SAFETY_WEB_MAPS_KEY;
    delete process.env.JR_SAFETY_WEB_MAPS_KEY;
    check(typeof mapsKey === 'string' && /^AIza[0-9A-Za-z_-]{35}$/.test(mapsKey));
    const server = createServer(root, mapsKey);
    server.on('error', () => { console.log('STOP: Local server could not start. Raw details withheld.'); process.exitCode = 1; });
    server.listen(8081, '127.0.0.1', () => {
      console.log('PASS: Verified Admin Safety Test website is serving on laptop loopback only.');
      console.log('Open http://localhost:8081 in your laptop browser.');
      console.log('Keep this window open. Press Ctrl+C to stop. Keep all PRs Draft.');
    });
  } catch { console.log('STOP: Local web receipt or files did not verify. Nothing started.'); process.exitCode = 1; }
}
module.exports = { createServer };
