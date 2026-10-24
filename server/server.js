'use strict';
// Online room server: the rooms from shared/hub.js over WebSockets, and the page files.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const Hub = require('../shared/hub.js');

const PORT = +process.env.PORT || 8080;
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const STATIC = { '/': 'client/index.html', '/soundlab': 'client/soundlab.html' };
let SEA = null; try { const sea = require('node:sea'); if (sea.isSea()) SEA = sea; } catch (e) { /* older Node */ }

// Set by the single-file host program (host/exe.js): the links that reach this PC, for the host's own page.
const hostInfo = { on: false };   // filled by the host program: port, local, lan, public, upnp (pending/open/failed/off), reason
const isLocal = a => a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/hostinfo') {      // only for the host's own browser: visitors never see the PC's addresses
    if (!hostInfo.on || !isLocal(req.socket.remoteAddress)) { res.writeHead(404); return res.end('not found'); }
    const { on, ...info } = hostInfo;
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(info));
  }
  let file = STATIC[url];
  if (!file && (url.startsWith('/client/') || url.startsWith('/shared/'))) file = url.slice(1);
  if (!file) { res.writeHead(404); return res.end('not found'); }
  readStatic(file, (err, buf) => {
    if (err) { res.writeHead(err === 'forbidden' ? 403 : 404); return res.end(err === 'forbidden' ? '' : 'not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
});

/** The page files: from disk next to this script, or from the assets packed into the single-file build (host/build-exe.js). */
function readStatic(file, cb) {
  if (SEA) {
    let buf; try { buf = Buffer.from(SEA.getAsset(file)); } catch (e) { return cb('missing'); }
    return cb(null, buf);
  }
  const full = path.join(ROOT, file);
  if (!full.startsWith(ROOT)) return cb('forbidden');
  fs.readFile(full, (err, buf) => cb(err ? 'missing' : null, buf));
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });
// The rooms and the game live in the hub (shared/hub.js); this file only carries their messages over WebSockets.
const hub = Hub.create({ quickWait: +process.env.QUICK_WAIT || 60 });
const rooms = hub.rooms, sanitizeMaze = Hub.sanitizeMaze;

wss.on('connection', ws => {
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  const client = hub.connect(text => { if (ws.readyState === 1) ws.send(text); });
  ws.on('message', raw => client.message(String(raw)));
  ws.on('close', () => client.close());
});
setInterval(() => wss.clients.forEach(w => { if (!w.isAlive) return w.terminate(); w.isAlive = false; w.ping(); }), 15000);

if (require.main === module && !SEA) server.listen(PORT, () => console.log(`Pac-Man Vs. server on http://localhost:${PORT}`));
module.exports = { server, wss, hub, rooms, sanitizeMaze, hostInfo };
