// Version 7: charge-scaled rocket jumps, wall play (and attacking from a wall), the charged dash, Echo's
// staff-rifle and lock-on. Runs the real simulation headless.
import { World } from '../game/js/world.js';
import { createEnemy } from '../game/js/enemies.js';
import { SETTINGS, MARKSMAN, CHARS, WALL, DASH_CHARGE, HUNTER, LOCK, GRAVITY } from '../game/js/config.js';
import { GATES } from '../game/js/level.js';
import { vbTier } from '../game/js/player.js';
SETTINGS.novaKit = 'marksman'; SETTINGS.echoKit = 'hunter'; SETTINGS.lockOn = true; SETTINGS.dashCharge = true; SETTINGS.dashIframes = false;
SETTINGS.lockMode = 'manual';   // these check the lock-on button itself (v9-test covers automatic lock-on)
const BT = ['jump', 'dash', 'melee', 'fire', 'parry', 'sig', 'mode', 'lock'];
function mk(prev, o = {}) {
  const held = {}; for (const b of BT) held[b] = !!(o.held && o.held[b]);
  const pressed = {}, released = {};
  for (const b of BT) { pressed[b] = held[b] && !prev.held[b]; released[b] = !held[b] && !!prev.held[b]; }
  return { mx: o.mx || 0, my: o.my || 0, aimFree: !!o.aim, ax: o.aim ? o.aim[0] : 0, ay: o.aim ? o.aim[1] : 0, held, pressed, released };
}
function setup(x = 99, char = 'nova', y = 0) {
  const w = new World(); w.enemies = [];
  const p = w.addPlayer('test', char); p.x = x; p.y = y; p.prevX = x; p.prevY = y;
  let prev = { held: {} }; const log = [];
  const run = (o = {}, n = 1, each = null) => {
    for (let i = 0; i < n; i++) { const c = mk(prev, o); prev = c; w.step({ 0: c }); log.push(...w.events); w.events.length = 0; if (each && each(i)) return true; }
    return false;
  };
  run({}, 10); p.mercy = 0;
  return { w, p, run, log };
}
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const count = (log, t, f = () => true) => log.filter(e => e.type === t && f(e)).length;
const last = (log, t) => [...log].reverse().find(e => e.type === t);
const enemy = (w, type, x, y = 0, o = {}) => { const e = createEnemy(type, x, y, { cd: 9999, slamCd: 9999, ...o }); e.hitstop = 1e9; w.enemies.push(e); return e; };
const M = MARKSMAN, C = M.charge, R = M.rocket;

// ---------------------------------------------------------------- Rocket jump
function rocket(n, attach = 'lance', extra = null) {
  const t = setup(99); t.p.attachment = attach;
  const y0 = t.p.y; let top = y0;
  t.run({ aim: [0, -1], held: { fire: true } }, n - 1);
  const preview = t.w.rocketPreview(t.p);
  t.run({ aim: [0, -1], held: { fire: true } }, 1); t.run({ aim: [0, -1] }, 1);
  const ys = [];
  for (let i = 0; i < 120; i++) { t.run(extra ? extra(i, t.p) : {}, 1); ys.push(t.p.y); top = Math.max(top, t.p.y); }
  return { h: top - y0, rj: t.log.filter(e => e.type === 'rocketJump'), preview, ys, p: t.p, log: t.log, w: t.w };
}
{ // Height climbs steadily with how long the shot was charged
  const ns = [0, 1, 2, 3, 4, 5].map(i => Math.round(C[0] + 1 + i * (C[2] - C[0] - 6) / 5)), hs = ns.map(n => rocket(n).h);
  const rising = hs.every((h, i) => i === 0 || h > hs[i - 1] + 0.3);
  const l3 = rocket(C[2] + M.perfectWindow + 4), perf = rocket(C[2] + 2);
  const t = setup(99); t.run({ aim: [0, -1], held: { fire: true } }, 1); t.run({ aim: [0, -1] }, 30);
  assert(rising && hs[0] > 3.2 && l3.h > 7.5 && perf.h > 9.5 && count(t.log, 'rocketJump') === 0,
    `Rocket height rises with charge time: ${ns.map((n, i) => `${n}t ${hs[i].toFixed(1)} m`).join(', ')}; level 3 ${l3.h.toFixed(2)} m, Perfect ${perf.h.toFixed(2)} m; a tap does not launch`);
}
{ // Every attachment launches, the Arc highest, and the apex marker predicts the real peak
  const r = { lance: rocket(60, 'lance'), volley: rocket(60, 'volley'), arc: rocket(60, 'arc'), prism: rocket(60, 'prism') };
  const off = Object.values(r).map(q => Math.abs(q.preview.apex - q.h));
  assert(Object.values(r).every(q => q.rj.length === 1) && r.arc.h > r.lance.h && r.lance.h > r.prism.h && r.prism.h > r.volley.h && Math.max(...off) < 0.12,
    `At 60 ticks: Arc ${r.arc.h.toFixed(2)}, Lance ${r.lance.h.toFixed(2)}, Prism ${r.prism.h.toFixed(2)}, Volley ${r.volley.h.toFixed(2)} m; apex marker off by at most ${Math.max(...off).toFixed(3)} m`);
}
{ // The launch pauses on impact for a few ticks, then leaves; the camera pulls ahead of the climb
  const q = rocket(C[2] + 2, 'arc');
  const ev = q.rj[0], frozen = q.ys.slice(0, R.freeze[2] - 1).every(y => y === 0), rose = q.ys[R.freeze[2] + 3] > 0.5;
  const big = ev.h >= 9.5;
  // While he lines it up, the camera eases back until the apex is in frame
  const t = setup(99); t.p.attachment = 'arc';
  t.run({ aim: [0, -1], held: { fire: true } }, C[2] + 1);
  const pv = t.w.rocketPreview(t.p), top = t.w.cam.y + t.w.cam.halfH;
  assert(ev.power > 0.99 && ev.perfect && frozen && rose && big && pv && top > pv.apex,
    `Perfect Arc rocket: power ${ev.power.toFixed(2)}, ${R.freeze[2]}-tick impact pause, then a ${ev.h.toFixed(1)} m launch; lining it up frames the apex (${pv && pv.apex.toFixed(1)} m, frame top ${top.toFixed(1)} m)`);
}
{ // A jump pressed during the climb never cuts it short, and the double jump is kept for the apex
  const plain = rocket(C[2] + 12, 'lance');
  const early = rocket(C[2] + 12, 'lance', (i, p) => (i === 6 ? { held: { jump: true } } : {}));
  const apex = rocket(C[2] + 12, 'lance', (i, p) => (p.vy < 1 && p.vy > -1 && !p.dj ? (p.dj = true, { held: { jump: true } }) : {}));
  assert(Math.abs(early.h - plain.h) < 0.05 && apex.h > plain.h + 2 && count(apex.log, 'djump') === 1,
    `Jump mid-climb: ${plain.h.toFixed(2)} vs ${early.h.toFixed(2)} m (unchanged); double jump at the apex adds ${(apex.h - plain.h).toFixed(2)} m`);
}
{ // Rocket, double jump, boosters and a Recoil Burst hop from the arena's highest perch cannot clear a sealed gate
  const t = setup(94); GATES.L = true; GATES.R = true; t.w.arena.state = 'wave2';
  const p = t.p; p.x = 94; p.y = 5.4; p.prevX = 94; p.prevY = 5.4; p.attachment = 'arc'; t.run({}, 3);
  let top = p.y, wallDirs = 0;
  t.run({ aim: [0, -1], held: { fire: true } }, C[2] + 1); t.run({ aim: [0, -1] }, 1);
  t.run({ mx: 1 }, 200, () => {
    top = Math.max(top, p.y); if (p.wallDir) wallDirs++;
    if (p.vy < 0.5 && p.jumpsUsed === 0 && p.rocketT === 0 && !p.dj) { p.dj = 1; return false; }
    return false;
  });
  // A second pass with every extra: double jump at the apex, boosters, then an air burst aimed down
  const u = setup(94); GATES.L = true; GATES.R = true; u.w.arena.state = 'wave2';
  const q = u.p; q.x = 94; q.y = 5.4; q.prevX = 94; q.prevY = 5.4; q.attachment = 'arc'; u.run({}, 3);
  let top2 = q.y, phase = 0;
  u.run({ aim: [0, -1], held: { fire: true } }, C[2] + 1); u.run({ aim: [0, -1] }, 1);
  for (let i = 0; i < 300; i++) {
    let o = { mx: 0.5 };
    if (phase === 0 && q.vy < 1 && q.rocketT < 40) { o = { held: { jump: true } }; phase = 1; }
    else if (phase === 1 && q.vy < 0.5) { o = { held: { jump: true } }; phase = 2; }
    else if (phase === 2) { o = { held: { jump: q.fuel > 0 } }; if (q.fuel <= 0) phase = 3; }
    else if (phase === 3) { o = { aim: [0, -1], held: { melee: true } }; phase = 4; }
    u.run(o, 1); top2 = Math.max(top2, q.y);
  }
  GATES.L = false; GATES.R = false;
  assert(top < 30 && top2 < 30 && wallDirs === 0 && q.x < 96.2,
    `From the perch (5.4 m): rocket ${top.toFixed(1)} m, every extra ${top2.toFixed(1)} m, gate top 30 m; the gate offers no wall slide`);
}

// ---------------------------------------------------------------- Wall play
// The floating practice wall in the gym: x 28.5-29.3, y 2.1-8.6. Approach it from the left.
const WALL_X = 28.5;
function onWall(char = 'nova', y = 7, vy = -12) {
  const t = setup(20, char); const p = t.p;
  p.x = WALL_X - p.w / 2 - 0.02; p.y = y; p.prevX = p.x; p.prevY = y; p.vy = vy; p.onGround = false;
  return t;
}
{ // The slide eases in: a fall is braked, it grips, then speeds up to the slide speed; down slides faster
  const { p, run } = onWall('nova');
  run({ mx: 1 }, 1);   // the first tick makes contact
  const vys = []; run({ mx: 1 }, 40, () => { vys.push(p.vy); return false; });
  const c = CHARS.nova.wall;
  const braked = vys[0] > -13 && vys[0] < -WALL.gripSpeed - 1, grip = Math.abs(vys[WALL.grip] + WALL.gripSpeed) < 0.05;
  const full = Math.abs(vys[35] + c.slide) < 0.05, mid = vys[WALL.grip + 7] < -WALL.gripSpeed - 0.3 && vys[WALL.grip + 7] > -c.slide + 0.3;
  const f = onWall('nova'); f.run({ mx: 1 }, 30); f.run({ mx: 1, my: -1 }, 10);
  assert(braked && grip && mid && full && Math.abs(f.p.vy + c.slide * WALL.fast) < 0.05,
    `Wall slide: fall braked (${vys[0].toFixed(1)}), grips at ${vys[WALL.grip].toFixed(2)}, eases to ${vys[35].toFixed(2)} m/s; down slides at ${f.p.vy.toFixed(2)}`);
}
{ // Facing away from the wall; a shot with the stick held toward the wall goes out from it
  const { w, p, run, log } = onWall('nova');
  run({ mx: 1 }, 12);
  const facing = p.facing, sliding = p.wallSliding;
  run({ mx: 1, held: { fire: true } }, 1); run({ mx: 1 }, 1);
  const shot = w.projectiles.find(q => q.kind === 'shot');
  assert(sliding && facing === -1 && shot && shot.vx < 0 && p.wallSliding, `Sliding Nova faces out (facing ${facing}) and his shot flies away from the wall (vx ${shot && shot.vx.toFixed(0)})`);
}
{ // Letting go of the stick keeps the grip for a moment, then lets go
  const { p, run } = onWall('echo');
  run({ mx: 1 }, 20);
  const stuck = []; run({}, WALL.stick + 4, () => { stuck.push(p.wallSliding); return false; });
  assert(stuck.slice(0, WALL.stick - 1).every(Boolean) && !stuck[stuck.length - 1], `Grip holds ${stuck.filter(Boolean).length} ticks after letting go of the stick, then releases`);
}
{ // Press away, then jump a few ticks later: still a wall jump (a leap)
  const { p, run, log } = onWall('nova');
  run({ mx: 1 }, 20); run({ mx: -1 }, 3); run({ mx: -1, held: { jump: true } }, 1);
  const wj = last(log, 'walljump');
  assert(wj && !wj.climb && Math.abs(p.vx + CHARS.nova.wall.jumpVx) < 1.2, `Away, then jump 3 ticks later: wall leap (vx ${p.vx.toFixed(1)})`);
}
{ // Wall coyote: a jump just after leaving the wall still wall-jumps; later it is a double jump
  const late = k => {
    const t = onWall('echo'); t.run({ mx: 1 }, 20);
    t.p.x -= 0.4; t.run({}, 1);   // off the wall (e.g. pushed), no contact any more
    t.run({}, k); t.run({ held: { jump: true } }, 1);
    return { wj: count(t.log, 'walljump'), dj: count(t.log, 'djump') };
  };
  const a = late(3), b = late(WALL.coyote + 2);
  assert(a.wj === 1 && a.dj === 0 && b.wj === 0 && b.dj === 1, `Jump 4 ticks off the wall: wall jump; ${WALL.coyote + 3} ticks off: double jump`);
}
{ // Climb kick vs leap, and climbing a single wall
  const kick = mx => { const t = onWall('nova', 5); t.run({ mx: 1 }, 15); const x0 = t.p.x; t.run({ mx, held: { jump: true } }, 1); t.run({ mx, held: { jump: true } }, 10); return { dx: x0 - t.p.x, t }; };
  const climb = kick(1), leap = kick(-1);
  const { p, run, log } = onWall('echo', 2.3, -2);
  const y0 = p.y; let rel = false, top = y0;
  // Hold jump; let go for one tick whenever he is back on the wall, so the next tick is a fresh press
  for (let i = 0; i < 150; i++) {
    if (p.wallDir !== 0 && p.vy < 8 && !rel) { run({ mx: 1 }, 1); rel = true; } else { run({ mx: 1, held: { jump: true } }, 1); rel = false; }
    top = Math.max(top, p.y);
  }
  assert(climb.dx < 0.8 && leap.dx > 1.6 && top > y0 + 3 && count(log, 'walljump', e => e.climb) >= 2,
    `Climb kick pushes out ${climb.dx.toFixed(2)} m, leap ${leap.dx.toFixed(2)} m; Echo climbs ${(top - y0).toFixed(1)} m up a single wall with climb kicks`);
}
{ // Attacking from a wall: Echo's air strings hit a drone on the open side and he keeps sliding
  const { w, p, run, log } = onWall('echo', 3.4, -2);
  const d = enemy(w, 'drone', WALL_X - 1.35, 3.6);
  run({ mx: 1 }, 12);
  let held = 0, n = 0, minVy = 0;
  run({ mx: 1, held: { melee: true } }, 1); run({ mx: 1 }, 1);
  run({ mx: 1 }, 14, () => { n++; if (p.wallDir !== 0) held++; minVy = Math.min(minVy, p.vy); return false; });
  assert(count(log, 'hit', h => h.e === d) >= 1 && held === n && minVy > -CHARS.echo.wall.slide - 0.1 && p.facing === -1,
    `Echo swings from the wall: ${count(log, 'hit', h => h.e === d)} hit on the drone, on the wall ${held}/${n} ticks, never falls faster than the slide (${minVy.toFixed(1)} m/s)`);
}
{ // Nova's Recoil Burst from the wall pushes him into it, not off it
  const { w, p, run, log } = onWall('nova', 5, -2);
  run({ mx: 1 }, 12); run({ mx: 1, held: { melee: true } }, 1); run({ mx: 1 }, 6);
  const pel = w.projectiles.filter(q => q.kind === 'pellet');
  assert(count(log, 'burst') === 1 && pel.length > 0 && pel.every(q => q.vx < 0) && p.wallSliding, `Recoil Burst from the wall fires out (${pel.length} pellets) and he stays on the wall`);
}

// ---------------------------------------------------------------- Charged dash
function dashDist(holdTicks, o = {}) {
  const t = setup(0); const x0 = t.p.x;
  t.run({ held: { dash: true } }, holdTicks); t.run(o, 60);
  return { d: t.p.x - x0, ev: last(t.log, 'dash'), log: t.log, p: t.p };
}
{ // Hold to charge through three levels; each level dashes further; a tap is an ordinary dash
  const tap = dashDist(2), l1 = dashDist(DASH_CHARGE.charge[0] + 1), l2 = dashDist(DASH_CHARGE.charge[1] + 1), l3 = dashDist(DASH_CHARGE.charge[2] + 1);
  const levels = count(l3.log, 'dashLevel');
  const x = setup(0); x.run({ mx: 1, held: { dash: true } }, 1);
  assert(tap.ev.level === 0 && l1.ev.level === 1 && l2.ev.level === 2 && l3.ev.level === 3 && levels === 3 &&
    l1.d > tap.d + 0.8 && l2.d > l1.d + 0.8 && l3.d > l2.d + 0.8 && x.p.state === 'dash',
    `Dash distance: tap ${tap.d.toFixed(1)} m, level 1 ${l1.d.toFixed(1)}, level 2 ${l2.d.toFixed(1)}, level 3 ${l3.d.toFixed(1)} m; a dash with a direction starts on the press`);
}
{ // Level 2 is invulnerable at the start; level 3 strikes through enemies and primes a tier 3 Velocity Break
  const t = setup(0); t.run({ held: { dash: true } }, DASH_CHARGE.charge[1] + 1); t.run({}, 3);
  const inv2 = t.p.iframe;
  const o = setup(0); o.run({ held: { dash: true } }, 2); o.run({}, 3);
  const inv0 = o.p.iframe;
  const s = setup(0); const e1 = enemy(s.w, 'swarmer', 3, 0), e2 = enemy(s.w, 'swarmer', 5.5, 0);
  s.run({ held: { dash: true } }, DASH_CHARGE.charge[2] + 1); s.run({}, 3);
  const tier = vbTier(s.p); s.run({}, 30);
  assert(inv2 && !inv0 && tier === 3 && count(s.log, 'hit', h => h.e === e1) === 1 && count(s.log, 'hit', h => h.e === e2) === 1 && s.p.x > 6,
    `Level 2 dash invulnerable (${inv2}), ordinary not (${inv0}); level 3 hits both enemies in its path once each and primes VB ${tier}`);
}
{ // Jump cancels the charge; the stick aims the release; the setting turns it off
  const j = setup(0); j.run({ held: { dash: true } }, 20); j.run({ held: { dash: true, jump: true } }, 1);
  const cancelled = j.p.state === 'normal' && count(j.log, 'jump') === 1 && count(j.log, 'dash') === 0;
  const a = setup(0); a.run({ held: { dash: true } }, 40); a.run({ mx: -1, my: 1 }, 1);
  const aimed = last(a.log, 'dash');
  SETTINGS.dashCharge = false; const off = setup(0); off.run({ held: { dash: true } }, 1); SETTINGS.dashCharge = true;
  assert(cancelled && aimed && aimed.dx < 0 && aimed.dy > 0 && off.p.state === 'dash',
    `Jump cancels the charge; release aimed up-left dashes (${aimed && aimed.dx.toFixed(2)}, ${aimed && aimed.dy.toFixed(2)}); with the setting off a neutral dash is instant`);
}

// ---------------------------------------------------------------- Echo's staff-rifle
{ // Tap throws a snare (on release); holding scopes the sniper rifle, and it hits an enemy 31 m away
  const t = setup(58, 'echo'); t.run({ aim: [1, 0], held: { fire: true } }, 2); t.run({ aim: [1, 0] }, 2);
  const tap = count(t.log, 'snareThrow') === 1 && count(t.log, 'snipe') === 0;
  const r = setup(61, 'echo'); const far = enemy(r.w, 'shield', 92, 0); far.shieldDir = 1;
  r.run({ aim: [1, 0], held: { fire: true } }, 20); r.run({ aim: [1, 0] }, 10);
  const shot = last(r.log, 'snipe');
  assert(tap && shot && !shot.full && count(r.log, 'hit', h => h.e === far) === 1 && count(r.log, 'snareThrow') === 0,
    `Tap fire throws a snare; a scoped shot hits an enemy 31 m away (${count(r.log, 'hit', h => h.e === far)} hit)`);
}
{ // He moves slower with the rifle up
  const t = setup(0, 'echo'); t.run({ mx: 1 }, 40); const run = t.p.vx;
  t.run({ mx: 1, held: { fire: true } }, 40); const aimV = t.p.vx;
  assert(Math.abs(aimV - run * HUNTER.rifle.slow) < 0.2, `Rifle up: ${aimV.toFixed(2)} m/s vs ${run.toFixed(2)} running`);
}

// ---------------------------------------------------------------- Lock-on
{ // Press to lock the best target (in front beats behind), aim follows it, tap cycles, hold lets go
  const { w, p, run, log } = setup(100);
  const front = enemy(w, 'swarmer', 105, 0), back = enemy(w, 'swarmer', 96.5, 0), high = enemy(w, 'drone', 104, 4);
  p.facing = 1;
  run({ held: { lock: true } }, 1); run({}, 1);
  const first = p.lockT;
  const c = { x: p.x, y: p.y + p.h * 0.62 }, dx = first.x - c.x, dy = first.y + first.h * 0.55 - c.y, m = Math.hypot(dx, dy);
  const aimed = (p.aimX * dx + p.aimY * dy) / m > 0.999;
  run({ held: { lock: true } }, 2); run({}, 1);
  const second = p.lockT;
  run({ held: { lock: true } }, LOCK.hold + 1); run({}, 1);
  assert([front, high].includes(first) && aimed && second && second !== first && p.lockT === null &&
    count(log, 'lockOn') === 1 && count(log, 'lockSwitch') === 1 && count(log, 'lockOff') === 1,
    `Lock picks a target in front (${first.type}), aim follows it, a tap cycles (${second && second.type}), holding lets go`);
}
{ // The lock jumps to the next target when this one dies, and lets go when none are left
  const { w, p, run, log } = setup(100);
  const a = enemy(w, 'swarmer', 104, 0), b = enemy(w, 'swarmer', 107, 0);
  run({ held: { lock: true } }, 1); run({}, 1);
  const t0 = p.lockT; t0.hp = 0.01;
  w.spawnHitbox({ owner: p, team: 'p', x0: t0.x - 1, x1: t0.x + 1, y0: 0, y1: 2, dmg: 5, poise: 0, kb: [0, 0], instance: w.newInstance() });
  run({}, 12);   // the killing blow's hitstop holds the attacker (and his lock) for a few ticks
  const t1 = p.lockT; t1.hp = 0.01;
  w.spawnHitbox({ owner: p, team: 'p', x0: t1.x - 1, x1: t1.x + 1, y0: 0, y1: 2, dmg: 5, poise: 0, kb: [0, 0], instance: w.newInstance() });
  run({}, 12);
  assert(t1 && t1 !== t0 && t1.dead && p.lockT === null && count(log, 'lockSwitch', e => e.why === 'switch') === 1 && count(log, 'lockOff') === 1,
    `Target down: the lock moves to the next one, and lets go after the last`);
}
{ // Locked Volley: every dart seeks the locked target; homing lance curves to it
  const { w, p, run } = setup(100);
  const near = enemy(w, 'swarmer', 104, 0), locked = enemy(w, 'drone', 109, 3.5);
  p.attachment = 'volley';
  run({ held: { lock: true } }, 1); run({}, 1);
  if (p.lockT !== locked) { run({ held: { lock: true } }, 1); run({}, 1); }
  run({ held: { fire: true } }, C[1] + 1); run({}, 1);
  const darts = w.projectiles.filter(q => q.kind === 'dart');
  assert(p.lockT === locked && darts.length === M.volley.darts[2] && darts.every(q => q.seek.target === locked), `All ${darts.length} Volley darts seek the locked drone`);
}
{ // Melee magnetism: locked Echo turns to a close target and steps in
  const lunge = lock => {
    const t = setup(100, 'echo'); const e = enemy(t.w, 'swarmer', 102.6, 0);
    t.p.facing = -1;
    if (lock) { t.run({ held: { lock: true } }, 1); t.run({}, 1); }
    t.run({ held: { melee: true } }, 1); t.run({}, 6);
    return { facing: t.p.facing, x: t.p.x, hit: count(t.log, 'hit', h => h.e === e) };
  };
  const a = lunge(false), b = lunge(true);
  assert(a.facing === -1 && a.hit === 0 && b.facing === 1 && b.hit === 1, `Without lock he swings the way he faces (${a.hit} hit); locked he turns and steps in (${b.hit} hit)`);
}
{ // Out of range lets go
  const { w, p, run, log } = setup(100);
  const e = enemy(w, 'swarmer', 110, 0);
  run({ held: { lock: true } }, 1); run({}, 1);
  e.x = 100 + LOCK.keep + 2; run({}, 2);
  assert(p.lockT === null && count(log, 'lockOff', q => q.why === 'range') === 1, `A target beyond ${LOCK.keep} m releases the lock`);
}
