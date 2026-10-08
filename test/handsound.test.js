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
console.log(fails ? fails + ' FAILED' : 'handheld sounds ok'); process.exit(fails ? 1 : 0);
