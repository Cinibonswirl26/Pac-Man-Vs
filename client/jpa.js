/* Particle effects from the player's disc: a reader for the original's particle file (PROOT/Effect/*.jpc, the
 * "JPAC2-10" container) and a small simulator for the emitters the exchange screen uses, drawn flat on the TV
 * picture. Nothing from the disc is kept in this project: the file is read at run time.
 *
 * The container: a header (version tag, resource count, texture count, texture table offset), then one record per
 * emitter (its id and a list of blocks), then the textures (TEX1: a name and a BTI picture). The blocks read here:
 *   BEM1  the emitter: its volume (shape, size, sweep, divisions), rates, start frame, particle life, velocities
 *   BSP1  the particle's look: shape, size, colours, how texture and colours combine, which texture
 *   ESP1  the particle's scale and alpha over its life, and its rotation
 *   FLD1  fields acting on the particles (the spin and gravity fields are simulated)
 *   KFA1  key-framed curves over the emitter's life (only the emission rate is simulated)
 *   TDB1  the emitter's texture numbers
 * Anything else is listed in `unknown` and ignored. UMD: window.JPA in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.JPA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VERSION = 'JPAC2-10';
  const VOLUME = ['cube', 'sphere', 'cylinder', 'torus', 'point', 'circle', 'line'];
  const SHAPE = ['point', 'line', 'billboard', 'direction', 'directionCross', 'stripe', 'stripeCross', 'rotation', 'rotationCross', 'dirBillboard', 'yBillboard'];
  const FIELD = ['gravity', 'air', 'magnet', 'newton', 'vortex', 'random', 'drag', 'convection', 'spin'];

  /** Parse a .jpc file. Returns { resources: Map(id -> emitter resource), textures: [{ name, bti }], unknown: [tags] },
   *  or throws when the version tag is not the one this reader knows. */
  function parse(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const u16 = o => dv.getUint16(o), s16 = o => dv.getInt16(o), u32 = o => dv.getUint32(o), f32 = o => dv.getFloat32(o);
    const tag = (o, n) => String.fromCharCode(...u8.subarray(o, o + n));
    if (tag(0, 8) !== VERSION) throw new Error('particle file is ' + JSON.stringify(tag(0, 8)) + ', not ' + VERSION);
    const nRes = u16(8), nTex = u16(10), texAt = u32(12);
    const resources = new Map(), unknown = new Set();
    let o = 0x10;
    for (let r = 0; r < nRes; r++) {
      const id = u16(o), nBlocks = u16(o + 2), res = { id, fields: [], keys: [], tdb: [] };
      let p = o + 8;
      for (let b = 0; b < nBlocks; b++) {
        const t = tag(p, 4), size = u32(p + 4);
        if (t === 'BEM1') {
          const fl = u32(p + 8), v3 = q => [f32(q), f32(q + 4), f32(q + 8)];
          res.bem = {
            flags: fl, volume: VOLUME[(fl >> 8) & 7] || 'point', fixedDensity: !!(fl & 1), fixedInterval: !!(fl & 2),
            scl: v3(p + 0x10), trs: v3(p + 0x1C), dir: v3(p + 0x28),
            velOmni: f32(p + 0x34), velAxis: f32(p + 0x38), velRndm: f32(p + 0x3C), velDir: f32(p + 0x40), spread: f32(p + 0x44), velRatio: f32(p + 0x48),
            rate: f32(p + 0x4C), rateRndm: f32(p + 0x50), lifeRndm: f32(p + 0x54), volSweep: f32(p + 0x58), volMinRad: f32(p + 0x5C), airResist: f32(p + 0x60), momentRndm: f32(p + 0x64),
            rot: [s16(p + 0x68), s16(p + 0x6A), s16(p + 0x6C)], maxFrame: s16(p + 0x6E), startFrame: s16(p + 0x70), life: s16(p + 0x72),
            volSize: s16(p + 0x74), div: s16(p + 0x76), rateStep: u8[p + 0x78]
          };
        } else if (t === 'BSP1') {
          const fl = u32(p + 8), rgba = q => [u8[q] / 255, u8[q + 1] / 255, u8[q + 2] / 255, u8[q + 3] / 255];
          const blend = u16(p + 0x18);
          res.bsp = {
            flags: fl, shape: SHAPE[fl & 15] || 'billboard', dirType: (fl >> 4) & 7, rotType: (fl >> 7) & 7,
            colorIn: (fl >> 15) & 7, alphaIn: (fl >> 18) & 1, size: [f32(p + 0x10), f32(p + 0x14)],
            blend: { type: blend & 3, src: (blend >> 2) & 15, dst: (blend >> 6) & 15 }, texIdx: u8[p + 0x20], colorFlags: u8[p + 0x21],
            prm: rgba(p + 0x26), env: rgba(p + 0x2A)
          };
        } else if (t === 'ESP1') {
          const fl = u32(p + 8);
          res.esp = {
            flags: fl, scale: !!(fl & 1), diffXY: !!(fl & 2), pivot: [(fl >> 12) & 3, (fl >> 14) & 3], alpha: !!(fl & 0x10000), rotate: !!(fl & 0x1000000),
            scaleIn: f32(p + 0x0C), scaleOut: f32(p + 0x10), scaleInX: f32(p + 0x14), scaleOutX: f32(p + 0x18), scaleInY: f32(p + 0x1C), scaleOutY: f32(p + 0x20), scaleOutRndm: f32(p + 0x24),
            alphaIn: f32(p + 0x2C), alphaOut: f32(p + 0x30), alphaInValue: f32(p + 0x34), alphaBase: f32(p + 0x38), alphaOutValue: f32(p + 0x3C),
            rotAngle: f32(p + 0x4C), rotAngleRndm: f32(p + 0x50), rotSpeed: f32(p + 0x54), rotSpeedRndm: f32(p + 0x58)
          };
        } else if (t === 'FLD1') {
          const fl = u32(p + 8);
          res.fields.push({ type: FIELD[fl & 15] || 'unknown', pos: [f32(p + 0x0C), f32(p + 0x10), f32(p + 0x14)], axis: [f32(p + 0x18), f32(p + 0x1C), f32(p + 0x20)], mag: f32(p + 0x24) });
        } else if (t === 'KFA1') {
          const n = u8[p + 9], keys = [];
          for (let k = 0; k < n; k++) keys.push([f32(p + 0x0C + 16 * k), f32(p + 0x10 + 16 * k)]);   // time, value (then two slopes)
          res.keys.push({ type: u8[p + 8], loop: !!u8[p + 0x0B], keys });
        } else if (t === 'TDB1') {
          for (let q = p + 8; q + 2 <= p + size; q += 2) res.tdb.push(u16(q));
        } else unknown.add(t);
        p += size;
      }
      resources.set(id, res);
      o = p;
    }
    const textures = [];
    for (let t = 0, q = texAt; t < nTex && q + 0x20 <= u8.length; t++) {
      const size = u32(q + 4);
      let name = ''; for (let k = q + 0x0C; k < q + 0x20 && u8[k]; k++) name += String.fromCharCode(u8[k]);
      textures.push({ name, bti: u8.subarray(q + 0x20, q + size) });
      q += size;
    }
    return { resources, textures, unknown: [...unknown] };
  }

  // a small seeded random source, so a replayed effect looks the same
  const rng = seed => () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const DEG = Math.PI / 180;
  /** Rotate [x, y, z] by the emitter's rotation (degrees about X, then Y, then Z). */
  function rotate(v, r) {
    let [x, y, z] = v;
    const ax = r[0] * DEG, ay = r[1] * DEG, az = r[2] * DEG;
    [y, z] = [y * Math.cos(ax) - z * Math.sin(ax), y * Math.sin(ax) + z * Math.cos(ax)];
    [x, z] = [x * Math.cos(ay) + z * Math.sin(ay), -x * Math.sin(ay) + z * Math.cos(ay)];
    [x, y] = [x * Math.cos(az) - y * Math.sin(az), x * Math.sin(az) + y * Math.cos(az)];
    return [x, y, z];
  }
  const norm = v => { const l = Math.hypot(v[0], v[1], v[2]); return l > 1e-6 ? [v[0] / l, v[1] / l, v[2] / l] : [0, 0, 0]; };
  /** Value of a key-framed curve at frame t (straight lines between keys). */
  function curve(c, t) {
    const k = c.keys; if (!k.length) return 0;
    const end = k[k.length - 1][0];
    if (c.loop && end > 0) t %= end;
    if (t <= k[0][0]) return k[0][1];
    for (let i = 1; i < k.length; i++) if (t <= k[i][0]) { const a = k[i - 1], b = k[i]; return a[1] + (b[1] - a[1]) * (t - a[0]) / (b[0] - a[0] || 1); }
    return end ? k[k.length - 1][1] : 0;
  }
  // scale and alpha over a particle's life (0..1): in from a value, hold, out to a value
  const inOut = (t, tin, tout, vin, base, vout) => t < tin ? vin + (base - vin) * t / tin : t > tout ? base + (vout - base) * (t - tout) / Math.max(1e-6, 1 - tout) : base;

  /** An emitter run frame by frame. Particles live in the emitter's own space; `draw` lays them flat on the picture,
   *  x to the right and y down, centred on (x, y), `scale` picture pixels per unit. */
  function emitter(res, seed) {
    const b = res.bem, rnd = rng(seed || 1), parts = [];
    let frame = 0, carry = 0, made = 0;
    const rateKey = res.keys.find(k => k.type === 0);
    function spawn() {
      // where on the emitter's volume (circle, line, point; others are treated as a point)
      let pos = [0, 0, 0];
      if (b.volume === 'circle') {
        const th = b.fixedInterval ? 2 * Math.PI * b.volSweep * (made % Math.max(1, b.div)) / Math.max(1, b.div) : 2 * Math.PI * b.volSweep * rnd();
        const d = b.volMinRad + (1 - b.volMinRad) * (b.fixedDensity ? Math.sqrt(rnd()) : rnd());
        pos = [b.volSize * d * Math.sin(th), 0, b.volSize * d * Math.cos(th)];
      }
      else if (b.volume === 'line') {   // along z: evenly spaced end to end when the interval is fixed, else at random
        const k = b.fixedInterval ? (made % Math.max(1, b.div)) / Math.max(1, b.div - 1) : rnd();
        pos = [0, 0, b.volSize * (k - 0.5)];
      }
      made++;
      const vOmni = norm(pos), vAxis = norm([pos[0], 0, pos[2]]), dir = norm(b.dir);
      let vel = [0, 1, 2].map(i => vOmni[i] * b.velOmni + vAxis[i] * b.velAxis + dir[i] * b.velDir + (rnd() * 2 - 1) * b.velRndm);
      if (b.velRatio) { const k = 1 + b.velRatio * (rnd() * 2 - 1); vel = vel.map(v => v * k); }
      pos = pos.map((v, i) => v * b.scl[i]);
      const e = res.esp;
      const part = { pos, vel, age: 0, life: Math.max(1, Math.round(b.life * (1 - b.lifeRndm * rnd()))),
        scaleRnd: e ? 1 - e.scaleOutRndm * rnd() : 1, ang: 0, spin: 0 };
      // a flat (billboard) particle may start turned and keep turning; angles are in 65536ths of a turn
      if (e && e.rotate && res.bsp && res.bsp.shape === 'billboard') {
        part.ang = (e.rotAngle + e.rotAngleRndm * (rnd() - 0.5)) * 2 * Math.PI / 65536;
        part.spin = (e.rotSpeed + e.rotSpeedRndm * (rnd() - 0.5)) * 2 * Math.PI / 65536;
      }
      parts.push(part);
    }
    function step() {
      // emission: every rateStep + 1 frames from the start frame (for ever when maxFrame is 0)
      const t = frame - b.startFrame;
      if (t >= 0 && (b.maxFrame <= 0 || t < b.maxFrame) && t % (b.rateStep + 1) === 0) {
        if (b.fixedInterval && b.volume !== 'point') for (let i = 0; i < b.div; i++) spawn();   // one particle per division
        else {
          const rate = rateKey ? curve(rateKey, t) : b.rate;
          carry += rate * (1 + b.rateRndm * (rnd() * 2 - 1));
          while (carry >= 1) { spawn(); carry -= 1; }
        }
      }
      for (const p of parts) {
        for (const f of res.fields) if (f.type === 'spin') {       // turn about the field's axis (an angle a frame, radians)
          const a = norm(f.axis), c = Math.cos(f.mag), s = Math.sin(f.mag), [x, y, z] = p.pos, d = a[0] * x + a[1] * y + a[2] * z;
          p.pos = [x * c + (a[1] * z - a[2] * y) * s + a[0] * d * (1 - c), y * c + (a[2] * x - a[0] * z) * s + a[1] * d * (1 - c), z * c + (a[0] * y - a[1] * x) * s + a[2] * d * (1 - c)];
        }
        for (const f of res.fields) if (f.type === 'gravity') { const a = norm(f.axis); p.vel = p.vel.map((v, i) => v + a[i] * f.mag); }   // a steady pull
        p.vel = p.vel.map(v => v * b.airResist);
        p.ang += p.spin;
        p.pos = p.pos.map((v, i) => v + p.vel[i]);
        p.age++;
      }
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].age >= parts[i].life) parts.splice(i, 1);
      frame++;
    }
    /** Run until frame f (an effect started now and drawn at frame f looks as it would have). */
    function runTo(f) { while (frame < f) step(); }
    /** The particles as flat quads: [{ pts: [[x, y] x4 in order TL TR BR BL], uv, alpha }]. */
    function quads(x0, y0, scale, sizeK) {
      const out = [], s = res.bsp, e = res.esp, U = 25 * (sizeK || 1);   // the particle file's sizes are in 25ths of a unit
      for (const p of parts) {
        const t = p.age / p.life;
        let sx = 1, sy = 1, a = 1;
        if (e && e.scale) {
          sy = inOut(t, e.scaleIn, e.scaleOut, e.scaleInY, 1, e.scaleOutY) * p.scaleRnd;
          sx = e.diffXY ? inOut(t, e.scaleIn, e.scaleOut, e.scaleInX, 1, e.scaleOutX) * p.scaleRnd : sy;
        }
        if (e && e.alpha) a = inOut(t, e.alphaIn, e.alphaOut, e.alphaInValue, e.alphaBase, e.alphaOutValue);
        const [px, py] = (([X, Y]) => [x0 + X * scale, y0 + Y * scale])(rotate(p.pos, b.rot).map((v, i) => v + b.trs[i]));
        const hw = s.size[0] * U * sx * scale, hh = s.size[1] * U * sy * scale;
        // the quad's axes: along the particle's direction (from the emitter's centre, or its velocity), or upright
        let ux = 0, uy = 1;
        if (s.shape === 'direction' || s.shape === 'directionCross') {
          const d = s.dirType === 1 ? rotate(p.pos, b.rot) : s.dirType === 2 ? rotate(p.pos, b.rot).map(v => -v) : rotate(p.vel, b.rot);
          const l = Math.hypot(d[0], d[1]); if (l > 1e-6) { ux = d[0] / l; uy = d[1] / l; }
        }
        if (p.ang) { const c = Math.cos(p.ang), sn = Math.sin(p.ang); [ux, uy] = [ux * c - uy * sn, ux * sn + uy * c]; }
        const vx = -uy, vy = ux;     // across the quad
        // pivot: 0 = the quad hangs back from the particle, 1 = centred, 2 = it reaches forward (outward for a ray)
        const offY = e ? [-1, 0, 1][e.pivot[1]] : 0, offX = e ? [-1, 0, 1][e.pivot[0]] : 0;
        const cx = px + (vx * hw * offX + ux * hh * offY), cy = py + (vy * hw * offX + uy * hh * offY);
        const P = (i, j) => [cx + vx * hw * i + ux * hh * j, cy + vy * hw * i + uy * hh * j];
        // the picture's top row at the quad's far end (for a ray: its bright end at the centre, as on the original)
        out.push({ pts: [P(-1, 1), P(1, 1), P(1, -1), P(-1, -1)], alpha: a * s.prm[3] });
      }
      return out;
    }
    return { step, runTo, quads, get frame() { return frame; }, get count() { return parts.length; }, res };
  }

  /** The texture an emitter draws with, its colours already combined the way the particle asks
   *  (decoded is { w, h, rgba } from the picture decoder). Only the combinations these effects use are covered:
   *  1 = primary x texture, 3 = between the environment colour (dark) and the primary colour (bright). */
  function tinted(decoded, bsp) {
    const { w, h } = decoded, src = decoded.rgba, rgba = new Uint8Array(w * h * 4), P = bsp.prm, E = bsp.env;
    for (let i = 0; i < w * h; i++) {
      const t = src[4 * i] / 255;
      for (let c = 0; c < 3; c++) rgba[4 * i + c] = 255 * (bsp.colorIn === 3 ? E[c] + (P[c] - E[c]) * t : bsp.colorIn === 1 ? P[c] * t : bsp.colorIn === 0 ? t : P[c]);
      rgba[4 * i + 3] = src[4 * i + 3];
    }
    return { w, h, rgba };
  }

  return { parse, emitter, tinted, curve, VERSION };
});
