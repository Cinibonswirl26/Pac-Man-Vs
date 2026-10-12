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
    octave: { real: Float32Array.from([0, 0.479, -0.484, 0.017, 0.003]), imag: Float32Array.from([0, -0.275, -0.183, 0.025, 0.044]) },
    // the death sound's wave: a strong second and fourth harmonic (measured magnitudes and phases)
    sine: { real: Float32Array.from([0, 0]), imag: Float32Array.from([0, 1]) },
    death: { real: Float32Array.from([0, 1.0, 0.781, 0.029, 0.294, 0.04, 0.003, -0.017, -0.01]), imag: Float32Array.from([0, 0.0, 0.039, 0.018, 0.081, 0.037, 0.019, 0.01, 0.002]) }
  };

  // Loudness (fraction of full scale) and the pitch of each frame in Hz, 0 for a pause. `amp` is per frame or one number.
  const SOUNDS = {
    // "wa-ka" for every pellet: six rising notes, a rest of two frames, six falling notes
    waka: { wave: 'pulse', level: 0.09, freq: [220, 277, 329, 392, 440, 495, 0, 0, 495, 440, 392, 329, 277, 220], amp: 1 },
    // Pac-Man takes the fruit: down from 440 Hz to 130, up to 500, then a short fade (two takes recorded; an earlier
    // reading had it as the round's start, which in fact makes no sound on the handheld)
    fruit: {
      wave: 'octave', level: 0.4,
      freq: [438, 404, 350, 292, 239, 191, 165, 148, 136, 130, 179, 233, 276, 327, 364, 419, 477, 499, 499, 499, 499, 499],
      amp: [0.23, 0.52, 0.87, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.62, 0.3, 0.13, 0.05]
    },
    // Pac-Man eats a ghost: a near-pure tone climbing from about 280 Hz to 1600 over 29 frames, loud (measured)
    eatGhost: {
      wave: 'sine', level: 0.204,
      freq: [277, 325, 367, 417, 395, 332, 360, 423, 502, 546, 624, 723, 826, 860, 925, 988, 1048, 1097, 1224, 1295, 1395, 1442, 1513, 1576, 1611, 1605, 1604, 1609, 1603],
      amp: [0.26, 1, 1, 0.37, 1, 0.28, 1, 1, 0.57, 1, 0.84, 0.92, 0.68, 0.9, 0.92, 0.9, 0.88, 0.85, 0.93, 0.8, 1, 0.82, 0.87, 0.89, 0.93, 0.6, 0.16, 0.1, 0.04]
    },
    // Pac-Man caught: starts with the death animation, 60 frames after contact (measured from the handheld's sound output,
    // two catches): six falling swoops in a wave with a strong second and fourth harmonic, then two quick rising sweeps
    // of a near-pure tone up to 1760 Hz; 92 frames in all
    death: { parts: [
      { wave: 'death', level: 0.143, freq: [659, 629, 615, 587, 580, 604, 633, 664, 701, 724, 729, 728, 593, 573, 551, 518, 516, 539, 568, 589, 624, 644, 649, 649, 652, 551, 517, 490, 487, 510, 529, 561, 584, 605, 611, 615, 526, 507, 494, 466, 460, 481, 493, 522, 553, 570, 579, 580, 494, 483, 458, 440, 434, 461, 469, 494, 511, 540, 546, 545, 467, 453, 436, 419, 408, 410], amp: [0.24, 0.52, 0.89, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0.74] },
      { wave: 'sine', level: 0.081, freq: [170, 342, 512, 675, 824, 952, 1237, 1395, 1562, 1747, 1761, 1759, 170, 347, 522, 693, 865, 1018, 1193, 1310, 1560, 1758, 1760, 1759, 1767, 1762], amp: [0.34, 0.51, 0.72, 0.89, 0.96, 0.96, 0.96, 0.96, 0.96, 0.96, 0.68, 0.32, 0.27, 0.46, 0.72, 0.92, 0.97, 0.96, 0.95, 0.96, 0.96, 0.96, 0.59, 0.26, 0.1, 0.03] }
    ] }
  };

  SOUNDS.start = SOUNDS.fruit;   // the old name, for saved sound maps
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
    if (def.parts) {            // a sound in parts, one after another (each its own wave)
      let t = t0; const hs = def.parts.map(p => { const h = playDef(ctx, dest, p, t); t += p.freq.length * FRAME; return h; });
      return { stop() { hs.forEach(h => h.stop()); } };
    }
    return playDef(ctx, dest, def, t0);
  }
  function playDef(ctx, dest, def, t0) {
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

  const frames = def => def.parts ? def.parts.reduce((n, p) => n + p.freq.length, 0) : def.freq.length;
  return { play, SOUNDS, WAVES, FRAME, duration: name => frames(SOUNDS[name]) * FRAME };
});
