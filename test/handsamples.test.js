// The handheld program's own samples (needs the disc: DISC=/path/to/disc npm run test:disc). The four samples its
// fruit, ghost and death sounds play are read from the disc's handheld program and mixed the way the program mixes them.
const fs = require('fs'), Disc = require('../client/disc.js'), Handheld = require('../client/handheld.js'), H = require('../client/handsound.js');
const file = process.argv[2] || process.env.DISC;
if (!file || !fs.existsSync(file)) { console.log('handheld samples: no disc given, skipped'); process.exit(0); }
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const blob = { size: fs.statSync(file).size, slice: (a, b) => ({ arrayBuffer: async () => { const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(b - a); fs.readSync(fd, buf, 0, b - a, a); fs.closeSync(fd); return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length); } }) };
(async () => {
  const d = await Disc.open(blob), rom = new Uint8Array(await d.read(Handheld.PATH));
  const u32 = o => (rom[o] | (rom[o + 1] << 8) | (rom[o + 2] << 16) | (rom[o + 3] << 24)) >>> 0;
  const ats = [...new Set(Object.values(H.SAMPLED).flat().map(v => v.at))];
  ok(ats.every(at => [32000, 44100].includes(u32(at + 4)) && u32(at + 8) === 0 && u32(at + 12) <= u32(at)), 'each sample header: a rate, a loop from the start to near its end');
  ok(H.useRom(rom), 'samples read');
  for (const [name, frames] of [['eatGhost', 31], ['fruit', 24], ['death', 93]]) {
    const m = H.mix(name), loud = m.left.reduce((n, x) => n + (x !== 0), 0);
    let peak = 0; for (const x of m.left) peak = Math.max(peak, Math.abs(x));
    ok(m.left.length === frames * 176 && loud > 0.8 * m.left.length && peak > 30 && peak < 128, `${name}: ${frames} frames, sounding nearly all the way, peak ${peak}`);
  }
  console.log(fails ? fails + ' FAILED' : 'handheld samples ok'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
