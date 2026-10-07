// End-to-end: two humans + 2 CPU seats play a full round over real WebSockets.
const WebSocket = require('ws');
const { server } = require('../server/server.js');
server.listen(0, async () => {
  const url = `ws://localhost:${server.address().port}/ws`;
  const open = () => new Promise(r => { const w = new WebSocket(url); w.q = []; w.on('message', m => w.q.push(JSON.parse(m))); w.on('open', () => r(w)); });
  const wait = (f, ms = 8000) => new Promise((res, rej) => { const t0 = Date.now(); const i = setInterval(() => { const v = f(); if (v) { clearInterval(i); res(v); } else if (Date.now() - t0 > ms) { clearInterval(i); rej(new Error('timeout')); } }, 20); });
  try {
    const a = await open(), b = await open();
    a.send(JSON.stringify({ t: 'create', name: 'Ann' }));
    const ra = await wait(() => a.q.find(m => m.t === 'room'));
    b.send(JSON.stringify({ t: 'join', code: ra.code.toLowerCase(), name: 'Bo' }));
    await wait(() => b.q.find(m => m.t === 'room' && m.players[1].name === 'Bo'));
    console.log('room', ra.code, 'joined, slots:', ra.players.length);
    b.send(JSON.stringify({ t: 'start' }));          // non-host must be ignored
    await new Promise(r => setTimeout(r, 300));
    if (a.q.some(m => m.t === 'state')) throw new Error('non-host started the game');
    a.send(JSON.stringify({ t: 'start' }));
    const st = await wait(() => a.q.find(m => m.t === 'state' && m.phase === 'play'), 8000);
    const sb = await wait(() => b.q.filter(m => m.t === 'state').pop());
    console.log('playing; Ann is pac?', st.me === -1, 'Bo ghost idx', sb.me, 'Bo sees pellets', sb.pellets.filter(Boolean).length, 'Ann sees', st.pellets.filter(Boolean).length);
    if (st.me !== -1 || sb.me < 0) throw new Error('role assignment wrong');
    if (sb.pellets.filter(Boolean).length >= st.pellets.filter(Boolean).length) throw new Error('fog not applied');
    a.send(JSON.stringify({ t: 'in', d: 3 }));
    const moved = await wait(() => { const l = a.q.filter(m => m.t === 'state').pop(); return l && l.pac && l.pac.x < 11.4 ? l : null; });
    console.log('Ann steered Pac-Man left, x =', moved.pac.x);
    b.close();
    await wait(() => a.q.filter(m => m.t === 'room').pop().players[1].cpu);
    console.log('Bo disconnected -> seat handed to CPU');
    console.log('server e2e passed'); process.exit(0);
  } catch (e) { console.log('FAIL', e.message); process.exit(1); }
});
