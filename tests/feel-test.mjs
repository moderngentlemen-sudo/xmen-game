// Phase 1's feel rules, one section per step as they land (HANDOFF-EXPANSION.md, section 4): hitstop in the
// simulation, the charged heavy and the step, reactions, combo rules and the meter.
import { createWorld, step } from '../game/js/sim/world.js';
import { BTN, HITSTOP, SCALING, STREAK, METER, STYLE } from '../game/js/sim/config.js';
import { comboScale, STYLE_RANKS } from '../game/js/sim/combo.js';
import { setHero } from '../game/js/sim/player.js';
import { createEnemy } from '../game/js/sim/enemies.js';
import { spawnProjectile, hitEnemy, hurtPlayer } from '../game/js/sim/combat.js';
import { newId } from '../game/js/sim/world.js';

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

// ---- 1.5 Combo rules and the meter --------------------------------------------------------------------------------
{
  const s = n => comboScale(n, 0);
  assert(s(1) === 1 && s(3) === 1 && Math.abs(s(4) - 0.9) < 1e-9 && Math.abs(s(6) - 0.7) < 1e-9 && s(20) === SCALING.floor && Math.abs(comboScale(4, 1) - 0.8) < 1e-9 && comboScale(2, 9) === SCALING.floor,
    'scaling: full for hits 1 to 3, then 10% less a hit to a 40% floor; a repeated move costs 10% more per earlier use');
}
{
  // Hits straight through hitEnemy on a sturdy trooper: what the combo counts and how it scales
  const { S, p, e, run, log } = arena('cyclops');
  e.hp = e.maxHp = 9999;
  const hit = (move, o = {}) => { const hp = e.hp; hitEnemy(S, e, { owner: p.id, team: 'p', inst: newId(S), power: 'optic', dmg: 10, poise: 0, kb: [0, 0], move, ...o }); log.push(...S.events); return hp - e.hp; };
  const d = ['g1', 'g2', 'g3', 'up', 'g1'].map(m => hit(m));
  // the fifth hit is g1 again: 0.8 for the fifth hit, 0.1 less for the repeat
  assert(d[0] === 10 && d[2] === 10 && Math.abs(d[3] - 9) < 1e-9 && Math.abs(d[4] - 7) < 1e-9 && p.streak.n === 5,
    `the combo counts its hits and scales them (${d.map(x => +x.toFixed(2)).join(', ')})`);
  // One swing catching two Sentinels is one hit of the combo
  const f = createEnemy(S, 'trooper', e.x + 0.3, 0); f.hp = f.maxHp = 9999; S.enemies.push(f);
  const inst = newId(S);
  for (const t of [e, f]) hitEnemy(S, t, { owner: p.id, team: 'p', inst, power: 'optic', dmg: 10, poise: 0, kb: [0, 0], move: 'g2' });
  assert(p.streak.n === 6, 'one move catching two Sentinels counts once');
  const style = p.streak.style, rank = p.streak.rank;
  run({}, STREAK.gap + 2);
  const ended = log.find(v => v.type === 'comboEnd');
  assert(ended && ended.n === 6 && p.streak.n === 0 && S.mission.stats.bestCombo === 6, `a combo ends ${STREAK.gap} ticks after its last hit (comboEnd: ${ended && ended.n} hits, rank ${ended && ended.rank})`);
  assert(style === 6 * STYLE.hit + 4 * STYLE.fresh && STYLE_RANKS[rank] === 'C', `style: points for every hit, more for fresh moves (${style}, rank ${STYLE_RANKS[rank]})`);
}
{
  // The meter: damage dealt (more at a higher rank) and taken fill it, to three bars; being hit ends the combo
  const { S, p, e } = arena('wolverine');
  e.hp = e.maxHp = 9999;
  hitEnemy(S, e, { owner: p.id, team: 'p', inst: newId(S), power: 'claws', dmg: 10, poise: 0, kb: [0, 0], move: 'g1' });
  const dealt = p.meter;
  p.mercy = 0; p.hitstop = 0;
  hurtPlayer(S, p, { owner: e.id, team: 'e', inst: newId(S), dmg: 10, kb: [0, 0] });
  const taken = p.meter - dealt;
  for (let i = 0; i < 200; i++) { p.streak.inst = 0; hitEnemy(S, e, { owner: p.id, team: 'p', inst: newId(S), power: 'claws', dmg: 10, poise: 0, kb: [0, 0], move: 'g' + i }); }
  assert(Math.abs(dealt - 10 * METER.dealt) < 1e-9 && Math.abs(taken - 10 * METER.taken * 1.0) < 1.5 && p.meter === METER.max && METER.max === 3 * METER.bar,
    `the meter: ${METER.dealt} per damage dealt, ${METER.taken} per damage taken, capped at ${METER.max} (three bars)`);
}
{
  const { S, p, e } = arena('jean');
  e.hp = e.maxHp = 9999;
  hitEnemy(S, e, { owner: p.id, team: 'p', inst: newId(S), power: 'tk', dmg: 5, poise: 0, kb: [0, 0], move: 'g1' });
  hitEnemy(S, e, { owner: p.id, team: 'p', inst: newId(S), power: 'tk', dmg: 5, poise: 0, kb: [0, 0], move: 'g2' });
  const n = p.streak.n; p.mercy = 0;
  hurtPlayer(S, p, { owner: e.id, team: 'e', inst: newId(S), dmg: 5, kb: [0, 0] });
  assert(n === 2 && p.streak.n === 0, 'being hit ends the hero\'s combo');
}
