/* Tones the TV makes that are not on the disc. A few effects in the original's effect sequence play the sound chip's
 * own built-in waves instead of a recorded one; the exchange screen's count is one of them. These are recreations,
 * measured from a recording of the original's sound output, made on the fly.
 * Each sound is a list of voices: a pitch, a wave shape, when it starts, and its loudness at each TV frame
 * (1/59.94 s), ramped smoothly between frames. A new play of the same sound cuts the last one off, as the original
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
  const WAVES = { square: square() };

  const SOUNDS = {
    // The exchange screen's count, played every 8th frame while the points move: G5 (786 Hz), then B5 (985 Hz) five
    // frames later as G fades, both square waves; the B note dies away over 14 frames unless the next count cuts it
    count: {
      level: 0.088,
      voices: [
        { wave: 'square', freq: 785.7, at: 0, amp: [1, 0.95, 0.92, 0.9, 0.88, 0.85, 0.6, 0.4, 0.3, 0.15, 0.1, 0.06, 0.03, 0] },
        { wave: 'square', freq: 985.2, at: 5, amp: [1, 1, 0.95, 0.9, 0.84, 0.79, 0.75, 0.7, 0.64, 0.58, 0.48, 0.36, 0.25, 0.13, 0] }
      ]
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
      osc.setPeriodicWave(periodic(ctx, v.wave)); osc.frequency.value = v.freq; osc.connect(g); g.connect(dest);
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
