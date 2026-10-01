// Version 8: Nova's slower charge and Level 4 beam, the hard-light Aegis and Overcharge, his close-range
// combo; Echo's sniper rifle, staff deflect, and Zero-style moveset. Runs the real simulation headless.
import { World } from '../game/js/world.js';
import { createEnemy } from '../game/js/enemies.js';
import { SETTINGS, MARKSMAN, AEGIS, HUNTER, DEFLECT, DASH_SLASH, POUND, MOVES } from '../game/js/config.js';
import { chargeStage } from '../game/js/player.js';
SETTINGS.novaKit = 'marksman'; SETTINGS.echoKit = 'hunter'; SETTINGS.lockOn = true; SETTINGS.dashCharge = true;
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
    for (let i = 0; i < n; i++) { const c = mk(prev, typeof o === 'function' ? o(i) : o); prev = c; w.step({ 0: c }); log.push(...w.events); w.events.length = 0; if (each && each(i)) return true; }
    return false;
  };
  run({}, 10); p.mercy = 0;
  return { w, p, run, log };
}
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const count = (log, t, f = () => true) => log.filter(e => e.type === t && f(e)).length;
const last = (log, t) => [...log].reverse().find(e => e.type === t);
const enemy = (w, type, x, y = 0, o = {}) => { const e = createEnemy(type, x, y, { cd: 9999, slamCd: 9999, ...o }); e.hitstop = 1e9; w.enemies.push(e); return e; };
const dmgOn = (log, e) => log.filter(h => h.type === 'hit' && h.e === e).reduce((s, h) => s + h.dmg, 0);
const shoot = (w, from, x, y, vx, vy, o = {}) => w.spawnProjectile({ team: 'e', owner: from, x, y, vx, vy, ttl: 120, r: 0.2, dmg: 10, kind: 'std', ...o });
const M = MARKSMAN, C = M.charge, L4 = M.beam.at;

// ---------------------------------------------------------------- Nova: charge and the Level 4 beam
{ // Slower charge: levels at the new marks, then Level 4
  const { p, run, log } = setup(99);
  const stages = [];
  for (const t of [C[0] - 2, C[1] - C[0], C[2] - C[1], 4, L4 - C[2] - 2]) { run({ aim: [1, 0], held: { fire: true } }, t); stages.push(chargeStage(p)); }
  const lv = log.filter(e => e.type === 'chargeLevel').map(e => e.level);
  assert(stages.join(' > ') === 'charging > L1 > L2 > perfect > L4' && lv.join('') === '1234', `Charge: ${stages.join(' > ')} (levels at ${C.join(', ')} and ${L4} ticks)`);
}
{ // Level 4 release: a sustained beam that pulses through every enemy in line, stops at walls, and ends
  const { w, p, run, log } = setup(0);
  const a = enemy(w, 'brute', 6), b = enemy(w, 'shield', 10);   // both in line
  const hid = enemy(w, 'swarmer', 35);                           // behind the ledge wall at x = 32
  a.hp = b.hp = 1e9;
  run({ aim: [1, 0], held: { fire: true } }, L4 + 2); run({ aim: [1, 0] }, 1);
  const began = p.state === 'beam' && count(log, 'beamStart') === 1;
  w.spawnProjectile({ team: 'e', owner: b, x: 14, y: 1.1, vx: -12, vy: 0, ttl: 60, r: 0.2, dmg: 10, kind: 'std' });
  run({ aim: [1, 0] }, M.beam.ticks + 4);
  const pulses = Math.floor(M.beam.ticks / M.beam.pulse);
  assert(began && count(log, 'hit', h => h.e === a) >= pulses - 1 && count(log, 'hit', h => h.e === b) >= pulses - 1 && count(log, 'hit', h => h.e === hid) === 0 &&
    count(log, 'erase') >= 1 && count(log, 'beamEnd') === 1 && p.state === 'normal' && p.hp === p.maxHp,
    `Beam: ${count(log, 'hit', h => h.e === a)} pulses on each enemy in line (${dmgOn(log, a).toFixed(1)} damage), none through the wall, enemy shot erased, ends after ${M.beam.ticks} ticks`);
}
{ // The beam follows the aim at a limited turn rate; a dash cuts it short; a hit ends it
  const { w, p, run, log } = setup(0);
  run({ aim: [1, 0], held: { fire: true } }, L4 + 2); run({ aim: [1, 0] }, 1);
  run({ aim: [0, 1] }, 10);
  const ang = Math.atan2(p.beam.dy, p.beam.dx);
  run({ aim: [0, 1], mx: 1, held: { dash: true } }, 1);
  const cut = p.state === 'dash' && p.beam === null && last(log, 'beamEnd').why === 'cancel';
  const t = setup(0); t.run({ aim: [1, 0], held: { fire: true } }, L4 + 2); t.run({ aim: [1, 0] }, 3);
  t.w.spawnHitbox({ owner: null, team: 'e', x0: t.p.x - 1, x1: t.p.x + 1, y0: 0, y1: 2, dmg: 8, kb: [3, 2], instance: t.w.newInstance() });
  t.run({}, 1);
  assert(Math.abs(ang - 10 * M.beam.turn) < 0.02 && cut && t.p.beam === null && last(t.log, 'beamEnd').why === 'hit',
    `Beam turns ${ang.toFixed(2)} rad in 10 ticks toward a straight-up aim; a dash cancels it; a hit ends it`);
}
{ // Attachment flavours: Prism bounces off the first wall, Arc bursts where it lands, Volley sheds darts
  const beamWith = (attach, aim) => {
    const t = setup(26); t.p.attachment = attach; t.darts = new Set();
    t.run({ aim, held: { fire: true } }, L4 + 2); t.run({ aim }, 30, () => { t.w.projectiles.forEach(q => { if (q.kind === 'dart') t.darts.add(q); }); return false; });
    return t;
  };
  const pr = beamWith('prism', [1, 0]), ar = beamWith('arc', [1, 0]), vo = beamWith('volley', [1, 0]);
  assert(pr.p.beam.segs.length === 2 && count(ar.log, 'blast') >= 2 && vo.darts.size >= 2,
    `Prism beam bounces (${pr.p.beam.segs.length} segments), Arc beam bursts at the wall (${count(ar.log, 'blast')}), Volley beam sheds darts`);
}

// ---------------------------------------------------------------- Nova: the Aegis and Overcharge
{ // Raise: an enemy shot stops at the hard light; Nova takes nothing; the damage becomes Overcharge
  const { w, p, run, log } = setup(99);
  const d = enemy(w, 'drone', 106, 3);
  run({ held: { sig: true } }, 1); run({}, 2);
  shoot(w, d, 104, 1.2, -14, 0, { dmg: 12 });
  run({}, 30);
  const hit = last(log, 'aegisHit');
  assert(count(log, 'aegisOn') === 1 && hit && hit.dmg === 12 && p.hp === p.maxHp && p.state !== 'hitstun' && Math.abs(p.overcharge - 12 * AEGIS.over.perDmg) < 1e-9 &&
    hit.x > p.x + 1,
    `Aegis stops a shot at its surface (x ${hit && (hit.x - p.x).toFixed(2)} m out), Nova unhurt, Overcharge ${p.overcharge.toFixed(1)}`);
}
{ // Blocks everything for allies inside too, including an unblockable blast and a Charger's charge (which rebounds)
  const w = new World(); w.enemies = [];
  const n = w.addPlayer('a', 'nova'), q = w.addPlayer('b', 'echo');
  n.x = 99; q.x = 99.8; n.y = q.y = 0;
  let prev = { 0: { held: {} }, 1: { held: {} } }; const log = [];
  const run = (o0 = {}, k = 1) => { for (let i = 0; i < k; i++) { const c0 = mk(prev[0], o0), c1 = mk(prev[1]); prev = { 0: c0, 1: c1 }; w.step({ 0: c0, 1: c1 }); log.push(...w.events); w.events.length = 0; } };
  run({}, 5); n.mercy = q.mercy = 0;
  run({ held: { sig: true } }, 1); run({}, 1);
  w.explode({ owner: null, team: 'e', x: 99.4, y: 0.2, spec: { r: 2, dmg: 14 } });
  const c = createEnemy('charger', 102.5, 0, { cd: 0 }); w.enemies.push(c);
  run({}, 150, );
  const blasts = count(log, 'aegisHit', h => h.dmg === 14);
  assert(blasts === 1 && n.hp === n.maxHp && q.hp === q.maxHp && count(log, 'playerHit') === 0 && (c.state === 'dazed' || count(log, 'chargeCrash') >= 1),
    `An unblockable blast on both players counts once (${blasts}); the Charger rebounds off the hard light; nobody inside is hurt`);
}
{ // Broken by damage it shatters: a burst that hits enemies around him, then a cooldown; pressed again it detonates
  const { w, p, run, log } = setup(99);
  const s = enemy(w, 'swarmer', 101.4), d = enemy(w, 'drone', 106, 3);
  run({ held: { sig: true } }, 1); run({}, 1);
  for (let i = 0; i < 6; i++) { shoot(w, d, 104, 1.2, -14, 0, { dmg: 14 }); run({}, 10); }
  const broke = count(log, 'aegisOff', e => e.why === 'break') === 1 && p.aegis === null && p.aegisCd > 0;
  const burst = count(log, 'hit', h => h.e === s && h.source === 'blast') === 1;
  run({ held: { sig: true } }, 1); run({}, 1);
  const cooling = p.aegis === null;
  const t = setup(99); const s2 = enemy(t.w, 'swarmer', 101.2);
  t.run({ held: { sig: true } }, 1); t.run({}, 20); t.run({ held: { sig: true } }, 1); t.run({}, 2);
  assert(broke && burst && cooling && count(t.log, 'aegisOff', e => e.why === 'detonate') === 1 && count(t.log, 'hit', h => h.e === s2) === 1,
    `Aegis breaks after ${count(log, 'aegisHit')} hits and shatters into a burst that hits the enemy beside him; cooldown holds; a second press detonates it`);
}
{ // Overcharge: charges faster, and a charged release hits harder and spends it
  const { w, p, run, log } = setup(99);
  const e = enemy(w, 'brute', 104); e.hp = 1e9; e.armor = 0;
  run({ aim: [1, 0], held: { fire: true } }, C[1] + 1); run({ aim: [1, 0] }, 20);
  const top = l => Math.max(...l.filter(h => h.type === 'hit' && h.e === e).map(h => h.dmg));   // the lance itself, not the basic round or splash
  const plain = top(log);
  p.overcharge = 100; p.overT = 1e9; p.focus = 0; log.length = 0;
  let t1 = 0; run({ aim: [1, 0], held: { fire: true } }, 200, i => { if (p.chargeT >= C[1]) { t1 = i + 1; return true; } return false; });
  run({ aim: [1, 0] }, 20);
  const over = top(log);
  assert(t1 < C[1] * 0.7 && Math.abs(over / plain - AEGIS.over.dmg) < 0.05 && p.overcharge === 100 - AEGIS.over.cost,
    `Overcharge: level 2 in ${t1} ticks instead of ${C[1]}; the release hits ${(over / plain).toFixed(2)}x and spends ${AEGIS.over.cost}`);
}

// ---------------------------------------------------------------- Nova: close-range combo
{ // Near an enemy, melee is the bracer combo: backhand, elbow, blast punch; further off it is the Recoil Burst
  const { w, p, run, log } = setup(99);
  const e = enemy(w, 'post', 100.3);
  const moves = [];
  for (let i = 0; i < 60; i++) { run({ held: { melee: i % 7 === 0 } }, 1); if (p.moveId && !moves.includes(p.moveId)) moves.push(p.moveId); }
  const far = setup(99); enemy(far.w, 'swarmer', 103); far.run({ held: { melee: true } }, 1); far.run({}, 2);
  assert(moves.join(',') === 'nova_k1,nova_k2,nova_k3' && count(log, 'blast') === 1 && count(log, 'burst') === 0 && count(far.log, 'burst') === 1 && far.p.moveId === null,
    `Close: ${moves.join(' > ')} with a blast punch (${dmgOn(log, e).toFixed(1)} damage); at 4 m the same button fires a Recoil Burst`);
}

// ---------------------------------------------------------------- Echo: sniper rifle
{ // Full focus: massive damage, pierces everything in line, breaks armor, tags; an upper-body hit is a critical
  const R = HUNTER.rifle;
  const { w, p, run, log } = setup(61, 'echo');
  const a = enemy(w, 'shield', 70), b = enemy(w, 'brute', 80); a.hp = b.hp = 1e9; a.shieldDir = -1;
  run({ aim: [1, 0], held: { fire: true } }, R.raise + R.focus + 2); run({ aim: [1, 0] }, 2);
  const s = last(log, 'snipe');
  const t = setup(61, 'echo'); const c = enemy(t.w, 'brute', 70); c.hp = 1e9; c.armor = 0;
  const cy = c.y + c.h * 0.85, ch = { x: t.p.x, y: t.p.y + t.p.h * 0.62 }, m = Math.hypot(c.x - ch.x, cy - ch.y), aim = [(c.x - ch.x) / m, (cy - ch.y) / m];
  t.run({ aim, held: { fire: true } }, R.raise + R.focus + 2); t.run({ aim }, 2);
  assert(s && s.full && s.n === 2 && dmgOn(log, a) >= R.maxDmg - 0.01 && b.armor < 3 && a.tagged > 0 && b.tagged > 0 && count(t.log, 'crit') === 1 &&
    Math.abs(dmgOn(t.log, c) - R.maxDmg * R.crit) < 0.01,
    `Full-focus snipe: ${dmgOn(log, a).toFixed(1)} damage through a shield and on into a Brute (armor ${b.armor}), both tagged; an upper-body hit crits for ${dmgOn(t.log, c).toFixed(1)}`);
}
{ // Quick-scope: less damage and it stops at the first enemy; the bolt cycle blocks a second shot; no recoil
  const R = HUNTER.rifle;
  const { w, p, run, log } = setup(61, 'echo');
  const a = enemy(w, 'swarmer', 70, 0.6), b = enemy(w, 'swarmer', 76, 0.6); a.hp = b.hp = 1e9;
  run({ aim: [1, 0], held: { fire: true } }, R.raise + 5); run({ aim: [1, 0] }, 1);
  const kick = p.vx;
  run({ aim: [1, 0], held: { fire: true } }, R.raise + 2); run({ aim: [1, 0] }, 1);
  assert(count(log, 'snipe') === 1 && count(log, 'hit', h => h.e === a) === 1 && count(log, 'hit', h => h.e === b) === 0 && dmgOn(log, a) < 6 &&
    count(log, 'rifleLower') === 1 && Math.abs(kick) < 0.3,
    `Quick-scope: ${dmgOn(log, a).toFixed(1)} damage, stops at the first enemy; bolt cycle blocks the next shot; no recoil (vx ${kick.toFixed(2)} m/s)`);
}

// ---------------------------------------------------------------- Echo: deflect
{ // Parry: an enemy shot goes back to its shooter as Echo's, harder on a perfect parry; a staff swing deflects too
  const deflectOn = (frames, how) => {
    const t = setup(100, 'echo'); const d = enemy(t.w, 'sniper', 108); d.hp = 1e9;
    shoot(t.w, d, 104, 1.1, -24, 0, { heavy: true, dmg: 20 });
    t.run({}, frames); t.run(how, 1); t.run({}, 40);
    return { t, d };
  };
  const late = deflectOn(0, { held: { parry: true } }), perfect = deflectOn(4, { held: { parry: true } });
  // A charged staff swing (active 14 ticks after the release) meets a shot timed to arrive then
  const sw = setup(100, 'echo'); const d3 = enemy(sw.w, 'sniper', 109); d3.hp = 1e9; sw.p.facing = 1;
  sw.run({ held: { melee: true } }, 34); sw.run({}, 1);
  shoot(sw.w, d3, 107.4, 1.1, -24, 0, { dmg: 10 }); sw.run({}, 40);
  const dl = last(late.t.log, 'deflect'), dp = last(perfect.t.log, 'deflect');
  assert(dl && dp && dmgOn(late.t.log, late.d) === DEFLECT.dmg.heavy && dp.perfect && dmgOn(perfect.t.log, perfect.d) > dmgOn(late.t.log, late.d) &&
    late.t.p.hp === late.t.p.maxHp && count(sw.log, 'deflect') === 1 && dmgOn(sw.log, d3) > 0,
    `Deflect: a heavy sniper shot goes back for ${dmgOn(late.t.log, late.d)} (${dmgOn(perfect.t.log, perfect.d).toFixed(1)} on a perfect parry); a staff swing deflects too`);
}
{ // Unblockable shells are not deflected
  const t = setup(100, 'echo'); const m = enemy(t.w, 'mortar', 108);
  t.w.spawnProjectile({ team: 'e', owner: m, x: 101.5, y: 1.1, vx: -10, vy: 0, ttl: 60, r: 0.28, dmg: 0, heavy: true, kind: 'mortar', blast: { r: 1.9, dmg: 14 } });
  t.run({ held: { parry: true } }, 1); t.run({}, 20);
  assert(count(t.log, 'deflect') === 0 && count(t.log, 'enemyBlast') === 1, `A mortar shell bursts on the staff instead of being deflected`);
}

// ---------------------------------------------------------------- Echo: Zero-style moveset
{ // Bigger numbers: the ground chain now does real damage
  const { w, p, run, log } = setup(100, 'echo');
  const post = enemy(w, 'post', 101.3);
  for (let i = 0; i < 60; i++) run({ held: { melee: i % 6 < 1 } }, 1);
  const moves = new Set(log.filter(e => e.type === 'swing').map(e => e.id));
  assert(['echo_b1', 'echo_b2', 'echo_b3', 'echo_b4'].every(m => moves.has(m)) && dmgOn(log, post) >= 9, `Ground chain b1-b4 deals ${dmgOn(log, post).toFixed(1)} (was 5.6)`);
}
{ // Dash Slash: melee during a dash lunges on through the enemy
  const { w, p, run, log } = setup(100, 'echo');
  const e = enemy(w, 'swarmer', 103.2); e.hp = 1e9;
  run({ mx: 1, held: { dash: true } }, 3); run({ mx: 1, held: { melee: true } }, 1); run({}, 30);
  const ds = last(log, 'dashSlash');
  assert(ds && count(log, 'hit', h => h.e === e) === 1 && p.x > 103.2 + 0.4 && dmgOn(log, e) >= DASH_SLASH.dmg[0], `Dash Slash (tier ${ds && ds.tier}) cuts through for ${dmgOn(log, e).toFixed(1)} and carries him past where the enemy stood (${(p.x - 103.2).toFixed(1)} m beyond)`);
}
{ // Rising Glaive: up + melee rises and hits three times; Spin Slash hits all around in the air
  const r = setup(100, 'echo'); const e = enemy(r.w, 'post', 101.1);
  let top = 0; r.run({ my: 1, held: { melee: true } }, 1); r.run({}, 30, () => { top = Math.max(top, r.p.y); return false; });
  const s = setup(100, 'echo', 3); const behind = enemy(s.w, 'drone', 99.2, 3.6);
  Object.assign(s.p, { y: 3, prevY: 3, vy: 0, facing: 1, onGround: false });
  const hold = () => { behind.x = 99.2; behind.y = 3.6; behind.vx = behind.vy = 0; behind.state = 'idle'; return false; };
  s.run({ my: 1, held: { melee: true } }, 1, hold); s.run({ my: 1 }, 20, hold);
  assert(count(r.log, 'hit', h => h.e === e) === 3 && top > 2 && count(s.log, 'swing', w => w.id === 'echo_spin') === 1 && count(s.log, 'hit', h => h.e === behind) >= 2,
    `Rising Glaive: ${count(r.log, 'hit', h => h.e === e)} hits, rises ${top.toFixed(1)} m; Spin Slash hits an enemy behind him ${count(s.log, 'hit', h => h.e === behind)} times`);
}
{ // Echo's quick ground pound bounces off an enemy it hits on the way down (pogo); landing throws enemies on both sides outward
  const a = setup(100, 'echo', 5); const d = enemy(a.w, 'drone', 100, 2); d.hp = 1e9; a.p.onGround = false;
  a.run({ my: -1, held: { melee: true } }, 1); a.run({}, 22);
  const pogo = count(a.log, 'pogo') === 1 && a.p.airDashes === 1;
  const b = setup(100, 'echo', 4); const l = enemy(b.w, 'swarmer', 98.6), r2 = enemy(b.w, 'swarmer', 101.5); l.hp = r2.hp = 1e9; b.p.onGround = false;
  b.run({ my: -1, held: { melee: true } }, 1); b.run({}, 24);
  assert(pogo && count(b.log, 'poundLand') === 1 && count(b.log, 'hit', h => h.e === l) === 1 && count(b.log, 'hit', h => h.e === r2) === 1 && l.vx < -4 && r2.vx > 4,
    `Echo's pound: bounces off a drone (pogo, air dash back); the landing throws enemies on both sides outward (vx ${l.vx.toFixed(1)} / ${r2.vx.toFixed(1)})`);
}
{ // Nova's ground pound: a quick one scatters the enemies around the landing; held, he hangs in the air while it
  // charges through three levels, and the full one is wider and breaks armor
  const P = POUND;
  const a = setup(100, 'nova', 4); a.p.onGround = false; a.p.vy = 0;
  const l = enemy(a.w, 'swarmer', 98.3), r = enemy(a.w, 'swarmer', 101.8); l.hp = r.hp = 1e9;
  a.run({ my: -1, held: { melee: true } }, 1); a.run({}, 40);
  const land = last(a.log, 'poundLand');
  const quick = count(a.log, 'poundStart') === 1 && land && land.level === 0 && l.state === 'launched' && r.state === 'launched' && l.vx < -5 && r.vx > 5 && count(a.log, 'burst') === 0;
  const b = setup(100, 'nova', 7); b.p.onGround = false; b.p.vy = 0;
  const brute = enemy(b.w, 'brute', 102.6), far = enemy(b.w, 'swarmer', 96.4); brute.hp = far.hp = 1e9;
  const y0 = b.p.y; b.run({ my: -1, held: { melee: true } }, P.charge[2] + 4);
  const hang = y0 - b.p.y, levels = b.log.filter(e => e.type === 'poundLevel').map(e => e.level).join('');
  b.run({ my: -1 }, 40);
  const big = last(b.log, 'poundLand');
  assert(quick && hang < 2.5 && levels === '123' && big && big.level === 3 && big.r > P.land[0].r + 1 && brute.armor < 3 && count(b.log, 'hit', h => h.e === far) === 1,
    `Nova's pound: the quick one launches both swarmers outward; held ${P.charge[2] + 4} ticks he sinks only ${hang.toFixed(2)} m through levels ${levels}; the full one reaches ${big && big.r.toFixed(1)} m and breaks armor`);
}
{ // Holding down to fast-fall and then pressing the secondary is a pound, not a Velocity Break; a diagonal aim
  // in the air is still Nova's Recoil Burst
  const t = setup(100, 'nova', 14); t.p.onGround = false; t.p.vy = 0;
  t.run({ my: -1 }, 24); const ff = t.p.fastFall && t.p.vy < -18;
  t.run({ my: -1, held: { melee: true } }, 1); const st = t.p.state;
  const u = setup(100, 'nova', 14); u.p.onGround = false; u.p.vy = 0; u.run({}, 4);
  u.run({ aim: [0.55, -0.83], held: { melee: true } }, 1);
  assert(ff && st === 'pound' && u.p.state !== 'pound' && count(u.log, 'burst') === 1, `Fast-falling + secondary starts the pound (${st}); a diagonal-down secondary is still the Recoil Burst`);
}
{ // Wall Slash from a wall slide; the charged swing looses a crescent wave that flies on
  const WALL_X = 28.5;
  const t = setup(20, 'echo'); const p = t.p; p.x = WALL_X - p.w / 2 - 0.02; p.y = 5; p.prevX = p.x; p.prevY = 5; p.vy = -2; p.onGround = false;
  t.run({ mx: 1 }, 12); t.run({ mx: 1, held: { melee: true } }, 1); t.run({ mx: 1 }, 3);
  const wallMove = p.moveId === 'echo_wall' && p.wallDir === 1;
  const c = setup(100, 'echo'); const far = enemy(c.w, 'swarmer', 108.5); far.hp = 1e9;
  c.run({ held: { melee: true } }, 40); c.run({}, 60);
  assert(wallMove && count(c.log, 'crescent') === 1 && count(c.log, 'hit', h => h.e === far) === 1, `Wall Slash from the wall; the charged swing's crescent wave hits an enemy 8.5 m away`);
}
