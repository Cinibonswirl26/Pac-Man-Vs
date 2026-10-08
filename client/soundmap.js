/* Which sound plays for which game event. The defaults are this project's reading of the original; the sound lab
 * (/client/soundlab.html) lets a player change them, and the choices are kept in the browser and used by the game.
 * A cue is one sound played for an event:
 *   kind  'voice' (announcer line), 'sfx' (effect) or 'hand' (Pac-Man's own screen: 'waka' or 'start')
 *   ids   the numbers of the sounds (or the hand sound's name)
 *   mode  'one' = play one of ids at random, 'all' = play all of them, 'index' = ids[n] for the player or seat n
 *   who   'all', 'pac' (only the player who is Pac-Man hears it) or 'ghost' (only the ghost players)
 *   chance 0..1: how often the cue plays at all (the original speaks after only some power pellets)
 *   force true = cut in on an announcer line that is still playing;  delay in ms;  vol 0..1
 * UMD: window.SoundMap in the browser, module.exports in Node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SoundMap = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const KEY = 'pacvs.soundmap.v6';
  const voice = (ids, o) => Object.assign({ kind: 'voice', ids, mode: 'one', who: 'all', force: false, delay: 0, vol: 1 }, o);
  const sfx = (ids, o) => Object.assign({ kind: 'sfx', ids, mode: 'one', who: 'all', force: false, delay: 0, vol: 0.8 }, o);
  const hand = (name, o) => Object.assign({ kind: 'hand', ids: [name], mode: 'one', who: 'pac', force: false, delay: 0, vol: 1 }, o);

  // Names the lab shows next to each sound. Lines found by speech recognition are named; the rest are for you to name.
  const VOICE_NAMES = {
    0: 'Pac-Man ate a Power Pellet!', 1: 'Watch out! Pac-Man ate a Power Pellet!', 2: 'Pac-Man ate a Power-Dot! (Japanese line?)', 3: 'Watch out! Pac-Man ate a Power Dot! (Japanese line?)',
    4: 'got the fruit (seat 1)', 5: 'got the fruit (seat 2)', 6: 'got the fruit (seat 3)', 7: 'got the fruit (seat 4)',
    8: 'Fruit appeared', 9: 'Fruit appeared (other)',
    10: 'Oh no (first ghost in the chain eaten)', 11: 'Oh NO (second ghost in the chain eaten)', 12: 'OH NO! (third ghost in the chain eaten)',
    13: 'Excellent (seat 1)', 14: 'Excellent (seat 2)', 15: 'Excellent (seat 3)', 16: 'Excellent (seat 4)',
    17: 'Maze cleared (confirmed in the original)', 18: 'Only ten pellets left', 19: 'Only ten pellets left (other)', 20: "This doesn't look good! (20 pellets left)", 21: 'Unused (warp zone?)',
    22: 'champion (seat 1)', 23: 'champion (seat 2)', 24: 'champion (seat 3)', 25: 'champion (seat 4)',
    26: 'Pac-Man ate the fruit', 27: 'Pac-Man ate the fruit (other)', 28: 'One thousand points left', 29: 'Five hundred points left',
    30: 'End of the game', 31: 'Go', 32: 'Ready', 33: 'Go go go!', 34: 'You can do it!', 35: 'Title'
  };
  const SFX_NAMES = { 6: 'fruit appears chime', 8: 'power pellet eaten', 9: 'pellet eaten', 10: 'frightened ghosts (loops)', 11: 'ghost eaten (rising sweep)', 12: 'ghost "wee-woo" siren (loops)', 13: 'fruit taken / ghost eaten thump', 1: 'beep' };

  // Every moment the game can make a sound for. `per` says what the index means for 'index' cues.
  const EVENTS = [
    { id: 'ready', label: 'Round is about to start', when: 'Countdown begins', cues: [voice([32], { force: true })] },
    { id: 'go', label: 'Round starts', when: 'Countdown ends', cues: [voice([31], { force: true }), hand('start')] },
    { id: 'pellet', label: 'Pellet eaten', when: 'Each pellet and each power pellet: the "wa-ka" on Pac-Man\'s screen, and the pellet sound for everybody', cues: [hand('waka'), sfx([9], { vol: 0.7 })], note: 'When this has a cue and the disc is loaded, the old beeps are not used' },
    { id: 'powerPellet', label: 'Power pellet sound', when: 'Pac-Man eats a power pellet', cues: [sfx([8], { vol: 0.9 })] },
    { id: 'frightLoop', loop: true, label: 'Frightened ghosts loop', when: 'Plays over and over while the ghosts are frightened', cues: [sfx([10], { vol: 0.35 })] },
    { id: 'eyesLoop', loop: true, label: 'Ghost "wee-woo" siren', when: 'Plays over and over while an eaten ghost is flying home', cues: [sfx([12], { vol: 0.35 })] },
    { id: 'ghostEatenSfx', label: 'Ghost eaten sound', when: 'Pac-Man eats a frightened ghost (the rising sweep and the thump)', cues: [sfx([11, 13], { mode: 'all', vol: 0.8 })] },
    { id: 'powerPac', label: 'Power pellet - Pac-Man side', when: 'Pac-Man eats a power pellet (said to Pac-Man); the original spoke after about 3 in 5', cues: [voice([0, 2], { force: true, who: 'pac', chance: 0.6 })] },
    { id: 'powerGhost', label: 'Power pellet - ghost side', when: 'Pac-Man eats a power pellet (said to the ghosts)', cues: [voice([1, 3], { force: true, chance: 0.6 })] },
    { id: 'eatGhost', label: 'Ghost eaten', when: 'index = how many ghosts this power pellet has eaten so far (0 = first)', per: 'chain', cues: [voice([10, 11, 12], { mode: 'index' })] },
    { id: 'fruitAppears', label: 'Fruit appears', when: 'The fruit shows up in the maze', cues: [sfx([6]), voice([8, 9])] },
    { id: 'fruitGhost', label: 'Fruit taken by a ghost', when: 'index = the ghost player\'s seat', per: 'seat', cues: [sfx([13]), voice([4, 5, 6, 7], { mode: 'index', force: true })] },
    { id: 'fruitPac', label: 'Fruit taken by Pac-Man', when: 'Pac-Man reaches the fruit', cues: [sfx([13]), voice([26, 27], { force: true })] },
    { id: 'twentyLeft', label: 'Twenty pellets left', when: 'Twenty pellets remain', cues: [voice([20])] },
    { id: 'tenLeft', label: 'Ten pellets left', when: 'Ten pellets remain', cues: [voice([18, 19])] },
    { id: 'pts1000', label: '1000 points to the target', when: 'Anybody is within 1000 of winning', cues: [voice([28])] },
    { id: 'pts500', label: '500 points to the target', when: 'Anybody is within 500 of winning', cues: [voice([29])] },
    { id: 'caught', label: 'Pac-Man caught', when: 'index = the catcher\'s seat', per: 'seat', cues: [voice([13, 14, 15, 16], { mode: 'index', force: true })] },
    // Timers: counted from the start of each round, so they begin again after Pac-Man clears the maze or is caught.
    { id: 'goGoGo', after: 60, label: '"Go go go!" timer', when: 'One minute into a round, in the game only', cues: [voice([33])] },
    { id: 'youCanDoIt', after: 150, label: '"You can do it!" timer', when: 'Two and a half minutes into a round, in the game only', cues: [voice([34])] },
    { id: 'mazeCleared', label: 'Maze cleared', when: 'Pac-Man eats the last pellet', cues: [voice([17], { force: true })] },
    { id: 'final', label: 'Target score reached', when: 'A player reaches the target score ("End of the game")', cues: [voice([30], { force: true })] },
    { id: 'title', label: 'Game boots', when: 'The disc has just been loaded (title line)', cues: [voice([35], { force: true })] },
    { id: 'champion', label: 'Champion', when: 'Shortly after the match ends; index = the winner\'s seat', per: 'seat', cues: [voice([22, 23, 24, 25], { mode: 'index', force: true, delay: 1700 })] }
  ];

  const clone = o => JSON.parse(JSON.stringify(o));
  function defaults() { const m = {}; for (const e of EVENTS) m[e.id] = clone(e.cues); return m; }
  function load() {
    const m = defaults();
    try { const o = JSON.parse(localStorage.getItem(KEY)); if (o && typeof o === 'object') for (const id of Object.keys(m)) if (Array.isArray(o[id])) m[id] = o[id]; } catch { /* none saved */ }
    return m;
  }
  function save(map) { try { localStorage.setItem(KEY, JSON.stringify(map)); return true; } catch { return false; } }

  /** `out` is what actually makes noise: { voice(i, force, vol), sfx(i, vol), hand(name), ready() }. */
  function create(out, map) {
    map = map || load();
    const api = {
      map,
      reload() { api.map = load(); },
      /** Does this event have something to play (so the game should not use its old beep)? */
      handled: id => out.ready() && !!(api.map[id] && api.map[id].length),
      /** Play an event's cues. p = { index (seat), me (the local player's ghost number, -1 when Pac-Man) }. */
      fire(id, p) {
        p = p || {};
        for (const c of api.map[id] || []) {
          if (c.who === 'pac' && !(p.me < 0)) continue;
          if (c.who === 'ghost' && !(p.me >= 0)) continue;
          let ids = c.ids || [];
          if (c.mode === 'one') ids = ids.length ? [ids[Math.floor(Math.random() * ids.length)]] : [];
          else if (c.mode === 'index') ids = ids[p.index] != null ? [ids[p.index]] : [];
          if (c.chance != null && c.chance < 1 && Math.random() >= c.chance) continue;
          const go = () => { for (const i of ids) { if (c.kind === 'voice') out.voice(+i, !!c.force, c.vol); else if (c.kind === 'sfx') out.sfx(+i, c.vol); else if (c.kind === 'hand') out.hand(String(i)); } };
          if (c.delay > 0) setTimeout(go, c.delay); else go();
        }
      }
    };
    return api;
  }
  return { EVENTS, VOICE_NAMES, SFX_NAMES, defaults, load, save, create, KEY };
});
