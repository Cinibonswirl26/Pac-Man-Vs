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
    pacSpeed: 0.5 * FPS / CELL,          // 3.73 cells/s on a cleared corridor
    pelletPause: 1 / FPS,                // eating a pellet holds Pac-Man for a frame: 0.4725 px/frame measured over a pellet row against 0.503 cleared
    ghostSpeed: (0.5 + 1 / 256) * FPS / CELL,   // a hair faster than Pac-Man: about 1 px more per 128 px
    frightSpeed: 0.375 * FPS / CELL,     // 2.80 cells/s
    greySpeed: FPS / CELL / 3,           // a grey stand-in wanders at a third of a pixel a frame: two thirds of ghost speed (measured on the original's radar)
    // The warp tunnel (a row open at both edges) carries on out of sight: a ghost going off one edge comes back on the
    // other after a hidden stretch, and every ghost (grey ones too, not Pac-Man) moves at three quarters speed within
    // the outer cells and the hidden stretch. Measured on the original: 0.375 px/frame against 0.504 on the open row,
    // 70 frames from the last cell's centre on one side to the last cell's centre on the other.
    tunnelSlow: 0.75, tunnelEdge: 2.5, tunnelHidden: 2.3,
    eyeSpeed: 1.0 * FPS / CELL,          // not measured
    frightTime: 10, frightFlash: 2,
    // Pac-Man leaves a trail in his player's colour that ghosts can follow. Look (wide flat ribbon, paler by Pac-Man) is from the original; the length is a guess.
    trailTime: 2, trailEvery: 0.1,
    ghostSight: 4.6,
    // The 3D circle looks down at an angle, so it shows ground out to about 1.3 times the sight radius ahead of the ghost; what the server sends covers all of it.
    viewReach: 1.35,
    catchDist: 0.55,                     // how close a ghost and Pac-Man must be (cell centres) to touch; their bodies are about 0.65 wide
    // Fruit: appears in the middle of the maze once enough pellets are gone (documented: both sides may take it,
    // ghosts get 400 points and a wider view for a while). The numbers below are guesses.
    fruitPts: 400, fruitFirst: 6, fruitEvery: 70, fruitStay: 10, fruitSightMult: 1.6, fruitSightTime: 10,
    clearBonus: 1600, hideAt: 20,          // at 20 pellets left the ghosts' screens stop showing pellets (stated by a player who knows the original)
    pelletPts: 10, powerPts: 110,
    ghostChain: [200, 400, 800, 1600],   // not measured
    stealPts: 1600, startPts: 1600,
    targets: [7000, 10000, 15000], defaultTarget: 7000,
    // Arrangement levels only (shared/arrange.js). From the 1996 arcade game's demo: a dash runs at about 2.5-3 times
    // walking speed; from the handheld port played in an emulator: an arrow fires once, only when crossed in its own
    // direction, you keep steering during the dash, and a ghost hit by a dashing Pac-Man stands dizzy for about 5 s;
    // a jump takes about two thirds of a second. The dash itself is a burst of momentum, measured on the handheld
    // port of the arcade game (cells of 8 px, walking 65 px/s there): it launches at about 4 times walking speed and
    // fades slowly on a straight (about 1.5 walking speeds per second); a turn keeps about 65% of it and then it
    // fades fast (about 4 walking speeds per second); holding the opposite direction brakes hard (about 17 walking
    // speeds per second), then you walk back; a wall stops it dead with a bonk that leaves you dizzy for 0.4 s.
    dashMult: 4, dashDecay: 1.5, dashTurnKeep: 0.65, dashTurnDecay: 4, dashBrake: 17, bonkTime: 0.4, stunTime: 5, jumpTime: 0.6,
    // Capsules appear where the fruit does; which one (or the fruit) is a weighted draw. Red: double speed for 10 s
    // (a ghost instead holds a dash for 10 s: each press of its button fires one like an arrow, 2 s apart at most);
    // cyan: a mirror clone for 10 s; pink: every ghost into the pot in the house for 4 s (a ghost taking it hops
    // about instead); orange: pellets digested without pausing for 10 s (a ghost drops big pellets that slow
    // Pac-Man); gold: 100 points and nothing else. Points are fruit-like here (the arcade gave 1000).
    speedMult: 2, capsuleTime: 10, dashCool: 2, potTime: 4, capsulePts: 400, goldPts: 100, bigPause: 0.5, bigPts: 50, bigMax: 10,
    itemOdds: [['fruit', 3], ['red', 2], ['cyan', 2], ['pink', 2], ['orange', 2], ['gold', 1]]
  };

  /** A maze descriptor. rows use: '#' wall, '=' house wall, 'D' door (ghosts only), '.' pellet,
   *  'o' power pellet, ' ' or '_' empty floor. The house is the rectangle ghosts wait in.
   *  `ghosts` are the three ghost start cells; ghosts start outside the house, ready to play. */
  function makeMaze(rows, o) {
    const m = { rows, W: rows[0].length, H: rows.length, pac: o.pac, ghosts: o.ghosts, door: o.door, exit: o.exit, house: o.house, name: o.name || 'maze' };
    if (o.fruit) m.fruit = o.fruit;
    if (o.arrange) m.arrange = o.arrange;      // the "Arrangement" overlay (see shared/arrange.js): pads and capsules
    return m;
  }
  const BUILTIN = makeMaze(HALF.map(h => h + h.slice(0, 11).split('').reverse().join('')), {
    name: 'built-in', pac: [11, 13], ghosts: [[8, 8], [14, 8], [11, 8]], door: [11, 9], exit: [11, 8], house: { x0: 10, x1: 12, y0: 10, y1: 11 }
  });

  /** Builds the rules for one maze. All maze-specific numbers live in `maze`. */
  function build(maze) {
  if (!maze.W) maze = makeMaze(maze.rows, maze);      // accept a bare descriptor (as sent over the network)
  const ROWS = maze.rows, W = maze.W, H = maze.H, START = { pac: maze.pac, ghosts: maze.ghosts }, DOOR = maze.door, EXIT = maze.exit, HOUSE = maze.house, FRUIT = maze.fruit || maze.pac;
  // The Arrangement overlay, if any: PADS[k] is a dash arrow or a jump pad, padAt[cell] its index (or -1)
  const ARR = maze.arrange || null, PADS = ARR ? ARR.pads : [];
  const padAt = new Int8Array(W * H).fill(-1); PADS.forEach((p, k) => { padAt[p.y * W + p.x] = k; });

  function wallAt(x, y, who) {
    if (y < 0 || y >= H) return true;
    x = ((x % W) + W) % W;
    const c = ROWS[y][x];
    if (c === '#' || c === '=') return true;
    if (c === 'D') return who !== 'eyes';      // the door: only eaten ghosts (eyes) pass freely, ghosts use it one way only (see canGo)
    return false;
  }
  // house interior is ghost-only
  function inHouse(x, y) { return x >= HOUSE.x0 && x <= HOUSE.x1 && y >= HOUSE.y0 && y <= HOUSE.y1; }
  function blocked(x, y, who) { return wallAt(x, y, who) || ((who === 'pac' || who === 'ghost') && inHouse(x, y)); }
  const cellAt = (x, y) => (y < 0 || y >= H) ? '#' : ROWS[y][((x % W) + W) % W];
  // rows open at both edges wrap round through the hidden tunnel stretch; positions W..W+tunnelHidden are out of sight
  const TROW = ROWS.map(r => !/[#=]/.test(r[0]) && !/[#=]/.test(r[W - 1]));
  const ringOf = y => W + (TROW[Math.floor(y)] ? CFG.tunnelHidden : 0);
  const inTunnel = e => TROW[Math.floor(e.y)] && (e.x < CFG.tunnelEdge || e.x > W - CFG.tunnelEdge);

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
    return Object.assign({
      pellets, total, left: total, target: opts.target || CFG.defaultTarget,
      frightLeft: 0, chain: 0, over: false, overReason: '', events: [],
      pac: Object.assign(ent(START.pac), { pause: 0 }, ARR ? { dash: 0, turned: false, bonk: 0, air: null, onPad: -1, speedLeft: 0, digest: 0, clone: null } : {}),
      // opts.standin[i]: ghost slot i has nobody playing it and is a grey stand-in: harmless until a ghost player touches it.
      // opts.claims[i]: the ghost slot stand-in i is already woken by (tests only; a match starts every stand-in grey), or -1
      ghosts: START.ghosts.map((g, i) => Object.assign(ent(g), { mode: 'normal', id: i, sightLeft: 0, grey: !!(opts.standin && opts.standin[i]) && !(opts.claims && opts.claims[i] >= 0), standin: !!(opts.standin && opts.standin[i]), claim: opts.standin && opts.standin[i] && opts.claims && opts.claims[i] >= 0 ? opts.claims[i] : -1 }, ARR ? { dash: 0, turned: false, bonk: 0, air: null, onPad: -1, stun: 0, dashLeft: 0, dashCool: 0, clone: null, dropLeft: 0, dropped: 0, potted: false, hopLeft: 0 } : {})),
      // opts.players[i]: the seat playing ghost slot i (kept across rounds by the match); without it, seat order
      gp: opts.players ? opts.players.slice() : null,
      scores: scores || [0, 0, 0, 0], roundScores: [0, 0, 0, 0],
      pacPlayer, tick: 0, catcher: -1, steal: 0, winner: -1, time: 0,
      eaten: 0, nextFruit: CFG.fruitFirst, fruit: null, trail: [], trailLast: -1
    }, ARR ? { big: new Uint8Array(W * H), pot: 0, rng: opts.rng || Math.random, padsUsed: new Uint8Array(PADS.length) } : {});
  }
  function ent(p) { return { x: p[0] + 0.5, y: p[1] + 0.5, dir: 1, want: 1 }; }

  // The three non-Pac players take ghost slots 0..2 in seat order, unless the state says who holds which
  // slot (state.gp): the match keeps the slots from round to round, the old Pac-Man taking the catcher's.
  function ghostIndexOf(state, player) {
    if (player === state.pacPlayer) return -1;
    if (state.gp) return state.gp.indexOf(player);
    let gi = 0;
    for (let p = 0; p < 4; p++) { if (p === state.pacPlayer) continue; if (p === player) return gi; gi++; }
    return -1;
  }
  /** Whose colour ghost gi wears: its own player's, the colour of the ghost that woke it up (a stand-in), or -1 for grey. */
  function colorOf(state, gi) {
    const g = state.ghosts[gi];
    return g.grey ? -1 : playerOfGhost(state, g.claim >= 0 ? g.claim : gi);   // claim: the slot of the ghost that woke it
  }
  function playerOfGhost(state, gi) {
    if (state.gp) return gi >= 0 && gi < state.gp.length ? state.gp[gi] : -1;
    let n = 0;
    for (let p = 0; p < 4; p++) { if (p === state.pacPlayer) continue; if (n === gi) return p; n++; }
    return -1;
  }

  function canGo(e, dir, who) {
    const cx = Math.floor(e.x), cy = Math.floor(e.y), nx = cx + DIRS[dir][0], ny = cy + DIRS[dir][1];
    if (who !== 'ghost') return !blocked(nx, ny, who);
    // A ghost that is not eaten may only leave the house: from inside it goes up through the door and out,
    // and it can never come back in or step down through the door.
    const c = cellAt(nx, ny);
    if (c === '#' || c === '=') return false;
    if (c === 'D') return dir === 0 && inHouse(cx, cy);
    if (inHouse(nx, ny)) return inHouse(cx, cy);
    if (cellAt(cx, cy) === 'D') return dir === 0;
    return true;
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
      const ring = ringOf(e.y);
      if (e.x < 0) e.x += ring; else if (e.x >= ring) e.x -= ring;
      if (m >= (dn || 1) - 1e-9) {
        // landed on a centre: snap exactly
        e.x = Math.floor(e.x + 1e-7) + 0.5; e.y = Math.floor(e.y + 1e-7) + 0.5;
        if (dx < 0 || dy < 0) { e.x = Math.round(e.x - 0.5) + 0.5; e.y = Math.round(e.y - 0.5) + 0.5; }
      }
    }
  }

  function dist(a, b) {
    const ring = W + CFG.tunnelHidden;
    let dx = Math.abs(a.x - b.x); if (dx > ring / 2) dx = ring - dx;
    return Math.hypot(dx, a.y - b.y);
  }

  // ---------- Arrangement pads (no-ops on a plain maze) ----------
  const atCentreOf = e => Math.abs(e.x - Math.floor(e.x) - 0.5) < 1e-6 && Math.abs(e.y - Math.floor(e.y) - 0.5) < 1e-6;
  /** How far an entity could go straight from its cell in direction d before a wall. */
  function freeRun(e, d, who) {
    let n = 0; const t = { x: e.x, y: e.y };
    while (n < W && canGo(t, d, who)) { t.x += DIRS[d][0]; t.y += DIRS[d][1]; n++; if (t.y < 0 || t.y >= H) break; }
    return n;
  }
  /** On a pad's cell. A dash arrow fires once per round, for whoever crosses it moving in the arrow's own direction:
   *  the entity is hurled on at dashMult times its speed (see moveEnt for how that fades). A jump
   *  pad launches the entity towards its partner pad and does not fire again until the cell has been left. */
  function padCheck(s, e, who) {
    if (!ARR || e.x >= W || e.air) return;
    const idx = Math.floor(e.y) * W + Math.floor(e.x);
    if (!(idx >= 0 && idx < W * H)) return;
    const k = padAt[idx];
    const fresh = k !== e.onPad; e.onPad = k;
    if (k < 0) return;
    const pad = PADS[k];
    if (pad.kind === 'dash') {
      if (s.padsUsed[k] || e.dir !== pad.dir || !e.moved) return;
      s.padsUsed[k] = 1; e.dash = CFG.dashMult; e.turned = false; s.events.push('dash');
    } else if (fresh) {
      const to = PADS[pad.pair];
      e.x = pad.x + 0.5; e.y = pad.y + 0.5;
      e.air = { x0: e.x, y0: e.y, x1: to.x + 0.5, y1: to.y + 0.5, t: 0, dur: CFG.jumpTime, to: pad.pair }; s.events.push('jump');
    }
  }
  /** Walking; a dash (e.dash, the current multiple of walking speed) is momentum that fades: slowly on a straight,
   *  fast once you have turned (the turn itself costs a third of it), hard while the opposite direction is held (no
   *  reversing until it is spent, then you walk back). It ends once it is down to walking pace, or at a wall: a bonk
   *  that leaves you dizzy for bonkTime (a wanted turn at the corner is taken instead). */
  function moveEnt(s, e, speed, dt, who) {
    const x0 = e.x, y0 = e.y, d0 = e.dir;
    if (e.dash) {
      const braking = e.want === OPP[e.dir];
      e.dash -= (braking ? CFG.dashBrake : e.turned ? CFG.dashTurnDecay : CFG.dashDecay) * dt;
      if (e.dash <= 1) { e.dash = 0; e.turned = false; }
    }
    if (e.dash) {
      const want = e.want; if (want === OPP[e.dir]) e.want = e.dir;
      step(e, speed * e.dash, dt, who);
      e.want = want;
      if (e.dir !== d0) { e.dash *= CFG.dashTurnKeep; e.turned = true; }
      if (atCentreOf(e) && !canGo(e, e.dir, who) && !(e.want !== e.dir && canGo(e, e.want, who))) { e.dash = 0; e.turned = false; e.bonk = CFG.bonkTime; s.events.push('bonk'); }
      e.px = x0; e.py = y0;
    } else step(e, speed, dt, who);
    e.moved = e.x !== x0 || e.y !== y0;
  }
  /** Whether a dasher's last step (a straight run from px,py to x,y, up to two thirds of a cell) passed within
   *  catchDist of `b`: at dash speed a plain end-of-tick distance check can miss a body it ran straight through. */
  function sweptHit(e, b) {
    if (!e.dash || e.px === undefined || Math.abs(e.x - e.px) > W / 2) return false;
    const vx = e.x - e.px, vy = e.y - e.py, l2 = vx * vx + vy * vy;
    if (!l2) return false;
    const t = Math.max(0, Math.min(1, ((b.x - e.px) * vx + (b.y - e.py) * vy) / l2));
    return Math.hypot(b.x - (e.px + t * vx), b.y - (e.py + t * vy)) < CFG.catchDist;
  }
  /** Airborne: along the line between the pads; on landing face the longest open run. */
  function flyStep(s, e, who, dt) {
    const a = e.air; a.t += dt;
    const k = Math.min(1, a.t / a.dur);
    e.x = a.x0 + (a.x1 - a.x0) * k; e.y = a.y0 + (a.y1 - a.y0) * k;
    if (k < 1) return;
    e.x = a.x1; e.y = a.y1; e.air = null; e.onPad = a.to;
    let best = 0, bd = e.dir;
    for (let d = 0; d < 4; d++) { const n = freeRun(e, d, who); if (n > best) { best = n; bd = d; } }
    e.dir = e.want = bd; s.events.push('land');
  }

  // ---------- Arrangement items and effects (no-ops on a plain maze) ----------
  const MIRDIR = [0, 3, 2, 1];
  const mirrorX = e => { const ring = ringOf(e.y); return ((W - e.x) % ring + ring) % ring; };
  /** What appears at the fruit spot: the fruit on a plain maze, otherwise a weighted draw. */
  function spawnItem(s) {
    const f = { x: FRUIT[0] + 0.5, y: FRUIT[1] + 0.5, left: CFG.fruitStay };
    if (ARR && ARR.items) {
      const total = CFG.itemOdds.reduce((a, o) => a + o[1], 0); let r = s.rng() * total;
      f.kind = 'fruit'; for (const [k, w] of CFG.itemOdds) { r -= w; if (r < 0) { f.kind = k; break; } }
    }
    s.fruit = f;
  }
  /** Pac-Man (gi -1) or ghost gi takes what is at the fruit spot. Returns true if the round ended. */
  function takeItem(s, gi) {
    const kind = s.fruit.kind || 'fruit', g = gi >= 0 ? s.ghosts[gi] : null, who = gi >= 0 ? colorOf(s, gi) : s.pacPlayer;
    s.fruit = null; s.nextFruit = s.eaten + CFG.fruitEvery;
    if (kind === 'fruit') {
      if (g) g.sightLeft = CFG.fruitSightTime;
      s.events.push(g ? 'fruitghost' : 'fruit'); award(s, who, CFG.fruitPts); return s.over;
    }
    s.events.push(g ? 'capsuleghost' : 'capsule'); s.lastItem = kind;
    if (kind === 'red') { if (g) { g.dashLeft = CFG.capsuleTime; g.dashCool = 0; } else s.pac.speedLeft = CFG.capsuleTime; }
    else if (kind === 'cyan') { const e = g || s.pac; e.clone = { x: mirrorX(e), y: e.y, dir: MIRDIR[e.dir], left: CFG.capsuleTime }; }
    else if (kind === 'pink') { if (g) g.hopLeft = CFG.capsuleTime; else potGhosts(s); }
    else if (kind === 'orange') { if (g) { g.dropLeft = CFG.capsuleTime; g.dropped = 0; g.dropAt = null; } else s.pac.digest = CFG.capsuleTime; }
    award(s, who, kind === 'gold' ? CFG.goldPts : CFG.capsulePts); return s.over;
  }
  /** The pink capsule: every ghost in play is pulled into the house and held there for a while. */
  function potGhosts(s) {
    for (const g of s.ghosts) {
      if (g.mode === 'eyes' || g.grey) continue;
      g.x = DOOR[0] + 0.5; g.y = HOUSE.y0 + 0.5; g.dir = g.want = 0; g.mode = 'normal'; g.dash = 0; g.bonk = 0; g.air = null; g.clone = null; g.potted = true; g.onPad = -1;
    }
    s.pot = CFG.potTime; s.events.push('pot');
  }
  /** A random open cell outside the house (not a pad, not the fruit spot) for a hop. */
  function hopTarget(s) {
    for (let n = 0; n < 200; n++) {
      const x = Math.floor(s.rng() * W), y = Math.floor(s.rng() * H);
      if (blocked(x, y, 'ghost') || padAt[y * W + x] >= 0 || (x === FRUIT[0] && y === FRUIT[1])) continue;
      return [x, y];
    }
    return null;
  }
  /** Timers for the capsule effects; clones vanish when their time is up. */
  function tickEffects(s, dt) {
    const p = s.pac;
    if (p.speedLeft > 0) p.speedLeft = Math.max(0, p.speedLeft - dt);
    if (p.digest > 0) p.digest = Math.max(0, p.digest - dt);
    if (p.clone && (p.clone.left -= dt) <= 0) { p.clone = null; s.events.push('clonegone'); }
    for (const g of s.ghosts) {
      if (g.dashLeft > 0) g.dashLeft = Math.max(0, g.dashLeft - dt);
      if (g.dashCool > 0) g.dashCool = Math.max(0, g.dashCool - dt);
      if (g.dropLeft > 0) g.dropLeft = Math.max(0, g.dropLeft - dt);
      if (g.clone && (g.clone.left -= dt) <= 0) { g.clone = null; s.events.push('clonegone'); }
      if (g.hopLeft > 0) g.hopLeft = Math.max(0, g.hopLeft - dt);
    }
    if (s.pot > 0 && (s.pot -= dt) <= 0) { s.pot = 0; s.ghosts.forEach(g => { g.potted = false; }); }
  }
  /** A clone shadows its owner: the same moves mirrored about the maze's centre line. */
  function moveClone(e) { if (e.clone) { e.clone.x = mirrorX(e); e.clone.y = e.y; e.clone.dir = MIRDIR[e.dir]; } }
  /** A ghost with the orange capsule leaves big pellets behind it: on each empty cell it has just left. */
  function dropBig(s, g) {
    if (g.x >= W) return;
    const i = Math.floor(g.y) * W + Math.floor(g.x);
    if (g.dropAt === i) return;
    const j = g.dropAt; g.dropAt = i;
    if (j == null || g.dropped >= CFG.bigMax) return;
    const x = j % W, y = Math.floor(j / W);
    if (inHouse(x, y) || cellAt(x, y) === 'D' || s.pellets[j] || s.big[j] || padAt[j] >= 0 || (x === FRUIT[0] && y === FRUIT[1])) return;
    s.big[j] = 1; g.dropped++;
  }
  /** Whether a ghost is out of play for touching anything: in the air, dizzy or in the pot. */
  const outOfPlay = g => g.air || g.stun > 0 || g.bonk > 0 || g.potted;

  function award(s, player, pts) {
    s.scores[player] += pts; s.roundScores[player] += pts;
    if (s.scores[player] >= s.target && !s.over) { s.over = true; s.overReason = 'won'; s.winner = player; }
  }

  /** Pac-Man (or his clone) eats what is on the cell under him. Returns true if the round ended. */
  function eatCell(s, e) {
    if (e.x >= W) return false;                 // nothing to eat in the hidden part of the tunnel
    const pi = Math.floor(e.y) * W + Math.floor(e.x), real = e === s.pac;
    if (ARR && s.big[pi]) {                     // a big pellet dropped by a ghost: worth more, slow to chew
      s.big[pi] = 0; s.events.push('bigpellet'); award(s, s.pacPlayer, CFG.bigPts);
      if (real && !s.pac.dash && !(s.pac.speedLeft > 0) && !(s.pac.digest > 0)) s.pac.pause += CFG.bigPause;
      if (s.over) return true;
    }
    if (!s.pellets[pi]) return false;
    const power = s.pellets[pi] === 2;
    s.pellets[pi] = 0; s.left--; s.eaten++;
    if (real && !s.pac.dash && !(s.pac.speedLeft > 0) && !(s.pac.digest > 0)) s.pac.pause += CFG.pelletPause;
    if (!s.fruit && s.eaten >= s.nextFruit && s.left > 8) spawnItem(s);
    s.events.push(power ? 'power' : 'pellet');
    if (power) {
      s.frightLeft = CFG.frightTime; s.chain = 0;
      s.ghosts.forEach(g => { if (g.mode === 'normal') { g.mode = 'fright'; g.want = OPP[g.dir]; } });   // grey stand-ins too
    }
    award(s, s.pacPlayer, power ? CFG.powerPts : CFG.pelletPts);
    if (s.over) return true;
    if (s.left <= 0) { award(s, s.pacPlayer, CFG.clearBonus); s.over = true; s.overReason = s.winner >= 0 ? 'won' : 'cleared'; return true; }
    return false;
  }
  /** A frightened ghost is eaten: Pac-Man gains the chain points and the owner loses them (measured on the disc). */
  function eatGhost(s, i) {
    const g = s.ghosts[i];
    g.mode = 'eyes'; s.events.push('eatghost');
    if (g.standin) { g.grey = true; g.claim = -1; }     // a woken stand-in that is eaten goes back to grey
    const pts = CFG.ghostChain[Math.min(s.chain, CFG.ghostChain.length - 1)], owner = g.grey ? -1 : colorOf(s, i);
    if (owner >= 0) { const lose = Math.min(pts, s.scores[owner]); s.scores[owner] -= lose; s.roundScores[owner] -= lose; }
    award(s, s.pacPlayer, pts); s.chain++;
    if (ARR) g.clone = null;
    return s.over;
  }
  /** Ghost i (or its clone) catches Pac-Man: steals points and takes over as Pac-Man next round. */
  function catchPac(s, i) {
    const catcher = colorOf(s, i), steal = Math.min(CFG.stealPts, s.scores[s.pacPlayer]);
    s.scores[s.pacPlayer] -= steal; s.roundScores[s.pacPlayer] -= steal;
    s.catcher = catcher; s.steal = steal; s.events.push('catch');
    award(s, catcher, steal);
    s.over = true; s.overReason = s.winner >= 0 ? 'won' : 'caught';
  }

  // inputs: {pac: dir|null, ghosts: [dir|null x3], act: [bool x3] (the action button, Arrangement levels: a hop or a dash)} already mapped from players
  function update(s, inputs, dt) {
    if (s.over) return;
    dt = dt || CFG.tick;
    s.tick++; s.time += dt; s.events.length = 0;
    if (ARR) tickEffects(s, dt);

    // Pac-Man
    if (inputs.pac != null) s.pac.want = inputs.pac;
    if (s.pac.air) flyStep(s, s.pac, 'pac', dt);
    else if (s.pac.bonk > 0) s.pac.bonk = Math.max(0, s.pac.bonk - dt);     // dizzy against a wall: going nowhere
    else {
      const held = s.pac.dash ? 0 : Math.min(dt, s.pac.pause || 0);          // time still owed to the last pellet (a dash owes nothing)
      s.pac.pause = s.pac.dash ? 0 : (s.pac.pause || 0) - held;
      moveEnt(s, s.pac, CFG.pacSpeed * (s.pac.speedLeft > 0 ? CFG.speedMult : 1), dt - held, 'pac');
      padCheck(s, s.pac, 'pac');
    }
    if (!s.pac.air && s.time - s.trailLast >= CFG.trailEvery) { s.trail.push({ x: s.pac.x, y: s.pac.y, t: s.time }); s.trailLast = s.time; }
    while (s.trail.length && s.time - s.trail[0].t > CFG.trailTime) s.trail.shift();
    if (!s.pac.air && eatCell(s, s.pac)) return;
    if (ARR) { moveClone(s.pac); if (s.pac.clone && eatCell(s, s.pac.clone)) return; }
    if (s.fruit) {
      s.fruit.left -= dt;
      if (!s.pac.air && dist(s.pac, s.fruit) < 0.7) { if (takeItem(s, -1)) return; }
      else if (s.fruit.left <= 0) { s.fruit = null; s.nextFruit = s.eaten + CFG.fruitEvery; }
    }
    if (s.frightLeft > 0) {
      s.frightLeft -= dt;
      if (s.frightLeft <= 0) { s.frightLeft = 0; s.ghosts.forEach(g => { if (g.mode === 'fright') g.mode = 'normal'; }); }
    }

    // Ghosts
    for (let i = 0; i < s.ghosts.length; i++) {
      const g = s.ghosts[i];
      if (g.sightLeft > 0) g.sightLeft = Math.max(0, g.sightLeft - dt);
      if (g.mode === 'eyes') {
        // An eaten ghost flies back to the house by itself (nobody steers it), then plays again from inside.
        g.want = eyeWant(g);
        step(g, CFG.eyeSpeed, dt, 'eyes');
        if (Math.floor(g.x) === DOOR[0] && Math.floor(g.y) === HOUSE.y0 && Math.hypot(g.x - (DOOR[0] + 0.5), g.y - (HOUSE.y0 + 0.5)) < 0.3) {
          g.mode = 'normal'; g.dir = g.want = 0; s.events.push('respawn');
        }
        continue;
      }
      if (g.air) { flyStep(s, g, 'ghost', dt); if (ARR) moveClone(g); continue; }          // in the air: out of play until it lands
      if (g.stun > 0) { g.stun = Math.max(0, g.stun - dt); continue; }   // knocked dizzy by a dash: cannot move, catch or take anything
      if (g.bonk > 0) { g.bonk = Math.max(0, g.bonk - dt); continue; }   // dizzy from its own dash into a wall: the same
      if (g.potted) continue;                                            // held in the pot
      const pressed = !!(inputs.act && inputs.act[i]) && !g.grey;
      if (g.hopLeft > 0 && pressed) {                                      // the hop, on its player's button: off to a random cell
        const t = hopTarget(s);
        if (t) { g.air = { x0: g.x, y0: g.y, x1: t[0] + 0.5, y1: t[1] + 0.5, t: 0, dur: CFG.jumpTime, to: -1 }; g.dash = 0; s.events.push('hop'); continue; }
      }
      const inp = inputs.ghosts[i];
      if (inp != null) g.want = inp;
      if (g.dashLeft > 0 && pressed && !g.dash && !(g.dashCool > 0)) {     // the red capsule's dash, on the button: fired the way it faces, then a cooldown
        g.dash = CFG.dashMult; g.turned = false; g.dashCool = CFG.dashCool; s.events.push('dash');
      }
      moveEnt(s, g, (g.mode === 'fright' ? CFG.frightSpeed : g.grey ? CFG.greySpeed : CFG.ghostSpeed) * (inTunnel(g) ? CFG.tunnelSlow : 1), dt, 'ghost');
      padCheck(s, g, 'ghost');
      if (ARR) { moveClone(g); if (g.dropLeft > 0) dropBig(s, g); }
      if ((g.grey && g.mode !== 'fright') || g.air) continue;   // a grey stand-in takes no part: no fruit, Pac-Man passes through it; frightened, it can be eaten
      if (s.pac.air) continue;                    // nobody touches Pac-Man while he is in the air
      if (s.fruit && g.mode !== 'eyes' && !g.grey && dist(g, s.fruit) < 0.7 && takeItem(s, i)) return;
      if (dist(g, s.pac) < CFG.catchDist || (ARR && (sweptHit(s.pac, g) || sweptHit(g, s.pac)))) {
        if (g.mode === 'fright') { if (eatGhost(s, i)) return; }
        else if (g.mode === 'normal' && s.pac.dash) { g.stun = CFG.stunTime; s.events.push('stun'); }   // a dashing Pac-Man knocks a ghost aside and leaves it dizzy
        else if (g.mode === 'normal') { catchPac(s, i); return; }
      }
    }
    // Clones: Pac-Man's mirror eats frightened ghosts and vanishes when a normal one touches it (nothing is stolen);
    // a ghost's mirror catches Pac-Man for its owner, and is eaten (points for Pac-Man, nothing charged) while its owner is frightened.
    if (ARR && !s.pac.air) {
      for (let i = 0; i < s.ghosts.length; i++) {
        const g = s.ghosts[i];
        if (g.grey || g.mode === 'eyes' || outOfPlay(g)) continue;
        if (s.pac.clone && dist(g, s.pac.clone) < CFG.catchDist) {
          if (g.mode === 'fright') { if (eatGhost(s, i)) return; }
          else { s.pac.clone = null; s.events.push('clonegone'); }
        }
        if (g.clone && dist(g.clone, s.pac) < CFG.catchDist) {
          if (g.mode === 'fright') { g.clone = null; s.events.push('eatghost'); award(s, s.pacPlayer, CFG.ghostChain[Math.min(s.chain, CFG.ghostChain.length - 1)]); s.chain++; if (s.over) return; }
          else { catchPac(s, i); return; }
        }
      }
    }
    // A grey stand-in that a ghost passes through takes that ghost's colour and goes hunting for Pac-Man.
    for (const a of s.ghosts) {
      if (!a.grey || a.mode !== 'normal' || a.air) continue;
      for (let j = 0; j < s.ghosts.length; j++) {
        const b = s.ghosts[j];
        if (b === a || b.grey || b.mode !== 'normal' || b.air || dist(a, b) >= CFG.catchDist) continue;
        a.grey = false; a.claim = b.standin && b.claim >= 0 ? b.claim : j; s.events.push('claim');   // woken by slot j (or by whatever woke j)
        break;
      }
    }
  }

  // Eaten ghosts: the direction towards the house from the centre they are about to reach.
  let eyeField = null;
  /** Steer an eaten ghost: turn round if the centre behind is the shorter way home, and choose the turn to make at
   *  the centre ahead (a ghost passes a centre inside a tick, so the choice has to be made beforehand). */
  function eyeWant(g) {
    if (!eyeField) eyeField = distMap(DOOR[0], HOUSE.y0, 'eyes');
    const fieldAt = (x, y) => { if (y < 0 || y >= H) return 1e6; const v = eyeField[tileIdx(x, y)]; return v < 0 ? 1e6 : v; };
    let dx = DIRS[g.dir][0], dy = DIRS[g.dir][1];
    const cx = Math.floor(g.x), cy = Math.floor(g.y);
    let ahead = (cx + 0.5 - g.x) * dx + (cy + 0.5 - g.y) * dy;
    if (Math.abs(ahead) > 1e-9) {
      const frontX = ahead > 0 ? cx : cx + dx, frontY = ahead > 0 ? cy : cy + dy;
      const travelled = ahead > 0 ? 1 - ahead : -ahead;
      if (travelled + fieldAt(frontX - dx, frontY - dy) < (1 - travelled) + fieldAt(frontX, frontY) - 1e-6) {
        g.dir = OPP[g.dir]; dx = -dx; dy = -dy; ahead = (cx + 0.5 - g.x) * dx + (cy + 0.5 - g.y) * dy;
      }
    }
    // the centre this ghost reaches next (or stands on)
    const fx = Math.abs(ahead) <= 1e-9 || ahead > 0 ? cx : cx + dx, fy = Math.abs(ahead) <= 1e-9 || ahead > 0 ? cy : cy + dy;
    if (fieldAt(fx, fy) === 0) return g.dir;
    let best = -1, bv = 1e9;
    for (let d = 0; d < 4; d++) {
      if (d === OPP[g.dir]) continue;
      const nx = (fx + DIRS[d][0] + W) % W, ny = fy + DIRS[d][1];
      if (ny < 0 || ny >= H || blocked(nx, ny, 'eyes')) continue;
      const v = fieldAt(nx, ny); if (v < bv || (v === bv && d === g.dir)) { bv = v; best = d; }
    }
    return best < 0 ? OPP[g.dir] : best;
  }

  // What a given player is allowed to see. Pac-Man sees all. The ghost players share one screen in the
  // original, with a circle of sight around each ghost, so a ghost player sees what any ghost sees.
  const sightOf = g => CFG.ghostSight * (g.sightLeft > 0 ? CFG.fruitSightMult : 1);
  function view(s, player) {
    const gi = ghostIndexOf(s, player);
    const me = gi < 0 ? s.pac : s.ghosts[gi];
    const sight = gi >= 0 ? sightOf(me) : CFG.ghostSight;
    const seen = (x, y) => s.ghosts.some(g => Math.hypot(x - g.x, y - g.y) <= sightOf(g) * CFG.viewReach);
    const vis = e => gi < 0 || seen(e.x, e.y);
    const out = {
      tick: s.tick, target: s.target, frightLeft: Math.round(s.frightLeft * 100) / 100, left: s.left, eaten: s.eaten, over: s.over, why: s.overReason,
      pacPlayer: s.pacPlayer, gp: s.gp, scores: s.scores.slice(), rs: s.roundScores.slice(), me: gi, ev: s.events.slice(),
      catcher: s.catcher, steal: s.steal, winner: s.winner, sight, boost: gi >= 0 ? me.sightLeft : 0, fruitUp: !!s.fruit,
      fruit: s.fruit && vis(s.fruit) ? { x: s.fruit.x, y: s.fruit.y } : null,
      pac: vis(s.pac) ? q(s.pac) : null,
      // the trail Pac-Man leaves: [x, y, age in seconds]; ghosts only see the parts inside a circle of sight
      trail: s.trail.filter(p => vis(p)).map(p => [Math.round(p.x * 100) / 100, Math.round(p.y * 100) / 100, Math.round((s.time - p.t) * 100) / 100]),
      // Every ghost is on the shared screen (its own circle and the minimap); `s` is the radius of its circle.
      ghosts: s.ghosts.map((g, i) => Object.assign(q(g), { m: g.potted ? 'r' : g.mode[0], s: sightOf(g), c: colorOf(s, i) }, ARR ? qa(g) : {}))
    };
    if (ARR) {
      out.arr = 1; if (out.pac) Object.assign(out.pac, qa(s.pac));
      if (out.fruit) out.fruit.k = s.fruit.kind || 'fruit';
      out.pot = Math.round(s.pot * 100) / 100;
      out.padsOff = []; s.padsUsed.forEach((u, k) => { if (u) out.padsOff.push(k); });
      out.clones = [];
      if (s.pac.clone && vis(s.pac.clone)) out.clones.push(Object.assign(q(s.pac.clone), { m: 'p', c: s.pacPlayer, of: -1 }));
      s.ghosts.forEach((g, i) => { if (g.clone && vis(g.clone)) out.clones.push(Object.assign(q(g.clone), { m: g.mode[0], c: colorOf(s, i), of: i })); });
      out.big = []; for (let i = 0; i < W * H; i++) if (s.big[i] && (gi < 0 || seen((i % W) + 0.5, Math.floor(i / W) + 0.5))) out.big.push(i);
    }
    if (gi < 0) out.pellets = Array.from(s.pellets);
    else {
      const p = new Array(W * H).fill(0);
      // with CFG.hideAt pellets or fewer left, the ghosts' screens show none, so they cannot wait beside the last ones
      if (s.left > CFG.hideAt) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const v = s.pellets[y * W + x];
        if (v && seen(x + 0.5, y + 0.5)) p[y * W + x] = v;
      }
      out.pellets = p;
    }
    return out;
  }
  function q(e) { return { x: Math.round(e.x * 100) / 100, y: Math.round(e.y * 100) / 100, d: e.dir }; }
  /** The Arrangement extras of an entity, only the ones in play: a (airborne: from, to, progress), ds (dashing: the speed multiple
   *  left), bk (bonked a wall: seconds of dizziness left), st (knocked dizzy: seconds left), sp (Pac-Man's speed capsule: seconds
   *  left), dg (digestion), hp (a ghost's hop: seconds left), dp/dc (a ghost's dash power: seconds left, cooldown left). */
  function qa(e) {
    const o = {};
    if (e.air) o.a = [e.air.x0, e.air.y0, e.air.x1, e.air.y1, Math.round(Math.min(1, e.air.t / e.air.dur) * 100) / 100];
    if (e.dash) o.ds = Math.round(e.dash * 100) / 100;
    if (e.bonk > 0) o.bk = Math.round(e.bonk * 100) / 100;
    if (e.stun > 0) o.st = Math.round(e.stun * 100) / 100;
    if (e.speedLeft > 0) o.sp = Math.round(e.speedLeft * 100) / 100;
    if (e.digest > 0) o.dg = Math.round(e.digest * 100) / 100;
    if (e.hopLeft > 0) o.hp = Math.round(e.hopLeft * 100) / 100;
    if (e.dashLeft > 0) { o.dp = Math.round(e.dashLeft * 100) / 100; if (e.dashCool > 0) o.dc = Math.round(e.dashCool * 100) / 100; }
    return o;
  }

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
      if (g.mode === 'eyes' || (g.grey && g.mode !== 'fright')) continue;
      const harmless = g.mode === 'fright' && s.frightLeft > 3;
      if (harmless) continue;
      // a ghost still inside the house is counted from the exit, a moment later
      const inside = inHouse(Math.floor(g.x), Math.floor(g.y)) || cellAt(Math.floor(g.x), Math.floor(g.y)) === 'D';
      const sx = inside ? EXIT[0] + 0.5 : g.x, sy = inside ? EXIT[1] + 0.5 : g.y, delay = inside ? 1 : 0;
      const dm = distMap(sx, sy, 'ghost');
      for (let i = 0; i < T; i++) if (dm[i] >= 0) { const t = delay + dm[i] / CFG.ghostSpeed; if (t < best[i]) best[i] = t; }
    }
    return best;
  }

  const pacMemo = new WeakMap();
  function cpuPac(s, rng, level) {
    level = level == null ? 1 : level;
    const p = s.pac;
    if (p.air || p.bonk > 0) return null;             // no steering in the air or while dizzy against a wall
    // Emergency: a dangerous ghost closing head-on in this corridor, reverse right now.
    for (const g of s.ghosts) {
      if (g.mode !== 'normal' || g.grey) continue;
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
    // Pac-Man gets bolder the longer he goes without eating: hiding for ever never wins a round.
    let st = pacMemo.get(s); if (!st) pacMemo.set(s, st = { left: s.left, t: s.time });
    if (st.left !== s.left || s.time < st.t) { st.left = s.left; st.t = s.time; }
    const idle = s.time - st.t, nerve = idle < 6 ? 1 : Math.max(0.15, 1 - (idle - 6) / 12);
    const margin = (level === 0 ? 0.9 : level === 1 ? 0.45 : 0.4) * nerve;
    const safe = i => ga[i] - pd[i] / CFG.pacSpeed > margin;
    const sx = Math.floor(p.x), sy = Math.floor(p.y);
    const skip = (x, y) => !safe(tileIdx(x, y)) && !(x === sx && y === sy);

    // 1. While the ghosts are scared: hunt them, or keep clearing the maze, whichever pays more per second.
    if (level >= 1 && s.frightLeft > 1.5) {
      let bestG = null, bRate = 0;
      const pts = CFG.ghostChain[Math.min(s.chain, CFG.ghostChain.length - 1)];
      for (const g of s.ghosts) {
        if (g.mode !== 'fright') continue;
        const gi = tileIdx(g.x, g.y), t = pd[gi] >= 0 ? pd[gi] / (CFG.pacSpeed - CFG.frightSpeed * 0.5) : 1e9;
        if (t < s.frightLeft - 0.8) { const rate = pts / Math.max(t, 1.5); if (rate > bRate) { bRate = rate; bestG = g; } }
      }
      if (bestG) {
        // what clearing the rest would pay: the pellets plus the bonus, over the time a tour of them takes
        const tour = clearTime(s, pd), clearRate = (s.left * CFG.pelletPts + CFG.clearBonus) / Math.max(tour, 1);
        if (bRate >= clearRate || tour > s.frightLeft + 25) {
          const tx = Math.floor(bestG.x), ty = Math.floor(bestG.y); const d = pathStep(p.x, p.y, 'pac', (x, y) => x === tx && y === ty); if (d != null) return keepHeading(p, d, ga, pd, margin);
        }
      }
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
        cands.push([near * 0.6 - pd[i] * 1.0 + (s.pellets[i] === 2 ? powerValue(s, pd, nearest) : 0), i]);
      }
      cands.sort((a, b) => b[0] - a[0]);
      for (let k = 0; k < Math.min(cands.length, 10); k++) {
        const i = cands[k][1], tx = i % W, ty = Math.floor(i / W);
        if (!hasEscape(tx, ty, pd[i] / CFG.pacSpeed, ga, margin, level)) continue;
        const d = pathStep(p.x, p.y, 'pac', (x, y) => x === tx && y === ty, skip);
        if (d != null) return keepHeading(p, d, ga, pd, margin);
      }
    }
    // 3b. Nothing eaten for a long time: stop hiding and go for the nearest pellet that is not about to be cut off.
    if (idle > 8 && level >= 0) {
      const slack = idle > 20 ? -3 : 0.25;      // after a long wait, run the gauntlet
      const d = pathStep(p.x, p.y, 'pac', (x, y) => s.pellets[y * W + x] > 0, (x, y) => ga[tileIdx(x, y)] - pd[tileIdx(x, y)] / CFG.pacSpeed < slack && !(x === sx && y === sy));
      if (d != null) return keepHeading(p, d, ga, pd, 0.1);
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
  /** How much a power pellet is worth right now: a lot when ghosts are close enough to be chased down. */
  function powerValue(s, pd, nearest) {
    if (s.frightLeft > 4) return -8;
    let near = 0;
    for (const g of s.ghosts) if (g.mode === 'normal') { const d = pd[tileIdx(Math.floor(g.x), Math.floor(g.y))]; if (d >= 0 && d <= 14) near++; }
    if (nearest < 7) return 8 + 2 * near;
    return near >= 2 ? 3 * near : -6;
  }
  /** Rough time (s) to eat every pellet left: nearest-neighbour gaps summed, plus the walk to the first one. */
  function clearTime(s, pd) {
    const xs = [], ys = [];
    for (let i = 0; i < T; i++) if (s.pellets[i]) { xs.push(i % W); ys.push(Math.floor(i / W)); }
    const n = xs.length; if (!n) return 1;
    let gap = 0, first = 1e9;
    for (let a = 0; a < n; a++) {
      let m = 1e9; for (let b = 0; b < n; b++) if (b !== a) { const d = Math.abs(xs[a] - xs[b]) + Math.abs(ys[a] - ys[b]); if (d < m) m = d; }
      gap += n > 1 ? m : 0;
      const pdi = pd[ys[a] * W + xs[a]]; if (pdi >= 0 && pdi < first) first = pdi;
    }
    return (gap * 1.25 + (first < 1e9 ? first : 0)) / CFG.pacSpeed;
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

  /** Whether a computer ghost presses its button this tick (dt seconds): a hop about every 3 s while it holds the hop; a dash
   *  about once a second while it holds the dash, is free to fire it and has a clear run of at least 3 cells ahead. */
  function cpuAct(s, gi, rng, dt) {
    const g = s.ghosts[gi];
    if (!ARR || g.grey || g.air || g.stun > 0 || g.bonk > 0 || g.potted || g.mode !== 'normal') return false;
    if (g.hopLeft > 0) return rng() < dt / 3;
    if (!(g.dashLeft > 0) || g.dash || g.dashCool > 0) return false;
    const [dx, dy] = DIRS[g.dir]; let x = Math.floor(g.x), y = Math.floor(g.y);
    for (let n = 0; n < 3; n++) { x += dx; y += dy; if (x < 0 || x >= W || blocked(x, y, 'ghost')) return false; }
    return rng() < dt;
  }
  function cpuGhost(s, gi, rng, level) {
    level = level == null ? 1 : level;
    const g = s.ghosts[gi];
    if (g.mode === 'eyes') return null;           // eaten ghosts steer themselves
    if (g.air || g.stun > 0 || g.bonk > 0 || g.potted) return null;   // no steering in the air, while dizzy or in the pot
    if (!atCentre(g)) return null;
    // Just revived: out through the door
    const gx = Math.floor(g.x), gy = Math.floor(g.y);
    if (inHouse(gx, gy) || cellAt(gx, gy) === 'D') return gx === DOOR[0] ? 0 : (gx < DOOR[0] ? 1 : 3);
    const ex = exits(g, 'ghost'), fwd = ex.filter(d => d !== OPP[g.dir]);
    const pool = fwd.length ? fwd : ex;
    if (g.grey) return pool.includes(g.dir) && rng() < 0.7 ? g.dir : pool[Math.floor(rng() * pool.length)];     // a stand-in just wanders
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
    let tx = -1, ty = -1;
    const tm = team(s, level), me = tm.rank[gi];
    if (g.standin) {
      // A woken stand-in hunts Pac-Man down: it always knows where he is and goes straight for him.
      tx = Math.floor(s.pac.x); ty = Math.floor(s.pac.y);
    } else if (tm.has && !(level === 0 && rng() < 0.2)) {
      // Pac-Man is known (seen now, or just out of sight). The nearest ghost chases; the others cut him off ahead.
      const px = Math.floor(tm.px), py = Math.floor(tm.py);
      tx = px; ty = py;
      if (tm.live && me > 0 && level >= 1) {
        const dm = distMap(g.x, g.y, 'ghost'), route = tm.route, reach = me === 1 ? 5 : 11;
        for (let j = Math.min(reach, route.length) - 1; j >= 0; j--) {
          const i = tileIdx(route[j][0], route[j][1]);
          if (dm[i] > 0 && dm[i] / CFG.ghostSpeed < (j + 1) / CFG.pacSpeed - 0.15) { tx = route[j][0]; ty = route[j][1]; break; }
        }
      }
    } else {
      // Pac-Man is not in sight: patrol where pellets remain, each ghost its own part of the maze.
      const cur = tm.patrol[gi];
      const arrived = cur >= 0 && Math.abs(cur % W + 0.5 - g.x) + Math.abs(Math.floor(cur / W) + 0.5 - g.y) <= 1;
      if (arrived) tm.visit.set(cur, s.time);
      if (cur >= 0 && (s.pellets[cur] || s.left <= CFG.hideAt) && !arrived) { tx = cur % W; ty = Math.floor(cur / W); }
      else {
        const dm = distMap(g.x, g.y, 'ghost'); let bi = -1, bv = -1e9;
        for (let i = 0; i < T; i++) {
          const blind = s.left <= CFG.hideAt;             // pellets are not shown to ghosts any more: roam instead
          if ((!blind && !s.pellets[i]) || dm[i] < 0 || (blind && dm[i] < 3)) continue;
          const x = i % W, y = Math.floor(i / W);
          let near = 0; if (!blind) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) { const yy = y + dy; if (yy >= 0 && yy < H && s.pellets[tileIdx(x + dx, yy)]) near++; }
          let v = near * 0.5 - dm[i] * 0.25 + (s.pellets[i] === 2 ? 3 : 0) + rng() * 0.8;
          const vt = tm.visit.get(i); if (vt != null && s.time - vt < 30) v -= 10 - (s.time - vt) / 4;     // swept recently
          if (tm.seen > -1e8) v -= Math.hypot(x - tm.px, y - tm.py) * 0.35;     // Pac-Man was last seen over there
          for (let o = 0; o < s.ghosts.length; o++) if (o !== gi && tm.patrol[o] >= 0 && Math.abs(tm.patrol[o] % W - x) + Math.abs(Math.floor(tm.patrol[o] / W) - y) < 7) v -= 6;
          if (v > bv) { bv = v; bi = i; }
        }
        tm.patrol[gi] = bi; if (bi >= 0) { tx = bi % W; ty = Math.floor(bi / W); }
      }
    }
    if (tx >= 0) {
      const dt = distMap(tx, ty, 'ghost'), val = d => { const i = tileIdx(Math.floor(g.x) + DIRS[d][0], Math.floor(g.y) + DIRS[d][1]); return dt[i] < 0 ? 1e6 : dt[i]; };
      let best = -1, bv = 1e9;
      for (const d of pool) { const v = val(d) + rng() * 0.3; if (v < bv) { bv = v; best = d; } }
      const back = ex.includes(OPP[g.dir]) ? OPP[g.dir] : -1;
      if (back >= 0 && val(back) < bv - 0.5) best = back;     // turn round only when that is much shorter
      if (best >= 0) return best;
    }
    if (!pool.length) return OPP[g.dir];
    if (pool.includes(g.dir) && rng() < 0.55) return g.dir;
    return pool[Math.floor(rng() * pool.length)];
  }

  // The ghosts play as a team: they share what any of them sees, and take turns being the chaser.
  const teams = new WeakMap();
  function team(s, level) {
    let t = teams.get(s);
    if (!t) teams.set(s, t = { tick: -1, seen: -1e9, px: 0, py: 0, patrol: s.ghosts.map(() => -1), visit: new Map() });
    if (t.tick === s.tick) return t;
    t.tick = s.tick;
    const sight = level === 0 ? CFG.ghostSight : level === 1 ? CFG.ghostSight * CFG.fruitSightMult : 1e9;
    t.live = s.ghosts.some(g => g.mode !== 'eyes' && !g.grey && dist(g, s.pac) <= sight);
    if (t.live) { t.seen = s.time; t.px = s.pac.x; t.py = s.pac.y; }
    t.has = t.live || s.time - t.seen < (level === 0 ? 4 : level === 1 ? 8 : 1e9);
    t.route = [];
    if (t.live) {
      const p = s.pac; let x = Math.floor(p.x), y = Math.floor(p.y), d = p.dir;
      for (let k = 0; k < 12; k++) {
        const ok = e => !blocked((x + DIRS[e][0] + W) % W, y + DIRS[e][1], 'pac');
        if (!ok(d)) { const opts = [0, 1, 2, 3].filter(e => e !== OPP[d] && ok(e)); d = opts.length ? opts[0] : OPP[d]; }
        x = (x + DIRS[d][0] + W) % W; y += DIRS[d][1]; t.route.push([x, y]);
      }
    }
    // ghosts ordered by how close they are to Pac-Man (0 = nearest = the chaser)
    const pd = distMap(s.pac.x, s.pac.y, 'ghost');
    const order = s.ghosts.map((g, i) => [i, g.mode === 'normal' && !g.grey ? (pd[tileIdx(Math.floor(g.x), Math.floor(g.y))] + 1e3) % 1e3 : 1e4]).sort((a, b) => a[1] - b[1]);
    t.rank = []; order.forEach(([i], r) => { t.rank[i] = r; });
    return t;
  }

  function mulberry(seed) {
    let a = seed >>> 0;
    return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  return { W, H, ROWS, DIRS, OPP, CFG, START, maze, newRound, update, view, cpuGhost, cpuPac, cpuAct, ghostIndexOf, playerOfGhost, colorOf, mulberry, wallAt, dist };
  }

  const api = build(BUILTIN);
  api.create = build; api.makeMaze = makeMaze; api.BUILTIN = BUILTIN;
  return api;
});
