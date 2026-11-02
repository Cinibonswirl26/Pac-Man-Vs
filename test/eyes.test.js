// The eaten ghosts' way home, read from the disc's program (needs the disc: DISC=/path/to/disc npm run test:disc).
// From every open cell of each of the original's six stages, the eyes must step exactly along the table's arrows,
// cell by cell, and come out whole on the cell marked home.
const fs = require('fs'), Disc = require('../client/disc.js'), MazeData = require('../client/mazedata.js'), S = require('../shared/sim.js');
const file = process.argv[2] || process.env.DISC;
if (!file || !fs.existsSync(file)) { console.log('eyes: no disc given, skipped'); process.exit(0); }
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const blob = { size: fs.statSync(file).size, slice: (a, b) => ({ arrayBuffer: async () => { const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(b - a); fs.readSync(fd, buf, 0, b - a, a); fs.closeSync(fd); return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length); } }) };
const STEP = { 1: [0, -1], 2: [0, 1], 3: [-1, 0], 4: [1, 0] };
(async () => {
  const d = await Disc.open(blob);
  const mazes = MazeData.all(await d.read(MazeData.PATH), S.makeMaze), tables = MazeData.eyeTables(await d.dol());
  ok(Object.keys(tables).length >= 6, 'a table for each stage: ' + Object.keys(tables).join(','));
  for (const k of [1, 5, 6, 4, 8, 13]) {
    const m = mazes.find(x => x.stage === k), raw = MazeData.eyesFor(tables, m); m.eyes = S.packEyes(raw);
    ok(raw && raw.filter(v => v === 5).length === 1 && S.unpackEyes(m.eyes, m.W * m.H).join() === raw.join(), `stage ${k}: one home cell, and the packing round-trips`);
    const Sim = S.create(m), W = m.W, code = (x, y) => raw[y * W + ((x % W) + W) % W];
    let starts = 0, bad = 0, longest = 0;
    for (let y = 0; y < m.H; y++) for (let x = 0; x < W; x++) {
      const c = code(x, y); if (c < 1 || c > 4) continue;
      // the path the table gives, cell by cell
      const want = []; let px = x, py = y, guard = 0;
      while (code(px, py) !== 5 && guard++ < 400) { const [dx, dy] = STEP[code(px, py)]; px = ((px + dx) % W + W) % W; py += dy; want.push(px + ',' + py); }
      if (guard >= 400) { bad++; continue; }
      // the sim's eyes from the same cell, any heading
      const s = Sim.newRound([1600, 0, 0, 0], 0); s.pellets.fill(0); s.left = 99; s.fruitTimer = 1e9; s.pac.x = -50; s.pac.y = -50;
      const g = s.ghosts[0]; g.mode = 'eyes'; g.x = x + 0.5; g.y = y + 0.5; g.dir = g.want = 1;
      s.ghosts.slice(1).forEach(o => { o.x = -40; o.y = -40; });
      const got = []; let last = x + ',' + y, t = 0;
      while (g.mode === 'eyes' && t++ < 2000) {
        Sim.update(s, { pac: null, ghosts: [null, null, null] });
        const here = Math.floor(g.x) + ',' + Math.floor(g.y); if (here !== last) { got.push(here); last = here; }
      }
      starts++; longest = Math.max(longest, t);
      if (g.mode !== 'normal' || got.join(' ') !== want.join(' ')) { bad++; if (bad <= 3) console.log(`  stage ${k} from ${x},${y}: table ${want.join(' ')} | sim ${got.join(' ')} (${g.mode})`); }
    }
    ok(bad === 0, `stage ${k}: the eyes follow the table home from all ${starts} cells (${bad} differ)`);
    console.log(`stage ${k}: ${starts} cells, every one home along the table's arrows (longest ${(longest * S.CFG.tick).toFixed(1)} s)`);
  }
  console.log(fails ? fails + ' FAILED' : 'eyes ok'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL', e.message); process.exit(1); });
