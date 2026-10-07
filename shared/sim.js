/* Pac-Man Vs. style simulation. Original code.
 * One Pac-Man (sees everything) against up to three ghosts (each sees only a
 * small radius). Runs identically on the server (online) and in the browser (offline).
 * UMD: window.PacSim in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PacSim = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // '#' wall, '.' pellet, 'o' power pellet, ' ' empty, '=' ghost-house wall,
  // 'D' ghost-house door (ghosts only), '_' house floor / tunnel
  const HALF = [
    '############', '#o..........', '#.###.####.#', '#.###.####.#', '#...........', '#.###.#.####',
    '#.###.#.....', '#.....#.####', '####.##.....', '####.##..==D', '_...##...=__', '#...##...=__',
    '#.##.##..===', '#...........', '#.###.####.#', '#.###.####.#', '#.....#.....', '###.#.#.####',
    '#...#.#.....', '#o..........', '############'
  ];
  const ROWS = HALF.map(h => h + h.slice(0, 11).split('').reverse().join(''));
  const W = 23, H = 21;
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up right down left
  const OPP = [2, 3, 0, 1];

  const CFG = {
    tick: 1 / 30,
    pacSpeed: 5.6, ghostSpeed: 5.0, frightSpeed: 3.0, eyeSpeed: 11,
    frightTime: 8, respawnTime: 4, pacRespawn: 2, lives: 3,
    roundTime: 180, ghostSight: 4.6, pelletPts: 10, powerPts: 50, ghostPts: 200, catchPts: 500,
    clearBonus: 1000, rounds: 4
  };

  const START = {
    pac: [11, 16],
    ghosts: [[11, 8], [10, 10], [12, 10]]  // ghost 0 starts outside the door, the other two inside
  };

  function wallAt(x, y, who) {
    if (y < 0 || y >= H) return true;
    x = ((x % W) + W) % W;
    const c = ROWS[y][x];
    if (c === '#' || c === '=') return true;
    if (c === 'D') return who !== 'ghost';
    return false;
  }
  // house interior is ghost-only
  function inHouse(x, y) { return x >= 10 && x <= 12 && y >= 10 && y <= 11; }
  function blocked(x, y, who) { return wallAt(x, y, who) || (who === 'pac' && inHouse(x, y)); }

  function newRound(prev, roundIdx, scores) {
    const pellets = new Uint8Array(W * H);
    let total = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = ROWS[y][x];
      if ((c === '.' || c === 'o') && !inHouse(x, y)) { pellets[y * W + x] = c === 'o' ? 2 : 1; total++; }
    }
    pellets[START.pac[1] * W + START.pac[0]] = 0; total--;
    const s = {
      round: roundIdx, time: CFG.roundTime, pellets, total, left: 0, lives: CFG.lives,
      frightLeft: 0, pacRespawnLeft: 0, over: false, overReason: '', events: [],
      pac: ent(START.pac), ghosts: START.ghosts.map((g, i) => Object.assign(ent(g), { mode: 'normal', out: i === 0, spawnLeft: i === 0 ? 0 : i * 2, id: i })),
      scores: scores || [0, 0, 0, 0], roundScores: [0, 0, 0, 0],
      pacPlayer: roundIdx % 4, tick: 0
    };
    s.left = total - 0;
    return s;
  }
  function ent(p) { return { x: p[0] + 0.5, y: p[1] + 0.5, dir: 1, want: 1 }; }

  // Player slot p plays Pac-Man in round r when p == r % 4; the others take ghost slots 0..2 in order.
  function ghostIndexOf(state, player) {
    if (player === state.pacPlayer) return -1;
    let gi = 0;
    for (let p = 0; p < 4; p++) { if (p === state.pacPlayer) continue; if (p === player) return gi; gi++; }
    return -1;
  }
  function playerOfGhost(state, gi) {
    let n = 0;
    for (let p = 0; p < 4; p++) { if (p === state.pacPlayer) continue; if (n === gi) return p; n++; }
    return -1;
  }

  function canGo(e, dir, who) {
    const cx = Math.floor(e.x), cy = Math.floor(e.y);
    return !blocked(cx + DIRS[dir][0], cy + DIRS[dir][1], who);
  }

  // Tile-centre movement: entities travel centre to centre, may reverse at any time,
  // and only turn (or stop at a wall) when exactly on a centre.
  function step(e, speed, dt, who) {
    let rem = speed * dt;
    let guard = 8;
    while (rem > 1e-9 && guard-- > 0) {
      const cx = Math.floor(e.x) + 0.5, cy = Math.floor(e.y) + 0.5;
      let dx = DIRS[e.dir][0], dy = DIRS[e.dir][1];
      let ahead = (cx - e.x) * dx + (cy - e.y) * dy;
      if (Math.abs(ahead) <= 1e-9) {
        e.x = cx; e.y = cy; ahead = 0;
        if (e.want !== e.dir && canGo(e, e.want, who)) { e.dir = e.want; dx = DIRS[e.dir][0]; dy = DIRS[e.dir][1]; }
        if (!canGo(e, e.dir, who)) return;
      } else if (e.want === OPP[e.dir]) {
        e.dir = e.want; continue;
      }
      // distance to the next centre in the heading direction
      const dn = ahead > 0 ? ahead : 1 + ahead;
      const m = Math.min(rem, dn || 1);
      e.x += dx * m; e.y += dy * m; rem -= m;
      if (e.x < 0) e.x += W; else if (e.x >= W) e.x -= W;
      if (m >= (dn || 1) - 1e-9) {
        // landed on a centre: snap exactly
        e.x = Math.floor(e.x + 1e-7) + 0.5; e.y = Math.floor(e.y + 1e-7) + 0.5;
        if (dx < 0 || dy < 0) { e.x = Math.round(e.x - 0.5) + 0.5; e.y = Math.round(e.y - 0.5) + 0.5; }
      }
    }
  }

  function dist(a, b) {
    let dx = Math.abs(a.x - b.x); if (dx > W / 2) dx = W - dx;
    return Math.hypot(dx, a.y - b.y);
  }

  function resetPositions(s) {
    s.pac = ent(START.pac);
    s.ghosts.forEach((g, i) => {
      Object.assign(g, ent(START.ghosts[i]), { mode: 'normal', out: i === 0, spawnLeft: i === 0 ? 0 : 1 + i });
    });
    s.frightLeft = 0;
  }

  // inputs: {pac: dir|null, ghosts: [dir|null x3]} already mapped from players
  function update(s, inputs, dt) {
    if (s.over) return;
    dt = dt || CFG.tick;
    s.tick++; s.events.length = 0;
    s.time -= dt;
    if (s.time <= 0) { s.over = true; s.overReason = 'time'; return finish(s); }

    if (s.pacRespawnLeft > 0) {
      s.pacRespawnLeft -= dt;
      if (s.pacRespawnLeft <= 0) { resetPositions(s); s.events.push('respawn'); }
      return;
    }

    // Pac-Man
    if (inputs.pac != null) s.pac.want = inputs.pac;
    step(s.pac, CFG.pacSpeed, dt, 'pac');
    const px = Math.floor(s.pac.x), py = Math.floor(s.pac.y);
    const pi = py * W + (((px % W) + W) % W);
    if (s.pellets[pi]) {
      const power = s.pellets[pi] === 2;
      s.pellets[pi] = 0; s.left--;
      const pts = power ? CFG.powerPts : CFG.pelletPts;
      s.roundScores[s.pacPlayer] += pts;
      s.events.push(power ? 'power' : 'pellet');
      if (power) { s.frightLeft = CFG.frightTime; s.ghosts.forEach(g => { if (g.mode === 'normal') { g.mode = 'fright'; g.want = OPP[g.dir]; } }); }
      if (s.left <= 0) { s.roundScores[s.pacPlayer] += CFG.clearBonus; s.over = true; s.overReason = 'cleared'; return finish(s); }
    }
    if (s.frightLeft > 0) {
      s.frightLeft -= dt;
      if (s.frightLeft <= 0) s.ghosts.forEach(g => { if (g.mode === 'fright') g.mode = 'normal'; });
    }

    // Ghosts
    s.ghosts.forEach((g, i) => {
      if (g.mode === 'respawn') {
        g.spawnLeft -= dt;
        if (g.spawnLeft <= 0) { Object.assign(g, ent(START.ghosts[i === 0 ? 1 : i]), { mode: 'normal', out: false, spawnLeft: 0.6 }); }
        return;
      }
      if (!g.out) {
        g.spawnLeft -= dt;
        if (g.spawnLeft <= 0) { g.out = true; Object.assign(g, ent([11, 8])); }
        return;
      }
      const inp = inputs.ghosts[i];
      if (inp != null) g.want = inp;
      const speed = g.mode === 'eyes' ? CFG.eyeSpeed : g.mode === 'fright' ? CFG.frightSpeed : CFG.ghostSpeed;
      step(g, speed, dt, 'ghost');
      if (g.mode === 'eyes' && Math.abs(g.x - 11.5) < 0.6 && g.y > 7.5 && g.y < 9.5) {
        Object.assign(g, ent([11, 10]), { mode: 'respawn', spawnLeft: CFG.respawnTime });
        return;
      }
      // collision
      if (dist(g, s.pac) < 0.7) {
        if (g.mode === 'fright') {
          g.mode = 'eyes'; s.events.push('eatghost');
          s.roundScores[s.pacPlayer] += CFG.ghostPts;
        } else if (g.mode === 'normal' && s.pacRespawnLeft <= 0) {
          s.lives--; s.events.push('pacdeath');
          s.roundScores[playerOfGhost(s, i)] += CFG.catchPts;
          if (s.lives <= 0) { s.over = true; s.overReason = 'caught'; finish(s); }
          else s.pacRespawnLeft = CFG.pacRespawn;
        }
      }
    });
  }

  function finish(s) {
    for (let p = 0; p < 4; p++) s.scores[p] += s.roundScores[p];
  }

  // What a given player is allowed to see. Ghosts get fog of war; Pac-Man sees all.
  function view(s, player) {
    const gi = ghostIndexOf(s, player);
    const me = gi < 0 ? s.pac : s.ghosts[gi];
    const sight = CFG.ghostSight;
    const vis = e => gi < 0 || dist(e, me) <= sight;
    const out = {
      tick: s.tick, round: s.round, time: Math.max(0, Math.round(s.time * 10) / 10), lives: s.lives,
      frightLeft: Math.round(s.frightLeft * 10) / 10, left: s.left, over: s.over, why: s.overReason,
      pacPlayer: s.pacPlayer, scores: s.scores, rs: s.roundScores, me: gi, ev: s.events.slice(),
      respawning: s.pacRespawnLeft > 0,
      pac: vis(s.pac) ? q(s.pac) : null,
      ghosts: s.ghosts.map(g => (gi >= 0 && g.id === gi) || vis(g) ? Object.assign(q(g), { m: g.mode[0] }) : null)
    };
    if (gi < 0) out.pellets = Array.from(s.pellets);
    else {
      const p = new Array(W * H).fill(0);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = s.pellets[y * W + x];
        if (v && Math.hypot(x + 0.5 - me.x, y + 0.5 - me.y) <= sight) p[y * W + x] = v;
      }
      out.pellets = p;
    }
    return out;
  }
  function q(e) { return { x: Math.round(e.x * 100) / 100, y: Math.round(e.y * 100) / 100, d: e.dir }; }

  // ---------- CPU players ----------
  function bfsNext(startX, startY, goalFn, who, avoid) {
    const sx = Math.floor(startX), sy = Math.floor(startY);
    const seen = new Int16Array(W * H).fill(-1);
    const q0 = [[sx, sy]];
    seen[sy * W + sx] = 4;
    for (let qi = 0; qi < q0.length; qi++) {
      const [x, y] = q0[qi];
      if ((x !== sx || y !== sy) && goalFn(x, y)) {
        // walk back is expensive; instead remember first move
        return firstMove[y * W + x];
      }
      for (let d = 0; d < 4; d++) {
        const nx = (x + DIRS[d][0] + W) % W, ny = y + DIRS[d][1];
        if (ny < 0 || ny >= H || blocked(nx, ny, who)) continue;
        if (seen[ny * W + nx] !== -1) continue;
        if (avoid && avoid(nx, ny)) continue;
        seen[ny * W + nx] = d;
        firstMove[ny * W + nx] = (x === sx && y === sy) ? d : firstMove[y * W + x];
        q0.push([nx, ny]);
      }
    }
    return null;
  }
  const firstMove = new Int16Array(W * H);

  function exits(e, who) {
    const cx = Math.floor(e.x), cy = Math.floor(e.y), r = [];
    for (let d = 0; d < 4; d++) if (!blocked(cx + DIRS[d][0], cy + DIRS[d][1], who)) r.push(d);
    return r;
  }

  function cpuGhost(s, gi, rng) {
    const g = s.ghosts[gi];
    if (!g.out || g.mode === 'respawn') return null;
    const gx = Math.floor(g.x), gy = Math.floor(g.y);
    if (Math.abs(g.x - gx - 0.5) > 0.05 || Math.abs(g.y - gy - 0.5) > 0.05) return null;
    if (g.mode === 'eyes') return bfsNext(g.x, g.y, (x, y) => x === 11 && y === 9, 'ghost');
    const sees = dist(g, s.pac) <= CFG.ghostSight + 1.5;
    if (g.mode === 'fright') {
      // run to the exit farthest from Pac-Man
      let best = null, bd = -1;
      for (const d of exits(g, 'ghost')) {
        if (d === OPP[g.dir] && exits(g, 'ghost').length > 1) continue;
        const p = { x: g.x + DIRS[d][0] * 3, y: g.y + DIRS[d][1] * 3 };
        const dd = dist(p, s.pac) + rng() * 0.5;
        if (dd > bd) { bd = dd; best = d; }
      }
      return best;
    }
    if (sees) {
      const tx = Math.floor(s.pac.x), ty = Math.floor(s.pac.y);
      const d = bfsNext(g.x, g.y, (x, y) => x === tx && y === ty, 'ghost');
      if (d != null) return d;
    }
    const ex = exits(g, 'ghost').filter(d => d !== OPP[g.dir]);
    if (!ex.length) return OPP[g.dir];
    // spread out: slightly prefer straight
    return ex.includes(g.dir) && rng() < 0.6 ? g.dir : ex[Math.floor(rng() * ex.length)];
  }

  function cpuPac(s, rng) {
    const p = s.pac;
    const gx = Math.floor(p.x), gy = Math.floor(p.y);
    if (Math.abs(p.x - gx - 0.5) > 0.05 || Math.abs(p.y - gy - 0.5) > 0.05) return null;
    const danger = new Uint8Array(W * H);
    for (const g of s.ghosts) {
      if (g.mode !== 'normal' || !g.out) continue;
      const hx = Math.floor(g.x), hy = Math.floor(g.y);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        if (Math.abs(dx) + Math.abs(dy) > 2) continue;
        const x = ((hx + dx) % W + W) % W, y = hy + dy;
        if (y >= 0 && y < H) danger[y * W + x] = 1;
      }
    }
    const avoid = (x, y) => danger[y * W + x] === 1;
    // chase a frightened ghost that is close
    if (s.frightLeft > 2) {
      let best = null, bd = 99;
      for (const g of s.ghosts) if (g.mode === 'fright') { const d = dist(g, p); if (d < bd) { bd = d; best = g; } }
      if (best && bd < 7) {
        const tx = Math.floor(best.x), ty = Math.floor(best.y);
        const d = bfsNext(p.x, p.y, (x, y) => x === tx && y === ty, 'pac');
        if (d != null) return d;
      }
    }
    // power pellet if a ghost is close, else nearest pellet, avoiding danger squares
    const threatened = s.ghosts.some(g => g.mode === 'normal' && g.out && dist(g, p) < 6);
    if (threatened && s.frightLeft <= 0) {
      const d = bfsNext(p.x, p.y, (x, y) => s.pellets[y * W + x] === 2, 'pac', avoid);
      if (d != null) return d;
    }
    let d = bfsNext(p.x, p.y, (x, y) => s.pellets[y * W + x] > 0, 'pac', avoid);
    if (d == null) d = bfsNext(p.x, p.y, (x, y) => s.pellets[y * W + x] > 0, 'pac');
    if (d == null) { const ex = exits(p, 'pac'); d = ex[Math.floor(rng() * ex.length)]; }
    // Commit to the current heading instead of dithering: reverse only when the way
    // ahead is blocked or dangerous.
    if (d === OPP[p.dir] && canGo(p, p.dir, 'pac')) {
      const ax = ((gx + DIRS[p.dir][0]) % W + W) % W, ay = gy + DIRS[p.dir][1];
      if (!danger[ay * W + ax]) return p.dir;
    }
    return d;
  }

  function mulberry(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  return { W, H, ROWS, DIRS, OPP, CFG, START, newRound, update, view, cpuGhost, cpuPac, ghostIndexOf, playerOfGhost, mulberry, wallAt, dist };
});
