/* The sounds Pac-Man's own screen makes, rebuilt from measurements of the original.
 * Nothing here is read from the disc: the handheld's sounds are made on the fly by its sound chip, so these are
 * recreations. Each sound is a list of frames (one per picture, 1/59.7275 s) giving the pitch, and a wave shape;
 * the pitches, timing, loudness and shapes were measured from recordings of the real thing.
 * UMD: window.HandSound in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HandSound = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const FRAME = 1 / 59.7275;

  // Wave shapes as Fourier coefficients: a narrow pulse (12.5% of each cycle high) and a pair of tones an octave apart.
  const pulse = (duty, n = 40) => {
    const real = new Float32Array(n), imag = new Float32Array(n);
    for (let k = 1; k < n; k++) { const a = 2 * Math.sin(Math.PI * k * duty) / (Math.PI * k), ph = Math.PI * k * duty; real[k] = a * Math.cos(ph); imag[k] = a * Math.sin(ph); }
    return { real, imag };
  };
  const WAVES = {
    pulse: pulse(0.125),
    octave: { real: Float32Array.from([0, 0.479, -0.484, 0.017, 0.003]), imag: Float32Array.from([0, -0.275, -0.183, 0.025, 0.044]) }
  };

  // Loudness (fraction of full scale) and the pitch of each frame in Hz, 0 for a pause. `amp` is per frame or one number.
  const SOUNDS = {
    // "wa-ka" for every pellet: six rising notes, a rest of two frames, six falling notes
    waka: { wave: 'pulse', level: 0.09, freq: [220, 277, 329, 392, 440, 495, 0, 0, 495, 440, 392, 329, 277, 220], amp: 1 },
    // the sweep that starts a round: down from 440 Hz to 130, up to 500, then a short fade
    start: {
      wave: 'octave', level: 0.4,
      freq: [438, 404, 350, 292, 239, 191, 165, 148, 136, 130, 179, 233, 276, 327, 364, 419, 477, 499, 499, 499, 499, 499],
      amp: [0.23, 0.52, 0.87, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.62, 0.3, 0.13, 0.05]
    }
  };

  const waves = new WeakMap();
  function periodic(ctx, name) {
    let m = waves.get(ctx); if (!m) waves.set(ctx, m = {});
    if (!m[name]) m[name] = ctx.createPeriodicWave(WAVES[name].real, WAVES[name].imag);
    return m[name];
  }

  /** Play a sound on `ctx` into `dest`. Returns { stop() } so a new sound can cut an old one off. */
  function play(ctx, dest, name, when) {
    const def = SOUNDS[name]; if (!def) return null;
    const t0 = when === undefined ? ctx.currentTime : when;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.setPeriodicWave(periodic(ctx, def.wave)); osc.connect(g); g.connect(dest);
    const n = def.freq.length;
    for (let i = 0; i < n; i++) {
      const t = t0 + i * FRAME, a = (Array.isArray(def.amp) ? def.amp[i] : def.amp) * def.level;
      if (def.freq[i] > 0) osc.frequency.setValueAtTime(def.freq[i], t);
      g.gain.setValueAtTime(def.freq[i] > 0 ? a : 0, t);
    }
    g.gain.setValueAtTime(0, t0 + n * FRAME);
    osc.start(t0); osc.stop(t0 + n * FRAME + 0.02);
    return { stop() { try { g.gain.cancelScheduledValues(0); g.gain.setValueAtTime(0, ctx.currentTime); osc.stop(); } catch { /* already over */ } } };
  }

  return { play, SOUNDS, WAVES, FRAME, duration: name => SOUNDS[name].freq.length * FRAME };
});
