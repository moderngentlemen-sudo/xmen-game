// The hero modules. Each one owns what makes its hero different; player.js calls these hooks:
//   init(p)                       hero fields on the player
//   tick(S, p, cmd, E)            every tick, before the state machine (resources, timers)
//   power(S, p, cmd, E)           the Power button in the normal state; true when it ran this tick's movement
//   sig(S, p, cmd, E)             the Signature button
//   states                        the hero's own states, by name
//   air(S, p, cmd, E)             true when the hero's own air movement replaced gravity this tick
//   ownsJump(S, p), wallJump?     jump overrides
//   speedMult, attackSpeed, dmgMult(p, hit), takenMult, noStagger, onDealt, onHurt, cancel
import cyclops from './cyclops.js';
import wolverine from './wolverine.js';
import jean from './jean.js';

const BASE = {
  init() {}, tick() {}, power: () => false, sig: null, states: {}, air: () => false, ownsJump: () => false,
  speedMult: () => 1, attackSpeed: () => 1, dmgMult: () => 1, takenMult: () => 1, noStagger: () => false,
  onDealt() {}, onHurt() {}, cancel() {},
};
export const HERO = {
  cyclops: { ...BASE, ...cyclops },
  wolverine: { ...BASE, ...wolverine },
  jean: { ...BASE, ...jean },
};
