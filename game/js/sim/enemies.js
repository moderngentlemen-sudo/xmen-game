// The Sentinel program's units, by job rather than by shape:
//   trooper    closes in and swings (standard) or slams (heavy)
//   gunner     keeps its distance and fires bursts (standard shots: evade them, or Jean catches them)
//   hunter     hovers out of reach and locks a beam on one hero; once it lands, that hero is MARKED (takes
//              more damage) until the Hunter falls
//   collector  goes for the kid, grabs her (heavy telegraph) and carries her toward an exit; stagger or destroy
//              it to make it let go. If it gets out with her, the mission fails back to the checkpoint.
//   mk2        the Mk-II Sentinel at the hangar: a stomp (jump it), a sweep (heavy), a floor-raking eye beam
// Shared states: held (in Jean's grip), thrown (by her), lifted (Lift and hold), and the hit reactions
// (reactions.js: stagger, launched, knockdown, wall and ground bounces, crumple, spin-out, stun, flip-out; a flinch
// is a timer, flinchT, that pauses the brain).
// A director caps how many attack at once, so a crowd still reads.
import { DT, GRAVITY, MAX_FALL, ENEMIES, HEROES, TEAM, STUN } from './config.js';
import { updateReaction } from './reactions.js';
import { moveBody, rayCast, groundBelow, segmentBlocked, EXITS } from './level.js';
import { rand, randRange } from './rng.js';
import { emit, newId, ent } from './world.js';
import { spawnHitbox, spawnProjectile, hitEnemy, releaseToken, dropCarried, killEnemy } from './combat.js';
import { isDown } from './player.js';

export function createEnemy(S, type, x, y, extra = {}) {
  const T = ENEMIES[type];
  return { kind: 'enemy', id: newId(S), type, x, y, vx: 0, vy: 0, w: T.w, h: T.h, facing: -1, onGround: false,
    hp: T.hp, maxHp: T.hp, poise: 0, armour: T.armour || 0, state: 'idle', st: 0, atk: null, cd: 30 + Math.floor(rand(S) * 40),
    target: 0, token: null, flash: 0, hitstop: 0, dead: false, deathT: 0, liftT: 0, liftBy: 0, heldBy: 0, thrownBy: 0,
    slowT: 0, carry: 0, staggerT: 0, phase: 1, hitInst: [],
    juggle: 0, stun: 0, calmT: 0, flinchT: 0, flipT: 0, lying: false, otgUsed: false, wallBounced: false, groundBounced: false, ...extra };
}

const caps = S => ({ melee: Math.min(3, 1 + S.players.length), ranged: 2 });
function takeToken(S, e, kind) {
  if (e.token) return true;
  if (S.director[kind] >= caps(S)[kind]) return false;
  S.director[kind]++; e.token = kind; return true;
}
function telegraph(S, e, cat, wind, kind) {
  emit(S, 'telegraph', { id: e.id, cat, wind, kind, x: e.x, y: e.y + e.h * 0.85 });
}
function setE(e, s) { e.state = s; e.st = 0; }

// Who to go for: the nearest hero standing (Collectors want the kid)
function nearestHero(S, e, range = 40) {
  let best = null, bd = range;
  for (const p of S.players) { if (isDown(p) || p.state === 'held') continue; const d = Math.abs(p.x - e.x) + Math.abs(p.y - e.y) * 0.5; if (d < bd) { bd = d; best = p; } }
  return best;
}
const kidFree = k => k && (k.state === 'follow' || k.state === 'cower' || k.state === 'run' || k.state === 'downed');

export function updateEnemies(S) {
  for (const e of S.enemies) {
    if (e.dead) { e.deathT++; continue; }
    if (e.flash > 0) e.flash--;
    if (e.hitstop > 0) { e.hitstop--; continue; }
    if (e.slowT > 0) { e.slowT--; if (e.slowT % 2) continue; }   // a perfect defence slows the attacker
    // The stun bar drains once the Sentinel is left alone
    if (++e.calmT > STUN.calm && e.stun > 0) e.stun = Math.max(0, e.stun - STUN.drain);
    // A flinch pauses the brain (and its attack's clock) for a moment
    if (e.flinchT > 0) { e.flinchT--; physics(S, e, 0.8); continue; }
    e.st++;
    if (e.cd > 0) e.cd--;
    if (e.dropNow) { e.dropNow = false; if (e.carry) dropCarried(S, e); }
    if (e.liftT > 0) { lifted(S, e); continue; }
    switch (e.state) {
      case 'held': held(S, e); continue;
      case 'thrown': thrown(S, e); continue;
    }
    if (updateReaction(S, e, physics)) continue;   // stagger, launched and the other reactions (reactions.js)
    AI[e.type](S, e);
  }
  S.enemies = S.enemies.filter(e => !e.dead || e.deathT < 60);
}

const FALLING = ['stagger', 'launched', 'thrown', 'knockdown', 'wallBounce', 'groundBounce', 'crumple', 'spinOut', 'stun', 'flipOut'];
function physics(S, e, friction = 1) {
  const T = ENEMIES[e.type];
  // Juggled Sentinels fall faster as their juggle weight builds (reactions.js); fliers fall only when knocked about
  if (!T.flier || FALLING.includes(e.state)) e.vy = Math.max(e.vy - GRAVITY * DT * (e.state === 'launched' ? 0.8 * (1 + e.juggle / 100) : 1), -MAX_FALL);
  if (e.onGround && friction < 1) e.vx *= friction;
  const want = e.vx;
  if (e.dropT > 0) e.dropT--;
  moveBody(e, DT, S.gates);
  // Walkers hop over knee-high obstacles in their way (vents, barriers, crate stacks)
  if (e.hitWall && e.onGround && Math.abs(want) > 0.5 && !T.flier && !T.boss && e.state === 'idle') { e.vy = 12.5; e.onGround = false; }
}

// Lift and hold: floated up and pinned until it runs out (team.js starts it)
function lifted(S, e) {
  e.liftT--;
  const ground = groundBelow(e.x, e.y + 0.5, S.gates), ty = (ground > -Infinity ? ground : e.y) + TEAM.lift.height;
  e.vy = (ty - e.y) * 5; e.vx *= 0.85; e.atk = null; releaseToken(S, e);
  moveBody(e, DT, S.gates);
  if (e.liftT <= 0) { e.liftBy = 0; e.state = 'stagger'; e.st = 0; e.staggerT = 20; emit(S, 'liftEnd', { id: e.id }); }
}
// In Jean's grip: she moves it; if she lets go without a throw it staggers
function held(S, e) {
  const j = ent(S, e.heldBy);
  releaseToken(S, e);
  if (!j || !j.tk || j.tk.id !== e.id) { e.heldBy = 0; e.state = 'stagger'; e.st = 0; e.staggerT = 16; }
}
// Thrown by Jean: a missile. It hits the first enemy it meets (both are hurt) or the wall (it is hurt).
function thrown(S, e) {
  const J = HEROES.jean.tk, by = e.thrownBy;
  if (e.homing) { const t = nearestOther(S, e); if (t) e.vx += Math.sign(t.x - e.x) * 30 * DT; }
  e.vy = Math.max(e.vy - GRAVITY * DT * 0.35, -MAX_FALL);
  moveBody(e, DT, S.gates);
  const power = e.homing ? 'team' : 'tk';
  for (const o of S.enemies) {
    if (o === e || o.dead || o.state === 'thrown') continue;
    if (Math.abs(o.x - e.x) > (o.w + e.w) / 2 || e.y > o.y + o.h || e.y + e.h < o.y) continue;
    const inst = newId(S);
    hitEnemy(S, o, { owner: by, team: 'p', inst, power, dmg: J.dmg, poise: J.poise, kb: [Math.sign(e.vx) * 9, 6], heavy: true, kind: 'thrown' });
    impact(S, e, by, power); return;
  }
  if (e.hitWall || e.hitCeil || (e.onGround && e.st > 4) || e.st > 70) impact(S, e, by, power);
}
function impact(S, e, by, power) {
  const J = HEROES.jean.tk;
  if (!e.dead) hitEnemy(S, e, { owner: by, team: 'p', inst: newId(S), power, dmg: J.splashDmg + 2, poise: 999, kb: [0, 3], heavy: true, kind: 'thrown' });
  if (!e.dead) { e.state = 'stagger'; e.st = 0; e.staggerT = 40; e.vx *= 0.2; }
  e.homing = false;
  emit(S, 'thrownImpact', { id: e.id, x: e.x, y: e.y + e.h / 2 });
}
function nearestOther(S, e) { let b = null, bd = 14; for (const o of S.enemies) { if (o === e || o.dead) continue; const d = Math.abs(o.x - e.x); if (d < bd) { bd = d; b = o; } } return b; }

// ---- Unit brains ----------------------------------------------------------------------------------------------
const AI = {
  trooper(S, e) {
    const T = ENEMIES.trooper, p = targetFor(S, e);
    if (e.state === 'windup' || e.state === 'attack' || e.state === 'recover') { meleeAttack(S, e, T[e.atk.kind]); return; }
    if (!p) { e.vx *= 0.8; physics(S, e); return; }
    const dx = p.x - e.x; e.facing = dx >= 0 ? 1 : -1;
    dropToward(e, p);
    const reach = T.swing.reach + p.w / 2;
    if (Math.abs(dx) > reach * 0.85) e.vx = e.facing * T.speed; else e.vx *= 0.6;
    if (Math.abs(dx) < reach && Math.abs(p.y - e.y) < 1.6 && e.cd === 0 && takeToken(S, e, 'melee')) {
      const kind = rand(S) < 0.3 ? 'slam' : 'swing';
      e.atk = { kind, inst: newId(S) }; setE(e, 'windup');
      telegraph(S, e, kind === 'slam' ? 'heavy' : 'standard', T[kind].wind, kind);
    }
    physics(S, e);
  },
  gunner(S, e) {
    const T = ENEMIES.gunner, p = targetFor(S, e);
    if (e.state === 'windup' || e.state === 'burst') { gunnerBurst(S, e, T); return; }
    if (e.state === 'recover') { e.vx *= 0.8; physics(S, e); if (e.st >= T.burst.rec) { releaseToken(S, e); setE(e, 'idle'); e.cd = 70 + Math.floor(rand(S) * 60); } return; }
    if (!p) { e.vx *= 0.8; physics(S, e); return; }
    const dx = p.x - e.x, d = Math.abs(dx); e.facing = dx >= 0 ? 1 : -1;
    dropToward(e, p);
    e.vx = d < T.keep[0] ? -e.facing * T.speed : d > T.keep[1] ? e.facing * T.speed : e.vx * 0.7;
    if (d < 18 && e.cd === 0 && !segmentBlocked(e.x, e.y + 1.5, p.x, p.y + 1, S.gates) && takeToken(S, e, 'ranged')) {
      e.atk = { kind: 'burst', inst: newId(S), n: 0, target: p.id }; setE(e, 'windup');
      telegraph(S, e, 'standard', T.burst.wind, 'burst');
    }
    physics(S, e);
  },
  hunter(S, e) {
    const T = ENEMIES.hunter, M = T.mark;
    // Hover high, at a distance from its quarry
    const prey = ent(S, e.target);
    const quarry = prey && !isDown(prey) ? prey : pickPrey(S, e);
    if (quarry) e.target = quarry.id;
    const ground = groundBelow(e.x, e.y + 1, S.gates), hoverY = Math.min(7, Math.max(ground > -Infinity ? ground : 0, quarry ? quarry.y : 0) + 4.6);   // below the gates' tops
    let side = quarry ? (e.x >= quarry.x ? 1 : -1) : 1;
    const room = S.mission && S.mission.x0 !== undefined ? [S.mission.x0 + 1.5, S.mission.x1 - 1.5] : [-Infinity, Infinity];
    const inRoom = x => x > room[0] && x < room[1];
    if (quarry && !inRoom(quarry.x + side * 9) && inRoom(quarry.x - side * 9)) side = -side;   // the other side, inside the room
    const tx = quarry ? Math.max(room[0], Math.min(room[1], quarry.x + side * 9)) : e.x;
    e.vx += Math.sign(tx - e.x) * Math.min(Math.abs(tx - e.x), 1) * 6 * DT * 6; e.vx *= 0.9;
    e.vy = (hoverY - e.y) * 2.4;
    if (quarry) e.facing = quarry.x >= e.x ? 1 : -1;
    moveBody(e, DT, S.gates);
    if (!quarry) return;
    const seen = !segmentBlocked(e.x, e.y + e.h * 0.6, quarry.x, quarry.y + quarry.h * 0.6, S.gates) && Math.abs(quarry.x - e.x) < M.range;
    if (e.state === 'aim') {
      if (!seen) { if (++e.lostT > 30) { setE(e, 'idle'); e.cd = 40; emit(S, 'markLost', { id: e.id }); } return; }
      e.lostT = 0;
      if (e.st >= M.aim) {
        quarry.markedBy = e.id; setE(e, 'idle'); e.cd = M.cd;
        emit(S, 'marked', { id: quarry.id, by: e.id, x: quarry.x, y: quarry.y + quarry.h });
      }
      return;
    }
    // Marked already: it pelts its quarry with weak shots
    if (quarry.markedBy === e.id) {
      if (e.cd === 0 && seen) {
        const dx = quarry.x - e.x, dy = quarry.y + 1 - (e.y + 1), m = Math.hypot(dx, dy) || 1;
        spawnProjectile(S, { team: 'e', owner: e.id, x: e.x + e.facing * 0.5, y: e.y + 1, vx: dx / m * 13, vy: dy / m * 13, r: 0.16, dmg: 4, kind: 'bolt', ttl: 160 });
        emit(S, 'enemyShot', { id: e.id, x: e.x, y: e.y + 1 }); e.cd = 110;
      }
      return;
    }
    if (e.cd === 0 && seen && !quarry.markedBy) { setE(e, 'aim'); e.lostT = 0; telegraph(S, e, 'unblockable', M.aim, 'mark'); emit(S, 'markAim', { id: e.id, target: quarry.id }); }
  },
  collector(S, e) {
    const T = ENEMIES.collector, G = T.grab, k = S.kid;
    if (e.state === 'carry') { carry(S, e); return; }
    if (e.state === 'windup') {
      e.vx *= 0.7; physics(S, e);
      if (e.st >= G.wind) {
        // The grab: it closes on whatever it was reaching for, if it is still in reach
        if (k && kidFree(k) && Math.abs(k.x - (e.x + e.facing * 0.7)) < G.reach && Math.abs(k.y - e.y) < 1.4) {
          e.carry = -1; k.state = 'carried'; k.carriedBy = e.id; k.st = 0;
          setE(e, 'carry'); releaseToken(S, e);
          emit(S, 'kidGrabbed', { id: e.id, x: k.x, y: k.y });
        } else { setE(e, 'idle'); releaseToken(S, e); e.cd = 40; emit(S, 'grabMiss', { id: e.id }); }
      }
      return;
    }
    const goal = kidFree(k) ? k : nearestHero(S, e);
    if (!goal) { e.vx *= 0.8; physics(S, e); return; }
    dropToward(e, goal);
    const dx = goal.x - e.x; e.facing = dx >= 0 ? 1 : -1;
    e.vx = Math.abs(dx) > 1.0 ? e.facing * T.speed : e.vx * 0.6;
    if (goal === k && Math.abs(dx) < G.reach + 0.4 && Math.abs(k.y - e.y) < 1.4 && e.cd === 0 && takeToken(S, e, 'melee')) {
      setE(e, 'windup'); e.atk = { kind: 'grab', inst: newId(S) };
      telegraph(S, e, 'heavy', G.wind, 'grab');
    }
    // With nobody to collect it shoves heroes aside
    if (goal !== k && Math.abs(dx) < 1.6 && e.cd === 0) {
      spawnHitbox(S, { owner: e.id, team: 'e', inst: newId(S), x0: e.x - 1.4, x1: e.x + 1.4, y0: e.y, y1: e.y + e.h, dmg: 6, kb: [e.facing * 9, 4], cat: 'standard' });
      e.cd = 80;
    }
    physics(S, e);
  },
  mk2(S, e) { mk2(S, e); },
};

// A walker on a walkway drops through it when what it wants is below
function dropToward(e, goal) {
  if (goal && e.onGround && e.y > 0.5 && goal.y < e.y - 1.5 && Math.abs(goal.x - e.x) < 6 && !(e.dropT > 0)) { e.dropT = 14; e.vy = -2; e.onGround = false; }
}
function targetFor(S, e) {
  // Mostly the nearest hero; a free kid close by is fair game too
  const p = nearestHero(S, e), k = S.kid;
  if (k && kidFree(k) && k.state !== 'downed' && Math.abs(k.x - e.x) < 4 && (!p || Math.abs(k.x - e.x) < Math.abs(p.x - e.x) - 1)) return k;
  return p;
}
function pickPrey(S, e) {
  let best = null, bd = 40;
  for (const p of S.players) { if (isDown(p) || p.markedBy) continue; const d = Math.abs(p.x - e.x); if (d < bd) { bd = d; best = p; } }
  return best;
}

function meleeAttack(S, e, A) {
  const kind = e.atk.kind;
  if (e.state === 'windup') { e.vx *= 0.6; physics(S, e); if (e.st >= A.wind) setE(e, 'attack'); return; }
  if (e.state === 'attack') {
    const x0 = e.facing > 0 ? e.x : e.x - A.reach;
    spawnHitbox(S, { owner: e.id, team: 'e', inst: e.atk.inst, x0, x1: x0 + A.reach, y0: e.y, y1: e.y + e.h, dmg: A.dmg, kb: [e.facing * A.kb[0], A.kb[1]], heavy: kind === 'slam', cat: kind === 'slam' ? 'heavy' : 'standard' });
    if (kind === 'slam' && e.st === 1) emit(S, 'slam', { id: e.id, x: e.x + e.facing * A.reach * 0.6, y: e.y });
    e.vx = e.facing * 1.2; physics(S, e);
    if (e.st >= A.active) setE(e, 'recover');
    return;
  }
  e.vx *= 0.7; physics(S, e);
  if (e.st >= A.rec) { e.atk = null; releaseToken(S, e); setE(e, 'idle'); e.cd = 45 + Math.floor(rand(S) * 40); }
}
function gunnerBurst(S, e, T) {
  const B = T.burst, p = ent(S, e.atk.target);
  e.vx *= 0.7; physics(S, e);
  if (e.state === 'windup') { if (e.st >= B.wind) { setE(e, 'burst'); e.atk.n = 0; } return; }
  if ((e.st - 1) % B.every === 0) {
    const tx = p && !isDown(p) ? p.x : e.x + e.facing * 6, ty = p && !isDown(p) ? p.y + 1.1 : e.y + 1.4;
    const sx = e.x + e.facing * 0.6, sy = e.y + 1.45, dx = tx - sx, dy = ty - sy, m = Math.hypot(dx, dy) || 1;
    spawnProjectile(S, { team: 'e', owner: e.id, x: sx, y: sy, vx: dx / m * B.speed, vy: dy / m * B.speed, r: 0.18, dmg: B.dmg, kind: 'bolt', ttl: 150 });
    emit(S, 'enemyShot', { id: e.id, x: sx, y: sy });
    if (++e.atk.n >= B.shots) setE(e, 'recover');
  }
}
// Carrying the kid off to the nearest exit
function carry(S, e) {
  const T = ENEMIES.collector, k = S.kid;
  if (!k || k.state !== 'carried' || k.carriedBy !== e.id) { e.carry = 0; setE(e, 'idle'); return; }
  let exit = null, bd = Infinity;
  const ways = EXITS.filter(x => x.sec === S.mission.secId);
  for (const x of ways.length ? ways : EXITS) { const d = Math.abs(x.x - e.x) + Math.abs(x.y - e.y) * 3; if (d < bd) { bd = d; exit = x; } }
  e.facing = exit.x >= e.x ? 1 : -1;
  e.vx = e.facing * T.grab.carry;
  physics(S, e);
  k.x = e.x - e.facing * 0.2; k.y = e.y + e.h * 0.55; k.vx = k.vy = 0;
  if (Math.abs(exit.x - e.x) < 0.9) {
    emit(S, 'kidTaken', { id: e.id, x: e.x, y: e.y });
    S.mission.failed = 'kid';
  }
}

// ---- The Mk-II Sentinel -----------------------------------------------------------------------------------------
function mk2(S, e) {
  const T = ENEMIES.mk2, p = nearestHero(S, e, 60);
  if (e.state === 'intro') { physics(S, e); if (e.onGround && e.st > 30) { if (!e.landed) { e.landed = true; emit(S, 'bossLand', { id: e.id, x: e.x, y: e.y }); } if (e.st > 90) { setE(e, 'idle'); e.cd = 40; } } return; }
  if (e.phase === 1 && e.hp < e.maxHp / 2) { e.phase = 2; e.armour = 2; setE(e, 'roar'); emit(S, 'bossPhase', { id: e.id, x: e.x, y: e.y + e.h }); }
  if (e.state === 'roar') { e.vx = 0; physics(S, e); if (e.st > 70) { setE(e, 'idle'); e.cd = 20; } return; }
  const fast = e.phase === 2 ? 0.8 : 1;
  if (e.state === 'windup') {
    e.vx *= 0.6; physics(S, e);
    const A = e.atk;
    if (A.kind === 'beam') A.span = beamSpan(S, e);
    if (e.st >= A.wind) { setE(e, A.kind === 'stomp' ? 'stomp' : A.kind === 'beam' ? 'beam' : 'attack'); if (A.kind === 'beam') emit(S, 'bossBeam', { id: e.id, ticks: T.beam.ticks }); }
    return;
  }
  if (e.state === 'stomp') {
    if (e.st === 1) {
      spawnHitbox(S, { owner: e.id, team: 'e', inst: e.atk.inst, x0: e.x - T.stomp.r, x1: e.x + T.stomp.r, y0: e.y - 0.2, y1: e.y + 0.8, dmg: T.stomp.dmg, kb: [0, 10], heavy: true, unblockable: true, cat: 'unblockable' });
      emit(S, 'slam', { id: e.id, x: e.x, y: e.y, big: true });
    }
    physics(S, e); if (e.st > 40 * fast) { setE(e, 'idle'); e.cd = 50 * fast; e.atk = null; }
    return;
  }
  if (e.state === 'attack') {
    const A = T.sweep, x0 = e.facing > 0 ? e.x : e.x - A.reach;
    spawnHitbox(S, { owner: e.id, team: 'e', inst: e.atk.inst, x0, x1: x0 + A.reach, y0: e.y, y1: e.y + 2.6, dmg: A.dmg, kb: [e.facing * A.kb[0], A.kb[1]], heavy: true, cat: 'heavy' });
    physics(S, e); if (e.st >= A.active) setE(e, 'recover');
    return;
  }
  if (e.state === 'beam') {
    const A = e.atk; A.span = beamSpan(S, e);
    const L = A.span;
    spawnHitbox(S, { owner: e.id, team: 'e', inst: newId(S) + 0 * e.st, x0: Math.min(L.x0, L.x1), x1: Math.max(L.x0, L.x1), y0: L.y0, y1: L.y1, dmg: T.beam.dmg, kb: [e.facing * 4, 6], unblockable: true, cat: 'unblockable' });
    physics(S, e); if (e.st >= T.beam.ticks) { setE(e, 'recover'); }
    return;
  }
  if (e.state === 'recover') { e.vx *= 0.8; physics(S, e); if (e.st > 34 * fast) { setE(e, 'idle'); e.cd = 50 * fast; e.atk = null; } return; }
  if (!p) { physics(S, e); return; }
  const dx = p.x - e.x; e.facing = dx >= 0 ? 1 : -1;
  e.vx = Math.abs(dx) > 3.4 ? e.facing * T.speed : e.vx * 0.7;
  if (e.cd === 0) {
    const d = Math.abs(dx), r = rand(S);
    const kind = d < 3.8 ? (r < 0.55 ? 'sweep' : 'stomp') : (r < 0.5 ? 'beam' : 'stomp');
    e.atk = { kind, inst: newId(S), wind: Math.round((kind === 'stomp' ? T.stomp.wind : kind === 'sweep' ? T.sweep.wind : T.beam.wind) * fast) };
    setE(e, 'windup');
    telegraph(S, e, kind === 'sweep' ? 'heavy' : 'unblockable', e.atk.wind, kind);
  }
  physics(S, e);
}
// The eye beam rakes the floor at ankle height in front of it, to the first wall
function beamSpan(S, e) {
  const B = ENEMIES.mk2.beam, y = e.y + (B.band[0] + B.band[1]) / 2, x0 = e.x + e.facing * (e.w / 2 + 0.1);
  const h = rayCast(x0, y, e.facing, 0, 22, S.gates);
  return { x0, x1: x0 + e.facing * h.t, y0: e.y + B.band[0], y1: e.y + B.band[1], y, ex: e.x + e.facing * 0.6, ey: e.y + e.h * 0.85 };
}
export { killEnemy, randRange };
