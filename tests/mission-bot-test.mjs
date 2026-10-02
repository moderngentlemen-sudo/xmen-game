// The mission can always be finished: a simple bot (tests/lib/bot.mjs) plays it through with no cheats, alone and
// in co-op, over several seeds. A softlock (a Sentinel nobody can reach, a kid who cannot follow, a gate that
// never opens) shows up here as a run that never ends.
import { playMission } from './lib/bot.mjs';
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
for (const [players, seed] of [[1, 2], [1, 3], [1, 5], [1, 7], [1, 9], [2, 1], [2, 4], [3, 2], [4, 3]]) {
  const r = playMission({ players, seed, maxMin: 25 });
  assert(r.done, `${players === 1 ? 'alone' : players + ' players'}, seed ${seed}: the bot gets the kid to the X-Jet in ${r.minutes.toFixed(1)} min${r.done ? '' : ` (stuck after ${r.sections.join(', ') || 'nothing'}; left: ${r.left.join(', ')})`}`);
}
