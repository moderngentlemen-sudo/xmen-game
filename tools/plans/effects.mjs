// Phase 1's effects in action (game/js/vfx/): a heavy hit (about 40 sparks, a light flash, a ripple), a strike's
// bone trail, a wall bounce, a ground bounce's floor decal, a super (cut-in, focus lines, a strong light) and a kill
// (debris and a scorch). Each shot also reports the pools: live GPU sparks, lit pool lights, decals on the floor.
//   NODE_USE_ENV_PROXY=1 node tools/shots.mjs tools/plans/effects.mjs
import { H } from './helpers.mjs';

const S0 = H + `
  const CB = await import('./js/sim/combat.js'), W = await import('./js/sim/world.js');
  X.join('kbm'); place(18);
  const me = () => S().players[0];
  const fx = X.view.fx;
  const pools = () => ({ sparks: fx.gpu.count, lights: fx.lights.active, decals: fx.decals.live, trails: [...fx.trails.by.values()].filter(t => t.m.visible).length });
  // Steps the world with the renderer drawing between steps, so frame-driven effects (trails, lights) keep up
  async function play(spec, n) { for (let i = 0; i < n; i++) { run(spec, 1); await wait(16); } }
`;
const shot = (out, body) => ({ out, wait: 1500, script: S0 + body + ` settle(); await wait(40); return pools();` });

export default [
  shot('fx-heavy-hit.png', `const e = spawn('trooper', 19.4, 0, { hp: 999, maxHp: 999 }); me().counterT = 10; run({ b: bits('attack') }, 1); await play({}, 15);`),
  shot('fx-trail.png', `spawn('trooper', 23, 0); run({ b: bits('attack') }, 1); await play({}, 4); run({ b: bits('attack') }, 1); await play({}, 3);`),
  shot('fx-wall-bounce.png', `place(-6.5); me().facing = -1; const e = spawn('trooper', -9.5, 0, { hp: 999, maxHp: 999 }); run({ mx: -1, b: bits('attack') }, 1); await play({}, 22);`),
  shot('fx-ground-bounce.png', `const e = spawn('trooper', 18.5, 0, { hp: 999, maxHp: 999 }); run({ b: bits('jump') }, 6); run({ my: -1, b: bits('attack') }, 1); await play({}, 30);`),
  shot('fx-super.png', `spawn('trooper', 23, 0, { hp: 999, maxHp: 999 }); spawn('trooper', 27, 0, { hp: 999, maxHp: 999 }); me().meter = 300; run({ mx: 1, b: bits('sig') }, 1); await play({}, 16);`),
  // (a real strike: events from a direct hitEnemy call between steps are cleared before the cues play)
  shot('fx-kill.png', `const e = spawn('trooper', 19.3, 0, { hp: 1, maxHp: 34 }); run({ b: bits('attack') }, 1); await play({}, 14);`),
];
