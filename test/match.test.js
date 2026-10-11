// Whole matches between CPUs follow the original's rules: roles pass to the catcher, scores carry, the target ends it.
const { Match } = require('../shared/match.js');
let fails = 0; const ok = (c, m) => { if (!c) { fails++; console.log('FAIL', m); } };
for (const seed of [3, 7, 11]) {
  const m = new Match(() => false, seed, { target: 7000 }); m.start();
  ok(m.scores[m.pac] === 1600 && m.scores.reduce((a, b) => a + b, 0) === 1600, 'first Pac-Man starts with 1600');
  let ticks = 0, handovers = 0, prevPac = m.pac;
  while (m.phase !== 'final' && ticks < 30 * 60 * 40) {
    const before = m.phase; m.tick([null, null, null, null]); ticks++;
    if (before === 'roundover' && m.phase === 'countdown') {
      const why = m.sim.overReason; ok(why !== 'won', 'a won match must not start another round');
      if (m.pac !== prevPac) handovers++;
      prevPac = m.pac;
    }
  }
  ok(m.phase === 'final', `seed ${seed}: match should finish`);
  ok(m.scores[m.winner] >= 7000, `seed ${seed}: winner has the target`);
  ok(handovers >= 1, `seed ${seed}: Pac-Man role should have passed to a catcher`);
  console.log(`seed ${seed}: ${(ticks / 30 / 60).toFixed(1)} min, ${m.round + 1} rounds, ${handovers} hand-overs, scores ${m.scores}, winner P${m.winner + 1}`);
}
// Hand-over: when a person catches Pac-Man the match waits for them to be ready before the next round.
{
  const { HANDOFF } = require('../shared/match.js');
  // An idle human Pac-Man and three CPU ghosts: the catcher is a CPU, so there is no hand-over.
  const m1 = new Match(i => i === 0, 9, { start: 'pac' }); m1.start();
  let hand = false, t = 0;
  while (t++ < 30 * 120 && m1.round === 0) { m1.tick([null, null, null, null]); if (m1.phase === 'handoff') hand = true; }
  ok(m1.round === 1 && !hand && m1.pac !== 0, 'a CPU catcher becomes Pac-Man without a hand-over');
  // A human ghost catcher: drive the catch by hand.
  const m2 = new Match(i => i === 1, 9, { start: 'pac' }); m2.start();
  while (m2.phase !== 'play') m2.tick([null, null, null, null]);
  const gi = m2.sim.ghosts.findIndex((g, k) => m2.Sim.playerOfGhost(m2.sim, k) === 1);
  Object.assign(m2.sim.ghosts[gi], { x: m2.sim.pac.x, y: m2.sim.pac.y });
  m2.tick([null, null, null, null]);
  ok(m2.phase === 'roundover' && m2.sim.catcher === 1, 'human ghost caught Pac-Man');
  while (m2.phase === 'roundover') m2.tick([null, null, null, null]);
  ok(m2.phase === 'handoff' && m2.pac === 1 && m2.view(1).next === 1 && m2.view(1).me >= 0, 'hand-over waits for the catcher, who still sees the old round');
  for (let k = 0; k < 30; k++) m2.tick([null, null, null, null]);
  ok(m2.phase === 'handoff', 'hand-over keeps waiting');
  ok(!m2.ready(0) && m2.ready(1) && m2.phase === 'countdown' && m2.view(1).me === -1, 'the catcher says ready and starts as Pac-Man');
  ok(m2.Sim.playerOfGhost(m2.sim, gi) === 0 && m2.view(0).me === gi, 'the old Pac-Man takes over the catcher\'s ghost slot (circle and start position)');
  // ... or it starts by itself after the time limit
  const m3 = new Match(i => i === 1, 9, { start: 'pac' }); m3.start();
  while (m3.phase !== 'play') m3.tick([null, null, null, null]);
  const g3 = m3.sim.ghosts.findIndex((g, k) => m3.Sim.playerOfGhost(m3.sim, k) === 1);
  Object.assign(m3.sim.ghosts[g3], { x: m3.sim.pac.x, y: m3.sim.pac.y });
  let n = 0; while (m3.phase !== 'countdown' || m3.round === 0) { m3.tick([null, null, null, null]); n++; if (n > 30 * 40) break; }
  ok(m3.round === 1 && m3.pac === 1 && n >= 30 * (5 + HANDOFF) - 2, 'hand-over times out into the next round');
  // ... or at once if the catcher left and a CPU took the seat
  const humans = new Set([1]); const m4 = new Match(i => humans.has(i), 9, { start: 'pac' }); m4.start();
  while (m4.phase !== 'play') m4.tick([null, null, null, null]);
  const g4 = m4.sim.ghosts.findIndex((g, k) => m4.Sim.playerOfGhost(m4.sim, k) === 1);
  Object.assign(m4.sim.ghosts[g4], { x: m4.sim.pac.x, y: m4.sim.pac.y });
  while (m4.phase !== 'handoff') m4.tick([null, null, null, null]);
  humans.delete(1); m4.tick([null, null, null, null]);
  ok(m4.phase === 'countdown', 'a CPU replacing the catcher skips the hand-over');
}
// Stand-ins: with people in several seats, Pac-Man starts as one of them; a seat nobody plays is a grey stand-in.
{
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const m = new Match(i => i < 3, seed, { fill: 'standin' }); m.start();
    ok(m.pac < 3, `seed ${seed}: Pac-Man is a person`);
    const gi = m.Sim.ghostIndexOf(m.sim, 3);
    ok(gi >= 0 && m.sim.ghosts[gi].grey && m.sim.ghosts.filter(g => g.grey).length === 1, `seed ${seed}: seat 4 is the one grey stand-in`);
    ok(m.view(0).fill === 'standin' && m.view(0).human.join() === 'true,true,true,false', 'views say which seats are stand-ins');
  }
  const solo = new Match(i => i === 0, 2, { fill: 'standin', start: 'ghost' }); solo.start();
  ok(solo.pac > 0 && solo.sim.ghosts.filter(g => g.grey).length === 2, 'a person playing a ghost alone: a computer Pac-Man and two stand-ins');
  // Seat by seat: a person, a computer player and two stand-ins. Pac-Man starts as the person or the computer player.
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const m = new Match(i => i === 0, seed, { kinds: ['human', 'cpu', 'standin', 'standin'] }); m.start();
    ok(m.kindOf(0) === 'human' && m.kindOf(1) === 'cpu' && m.kindOf(2) === 'standin', 'kinds per seat');
    ok(m.pac <= 1, `seed ${seed}: Pac-Man is the person or the computer player, not a stand-in (${m.pac})`);
    ok(m.sim.ghosts.filter(g => g.grey).length === 2 && m.view(0).kinds.join() === 'human,cpu,standin,standin', `seed ${seed}: two grey ghosts, kinds in the view`);
  }
  const gh = new Match(i => i === 0, 3, { kinds: ['human', 'standin', 'cpu', 'standin'], start: 'ghost' }); gh.start();
  ok(gh.pac === 2, 'starting as a ghost, the computer player is Pac-Man rather than a stand-in');
  const mixed = new Match(i => i === 0, 3, { kinds: ['human', 'cpu', 'cpu', 'standin'], start: 'pac' }); mixed.start();
  const gi3 = mixed.Sim.ghostIndexOf(mixed.sim, 3);
  ok(mixed.sim.ghosts[gi3].grey && mixed.sim.ghosts.filter(g => g.grey).length === 1, 'only the stand-in seat is grey');
  // A woken stand-in keeps its colour into the next round, until it is eaten; it drops it if its player is Pac-Man now.
  {
    const m = new Match(i => i < 2, 5, { kinds: ['human', 'human', 'standin', 'standin'] }); m.start();
    const s = m.sim, gi = m.Sim.ghostIndexOf(s, 2), other = [0, 1].find(p => p !== m.pac);
    s.ghosts[gi].grey = false; s.ghosts[gi].claim = other;                  // woken by the other person's ghost
    s.over = true; s.overReason = 'cleared'; m.phase = 'play';               // the round ends without a catch
    while (m.phase !== 'countdown') m.tick([null, null, null, null]);
    ok(!m.sim.ghosts[gi].grey && m.sim.ghosts[gi].claim === other, 'a woken stand-in keeps its colour into the next round');
    m.sim.ghosts[gi].mode = 'fright'; m.sim.frightLeft = 5; m.sim.ghosts[gi].x = m.sim.pac.x; m.sim.ghosts[gi].y = m.sim.pac.y;
    m.sim.ghosts.forEach((g, k) => { if (k !== gi) { g.x = 1.5; g.y = 1.5; } });
    m.phase = 'play'; m.tick([null, null, null, null]);
    ok(m.sim.ghosts[gi].mode === 'eyes' && m.sim.ghosts[gi].grey, 'eaten, it is grey again');
    m.sim.over = true; m.sim.overReason = 'cleared'; m.phase = 'play'; while (m.phase !== 'countdown') m.tick([null, null, null, null]);
    ok(m.sim.ghosts[gi].grey, 'and stays grey next round');
    const m2 = new Match(i => i < 2, 5, { kinds: ['human', 'human', 'standin', 'standin'] }); m2.start();
    const s2 = m2.sim, g2 = m2.Sim.ghostIndexOf(s2, 2), o2 = [0, 1].find(p => p !== m2.pac);
    s2.ghosts[g2].grey = false; s2.ghosts[g2].claim = o2;
    s2.catcher = o2; s2.over = true; s2.overReason = 'caught'; m2.phase = 'play';   // that player catches Pac-Man and is Pac-Man next
    while (m2.phase !== 'handoff' && m2.phase !== 'countdown') m2.tick([null, null, null, null]);
    if (m2.phase === 'handoff') { m2.ready(o2); }
    ok(m2.pac === o2 && m2.sim.ghosts[m2.Sim.ghostIndexOf(m2.sim, 2)].grey, 'a stand-in wearing the new Pac-Man\'s colour goes back to grey');
  }
}
console.log(fails ? fails + ' FAILED' : 'match flow ok'); process.exit(fails ? 1 : 0);
