import { World } from '../game/js/world.js';
const BT = ['jump','dash','melee','fire','parry','sig'];
function mk(prev, o = {}) {
  const held = {}; for (const b of BT) held[b] = !!(o.held && o.held[b]);
  const pressed = {}, released = {};
  for (const b of BT) { pressed[b] = held[b] && !prev.held[b]; released[b] = !held[b] && prev.held[b]; }
  return { mx: o.mx || 0, my: o.my || 0, aimFree: !!o.aim, ax: o.aim ? o.aim[0] : 0, ay: o.aim ? o.aim[1] : 0, held, pressed, released };
}
function runner(world) {
  let prev = { held: {} };
  return (o, n = 1) => { for (let i = 0; i < n; i++) { const c = mk(prev, o); prev = c; world.step({ 0: c }); } };
}
function assert(cond, msg) { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) process.exitCode = 1; }

// 1) Jump height and dash distance for both characters
for (const ch of ['nova', 'echo']) {
  const w = new World(); const p = w.addPlayer('test', ch); const run = runner(w);
  p.x = 2; p.y = 0; run({}, 20);
  let maxY = 0; run({ held: { jump: true } }, 1);
  for (let i = 0; i < 60; i++) { run({ held: { jump: true } }); maxY = Math.max(maxY, p.y); }
  assert(Math.abs(maxY - 3.2) < 0.25, `${ch} jump height ${maxY.toFixed(2)} m (target 3.2)`);
  run({}, 60);
  const x0 = p.x; run({ held: { dash: true }, mx: 1 }, 1); run({ mx: 0 }, 30);
  const dashDist = p.x - x0;
  assert(dashDist > 3.5 && dashDist < 7.5, `${ch} ground dash travel ${dashDist.toFixed(2)} m`);
  // double jump
  run({}, 30); p.x = 5; run({}, 5); let top = 0;
  run({ held: { jump: true } }, 1); run({ held: { jump: true } }, 20); run({}, 2); run({ held: { jump: true } }, 1);
  for (let i = 0; i < 60; i++) { run({ held: { jump: true } }); top = Math.max(top, p.y); }
  assert(top > 5.0, `${ch} jump + double jump reaches ${top.toFixed(2)} m (perches at 5.4)`);
  // Velocity Break: dash then melee should stop hard
  run({}, 60); p.x = 2; run({}, 5);
  run({ held: { dash: true }, mx: 1 }, 1); run({ mx: 1 }, 3); run({ held: { melee: true } }, 1);
  if (ch === 'echo') {
    // Echo (Hunter kit): the Velocity Break is his Dash Slash, a lunge that carries on through
    assert(p.state === 'dashslash' && p.slash.tier >= 1, `echo melee during dash starts the Dash Slash (tier ${p.slash && p.slash.tier})`);
    const x1 = p.x; run({}, 6); assert(p.x - x1 > 0.8, `echo Dash Slash carries on through (${(p.x - x1).toFixed(2)} m in 6 ticks)`);
  } else {
    assert(p.state === 'vb', `${ch} melee during dash starts Velocity Break (state=${p.state}, tier=${p.vbInfo && p.vbInfo.tier})`);
    run({}, 3); assert(Math.abs(p.vx) < 0.5, `${ch} Velocity Break hard stop (vx=${p.vx.toFixed(2)})`);
  }
}

// 2) Arena: walk in, gates close, fight with scripted mashing, no exceptions
{
  const w = new World(); const p = w.addPlayer('test', 'echo'); const run = runner(w);
  w.teleport('arena'); run({}, 10);
  let spawned = false, errs = 0, kills = 0, hits = 0, parries = 0;
  for (let t = 0; t < 60 * 90; t++) {
    const e = w.enemies.find(q => q.zone === 'arena' && !q.dead);
    let o = { mx: 1 };
    if (e) {
      const dx = e.x - p.x;
      o.mx = Math.abs(dx) > 1.4 ? Math.sign(dx) : 0;
      o.held = { melee: t % 8 < 2, parry: (e.state === 'windup' && e.st > 10 && t % 3 === 0) };
      if (e.y > p.y + 2 && t % 40 < 2) o.held.jump = true;
    }
    try { run(o, 1); } catch (err) { errs++; if (errs < 3) console.log(err.stack); }
    for (const ev of w.events) { if (ev.type === 'kill') kills++; if (ev.type === 'hit') hits++; if (ev.type === 'parry') parries++; }
    w.events.length = 0;
    if (w.arena.state !== 'idle') spawned = true;
    if (p.state === 'downed' || p.state === 'dead') { p.hp = p.maxHp; p.state = 'normal'; }
  }
  assert(errs === 0, `arena run without exceptions (${errs})`);
  assert(spawned, `arena encounter triggered (state=${w.arena.state})`);
  console.log(`  arena stats: hits=${hits} kills=${kills} parries=${parries} enemiesLeft=${w.enemies.filter(e=>e.zone==='arena'&&!e.dead).length}`);
}

// 3) Nova ranged: shots intercept turret projectiles in the gym; charge levels
{
  const w = new World(); const p = w.addPlayer('test', 'nova'); const run = runner(w);
  p.x = 24; p.y = 0; let intercepts = 0, shots = 0, rails = 0, errs = 0;
  for (let t = 0; t < 60 * 20; t++) {
    const fire = t % 10 < 1;
    const o = { aim: [1, 0.1], held: { fire: t > 600 ? (t % 140 < 125) : fire } };   // long enough for level 3, short of the beam
    try { run(o, 1); } catch (err) { errs++; if (errs < 3) console.log(err.stack); }
    // top charge level: the Rail (level 2) in the Sentinel kit, a level 3 attachment shot in the Marksman kit
    for (const ev of w.events) { if (ev.type === 'intercept') intercepts++; if (ev.type === 'shot') { shots++; if (ev.level === (ev.attach ? 3 : 2)) rails++; } }
    w.events.length = 0;
    if (p.state === 'downed') { p.hp = p.maxHp; p.state = 'normal'; }
  }
  assert(errs === 0, `nova ranged run without exceptions`);
  console.log(`  nova stats: shots=${shots} rails=${rails} intercepts=${intercepts}`);
  assert(rails > 0, 'fully charged shot (Rail, or a level 3 attachment) fires after holding fire');
}
