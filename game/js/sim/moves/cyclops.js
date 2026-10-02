// Cyclops's moves: martial-arts strikes that knock Sentinels into blast lines. V2's moves and numbers, exactly
// (phase 0 changed no behaviour; phase 1 grows them); the fields are documented in schema.js. Holding Attack through
// the first strike charges the heavy (see schema.js, charge).
import { ON, CANCEL } from './schema.js';

export default {
  hero: 'cyclops',
  chain: ['g1', 'g2', 'g3', 'g4'],
  airChain: ['air1', 'air2'],
  alt: { at: 'g4', id: 'g4alt', pause: 7 },   // pausing before the last press swaps in the second ender
  moves: {
    // backhand, elbow, driving punch, roundhouse kick
    g1: { slot: 'g1', input: ON.chain, su: 4, ac: 3, rc: 9, dmg: 3, poise: 18, kb: [4, 2], boxes: [[0.2, 1.3, 0.6, 1.6]], step: 1.5, cancel: CANCEL.strike, react: 'flinch' },
    g2: { slot: 'g2', input: ON.chain, su: 4, ac: 3, rc: 10, dmg: 3, poise: 20, kb: [4, 2], boxes: [[0.2, 1.35, 0.5, 1.5]], step: 1.5, cancel: CANCEL.strike, react: 'flinch' },
    g3: { slot: 'g3', input: ON.chain, su: 6, ac: 4, rc: 16, dmg: 5, poise: 55, kb: [6, 3], boxes: [[0.2, 1.55, 0.2, 1.7]], step: 1.5, cancel: CANCEL.strike, react: 'stagger' },
    g4: { slot: 'g4', input: ON.chain, su: 6, ac: 4, rc: 16, dmg: 5.5, poise: 55, kb: [11, 6], boxes: [[0.1, 1.7, 0.6, 1.5]], step: 1.5, cancel: CANCEL.strike, react: 'knockdown' },
    // optic palm: a point-blank blast that wall-bounces (the second ender)
    g4alt: { slot: 'g4alt', input: ON.alt, su: 8, ac: 3, rc: 18, dmg: 6, poise: 60, kb: [16, 3], boxes: [[0.2, 1.4, 0.7, 1.0]], step: 1, cancel: CANCEL.strike, react: 'wallBounce' },
    // sliding kick (wall-bounce), leg sweep (knockdown), flying knee (the dash strike)
    fwd: { slot: 'fwd', input: ON.fwd, su: 6, ac: 6, rc: 14, dmg: 4.5, poise: 40, kb: [14, 2], boxes: [[0.0, 1.6, 0.0, 0.7]], step: 9, cancel: CANCEL.strike, react: 'wallBounce' },
    down: { slot: 'down', input: ON.down, su: 5, ac: 4, rc: 14, dmg: 3.5, poise: 35, kb: [3, 5], boxes: [[0.0, 1.8, 0.0, 0.5]], step: 1, cancel: CANCEL.strike, react: 'knockdown' },
    dash: { slot: 'dash', input: ON.dash, su: 4, ac: 5, rc: 14, dmg: 4.5, poise: 40, kb: [8, 6], boxes: [[0.1, 1.3, 0.6, 1.2]], step: 8, cancel: CANCEL.strike, react: 'stagger',
      lift: { vy: 5, ticks: 2 } },
    // axe kick
    air1: { slot: 'air1', input: ON.air, su: 4, ac: 5, rc: 10, dmg: 4, poise: 25, kb: [6, -2], boxes: [[0.1, 1.4, 0.0, 1.4]], step: 1.5, cancel: CANCEL.strike, react: 'airHit' },
    // air roundhouse
    air2: { slot: 'air2', input: ON.air, su: 4, ac: 4, rc: 12, dmg: 4, poise: 28, kb: [9, 4], boxes: [[0.0, 1.6, 0.3, 1.3]], step: 0, cancel: CANCEL.strike, react: 'airHit' },
    // diving optic stomp: down and Attack in the air; it drives a Sentinel into the floor to bounce
    airDown: { slot: 'airDown', input: ON.airDown, su: 6, ac: 10, rc: 14, dmg: 5, poise: 45, kb: [2, -12], boxes: [[-0.4, 1.2, -0.4, 0.9]], step: 0, cancel: CANCEL.evade, react: 'groundBounce',
      dive: { vy: 20 } },
    // rising kick, the launcher: it carries him up a little
    up: { slot: 'up', input: ON.up, su: 5, ac: 5, rc: 16, dmg: 4, poise: 45, kb: [2, 15], boxes: [[0.0, 1.1, 0.6, 2.4]], step: 1.5, cancel: CANCEL.launcher, react: 'launch',
      launch: true, lift: { vy: 7, ticks: 2 } },
    // the heavy: held Attack through the first strike charges it
    heavy: { slot: 'heavy', input: ON.hold, su: 14, ac: 5, rc: 20, dmg: 9, poise: 90, kb: [14, 6], boxes: [[0.2, 1.7, 0.3, 1.6]], step: 3, cancel: CANCEL.evade, react: 'stagger',
      heavy: true, charge: { from: 'g1', hold: 26, release: 30, dmgMult: 1.2 } },
    // the counter out of a perfect defence: the heavy's strike at once, with its bonus, and it crumples
    counter: { slot: 'counter', input: ON.counter, su: 14, ac: 5, rc: 20, dmg: 9, poise: 90, kb: [14, 6], boxes: [[0.2, 1.7, 0.3, 1.6]], step: 3, cancel: CANCEL.evade, react: 'crumple',
      heavy: true, counter: { dmgMult: 1.5, poiseMult: 1.5 } },
    // Throws (Attack and Power beside a Sentinel): a judo throw into the wall, a shoulder toss, a toss then an
    // upward blast, a blast-driven slam in the air. And the execution on a stunned Sentinel: a point-blank blast
    // through the core
    throwF: { slot: 'throwF', input: ON.throwF, su: 5, ac: 1, rc: 18, dmg: 6, poise: 60, kb: [14, 3], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.evade, react: 'wallBounce', grab: true, hitstop: 'heavy' },
    throwB: { slot: 'throwB', input: ON.throwB, su: 5, ac: 1, rc: 18, dmg: 6, poise: 60, kb: [-9, 7], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.evade, react: 'knockdown', grab: true, hitstop: 'heavy' },
    throwU: { slot: 'throwU', input: ON.throwU, su: 5, ac: 1, rc: 20, dmg: 6, poise: 60, kb: [0, 15], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.evade, react: 'launch', grab: true, hitstop: 'heavy', juggle: 20 },
    throwAir: { slot: 'throwAir', input: ON.throwAir, su: 5, ac: 1, rc: 16, dmg: 6, poise: 60, kb: [2, -14], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.evade, react: 'groundBounce', grab: true, hitstop: 'heavy' },
    exec: { slot: 'exec', input: ON.exec, su: 18, ac: 1, rc: 24, dmg: 40, poise: 200, kb: [10, 6], boxes: [[0.2, 1.0, 0.3, 1.5]], step: 0, cancel: CANCEL.evade, react: 'knockdown', grab: true, hitstop: 'super', heavy: true,
      invuln: [0, 43] },
    // the second counter, by Power out of a perfect defence: a point-blank blast that crumples
    counterP: { slot: 'counterP', input: ON.counterP, su: 6, ac: 4, rc: 18, dmg: 9, poise: 90, kb: [12, 4], boxes: [[0.2, 2.2, 0.5, 1.2]], step: 0, cancel: CANCEL.evade, react: 'crumple',
      heavy: true, counter: { dmgMult: 1.5, poiseMult: 1.5 } },
    // Power: a tap is a quick optic beam, a hold opens the visor for a wider blast that banks off walls, down in the
    // air a blast that vaults him (the module, heroes/cyclops.js); a tap forward is the optic burst, a short cone that
    // knocks back, and a tap up the anti-air blast that launches
    pTap: { slot: 'pTap', input: ON.pTap, module: 'optic', event: 'optic' },
    pHold: { slot: 'pHold', input: ON.pHold, module: 'optic', event: 'optic' },
    pAir: { slot: 'pAir', input: ON.pAir, module: 'optic', event: 'vault' },
    pFwd: { slot: 'pFwd', input: ON.pFwd, su: 6, ac: 3, rc: 16, dmg: 5, poise: 50, kb: [13, 3], boxes: [[0.3, 3.6, 0.3, 1.8]], step: 0, cancel: CANCEL.special, react: 'stagger' },
    pUp: { slot: 'pUp', input: ON.pUp, su: 5, ac: 4, rc: 18, dmg: 5, poise: 50, kb: [1, 15], boxes: [[-0.3, 1.6, 1.4, 4.5]], step: 0, cancel: CANCEL.special, react: 'launch', launch: true },
    // Evade (a backflip) and Signature (Tactical Call), in the module
    evade: { slot: 'evade', input: ON.evade, module: 'evade', event: 'evade' },
    sig: { slot: 'sig', input: ON.sig, module: 'call', event: 'called' },
    // The super, Signature and forward (a bar): Optic Overdrive, a full-power beam swept across the room
    super: { slot: 'super', input: ON.super, su: 12, ac: 30, rc: 24, dmg: 3, poise: 30, kb: [6, 2], boxes: [[0.3, 18, 0.7, 1.0]], step: 0, cancel: CANCEL.evade, react: 'stagger',
      rehit: 6, hitstop: 4, cost: 100, invuln: [0, 42] },
    // The ultimate, Signature and up (two bars): Ricochet Barrage, one blast banked off every wall onto every Sentinel
    ult: { slot: 'ult', input: ON.ult, su: 20, ac: 1, rc: 30, dmg: 22, poise: 300, kb: [3, 9], boxes: [[0.0, 1.0, 0.0, 1.0]], step: 0, cancel: CANCEL.evade, react: 'launch',
      area: { r: 26 }, hitstop: 'super', heavy: true, cost: 200, invuln: [0, 51] },
  },
};
