const S = require('../shared/sim.js');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const near = (a, b, eps) => Math.abs(a - b) <= eps;
const idle = { pac: null, ghosts: [null, null, null] };

// 1. Movement: nothing walks into a wall or off its lane, Pac-Man eats pellets
for (let seed = 1; seed <= 20; seed++) {
  const rng = S.mulberry(seed);
  const s = S.newRound([1600, 0, 0, 0], 0);
  let steps = 0, moved = 0, lastX = s.pac.x, lastY = s.pac.y;
  while (!s.over && steps < 30 * 240) {
    S.update(s, { pac: S.cpuPac(s, rng, 1), ghosts: [0, 1, 2].map(i => S.cpuGhost(s, i, rng, 1)) });
    steps++;
    for (const e of [s.pac, ...s.ghosts.filter(g => g.mode !== 'respawn')]) {
      const x = Math.floor(e.x), y = Math.floor(e.y);
      ok(S.ROWS[y][((x % S.W) + S.W) % S.W] !== '#', `seed ${seed} step ${steps}: entity in wall at ${e.x},${e.y}`);
      const onX = Math.abs(e.x - Math.floor(e.x) - 0.5) < 1e-3, onY = Math.abs(e.y - Math.floor(e.y) - 0.5) < 1e-3;
      ok(onX || onY, `seed ${seed} step ${steps}: off-lane ${e.x},${e.y}`);
    }
    if (Math.hypot(s.pac.x - lastX, s.pac.y - lastY) > 1e-6) moved++;
    lastX = s.pac.x; lastY = s.pac.y;
    if (fails > 5) break;
  }
  ok(moved > 30, `seed ${seed}: pac barely moved (${moved})`);
}

// 2. Measured speeds: 0.5 px/frame normal, 0.375 px/frame frightened, ghosts as fast as Pac-Man
ok(near(S.CFG.pacSpeed, 3.733, 0.002) && S.CFG.ghostSpeed === S.CFG.pacSpeed, 'pac and ghost speed');
ok(near(S.CFG.frightSpeed / S.CFG.ghostSpeed, 0.75, 1e-9), 'frightened speed is 3/4 of normal');
{ // a free-running Pac-Man covers one cell in 16 frames
  const s = S.newRound([1600, 0, 0, 0], 0);
  const px = Math.floor(s.pac.x), py = Math.floor(s.pac.y);
  const dir = [0, 1, 2, 3].find(d => !'#=D_'.includes(S.ROWS[py + S.DIRS[d][1]][(px + S.DIRS[d][0] + S.W) % S.W]));
  s.pac.dir = dir; s.pac.want = dir;
  const startX = s.pac.x, startY = s.pac.y; let t = 0;
  while (Math.hypot(s.pac.x - startX, s.pac.y - startY) < 1 - 1e-9 && t < 200) { S.update(s, idle); t++; if (s.over) break; }
  const secs = t * S.CFG.tick; ok(near(secs, 16 / 59.7275, 0.04), `one cell should take ${(16 / 59.7275).toFixed(3)}s, took ${secs.toFixed(3)}s`);
}

// 3. Fog of war: ghosts only receive nearby entities and pellets
{
  const s = S.newRound([1600, 0, 0, 0], 0);
  const g1 = S.view(s, 1);
  ok(g1.pellets.filter(Boolean).length < s.total / 3, 'ghost sees too many pellets');
  ok(S.view(s, 0).pellets.filter(Boolean).length === s.total, 'pac should see all pellets');
  ok(S.view(s, 0).ghosts.every(Boolean), 'pac should see every ghost');
  s.pac.x = 1.5; s.pac.y = 19.5;
  const v = S.view(s, S.playerOfGhost(s, 0));
  ok(v.pac === null, 'far Pac-Man must stay hidden from ghosts');
  ok(v.ghosts.every(g => g), 'ghosts always see their teammates (minimap)');
}

// 4. Start of a round: three ghosts, every start cell is open floor, pellet count matches the maze
{
  for (const [name, m] of [['built-in', S.BUILTIN]]) {
    const open = ([x, y]) => !'#=D_'.includes(m.rows[y][x]);
    ok(open(m.pac), name + ': Pac-Man start cell must be open'); m.ghosts.forEach((g, i) => ok(open(g), name + ': ghost ' + i + ' start must be open'));
    ok(open(m.exit), name + ': exit cell must be open'); ok(m.rows[m.door[1]][m.door[0]] === 'D', name + ': door cell');
  }
  const s = S.newRound([1600, 0, 0, 0], 2);
  ok(s.ghosts.length === 3, 'three ghosts'); ok(S.view(s, 0).ghosts.length === 3, 'view lists 3 ghosts');
  ok(s.ghosts.every(g => g.mode === 'normal'), 'ghosts start ready to play');
  ok(s.pacPlayer === 2 && S.ghostIndexOf(s, 2) === -1, 'pac player');
}

// 4b. A maze descriptor sent over the network has no width/height; create() must cope
{ const bare = { rows: S.BUILTIN.rows, pac: S.BUILTIN.pac, ghosts: S.BUILTIN.ghosts, door: S.BUILTIN.door, exit: S.BUILTIN.exit, house: S.BUILTIN.house };
  const T = S.create(JSON.parse(JSON.stringify(bare))); ok(T.W === S.BUILTIN.W && T.H === S.BUILTIN.H, 'create() should derive the size from the rows'); const r = T.newRound([1600, 0, 0, 0], 0); ok(r.left > 100, 'bare maze round'); }

// 5. Points: pellet 10, power pellet 110, ghost chain 200/400/800/1600
{
  const s = S.newRound([1600, 0, 0, 0], 0); const before = s.scores[0];
  const i = s.pellets.findIndex(v => v === 1); s.pac.x = (i % S.W) + 0.5; s.pac.y = Math.floor(i / S.W) + 0.5; S.update(s, idle);
  ok(s.scores[0] === before + 10, 'pellet = 10 points, got ' + (s.scores[0] - before));
  const j = s.pellets.findIndex(v => v === 2); s.pac.x = (j % S.W) + 0.5; s.pac.y = Math.floor(j / S.W) + 0.5; const b2 = s.scores[0]; S.update(s, idle);
  ok(s.scores[0] === b2 + 110, 'power pellet = 110 points, got ' + (s.scores[0] - b2));
  ok(s.ghosts.every(g => g.mode === 'fright') && near(s.frightLeft, 10, 0.1), 'power pellet frightens every ghost for 10 s');
  const got = [];
  for (let k = 0; k < 3; k++) { s.ghosts[k].mode = 'fright'; s.ghosts[k].x = s.pac.x; s.ghosts[k].y = s.pac.y; const b = s.scores[0]; S.update(s, idle); got.push(s.scores[0] - b); }
  ok(got.join() === '200,400,800', 'ghost chain, got ' + got);
}

// 6. Frightened phase lasts 10 s and ends
{
  const s = S.newRound([1600, 0, 0, 0], 0); s.frightLeft = S.CFG.frightTime; s.ghosts.forEach(g => { g.mode = 'fright'; });
  let t = 0; while (s.frightLeft > 0 && t < 1000) { S.update(s, idle); t++; if (s.over) break; }
  ok(near(t * S.CFG.tick, 10, 0.1), 'frightened phase length'); ok(s.ghosts.every(g => g.mode !== 'fright'), 'ghosts return to normal');
}

// 7. Catching Pac-Man: round ends, catcher steals 1600 and becomes Pac-Man; Pac-Man keeps the rest
{
  const s = S.newRound([1610, 0, 0, 0], 0);
  s.ghosts[1].x = s.pac.x; s.ghosts[1].y = s.pac.y; S.update(s, idle);
  const catcher = S.playerOfGhost(s, 1);
  ok(s.over && s.overReason === 'caught', 'a catch ends the round');
  ok(s.catcher === catcher && s.steal === 1600, 'catcher and stolen amount');
  ok(s.scores[0] === 10 && s.scores[catcher] === 1600, `scores after catch: ${s.scores}`);
  const t = S.newRound([1000, 0, 0, 0], 0); t.ghosts[0].x = t.pac.x; t.ghosts[0].y = t.pac.y; S.update(t, idle);
  ok(t.steal === 1000 && t.scores[0] === 0, 'a catch cannot steal more than Pac-Man has');
}

// 8. Reaching the target score wins at once
{
  const s = S.newRound([6990, 0, 0, 0], 0, { target: 7000 });
  const i = s.pellets.findIndex(v => v === 1); s.pac.x = (i % S.W) + 0.5; s.pac.y = Math.floor(i / S.W) + 0.5; S.update(s, idle);
  ok(s.over && s.overReason === 'won' && s.winner === 0, 'Pac-Man reaching the target wins');
  const t = S.newRound([0, 0, 0, 6500], 0, { target: 7000 });
  t.scores[0] = 1600; t.scores[3] = 6500; t.ghosts[2].x = t.pac.x; t.ghosts[2].y = t.pac.y; S.update(t, idle);
  ok(t.over && t.overReason === 'won' && t.winner === S.playerOfGhost(t, 2), 'a catcher whose steal reaches the target wins, ' + t.overReason + t.winner);
}
// 9. Fruit: appears after enough pellets; a ghost taking it gets 400 points and a wider view for a while
{
  const s = S.newRound([1600, 0, 0, 0], 0); s.eaten = S.CFG.fruitFirst - 1;
  const i = s.pellets.findIndex(v => v === 1); s.pac.x = (i % S.W) + 0.5; s.pac.y = Math.floor(i / S.W) + 0.5; S.update(s, idle);
  ok(s.fruit, 'fruit appears after enough pellets'); ok(S.view(s, 0).fruit, 'Pac-Man sees the fruit');
  const g = s.ghosts[1], p = S.playerOfGhost(s, 1), before = s.scores[p], base = S.view(s, p).sight;
  g.x = s.fruit.x; g.y = s.fruit.y; S.update(s, idle);
  ok(!s.fruit && s.scores[p] === before + 400, 'ghost gets 400 for the fruit, got ' + (s.scores[p] - before));
  const v = S.view(s, p); ok(v.sight > base * 1.5 && v.boost > 0, 'ghost view is wider after the fruit');
  let t = 0; while (S.view(s, p).boost > 0 && t < 2000) { S.update(s, idle); t++; if (s.over) break; }
  ok(near(t * S.CFG.tick, S.CFG.fruitSightTime, 0.3), 'view boost lasts ' + S.CFG.fruitSightTime + 's');
  const u = S.newRound([1600, 0, 0, 0], 0); u.eaten = 6; const k = u.pellets.findIndex(v => v === 1); u.pac.x = (k % S.W) + 0.5; u.pac.y = Math.floor(k / S.W) + 0.5; S.update(u, idle);
  const b0 = u.scores[0]; u.pac.x = u.fruit.x; u.pac.y = u.fruit.y; S.update(u, idle); ok(u.scores[0] === b0 + 400, 'Pac-Man can take the fruit too');
}
// 10. Clearing every pellet gives Pac-Man 1600
{
  const s = S.newRound([1600, 0, 0, 0], 0, { target: 1e9 }); s.pellets.fill(0); const k = S.ROWS.join('').indexOf('.');
  s.pellets[k] = 1; s.left = 1; s.pac.x = (k % S.W) + 0.5; s.pac.y = Math.floor(k / S.W) + 0.5; const b = s.scores[0]; S.update(s, idle);
  ok(s.over && s.overReason === 'cleared' && s.scores[0] === b + 10 + 1600, 'clearing the maze: +1600 bonus');
}
console.log(fails ? `${fails} FAILED` : 'all sim checks passed');
process.exit(fails ? 1 : 0);
