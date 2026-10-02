// Jean Grey's moves: psychic strikes, short telekinetic pulses that reach a little further. V2's moves and numbers,
// exactly (phase 0 changed no behaviour; phase 1 grows them); the fields are documented in schema.js. Holding Attack
// through the first palm charges the heavy (see schema.js, charge).
import { ON, CANCEL } from './schema.js';

export default {
  hero: 'jean',
  chain: ['g1', 'g2', 'g3', 'g4'],
  airChain: ['air1', 'air2'],
  alt: { at: 'g4', id: 'g4alt', pause: 7 },   // pausing before the last press swaps in the second ender
  moves: {
    // palm, palm, push, psychic burst
    g1: { slot: 'g1', input: ON.chain, su: 5, ac: 3, rc: 9, dmg: 2.5, poise: 20, kb: [6, 2], boxes: [[0.2, 1.8, 0.6, 1.4]], step: 1.5, cancel: CANCEL.strike, react: 'flinch' },
    g2: { slot: 'g2', input: ON.chain, su: 5, ac: 3, rc: 10, dmg: 2.5, poise: 22, kb: [6, 2], boxes: [[0.2, 1.8, 0.6, 1.4]], step: 1.5, cancel: CANCEL.strike, react: 'flinch' },
    g3: { slot: 'g3', input: ON.chain, su: 7, ac: 4, rc: 15, dmg: 4.5, poise: 60, kb: [6, 3], boxes: [[0.2, 2.1, 0.5, 1.6]], step: 1.5, cancel: CANCEL.strike, react: 'stagger' },
    g4: { slot: 'g4', input: ON.chain, su: 8, ac: 4, rc: 16, dmg: 5, poise: 60, kb: [13, 7], boxes: [[0.0, 2.4, 0.3, 1.8]], step: 1, cancel: CANCEL.strike, react: 'knockdown' },
    // TK slam: lifts it, then drives it into the floor to bounce (the second ender)
    g4alt: { slot: 'g4alt', input: ON.alt, su: 9, ac: 4, rc: 18, dmg: 5.5, poise: 60, kb: [1, -14], boxes: [[0.2, 2.0, 0.0, 2.2]], step: 0, cancel: CANCEL.strike, react: 'groundBounce' },
    // TK shove (wall-bounce), TK sweep that trips (knockdown), psychic dash strike
    fwd: { slot: 'fwd', input: ON.fwd, su: 7, ac: 4, rc: 14, dmg: 4, poise: 45, kb: [15, 2], boxes: [[0.2, 2.4, 0.4, 1.4]], step: 2, cancel: CANCEL.strike, react: 'wallBounce' },
    down: { slot: 'down', input: ON.down, su: 6, ac: 4, rc: 14, dmg: 3, poise: 35, kb: [3, 5], boxes: [[0.2, 2.2, 0.0, 0.6]], step: 0, cancel: CANCEL.strike, react: 'knockdown' },
    dash: { slot: 'dash', input: ON.dash, su: 4, ac: 5, rc: 14, dmg: 4, poise: 40, kb: [8, 6], boxes: [[0.0, 1.8, 0.3, 1.4]], step: 8, cancel: CANCEL.strike, react: 'stagger' },
    // air palm
    air1: { slot: 'air1', input: ON.air, su: 5, ac: 5, rc: 10, dmg: 3.5, poise: 25, kb: [7, 1], boxes: [[0.0, 1.7, 0.1, 1.5]], step: 1.5, cancel: CANCEL.strike, react: 'airHit' },
    // air push
    air2: { slot: 'air2', input: ON.air, su: 5, ac: 4, rc: 12, dmg: 3.5, poise: 30, kb: [10, 4], boxes: [[0.0, 2.0, 0.1, 1.5]], step: 0, cancel: CANCEL.strike, react: 'airHit' },
    // downward TK slam: down and Attack in the air; a wide press that bounces what is below off the floor
    airDown: { slot: 'airDown', input: ON.airDown, su: 6, ac: 8, rc: 14, dmg: 4.5, poise: 45, kb: [1, -12], boxes: [[-0.6, 1.8, -1.4, 1.6]], step: 0, cancel: CANCEL.evade, react: 'groundBounce',
      dive: { vy: 12 } },
    // lift, the launcher
    up: { slot: 'up', input: ON.up, su: 6, ac: 5, rc: 15, dmg: 3.5, poise: 45, kb: [2, 15], boxes: [[0.0, 1.3, 0.6, 2.5]], step: 1.5, cancel: CANCEL.launcher, react: 'launch',
      launch: true, lift: { vy: 7, ticks: 2 } },
    // push wave: held Attack through the first palm charges it (armour break)
    heavy: { slot: 'heavy', input: ON.hold, su: 15, ac: 5, rc: 20, dmg: 8, poise: 90, kb: [16, 8], boxes: [[0.2, 2.2, 0.4, 1.6]], step: 3, cancel: CANCEL.evade, react: 'stagger',
      heavy: true, charge: { from: 'g1', hold: 28, release: 30, dmgMult: 1.2 } },
    // the counter out of a perfect defence: the heavy's strike at once, with its bonus, and it crumples
    counter: { slot: 'counter', input: ON.counter, su: 15, ac: 5, rc: 20, dmg: 8, poise: 90, kb: [16, 8], boxes: [[0.2, 2.2, 0.4, 1.6]], step: 3, cancel: CANCEL.evade, react: 'crumple',
      heavy: true, counter: { dmgMult: 1.5, poiseMult: 1.5 } },
    // Throws (Attack and Power beside a Sentinel): a hurl into the wall, an overhead toss, a lift high, a slam in the
    // air. And the execution on a stunned Sentinel: she pulls it apart
    throwF: { slot: 'throwF', input: ON.throwF, su: 5, ac: 1, rc: 18, dmg: 5, poise: 60, kb: [16, 3], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.evade, react: 'wallBounce', grab: true, hitstop: 'heavy' },
    throwB: { slot: 'throwB', input: ON.throwB, su: 5, ac: 1, rc: 18, dmg: 5, poise: 60, kb: [-10, 9], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.evade, react: 'knockdown', grab: true, hitstop: 'heavy' },
    throwU: { slot: 'throwU', input: ON.throwU, su: 5, ac: 1, rc: 18, dmg: 5, poise: 60, kb: [0, 18], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.evade, react: 'launch', grab: true, hitstop: 'heavy', juggle: 20 },
    throwAir: { slot: 'throwAir', input: ON.throwAir, su: 5, ac: 1, rc: 16, dmg: 6, poise: 60, kb: [2, -14], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.evade, react: 'groundBounce', grab: true, hitstop: 'heavy' },
    exec: { slot: 'exec', input: ON.exec, su: 24, ac: 1, rc: 20, dmg: 40, poise: 200, kb: [0, 6], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.evade, react: 'knockdown', grab: true, hitstop: 'super', heavy: true,
      invuln: [0, 45] },
    // the second counter, by Power out of a perfect defence: a telekinetic repel that crumples whoever struck
    counterP: { slot: 'counterP', input: ON.counterP, su: 6, ac: 5, rc: 18, dmg: 8, poise: 90, kb: [14, 5], boxes: [[-0.6, 3.0, 0.2, 1.8]], step: 0, cancel: CANCEL.evade, react: 'crumple',
      heavy: true, counter: { dmgMult: 1.5, poiseMult: 1.5 } },
    // Power: a tap grabs and throws at once, a hold grips, steers and throws, and in the air she grabs from above while
    // levitating (the module, heroes/jean.js); a tap forward is a debris volley, and a tap up the uplift that launches
    // a group
    pTap: { slot: 'pTap', input: ON.pTap, module: 'tk', event: 'tkGrab' },
    pHold: { slot: 'pHold', input: ON.pHold, module: 'tk', event: 'tkThrow' },
    pAir: { slot: 'pAir', input: ON.pAir, module: 'tk', event: 'tkGrab' },
    pFwd: { slot: 'pFwd', input: ON.pFwd, su: 8, ac: 1, rc: 18, dmg: 3, poise: 25, kb: [8, 3], boxes: [[0.3, 1.0, 0.5, 1.0]], step: 0, cancel: CANCEL.special, react: 'stagger',
      shots: { n: 3, speed: 22, spread: 0.18, dmg: 3, poise: 25, r: 0.25, ttl: 50, kind: 'debris' } },
    pUp: { slot: 'pUp', input: ON.pUp, su: 7, ac: 4, rc: 18, dmg: 3.5, poise: 45, kb: [0, 14], boxes: [[-1.2, 4.0, 0.0, 3.0]], step: 0, cancel: CANCEL.special, react: 'launch', launch: true },
    // Evade (a telekinetic blink) and Signature (the TK Shield), in the module
    evade: { slot: 'evade', input: ON.evade, module: 'evade', event: 'evade' },
    sig: { slot: 'sig', input: ON.sig, module: 'shield', event: 'shield' },
    // The super, Signature and forward (a bar): Psychic Crush, a group pressed into a ball and thrown
    super: { slot: 'super', input: ON.super, su: 14, ac: 6, rc: 22, dmg: 16, poise: 200, kb: [16, 4], boxes: [[-0.5, 7.0, 0.0, 3.5]], step: 0, cancel: CANCEL.evade, react: 'wallBounce',
      hitstop: 'super', heavy: true, cost: 100, invuln: [0, 20] },
    // The ultimate, Signature and up (two bars): Phoenix Rising, a firestorm that spends her Phoenix power
    ult: { slot: 'ult', input: ON.ult, su: 24, ac: 12, rc: 30, dmg: 12, poise: 200, kb: [6, 10], boxes: [[0.0, 1.0, 0.0, 1.0]], step: 0, cancel: CANCEL.evade, react: 'launch',
      area: { r: 12 }, rehit: 6, hitstop: 'super', heavy: true, cost: 200, spend: 'phoenix', invuln: [0, 66] },
  },
};
