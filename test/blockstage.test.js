// The Arrangement levels' block world: made from the maze rows, the same every time, in the four block colours.
const B = require('../client/blockstage.js'), S = require('../shared/sim.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const maze = S.BUILTIN, W = maze.rows[0].length, H = maze.rows.length;
const st = B.build(maze, 'test');
const walls = maze.rows.join('').split('').filter(c => c === '#' || c === '=').length;
const g = B.cells(maze);
let margin = 0; for (let y = -3; y < H + 3; y++) for (let x = -3; x < W + 3; x++) if ((x < 0 || y < 0 || x >= W || y >= H) && g.at(x, y) === '#') margin++;
ok(st.blocks === 4 * (walls + margin), 'four blocks for every wall cell, the margin too: ' + st.blocks);
ok(st.bmd.draws.length === 2 && st.poses.length === 2 && st.bmd.textures.length === 2, 'floor and blocks, two textures');
ok(st.bmd.shapes.every((s, i) => s.drw.length * 3 === st.poses[i].pos.length && s.clr.length === s.drw.length * 4 && s.uv.length === s.drw.length * 2), 'every vertex has a position, colour and texture coordinate');
ok(st.colOff === 1 && st.rowOff === 1 && st.floor === 0, 'placed on the sim grid, floor at 0');
ok(g.at(-1, 10) === '_' && g.at(-1, 9) === '#', 'the margin stays open only along the tunnel row');
const again = B.build(maze, 'test');
ok(again.poses[1].pos.every((v, i) => v === st.poses[1].pos[i]) && again.bmd.shapes[1].clr.every((v, i) => v === st.bmd.shapes[1].clr[i]), 'the same every time');
// colours: from the palette, in runs of two or three along each wall (counted along its own direction)
let longest = 0, shortest = 99;
const runs = (n, m, at) => { for (let j = 0; j < m; j++) { let run = 0, last = -1; for (let i = 0; i <= n; i++) {
  const c = i < n ? at(i, j) : -1;
  if (c >= 0 && c === last) run++; else { if (last >= 0) longest = Math.max(longest, run); run = 1; } last = c;
} } };
const wallAt = (hx, hy) => /[#=]/.test(maze.rows[hy >> 1][hx >> 1]);
for (let hy = 0; hy < 2 * H; hy++) for (let hx = 0; hx < 2 * W; hx++) if (wallAt(hx, hy)) { const c = B.blockColour(g, hx, hy); ok(c >= 0 && c < 4, 'a palette colour'); }
runs(2 * W, 2 * H, (hx, hy) => wallAt(hx, hy) && B.horizontal(g, hx, hy) ? B.blockColour(g, hx, hy) : -1);
runs(2 * H, 2 * W, (hy, hx) => wallAt(hx, hy) && !B.horizontal(g, hx, hy) ? B.blockColour(g, hx, hy) : -1);
ok(longest <= 3, 'along a wall, runs of one colour are at most three blocks: ' + longest);
// the handheld picture: 8 pixels a cell, purple floor where the rows have corridors
const img = B.handheldImage(maze);
ok(img.w === 8 * W && img.h === 8 * H && img.rgb.length === img.w * img.h * 3, 'handheld picture size');
const px = (x, y) => [...img.rgb.slice((y * img.w + x) * 3, (y * img.w + x) * 3 + 3)];
const floorPx = px(8 * 2 + 5, 8 * 1 + 6), wallPx = px(8 * 0 + 2, 8 * 0 + 2);
ok(floorPx[2] > floorPx[1] && floorPx[0] > floorPx[1], 'corridors are purple: ' + floorPx);
ok(B.PALETTE.some(c => Math.abs(c[0] - wallPx[0]) < 2 && Math.abs(c[1] - wallPx[1]) < 2 && Math.abs(c[2] - wallPx[2]) < 2), 'a wall pixel inside a block is its colour: ' + wallPx);
console.log(fails ? fails + ' FAILED' : 'block stage ok'); process.exit(fails ? 1 : 0);
