'use strict';
// Online room server: authoritative simulation, WebSocket transport, static file host.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const Sim = require('../shared/sim.js');
const { Match } = require('../shared/match.js');

const PORT = +process.env.PORT || 8080;
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const STATIC = { '/': 'client/index.html' };

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  let file = STATIC[url];
  if (!file && (url.startsWith('/client/') || url.startsWith('/shared/'))) file = url.slice(1);
  if (!file) { res.writeHead(404); return res.end('not found'); }
  const full = path.join(ROOT, file);
  if (!full.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  fs.readFile(full, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });
const rooms = new Map();

class Room {
  constructor(code) {
    this.code = code;
    this.slots = [null, null, null, null];      // ws or null (CPU)
    this.names = ['CPU', 'CPU', 'CPU', 'CPU'];
    this.host = -1;
    this.inputs = [null, null, null, null];
    this.match = new Match(i => !!this.slots[i]);
    this.timer = null;
  }
  humans() { return this.slots.filter(Boolean).length; }
  add(ws, name) {
    const i = this.slots.indexOf(null);
    if (i < 0) return -1;
    this.slots[i] = ws; this.names[i] = name; ws.slot = i; ws.room = this;
    if (this.host < 0) this.host = i;
    return i;
  }
  remove(ws) {
    const i = ws.slot;
    this.slots[i] = null; this.names[i] = 'CPU'; this.inputs[i] = null;
    ws.room = null;
    if (this.host === i) this.host = this.slots.findIndex(Boolean);
    if (!this.humans()) { clearInterval(this.timer); rooms.delete(this.code); return; }
    this.broadcastRoom();
  }
  send(i, obj) { const w = this.slots[i]; if (w && w.readyState === 1) w.send(JSON.stringify(obj)); }
  roomInfo(i) {
    const m = this.match;
    return { t: 'room', code: this.code, you: i, host: this.host, phase: m.phase,
      players: this.names.map((n, k) => ({ name: n, cpu: !this.slots[k] })), scores: m.scores, round: m.round };
  }
  broadcastRoom() { for (let i = 0; i < 4; i++) this.send(i, this.roomInfo(i)); }
  start() {
    if (this.match.phase !== 'lobby' && this.match.phase !== 'final') return;
    this.inputs = [null, null, null, null];
    this.match.start();
    this.broadcastRoom();
    if (!this.timer) this.timer = setInterval(() => this.tick(), Sim.CFG.tick * 1000);
  }
  tick() {
    const m = this.match;
    if (!m.active()) return;
    if (m.tick(this.inputs)) { if (m.phase === 'countdown') this.inputs = [null, null, null, null]; this.broadcastRoom(); }
    for (let i = 0; i < 4; i++) if (this.slots[i]) this.send(i, m.view(i));
  }
}

function code() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)]; if (!rooms.has(c)) return c; }
}
const clean = s => String(s || 'Player').replace(/[^\w \-.]/g, '').slice(0, 12) || 'Player';

wss.on('connection', ws => {
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  ws.name = 'Player'; ws.msgs = 0;
  const rl = setInterval(() => { ws.msgs = 0; }, 1000);
  ws.on('message', raw => {
    if (++ws.msgs > 120) return;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    const r = ws.room;
    switch (m.t) {
      case 'create': {
        if (r) return;
        const room = new Room(code()); rooms.set(room.code, room);
        room.add(ws, clean(m.name)); room.broadcastRoom(); break;
      }
      case 'join': {
        if (r) return;
        const room = rooms.get(String(m.code || '').toUpperCase().slice(0, 4));
        if (!room) return ws.send(JSON.stringify({ t: 'err', msg: 'No room with that code.' }));
        if (room.add(ws, clean(m.name)) < 0) return ws.send(JSON.stringify({ t: 'err', msg: 'Room is full.' }));
        room.broadcastRoom(); break;
      }
      case 'start': if (r && r.host === ws.slot) r.start(); break;
      case 'in': if (r && Number.isInteger(m.d) && m.d >= 0 && m.d <= 3) r.inputs[ws.slot] = m.d; break;
      case 'leave': if (r) r.remove(ws); break;
      case 'ping': ws.send(JSON.stringify({ t: 'pong', c: m.c })); break;
    }
  });
  ws.on('close', () => { clearInterval(rl); if (ws.room) ws.room.remove(ws); });
});
setInterval(() => wss.clients.forEach(w => { if (!w.isAlive) return w.terminate(); w.isAlive = false; w.ping(); }), 15000);

if (require.main === module) server.listen(PORT, () => console.log(`Pac-Man Vs. server on http://localhost:${PORT}`));
module.exports = { server, wss, rooms };
