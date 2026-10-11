// The sound map: events fire their cues, honouring seat index, mode and who hears them.
global.localStorage = { getItem: () => null, setItem() {} };
const SM = require('../client/soundmap.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const log = [], out = { voice: i => log.push('v' + i), sfx: i => log.push('s' + i), hand: n => log.push('h' + n), ready: () => true };
const m = SM.create(out);
m.fire('fruitGhost', { index: 2, me: 0 }); ok(log.join() === 's13,v6', 'fruit taken by the ghost in seat 2: ' + log);
ok(SM.EVENTS.find(e => e.id === 'goGoGo').after === 60 && SM.EVENTS.find(e => e.id === 'youCanDoIt').after === 150, 'timers: 60 s and 150 s'); ok(m.handled('ghostEatenSfx') && m.handled('frightLoop') && m.handled('eyesLoop') && m.handled('powerPellet'), 'new sound events'); log.length = 0; m.fire('pellet', { me: 0 }); ok(log.join() === 's9', 'pellet sound for a ghost: ' + log); log.length = 0; m.fire('go', { me: -1 }); ok(log.join() === 'v31,hstart', 'Pac-Man hears the start sweep: ' + log);
log.length = 0; m.fire('go', { me: 1 }); ok(log.join() === 'v31', 'ghosts do not: ' + log);
m.fire('eatGhost', { index: 1 }); ok(log.pop() === 'v11', 'second ghost in the chain'); log.length = 0; m.fire('mazeCleared'); ok(log.pop() === 'v17', 'maze cleared line'); log.length = 0; m.fire('caught', { index: 3 }); ok(log.join() === 's4' && SM.EVENTS.find(e => e.id === 'caught').cues[1].delay > 0 && SM.EVENTS.find(e => e.id === 'caught').cues[1].ids[3] === 16, 'the knock at once, excellent for seat 3 after a delay: ' + log);
ok(m.handled('pellet') && !m.handled('nothing'), 'handled');
for (const e of SM.EVENTS) ok(m.map[e.id].length, e.id + ' has a default');
// music by stage
const md = SM.musicDefaults();
ok(md[1] === 'original' && md[0] === 'original' && md[7] === 'rotate', 'defaults: the Original stage and the built-in maze as the original, the rest rotate');
ok(SM.musicFor(md, 1, 3) === 'original' && SM.musicFor(md, 7, 0) === 'pacmaniaBGM02_FX_LR' && SM.musicFor(md, 7, 5) === 'pacmaniaBGM03_FX_LR', 'rotation by round');
ok(SM.musicFor({ 7: 'Pac_Arr_bgm02_LR_Comp' }, 7, 2) === 'Pac_Arr_bgm02_LR_Comp' && SM.musicFor({ 1: 'none' }, 1, 0) === 'none' && SM.musicFor({}, 2, 1) === 'pacmaniaBGM03_FX_LR', 'a chosen stream, silence, and a missing entry falling back');
ok(SM.ROTATION.every(n => SM.STREAM_NAMES[n]), 'every rotation track is named');
if (fails) process.exit(1); console.log('sound map ok');
