/* Tones the TV makes that are not on the disc. A few effects in the original's effect sequence play the sound chip's
 * own built-in waves instead of a recorded one: the exchange screen's count, the fruit bursting untaken, a stand-in
 * woken, and a ghost's fruit sight widening and closing. These are recreations,
 * measured from a recording of the original's sound output, made on the fly.
 * Each sound is a list of voices: a pitch (one, or one per TV frame for a run of notes), a wave shape, when it starts,
 * and its loudness at each TV frame (1/59.94 s), ramped smoothly between frames. A new play of the same sound cuts the last one off, as the original
 * reuses its voice.
 * UMD: window.Tones in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Tones = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const FRAME = 1 / 59.94;

  // A square wave (half of each cycle high): odd harmonics at 1/k, as measured
  const square = (n = 40) => {
    const real = new Float32Array(n), imag = new Float32Array(n);
    for (let k = 1; k < n; k += 2) imag[k] = 4 / (Math.PI * k);
    return { real, imag };
  };
  const sine = () => { const real = new Float32Array(2), imag = new Float32Array(2); imag[1] = 1; return { real, imag }; };
  // a fundamental with its octave at 0.44 and almost nothing above, as measured on the fruit-sight tones
  const octave = () => { const real = new Float32Array(3), imag = new Float32Array(3); imag[1] = 1; imag[2] = 0.44; return { real, imag }; };
  const WAVES = { square: square(), sine: sine(), octave: octave() };

  /** Per-frame pitches from [MIDI note, frames] pairs. */
  function notes(list) { const out = []; for (const [n, k] of list) for (let i = 0; i < k; i++) out.push(440 * Math.pow(2, (n - 69) / 12)); return out; }
  const SOUNDS = {
    // The exchange screen's count, played every 8th frame while the points move: G5 (786 Hz), then B5 (985 Hz) five
    // frames later as G fades, both square waves; the B note dies away over 14 frames unless the next count cuts it
    count: {
      level: 0.088,
      voices: [
        { wave: 'square', freq: 785.7, at: 0, amp: [1, 0.95, 0.92, 0.9, 0.88, 0.85, 0.6, 0.4, 0.3, 0.15, 0.1, 0.06, 0.03, 0] },
        { wave: 'square', freq: 985.2, at: 5, amp: [1, 1, 0.95, 0.9, 0.84, 0.79, 0.75, 0.7, 0.64, 0.58, 0.48, 0.36, 0.25, 0.13, 0] }
      ]
    },
    // The fruit bursts untaken: a square wave running down a semitone every two frames from C5 to C#4, and the same run
    // again ten frames behind, softer, like an echo (two recordings, read frame by frame under the round's siren)
    fruitGone: {
      level: 0.11,
      voices: [0, 10].map((at, k) => ({ wave: 'square', at,
        freq: notes([[72, 2], [71, 2], [70, 2], [69, 2], [68, 2], [67, 2], [66, 2], [65, 2], [64, 2], [63, 2], [62, 2], [61, 2]]),
        amp: Array.from({ length: 25 }, (_, i) => (i < 24 ? (k ? 0.6 : 1) : 0)) }))
    },
    // A grey stand-in woken (effect 0x1817): a near-pure low tone hopping to a new pitch about every frame for 18
    // frames, from 233 Hz up through 260-430 Hz, with a softer voice an octave under it on the unsteady notes; the
    // same every time (three recordings, read cycle by cycle under the round's siren)
    wake: {
      level: 0.42,
      voices: [
        { wave: 'sine', at: 0, freq: [233, 233, 335, 345, 290, 272, 393, 324, 349, 349, 259, 259, 391, 388, 322, 318, 434, 365],
          amp: [1, 1, 0.67, 0.6, 0.6, 0.54, 0.64, 0.67, 0.4, 0.34, 0.82, 0.82, 0.58, 0.58, 0.63, 0.46, 0.57, 0.4, 0] },
        { wave: 'sine', at: 0, freq: [233, 233, 335, 345, 290, 272, 393, 324, 349, 349, 259, 259, 391, 388, 322, 318, 434, 365].map(f => f / 2),
          amp: [0, 0, 0.26, 0.2, 0.2, 0.34, 0.09, 0.27, 0.18, 0.15, 0, 0, 0.2, 0.3, 0.3, 0.06, 0.16, 0.1, 0] }
      ]
    },
    // A ghost takes the fruit and its view starts to widen (effect 0x180B): one steady voice for 27 frames whose pitch
    // wobbles downwards, from about 600 Hz down to 355, up to 480, down to 250, up to 328 and down to 151 Hz (three
    // recordings, read frame by frame under the round's siren)
    sightWide: {
      level: 0.122,
      voices: [{ wave: 'octave', at: 0,
        freq: [558, 609, 588, 524, 410, 362, 355, 399, 480, 450, 416, 353, 291, 249, 269, 301, 328, 321, 275, 216, 181, 164, 176, 189, 192, 170, 151],
        amp: Array.from({ length: 28 }, (_, i) => (i < 27 ? 1 : 0)) }]
    },
    // The view closes again (effect 0x180A, when the sight's timer runs out with the view still wide): the same voice
    // wobbling upwards, nearly the widening run backwards, from 152 Hz to about 615 (three recordings that agree)
    sightBack: {
      level: 0.122,
      voices: [{ wave: 'octave', at: 0,
        freq: [152, 187, 203, 198, 176, 175, 194, 240, 298, 340, 334, 301, 269, 271, 309, 385, 453, 482, 448, 390, 361, 372, 447, 543, 615, 618, 600],
        amp: Array.from({ length: 28 }, (_, i) => (i < 27 ? 1 : 0)) }]
    }
  };

  const waves = new WeakMap();
  function periodic(ctx, name) {
    let m = waves.get(ctx); if (!m) waves.set(ctx, m = {});
    if (!m[name]) m[name] = ctx.createPeriodicWave(WAVES[name].real, WAVES[name].imag);
    return m[name];
  }

  const playing = new WeakMap();   // ctx -> { name: handle } so a new count cuts the last
  /** Play a sound on `ctx` into `dest` at loudness `vol` (1 = as measured). Returns { stop() }. */
  function play(ctx, dest, name, vol) {
    const def = SOUNDS[name]; if (!def) return null;
    let m = playing.get(ctx); if (!m) playing.set(ctx, m = {});
    if (m[name]) m[name].stop();
    const t0 = ctx.currentTime, level = def.level * (vol == null ? 1 : vol);
    const parts = def.voices.map(v => {
      const osc = ctx.createOscillator(), g = ctx.createGain(), t1 = t0 + v.at * FRAME;
      osc.setPeriodicWave(periodic(ctx, v.wave)); osc.connect(g); g.connect(dest);
      if (Array.isArray(v.freq)) v.freq.forEach((f, i) => osc.frequency.setValueAtTime(f, t1 + i * FRAME)); else osc.frequency.value = v.freq;
      g.gain.setValueAtTime(0, t0); g.gain.setValueAtTime(v.amp[0] * level, t1);
      for (let i = 1; i < v.amp.length; i++) g.gain.linearRampToValueAtTime(v.amp[i] * level, t1 + i * FRAME);
      osc.start(t1); osc.stop(t1 + v.amp.length * FRAME + 0.02);
      return { osc, g };
    });
    const h = {
      stop() {   // a quick fade, not a click
        const t = ctx.currentTime;
        for (const p of parts) try { p.g.gain.cancelScheduledValues(t); p.g.gain.setValueAtTime(p.g.gain.value, t); p.g.gain.linearRampToValueAtTime(0, t + FRAME); p.osc.stop(t + FRAME + 0.01); } catch { /* already over */ }
        if (m[name] === h) delete m[name];
      }
    };
    m[name] = h;
    return h;
  }

  const frames = def => Math.max(...def.voices.map(v => v.at + v.amp.length - 1));
  return { play, SOUNDS, WAVES, FRAME, names: () => Object.keys(SOUNDS), duration: name => frames(SOUNDS[name]) * FRAME };
});
