// Whole matches between CPUs follow the original's rules: roles pass to the catcher, scores carry, the target ends it.
const { Match } = require('../shared/match.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
for (const seed of [3, 7, 11]) {
  const m = new Match(() => false, seed, { target: 7000 }); m.start();
  ok(m.scores[m.pac] === 1600 && m.scores.reduce((a, b) => a + b, 0) === 1600, 'first Pac-Man starts with 1600');
  let ticks = 0, handovers = 0, prevPac = m.pac;
  while (m.phase !== 'final' && ticks < 30 * 60 * 40) {
    const before = m.phase; m.tick([null, null, null, null]); ticks++;
    if (before === 'roundover' && m.phase === 'countdown') {
      const why = m.sim.overReason; ok(why !== 'won', 'a won match must not start another round');
      if (m.pac !== prevPac) handovers++;
      prevPac = m.pac;
    }
  }
  ok(m.phase === 'final', `seed ${seed}: match should finish`);
  ok(m.scores[m.winner] >= 7000, `seed ${seed}: winner has the target`);
  ok(handovers >= 1, `seed ${seed}: Pac-Man role should have passed to a catcher`);
  console.log(`seed ${seed}: ${(ticks / 30 / 60).toFixed(1)} min, ${m.round + 1} rounds, ${handovers} hand-overs, scores ${m.scores}, winner P${m.winner + 1}`);
}
console.log(fails ? fails + ' FAILED' : 'match flow ok'); process.exit(fails ? 1 : 0);
