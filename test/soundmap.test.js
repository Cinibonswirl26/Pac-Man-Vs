// The sound map: events fire their cues, honouring seat index, mode and who hears them.
global.localStorage = { getItem: () => null, setItem() {} };
const SM = require('../client/soundmap.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const log = [], out = { voice: i => log.push('v' + i), sfx: i => log.push('s' + i), hand: n => log.push('h' + n), ready: () => true };
const m = SM.create(out);
m.fire('fruitGhost', { index: 2, me: 0 }); ok(log.join() === 's13,v6', 'fruit taken by the ghost in seat 2: ' + log);
log.length = 0; m.fire('go', { me: -1 }); ok(log.join() === 'v31,hstart', 'Pac-Man hears the start sweep: ' + log);
log.length = 0; m.fire('go', { me: 1 }); ok(log.join() === 'v31', 'ghosts do not: ' + log);
m.fire('eatGhost', { index: 1 }); ok(log.pop() === 'v11', 'second ghost in the chain'); log.length = 0; m.fire('mazeCleared'); ok(log.pop() === 'v17', 'maze cleared line'); log.length = 0; m.fire('caught', { index: 3 }); ok(log.join() === 'v16', 'excellent for seat 3');
ok(m.handled('pellet') && !m.handled('nothing'), 'handled');
for (const e of SM.EVENTS) ok(m.map[e.id].length, e.id + ' has a default');
if (fails) process.exit(1); console.log('sound map ok');
