// node test/sound.test.js <disc image>: the sound effects and voice lines read from the player's disc.
const fs = require('fs'), Disc = require('../client/disc.js'), Sound = require('../client/sound.js');
const file = process.argv[2]; if (!file) { console.log('usage: node test/sound.test.js <image>'); process.exit(2); }
const blob = { slice: (a, b) => ({ arrayBuffer: async () => { const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(b - a); fs.readSync(fd, buf, 0, b - a, a); fs.closeSync(fd); return buf.buffer.slice(buf.byteOffset, buf.byteOffset + (b - a)); } }) };
(async () => {
  const d = await Disc.open(blob);
  let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
  const s = await Sound.load(d);
  ok(s.sfx.length === 16, 'sixteen effects, got ' + s.sfx.length);
  ok(s.voice.length === 36, 'thirty-six voice lines, got ' + s.voice.length);
  for (const w of [...s.sfx, ...s.voice]) {
    ok(w.rate === 32000 && w.samples > 1000 && w.start + w.size <= w.data.length, 'wave inside its bank');
    const pcm = Sound.decodeADPCM(w.data, w.start, w.size, w.samples);
    let peak = 0, bad = 0; for (const v of pcm) { peak = Math.max(peak, Math.abs(v)); if (!Number.isFinite(v)) bad++; }
    ok(bad === 0 && peak > 0.2 && peak <= 1, 'decoded wave has a sensible level, peak ' + peak.toFixed(2));
  }
  ok(s.sfx.filter(w => w.loop).length >= 1, 'some effects loop');
  console.log(fails ? fails + ' FAILED' : 'sounds read from the disc, all checks passed'); process.exit(fails ? 1 : 0);
})();
