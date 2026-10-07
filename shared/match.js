/* Match flow shared by the server (online) and the browser (offline): countdown,
 * four rounds with rotating Pac-Man, scoring and the final result. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./sim.js'));
  else root.PacMatch = factory(root.PacSim);
})(typeof self !== 'undefined' ? self : this, function (Sim) {
  'use strict';
  const COUNTDOWN = 3.5, ROUND_END = 5;

  class Match {
    /** isHuman(i) -> true when seat i is controlled by a person; otherwise a CPU plays it. */
    constructor(isHuman, seed) {
      this.isHuman = isHuman;
      this.rng = Sim.mulberry(seed || Date.now());
      this.phase = 'lobby';            // lobby | countdown | play | roundover | final
      this.phaseLeft = 0;
      this.sim = null; this.round = 0; this.scores = [0, 0, 0, 0];
    }
    start() {
      this.scores = [0, 0, 0, 0]; this.round = 0; this.begin();
    }
    begin() {
      this.sim = Sim.newRound(null, this.round, this.scores);
      this.phase = 'countdown'; this.phaseLeft = COUNTDOWN;
    }
    /** Advance one fixed step. inputs[i] is the latest direction for human seat i.
     *  Returns true when the phase changed (callers re-broadcast room info). */
    tick(inputs, dt) {
      dt = dt || Sim.CFG.tick;
      const s = this.sim;
      if (!s) return false;
      const before = this.phase;
      if (this.phase === 'countdown') {
        this.phaseLeft -= dt;
        if (this.phaseLeft <= 0) this.phase = 'play';
      } else if (this.phase === 'play') {
        const inp = { pac: this.isHuman(s.pacPlayer) ? inputs[s.pacPlayer] : Sim.cpuPac(s, this.rng), ghosts: [] };
        for (let gi = 0; gi < 3; gi++) {
          const p = Sim.playerOfGhost(s, gi);
          inp.ghosts.push(this.isHuman(p) ? inputs[p] : Sim.cpuGhost(s, gi, this.rng));
        }
        Sim.update(s, inp, dt);
        if (s.over) { this.phase = 'roundover'; this.phaseLeft = ROUND_END; }
      } else if (this.phase === 'roundover') {
        this.phaseLeft -= dt;
        if (this.phaseLeft <= 0) {
          this.round++;
          if (this.round >= Sim.CFG.rounds) this.phase = 'final'; else this.begin();
        }
      }
      return this.phase !== before || (this.phase === 'countdown' && before === 'roundover');
    }
    active() { return this.phase === 'countdown' || this.phase === 'play' || this.phase === 'roundover'; }
    view(i) {
      const v = Sim.view(this.sim, i);
      v.t = 'state'; v.phase = this.phase; v.left_t = Math.max(0, Math.round(this.phaseLeft * 10) / 10);
      return v;
    }
  }
  return { Match, COUNTDOWN, ROUND_END };
});
