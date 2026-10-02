// A balance probe: the test bot (tests/lib/bot.mjs) plays the mission with no cheats and this prints how it went.
//   node tools/probe.mjs [players=1] [seeds=1,2,3] [maxMinutes=25]
//   node tools/probe.mjs 2 1,4,7
// One line of JSON per seed: finished or not, minutes, sections cleared, failures, kills, team-ups, assists,
// perfect evades, downs, and damage by power type. No browser needed.
import { playMission } from '../tests/lib/bot.mjs';

const players = +(process.argv[2] || 1);
const seeds = (process.argv[3] || '1,2,3').split(',').map(Number);
const maxMin = +(process.argv[4] || 25);
for (const seed of seeds) {
  const r = playMission({ players, seed, maxMin });
  const T = r.stats;
  console.log(JSON.stringify({ players, seed, done: r.done, minutes: +r.minutes.toFixed(2), sections: r.sections, fails: r.fails,
    kills: T.kills, teamups: T.teamups, assists: T.assists, perfects: T.perfects, downs: T.downs,
    dmg: Object.fromEntries(Object.entries(T.dmg).map(([k, v]) => [k, Math.round(v)])), left: r.left }));
}
