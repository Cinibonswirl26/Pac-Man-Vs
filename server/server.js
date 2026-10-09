'use strict';
// Online room server: authoritative simulation, WebSocket transport, static file host.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const Sim = require('../shared/sim.js');
const Arrange = require('../shared/arrange.js');
const { Match } = require('../shared/match.js');

const PORT = +process.env.PORT || 8080;
const ROOT = path.join(__dirname, '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const STATIC = { '/': 'client/index.html', '/soundlab': 'client/soundlab.html' };

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
  constructor(code, maze, target, fill, kinds) {
    this.code = code; this.maze = maze || null; this.target = target; this.fill = fill === 'standin' ? 'standin' : 'cpu';
    this.slots = [null, null, null, null];      // ws or null (played by the computer)
    // what plays a seat nobody sits in: a computer player ('cpu') or a grey stand-in ghost ('standin'); the host may change it
    this.kinds = [0, 1, 2, 3].map(i => Room.kind(kinds && kinds[i], this.fill));
    this.names = ['CPU', 'CPU', 'CPU', 'CPU'];
    this.host = -1;
    this.inputs = [null, null, null, null]; this.acts = [false, false, false, false];
    this.match = new Match(i => !!this.slots[i], undefined, { maze: this.maze, target: this.target, fill: this.fill, kinds: this.kinds });
    this.timer = null;
  }
  static kind(k, dflt) { return k === 'standin' || k === 'cpu' ? k : dflt; }
  humans() { return this.slots.filter(Boolean).length; }
  /** The host picks what plays an empty seat, between matches. */
  setKind(i, k) {
    if (!Number.isInteger(i) || i < 0 || i > 3 || this.slots[i] || (k !== 'standin' && k !== 'cpu')) return false;
    if (this.match.phase !== 'lobby' && this.match.phase !== 'final') return false;
    this.kinds[i] = k; this.broadcastRoom(); return true;
  }
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
    return { t: 'room', code: this.code, maze: this.maze ? Object.assign({ name: this.maze.name, rows: this.maze.rows, pac: this.maze.pac, ghosts: this.maze.ghosts, door: this.maze.door, exit: this.maze.exit, house: this.maze.house }, this.maze.arrange ? { arrange: this.maze.arrange } : {}) : null, you: i, host: this.host, phase: m.phase,
      players: this.names.map((n, k) => ({ name: n, cpu: !this.slots[k], kind: this.slots[k] ? 'human' : this.kinds[k] })), scores: m.scores, round: m.round, target: m.target, pac: m.pac, winner: m.winner, fill: this.fill, kinds: this.kinds.slice() };
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
    const acts = this.acts; this.acts = [false, false, false, false];
    if (m.tick(this.inputs, undefined, acts)) { if (m.phase === 'countdown') this.inputs = [null, null, null, null]; this.broadcastRoom(); }
    for (let i = 0; i < 4; i++) if (this.slots[i]) this.send(i, m.view(i));
  }
}

function code() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  for (;;) { let c = ''; for (let i = 0; i < 4; i++) c += A[Math.floor(Math.random() * A.length)]; if (!rooms.has(c)) return c; }
}
/** A host may supply a maze read from their own disc. Validate shape and content before trusting it. */
function sanitizeMaze(m) {
  try {
    if (!m || !Array.isArray(m.rows) || m.rows.length < 9 || m.rows.length > 41) return null;
    const W = String(m.rows[0]).length;
    if (W < 9 || W > 41 || m.rows.some(r => typeof r !== 'string' || r.length !== W || !/^[#=D._ o]+$/.test(r))) return null;
    const H = m.rows.length, pt = a => Array.isArray(a) && a.length === 2 && Number.isInteger(a[0]) && Number.isInteger(a[1]) && a[0] >= 0 && a[0] < W && a[1] >= 0 && a[1] < H;
    const h = m.house;
    if (!pt(m.pac) || !pt(m.door) || !pt(m.exit) || !Array.isArray(m.ghosts) || m.ghosts.length !== 3 || !m.ghosts.every(pt)) return null;
    if (!h || !['x0', 'x1', 'y0', 'y1'].every(k => Number.isInteger(h[k])) || h.x0 > h.x1 || h.y0 > h.y1 || !pt([h.x0, h.y0]) || !pt([h.x1, h.y1])) return null;
    const open = a => !'#='.includes(m.rows[a[1]][a[0]]);
    if (![m.pac, m.exit, ...m.ghosts].every(open) || m.rows[m.door[1]][m.door[0]] !== 'D') return null;
    const o = { name: String(m.name || 'custom').replace(/[^\w .'\-]/g, '').slice(0, 32) || 'custom', pac: m.pac, ghosts: m.ghosts, door: m.door, exit: m.exit, house: { x0: h.x0, x1: h.x1, y0: h.y0, y1: h.y1 } };
    if (m.arrange) { o.arrange = Arrange.validate(m.arrange, { rows: m.rows, pac: m.pac, ghosts: m.ghosts, exit: m.exit, house: o.house }); if (!o.arrange) return null; }
    return Sim.makeMaze(m.rows.slice(), o);
  } catch { return null; }
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
        const room = new Room(code(), m.maze ? sanitizeMaze(m.maze) : null, Sim.CFG.targets.includes(m.target) ? m.target : Sim.CFG.defaultTarget, m.fill, Array.isArray(m.kinds) ? m.kinds : null); rooms.set(room.code, room);
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
      case 'seat': if (r && r.host === ws.slot) r.setKind(m.i, m.kind); break;
      case 'in': if (r && Number.isInteger(m.d) && m.d >= 0 && m.d <= 3) r.inputs[ws.slot] = m.d; break;
      case 'act': if (r && m.a === 'hop') r.acts[ws.slot] = true; break;
      case 'ready': if (r && r.match.ready(ws.slot)) { r.inputs = [null, null, null, null]; r.broadcastRoom(); } break;
      case 'leave': if (r) r.remove(ws); break;
      case 'ping': ws.send(JSON.stringify({ t: 'pong', c: m.c })); break;
    }
  });
  ws.on('close', () => { clearInterval(rl); if (ws.room) ws.room.remove(ws); });
});
setInterval(() => wss.clients.forEach(w => { if (!w.isAlive) return w.terminate(); w.isAlive = false; w.ping(); }), 15000);

if (require.main === module) server.listen(PORT, () => console.log(`Pac-Man Vs. server on http://localhost:${PORT}`));
module.exports = { server, wss, rooms, sanitizeMaze };
