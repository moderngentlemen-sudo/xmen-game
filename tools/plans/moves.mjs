// Each hero caught mid-strike, one shot per thing a strike clip can do: a chain finisher, the launcher, a spin, the
// counter (the heavy's strike), an air strike. For checking the strike clips (game/js/anim/clips/) and the effect cues
// (game/js/vfx/cues.js) after a change; phase 0 compared these against V2.
//   NODE_USE_ENV_PROXY=1 node tools/shots.mjs tools/plans/moves.mjs     (pictures land in tools/out/)
// It drives the game with inputs only (plus the counter window for the counter). Phase 1 renamed the move ids, so
// it no longer runs on V2's code.
import { H } from './helpers.mjs';

// Page side: as(hero) tags through the solo squad to that hero; strike(id, at) presses Attack the way that move
// needs and steps until the move's clock reaches `at`
const S0 = H + `
  const CFG = await import('./js/sim/config.js');
  const me = () => S().players[0];
  function as(hero) { for (let k = 0; k < 3 && me().hero !== hero; k++) { run({ b: bits('team') }, 2); run({}, 45); } }
  function strike(id, at) {
    const set = CFG.MOVES[me().hero], ready = () => { const p = me(), m = p.move && set[p.move.id]; return !p.move || p.move.t > m.su + m.ac; };
    if (id === 'counter') { me().counterT = 10; run({ b: bits('attack') }, 1); }
    else if (id === 'up') run({ my: 1, b: bits('attack') }, 1);
    else if (id === 'air1') { run({ b: bits('jump') }, 8); run({ b: bits('jump', 'attack') }, 1); }
    for (let i = 0; i < 240; i++) {
      const p = me();
      if (p.move && p.move.id === id && p.move.t >= at) break;
      // The chain: a tap at each strike's recovery until it reaches the move
      if (CFG.COMBO[p.hero].includes(id) && ready()) { run({ b: bits('attack') }, 1); run({}, 1); }
      else run(id === 'air1' ? { b: bits('jump') } : {}, 1);
    }
    settle();
    const p = me();
    return { hero: p.hero, move: p.move && p.move.id, t: p.move && p.move.t };
  }
  X.join('kbm'); place(16); spawn('trooper', 18.4);
`;
const shot = (out, hero, id, at) => ({ out, wait: 1500, script: S0 + `as('${hero}'); place(16); run({}, 4); const r = strike('${id}', ${at}); await wait(30); return r;` });

export default [
  shot('moves-cyclops-g3.png', 'cyclops', 'g3', 7),        // the driving punch, on its first active tick
  shot('moves-cyclops-up.png', 'cyclops', 'up', 6),        // the rising kick
  shot('moves-wolverine-g4.png', 'wolverine', 'g4', 7),    // the spinning finisher, mid-spin
  shot('moves-wolverine-counter.png', 'wolverine', 'counter', 11),   // the two-claw overhead, as the counter
  shot('moves-jean-g3.png', 'jean', 'g3', 8),              // the push
  shot('moves-jean-air1.png', 'jean', 'air1', 6),          // the air palm
];
