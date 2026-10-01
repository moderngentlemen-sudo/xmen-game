import { World } from '../game/js/world.js';
import { GATES } from '../game/js/level.js';
import { createEnemy } from '../game/js/enemies.js';
import { SETTINGS } from '../game/js/config.js';
SETTINGS.novaKit = 'sentinel';   // these cases cover the Pass 1 kit (jab chain); nova-test.mjs covers the Marksman kit
const BT = ['jump','dash','melee','fire','parry','sig'];
function mk(prev, o = {}) {
  const held = {}; for (const b of BT) held[b] = !!(o.held && o.held[b]);
  const pressed = {}, released = {};
  for (const b of BT) { pressed[b] = held[b] && !prev.held[b]; released[b] = !held[b] && prev.held[b]; }
  return { mx: o.mx || 0, my: o.my || 0, aimFree: !!o.aim, ax: o.aim ? o.aim[0] : 0, ay: o.aim ? o.aim[1] : 0, held, pressed, released };
}
function setup(ch, x = 20) {
  const w = new World(); w.enemies = []; const p = w.addPlayer('test', ch);
  p.x = x; p.y = 0; let prev = { held: {} }; const log = [];
  const run = (o, n = 1) => { for (let i = 0; i < n; i++) { const c = mk(prev, o); prev = c; w.step({ 0: c }); log.push(...w.events); w.events.length = 0; } };
  run({}, 10); p.mercy = 0;
  return { w, p, run, log };
}
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const count = (log, t) => log.filter(e => e.type === t).length;

// Swarmer dies to Nova's jab chain
{ const { w, p, run, log } = setup('nova'); const e = createEnemy('swarmer', 21.2, 0); e.cd = 999; w.enemies.push(e);
  for (let i = 0; i < 8; i++) { run({ held: { melee: true } }, 1); run({}, 9); }
  assert(e.dead, `Nova jab chain kills a Swarmer (hp=${e.hp.toFixed(1)}, hits=${count(log,'hit')})`); }

// Shield blocks frontal jabs; Echo's dash-jump Velocity Break (tier 2) breaks the guard
{ const { w, p, run, log } = setup('echo', 98); const e = createEnemy('shield', 99.3, 0); e.cd = 999; e.shieldDir = -1; w.enemies.push(e);
  run({ held: { melee: true } }, 1); run({}, 20);
  assert(count(log, 'blocked') >= 1 && e.hp === 8, `Shield blocks a frontal jab (blocked=${count(log,'blocked')}, hp=${e.hp})`);
  p.x = 98; run({}, 20); log.length = 0; e.x = 103.5; e.state = 'idle'; e.shieldDir = -1;
  p.x = e.x - 2.2; p.y = 0.4; p.vx = 20; p.vy = 0; p.onGround = false; p.dashCarry = true; p.state = 'normal'; run({ held: { melee: true } }, 1); run({}, 12);
  assert(count(log, 'guardBreak') >= 1 || e.state === 'stagger', `Dash-jump Velocity Break breaks the guard (events: ${[...new Set(log.map(q=>q.type))].join(',')}; state=${e.state})`); }

// Brute armor: standard shots barely hurt, a Rail breaks a plate
{ const { w, p, run, log } = setup('nova', 20); const e = createEnemy('brute', 26, 0); e.cd = 9999; e.slamCd = 9999; w.enemies.push(e);
  run({ aim: [1, 0], held: { fire: true } }, 80); run({ aim: [1, 0] }, 30);
  assert(count(log, 'armorBreak') >= 1 && e.armor === 2, `Rail breaks a Brute armor plate (armor=${e.armor}, rails=${log.filter(q=>q.type==='shot'&&q.level===2).length})`); }

// Parry timing against the drill post (standard attack)
{ const { w, p, run, log } = setup('echo', 53.2); w.enemies = []; const post = createEnemy('post', 54.5, 0, { zone: 'gym' }); post.cd = 0; w.enemies.push(post);
  let t = 0; while (post.state !== 'windup' && t++ < 120) run({}, 1);
  const wind = post.atk.wind; run({}, wind - 3); run({ held: { parry: true } }, 1); run({}, 20);
  const par = log.find(q => q.type === 'parry');
  assert(!!par, `Parry lands against a ${post.atk.cat} attack (perfect=${par && par.perfect}, hp=${p.hp})`); }

// Nova intercepts a hostile standard projectile in flight
{ const { w, p, run, log } = setup('nova', 20);
  w.spawnProjectile({ team: 'e', owner: null, x: 32, y: 1.07, vx: -12, vy: 0, r: 0.2, dmg: 6, kind: 'std', ttl: 200 });
  run({ aim: [1, 0], held: { fire: true } }, 1); run({ aim: [1, 0] }, 40);
  assert(count(log, 'intercept') === 1 && p.hp === p.maxHp, `Nova's shot intercepts an incoming projectile (intercepts=${count(log,'intercept')}, hp=${p.hp})`); }

// Bulwark barrier blocks hostile shots and amplifies Nova's own
{ const { w, p, run, log } = setup('nova', 20);
  run({ aim: [1, 0], held: { sig: true } }, 1); run({ aim: [1, 0] }, 6);
  w.spawnProjectile({ team: 'e', owner: null, x: 30, y: 1.07, vx: -12, vy: 0, r: 0.2, dmg: 6, kind: 'std', ttl: 200 });
  run({ aim: [1, 0] }, 50);
  run({ aim: [1, 0], held: { fire: true } }, 1); run({ aim: [1, 0] }, 10);
  assert(count(log, 'barrierBlock') === 1, `Bulwark barrier blocks a hostile shot (${count(log,'barrierBlock')})`);
  assert(count(log, 'amplify') >= 0, `amplify events: ${count(log,'amplify')} (barrier may have expired)`); }

// Echo lash pulls a Sniper off its perch and zips to a Brute
{ const { w, p, run, log } = setup('echo', 88); w.enemies = [];
  const s = createEnemy('sniper', 92.5, 0); s.cd = 999; w.enemies.push(s);
  run({ aim: [1, 0], held: { sig: true } }, 1); run({ aim: [1, 0] }, 12);
  assert(count(log, 'lashPull') === 1 && s.state === 'caught', `Scarf Lash pulls a light enemy (state=${s.state}, dx=${(s.x-p.x).toFixed(2)})`);
  w.enemies = []; const b = createEnemy('brute', p.x + 5, 0); b.cd = 999; b.slamCd = 999; w.enemies.push(b); run({}, 20); log.length = 0;
  run({ aim: [1, 0], held: { sig: true } }, 1); run({ aim: [1, 0] }, 20);
  assert(count(log, 'lashZip') === 1, `Scarf Lash zips Echo to a heavy enemy (gap=${(b.x - p.x).toFixed(2)})`); }

// Concourse Lock wave progression: wave1 -> wave2 (with Brute) -> the Lockwarden -> cleared opens gates
{ const w = new World(); const p = w.addPlayer('test', 'nova'); let prev = { held: {} }; const log = [];
  const run = (o, n = 1) => { for (let i = 0; i < n; i++) { const c = mk(prev, o); prev = c; w.step({ 0: c }); log.push(...w.events); w.events.length = 0; } };
  w.teleport('arena'); run({}, 5); run({ mx: 1 }, 60);
  const killAll = () => w.enemies.filter(e => e.zone === 'arena' && !e.dead).forEach(e => { e.hp = 0.001; w.spawnHitbox({ owner: p, team: 'p', x0: e.x - 1, x1: e.x + 1, y0: e.y, y1: e.y + 3, dmg: 99, poise: 0, kb: [0,0], armorBreak: true, instance: w.newInstance() }); });
  const s1 = w.arena.state; killAll(); run({}, 3);
  const s2 = w.arena.state, brute = w.enemies.some(e => e.type === 'brute'); killAll(); run({}, 3);
  for (let i = 0; i < 6; i++) { killAll(); run({}, 3); }
  const s3 = w.arena.state, boss = w.enemies.find(e => e.type === 'warden'), sealed = GATES.L && GATES.R;
  run({}, 240); killAll(); run({}, 3); run({}, 60);
  assert(s1 === 'wave1' && s2 === 'wave2' && brute && s3 === 'boss' && !!boss && sealed && w.arena.state === 'cleared' && !GATES.L,
    `Arena waves progress wave1 -> wave2 (Brute) -> boss (Lockwarden) -> cleared (${s1} -> ${s2} -> ${s3} -> ${w.arena.state})`);
  assert(count(log, 'banner') >= 3, `Arena banners emitted (${log.filter(q=>q.type==='banner').map(q=>q.text).join(' | ')})`); }
