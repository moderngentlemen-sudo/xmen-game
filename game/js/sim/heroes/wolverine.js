// Wolverine, the berserker. Rage builds from damage dealt and taken. His healing factor spends it: unhurt
// for a moment, he turns rage into health. Full rage is the other way to spend it: the Signature sends him
// berserk (faster, harder, every hit heals him, no stagger, no guard: he takes more); it is ready from 80 rage,
// and the fuller the rage the longer it lasts. Power is the Drill Claw:
// hold to coil through three tiers, let go to lunge along the aim (eight ways), drilling through everything
// in line, once per jump in the air. He climbs walls (hold toward one with jump held) and pounces off them.
import { DT, HEROES, TEAM } from '../config.js';
import { moveBody } from '../level.js';
import { emit, newId } from '../world.js';
import { physics, setState } from '../player.js';
import { spawnHitbox, spawnProjectile } from '../combat.js';

const W = () => HEROES.wolverine;
const snap8 = (x, y) => { const a = Math.round(Math.atan2(y, x) / (Math.PI / 4)) * (Math.PI / 4); return [Math.round(Math.cos(a) * 1e6) / 1e6, Math.round(Math.sin(a) * 1e6) / 1e6]; };

export default {
  init(p) { p.rage = p.rage || 0; p.berserkT = 0; p.drillT = 0; p.drillCd = 0; p.airDrill = true; p.drill = null; p.climbing = false; },

  tick(S, p) {
    const R = W().rage;
    if (p.drillCd > 0) p.drillCd--;
    if (p.onGround) p.airDrill = true;
    if (p.berserkT > 0 && --p.berserkT === 0) emit(S, 'berserkEnd', { id: p.id });
    // Healing factor: unhurt for a moment, rage becomes health
    if (p.berserkT === 0 && p.lastHurtT >= R.healDelay && p.hp < p.maxHp && p.rage > 0 && p.state !== 'downed') {
      const heal = Math.min(R.healRate, p.maxHp - p.hp, p.rage / R.healCost);
      p.hp += heal; p.rage -= heal * R.healCost;
      if (!p.healing) { p.healing = true; emit(S, 'healing', { id: p.id }); }
    } else p.healing = false;
  },

  power(S, p, cmd, E) {
    const D = W().drill, holding = (p.held & 2) !== 0;
    if (p.drillT === 0 && holding && p.buf.power <= 8 && p.drillCd === 0) { p.drillT = 1; p.buf.power = 99; }
    if (p.drillT > 0) {
      if (holding) {
        p.drillT++;
        if (p.drillT === D.tiers[1] || p.drillT === D.tiers[2]) emit(S, 'drillLevel', { id: p.id, level: p.drillT === D.tiers[1] ? 2 : 3, x: p.x, y: p.y + 1 });
        if (Math.abs(p.aimX) > 0.2) p.facing = p.aimX > 0 ? 1 : -1;
        physics(S, p, W().run * 0.35, cmd, E, false);
        return true;
      }
      const tier = p.drillT >= D.tiers[2] ? 2 : p.drillT >= D.tiers[1] ? 1 : 0;
      p.drillT = 0;
      if (!p.onGround && !p.airDrill) { emit(S, 'drillFizzle', { id: p.id }); return false; }
      lunge(S, p, tier);
      return true;
    }
    return false;
  },

  sig(S, p) {
    const R = W().rage;
    if (p.berserkT > 0) return;
    if (p.rage < R.ready) { emit(S, 'sigWait', { id: p.id, rage: p.rage }); return; }
    p.berserkT = Math.round(W().berserk.ticks * p.rage / R.max); p.rage = 0;   // fuller rage, longer berserk
    emit(S, 'berserk', { id: p.id, x: p.x, y: p.y + p.h * 0.6 });
  },

  states: {
    // The lunge: along the snapped aim, gravity off, a drilling hitbox each tick
    drill(S, p, cmd, E) {
      const L = p.drill, D = W().drill;
      L.t++;
      p.vx = L.dx * D.speed[L.tier]; p.vy = L.dy * D.speed[L.tier];
      moveBody(p, DT, S.gates);
      const r = 0.9 + 0.2 * L.tier;
      spawnHitbox(S, { owner: p.id, team: 'p', inst: L.inst, power: p.edge ? 'team' : 'claws', x0: p.x - r + L.dx * 0.5, x1: p.x + r + L.dx * 0.5, y0: p.y + 0.2 + L.dy * 0.4, y1: p.y + p.h + L.dy * 0.4,
        dmg: D.dmg[L.tier] * (p.edge ? 1.3 : 1), poise: D.poise[L.tier], kb: [L.dx * 10, 4 + L.dy * 4], heavy: L.tier >= 1, kind: 'drill' });
      if (p.hitWall || p.hitCeil || (p.onGround && L.dy < -0.5) || L.t >= D.ticks[L.tier]) {
        p.drill = null; p.vx *= 0.35; p.vy = Math.max(p.vy * 0.3, 0);
        setState(p, 'normal');
        emit(S, 'drillEnd', { id: p.id, x: p.x, y: p.y, wall: !!(p.hitWall || p.hitCeil) });
      }
    },
  },

  // Climbing: hold toward a wall with jump held to go up it
  air(S, p, cmd) {
    const C = W().climb;
    p.climbing = !p.onGround && p.wallDir !== 0 && Math.sign(p.mx) === p.wallDir && (p.held & 4) !== 0;
    if (p.climbing) { p.vy = C.speed; p.jumpsLeft = W().airJumps; return true; }
    return false;
  },
  // Off a wall he pounces: a long, low leap
  wallJump(S, p) {
    const P = W().climb.pounce;
    p.vx = -p.wallDir * P.vx; p.vy = P.vy; p.facing = -p.wallDir; p.wallLock = 10; p.jumpsLeft = W().airJumps;
    emit(S, 'pounce', { id: p.id, x: p.x, y: p.y, dir: p.facing });
    return true;
  },

  speedMult: p => (p.berserkT > 0 ? 1.2 : 1),
  attackSpeed: p => (p.berserkT > 0 ? W().berserk.speed : 1),
  dmgMult: p => (p.berserkT > 0 ? W().berserk.dmg : 1),
  takenMult: p => (p.berserkT > 0 ? W().berserk.taken : 1),
  noStagger: p => p.berserkT > 0,
  onDealt(S, p, e, dmg, h) {
    const R = W().rage;
    if (p.berserkT > 0) p.hp = Math.min(p.maxHp, p.hp + dmg * W().berserk.steal);
    else p.rage = Math.min(R.max, p.rage + dmg * R.dealt);
    // Optic edge: Cyclops charged his claws; claw strikes throw an optic shockwave forward
    if (p.edge && p.edge.strikes > 0 && h.kind !== 'wave' && h.inst !== p.edge.lastInst) {
      p.edge.lastInst = h.inst; p.edge.strikes--;
      const V = TEAM.edge.wave;
      spawnProjectile(S, { team: 'p', owner: p.id, x: p.x + p.facing * 0.6, y: p.y + p.h * 0.55, vx: p.facing * V.speed, vy: 0, r: 0.45, dmg: V.dmg, poise: V.poise, kind: 'wave', power: 'team', ttl: V.ttl, pierce: 9 });
      emit(S, 'edgeWave', { id: p.id, x: p.x, y: p.y + p.h * 0.55, dir: p.facing });
      if (p.edge.strikes <= 0) p.edge = null;
    }
  },
  onHurt(S, p, dmg) { if (p.berserkT === 0) p.rage = Math.min(W().rage.max, p.rage + dmg * W().rage.taken); },
  cancel(S, p) { p.drillT = 0; if (p.state === 'drill') p.drill = null; },
};

function lunge(S, p, tier) {
  const D = W().drill;
  let dx = p.aimX, dy = p.aimY;
  if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) { dx = p.facing; dy = 0; }
  [dx, dy] = snap8(dx, dy);
  if (p.onGround && dy < 0) dy = 0;   // no drilling into the floor
  const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
  if (Math.abs(dx) > 0.1) p.facing = dx > 0 ? 1 : -1;
  if (!p.onGround) p.airDrill = false;
  p.drill = { tier, dx, dy, t: 0, inst: newId(S) };
  p.drillCd = D.cd; p.onGround = false;
  setState(p, 'drill');
  emit(S, 'drill', { id: p.id, tier, x: p.x, y: p.y + p.h * 0.5, dx, dy });
}
