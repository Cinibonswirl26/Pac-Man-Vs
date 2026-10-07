// node test/mazedata.test.js <disc image>: the original stage 1 maze read from the disc's maze data.
const fs = require('fs'), Disc = require('../client/disc.js'), MazeData = require('../client/mazedata.js'), Sim = require('../shared/sim.js');
const file = process.argv[2]; if (!file) { console.log('usage: node test/mazedata.test.js <image>'); process.exit(2); }
const blob = { slice: (a, b) => ({ arrayBuffer: async () => { const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(b - a); fs.readSync(fd, buf, 0, b - a, a); fs.closeSync(fd); return buf.buffer.slice(buf.byteOffset, buf.byteOffset + (b - a)); } }) };
(async () => {
  const d = await Disc.open(blob);
  const maze = MazeData.stage1(await d.read(MazeData.PATH), Sim.makeMaze);
  console.log(maze.rows.join('\n'));
  let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
  const all = maze.rows.join('');
  ok(maze.W === 21 && maze.H === 21, 'expected a 21x21 grid (19x21 maze plus the outer wall columns)');
  ok((all.match(/\./g) || []).length === 172, 'expected 172 small pellets, got ' + (all.match(/\./g) || []).length);
  ok((all.match(/o/g) || []).length === 4, 'expected 4 power pellets');
  const pows = []; maze.rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'o') pows.push(`${x - 1},${y}`); }));
  ok(pows.sort().join(' ') === ['0,2', '18,2', '0,16', '18,16'].sort().join(' '), 'power pellets at the wrong cells: ' + pows);
  ok(maze.rows[10][0] !== '#' && maze.rows[10][20] !== '#', 'the tunnel row must be open at both ends');
  ok(maze.rows.every((r, y) => y === 10 || (r[0] === '#' && r[20] === '#')), 'only the tunnel row may be open at the edges');
  // symmetry
  for (let y = 0; y < 21; y++) for (let x = 0; x < 10; x++) ok((maze.rows[y][x] === '#') === (maze.rows[y][20 - x] === '#'), `asymmetric at ${x},${y}`);
  // everything with a pellet is reachable by Pac-Man
  const S = Sim.create(maze); const seen = new Set([maze.pac.join()]), q = [maze.pac];
  while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of S.DIRS) { const nx = (x + dx + S.W) % S.W, ny = y + dy; if (ny < 0 || ny >= S.H) continue; const c = maze.rows[ny][nx]; if ('#=D_'.includes(c)) continue; if (!seen.has(nx + ',' + ny)) { seen.add(nx + ',' + ny); q.push([nx, ny]); } } }
  let un = 0; maze.rows.forEach((r, y) => [...r].forEach((c, x) => { if ((c === '.' || c === 'o') && !seen.has(x + ',' + y)) un++; }));
  ok(un === 0, un + ' unreachable pellets');
  ok(maze.pac.join() === '10,12' && JSON.stringify(maze.ghosts) === '[[7,6],[13,6],[10,8]]', 'start cells');
  console.log(fails ? fails + ' FAILED' : 'original maze read from the disc, all checks passed'); process.exit(fails ? 1 : 0);
})();
