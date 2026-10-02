// A Sentinel caught in each hit reaction (game/js/sim/reactions.js), for checking the poses in sentinels.js and the
// effect cues: on its back, folding in a crumple, dazed in a stun, spinning out, flipping out, juggled high.
//   NODE_USE_ENV_PROXY=1 node tools/shots.mjs tools/plans/reactions.mjs     (pictures land in tools/out/)
// The reaction is dealt straight through hitEnemy, then the clock steps `n` ticks.
import { H } from './helpers.mjs';

const S0 = H + `
  const CB = await import('./js/sim/combat.js'), W = await import('./js/sim/world.js');
  X.join('kbm'); place(16);
  const e = spawn('trooper', 19);
  const hit = (react, o = {}) => CB.hitEnemy(S(), e, { owner: S().players[0].id, team: 'p', inst: W.newId(S()), power: 'plain', dmg: 1, poise: 0, kb: [6, 4], react, ...o });
`;
const shot = (out, body) => ({ out, wait: 1500, script: S0 + body + ` settle(); await wait(30); return { state: e.state, y: +e.y.toFixed(2), lying: e.lying, juggle: e.juggle };` });

export default [
  shot('react-knockdown.png', `hit('knockdown', { kb: [6, 5] }); run({}, 40);`),
  shot('react-crumple.png', `hit('crumple'); run({}, 30);`),
  shot('react-stun.png', `e.stun = 999; hit('stagger'); run({}, 20);`),
  shot('react-spinout.png', `spawn('trooper', 24); hit('spinOut', { kb: [10, 2] }); run({}, 12);`),
  shot('react-flipout.png', `hit('launch', { kb: [0, 15] }); run({}, 6); e.juggle = 95; hit('flinch'); run({}, 9);`),
  shot('react-juggle.png', `hit('launch', { kb: [1, 15] }); run({}, 14); hit('airHit'); run({}, 6);`),
];
