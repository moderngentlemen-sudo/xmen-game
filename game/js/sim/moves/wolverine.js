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
    g1: { slot: 'g1', input: ON.chain, su: 3, ac: 3, rc: 7, dmg: 3, poise: 16, kb: [3, 1.5], boxes: [[0.1, 1.4, 0.3, 1.5]], step: 1.5, cancel: CANCEL.strike, react: 'flinch' },
    g2: { slot: 'g2', input: ON.chain, su: 3, ac: 3, rc: 7, dmg: 3, poise: 16, kb: [3, 1.5], boxes: [[0.1, 1.4, 0.3, 1.5]], step: 1.5, cancel: CANCEL.strike, react: 'flinch' },
    g3: { slot: 'g3', input: ON.chain, su: 4, ac: 3, rc: 9, dmg: 3.5, poise: 22, kb: [4, 2], boxes: [[0.1, 1.5, 0.2, 1.6]], step: 1.5, cancel: CANCEL.strike, react: 'flinch' },
    g4: { slot: 'g4', input: ON.chain, su: 5, ac: 4, rc: 15, dmg: 6, poise: 60, kb: [5, 3], boxes: [[0.1, 1.7, 0.2, 1.7]], step: 1.5, cancel: CANCEL.strike, react: 'stagger' },
    g5: { slot: 'extra', input: ON.chain, su: 5, ac: 4, rc: 16, dmg: 6.5, poise: 60, kb: [12, 7], boxes: [[0.1, 1.8, 0.4, 1.3]], step: 3, cancel: CANCEL.strike, react: 'knockdown' },
    // gut slash that crumples (the second ender)
    g4alt: { slot: 'g4alt', input: ON.alt, su: 7, ac: 4, rc: 18, dmg: 6, poise: 60, kb: [2, 0], boxes: [[0.1, 1.5, 0.5, 1.0]], step: 2, cancel: CANCEL.strike, react: 'crumple' },
    // lunging thrust (wall-bounce), low claw sweep (knockdown), shoulder barge (the dash strike)
    fwd: { slot: 'fwd', input: ON.fwd, su: 6, ac: 5, rc: 14, dmg: 5, poise: 40, kb: [14, 2], boxes: [[0.1, 1.9, 0.5, 1.0]], step: 10, cancel: CANCEL.strike, react: 'wallBounce' },
    down: { slot: 'down', input: ON.down, su: 4, ac: 4, rc: 13, dmg: 3.5, poise: 30, kb: [3, 5], boxes: [[0.0, 1.7, 0.0, 0.6]], step: 1, cancel: CANCEL.strike, react: 'knockdown' },
    dash: { slot: 'dash', input: ON.dash, su: 3, ac: 6, rc: 14, dmg: 4.5, poise: 45, kb: [10, 5], boxes: [[0.0, 1.2, 0.3, 1.4]], step: 9, cancel: CANCEL.strike, react: 'stagger' },
    // claw swipe
    air1: { slot: 'air1', input: ON.air, su: 3, ac: 6, rc: 8, dmg: 3.5, poise: 22, kb: [5, -1], boxes: [[0.0, 1.5, -0.1, 1.7]], step: 1.5, cancel: CANCEL.strike, react: 'airHit' },
    // a second swipe in the air
    air2: { slot: 'air2', input: ON.air, su: 3, ac: 5, rc: 10, dmg: 3.5, poise: 22, kb: [6, 3], boxes: [[0.0, 1.5, -0.1, 1.7]], step: 0, cancel: CANCEL.strike, react: 'airHit' },
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
    throwF: { slot: 'throwF', input: ON.throwF, su: 5, ac: 1, rc: 16, dmg: 7, poise: 60, kb: [14, 3], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.grab, react: 'wallBounce', grab: true, hitstop: 'heavy' },
    throwB: { slot: 'throwB', input: ON.throwB, su: 5, ac: 1, rc: 16, dmg: 6, poise: 60, kb: [-10, 6], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.grab, react: 'knockdown', grab: true, hitstop: 'heavy' },
    throwU: { slot: 'throwU', input: ON.throwU, su: 5, ac: 1, rc: 18, dmg: 6, poise: 60, kb: [1, 15], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.grab, react: 'launch', grab: true, hitstop: 'heavy', juggle: 20 },
    throwAir: { slot: 'throwAir', input: ON.throwAir, su: 5, ac: 1, rc: 16, dmg: 7, poise: 60, kb: [1, -16], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.grab, react: 'groundBounce', grab: true, hitstop: 'heavy' },
    exec: { slot: 'exec', input: ON.exec, su: 22, ac: 1, rc: 22, dmg: 42, poise: 200, kb: [6, 8], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.grab, react: 'knockdown', grab: true, hitstop: 'super', heavy: true,
      invuln: [0, 45] },
    // the second counter, by Power out of a perfect defence: a counter Drill that pierces
    counterP: { slot: 'counterP', input: ON.counterP, su: 5, ac: 6, rc: 16, dmg: 8, poise: 80, kb: [10, 3], boxes: [[0.0, 3.2, 0.4, 1.2]], step: 12, cancel: CANCEL.evade, react: 'crumple',
      heavy: true, counter: { dmgMult: 1.5, poiseMult: 1.5 } },
    // Power: a tap is a short claw lunge, a hold coils the Drill Claw through three tiers, and in the air it is a diving
    // Drill Claw (the module, heroes/wolverine.js); a tap forward is the Tornado Claw, a spinning drill, and a tap up
    // the rising Drill Claw that launches
    pTap: { slot: 'pTap', input: ON.pTap, module: 'drill', event: 'drill' },
    pHold: { slot: 'pHold', input: ON.pHold, module: 'drill', event: 'drillLevel' },
    pAir: { slot: 'pAir', input: ON.pAir, module: 'drill', event: 'drill' },
    pFwd: { slot: 'pFwd', input: ON.pFwd, su: 8, ac: 18, rc: 16, dmg: 2.5, poise: 20, kb: [6, 2], boxes: [[0.0, 1.6, 0.2, 1.6]], step: 6, cancel: CANCEL.special, react: 'stagger',
      rehit: 5, hitstop: 3 },
    pUp: { slot: 'pUp', input: ON.pUp, su: 4, ac: 8, rc: 18, dmg: 5, poise: 50, kb: [1, 15], boxes: [[-0.2, 1.4, 0.6, 2.4]], step: 0, cancel: CANCEL.launchSpecial, react: 'launch', launch: true,
      lift: { vy: 14, ticks: 6 } },
    // Evade (a roll) and Signature (Berserk), in the module
    evade: { slot: 'evade', input: ON.evade, module: 'evade', event: 'evade' },
    sig: { slot: 'sig', input: ON.sig, module: 'berserk', event: 'berserk' },
    // The super, Signature and forward (a bar): Berserker Barrage, a flurry that carries a Sentinel across the room
    super: { slot: 'super', input: ON.super, su: 6, ac: 36, rc: 20, dmg: 2, poise: 20, kb: [7, 1], boxes: [[0.0, 1.6, 0.2, 1.6]], step: 7, cancel: CANCEL.evade, react: 'stagger',
      rehit: 4, hitstop: 3, cost: 100, invuln: [0, 42] },
    // The ultimate, Signature and up (two bars): Weapon X, a rush through every Sentinel in reach
    ult: { slot: 'ult', input: ON.ult, su: 10, ac: 24, rc: 30, dmg: 7, poise: 100, kb: [4, 6], boxes: [[0.0, 1.0, 0.0, 1.0]], step: 0, cancel: CANCEL.evade, react: 'stagger',
      area: { r: 14 }, rehit: 6, hitstop: 'heavy', heavy: true, cost: 200, invuln: [0, 64] },
  },
};
