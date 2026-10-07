// Online hand-over: a person catches Pac-Man, every player is told who is next, only the catcher can
// start the next round, and then each player's view switches role (catcher -> Pac-Man, old Pac-Man -> ghost).
const WebSocket = require('ws');
const { server, rooms } = require('../server/server.js');
server.listen(0, async () => {
  const url = `ws://localhost:${server.address().port}/ws`;
  const open = () => new Promise(r => { const w = new WebSocket(url); w.q = []; w.on('message', m => w.q.push(JSON.parse(m))); w.on('open', () => r(w)); });
  const wait = (f, ms = 15000) => new Promise((res, rej) => { const t0 = Date.now(); const i = setInterval(() => { const v = f(); if (v) { clearInterval(i); res(v); } else if (Date.now() - t0 > ms) { clearInterval(i); rej(new Error('timeout')); } }, 20); });
  const last = (w, t) => w.q.filter(m => m.t === t).pop();
  const ok = (c, m) => { if (!c) { console.log('FAIL', m); process.exit(1); } };
  try {
    const a = await open(), b = await open(), ws = [a, b];
    a.send(JSON.stringify({ t: 'create', name: 'Ann' }));
    const ra = await wait(() => a.q.find(m => m.t === 'room'));
    b.send(JSON.stringify({ t: 'join', code: ra.code, name: 'Bo' }));
    await wait(() => b.q.find(m => m.t === 'room' && m.players[1].name === 'Bo'));
    a.send(JSON.stringify({ t: 'start' }));
    await wait(() => { const l = last(a, 'state'); return l && l.phase === 'play'; });
    // Put a human ghost onto Pac-Man.
    const room = rooms.get(ra.code), m = room.match, s = m.sim;
    const catcher = s.pacPlayer === 0 ? 1 : 0, other = 1 - catcher, oldPac = s.pacPlayer;
    const gi = s.ghosts.findIndex((g, k) => m.Sim.playerOfGhost(s, k) === catcher);
    Object.assign(s.ghosts[gi], { x: s.pac.x, y: s.pac.y });
    await wait(() => { const l = last(a, 'state'); return l && l.phase === 'roundover' && l.why === 'caught'; });
    ok(last(a, 'state').catcher === catcher, 'catch reported to everyone');
    const h = await wait(() => { const l = last(ws[other], 'state'); return l && l.phase === 'handoff' ? l : null; }, 9000);
    ok(h.next === catcher && last(ws[catcher], 'state').next === catcher, 'both players know who takes over Pac-Man');
    ws[other].send(JSON.stringify({ t: 'ready' }));
    await new Promise(r => setTimeout(r, 400));
    ok(last(a, 'state').phase === 'handoff', 'only the catcher can end the hand-over');
    ws[catcher].send(JSON.stringify({ t: 'ready' }));
    await wait(() => { const l = last(ws[catcher], 'state'); return l && l.phase === 'countdown'; });
    await new Promise(r => setTimeout(r, 150));
    const vc = last(ws[catcher], 'state'), vo = last(ws[other], 'state');
    ok(vc.me === -1 && vc.pacPlayer === catcher, 'the catcher now gets the Pac-Man view');
    ok(vc.pellets.filter(Boolean).length === room.match.sim.total, 'Pac-Man sees the whole maze');
    ok(vo.me >= 0 && vo.pacPlayer === catcher, 'the other player is a ghost');
    ok(oldPac !== catcher, 'role moved');
    console.log(`P${catcher + 1} caught P${oldPac + 1}, waited for ready, now Pac-Man; P${other + 1} is a ghost`);
    console.log('online hand-over ok'); process.exit(0);
  } catch (e) { console.log('FAIL', e.message); process.exit(1); }
});
