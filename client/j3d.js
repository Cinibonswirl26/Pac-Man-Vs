/* Reader for the GameCube J3D model formats used by the disc the player supplies:
 * BMD (models: geometry, skeleton, skinning, materials, textures) and BCK (joint animation).
 * It only decodes what the 3D view needs; nothing from the disc is stored anywhere.
 * UMD: window.J3D in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./disc.js'));
  else root.J3D = factory(root.Disc);
})(typeof self !== 'undefined' ? self : this, function (Disc) {
  'use strict';
  const u8 = (b, o) => b[o];
  const u16 = (b, o) => (b[o] << 8) | b[o + 1];
  const s16 = (b, o) => { const v = u16(b, o); return v > 32767 ? v - 65536 : v; };
  const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const dvOf = b => new DataView(b.buffer, b.byteOffset, b.byteLength);
  const f32 = (b, o) => dvOf(b).getFloat32(o, false);
  const cstr = (b, o) => { let s = ''; while (b[o]) s += String.fromCharCode(b[o++]); return s; };
  const tag = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);

  function chunks(b) {
    const out = {}; let o = 0x20;
    for (let i = 0, n = u32(b, 0x0C); i < n && o + 8 <= b.length; i++) { out[tag(b, o)] = o; o += u32(b, o + 4); }
    return out;
  }
  function nameTable(b, o) {
    const n = u16(b, o), out = [];
    for (let i = 0; i < n; i++) out.push(cstr(b, o + u16(b, o + 4 + i * 4 + 2)));
    return out;
  }

  // ---------------------------------------------------------------- 3x4 matrices (row-major, [r0c0 r0c1 r0c2 r0c3 r1c0 ...])
  const M = {
    ident: () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0],
    mul(a, b) {   // a * b
      const o = new Array(12);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
        o[r * 4 + c] = a[r * 4] * b[c] + a[r * 4 + 1] * b[4 + c] + a[r * 4 + 2] * b[8 + c] + (c === 3 ? a[r * 4 + 3] : 0);
      }
      return o;
    },
    /** Scale, then rotate X, Y, Z (radians), then translate: how J3D composes a joint. */
    srt(sx, sy, sz, rx, ry, rz, tx, ty, tz) {
      const cx = Math.cos(rx), sx_ = Math.sin(rx), cy = Math.cos(ry), sy_ = Math.sin(ry), cz = Math.cos(rz), sz_ = Math.sin(rz);
      return [
        cy * cz * sx, (sx_ * sy_ * cz - cx * sz_) * sy, (cx * sy_ * cz + sx_ * sz_) * sz, tx,
        cy * sz_ * sx, (sx_ * sy_ * sz_ + cx * cz) * sy, (cx * sy_ * sz_ - sx_ * cz) * sz, ty,
        -sy_ * sx, sx_ * cy * sy, cx * cy * sz, tz
      ];
    },
    apply(m, x, y, z, out, o) {
      out[o] = m[0] * x + m[1] * y + m[2] * z + m[3];
      out[o + 1] = m[4] * x + m[5] * y + m[6] * z + m[7];
      out[o + 2] = m[8] * x + m[9] * y + m[10] * z + m[11];
    },
    applyDir(m, x, y, z, out, o) {
      out[o] = m[0] * x + m[1] * y + m[2] * z;
      out[o + 1] = m[4] * x + m[5] * y + m[6] * z;
      out[o + 2] = m[8] * x + m[9] * y + m[10] * z;
    }
  };

  // ---------------------------------------------------------------- sections
  function readINF1(b, o) {
    const hier = o + u32(b, o + 0x14), nodes = [];
    for (let p = hier; ; p += 4) {
      const t = u16(b, p), v = u16(b, p + 2);
      if (t === 0) break;
      nodes.push([t, v]);
    }
    return { mtxMode: u16(b, o + 8) & 0x0F, vertexCount: u32(b, o + 0x10), nodes };
  }
  // GX vertex array: attribute -> {data: Float32Array, n: components}
  function readVTX1(b, o) {
    const fmtOff = o + u32(b, o + 8), size = u32(b, o + 4);
    const offs = []; for (let i = 0; i < 13; i++) offs.push(u32(b, o + 0x0C + i * 4));
    const slot = a => a === 9 ? 0 : a === 10 ? 1 : a === 11 ? 3 : a === 12 ? 4 : a >= 13 && a <= 20 ? 5 + (a - 13) : -1;
    const arrays = {};
    for (let p = fmtOff; ; p += 16) {
      const attr = u32(b, p); if (attr === 0xFF) break;
      const cnt = u32(b, p + 4), type = u32(b, p + 8), frac = u8(b, p + 12), s = slot(attr);
      if (s < 0 || !offs[s]) continue;
      const start = o + offs[s];
      let end = o + size; for (const x of offs) if (x > offs[s] && o + x < end) end = o + x;
      if (attr === 11 || attr === 12) {   // colours -> RGBA 0..1
        const sz = [2, 3, 4, 2, 3, 4][type], n = Math.floor((end - start) / sz), d = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) {
          const q = start + i * sz; let r, g, bl, a = 255;
          if (type === 0) { const v = u16(b, q); r = (v >> 11) * 255 / 31; g = ((v >> 5) & 63) * 255 / 63; bl = (v & 31) * 255 / 31; }
          else if (type === 1 || type === 2) { r = b[q]; g = b[q + 1]; bl = b[q + 2]; }
          else if (type === 3) { const v = u16(b, q); r = (v >> 12) * 17; g = ((v >> 8) & 15) * 17; bl = ((v >> 4) & 15) * 17; a = (v & 15) * 17; }
          else if (type === 4) { const v = (b[q] << 16) | (b[q + 1] << 8) | b[q + 2]; r = (v >> 18) * 255 / 63; g = ((v >> 12) & 63) * 255 / 63; bl = ((v >> 6) & 63) * 255 / 63; a = (v & 63) * 255 / 63; }
          else { r = b[q]; g = b[q + 1]; bl = b[q + 2]; a = b[q + 3]; }
          d[i * 4] = r / 255; d[i * 4 + 1] = g / 255; d[i * 4 + 2] = bl / 255; d[i * 4 + 3] = a / 255;
        }
        arrays[attr] = { data: d, n: 4 };
        continue;
      }
      const n = attr === 9 ? (cnt ? 3 : 2) : attr === 10 ? 3 : (cnt ? 2 : 1);
      const csz = [1, 1, 2, 2, 4][type], count = Math.floor((end - start) / (csz * n)), d = new Float32Array(count * n);
      const scale = type === 4 ? 1 : 1 / (1 << frac), dv = dvOf(b);
      for (let i = 0; i < count * n; i++) {
        const q = start + i * csz;
        d[i] = (type === 0 ? b[q] : type === 1 ? (b[q] << 24 >> 24) : type === 2 ? u16(b, q) : type === 3 ? s16(b, q) : dv.getFloat32(q, false)) * scale;
      }
      arrays[attr] = { data: d, n };
    }
    return arrays;
  }
  function readEVP1(b, o) {
    const n = u16(b, o + 8), envs = [];
    if (!n) return { envs, invBind: [] };
    const cntOff = o + u32(b, o + 0x0C), idxOff = o + u32(b, o + 0x10), wOff = o + u32(b, o + 0x14), mOff = o + u32(b, o + 0x18);
    let k = 0, maxJ = -1;
    for (let i = 0; i < n; i++) {
      const c = b[cntOff + i], e = [];
      for (let j = 0; j < c; j++, k++) { const jt = u16(b, idxOff + k * 2); maxJ = Math.max(maxJ, jt); e.push({ joint: jt, w: f32(b, wOff + k * 4) }); }
      envs.push(e);
    }
    const invBind = [];
    for (let j = 0; j <= maxJ; j++) { const m = []; for (let i = 0; i < 12; i++) m.push(f32(b, mOff + j * 48 + i * 4)); invBind.push(m); }
    return { envs, invBind };
  }
  function readDRW1(b, o) {
    const n = u16(b, o + 8), wOff = o + u32(b, o + 0x0C), dOff = o + u32(b, o + 0x10), out = [];
    for (let i = 0; i < n; i++) out.push({ weighted: !!b[wOff + i], index: u16(b, dOff + i * 2) });
    return out;
  }
  function readJNT1(b, o) {
    const n = u16(b, o + 8), eOff = o + u32(b, o + 0x0C), rOff = o + u32(b, o + 0x10), names = nameTable(b, o + u32(b, o + 0x14));
    const out = [];
    for (let i = 0; i < n; i++) {
      const e = eOff + u16(b, rOff + i * 2) * 0x40, R = Math.PI / 32768;
      out.push({
        name: names[i] || 'joint' + i, parent: -1, compensate: b[e + 2] === 1,
        s: [f32(b, e + 4), f32(b, e + 8), f32(b, e + 12)],
        r: [s16(b, e + 16) * R, s16(b, e + 18) * R, s16(b, e + 20) * R],
        t: [f32(b, e + 24), f32(b, e + 28), f32(b, e + 32)]
      });
    }
    return out;
  }
  // Display lists -> one triangle list per shape, each vertex tagged with its DRW1 matrix slot.
  function readSHP1(b, o, vtx) {
    const n = u16(b, o + 8), shapeTab = o + u32(b, o + 0x0C), remap = o + u32(b, o + 0x10), attrTab = o + u32(b, o + 0x18);
    const mtxTab = o + u32(b, o + 0x1C), dlOff = o + u32(b, o + 0x20), mtxData = o + u32(b, o + 0x24), pktTab = o + u32(b, o + 0x28);
    const shapes = [];
    for (let si = 0; si < n; si++) {
      const so = shapeTab + u16(b, remap + si * 2) * 0x28;
      const mtxType = b[so], pktCount = u16(b, so + 2), aOff = u16(b, so + 4), firstMd = u16(b, so + 6), firstPkt = u16(b, so + 8);
      const desc = [];
      for (let p = attrTab + aOff; ; p += 8) { const at = u32(b, p), fm = u32(b, p + 4); if (at === 0xFF) break; desc.push([at, fm]); }
      const has = a => desc.some(d => d[0] === a && d[1]);
      const pos = [], nrm = [], clr = [], uv = [], drw = [];
      let slots = [];
      for (let k = 0; k < pktCount; k++) {
        const md = mtxData + (firstMd + k) * 8, mc = u16(b, md + 2), mf = u32(b, md + 4);
        const next = slots.slice();
        for (let i = 0; i < mc; i++) { const v = u16(b, mtxTab + (mf + i) * 2); if (v !== 0xFFFF) next[i] = v; }
        slots = next;
        const pk = pktTab + (firstPkt + k) * 8, end = dlOff + u32(b, pk + 4) + u32(b, pk);
        let q = dlOff + u32(b, pk + 4);
        while (q < end) {
          const op = b[q++] & 0xF8;
          if (op === 0) continue;
          if (op < 0x80 || op > 0xB8) break;
          const vc = u16(b, q); q += 2;
          const vs = [];
          for (let v = 0; v < vc; v++) {
            const vert = { pm: 0 };
            for (const [at, fm] of desc) {
              if (!fm) continue;
              let val;
              if (fm === 1) val = b[q++];          // direct: only matrix indices are direct in these files
              else if (fm === 2) val = b[q++];
              else { val = u16(b, q); q += 2; }
              if (at === 0) vert.pm = val / 3;
              else if (at >= 9) vert[at] = val;
            }
            vs.push(vert);
          }
          const tri = [];
          if (op === 0x90) for (let i = 0; i + 2 < vc; i += 3) tri.push(vs[i], vs[i + 1], vs[i + 2]);
          else if (op === 0x98) for (let i = 0; i + 2 < vc; i++) { if (i & 1) tri.push(vs[i + 1], vs[i], vs[i + 2]); else tri.push(vs[i], vs[i + 1], vs[i + 2]); }
          else if (op === 0xA0) for (let i = 1; i + 1 < vc; i++) tri.push(vs[0], vs[i], vs[i + 1]);
          else if (op === 0x80) for (let i = 0; i + 3 < vc; i += 4) tri.push(vs[i], vs[i + 1], vs[i + 2], vs[i], vs[i + 2], vs[i + 3]);
          else continue;   // lines and points are not drawn
          for (const v of tri) {
            const pa = vtx[9], pi = v[9] * pa.n;
            pos.push(pa.data[pi], pa.data[pi + 1], pa.n === 3 ? pa.data[pi + 2] : 0);
            if (vtx[10] && v[10] !== undefined) { const ni = v[10] * 3; nrm.push(vtx[10].data[ni], vtx[10].data[ni + 1], vtx[10].data[ni + 2]); } else nrm.push(0, 1, 0);
            if (vtx[11] && v[11] !== undefined) { const ci = v[11] * 4; clr.push(vtx[11].data[ci], vtx[11].data[ci + 1], vtx[11].data[ci + 2], vtx[11].data[ci + 3]); } else clr.push(1, 1, 1, 1);
            if (vtx[13] && v[13] !== undefined) { const ti = v[13] * vtx[13].n; uv.push(vtx[13].data[ti], vtx[13].n > 1 ? vtx[13].data[ti + 1] : 0); } else uv.push(0, 0);
            drw.push(slots[v.pm] !== undefined ? slots[v.pm] : slots[0] || 0);
          }
        }
      }
      shapes.push({ mtxType, hasNormals: has(10), hasColors: has(11), hasUV: has(13), pos: new Float32Array(pos), nrm: new Float32Array(nrm), clr: new Float32Array(clr), uv: new Float32Array(uv), drw: new Uint16Array(drw) });
    }
    return shapes;
  }
  function readTEX1(b, o) {
    const n = u16(b, o + 8), hOff = o + u32(b, o + 0x0C), names = u32(b, o + 0x10) ? nameTable(b, o + u32(b, o + 0x10)) : [], out = [];
    for (let i = 0; i < n; i++) {
      const h = hOff + i * 0x20;
      let t;
      try { t = Disc.decodeBTI(b, h); } catch (e) { t = { w: 1, h: 1, rgba: new Uint8Array([255, 0, 255, 255]), fmt: -1 }; }
      t.name = names[i] || 'tex' + i;
      t.wrapS = b[h + 6]; t.wrapT = b[h + 7];   // 0 clamp, 1 repeat, 2 mirror
      t.minFilter = b[h + 0x14]; t.magFilter = b[h + 0x15];
      out.push(t);
    }
    return out;
  }
  // Materials: the parts of MAT3 that decide what a surface looks like.
  function readMAT3(b, o) {
    const n = u16(b, o + 8), eOff = o + u32(b, o + 0x0C), remap = o + u32(b, o + 0x10), names = nameTable(b, o + u32(b, o + 0x14));
    const T = k => o + u32(b, o + k);
    const color8 = p => [b[p] / 255, b[p + 1] / 255, b[p + 2] / 255, b[p + 3] / 255];
    const colorS16 = p => [s16(b, p) / 255, s16(b, p + 2) / 255, s16(b, p + 4) / 255, s16(b, p + 6) / 255];
    const idx = (p, i) => u16(b, p + i * 2);
    const out = [];
    for (let i = 0; i < n; i++) {
      const e = eOff + u16(b, remap + i * 2) * 0x14C;
      const opt = (tab, ix, size, fn) => (ix === 0xFFFF ? null : fn(T(tab) + ix * size));
      const m = { name: names[i] || 'mat' + i, mode: b[e] };
      m.cull = u32(b, T(0x1C) + b[e + 1] * 4);              // 0 none, 1 front, 2 back, 3 all
      m.matColor = [opt(0x20, idx(e + 8, 0), 4, color8), opt(0x20, idx(e + 8, 1), 4, color8)];
      m.ambColor = [opt(0x2C, idx(e + 0x14, 0), 4, color8), opt(0x2C, idx(e + 0x14, 1), 4, color8)];
      m.chanNum = b[T(0x24) + b[e + 2]];
      m.chans = [];
      for (let c = 0; c < 4; c++) m.chans.push(opt(0x28, idx(e + 0x0C, c), 8, p => ({ lighting: !!b[p], matSrc: b[p + 1], litMask: b[p + 2], diffuse: b[p + 3], atten: b[p + 4], ambSrc: b[p + 5] })));
      m.texGenNum = b[T(0x34) + b[e + 3]];
      m.texGens = [];
      for (let k = 0; k < 8; k++) m.texGens.push(opt(0x38, idx(e + 0x28, k), 4, p => ({ type: b[p], src: b[p + 1], mtx: b[p + 2] })));
      m.texMtx = [];
      for (let k = 0; k < 10; k++) m.texMtx.push(opt(0x40, idx(e + 0x48, k), 0x64, p => ({ type: b[p], info: b[p + 1], center: [f32(b, p + 4), f32(b, p + 8), f32(b, p + 12)], s: [f32(b, p + 16), f32(b, p + 20)], r: s16(b, p + 24) * Math.PI / 32768, t: [f32(b, p + 28), f32(b, p + 32)] })));
      m.textures = [];
      for (let k = 0; k < 8; k++) { const ti = idx(e + 0x84, k); m.textures.push(ti === 0xFFFF ? -1 : u16(b, T(0x48) + ti * 2)); }
      m.kColors = [];
      for (let k = 0; k < 4; k++) m.kColors.push(opt(0x54, idx(e + 0x94, k), 4, color8) || [1, 1, 1, 1]);
      m.kColorSel = []; m.kAlphaSel = [];
      for (let k = 0; k < 16; k++) { m.kColorSel.push(b[e + 0x9C + k]); m.kAlphaSel.push(b[e + 0xAC + k]); }
      m.tevColors = [];
      for (let k = 0; k < 4; k++) m.tevColors.push(opt(0x50, idx(e + 0xDC, k), 8, colorS16) || [0, 0, 0, 0]);
      m.tevStageNum = b[T(0x58) + b[e + 4]];
      m.stages = [];
      for (let k = 0; k < m.tevStageNum; k++) {
        const ord = opt(0x4C, idx(e + 0xBC, k), 4, p => ({ texCoord: b[p], texMap: b[p + 1], chan: b[p + 2] }));
        const st = opt(0x5C, idx(e + 0xE4, k), 20, p => ({
          color: { a: b[p + 1], b: b[p + 2], c: b[p + 3], d: b[p + 4], op: b[p + 5], bias: b[p + 6], scale: b[p + 7], clamp: b[p + 8], reg: b[p + 9] },
          alpha: { a: b[p + 10], b: b[p + 11], c: b[p + 12], d: b[p + 13], op: b[p + 14], bias: b[p + 15], scale: b[p + 16], clamp: b[p + 17], reg: b[p + 18] }
        }));
        const sw = opt(0x60, idx(e + 0x104, k), 4, p => ({ ras: b[p], tex: b[p + 1] }));
        m.stages.push({ order: ord, op: st, swap: sw || { ras: 0, tex: 0 }, kc: m.kColorSel[k], ka: m.kAlphaSel[k] });
      }
      m.swapTables = [];
      for (let k = 0; k < 4; k++) m.swapTables.push(opt(0x64, idx(e + 0x124, k), 4, p => [b[p], b[p + 1], b[p + 2], b[p + 3]]) || [0, 1, 2, 3]);
      m.alphaComp = opt(0x6C, u16(b, e + 0x146), 8, p => ({ comp0: b[p], ref0: b[p + 1] / 255, op: b[p + 2], comp1: b[p + 3], ref1: b[p + 4] / 255 }));
      m.blend = opt(0x70, u16(b, e + 0x148), 4, p => ({ type: b[p], src: b[p + 1], dst: b[p + 2], logic: b[p + 3] }));
      m.zMode = opt(0x74, b[e + 6], 4, p => ({ enable: !!b[p], func: b[p + 1], write: !!b[p + 2] }));
      out.push(m);
    }
    return out;
  }

  /** Parse a BMD/BDL file into geometry, skeleton, materials and decoded textures. */
  function parseBMD(b) {
    if (tag(b, 0) !== 'J3D2') throw new Error('not a J3D model');
    const c = chunks(b);
    const vtx = readVTX1(b, c.VTX1);
    const model = {
      inf: readINF1(b, c.INF1),
      joints: c.JNT1 ? readJNT1(b, c.JNT1) : [],
      evp: c.EVP1 ? readEVP1(b, c.EVP1) : { envs: [], invBind: [] },
      drw: c.DRW1 ? readDRW1(b, c.DRW1) : [],
      shapes: readSHP1(b, c.SHP1, vtx),
      materials: c.MAT3 ? readMAT3(b, c.MAT3) : [],
      textures: c.TEX1 ? readTEX1(b, c.TEX1) : []
    };
    // Walk the scene graph: parent joints, and which material each shape is drawn with.
    model.draws = [];
    const stack = []; let lastJoint = -1, lastMat = 0;
    for (const [t, v] of model.inf.nodes) {
      if (t === 1) stack.push(lastJoint);
      else if (t === 2) stack.pop();
      else if (t === 0x10) { if (model.joints[v]) model.joints[v].parent = stack.length ? stack[stack.length - 1] : -1; lastJoint = v; }
      else if (t === 0x11) lastMat = v;
      else if (t === 0x12) model.draws.push({ shape: v, material: lastMat, joint: lastJoint });
    }
    // Bounding box of the bind pose.
    const p = pose(model), bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
    for (const s of p) for (let i = 0; i < s.pos.length; i += 3) for (let k = 0; k < 3; k++) { bb[k] = Math.min(bb[k], s.pos[i + k]); bb[k + 3] = Math.max(bb[k + 3], s.pos[i + k]); }
    model.bbox = bb;
    return model;
  }

  /** Joint world matrices for a set of local transforms (defaults to the bind pose). */
  function jointMatrices(model, local) {
    const out = [], maya = model.inf.mtxMode === 2;
    const loc = i => (local && local[i]) || model.joints[i];
    model.joints.forEach((j, i) => {
      const l = loc(i);
      const m = M.srt(l.s[0], l.s[1], l.s[2], l.r[0], l.r[1], l.r[2], l.t[0], l.t[1], l.t[2]);
      if (maya && j.compensate && j.parent >= 0) {   // Maya segment scale compensation: undo the parent's own scale
        const ps = loc(j.parent).s;
        for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) m[r * 4 + c] /= ps[r] || 1;
      }
      out.push(j.parent >= 0 ? M.mul(out[j.parent], m) : m);
    });
    return out;
  }
  /** Skin every shape: returns [{pos, nrm}] in model space for the given joint pose. */
  function pose(model, local) {
    const jm = model.joints.length ? jointMatrices(model, local) : [M.ident()];
    const dm = model.drw.map(d => {
      if (!d.weighted) return jm[d.index] || M.ident();
      const acc = new Array(12).fill(0);
      for (const { joint, w } of model.evp.envs[d.index] || []) {
        const m = M.mul(jm[joint], model.evp.invBind[joint]);
        for (let i = 0; i < 12; i++) acc[i] += m[i] * w;
      }
      return acc;
    });
    if (!dm.length) dm.push(jm[0]);
    return model.shapes.map(s => {
      const pos = new Float32Array(s.pos.length), nrm = new Float32Array(s.nrm.length);
      for (let v = 0, n = s.drw.length; v < n; v++) {
        const m = dm[s.drw[v]] || dm[0], i = v * 3;
        M.apply(m, s.pos[i], s.pos[i + 1], s.pos[i + 2], pos, i);
        M.applyDir(m, s.nrm[i], s.nrm[i + 1], s.nrm[i + 2], nrm, i);
        const l = Math.hypot(nrm[i], nrm[i + 1], nrm[i + 2]) || 1; nrm[i] /= l; nrm[i + 1] /= l; nrm[i + 2] /= l;
      }
      return { pos, nrm };
    });
  }

  // ---------------------------------------------------------------- BCK joint animation
  function parseBCK(b) {
    if (tag(b, 0) !== 'J3D1' || tag(b, 4) !== 'bck1') throw new Error('not a BCK animation');
    const o = 0x20;
    const loop = b[o + 8], angleMul = b[o + 9], length = u16(b, o + 0x0A), nJoints = u16(b, o + 0x0C);
    const jOff = o + u32(b, o + 0x14), sOff = o + u32(b, o + 0x18), rOff = o + u32(b, o + 0x1C), tOff = o + u32(b, o + 0x20);
    const rScale = (1 << angleMul) * Math.PI / 32768;
    const track = (p, tab, size, rd, scale) => {
      const count = u16(b, p), index = u16(b, p + 2), tt = u16(b, p + 4);
      const val = i => rd(tab + (index + i) * size) * scale;
      if (count === 1) return { keys: [[0, val(0), 0, 0]] };
      const stride = tt === 0 ? 3 : 4, keys = [];
      for (let k = 0; k < count; k++) { const q = k * stride; keys.push([val(q) / scale, val(q + 1), val(q + 2), stride === 4 ? val(q + 3) : val(q + 2)]); }
      return { keys };
    };
    const joints = [];
    for (let j = 0; j < nJoints; j++) {
      const e = jOff + j * 54, ax = [];
      for (let a = 0; a < 3; a++) {
        const q = e + a * 18;
        ax.push({
          s: track(q, sOff, 4, p => f32(b, p), 1),
          r: track(q + 6, rOff, 2, p => s16(b, p), rScale),
          t: track(q + 12, tOff, 4, p => f32(b, p), 1)
        });
      }
      joints.push(ax);
    }
    return { loop, length, joints };
  }
  function sample(tr, t) {
    const k = tr.keys;
    if (k.length === 1 || t <= k[0][0]) return k[0][1];
    if (t >= k[k.length - 1][0]) return k[k.length - 1][1];
    let i = 0; while (i + 1 < k.length && k[i + 1][0] <= t) i++;
    const a = k[i], c = k[i + 1], len = c[0] - a[0], u = (t - a[0]) / len;
    const u2 = u * u, u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * a[1] + (u3 - 2 * u2 + u) * a[3] * len + (-2 * u3 + 3 * u2) * c[1] + (u3 - u2) * c[2] * len;
  }
  /** Local joint transforms of an animation at frame t (wraps when the animation loops). */
  function animate(anim, t) {
    const L = anim.length || 1;
    const f = anim.loop === 2 || anim.loop === 0 ? ((t % L) + L) % L : Math.min(t, L);
    return anim.joints.map(ax => ({
      s: [sample(ax[0].s, f), sample(ax[1].s, f), sample(ax[2].s, f)],
      r: [sample(ax[0].r, f), sample(ax[1].r, f), sample(ax[2].r, f)],
      t: [sample(ax[0].t, f), sample(ax[1].t, f), sample(ax[2].t, f)]
    }));
  }

  // ---------------------------------------------------------------- BTK texture-matrix animation
  function parseBTK(b) {
    if (tag(b, 0) !== 'J3D1' || tag(b, 4) !== 'btk1') throw new Error('not a BTK animation');
    const o = 0x20;
    const loop = b[o + 8], angleMul = b[o + 9], length = u16(b, o + 0x0A), n = u16(b, o + 0x0C) / 3;
    const aOff = o + u32(b, o + 0x14), names = nameTable(b, o + u32(b, o + 0x1C)), idxOff = o + u32(b, o + 0x20), cOff = o + u32(b, o + 0x24);
    const sOff = o + u32(b, o + 0x28), rOff = o + u32(b, o + 0x2C), tOff = o + u32(b, o + 0x30);
    const rScale = (1 << angleMul) * Math.PI / 32768;
    const track = (p, tab, size, rd, scale) => {
      const count = u16(b, p), index = u16(b, p + 2), tt = u16(b, p + 4);
      const val = i => rd(tab + (index + i) * size) * scale;
      if (count === 1) return { keys: [[0, val(0), 0, 0]] };
      const stride = tt === 0 ? 3 : 4, keys = [];
      for (let k = 0; k < count; k++) { const q = k * stride; keys.push([rd(tab + (index + q) * size), val(q + 1), val(q + 2), stride === 4 ? val(q + 3) : val(q + 2)]); }
      return { keys };
    };
    const anims = [];
    for (let i = 0; i < n; i++) {
      const e = aOff + i * 54, ax = [];
      for (let a = 0; a < 3; a++) {
        const q = e + a * 18;
        ax.push({ s: track(q, sOff, 4, p => f32(b, p), 1), r: track(q + 6, rOff, 2, p => s16(b, p), rScale), t: track(q + 12, tOff, 4, p => f32(b, p), 1) });
      }
      anims.push({ material: names[i], texMtx: b[idxOff + i], center: [f32(b, cOff + i * 12), f32(b, cOff + i * 12 + 4), f32(b, cOff + i * 12 + 8)], ax });
    }
    return { loop, length, anims };
  }
  /** Texture matrix values of a BTK at frame t, as {materialName: {texMtxIndex: {s, r, t, center}}}. */
  function animateTex(anim, t) {
    const L = anim.length || 1, f = ((t % L) + L) % L, out = {};
    for (const a of anim.anims) {
      const [u, v, w] = a.ax;
      (out[a.material] = out[a.material] || {})[a.texMtx] = {
        center: a.center, s: [sample(u.s, f), sample(v.s, f)], r: sample(w.r, f), t: [sample(u.t, f), sample(v.t, f)]
      };
    }
    return out;
  }

  return { parseBMD, parseBCK, parseBTK, pose, animate, animateTex, jointMatrices, M, chunks };
});
