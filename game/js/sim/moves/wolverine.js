// Wolverine's moves: the claw chain; every hit builds rage. V2's moves and numbers, exactly (phase 0 changes no
// behaviour); the fields are documented in schema.js. Berserk speeds the move clock (attackSpeed), so `t` runs
// fractional. Holding Attack through the first slash charges the heavy (see schema.js, charge).
import { ON, CANCEL } from './schema.js';

export default {
  hero: 'wolverine',
  chain: ['g1', 'g2', 'g3', 'g4'],
  airChain: ['air1'],
  moves: {
    // three slashes and a spinning finisher
    g1: { slot: 'g1', input: ON.chain, su: 3, ac: 3, rc: 7, dmg: 3, poise: 16, kb: [3, 1.5], boxes: [[0.1, 1.4, 0.3, 1.5]], step: 1.5, cancel: CANCEL.evadeOrAttack, react: 'flinch' },
    g2: { slot: 'g2', input: ON.chain, su: 3, ac: 3, rc: 7, dmg: 3, poise: 16, kb: [3, 1.5], boxes: [[0.1, 1.4, 0.3, 1.5]], step: 1.5, cancel: CANCEL.evadeOrAttack, react: 'flinch' },
    g3: { slot: 'g3', input: ON.chain, su: 4, ac: 3, rc: 9, dmg: 3.5, poise: 22, kb: [4, 2], boxes: [[0.1, 1.5, 0.2, 1.6]], step: 1.5, cancel: CANCEL.evadeOrAttack, react: 'flinch' },
    g4: { slot: 'g4', input: ON.chain, su: 5, ac: 4, rc: 15, dmg: 6, poise: 60, kb: [12, 7], boxes: [[0.1, 1.7, 0.2, 1.7]], step: 1.5, cancel: CANCEL.evadeOrAttack, react: 'knockdown' },
    // claw swipe
    air1: { slot: 'air1', input: ON.air, su: 3, ac: 6, rc: 8, dmg: 3.5, poise: 22, kb: [5, -1], boxes: [[0.0, 1.5, -0.1, 1.7]], step: 1.5, cancel: CANCEL.evadeOrAttack, react: 'airHit' },
    // rising claw, the launcher
    up: { slot: 'up', input: ON.up, su: 4, ac: 5, rc: 14, dmg: 4, poise: 45, kb: [2, 15], boxes: [[0.0, 1.2, 0.5, 2.5]], step: 1.5, cancel: CANCEL.launcher, react: 'launch',
      launch: true, lift: { vy: 7, ticks: 2 } },
    // two-claw overhead: held Attack through the first slash charges it
    heavy: { slot: 'heavy', input: ON.hold, su: 12, ac: 6, rc: 18, dmg: 10, poise: 95, kb: [15, 7], boxes: [[0.1, 1.9, 0.2, 1.8]], step: 3, cancel: CANCEL.evade, react: 'stagger',
      heavy: true, charge: { from: 'g1', hold: 24, release: 30, dmgMult: 1.2 } },
    // the counter out of a perfect defence: the heavy's strike at once, with its bonus, and it crumples
    counter: { slot: 'counter', input: ON.counter, su: 12, ac: 6, rc: 18, dmg: 10, poise: 95, kb: [15, 7], boxes: [[0.1, 1.9, 0.2, 1.8]], step: 3, cancel: CANCEL.evade, react: 'crumple',
      heavy: true, counter: { dmgMult: 1.5, poiseMult: 1.5 } },
  },
};
