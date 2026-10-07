/* Reader for the GameCube J2D screen formats on the player's disc: BLO2 screen layouts (panes,
 * pictures, windows, text boxes and their materials) and BFN bitmap fonts.
 * Materials come out in the same shape as J3D materials so gx.js can draw them.
 * UMD: window.J2D in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./disc.js'));
  else root.J2D = factory(root.Disc);
})(typeof self !== 'undefined' ? self : this, function (Disc) {
  'use strict';
  const u16 = (b, o) => (b[o] << 8) | b[o + 1];
  const s16 = (b, o) => { const v = u16(b, o); return v > 32767 ? v - 65536 : v; };
  const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const f32 = (b, o) => new DataView(b.buffer, b.byteOffset, b.byteLength).getFloat32(o, false);
  const tag = (b, o) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
  const cstr = (b, o) => { let s = ''; while (b[o]) s += String.fromCharCode(b[o++]); return s; };
  const rgba8 = (b, p) => [b[p] / 255, b[p + 1] / 255, b[p + 2] / 255, b[p + 3] / 255];

  // Resource name lists (TEX1, FNT1): u16 count, then u16 offsets to {u8 type, u8 length, chars}.
  function resList(b, o) {
    const t = o + u32(b, o + 0x0C), n = u16(b, t), out = [];
    for (let i = 0; i < n; i++) { const e = t + u16(b, t + 2 + i * 2), len = b[e + 1]; let s = ''; for (let k = 0; k < len; k++) s += String.fromCharCode(b[e + 2 + k]); out.push(s); }
    return out;
  }
  function names(b, o) {
    const n = u16(b, o), out = [];
    for (let i = 0; i < n; i++) out.push(cstr(b, o + u16(b, o + 4 + i * 4 + 2)));
    return out;
  }

  // MAT1: J2D materials, converted to the J3D material shape used by gx.js.
  function readMAT1(b, o, texNames) {
    const n = u16(b, o + 8), T = k => o + u32(b, o + k), has = k => u32(b, o + k) !== 0;
    const mnames = has(0x14) ? names(b, T(0x14)) : [];
    const out = [];
    for (let i = 0; i < n; i++) {
      const e = T(0x0C) + u16(b, T(0x10) + i * 2) * 0xE8;
      const idx = (p, k) => u16(b, p + k * 2);
      const opt = (tab, ix, size, fn) => (ix === 0xFFFF || ix === 0xFF || !has(tab) ? null : fn(T(tab) + ix * size));
      const m = { name: mnames[i] || 'mat' + i, mode: b[e] };
      m.cull = 0;   // 2D quads are drawn from either side
      m.matColor = [opt(0x20, idx(e + 8, 0), 4, p => rgba8(b, p)) || [1, 1, 1, 1], opt(0x20, idx(e + 8, 1), 4, p => rgba8(b, p)) || [1, 1, 1, 1]];
      m.ambColor = [[0, 0, 0, 0], [0, 0, 0, 0]];
      m.chanNum = opt(0x24, b[e + 2], 1, p => b[p]) || 0;
      // J2D colour channels: the raster colour is the vertex colour (a picture's corner colours) unless the
      // channel says to use the material colour register.
      m.chans = [];
      for (let c = 0; c < 4; c++) m.chans.push(opt(0x28, idx(e + 0x0C, c), 4, p => ({ lighting: false, matSrc: b[p + 1] & 1, litMask: 0, diffuse: 0, atten: 0, ambSrc: 0 })) || { lighting: false, matSrc: 1 });
      m.texGenNum = opt(0x2C, b[e + 3], 1, p => b[p]) || 0;
      m.texGens = [];
      for (let k = 0; k < 8; k++) m.texGens.push(opt(0x30, idx(e + 0x14, k), 4, p => ({ type: b[p], src: b[p + 1], mtx: b[p + 2] })));
      m.texMtx = [];
      for (let k = 0; k < 10; k++) m.texMtx.push(opt(0x34, idx(e + 0x24, k), 36, p => ({ type: b[p], info: b[p + 1], center: [f32(b, p + 4), f32(b, p + 8), f32(b, p + 12)], s: [f32(b, p + 16), f32(b, p + 20)], r: s16(b, p + 24) * Math.PI / 32768, t: [f32(b, p + 28), f32(b, p + 32)] })));
      m.textures = []; m.textureNames = [];
      for (let k = 0; k < 8; k++) {
        const ti = idx(e + 0x38, k), no = ti === 0xFFFF ? -1 : u16(b, T(0x38) + ti * 2);
        m.textures.push(no); m.textureNames.push(no >= 0 ? texNames[no] : null);
      }
      m.kColors = [];
      for (let k = 0; k < 4; k++) m.kColors.push(opt(0x48, idx(e + 0x4A, k), 4, p => rgba8(b, p)) || [1, 1, 1, 1]);
      m.kColorSel = []; m.kAlphaSel = [];
      for (let k = 0; k < 16; k++) { m.kColorSel.push(b[e + 0x52 + k]); m.kAlphaSel.push(b[e + 0x62 + k]); }
      m.tevColors = [];
      for (let k = 0; k < 4; k++) m.tevColors.push(opt(0x44, idx(e + 0x92, k), 8, p => [s16(b, p) / 255, s16(b, p + 2) / 255, s16(b, p + 4) / 255, s16(b, p + 6) / 255]) || [0, 0, 0, 0]);
      m.tevStageNum = opt(0x4C, b[e + 4], 1, p => b[p]) || 0;
      m.stages = [];
      for (let k = 0; k < m.tevStageNum; k++) {
        const ord = opt(0x40, idx(e + 0x72, k), 4, p => ({ texCoord: b[p], texMap: b[p + 1], chan: b[p + 2] }));
        const st = opt(0x50, idx(e + 0x9A, k), 20, p => ({
          color: { a: b[p + 1], b: b[p + 2], c: b[p + 3], d: b[p + 4], op: b[p + 5], bias: b[p + 6], scale: b[p + 7], clamp: b[p + 8], reg: b[p + 9] },
          alpha: { a: b[p + 10], b: b[p + 11], c: b[p + 12], d: b[p + 13], op: b[p + 14], bias: b[p + 15], scale: b[p + 16], clamp: b[p + 17], reg: b[p + 18] }
        }));
        const sw = opt(0x54, idx(e + 0xBA, k), 4, p => ({ ras: b[p], tex: b[p + 1] }));
        m.stages.push({ order: ord, op: st, swap: sw || { ras: 0, tex: 0 }, kc: m.kColorSel[k], ka: m.kAlphaSel[k] });
      }
      m.swapTables = [];
      for (let k = 0; k < 4; k++) m.swapTables.push(opt(0x58, idx(e + 0xDA, k), 4, p => [b[p], b[p + 1], b[p + 2], b[p + 3]]) || [0, 1, 2, 3]);
      m.alphaComp = opt(0x5C, u16(b, e + 0xE2), 8, p => ({ comp0: b[p], ref0: b[p + 1] / 255, op: b[p + 2], comp1: b[p + 3], ref1: b[p + 4] / 255 }));
      m.blend = opt(0x60, u16(b, e + 0xE4), 4, p => ({ type: b[p], src: b[p + 1], dst: b[p + 2], logic: b[p + 3] })) || { type: 1, src: 4, dst: 5 };
      m.zMode = { enable: false, func: 7, write: false };
      out.push(m);
    }
    return out;
  }

  // Pane block shared by every pane kind (64 bytes).
  function readPane(b, p, kind) {
    const raw = b.subarray(p + 8, p + 16); let name = '';
    for (const c of raw) if (c) name += String.fromCharCode(c);
    return {
      kind, id: u16(b, p + 2), visible: !!b[p + 4], anchor: b[p + 5], name,
      w: f32(b, p + 0x18), h: f32(b, p + 0x1C), sx: f32(b, p + 0x20), sy: f32(b, p + 0x24),
      rx: f32(b, p + 0x28), ry: f32(b, p + 0x2C), rz: f32(b, p + 0x30), x: f32(b, p + 0x34), y: f32(b, p + 0x38),
      alpha: 1, children: []
    };
  }
  const corners = (b, p) => [0, 1, 2, 3].map(k => rgba8(b, p + k * 4));

  /** Parse a BLO2 screen: {w, h, textures, fonts, materials, root, byName}. */
  function parseBLO(b) {
    if (tag(b, 0) !== 'SCRN' || tag(b, 4) !== 'blo2') throw new Error('not a BLO2 screen');
    const scr = { w: 0, h: 0, textures: [], fonts: [], materials: [], root: null, byName: {} };
    const stack = []; let last = null;
    const add = pane => {
      if (!scr.root) scr.root = pane;
      else (stack.length ? stack[stack.length - 1] : scr.root).children.push(pane);
      if (pane.name) scr.byName[pane.name] = pane;
      last = pane;
    };
    let o = 0x20;
    for (let i = 0, n = u32(b, 0x0C); i < n && o + 8 <= b.length; i++) {
      const t = tag(b, o), size = u32(b, o + 4);
      if (t === 'INF1') { scr.w = u16(b, o + 8); scr.h = u16(b, o + 10); }
      else if (t === 'TEX1') scr.textures = resList(b, o);
      else if (t === 'FNT1') scr.fonts = resList(b, o);
      else if (t === 'MAT1') scr.materials = readMAT1(b, o, scr.textures);
      else if (t === 'BGN1') stack.push(last);
      else if (t === 'END1') stack.pop();
      else if (t === 'EXT1') break;
      else if (t === 'PAN2') add(readPane(b, o + 8, 'pane'));
      else if (t === 'PIC2') {
        const pane = readPane(b, o + 16, 'picture'), d = o + 16 + u16(b, o + 16);
        pane.material = u16(b, d + 4);
        pane.uv = [0, 1, 2, 3].map(k => [s16(b, d + 0x10 + k * 4) / 256, s16(b, d + 0x12 + k * 4) / 256]);
        pane.colors = corners(b, d + 0x20);
        add(pane);
      } else if (t === 'WIN2') {
        const pane = readPane(b, o + 16, 'window'), d = o + 16 + u16(b, o + 16);
        pane.frameMaterials = [0, 1, 2, 3].map(k => u16(b, d + 0x10 + k * 2));
        pane.frameFlags = b[d + 0x18];
        pane.content = { x: s16(b, d + 0x1A), y: s16(b, d + 0x1C), w: s16(b, d + 0x1E), h: s16(b, d + 0x20) };
        pane.material = u16(b, d + 0x24);
        pane.colors = corners(b, d + 0x30);
        add(pane);
      } else if (t === 'TBX2') {
        const pane = readPane(b, o + 16, 'text'), d = o + 16 + u16(b, o + 16);
        pane.material = u16(b, d + 4);
        pane.font = u16(b, d + 2);
        pane.charSpace = s16(b, d + 6); pane.lineSpace = s16(b, d + 8);
        pane.fontW = u16(b, d + 0x0A); pane.fontH = u16(b, d + 0x0C);
        pane.hBind = b[d + 0x0E]; pane.vBind = b[d + 0x0F];
        pane.charColor = rgba8(b, d + 0x10); pane.gradColor = rgba8(b, d + 0x14);
        const len = u16(b, d + 0x1E); let s = ''; for (let k = 0; k < len; k++) s += String.fromCharCode(b[d + 0x20 + k]);
        pane.text = s;
        add(pane);
      }
      if (!size) break;
      o += size;
    }
    return scr;
  }

  /** Parse a BFN font: glyph sheets (decoded to RGBA), the code map and widths. */
  function parseBFN(b) {
    if (tag(b, 0) !== 'FONT' || tag(b, 4) !== 'bfn1') throw new Error('not a BFN font');
    const font = { ascent: 0, descent: 0, width: 0, leading: 0, sheets: [], map: new Map(), widths: new Map(), glyph: null };
    let o = 0x20;
    for (let i = 0, n = u32(b, 0x0C); i < n && o + 8 <= b.length; i++) {
      const t = tag(b, o), size = u32(b, o + 4);
      if (t === 'INF1') { font.ascent = u16(b, o + 0x0A); font.descent = u16(b, o + 0x0C); font.width = u16(b, o + 0x0E); font.leading = u16(b, o + 0x10); font.defaultCode = u16(b, o + 0x12); }
      else if (t === 'GLY1') {
        const first = u16(b, o + 8), last = u16(b, o + 0x0A), cw = u16(b, o + 0x0C), ch = u16(b, o + 0x0E), sheetSize = u32(b, o + 0x10);
        const fmt = u16(b, o + 0x14), cols = u16(b, o + 0x16), rows = u16(b, o + 0x18), sw = u16(b, o + 0x1A), sh = u16(b, o + 0x1C);
        const count = last - first + 1, per = cols * rows, nSheets = Math.ceil(count / per);
        for (let s = 0; s < nSheets; s++) {
          // Build a BTI header in front of the sheet so the BTI decoder can read it.
          const hdr = new Uint8Array(0x20 + sheetSize);
          hdr[0] = fmt; hdr[2] = sw >> 8; hdr[3] = sw & 255; hdr[4] = sh >> 8; hdr[5] = sh & 255; hdr[0x1F] = 0x20;
          hdr.set(b.subarray(o + 0x20 + s * sheetSize, o + 0x20 + (s + 1) * sheetSize), 0x20);
          font.sheets.push(Disc.decodeBTI(hdr, 0));
        }
        font.glyph = { first, cw, ch, cols, rows, per };
      } else if (t === 'MAP1') {
        const type = u16(b, o + 8), first = u16(b, o + 0x0A), last = u16(b, o + 0x0C), n = u16(b, o + 0x0E);
        if (type === 0) for (let c = first; c <= last; c++) font.map.set(c, c - first);
        else if (type === 2) for (let k = 0; k < n; k++) font.map.set(first + k, u16(b, o + 0x10 + k * 2));
        else if (type === 3) for (let k = 0; k < n; k++) font.map.set(u16(b, o + 0x10 + k * 4), u16(b, o + 0x12 + k * 4));
      } else if (t === 'WID1') {
        const first = u16(b, o + 8), last = u16(b, o + 0x0A);
        for (let g = first; g <= last; g++) font.widths.set(g, { left: b[o + 0x0C + (g - first) * 2], advance: b[o + 0x0D + (g - first) * 2] });
      }
      if (!size) break;
      o += size;
    }
    return font;
  }
  /** Where glyph `code` sits: {sheet, x, y, w, h, left, advance} in sheet pixels, or null. */
  function glyph(font, code) {
    let g = font.map.get(code);
    if (g === undefined) g = font.map.get(font.defaultCode);
    if (g === undefined || !font.glyph) return null;
    const G = font.glyph, i = g % G.per, wd = font.widths.get(g) || { left: 0, advance: G.cw };
    return { sheet: Math.floor(g / G.per), x: (i % G.cols) * G.cw, y: Math.floor(i / G.cols) * G.ch, w: G.cw, h: G.ch, left: wd.left, advance: wd.advance };
  }

  return { parseBLO, parseBFN, glyph };
});
