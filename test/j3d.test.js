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

  // Stage 1: its walls stand exactly where the maze data has walls.
  const stage = J3D.parseBMD(await d.read('PROOT/Map/PacField_1.bmd'));
  const maze = MazeData.stage1(await d.read(MazeData.PATH), Sim.makeMaze);
  const tris = []; const sp = J3D.pose(stage);
  for (const s of sp) for (let i = 0; i < s.pos.length; i += 9) tris.push(s.pos.slice(i, i + 9));
  const top = (x, z) => {   // highest surface above the point (x, z)
    let best = -Infinity;
    for (const t of tris) {
      const [ax, ay, az, bx, by, bz, cx, cy, cz] = t;
      const den = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(den) < 1e-6) continue;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / den, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / den, l3 = 1 - l1 - l2;
      if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
      best = Math.max(best, l1 * ay + l2 * by + l3 * cy);
    }
    return best;
  };
  let mism = 0;
  for (let r = 0; r < maze.H; r++) for (let c = 1; c < maze.W - 1; c++) {
    // highest point among the centre and four points around it (some wall blocks have a sunken middle)
    const cx = (c - 1) * 1000 + 500, cz = r * 1000 + 500, ch = maze.rows[r][c];
    const h = Math.max(...[[0, 0], [-300, 0], [300, 0], [0, -300], [0, 300]].map(([dx, dz]) => top(cx + dx, cz + dz)));
    const isWall = ch === '#', isOpen = ch === '.' || ch === 'o' || ch === ' ' || ch === '_';
    if ((isWall && !(h > 150)) || (isOpen && !(h < 150))) { mism++; if (mism < 6) console.log('  cell', c, r, JSON.stringify(ch), 'height', h.toFixed(0)); }
  }
  ok(mism === 0, mism + ' maze cells where the stage model disagrees with the maze data');
  const btk = J3D.parseBTK(await d.read('PROOT/Map/PacField_1.btk'));
  const at = J3D.animateTex(btk, btk.length / 2);
  ok(at.neon_v && Math.abs(at.neon_v[1].t[0] - 0.5) < 1e-3, 'neon scroll animation');

  // Every material turns into a shader.
  for (const m of [ghost, pac, stage, J3D.parseBMD(arc.get('cherry.bmd'))]) for (const mat of m.materials) {
    const s = GX.genShader(mat);
    ok(!/undefined|NaN/.test(s.vs + s.fs) && /gl_FragColor/.test(s.fs), 'shader for ' + mat.name);
  }
  console.log(fails ? fails + ' FAILED' : '3D models read from the disc, all checks passed'); process.exit(fails ? 1 : 0);
})();
