/* Reads assets out of a disc image the player supplies (.iso or compressed .ciso).
 * Nothing from the disc is stored on the server or in the repository: the browser
 * opens the file the user picks and decodes what it needs in memory.
 * UMD: window.Disc in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Disc = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const u32 = (b, o) => ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  const u16 = (b, o) => (b[o] << 8) | b[o + 1];
  const cstr = (b, o) => { let s = ''; while (b[o]) s += String.fromCharCode(b[o++]); return s; };

  // ---- container readers: async read(offset, length) -> Uint8Array of *disc* bytes ----
  async function openContainer(blob) {
    const head = new Uint8Array(await blob.slice(0, 0x8000).arrayBuffer());
    if (String.fromCharCode(...head.slice(0, 4)) === 'CISO') {
      const bs = head[4] | (head[5] << 8) | (head[6] << 16) | (head[7] << 24);
      const phys = new Int32Array(0x7FF8); let n = 0;
      for (let i = 0; i < 0x7FF8; i++) phys[i] = head[8 + i] === 1 ? n++ : -1;
      return {
        kind: 'ciso',
        async read(off, len) {
          const out = new Uint8Array(len);
          let pos = 0;
          while (pos < len) {
            const o = off + pos, bi = Math.floor(o / bs), within = o % bs;
            const take = Math.min(len - pos, bs - within);
            if (bi < phys.length && phys[bi] >= 0) {
              const p = 0x8000 + phys[bi] * bs + within;
              out.set(new Uint8Array(await blob.slice(p, p + take).arrayBuffer()), pos);
            }
            pos += take;
          }
          return out;
        }
      };
    }
    return { kind: 'iso', async read(off, len) { return new Uint8Array(await blob.slice(off, off + len).arrayBuffer()); } };
  }

  async function open(blob) {
    const c = await openContainer(blob);
    const boot = await c.read(0, 0x440);
    const id = String.fromCharCode(...boot.slice(0, 6));
    if (!/^[A-Z0-9]{6}$/.test(id)) throw new Error('This does not look like a Pac-Man Vs. disc image.');
    const fstOff = u32(boot, 0x424), fstSize = u32(boot, 0x428);
    const fst = await c.read(fstOff, fstSize);
    const count = u32(fst, 8), names = count * 12;
    const files = new Map(); const stack = [];
    for (let i = 1; i < count; i++) {
      const e = i * 12, isDir = fst[e] === 1, name = cstr(fst, names + (u32(fst, e) & 0xFFFFFF));
      while (stack.length && stack[stack.length - 1].end <= i) stack.pop();
      const dir = stack.map(d => d.name).join('/');
      if (isDir) stack.push({ name, end: u32(fst, e + 8) });
      else files.set((dir ? dir + '/' : '') + name, { off: u32(fst, e + 4), size: u32(fst, e + 8) });
    }
    return {
      id, title: cstr(await c.read(0x20, 0x40), 0), files,
      has: p => files.has(p),
      async read(path) {
        const f = files.get(path); if (!f) throw new Error('missing on disc: ' + path);
        return c.read(f.off, f.size);
      }
    };
  }

  // ---- Yaz0 + RARC ----
  function yaz0(src) {
    if (String.fromCharCode(...src.slice(0, 4)) !== 'Yaz0') return src;
    const size = u32(src, 4), out = new Uint8Array(size);
    let s = 16, d = 0;
    while (d < size) {
      let code = src[s++];
      for (let bit = 0; bit < 8 && d < size; bit++, code <<= 1) {
        if (code & 0x80) out[d++] = src[s++];
        else {
          const b1 = src[s++], b2 = src[s++];
          let n = b1 >> 4; const dist = (((b1 & 15) << 8) | b2) + 1;
          if (n === 0) n = src[s++] + 18; else n += 2;
          for (let k = 0; k < n && d < size; k++, d++) out[d] = out[d - dist];
        }
      }
    }
    return out;
  }
  function rarc(b) {
    if (String.fromCharCode(...b.slice(0, 4)) !== 'RARC') throw new Error('not a RARC archive');
    const h = 0x20, dataStart = h + u32(b, 0x0C);
    const nDir = u32(b, h), dirOff = h + u32(b, h + 4), nFile = u32(b, h + 8), fileOff = h + u32(b, h + 12), strOff = h + u32(b, h + 20);
    const out = new Map();
    const walk = (di, prefix) => {
      const d = dirOff + di * 16, first = u32(b, d + 12), cnt = u16(b, d + 10);
      for (let i = 0; i < cnt; i++) {
        const f = fileOff + (first + i) * 20, name = cstr(b, strOff + u16(b, f + 6)), attr = u16(b, f + 4);
        if (name === '.' || name === '..') continue;
        if (attr & 0x0200) walk(u32(b, f + 8), prefix + name + '/');
        else out.set(prefix + name, b.subarray(dataStart + u32(b, f + 8), dataStart + u32(b, f + 8) + u32(b, f + 12)));
      }
    };
    walk(0, '');
    return out;
  }

  // ---- BTI textures -> RGBA ----
  const c5 = v => (v << 3) | (v >> 2), c6 = v => (v << 2) | (v >> 4), c4 = v => v * 17, c3 = v => (v << 5) | (v << 2) | (v >> 1);
  function decodeBTI(b, o) {
    o = o || 0;
    const fmt = b[o], w = u16(b, o + 2), h = u16(b, o + 4), palFmt = b[o + 9], nPal = u16(b, o + 10), palOff = u32(b, o + 12), dataOff = u32(b, o + 0x1C);
    const rgba = new Uint8Array(w * h * 4);
    const put = (x, y, r, g, bl, a) => { if (x >= w || y >= h) return; const i = (y * w + x) * 4; rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = bl; rgba[i + 3] = a; };
    const rgb565 = v => [c5(v >> 11), c6((v >> 5) & 63), c5(v & 31), 255];
    const rgb5a3 = v => (v & 0x8000) ? [c5((v >> 10) & 31), c5((v >> 5) & 31), c5(v & 31), 255] : [c4((v >> 8) & 15), c4((v >> 4) & 15), c4(v & 15), c3((v >> 12) & 7)];
    const pal = [];
    if (nPal) for (let i = 0; i < nPal; i++) { const v = u16(b, o + palOff + i * 2); pal.push(palFmt === 0 ? [v >> 8, v >> 8, v >> 8, v & 255] : palFmt === 1 ? rgb565(v) : rgb5a3(v)); }
    let p = o + dataOff;
    const tiles = (bw, bh, fn) => { for (let ty = 0; ty < h; ty += bh) for (let tx = 0; tx < w; tx += bw) fn(tx, ty); };
    switch (fmt) {
      // Intensity formats: the intensity is copied into all four channels, alpha included.
      case 0: tiles(8, 8, (tx, ty) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x += 2) { const v = b[p++], i = c4(v >> 4), j = c4(v & 15); put(tx + x, ty + y, i, i, i, i); put(tx + x + 1, ty + y, j, j, j, j); } }); break;
      case 1: tiles(8, 4, (tx, ty) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) { const v = b[p++]; put(tx + x, ty + y, v, v, v, v); } }); break;
      case 2: tiles(8, 4, (tx, ty) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) { const v = b[p++], i = c4(v & 15); put(tx + x, ty + y, i, i, i, c4(v >> 4)); } }); break;
      case 3: tiles(4, 4, (tx, ty) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const a = b[p++], i = b[p++]; put(tx + x, ty + y, i, i, i, a); } }); break;
      case 4: tiles(4, 4, (tx, ty) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const c = rgb565(u16(b, p)); p += 2; put(tx + x, ty + y, ...c); } }); break;
      case 5: tiles(4, 4, (tx, ty) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const c = rgb5a3(u16(b, p)); p += 2; put(tx + x, ty + y, ...c); } }); break;
      case 6: tiles(4, 4, (tx, ty) => {   // 64-byte tile: 16 x (A,R) then 16 x (G,B)
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const i = (y * 4 + x) * 2; put(tx + x, ty + y, b[p + i + 1], b[p + 32 + i], b[p + 32 + i + 1], b[p + i]); }
        p += 64;
      }); break;
      case 8: tiles(8, 8, (tx, ty) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x += 2) { const v = b[p++]; put(tx + x, ty + y, ...pal[v >> 4]); put(tx + x + 1, ty + y, ...pal[v & 15]); } }); break;
      case 9: tiles(8, 4, (tx, ty) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) put(tx + x, ty + y, ...pal[b[p++]]); }); break;
      case 14: tiles(8, 8, (tx, ty) => {
        for (let sb = 0; sb < 4; sb++) {
          const bx = tx + (sb & 1) * 4, by = ty + (sb >> 1) * 4;
          const c0 = u16(b, p), c1 = u16(b, p + 2);
          const A = rgb565(c0), B = rgb565(c1), col = [A, B];
          if (c0 > c1) { col.push(A.map((v, i) => i < 3 ? ((2 * v + B[i]) / 3) | 0 : 255), A.map((v, i) => i < 3 ? ((v + 2 * B[i]) / 3) | 0 : 255)); }
          else { col.push(A.map((v, i) => i < 3 ? ((v + B[i]) / 2) | 0 : 255), [0, 0, 0, 0]); }
          for (let y = 0; y < 4; y++) { const row = b[p + 4 + y]; for (let x = 0; x < 4; x++) put(bx + x, by + y, ...col[(row >> (6 - 2 * x)) & 3]); }
          p += 8;
        }
      }); break;
      default: throw new Error('unsupported BTI format ' + fmt);
    }
    return { w, h, rgba, fmt, wrapS: b[o + 6], wrapT: b[o + 7] };
  }

  // ---- AST (streamed music, AFC ADPCM) -> Float32 channels ----
  const AFC = [[0, 0], [2048, 0], [0, 2048], [1024, 1024], [4096, -2048], [3584, -1536], [3072, -1024], [4608, -2560],
    [4200, -2248], [4800, -2300], [5120, -3072], [2048, -2048], [1024, -1024], [-1024, 1024], [-1024, 0], [-2048, 0]];
  function decodeAST(b, maxSeconds) {
    if (String.fromCharCode(...b.slice(0, 4)) !== 'STRM') throw new Error('not an AST stream');
    const codec = u16(b, 8), ch = u16(b, 0x0C), rate = u32(b, 0x10), total = u32(b, 0x14), loopStart = u32(b, 0x18), loopEnd = u32(b, 0x1C);
    const limit = Math.min(total, maxSeconds ? Math.floor(maxSeconds * rate) : total);
    const out = Array.from({ length: ch }, () => new Float32Array(limit));
    const hist = Array.from({ length: ch }, () => [0, 0]);
    const pos = new Array(ch).fill(0);
    let o = 0x40;
    while (o + 0x20 <= b.length && pos[0] < limit) {
      if (String.fromCharCode(...b.slice(o, o + 4)) !== 'BLCK') break;
      const bs = u32(b, o + 4);
      for (let c = 0; c < ch; c++) {
        let p = o + 0x20 + c * bs; const end = p + bs;
        if (codec === 1) { for (; p + 1 < end && pos[c] < limit; p += 2) { let v = u16(b, p); if (v > 32767) v -= 65536; out[c][pos[c]++] = v / 32768; } continue; }
        while (p + 9 <= end && pos[c] < limit) {
          const scale = 1 << (b[p] >> 4), [k1, k2] = AFC[b[p] & 15];
          let h1 = hist[c][0], h2 = hist[c][1];
          for (let i = 0; i < 16 && pos[c] < limit; i++) {
            let n = (b[p + 1 + (i >> 1)] >> (i & 1 ? 0 : 4)) & 15; if (n > 7) n -= 16;
            let s = ((n * scale << 11) + k1 * h1 + k2 * h2) >> 11;
            s = s > 32767 ? 32767 : s < -32768 ? -32768 : s;
            h2 = h1; h1 = s; out[c][pos[c]++] = s / 32768;
          }
          hist[c][0] = h1; hist[c][1] = h2; p += 9;
        }
      }
      o += 0x20 + bs * ch;
    }
    return { channels: out, rate, samples: Math.min(pos[0], limit), loopStart, loopEnd, total };
  }

  return { open, yaz0, rarc, decodeBTI, decodeAST };
});
