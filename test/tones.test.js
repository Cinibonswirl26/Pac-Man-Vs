// The TV's own tones (not on the disc): plain data, checked against what was measured.
const T = require('../client/tones.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const c = T.SOUNDS.count;
ok(c.voices.length === 2 && Math.round(c.voices[0].freq) === 786 && Math.round(c.voices[1].freq) === 985, 'the count is G5 then B5');
ok(c.voices[1].at === 5, 'B comes five frames after G');
ok(Math.round(T.duration('count') * 59.94) === 19, 'one count, left to ring out, lasts 19 frames');
ok(c.voices.every(v => v.amp[0] === 1 && v.amp[v.amp.length - 1] === 0 && v.wave === 'square'), 'each note starts full and dies away, a square wave');
const sq = T.WAVES.square; ok(sq.imag[2] === 0 && Math.abs(sq.imag[3] * 3 - sq.imag[1]) < 1e-6, 'a square has only odd harmonics, at 1/k');
const g = T.SOUNDS.fruitGone.voices;
ok(Math.round(g[0].freq[0]) === 523 && Math.round(g[0].freq[23]) === 277 && g[0].freq.length === 24, 'fruit gone: C5 down to C#4, two frames a note');
ok(g[0].freq.every((f, i, a) => !i || f <= a[i - 1]) && g[1].at === 10 && g[1].amp[0] < g[0].amp[0], 'and its softer echo ten frames behind');
ok(Math.round(T.duration('fruitGone') * 59.94) === 34, '34 frames in all');
console.log(fails ? fails + ' FAILED' : 'tones ok'); process.exit(fails ? 1 : 0);
