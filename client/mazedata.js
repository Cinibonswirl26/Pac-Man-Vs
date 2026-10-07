/* Reads the stage mazes out of a data file on the player's own disc.
 * The file keeps each maze as a table of 16-bit tile numbers, 32 entries per row, one maze after another.
 * Walls are individual line pieces, 15 is empty floor, 16-18 the ghost-house gate, 30 a pellet and 31 a
 * power pellet. Nothing is stored; the layouts are read at run time.
 * UMD: window.MazeData in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MazeData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EMPTY = 15, PELLET = 30, POWER = 31, GATE = [16, 17, 18];
  const COLS = 21;                                   // every maze fits in table columns 0..20, centred on column 10

  // The disc holds 13 mazes. Their order matches the stage models (PacField_1..13). The stage-select
  // screen shows six of them; the rest have no menu entry. Names for those are this project's own.
  const STAGES = [
    { name: 'Original Pac-Man', official: true },
    { name: 'Four-Hut Pier' },
    { name: 'Dusk Pier' },
    { name: 'R.I.P. Park', official: true },
    { name: 'Panic Pier', official: true },
    { name: 'Frantic Forest', official: true },
    { name: 'Night Forest' },
    { name: 'Manic Manor', official: true },
    { name: 'Dusk Park' },
    { name: 'Spotlight Hall' },
    { name: 'Midnight Pier' },
    { name: 'Midnight Park' },
    { name: 'Haunted Hall', official: true }
  ];

  const u16 = (b, o) => b[o] | (b[o + 1] << 8);

  /** Find the first maze by the signature of its fifth row: wall, 19 pellets, wall. Returns the byte offset of
   *  that row, or -1. */
  function locate(rom) {
    const sig = [2, ...new Array(19).fill(PELLET), 2];
    outer: for (let o = 4 * 64; o + 24 * 64 < rom.length; o += 2) {
      for (let i = 0; i < sig.length; i++) if (u16(rom, o + i * 2) !== sig[i]) continue outer;
      let pel = 0, pow = 0;
      for (let r = 0; r < 21; r++) for (let c = 0; c < 19; c++) { const t = u16(rom, o + (r - 4) * 64 + (c + 1) * 2); if (t === PELLET) pel++; else if (t === POWER) pow++; }
      if (pel === 172 && pow === 4) return o;
    }
    return -1;
  }

  /** The table as rows of tile numbers, cut into mazes at the blank rows between them. */
  function segments(rom) {
    const o = locate(rom);
    if (o < 0) throw new Error('This disc image does not contain the expected maze table.');
    const row0 = o - 4 * 64, out = [];
    let cur = null;
    for (let r = -1; row0 + (r + 1) * 64 <= rom.length; r++) {
      const base = row0 + r * 64, t = [];
      for (let c = 0; c < 32; c++) t.push(u16(rom, base + c * 2));
      if (t.some(v => v > 31)) break;                // past the end of the tables
      if (t.some(v => v !== 0 && v !== EMPTY)) { if (!cur) out.push(cur = []); cur.push(t); } else cur = null;
    }
    return out;
  }

  /** Build the descriptor (see PacSim.makeMaze) for maze number k (1-13), or null if it cannot be read.
   *  Extra fields: stage (k), official, colOffset and rowOffset (this grid's cell (0,0) is table column / row
   *  colOffset / rowOffset, counted from the maze's first table row), which place it on the stage model. */
  function build(seg, k, makeMaze) {
    const h = seg.length, tile = (c, r) => (c < 0 || c >= 32 || r < 0 || r >= h) ? 0 : seg[r][c];
    // the ghost-house gate: three gate tiles in a row
    let gr = -1, gc = -1;
    for (let r = 0; r < h && gr < 0; r++) for (let c = 0; c + 2 < 32; c++) if (GATE.every((g, i) => tile(c + i, r) === g)) { gr = r; gc = c; break; }
    if (gr < 0) return null;
    const cx = gc + 1;
    const floor = t => t === EMPTY || t === PELLET || t === POWER;
    // Where each row's walls start and end: floor beyond them is a tunnel that can only be entered sideways.
    const left = [], right = [];
    for (let r = 0; r < h; r++) {
      let l = -1, rr = -1;
      for (let c = 0; c < COLS; c++) if (!floor(tile(c, r)) && !GATE.includes(tile(c, r)) && tile(c, r) !== 0) { if (l < 0) l = c; rr = c; }
      left.push(l); right.push(rr);
    }
    // A tunnel row has no outer wall of its own, so it takes the walls of the rows next to it.
    const lo = r => Math.min(...[r - 1, r, r + 1].map(i => left[i] >= 0 ? left[i] : 99));
    const hi = r => Math.max(...[r - 1, r, r + 1].map(i => right[i] >= 0 ? right[i] : -1));
    const inside = (c, r) => c >= lo(r) && c <= hi(r);
    const exit = [cx, gr - 1];
    if (!floor(tile(exit[0], exit[1]))) return null;
    const seen = new Set([exit.join()]), q = [exit];
    while (q.length) {
      const [c, r] = q.pop();
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nc >= COLS || nr < 0 || nr >= h || !floor(tile(nc, nr)) || seen.has(nc + ',' + nr)) continue;
        if (dr !== 0 && !inside(nc, nr)) continue;      // no stepping up or down into the outside area
        seen.add(nc + ',' + nr); q.push([nc, nr]);
      }
    }
    // crop to what is reachable plus the walls around it
    let c0 = COLS, c1 = -1, r0 = h, r1 = -1;
    for (const key of seen) { const [c, r] = key.split(',').map(Number); c0 = Math.min(c0, c); c1 = Math.max(c1, c); r0 = Math.min(r0, r); r1 = Math.max(r1, r); }
    r0 = Math.max(0, r0 - 1); r1 = Math.min(h - 1, r1 + 1);
    // keep the gate and house inside the crop and the maze symmetric about the centre column
    const half = Math.max(cx - c0, c1 - cx); c0 = cx - half; c1 = cx + half;
    const house = { x0: gc - c0, x1: gc + 2 - c0, y0: gr + 1 - r0, y1: gr + 1 - r0 };
    const rows = [];
    for (let r = r0; r <= r1; r++) {
      let s = '';
      for (let c = c0; c <= c1; c++) {
        const t = tile(c, r);
        if (r === gr && c >= gc && c <= gc + 2) s += 'D';
        else if (r === gr + 1 && c >= gc && c <= gc + 2) s += '_';
        else if (!seen.has(c + ',' + r)) s += '#';
        else s += t === PELLET ? '.' : t === POWER ? 'o' : ' ';
      }
      rows.push(s);
    }
    // grid helpers
    const g = (c, r) => [c - c0, r - r0];
    const open = (c, r) => { const x = rows[r - r0] && rows[r - r0][c - c0]; return x && x !== '#' && x !== 'D' && x !== '_'; };
    const nearest = (tc, tr, not) => {
      let best = null, bd = 1e9;
      for (const key of seen) {
        const [c, r] = key.split(',').map(Number);
        if (!open(c, r) || not.some(n => n[0] === c && n[1] === r)) continue;
        const d = (c - tc) ** 2 + (r - tr) ** 2; if (d < bd) { bd = d; best = [c, r]; }
      }
      return best;
    };
    // Pac-Man starts in the centre column below the house, the ghosts above it and to the sides
    const pac = nearest(cx, gr + 3, [exit]);
    const ghA = nearest(cx - 3, gr - 3, [exit, pac]), ghB = nearest(cx + 3, gr - 3, [exit, pac, ghA]);
    if (!pac || !ghA || !ghB) return null;
    const m = makeMaze(rows, {
      name: STAGES[k - 1].name, pac: g(...pac), ghosts: [g(...ghA), g(...ghB), g(...exit)], door: g(gc + 1, gr), exit: g(...exit), house
    });
    return Object.assign(m, { stage: k, official: !!STAGES[k - 1].official, colOffset: c0, rowOffset: r0 });
  }

  /** All the mazes on the disc, in stage-model order. Ones that cannot be read are left out. */
  function all(rom, makeMaze) {
    const segs = segments(rom);
    return segs.slice(0, STAGES.length).map((s, i) => build(s, i + 1, makeMaze)).filter(Boolean);
  }
  /** The original stage 1 maze. */
  function stage1(rom, makeMaze) { return all(rom, makeMaze)[0]; }

  // where the maze data sits on the disc
  const PATH = 'PROOT/gbademo/packman.bin';
  return { all, stage1, locate, segments, PATH, STAGES };
});
