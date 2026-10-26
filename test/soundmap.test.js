// The sound map: events fire their cues, honouring seat index, mode and who hears them.
global.localStorage = { getItem: () => null, setItem() {} };
const SM = require('../client/soundmap.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const log = [], out = { voice: i => log.push('v' + i), sfx: i => log.push('s' + i), hand: n => log.push('h' + n), tone: n => log.push('t' + n), ready: () => true };
const m = SM.create(out);
m.fire('fruitGhost', { index: 2, me: 0 }); ok(log.join() === 's13,v6,tsightWide', 'fruit taken by the ghost in seat 2 (with the sight-widening tone): ' + log);
ok(SM.EVENTS.find(e => e.id === 'hundredLeft') && SM.EVENTS.find(e => e.id === 'fiftyLeft') && !SM.EVENTS.find(e => e.id === 'goGoGo'), 'the shouts come at 100 and 50 pellets left, not on timers'); ok(m.handled('ghostEatenSfx') && m.handled('frightLoop') && m.handled('eyesLoop') && m.handled('powerPellet'), 'new sound events'); log.length = 0; m.fire('pellet', { me: 0 }); ok(log.join() === 's9', 'pellet sound for a ghost: ' + log); log.length = 0; m.fire('go', { me: -1 }); ok(log.join() === 'v31', 'the handheld makes no sound at Go: ' + log); log.length = 0; m.fire('fruitPac', { me: -1 }); ok(log.join() === 's13,hfruit' || log.join().startsWith('s13,v2') && log.join().endsWith(',hfruit'), 'Pac-Man taking the fruit: the TV sounds and the handheld\'s fruit sweep: ' + log);
log.length = 0; m.fire('go', { me: 1 }); ok(log.join() === 'v31', 'ghosts do not: ' + log);
m.fire('eatGhost', { index: 1 }); ok(log.pop() === 'v11', 'second ghost in the chain'); log.length = 0; m.fire('mazeCleared'); ok(log.pop() === 'v17', 'maze cleared line'); log.length = 0; m.fire('caught', { index: 3 }); { const c = SM.EVENTS.find(e => e.id === 'caught').cues; ok(log.join() === 'v16' && c[0].ids[3] === 16 && c[1].ids[0] === 14 && c[1].delay === 1001 && c[2].kind === 'hand' && c[2].who === 'pac', 'excellent for seat 3 at once, the death sound when the standstill ends (TV and, for Pac-Man, the handheld): ' + log); }
ok(m.handled('pellet') && !m.handled('nothing'), 'handled');
for (const e of SM.EVENTS) ok(m.map[e.id].length, e.id + ' has a default');
log.length = 0; m.fire('exchangeTick', { me: 0 }); m.fire('exchangeTick', { me: -1 }); ok(log.join() === 'tcount,tcount', 'everyone hears the count tone on the exchange screen: ' + log);
// music by stage
const md = SM.musicDefaults();
ok(md[1] === 'original' && md[0] === 'original', 'defaults: the Original stage and the built-in maze as the original');
ok(md[5] === 'pacmaniaBGM02_FX_LR' && md[6] === 'pacmaniaBGM03_FX_LR' && md[4] === 'pacmaniaBGM06_FX_LR' && md[8] === 'pacmaniaBGM07_FX_LR' && md[13] === 'Pac_Arr_bgm02_LR_Comp', "defaults: each of the original's stages has its own stream, as the game plays them");
ok(md[2] === md[5] && md[11] === md[5] && md[7] === md[6] && md[9] === md[4] && md[10] === md[13], 'the mazes without a menu entry take the track of their family');
ok(Object.values(md).every(v => v === 'original' || SM.STREAM_NAMES[v]), 'every default is a named stream or the original treatment');
ok(SM.musicFor(md, 1, 3) === 'original' && SM.musicFor(md, 5, 0) === 'pacmaniaBGM02_FX_LR' && SM.musicFor(md, 5, 5) === 'pacmaniaBGM02_FX_LR', 'the stage track does not change with the round');
ok(SM.musicFor({ 7: 'rotate' }, 7, 0) === 'pacmaniaBGM02_FX_LR' && SM.musicFor({ 7: 'rotate' }, 7, 5) === 'pacmaniaBGM03_FX_LR', 'rotation by round when chosen');
ok(SM.musicFor({ 7: 'Pac_Arr_bgm02_LR_Comp' }, 7, 2) === 'Pac_Arr_bgm02_LR_Comp' && SM.musicFor({ 1: 'none' }, 1, 0) === 'none' && SM.musicFor({}, 2, 1) === 'pacmaniaBGM02_FX_LR', 'a chosen stream, silence, and a missing entry falling back to the default');
ok(SM.ROTATION.every(n => SM.STREAM_NAMES[n]), 'every rotation track is named');
if (fails) process.exit(1); console.log('sound map ok');
