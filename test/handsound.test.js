// The handheld's sounds: pitch lists and shapes are plain data, checked against what was measured.
const H = require('../client/handsound.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const w = H.SOUNDS.waka;
ok(w.freq.length === 14, 'waka is 14 frames long');
ok(Math.abs(H.duration('waka') - 0.234) < 0.002, 'waka lasts a quarter of a second');
ok(w.freq.slice(0, 6).every((f, i, a) => !i || f > a[i - 1]) && w.freq.slice(8).every((f, i, a) => !i || f < a[i - 1]), 'waka rises, rests, then falls');
ok(w.freq[6] === 0 && w.freq[7] === 0, 'two silent frames between the halves');
const s = H.SOUNDS.start;
ok(s.freq.length === s.amp.length, 'every frame of the start sweep has a loudness');
ok(Math.min(...s.freq) === 130 && Math.max(...s.freq) === 499, 'the start sweep dips to 130 Hz and rises to 500');
const pw = H.WAVES.pulse;   // a 12.5% pulse has strong low harmonics that fall away smoothly
const amp = k => Math.hypot(pw.real[k], pw.imag[k]);
ok(amp(1) > amp(2) && amp(2) > amp(4) && amp(8) < 0.05, 'pulse harmonics fall away');
// the death: 92 frames, six falling swoops, then two sweeps up to 1760 Hz
const d = H.SOUNDS.death;
ok(d.parts.length === 2 && d.parts.every(p => p.freq.length === p.amp.length), 'the death sound is two parts with a loudness per frame');
ok(Math.round(H.duration('death') * 59.7275) === 92, 'the death sound lasts 92 handheld frames');
ok(Math.max(...d.parts[1].freq) >= 1760 && d.parts[1].freq[0] < 200, 'its sweeps rise to 1760 Hz');
// the program's own tables (read by running its sound code): exact wa-ka pitches, and the three sample sounds
ok([1452, 1575, 1650, 1714, 1750, 1783].every((n, i) => Math.abs(131072 / (2048 - n) - w.freq[i]) < 0.06), 'wa-ka pitches are the program\'s frequency registers');
const S = H.SAMPLED;
ok(Object.keys(S).sort().join() === 'death,eatGhost,fruit', 'three sample sounds');
ok(Object.values(S).flat().every(v => v.step.length === v.vol.length && v.vol[v.vol.length - 1] <= 2), 'every voice has a step and volume per frame and fades out');
ok(S.fruit.length === 2 && S.fruit[0].step.every((x, i) => Math.abs(x - 2 * S.fruit[1].step[i]) <= 2), 'the fruit: two voices an octave apart');
ok(S.death.length === 3 && S.death[1].start === 65 && S.death[2].start === 77 && S.death[0].step.length === 71, 'the death: swoops, then two sweeps starting at frames 65 and 77');
ok(Math.round(16777216 / 1596) === Math.round(H.MIX_RATE) && !H.hasRom() && H.mix('fruit') === null, 'mixed at 10,512 a second; nothing to mix without the disc');
// a made-up program with a known sample: the mixer follows the program's arithmetic
const rom = new Uint8Array(0x18000), put = (o, v) => { rom[o] = v & 255; rom[o + 1] = v >> 8 & 255; rom[o + 2] = v >> 16 & 255; rom[o + 3] = v >>> 24; };
for (const at of new Set(Object.values(S).flat().map(v => v.at))) { put(at, 4); put(at + 4, 44100); put(at + 8, 0); put(at + 12, 4); [100, -100, 50, -50].forEach((x, i) => { rom[at + 16 + i] = x & 255; }); }
ok(H.useRom(rom) && H.hasRom(), 'samples read from the program bytes');
const m = H.mix('eatGhost'), v0 = S.eatGhost[0], vl = (v0.vol[0] * 63) >> 8;
ok(m.left.length === v0.step.length * 176 && m.left[0] === Math.trunc(vl * 100 / 128) && m.right[0] === Math.trunc(((v0.vol[0] * 64) >> 8) * 100 / 128), 'first sample: volume x sample, shifted down by 7, left and right');
ok(m.left[1] === Math.trunc(vl * 100 / 128), 'a step under 256 stays on the same sample');
console.log(fails ? fails + ' FAILED' : 'handheld sounds ok'); process.exit(fails ? 1 : 0);
