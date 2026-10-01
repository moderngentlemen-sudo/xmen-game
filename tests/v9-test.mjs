// Version 9: Nova's secondary weapons without recoil (Scatter, Grenade, Chain, Disc, Gravity Well on LB),
// his dodge on LT, automatic lock-on, the rising attack for every character, and the ultimate bar with
// solo and team ultimates. Runs the real simulation headless.
import { World } from '../game/js/world.js';
import { createEnemy } from '../game/js/enemies.js';
import { SETTINGS, MARKSMAN, SUB, SUBS, DODGE, ULT, LOCK, MOVES } from '../game/js/config.js';
import { BOXES as LEVEL_BOXES } from '../game/js/level.js';
SETTINGS.novaKit = 'marksman'; SETTINGS.echoKit = 'hunter'; SETTINGS.lockOn = true; SETTINGS.lockMode = 'manual'; SETTINGS.dashCharge = true;
SETTINGS.dashIframes = false; SETTINGS.difficulty = 'normal';
const BT = ['jump', 'dash', 'melee', 'fire', 'parry', 'sig', 'mode', 'lock', 'sub', 'ult'];
function mk(prev, o = {}) {
  const held = {}; for (const b of BT) held[b] = !!(o.held && o.held[b]);
  const pressed = {}, released = {};
  for (const b of BT) { pressed[b] = held[b] && !prev.held[b]; released[b] = !held[b] && !!prev.held[b]; }
  return { mx: o.mx || 0, my: o.my || 0, aimFree: !!o.aim, ax: o.aim ? o.aim[0] : 0, ay: o.aim ? o.aim[1] : 0, held, pressed, released };
}
// chars: one per player. run(spec, n): spec is one player's input (player 1), or { 0: ..., 1: ... } for several,
// or a function of the tick index returning either
function setup(x = 99, chars = ['nova'], y = 0) {
  const w = new World(); w.enemies = []; w.towerSpawned = true;
  const ps = chars.map((c, i) => { const p = w.addPlayer('t' + i, c); p.x = x + i * 1.2; p.y = y; p.prevX = p.x; p.prevY = y; return p; });
  const prev = ps.map(() => ({ held: {} })); const log = [];
  const run = (o = {}, n = 1, each = null) => {
    for (let i = 0; i < n; i++) {
      const spec = typeof o === 'function' ? o(i) : o, multi = Object.keys(spec).some(k => /^\d$/.test(k));
      const cmds = {};
      ps.forEach((p, j) => { const c = mk(prev[j], multi ? spec[j] || {} : j === 0 ? spec : {}); prev[j] = c; cmds[p.slot] = c; });
      w.step(cmds); log.push(...w.events); w.events.length = 0;
      if (each && each(i)) return true;
    }
    return false;
  };
  run({}, 10); for (const p of ps) p.mercy = 0;
  return { w, p: ps[0], ps, run, log };
}
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const count = (log, t, f = () => true) => log.filter(e => e.type === t && f(e)).length;
const enemy = (w, type, x, y = 0, o = {}) => { const e = createEnemy(type, x, y, { cd: 9999, slamCd: 9999, ...o }); w.enemies.push(e); return e; };
const still = e => { e.hitstop = 1e9; return e; };   // frozen in place (never acts)
const hits = (log, e) => log.filter(h => h.type === 'hit' && h.e === e);
const tap = (run, b, o = {}) => { run({ ...o, held: { ...(o.held || {}), [b]: true } }, 1); run(o, 1); };
const selectSub = (run, p, kind) => { let n = 0; while (p.sub !== kind && n++ < 6) { tap(run, 'sub'); run({}, SUB.switchCd); } };
const BC = MARKSMAN.burst.charge;

// ---------------------------------------------------------------- Secondary weapons
{ // LB (the sub button) cycles the five secondary weapons in order, with a short lockout between switches
  const { p, run, log } = setup(99);
  const seen = [p.sub];
  for (let i = 0; i < 5; i++) { tap(run, 'sub'); seen.push(p.sub); run({}, SUB.switchCd); }
  tap(run, 'sub'); const fast = p.sub; tap(run, 'sub'); const blocked = p.sub === fast;
  assert(seen.join(' > ') === [...SUBS, 'scatter'].join(' > ') && count(log, 'subSwitch') >= 6 && blocked,
    `Secondary weapons cycle ${seen.join(' > ')}; a second press inside ${SUB.switchCd} ticks is ignored`);
}
{ // No recoil from any secondary weapon, tapped or charged, on the ground or in the air
  const drift = [];
  for (const kind of SUBS) {
    for (const air of [false, true]) {
      const { p, run } = setup(99); selectSub(run, p, kind); run({}, 30);
      if (air) { p.y = 12; p.prevY = 12; p.vy = 0; p.onGround = false; run({}, 2); }
      const aim = air ? [0.55, -0.83] : [-1, 0];   // aimed back (a recoil would push him forward) or diagonally down
      run({ aim, held: { melee: true } }, BC[1] + 2);
      const vx0 = p.vx, vy0 = p.vy; run({ aim }, 1);   // the release: a charged shot
      drift.push({ kind, air, dvx: Math.abs(p.vx - vx0), lift: p.vy - vy0 });
    }
  }
  const worst = drift.reduce((a, b) => (b.dvx > a.dvx ? b : a));
  assert(drift.every(d => d.dvx < 0.3 && d.lift <= 0.01), `No recoil from any secondary weapon, tapped or charged, on the ground or in the air (largest push ${worst.dvx.toFixed(2)} m/s)`);
}
{ // Grenade: a tap throws on release; it bounces, comes to rest, and bursts on its fuse, hurting what is close
  const { w, p, run, log } = setup(98); selectSub(run, p, 'grenade'); run({}, 30);
  run({ aim: [1, -0.5], held: { melee: true } }, 1);
  const early = count(log, 'grenadeThrow'); run({ aim: [1, -0.5] }, 1);
  const g = w.projectiles.find(q => q.kind === 'grenade');
  let rest = -1, s = null, t = 0;
  run({}, SUB.grenade.fuse[0] + 4, i => { t = i; if (g.rest && rest < 0) { rest = i; s = still(enemy(w, 'swarmer', g.x + 1.3)); s.hp = 99; } return count(log, 'frag') > 0; });
  assert(early === 0 && count(log, 'grenadeThrow') === 1 && count(log, 'bounce') >= 1 && rest > 0 && count(log, 'frag') === 1 && t >= SUB.grenade.fuse[0] - 3 &&
    s && hits(log, s).length === 1 && Math.abs(p.vx) < 0.3,
    `Grenade: thrown on release, ${count(log, 'bounce')} bounces, at rest after ${rest} ticks, bursts on the fuse (${t} ticks) and hits the Swarmer beside it`);
}
{ // It bursts early on an enemy it meets; level 3 scatters bomblets that go off too
  const { w, p, run, log } = setup(98); selectSub(run, p, 'grenade'); run({}, 30);
  const b = still(enemy(w, 'brute', 101.5)); b.hp = 999;
  tap(run, 'melee', { aim: [1, 0] });
  let at = -1; run({}, 30, i => { if (count(log, 'frag') && at < 0) at = i; return false; });
  const early = at >= 0 && at < SUB.grenade.fuse[0] - 20;
  const t = setup(98); selectSub(t.run, t.p, 'grenade'); t.run({}, 30);
  t.run({ aim: [1, 0.4], held: { melee: true } }, BC[2] + 12); t.run({ aim: [1, 0.4] }, 1);
  t.run({}, 140);
  const frags = count(t.log, 'frag');
  assert(early && count(t.log, 'cluster') === 1 && frags === 1 + SUB.grenade.bomblets.n,
    `Grenade bursts on contact (${at} ticks); a level 3 grenade scatters ${SUB.grenade.bomblets.n} bomblets (${frags} bursts in all)`);
}
{ // Grenades land on one-way platforms instead of falling through
  const { w, p } = setup(70);
  const plat = LEVEL_BOXES.find(q => q.type === 'o' && q.tag === 'dais');
  w.spawnProjectile({ team: 'p', owner: p, x: (plat.x0 + plat.x1) / 2, y: plat.y1 + 2, vx: 0, vy: -4, gravity: 30, bouncy: 0.5, r: 0.2, ttl: 200, dmg: 0, kind: 'grenade', intercept: false, blast: { r: 1, dmg: 0, poise: 0 } });
  const g = w.projectiles[w.projectiles.length - 1];
  for (let i = 0; i < 90; i++) w.step({});
  assert(g.rest && Math.abs(g.y - (plat.y1 + g.r)) < 0.25, `A grenade comes to rest on a one-way platform (y ${g.y.toFixed(2)}, top ${plat.y1})`);
}
{ // Chain: instant lightning to the nearest enemy in front, jumping on to the next nearest; it arcs round a
  // shield from the front, stuns light enemies, and a tap reaches SUB.chain.jumps[0] enemies
  const { w, p, run, log } = setup(98); selectSub(run, p, 'chain'); run({}, 30);
  const a = enemy(w, 'shield', 102, 0, { facing: -1, shieldDir: -1 }), b = enemy(w, 'swarmer', 105), c = enemy(w, 'swarmer', 108.5), d = enemy(w, 'swarmer', 112);
  for (const e of [a, b, c, d]) e.hp = 99;
  tap(run, 'melee', { aim: [1, 0] });
  const ev = log.find(e => e.type === 'chain');
  const struck = [a, b, c, d].filter(e => hits(log, e).length > 0).length;
  assert(ev && ev.n === SUB.chain.jumps[0] && struck === SUB.chain.jumps[0] && count(log, 'blocked') === 0 && b.state === 'hitstun' && b.stun >= SUB.chain.stun[0] && Math.abs(p.vx) < 0.3,
    `Chain: a tap arcs through ${struck} enemies (${ev && ev.pts.length} points), through the shield's guard, and stuns (${b.state} ${b.stun} ticks)`);
}
{ // The chain needs a clear line: an enemy behind a wall is not reached; with nothing in reach it fizzles
  const { w, p, run, log } = setup(24); selectSub(run, p, 'chain'); run({}, 30);
  const hid = still(enemy(w, 'swarmer', 34.5));   // inside the ledge, past its wall at x = 32
  tap(run, 'melee', { aim: [1, 0] });
  const ev = log.find(e => e.type === 'chain');
  assert(ev && ev.n === 0 && hits(log, hid).length === 0 && ev.pts[ev.pts.length - 1].fizzle, `Chain does not pass through walls; with no target it earths itself (${ev && ev.pts.length} points)`);
}
{ // Disc: out and back, cutting an enemy once each way, then caught; one at a time; a press calls it back
  const { w, p, run, log } = setup(98); selectSub(run, p, 'disc'); run({}, 30);
  const e = still(enemy(w, 'brute', 102)); e.hp = 999; e.armor = 0;
  tap(run, 'melee', { aim: [1, 0] });
  run({}, 90, () => count(log, 'discCatch') > 0);
  const n = hits(log, e).length, caught = count(log, 'discCatch') === 1;
  // A second one can't be thrown while one is out: the press calls it back instead
  const t = setup(98); selectSub(t.run, t.p, 'disc'); t.run({}, 30);
  tap(t.run, 'melee', { aim: [1, 0] }); t.run({}, 8);
  const out = t.w.projectiles.filter(q => q.kind === 'disc').length;
  tap(t.run, 'melee', { aim: [1, 0] });
  const back = t.w.projectiles.find(q => q.kind === 'disc');
  t.run({}, 40);
  assert(n === 2 && caught && out === 1 && back && back.disc.phase === 'back' && count(t.log, 'discRecall') === 1 && count(t.log, 'discCatch') === 1 &&
    t.w.projectiles.filter(q => q.kind === 'disc').length === 0,
    `Disc cuts the Brute on the way out and back (${n} hits) and is caught; pressing again while it is out calls it back`);
}
{ // A level 2 disc hovers at the far end and keeps cutting; it slices an enemy shot out of the air
  const { w, p, run, log } = setup(98); selectSub(run, p, 'disc'); run({}, 30);
  const D = SUB.disc, far = 98.6 + D.speed[2] * D.out[2] / 60 * 0.75;
  const e = still(enemy(w, 'brute', far)); e.hp = 999; e.armor = 0;
  run({ aim: [1, 0], held: { melee: true } }, BC[1] + 2); run({ aim: [1, 0] }, 1);
  w.spawnProjectile({ team: 'e', owner: e, x: 101, y: 1.1, vx: -10, vy: 0, ttl: 60, r: 0.2, dmg: 10, kind: 'std' });
  run({}, 150, () => count(log, 'discCatch') > 0);
  assert(hits(log, e).length >= 5 && count(log, 'intercept') >= 1 && count(log, 'discCatch') === 1 && p.hp === p.maxHp,
    `Level 2 disc hovers and cuts ${hits(log, e).length} times, intercepts a shot, and comes back`);
}
{ // Gravity Well: the orb opens on an enemy, pulls light enemies in and holds them, drags a heavy one a
  // little, leaves a boss alone, swallows enemy shots, then collapses in a blast
  const { w, p, run, log } = setup(98); selectSub(run, p, 'well'); run({}, 30);
  const s1 = enemy(w, 'swarmer', 102.5, 0, { cd: 9999 }), s2 = enemy(w, 'swarmer', 104.4, 0, { cd: 9999 }), br = enemy(w, 'brute', 105.2, 0, { cd: 9999 });
  for (const e of [s1, s2, br]) { e.hp = 999; e.target = null; }
  const bx0 = br.x;
  tap(run, 'melee', { aim: [1, 0] });
  run({}, 40, () => count(log, 'wellOpen') > 0);
  const wl = w.wells[0];
  w.spawnProjectile({ team: 'e', owner: br, x: wl.x + 2.5, y: wl.y, vx: -8, vy: 0, ttl: 60, r: 0.2, dmg: 10, kind: 'std' });
  run({}, 30);
  const held = [s1, s2].every(e => Math.hypot(e.x - wl.x, e.y + e.h / 2 - wl.y) < 1.0 && e.state === 'launched');
  const dragged = Math.abs(br.x - bx0);
  run({}, SUB.well.life[0]);
  assert(count(log, 'wellOpen') === 1 && held && dragged > 0.2 && dragged < 2.5 && count(log, 'erase') >= 1 && count(log, 'wellCollapse') === 1 && w.wells.length === 0 &&
    hits(log, s1).length >= 3 && p.hp === p.maxHp,
    `Gravity Well opens, holds both Swarmers at its centre, drags the Brute ${dragged.toFixed(2)} m, swallows a shot, and collapses`);
}
{ // A press while the orb flies opens the well there; another collapses it early; a boss is not pulled
  const { w, p, run, log } = setup(98); selectSub(run, p, 'well'); run({}, 30);
  tap(run, 'melee', { aim: [1, 0] }); run({}, 6);
  tap(run, 'melee', { aim: [1, 0] });
  const opened = count(log, 'wellOpen') === 1 && w.wells[0] && w.wells[0].x < 98.6 + SUB.well.speed * 10 / 60;
  run({}, 20); tap(run, 'melee', { aim: [1, 0] }); run({}, 2);
  const early = count(log, 'wellCollapse') === 1;
  // A boss beside a well only takes its damage
  const t = setup(98); selectSub(t.run, t.p, 'well'); t.run({}, 30);
  const B = still(enemy(t.w, 'warden', 103.5, 0, { invuln: 0 })); B.state = 'idle'; B.hp = 999;
  tap(t.run, 'melee', { aim: [1, 0] }); t.run({}, 60);
  assert(opened && early && B.state === 'idle' && !B.wellT && hits(t.log, B).length >= 1, `A press opens the well mid-flight, another collapses it early; a boss is hurt but not pulled`);
}

// ---------------------------------------------------------------- Dodge
{ // LT is Nova's dodge: a backstep with the stick centred, a hop the way the stick points otherwise; the
  // opening ticks are untouchable, and there is a cooldown
  const { w, p, run, log } = setup(100); p.facing = 1;
  const x0 = p.x; tap(run, 'parry'); run({}, DODGE.ticks);
  const back = p.x - x0;
  const t = setup(100); t.p.facing = 1; t.run({ mx: 1 }, 1);
  const x1 = t.p.x; t.run({ mx: 1, held: { parry: true } }, 1); t.run({ mx: 1 }, DODGE.ticks - 1);
  const fwd = t.p.x - x1;
  assert(count(log, 'dodge') === 1 && count(log, 'parryStart') === 0 && back < -1.4 && fwd > 1.8, `Dodge: ${back.toFixed(2)} m backstep, ${fwd.toFixed(2)} m forward hop (no parry)`);
}
{ // A shot through him in the untouchable ticks misses (and flies on); a second dodge waits for the cooldown
  const { w, p, run, log } = setup(100); p.facing = 1;
  const e = still(enemy(w, 'sniper', 110));
  tap(run, 'parry'); run({}, 8);
  w.spawnProjectile({ team: 'e', owner: e, x: p.x + 0.6, y: p.y + 1, vx: -30, vy: 0, ttl: 30, r: 0.2, dmg: 10, kind: 'std' });
  const pr = w.projectiles[w.projectiles.length - 1];
  run({}, 2);
  const through = p.hp === p.maxHp && !pr.dead;
  tap(run, 'parry'); const second = count(log, 'dodge');
  run({}, DODGE.cd); tap(run, 'parry');
  assert(through && second === 1 && count(log, 'dodge') === 2, `A shot passes through the dodge (hp ${p.hp}); the next dodge waits ${DODGE.cd} ticks`);
}
{ // One dodge per airtime; Echo keeps his parry and Sentinel Nova his
  const { p, run, log } = setup(100);
  p.y = 10; p.prevY = 10; p.onGround = false; run({}, 1);
  tap(run, 'parry'); run({}, DODGE.cd + 2); tap(run, 'parry');
  const air = count(log, 'dodge');
  const e = setup(100, ['echo']); tap(e.run, 'parry');
  SETTINGS.novaKit = 'sentinel'; const s = setup(100); tap(s.run, 'parry'); SETTINGS.novaKit = 'marksman';
  assert(air === 1 && count(e.log, 'parryStart') === 1 && count(e.log, 'dodge') === 0 && count(s.log, 'parryStart') === 1,
    'One air dodge per airtime; Echo and Sentinel Nova still parry');
}
{ // Perfect dodge: an attack arriving in the opening ticks slows the enemies close by (and their shots),
  // and gives Overcharge and ultimate charge. A slowed Swarmer covers about half the ground.
  const walked = slow => {
    const { w, p, run, log } = setup(100); p.facing = -1;
    const sw = enemy(w, 'swarmer', 104, 0, { cd: 9999 }); sw.target = p;
    const sn = still(enemy(w, 'sniper', 90));
    if (slow) {
      w.spawnProjectile({ team: 'e', owner: sn, x: p.x - 1.2, y: p.y + 1, vx: 30, vy: 0, ttl: 30, r: 0.2, dmg: 10, kind: 'std' });
      tap(run, 'parry');
    }
    run({}, 4); const x0 = sw.x; run({}, 40);
    return { d: Math.abs(sw.x - x0), log, p, sw };
  };
  const n = walked(false), s = walked(true);
  assert(count(s.log, 'perfectDodge') === 1 && s.sw.slowT > 0 && s.p.overcharge >= DODGE.over - 1 && s.p.ult >= ULT.gain.perfect && s.p.hp === s.p.maxHp &&
    s.d < n.d * 0.7, `Perfect dodge: nearby Swarmer slowed (walks ${s.d.toFixed(2)} m vs ${n.d.toFixed(2)} m), Overcharge ${s.p.overcharge.toFixed(0)}, ultimate +${s.p.ult.toFixed(0)}`);
}
{ // He keeps charging his shot through a dodge
  const { p, run } = setup(100);
  run({ aim: [1, 0], held: { fire: true } }, 20); const c0 = p.chargeT;
  run({ aim: [1, 0], held: { fire: true, parry: true } }, 1); run({ aim: [1, 0], held: { fire: true } }, 10);
  assert(p.chargeT >= c0 + 10 && p.state !== 'ult', `Charging carries on through a dodge (${c0} -> ${p.chargeT} ticks)`);
}

// ---------------------------------------------------------------- Automatic lock-on
{ // Automatic: the nearest enemy in sight is locked with no press; R3 switches; holding R3 lets go and
  // pauses it until the next press
  SETTINGS.lockMode = 'auto';
  const { w, p, run, log } = setup(100);
  const a = still(enemy(w, 'swarmer', 103)), b = still(enemy(w, 'swarmer', 107));
  run({}, 2);
  const first = p.lockT;
  tap(run, 'lock'); const second = p.lockT;
  run({ held: { lock: true } }, LOCK.hold + 2); run({}, 1);
  const off = p.lockT; run({}, 30); const stayOff = !p.lockT;
  tap(run, 'lock'); const back = p.lockT;
  const far = setup(100); still(enemy(far.w, 'swarmer', 100 + LOCK.auto + 3)); far.run({}, 5);
  SETTINGS.lockMode = 'manual';
  const man = setup(100); still(enemy(man.w, 'swarmer', 103)); man.run({}, 5);
  assert(first === a && second === b && off === null && stayOff && back === a && !far.p.lockT && !man.p.lockT && count(log, 'lockOn', e => e.why === 'auto') === 1,
    'Automatic lock-on takes the nearest enemy, R3 switches to the next, holding R3 lets go until the next press; none past range, none in manual mode');
}
{ // Automatic lock-on leaves free aim alone (the right stick or mouse aims where it points) and keeps the
  // Volley spread over the enemies in front
  SETTINGS.lockMode = 'auto';
  const { w, p, run } = setup(100);
  still(enemy(w, 'swarmer', 104, 0));
  run({ aim: [0, 1] }, 3);
  const up = p.aimY > 0.99 && !!p.lockT;
  run({}, 3); const toward = p.aimX > 0.9;
  SETTINGS.lockMode = 'manual';
  assert(up && toward, 'Automatic lock-on: free aim still aims where it points; without it, shots go to the target');
}

// ---------------------------------------------------------------- Rising attacks
{ // Nova's Solar Uppercut (up + melee): he rises, hits three times on the way up and a flare bursts off the fist
  const { w, p, run, log } = setup(100); p.facing = 1;
  const e = enemy(w, 'brute', 100.9, 0, { cd: 9999 }); e.hp = 999; e.armor = 0; e.hitstop = 0;
  const y0 = p.y; let top = y0;
  run({ my: 1, held: { melee: true } }, 1); run({ my: 1 }, 40, () => { top = Math.max(top, p.y); return false; });
  const n = hits(log, e).length;
  assert(log.some(q => q.type === 'swing' && q.id === 'nova_rise') && top - y0 > 2.4 && n >= 3 && count(log, 'riseBlast') === 1,
    `Solar Uppercut: rises ${(top - y0).toFixed(2)} m, ${n} hits, a flare at the top`);
}
{ // Once per airtime in the air; the Sentinel kit and Echo's Pursuit kit have their rising attacks too
  const { p, run, log } = setup(100);
  p.y = 8; p.prevY = 8; p.onGround = false; run({}, 1);
  run({ my: 1, held: { melee: true } }, 1); run({ my: 1 }, 34); run({ my: 1, held: { melee: true } }, 1); run({ my: 1 }, 2);
  const air = log.filter(q => q.type === 'swing' && q.id === 'nova_rise').length;
  SETTINGS.novaKit = 'sentinel'; const s = setup(100); s.run({ my: 1, held: { melee: true } }, 1); SETTINGS.novaKit = 'marksman';
  SETTINGS.echoKit = 'pursuit'; const e = setup(100, ['echo']); e.run({ my: 1, held: { melee: true } }, 1); SETTINGS.echoKit = 'hunter';
  assert(air === 1 && s.p.moveId === 'nova_rise' && e.p.moveId === 'echo_rise' && MOVES.nova_rise.rise && MOVES.echo_rise.rise,
    `Rising attack once per airtime; Sentinel Nova (${s.p.moveId}) and Pursuit Echo (${e.p.moveId}) have theirs`);
}

// ---------------------------------------------------------------- Ultimates
{ // The bar fills from damage dealt and taken, kills and perfect moves, and says when it is full
  const { w, p, run, log } = setup(100);
  const e = still(enemy(w, 'swarmer', 101.4)); e.hp = 3;
  tap(run, 'melee', { aim: [1, 0] }); run({}, 30);
  const dealt = p.ult;
  const f = setup(100); f.w.spawnProjectile({ team: 'e', owner: null, x: f.p.x + 1.5, y: f.p.y + 1, vx: -20, vy: 0, ttl: 20, r: 0.2, dmg: 10, kind: 'std' }); f.run({}, 6);
  const taken = f.p.ult;
  p.ult = ULT.max - 0.5; const post = still(enemy(w, 'post', 101.2)); run({}, 20); tap(run, 'melee', { aim: [1, 0] }); run({}, 30);
  assert(dealt > 0 && count(log, 'kill') === 1 && Math.abs(taken - 10 * ULT.gain.taken) < 0.01 && count(log, 'ultReady') === 1 && p.ult === ULT.max,
    `Ultimate bar: +${dealt.toFixed(1)} from a kill with the Scatter, +${taken.toFixed(1)} from a 10-damage hit; "ready" at ${ULT.max}`);
}
{ // Both triggers together with a full bar starts it; not with a partial bar (the dodge and shot happen);
  // holding fire to charge and then pulling LT is a dodge, not the ultimate
  const part = setup(100); part.p.ult = 60; part.run({ aim: [1, 0], held: { parry: true, fire: true } }, 1); part.run({}, 2);
  const late = setup(100); late.p.ult = ULT.max; late.run({ aim: [1, 0], held: { fire: true } }, 30); late.run({ aim: [1, 0], held: { fire: true, parry: true } }, 1);
  const { p, run, log } = setup(100); p.ult = ULT.max;
  run({ aim: [1, 0], held: { parry: true } }, 1); run({ aim: [1, 0], held: { parry: true, fire: true } }, 1);
  assert(!part.w.ultCast && count(part.log, 'dodge') === 1 && late.p.state === 'dodge' && !late.w.ultCast && count(log, 'ultCast') === 1 && p.state === 'ult' && p.ult === 0,
    'LT + RT within a few ticks with a full bar calls the ultimate; a partial bar or a late second trigger does not');
}
{ // The call freezes the world; the ultimate itself freezes enemies and their shots but not players
  const { w, p, ps, run, log } = setup(100, ['nova', 'echo']);
  const sw = enemy(w, 'swarmer', 106, 0, { cd: 9999 }); sw.hp = 999;
  w.spawnProjectile({ team: 'e', owner: sw, x: 110, y: 1, vx: -10, vy: 0, ttl: 200, r: 0.2, dmg: 10, kind: 'std' });
  const pr = w.projectiles[w.projectiles.length - 1];
  run({}, 2); p.ult = ULT.max;
  run({ 0: { held: { ult: true } } }, 1);
  const sx = sw.x, px = pr.x, ex = ps[1].x;
  run({ 1: { mx: 1 } }, ULT.cast - 4);
  const castFrozen = sw.x === sx && pr.x === px && ps[1].x === ex && w.ultCast.phase === 'cast';
  run({ 1: { mx: 1 } }, 10);
  const runFrozen = w.ultCast && w.ultCast.phase === 'run' && sw.x === sx && pr.x === px && ps[1].x > ex + 0.3;
  assert(castFrozen && runFrozen, `The call freezes everyone; the ultimate freezes enemies and their shots while the other players move`);
}
{ // Supernova: he rises, the beam runs through walls and pulses through everything in line, then the nova
  const { w, p, run, log } = setup(22); p.ult = ULT.max;
  const a = still(enemy(w, 'brute', 27)), b = still(enemy(w, 'brute', 35.5));   // b stands inside the ledge, past its wall at x = 32
  a.hp = b.hp = 9999;
  const y0 = p.y;
  run({ aim: [1, 0], held: { ult: true } }, 1); run({ aim: [1, 0] }, ULT.cast + 30);
  const rose = p.y - y0;
  run({ aim: [1, 0] }, ULT.nova.end);
  const pulses = Math.floor(ULT.nova.beam / ULT.nova.pulse);
  const ha = hits(log, a).length, hb = hits(log, b).length;
  assert(rose > 1.2 && ha >= pulses && hb >= pulses - 1 && count(log, 'ultNova') === 1 && count(log, 'ultEnd') === 1 && p.state === 'normal' && p.mercy > 0 && !w.ultCast &&
    a.armor === 0 && p.ult === 0,
    `Supernova: rises ${rose.toFixed(2)} m, ${ha} and ${hb} hits (one past a wall), armor stripped, the nova, then back to normal`);
}
{ // Thousand Cuts: every enemy close by is cut again and again, then all at once; the ultimate never charges itself
  const { w, p, run, log } = setup(100, ['echo']); p.ult = ULT.max;
  const es = [102, 104, 107, 111].map(x => { const e = still(enemy(w, 'swarmer', x)); e.hp = 9999; return e; });
  const far = still(enemy(w, 'swarmer', 100 + ULT.echo.range + 4)); far.hp = 9999;
  run({ held: { ult: true } }, 1); run({}, ULT.cast + 140);
  const per = es.map(e => hits(log, e).length);
  assert(per.every(n => n >= Math.floor(ULT.echo.strikes / es.length)) && hits(log, far).length === 0 && count(log, 'ultCut') === ULT.echo.strikes &&
    count(log, 'ultFinisher') === 1 && p.state === 'normal' && p.ult === 0,
    `Thousand Cuts: ${ULT.echo.strikes} cuts shared over ${es.length} enemies (${per.join('/')} hits), none on the far one, then the finisher`);
}
{ // Team ultimate: a teammate with a full bar joins during the call; both run at the team power, then the
  // team finisher hits every enemy on screen. Echo + Nova is the Eclipse Protocol.
  const { w, p, ps, run, log } = setup(100, ['nova', 'echo']);
  const e = still(enemy(w, 'brute', 108)); e.hp = 9999;
  p.ult = ULT.max; ps[1].ult = ULT.max;
  run({ 0: { aim: [1, 0], held: { ult: true } } }, 1);
  run({ 0: { aim: [1, 0] } }, 10);
  run({ 0: { aim: [1, 0] }, 1: { held: { parry: true } } }, 1); run({ 0: { aim: [1, 0] }, 1: { held: { parry: true, fire: true } } }, 1);
  const joined = count(log, 'ultJoin') === 1 && ps[1].state === 'ult';
  run({ 0: { aim: [1, 0] } }, ULT.cast + ULT.join + ULT.nova.end + 80, () => !w.ultCast);
  const tf = log.find(q => q.type === 'teamFinisher'), ru = log.find(q => q.type === 'ultRun');
  assert(joined && ru && ru.team && ru.name === 'Eclipse Protocol' && tf && tf.members.length === 2 && hits(log, e).some(h => h.dmg >= ULT.team.dmg * 2 * 0.99) &&
    !w.ultCast && ps.every(q => q.state === 'normal'),
    `Team ultimate: ${ru && ru.name}, joined in the call, finisher on every enemy on screen`);
}
{ // A teammate without a full bar can't join; a new ultimate can't start while one plays out; bosses take less
  const { w, p, ps, run, log } = setup(100, ['nova', 'nova']);
  const B = enemy(w, 'warden', 110, 0, { invuln: 0 }); B.state = 'idle'; B.cd = 9999; B.hitstop = 1e9; B.hp = 9999; B.armor = 0;
  p.ult = ULT.max; ps[1].ult = 50;
  run({ 0: { aim: [1, 0], held: { ult: true } } }, 1); run({ 0: { aim: [1, 0] }, 1: { held: { ult: true } } }, 2);
  const noJoin = count(log, 'ultJoin') === 0;
  run({ 0: { aim: [1, 0] } }, ULT.cast + 20); ps[1].ult = ULT.max; run({ 0: { aim: [1, 0] }, 1: { held: { ult: true } } }, 1);
  const noSecond = count(log, 'ultCast') === 1;
  run({ 0: { aim: [1, 0] } }, 200);
  const perPulse = hits(log, B).filter(h => h.source === 'blast')[0];
  assert(noJoin && noSecond && perPulse && Math.abs(perPulse.dmg - ULT.nova.dmg * ULT.boss) < 0.01,
    `No joining without a full bar; no second ultimate mid-way; a boss takes ${ULT.boss * 100}% (${perPulse && perPulse.dmg.toFixed(2)} a pulse)`);
}
