// Whole matches between CPUs follow the original's rules: roles pass to the catcher, scores carry, the target ends it.
const { Match } = require('../shared/match.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
for (const seed of [3, 7, 12]) {
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
// Hand-over: when a person catches Pac-Man the match waits for them to be ready before the next round.
{
  const { HANDOFF } = require('../shared/match.js');
  // An idle human Pac-Man and three CPU ghosts: the catcher is a CPU, so there is no hand-over.
  const m1 = new Match(i => i === 0, 9, { start: 'pac' }); m1.start();
  let hand = false, t = 0;
  while (t++ < 30 * 120 && m1.round === 0) { m1.tick([null, null, null, null]); if (m1.phase === 'handoff') hand = true; }
  ok(m1.round === 1 && !hand && m1.pac !== 0, 'a CPU catcher becomes Pac-Man without a hand-over');
  // A human ghost catcher: drive the catch by hand.
  const m2 = new Match(i => i === 1, 9, { start: 'pac' }); m2.start();
  while (m2.phase !== 'play') m2.tick([null, null, null, null]);
  const gi = m2.sim.ghosts.findIndex((g, k) => m2.Sim.playerOfGhost(m2.sim, k) === 1);
  Object.assign(m2.sim.ghosts[gi], { x: m2.sim.pac.x, y: m2.sim.pac.y });
  m2.tick([null, null, null, null]);
  ok(m2.phase === 'roundover' && m2.sim.catcher === 1, 'human ghost caught Pac-Man');
  while (m2.phase === 'roundover') m2.tick([null, null, null, null]);
  ok(m2.phase === 'handoff' && m2.pac === 1 && m2.view(1).next === 1 && m2.view(1).me >= 0, 'hand-over waits for the catcher, who still sees the old round');
  for (let k = 0; k < 30; k++) m2.tick([null, null, null, null]);
  ok(m2.phase === 'handoff', 'hand-over keeps waiting');
  ok(!m2.ready(0) && m2.ready(1) && m2.phase === 'countdown' && m2.view(1).me === -1, 'the catcher says ready and starts as Pac-Man');
  // ... or it starts by itself after the time limit
  const m3 = new Match(i => i === 1, 9, { start: 'pac' }); m3.start();
  while (m3.phase !== 'play') m3.tick([null, null, null, null]);
  const g3 = m3.sim.ghosts.findIndex((g, k) => m3.Sim.playerOfGhost(m3.sim, k) === 1);
  Object.assign(m3.sim.ghosts[g3], { x: m3.sim.pac.x, y: m3.sim.pac.y });
  let n = 0; while (m3.phase !== 'countdown' || m3.round === 0) { m3.tick([null, null, null, null]); n++; if (n > 30 * 40) break; }
  ok(m3.round === 1 && m3.pac === 1 && n >= 30 * (5 + HANDOFF) - 2, 'hand-over times out into the next round');
  // ... or at once if the catcher left and a CPU took the seat
  const humans = new Set([1]); const m4 = new Match(i => humans.has(i), 9, { start: 'pac' }); m4.start();
  while (m4.phase !== 'play') m4.tick([null, null, null, null]);
  const g4 = m4.sim.ghosts.findIndex((g, k) => m4.Sim.playerOfGhost(m4.sim, k) === 1);
  Object.assign(m4.sim.ghosts[g4], { x: m4.sim.pac.x, y: m4.sim.pac.y });
  while (m4.phase !== 'handoff') m4.tick([null, null, null, null]);
  humans.delete(1); m4.tick([null, null, null, null]);
  ok(m4.phase === 'countdown', 'a CPU replacing the catcher skips the hand-over');
}
console.log(fails ? fails + ' FAILED' : 'match flow ok'); process.exit(fails ? 1 : 0);
