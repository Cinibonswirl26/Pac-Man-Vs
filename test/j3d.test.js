// node test/j3d.test.js <disc image>: the 3D models read from the player's disc.
const fs = require('fs'), Disc = require('../client/disc.js'), J3D = require('../client/j3d.js'), GX = require('../client/gx.js');
const MazeData = require('../client/mazedata.js'), Sim = require('../shared/sim.js');
const file = process.argv[2]; if (!file) { console.log('usage: node test/j3d.test.js <image>'); process.exit(2); }
const blob = { slice: (a, b) => ({ arrayBuffer: async () => { const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(b - a); fs.readSync(fd, buf, 0, b - a, a); fs.closeSync(fd); return buf.buffer.slice(buf.byteOffset, buf.byteOffset + (b - a)); } }) };
(async () => {
  const d = await Disc.open(blob);
  let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
  const arc = Disc.rarc(Disc.yaz0(await d.read('PROOT/Model.szs')));
  for (const n of ['ghost/ghost.bmd', 'ghost/anm/ghost.bck', 'ghost/ghost_r.bti', 'ghost/ghost_yowari.bti', 'packman/pacman.bmd', 'packman/anm/pacman.bck', 'cherry.bmd']) ok(arc.has(n), 'Model.szs lacks ' + n);

  // Ghost: skeleton, skinning, animation (with Maya scale compensation the body stays ghost-shaped).
  const ghost = J3D.parseBMD(arc.get('ghost/ghost.bmd'));
  ok(ghost.joints.length === 13 && ghost.shapes.length === 2 && ghost.materials.length === 2, 'ghost structure');
  ok(ghost.shapes.reduce((a, s) => a + s.drw.length / 3, 0) === 300, 'ghost triangle count');
  ok(ghost.textures.some(t => t.name === 'ghost_r'), 'ghost body texture');
  const ganim = J3D.parseBCK(arc.get('ghost/anm/ghost.bck'));
  ok(ganim.length === 64 && ganim.joints.length === 13, 'ghost animation');
  const bb = p => { const b = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]; for (const s of p) for (let i = 0; i < s.pos.length; i += 3) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], s.pos[i + k]); b[k + 3] = Math.max(b[k + 3], s.pos[i + k]); } return b; };
  const gb = bb(J3D.pose(ghost, J3D.animate(ganim, 0))), gw = gb[3] - gb[0], gh = gb[4] - gb[1];
  ok(gw > 450 && gw < 750 && gh > 500 && gh < 800, `ghost size in its float pose: ${gw.toFixed(0)} x ${gh.toFixed(0)}`);
  for (const p of J3D.pose(ghost, J3D.animate(ganim, 17))) ok(p.pos.every(Number.isFinite) && p.nrm.every(Number.isFinite), 'finite skinned vertices');

  const pac = J3D.parseBMD(arc.get('packman/pacman.bmd')), panim = J3D.parseBCK(arc.get('packman/anm/pacman.bck'));
  ok(panim.length === 29, 'Pac-Man mouth animation');
  const pb = bb(J3D.pose(pac, J3D.animate(panim, 10)));
  ok(pb[3] - pb[0] > 600 && pb[3] - pb[0] < 900, 'Pac-Man size');

  // The 13 stage models line up with the 13 mazes: on every pellet cell the model has a walkable surface at one
  // common height, and in the stages with solid walls the walls stand where the maze data has walls.
  const mazes = MazeData.all(await d.read(MazeData.PATH), Sim.makeMaze);
  ok(mazes.length === 13, 'thirteen mazes');
  const SOLID_WALLS = new Set([1, 4, 6, 7, 8, 9, 10, 12, 13]);   // the pier stages use water between planks
  const stages = [];
  for (const maze of mazes) {
    const k = maze.stage, model = J3D.parseBMD(await d.read('PROOT/Map/PacField_' + k + '.bmd'));
    stages.push(model);
    const tris = []; for (const sh of J3D.pose(model)) for (let i = 0; i < sh.pos.length; i += 9) tris.push(sh.pos.slice(i, i + 9));
    const surfaces = (x, z) => {   // every surface height above the point (x, z), highest first
      const out = [];
      for (const t of tris) {
        const [ax, ay, az, bx, by, bz, cx, cy, cz] = t;
        const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(den) < 1e-6) continue;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den, l3 = 1 - l1 - l2;
        if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
        out.push(l1 * ay + l2 * by + l3 * cy);
      }
      return out.sort((a, b) => b - a);
    };
    const at = (c, r) => [(c + maze.colOffset - 1) * 1000 + 500, (r + maze.rowOffset - 1) * 1000 + 500];
    let floorY = null, noFloor = 0, wallsOk = 0, wallsTot = 0, n = 0;
    maze.rows.forEach((row, r) => [...row].forEach((ch, c) => {
      const [x, z] = at(c, r);
      if (ch === '.' && n++ % 6 === 0) {
        const y = surfaces(x, z).find(v => v <= 600);
        if (y === undefined) { noFloor++; return; }
        if (floorY === null) floorY = y;
        if (Math.abs(y - floorY) > 60) noFloor++;
      }
    }));
    ok(noFloor === 0, `stage ${k}: ${noFloor} sampled pellet cells have no walkable surface at the common floor height ${floorY}`);
    if (SOLID_WALLS.has(k)) {
      maze.rows.forEach((row, r) => [...row].forEach((ch, c) => {
        if ((ch !== '#' && ch !== '.' && ch !== 'o') || (r + c) % 3) return;
        const [x, z] = at(c, r), h = Math.max(...[[0, 0], [-300, 0], [300, 0], [0, -300], [0, 300]].map(([dx, dz]) => surfaces(x + dx, z + dz)[0] ?? -1e9));
        wallsTot++; if ((ch === '#') === (h > floorY + 150)) wallsOk++;
      }));
      ok(wallsOk / wallsTot >= 0.85, `stage ${k}: walls match the model in ${(100 * wallsOk / wallsTot).toFixed(0)}% of sampled cells`);
    }
  }
  const stage = stages[0];
  const btk = J3D.parseBTK(await d.read('PROOT/Map/PacField_1.btk'));
  const at = J3D.animateTex(btk, btk.length / 2);
  ok(at.neon_v && Math.abs(at.neon_v[1].t[0] - 0.5) < 1e-3, 'neon scroll animation');
  // The ghosts blink: the eye texture goes 0,1,2,3,4,4,3,2,1,0 once every 64 frames.
  const btp = J3D.parseBTP(arc.get('ghost/btp/ghost.btp'));
  let seq = ''; for (let t = 0; t < btp.length; t++) seq += J3D.animatePattern(btp, t).e;
  ok(btp.length === 64 && /^0+123443210+$/.test(seq), 'ghost blink animation: ' + seq);

  // Every material turns into a shader.
  for (const m of [ghost, pac, ...stages, J3D.parseBMD(arc.get('cherry.bmd'))]) for (const mat of m.materials) {
    const s = GX.genShader(mat);
    ok(!/undefined|NaN/.test(s.vs + s.fs) && /gl_FragColor/.test(s.fs), 'shader for ' + mat.name);
  }
  console.log(fails ? fails + ' FAILED' : '3D models read from the disc, all checks passed'); process.exit(fails ? 1 : 0);
})();
