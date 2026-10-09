/* "Arrangement" levels: extra mechanics borrowed from the 1996 arcade Pac-Man Arrangement, laid over
 * mazes the disc already holds (ones without a menu entry), so the six original stages stay as they are.
 * A level is a maze descriptor with an `arrange` field:
 *   { pads: [ { x, y, kind: 'dash', dir }                 a floor arrow: step on it and you are hurled along the corridor
 *           | { x, y, kind: 'jump', pair, colour } ],     a pad that launches you to its partner pad (index `pair`)
 *     items: true }                                       capsules may appear where the fruit appears
 * Original code. UMD: window.PacArrange in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PacArrange = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const dash = (x, y, dir) => ({ x, y, kind: 'dash', dir });
  const jump = (x, y, pair, colour) => ({ x, y, kind: 'jump', pair, colour });

  /** The levels. `base` is the stage number of the disc maze they sit on (0: the built-in maze). Pad cells are
   *  given in that maze's grid. Jump pads pair by index into the same list. */
  const LEVELS = [
    { id: 'arr:9', base: 9, name: 'Dash Park', items: true,
      pads: [dash(2, 19, 1), dash(18, 19, 3), dash(3, 5, 1), dash(17, 5, 3), dash(1, 1, 2), dash(1, 7, 0), dash(19, 1, 2), dash(19, 7, 0)] },
    { id: 'arr:7', base: 7, name: 'Jump Forest', items: true,
      pads: [jump(3, 1, 1, 0), jump(3, 21, 0, 0), jump(17, 1, 3, 1), jump(17, 21, 2, 1), dash(5, 21, 1), dash(15, 21, 3)] },
    { id: 'arr:0', base: 0, name: 'Arrangement (built-in maze)', items: true,
      pads: [dash(1, 4, 1), dash(21, 4, 3), dash(1, 13, 1), dash(21, 13, 3), jump(1, 6, 5, 0), jump(21, 6, 4, 0), jump(3, 18, 7, 1), jump(19, 18, 6, 1)] }
  ];
  const KINDS = ['dash', 'jump'];
  const CAPSULES = ['red', 'cyan', 'pink', 'orange', 'gold'];

  /** Check an `arrange` field against its maze. Returns a clean copy, or null if anything is off: pads must sit
   *  on open floor outside the house, on distinct cells, away from the start cells and the fruit spot; a dash
   *  arrow must point along open floor; jump pads must pair up both ways; the rows must be mirror-symmetric
   *  (the mirror clone relies on it). */
  function validate(a, maze) {
    try {
      if (!a || typeof a !== 'object' || !Array.isArray(a.pads) || a.pads.length > 16) return null;
      const rows = maze.rows, W = rows[0].length, H = rows.length;
      if (rows.some(r => r !== r.split('').reverse().join(''))) return null;
      const h = maze.house || { x0: -1, x1: -1, y0: -1, y1: -1 };
      const inHouse = (x, y) => x >= h.x0 - 1 && x <= h.x1 + 1 && y >= h.y0 - 1 && y <= h.y1 + 1;
      const open = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < W && y >= 0 && y < H && !'#=D_'.includes(rows[y][x]) && !inHouse(x, y);
      const taken = new Set([maze.pac, maze.exit, ...(maze.ghosts || []), maze.fruit || maze.pac].filter(Boolean).map(p => p[0] + ',' + p[1]));
      const out = [];
      for (let i = 0; i < a.pads.length; i++) {
        const p = a.pads[i];
        if (!p || !KINDS.includes(p.kind) || !open(p.x, p.y) || taken.has(p.x + ',' + p.y)) return null;
        taken.add(p.x + ',' + p.y);
        if (p.kind === 'dash') {
          if (!Number.isInteger(p.dir) || p.dir < 0 || p.dir > 3) return null;
          const [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][p.dir];
          if (!open(p.x + dx, p.y + dy)) return null;
          out.push(dash(p.x, p.y, p.dir));
        } else {
          if (!Number.isInteger(p.pair) || p.pair === i || p.pair < 0 || p.pair >= a.pads.length) return null;
          const q = a.pads[p.pair];
          if (!q || q.kind !== 'jump' || q.pair !== i) return null;
          out.push(jump(p.x, p.y, p.pair, Number.isInteger(p.colour) && p.colour >= 0 && p.colour < 4 ? p.colour : 0));
        }
      }
      return { pads: out, items: !!a.items };
    } catch { return null; }
  }

  /** The level laid over its base maze: a fresh descriptor, the base left untouched. Null if the pads do not
   *  fit the maze (a wrong base). */
  function apply(base, level) {
    const m = Object.assign({}, base, { name: level.name, arrange: { pads: level.pads, items: !!level.items } });
    return validate(m.arrange, m) ? m : null;
  }
  const byId = id => LEVELS.find(l => l.id === id) || null;

  return { LEVELS, KINDS, CAPSULES, validate, apply, byId };
});
