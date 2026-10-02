// Wolverine's moves: the claw chain; every hit builds rage. V2's moves and numbers, exactly (phase 0 changes no
// behaviour); the fields are documented in schema.js. Berserk speeds the move clock (attackSpeed), so `t` runs
// fractional. Holding Attack through the first slash charges the heavy (see schema.js, charge).
import { ON, CANCEL } from './schema.js';

export default {
  hero: 'wolverine',
  chain: ['g1', 'g2', 'g3', 'g4', 'g5'],
  airChain: ['air1', 'air2'],
  alt: { at: 'g5', id: 'g4alt', pause: 7 },   // pausing before the last press swaps in the second ender
  moves: {
    // three slashes, a spinning slash, and his own fifth hit: a double-claw thrust
    g1: { slot: 'g1', input: ON.chain, su: 3, ac: 3, rc: 7, dmg: 3, poise: 16, kb: [3, 1.5], boxes: [[0.1, 1.4, 0.3, 1.5]], step: 1.5, cancel: CANCEL.evadeOrAttack, react: 'flinch' },
    g2: { slot: 'g2', input: ON.chain, su: 3, ac: 3, rc: 7, dmg: 3, poise: 16, kb: [3, 1.5], boxes: [[0.1, 1.4, 0.3, 1.5]], step: 1.5, cancel: CANCEL.evadeOrAttack, react: 'flinch' },
    g3: { slot: 'g3', input: ON.chain, su: 4, ac: 3, rc: 9, dmg: 3.5, poise: 22, kb: [4, 2], boxes: [[0.1, 1.5, 0.2, 1.6]], step: 1.5, cancel: CANCEL.evadeOrAttack, react: 'flinch' },
    g4: { slot: 'g4', input: ON.chain, su: 5, ac: 4, rc: 15, dmg: 6, poise: 60, kb: [5, 3], boxes: [[0.1, 1.7, 0.2, 1.7]], step: 1.5, cancel: CANCEL.evadeOrAttack, react: 'stagger' },
    g5: { slot: 'extra', input: ON.chain, su: 5, ac: 4, rc: 16, dmg: 6.5, poise: 60, kb: [12, 7], boxes: [[0.1, 1.8, 0.4, 1.3]], step: 3, cancel: CANCEL.evadeOrAttack, react: 'knockdown' },
    // gut slash that crumples (the second ender)
    g4alt: { slot: 'g4alt', input: ON.alt, su: 7, ac: 4, rc: 18, dmg: 6, poise: 60, kb: [2, 0], boxes: [[0.1, 1.5, 0.5, 1.0]], step: 2, cancel: CANCEL.evadeOrAttack, react: 'crumple' },
    // lunging thrust (wall-bounce), low claw sweep (knockdown), shoulder barge (the dash strike)
    fwd: { slot: 'fwd', input: ON.fwd, su: 6, ac: 5, rc: 14, dmg: 5, poise: 40, kb: [14, 2], boxes: [[0.1, 1.9, 0.5, 1.0]], step: 10, cancel: CANCEL.evadeOrAttack, react: 'wallBounce' },
    down: { slot: 'down', input: ON.down, su: 4, ac: 4, rc: 13, dmg: 3.5, poise: 30, kb: [3, 5], boxes: [[0.0, 1.7, 0.0, 0.6]], step: 1, cancel: CANCEL.evadeOrAttack, react: 'knockdown' },
    dash: { slot: 'dash', input: ON.dash, su: 3, ac: 6, rc: 14, dmg: 4.5, poise: 45, kb: [10, 5], boxes: [[0.0, 1.2, 0.3, 1.4]], step: 9, cancel: CANCEL.evadeOrAttack, react: 'stagger' },
    // claw swipe
    air1: { slot: 'air1', input: ON.air, su: 3, ac: 6, rc: 8, dmg: 3.5, poise: 22, kb: [5, -1], boxes: [[0.0, 1.5, -0.1, 1.7]], step: 1.5, cancel: CANCEL.evadeOrAttack, react: 'airHit' },
    // a second swipe in the air
    air2: { slot: 'air2', input: ON.air, su: 3, ac: 5, rc: 10, dmg: 3.5, poise: 22, kb: [6, 3], boxes: [[0.0, 1.5, -0.1, 1.7]], step: 0, cancel: CANCEL.evadeOrAttack, react: 'airHit' },
    // claw dive: down and Attack in the air, claws first into whatever is below; it bounces off the floor
    airDown: { slot: 'airDown', input: ON.airDown, su: 5, ac: 12, rc: 12, dmg: 5, poise: 45, kb: [2, -12], boxes: [[-0.3, 1.3, -0.4, 1.0]], step: 0, cancel: CANCEL.evade, react: 'groundBounce',
      dive: { vy: 22 } },
    // rising claw, the launcher
    up: { slot: 'up', input: ON.up, su: 4, ac: 5, rc: 14, dmg: 4, poise: 45, kb: [2, 15], boxes: [[0.0, 1.2, 0.5, 2.5]], step: 1.5, cancel: CANCEL.launcher, react: 'launch',
      launch: true, lift: { vy: 7, ticks: 2 } },
    // two-claw overhead: held Attack through the first slash charges it
    heavy: { slot: 'heavy', input: ON.hold, su: 12, ac: 6, rc: 18, dmg: 10, poise: 95, kb: [15, 7], boxes: [[0.1, 1.9, 0.2, 1.8]], step: 3, cancel: CANCEL.evade, react: 'stagger',
      heavy: true, charge: { from: 'g1', hold: 24, release: 30, dmgMult: 1.2 } },
    // the counter out of a perfect defence: the heavy's strike at once, with its bonus, and it crumples
    counter: { slot: 'counter', input: ON.counter, su: 12, ac: 6, rc: 18, dmg: 10, poise: 95, kb: [15, 7], boxes: [[0.1, 1.9, 0.2, 1.8]], step: 3, cancel: CANCEL.evade, react: 'crumple',
      heavy: true, counter: { dmgMult: 1.5, poiseMult: 1.5 } },
    // Throws (Attack and Power beside a Sentinel): pounce and slash into the wall, a toss, an uppercut launch, a
    // piledriver in the air. And the execution on a stunned Sentinel: he climbs it and tears out the core
    throwF: { slot: 'throwF', input: ON.throwF, su: 5, ac: 1, rc: 16, dmg: 7, poise: 60, kb: [14, 3], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.evade, react: 'wallBounce', grab: true, hitstop: 'heavy' },
    throwB: { slot: 'throwB', input: ON.throwB, su: 5, ac: 1, rc: 16, dmg: 6, poise: 60, kb: [-10, 6], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.evade, react: 'knockdown', grab: true, hitstop: 'heavy' },
    throwU: { slot: 'throwU', input: ON.throwU, su: 5, ac: 1, rc: 18, dmg: 6, poise: 60, kb: [1, 15], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.evade, react: 'launch', grab: true, hitstop: 'heavy', juggle: 20 },
    throwAir: { slot: 'throwAir', input: ON.throwAir, su: 5, ac: 1, rc: 16, dmg: 7, poise: 60, kb: [1, -16], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.evade, react: 'groundBounce', grab: true, hitstop: 'heavy' },
    exec: { slot: 'exec', input: ON.exec, su: 22, ac: 1, rc: 22, dmg: 42, poise: 200, kb: [6, 8], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.evade, react: 'knockdown', grab: true, hitstop: 'super', heavy: true,
      invuln: [0, 45] },
    // the second counter, by Power out of a perfect defence: a counter Drill that pierces
    counterP: { slot: 'counterP', input: ON.counterP, su: 5, ac: 6, rc: 16, dmg: 8, poise: 80, kb: [10, 3], boxes: [[0.0, 3.2, 0.4, 1.2]], step: 12, cancel: CANCEL.evade, react: 'crumple',
      heavy: true, counter: { dmgMult: 1.5, poiseMult: 1.5 } },
  },
};
