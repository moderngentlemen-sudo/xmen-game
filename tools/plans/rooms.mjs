// An example plan: each hero's core verb and each of V2's four rooms.
//   NODE_USE_ENV_PROXY=1 node tools/shots.mjs tools/plans/rooms.mjs     (pictures land in tools/out/)
// Copy it to make a new plan. Section numbers and x positions are V2's mission (game/js/sim/mission.js).
import { H } from './helpers.mjs';

export default [
  { out: 'hero-cyclops.png', wait: 1500, script: H + `
    X.join('kbm'); place(16); spawn('trooper', 22); spawn('trooper', 25.5); spawn('gunner', 29);
    run({}, 10); settle();
    run({ b: bits('power'), aim: [1, 0.08] }, 46); run({ aim: [1, 0.08] }, 1); settle(); await wait(30); return X.stats();` },
  { out: 'hero-wolverine.png', wait: 1500, script: H + `
    X.join('kbm'); run({ b: bits('team') }, 2); run({}, 3);
    place(16); spawn('trooper', 18); spawn('trooper', 21); run({}, 6); settle();
    run(i => ({ b: i % 10 < 4 ? bits('attack') : 0 }), 34); await wait(30); return { hero: S().players[0].hero, ...X.stats() };` },
  { out: 'hero-jean.png', wait: 1500, script: H + `
    X.join('kbm'); run({ b: bits('team') }, 2); run({}, 45); run({ b: bits('team') }, 2); run({}, 3);
    place(16); spawn('trooper', 20.5); spawn('trooper', 27); run({}, 6); settle();
    run({ b: bits('power'), aim: [0.8, 0.6] }, 30); settle(); await wait(30); return { hero: S().players[0].hero, ...X.stats() };` },
  { out: 'room-cells.png', wait: 1500, script: H + `
    X.join('kbm'); place(76, 0, 1); spawn('trooper', 82); spawn('hunter', 70, 4.6); spawn('gunner', 66);
    run({ mx: 1 }, 20); settle(); run({}, 10); await wait(30); return X.stats();` },
  { out: 'room-hall.png', wait: 1500, script: H + `
    X.join('kbm'); place(128, 0, 2); spawn('collector', 134); spawn('trooper', 124); spawn('gunner', 139); spawn('hunter', 131, 4.8);
    run({}, 14); settle(); run({}, 6); await wait(30); return X.stats();` },
  { out: 'room-hangar.png', wait: 1500, script: H + `
    X.join('kbm'); place(226, 3.6, 3); spawn('mk2', 234, 3.6);
    run({}, 14); settle(); run({}, 6); await wait(30); return X.stats();` },
];
