// The room server with no sockets: clients are plain callbacks, as the phone's page uses it when it hosts.
const Hub = require('../shared/hub.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
const hub = Hub.create({ quickWait: 0.2 });
const player = () => { const p = { got: [] }; p.c = hub.connect(text => p.got.push(JSON.parse(text))); p.say = o => p.c.message(JSON.stringify(o)); p.last = t => p.got.filter(m => m.t === t).pop(); return p; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = (f, ms = 12000) => new Promise((res, rej) => { const t0 = Date.now(); const i = setInterval(() => { const v = f(); if (v) { clearInterval(i); res(v); } else if (Date.now() - t0 > ms) { clearInterval(i); rej(new Error('timeout: ' + f)); } }, 20); });

(async () => {
  // a room: create, join, seats, start, inputs, leave
  const a = player(), b = player();
  a.say({ t: 'create', name: 'Ann', target: 10000, kinds: ['human', 'cpu', 'standin', 'cpu'] });
  let r = a.last('room');
  ok(r && r.code.length === 4 && r.you === 0 && r.host === 0 && r.target === 10000 && r.kinds.join() === 'cpu,cpu,standin,cpu', 'a room is made and told to its host: ' + JSON.stringify(r));
  ok(hub.rooms.has(r.code), 'the hub keeps the room');
  b.say({ t: 'join', code: 'ZZZZ', name: 'Bo' }); ok(b.last('err') && /No room/.test(b.last('err').msg), 'a wrong code is refused');
  b.say({ t: 'join', code: r.code.toLowerCase(), name: 'Bo' });
  ok(b.last('room').you === 1 && a.last('room').players[1].name === 'Bo', 'a second player takes seat 2 and everyone hears');
  b.say({ t: 'start' }); ok(!a.got.some(m => m.t === 'state'), 'only the host starts');
  a.say({ t: 'seat', i: 3, kind: 'standin' }); ok(a.last('room').kinds[3] === 'standin', 'the host changes an empty seat');
  a.say({ t: 'start' });
  const sa = await until(() => { const l = a.last('state'); return l && l.phase === 'play' ? l : null; }), sb = b.last('state');
  ok(sa && sb && sb.phase === 'play', 'both get game states after start: ' + (sb && sb.phase));
  const pacSeat = sa.pacPlayer, pac = pacSeat === 0 ? a : pacSeat === 1 ? b : null;
  if (pac) {
    const x0 = pac.last('state').pac.x;
    pac.say({ t: 'in', d: 3 }); pac.say({ t: 'in', d: 1 });
    await until(() => Math.abs(pac.last('state').pac.x - x0) > 0.3);
    ok(true, 'a human Pac-Man is steered by its inputs');
  }
  a.say({ t: 'ping', c: 7 }); ok(a.last('pong') && a.last('pong').c === 7, 'ping is answered');
  b.c.close();
  ok(a.last('room').players[1].cpu, 'a player who leaves becomes a computer seat');
  a.say({ t: 'leave' });
  ok(!hub.rooms.has(r.code), 'the room goes when its last player leaves');

  // the quick match: two players, then the wait, then a start
  const p = player(), q = player();
  p.say({ t: 'find', name: 'P', fill: true }); q.say({ t: 'find', name: 'Q', fill: true });
  r = q.last('room'); ok(r && r.quick && r.players.filter(x => !x.cpu).length === 2 && r.startsIn != null, 'find a game puts both in one quick room with a countdown');
  await until(() => p.last('state'));
  ok(p.last('state').phase === 'countdown' || p.last('state').phase === 'play', 'the quick room starts by itself: ' + p.last('state').phase);
  p.c.close(); q.c.close();
  ok(hub.rooms.size === 0, 'no rooms left');

  // bad input never throws
  const z = player();
  for (const raw of ['', '{', '[]', '{"t":5}', '{"t":"join"}', '{"t":"in","d":9}', '{"t":"create","maze":{"rows":["x"]}}']) z.c.message(raw);
  ok(z.last('room') && z.last('room').maze === null, 'a bad maze gives the built-in one');
  // the rate limit: more than 120 messages in a second are dropped
  for (let i = 0; i < 130; i++) z.say({ t: 'ping', c: i });
  ok(z.got.filter(m => m.t === 'pong').length < 125, 'a flood is cut off: ' + z.got.filter(m => m.t === 'pong').length);
  z.c.close();
  hub.destroy();

  ok(Hub.sanitizeMaze(null) === null && Hub.clean('<Ann>!') === 'Ann', 'sanitizeMaze and clean are there for the server');
  console.log(fails ? fails + ' FAILED' : 'hub ok'); process.exit(fails ? 1 : 0);
})().catch(e => { console.log('FAIL', e); process.exit(1); });
