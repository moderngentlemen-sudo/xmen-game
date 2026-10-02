// Cyclops's moves: martial-arts strikes that knock Sentinels into blast lines. V2's moves and numbers, exactly
// (phase 0 changed no behaviour; phase 1 grows them); the fields are documented in schema.js. Holding Attack through
// the first strike charges the heavy (see schema.js, charge).
import { ON, CANCEL } from './schema.js';

export default {
  hero: 'cyclops',
  chain: ['g1', 'g2', 'g3'],
  airChain: ['air1'],
  moves: {
    // backhand, elbow, driving punch
    g1: { slot: 'g1', input: ON.chain, su: 4, ac: 3, rc: 9, dmg: 3, poise: 18, kb: [4, 2], boxes: [[0.2, 1.3, 0.6, 1.6]], step: 1.5, cancel: CANCEL.evadeOrAttack, react: 'flinch' },
    g2: { slot: 'g2', input: ON.chain, su: 4, ac: 3, rc: 10, dmg: 3, poise: 20, kb: [4, 2], boxes: [[0.2, 1.35, 0.5, 1.5]], step: 1.5, cancel: CANCEL.evadeOrAttack, react: 'flinch' },
    g3: { slot: 'g3', input: ON.chain, su: 6, ac: 4, rc: 16, dmg: 5, poise: 55, kb: [11, 6], boxes: [[0.2, 1.55, 0.2, 1.7]], step: 1.5, cancel: CANCEL.evadeOrAttack, react: 'knockdown' },
    // axe kick
    air1: { slot: 'air1', input: ON.air, su: 4, ac: 5, rc: 10, dmg: 4, poise: 25, kb: [6, -2], boxes: [[0.1, 1.4, 0.0, 1.4]], step: 1.5, cancel: CANCEL.evadeOrAttack, react: 'airHit' },
    // rising kick, the launcher: it carries him up a little
    up: { slot: 'up', input: ON.up, su: 5, ac: 5, rc: 16, dmg: 4, poise: 45, kb: [2, 15], boxes: [[0.0, 1.1, 0.6, 2.4]], step: 1.5, cancel: CANCEL.launcher, react: 'launch',
      launch: true, lift: { vy: 7, ticks: 2 } },
    // the heavy: held Attack through the first strike charges it
    heavy: { slot: 'heavy', input: ON.hold, su: 14, ac: 5, rc: 20, dmg: 9, poise: 90, kb: [14, 6], boxes: [[0.2, 1.7, 0.3, 1.6]], step: 3, cancel: CANCEL.evade, react: 'stagger',
      heavy: true, charge: { from: 'g1', hold: 26, release: 30, dmgMult: 1.2 } },
    // the counter out of a perfect defence: the heavy's strike at once, with its bonus, and it crumples
    counter: { slot: 'counter', input: ON.counter, su: 14, ac: 5, rc: 20, dmg: 9, poise: 90, kb: [14, 6], boxes: [[0.2, 1.7, 0.3, 1.6]], step: 3, cancel: CANCEL.evade, react: 'crumple',
      heavy: true, counter: { dmgMult: 1.5, poiseMult: 1.5 } },
  },
};
