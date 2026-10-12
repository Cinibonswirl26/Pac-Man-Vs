// node test/jpa.test.js <disc image>: the particle file on the player's disc, and the exchange screen's effects
// (emitters 14 and 15 on the winner's circle, 11 on the loser's) run through the simulator.
const fs = require('fs'), Disc = require('../client/disc.js'), JPA = require('../client/jpa.js');
const file = process.argv[2]; if (!file) { console.log('usage: node test/jpa.test.js <image>'); process.exit(2); }
const blob = { slice: (a, b) => ({ arrayBuffer: async () => { const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(b - a); fs.readSync(fd, buf, 0, b - a, a); fs.closeSync(fd); return buf.buffer.slice(buf.byteOffset, buf.byteOffset + (b - a)); } }) };
(async () => {
  const d = await Disc.open(blob);
  let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
  const P = JPA.parse(new Uint8Array(await d.read('PROOT/Effect/pacman_particle00.jpc')));
  ok(P.resources.size > 15 && P.textures.length > 8, `${P.resources.size} emitters, ${P.textures.length} textures`);
  ok(!P.unknown.length || P.unknown.every(t => /^[A-Z0-9]{4}$/.test(t)), 'block tags ' + P.unknown);
  for (const id of [11, 14, 15]) {
    const r = P.resources.get(id);
    ok(r && r.bem && r.bsp && r.esp, `emitter ${id} has its emitter, look and life blocks`);
    const t = P.textures[r.tdb[r.bsp.texIdx]], img = Disc.decodeBTI(t.bti);
    ok(img.w > 0 && img.h > 0 && img.rgba.some(v => v > 0), `emitter ${id} texture ${t.name}`);
    const e = JPA.emitter(r, 7); let most = 0;
    for (let f = 0; f < 300; f++) { e.step(); most = Math.max(most, e.count); }
    const q = e.quads(320, 240, 1);
    ok(q.every(x => x.pts.every(p => Number.isFinite(p[0]) && Number.isFinite(p[1])) && Number.isFinite(x.alpha)), `emitter ${id}: no NaNs`);
    ok(most > 0 && most < 200, `emitter ${id}: ${most} particles at most`);
  }
  // the sunburst: twelve rays a burst (one per division of its circle), bursts 91 frames apart
  const sun = JPA.emitter(P.resources.get(14), 1); sun.step();
  ok(sun.count === 12 && P.resources.get(14).bem.div === 12, 'sunburst: twelve rays at once');
  // the loser's streaks: the spawn rate follows its key-framed curve between 0.1 and 0.7 a frame
  const k = P.resources.get(11).keys[0];
  ok(k && k.loop && Math.abs(JPA.curve(k, 0) - 0.1) < 1e-6 && Math.abs(JPA.curve(k, 15) - 0.4) < 1e-3 && Math.abs(JPA.curve(k, 30) - 0.1) < 1e-6, 'streak rate curve, looping every 30 frames');
  if (fails) process.exit(1); console.log('particles ok');
})().catch(e => { console.log('FAIL', e.stack); process.exit(1); });
