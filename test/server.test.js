// End-to-end: two humans + 2 CPU seats play over real WebSockets. The first Pac-Man is random (like the original).
const WebSocket = require('ws');
const { server } = require('../server/server.js');
server.listen(0, async () => {
  const url = `ws://localhost:${server.address().port}/ws`;
  const open = () => new Promise(r => { const w = new WebSocket(url); w.q = []; w.on('message', m => w.q.push(JSON.parse(m))); w.on('open', () => r(w)); });
  const wait = (f, ms = 12000) => new Promise((res, rej) => { const t0 = Date.now(); const i = setInterval(() => { const v = f(); if (v) { clearInterval(i); res(v); } else if (Date.now() - t0 > ms) { clearInterval(i); rej(new Error('timeout')); } }, 20); });
  const last = (w, t) => w.q.filter(m => m.t === t).pop();
  try {
    const a = await open(), b = await open();
    a.send(JSON.stringify({ t: 'create', name: 'Ann', target: 10000, kinds: ['human', 'cpu', 'standin', 'cpu'] }));
    const ra = await wait(() => a.q.find(m => m.t === 'room'));
    ok(ra.target === 10000, 'room carries the chosen target');
    ok(ra.kinds.join() === 'cpu,cpu,standin,cpu' && ra.players[2].kind === 'standin', 'room carries what plays each empty seat: ' + ra.kinds);
    a.send(JSON.stringify({ t: 'seat', i: 3, kind: 'standin' })); a.send(JSON.stringify({ t: 'seat', i: 0, kind: 'standin' })); a.send(JSON.stringify({ t: 'seat', i: 2, kind: 'bogus' }));
    const rk = await wait(() => { const l = last(a, 'room'); return l && l.kinds[3] === 'standin' ? l : null; });
    ok(rk.kinds.join() === 'cpu,cpu,standin,standin' && rk.players[0].kind === 'human', 'the host changes an empty seat; a taken seat and a bad kind are ignored');
    b.send(JSON.stringify({ t: 'join', code: ra.code.toLowerCase(), name: 'Bo' }));
    const rb = await wait(() => b.q.find(m => m.t === 'room' && m.players[1].name === 'Bo'));
    ok(rb.players[1].kind === 'human', 'a joined seat is a person');
    b.send(JSON.stringify({ t: 'seat', i: 2, kind: 'cpu' })); await new Promise(r => setTimeout(r, 200));
    ok(last(a, 'room').kinds[2] === 'standin', 'only the host changes seats');
    console.log('room', ra.code, 'joined, target', ra.target);
    b.send(JSON.stringify({ t: 'start' }));          // non-host must be ignored
    await new Promise(r => setTimeout(r, 300));
    if (a.q.some(m => m.t === 'state')) throw new Error('non-host started the game');
    a.send(JSON.stringify({ t: 'start' }));
    const sa = await wait(() => { const l = last(a, 'state'); return l && l.phase === 'play' ? l : null; });
    const sb = await wait(() => last(b, 'state'));
    console.log('playing; pac is seat', sa.pacPlayer, '| Ann me', sa.me, 'Bo me', sb.me, '| Ann sees', sa.pellets.filter(Boolean).length, 'pellets, Bo sees', sb.pellets.filter(Boolean).length);
    const pacSeat = sa.pacPlayer, pacWs = pacSeat === 0 ? a : pacSeat === 1 ? b : null, pacState = pacSeat === 0 ? sa : sb;
    if (sa.scores[pacSeat] !== 1600) throw new Error('first Pac-Man should start with 1600');
    const ghostView = sa.me >= 0 ? sa : sb, pacView = sa.me < 0 ? sa : sb;
    if (pacSeat <= 1) { if (pacView.me !== -1) throw new Error('role mismatch'); if (ghostView.pellets.filter(Boolean).length >= pacView.pellets.filter(Boolean).length) throw new Error('fog not applied'); }
    if (pacWs) {
      pacWs.send(JSON.stringify({ t: 'in', d: 3 })); pacWs.send(JSON.stringify({ t: 'in', d: 1 }));
      const moved = await wait(() => { const l = last(pacWs, 'state'); return l && l.pac && Math.abs(l.pac.x - pacView.pac.x) > 0.3 ? l : null; });
      console.log('human Pac-Man steered, x', pacView.pac.x, '->', moved.pac.x);
    }
    b.close();
    await wait(() => last(a, 'room').players[1].cpu);
    console.log('Bo disconnected -> seat handed to CPU');
    console.log('server e2e passed'); process.exit(0);
  } catch (e) { console.log('FAIL', e.message); process.exit(1); }
  function ok(c, m) { if (!c) { console.log('FAIL', m); process.exit(1); } }
});
