// A whole match (4 rounds, every seat CPU) must reach 'final' with each player having been Pac-Man once.
const { Match } = require('../shared/match.js');
const m = new Match(() => false, 7);
m.start();
const pacs = new Set(); let ticks = 0, phases = [];
while (m.phase !== 'final' && ticks < 30 * 60 * 20) {
  const before = m.phase; m.tick([null, null, null, null]); ticks++;
  if (m.phase !== before) phases.push(m.phase);
  if (m.sim) pacs.add(m.sim.pacPlayer);
}
const total = m.scores.reduce((a, b) => a + b, 0);
console.log('phases:', phases.join(' > '));
console.log(`finished in ${(ticks / 30 / 60).toFixed(1)} sim-minutes, scores`, m.scores.join(','), 'pac players', [...pacs].sort().join(','));
if (m.phase !== 'final' || pacs.size !== 4 || total <= 0) { console.log('FAIL'); process.exit(1); }
console.log('match flow ok');
