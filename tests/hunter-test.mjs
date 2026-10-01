import { World } from '../game/js/world.js';
import { createEnemy } from '../game/js/enemies.js';
import { SETTINGS } from '../game/js/config.js';
SETTINGS.echoKit = 'hunter';
const BT = ['jump','dash','melee','fire','parry','sig'];
function mk(prev, o = {}) {
  const held = {}; for (const b of BT) held[b] = !!(o.held && o.held[b]);
  const pressed = {}, released = {};
  for (const b of BT) { pressed[b] = held[b] && !prev.held[b]; released[b] = !held[b] && prev.held[b]; }
  return { mx: o.mx || 0, my: o.my || 0, aimFree: !!o.aim, ax: o.aim ? o.aim[0] : 0, ay: o.aim ? o.aim[1] : 0, held, pressed, released };
}
function setup(x = 99) {
  const w = new World(); w.enemies = []; const p = w.addPlayer('test', 'echo');
  p.x = x; p.y = 0; let prev = { held: {} }; const log = [];
  const run = (o, n = 1) => { for (let i = 0; i < n; i++) { const c = mk(prev, o); prev = c; w.step({ 0: c }); log.push(...w.events); w.events.length = 0; } };
  run({}, 10); p.mercy = 0; return { w, p, run, log };
}
const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const count = (log, t) => log.filter(e => e.type === t).length;

{ // Blade chain reaches the glaive finisher
  const { w, p, run } = setup(98); const post = createEnemy('post', 99.6, 0); post.cd = 9999; w.enemies.push(post);
  const seen = new Set();
  for (let i = 0; i < 60; i++) { run({ held: { melee: i % 6 < 1 } }, 1); if (p.moveId) seen.add(p.moveId); }
  assert(['echo_b1', 'echo_b2', 'echo_b3', 'echo_b4'].every(id => seen.has(id)), `Twin-blade chain b1 > b2 > b3 > glaive finisher (${[...seen].join(', ')})`);
}
{ // Thrown snare roots a Swarmer
  const { w, p, run, log } = setup(98); const e = createEnemy('swarmer', 103, 0); e.cd = 9999; w.enemies.push(e);
  run({ aim: [1, 0], held: { fire: true } }, 1); run({ aim: [1, 0] }, 40);
  assert(e.state === 'snared' || count(log, 'snared') > 0, `Thrown snare roots a Swarmer (state=${e.state}, snared events=${count(log, 'snared')})`);
}
{ // Snare wraps a Shieldbearer even from the front
  const { w, p, run, log } = setup(98); const e = createEnemy('shield', 102.5, 0); e.cd = 9999; e.shieldDir = -1; w.enemies.push(e);
  run({ aim: [1, 0], held: { fire: true } }, 1); run({ aim: [1, 0] }, 30);
  assert(count(log, 'snared') === 1 && count(log, 'blocked') === 0, `Snare catches a shielded enemy head-on (snared=${count(log, 'snared')}, blocked=${count(log, 'blocked')})`);
}
{ // Planted snare triggers when an enemy walks into it
  const { w, p, run, log } = setup(98);
  run({ my: -1, held: { fire: true } }, 1); run({}, 15);
  const e = createEnemy('swarmer', 104, 0); e.cd = 9999; w.enemies.push(e);
  p.x = 96; run({}, 150);
  assert(count(log, 'snareTrigger') === 1, `Planted snare springs on an approaching enemy (triggers=${count(log, 'snareTrigger')}, planted=${count(log, 'snarePlant')})`);
}
{ // Hold the grapple on a light enemy: it is reeled in and dragged on the tether (open ground, no triggers)
  const { w, p, run, log } = setup(103); const e = createEnemy('swarmer', 107.5, 0); e.cd = 9999; w.enemies.push(e);
  run({ aim: [1, 0], held: { sig: true } }, 14);
  const leashed = !!p.leash;
  run({ mx: -1, held: { sig: true } }, 40);
  const gap = Math.abs(e.x - p.x);
  assert(leashed && count(log, 'leash') === 1 && gap < 2.8, `Held grapple reels in and drags a light enemy (leash=${leashed}, gap after walking away=${gap.toFixed(2)} m)`);
  run({}, 5);
  assert(!p.leash, 'Releasing the button releases the tether');
}
{ // Hold the grapple on a heavy enemy: yank instead of zip
  const { w, p, run, log } = setup(98); const b = createEnemy('brute', 104, 0); b.cd = 9999; b.slamCd = 9999; w.enemies.push(b);
  run({ aim: [1, 0], held: { sig: true } }, 20);
  assert(count(log, 'yank') === 1 && count(log, 'lashZip') === 0 && b.poise > 0, `Held grapple yanks a Brute off balance (poise=${b.poise.toFixed(1)})`);
  run({}, 250); log.length = 0;
  run({ aim: [1, 0], held: { sig: true } }, 3); run({ aim: [1, 0] }, 20);
  assert(count(log, 'lashZip') === 1, 'A tapped grapple still zips Echo to a heavy enemy');
}
{ // Pursuit kit is unchanged when selected
  SETTINGS.echoKit = 'pursuit';
  const { w, p, run } = setup(98); const post = createEnemy('post', 99.6, 0); post.cd = 9999; w.enemies.push(post);
  run({ held: { melee: true } }, 1);
  assert(p.moveId === 'echo_g1', `Pursuit kit keeps the original chain (${p.moveId})`);
  SETTINGS.echoKit = 'hunter';
}
