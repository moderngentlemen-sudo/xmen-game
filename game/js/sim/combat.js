// Combat: hitboxes (one tick each, with an instance id so a swing lands once per target), damage to enemies
// (where adaptation, lifted targets and called targets apply), damage to heroes and to the kid (where Evade's
// perfect defence and Jean's shield apply), projectiles, and the props: crates Jean can throw, the cell door.
import { DT, GRAVITY, MAX_FALL, MERCY, HEROES, ENEMIES, ADAPT, GAUGE, TEAM, POWER_TYPES, HITSTOP, METER } from './config.js';
import { moveBody, rayCast, BOXES } from './level.js';
import { emit, newId, ent } from './world.js';
import { invulnerable, perfectWindow, perfectDefence, stagger, downPlayer, isDown } from './player.js';
import { HERO } from './heroes/index.js';
import { react, hittable } from './reactions.js';
import { streakHit, streakDealt, gainMeter, endStreak } from './combo.js';

export function spawnHitbox(S, h) { S.hitboxes.push(h); return h; }
const overlap = (h, x0, x1, y0, y1) => h.x0 < x1 && h.x1 > x0 && h.y0 < y1 && h.y1 > y0;
function remember(t, inst) { (t.hitInst ||= []).push(inst); if (t.hitInst.length > 8) t.hitInst.shift(); }
const seen = (t, inst) => !!(t.hitInst && t.hitInst.includes(inst));

export function resolveHitboxes(S) {
  for (const h of S.hitboxes) {
    if (h.team === 'p') {
      for (const e of S.enemies) {
        if (e.dead || !hittable(e) || seen(e, h.inst) || (h.only && h.only !== e.id) || (h.skip && h.skip === e.id)) continue;
        if (!overlap(h, e.x - e.w / 2, e.x + e.w / 2, e.y, e.y + e.h)) continue;
        remember(e, h.inst); hitEnemy(S, e, h);
      }
      for (const c of S.props) if (!c.broken && !c.heldBy && !seen(c, h.inst) && overlap(h, c.x - c.w / 2, c.x + c.w / 2, c.y, c.y + c.h)) { remember(c, h.inst); breakProp(S, c); }
      const D = S.mission.door;
      if (D && D.hp > 0 && !seen(D, h.inst) && overlap(h, D.x0, D.x1, D.y0, D.y1)) { remember(D, h.inst); hitDoor(S, D, h); }
    } else {
      for (const p of S.players) {
        if (isDown(p) || seen(p, h.inst) || !overlap(h, p.x - p.w / 2, p.x + p.w / 2, p.y, p.y + p.h)) continue;
        remember(p, h.inst); hurtPlayer(S, p, h);
      }
      const k = S.kid;
      if (k && kidExposed(k) && !seen(k, h.inst) && overlap(h, k.x - k.w / 2, k.x + k.w / 2, k.y, k.y + k.h)) { remember(k, h.inst); hurtKid(S, k, h); }
    }
  }
}
const kidExposed = k => k.state === 'follow' || k.state === 'cower' || k.state === 'run';

// ---- Damage to enemies ---------------------------------------------------------------------------------
// The hit's power type meets the Sentinels' counter-tech; team-ups ('team') are never countered. Hits on a
// target Jean is lifting, or on Cyclops's called target, are team hits: they land harder, bypass the counter
// and feed the X-Gauge.
export function hitEnemy(S, e, h) {
  const by = h.owner ? ent(S, h.owner) : null, isPlayer = by && by.kind === 'player';
  let mult = 1, power = h.power || 'plain', teamHit = power === 'team';
  if (e.liftT > 0 && h.owner !== e.liftBy && isPlayer) { mult *= TEAM.lift.bonus; teamHit = true; }
  if (S.called && S.called.id === e.id && isPlayer && by.id !== S.called.by) { mult *= HEROES.cyclops.call.bonus; teamHit = true; S.gauge = Math.min(GAUGE.max, S.gauge + GAUGE.called * h.dmg); }
  let resisted = false;
  if (!teamHit && POWER_TYPES.includes(power) && S.adapt.active === power) { mult *= ADAPT.counters[power].mult; resisted = true; }
  if (isPlayer) mult *= HERO[by.hero].dmgMult(by, h) * streakHit(S, by, e, h);   // the combo's damage scaling (combo.js)
  if (e.armour > 0 && !h.heavy && !teamHit) mult *= 0.6;   // armoured plate turns light hits
  const dmg = h.dmg * mult;
  e.hp -= dmg; e.flash = 6;
  // Hitstop: the target freezes, and on a melee hit so does the hero who landed it
  const stop = h.hitstop !== undefined ? h.hitstop : HITSTOP[h.heavy ? 'heavy' : 'light'];
  e.hitstop = Math.max(e.hitstop, stop);
  if (h.melee && isPlayer) by.hitstop = Math.max(by.hitstop || 0, stop);
  if (!teamHit && POWER_TYPES.includes(power)) S.adapt.log[power] += dmg;
  if (isPlayer) { HERO[by.hero].onDealt(S, by, e, dmg, h); streakDealt(by, dmg); }
  emit(S, 'hit', { id: e.id, by: h.owner, x: e.x, y: e.y + e.h * 0.6, dmg, power: teamHit ? 'team' : power, heavy: !!h.heavy, resisted, kind: h.kind || '' });
  if (e.hp <= 0) { killEnemy(S, e, h); return; }
  // Poise: enough of it breaks a guard (heavy hits break armour plates); then the reaction (reactions.js)
  const poise = (h.poise || 0) * (resisted ? 0.3 : 1);
  e.poise += poise;
  if (e.armour > 0 && h.heavy) { e.armour--; emit(S, 'armourBreak', { id: e.id, x: e.x, y: e.y + e.h * 0.7, left: e.armour }); }
  react(S, e, h, poise);
}
export function killEnemy(S, e, h) {
  e.hp = 0; e.dead = true; e.deathT = 0; e.atk = null; releaseToken(S, e);
  if (e.carry) dropCarried(S, e);
  // A Hunter's mark dies with it
  for (const p of S.players) if (p.markedBy === e.id) { p.markedBy = 0; emit(S, 'unmarked', { id: p.id }); }
  emit(S, 'kill', { id: e.id, unit: e.type, x: e.x, y: e.y + e.h * 0.5, by: h ? h.owner : 0, boss: !!ENEMIES[e.type].boss });
}
export function releaseToken(S, e) {
  if (e.token) { S.director[e.token] = Math.max(0, S.director[e.token] - 1); e.token = null; }
}
// A Collector that is staggered or destroyed lets go of whoever it was carrying
export function dropCarried(S, e) {
  const who = ent(S, e.carry); e.carry = 0;
  if (!who) return;
  if (who === S.kid) { who.state = 'cower'; who.st = 0; who.carriedBy = 0; who.vy = 5; who.onGround = false; S.gauge = Math.min(GAUGE.max, S.gauge + GAUGE.rescue); emit(S, 'kidFreed', { x: who.x, y: who.y }); }
  else { who.state = 'downed'; who.heldBy = 0; who.vy = 4; }
}

// ---- Damage to heroes and the kid ----------------------------------------------------------------------
export function hurtPlayer(S, p, h) {
  const src = h.owner ? ent(S, h.owner) : null;
  if (perfectWindow(p) && !h.unblockable) { perfectDefence(S, p, src); return; }
  if (invulnerable(p)) return;
  if (shielded(S, p.x, p.y + p.h / 2) && h.proj) { emit(S, 'shieldBlock', { x: p.x, y: p.y + 1 }); return; }
  const mod = HERO[p.hero];
  const dmg = h.dmg * (p.markedBy ? ENEMIES.hunter.mark.mult : 1) * mod.takenMult(p);
  p.hp -= dmg; p.mercy = h.heavy ? MERCY : 40; p.lastHurtT = 0;
  // Hitstop: a Sentinel's blow freezes it and the hero together; a shot freezes only the hero
  const stop = HITSTOP[h.heavy ? 'heavy' : 'light'];
  p.hitstop = Math.max(p.hitstop || 0, stop);
  if (src && src.kind === 'enemy' && !h.proj) src.hitstop = Math.max(src.hitstop, stop);
  mod.onHurt(S, p, dmg, h);
  gainMeter(p, dmg * METER.taken); endStreak(S, p);   // being hit ends the hero's combo, and feeds their meter
  emit(S, 'playerHit', { id: p.id, x: p.x, y: p.y + p.h * 0.6, dmg, heavy: !!h.heavy, marked: !!p.markedBy });
  if (p.hp <= 0) { downPlayer(S, p); return; }
  if (!mod.noStagger(p)) stagger(S, p, h.kb || [0, 3], h.heavy ? 26 : 16);
}
export function hurtKid(S, k, h) {
  if (k.mercy > 0) return;
  if (shielded(S, k.x, k.y + 0.6) && h.proj) { emit(S, 'shieldBlock', { x: k.x, y: k.y + 0.6 }); return; }
  k.hp -= h.dmg; k.mercy = 50;
  emit(S, 'kidHit', { x: k.x, y: k.y + 0.6, dmg: h.dmg });
  if (k.hp <= 0) { k.hp = 0; k.state = 'downed'; k.st = 0; k.revive = 0; emit(S, 'kidDown', { x: k.x, y: k.y }); }
  else { k.vx = (h.kb ? h.kb[0] : 0) * 0.5; k.vy = 4; k.onGround = false; }
}
// Jean's TK Shield: a bubble where enemy shots stop
export function shielded(S, x, y) {
  for (const p of S.players) if (p.shieldT > 0 && Math.hypot(x - p.shieldX, y - p.shieldY) < HEROES.jean.shield.r) return true;
  for (const a of S.assists) if (a.shieldT > 0 && Math.hypot(x - a.shieldX, y - a.shieldY) < HEROES.jean.shield.r) return true;
  return false;
}

// ---- Projectiles ---------------------------------------------------------------------------------------------
// { team, owner, x, y, vx, vy, r, dmg, poise, kind, power, ttl, gravity?, pierce?, heldBy? }
export function spawnProjectile(S, o) {
  const pr = { id: newId(S), hit: [], gravity: 0, pierce: 0, heldBy: 0, poise: 0, power: 'plain', ...o };
  S.projectiles.push(pr); return pr;
}
export function updateProjectiles(S) {
  for (const pr of S.projectiles) {
    if (pr.dead) continue;
    if (pr.heldBy) continue;   // Jean has it in her grip (moved by her module)
    if (--pr.ttl <= 0) { pr.dead = true; continue; }
    pr.vy -= pr.gravity * DT;
    const sp = Math.hypot(pr.vx, pr.vy), stepLen = sp * DT;
    if (stepLen > 1e-6) {
      const w = rayCast(pr.x, pr.y, pr.vx / sp, pr.vy / sp, stepLen + pr.r * 0.5, S.gates);
      if (w.wall) { pr.x = w.x; pr.y = w.y; pr.dead = true; emit(S, 'projWall', { x: w.x, y: w.y, kind: pr.kind, team: pr.team }); continue; }
    }
    pr.x += pr.vx * DT; pr.y += pr.vy * DT;
    const targets = pr.team === 'p' ? S.enemies : [...S.players, ...(S.kid ? [S.kid] : [])];
    for (const t of targets) {
      if (pr.dead || pr.hit.includes(t.id)) continue;
      if (t.kind === 'enemy' && (t.dead || !hittable(t))) continue;
      if (t.kind === 'player' && isDown(t)) continue;
      if (t === S.kid && !kidExposed(t)) continue;
      if (Math.abs(pr.x - t.x) > t.w / 2 + pr.r || pr.y < t.y - pr.r || pr.y > t.y + t.h + pr.r) continue;
      pr.hit.push(t.id);
      const h = { owner: pr.owner, team: pr.team, inst: pr.id, dmg: pr.dmg, poise: pr.poise, power: pr.power, kb: [Math.sign(pr.vx) * 5, 3], proj: true, kind: pr.kind, heavy: !!pr.heavy };
      if (pr.team === 'p') hitEnemy(S, t, h); else if (t === S.kid) hurtKid(S, t, h); else hurtPlayer(S, t, h);
      if (pr.pierce-- <= 0) pr.dead = true;
    }
    // Enemy shots stop in Jean's shield
    if (!pr.dead && pr.team === 'e' && shielded(S, pr.x, pr.y)) { pr.dead = true; emit(S, 'shieldBlock', { x: pr.x, y: pr.y }); }
  }
  S.projectiles = S.projectiles.filter(pr => !pr.dead);
}

// ---- Props: crates and the cell door ----------------------------------------------------------------------
export function makeCrate(S, x, y) { return { kind: 'crate', id: newId(S), x, y, vx: 0, vy: 0, w: 0.9, h: 0.9, heldBy: 0, thrownBy: 0, thrown: false, onGround: true, broken: false }; }
export function updateProps(S) {
  for (const c of S.props) {
    if (c.broken || c.heldBy) continue;
    c.vy = Math.max(c.vy - GRAVITY * DT, -MAX_FALL);
    const vx = c.vx;
    moveBody(c, DT, S.gates);
    if (c.onGround && !c.thrown) c.vx *= 0.8;
    if (c.thrown) {
      // A thrown crate is a missile: it smashes into the first enemy (and splashes those near) or a wall
      const thrower = ent(S, c.thrownBy);
      for (const e of S.enemies) {
        if (e.dead || Math.abs(e.x - c.x) > e.w / 2 + 0.45 || c.y > e.y + e.h || c.y + c.h < e.y) continue;
        smash(S, c, thrower); break;
      }
      if (!c.broken && (c.hitWall || (c.onGround && Math.abs(vx) > 4) || c.hitCeil)) smash(S, c, thrower);
    }
  }
  S.props = S.props.filter(c => !c.broken);
}
function smash(S, c, thrower) {
  const T = HEROES.jean.tk, inst = newId(S);
  spawnHitbox(S, { owner: thrower ? thrower.id : 0, team: 'p', inst, power: c.power || 'tk', x0: c.x - T.splash, x1: c.x + T.splash, y0: c.y - 0.6, y1: c.y + c.h + 0.8,
    dmg: T.dmg + (c.bonus || 0), poise: T.poise, kb: [Math.sign(c.vx || 1) * 9, 6], heavy: true, kind: 'crate' });
  breakProp(S, c);
}
export function breakProp(S, c) { c.broken = true; emit(S, 'crateBreak', { x: c.x, y: c.y + 0.45 }); }
function hitDoor(S, D, h) {
  D.hp -= h.dmg; emit(S, 'doorHit', { x: (D.x0 + D.x1) / 2, y: 1.6, hp: D.hp });
  if (D.hp <= 0) { S.gates.cell = false; emit(S, 'doorBroken', { x: (D.x0 + D.x1) / 2, y: 1.6 }); }
}
