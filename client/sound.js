/* Sound effects and voice lines, read from the player's own disc at run time.
 * The disc keeps them as 4-bit ADPCM waves in two wave banks (PacManSound_0.aw for effects, Narration_0.aw
 * for the announcer); a table in JaiInit.aaf says where each wave starts, how long it is and how it loops.
 * UMD: window.Sound in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Sound = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const INIT = 'PROOT/AudioRes/JaiInit.aaf', BANKS = 'PROOT/AudioRes/Banks/';
  // predictor pairs for the 16 filter indexes of the ADPCM frames
  const COEF = [0, 0, 2048, 0, 0, 2048, 1024, 1024, 4096, -2048, 3584, -1536, 3072, -1024, 4608, -2560,
    4200, -2248, 4800, -2300, 5120, -3072, 2048, -2048, 1024, -1024, -1024, 1024, -1024, 0, -2048, 0];

  /** Decode `count` samples from 9-byte frames (1 header byte: scale and filter, 16 four-bit samples). */
  function decodeADPCM(u8, off, size, count) {
    const out = new Float32Array(count);
    let h1 = 0, h2 = 0, n = 0;
    for (let f = off; f + 9 <= off + size && n < count; f += 9) {
      const hd = u8[f], delta = 1 << (hd >> 4), c0 = COEF[(hd & 15) * 2], c1 = COEF[(hd & 15) * 2 + 1];
      for (let i = 0; i < 16 && n < count; i++) {
        const byte = u8[f + 1 + (i >> 1)];
        let v = (i & 1) ? (byte & 15) : (byte >> 4);
        if (v >= 8) v -= 16;
        let s = ((v * delta) << 11) + h1 * c0 + h2 * c1; s >>= 11;
        if (s > 32767) s = 32767; else if (s < -32768) s = -32768;
        out[n++] = s / 32768; h2 = h1; h1 = s;
      }
    }
    return out;
  }

  /** The wave tables: every wave system in the file, as { id, banks: [{ file, waves: [...] }] }. */
  function parseTables(aaf) {
    const dv = new DataView(aaf.buffer, aaf.byteOffset, aaf.byteLength), u32 = o => dv.getUint32(o, false);
    const systems = [];
    for (let o = 0; o + 0x20 < aaf.length; o += 4) {
      if (u32(o) !== 0x57535953) continue;   // 'WSYS'
      const id = u32(o + 8), winf = o + u32(o + 0x10), count = u32(winf + 4), banks = [];
      for (let i = 0; i < count; i++) {
        const e = o + u32(winf + 8 + 4 * i);
        let file = ''; for (let k = 0; k < 0x70 && aaf[e + k]; k++) file += String.fromCharCode(aaf[e + k]);
        const n = u32(e + 0x70), waves = [];
        for (let k = 0; k < n; k++) {
          const w = o + u32(e + 0x74 + 4 * k);
          waves.push({
            format: aaf[w + 1], rate: dv.getFloat32(w + 4, false), start: u32(w + 8), size: u32(w + 12),
            loop: u32(w + 16) === 0xFFFFFFFF, loopStart: u32(w + 20), loopEnd: u32(w + 24), samples: u32(w + 28)
          });
        }
        banks.push({ file, waves });
      }
      systems.push({ id, banks });
    }
    return systems;
  }

  /** Read the tables and wave banks from a disc. Returns { sfx: [wave], voice: [wave] } where each wave has
   *  its encoded bytes; `buffer(ctx, wave)` turns one into an AudioBuffer (cached). */
  async function load(disc) {
    const systems = parseTables(new Uint8Array(await disc.read(INIT)));
    const files = {}, out = { sfx: [], voice: [] };
    for (const sys of systems) for (const bank of sys.banks) {
      if (!files[bank.file]) files[bank.file] = new Uint8Array(await disc.read(BANKS + bank.file));
      const list = /^Narration/i.test(bank.file) ? out.voice : /^PacManSound/i.test(bank.file) ? out.sfx : null;
      if (list) for (const w of bank.waves) list.push(Object.assign({ data: files[bank.file] }, w));
    }
    return out;
  }

  function buffer(ctx, w) {
    if (w.buf) return w.buf;
    const pcm = decodeADPCM(w.data, w.start, w.size, w.samples);
    const b = ctx.createBuffer(1, pcm.length, w.rate || 32000);
    b.copyToChannel(pcm, 0);
    if (w.loop && w.loopEnd > w.loopStart) b.loopRange = [w.loopStart / b.sampleRate, w.loopEnd / b.sampleRate];
    return (w.buf = b);
  }

  return { load, buffer, decodeADPCM, parseTables };
});
