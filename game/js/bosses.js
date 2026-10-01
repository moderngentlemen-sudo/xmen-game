// Level bosses. The Lockwarden holds the Concourse Lock (its last wave); the Stormcaller guards the relay beacon
// at the end of the Skyline Relay. Both have two phases: at half health they roar (invulnerable for a moment),
// re-arm and speed up, and gain a new attack. Every attack uses the usual telegraph categories (a glint for
// standard, a double glint for heavy, the magenta strip and rising tone for unblockable), and each boss opens
// real punish windows: a Lockwarden that charges into a wall or has its hammer perfect-parried is dazed; a
// Stormcaller that dives into the pad, or is perfect-parried out of the dive, crashes and lies open. They are
// never knocked back, hit-stop on them is kept short, poise decays between hits, and after a stagger they
// cannot be staggered again for a while (combat.js). Registered into the enemy tables at import.
import { DT, GRAVITY } from './config.js';
import { ENEMY_TYPES, BEHAVIOUR, nearestPlayer, canTarget, enemyPhysics, createEnemy } from './enemies.js';
import { rayCast, groundBelow } from './level.js';

export const BOSS = {
  warden: {
    name: 'Lockwarden', title: 'The lock’s last guard',
    hp: 240, armor: 4, rearm: 2, poise: 420, poiseDecay: 0.6, stagger: 150, staggerCd: 420, daze: 110, walk: 2.4, cd: [46, 28],
    sweep: { wind: 22, active: 8, rec: 30, reach: 3.6, dmg: 14, kb: [9, 4] },
    hammer: { wind: 34, active: 6, rec: 44, reach: 3.9, dmg: 24, kb: [12, 6] },
    stomp: { wind: 40, jump: 13, hop: 6, dmg: 22, rec: 40 },
    missiles: { wind: 26, n: [3, 5], dmg: 10, gravity: 16, rec: 34 },
    charge: { wind: 36, speed: 16, maxTicks: 120, dmg: 26, rec: 30 },
    laser: { wind: 50, ticks: 42, dmg: 20, low: [0.3, 0.8], high: [1.15, 1.55], range: 40, rec: 36 },
  },
  stormcaller: {
    name: 'Stormcaller', title: 'It keeps the relay beacon',
    hp: 260, armor: 0, rearm: 2, poise: 380, poiseDecay: 0.6, stagger: 140, staggerCd: 420, hover: 6.6, speed: 7, cd: [40, 26],
    padX: [300.5, 313.5], floor: 18.6,
    volley: { wind: 24, bursts: [3, 4], every: 10, speed: 14, dmg: 8, spread: 0.12, rec: 26 },
    rain: { wind: 40, n: [4, 6], blast: { r: 1.7, dmg: 16 }, gravity: 26, rec: 30 },
    sweep: { wind: 50, ticks: 44, low: [0.3, 0.8], high: [1.15, 1.55], hoverY: 2.4, dmg: 20, rec: 60 },
    dive: { wind: 36, speed: 22, maxTicks: 60, dmg: 24, crash: 70, parried: 115, rise: 40 },
    drones: 2,
  },
};
Object.assign(ENEMY_TYPES, {
  warden: { w: 2.2, h: 3.4, hp: BOSS.warden.hp, poise: BOSS.warden.poise, speed: BOSS.warden.walk, flinch: false, light: false, armor: BOSS.warden.armor, boss: true },
  stormcaller: { w: 3.0, h: 1.5, hp: BOSS.stormcaller.hp, poise: BOSS.stormcaller.poise, speed: BOSS.stormcaller.speed, flinch: false, light: false, flier: true, boss: true },
});

const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function setState(e, s) { e.state = s; e.st = 0; }
function pick(e, opts) {
  const pool = opts.filter(o => o[0] !== e.lastAtk), sum = pool.reduce((s, o) => s + o[1], 0);
  let r = Math.random() * sum;
  for (const o of pool) { r -= o[1]; if (r <= 0) return o[0]; }
  return pool[0][0];
}

// Shared: poise decays, stagger immunity, and the half-health phase change (a roar that re-arms it)
function bossTick(e, world, B) {
  e.poise = e.staggerCd > 0 ? 0 : Math.max(0, e.poise - B.poiseDecay);
  if (e.staggerCd > 0) e.staggerCd--;
  if (e.invuln > 0) e.invuln--;
  if (e.phase === 1 && e.hp <= e.maxHp / 2 && e.state !== 'intro') {
    e.phase = 2; e.armor = e.armorMax = B.rearm; e.invuln = 80; e.atk = null;
    setState(e, 'roar');
    world.emit('bossPhase', { e, x: e.x, y: e.y + e.h * 0.6 });
    return true;
  }
  return false;
}

// Starts an attack: telegraphs it and remembers what it is
function begin(e, world, kind, cat, wind, extra = {}) {
  e.atk = { kind, wind, inst: world.newInstance(), ...extra }; e.lastAtk = kind;
  setState(e, 'windup'); world.telegraph(e, cat, wind);
}

// Where a laser runs: from the boss along `dir` at height band [y0, y1] above the floor, to the first wall
function laserSpan(e, dir, fy, band, range) {
  const y = fy + (band[0] + band[1]) / 2, x0 = e.x + dir * (e.w / 2 + 0.1), h = rayCast(x0, y, dir, 0, range);
  return { x0, x1: x0 + dir * h.t, y0: fy + band[0], y1: fy + band[1], y };
}

// ---- Lockwarden ----------------------------------------------------------------------------------
BEHAVIOUR.warden = function (e, world) {
  const B = BOSS.warden, fast = e.phase === 2 ? 0.8 : 1;
  if (bossTick(e, world, B)) { enemyPhysics(e); return; }
  const p = nearestPlayer(e, world, 60); e.target = p;
  const s = e.state, A = e.atk;
  if (s === 'intro') {
    // Dropped into the lock from above: the landing throws shockwaves both ways
    enemyPhysics(e);
    if (e.onGround && !e.landed) { e.landed = true; world.spawnShockwave(e, 1, 12); world.spawnShockwave(e, -1, 12); world.emit('bossSlam', { e, x: e.x, y: e.y, big: true }); }
    if (e.landed && e.st >= 110) { e.invuln = 0; setState(e, 'idle'); e.cd = 30; }
    return;
  }
  if (s === 'roar') { e.vx *= 0.8; enemyPhysics(e); if (e.st >= 80) { setState(e, 'idle'); e.cd = 16; } return; }
  if (s === 'dazed') { e.vx *= 0.85; enemyPhysics(e); if (e.st >= B.daze) { setState(e, 'idle'); e.cd = 20; } return; }
  if (s === 'idle' || s === 'approach') {
    if (!p) { e.vx *= 0.8; enemyPhysics(e); return; }
    const dx = p.x - e.x, dist = Math.abs(dx);
    e.facing = dx >= 0 ? 1 : -1;
    if (dist > 3.2) e.vx = approach(e.vx, e.facing * B.walk * (e.phase === 2 ? 1.3 : 1), 0.35); else e.vx *= 0.7;
    if (e.cd === 0 && e.onGround) {
      const opts = dist < 4.4 ? [['sweep', 4], ['hammer', 3], ['stomp', 2]] : dist < 11 ? [['charge', 3], ['missiles', 3], ['stomp', 2]] : [['missiles', 4], ['charge', 3]];
      if (e.phase === 2) opts.push(['laser', 3]);
      startWarden(e, world, pick(e, opts));
    }
    enemyPhysics(e); return;
  }
  if (!A) { setState(e, 'idle'); enemyPhysics(e); return; }
  if (s === 'windup') {
    e.vx *= 0.6;
    if (p && A.kind !== 'laser' && A.kind !== 'charge') e.facing = p.x >= e.x ? 1 : -1;
    if (A.kind === 'laser') A.span = laserSpan(e, e.facing, e.y, A.high ? B.laser.high : B.laser.low, B.laser.range);
    if (e.st >= A.wind) {
      if (A.kind === 'stomp') { e.vy = B.stomp.jump; e.vx = p ? clamp((p.x - e.x) * 0.9, -B.stomp.hop, B.stomp.hop) : 0; e.onGround = false; setState(e, 'jump'); }
      else if (A.kind === 'missiles') { fireMissiles(e, world, B.missiles); setState(e, 'recover'); A.rec = B.missiles.rec; }
      else if (A.kind === 'charge') { setState(e, 'charge'); world.emit('chargeStart', { e }); }
      else if (A.kind === 'laser') { setState(e, 'laser'); world.emit('bossLaser', { e, ticks: B.laser.ticks, high: A.high }); }
      else setState(e, 'attack');
    }
    enemyPhysics(e); return;
  }
  if (s === 'attack') {
    const S = A.kind === 'hammer' ? B.hammer : B.sweep, x0 = e.facing > 0 ? e.x + 0.3 : e.x - 0.3 - S.reach;
    world.spawnHitbox({ owner: e, team: 'e', x0, x1: x0 + S.reach, y0: e.y + (A.kind === 'hammer' ? 0 : 0.2), y1: e.y + (A.kind === 'hammer' ? 3.0 : 2.6),
      dmg: S.dmg, kb: [e.facing * S.kb[0], S.kb[1]], heavy: A.kind === 'hammer', instance: A.inst, cat: A.kind === 'hammer' ? 'heavy' : 'standard' });
    if (A.kind === 'hammer' && e.st === 2) world.emit('bossSlam', { e, x: e.x + e.facing * 2.6, y: e.y });
    if (e.st >= S.active) { setState(e, 'recover'); A.rec = S.rec; }
    e.vx *= 0.5; enemyPhysics(e); return;
  }
  if (s === 'jump') {
    enemyPhysics(e);
    if (e.onGround && e.st > 3) {
      world.spawnShockwave(e, 1, B.stomp.dmg, 1.3); world.spawnShockwave(e, -1, B.stomp.dmg, 1.3);
      world.emit('bossSlam', { e, x: e.x, y: e.y, big: true });
      if (--A.hops > 0) { e.vy = B.stomp.jump; e.vx = p ? clamp((p.x - e.x) * 0.9, -B.stomp.hop, B.stomp.hop) : 0; e.onGround = false; e.st = 0; }
      else { setState(e, 'recover'); A.rec = B.stomp.rec; e.vx = 0; }
    }
    return;
  }
  if (s === 'charge') {
    e.vx = e.facing * B.charge.speed;
    const x0 = e.facing > 0 ? e.x + 0.4 : e.x - 1.9;
    world.spawnHitbox({ owner: e, team: 'e', x0, x1: x0 + 1.5, y0: e.y + 0.1, y1: e.y + 2.8, dmg: B.charge.dmg, heavy: true,
      kb: [e.facing * 13, 6], instance: A.inst, cat: 'heavy' });
    enemyPhysics(e);
    if (e.hitWall) { setState(e, 'dazed'); e.vx = -e.facing * 3; world.emit('chargeCrash', { e }); world.emit('bossSlam', { e, x: e.x + e.facing * 1.1, y: e.y }); }
    else if (e.st >= B.charge.maxTicks) { setState(e, 'recover'); A.rec = B.charge.rec; }
    return;
  }
  if (s === 'laser') {
    A.span = laserSpan(e, e.facing, e.y, A.high ? B.laser.high : B.laser.low, B.laser.range);
    const L = A.span;
    world.spawnHitbox({ owner: e, team: 'e', x0: Math.min(L.x0, L.x1), x1: Math.max(L.x0, L.x1), y0: L.y0, y1: L.y1, dmg: B.laser.dmg,
      kb: [e.facing * 6, 5], unblockable: true, cat: 'unblockable', instance: A.inst });
    e.vx = 0; enemyPhysics(e);
    if (e.st >= B.laser.ticks) { setState(e, 'recover'); A.rec = B.laser.rec; }
    return;
  }
  if (s === 'recover') {
    e.vx *= 0.8; enemyPhysics(e);
    // A perfect parry of the hammer (or any heavy blow) leaves it dazed
    if (e.parried === 2) { e.parried = 0; setState(e, 'dazed'); world.emit('bossDazed', { e, x: e.x, y: e.y + e.h * 0.7 }); return; }
    if (e.st >= (A.rec || 30) * fast) { e.atk = null; e.parried = 0; setState(e, 'idle'); e.cd = B.cd[e.phase - 1]; }
    return;
  }
  setState(e, 'idle'); enemyPhysics(e);
};

function startWarden(e, world, k) {
  const B = BOSS.warden, fast = e.phase === 2 ? 0.8 : 1;
  e.vx = 0;
  if (k === 'sweep') begin(e, world, k, 'standard', Math.round(B.sweep.wind * fast));
  else if (k === 'hammer') begin(e, world, k, 'heavy', Math.round(B.hammer.wind * fast));
  else if (k === 'stomp') begin(e, world, k, 'unblockable', Math.round(B.stomp.wind * fast), { hops: e.phase === 2 ? 2 : 1 });
  else if (k === 'missiles') begin(e, world, k, 'standard', Math.round(B.missiles.wind * fast));
  else if (k === 'charge') begin(e, world, k, 'heavy', Math.round(B.charge.wind * fast));
  else { e.laserHigh = !e.laserHigh; begin(e, world, k, 'unblockable', Math.round(B.laser.wind * fast), { high: e.laserHigh }); }
}

// Missiles lob up off its back and come down on the players (with some spread): standard shots, so they
// can be parried, deflected, shot down or erased by the beam
function fireMissiles(e, world, M) {
  const n = M.n[e.phase - 1], targets = world.players.filter(canTarget);
  for (let i = 0; i < n; i++) {
    const t = targets.length ? targets[i % targets.length] : null;
    const sx = e.x - e.facing * 0.5 + (i - (n - 1) / 2) * 0.25, sy = e.y + e.h + 0.1;
    const tx = (t ? t.x : e.x + e.facing * 6) + (i - (n - 1) / 2) * 1.3, ty = Math.max(groundBelow(tx, (t ? t.y : e.y) + 1), (t ? t.y : e.y) - 6) + 0.6;
    const T = clamp(1.0 + Math.abs(tx - sx) / 24 + i * 0.07, 1.0, 1.7), g = M.gravity;
    world.spawnProjectile({ team: 'e', owner: e, x: sx, y: sy, vx: (tx - sx) / T, vy: (ty - sy + 0.5 * g * T * T) / T, gravity: g, r: 0.26, dmg: M.dmg,
      kind: 'missile', ttl: 240 });
  }
  world.emit('bossMissiles', { e, n });
}

// ---- Stormcaller ---------------------------------------------------------------------------------
BEHAVIOUR.stormcaller = function (e, world) {
  const B = BOSS.stormcaller, fast = e.phase === 2 ? 0.8 : 1, floor = B.floor;
  if (bossTick(e, world, B)) { e.vx *= 0.9; e.vy *= 0.9; enemyPhysics(e); return; }
  const p = nearestPlayer(e, world, 60); e.target = p;
  const s = e.state, A = e.atk, bob = Math.sin(world.tick * 0.04) * 0.4;
  const home = (tx, ty, k = 1.6, max = B.speed) => {
    e.vx = approach(e.vx, clamp((tx - e.x) * k, -max, max), 0.45); e.vy = approach(e.vy, clamp((ty - e.y) * k, -max, max), 0.45);
  };
  if (s === 'intro') {
    home(e.homeX, floor + B.hover, 1.2, 5);
    if (e.st >= 110) { e.invuln = 0; setState(e, 'idle'); e.cd = 30; }
    enemyPhysics(e); return;
  }
  if (s === 'roar') {
    e.vx *= 0.9; e.vy *= 0.9;
    if (e.st === 30) {
      // Phase two: it calls in drones
      for (let i = 0; i < B.drones; i++) {
        const d = createEnemy('drone', e.x + (i ? 4 : -4), e.y + 1.5, { zone: e.zone, enc: e.enc, cd: 60 + i * 30, add: true });
        world.enemies.push(d);
      }
      world.emit('bossCall', { e });
    }
    if (e.st >= 80) { setState(e, 'idle'); e.cd = 16; }
    enemyPhysics(e); return;
  }
  if (s === 'crashed') {
    // Down on the pad: open to everything until it lifts off
    e.vx *= 0.85; e.vy = Math.max(e.vy - GRAVITY * DT, -12);
    enemyPhysics(e);
    if (e.st >= e.crashFor) { setState(e, 'rise'); }
    return;
  }
  if (s === 'rise') { home(e.x, floor + B.hover, 1.4, 6); enemyPhysics(e); if (e.st >= B.dive.rise) { setState(e, 'idle'); e.cd = 16; } return; }
  if (s === 'idle') {
    if (!p) { home(e.homeX, floor + B.hover + bob); enemyPhysics(e); return; }
    e.facing = p.x >= e.x ? 1 : -1;
    // Hover above the pad off to one side of the target
    const side = e.x >= p.x ? 1 : -1, tx = clamp(p.x + side * 4.5, B.padX[0], B.padX[1]);
    home(tx, floor + B.hover + bob);
    if (e.cd === 0) startStorm(e, world, pick(e, [['volley', 4], ['rain', 3], ['sweep', 3], ['dive', 3]]));
    enemyPhysics(e); return;
  }
  if (!A) { setState(e, 'idle'); enemyPhysics(e); return; }
  if (s === 'reposition') {
    const tx = B.padX[A.edge], ty = floor + B.sweep.hoverY;
    home(tx, ty, 2.2, 9);
    e.facing = A.edge === 0 ? 1 : -1;
    if ((Math.abs(e.x - tx) < 0.4 && Math.abs(e.y - ty) < 0.4) || e.st > 90) { setState(e, 'windup'); world.telegraph(e, 'unblockable', A.wind); }
    enemyPhysics(e); return;
  }
  if (s === 'windup') {
    if (A.kind === 'sweep') { home(B.padX[A.edge], floor + B.sweep.hoverY, 2, 4); A.span = laserSpan(e, e.facing, floor, A.high ? B.sweep.high : B.sweep.low, 30); }
    else { e.vx *= 0.9; e.vy *= 0.9; if (p) e.facing = p.x >= e.x ? 1 : -1; }
    if (A.kind === 'dive' && p) { A.tx = p.x; A.ty = p.y + 0.6; }
    if (e.st >= A.wind) {
      if (A.kind === 'volley') { setState(e, 'volley'); A.n = 0; }
      else if (A.kind === 'rain') { fireRain(e, world, B.rain); setState(e, 'recover'); A.rec = B.rain.rec; }
      else if (A.kind === 'sweep') { setState(e, 'laser'); world.emit('bossLaser', { e, ticks: B.sweep.ticks, high: A.high }); }
      else {
        const dx = A.tx - e.x, dy = A.ty - (e.y + e.h / 2), m = Math.hypot(dx, dy) || 1;
        A.dx = dx / m; A.dy = dy / m; setState(e, 'dive'); world.emit('bossDive', { e });
      }
    }
    enemyPhysics(e); return;
  }
  if (s === 'volley') {
    e.vx *= 0.9; e.vy *= 0.9;
    if (e.st % B.volley.every === 1 && p && canTarget(p)) {
      const sx = e.x + e.facing * 1.2, sy = e.y + 0.3, a = Math.atan2(p.y + 1 - sy, p.x - sx);
      for (const d of [-1, 1]) {
        const aa = a + d * B.volley.spread;
        world.spawnProjectile({ team: 'e', owner: e, x: sx, y: sy + d * 0.25, vx: Math.cos(aa) * B.volley.speed, vy: Math.sin(aa) * B.volley.speed, r: 0.2, dmg: B.volley.dmg, kind: 'std', ttl: 150 });
      }
      world.emit('enemyShot', { e, heavy: false });
      if (++A.n >= A.shots) { setState(e, 'recover'); A.rec = B.volley.rec; }
    }
    enemyPhysics(e); return;
  }
  if (s === 'laser') {
    home(B.padX[A.edge], floor + B.sweep.hoverY, 2, 3);
    A.span = laserSpan(e, e.facing, floor, A.high ? B.sweep.high : B.sweep.low, 30);
    const L = A.span;
    world.spawnHitbox({ owner: e, team: 'e', x0: Math.min(L.x0, L.x1), x1: Math.max(L.x0, L.x1), y0: L.y0, y1: L.y1, dmg: B.sweep.dmg,
      kb: [e.facing * 6, 5], unblockable: true, cat: 'unblockable', instance: A.inst });
    enemyPhysics(e);
    if (e.st >= B.sweep.ticks) { setState(e, 'recover'); A.rec = B.sweep.rec; A.low = true; }
    return;
  }
  if (s === 'dive') {
    e.vx = A.dx * B.dive.speed; e.vy = A.dy * B.dive.speed;
    world.spawnHitbox({ owner: e, team: 'e', x0: e.x - e.w / 2 - 0.2, x1: e.x + e.w / 2 + 0.2, y0: e.y - 0.2, y1: e.y + e.h, dmg: B.dive.dmg, heavy: true,
      kb: [Math.sign(A.dx || e.facing) * 12, 6], instance: A.inst, cat: 'heavy' });
    enemyPhysics(e);
    const hitFloor = e.onGround || e.hitWall || e.y <= floor + 0.05;   // the pad, a perch or a wall
    if (e.parried === 2 || hitFloor || e.st >= B.dive.maxTicks) {
      const parried = e.parried === 2; e.parried = 0;
      if (parried || hitFloor) { e.crashFor = parried ? B.dive.parried : B.dive.crash; setState(e, 'crashed'); world.emit('bossCrash', { e, x: e.x, y: e.y, parried }); }
      else { setState(e, 'rise'); }
    }
    return;
  }
  if (s === 'recover') {
    if (A.low) { e.vx *= 0.85; e.vy *= 0.85; } else home(e.x, floor + B.hover + bob, 1, 3);
    enemyPhysics(e);
    if (e.parried === 2) { e.parried = 0; e.crashFor = B.dive.parried; setState(e, 'crashed'); world.emit('bossCrash', { e, x: e.x, y: e.y, parried: true }); return; }
    if (e.st >= (A.rec || 30) * fast) { e.atk = null; e.parried = 0; setState(e, A.low ? 'rise' : 'idle'); e.cd = B.cd[e.phase - 1]; }
    return;
  }
  setState(e, 'idle'); enemyPhysics(e);
};

function startStorm(e, world, k) {
  const B = BOSS.stormcaller, fast = e.phase === 2 ? 0.8 : 1;
  if (k === 'volley') begin(e, world, k, 'standard', Math.round(B.volley.wind * fast), { shots: B.volley.bursts[e.phase - 1] });
  else if (k === 'rain') begin(e, world, k, 'unblockable', Math.round(B.rain.wind * fast));
  else if (k === 'dive') begin(e, world, k, 'heavy', Math.round(B.dive.wind * fast));
  else {
    // The sweep: it drops low at one edge of the pad, then fires a laser across it at ankle height (jump it)
    // or, in phase two, alternately at chest height (crouch or slide under it)
    const edge = Math.abs(e.x - B.padX[0]) < Math.abs(e.x - B.padX[1]) ? 0 : 1;
    e.laserHigh = e.phase === 2 ? !e.laserHigh : false;
    e.atk = { kind: 'sweep', inst: world.newInstance(), edge, high: e.laserHigh, wind: Math.round(B.sweep.wind * fast) }; e.lastAtk = 'sweep';
    setState(e, 'reposition');
  }
}
// Tests and tools: start a named attack now, the same way the boss would choose it
export function forceBossAttack(world, e, kind) { e.cd = 0; if (e.type === 'warden') startWarden(e, world, kind); else startStorm(e, world, kind); }

// Shells rained across the pad (unblockable bursts, with landing markers): one on each player, the rest spread
function fireRain(e, world, R) {
  const n = R.n[e.phase - 1], B = BOSS.stormcaller, targets = world.players.filter(canTarget);
  for (let i = 0; i < n; i++) {
    const t = targets[i];
    const tx = t && i < targets.length ? t.x : B.padX[0] + (B.padX[1] - B.padX[0]) * ((i + 0.5) / n) + (Math.random() - 0.5);
    const ty = Math.max(groundBelow(tx, B.floor + 2), B.floor - 6), sx = e.x + (i - n / 2) * 0.3, sy = e.y + e.h * 0.2;
    const T = 0.95 + i * 0.12, g = R.gravity;
    world.spawnProjectile({ team: 'e', owner: e, x: sx, y: sy, vx: (tx - sx) / T, vy: (ty + 0.2 - sy + 0.5 * g * T * T) / T, gravity: g, r: 0.3, dmg: 0, heavy: true,
      kind: 'mortar', ttl: 300, blast: { ...R.blast } });
    world.emit('mortarShot', { e, x: tx, y: ty, r: R.blast.r, ticks: Math.round(T * 60) });
  }
}

// A boss for an encounter: scaled for the number of players, arriving on its intro
export function spawnBoss(world, type, x, y, extra = {}) {
  const B = BOSS[type], n = Math.max(1, world.players.length);
  const e = createEnemy(type, x, y, { ...extra, boss: true, phase: 1, invuln: 999, staggerCd: 0, parried: 0, cd: 60, facing: -1, homeX: x, homeY: y });
  e.hp = e.maxHp = Math.round(B.hp * (1 + 0.6 * (n - 1)));
  e.state = 'intro'; e.st = 0;
  world.enemies.push(e);
  world.emit('bossIntro', { e, name: B.name, title: B.title });
  return e;
}
