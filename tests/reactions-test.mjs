// Hit reactions (game/js/sim/reactions.js): each of the ten a hero's hit can cause (held and thrown are Jean's, in
// engine-test), and the rules on top: juggle weight and the flip-out, the one hit on the floor, the stun bar, and
// V2's reaction kept for bosses. Hits are dealt straight through hitEnemy, so each check controls exactly what lands.
import { createWorld, step, newId } from '../game/js/sim/world.js';
import { JUGGLE, REACT, STUN, ENEMIES, REACTIONS } from '../game/js/sim/config.js';
import { createEnemy } from '../game/js/sim/enemies.js';
import { hitEnemy } from '../game/js/sim/combat.js';
import { hittable } from '../game/js/sim/reactions.js';

const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };

// A trooper (or another unit) standing at x with nobody near: the hero is parked far away, the mission paused
function world(type = 'trooper', x = 20, o = {}) {
  const S = createWorld({ seed: 3, players: 1 }), p = S.players[0];
  S.enemies = []; S.mission.phase = 'test'; p.x = x - 30; p.y = 0;
  const e = createEnemy(S, type, x, 0, { cd: 9999, onGround: true, ...o });
  S.enemies.push(e);
  const log = [];
  const run = (n = 1, until = null) => { for (let i = 0; i < n; i++) { step(S, {}); log.push(...S.events); if (until && until()) return i + 1; } return n; };
  // A hit from the hero, facing +x, with the reaction asked for
  const hit = (react, o2 = {}) => { hitEnemy(S, e, { owner: p.id, team: 'p', inst: newId(S), power: 'plain', dmg: 0.5, poise: 0, kb: [6, 4], react, ...o2 }); log.push(...S.events); };
  return { S, p, e, run, hit, log };
}
const evs = (log, react) => log.filter(v => v.type === 'react' && v.react === react).length;

assert(REACTIONS.length === 12, `twelve reactions: ${REACTIONS.join(', ')}`);

// ---- Flinch ------------------------------------------------------------------------------------------------------
{
  const { e, hit, run } = world();
  e.state = 'windup'; e.atk = { kind: 'swing', inst: 1 }; e.st = 5;
  hit('flinch');
  const st = e.st, flinched = e.flinchT === REACT.flinch;
  run(e.hitstop + REACT.flinch - 1);
  const paused = e.st === st && e.state === 'windup' && e.atk;
  run(3);
  const C = world('collector'); C.hit('flinch');
  assert(flinched && paused && e.st > st && C.e.flinchT === 0, `a flinch pauses the Sentinel's attack for ${REACT.flinch} ticks without cancelling it; an armoured Collector ignores it`);
}
// ---- Stagger -----------------------------------------------------------------------------------------------------
{
  const { e, hit, run, log } = world();
  hit('stagger', { heavy: true });
  const ok = e.state === 'stagger' && !e.atk && log.some(v => v.type === 'stagger');
  run(80, () => e.state === 'idle');
  assert(ok && e.state === 'idle', 'a stagger stops the Sentinel, then it recovers');
}
// ---- Launch, air hits, juggle weight and the flip-out -------------------------------------------------------------
{
  const { e, hit, run } = world();
  hit('launch', { kb: [2, 15] });
  const up = e.state === 'launched' && e.vy > 6 && e.juggle === JUGGLE.launcher;
  run(80, () => e.vy < 0);   // on its way down
  hit('stagger'); const air = e.state === 'launched' && e.vy >= REACT.airPop && e.juggle === JUGGLE.launcher + JUGGLE.hit;
  // Heavier juggles fall faster: the same rise comes down sooner with more weight
  const fall = w => { const T = world(); T.hit('launch', { kb: [0, 15] }); T.e.juggle = w; return T.run(200, () => T.e.onGround && T.e.st > 3); };
  const light = fall(20), heavy = fall(80);
  // Keep hitting it in the air: it flips out at the limit, cannot be hit for a while, and lands on its feet
  const F = world(); F.hit('launch', { kb: [0, 15] });
  let hits = 1;
  while (F.e.state !== 'flipOut' && hits < 20) { F.run(F.e.hitstop + 1); F.e.vy = Math.max(F.e.vy, 3); F.hit('flinch'); hits++; }
  const flipped = F.e.state === 'flipOut' && !hittable(F.e) && F.e.juggle >= JUGGLE.limit;
  F.run(F.e.hitstop + JUGGLE.flipOut + 1);   // (the clock waits out the hitstop)
  const back = hittable(F.e);
  F.run(200, () => F.e.state === 'idle');
  assert(up && air, 'a launcher sends it up with 20 juggle weight; a hit in the air pops it higher and adds 10');
  assert(heavy < light, `juggle weight makes it fall faster (${light} ticks at 20, ${heavy} at 80)`);
  assert(flipped && back && F.e.state === 'idle' && F.e.juggle === 0 && hits === 1 + (JUGGLE.limit - JUGGLE.launcher) / JUGGLE.hit,
    `at ${JUGGLE.limit} weight it flips out (after ${hits} hits), untouchable for ${JUGGLE.flipOut} ticks, and lands on its feet`);
}
// ---- Knockdown and the one hit on the floor ------------------------------------------------------------------------
{
  const { e, hit, run } = world();
  hit('knockdown', { kb: [8, 5] });
  const flying = e.state === 'knockdown' && !e.onGround;
  run(120, () => e.lying);
  const lying = e.lying && hittable(e);
  hit('flinch');   // the OTG hit pops it back up
  const popped = e.state === 'launched' && e.vy > 0 && e.otgUsed;
  run(120, () => e.lying);
  const spent = e.lying && !hittable(e);
  run(REACT.down + 1);
  assert(flying && lying && popped && spent && e.state === 'idle' && hittable(e),
    'a knockdown lands it on its back; one hit on the floor pops it up, and after that it cannot be hit down there until it gets up');
}
// ---- Wall bounce ---------------------------------------------------------------------------------------------------
{
  // The rooftop's left bound is a wall at x -12
  const { e, hit, run, log } = world('trooper', -9);
  hit('wallBounce', { kb: [-10, 3] });
  const flying = e.state === 'wallBounce' && e.vx < 0;
  run(40, () => log.some(v => v.type === 'wallBounce'));
  const back = e.vx > 0 && e.state === 'launched' && e.wallBounced;
  run(e.hitstop + 2);
  hit('wallBounce', { kb: [-10, 3] });   // once per combo: a second one in the same juggle just knocks it down
  assert(flying && back && e.state === 'knockdown', 'a wall bounce flies flat into the wall and comes back toward the hero, into a juggle; once per combo');
}
// ---- Ground bounce -------------------------------------------------------------------------------------------------
{
  const { e, hit, run, log } = world();
  e.y = 3; e.onGround = false; e.state = 'launched'; e.juggle = 20;
  hit('groundBounce', { kb: [2, -10] });
  const down = e.state === 'groundBounce' && e.vy < 0;
  run(40, () => log.some(v => v.type === 'groundBounce'));
  assert(down && e.state === 'launched' && Math.abs(e.vy - REACT.groundVy) < 1.5 && e.groundBounced, `a spike drives it into the floor and it bounces back up at ${REACT.groundVy} m/s`);
}
// ---- Crumple --------------------------------------------------------------------------------------------------------
{
  const { e, hit, run } = world();
  hit('crumple');
  const crumpling = e.state === 'crumple' && !e.atk;
  const t = run(200, () => e.lying);
  assert(crumpling && e.lying && t >= REACT.crumple, `a crumple folds it in place for ${REACT.crumple} ticks, then it lies down`);
}
// ---- Spin-out --------------------------------------------------------------------------------------------------------
{
  const { S, e, hit, run } = world('trooper', 20);
  const other = createEnemy(S, 'trooper', 24, 0, { cd: 9999, onGround: true }); S.enemies.push(other);
  hit('spinOut', { kb: [10, 2] });
  const spinning = e.state === 'spinOut';
  run(60, () => other.state === 'knockdown');
  assert(spinning && other.state === 'knockdown' && other.hp < other.maxHp, 'a spin-out slides it away, and it bowls over the Sentinel it meets');
}
// ---- Stun ------------------------------------------------------------------------------------------------------------
{
  const { e, hit, run, log } = world();
  const bar = ENEMIES.trooper.poise * STUN.bar;
  let n = 0;
  while (e.state !== 'stun' && n < 30) { hit('flinch', { poise: 20, dmg: 0 }); run(e.hitstop + 1); n++; }
  const stunned = e.state === 'stun' && evs(log, 'stun') === 1;
  hit('flinch', { dmg: 0 });
  const kept = e.state === 'stun';
  const t = run(STUN.ticks + 20, () => e.state !== 'stun');
  assert(stunned && kept && t >= STUN.ticks - 2, `poise damage past ${bar} (the stun bar) stuns for ${STUN.ticks} ticks; light hits keep it dazed (stunned after ${n} hits)`);
  // Left alone, the bar drains
  const D = world(); D.e.stun = 60; D.run(STUN.calm + 40);
  assert(D.e.stun < 60, 'the stun bar drains when the Sentinel is left alone');
}
// ---- Bosses keep V2's reaction ---------------------------------------------------------------------------------------
{
  const { e, hit } = world('mk2', 20);
  hit('knockdown', { poise: 10 });
  assert(e.state !== 'knockdown' && e.state !== 'launched', 'the Mk-II ignores a hero\'s knockdown (bosses react as in V2: broken poise only)');
}
