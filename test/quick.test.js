// Quick match: "Find a game" pairs people into open quick rooms; a room that fills seats starts QUICK_WAIT s after
// its second player (or at once with four); one that does not waits for four. Run with a short wait.
process.env.QUICK_WAIT = '1';
const WebSocket = require('ws');
const { server, rooms } = require('../server/server.js');
server.listen(0, async () => {
  const url = `ws://localhost:${server.address().port}/ws`;
  const open = () => new Promise(r => { const w = new WebSocket(url); w.q = []; w.on('message', m => w.q.push(JSON.parse(m))); w.on('open', () => r(w)); });
  const wait = (f, ms = 8000) => new Promise((res, rej) => { const t0 = Date.now(); const i = setInterval(() => { const v = f(); if (v) { clearInterval(i); res(v); } else if (Date.now() - t0 > ms) { clearInterval(i); rej(new Error('timeout')); } }, 20); });
  const last = (w, t) => w.q.filter(m => m.t === t).pop();
  const find = (w, name, fill) => w.send(JSON.stringify({ t: 'find', name, fill }));
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  function ok(c, m) { if (!c) { console.log('FAIL', m); process.exit(1); } }
  try {
    const a = await open(); find(a, 'Ann', true);
    const ra = await wait(() => last(a, 'room'));
    ok(ra.quick && ra.autoFill && ra.startsIn == null && ra.players[0].name === 'Ann' && ra.maze === null, 'the first seeker opens a quick room and waits alone');
    await sleep(1300); ok(!a.q.some(m => m.t === 'state'), 'one person never starts a match');
    const c = await open(); find(c, 'Cy', false);
    const rc = await wait(() => last(c, 'room'));
    ok(rc.code !== ra.code && !rc.autoFill, 'a seeker who wants four people gets a room of their own');
    const b = await open(); find(b, 'Bo', true);
    const rb = await wait(() => { const l = last(b, 'room'); return l && l.code === ra.code ? l : null; });
    ok(rb.players[1].name === 'Bo' && rb.startsIn != null && rb.startsIn <= 1, 'the second seeker joins the first room and the countdown starts: ' + rb.startsIn);
    const sa = await wait(() => last(a, 'state'));
    const rr = last(a, 'room');
    ok(rr.players[2].cpu && rr.players[3].cpu && rr.kinds[2] === 'cpu' && rr.kinds[3] === 'cpu', 'after the wait the empty seats go to computer players and the match starts');
    ok(sa.scores.length === 4, 'the match is running: ' + JSON.stringify(sa.scores));
    // four people: starts at once, no wait
    const ws4 = []; for (const n of ['P1', 'P2', 'P3', 'P4']) { const w = await open(); find(w, n, false); ws4.push(w); await sleep(50); }
    const r4 = await wait(() => { const l = last(ws4[0], 'room'); return l && l.players.every(p => !p.cpu) ? l : null; });
    ok(r4.code === rc.code && r4.phase !== 'lobby', 'four seekers fill the waiting four-player room and it starts at once (Cy + 3)');
    ok(rooms.get(r4.code).humans() === 4, 'four humans in it; the fourth seeker went elsewhere');
    const left = ws4[3]; const r5 = last(left, 'room'); ok(r5.code !== r4.code, 'the fifth person opened a new room');
    // leaving before the start cancels the countdown
    const d = await open(), e = await open(); find(d, 'Di', true); await sleep(50); find(e, 'Ed', true);
    const rd = await wait(() => { const l = last(d, 'room'); return l && l.startsIn != null ? l : null; });
    e.close(); const rd2 = await wait(() => { const l = last(d, 'room'); return l && l.players[1].cpu ? l : null; });
    ok(rd2.startsIn == null, 'the countdown stops when the room drops to one person');
    await sleep(1300); ok(!d.q.some(m => m.t === 'state'), 'and nothing starts');
    console.log('quick match ok'); process.exit(0);
  } catch (e) { console.log('FAIL', e.message); process.exit(1); }
});
