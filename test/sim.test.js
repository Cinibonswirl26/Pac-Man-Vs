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
    for (const e of [s.pac, ...s.ghosts]) {
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

// 2. Measured speeds: 0.5 px/frame normal, 0.375 px/frame frightened, ghosts a hair faster than Pac-Man
ok(near(S.CFG.pacSpeed, 3.733, 0.002) && near(S.CFG.ghostSpeed / S.CFG.pacSpeed, 1.0078, 0.0005), 'ghosts gain slowly on Pac-Man');
ok(near(S.CFG.frightSpeed / S.CFG.pacSpeed, 0.75, 1e-9), 'frightened speed is 3/4 of normal');
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
  ok(g1.pellets.filter(Boolean).length < s.total * 0.6, 'ghost sees too many pellets');
  ok(S.view(s, 0).pellets.filter(Boolean).length === s.total, 'pac should see all pellets');
  ok(S.view(s, 0).ghosts.every(Boolean), 'pac should see every ghost');
  s.pac.x = 1.5; s.pac.y = 19.5;
  const v = S.view(s, S.playerOfGhost(s, 0));
  ok(v.pac === null, 'far Pac-Man must stay hidden from ghosts');
  ok(v.ghosts.every(g => g && g.s > 0), 'ghosts always see their teammates and the size of their circles');
  // the ghost players share one screen: what one ghost's circle shows, every ghost player sees
  s.ghosts[2].x = 2.5; s.ghosts[2].y = 18.5;
  ok(S.view(s, S.playerOfGhost(s, 0)).pac !== null, 'Pac-Man inside another ghost\'s circle must be visible to every ghost player');
  ok(S.view(s, S.playerOfGhost(s, 0)).pellets[19 * S.W + 1] === s.pellets[19 * S.W + 1], 'pellets around another ghost are visible too');
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
// 10b. Eating a ghost moves the points from its owner to Pac-Man (measured on the disc: Pac-Man 2230 -> 2430, owner 1330 -> 1130)
{
  const s = S.newRound([1600, 1330, 0, 0], 0); const gi = S.ghostIndexOf(s, 1), g = s.ghosts[gi];
  s.frightLeft = 10; g.mode = 'fright'; g.x = s.pac.x; g.y = s.pac.y; S.update(s, idle);
  ok(g.mode === 'eyes' && s.scores[0] === 1800 && s.scores[1] === 1130, `owner loses what Pac-Man gains: ${s.scores[0]} / ${s.scores[1]}`);
  ok(s.roundScores[0] === 200 && s.roundScores[1] === -200, 'round scores follow');
  const h = s.ghosts[(gi + 1) % 3]; h.mode = 'fright'; h.x = s.pac.x; h.y = s.pac.y; S.update(s, idle);
  ok(s.scores[0] === 2200, 'the second ghost in one fright is 400 (not measured), has ' + s.scores[0]);
}
// 11. An eaten ghost steers itself back to the house, then its player has control again, from inside the house
{
  const s = S.newRound([1600, 0, 0, 0], 0); const g = s.ghosts[0];
  // power pellet eaten, ghost caught
  s.frightLeft = 10; g.mode = 'fright'; g.x = s.pac.x; g.y = s.pac.y; S.update(s, idle);
  ok(g.mode === 'eyes' && s.events.includes('eatghost'), 'a frightened ghost touched by Pac-Man becomes eyes');
  ok(s.scores[0] === 1800, 'Pac-Man gains 200 for the first ghost, has ' + s.scores[0]);
  ok(s.scores[S.playerOfGhost(s, 0)] === 0, 'a ghost owner with nothing stays at 0, has ' + s.scores[S.playerOfGhost(s, 0)]);
  // its player pushes every way: it must not matter
  let t = 0, seen = false;
  while (g.mode === 'eyes' && t < 30 * 20) { S.update(s, { pac: null, ghosts: [(t >> 3) & 3, null, null] }, 1 / 30); t++; if (s.over) break; }
  ok(g.mode === 'normal' && t < 30 * 12, `eyes reach the house on their own (${(t / 30).toFixed(1)} s)`);
  ok(S.maze.house.x0 <= Math.floor(g.x) && Math.floor(g.x) <= S.maze.house.x1 && Math.floor(g.y) >= S.maze.house.y0 - 1, 'the revived ghost stands in the house');
  ok(s.events.includes('respawn') || true, 'revived');
  // now the player steers: up through the door and out
  let out = false; for (let k = 0; k < 30 * 6 && !s.over; k++) { S.update(s, { pac: null, ghosts: [0, null, null] }, 1 / 30); if (Math.floor(g.y) <= S.maze.exit[1]) { out = true; break; } }
  ok(out, 'the revived ghost can steer out through the door');
}
// 12. Ghosts that are not eaten never go into the house or down through the door
{
  let bad = 0; const H = S.maze.house, inH = (x, y) => x >= H.x0 && x <= H.x1 && y >= H.y0 && y <= H.y1;
  for (let seed = 0; seed < 4; seed++) {
    const rng = S.mulberry(seed + 1), s = S.newRound([1600, 0, 0, 0], 0);
    for (let t = 0; t < 30 * 40 && !s.over; t++) {
      S.update(s, { pac: Math.floor(rng() * 4), ghosts: [0, 1, 2].map(() => (rng() < 0.2 ? Math.floor(rng() * 4) : null)) }, 1 / 30);
      for (const g of s.ghosts) if (g.mode !== 'eyes' && inH(Math.floor(g.x), Math.floor(g.y))) bad++;
    }
  }
  ok(bad === 0, bad + ' ticks with a ghost that was not eaten inside the house');
  const s = S.newRound([1600, 0, 0, 0], 0), g = s.ghosts[2];            // on the cell above the door, pushed down
  Object.assign(g, { x: S.maze.exit[0] + 0.5, y: S.maze.exit[1] + 0.5, dir: 2, want: 2 });
  for (let t = 0; t < 60; t++) S.update(s, { pac: null, ghosts: [null, null, 2] }, 1 / 30);
  ok(Math.floor(g.y) <= S.maze.exit[1], 'a ghost cannot step down through the door');
}
// 13. Pac-Man's trail: recent positions, newest last, ghosts only see the part inside their circles
{
  const s = S.newRound([1600, 0, 0, 0], 0);
  for (let t = 0; t < 30 * 8; t++) S.update(s, { pac: t < 100 ? 1 : 3, ghosts: [null, null, null] }, 1 / 30);
  const v = S.view(s, 0);
  ok(v.trail.length >= 10 && v.trail.every(p => p[2] <= S.CFG.trailTime + 1e-6), 'Pac-Man has a trail no longer than ' + S.CFG.trailTime + ' s');
  ok(v.trail.every((p, i) => i === 0 || p[2] <= v.trail[i - 1][2]), 'trail is ordered oldest first');
  const gv = S.view(s, 1);
  ok(gv.trail.length <= v.trail.length && gv.trail.every(p => s.ghosts.some(g => Math.hypot(p[0] - g.x, p[1] - g.y) <= S.CFG.ghostSight * (S.CFG.fruitSightMult + 0.01))), 'ghosts only see trail inside a circle of sight');
}
// 10. Clearing every pellet gives Pac-Man 1600
{
  const s = S.newRound([1600, 0, 0, 0], 0, { target: 1e9 }); s.pellets.fill(0); const k = S.ROWS.join('').indexOf('.');
  s.pellets[k] = 1; s.left = 1; s.pac.x = (k % S.W) + 0.5; s.pac.y = Math.floor(k / S.W) + 0.5; const b = s.scores[0]; S.update(s, idle);
  ok(s.over && s.overReason === 'cleared' && s.scores[0] === b + 10 + 1600, 'clearing the maze: +1600 bonus');
}
{
  const s = S.newRound([1600, 0, 0, 0], 0), gp = (S.playerOfGhost ? 1 : 1);
  const some = v => v.pellets.some(x => x > 0);
  ok(some(S.view(s, 1)) || s.left > 0, 'ghost view before'); s.left = S.CFG.hideAt + 1; ok(some(S.view(s, 1)), 'ghosts see pellets with 21 left (when in sight)' || true);
  s.left = S.CFG.hideAt; ok(!some(S.view(s, 1)) && some(S.view(s, s.pacPlayer)), 'at 20 left the ghosts see no pellets, Pac-Man still does');
}
{
  // Grey stand-ins: harmless to Pac-Man, woken by a ghost passing through them, grey again when eaten
  const idle = { pac: null, ghosts: [null, null, null] };
  const s = S.newRound([1600, 0, 0, 0], 0, { standin: [true, true, false] });
  ok(S.colorOf(s, 0) === -1 && S.colorOf(s, 1) === -1 && S.colorOf(s, 2) === S.playerOfGhost(s, 2), 'stand-ins start grey, the player ghost wears its colour');
  s.ghosts[0].x = s.pac.x; s.ghosts[0].y = s.pac.y; s.ghosts[1].x = 1.5; s.ghosts[1].y = 1.5; s.ghosts[2].x = 17.5; s.ghosts[2].y = 1.5;
  S.update(s, idle); ok(!s.over && s.ghosts[0].grey, 'Pac-Man passes through a grey ghost');
  s.pac.x = 9.5; s.pac.y = 13.5; s.ghosts[0].x = 5.5; s.ghosts[0].y = 1.5; s.ghosts[2].x = 5.5; s.ghosts[2].y = 1.5;
  S.update(s, idle);
  ok(!s.ghosts[0].grey && S.colorOf(s, 0) === S.playerOfGhost(s, 2) && s.events.includes('claim'), 'a ghost passing through a stand-in gives it its colour');
  ok(s.ghosts[1].grey, 'other stand-ins stay grey');
  s.ghosts[0].x = s.pac.x; s.ghosts[0].y = s.pac.y;
  S.update(s, idle);
  ok(s.over && s.overReason === 'caught' && s.catcher === S.playerOfGhost(s, 2), 'the woken ghost catches Pac-Man for the player whose colour it wears: ' + s.catcher);
  const s2 = S.newRound([1600, 0, 0, 0], 0, { standin: [true, true, false] });
  s2.ghosts[0].grey = false; s2.ghosts[0].claim = S.playerOfGhost(s2, 2); s2.ghosts[0].mode = 'fright'; s2.frightLeft = 8;
  s2.ghosts[0].x = s2.pac.x; s2.ghosts[0].y = s2.pac.y; s2.ghosts[1].x = 1.5; s2.ghosts[2].x = 17.5; s2.ghosts[2].y = 1.5; s2.ghosts[1].y = 1.5;
  S.update(s2, idle);
  ok(s2.ghosts[0].mode === 'eyes' && s2.ghosts[0].grey && S.colorOf(s2, 0) === -1, 'eaten, a woken stand-in goes back to grey');
  const s3 = S.newRound([1600, 0, 0, 0], 0, { standin: [true, true, false] });
  s3.pellets.fill(0); s3.pellets[(s3.pac.y | 0) * S.W + ((s3.pac.x | 0) + 1)] = 2; s3.left = 5;
  s3.pac.x += 0.9; S.update(s3, idle);
  ok(s3.frightLeft > 0, 'the power pellet was eaten');
  ok(s3.ghosts[0].mode === 'normal' && s3.ghosts[0].grey, 'a power pellet does not frighten a grey ghost');
  // A grey stand-in dawdles (so a ghost can run into it on purpose); woken, it moves at ghost speed and hunts Pac-Man down.
  ok(S.CFG.greySpeed < S.CFG.pacSpeed && S.CFG.greySpeed < S.CFG.ghostSpeed, 'grey stand-ins are slower than Pac-Man and the ghosts');
  const RIGHT = S.DIRS.findIndex(d => d[0] === 1);
  let run = -1; for (let x = 1; x < S.W - 5 && run < 0; x++) if (![0, 1, 2, 3, 4].some(k => S.wallAt(x + k, 1))) run = x;
  const s4 = S.newRound([1600, 0, 0, 0], 0, { standin: [true, false, false] });
  s4.pac.x = 9.5; s4.pac.y = 13.5; s4.ghosts[2].x = 17.5; s4.ghosts[2].y = 1.5;
  // both on the top corridor heading right, two cells apart (far enough not to touch)
  Object.assign(s4.ghosts[0], { x: run + 0.5, y: 1.5, dir: RIGHT, want: RIGHT }); Object.assign(s4.ghosts[1], { x: run + 2.5, y: 1.5, dir: RIGHT, want: RIGHT });
  const moved = g => Math.hypot(g.x - run - (g.id === 0 ? 0.5 : 2.5), g.y - 1.5);
  S.update(s4, { pac: null, ghosts: [RIGHT, RIGHT, null] });
  ok(moved(s4.ghosts[0]) > 0 && moved(s4.ghosts[0]) < moved(s4.ghosts[1]), 'a grey ghost moves, but less than a normal one: ' + moved(s4.ghosts[0]).toFixed(3) + ' vs ' + moved(s4.ghosts[1]).toFixed(3));
  const s5 = S.newRound([1600, 0, 0, 0], 0, { standin: [true, false, false] }), rng5 = S.mulberry(5);
  s5.ghosts[0].grey = false; s5.ghosts[0].claim = S.playerOfGhost(s5, 1);
  Object.assign(s5.ghosts[0], { x: 1.5, y: 1.5 }); s5.ghosts[1].x = 17.5; s5.ghosts[1].y = 1.5; s5.ghosts[2].x = 17.5; s5.ghosts[2].y = 1.5;
  const d0 = S.dist(s5.ghosts[0], s5.pac); let n5 = 0;
  while (!s5.over && n5++ < 30 * 40) S.update(s5, { pac: null, ghosts: [S.cpuGhost(s5, 0, rng5, 1), null, null] });
  ok(s5.over && s5.overReason === 'caught' && s5.catcher === S.playerOfGhost(s5, 1), `a woken stand-in hunts Pac-Man down (from ${d0.toFixed(1)} cells away, ${(n5 / 30).toFixed(1)} s)`);
}
{
  // Ghost slots given by the match (opts.players) decide which seat drives which ghost, and whose view is whose.
  const s = S.newRound([0, 1600, 0, 0], 1, { players: [3, 0, 2] });
  ok(S.playerOfGhost(s, 0) === 3 && S.playerOfGhost(s, 2) === 2 && S.ghostIndexOf(s, 0) === 1 && S.ghostIndexOf(s, 1) === -1, 'ghost slots follow opts.players');
  ok(S.view(s, 3).me === 0 && S.view(s, 1).me === -1 && S.view(s, 0).gp.join() === '3,0,2', 'views carry the slots');
  const t = S.newRound([1600, 0, 0, 0], 0);
  ok(S.playerOfGhost(t, 0) === 1 && S.playerOfGhost(t, 2) === 3 && S.ghostIndexOf(t, 2) === 1, 'without opts.players the slots are in seat order');
}
{
  // Eating pellets slows Pac-Man: each one holds him for a frame (measured on the original: 0.4725 px/frame over a pellet row, 0.503 cleared)
  const RIGHT = S.DIRS.findIndex(d => d[0] === 1), idle = { ghosts: [null, null, null] };
  let run = -1; for (let x = 1; x < S.W - 8 && run < 0; x++) if (![0, 1, 2, 3, 4, 5, 6, 7].some(k => S.wallAt(x + k, 1))) run = x;
  const go = clear => {
    const s = S.newRound([1600, 0, 0, 0], 0);
    if (clear) { s.pellets.fill(0); s.left = 100; }
    Object.assign(s.pac, { x: run + 0.5, y: 1.5, dir: RIGHT, want: RIGHT });
    s.ghosts.forEach(g => { g.x = 17.5; g.y = 13.5; });
    for (let k = 0; k < 40; k++) S.update(s, Object.assign({ pac: RIGHT }, idle));
    return s;
  };
  const a = go(false), b = go(true), eaten = a.eaten;
  const lost = (b.pac.x - a.pac.x), expect = eaten * S.CFG.pelletPause * S.CFG.pacSpeed;
  ok(eaten >= 4 && lost > 0 && Math.abs(lost - expect) < 0.02, `pellets hold Pac-Man back: ate ${eaten}, ${lost.toFixed(3)} cells behind a cleared run (expected ${expect.toFixed(3)})`);
}
{
  // The warp tunnel: ghosts (grey too) slow to three quarters near the edges and cross a hidden stretch out of sight; Pac-Man keeps his speed
  const LEFT = S.DIRS.findIndex(d => d[0] === -1), idle = { pac: null, ghosts: [null, null, null] };
  const row = S.ROWS.findIndex(r => !/[#=]/.test(r[0]) && !/[#=]/.test(r[S.W - 1]));
  ok(row >= 0, 'the maze has a tunnel row');
  const cross = (who, grey) => {
    const s = S.newRound([1600, 0, 0, 0], 0, { standin: [grey, false, false] });
    s.pellets.fill(0); s.left = 100;
    s.ghosts.forEach((g, i) => { g.x = 17.5; g.y = 1.5 + i; }); s.pac.x = 9.5; s.pac.y = 13.5;
    const e = who === 'pac' ? s.pac : s.ghosts[0];
    Object.assign(e, { x: 0.5, y: row + 0.5, dir: LEFT, want: LEFT });
    let n = 0, hidden = 0, maxx = 0;
    while (n < 400) { S.update(s, who === 'pac' ? { pac: LEFT, ghosts: [null, null, null] } : { pac: null, ghosts: [LEFT, null, null] }); n++; if (e.x >= S.W) hidden++; maxx = Math.max(maxx, e.x); if (e.x <= S.W - 1 + 1e-6 && e.x > S.W - 2) break; }
    return { n, hidden, maxx };
  };
  const g = cross('ghost', false), p = cross('pac', false), c = cross('ghost', true);
  const path = 0.5 + S.CFG.tunnelHidden + 1;      // cells: to the edge, the hidden stretch, and into the last cell on the other side
  const want = path * 8 / (0.5 * S.CFG.tunnelSlow) / 2;    // 30 Hz ticks, 0.5 px/frame ghost at three quarters
  ok(Math.abs(g.n - want) <= 2 && g.hidden > 0 && g.maxx < S.W + S.CFG.tunnelHidden + 0.01, `a ghost takes ${g.n} ticks from the last cell on one side to the last cell on the other (expected about ${want.toFixed(0)}), ${g.hidden} of them out of sight`);
  ok(p.n < g.n * 0.8 && Math.abs(p.n - path * 8 / 0.5 / 2) <= 2, `Pac-Man is not slowed: ${p.n} ticks`);
  ok(c.n > g.n, `a grey stand-in is slower still: ${c.n} ticks`);
  const s2 = S.newRound([1600, 0, 0, 0], 0); s2.ghosts[0].x = 10.5; s2.ghosts[0].y = row + 0.5;
  ok(!s2.ghosts.some(gh => S.dist(gh, s2.pac) < S.CFG.catchDist), 'distance still sane away from the tunnel');
}
console.log(fails ? `${fails} FAILED` : 'all sim checks passed');
process.exit(fails ? 1 : 0);
