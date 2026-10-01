// Level bosses: the Lockwarden (the Concourse Lock's last wave) and the Stormcaller (the relay beacon).
// Runs the real simulation headless.
import { World } from '../game/js/world.js';
import { SETTINGS } from '../game/js/config.js';
import { BOSS, forceBossAttack } from '../game/js/bosses.js';
import { GATES, ROUTE_END_X } from '../game/js/level.js';
SETTINGS.novaKit = 'marksman'; SETTINGS.echoKit = 'hunter'; SETTINGS.difficulty = 'normal'; SETTINGS.dashIframes = true;
const BT = ['jump', 'dash', 'melee', 'fire', 'parry', 'sig', 'mode', 'lock'];
function mk(prev, o = {}) {
  const held = {}; for (const b of BT) held[b] = !!(o.held && o.held[b]);
  const pressed = {}, released = {};
  for (const b of BT) { pressed[b] = held[b] && !prev.held[b]; released[b] = !held[b] && !!prev.held[b]; }
  return { mx: o.mx || 0, my: o.my || 0, aimFree: !!o.aim, ax: o.aim ? o.aim[0] : 0, ay: o.aim ? o.aim[1] : 0, held, pressed, released };
}
function fight(boss, chars = ['nova']) {
  const w = new World(); w.enemies = [];
  const ps = chars.map((c, i) => w.addPlayer('p' + i, c));
  let prev = {}; ps.forEach(p => { prev[p.slot] = { held: {} }; });
  const log = [];
  const run = (o = {}, n = 1, each = null) => {
    for (let i = 0; i < n; i++) {
      const cmds = {};
      for (const p of ps) { const want = typeof o === 'function' ? o(i, p) : p.slot === 0 ? o : {}; const c = mk(prev[p.slot], want || {}); prev[p.slot] = c; cmds[p.slot] = c; }
      w.step(cmds); log.push(...w.events); w.events.length = 0;
      if (each && each(i)) return true;
    }
    return false;
  };
  w.bossRush(boss); run({}, 3);
  const e = w.enemies.find(q => q.boss);
  for (const p of ps) p.mercy = 0;
  return { w, ps, p: ps[0], e, run, log };
}
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const count = (log, t, f = () => true) => log.filter(q => q.type === t && f(q)).length;
const hitBoss = (w, p, e, o = {}) => w.spawnHitbox({ owner: p, team: 'p', x0: e.x - 2, x1: e.x + 2, y0: e.y, y1: e.y + e.h, dmg: 5, poise: 0, kb: [0, 0], instance: w.newInstance(), ...o });
// Let the boss finish its arrival and stand still, idle, at x facing `facing`
function settle(t, x, facing = -1, y = null) {
  t.run({}, 1, () => false);
  for (let i = 0; i < 400 && t.e.state === 'intro'; i++) t.run({}, 1);
  Object.assign(t.e, { x, prevX: x, vx: 0, vy: 0, facing, cd: 9999, state: 'idle', st: 0, atk: null });
  if (y === null && t.e.type === 'warden') y = 0;
  if (y !== null) { t.e.y = y; t.e.prevY = y; }
}
const put = (p, x, y) => Object.assign(p, { x, y, prevX: x, prevY: y, vx: 0, vy: 0, mercy: 0, state: 'normal', st: 0 });

// ---------------------------------------------------------------- The Lockwarden
{ // It drops into the lock: hits are shrugged off while it arrives, the landing throws shockwaves, then it fights
  const t = fight('warden');
  const sealed = GATES.L && GATES.R && !!t.e && t.e.type === 'warden' && t.e.state === 'intro';
  const hp0 = t.e.hp; hitBoss(t.w, t.p, t.e, { dmg: 30 }); t.run({}, 1);
  const shrug = t.e.hp === hp0 && count(t.log, 'blocked', b => b.e === t.e) === 1;
  t.run({}, 200);
  assert(sealed && shrug && count(t.log, 'bossIntro') === 1 && count(t.log, 'bossSlam', b => b.big) >= 1 && t.w.shockwaves.length + count(t.log, 'bossSlam') > 0 && t.e.state !== 'intro',
    `Lockwarden: the gates seal, it drops in (hits during the arrival are blocked), lands with a slam and starts fighting (${t.e.state})`);
}
{ // Health scales with the team
  const one = fight('warden'), three = fight('warden', ['nova', 'echo', 'nova']);
  assert(one.e.maxHp === BOSS.warden.hp && three.e.maxHp === Math.round(BOSS.warden.hp * 2.2), `Lockwarden health: ${one.e.maxHp} solo, ${three.e.maxHp} for three players`);
}
{ // Each attack announces its category
  const t = fight('warden'); settle(t, 82);
  put(t.p, 79, 0);
  const cats = {};
  for (const k of ['sweep', 'hammer', 'stomp', 'missiles', 'charge']) {
    t.w.events.length = 0; t.e.state = 'idle'; t.e.atk = null; forceBossAttack(t.w, t.e, k);
    const tg = t.w.events.find(q => q.type === 'telegraph'); cats[k] = tg && tg.cat;
  }
  assert(cats.sweep === 'standard' && cats.hammer === 'heavy' && cats.stomp === 'unblockable' && cats.missiles === 'standard' && cats.charge === 'heavy',
    `Lockwarden telegraphs: ${Object.entries(cats).map(([k, v]) => k + ' ' + v).join(', ')}`);
}
{ // The sweep hits a player in reach; a perfect parry of the hammer leaves it dazed
  const a = fight('warden'); settle(a, 82); put(a.p, 79.6, 0); a.p.facing = 1;
  forceBossAttack(a.w, a.e, 'sweep'); a.run({}, BOSS.warden.sweep.wind + 6);
  const hit = count(a.log, 'playerHit', h => h.p === a.p) === 1;
  const b = fight('warden', ['echo']); settle(b, 82); put(b.p, 79.6, 0); b.p.facing = 1;   // Echo parries; Nova dodges
  forceBossAttack(b.w, b.e, 'hammer'); b.run({}, BOSS.warden.hammer.wind - 1);
  b.run({ held: { parry: true } }, 4); b.run({}, 14);
  const parried = count(b.log, 'parry', q => q.perfect) === 1 && b.e.state === 'dazed' && count(b.log, 'bossDazed') === 1 && b.p.hp === b.p.maxHp;
  assert(hit && parried, `Sweep lands on a player in reach; a perfect-parried hammer leaves the Lockwarden dazed (${b.e.state})`);
}
{ // Charging into a wall dazes it
  const t = fight('warden'); settle(t, 76, -1); put(t.p, 71, 0);
  forceBossAttack(t.w, t.e, 'charge'); t.run({ mx: 0, held: { jump: true } }, 1); t.run({}, BOSS.warden.charge.wind + 40);
  assert(count(t.log, 'chargeCrash', q => q.e === t.e) === 1 && t.e.state === 'dazed', `Lockwarden charge crashes into the column and is dazed (${t.e.state})`);
}
{ // Armor: a hit that can't break it does a third of the damage; armor-breaking hits strip the plates one by one
  const t = fight('warden'); settle(t, 82);
  const h0 = t.e.hp; hitBoss(t.w, t.p, t.e, { dmg: 10 }); t.run({}, 1); const soft = h0 - t.e.hp;
  const h1 = t.e.hp; hitBoss(t.w, t.p, t.e, { dmg: 10, armorBreak: true }); t.run({}, 1); const hard = h1 - t.e.hp;
  assert(Math.abs(soft - 3) < 0.01 && Math.abs(hard - 6) < 0.01 && t.e.armor === 3, `Armor: ${soft.toFixed(1)} damage without a break, ${hard.toFixed(1)} with one (plates ${t.e.armor}/4)`);
}
{ // It is never knocked back, and a combo never freezes it for long
  const t = fight('warden'); settle(t, 82); t.e.armor = 0; put(t.p, 80, 0);
  hitBoss(t.w, t.p, t.e, { dmg: 2, kb: [20, 8] }); t.run({}, 1);
  assert(Math.abs(t.e.vx) < 0.01 && t.e.hitstop <= 2, `No knockback (vx ${t.e.vx.toFixed(2)}), hit-stop ${t.e.hitstop}`);
}
{ // Enough poise damage staggers it; for a while afterwards it cannot be staggered again
  const t = fight('warden'); settle(t, 82); t.e.armor = 0;
  hitBoss(t.w, t.p, t.e, { dmg: 1, poise: 500 }); t.run({}, 1);
  const first = t.e.state === 'stagger';
  t.run({}, 160); hitBoss(t.w, t.p, t.e, { dmg: 1, poise: 500 }); t.run({}, 1);
  assert(first && t.e.state !== 'stagger' && count(t.log, 'stagger', q => q.e === t.e) === 1, `Stagger once (then immune for ${BOSS.warden.staggerCd} ticks)`);
}
{ // Phase two at half health: it roars (hits shrugged off), re-arms two plates and gains the laser
  const t = fight('warden'); settle(t, 86, -1); t.e.armor = 0;
  t.e.hp = t.e.maxHp / 2 + 1; hitBoss(t.w, t.p, t.e, { dmg: 4, armorBreak: true }); t.run({}, 6);
  const roared = t.e.phase === 2 && t.e.state === 'roar' && t.e.armor === BOSS.warden.rearm && count(t.log, 'bossPhase') === 1;
  const h = t.e.hp; hitBoss(t.w, t.p, t.e, { dmg: 10, armorBreak: true }); t.run({}, 1);
  assert(roared && t.e.hp === h, `Phase two: roar (hit blocked), ${t.e.armor} plates back`);
}
{ // The laser: the low one catches a player standing in its path but not one up on the dais; the high one misses a crouching player
  const laser = (high, place) => {
    const t = fight('warden'); settle(t, 88, -1); t.e.phase = 2; t.e.laserHigh = !high;
    place(t);
    forceBossAttack(t.w, t.e, 'laser');
    t.run(t.crouch ? { my: -1 } : {}, BOSS.warden.laser.wind + BOSS.warden.laser.ticks);
    return count(t.log, 'playerHit', q => q.p === t.p);
  };
  const stand = laser(false, t => put(t.p, 80, 0)), dais = laser(false, t => { put(t.p, 80, 2.4); t.p.onGround = true; });
  const crouch = laser(true, t => { put(t.p, 80, 0); t.crouch = true; }), standHigh = laser(true, t => put(t.p, 80, 0));
  assert(stand === 1 && dais === 0 && crouch === 0 && standHigh === 1, `Laser: low hits standing (${stand}), misses on the dais (${dais}); high misses crouching (${crouch}), hits standing (${standHigh})`);
}
{ // A wipe in the boss fight comes back to the boss: walking in starts it again, without the waves
  const t = fight('warden'); t.run({}, 20);
  t.w.resetToCheckpoint(); t.run({}, 2);
  const ready = t.w.arena.state === 'bossReady' && !t.w.enemies.some(q => q.zone === 'arena') && !GATES.L;
  put(t.p, 66, 0); t.run({}, 3);
  assert(ready && t.w.arena.state === 'boss' && t.w.enemies.some(q => q.type === 'warden' && !q.dead) && GATES.L,
    `After a wipe the arena waits at the boss (${ready}); walking back in brings the Lockwarden straight back`);
}

// ---------------------------------------------------------------- The Stormcaller
{ // It arrives when the team steps onto the beacon pad, and the gate seals behind them
  const t = fight('stormcaller');
  const S = t.w.encounters.find(q => q.def.id === 'beacon');
  assert(S.state === 'active' && !!t.e && t.e.type === 'stormcaller' && GATES.R2 && count(t.log, 'banner', b => b.text === 'Stormcaller') === 1,
    `Stormcaller: stepping onto the pad seals the gate and brings it in (${S.state})`);
}
{ // Its volley is standard fire: Echo's parry deflects a shot back into it
  const t = fight('stormcaller', ['echo']); settle(t, 308, -1, 25.2); t.e.homeX = 308;
  put(t.p, 304, 18.6); t.p.facing = 1;
  forceBossAttack(t.w, t.e, 'volley');
  let deflected = false;
  t.run((i) => { const near = t.w.projectiles.some(pr => pr.team === 'e' && Math.hypot(pr.x - t.p.x, pr.y - (t.p.y + 1)) < 2.2); return near && !deflected ? { held: { parry: true } } : {}; },
    120, () => { deflected = count(t.log, 'deflect') > 0; return count(t.log, 'hit', h => h.e === t.e) > 0; });
  assert(count(t.log, 'telegraph', q => q.cat === 'standard') === 1 && count(t.log, 'deflect') >= 1 && count(t.log, 'hit', h => h.e === t.e && h.source === 'proj') >= 1,
    `Volley (standard): Echo deflects a shot back into the Stormcaller`);
}
{ // The dive crashes it onto the pad (a punish window); diving into Nova's Aegis crashes it for longer
  const a = fight('stormcaller'); settle(a, 308, -1, 25.2); put(a.p, 303, 18.6);
  forceBossAttack(a.w, a.e, 'dive'); a.run({ mx: 1 }, BOSS.stormcaller.dive.wind - 2); a.run({ held: { dash: true }, mx: 1 }, 2); a.run({}, 50);
  const crash = a.log.find(q => q.type === 'bossCrash');
  const b = fight('stormcaller'); settle(b, 307.5, -1, 25.2); put(b.p, 307, 18.6);
  forceBossAttack(b.w, b.e, 'dive'); b.run({ held: { sig: true } }, 1); b.run({}, 60);
  const crash2 = b.log.find(q => q.type === 'bossCrash');
  assert(crash && !crash.parried && crash2 && crash2.parried && b.e.crashFor === BOSS.stormcaller.dive.parried && count(b.log, 'aegisHit') >= 1,
    `Dive: crashes onto the pad (${crash && crash.parried ? 'parried' : 'missed'}); into the Aegis it crashes for ${b.e.crashFor} ticks`);
}
{ // The sweep laser runs across the pad at ankle height: a player up on a perch is clear of it
  const sweep = place => {
    const t = fight('stormcaller'); settle(t, 306, -1, 25.2);
    place(t);
    forceBossAttack(t.w, t.e, 'sweep');
    t.run({}, 90 + BOSS.stormcaller.sweep.wind + BOSS.stormcaller.sweep.ticks);
    return { hits: count(t.log, 'playerHit', q => q.p === t.p), fired: count(t.log, 'bossLaser') };
  };
  const ground = sweep(t => put(t.p, 307, 18.6)), perch = sweep(t => { put(t.p, 310.5, 22.2); t.p.onGround = true; });
  assert(ground.fired === 1 && ground.hits === 1 && perch.hits === 0, `Sweep: hits a player on the pad (${ground.hits}), not one on a perch (${perch.hits})`);
}
{ // Phase two calls in two drones; when it falls they go with it, the gate opens, and the route completes
  const t = fight('stormcaller', ['nova', 'echo']); settle(t, 308, -1, 25.2);
  put(t.ps[0], 305, 18.6); put(t.ps[1], 306, 18.6);
  t.e.hp = t.e.maxHp / 2 + 1; hitBoss(t.w, t.p, t.e, { dmg: 4 }); t.run({}, 40);
  const drones = t.w.enemies.filter(q => q.enc === 'beacon' && q.add && !q.dead).length;
  t.e.invuln = 0; t.e.armor = 0; t.e.hp = 1; hitBoss(t.w, t.p, t.e, { dmg: 9 }); t.run({}, 3);
  const S = t.w.encounters.find(q => q.def.id === 'beacon');
  const after = t.w.enemies.filter(q => q.enc === 'beacon' && !q.dead).length;
  t.run({}, 160);
  assert(drones === BOSS.stormcaller.drones && after === 0 && S.state === 'cleared' && !GATES.R2 && count(t.log, 'bossDown') === 1 &&
    count(t.log, 'banner', b => b.text === 'Beacon secured') === 1 && count(t.log, 'banner', b => b.text === 'Route complete') === 1,
    `Phase two brings ${drones} drones; defeat takes them down, opens the gate, secures the beacon, then the route completes`);
}
