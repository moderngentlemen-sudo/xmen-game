// New enemies (Drone, Mortar, Charger) running in the real simulation, headless.
import { World } from '../game/js/world.js';
import { createEnemy, MORTAR, CHARGER } from '../game/js/enemies.js';
import { SETTINGS } from '../game/js/config.js';
SETTINGS.novaKit = 'marksman'; SETTINGS.echoKit = 'hunter';
const BT = ['jump', 'dash', 'melee', 'fire', 'parry', 'sig', 'mode'];
function mk(prev, o = {}) {
  const held = {}; for (const b of BT) held[b] = !!(o.held && o.held[b]);
  const pressed = {}, released = {};
  for (const b of BT) { pressed[b] = held[b] && !prev.held[b]; released[b] = !held[b] && !!prev.held[b]; }
  return { mx: o.mx || 0, my: o.my || 0, aimFree: !!o.aim, ax: o.aim ? o.aim[0] : 0, ay: o.aim ? o.aim[1] : 0, held, pressed, released };
}
function setup(x = 100, char = 'nova') {
  const w = new World(); w.enemies = [];
  const p = w.addPlayer('test', char); p.x = x; p.y = 0;
  let prev = { held: {} }; const log = [];
  const run = (o = {}, n = 1, each = null) => {
    for (let i = 0; i < n; i++) { const c = mk(prev, o); prev = c; w.step({ 0: c }); log.push(...w.events); w.events.length = 0; if (each && each()) return true; }
    return false;
  };
  run({}, 10); p.mercy = 0;
  return { w, p, run, log };
}
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const count = (log, t, f = () => true) => log.filter(e => e.type === t && f(e)).length;
const spawn = (w, type, x, y, o = {}) => { const e = createEnemy(type, x, y, o); w.enemies.push(e); return e; };

{ // Drone: climbs above and beside the player, keeps station, and fires parryable shots
  const { w, p, run, log } = setup(100);
  const d = spawn(w, 'drone', 106, 2);
  run({}, 120);
  const above = d.y - p.y, side = Math.abs(d.x - p.x);
  run({}, 160, () => { p.mercy = 60; p.hp = p.maxHp; return false; });
  const shots = count(log, 'enemyShot', s => s.e === d) + count(log, 'telegraph', t => t.e === d && t.cat === 'standard');
  assert(above > 2.4 && above < 4.6 && side > 3.5 && side < 7.5 && shots >= 1,
    `Drone hovers ${above.toFixed(1)} m up and ${side.toFixed(1)} m to the side, and attacks (${shots} telegraphs/shots)`);
}
{ // Drone hit: it flinches in the air instead of dropping, then keeps flying
  const { w, p, run, log } = setup(100);
  const d = spawn(w, 'drone', 104, 3.2, { cd: 9999 });
  run({}, 30);
  const y0 = d.y;
  w.spawnHitbox({ owner: p, team: 'p', x0: d.x - 1, x1: d.x + 1, y0: d.y - 1, y1: d.y + 1, dmg: 1, poise: 5, kb: [4, 12], launcher: true, instance: w.newInstance() });
  run({}, 1); const st = d.state;
  run({}, 60);
  assert(st === 'hitstun' && d.y > 1.5 && d.state !== 'launched' && !d.dead, `Hit drone flinches (${st}) and stays airborne (y ${y0.toFixed(1)} -> ${d.y.toFixed(1)})`);
}
{ // Mortar: telegraphs, lobs a shell at where the player stands, and the burst hits a player who stays put
  const { w, p, run, log } = setup(100);
  const m = spawn(w, 'mortar', 110, 0);
  const shot = run({}, 200, () => count(log, 'mortarShot') > 0);
  const ev = log.find(e => e.type === 'mortarShot');
  const blast = run({}, 120, () => { p.mercy = 0; return count(log, 'enemyBlast') > 0; });
  const b = log.find(e => e.type === 'enemyBlast');
  assert(shot && ev && Math.abs(ev.x - 100) < 0.6 && count(log, 'telegraph', t => t.e === m && t.cat === 'unblockable') === 1 && blast &&
    Math.abs(b.x - 100) < 1.2 && count(log, 'playerHit') >= 1,
    `Mortar marks x=${ev && ev.x.toFixed(1)}, bursts at x=${b && b.x.toFixed(1)} and hits the player who stood still`);
}
{ // Mortar: a player who walks out of the marker is not hit; a parry does not help against the burst
  const { w, p, run, log } = setup(100);
  spawn(w, 'mortar', 110, 0);
  run({}, 200, () => count(log, 'mortarShot') > 0);
  run({ mx: 1 }, 30); run({}, 70);   // step out of the marker (toward the mortar, away from the arena)
  const dodged = count(log, 'enemyBlast') === 1 && count(log, 'playerHit') === 0;
  const t = setup(100, 'echo'); spawn(t.w, 'mortar', 110, 0);   // Echo parries (Nova's Marksman kit dodges)
  t.run({}, 200, () => count(t.log, 'mortarShot') > 0);
  const fly = t.log.find(e => e.type === 'mortarShot').ticks;
  t.run({}, fly - 10); t.run({ held: { parry: true } }, 1); t.run({}, 20);   // the shell bursts on his head a few ticks before the floor
  assert(dodged && count(t.log, 'parryFail') >= 1 && count(t.log, 'playerHit') >= 1, `Walking out avoids the burst; parrying it fails`);
}
{ // Mortar shells burst on walls too (cover works)
  const { w, p, run, log } = setup(112.2);
  spawn(w, 'mortar', 104, 0);
  w.projectiles.length = 0;
  // A shell thrown into the step wall at x=113 from the left bursts there instead of reaching the player
  w.spawnProjectile({ team: 'e', owner: null, x: 111, y: 1.2, vx: 12, vy: 0, gravity: 0, r: 0.3, dmg: 0, heavy: true, kind: 'mortar', ttl: 60, blast: { ...MORTAR.blast } });
  run({}, 20);
  assert(count(log, 'enemyBlast') === 1, `A shell that hits a wall bursts there`);
}
{ // Charger: heavy telegraph, then a charge that hits a player standing in its path
  const { w, p, run, log } = setup(100);
  const c = spawn(w, 'charger', 108, 0, { cd: 0 });
  run({}, 150, () => count(log, 'playerHit') > 0);
  assert(count(log, 'telegraph', t => t.e === c && t.cat === 'heavy') >= 1 && count(log, 'chargeStart') >= 1 && count(log, 'playerHit', h => h.heavy) === 1,
    `Charger telegraphs a heavy attack, charges, and hits the player (${count(log, 'playerHit')} hit)`);
}
{ // A perfect parry stops the charge and leaves the Charger dazed
  const { w, p, run, log } = setup(100, 'echo');
  const c = spawn(w, 'charger', 108, 0, { cd: 0 });
  run({}, 150, () => c.state === 'charge' && c.x - p.x < 1.76 + 0.45);
  run({ held: { parry: true } }, 1); run({}, 12);
  const par = log.find(e => e.type === 'parry');
  assert(par && par.perfect && ['dazed', 'stagger'].includes(c.state) && count(log, 'playerHit') === 0, `Perfect parry negates the charge; Charger is ${c.state}`);
}
{ // Crashing into a wall dazes it; its armor plate needs an armor-breaking hit
  const { w, p, run, log } = setup(111.3);
  const c = spawn(w, 'charger', 104, 0, { cd: 0 });
  run({}, 150, () => c.state === 'charge');
  run({}, 60, () => { p.y = 6; p.vy = 0; p.x = 111.3; return c.state === 'dazed'; });
  const crash = count(log, 'chargeCrash'), dazed = c.state;
  p.y = 0;
  w.spawnHitbox({ owner: p, team: 'p', x0: c.x - 1, x1: c.x + 1, y0: 0, y1: 2, dmg: 2, poise: 5, kb: [0, 0], instance: w.newInstance() });
  run({}, 1); const hp1 = c.hp, armor1 = c.armor;
  w.spawnHitbox({ owner: p, team: 'p', x0: c.x - 1, x1: c.x + 1, y0: 0, y1: 2, dmg: 2, poise: 5, kb: [0, 0], armorBreak: true, instance: w.newInstance() });
  run({}, 1);
  assert(crash === 1 && dazed === 'dazed' && armor1 === 1 && Math.abs(hp1 - (12 - 2 * 0.3)) < 1e-9 && c.armor === 0,
    `Charger crashes into the wall and is dazed; plain hits do 30% (hp ${hp1.toFixed(1)}), an armor-break hit strips the plate`);
}
{ // Enemies that fall out of the level die (so an encounter can still finish)
  const { w, run, log } = setup(100);
  const e = spawn(w, 'swarmer', 100, -12);
  run({}, 2);
  assert(e.dead && count(log, 'kill', k => k.e === e) === 1, `A Swarmer below the kill line dies`);
}
