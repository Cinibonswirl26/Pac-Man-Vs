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
  const KEY = 'pacvs.soundmap.v9';
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
  const SFX_NAMES = { 4: 'Pac-Man caught (the knock)', 6: 'fruit appears chime', 8: 'power pellet eaten', 9: 'pellet eaten', 10: 'frightened ghosts (loops)', 11: 'ghost eaten (rising sweep)', 12: 'ghost "wee-woo" siren (loops)', 13: 'fruit taken / ghost eaten thump', 1: 'beep' };

  // Every moment the game can make a sound for. `per` says what the index means for 'index' cues.
  const EVENTS = [
    { id: 'ready', label: 'Round is about to start', when: 'Countdown begins', cues: [voice([32], { force: true })] },
    { id: 'go', label: 'Round starts', when: 'Countdown ends', cues: [voice([31], { force: true }), hand('start')] },
    { id: 'pellet', label: 'Pellet eaten', when: 'Each pellet and each power pellet: the "wa-ka" on Pac-Man\'s screen, and the pellet sound for everybody', cues: [hand('waka'), sfx([9], { vol: 0.7 })], note: 'When this has a cue and the disc is loaded, the old beeps are not used' },
    { id: 'powerPellet', label: 'Power pellet sound', when: 'Pac-Man eats a power pellet', cues: [sfx([8], { vol: 0.9 })] },
    { id: 'frightLoop', loop: true, label: 'Frightened ghosts loop', when: 'Plays over and over while the ghosts are frightened', cues: [sfx([10], { vol: 0.35 })] },
    { id: 'eyesLoop', loop: true, label: 'Ghost "wee-woo" siren', when: 'Plays over and over while an eaten ghost is flying home', cues: [sfx([12], { vol: 0.35 })] },
    { id: 'ghostEatenSfx', label: 'Ghost eaten sound', when: 'Pac-Man eats a frightened ghost (the rising sweep and the thump)', cues: [sfx([11, 13], { mode: 'all', vol: 0.8 })] },
    // The original's program plays one sound ID on every power pellet; the disc's instrument for it holds lines 0 and 1
    // as alternates (the two Japanese-sounding takes, 2 and 3, sit on an ID the program never calls).
    { id: 'powerPac', label: 'Power pellet - Pac-Man side', when: 'Pac-Man eats a power pellet (said to Pac-Man)', cues: [voice([0, 1], { force: true, who: 'pac' })] },
    { id: 'powerGhost', label: 'Power pellet - ghost side', when: 'Pac-Man eats a power pellet (said to the ghosts)', cues: [voice([0, 1], { force: true })] },
    { id: 'eatGhost', label: 'Ghost eaten', when: 'index = how many ghosts this power pellet has eaten so far (0 = first)', per: 'chain', cues: [voice([10, 11, 12], { mode: 'index' })] },
    { id: 'fruitAppears', label: 'Fruit appears', when: 'The fruit shows up in the maze', cues: [sfx([6]), voice([8, 9])] },
    { id: 'fruitGhost', label: 'Fruit taken by a ghost', when: 'index = the ghost player\'s seat', per: 'seat', cues: [sfx([13]), voice([4, 5, 6, 7], { mode: 'index', force: true })] },
    { id: 'fruitPac', label: 'Fruit taken by Pac-Man', when: 'Pac-Man reaches the fruit', cues: [sfx([13]), voice([26, 27], { force: true })] },
    // Pellet counts, as the original's program calls them: 100 and 50 left play one of the two shouts, 25 left the
    // worried line, 10 left the ten-pellets line (its alternate take, 19, is on an ID the program never calls).
    { id: 'hundredLeft', label: 'A hundred pellets left', when: 'A hundred pellets remain', cues: [voice([33, 34])] },
    { id: 'fiftyLeft', label: 'Fifty pellets left', when: 'Fifty pellets remain', cues: [voice([33, 34])] },
    { id: 'twentyLeft', label: 'Twenty-five pellets left', when: 'Twenty-five pellets remain', cues: [voice([20])] },
    { id: 'tenLeft', label: 'Ten pellets left', when: 'Ten pellets remain', cues: [voice([18])] },
    { id: 'pts1000', label: '1000 points to the target', when: 'Anybody is within 1000 of winning', cues: [voice([28])] },
    { id: 'pts500', label: '500 points to the target', when: 'Anybody is within 500 of winning', cues: [voice([29])] },
    // measured on the original: the "Excellent" line starts the instant Pac-Man is caught (the siren stops with it); the knock
    // comes 2.1 s later, as the EXCELLENT box appears
    { id: 'caught', label: 'Pac-Man caught', when: 'index = the catcher\'s seat', per: 'seat', cues: [voice([13, 14, 15, 16], { mode: 'index', force: true }), sfx([4], { vol: 0.9, delay: 2100 })] },
    // The exchange screen's count: the original's program asks for effect 0x1819 every 8th frame while the points move, but
    // its effect bank has no instrument for that number, so nothing sounds (the recording is silent there). Empty by
    // default; give it a cue in the lab to hear the count.
    { id: 'exchangeTick', label: 'Exchange screen count', when: 'Every 8 frames while the stolen points count across after a catch', cues: [] },
    // Timers: counted from the start of each round, so they begin again after Pac-Man clears the maze or is caught.
    { id: 'mazeCleared', label: 'Maze cleared', when: 'Pac-Man eats the last pellet', cues: [voice([17], { force: true })] },
    { id: 'final', label: 'Target score reached', when: 'A player reaches the target score ("End of the game")', cues: [voice([30], { force: true })] },
    { id: 'title', label: 'Game boots', when: 'The disc has just been loaded (title line)', cues: [voice([35], { force: true })] },
    // Arrangement levels (not in the original): effect slots the disc leaves unnamed are tried for these
    { id: 'dash', label: 'Dash arrow', when: 'Someone is hurled along a corridor by a dash arrow', cues: [sfx([0], { vol: 0.6 })] },
    { id: 'jump', label: 'Jump pad', when: 'Someone is launched by a jump pad', cues: [sfx([2], { vol: 0.6 })] },
    { id: 'land', label: 'Landing', when: 'A flight ends', cues: [sfx([3], { vol: 0.5 })] },
    { id: 'stun', label: 'Ghost knocked dizzy', when: 'A dashing Pac-Man knocks a ghost aside', cues: [sfx([5], { vol: 0.7 })] },
    { id: 'bonk', label: 'Dash into a wall', when: 'A dasher slams into a wall and stands dizzy for a moment', cues: [sfx([1], { vol: 0.7 })] },
    { id: 'capsule', label: 'Capsule taken by Pac-Man', when: 'Pac-Man takes a capsule', cues: [sfx([7], { vol: 0.7 })] },
    { id: 'capsuleGhost', label: 'Capsule taken by a ghost', when: 'A ghost takes a capsule', cues: [sfx([14], { vol: 0.7 })] },
    { id: 'pot', label: 'Ghosts potted', when: 'The pink capsule pulls every ghost into the house', cues: [sfx([15], { vol: 0.7 })] },
    { id: 'hop', label: 'Ghost hop', when: 'A ghost with the hop takes off', cues: [sfx([2], { vol: 0.5 })] },
    { id: 'bigPellet', label: 'Big pellet eaten', when: 'Pac-Man chews a big pellet a ghost dropped', cues: [sfx([9], { vol: 0.9 })] },
    { id: 'cloneGone', label: 'Clone gone', when: 'A mirror clone vanishes', cues: [sfx([13], { vol: 0.4 })] },
    { id: 'champion', label: 'Champion', when: 'Shortly after the match ends; index = the winner\'s seat', per: 'seat', cues: [voice([22, 23, 24, 25], { mode: 'index', force: true, delay: 1700 })] }
  ];

  // Music by stage. The disc's streams, with the names the lab shows, and what each stage plays:
  //   'original' = the Original stage's treatment: the classic start jingle through the countdown, no stream but the
  //                siren while the round runs, the cleared jingle when the maze is cleared
  //   'rotate'   = one of the four Pac-Mania game tracks, by round number, looping through the countdown and the round
  //   'none'     = silence
  //   a stream name = that stream, looping through the countdown and the round
  // Stage numbers are the disc's (1 = Original Pac-Man ... 13 = Haunted Hall); 0 is the built-in maze.
  const MUSIC_KEY = 'pacvs.music.v1';
  const STREAM_NAMES = {
    pacmanBGM00_FX_LR: 'Classic start jingle', pacmaniaBGM02_FX_LR: 'Pac-Mania track 2', pacmaniaBGM03_FX_LR: 'Pac-Mania track 3',
    pacmaniaBGM05_FX_LR: 'Exchange screen tune (Pac-Mania track 5)', pacmaniaBGM06_FX_LR: 'Pac-Mania track 6', pacmaniaBGM07_FX_LR: 'Pac-Mania track 7',
    Pac_Arr_bgm02_LR_Comp: 'Arrangement track', Pac_Arr_Clear_LR: 'Maze cleared jingle', Pac_Opening_Comp_LR: 'Opening theme (menus)', Pac_Op_loop73_LR: 'Opening loop'
  };
  const ROTATION = ['pacmaniaBGM02_FX_LR', 'pacmaniaBGM03_FX_LR', 'pacmaniaBGM06_FX_LR', 'pacmaniaBGM07_FX_LR'];
  const MUSIC_CHOICES = [['original', 'As the original stage: start jingle, then the siren'], ['rotate', 'Pac-Mania tracks, a different one each round'], ['none', 'No music']];
  function musicDefaults() { const m = { 0: 'original' }; for (let k = 1; k <= 13; k++) m[k] = k === 1 ? 'original' : 'rotate'; return m; }
  function loadMusic() {
    const m = musicDefaults();
    try { const o = JSON.parse(localStorage.getItem(MUSIC_KEY)); if (o && typeof o === 'object') for (const k of Object.keys(m)) if (typeof o[k] === 'string' && o[k]) m[k] = o[k]; } catch { /* none saved */ }
    return m;
  }
  function saveMusic(map) { try { localStorage.setItem(MUSIC_KEY, JSON.stringify(map)); return true; } catch { return false; } }
  /** What a stage plays in round `round` (0-based): 'original', 'none' or a stream name. */
  function musicFor(map, stage, round) {
    const v = (map || musicDefaults())[stage] || musicDefaults()[stage] || 'rotate';
    return v === 'rotate' ? ROTATION[(round || 0) % ROTATION.length] : v;
  }

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
  return { EVENTS, VOICE_NAMES, SFX_NAMES, defaults, load, save, create, KEY, STREAM_NAMES, ROTATION, MUSIC_CHOICES, MUSIC_KEY, musicDefaults, loadMusic, saveMusic, musicFor };
});
