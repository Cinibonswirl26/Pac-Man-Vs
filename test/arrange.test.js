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
console.log(fails ? fails + ' FAILED' : 'arrangement ok'); process.exit(fails ? 1 : 0);
