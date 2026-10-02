// Phase 1's feel rules, one section per step as they land (HANDOFF-EXPANSION.md, section 4): hitstop in the
// simulation, the charged heavy and the step, reactions, combo rules and the meter.
import { createWorld, step } from '../game/js/sim/world.js';
import { BTN, HITSTOP } from '../game/js/sim/config.js';
import { setHero } from '../game/js/sim/player.js';
import { createEnemy } from '../game/js/sim/enemies.js';
import { spawnProjectile } from '../game/js/sim/combat.js';

const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const cmd = (o = {}) => ({ mx: o.mx || 0, my: o.my || 0, ax: 1, ay: 0, aim: false, b: o.b || 0 });

// A hero on the rooftop with the mission parked; `trooper` puts a Sentinel trooper in front that stands still
// (its attack cooldown never runs out) unless the test says otherwise
function arena(hero = 'cyclops', { trooper = true, dist = 1.2 } = {}) {
  const S = createWorld({ seed: 3, players: 1 }), p = S.players[0];
  if (p.hero !== hero) setHero(S, p, hero);
  S.enemies = []; p.x = 20; p.y = 0; p.mercy = 0; S.mission.phase = 'test';
  let e = null;
  if (trooper) { e = createEnemy(S, 'trooper', p.x + dist, 0); e.onGround = true; e.cd = 9999; S.enemies.push(e); }
  const log = [];
  const run = (o = {}, n = 1) => { for (let i = 0; i < n; i++) { step(S, { [p.slot]: cmd(typeof o === 'function' ? o(i) : o) }); log.push(...S.events); } };
  const until = (pred, max = 60, o = {}) => { for (let i = 0; i < max && !pred(); i++) run(o); return pred(); };
  return { S, p, e, run, log, until };
}

// ---- 1.2 Hitstop -----------------------------------------------------------------------------------------------
{
  // A light strike: the hero and the trooper freeze together for HITSTOP.light ticks, then both move on
  const { p, e, run, log, until } = arena('cyclops');
  run({ b: BTN.attack });
  until(() => log.some(v => v.type === 'hit'));
  const t = p.move.t, ex = e.x, ehs = e.hitstop, phs = p.hitstop;
  let still = 0;
  while (p.hitstop > 0 && still < 20) { run(); if (p.move.t === t && e.x === ex) still++; }
  run();
  assert(phs === HITSTOP.light && ehs === HITSTOP.light && still === HITSTOP.light && p.move.t > t,
    `a light hit freezes the hero and the Sentinel together for ${HITSTOP.light} ticks (held ${still}), then the move runs on`);
}
{
  // The heavy (the counter) freezes for HITSTOP.heavy
  const { p, e, run, log, until } = arena('wolverine');
  p.counterT = 10; run({ b: BTN.attack });
  until(() => log.some(v => v.type === 'hit'));
  assert(p.hitstop === HITSTOP.heavy && e.hitstop >= HITSTOP.heavy, `a heavy hit freezes both for ${HITSTOP.heavy} ticks`);
}
{
  // A press during the freeze is kept, and comes out once it ends: the chain continues
  const { p, run, log, until } = arena('cyclops');
  run({ b: BTN.attack });
  until(() => log.some(v => v.type === 'hit'));
  run({ b: BTN.attack }); run({}, 40);
  const swings = log.filter(v => v.type === 'swing').map(v => v.move);
  assert(swings.join(' ') === 'g1 g2', `a press made during hitstop is buffered and continues the chain (${swings.join(' ')})`);
}
{
  // A Sentinel's blow freezes it and the hero; its shot freezes only the hero
  const { S, p, e, run } = arena('jean', { dist: 1.4 });
  e.cd = 0;
  let hit = false;
  for (let i = 0; i < 200 && !hit; i++) { run(); hit = p.state === 'hitstun'; }
  const both = hit && p.hitstop > 0 && e.hitstop > 0;
  const B = arena('jean', { trooper: false }), g = createEnemy(B.S, 'gunner', B.p.x + 6, 0);
  g.cd = 9999; B.S.enemies.push(g);
  spawnProjectile(B.S, { team: 'e', owner: g.id, x: B.p.x + 1, y: B.p.y + 1, vx: -15, vy: 0, r: 0.16, dmg: 6, kind: 'bolt', ttl: 60 });
  B.until(() => B.p.state === 'hitstun', 20);
  assert(both && B.p.hitstop > 0 && g.hitstop === 0, 'a Sentinel\'s blow freezes it and the hero together; a shot freezes only the hero');
}

// ---- 1.3 The step forward ----------------------------------------------------------------------------------------
// A ground strike's step speed is kept through startup and active (V2 lost it to deceleration in the same tick)
for (const hero of ['cyclops', 'wolverine', 'jean']) {
  const { p, run } = arena(hero, { trooper: false });
  const x0 = p.x;
  run({ b: BTN.attack }); run({}, 30);
  assert(p.x - x0 >= 0.15, `${hero}: the first strike steps forward ${(p.x - x0).toFixed(2)} m (at least 0.15)`);
}
