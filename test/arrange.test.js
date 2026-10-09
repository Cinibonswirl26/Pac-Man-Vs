// The Arrangement levels: pads and capsules laid over a maze. Plain mazes must be left exactly as they were.
const S = require('../shared/sim.js'), A = require('../shared/arrange.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const near = (a, b, eps) => Math.abs(a - b) <= eps;
const idle = { pac: null, ghosts: [null, null, null] };

// 1. The overlay data: every built-in level validates against its base, the base is untouched
{
  const lv = A.byId('arr:0'), m = A.apply(S.BUILTIN, lv);
  ok(m && m.arrange && m.arrange.pads.length === lv.pads.length && m.arrange.items === true, 'the built-in level fits the built-in maze');
  ok(!S.BUILTIN.arrange && S.BUILTIN.name === 'built-in', 'applying a level does not touch the base maze');
  ok(A.LEVELS.every(l => A.KINDS.length === 2 && l.pads.every(p => A.KINDS.includes(p.kind))), 'levels only use known pad kinds');
  ok(!A.validate({ pads: [{ x: 0, y: 0, kind: 'dash', dir: 1 }] }, S.BUILTIN), 'a pad in a wall is refused');
  ok(!A.validate({ pads: [{ x: 1, y: 4, kind: 'dash', dir: 1 }, { x: 1, y: 4, kind: 'dash', dir: 1 }] }, S.BUILTIN), 'two pads on one cell are refused');
  ok(!A.validate({ pads: [{ x: 11, y: 8, kind: 'dash', dir: 1 }] }, S.BUILTIN), "a pad on a ghost's start cell is refused");
  ok(!A.validate({ pads: [{ x: 10, y: 9, kind: 'dash', dir: 3 }] }, S.BUILTIN), 'a pad against the house is refused');
  const asym = Object.assign({}, S.BUILTIN, { rows: S.BUILTIN.rows.map((r, i) => i === 4 ? '#.....................#'.slice(0, 22) + '#' : r) });
  ok(!A.validate({ pads: [] }, Object.assign({}, asym, { rows: asym.rows.map((r, i) => i === 4 ? '#...#.................#' : r) })), 'an asymmetric maze cannot take an overlay');
  const v = A.validate({ pads: [{ x: 1, y: 6, kind: 'jump', pair: 1, colour: 9 }, { x: 21, y: 6, kind: 'jump', pair: 0 }], items: 1, extra: 1 }, S.BUILTIN);
  ok(v && v.pads[0].colour === 0 && v.pads[1].colour === 0 && v.items === true && !('extra' in v), 'validation returns a clean copy');
}
// 2. The sim keeps the overlay and a plain round is byte-for-byte what it was
{
  const T = S.create(A.apply(S.BUILTIN, A.byId('arr:0')));
  ok(T.maze.arrange && T.maze.arrange.pads.length === 8, 'the sim keeps the overlay through create()');
  const bare = JSON.parse(JSON.stringify(T.maze)); delete bare.W; delete bare.H;      // as it travels over the network
  ok(S.create(bare).maze.arrange.pads.length === 8, 'the overlay survives a bare descriptor');
  const plain = S.newRound([1600, 0, 0, 0], 0), view = S.view(plain, 0);
  ok(!('arr' in view) && !('clones' in view) && !('big' in view) && !('a' in view.pac), 'a plain round shows no arrangement fields');
  ok(Object.keys(view).join() === 'tick,target,frightLeft,left,eaten,over,why,pacPlayer,gp,scores,rs,me,ev,catcher,steal,winner,sight,boost,fruitUp,fruit,pac,trail,ghosts,pellets', 'the plain view keeps its exact keys');
  for (let i = 0; i < 60; i++) S.update(plain, idle);
  ok(!plain.fruit || plain.fruit.kind === undefined, 'a plain round never spawns a capsule');
}
// Pads on the built-in level: dash arrows at (1,4)-> (21,4)<- and (1,13)-> (21,13)<-, jump pads (1,6)<->(21,6) and (3,18)<->(19,18)
const LV = S.create(A.apply(S.BUILTIN, A.byId('arr:0')));
const put = (e, x, y, d) => { e.x = x + 0.5; e.y = y + 0.5; e.dir = e.want = d == null ? e.dir : d; };
const park = s => { s.ghosts.forEach(g => put(g, 11, 6, 1)); };     // ghosts out of the way, in the top corridor
const run = (s, n, inp) => { for (let i = 0; i < n; i++) LV.update(s, inp || idle); };
// 3. A dash arrow: entering its cell hurls Pac-Man along the row at dashMult speed, steering is ignored, it ends at the far arrow and does not fire again until he leaves
{
  const s = LV.newRound([1600, 0, 0, 0], 0); park(s); put(s.pac, 2, 4, 3);
  LV.update(s, { pac: 3, ghosts: [null, null, null] }); LV.update(s, { pac: 3, ghosts: [null, null, null] });
  let t = 0; while (!s.pac.dash && t++ < 40) LV.update(s, { pac: 3, ghosts: [null, null, null] });
  ok(s.pac.dash === 1 && s.pac.dir === 1 && s.events.includes('dash'), 'stepping on the arrow starts a dash in its direction');
  const x0 = s.pac.x; run(s, 15, { pac: 0, ghosts: [null, null, null] });      // 0.5 s pushing up: ignored
  const v = (s.pac.x - x0) / (15 * S.CFG.tick);
  ok(near(v, S.CFG.pacSpeed * S.CFG.dashMult, 0.3) && s.pac.dir === 1, `dashing at ${v.toFixed(2)} cells/s, expected ${(S.CFG.pacSpeed * S.CFG.dashMult).toFixed(2)}, steering ignored`);
  let n = 0; while (s.pac.dash && n++ < 120) LV.update(s, idle);
  ok(!s.pac.dash && Math.floor(s.pac.x) === 21 && Math.floor(s.pac.y) === 4 && !s.events.includes('dash'), `the dash ends on the far arrow (${s.pac.x.toFixed(2)},${s.pac.y.toFixed(2)}) without firing it`);
  run(s, 40, { pac: 0, ghosts: [null, null, null] });                           // walk off it, up column 21
  ok(!s.pac.dash && s.pac.y < 4, 'walking off the far arrow is a plain walk');
  t = 0; while (!s.pac.dash && t++ < 80) LV.update(s, { pac: 2, ghosts: [null, null, null] });   // and back onto it
  ok(s.pac.dash === 1 && s.pac.dir === 3, 'coming back onto the arrow fires it again, the other way');
}
// 4. A dashing Pac-Man knocks a normal ghost dizzy instead of being caught; a frightened one in the way is eaten
{
  const s = LV.newRound([1600, 0, 0, 0], 0); park(s); const g = s.ghosts[0]; put(g, 8, 4, 3);
  put(s.pac, 2, 4, 3); let t = 0; while (!s.pac.dash && t++ < 40) LV.update(s, { pac: 3, ghosts: [null, null, null] });
  ok(s.pac.dash, 'dash started');
  t = 0; while (!s.events.includes('stun') && t++ < 60) LV.update(s, idle);
  ok(!s.over && near(g.stun, S.CFG.stunTime, 0.05), `the ghost is knocked dizzy for ${S.CFG.stunTime} s (${g.stun && g.stun.toFixed(2)}), no catch`);
  const gx = g.x; run(s, 30, { pac: null, ghosts: [1, 1, 1] }); ok(g.x === gx && g.stun > 0, 'a dizzy ghost cannot move');
  run(s, 60, { pac: null, ghosts: [1, 1, 1] }); ok(g.stun === 0 && g.x > gx, 'it moves again once the dizziness passes');
  const s2 = LV.newRound([1600, 0, 0, 0], 0); park(s2); const h = s2.ghosts[1]; put(h, 8, 4, 3); h.mode = 'fright'; s2.frightLeft = 10;
  put(s2.pac, 2, 4, 3); t = 0; while (!s2.pac.dash && t++ < 40) LV.update(s2, { pac: 3, ghosts: [null, null, null] }); run(s2, 60);
  ok(h.mode !== 'fright' && s2.chain === 1 && s2.scores[0] >= 1800, 'a frightened ghost in the path is eaten for 200 (it may already be home again)');
}
// 5. A dashing ghost still catches Pac-Man
{
  const s = LV.newRound([1600, 0, 0, 0], 0); park(s); const g = s.ghosts[0]; put(g, 2, 13, 3); put(s.pac, 9, 13, 1);
  let t = 0; while (!g.dash && t++ < 40) LV.update(s, { pac: null, ghosts: [3, null, null] }); ok(g.dash === 1, 'the ghost dashes off the arrow');
  run(s, 60); ok(s.over && s.overReason === 'caught', 'and catches Pac-Man on the way');
}
// 6. A jump pad: Pac-Man flies to the partner pad, untouchable and eating nothing on the way, lands facing open floor, and the partner pad does not fire until he leaves it
{
  const s = LV.newRound([1600, 0, 0, 0], 0); park(s); put(s.pac, 1, 5, 2);
  const g = s.ghosts[0]; put(g, 11, 6, 3);                                   // a ghost on the flight line
  let t = 0; while (!s.pac.air && t++ < 40) LV.update(s, { pac: 2, ghosts: [null, null, null] });
  ok(s.pac.air && s.events.includes('jump'), 'stepping on the pad launches Pac-Man');
  const before = s.left;
  run(s, 9); ok(s.pac.air && !s.over && s.pac.x > 5 && s.pac.x < 17, `mid-air at (${s.pac.x.toFixed(1)},${s.pac.y.toFixed(1)}) past the ghost, not caught`);
  run(s, 9); ok(!s.pac.air && Math.floor(s.pac.x) === 21 && Math.floor(s.pac.y) === 6 && s.events.includes('land'), `lands on the partner pad after about 0.6 s (${s.pac.x.toFixed(2)},${s.pac.y.toFixed(2)})`);
  ok(before - s.left <= 1, 'nothing eaten in flight (at most the pellet on the landing pad)');
  run(s, 3); ok(!s.pac.air, 'the partner pad does not fire on landing');
  run(s, 30, { pac: 2, ghosts: [null, null, null] }); t = 0; while (!s.pac.air && t++ < 60) LV.update(s, { pac: 0, ghosts: [null, null, null] });
  ok(s.pac.air && Math.floor(s.pac.air.x1) === 1, 'coming back onto it jumps back');
  const v = LV.view(s, 0); ok(v.arr === 1 && v.pac.a && v.pac.a.length === 5, 'the view carries the flight');
}
// 7. Items: on a level the fruit spot draws fruit or a capsule with a seeded roulette; every kind shows up, gold least
{
  const seen = {}; const s = LV.newRound([1600, 0, 0, 0], 0, { rng: S.mulberry(5) }); park(s);
  for (let n = 0; n < 400; n++) { s.fruit = null; s.eaten = s.nextFruit; s.left = 100; s.pellets[0] = 1; s.pac.x = 0.5; s.pac.y = 0.5; s.pac.air = null; LV.update(s, idle); if (s.fruit) seen[s.fruit.kind] = (seen[s.fruit.kind] || 0) + 1; s.fruit = null; }
  const kinds = Object.keys(seen);
  ok(['fruit', 'red', 'cyan', 'pink', 'orange', 'gold'].every(k => seen[k] > 0), 'every item kind appears: ' + JSON.stringify(seen));
  ok(seen.gold < seen.fruit && Object.values(seen).every(v => v < seen.fruit + 1) && seen.gold === Math.min(...Object.values(seen)), 'gold is the rarest, fruit the commonest');
  const a = LV.newRound([1600, 0, 0, 0], 0, { rng: S.mulberry(9) }), b = LV.newRound([1600, 0, 0, 0], 0, { rng: S.mulberry(9) });
  a.eaten = b.eaten = 5; a.pellets[0] = b.pellets[0] = 1; a.pac.x = b.pac.x = 0.5; a.pac.y = b.pac.y = 0.5; LV.update(a, idle); LV.update(b, idle);
  ok(a.fruit && b.fruit && a.fruit.kind === b.fruit.kind, 'the draw follows the seed');
}
const spawn = (s, kind) => { s.fruit = { x: 11.5, y: 13.5, left: 10, kind }; };
const give = (s, kind, e) => { spawn(s, kind); put(e, 11, 13, 1); LV.update(s, idle); };
// 8. Pac-Man's capsules
{
  let s = LV.newRound([1600, 0, 0, 0], 0); park(s); give(s, 'red', s.pac);
  ok(!s.fruit && s.scores[0] === 2000 && s.events.includes('capsule') && near(s.pac.speedLeft, S.CFG.capsuleTime, 0.05), 'red: 400 points and a speed timer');
  const x0 = s.pac.x; run(s, 30, { pac: 1, ghosts: [null, null, null] });
  ok(near((s.pac.x - x0) / 1, S.CFG.pacSpeed * S.CFG.speedMult, 0.5) && s.pac.pause === 0, `red: Pac-Man runs at double speed over pellets without pausing (${((s.pac.x - x0)).toFixed(2)} cells/s)`);
  run(s, 300); ok(s.pac.speedLeft === 0, 'red wears off after 10 s');
  s = LV.newRound([1600, 0, 0, 0], 0); park(s); give(s, 'cyan', s.pac);
  ok(s.pac.clone && near(s.pac.clone.x, 23 - s.pac.x, 0.01) && s.pac.clone.y === s.pac.y, 'cyan: a clone mirrored about the centre line');
  const left0 = s.left; put(s.pac, 5, 16, 3); run(s, 30, { pac: 3, ghosts: [null, null, null] });     // row 16 has no pads
  ok(near(s.pac.clone.x, 23 - s.pac.x, 0.01) && s.pac.clone.dir === 1 && s.left < left0 - 4, 'the clone mirrors every move and eats pellets on its side');
  const v = LV.view(s, 0); ok(v.clones.length === 1 && v.clones[0].of === -1 && v.clones[0].m === 'p', 'the view lists the clone');
  const g = s.ghosts[0]; g.mode = 'fright'; s.frightLeft = 10; put(g, Math.floor(s.pac.clone.x), 16, 1); LV.update(s, idle);
  ok(g.mode === 'eyes' && s.scores[0] >= 2200, 'the clone eats a frightened ghost');
  const h = s.ghosts[1]; put(h, Math.floor(s.pac.clone.x), 16, 1); LV.update(s, idle);
  ok(!s.pac.clone && !s.over && s.events.includes('clonegone'), 'a normal ghost touching the clone only removes it');
  s = LV.newRound([1600, 0, 0, 0], 0); park(s); s.ghosts[2].mode = 'fright'; s.frightLeft = 5; give(s, 'pink', s.pac);
  ok(s.events.includes('pot') && s.ghosts.every(g => g.potted && g.mode === 'normal' && Math.floor(g.x) === 11 && Math.floor(g.y) === 10) && near(s.pot, S.CFG.potTime, 0.05), 'pink: every ghost sits in the pot, fright cleared');
  ok(LV.view(s, 0).ghosts.every(g => g.m === 'r'), 'potted ghosts are shown as away');
  put(s.pac, 11, 9, 2); run(s, 60, { pac: null, ghosts: [0, 0, 0] });
  ok(!s.over && s.ghosts.every(g => g.potted && Math.floor(g.y) === 10), 'potted ghosts cannot move or catch');
  run(s, 70, { pac: null, ghosts: [0, 0, 0] }); ok(s.ghosts.every(g => !g.potted) && s.ghosts.some(g => g.y < 10), 'after 4 s they are let out and can leave');
  s = LV.newRound([1600, 0, 0, 0], 0); park(s); give(s, 'orange', s.pac);
  ok(near(s.pac.digest, S.CFG.capsuleTime, 0.05), 'orange: a digest timer');
  put(s.pac, 5, 13, 3); run(s, 20, { pac: 3, ghosts: [null, null, null] }); ok(s.pac.pause === 0 && s.eaten > 2, 'orange: pellets go down without a pause');
  s = LV.newRound([1600, 0, 0, 0], 0); park(s); give(s, 'gold', s.pac);
  ok(s.scores[0] === 1700 && !s.pac.speedLeft && !s.pac.clone && !s.pac.digest, 'gold: 100 points and nothing else');
}
// 9. Ghosts' capsules
{
  let s = LV.newRound([1600, 0, 0, 0], 0); park(s); let g = s.ghosts[0]; put(s.pac, 3, 1, 1); give(s, 'red', g);
  ok(s.scores[S.playerOfGhost(s, 0)] === 400 && s.events.includes('capsuleghost') && near(g.speedLeft, S.CFG.capsuleTime, 0.05), 'red: 400 points and a speed timer for the ghost');
  let x0 = g.x; run(s, 30, { pac: null, ghosts: [1, null, null] }); ok(near(g.x - x0, S.CFG.ghostSpeed * S.CFG.speedMult, 0.5), 'the ghost runs at double speed, steering as usual');
  s = LV.newRound([1600, 0, 0, 0], 0); park(s); g = s.ghosts[0]; put(s.pac, 3, 1, 1); give(s, 'cyan', g);
  ok(g.clone && near(g.clone.x, 23 - g.x, 0.01), 'cyan: a mirror ghost');
  put(s.pac, Math.floor(g.clone.x), 13, 1); LV.update(s, idle);
  ok(s.over && s.overReason === 'caught' && s.catcher === S.playerOfGhost(s, 0), 'the mirror ghost catches Pac-Man for its owner');
  s = LV.newRound([1600, 0, 0, 0], 0); park(s); g = s.ghosts[0]; put(s.pac, 3, 1, 1); give(s, 'cyan', g); g.mode = 'fright'; s.frightLeft = 10;
  put(g, 3, 13, 1);                                                          // the ghost on the left, its mirror on the right
  const o = S.playerOfGhost(s, 0), so = s.scores[o]; put(s.pac, 19, 13, 1); LV.update(s, idle);
  ok(!s.over && !g.clone && s.scores[0] >= 1800 && s.scores[0] < 1900 && s.scores[o] === so && g.mode === 'fright', 'a frightened mirror is eaten for 200, nothing charged, the owner stays');
  s = LV.newRound([1600, 0, 0, 0], 0, { rng: S.mulberry(3) }); park(s); g = s.ghosts[0]; put(s.pac, 3, 1, 1); give(s, 'pink', g);
  ok(near(g.hopLeft, S.CFG.capsuleTime, 0.05), 'pink: the ghost gets the hop');
  LV.update(s, idle); ok(g.air && s.events.includes('hop'), 'it hops off at once');
  let hops = 1; for (let n = 0; n < 300; n++) { LV.update(s, idle); if (s.events.includes('hop')) hops++; }
  ok(hops >= 3 && hops <= 4 && g.hopLeft === 0 && !g.air, `about one hop every 3 s for 10 s (${hops} hops), then no more`);
  s = LV.newRound([1600, 0, 0, 0], 0); park(s); g = s.ghosts[0]; put(s.pac, 3, 1, 1); give(s, 'orange', g);
  for (let x = 1; x <= 21; x++) s.pellets[13 * 23 + x] = 0; put(g, 5, 13, 1); run(s, 100, { pac: null, ghosts: [1, null, null] });   // a cleared row
  const nb = s.big.reduce((a, b) => a + b, 0);
  ok(nb > 0 && nb <= S.CFG.bigMax && g.dropped === nb, `orange: the ghost leaves big pellets on empty cells (${nb})`);
  const leftB = s.left, bi = s.big.indexOf(1); put(s.pac, bi % 23, Math.floor(bi / 23), 1); const sc = s.scores[0]; LV.update(s, idle);
  ok(s.big[bi] === 0 && s.scores[0] === sc + S.CFG.bigPts && near(s.pac.pause, S.CFG.bigPause, 0.05) && s.left === leftB && s.events.includes('bigpellet'), 'a big pellet pays 50, holds Pac-Man half a second and does not count as a pellet');
  ok(LV.view(s, 0).big.length === nb - 1, 'the view lists the big pellets');
  s = LV.newRound([1600, 0, 0, 0], 0); park(s); g = s.ghosts[0]; put(s.pac, 3, 1, 1); give(s, 'gold', g);
  ok(s.scores[S.playerOfGhost(s, 0)] === 100, 'gold: 100 points for a ghost');
}
console.log(fails ? fails + ' FAILED' : 'arrangement ok'); process.exit(fails ? 1 : 0);
