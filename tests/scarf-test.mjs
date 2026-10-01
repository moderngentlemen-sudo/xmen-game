// Scarf modes: Tether, Veil (camouflage) and Flare (draws attention). Runs the real simulation headless.
import { World } from '../game/js/world.js';
import { createEnemy } from '../game/js/enemies.js';
import { SETTINGS, SCARF, ECHO } from '../game/js/config.js';
SETTINGS.echoKit = 'hunter';
const BT = ['jump', 'dash', 'melee', 'fire', 'parry', 'sig', 'mode'];
function mk(prev, o = {}) {
  const held = {}; for (const b of BT) held[b] = !!(o.held && o.held[b]);
  const pressed = {}, released = {};
  for (const b of BT) { pressed[b] = held[b] && !prev.held[b]; released[b] = !held[b] && !!prev.held[b]; }
  return { mx: o.mx || 0, my: o.my || 0, aimFree: !!o.aim, ax: o.aim ? o.aim[0] : 0, ay: o.aim ? o.aim[1] : 0, held, pressed, released };
}
// Echo is player 0; an optional Nova is player 1 (idle unless given commands).
function setup(x = 99, withNova = null) {
  const w = new World(); w.enemies = [];
  const p = w.addPlayer('test', 'echo'); p.x = x; p.y = 0;
  let q = null;
  if (withNova !== null) { q = w.addPlayer('test2', 'nova'); q.x = withNova; q.y = 0; }
  const prev = { 0: { held: {} }, 1: { held: {} } }; const log = [];
  const run = (o, n = 1, o2 = {}) => {
    for (let i = 0; i < n; i++) {
      const c0 = mk(prev[0], o), c1 = mk(prev[1], o2); prev[0] = c0; prev[1] = c1;
      w.step({ 0: c0, 1: c1 }); log.push(...w.events); w.events.length = 0;
    }
  };
  run({}, 10); p.mercy = 0; if (q) q.mercy = 0;
  return { w, p, q, run, log };
}
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const count = (log, t) => log.filter(e => e.type === t).length;
const tap = (run, b, extra = {}) => { run({ ...extra, held: { [b]: true } }, 1); run(extra, 1); };
const goVeil = (run, p) => { tap(run, 'mode'); run({}, SCARF.veilFade + 2); return p.veiled; };
const goFlare = run => { tap(run, 'mode'); run({}, SCARF.switchCd); tap(run, 'mode'); };
const enemyHitbox = (w, owner, p, dmg = 5) => w.spawnHitbox({ owner, team: 'e', x0: p.x - 0.8, x1: p.x + 0.8, y0: p.y, y1: p.y + 1.8, dmg, kb: [0, 0], instance: w.newInstance(), cat: 'standard' });

{ // One button cycles Tether > Veil > Flare > Tether
  const { p, run, log } = setup();
  const seen = [p.scarfMode];
  for (let i = 0; i < 3; i++) { tap(run, 'mode'); run({}, SCARF.switchCd); seen.push(p.scarfMode); }
  assert(seen.join(' > ') === 'tether > veil > flare > tether' && count(log, 'scarfMode') === 3, `Mode button cycles ${seen.join(' > ')}`);
}
{ // Veil fades Echo out and a nearby enemy loses track of him
  const { w, p, run, log } = setup(99); const e = createEnemy('swarmer', 102, 0); e.cd = 9999; w.enemies.push(e);
  run({}, 20);
  const trackedBefore = e.target === p;
  const hidden = goVeil(run, p);
  run({}, 30);
  assert(trackedBefore && hidden && e.target === null && count(log, 'lostTrack') >= 1 && count(log, 'veilOn') === 1,
    `Veil hides Echo after ${SCARF.veilFade} ticks and the Swarmer loses track (target=${e.target ? 'Echo' : 'none'}, lostTrack=${count(log, 'lostTrack')})`);
}
{ // A hidden Echo is skipped: the enemy goes for Nova even though Echo is closer
  const { w, p, q, run } = setup(99, 105); const e = createEnemy('swarmer', 100.5, 0); e.cd = 9999; w.enemies.push(e);
  goVeil(run, p); run({}, 5);
  assert(e.target === q, `Enemies target Nova instead of the hidden, closer Echo (target=${e.target ? e.target.char : 'none'})`);
}
{ // Ambush: striking from Veil breaks a Shieldbearer's guard head-on and staggers it
  const { w, p, run, log } = setup(99); const e = createEnemy('shield', 100.6, 0); e.cd = 9999; e.shieldDir = -1; w.enemies.push(e);
  goVeil(run, p); e.shieldDir = -1;
  tap(run, 'melee'); run({}, 10);
  assert(count(log, 'ambush') === 1 && count(log, 'blocked') === 0 && e.state === 'stagger' && !p.veiled,
    `Ambush from Veil staggers a Shieldbearer through its guard (ambush=${count(log, 'ambush')}, blocked=${count(log, 'blocked')}, state=${e.state})`);
  log.length = 0; run({}, 100); tap(run, 'melee'); run({}, 10);
  assert(count(log, 'ambush') === 0, 'Only the first strike out of Veil is an ambush');
}
{ // Ambush on a Brute strips a layer of armor and staggers it
  const { w, p, run, log } = setup(99); const b = createEnemy('brute', 100.9, 0); b.cd = 9999; b.slamCd = 9999; w.enemies.push(b);
  goVeil(run, p); tap(run, 'melee'); run({}, 10);
  assert(b.armor === b.armorMax - 1 && b.state === 'stagger', `Ambush breaks Brute armor (${b.armor}/${b.armorMax}) and staggers it (state=${b.state})`);
}
{ // Taking a hit drops Veil without granting an ambush; it re-arms after a quiet spell
  const { w, p, run, log } = setup(99); const dummy = createEnemy('swarmer', 110, 0); dummy.cd = 9999; w.enemies.push(dummy);
  goVeil(run, p); enemyHitbox(w, dummy, p); run({}, 1);
  assert(!p.veiled && p.ambushT === 0 && p.veilBreakT > 0 && count(log, 'playerHit') === 1, `A hit ends Veil (veiled=${p.veiled}, ambush window=${p.ambushT})`);
  p.mercy = 0; run({}, SCARF.veilRearm + SCARF.veilFade - 10);
  const early = p.veiled;
  run({}, 20);   // hitstop pauses Echo's timers for a few ticks
  assert(!early && p.veiled, `Veil re-arms after about ${SCARF.veilRearm + SCARF.veilFade} quiet ticks (not before)`);
}
{ // Planting a trap keeps Veil up; throwing a snare is an attack and drops it
  const { p, run } = setup(99);
  goVeil(run, p);
  tap(run, 'fire', { my: -1 }); run({}, 2);
  const afterPlant = p.veiled;
  run({}, 10); tap(run, 'fire', { aim: [1, 0] });
  assert(afterPlant && !p.veiled && p.ambushT > 0, `Planting keeps Veil (${afterPlant}); throwing breaks it and opens the ambush window (${p.ambushT} ticks left)`);
}
{ // Vanish (Signature in Veil): instantly hidden, spends a scarf charge, and a sniper mid-aim loses him
  const { w, p, run, log } = setup(99); const s = createEnemy('sniper', 107, 0); s.cd = 9999; w.enemies.push(s);
  tap(run, 'mode'); run({}, 2);                       // Veil mode, not hidden yet
  s.state = 'aim'; s.st = 0; s.target = p; w.director.request(s, 'ranged');
  const charges = p.lashCharges;
  tap(run, 'sig');
  assert(p.veiled && p.lashCharges === charges - 1 && s.state === 'idle' && count(log, 'vanish') === 1 && s.token === null,
    `Vanish hides Echo at once and the sniper drops its aim (veiled=${p.veiled}, charges ${charges}>${p.lashCharges}, sniper=${s.state})`);
  const c2 = p.lashCharges; tap(run, 'sig');
  assert(p.lashCharges === c2, 'Vanish is not spent while Echo is already hidden');
}
{ // Flare draws an enemy away from a nearer teammate
  const { w, p, q, run } = setup(99, 101.5); const e = createEnemy('swarmer', 102.5, 0); e.cd = 9999; w.enemies.push(e);
  run({}, 10);
  const tetherTarget = e.target;
  goFlare(run); run({}, 10);
  assert(tetherTarget === q && e.target === p && p.targetedBy === 1,
    `Flare pulls the Swarmer off Nova onto Echo (before=${tetherTarget ? tetherTarget.char : 'none'}, after=${e.target ? e.target.char : 'none'})`);
}
{ // Flare widens the parry window while Echo is targeted
  const late = SCARF.flareParry + 12 - 2;           // later than the normal window, inside Flare's
  const trial = flare => {
    const { w, p, run, log } = setup(99); const e = createEnemy('swarmer', 101, 0); e.cd = 9999; w.enemies.push(e);
    if (flare) goFlare(run);
    run({}, 12);
    tap(run, 'parry'); run({}, late - 2);
    enemyHitbox(w, e, p, 8); run({}, 1);
    return count(log, 'parry') === 1 && count(log, 'playerHit') === 0;
  };
  const inTether = trial(false), inFlare = trial(true);
  assert(!inTether && inFlare, `A parry ${late} ticks in: fails in Tether (${inTether}), succeeds in Flare (${inFlare})`);
}
{ // Flare builds Resolve while enemies are on him
  const res = flare => {
    const { w, p, run } = setup(99);
    for (const x of [101, 97.5]) { const e = createEnemy('swarmer', x, 0); e.cd = 9999; w.enemies.push(e); }
    if (flare) goFlare(run);
    run({}, 120); return p.resolve;
  };
  const r0 = res(false), r1 = res(true);
  assert(r0 < 1 && r1 > 6, `Two enemies on him for 2 s: Resolve ${r0.toFixed(1)} in Tether, ${r1.toFixed(1)} in Flare`);
}
{ // Challenge (Signature in Flare): a sniper already aiming at Nova swings onto Echo
  const { w, p, q, run, log } = setup(99, 103); const s = createEnemy('sniper', 106.5, 0); s.cd = 9999; w.enemies.push(s);
  goFlare(run); run({}, 3);
  s.state = 'aim'; s.st = 0; s.target = q; s.aimX = q.x; s.aimY = q.y + 1;
  const charges = p.lashCharges;
  tap(run, 'sig'); run({}, 2);
  assert(s.target === p && s.taunter === p && Math.abs(s.aimX - p.x) < 0.5 && p.lashCharges === charges - 1 && count(log, 'challenge') === 1,
    `Challenge turns a sniper aiming at Nova onto Echo (target=${s.target ? s.target.char : 'none'}, aim x ${s.aimX.toFixed(1)} vs Echo ${p.x.toFixed(1)})`);
}
{ // Flare's cost: one extra enemy may commit to a melee attack at once
  const { w, run } = setup(99);
  const base = w.director.cap('melee'); goFlare(run);
  assert(w.director.cap('melee') === base + 1, `Melee attack tokens ${base} > ${w.director.cap('melee')} while Flare is on`);
}
{ // Switching modes while reeling lets the tether go; Tether mode still grapples
  const { w, p, run, log } = setup(103); const e = createEnemy('swarmer', 107.5, 0); e.cd = 9999; w.enemies.push(e);
  run({ aim: [1, 0], held: { sig: true } }, 14);
  const leashed = !!p.leash;
  run({ aim: [1, 0], held: { sig: true, mode: true } }, 2);
  assert(leashed && !p.leash && p.scarfMode === 'veil' && count(log, 'leashEnd') === 1, `Tether reels (${leashed}); switching mode releases it (leash=${!!p.leash}, mode=${p.scarfMode})`);
}
{ // Nova has no scarf: the mode button does nothing
  const w = new World(); w.enemies = []; const n = w.addPlayer('test', 'nova'); n.x = 99; n.y = 0;
  let prev = { held: {} };
  for (const o of [{}, { held: { mode: true } }, {}]) { const c = mk(prev, o); prev = c; w.step({ 0: c }); }
  assert(n.scarfMode === 'tether' && !w.events.some(e => e.type === 'scarfMode'), 'Nova ignores the scarf mode button');
}
console.log(`Scarf charges shared by Lash, Vanish and Challenge: ${ECHO.lashCharges}, ${ECHO.lashRecharge / 60}s each`);
{ // A mode press during hitstop is not lost
  const { w, p, run } = setup(99); const post = createEnemy('post', 100.2, 0); post.cd = 9999; w.enemies.push(post);
  run({ held: { melee: true } }, 1); run({}, 1);
  let stopped = false; for (let i = 0; i < 12 && !stopped; i++) { run({}, 1); stopped = p.hitstop > 0; }
  run({ held: { mode: true } }, 1); run({}, 1);
  assert(stopped && p.scarfMode === 'veil', `Mode switch registers during hitstop (hitstop seen=${stopped}, mode=${p.scarfMode})`);
}
