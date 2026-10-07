/* Reads the "Original Pac-Man" maze out of the GBA program (PROOT/gbademo/packman.bin) on the player's own disc.
 * The program keeps each maze as a 32-entry-wide table of 16-bit tile numbers. Walls are individual line
 * pieces, 15 is empty floor, 30 a pellet and 31 a power pellet. Nothing is stored; the layout is read at run time.
 * UMD: window.Gbamap in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Gbamap = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const EMPTY = 15, PELLET = 30, POWER = 31, GATE = [16, 17, 18];
  const W = 19, H = 21;
  // Cells of this stage that are the same in every round
  const PAC = [9, 12], GHOSTS = [[6, 6], [12, 6], [9, 8]], EXIT = [9, 8], DOOR_ROW = 9, HOUSE_ROW = 10, TUNNEL_ROW = 10;

  const u16 = (b, o) => b[o] | (b[o + 1] << 8);

  /** Find the table by the signature of its fifth row: wall, 19 pellets, wall. Returns the byte offset of that row. */
  function locate(rom) {
    const sig = [2, ...new Array(19).fill(PELLET), 2];
    outer: for (let o = 4 * 64; o + 24 * 64 < rom.length; o += 2) {
      for (let i = 0; i < sig.length; i++) if (u16(rom, o + i * 2) !== sig[i]) continue outer;
      // The top border row above it must be wall pieces, the maze must hold 172 pellets and 4 power pellets
      let pel = 0, pow = 0;
      for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const t = u16(rom, o + (r - 4) * 64 + (c + 1) * 2); if (t === PELLET) pel++; else if (t === POWER) pow++; }
      if (pel === 172 && pow === 4) return o;
    }
    return -1;
  }

  /** tile(c, r) for c in -1..19, r in -1..21 */
  function reader(rom, o) { return (c, r) => u16(rom, o + (r - 4) * 64 + (c + 1) * 2); }

  /** Build a maze descriptor (see PacSim.makeMaze). The grid is 21 wide: the outer wall columns are kept so
   *  that only the tunnel row connects the two sides. */
  function stage1(rom, makeMaze) {
    const o = locate(rom);
    if (o < 0) throw new Error('This disc image does not contain the expected maze table.');
    const tile = reader(rom, o);
    const floor = t => t === EMPTY || t === PELLET || t === POWER;
    // corridor cells = floor reachable from Pac-Man's start (enclosed black fill is not reachable)
    const seen = new Set([PAC.join()]), q = [PAC];
    while (q.length) {
      const [c, r] = q.pop();
      for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = [c + dc, r + dr];
        if (n[1] < 0 || n[1] >= H || n[0] < -1 || n[0] > W) continue;
        if ((n[0] < 0 || n[0] >= W) && n[1] !== TUNNEL_ROW) continue;
        if (!floor(tile(n[0], n[1])) || seen.has(n.join())) continue;
        seen.add(n.join()); q.push(n);
      }
    }
    const rows = [];
    for (let r = 0; r < H; r++) {
      let s = '';
      for (let c = -1; c <= W; c++) {
        const t = tile(c, r);
        if (r === DOOR_ROW && c >= 8 && c <= 10 && GATE.includes(t)) s += 'D';
        else if (r === HOUSE_ROW && c >= 8 && c <= 10) s += '_';
        else if (!seen.has([c, r].join())) s += '#';
        else s += t === PELLET ? '.' : t === POWER ? 'o' : ' ';
      }
      rows.push(s);
    }
    // grid column = tile column + 1
    const sh = p => [p[0] + 1, p[1]];
    // Pac-Man's own cell holds no pellet in this stage (the table has an empty tile there), nothing to remove
    return makeMaze(rows, {
      name: 'Original Pac-Man', pac: sh(PAC), ghosts: GHOSTS.map(sh), door: sh([9, DOOR_ROW]), exit: sh(EXIT),
      house: { x0: 9, x1: 11, y0: HOUSE_ROW, y1: HOUSE_ROW }
    });
  }
  return { stage1, locate };
});
