/* The ghost's 3D view, drawn with the models on the player's disc: the stage models, the ghost and
 * Pac-Man models with their animations, the fruit and the pellet sprite. The camera follows the ghost
 * from behind and above, framed like the original's ghost circles. Browser only (WebGL). */
(function (root) {
  'use strict';
  const M = () => GX.mat4;
  // Camera measured against the original's picture: a ghost circle 252 px across shows about
  // 5.7 cells at the ghost, looking north and down at 38 degrees.
  const CAM = { pitch: 38 * Math.PI / 180, dist: 16000, fov: 20.3 * Math.PI / 180 };
  const SKINS = ['r', 'b', 'p', 'g'];          // ghost_r/b/p/g = P1 red, P2 blue, P3 pink, P4 green
  const YAW = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];   // facing for up, right, down, left (models face +z)
  const BURST_TIME = 1.1;                       // the catch impact lasts about this long
  const FPS = 60;                               // J3D animations advance once per frame at 60 Hz

  async function load(disc) {
    const arc = Disc.rarc(Disc.yaz0(await disc.read('PROOT/Model.szs')));
    const file = n => { const v = arc.get(n); if (!v) throw new Error('missing in Model.szs: ' + n); return v; };
    return {
      stages: new Map(),
      ghost: J3D.parseBMD(file('ghost/ghost.bmd')),
      ghostAnim: J3D.parseBCK(file('ghost/anm/ghost.bck')),
      ghostBlink: J3D.parseBTP(file('ghost/btp/ghost.btp')),
      skins: Object.fromEntries([...SKINS, 'yowari', 'com', 'toumei'].map(s => [s, Disc.decodeBTI(file('ghost/ghost_' + s + '.bti'))])),
      pac: J3D.parseBMD(file('packman/pacman.bmd')),
      pacAnim: J3D.parseBCK(file('packman/anm/pacman.bck')),
      cherry: J3D.parseBMD(file('cherry.bmd')),
      dot: Disc.decodeBTI(await disc.read('PROOT/Texture/dot.bti'))
    };
  }

  /** Read stage model k (1-13) and its texture animation. Cached in assets.stages. `maze` is the descriptor
   *  from MazeData (it places the model: colOffset, rowOffset) and also gives the floor height. */
  async function loadStage(disc, assets, maze) {
    const k = maze.stage;
    if (assets.stages.has(k)) return assets.stages.get(k);
    const bmd = J3D.parseBMD(await disc.read('PROOT/Map/PacField_' + k + '.bmd'));
    // The original stage's floor texture is a sheet of wall-edge art; its floor strips use coordinates outside 0..1 and
    // the original shows plain dark floor there, so the edge pixel is held instead of repeating the sheet.
    if (k === 1) for (const t of bmd.textures) if (t.name === 'yuka15') t.wrapS = t.wrapT = 0;
    let btk = null; try { btk = J3D.parseBTK(await disc.read('PROOT/Map/PacField_' + k + '.btk')); } catch (e) { /* no scrolling */ }
    const st = { k, bmd, btk, colOff: maze.colOffset, rowOff: maze.rowOffset, floor: floorHeight(bmd, maze) };
    assets.stages.set(k, st);
    return st;
  }
  /** Height of the corridors: the median top surface above a sample of pellet cells (stage 1 is at 0). */
  function floorHeight(bmd, maze) {
    const cells = [];
    maze.rows.forEach((row, r) => [...row].forEach((ch, c) => { if (ch === '.') cells.push([c, r]); }));
    const pick = cells.filter((_, i) => i % Math.max(1, Math.floor(cells.length / 14)) === 0).slice(0, 14);
    const tris = [];
    for (const sh of J3D.pose(bmd)) for (let i = 0; i + 8 < sh.pos.length; i += 9) tris.push(sh.pos.subarray(i, i + 9));
    const ys = [];
    for (const [c, r] of pick) {
      const x = (c + maze.colOffset - 1) * 1000 + 500, z = (r + maze.rowOffset - 1) * 1000 + 500;
      let best = -Infinity;
      for (const t of tris) {
        const den = (t[5] - t[8]) * (t[0] - t[6]) + (t[6] - t[3]) * (t[2] - t[8]); if (Math.abs(den) < 1e-6) continue;
        const l1 = ((t[5] - t[8]) * (x - t[6]) + (t[6] - t[3]) * (z - t[8])) / den, l2 = ((t[8] - t[2]) * (x - t[6]) + (t[0] - t[6]) * (z - t[8])) / den, l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        const y = l1 * t[1] + l2 * t[4] + l3 * t[7]; if (y <= 600 && y > best) best = y;
      }
      if (best > -Infinity) ys.push(best);
    }
    ys.sort((a, b) => a - b);
    return ys.length ? Math.round(ys[ys.length >> 1]) : 0;
  }

  /** The 3D scene on an existing GX renderer. draw(v) renders into the current viewport. */
  function scene(assets, R) {
    let cur = null;   // the stage model on the GPU: {k, model, anim}
    const useStage = st => {
      if (cur && cur.k === st.k) return cur;
      cur = { k: st.k, model: R.model(st.bmd, J3D.pose(st.bmd)), anim: st.btk };
      return cur;
    };
    const ghost = R.model(assets.ghost, J3D.pose(assets.ghost, J3D.animate(assets.ghostAnim, 0)));
    const pac = R.model(assets.pac, J3D.pose(assets.pac, J3D.animate(assets.pacAnim, 0)));
    const cherry = R.model(assets.cherry, J3D.pose(assets.cherry));
    const tex = t => R.texture(t);
    const skins = {}; for (const k in assets.skins) skins[k] = tex(assets.skins[k]);
    const dot = tex(assets.dot);
    // the glowing blue drops that float off frightened ghosts: a bright cyan disc, white in the middle
    const orb = tex((() => {
      const n = 32, rgba = new Uint8Array(n * n * 4);
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        const d = Math.hypot(x - 15.5, y - 15.5), i = (y * n + x) * 4, k = Math.max(0, 1 - d / 14) ** 2;
        rgba[i] = 70 + 185 * k; rgba[i + 1] = 200 + 55 * k; rgba[i + 2] = 255; rgba[i + 3] = d <= 14 ? 255 : 0;
      }
      return { w: n, h: n, rgba, wrapS: 0, wrapT: 0, magFilter: 1, minFilter: 1 };
    })());
    // Measured on a recording of the original: each drop lives about 6 frames (0.2 s), two or three are in the air per
    // ghost, about 4 px wide on the 640 px picture (0.09 cell), and they fly out from where the ghost was when they
    // fell: sideways at about 1.4 cells/s in any direction and upwards at about 0.75 cells/s, so they trail a moving ghost.
    const ORBS = 3, ORB_LIFE = 0.2;
    const trails = new Map();                     // per ghost (by seat): recent positions [time, x, y]
    const whereAt = (h, t) => {
      if (h[0][0] >= t) return h[0];
      for (let i = h.length - 1; i > 0; i--) if (h[i - 1][0] <= t) { const a = h[i - 1], b = h[i], k = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0; return [t, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
      return h[h.length - 1];
    };
    const rnd = (a, b, c) => { let h = Math.imul((a * 73856093) ^ (b * 19349663) ^ (c * 83492791), 0x45d9f3b); h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
    // the ghosts' blink: the five eye textures, swapped by the disc's pattern animation
    const eyes = assets.ghost.textures.slice(0, 5).map(t => R.texture(t));
    let lastGhostFrame = -1, lastPacFrame = -1;
    const m4 = M();

    /** v: {stage (from loadStage), me, zoom, aspect, ghosts: [{x, y, m, yaw, seat}], pac, pellets, W, H, fruit, flash, time} */
    function draw(v) {
      const gl = R.gl, f = v.time * FPS, st = v.stage, fl = st.floor;
      // Sim coordinates (cell units, centre at +0.5) -> stage units, with this stage's grid placement.
      const wx = x => (x + st.colOff - 1) * 1000, wz = y => (y + st.rowOff - 1) * 1000;
      const stage = useStage(st);
      // Animations: the ghosts' float cycle and Pac-Man's mouth, shared by every instance.
      // the body's float and skirt sway run at half speed, like the blink: the original advances them 30 times a second
      const gf = Math.floor(f * 0.5) % assets.ghostAnim.length;
      if (gf !== lastGhostFrame) { lastGhostFrame = gf; ghost.setPose(J3D.pose(assets.ghost, J3D.animate(assets.ghostAnim, gf))); }
      const pf = Math.floor(f) % assets.pacAnim.length;
      if (pf !== lastPacFrame && v.pac) { lastPacFrame = pf; pac.setPose(J3D.pose(assets.pac, J3D.animate(assets.pacAnim, pf))); }
      if (stage.anim) stage.model.setTexMtx(J3D.animateTex(stage.anim, f));
      gl.clear(gl.DEPTH_BUFFER_BIT);

      const tx = wx(v.me.x), tz = wz(v.me.y), ty = fl + 200, d = CAM.dist * (v.zoom || 1);
      const eye = [tx, ty + d * Math.sin(CAM.pitch), tz + d * Math.cos(CAM.pitch)];
      const view = m4.lookAt(eye, [tx, ty, tz], [0, 1, 0]);
      const proj = m4.perspective(CAM.fov, v.aspect || 1, 500, 200000);
      // Light: colour channels lit from the camera; the ghosts' alpha channel (which shades their body) from
      // below and in front, which matches the original's shading of the ghost bodies.
      R.begin(view, proj, { dir: [0, Math.sin(CAM.pitch), Math.cos(CAM.pitch)], dirA: [0, -1, 0.3], color: [1, 1, 1, 0.5] });
      R.draw(stage.model, m4.ident());
      if (v.dim) R.tint([0.01, 0.02, 0.1, 0.5 * v.dim]);       // while the ghosts are vulnerable the scene darkens
      const pel = [];
      for (let y = 0; y < v.H; y++) for (let x = 0; x < v.W; x++) {
        const p = v.pellets[y * v.W + x]; if (!p) continue;
        pel.push([wx(x + 0.5), fl + 250, wz(y + 0.5), p === 2 ? 560 + 80 * Math.sin(v.time * 9) : 260]);
      }
      R.sprites(dot, pel);
      // Pac-Man's trail: a wide flat ribbon in his player's colour, pale next to him and fading out at its tail
      if (v.trail && v.trail.length && v.trailColor) {
        const pts = []; let last = v.pac ? [v.pac.x, v.pac.y] : null;
        const k = age => Math.max(0, Math.min(1, age / v.trailTime));
        if (last) pts.push([wx(last[0]), fl + 45, wz(last[1]), 0.92, 0.45]);
        for (let i = v.trail.length - 1; i >= 0; i--) {
          const [x, y, age] = v.trail[i];
          if (x >= v.W || (last && Math.abs(x - last[0]) > v.W / 2)) break;       // through the tunnel: the line ends here
          pts.push([wx(x), fl + 45, wz(y), 0.92 * Math.min(1, (1 - k(age)) / 0.4), 0.45 * (1 - k(age)) ** 2]); last = [x, y];
        }
        R.ribbon(pts, 780, v.trailColor);
      }
      if (v.fruit) R.draw(cherry, m4.trs(wx(v.fruit.x), fl, wz(v.fruit.y), 0, 0.75));
      const dying = v.pac && v.pac.dying >= 0 ? v.pac.dying : -1, D = (v.pac && v.pac.death) || { spin: 0.22, shrink: 0.14, flatAt: 2 };
      // caught: two turns while shrinking to nothing, then out of sight until he reappears lying on his side
      const gone = dying >= D.spin + D.shrink && dying < D.flatAt, flat = dying >= D.flatAt;
      if (v.pac && v.pac.x < v.W && !gone) {     // out of sight in the hidden part of the tunnel otherwise
        let yaw = v.pac.yaw !== undefined ? v.pac.yaw : YAW[v.pac.d] || 0, scale = 1;
        if (dying >= 0 && !flat) { yaw += Math.min(dying, D.spin + D.shrink) / D.spin * 2 * Math.PI; scale = dying < D.spin ? 1 : Math.max(0.001, 1 - (dying - D.spin) / D.shrink); }
        let pm = m4.trs(wx(v.pac.x), fl + (flat ? 250 : 380), wz(v.pac.y), yaw, scale);
        if (flat) { const a = 1.25, c = Math.cos(a), n = Math.sin(a); pm = m4.mul(pm, [c, n, 0, 0, -n, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }   // knocked over on his side
        R.draw(pac, pm);
      }
      // Frightened ghosts cry: glowing blue drops fly off them and are left behind (positions come from the time and the
      // ghost's recent path alone, so every circle agrees).
      const orbs = [];
      for (const g of v.ghosts) {
        const seat = g.seat | 0, h = trails.get(seat) || [];
        if (!h.length || h[h.length - 1][0] < v.time) { h.push([v.time, g.x, g.y]); while (h.length > 2 && h[1][0] < v.time - ORB_LIFE) h.shift(); }
        else if (h[h.length - 1][0] === v.time) { h[h.length - 1][1] = g.x; h[h.length - 1][2] = g.y; }
        trails.set(seat, h);
        if (g.m !== 'f' || v.flash) continue;
        for (let k = 0; k < ORBS; k++) {
          const ph = v.time / ORB_LIFE + k / ORBS, cyc = Math.floor(ph), u = ph - cyc, age = u * ORB_LIFE;
          const [, px, py] = whereAt(h, v.time - age);
          const a = rnd(seat, k, cyc) * Math.PI * 2, sp = 500 + rnd(seat, k, cyc + 99) * 1400, up = 400 + rnd(seat, k, cyc + 7) * 700;
          const ox = (rnd(seat, k, cyc + 3) - 0.5) * 300, oz = (rnd(seat, k, cyc + 5) - 0.5) * 300, h0 = 150 + rnd(seat, k, cyc + 11) * 400;
          orbs.push([wx(px) + ox + Math.cos(a) * sp * age, fl + h0 + up * age, wz(py) + oz + Math.sin(a) * sp * age, u < 0.6 ? 100 : 100 - 70 * (u - 0.6) / 0.4]);
        }
      }
      R.sprites(orb, orbs);
      // Ghosts last: their bodies are blended.
      const blink = J3D.animatePattern(assets.ghostBlink, f * 0.5).e || 0;       // the blink runs at half speed
      for (const g of v.ghosts) {
        if (g.x >= v.W) continue;                 // in the hidden part of the tunnel
        const col = g.c != null ? g.c : g.seat;      // the colour it wears: its player's, the colour of the ghost that woke it, or -1 = grey stand-in
        let skin = col < 0 ? skins.com : skins[SKINS[col]], scale = 1.25, opts;
        if (g.m === 'f') {
          // vulnerable: the same body in dark blue with a mouth and no big eyes, blinking out near the end
          if (v.flash) continue;
          skin = skins.yowari;
          opts = { textures: { ghost_r: skin }, filter: d => d.mat.name !== 'e' };
        } else {
          if (g.m === 'e') skin = skins.toumei;
          opts = { textures: { ghost_r: skin, 'ghost_eye.0': eyes[blink] } };
        }
        R.draw(ghost, m4.trs(wx(g.x), fl + 150, wz(g.y), g.yaw, scale), opts);
      }
      // where a point on the floor lands in the view: -1..1 across and up the square
      const vp = m4.mul(proj, view);
      const project = (x, y, h) => {
        const X = wx(x), Y = fl + (h || 0), Z = wz(y);
        const cx = vp[0] * X + vp[4] * Y + vp[8] * Z + vp[12], cy = vp[1] * X + vp[5] * Y + vp[9] * Z + vp[13], cw = vp[3] * X + vp[7] * Y + vp[11] * Z + vp[15];
        return [cx / cw, cy / cw];
      };
      // the impact when Pac-Man is caught: yellow rays thrown out round him, in the picture's own plane
      if (v.burst && v.burst.age < BURST_TIME) {
        const [cx, cy] = project(v.burst.x, v.burst.y, 450), k = v.burst.age / BURST_TIME, a = 1 - k * k;
        for (let i = 0; i < 9; i++) {
          const ang = i / 9 * 2 * Math.PI + 0.35, ca = Math.cos(ang), sa = Math.sin(ang), r0 = 0.2 + 0.2 * k + (i % 2) * 0.05, r1 = r0 + 0.2 - 0.1 * k, w = 0.026;
          R.screenPoly([[cx + ca * r0 - sa * w, cy + sa * r0 + ca * w], [cx + ca * r1 - sa * w / 2, cy + sa * r1 + ca * w / 2], [cx + ca * r1 + sa * w / 2, cy + sa * r1 - ca * w / 2], [cx + ca * r0 + sa * w, cy + sa * r0 - ca * w]], [1, 0.72, 0.1, a]);
        }
      }
      return { project };
    }
    return { draw };
  }

  /** A standalone square view on its own canvas. Returns null when WebGL is unavailable. */
  function create(assets) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const gl = canvas.getContext('webgl', { antialias: true, alpha: true, premultipliedAlpha: false });
    if (!gl) return null;
    const sc = scene(assets, GX.renderer(gl));
    function render(v) {
      const size = Math.max(64, Math.min(1024, Math.round(v.size)));
      if (canvas.width !== size) { canvas.width = canvas.height = size; }
      gl.viewport(0, 0, size, size);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      sc.draw(v);
      return canvas;
    }
    return { render, canvas, YAW };
  }

  root.View3D = { load, loadStage, create, scene, YAW, SKINS };
})(typeof self !== 'undefined' ? self : this);
