/* Match flow shared by the server (online) and the browser (offline).
 * Rules measured from the original (see FIDELITY.md):
 *  - a target score is chosen first; the first player to reach it wins;
 *  - a roulette picks the first Pac-Man, who starts with 1,600 points;
 *  - catching Pac-Man ends the round: the catcher steals 1,600 points and is Pac-Man next round;
 *  - every round the maze is reset. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sim.js'));
  else root.PacMatch = factory(root.PacSim);
})(typeof self !== 'undefined' ? self : this, function (Sim) {
  'use strict';
  const COUNTDOWN = 3.5, ROUND_END = 5;

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
      this.isHuman = isHuman;
      this.rng = this.Sim.mulberry(seed || Date.now());
      this.phase = 'lobby';            // lobby | countdown | play | roundover | final
      this.phaseLeft = 0;
      this.sim = null; this.round = 0; this.scores = [0, 0, 0, 0]; this.pac = 0; this.winner = -1;
    }
    initialPac() {
      if (this.startRole === 'pac') return 0;
      if (this.startRole === 'ghost') return 1 + Math.floor(this.rng() * 3);
      return Math.floor(this.rng() * 4);
    }
    start() {
      this.scores = [0, 0, 0, 0]; this.round = 0; this.winner = -1;
      this.pac = this.initialPac(); this.scores[this.pac] = this.Sim.CFG.startPts;
      this.begin();
    }
    begin() {
      this.sim = this.Sim.newRound(this.scores, this.pac, { target: this.target });
      this.phase = 'countdown'; this.phaseLeft = COUNTDOWN;
    }
    /** Advance one fixed step. inputs[i] is the latest direction for human seat i.
     *  Returns true when the phase changed (callers re-broadcast room info). */
    tick(inputs, dt) {
      dt = dt || this.Sim.CFG.tick;
      const s = this.sim;
      if (!s) return false;
      const before = this.phase;
      if (this.phase === 'countdown') {
        this.phaseLeft -= dt;
        if (this.phaseLeft <= 0) this.phase = 'play';
      } else if (this.phase === 'play') {
        const inp = { pac: this.isHuman(s.pacPlayer) ? inputs[s.pacPlayer] : this.Sim.cpuPac(s, this.rng, this.level), ghosts: [] };
        for (let gi = 0; gi < 3; gi++) {
          const p = this.Sim.playerOfGhost(s, gi);
          inp.ghosts.push(this.isHuman(p) ? inputs[p] : this.Sim.cpuGhost(s, gi, this.rng, this.level));
        }
        this.Sim.update(s, inp, dt);
        if (s.over) { this.phase = 'roundover'; this.phaseLeft = ROUND_END; }
      } else if (this.phase === 'roundover') {
        this.phaseLeft -= dt;
        if (this.phaseLeft <= 0) {
          if (s.overReason === 'won') { this.winner = s.winner; this.phase = 'final'; }
          else { if (s.overReason === 'caught') this.pac = s.catcher; this.round++; this.begin(); }
        }
      }
      return this.phase !== before || (this.phase === 'countdown' && before === 'roundover');
    }
    active() { return this.phase === 'countdown' || this.phase === 'play' || this.phase === 'roundover'; }
    view(i) {
      const v = this.Sim.view(this.sim, i);
      v.t = 'state'; v.phase = this.phase; v.left_t = Math.max(0, Math.round(this.phaseLeft * 10) / 10); v.round = this.round;
      return v;
    }
  }
  return { Match, COUNTDOWN, ROUND_END };
});
