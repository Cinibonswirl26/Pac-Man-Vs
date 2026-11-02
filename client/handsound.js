/* The sounds Pac-Man's own screen makes, as the handheld program on the disc plays them.
 * That program has four sounds. The "wa-ka" is played on the handheld's pulse channel; the other three (the fruit,
 * eating a ghost, the death sound) are short looped samples in the program, mixed in software at 10,512 samples a
 * second. The program was run in a CPU emulator to read, frame by frame, which sample each voice plays, how fast and
 * how loud; those tables are below. With the disc loaded (useRom) the samples are read from the player's own copy of
 * the program and mixed here exactly as the program mixes them (checked sample for sample against the emulated
 * program). Without the disc, recreations measured from recordings of the real thing stand in (SOUNDS).
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
    // "wa-ka" for every pellet: six rising notes, a rest of two frames, six falling notes. Exact: the program's own
    // pulse-channel writes (sound 0: a 12.5% pulse at full volume, frequency registers 1452, 1575, 1650, 1714, 1750,
    // 1783 = 131072 / (2048 - n) Hz, then silence for two frames and the same notes back down)
    waka: { wave: 'pulse', level: 0.09, freq: [219.9, 277.1, 329.3, 392.4, 439.8, 494.6, 0, 0, 494.6, 439.8, 392.4, 329.3, 277.1, 219.9], amp: 1 },
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

  // The program's sample sounds. Each voice: the sample's place in the program file, the frame it starts on, and per
  // frame its step (how far it moves through the sample per output sample, in 1/256ths) and its volume (0-255). The
  // program sends message bits 0x10, 0x20, 0x40 and 0x80 for sounds 0 (wa-ka), 4 (fruit), 1 (ghost) and 2 (death).
  const MIX_RATE = 16777216 / 1596, PER_FRAME = 176, PAN = 64, MIX_LEVEL = 0.65;
  const SAMPLED = {
    eatGhost: [{ at: 0x178c4, start: 0,
      step: [225, 272, 319, 319, 319, 236, 294, 352, 410, 468, 525, 583, 641, 699, 756, 814, 872, 930, 988, 1045, 1103, 1161, 1219, 1277, 1277, 1277, 1277, 1277, 1277, 1277, 1277],
      vol: [254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 254, 114, 51, 23, 10, 4, 2] }],
    // two voices on one sample, an octave apart
    fruit: [2, 1].map(k => ({ at: 0x177e4, start: 0,
      step: k === 2 ? [2157, 1904, 1651, 1398, 1145, 891, 638, 638, 638, 638, 891, 1144, 1398, 1651, 1904, 2157, 2410, 2410, 2410, 2410, 2410, 2410, 2410, 2410]
        : [1078, 952, 825, 699, 572, 446, 319, 319, 319, 319, 445, 572, 698, 825, 952, 1078, 1205, 1205, 1205, 1205, 1205, 1205, 1205, 1205],
      vol: [66, 133, 199, 199, 199, 199, 199, 199, 199, 199, 199, 199, 199, 199, 199, 199, 199, 199, 89, 40, 18, 8, 3, 1] })),
    // six falling swoops on one sample, then two rising sweeps on another, the first overlapping the swoops' fade
    death: [
      { at: 0x171d4, start: 0,
        step: [748, 717, 686, 655, 655, 689, 723, 757, 791, 825, 825, 825, 666, 638, 611, 583, 583, 614, 644, 674, 705, 735, 735, 735, 629, 603, 577, 550, 550, 579, 608, 636, 665, 694, 694, 694, 593, 569, 544, 520, 520, 547, 574, 601, 628, 655, 655, 655, 560, 537, 514, 490, 490, 516, 541, 567, 592, 618, 618, 618, 529, 507, 485, 463, 463, 463, 463, 463, 463, 463, 463],
        vol: [66, 133].concat(Array(63).fill(199), [89, 40, 18, 8, 3, 1]) },
      ...[[65, 1013], [77, 4821]].map(([start, first]) => ({ at: 0x17444, start,
        step: [first, 67, 852, 1277, 1704, 2147, 2554, 3037, 3409, 3827, 4295, 4295, 4295, 4295, 4295, 4295],
        vol: [19, 39, 59, 79, 99, 99, 99, 99, 99, 99, 99, 44, 20, 9, 4, 1] }))
    ]
  };

  let bank = null;   // at -> { data: Int8Array, loopStart, loopEnd }
  /** Read the samples from the handheld program's bytes (the disc's PROOT/gbademo/packman.bin). */
  function useRom(rom) {
    const u32 = o => (rom[o] | (rom[o + 1] << 8) | (rom[o + 2] << 16) | (rom[o + 3] << 24)) >>> 0;
    const b = {};
    for (const v of Object.values(SAMPLED).flat()) {
      if (b[v.at]) continue;
      const n = u32(v.at), loopStart = u32(v.at + 8), loopEnd = u32(v.at + 12) || n;
      if (!n || n > 4096 || v.at + 16 + n > rom.length || loopEnd > n + 1 || loopStart >= loopEnd) { bank = null; return false; }
      b[v.at] = { data: new Int8Array(rom.buffer, rom.byteOffset + v.at + 16, n + 1), loopStart, loopEnd };
    }
    bank = b; cache = new WeakMap(); return true;
  }

  /** Mix a sampled sound as the program does: per output sample, add sample x volume into 16-bit left and right sums,
   *  then shift each down by 7 and clamp to 8 bits. Returns { left, right } (Int8Array, 176 samples a frame). */
  function mix(name) {
    const voices = SAMPLED[name]; if (!voices || !bank) return null;
    const frames = Math.max(...voices.map(v => v.start + v.step.length));
    const out = { left: new Int8Array(frames * PER_FRAME), right: new Int8Array(frames * PER_FRAME) };
    const pos = voices.map(() => 0);
    for (let f = 0; f < frames; f++) {
      const L = new Int32Array(PER_FRAME), R = new Int32Array(PER_FRAME);
      voices.forEach((v, k) => {
        const i = f - v.start; if (i < 0 || i >= v.step.length) return;
        const s = bank[v.at], vl = (v.vol[i] * (127 - PAN)) >> 8 & 255, vr = (v.vol[i] * PAN) >> 8 & 255, step = v.step[i];
        let p = pos[k];
        for (let j = 0; j < PER_FRAME; j++) {
          if ((p >> 8) >= s.loopEnd) p -= (s.loopEnd - s.loopStart) << 8;
          const x = s.data[p >> 8]; L[j] = (L[j] + vl * x) << 16 >> 16; R[j] = (R[j] + vr * x) << 16 >> 16; p += step;
        }
        pos[k] = p;
      });
      const clamp = x => Math.max(-128, Math.min(127, Math.trunc(x / 128)));
      for (let j = 0; j < PER_FRAME; j++) { out.left[f * PER_FRAME + j] = clamp(L[j]); out.right[f * PER_FRAME + j] = clamp(R[j]); }
    }
    return out;
  }

  let cache = new WeakMap();   // ctx -> { name: AudioBuffer }
  function mixedBuffer(ctx, name) {
    let m = cache.get(ctx); if (!m) cache.set(ctx, m = {});
    if (!m[name]) {
      const pcm = mix(name), sr = ctx.sampleRate, n = Math.ceil(pcm.left.length / MIX_RATE * sr);
      const buf = ctx.createBuffer(2, n, sr), l = buf.getChannelData(0), r = buf.getChannelData(1);
      for (let i = 0; i < n; i++) {   // held, sample by sample, as the handheld's output holds each one
        const j = Math.min(pcm.left.length - 1, Math.floor(i * MIX_RATE / sr));
        l[i] = pcm.left[j] / 128 * MIX_LEVEL; r[i] = pcm.right[j] / 128 * MIX_LEVEL;
      }
      m[name] = buf;
    }
    return m[name];
  }
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
    if (bank && SAMPLED[name === 'start' ? 'fruit' : name]) {
      const src = ctx.createBufferSource(); src.buffer = mixedBuffer(ctx, name === 'start' ? 'fruit' : name); src.connect(dest); src.start(t0);
      return { stop() { try { src.stop(); } catch { /* already over */ } } };
    }
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
  return { play, SOUNDS, WAVES, FRAME, SAMPLED, MIX_RATE, useRom, mix, hasRom: () => !!bank, duration: name => frames(SOUNDS[name]) * FRAME };
});
