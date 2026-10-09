// A host-supplied maze is validated by the server, used for the room, and bad ones are ignored.
const WebSocket = require('ws');
const { server, sanitizeMaze } = require('../server/server.js');
const Sim = require('../shared/sim.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const m = {
  rows: ['###########', '#.........#', '#.###.###.#', '#.........#', '#.###D###.#', '#..#___#..#', '#..#####..#', '#.........#', '#.........#', '###########'],
  pac: [5, 7], ghosts: [[5, 3], [4, 5], [6, 5]], door: [5, 4], exit: [5, 3], house: { x0: 4, x1: 6, y0: 5, y1: 5 }
};
ok(sanitizeMaze(m), 'valid maze should be accepted');
ok(!sanitizeMaze(null), 'null rejected'); ok(!sanitizeMaze({ rows: ['abc'] }), 'garbage rows rejected');
ok(!sanitizeMaze({ ...m, rows: m.rows.map((r, i) => i ? r + '#' : r) }), 'ragged rows rejected');
ok(!sanitizeMaze({ ...m, pac: [99, 99] }), 'pac outside maze rejected');
ok(!sanitizeMaze({ ...m, ghosts: [[1, 1]] }), 'wrong ghost count rejected');
ok(!sanitizeMaze({ ...m, rows: m.rows.map((r, i) => i === 1 ? r.replace(/\./g, 'x') : r) }), 'illegal characters rejected');
ok(!sanitizeMaze({ ...m, door: [1, 1] }), 'door not on a D cell rejected');
// the Arrangement overlay: kept when it fits the maze, the whole maze refused when it does not
const arr = { pads: [{ x: 1, y: 1, kind: 'dash', dir: 1 }, { x: 9, y: 1, kind: 'dash', dir: 3 }, { x: 1, y: 7, kind: 'jump', pair: 3, colour: 0 }, { x: 9, y: 7, kind: 'jump', pair: 2, colour: 0 }], items: true };
const am = sanitizeMaze({ ...m, arrange: arr });
ok(am && am.arrange && am.arrange.pads.length === 4 && am.arrange.items === true, 'a fitting overlay is kept');
ok(!sanitizeMaze(m).arrange, 'no overlay on a plain maze');
ok(!sanitizeMaze({ ...m, arrange: { pads: [{ x: 2, y: 2, kind: 'dash', dir: 1 }] } }), 'a pad in a wall is refused');
ok(!sanitizeMaze({ ...m, arrange: { pads: [{ x: 5, y: 7, kind: 'dash', dir: 1 }] } }), "a pad on Pac-Man's start cell is refused");
ok(!sanitizeMaze({ ...m, arrange: { pads: [{ x: 1, y: 7, kind: 'jump', pair: 1, colour: 0 }, { x: 9, y: 7, kind: 'jump', pair: 0 }, { x: 3, y: 1, kind: 'jump', pair: 0 }] } }), 'a jump pad whose partner points elsewhere is refused');
ok(!sanitizeMaze({ ...m, arrange: { pads: [{ x: 1, y: 1, kind: 'warp' }] } }), 'an unknown pad kind is refused');
ok(!sanitizeMaze({ ...m, arrange: { pads: [{ x: 1, y: 1, kind: 'dash', dir: 0 }] } }), 'a dash arrow into a wall is refused');
ok(!sanitizeMaze({ ...m, rows: m.rows.map((r, i) => i === 1 ? '#.... ....#' : r), arrange: { pads: [] } }) === false, 'rows must stay symmetric with an overlay');
server.listen(0, async () => {
  const w = new WebSocket(`ws://localhost:${server.address().port}/ws`); const q = []; w.on('message', d => q.push(JSON.parse(d)));
  await new Promise(r => w.on('open', r));
  w.send(JSON.stringify({ t: 'create', name: 'H', maze: m }));
  await new Promise(r => setTimeout(r, 200));
  const room = q.find(x => x.t === 'room'); ok(room && room.maze && room.maze.rows.length === m.rows.length, 'room should carry the custom maze');
  ok(room && room.maze && !('arrange' in room.maze), 'a plain maze is sent without an overlay field');
  const w3 = new WebSocket(`ws://localhost:${server.address().port}/ws`); const q3 = []; w3.on('message', d => q3.push(JSON.parse(d)));
  await new Promise(r => w3.on('open', r));
  w3.send(JSON.stringify({ t: 'create', name: 'A', maze: { ...m, arrange: arr } }));
  await new Promise(r => setTimeout(r, 200));
  const room3 = q3.find(x => x.t === 'room'); ok(room3 && room3.maze && room3.maze.arrange && room3.maze.arrange.pads.length === 4, 'the room message carries the overlay to joiners');
  w.send(JSON.stringify({ t: 'act', a: 'hop' })); w.send(JSON.stringify({ t: 'start' })); w.send(JSON.stringify({ t: 'act', a: 'hop' }));
  await new Promise(r => setTimeout(r, 1200));
  const st = q.filter(x => x.t === 'state').pop();
  ok(st && st.pellets.length === m.rows.length * m.rows[0].length, 'state pellets length should match the custom maze');
  const w2 = new WebSocket(`ws://localhost:${server.address().port}/ws`); const q2 = []; w2.on('message', d => q2.push(JSON.parse(d)));
  await new Promise(r => w2.on('open', r));
  w2.send(JSON.stringify({ t: 'create', name: 'X', maze: { rows: ['bad'] } }));
  await new Promise(r => setTimeout(r, 200));
  ok(q2.find(x => x.t === 'room' && x.maze === null), 'invalid maze falls back to the built-in one');
  console.log(fails ? fails + ' FAILED' : 'maze room ok'); process.exit(fails ? 1 : 0);
});
