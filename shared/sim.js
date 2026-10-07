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
  const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up right down left
  const OPP = [2, 3, 0, 1];

  // Values measured from the original game (see FIDELITY.md). Speeds were 0.5 px per frame (normal) and
  // 0.375 px per frame (frightened) at 8 px per cell and 59.7275 frames per second.
  const FPS = 59.7275, CELL = 8;
  const CFG = {
    tick: 1 / 30,
    pacSpeed: 0.5 * FPS / CELL,          // 3.73 cells/s
    ghostSpeed: 0.5 * FPS / CELL,        // ghosts are exactly as fast as Pac-Man
    frightSpeed: 0.375 * FPS / CELL,     // 2.80 cells/s
    eyeSpeed: 1.0 * FPS / CELL,          // not measured
    frightTime: 10, frightFlash: 2, respawnTime: 3,   // respawnTime not measured
    ghostSight: 4.6,
    // Fruit: appears in the middle of the maze once enough pellets are gone (documented: both sides may take it,
    // ghosts get 400 points and a wider view for a while). The numbers below are guesses.
    fruitPts: 400, fruitFirst: 6, fruitEvery: 70, fruitStay: 10, fruitSightMult: 1.8, fruitSightTime: 10,
    clearBonus: 1600,
    pelletPts: 10, powerPts: 110,
    ghostChain: [200, 400, 800, 1600],   // not measured
    stealPts: 1600, startPts: 1600,
    targets: [7000, 10000, 15000], defaultTarget: 7000
  };

  /** A maze descriptor. rows use: '#' wall, '=' house wall, 'D' door (ghosts only), '.' pellet,
   *  'o' power pellet, ' ' or '_' empty floor. The house is the rectangle ghosts wait in.
   *  `ghosts` are the three ghost start cells; ghosts start outside the house, ready to play. */
  function makeMaze(rows, o) {
    return { rows, W: rows[0].length, H: rows.length, pac: o.pac, ghosts: o.ghosts, door: o.door, exit: o.exit, house: o.house, name: o.name || 'maze' };
  }
  const BUILTIN = makeMaze(HALF.map(h => h + h.slice(0, 11).split('').reverse().join('')), {
    name: 'built-in', pac: [11, 13], ghosts: [[8, 8], [14, 8], [11, 8]], door: [11, 9], exit: [11, 8], house: { x0: 10, x1: 12, y0: 10, y1: 11 }
  });

  /** Builds the rules for one maze. All maze-specific numbers live in `maze`. */
  function build(maze) {
  if (!maze.W) maze = makeMaze(maze.rows, maze);      // accept a bare descriptor (as sent over the network)
  const ROWS = maze.rows, W = maze.W, H = maze.H, START = { pac: maze.pac, ghosts: maze.ghosts }, DOOR = maze.door, EXIT = maze.exit, HOUSE = maze.house, FRUIT = maze.fruit || maze.pac;

  function wallAt(x, y, who) {
    if (y < 0 || y >= H) return true;
    x = ((x % W) + W) % W;
    const c = ROWS[y][x];
    if (c === '#' || c === '=') return true;
    if (c === 'D') return who !== 'ghost';
    return false;
  }
  // house interior is ghost-only
  function inHouse(x, y) { return x >= HOUSE.x0 && x <= HOUSE.x1 && y >= HOUSE.y0 && y <= HOUSE.y1; }
  function blocked(x, y, who) { return wallAt(x, y, who) || (who === 'pac' && inHouse(x, y)); }

  /** Start a round. `scores` (4 numbers) is kept and updated in place, so points carry over between rounds. */
  function newRound(scores, pacPlayer, opts) {
    opts = opts || {};
    const pellets = new Uint8Array(W * H);
    let total = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = ROWS[y][x];
      if ((c === '.' || c === 'o') && !inHouse(x, y)) { pellets[y * W + x] = c === 'o' ? 2 : 1; total++; }
    }
    if (pellets[START.pac[1] * W + START.pac[0]]) { pellets[START.pac[1] * W + START.pac[0]] = 0; total--; }
    return {
      pellets, total, left: total, target: opts.target || CFG.defaultTarget,
      frightLeft: 0, chain: 0, over: false, overReason: '', events: [],
      pac: ent(START.pac), ghosts: START.ghosts.map((g, i) => Object.assign(ent(g), { mode: 'normal', spawnLeft: 0, id: i, sightLeft: 0 })),
      scores: scores || [0, 0, 0, 0], roundScores: [0, 0, 0, 0],
      pacPlayer, tick: 0, catcher: -1, steal: 0, winner: -1, time: 0,
      eaten: 0, nextFruit: CFG.fruitFirst, fruit: null
    };
  }
  function ent(p) { return { x: p[0] + 0.5, y: p[1] + 0.5, dir: 1, want: 1 }; }

  // The three non-Pac players take ghost slots 0..2 in seat order.
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

  function award(s, player, pts) {
    s.scores[player] += pts; s.roundScores[player] += pts;
    if (s.scores[player] >= s.target && !s.over) { s.over = true; s.overReason = 'won'; s.winner = player; }
  }

  // inputs: {pac: dir|null, ghosts: [dir|null x3]} already mapped from players
  function update(s, inputs, dt) {
    if (s.over) return;
    dt = dt || CFG.tick;
    s.tick++; s.time += dt; s.events.length = 0;

    // Pac-Man
    if (inputs.pac != null) s.pac.want = inputs.pac;
    step(s.pac, CFG.pacSpeed, dt, 'pac');
    const px = Math.floor(s.pac.x), py = Math.floor(s.pac.y);
    const pi = py * W + (((px % W) + W) % W);
    if (s.pellets[pi]) {
      const power = s.pellets[pi] === 2;
      s.pellets[pi] = 0; s.left--; s.eaten++;
      if (!s.fruit && s.eaten >= s.nextFruit && s.left > 8) s.fruit = { x: FRUIT[0] + 0.5, y: FRUIT[1] + 0.5, left: CFG.fruitStay };
      s.events.push(power ? 'power' : 'pellet');
      if (power) {
        s.frightLeft = CFG.frightTime; s.chain = 0;
        s.ghosts.forEach(g => { if (g.mode === 'normal') { g.mode = 'fright'; g.want = OPP[g.dir]; } });
      }
      award(s, s.pacPlayer, power ? CFG.powerPts : CFG.pelletPts);
      if (s.over) return;
      if (s.left <= 0) { award(s, s.pacPlayer, CFG.clearBonus); s.over = true; s.overReason = s.winner >= 0 ? 'won' : 'cleared'; return; }
    }
    if (s.fruit) {
      s.fruit.left -= dt;
      if (dist(s.pac, s.fruit) < 0.7) { s.fruit = null; s.nextFruit = s.eaten + CFG.fruitEvery; s.events.push('fruit'); award(s, s.pacPlayer, CFG.fruitPts); if (s.over) return; }
      else if (s.fruit.left <= 0) { s.fruit = null; s.nextFruit = s.eaten + CFG.fruitEvery; }
    }
    if (s.frightLeft > 0) {
      s.frightLeft -= dt;
      if (s.frightLeft <= 0) { s.frightLeft = 0; s.ghosts.forEach(g => { if (g.mode === 'fright') g.mode = 'normal'; }); }
    }

    // Ghosts
    for (let i = 0; i < s.ghosts.length; i++) {
      const g = s.ghosts[i];
      if (g.mode === 'respawn') {
        g.spawnLeft -= dt;
        if (g.spawnLeft <= 0) Object.assign(g, ent(EXIT), { mode: s.frightLeft > 0 ? 'fright' : 'normal', spawnLeft: 0 });
        continue;
      }
      if (g.sightLeft > 0) g.sightLeft = Math.max(0, g.sightLeft - dt);
      const inp = inputs.ghosts[i];
      if (inp != null) g.want = inp;
      const speed = g.mode === 'eyes' ? CFG.eyeSpeed : g.mode === 'fright' ? CFG.frightSpeed : CFG.ghostSpeed;
      step(g, speed, dt, 'ghost');
      if (g.mode === 'eyes' && Math.abs(g.x - (DOOR[0] + 0.5)) < 0.6 && g.y > EXIT[1] - 0.5 && g.y < DOOR[1] + 0.5) {
        Object.assign(g, ent([DOOR[0], HOUSE.y0]), { mode: 'respawn', spawnLeft: CFG.respawnTime });
        continue;
      }
      if (s.fruit && g.mode !== 'eyes' && dist(g, s.fruit) < 0.7) {
        s.fruit = null; s.nextFruit = s.eaten + CFG.fruitEvery; g.sightLeft = CFG.fruitSightTime; s.events.push('fruitghost');
        award(s, playerOfGhost(s, i), CFG.fruitPts); if (s.over) return;
      }
      if (dist(g, s.pac) < 0.8) {
        if (g.mode === 'fright') {
          g.mode = 'eyes'; s.events.push('eatghost');
          award(s, s.pacPlayer, CFG.ghostChain[Math.min(s.chain, CFG.ghostChain.length - 1)]); s.chain++;
          if (s.over) return;
        } else if (g.mode === 'normal') {
          // The catcher steals points from Pac-Man and takes over as Pac-Man next round.
          const catcher = playerOfGhost(s, i), steal = Math.min(CFG.stealPts, s.scores[s.pacPlayer]);
          s.scores[s.pacPlayer] -= steal; s.roundScores[s.pacPlayer] -= steal;
          s.catcher = catcher; s.steal = steal; s.events.push('catch');
          award(s, catcher, steal);
          s.over = true; s.overReason = s.winner >= 0 ? 'won' : 'caught';
          return;
        }
      }
    }
  }

  // What a given player is allowed to see. Pac-Man sees all. The ghost players share one TV in the
  // original, with a circle of sight around each ghost, so a ghost player sees what any ghost sees.
  const sightOf = g => CFG.ghostSight * (g.sightLeft > 0 ? CFG.fruitSightMult : 1);
  function view(s, player) {
    const gi = ghostIndexOf(s, player);
    const me = gi < 0 ? s.pac : s.ghosts[gi];
    const sight = gi >= 0 ? sightOf(me) : CFG.ghostSight;
    const seen = (x, y) => s.ghosts.some(g => g.mode !== 'respawn' && Math.hypot(x - g.x, y - g.y) <= sightOf(g));
    const vis = e => gi < 0 || seen(e.x, e.y);
    const out = {
      tick: s.tick, target: s.target, frightLeft: Math.round(s.frightLeft * 100) / 100, left: s.left, over: s.over, why: s.overReason,
      pacPlayer: s.pacPlayer, scores: s.scores.slice(), rs: s.roundScores.slice(), me: gi, ev: s.events.slice(),
      catcher: s.catcher, steal: s.steal, winner: s.winner, sight, boost: gi >= 0 ? me.sightLeft : 0, fruitUp: !!s.fruit,
      fruit: s.fruit && vis(s.fruit) ? { x: s.fruit.x, y: s.fruit.y } : null,
      pac: vis(s.pac) ? q(s.pac) : null,
      // Every ghost is on the shared screen (its own circle and the minimap); `s` is the radius of its circle.
      ghosts: s.ghosts.map(g => Object.assign(q(g), { m: g.mode[0], s: sightOf(g) }))
    };
    if (gi < 0) out.pellets = Array.from(s.pellets);
    else {
      const p = new Array(W * H).fill(0);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = s.pellets[y * W + x];
        if (v && seen(x + 0.5, y + 0.5)) p[y * W + x] = v;
      }
      out.pellets = p;
    }
    return out;
  }
  function q(e) { return { x: Math.round(e.x * 100) / 100, y: Math.round(e.y * 100) / 100, d: e.dir }; }

  // ---------- CPU players ----------
  // Levels: 0 easy, 1 normal, 2 hard. The CPU plays by the same rules as a person; only hard-level
  // ghosts get to know where Pac-Man is regardless of distance.
  const T = W * H;
  const tileIdx = (x, y) => y * W + (((x % W) + W) % W);

  /** Shortest-path distances (in tiles) from (sx,sy) over tiles `who` may enter. -1 = unreachable. */
  function distMap(sx, sy, who, skip) {
    const dist = new Int16Array(T).fill(-1);
    const qx = [], qy = [];
    sx = ((Math.floor(sx) % W) + W) % W; sy = Math.floor(sy);
    dist[tileIdx(sx, sy)] = 0; qx.push(sx); qy.push(sy);
    for (let qi = 0; qi < qx.length; qi++) {
      const x = qx[qi], y = qy[qi], d0 = dist[tileIdx(x, y)];
      for (let d = 0; d < 4; d++) {
        const nx = (x + DIRS[d][0] + W) % W, ny = y + DIRS[d][1];
        if (ny < 0 || ny >= H || blocked(nx, ny, who)) continue;
        const i = tileIdx(nx, ny);
        if (dist[i] !== -1 || (skip && skip(nx, ny))) continue;
        dist[i] = d0 + 1; qx.push(nx); qy.push(ny);
      }
    }
    return dist;
  }
  /** First step (direction) of a shortest path from (sx,sy) to the nearest tile satisfying goal(). */
  function pathStep(sx, sy, who, goal, skip) {
    sx = ((Math.floor(sx) % W) + W) % W; sy = Math.floor(sy);
    const seen = new Int8Array(T), first = new Int8Array(T).fill(-1);
    const qx = [sx], qy = [sy]; seen[tileIdx(sx, sy)] = 1;
    for (let qi = 0; qi < qx.length; qi++) {
      const x = qx[qi], y = qy[qi];
      if ((x !== sx || y !== sy) && goal(x, y)) return first[tileIdx(x, y)];
      for (let d = 0; d < 4; d++) {
        const nx = (x + DIRS[d][0] + W) % W, ny = y + DIRS[d][1];
        if (ny < 0 || ny >= H || blocked(nx, ny, who)) continue;
        const i = tileIdx(nx, ny);
        if (seen[i] || (skip && skip(nx, ny))) continue;
        seen[i] = 1; first[i] = (x === sx && y === sy) ? d : first[tileIdx(x, y)];
        qx.push(nx); qy.push(ny);
      }
    }
    return null;
  }
  function exits(e, who) {
    const cx = Math.floor(e.x), cy = Math.floor(e.y), r = [];
    for (let d = 0; d < 4; d++) if (!blocked(cx + DIRS[d][0], cy + DIRS[d][1], who)) r.push(d);
    return r;
  }
  const atCentre = e => Math.abs(e.x - Math.floor(e.x) - 0.5) < 0.05 && Math.abs(e.y - Math.floor(e.y) - 0.5) < 0.05;

  /** Earliest time (s) any dangerous ghost could stand on each tile. */
  function ghostArrival(s) {
    const best = new Float32Array(T).fill(1e9);
    for (const g of s.ghosts) {
      if (g.mode === 'eyes') continue;
      const harmless = g.mode === 'fright' && s.frightLeft > 3;
      if (harmless) continue;
      let sx = g.x, sy = g.y, delay = 0;
      if (g.mode === 'respawn') { sx = EXIT[0] + 0.5; sy = EXIT[1] + 0.5; delay = Math.max(0, g.spawnLeft) + 0.3; }
      const dm = distMap(sx, sy, 'ghost');
      for (let i = 0; i < T; i++) if (dm[i] >= 0) { const t = delay + dm[i] / CFG.ghostSpeed; if (t < best[i]) best[i] = t; }
    }
    return best;
  }

  function cpuPac(s, rng, level) {
    level = level == null ? 1 : level;
    const p = s.pac;
    // Emergency: a dangerous ghost closing head-on in this corridor, reverse right now.
    for (const g of s.ghosts) {
      if (g.mode !== 'normal') continue;
      const dx = g.x - p.x, dy = g.y - p.y, ahead = dx * DIRS[p.dir][0] + dy * DIRS[p.dir][1];
      if (ahead > 0 && ahead < (level === 0 ? 1.2 : 2.0) && Math.abs(dx * DIRS[p.dir][1]) + Math.abs(dy * DIRS[p.dir][0]) < 0.4 && s.frightLeft < 1) {
        const back = OPP[p.dir];
        if (canGo(p, back, 'pac') || !atCentre(p)) return back;
      }
    }
    if (!atCentre(p)) return null;
    // Easy level: sometimes just keeps going or turns at random (a human who is not paying attention).
    if (level === 0 && rng() < 0.12) { const ex = exits(p, 'pac'); return ex[Math.floor(rng() * ex.length)]; }

    const pd = distMap(p.x, p.y, 'pac');
    const ga = ghostArrival(s);
    const margin = level === 0 ? 0.9 : level === 1 ? 0.45 : 0.6;
    const safe = i => ga[i] - pd[i] / CFG.pacSpeed > margin;
    const sx = Math.floor(p.x), sy = Math.floor(p.y);
    const skip = (x, y) => !safe(tileIdx(x, y)) && !(x === sx && y === sy);

    // 1. Hunt a frightened ghost if there is time to reach it.
    if (level >= 1 && s.frightLeft > 1.5) {
      let bestG = null, bt = 1e9;
      for (const g of s.ghosts) {
        if (g.mode !== 'fright') continue;
        const gi = tileIdx(g.x, g.y), t = pd[gi] >= 0 ? pd[gi] / (CFG.pacSpeed - CFG.frightSpeed * 0.5) : 1e9;
        if (t < s.frightLeft - 0.8 && t < bt) { bt = t; bestG = g; }
      }
      if (bestG) { const tx = Math.floor(bestG.x), ty = Math.floor(bestG.y); const d = pathStep(p.x, p.y, 'pac', (x, y) => x === tx && y === ty); if (d != null) return keepHeading(p, d, ga, pd, margin); }
    }
    // 2. Close ghost and a power pellet we can safely reach: take it.
    const nearest = ga.reduce((m, v, i) => (pd[i] >= 0 && pd[i] < 1 ? Math.min(m, v) : m), 1e9);
    if (level >= 1 && s.frightLeft <= 0 && nearest < 4) {
      const d = pathStep(p.x, p.y, 'pac', (x, y) => s.pellets[y * W + x] === 2, skip);
      if (d != null) return keepHeading(p, d, ga, pd, margin);
    }
    // 3. Best pellet reachable by a path that is safe the whole way, preferring dense areas, and only
    //    if Pac-Man can still get out afterwards (no walking into a pocket whose exit a ghost can close).
    {
      const cands = [];
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (!s.pellets[i] || pd[i] < 0) continue;
        if (!(safe(i) && ga[i] - pd[i] / CFG.pacSpeed > margin + 0.3)) continue;
        let near = 0; for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy; if (yy >= 0 && yy < H && s.pellets[tileIdx(x + dx, yy)]) near++; }
        cands.push([near * 0.6 - pd[i] * 1.0 + (s.pellets[i] === 2 ? (nearest < 7 ? 8 : -6) : 0), i]);
      }
      cands.sort((a, b) => b[0] - a[0]);
      for (let k = 0; k < Math.min(cands.length, 10); k++) {
        const i = cands[k][1], tx = i % W, ty = Math.floor(i / W);
        if (!hasEscape(tx, ty, pd[i] / CFG.pacSpeed, ga, margin, level)) continue;
        const d = pathStep(p.x, p.y, 'pac', (x, y) => x === tx && y === ty, skip);
        if (d != null) return keepHeading(p, d, ga, pd, margin);
      }
    }
    // 4. Nothing safe to eat: run to the neighbouring area with the most room, away from ghosts.
    let bestD = null, bv = -1e9;
    for (const d of exits(p, 'pac')) {
      const nx = (sx + DIRS[d][0] + W) % W, ny = sy + DIRS[d][1], i = tileIdx(nx, ny);
      const dm = distMap(nx, ny, 'pac', (x, y) => x === sx && y === sy);
      let room = 0, slackSum = 0;
      for (let k = 0; k < T; k++) if (dm[k] >= 0 && dm[k] < 9) { room++; slackSum += Math.min(3, ga[k] - (dm[k] + 1) / CFG.pacSpeed); }
      const v = (ga[i] - 1 / CFG.pacSpeed) * 4 + slackSum * 0.1 + room * 0.05 + rng() * 0.2 + (d === OPP[p.dir] ? -0.5 : 0);
      if (v > bv) { bv = v; bestD = d; }
    }
    return bestD;
  }
  /** After reaching (gx,gy) at time t0, can Pac-Man keep going through tiles it reaches before any ghost? */
  function hasEscape(gx, gy, t0, ga, margin, level) {
    const need = level === 0 ? 10 : 18, m = margin * 0.7;
    const seen = new Uint8Array(T), qx = [gx], qy = [gy], qt = [t0];
    seen[tileIdx(gx, gy)] = 1;
    let reach = 0, far = 0;
    for (let qi = 0; qi < qx.length; qi++) {
      const x = qx[qi], y = qy[qi], t = qt[qi];
      for (let d = 0; d < 4; d++) {
        const nx = (x + DIRS[d][0] + W) % W, ny = y + DIRS[d][1];
        if (ny < 0 || ny >= H || blocked(nx, ny, 'pac')) continue;
        const i = tileIdx(nx, ny); if (seen[i]) continue;
        const tn = t + 1 / CFG.pacSpeed;
        if (ga[i] - tn <= m) continue;
        seen[i] = 1; reach++; qx.push(nx); qy.push(ny); qt.push(tn);
        if (Math.abs(nx - gx) + Math.abs(ny - gy) >= 6) far++;
      }
    }
    return reach >= need && far >= 3;
  }
  /** Do not dither: keep the current heading when the planner only wants to reverse and ahead is still safe. */
  function keepHeading(p, d, ga, pd, margin) {
    if (d === OPP[p.dir] && canGo(p, p.dir, 'pac')) {
      const ax = (Math.floor(p.x) + DIRS[p.dir][0] + W) % W, ay = Math.floor(p.y) + DIRS[p.dir][1], i = tileIdx(ax, ay);
      if (ga[i] - 1 / CFG.pacSpeed > margin + 0.5) return p.dir;
    }
    return d;
  }

  function cpuGhost(s, gi, rng, level) {
    level = level == null ? 1 : level;
    const g = s.ghosts[gi];
    if (g.mode === 'respawn') return null;
    if (!atCentre(g)) return null;
    if (g.mode === 'eyes') return pathStep(g.x, g.y, 'ghost', (x, y) => x === DOOR[0] && y === DOOR[1]);
    const ex = exits(g, 'ghost'), fwd = ex.filter(d => d !== OPP[g.dir]);
    const pool = fwd.length ? fwd : ex;
    if (g.mode === 'fright' && s.frightLeft > 0) {
      const dm = distMap(s.pac.x, s.pac.y, 'ghost');
      let best = pool[0], bv = -1;
      for (const d of pool) { const i = tileIdx(Math.floor(g.x) + DIRS[d][0], Math.floor(g.y) + DIRS[d][1]); const v = (dm[i] < 0 ? 0 : dm[i]) + rng() * 1.5; if (v > bv) { bv = v; best = d; } }
      return best;
    }
    if (s.fruit && level >= 1 && dist(g, s.pac) > 5) {
      const fx = Math.floor(s.fruit.x), fy = Math.floor(s.fruit.y), d = pathStep(g.x, g.y, 'ghost', (x, y) => x === fx && y === fy);
      if (d != null && distMap(g.x, g.y, 'ghost')[tileIdx(fx, fy)] <= 9) return d;
    }
    const sight = level === 0 ? CFG.ghostSight : level === 1 ? CFG.ghostSight * 1.8 : 99;
    const near = dist(g, s.pac) <= sight;
    if (near && rng() > (level === 0 ? 0.35 : 0.05)) {
      // Three roles so the pack does not simply queue behind each other.
      let tx = Math.floor(s.pac.x), ty = Math.floor(s.pac.y);
      if (gi === 1 || (gi === 2 && dist(g, s.pac) < 5)) {
        for (let k = gi === 1 ? 4 : 2; k > 0; k--) { const nx = tx + DIRS[s.pac.dir][0] * k, ny = ty + DIRS[s.pac.dir][1] * k; if (ny >= 0 && ny < H && !blocked(nx, ny, 'ghost')) { tx = ((nx % W) + W) % W; ty = ny; break; } }
      }
      const skip = gi === 2 ? null : null;
      const d = pathStep(g.x, g.y, 'ghost', (x, y) => x === tx && y === ty, skip);
      if (d != null && !(d === OPP[g.dir] && fwd.length && rng() < 0.7)) return d;
    }
    // Wander, preferring to keep going and to head towards where pellets remain (Pac-Man must come for them).
    if (!pool.length) return OPP[g.dir];
    if (pool.includes(g.dir) && rng() < 0.55) return g.dir;
    return pool[Math.floor(rng() * pool.length)];
  }

  function mulberry(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  return { W, H, ROWS, DIRS, OPP, CFG, START, maze, newRound, update, view, cpuGhost, cpuPac, ghostIndexOf, playerOfGhost, mulberry, wallAt, dist };
  }

  const api = build(BUILTIN);
  api.create = build; api.makeMaze = makeMaze; api.BUILTIN = BUILTIN;
  return api;
});
