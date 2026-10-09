/* Pac-Man's own screen, drawn from the player's disc.
 * The disc carries a small program for Pac-Man's handheld screen. It holds that screen's pictures: the maze and
 * panel tiles, the sprites (Pac-Man's mouth, the four ghost colours, frightened ghosts, eyes, fruit, digits) and
 * their colour tables. This module reads those out and draws the 240 x 160 picture from the game state, so Pac-Man
 * sees the original's screen: the same tiles, colours and animation frames.
 * UMD: window.Handheld in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Handheld = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const PATH = 'PROOT/gbademo/packman.bin';
  // Where things sit in the program file (found by matching its data against the original's picture).
  const BG_PAL = 0x17bf4, BG_TILES = 0x17dd4, OBJ_PAL = 0x22dd4, OBJ_TILES = 0x22fb4;
  const W = 240, H = 160;
  const rgb = v => [((v & 31) << 3) | ((v & 31) >> 2), (((v >> 5) & 31) << 3) | (((v >> 5) & 31) >> 2), (((v >> 10) & 31) << 3) | (((v >> 10) & 31) >> 2)];

  /** `rom`: the program file's bytes. Returns the picture tables. */
  function parse(rom) {
    const u16 = o => rom[o] | (rom[o + 1] << 8);
    const pal = (base, banks) => { const out = []; for (let b = 0; b < banks; b++) { const p = []; for (let i = 0; i < 16; i++) p.push(rgb(u16(base + 32 * b + 2 * i))); out.push(p); } return out; };
    const tiles = new Map();
    function tile(base, n) {            // 8 x 8 four-bit pixels of tile n
      const key = base + ':' + n; let t = tiles.get(key);
      if (!t) {
        t = new Uint8Array(64); const o = base + 32 * n;
        for (let i = 0; i < 32; i++) { t[2 * i] = rom[o + i] & 15; t[2 * i + 1] = rom[o + i] >> 4; }
        tiles.set(key, t);
      }
      return t;
    }
    const objPal = pal(OBJ_PAL, 16);
    // a grey copy of the red ghost's colours (palette 16), for the stand-in ghosts
    objPal.push(objPal[1].map(c => { const y = Math.round(0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2]); return [y, y, y]; }));
    return { rom, u16, bgPal: pal(BG_PAL, 14), objPal, greyPal: 16, bgTile: n => tile(BG_TILES, n), objTile: n => tile(OBJ_TILES, n) };
  }

  /** A 240 x 160 frame buffer (RGBA) that backgrounds and sprites are drawn into. */
  function frame() { return { data: new Uint8ClampedArray(W * H * 4), w: W, h: H }; }
  function clear(f, color) { for (let i = 0; i < W * H; i++) { f.data[i * 4] = color[0]; f.data[i * 4 + 1] = color[1]; f.data[i * 4 + 2] = color[2]; f.data[i * 4 + 3] = 255; } }

  /** Draw one 8 x 8 tile at (x, y); index 0 is transparent. `flip`: bit 0 horizontal, bit 1 vertical. */
  function blit(f, t, pal, x, y, flip, opaque) {
    for (let j = 0; j < 8; j++) {
      const sy = y + j; if (sy < 0 || sy >= H) continue;
      for (let i = 0; i < 8; i++) {
        const sx = x + i; if (sx < 0 || sx >= W) continue;
        const v = t[((flip & 2) ? 7 - j : j) * 8 + ((flip & 1) ? 7 - i : i)];
        if (!v && !opaque) continue;
        const c = pal[v], o = (sy * W + sx) * 4;
        f.data[o] = c[0]; f.data[o + 1] = c[1]; f.data[o + 2] = c[2]; f.data[o + 3] = 255;
      }
    }
  }

  /** Background layer: a map of 16-bit entries (tile | flips | palette bank), `cols` wide, drawn from map row `row0`
   *  at pixel offset (-sx, -sy). Tile 0 / entries in `skip` are transparent when `see` is set. */
  function drawMap(f, hw, map, cols, rows, sx, sy, opts) {
    const o = opts || {};
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const e = map[r * cols + c], n = e & 1023, flip = (e >> 10) & 3, bank = e >> 12;
      const x = c * 8 - sx, y = r * 8 - sy;
      if (x <= -8 || x >= W || y <= -8 || y >= H) continue;
      blit(f, hw.bgTile(n), hw.bgPal[bank] || hw.bgPal[0], x, y, flip, o.opaque ? o.opaque(n, bank) : false);
    }
  }

  /** Sprites: [{tile, pal, x, y, hf, vf}] of 8 x 8 pieces, drawn in the order given (later on top). */
  function drawSprites(f, hw, list) {
    for (const s of list) {
      if (s.sq) blit16(f, s.tiles.map(t => hw.objTile(t)), hw.objPal[s.pal], s.x, s.y, s.hf, s.sq);
      else blit(f, s.pix || hw.objTile(s.tile), s.palette || hw.objPal[s.pal], s.x, s.y, (s.hf ? 1 : 0) | (s.vf ? 2 : 0), false);
    }
  }
  /** A 16 x 16 sprite (tiles: top-left, top-right, bottom-left, bottom-right) squashed or stretched by [wide, tall] about its
   *  bottom centre, nearest-neighbour (Arrangement levels: the hop of a flight). */
  function blit16(f, tiles, pal, x, y, hf, sq) {
    const w = Math.max(1, Math.round(16 * sq[0])), h = Math.max(1, Math.round(16 * sq[1])), x0 = Math.round(x + 8 - w / 2), y0 = Math.round(y + 16 - h);
    for (let j = 0; j < h; j++) {
      const sy = y0 + j; if (sy < 0 || sy >= H) continue;
      const ty = Math.min(15, Math.floor(j * 16 / h));
      for (let i = 0; i < w; i++) {
        const sx = x0 + i; if (sx < 0 || sx >= W) continue;
        let tx = Math.min(15, Math.floor(i * 16 / w)); if (hf) tx = 15 - tx;
        const t = tiles[(ty >> 3) * 2 + (tx >> 3)], v = t[(ty & 7) * 8 + (tx & 7)];
        if (!v) continue;
        const c = pal[v], o = (sy * W + sx) * 4; f.data[o] = c[0]; f.data[o + 1] = c[1]; f.data[o + 2] = c[2]; f.data[o + 3] = 255;
      }
    }
  }

  // ---- Arrangement levels: marks of this project's own (8 x 8 four-bit pixels, drawn as sprites) ------------------
  const px = rows => { const t = new Uint8Array(64); rows.forEach((r, j) => [...r].forEach((c, i) => { t[j * 8 + i] = c === '.' ? 0 : +c; })); return t; };
  const ARROW_R = px(['........', '...1....', '...11...', '1111111.', '...111..', '...11...', '...1....', '........']);   // a dash arrow pointing right
  const ARROW_D = px(['........', '...11...', '...11...', '...11...', '.111111.', '..1111..', '...11...', '........']);              // and one pointing down
  const RING = px(['...1111.', '..1....1', '.1......', '1....1..', '1...1.1.', '1...1...', '1...1...', '1...1...']);                   // top-left quarter of a jump ring with its arrow
  const PILL = px(['...2....', '..222...', '..222...', '.222....', '.111....', '111.....', '111.....', '.1......']);                    // a capsule: coloured bottom, white top
  const STAR = px(['........', '...1....', '..111...', '.11111..', '..111...', '.1...1..', '........', '........']);
  const BIGDOT = px(['........', '........', '...11...', '..1111..', '..1111..', '...11...', '........', '........']);
  const PUFF = [px(['........', '........', '........', '...11...', '...11...', '........', '........', '........']),          // the dust of a dash, growing and thinning
    px(['........', '........', '..1111..', '.111111.', '.111111.', '..1111..', '........', '........']),
    px(['........', '..1..1..', '.1....1.', '1......1', '1......1', '.1....1.', '..1..1..', '........'])];
  const SPARK = px(['...1....', '........', '1.....1.', '...1....', '......1.', '1.......', '...1....', '........']);     // the green sparks of a launch
  const PAL = { dash: [[0, 0, 0], [255, 140, 24]], ring: [[[0, 0, 0], [255, 72, 72]], [[0, 0, 0], [80, 220, 255]], [[0, 0, 0], [150, 255, 80]], [[0, 0, 0], [255, 210, 40]]],
    pill: { red: [[0, 0, 0], [255, 40, 40], [255, 255, 255]], cyan: [[0, 0, 0], [60, 230, 255], [255, 255, 255]], pink: [[0, 0, 0], [255, 110, 200], [255, 255, 255]], orange: [[0, 0, 0], [255, 150, 30], [255, 255, 255]], gold: [[0, 0, 0], [255, 215, 40], [255, 255, 255]] },
    star: [[0, 0, 0], [255, 235, 80]], big: [[0, 0, 0], [255, 150, 170]], dust: [[0, 0, 0], [255, 255, 255]], spark: [[0, 0, 0], [90, 255, 120]] };
  /** The marks of the level's pads: a dash arrow or a jump ring over the cell. */
  function padSprites(list, pads, sx, sy) {
    for (const p of pads || []) {
      const x = sx(p.x + 0.5), y = sy(p.y + 0.5);
      if (p.kind === 'dash') {
        const v = p.dir === 0 || p.dir === 2, pix = v ? ARROW_D : ARROW_R, flip = p.dir === 3 ? 1 : p.dir === 0 ? 2 : 0;
        list.push({ pix, palette: PAL.dash, x: x + 4, y: y + 4, hf: flip & 1, vf: flip >> 1 });
      } else {
        const palette = PAL.ring[p.colour || 0];
        list.push({ pix: RING, palette, x, y, hf: 0, vf: 0 }, { pix: RING, palette, x: x + 8, y, hf: 1, vf: 0 }, { pix: RING, palette, x, y: y + 8, hf: 0, vf: 1 }, { pix: RING, palette, x: x + 8, y: y + 8, hf: 1, vf: 1 });
      }
    }
  }

  // ---- the screen's contents -----------------------------------------------------------------------------
  const PANEL_MAP = 0x225d4;                       // the side panel's 32 x 32 map of tile entries
  const TARGET_ROW = 2, TARGET_TILES = 272;       // the target score strip: 7,000 / 10,000 / 15,000 are five tiles each
  const PAC_FRAMES = [[68, 70, 72], [8, 10, 12], [14, 64, 66], [2, 4, 6]];   // mouth phases facing up, right, down, left
  const PAC_DEATH = [72, 74, 76, 78];
  const GHOST_BASE = [200, 196, 204, 192];         // body frames facing up, right, down, left (two feet frames each, 2 tiles apart)
  const FRIGHT = [132, 134], EYES = [140, 138, 142, 136];   // eyes looking up, right, down, left (pupils drawn at that side of the whites)
  const CHERRY = 384, DIGIT0 = 388, BADGE = 420;      // BADGE: the player-number badge (two tiles per player) shown over frightened ghosts
  const FPS = 59.7275;
  const START_BANNER = 448;                        // "Press START!" is 11 tiles across and 2 down at (40, 88); it blinks, 32 frames on and 32 off

  /** The panel map with the current scores, target and roles written in. */
  function panelMap(hw, st) {
    const m = new Uint16Array(32 * 32).fill(15);
    for (let r = 0; r < 32; r++) for (let c = 21; c < 32; c++) m[r * 32 + c] = hw.u16(PANEL_MAP + 64 * r + 2 * c);
    const k = Math.max(0, [7000, 10000, 15000].indexOf(st.target));
    for (let i = 0; i < 5; i++) m[TARGET_ROW * 32 + 23 + i] = (TARGET_TILES + 5 * k + i) | (9 << 12);
    for (let s = 0; s < 4; s++) {
      const bank = 2 + s, top = 5 + 4 * s, pacRow = s === st.pacSeat;
      for (let i = 0; i < 3; i++) {
        m[top * 32 + 21 + i] = (96 + i + (pacRow ? 0 : 3)) | (bank << 12);
        m[(top + 1) * 32 + 21 + i] = (112 + i + (pacRow ? 0 : 3)) | (bank << 12);
      }
      const digits = String(Math.max(0, Math.min(99999, st.scores[s] | 0))).padStart(5, '0');
      for (let i = 0; i < 5; i++) {
        const d = digits.charCodeAt(i) - 48;
        m[top * 32 + 24 + i] = (128 + 2 * d) | (bank << 12);
        m[(top + 1) * 32 + 24 + i] = (129 + 2 * d) | (bank << 12);
      }
    }
    return m;
  }

  /** A 16 x 16 sprite made of four tiles (2 across, 32 tiles apart in the picture sheet). */
  function sprite16(list, base, pal, x, y, flip, sq) {
    const hf = flip & 1 ? 1 : 0;
    if (sq) { list.push({ tiles: [base, base + 1, base + 32, base + 33], pal, x, y, hf, sq }); return; }
    const piece = (dx, dy, t) => list.push({ tile: t, pal, x: x + (hf ? 8 - dx : dx), y: y + dy, hf, vf: 0 });
    piece(0, 0, base); piece(8, 0, base + 1); piece(0, 8, base + 32); piece(8, 8, base + 33);
  }

  /**
   * Draw Pac-Man's screen for one moment of the game.
   * st: { seg (the stage's tile table: rows of 32 entries), c0, r0 (table column / row of cell (0,0)), W, H,
   *       pellets (W*H: 0 none, 1 pellet, 2 power), pac {x, y, d, moving} | null, caught (Pac-Man was just caught: seconds since),
   *       ghosts [{x, y, d, m, seat}] (m: 'n' normal, 'f' frightened, 'e' eyes, 'r' in the house), pacSeat, scores [4], target,
   *       fruit {x, y} | null, frightLeft, time (seconds), cam (an object that keeps the scroll between frames) }
   */
  function render(hw, f, st) {
    clear(f, [0, 0, 0]);
    const fr = Math.floor(st.time * FPS);
    // the camera follows Pac-Man in a band: it only scrolls when he would leave the middle of the screen
    const cam = st.cam || (st.cam = { dy: 0 });
    if (st.pac) { const top = 8 * st.pac.y - 8; cam.dy = Math.min(Math.max(cam.dy, top - 88), top - 36); }
    const dy = Math.round(cam.dy);
    // maze layer
    const map = new Uint16Array(32 * 32).fill(15);
    for (let r = 0; r < st.seg.length && r < 32; r++) for (let c = 0; c < 21; c++) {
      let id = st.seg[r][c];
      if (id === 30 || id === 31) { const x = c - st.c0, y = r - st.r0; if (!(x >= 0 && y >= 0 && x < st.W && y < st.H && st.pellets[y * st.W + x])) id = 15; }
      map[r * 32 + c] = id;
    }
    drawMap(f, hw, map, 32, 32, 0, dy, {});
    // panel layer
    drawMap(f, hw, panelMap(hw, st), 32, 32, 0, 0, {});
    // sprites: lower slots are drawn on top, so draw the list backwards
    const sprites = [];
    const sx = c => Math.round(8 * c - 8), sy = c => Math.round(8 * c - 8) - dy, badges = [];
    // a flight (Arrangement levels) lifts the sprite along an arc
    const lift = e => e && e.a ? Math.round(10 * Math.sin(Math.PI * e.a[4])) : 0;
    for (const c of st.clones || []) {                 // mirror clones: Pac-Man's in grey, a ghost's blinking in its colour
      if (c.of < 0) sprite16(sprites, PAC_FRAMES[c.d][Math.floor(fr / 2) % 3], hw.greyPal, sx(c.x), sy(c.y), 0);
      else if (Math.floor(fr / 8) % 2) sprite16(sprites, GHOST_BASE[c.d] + (Math.floor(fr / 12) % 2 ? 2 : 0), c.seat >= 0 ? 1 + c.seat : 7, sx(c.x), sy(c.y), 0);
    }
    if (st.pac) {
      let base;
      if (st.caught !== undefined && st.caught !== null) base = PAC_DEATH[Math.min(PAC_DEATH.length - 1, Math.floor(st.caught * 3))];
      else {
        const phase = st.pac.moving ? Math.floor(fr / 2) % 4 : (fr % 16 < 12 ? 0 : 1);
        base = phase === 0 ? 0 : PAC_FRAMES[st.pac.d][phase - 1];
        if (st.pac.ds >= 2) base = PAC_FRAMES[[0, 1, 2, 3][Math.floor(fr / 2) % 4]][2];     // a dasher spins while the dash is strong: wide open, facing round in turn
        else if (st.pac.bk > 0) base = 0;                                                  // bonked a wall: a round ball
      }
      sprite16(sprites, base, 0, sx(st.pac.x), sy(st.pac.y) - lift(st.pac), 0, st.pac.sq);
      if (st.pac.bk > 0) for (let k = 0; k < 3; k++) { const a = fr / 6 + k * 2.1; badges.push({ pix: STAR, palette: PAL.star, x: sx(st.pac.x) + 4 + Math.round(Math.cos(a) * 7), y: sy(st.pac.y) - 6 + Math.round(Math.sin(a) * 2), hf: 0, vf: 0 }); }
    }
    st.ghosts.forEach(g => {
      if (g.m === 'r') return;
      const foot = Math.floor(fr / 12) % 2 ? 2 : 0;
      // eaten ghosts are a pair of eyes; so is a grey stand-in on the original's handheld (a body only once it wakes)
      if (g.m === 'e' || g.seat < 0) sprite16(sprites, EYES[g.d], 7, sx(g.x), sy(g.y), 0);
      else if (g.m === 'f') {
        sprite16(sprites, FRIGHT[Math.floor(fr / 12) % 2], st.frightLeft < 2 && Math.floor(fr / 8) % 2 ? 6 : 5, sx(g.x), sy(g.y), 0);
        badges.push({ tile: BADGE + 2 * g.seat, pal: 1 + g.seat, x: sx(g.x), y: sy(g.y) - 8, hf: 0, vf: 0 }, { tile: BADGE + 2 * g.seat + 1, pal: 1 + g.seat, x: sx(g.x) + 8, y: sy(g.y) - 8, hf: 0, vf: 0 });
      }
      else sprite16(sprites, GHOST_BASE[g.ds >= 2 ? Math.floor(fr / 2) % 4 : g.d] + foot, 1 + g.seat, sx(g.x), sy(g.y) - lift(g), 0, g.sq);
      if (g.st > 0 || g.bk > 0) for (let k = 0; k < 3; k++) { const a = fr / 6 + k * 2.1; badges.push({ pix: STAR, palette: PAL.star, x: sx(g.x) + 4 + Math.round(Math.cos(a) * 7), y: sy(g.y) - 6 + Math.round(Math.sin(a) * 2), hf: 0, vf: 0 }); }
    });
    if (st.fruit && st.fruit.k && st.fruit.k !== 'fruit') sprites.push({ pix: PILL, palette: PAL.pill[st.fruit.k] || PAL.pill.gold, x: sx(st.fruit.x) + 4, y: sy(st.fruit.y) + 4, hf: 0, vf: 0 });
    else if (st.fruit) sprite16(sprites, CHERRY, 1, sx(st.fruit.x), sy(st.fruit.y), 0);
    for (const i of st.big || []) sprites.push({ pix: BIGDOT, palette: PAL.big, x: sx((i % st.W) + 0.5) + 4, y: sy(Math.floor(i / st.W) + 0.5) + 4, hf: 0, vf: 0 });
    padSprites(sprites, st.pads, sx, sy);
    for (const d of st.dust || []) sprites.push({ pix: PUFF[Math.min(2, Math.floor(d.age * 3))], palette: PAL.dust, x: sx(d.x) + 4, y: sy(d.y) + 4, hf: 0, vf: 0 });
    for (const sp of st.sparks || []) { const r = Math.round(2 + 8 * sp.age); for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) badges.push({ pix: sp.star ? STAR : SPARK, palette: sp.star ? PAL.star : PAL.spark, x: sx(sp.x) + 4 + ox, y: sy(sp.y) + 4 + oy, hf: ox > 0 ? 1 : 0, vf: oy > 0 ? 1 : 0 }); }
    // sprite16 pushed in draw-priority order (Pac first); the picture draws the last one first
    sprites.push(...badges);
    // score popups float over the spot: [{x, y, text}]; the digits sit 4 pixels apart
    for (const p of st.pops || []) {
      const t = String(p.text), x0 = Math.round(8 * p.x - 2 * t.length - 4), y0 = sy(p.y) - 4;
      for (let i = t.length - 1; i >= 0; i--) sprites.push({ tile: DIGIT0 + t.charCodeAt(i) - 48, pal: 0, x: x0 + 4 * i, y: y0, hf: 0, vf: 0 });
    }
    if (st.banner && Math.floor(fr / 32) % 2 === 0) {
      for (let r = 0; r < 2; r++) for (let c = 0; c < 11; c++) sprites.unshift({ tile: START_BANNER + 32 * r + c, pal: 0, x: 40 + 8 * c, y: 88 + 8 * r, hf: 0, vf: 0 });
    }
    sprites.reverse();
    drawSprites(f, hw, sprites);
    return f;
  }

  async function load(disc, MazeData) {
    const rom = new Uint8Array(await disc.read(PATH)), hw = parse(rom);
    hw.segments = MazeData ? MazeData.segments(rom) : null;
    return hw;
  }
  return { PATH, W, H, parse, load, frame, clear, blit, drawMap, drawSprites, render, panelMap, BG_PAL, BG_TILES, OBJ_PAL, OBJ_TILES };
});
