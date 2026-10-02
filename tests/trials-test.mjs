// The Danger Room's combo trials (game/js/sim/trials.js), each one a test: its inputs, played the way a sharp player
// would, must produce its route of moves and reach its hits. Five per hero.
import { TRIALS, runTrial } from '../game/js/sim/trials.js';

const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
for (const [hero, list] of Object.entries(TRIALS)) {
  assert(list.length === 5, `${hero} has five trials`);
  for (const t of list) {
    const r = runTrial(hero, t), again = runTrial(hero, t);
    assert(r.ok && again.route.join() === r.route.join() && again.hits === r.hits,
      `${hero}, ${t.name}: ${t.inputs.join(' ')} → ${r.route.join(' ')} (wanted ${t.route.join(' ')}), ${r.hits} hits (at least ${t.hits}), the same every time`);
  }
}
