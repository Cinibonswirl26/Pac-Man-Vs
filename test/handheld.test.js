// node test/handheld.test.js <disc image>: Pac-Man's screen drawn from the pictures on the player's disc.
const fs = require('fs'), Disc = require('../client/disc.js'), HH = require('../client/handheld.js');
const MazeData = require('../client/mazedata.js'), Sim = require('../shared/sim.js');
const file = process.argv[2]; if (!file) { console.log('usage: node test/handheld.test.js <image>'); process.exit(2); }
const blob = { slice: (a, b) => ({ arrayBuffer: async () => { const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(b - a); fs.readSync(fd, buf, 0, b - a, a); fs.closeSync(fd); return buf.buffer.slice(buf.byteOffset, buf.byteOffset + (b - a)); } }) };
(async () => {
  const d = await Disc.open(blob);
  let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
  const hw = await HH.load(d, MazeData);
  ok(hw.segments && hw.segments.length === 13, 'thirteen stage tables');
  // the colour tables read from the program: the maze palette is blue on black, the object palettes hold yellow, red, cyan, pink, green
  ok(hw.bgPal[0][3].join() === '0,173,255' || hw.bgPal[0][3].join() === '0,140,255' || hw.bgPal[0][4][2] > 200, 'maze palette is blue');
  ok(hw.objPal[0][4].join() === '255,255,0', 'Pac-Man is yellow: ' + hw.objPal[0][4].join());
  ok(hw.objPal[1][4][0] > 200 && hw.objPal[1][4][1] < 30, 'player 1 is red');
  ok(hw.objPal[4][4][1] > 200 && hw.objPal[4][4][0] < 80, 'player 4 is green');
  const maze = MazeData.all(await d.read(MazeData.PATH), Sim.makeMaze)[0];
  const pellets = new Uint8Array(maze.W * maze.H); maze.rows.forEach((row, y) => [...row].forEach((ch, x) => { pellets[y * maze.W + x] = ch === '.' ? 1 : ch === 'o' ? 2 : 0; }));
  const base = { seg: hw.segments[0], c0: maze.colOffset, r0: maze.rowOffset, W: maze.W, H: maze.H, pellets, pacSeat: 3, scores: [0, 0, 0, 1610], target: 7000, ghosts: [], time: 1, cam: { dy: 0 } };
  const px = (f, x, y) => { const o = (y * 240 + x) * 4; return [f.data[o], f.data[o + 1], f.data[o + 2]]; };
  const f = HH.frame();
  HH.render(hw, f, Object.assign({ pac: { x: maze.pac[0] + 0.5, y: maze.pac[1] + 0.5, d: 3, moving: true } }, base));
  let lit = 0; for (let i = 0; i < 240 * 160; i++) if (f.data[i * 4] + f.data[i * 4 + 1] + f.data[i * 4 + 2] > 60) lit++;
  ok(lit > 9000, 'the picture is filled in: ' + lit);
  ok(px(f, 200, 3).join() !== '0,0,0', 'the side panel is drawn');
  // the camera keeps Pac-Man in a band and does not jump: moving him down scrolls, going back up does not scroll back at once
  const cam = { dy: 0 };
  HH.render(hw, f, Object.assign({}, base, { cam, pac: { x: 10.5, y: 21.5, d: 2, moving: true } }));
  ok(cam.dy === 8 * 21.5 - 8 - 88, 'camera follows Pac-Man down to the bottom of the band: ' + cam.dy);
  const low = cam.dy;
  HH.render(hw, f, Object.assign({}, base, { cam, pac: { x: 10.5, y: 20.5, d: 0, moving: true } }));
  ok(cam.dy === low, 'a step back up stays inside the band, the camera holds');
  // eaten pellets disappear from the maze, frightened ghosts wear their player's badge
  const before = HH.frame(), after = HH.frame(), cell = [1, 1];
  const p2 = pellets.slice(); p2[cell[1] * maze.W + cell[0]] = 0;
  HH.render(hw, before, Object.assign({}, base, { cam: { dy: 0 }, pac: { x: 10.5, y: 4.5, d: 1, moving: false } }));
  HH.render(hw, after, Object.assign({}, base, { pellets: p2, cam: { dy: 0 }, pac: { x: 10.5, y: 4.5, d: 1, moving: false } }));
  let diff = 0; for (let i = 0; i < before.data.length; i++) if (before.data[i] !== after.data[i]) diff++;
  ok(diff > 0 && diff < 40 * 4, 'one eaten pellet changes only its own tile: ' + diff);
  console.log(fails ? fails + ' FAILED' : "Pac-Man's screen read from the disc, all checks passed"); process.exit(fails ? 1 : 0);
})();
