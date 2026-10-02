// Jean Grey's moves: psychic strikes, short telekinetic pulses that reach a little further. V2's moves and numbers,
// exactly (phase 0 changed no behaviour; phase 1 grows them); the fields are documented in schema.js. Holding Attack
// through the first palm charges the heavy (see schema.js, charge).
import { ON, CANCEL } from './schema.js';

export default {
  hero: 'jean',
  chain: ['g1', 'g2', 'g3'],
  moves: {
    // palm, palm, push
    g1: { input: ON.chain, su: 5, ac: 3, rc: 9, dmg: 2.5, poise: 20, kb: [6, 2], boxes: [[0.2, 1.8, 0.6, 1.4]], step: 1.5, cancel: CANCEL.evadeOrAttack, react: 'flinch' },
    g2: { input: ON.chain, su: 5, ac: 3, rc: 10, dmg: 2.5, poise: 22, kb: [6, 2], boxes: [[0.2, 1.8, 0.6, 1.4]], step: 1.5, cancel: CANCEL.evadeOrAttack, react: 'flinch' },
    g3: { input: ON.chain, su: 7, ac: 4, rc: 15, dmg: 4.5, poise: 60, kb: [13, 7], boxes: [[0.2, 2.1, 0.5, 1.6]], step: 1.5, cancel: CANCEL.evadeOrAttack, react: 'knockdown' },
    // air palm
    air: { input: ON.air, su: 5, ac: 5, rc: 10, dmg: 3.5, poise: 25, kb: [7, 1], boxes: [[0.0, 1.7, 0.1, 1.5]], step: 1.5, cancel: CANCEL.evadeOrAttack, react: 'airHit' },
    // lift, the launcher
    up: { input: ON.up, su: 6, ac: 5, rc: 15, dmg: 3.5, poise: 45, kb: [2, 15], boxes: [[0.0, 1.3, 0.6, 2.5]], step: 1.5, cancel: CANCEL.evadeOrAttack, react: 'launch',
      launch: true, lift: { vy: 7, ticks: 2 } },
    // push wave: the counter out of a perfect defence (and a charge from the first palm)
    heavy: { input: ON.counter, su: 15, ac: 5, rc: 20, dmg: 8, poise: 90, kb: [16, 8], boxes: [[0.2, 2.2, 0.4, 1.6]], step: 3, cancel: CANCEL.evade, react: 'stagger',
      heavy: true, charge: { from: 'g1', hold: 28, release: 30, dmgMult: 1.2 }, counter: { dmgMult: 1.5, poiseMult: 1.5, react: 'crumple' } },
  },
};
