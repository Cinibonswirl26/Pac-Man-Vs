// node test/mazedata.test.js <disc image>: the 13 stage mazes read from the disc's maze data.
const fs = require('fs'), Disc = require('../client/disc.js'), MazeData = require('../client/mazedata.js'), Sim = require('../shared/sim.js');
const file = process.argv[2]; if (!file) { console.log('usage: node test/mazedata.test.js <image>'); process.exit(2); }
const blob = { slice: (a, b) => ({ arrayBuffer: async () => { const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(b - a); fs.readSync(fd, buf, 0, b - a, a); fs.closeSync(fd); return buf.buffer.slice(buf.byteOffset, buf.byteOffset + (b - a)); } }) };
(async () => {
  const d = await Disc.open(blob), rom = await d.read(MazeData.PATH);
  const mazes = MazeData.all(rom, Sim.makeMaze);
  let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
  ok(mazes.length === 13, 'expected 13 mazes, got ' + mazes.length);
  // pellet and power-pellet counts per maze as stored in the tables (172 + 4 for the original)
  const counts = [[172, 4], [149, 2], [121, 4], [222, 4], [140, 2], [153, 4], [158, 4], [182, 4], [158, 4], [207, 4], [198, 4], [140, 2], [118, 2]];
  mazes.forEach((m, i) => {
    const tag = `stage ${m.stage} ${m.name}`, all = m.rows.join('');
    ok(m.stage === i + 1, tag + ': order');
    ok((all.match(/\./g) || []).length === counts[i][0] && (all.match(/o/g) || []).length === counts[i][1], `${tag}: pellets ${(all.match(/\./g) || []).length}+${(all.match(/o/g) || []).length}, expected ${counts[i]}`);
    ok((all.match(/D/g) || []).length === 3 && (all.match(/_/g) || []).length === 3, tag + ': a three-wide gate over a three-wide house');
    ok(m.W === 21, tag + ': 21 columns, centred on the gate');
    const S = Sim.create(m);
    // the start cells are open floor; Pac-Man can reach every pellet (the grid wraps sideways)
    const open = ([x, y]) => !'#=D_'.includes(m.rows[y][x]);
    ok([m.pac, m.exit, ...m.ghosts].every(open), tag + ': start cells must be open floor');
    ok(new Set([m.pac, m.exit, m.ghosts[0], m.ghosts[1]].map(String)).size === 4 && String(m.ghosts[2]) === String(m.exit), tag + ': start cells must differ (the third ghost starts on the exit cell)');
    const seen = new Set([m.pac.join()]), q = [m.pac];
    while (q.length) { const [x, y] = q.pop(); for (const [dx, dy] of S.DIRS) { const nx = (x + dx + S.W) % S.W, ny = y + dy; if (ny < 0 || ny >= S.H) continue; const c = m.rows[ny][nx]; if ('#=D_'.includes(c)) continue; if (!seen.has(nx + ',' + ny)) { seen.add(nx + ',' + ny); q.push([nx, ny]); } } }
    let un = 0; m.rows.forEach((r, y) => [...r].forEach((c, x) => { if ((c === '.' || c === 'o') && !seen.has(x + ',' + y)) un++; }));
    ok(un === 0, `${tag}: ${un} unreachable pellets`);
    // the ghosts can leave the house: from the exit cell the whole open maze is reachable too
    const seen2 = new Set([m.exit.join()]), q2 = [m.exit];
    while (q2.length) { const [x, y] = q2.pop(); for (const [dx, dy] of S.DIRS) { const nx = (x + dx + S.W) % S.W, ny = y + dy; if (ny < 0 || ny >= S.H) continue; if ('#='.includes(m.rows[ny][nx])) continue; if (!seen2.has(nx + ',' + ny)) { seen2.add(nx + ',' + ny); q2.push([nx, ny]); } } }
    ok(m.ghosts.every(g => seen2.has(g.join())), tag + ': ghosts must be able to reach each other');
    const round = S.newRound([1600, 0, 0, 0], 0); ok(round.total === counts[i][0] + counts[i][1] - (round.pellets[m.pac[1] * S.W + m.pac[0]] ? 0 : 0), `${tag}: the round counts every pellet`);
  });
  // symmetry about the centre column, for the mazes that are symmetric in the data
  const asym = mazes.filter(m => m.rows.some(r => r !== [...r].reverse().join(''))).map(m => m.stage);
  console.log('mazes that are not mirror-symmetric:', asym.length ? asym.join(', ') : 'none');
  // the original: 21 columns, the 21 rows between two border rows, tunnel on row 11 (border row included), exact start cells
  const m1 = mazes[0];
  ok(m1.H === 23 && m1.rows[0] === '#'.repeat(21) && m1.rows[22] === '#'.repeat(21), 'original: border rows');
  ok(m1.rows[11][0] === ' ' && m1.rows[11][20] === ' ' && m1.rows.every((r, y) => y === 11 || (r[0] === '#' && r[20] === '#')), 'original: only the tunnel row is open at the edges');
  const pows = []; m1.rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'o') pows.push(`${x - 1},${y - 1}`); }));
  ok(pows.sort().join(' ') === ['0,2', '18,2', '0,16', '18,16'].sort().join(' '), 'original: power pellets at ' + pows);
  ok(m1.pac.join() === '10,13' && JSON.stringify(m1.ghosts) === '[[7,7],[13,7],[10,9]]', 'original: start cells');
  console.log(mazes.map(m => `${m.stage}:${m.name} ${m.W}x${m.H}`).join('  '));
  console.log(fails ? fails + ' FAILED' : 'all 13 mazes read from the disc, all checks passed'); process.exit(fails ? 1 : 0);
})();
