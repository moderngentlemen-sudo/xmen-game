// X-Men: the five heroes on the two Nova Striker frames. Cyclops (optic blasts from the visor, Visor
// Overdrive, no hover), Storm (flight, Squall, Eye of the Storm), Jean Grey (TK Shield, levitation, Phoenix
// Force), Wolverine (Drill Claw, Berserker Rage, healing factor) and Psylocke (the Hunter kit). Runs the real
// simulation headless.
import { World } from '../game/js/world.js';
import { createEnemy } from '../game/js/enemies.js';
import { SETTINGS, CHARS, HEROES, MARKSMAN, SUB, ULT, MOVES, VISOR, SQUALL, DRILL, BERSERK, HEAL, BOOST, AEGIS, DASH_SLASH, kitOf, ultName, attachLook, subLook } from '../game/js/config.js';
import { muzzle } from '../game/js/player.js';
import { forceBossAttack } from '../game/js/bosses.js';
SETTINGS.novaKit = 'marksman'; SETTINGS.echoKit = 'hunter'; SETTINGS.lockOn = true; SETTINGS.lockMode = 'manual'; SETTINGS.dashCharge = true;
SETTINGS.dashIframes = false; SETTINGS.difficulty = 'normal'; SETTINGS.barks = true;
const BT = ['jump', 'dash', 'melee', 'fire', 'parry', 'sig', 'mode', 'lock', 'sub', 'ult'];
function mk(prev, o = {}) {
  const held = {}; for (const b of BT) held[b] = !!(o.held && o.held[b]);
  const pressed = {}, released = {};
  for (const b of BT) { pressed[b] = held[b] && !prev.held[b]; released[b] = !held[b] && !!prev.held[b]; }
  return { mx: o.mx || 0, my: o.my || 0, aimFree: !!o.aim, ax: o.aim ? o.aim[0] : 0, ay: o.aim ? o.aim[1] : 0, held, pressed, released };
}
function setup(x = 99, chars = ['cyclops'], y = 0) {
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
const still = e => { e.hitstop = 1e9; return e; };
const hits = (log, e) => log.filter(h => h.type === 'hit' && h.e === e);
const tap = (run, b, o = {}) => { run({ ...o, held: { ...(o.held || {}), [b]: true } }, 1); run(o, 1); };
const hold = (run, b, n, o = {}) => { run({ ...o, held: { ...(o.held || {}), [b]: true } }, n); run(o, 1); };
// Climb as high as possible with jump held: jump, double jump, then (where the hero has it) hover or flight
function climb(hero) {
  const { p, run } = setup(100, [hero]);
  run({ held: { jump: true } }, 1); run({ held: { jump: true } }, 18); run({}, 2);
  let top = p.y; run({ held: { jump: true } }, 12); run({}, 2);   // the double jump
  for (let i = 0; i < 260; i++) { run({ held: { jump: true } }); top = Math.max(top, p.y); }   // a third press holds the hover
  return top;
}

// ---------------------------------------------------------------- The roster
{
  const ok = HEROES.length === 5 && HEROES.every(h => CHARS[h] && !CHARS[h].hidden && ['nova', 'echo'].includes(CHARS[h].arch) && ULT.names[h]) &&
    CHARS.nova.hidden && CHARS.echo.hidden;
  const frames = HEROES.map(h => `${CHARS[h].name} (${CHARS[h].arch})`).join(', ');
  assert(ok, `Hero select: ${frames}; Nova and Echo stay as hidden reference frames`);
}
{ // Each hero joins with the first piece of their own loadout, on their frame's body
  const { ps } = setup(99, HEROES.slice(0, 4));
  const { ps: ps2 } = setup(99, ['psylocke']);
  const all = [...ps, ...ps2], ok = all.every(p => p.arch === CHARS[p.char].arch && p.h === CHARS[p.char].height &&
    (p.arch === 'echo' || (kitOf(p).attachments[0] === p.attachment && kitOf(p).subs[0] === p.sub)));
  assert(ok, `Loadouts on joining: ${all.filter(p => p.arch === 'nova').map(p => `${p.char} ${p.attachment}/${p.sub}`).join(', ')}`);
}
{ // The mode button cycles only the hero's own attachments, LB only their own secondary powers
  const { p, run } = setup(99, ['cyclops']);
  const seen = [p.attachment];
  for (let i = 0; i < 3; i++) { tap(run, 'mode'); seen.push(p.attachment); run({}, MARKSMAN.switchCd); }
  const subs = [p.sub];
  for (let i = 0; i < 2; i++) { tap(run, 'sub'); subs.push(p.sub); run({}, SUB.switchCd); }
  const s = setup(99, ['storm']), ss = [s.p.sub];
  for (let i = 0; i < 3; i++) { tap(s.run, 'sub'); ss.push(s.p.sub); s.run({}, SUB.switchCd); }
  assert(seen.join('>') === 'lance>prism>volley>lance' && subs.join('>') === 'scatter>grenade>scatter' && ss.join('>') === 'chain>well>grenade>chain',
    `Cyclops cycles ${seen.map(k => attachLook(p, k).name).join(' > ')} and ${subs.map(k => subLook(p, k).name).join(' > ')}; Storm ${ss.map(k => subLook(s.p, k).name).join(' > ')}`);
}
{ // Swapping heroes swaps the loadout and the frame; a hero's Signature cooldown is their own
  const { w, p, run } = setup(99, ['wolverine']);
  tap(run, 'sig'); const raging = p.berserkT > 0;
  w.swapCharacter(p, 'cyclops'); run({}, 2);
  const cyc = p.arch === 'nova' && kitOf(p).attachments.includes(p.attachment) && p.sigCd === 0 && p.berserkT === 0;
  tap(run, 'sig'); const visorCd = p.sigCd;
  w.swapCharacter(p, 'wolverine'); run({}, 2);
  const back = p.arch === 'echo' && p.sigCd > BERSERK.cd - 20;
  w.swapCharacter(p, 'cyclops'); run({}, 2);
  assert(raging && cyc && back && p.sigCd > 0 && p.sigCd <= visorCd,
    `Swap: rage ends with its cooldown kept for Wolverine (${back}); Cyclops's Visor cooldown waits for him (${p.sigCd} of ${VISOR.cd})`);
}

// ---------------------------------------------------------------- Cyclops
{ // Optic blasts leave from the visor; a charged release does too
  const { p, run, log } = setup(99, ['cyclops']);
  tap(run, 'fire', { aim: [1, 0] });
  const shot = log.find(e => e.type === 'shot');
  const eye = p.y + p.h * 0.9;
  hold(run, 'fire', MARKSMAN.charge[1] + 2, { aim: [1, 0] });
  const lance = log.filter(e => e.type === 'shot' && e.level > 0)[0];
  const pr = p.char && muzzle(p);
  assert(shot && Math.abs(shot.y - eye) < 0.05 && lance && Math.abs(lance.y - eye) < 0.05 && Math.abs(pr.y - eye) < 1e-6,
    `Cyclops fires from the visor (${shot && shot.y.toFixed(2)} m, chest would be ${(p.y + p.h * 0.62).toFixed(2)} m)`);
}
{ // Visor Overdrive: Overcharge fills, a flare throws back what is close, and the cooldown holds a second press
  const { w, p, run, log } = setup(99, ['cyclops']);
  const sw = still(enemy(w, 'swarmer', 100.6)); sw.hp = 99;
  const far = still(enemy(w, 'swarmer', 106)); far.hp = 99;
  tap(run, 'sig');
  const filled = p.overcharge >= VISOR.over - 1 && count(log, 'visor') === 1;
  run({}, 30); tap(run, 'sig');
  assert(filled && hits(log, sw).length === 1 && hits(log, far).length === 0 && count(log, 'visor') === 1 && p.sigCd > VISOR.cd - 40,
    `Visor Overdrive: Overcharge ${p.overcharge.toFixed(0)}, the flare hits the close Sentinel only, then ${VISOR.cd / 60} s of cooldown`);
}
{ // Overcharge from the visor makes the next charged release hit harder (the shield dome's rule)
  const dmgOf = over => {
    const { w, p, run, log } = setup(99, ['cyclops']);
    const b = still(enemy(w, 'brute', 104)); b.hp = 999; b.armor = 0;
    if (over) { tap(run, 'sig'); run({}, 2); }
    hold(run, 'fire', MARKSMAN.charge[2] + 30, { aim: [1, 0] }); run({}, 30);
    return hits(log, b).filter(h => h.source === 'proj').reduce((s, h) => s + h.dmg, 0);
  };
  const plain = dmgOf(false), boosted = dmgOf(true);
  assert(boosted > plain * 1.3, `Visor Overdrive: a level 3 Piercing Blast deals ${boosted.toFixed(1)} instead of ${plain.toFixed(1)}`);
}
{ // Cyclops has no hover: holding jump after the double jump does nothing more
  const { p, run, log } = setup(100, ['cyclops']);
  run({ held: { jump: true } }, 1); run({ held: { jump: true } }, 18); run({}, 2); run({ held: { jump: true } }, 1);
  run({ held: { jump: true } }, 40); run({}, 2); run({ held: { jump: true } }, 30);
  assert(count(log, 'thrustOn') === 0 && !p.thrusting && p.fuel === 0, 'Cyclops has no boosters: jump, double jump, then he falls');
}

// ---------------------------------------------------------------- Storm and Jean
{ // Storm flies: with jump held she climbs far above the double jump and above Jean's levitation and Nova's hover
  const storm = climb('storm'), jean = climb('jean'), nova = climb('nova'), cyc = climb('cyclops');
  assert(storm > jean + 2 && jean > nova + 0.5 && nova > cyc + 0.5,
    `Climb with jump held: Storm ${storm.toFixed(1)} m, Jean ${jean.toFixed(1)} m, Nova ${nova.toFixed(1)} m, Cyclops ${cyc.toFixed(1)} m`);
}
{ // Squall: shots in reach are blown away, close enemies thrown back, Storm lifted in the air, then a cooldown
  const { w, p, run, log } = setup(99, ['storm']);
  const sw = still(enemy(w, 'swarmer', 101.5)); sw.hp = 99;
  sw.hitstop = 0; sw.cd = 9999;
  w.spawnProjectile({ team: 'e', owner: sw, x: 102.5, y: 1.1, vx: -4, vy: 0, ttl: 200, r: 0.2, dmg: 10, kind: 'std' });
  w.spawnProjectile({ team: 'e', owner: sw, x: 110, y: 1.1, vx: 0, vy: 0, ttl: 200, r: 0.2, dmg: 10, kind: 'std' });
  const near = w.projectiles[w.projectiles.length - 2], farShot = w.projectiles[w.projectiles.length - 1];
  tap(run, 'sig'); run({}, 6);
  const blown = near.dead && !farShot.dead && count(log, 'squall') === 1 && hits(log, sw).length === 1 && sw.x > 102;
  p.y = 8; p.prevY = 8; p.vy = -5; p.onGround = false; p.sigCd = 0; p.fuel = 10;
  tap(run, 'sig');
  assert(blown && p.vy > 0 && p.fuel >= 10 + SQUALL.fuel - 5 && p.sigCd > SQUALL.cd - 5,
    `Squall: the near shot is gone, the Sentinel thrown to x ${sw.x.toFixed(1)}; in the air it lifts her (vy ${p.vy.toFixed(1)}) and tops up flight`);
}
{ // Jean's TK Shield is the shield dome: up on the Signature, it takes a hit for her
  const { w, p, run, log } = setup(99, ['jean']);
  tap(run, 'sig'); run({}, 2);
  const sw = enemy(w, 'swarmer', 103);
  w.spawnProjectile({ team: 'e', owner: sw, x: 101, y: 1.1, vx: -10, vy: 0, ttl: 200, r: 0.2, dmg: 10, kind: 'std' });
  run({}, 20);
  assert(count(log, 'aegisOn') === 1 && count(log, 'aegisHit') === 1 && p.hp === p.maxHp && p.overcharge > 0,
    `Jean's TK Shield takes the shot (hp ${p.hp}, Overcharge ${p.overcharge.toFixed(0)})`);
}
{ // Phoenix Force and Optic Overload run the beam; Eye of the Storm calls bolts down on everything in sight
  const beams = ['cyclops', 'jean'].map(h => {
    const { w, p, run, log } = setup(22, [h]); p.ult = ULT.max;
    const a = still(enemy(w, 'brute', 27)); a.hp = 9999;
    run({ aim: [1, 0], held: { ult: true } }, 1); run({ aim: [1, 0] }, ULT.cast + ULT.nova.end + 10);
    return count(log, 'ultCast', e => e.name === ultName(p)) === 1 && count(log, 'ultNova') === 1 && hits(log, a).length > 10 && p.state === 'normal';
  });
  const { w, p, run, log } = setup(100, ['storm']); p.ult = ULT.max;
  const es = [103, 106, 110].map(x => { const e = still(enemy(w, 'swarmer', x)); e.hp = 9999; return e; });
  const away = still(enemy(w, 'swarmer', 160)); away.hp = 9999;
  const y0 = p.y;
  run({ held: { ult: true } }, 1); run({}, ULT.cast + 30); const rose = p.y - y0;
  run({}, 200);
  const per = es.map(e => hits(log, e).length);
  assert(beams.every(Boolean) && count(log, 'ultBolt') === ULT.storm.strikes && per.every(n => n >= Math.floor(ULT.storm.strikes / 3)) && hits(log, away).length === 0 &&
    count(log, 'ultThunder') === 1 && rose > 1 && p.state === 'normal' && !w.ultCast,
    `Ultimates: Optic Overload and Phoenix Force fire the beam; Eye of the Storm rises ${rose.toFixed(1)} m, ${ULT.storm.strikes} bolts (${per.join('/')}), none off screen`);
}

// ---------------------------------------------------------------- Wolverine
{ // Drill Claw: a tap lunges along the aim at tier 1; held, tiers 2 and 3; it cuts through what it passes
  const { w, p, run, log } = setup(99, ['wolverine']);
  const a = still(enemy(w, 'swarmer', 101.8)); a.hp = 99;
  const x0 = p.x;
  tap(run, 'fire', { aim: [1, 0] });
  const t1 = p.state === 'dashslash' && p.slash.drill && p.slash.tier === 1;
  run({}, 30);
  const went = p.x - x0;
  const t2 = setup(99, ['wolverine']); hold(t2.run, 'fire', DRILL.charge[0] + 1, { aim: [1, 0] });
  const t3 = setup(99, ['wolverine']); hold(t3.run, 'fire', DRILL.charge[1] + 1, { aim: [1, 0] });
  assert(t1 && went > 2.5 && hits(log, a).length === 1 && t2.p.slash.tier === 2 && t3.p.slash.tier === 3 && count(t3.log, 'drillLevel') === 2,
    `Drill Claw: tier 1 on a tap (${went.toFixed(1)} m, through the Sentinel), tier 2 at ${DRILL.charge[0]} ticks, tier 3 at ${DRILL.charge[1]}`);
}
{ // An upward Drill Claw climbs; in the air he gets one until he lands or touches a wall
  const { p, run } = setup(100, ['wolverine']);
  const y0 = p.y; let top = y0;
  hold(run, 'fire', DRILL.charge[1] + 1, { aim: [0, 1] });
  for (let i = 0; i < 40; i++) { run({}); top = Math.max(top, p.y); }
  const up = top - y0;
  const s = setup(100, ['wolverine'], 9); s.p.onGround = false; s.p.vy = 0;
  tap(s.run, 'fire', { aim: [1, 0] }); const first = s.p.state === 'dashslash';
  s.run({}, DRILL.cd + 4); tap(s.run, 'fire', { aim: [1, 0] });
  assert(up > 3 && first && s.p.state !== 'dashslash' && !s.p.airDrill, `Drill Claw up climbs ${up.toFixed(1)} m; one per airtime`);
}
{ // Berserker Rage: faster swings that hit harder and heal him; hits taken don't stagger him; then a cooldown
  const swing = rage => {
    const { w, p, run, log } = setup(99, ['wolverine']);
    const b = still(enemy(w, 'brute', 100.4)); b.hp = 999; b.armor = 0;
    if (rage) tap(run, 'sig');
    p.hp = 50; p.hurtT = 9999;
    tap(run, 'melee'); const su = p.move && p.move.su;
    run({}, 30);
    return { dmg: hits(log, b).reduce((s, h) => s + h.dmg, 0), su, hp: p.hp };
  };
  const calm = swing(false), mad = swing(true);
  const { w, p, run, log } = setup(99, ['wolverine']);
  tap(run, 'sig');
  const sw = enemy(w, 'swarmer', 103);
  w.spawnProjectile({ team: 'e', owner: sw, x: 101, y: 1.1, vx: -10, vy: 0, ttl: 200, r: 0.2, dmg: 10, kind: 'std' });
  run({}, 20);
  const unstaggered = count(log, 'playerHit') === 1 && p.state !== 'hitstun' && Math.abs(p.maxHp - p.hp - 10 * BERSERK.taken) < 0.01;
  run({}, BERSERK.ticks);
  assert(mad.su < calm.su && mad.dmg > calm.dmg * 1.25 && mad.hp > calm.hp && unstaggered && p.berserkT === 0 && count(log, 'berserkEnd') === 1 && p.sigCd > BERSERK.cd - 40,
    `Berserker Rage: windup ${mad.su} vs ${calm.su} ticks, ${mad.dmg.toFixed(1)} vs ${calm.dmg.toFixed(1)} damage, heals to ${mad.hp.toFixed(1)}, a shot doesn't stagger him, then the cooldown`);
}
{ // Healing factor: nothing for a moment after a hit, then he knits back together; nobody else does
  const { w, p, ps, run } = setup(99, ['wolverine', 'cyclops']);
  const sw = enemy(w, 'swarmer', 104);
  w.spawnProjectile({ team: 'e', owner: sw, x: 97, y: 1.1, vx: 10, vy: 0, ttl: 200, r: 0.2, dmg: 20, kind: 'std' });   // from behind him
  run({}, 14);
  const hurt = p.hp; ps[1].hp = 70;
  run({}, HEAL.delay - 20); const early = p.hp;
  run({}, 20 + 180);
  const healed = p.hp - early;
  assert(hurt < p.maxHp && early === hurt && Math.abs(healed - HEAL.rate * 3) < 0.6 && ps[1].hp === 70,
    `Healing factor: waits ${HEAL.delay / 60} s after the hit, then +${healed.toFixed(1)} hp in 3 s; Cyclops stays at 70`);
}
{ // Wolverine has no scarf: the mode button does nothing, and he plants no snares
  const { p, run, log } = setup(99, ['wolverine']);
  tap(run, 'mode'); run({}, 12); tap(run, 'mode');
  assert(count(log, 'scarfMode') === 0 && p.scarfMode === 'tether' && count(log, 'snareThrow') === 0, 'Wolverine: no scarf modes, no snares');
}

// ---------------------------------------------------------------- Psylocke
{ // Psylocke carries the full Hunter kit: snares on a tap, the focus shot held, the sash modes on the mode button
  const { w, p, run, log } = setup(99, ['psylocke']);
  tap(run, 'fire', { aim: [1, 0] }); run({}, 4);
  const snare = count(log, 'snareThrow') === 1;
  tap(run, 'mode'); const veil = p.scarfMode === 'veil';
  run({}, 12);
  const e = still(enemy(w, 'brute', 110)); e.hp = 999;
  hold(run, 'fire', 40, { aim: [1, 0] });
  assert(snare && veil && count(log, 'snipe') === 1, 'Psylocke: psychic snare on a tap, the sash to Veil, a focus shot when held');
}

// ---------------------------------------------------------------- Team ultimates, voices
{ // Team names come from the heroes who join; three or more is the full team call
  const pair = (a, b) => {
    const { w, p, ps, run, log } = setup(100, [a, b]);
    p.ult = ULT.max; ps[1].ult = ULT.max;
    run({ 0: { aim: [1, 0], held: { ult: true } } }, 1); run({ 0: { aim: [1, 0] } }, 6);
    run({ 1: { held: { ult: true } } }, 1); run({}, ULT.cast + 10);
    return (log.find(q => q.type === 'ultRun') || {}).name;
  };
  const trio = () => {
    const { ps, run, log } = setup(100, ['storm', 'jean', 'psylocke']);
    for (const q of ps) q.ult = ULT.max;
    run({ 0: { held: { ult: true } } }, 1); run({ 1: { held: { ult: true } } }, 1); run({ 2: { held: { ult: true } } }, 1); run({}, ULT.cast + 20);
    return (log.find(q => q.type === 'ultRun') || {}).name;
  };
  const cw = pair('wolverine', 'cyclops'), ss = pair('storm', 'storm'), t = trio();
  const every = HEROES.every((a, i) => HEROES.slice(i).every(b => ULT.teamNames[[a, b].sort().join('+')]));
  assert(cw === 'Uneasy Alliance' && ss === 'Perfect Storm' && t === ULT.teamAll && every,
    `Team ultimates: Cyclops + Wolverine "${cw}", Storm + Storm "${ss}", three heroes "${t}"; every pair has a name`);
}
{ // Every hero has a voice for the shared calls
  const keys = ['perfect', 'revive', 'revived', 'lock_broken'];
  const w = new World();
  const missing = [];
  for (const h of HEROES) {
    const p = w.addPlayer('v' + h, h);
    for (const k of keys) { p.barkCd = 0; w.globalBarkCd = 0; w.events.length = 0; w.bark(p, k, 1, true); if (!w.events.some(e => e.type === 'bark' && e.text)) missing.push(h + ':' + k); }
    w.removePlayer(p.slot);
  }
  assert(missing.length === 0, `Barks for every hero (${missing.join(', ') || 'none missing'})`);
}
{ // A short soak per hero in the Rooftop Relay: no exceptions or NaN positions while mashing every button
  let errs = 0, nan = 0;
  for (const h of HEROES) {
    const w = new World(); const p = w.addPlayer('s', h); w.teleport('skyline');
    let prev = { held: {} };
    for (let t = 0; t < 900; t++) {
      const o = { mx: Math.sin(t / 40) > -0.3 ? 1 : -1, my: t % 97 < 10 ? 1 : 0, aim: t % 50 < 25 ? [1, 0.2] : null,
        held: { fire: t % 23 < 12, melee: t % 17 < 3, jump: t % 31 < 9, dash: t % 61 === 0, sig: t % 240 === 5, mode: t % 150 === 7, sub: t % 170 === 9, parry: t % 89 === 3 } };
      if (t === 600) p.ult = ULT.max;
      if (t === 601) o.held.ult = true;
      const c = mk(prev, o); prev = c;
      try { w.step({ [p.slot]: c }); } catch (err) { errs++; if (errs < 3) console.log(h, err.stack); }
      w.events.length = 0;
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) nan++;
    }
  }
  assert(errs === 0 && nan === 0, `Soak: 15 s of mashing per hero on the rooftops, ${errs} exceptions, ${nan} NaN positions`);
}

// ---------------------------------------------------------------- The villains
// Each boss at its arena, with one hero: Juggernaut drops into the Sentinel Works, Magneto rises over the beacon pad
function bossFight(boss, hero) {
  const w = new World(); w.enemies = []; const p = w.addPlayer('b', hero);
  w.bossRush(boss);
  if (boss === 'stormcaller') { p.x = 305; p.y = 18.6; } else p.x = 66;
  p.prevX = p.x; p.prevY = p.y;
  let prev = { held: {} };
  const step = (o = {}) => { const c = mk(prev, o); prev = c; w.step({ [p.slot]: c }); const ev = w.events.slice(); w.events.length = 0; return ev; };
  for (let i = 0; i < 260; i++) step();
  return { w, p, step, e: w.enemies.find(q => q.boss) };
}
{ // Magneto fires from his aimed hand and rains scrap from above his raised hands (where the rig draws them)
  const { w, step, e } = bossFight('stormcaller', 'cyclops');
  const shots = [], orig = w.spawnProjectile.bind(w);
  w.spawnProjectile = o => { shots.push({ kind: o.kind, dy: o.y - e.y }); return orig(o); };
  e.cd = 9999; forceBossAttack(w, e, 'volley'); for (let i = 0; i < 90; i++) step();
  forceBossAttack(w, e, 'rain'); for (let i = 0; i < 80; i++) step();
  const vol = shots.filter(s => s.kind === 'std'), rain = shots.filter(s => s.kind === 'mortar');
  const handOk = vol.length > 0 && vol.every(s => Math.abs(s.dy - 1.25) <= 0.3), aboveOk = rain.length > 0 && rain.every(s => Math.abs(s.dy - 1.9) < 0.01);
  assert(handOk && aboveOk, `Magneto: ${vol.length} volley shots from his hand (y + ${vol.map(s => s.dy.toFixed(2)).slice(0, 2).join(', ')}), ${rain.length} scrap shells from above him`);
}
{ // Every hero against both bosses: 20 s of fighting each, aimed at the boss, without exceptions or NaN, and every
  // hero hurts both (Magneto hovers out of claw reach between attacks, so this checks that everyone can reach him)
  let errs = 0, nan = 0; const out = [];
  for (const boss of ['warden', 'stormcaller']) for (const h of HEROES) {
    const { w, p, step, e } = bossFight(boss, h);
    if (!e) { out.push(`${h}/${boss}: no boss`); continue; }
    for (let t = 0; t < 1200; t++) {
      const dx = e.x - p.x, dy = e.y + e.h / 2 - (p.y + 1), m = Math.hypot(dx, dy) || 1, dir = Math.sign(dx) || 1;
      const o = { mx: Math.abs(dx) > 2.5 ? dir : 0, aim: [dx / m, dy / m],
        held: { fire: t % 40 < 30, melee: t % 13 < 2, jump: t % 70 < 8 || (h === 'storm' || h === 'jean' ? (t % 70 > 20 && t % 70 < 50) : false), sig: t % 300 === 20, mode: t % 200 === 9, sub: t % 230 === 11, parry: t % 97 === 3 } };
      if (t === 700) p.ult = ULT.max;
      if (t === 701) o.held.ult = true;
      p.mercy = Math.max(p.mercy, 30);   // keep the hero standing so the whole fight runs
      try { step(o); } catch (err) { errs++; if (errs < 3) console.log(h, boss, err.stack); }
      if (!Number.isFinite(p.x + p.y) || !Number.isFinite(e.x + e.y)) nan++;
    }
    out.push(`${CHARS[h].name} ${boss === 'warden' ? 'Juggernaut' : 'Magneto'} -${Math.round(e.maxHp - Math.max(0, e.hp))}`);
    if (e.maxHp - e.hp <= 0) out.push(`${h}/${boss}: no damage`);
  }
  const none = out.filter(q => /no damage|no boss/.test(q));
  assert(errs === 0 && nan === 0 && none.length === 0, `Boss soak, every hero vs both bosses: ${out.join(' · ')}; ${errs} exceptions, ${nan} NaN`);
}
