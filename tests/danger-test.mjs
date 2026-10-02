// The Danger Room (game/js/sim/dangerRoom.js): its sparring Sentinels and their settings, and the trials played
// inside it the way the live demos play them (setupTrial and the pilot, stepping a Danger Room world).
import { createWorld, step } from '../game/js/sim/world.js';
import { METER } from '../game/js/sim/config.js';
import { setHero } from '../game/js/sim/player.js';
import { setupDanger } from '../game/js/sim/dangerRoom.js';
import { TRIALS, setupTrial, pilot, trialPassed } from '../game/js/sim/trials.js';
import { hitEnemy } from '../game/js/sim/combat.js';
import { newId } from '../game/js/sim/world.js';

const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
function room(opts = {}, hero = 'cyclops') {
  const S = createWorld({ seed: 11, players: 1 }), p = S.players[0];
  if (p.hero !== hero) setHero(S, p, hero);
  setupDanger(S, opts);
  const log = [];
  const run = (n = 1, b = 0) => { for (let i = 0; i < n; i++) { step(S, { [p.slot]: { mx: 0, my: 0, ax: 1, ay: 0, aim: false, b } }); log.push(...S.events); } };
  return { S, p, run, log };
}
{
  const { S, run, log } = room({ count: 3 });
  run(600);
  assert(S.enemies.filter(e => !e.dead).length === 3 && !log.some(v => v.type === 'telegraph') && S.mission.phase === 'danger' && !log.some(v => v.type === 'missionFail'),
    'three standing dummies stay three, never attack, and the mission stays out of it');
}
{
  const { run, log } = room({ behaviour: 'fight' });
  run(900);
  assert(log.some(v => v.type === 'telegraph'), 'a fighting Sentinel attacks');
}
{
  const { S, p, run } = room({ sturdy: false });
  const e = S.enemies[0];
  hitEnemy(S, e, { owner: p.id, team: 'p', inst: newId(S), power: 'optic', dmg: 999, poise: 0, kb: [0, 0] });
  const dead = e.dead;
  run(62);
  assert(dead && S.enemies.filter(q => !q.dead).length === 1 && S.enemies.some(q => !q.dead && q.id !== e.id), 'a destroyed Sentinel is rebuilt a second later');
}
{
  const { S, p, run } = room({ sturdy: true });
  const e = S.enemies[0];
  hitEnemy(S, e, { owner: p.id, team: 'p', inst: newId(S), power: 'optic', dmg: 100, poise: 0, kb: [0, 0] });
  const hurt = e.hp < e.maxHp;
  run(260);
  assert(e.maxHp === 999 && hurt && e.hp === e.maxHp, 'a sturdy dummy has 999 health and heals when left alone');
}
{
  const { p, run } = room({ meter: true });
  run(2);
  const full = p.meter === METER.max;
  p.hp = 1; p.state = 'downed'; p.downedT = 0; run(70);
  assert(full && p.state !== 'downed' && p.hp === p.maxHp, 'the meter option keeps the meter full; a downed hero is back up a second later');
}
// Every trial, played the way the live demo plays it: in a Danger Room world, set up by setupTrial, by the pilot
for (const [hero, list] of Object.entries(TRIALS)) {
  const bad = [];
  for (const t of list) {
    const { S, p } = room({ count: 1 }, hero);
    setupTrial(S, p, t);
    const g = pilot(S, p, t);
    let r = g.next();
    while (!r.done) { step(S, { [p.slot]: r.value }); r = g.next(); }
    if (!trialPassed(t, r.value.route, r.value.hits)) bad.push(`${t.name} (${r.value.route.join(' ')})`);
  }
  assert(!bad.length, `${hero}: every trial plays out in the Danger Room as its demo${bad.length ? '; not: ' + bad.join(', ') : ''}`);
}
