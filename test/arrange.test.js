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
const run = (s, n, inp) => { for (let i = 0; i < n; i++) S.update(s, inp || idle); };
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
console.log(fails ? fails + ' FAILED' : 'arrangement ok'); process.exit(fails ? 1 : 0);
