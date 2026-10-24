/* The room server with no network in it: rooms, seats, the quick match, and the messages players send. Each
 * connected player is a client made with connect(send); whatever carries the bytes (a WebSocket in server/server.js,
 * the phone's own web server relaying into the page) calls message() and close() on it and gets text to deliver
 * through `send`. The same code hosts a room in Node and inside the Android app's page.
 * UMD: window.PacHub in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sim.js'), require('./arrange.js'), require('./match.js'));
  else root.PacHub = factory(root.PacSim, root.PacArrange, root.PacMatch);
})(typeof self !== 'undefined' ? self : this, function (Sim, Arrange, PacMatch) {
  'use strict';
  const { Match } = PacMatch;

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
    } catch (e) { return null; }
  }
  const clean = s => String(s || 'Player').replace(/[^\w \-.]/g, '').slice(0, 12) || 'Player';

  /** A hub: its own set of rooms. `opts.quickWait` is the quick match's wait in seconds (60). */
  function create(opts) {
    const quickWait = opts && opts.quickWait != null ? opts.quickWait : 60;
    const rooms = new Map();

    // Quick match: "Find a game" puts a player into an open quick room with the same fill setting, or opens one. A
    // room that fills empty seats starts quickWait s after its second player arrives (or at once with four); one that
    // does not waits for four people. Quick rooms play the built-in maze at the default target so nobody needs a disc.
    class Room {
      constructor(code, maze, target, fill, kinds) {
        this.code = code; this.maze = maze || null; this.target = target; this.fill = fill === 'standin' ? 'standin' : 'cpu';
        this.slots = [null, null, null, null];      // a client or null (played by the computer)
        // what plays a seat nobody sits in: a computer player ('cpu') or a grey stand-in ghost ('standin'); the host may change it
        this.kinds = [0, 1, 2, 3].map(i => Room.kind(kinds && kinds[i], this.fill));
        this.names = ['CPU', 'CPU', 'CPU', 'CPU'];
        this.host = -1;
        this.inputs = [null, null, null, null]; this.acts = [false, false, false, false];
        this.match = new Match(i => !!this.slots[i], undefined, { maze: this.maze, target: this.target, fill: this.fill, kinds: this.kinds });
        this.timer = null;
        this.quick = false; this.autoFill = false; this.startAt = 0; this.waitTimer = null;   // quick match (see quickWait)
      }
      /** A quick room: starts with four people, or quickWait s after the second person when it fills seats with computer players. */
      checkQuick() {
        if (!this.quick || this.match.phase !== 'lobby') return;
        const n = this.humans();
        if (n >= 4) return this.start();
        if (this.autoFill && n >= 2 && !this.waitTimer) {
          this.startAt = Date.now() + quickWait * 1000;
          this.waitTimer = setTimeout(() => { this.waitTimer = null; if (this.match.phase === 'lobby' && this.humans() >= 2) this.start(); }, quickWait * 1000);
        } else if (n < 2 && this.waitTimer) { clearTimeout(this.waitTimer); this.waitTimer = null; this.startAt = 0; }
      }
      static kind(k, dflt) { return k === 'standin' || k === 'cpu' ? k : dflt; }
      humans() { return this.slots.filter(Boolean).length; }
      /** The host picks what plays an empty seat, between matches. */
      setKind(i, k) {
        if (!Number.isInteger(i) || i < 0 || i > 3 || this.slots[i] || (k !== 'standin' && k !== 'cpu')) return false;
        if (this.match.phase !== 'lobby' && this.match.phase !== 'final') return false;
        this.kinds[i] = k; this.broadcastRoom(); return true;
      }
      add(c, name) {
        const i = this.slots.indexOf(null);
        if (i < 0) return -1;
        this.slots[i] = c; this.names[i] = name; c.slot = i; c.room = this;
        if (this.host < 0) this.host = i;
        return i;
      }
      remove(c) {
        const i = c.slot;
        this.slots[i] = null; this.names[i] = 'CPU'; this.inputs[i] = null;
        c.room = null;
        if (this.host === i) this.host = this.slots.findIndex(Boolean);
        if (!this.humans()) { this.stop(); rooms.delete(this.code); return; }
        this.checkQuick(); this.broadcastRoom();
      }
      /** The room's timers off (it is being thrown away). */
      stop() { clearInterval(this.timer); this.timer = null; clearTimeout(this.waitTimer); this.waitTimer = null; }
      send(i, obj) { const c = this.slots[i]; if (c) c.send(JSON.stringify(obj)); }
      roomInfo(i) {
        const m = this.match;
        return { t: 'room', code: this.code, maze: this.maze ? Object.assign({ name: this.maze.name, rows: this.maze.rows, pac: this.maze.pac, ghosts: this.maze.ghosts, door: this.maze.door, exit: this.maze.exit, house: this.maze.house }, this.maze.arrange ? { arrange: this.maze.arrange } : {}) : null, you: i, host: this.host, phase: m.phase,
          players: this.names.map((n, k) => ({ name: n, cpu: !this.slots[k], kind: this.slots[k] ? 'human' : this.kinds[k] })), scores: m.scores, round: m.round, target: m.target, pac: m.pac, winner: m.winner, fill: this.fill, kinds: this.kinds.slice(),
          quick: this.quick, autoFill: this.autoFill, startsIn: this.startAt && m.phase === 'lobby' ? Math.max(0, Math.round((this.startAt - Date.now()) / 1000)) : null };
      }
      broadcastRoom() { for (let i = 0; i < 4; i++) this.send(i, this.roomInfo(i)); }
      start() {
        if (this.match.phase !== 'lobby' && this.match.phase !== 'final') return;
        if (this.quick && this.humans() < 2) return;      // a quick room never plays one person against computers
        if (this.waitTimer) { clearTimeout(this.waitTimer); this.waitTimer = null; } this.startAt = 0;
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

    /** A player arrives. `send(text)` delivers to them; the transport calls message(text) and close(). */
    function connect(send) {
      const c = { slot: -1, room: null, msgs: 0, closed: false, send: text => { try { send(text); } catch (e) { /* gone */ } } };
      const limiter = setInterval(() => { c.msgs = 0; }, 1000);
      c.message = raw => {
        if (c.closed || ++c.msgs > 120) return;
        let m; try { m = JSON.parse(raw); } catch (e) { return; }
        if (!m || typeof m.t !== 'string') return;
        const r = c.room;
        switch (m.t) {
          case 'create': {
            if (r) return;
            const room = new Room(code(), m.maze ? sanitizeMaze(m.maze) : null, Sim.CFG.targets.includes(m.target) ? m.target : Sim.CFG.defaultTarget, m.fill, Array.isArray(m.kinds) ? m.kinds : null); rooms.set(room.code, room);
            room.add(c, clean(m.name)); room.broadcastRoom(); break;
          }
          case 'find': {
            if (r) return;
            const fill = m.fill !== false;
            let room = [...rooms.values()].find(x => x.quick && x.autoFill === fill && x.match.phase === 'lobby' && x.humans() < 4);
            if (!room) { room = new Room(code(), null, Sim.CFG.defaultTarget, 'cpu', null); room.quick = true; room.autoFill = fill; rooms.set(room.code, room); }
            room.add(c, clean(m.name)); room.checkQuick(); room.broadcastRoom(); break;
          }
          case 'join': {
            if (r) return;
            const room = rooms.get(String(m.code || '').toUpperCase().slice(0, 4));
            if (!room) return c.send(JSON.stringify({ t: 'err', msg: 'No room with that code.' }));
            if (room.add(c, clean(m.name)) < 0) return c.send(JSON.stringify({ t: 'err', msg: 'Room is full.' }));
            room.checkQuick(); room.broadcastRoom(); break;
          }
          case 'start': if (r && r.host === c.slot) r.start(); break;
          case 'seat': if (r && r.host === c.slot) r.setKind(m.i, m.kind); break;
          case 'in': if (r && Number.isInteger(m.d) && m.d >= 0 && m.d <= 3) r.inputs[c.slot] = m.d; break;
          case 'act': if (r) r.acts[c.slot] = true; break;
          case 'ready': if (r && r.match.ready(c.slot)) { r.inputs = [null, null, null, null]; r.broadcastRoom(); } break;
          case 'leave': if (r) r.remove(c); break;
          case 'ping': c.send(JSON.stringify({ t: 'pong', c: m.c })); break;
        }
      };
      c.close = () => { if (c.closed) return; c.closed = true; clearInterval(limiter); if (c.room) c.room.remove(c); };
      return c;
    }

    /** Everything off: every room's timers, so a page or a process can let go of the hub. */
    function destroy() { for (const r of rooms.values()) r.stop(); rooms.clear(); }

    return { rooms, connect, destroy, Room };
  }

  return { create, sanitizeMaze, clean };
});
