/* The look of the Arrangement levels: a maze built of glossy toy blocks in red, yellow, green and blue on a purple
 * woven floor, in the style of the first world of the 1996 arcade Pac-Man Arrangement. Nothing here comes from that
 * game or from the disc: the meshes and textures are made here from the level's rows.
 * build(maze) gives a 3D stage in the shape View3D draws (a model in the disc models' layout, with its poses);
 * handheldImage(maze) gives the same maze as an 8-pixels-a-cell picture for Pac-Man's handheld.
 * UMD: window.BlockStage in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BlockStage = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // Block colours: red, yellow, green, blue
  const PALETTE = [[232, 44, 40], [250, 206, 34], [44, 172, 60], [44, 92, 232]];
  const FLOOR = [106, 60, 122], FLOOR_DARK = [72, 36, 88], FLOOR_LIGHT = [132, 84, 148], DOOR = [255, 176, 220];
  const CELL = 1000, HALF = 500, TALL = 420, BEVEL = 70, MARGIN = 3;

  const isWall = ch => ch === '#' || ch === '=';
  const hash = (a, b) => { let h = Math.imul(a * 374761393 + b * 668265263, 1274126177); h ^= h >>> 13; h = Math.imul(h, 1103515245); return (h ^ (h >>> 16)) >>> 0; };

  /** The maze's cells as a function, with the margin around it filled with blocks (open only along tunnel rows). */
  function cells(maze) {
    const rows = maze.rows, W = rows[0].length, H = rows.length;
    const tunnel = rows.map(r => r[0] !== '#' && r[0] !== '=' && r[W - 1] !== '#' && r[W - 1] !== '=');
    return { W, H, at(x, y) {
      if (y >= 0 && y < H && x >= 0 && x < W) return rows[y][x];
      if (y >= 0 && y < H && tunnel[y]) return '_';
      return '#';
    } };
  }
  /** Each wall cell is four half-cell blocks. A block's colour: blocks along a wall share a colour in runs of two or
   *  three, the runs stepping through the palette, so neighbouring runs always differ. */
  /** Does the block at half-cell (hx, hy) belong to a wall running across (true) or down (false)? */
  function horizontal(g, hx, hy) {
    const cx = Math.floor(hx / 2), cy = Math.floor(hy / 2), w = (x, y) => isWall(g.at(x, y));
    const across = (w(cx - 1, cy) ? 1 : 0) + (w(cx + 1, cy) ? 1 : 0), down = (w(cx, cy - 1) ? 1 : 0) + (w(cx, cy + 1) ? 1 : 0);
    return across > down || (across === down && (hy & 1) === 0);
  }
  function blockColour(g, hx, hy) {
    const horiz = horizontal(g, hx, hy);
    const along = horiz ? hx : hy, lane = horiz ? hy : hx;
    const len = 2 + (hash(lane, 7) % 2), shift = hash(lane, 11) % len;
    const run = Math.floor((along + shift) / len);
    return (hash(lane, 3) + run) % 4;
  }

  // ---- textures (made here, as RGBA)
  function tex(name, n, fn) {
    const rgba = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const c = fn(x, y), i = (y * n + x) * 4; rgba[i] = c[0]; rgba[i + 1] = c[1]; rgba[i + 2] = c[2]; rgba[i + 3] = 255; }
    return { name, w: n, h: n, rgba, wrapS: 1, wrapT: 1, magFilter: 1, minFilter: 1 };
  }
  // the top of a block: white with a glossy sheen towards the top left and a soft shade towards the bottom right
  const blockTex = () => tex('block_top', 64, (x, y) => {
    const u = x / 63, v = y / 63, sheen = Math.max(0, 1 - Math.hypot(u - 0.28, v - 0.28) / 0.45) ** 2, shade = Math.max(0, (u + v - 1.1)) * 0.35;
    const k = Math.min(1, 0.86 + 0.5 * sheen - shade);
    return [255 * k, 255 * k, 255 * k];
  });
  // the floor, one cell a repeat: purple with a darker woven diamond lattice and light flecks where the strands cross
  const floorTex = () => tex('block_floor', 128, (x, y) => {
    const a = ((x + y) % 32 + 32) % 32, b = ((x - y) % 32 + 32) % 32;
    const onA = a < 4, onB = b < 4;
    if (onA && onB) return FLOOR_LIGHT;
    if (onA || onB) return ((onA ? Math.floor((x - y) / 8) : Math.floor((x + y) / 8)) & 1) ? FLOOR_DARK : [88, 48, 104];
    const d = Math.min(Math.abs(a - 18), Math.abs(b - 18));
    return d < 3 ? [96, 54, 112] : FLOOR;
  });

  // ---- mesh
  /** A model in the disc models' layout (textures, materials, shapes, draws) and its poses, from triangle lists. */
  function model(parts, textures) {
    const material = (slot) => ({
      name: 'blocks' + slot, cull: 0, matColor: [[1, 1, 1, 1], [1, 1, 1, 1]], ambColor: [[0, 0, 0, 0], [0, 0, 0, 0]],
      chans: [{ lighting: false, matSrc: 1 }, { lighting: false, matSrc: 1 }, null, null],
      texGenNum: 1, texGens: [{ type: 1, src: 4, mtx: 60 }], texMtx: [], textures: [slot, -1, -1, -1, -1, -1, -1, -1],
      kColors: [[1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1], [1, 1, 1, 1]], tevColors: [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]],
      tevStageNum: 1, stages: [{ order: { texCoord: 0, texMap: 0, chan: 4 }, swap: { ras: 0, tex: 0 }, kc: 12, ka: 28,
        op: { color: { a: 15, b: 10, c: 8, d: 15, op: 0, bias: 0, scale: 0, clamp: 1, reg: 0 }, alpha: { a: 7, b: 5, c: 4, d: 7, op: 0, bias: 0, scale: 0, clamp: 1, reg: 0 } } }],
      swapTables: [[0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3], [0, 1, 2, 3]], alphaComp: null,
      blend: { type: 0, src: 1, dst: 0 }, zMode: { enable: true, func: 3, write: true }
    });
    const shapes = [], poses = [], draws = [], materials = [];
    parts.forEach((p, i) => {
      const n = p.pos.length / 3;
      shapes.push({ clr: new Float32Array(p.clr), uv: new Float32Array(p.uv), drw: { length: n } });
      poses.push({ pos: new Float32Array(p.pos), nrm: new Float32Array(p.nrm) });
      materials.push(material(p.tex)); draws.push({ shape: i, material: i });
    });
    return { bmd: { textures, materials, shapes, draws }, poses };
  }
  function builder() {
    const b = { pos: [], nrm: [], clr: [], uv: [] };
    /** A quad (four corners in order) with one normal, a colour and texture coordinates per corner. */
    b.quad = (pts, n, c, uvs) => {
      for (const k of [0, 1, 2, 0, 2, 3]) {
        b.pos.push(...pts[k]); b.nrm.push(...n); b.clr.push(c[0], c[1], c[2], 1); b.uv.push(...uvs[k]);
      }
    };
    return b;
  }
  const shade = (c, k) => [Math.min(1, c[0] / 255 * k), Math.min(1, c[1] / 255 * k), Math.min(1, c[2] / 255 * k)];

  /** The 3D stage for a level's maze: blocks, floor and the ghost-house door. */
  function build(maze, key) {
    const g = cells(maze), blocks = builder(), floor = builder();
    const FLAT = [[0.5, 0.5], [0.5, 0.5], [0.5, 0.5], [0.5, 0.5]], TOPUV = [[0, 0], [1, 0], [1, 1], [0, 1]];
    let count = 0;
    for (let hy = -2 * MARGIN; hy < 2 * (g.H + MARGIN); hy++) for (let hx = -2 * MARGIN; hx < 2 * (g.W + MARGIN); hx++) {
      const cx = Math.floor(hx / 2), cy = Math.floor(hy / 2);
      if (!isWall(g.at(cx, cy))) continue;
      count++;
      const col = PALETTE[blockColour(g, hx, hy)];
      const x0 = hx * HALF, x1 = x0 + HALF, z0 = hy * HALF, z1 = z0 + HALF, t = TALL, b = BEVEL, lo = TALL - BEVEL;
      const ix0 = x0 + b, ix1 = x1 - b, iz0 = z0 + b, iz1 = z1 - b;
      // the top, then the four bevels (lit from the top left as on the arcade's blocks: north and west light, south and east dark)
      blocks.quad([[ix0, t, iz0], [ix1, t, iz0], [ix1, t, iz1], [ix0, t, iz1]], [0, 1, 0], shade(col, 1), TOPUV);
      blocks.quad([[x0, lo, z0], [x1, lo, z0], [ix1, t, iz0], [ix0, t, iz0]], [0, 0.7, -0.7], shade(col, 1.35), FLAT);
      blocks.quad([[x0, lo, z1], [x0, lo, z0], [ix0, t, iz0], [ix0, t, iz1]], [-0.7, 0.7, 0], shade(col, 1.18), FLAT);
      blocks.quad([[ix0, t, iz1], [ix1, t, iz1], [x1, lo, z1], [x0, lo, z1]], [0, 0.7, 0.7], shade(col, 0.62), FLAT);
      blocks.quad([[ix1, t, iz0], [x1, lo, z0], [x1, lo, z1], [ix1, t, iz1]], [0.7, 0.7, 0], shade(col, 0.75), FLAT);
      // the sides down to the floor, where no block stands next to this one
      const open = (dx, dy) => !isWall(g.at(Math.floor((hx + dx) / 2), Math.floor((hy + dy) / 2)));
      if (open(0, 1)) blocks.quad([[x0, lo, z1], [x1, lo, z1], [x1, 0, z1], [x0, 0, z1]], [0, 0, 1], shade(col, 0.5), FLAT);
      if (open(0, -1)) blocks.quad([[x1, lo, z0], [x0, lo, z0], [x0, 0, z0], [x1, 0, z0]], [0, 0, -1], shade(col, 0.8), FLAT);
      if (open(-1, 0)) blocks.quad([[x0, lo, z0], [x0, lo, z1], [x0, 0, z1], [x0, 0, z0]], [-1, 0, 0], shade(col, 0.7), FLAT);
      if (open(1, 0)) blocks.quad([[x1, lo, z1], [x1, lo, z0], [x1, 0, z0], [x1, 0, z1]], [1, 0, 0], shade(col, 0.6), FLAT);
    }
    // the ghost-house door: a low pink bar across the middle of its cell
    for (let y = 0; y < g.H; y++) for (let x = 0; x < g.W; x++) if (g.at(x, y) === 'D') {
      const x0 = x * CELL, x1 = x0 + CELL, z0 = y * CELL + 420, z1 = y * CELL + 580, t = 160, c = shade(DOOR, 1);
      blocks.quad([[x0, t, z0], [x1, t, z0], [x1, t, z1], [x0, t, z1]], [0, 1, 0], c, FLAT);
      blocks.quad([[x0, t, z1], [x1, t, z1], [x1, 0, z1], [x0, 0, z1]], [0, 0, 1], shade(DOOR, 0.7), FLAT);
    }
    // the floor under everything, the texture repeating once a cell
    const fx0 = -MARGIN * CELL, fx1 = (g.W + MARGIN) * CELL, fz0 = -MARGIN * CELL, fz1 = (g.H + MARGIN) * CELL;
    floor.quad([[fx0, 0, fz0], [fx1, 0, fz0], [fx1, 0, fz1], [fx0, 0, fz1]], [0, 1, 0], [1, 1, 1],
      [[fx0 / CELL, fz0 / CELL], [fx1 / CELL, fz0 / CELL], [fx1 / CELL, fz1 / CELL], [fx0 / CELL, fz1 / CELL]]);
    const { bmd, poses } = model([{ ...floor, tex: 1 }, { ...blocks, tex: 0 }], [blockTex(), floorTex()]);
    return { k: 'blocks:' + (key || maze.rows.join('/')), bmd, poses, btk: null, colOff: 1, rowOff: 1, floor: 0, pelletTint: [1, 0.82, 0.35, 1], blocks: count };
  }

  /** Pac-Man's handheld: the maze at 8 pixels a cell ({w, h, rgb}), each wall cell four 4 x 4 blocks. */
  function handheldImage(maze) {
    const g = cells(maze), w = g.W * 8, h = g.H * 8, rgb = new Uint8Array(w * h * 3);
    const put = (x, y, c) => { const i = (y * w + x) * 3; rgb[i] = c[0]; rgb[i + 1] = c[1]; rgb[i + 2] = c[2]; };
    const mix = (c, k) => c.map(v => Math.max(0, Math.min(255, Math.round(v * k))));
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const cx = x >> 3, cy = y >> 3, ch = g.at(cx, cy);
      if (isWall(ch)) {
        const col = PALETTE[blockColour(g, x >> 2, y >> 2)], bx = x & 3, by = y & 3;
        put(x, y, bx === 0 || by === 0 ? mix(col, 1.35) : bx === 3 || by === 3 ? mix(col, 0.6) : col);
      } else if (ch === 'D' && ((y & 7) === 3 || (y & 7) === 4)) put(x, y, DOOR);
      else put(x, y, ((x + y) & 3) === 0 || ((x - y) & 3) === 0 ? FLOOR_DARK : FLOOR);
    }
    return { w, h, rgb };
  }

  return { build, handheldImage, blockColour, horizontal, cells, PALETTE, FLOOR };
});
