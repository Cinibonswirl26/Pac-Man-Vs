const S = require('../shared/sim.js');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };

// 1. Pac-Man walks: never inside a wall, stays on lane, eats pellets
for (let seed = 1; seed <= 20; seed++) {
  const rng = S.mulberry(seed);
  const s = S.newRound(null, seed % 4, null);
  let steps = 0, moved = 0, lastX = s.pac.x, lastY = s.pac.y;
  while (!s.over && steps < 30 * 190) {
    const inputs = { pac: S.cpuPac(s, rng), ghosts: [0, 1, 2].map(i => S.cpuGhost(s, i, rng)) };
    S.update(s, inputs);
    steps++;
    for (const e of [s.pac, ...s.ghosts.filter(g => g.out && g.mode !== 'respawn')]) {
      const x = Math.floor(e.x), y = Math.floor(e.y);
      ok(!(S.ROWS[y][((x % 23) + 23) % 23] === '#'), `seed ${seed} step ${steps}: entity in wall at ${e.x},${e.y}`);
      // must be on a lane: one coordinate at a tile centre
      const onX = Math.abs(e.x - Math.floor(e.x) - 0.5) < 1e-3, onY = Math.abs(e.y - Math.floor(e.y) - 0.5) < 1e-3;
      ok(onX || onY, `seed ${seed} step ${steps}: off-lane ${e.x},${e.y}`);
    }
    if (Math.hypot(s.pac.x - lastX, s.pac.y - lastY) > 1e-6) moved++;
    lastX = s.pac.x; lastY = s.pac.y;
    if (fails > 5) break;
  }
  ok(moved > 100, `seed ${seed}: pac barely moved (${moved})`);
  ok(s.total - s.left > 20, `seed ${seed}: pac ate only ${s.total - s.left} pellets`);
  if (seed <= 3) console.log(`seed ${seed}: ${s.overReason || 'running'} after ${(steps / 30).toFixed(0)}s, pellets ${s.total - s.left}/${s.total}, lives ${s.lives}, scores ${s.roundScores}`);
}

// 2. Fog of war: ghosts must not receive far-away entities or pellets
{
  const s = S.newRound(null, 0, null);
  const g1 = S.view(s, 1);
  const far = g1.pellets.filter(Boolean).length;
  ok(far < s.total / 3, `ghost sees too many pellets (${far}/${s.total})`);
  ok(S.view(s, 0).pellets.filter(Boolean).length === s.total, 'pac should see all pellets');
  ok(S.view(s, 0).ghosts.every(Boolean), 'pac should see every ghost');
  s.pac.x = 1.5; s.pac.y = 19.5; s.ghosts[1].x = 20.5; s.ghosts[1].y = 1.5;
  ok(S.view(s, 1).pac === null || S.dist(s.ghosts[0], s.pac) <= S.CFG.ghostSight, 'far pac leaked to ghost');
  ok(S.view(s, S.playerOfGhost(s, 0)).ghosts[1] === null, 'far ghost leaked to another ghost');
}

// 2b. exactly three ghosts, one per ghost player
{ const s = S.newRound(null, 0, null); ok(s.ghosts.length === 3, 'expected 3 ghosts, got ' + s.ghosts.length); ok(S.view(s, 0).ghosts.length === 3, 'view must list 3 ghosts'); }

// 3. Role rotation covers every player exactly once over 4 rounds
{
  const seen = new Set();
  for (let r = 0; r < 4; r++) seen.add(S.newRound(null, r, null).pacPlayer);
  ok(seen.size === 4, 'each player should be Pac-Man once');
}
console.log(fails ? `${fails} FAILED` : 'all sim checks passed');
process.exit(fails ? 1 : 0);
