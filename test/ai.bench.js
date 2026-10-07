// CPU skill benchmark: Pac-Man at level P against ghosts at level G, N rounds each, on one maze.
// usage: node test/ai.bench.js [rounds] [builtin|path-to-disc-image]
const S = require('../shared/sim.js');
function run(Sim, pl, gl, seeds) {
  let cleared = 0, caught = 0, pel = 0, surv = 0, ghostsEaten = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const rng = Sim.mulberry(seed * 7919 + pl * 13 + gl);
    const s = Sim.newRound([1600, 0, 0, 0], seed % 4, { target: 1e9 });
    let steps = 0;
    while (!s.over && steps < 30 * 600) {
      Sim.update(s, { pac: Sim.cpuPac(s, rng, pl), ghosts: [0, 1, 2].map(i => Sim.cpuGhost(s, i, rng, gl)) });
      if (s.events.includes('eatghost')) ghostsEaten++;
      steps++;
    }
    pel += (s.total - s.left) / s.total; surv += s.time;
    if (s.overReason === 'cleared') cleared++; else if (s.overReason === 'caught') caught++;
  }
  return { pl, gl, cleared: cleared / seeds, caught: caught / seeds, pellets: pel / seeds, surviveSec: surv / seeds, ghostsEaten: ghostsEaten / seeds };
}
(async () => {
  const N = +process.argv[2] || 24; let Sim = S, name = 'built-in maze';
  if (process.argv[3] && process.argv[3] !== 'builtin') {
    const fs = require('fs'), Disc = require('../client/disc.js'), Gbamap = require('../client/gbamap.js'); const file = process.argv[3];
    const blob = { slice: (a, b) => ({ arrayBuffer: async () => { const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(b - a); fs.readSync(fd, buf, 0, b - a, a); fs.closeSync(fd); return buf.buffer.slice(buf.byteOffset, buf.byteOffset + (b - a)); } }) };
    const d = await Disc.open(blob); Sim = S.create(Gbamap.stage1(await d.read('PROOT/gbademo/packman.bin'), S.makeMaze)); name = 'original stage 1';
  }
  console.log(`maze: ${name}, ${N} rounds per row. Pac-Man scores 10 per pellet; ghosts are exactly as fast as Pac-Man.`);
  console.log('pac  ghost | cleared caught | pellets%  surviveSec  ghostsEaten');
  for (const [p, g] of [[0, 1], [1, 1], [2, 1], [1, 0], [1, 2], [2, 2]]) {
    const r = run(Sim, p, g, N);
    console.log(`${r.pl}    ${r.gl}     | ${(r.cleared * 100).toFixed(0).padStart(4)}%  ${(r.caught * 100).toFixed(0).padStart(4)}%  | ${(r.pellets * 100).toFixed(0).padStart(4)}%     ${r.surviveSec.toFixed(0).padStart(5)}       ${r.ghostsEaten.toFixed(1)}`);
  }
})();
