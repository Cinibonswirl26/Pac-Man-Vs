/* Match flow shared by the server (online) and the browser (offline).
 * Rules measured from the original (see FIDELITY.md):
 *  - a target score is chosen first; the first player to reach it wins;
 *  - a roulette picks the first Pac-Man, who starts with 1,600 points;
 *  - catching Pac-Man ends the round: the catcher steals 1,600 points and is Pac-Man next round;
 *  - every round the maze is reset;
 *  - the catcher takes over Pac-Man (the original waits for them to press Start), so a person
 *    who catches Pac-Man gets a hand-over pause that ends when they say they are ready. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sim.js'));
  else root.PacMatch = factory(root.PacSim);
})(typeof self !== 'undefined' ? self : this, function (Sim) {
  'use strict';
  const COUNTDOWN = 3.5, ROUND_END = 5, HANDOFF = 15;
  const CAUGHT = 7;       // after a catch: the impact, the amber message, then the exchange screen (measured, see FIDELITY.md)

  class Match {
    /** isHuman(i) -> true when seat i is controlled by a person; otherwise a CPU plays it.
     *  opts: maze (descriptor), target (points to win), level (CPU skill 0..2),
     *  start ('random' like the original, 'ghost' or 'pac' for seat 0). */
    constructor(isHuman, seed, opts) {
      opts = opts || {};
      this.Sim = opts.maze ? Sim.create(opts.maze) : Sim;
      this.target = this.Sim.CFG.targets.includes(opts.target) ? opts.target : this.Sim.CFG.defaultTarget;
      this.level = opts.level == null ? 1 : opts.level;
      this.startRole = opts.start || 'random';
      this.fill = opts.fill === 'standin' ? 'standin' : 'cpu';     // what plays a seat nobody is sitting in, unless opts.kinds says per seat
      this.kinds = opts.kinds || null;                              // per seat: 'cpu' (computer player) or 'standin' (grey ghost); people override
      this.isHuman = isHuman;
      this.rng = this.Sim.mulberry(seed || Date.now());
      this.phase = 'lobby';            // lobby | countdown | play | roundover | handoff | final
      this.phaseLeft = 0;
      this.sim = null; this.round = 0; this.scores = [0, 0, 0, 0]; this.pac = 0; this.winner = -1;
      this.slots = null;               // the seat playing each ghost slot (circle, start position); kept from round to round
    }
    /** What plays seat i: 'human', 'cpu' (a computer player) or 'standin' (a grey ghost that only wakes when touched). */
    kindOf(i) {
      if (this.isHuman(i)) return 'human';
      const k = this.kinds && this.kinds[i];
      return k === 'standin' || k === 'cpu' ? k : this.fill;
    }
    initialPac() {
      if (this.startRole === 'pac') return 0;
      if (this.startRole === 'ghost') {   // a computer player takes Pac-Man if there is one; a stand-in seat otherwise
        const cpus = [1, 2, 3].filter(i => this.kindOf(i) === 'cpu');
        return cpus.length ? cpus[Math.floor(this.rng() * cpus.length)] : 1 + Math.floor(this.rng() * 3);
      }
      // Pac-Man starts as one of the players (people or computer players), never a stand-in, unless only one seat is a player.
      const players = [0, 1, 2, 3].filter(i => this.kindOf(i) !== 'standin');
      if (players.length >= 2 && players.length < 4) return players[Math.floor(this.rng() * players.length)];
      return Math.floor(this.rng() * 4);
    }
    start() {
      this.scores = [0, 0, 0, 0]; this.round = 0; this.winner = -1; this.slots = null;
      this.pac = this.initialPac(); this.scores[this.pac] = this.Sim.CFG.startPts;
      this.begin();
    }
    begin() {
      if (!this.slots) this.slots = [0, 1, 2, 3].filter(i => i !== this.pac);
      // Seats nobody is playing: either computer players, or grey stand-ins that only wake up when a ghost player touches them.
      const standin = this.slots.map(p => this.kindOf(p) === 'standin');
      // a stand-in that a ghost woke keeps that player's colour from round to round, until it is eaten (or its player is Pac-Man now)
      const claims = this.sim ? this.sim.ghosts.map(g => g.standin && !g.grey ? g.claim : -1) : null;
      this.sim = this.Sim.newRound(this.scores, this.pac, { target: this.target, standin, claims, players: this.slots, rng: this.rng });
      this.phase = 'countdown'; this.phaseLeft = COUNTDOWN;
    }
    /** Advance one fixed step. inputs[i] is the latest direction for human seat i.
     *  Returns true when the phase changed (callers re-broadcast room info). */
    tick(inputs, dt, acts) {
      dt = dt || this.Sim.CFG.tick;
      const s = this.sim;
      if (!s) return false;
      const before = this.phase;
      if (this.phase === 'countdown') {
        this.phaseLeft -= dt;
        if (this.phaseLeft <= 0) this.phase = 'play';
      } else if (this.phase === 'play') {
        const inp = { pac: this.isHuman(s.pacPlayer) ? inputs[s.pacPlayer] : this.Sim.cpuPac(s, this.rng, this.level), ghosts: [], act: [] };
        for (let gi = 0; gi < 3; gi++) {
          const p = this.Sim.playerOfGhost(s, gi);
          inp.ghosts.push(this.isHuman(p) ? inputs[p] : this.Sim.cpuGhost(s, gi, this.rng, this.level));
          // the action button (Arrangement levels: a hop or a dash): a person's press, or a computer player's own call
          inp.act.push(this.isHuman(p) ? !!(acts && acts[p]) : this.Sim.cpuAct(s, gi, this.rng, dt || this.Sim.CFG.tick));
        }
        this.Sim.update(s, inp, dt);
        if (s.over) { this.phase = 'roundover'; this.phaseLeft = ROUND_END + (s.overReason === 'caught' ? CAUGHT : 0); }
      } else if (this.phase === 'roundover') {
        this.phaseLeft -= dt;
        if (this.phaseLeft <= 0) {
          if (s.overReason === 'won') { this.winner = s.winner; this.phase = 'final'; }
          else if (s.overReason === 'caught') {
            // the catcher becomes Pac-Man and the old Pac-Man takes over the catcher's ghost (its circle and start)
            this.slots = this.slots.map(p => p === s.catcher ? s.pacPlayer : p);
            this.pac = s.catcher;
            if (this.isHuman(this.pac)) { this.phase = 'handoff'; this.phaseLeft = HANDOFF; }
            else this.nextRound();
          } else this.nextRound();
        }
      } else if (this.phase === 'handoff') {
        // waits for the new Pac-Man to say they are ready; starts anyway after HANDOFF seconds,
        // or at once if a CPU took the seat over
        this.phaseLeft -= dt;
        if (this.phaseLeft <= 0 || !this.isHuman(this.pac)) this.nextRound();
      }
      return this.phase !== before || (this.phase === 'countdown' && before === 'roundover');
    }
    nextRound() { this.round++; this.begin(); }
    /** Player i says they are ready. Returns true when that started the next round. */
    ready(i) {
      if (this.phase !== 'handoff' || i !== this.pac) return false;
      this.nextRound();
      return true;
    }
    active() { return this.phase === 'countdown' || this.phase === 'play' || this.phase === 'roundover' || this.phase === 'handoff'; }
    view(i) {
      const v = this.Sim.view(this.sim, i);
      v.t = 'state'; v.phase = this.phase; v.left_t = Math.max(0, Math.round(this.phaseLeft * 10) / 10); v.round = this.round;
      v.human = [0, 1, 2, 3].map(i => !!this.isHuman(i));
      v.fill = this.fill;  // seats nobody is playing are 'standin' (grey COM ghosts) or 'cpu' (computer players)
      v.kinds = [0, 1, 2, 3].map(i => this.kindOf(i));
      v.next = this.pac;   // who is Pac-Man in the coming round (the catcher, during a hand-over)
      return v;
    }
  }
  return { Match, COUNTDOWN, ROUND_END, HANDOFF, CAUGHT };
});
