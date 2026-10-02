// The team edition's simulation (game/js/sim/), run headless: determinism and snapshots, the rescue mission, the
// three rebuilt heroes, team-ups, the solo squad, Sentinels that adapt, perfect defence, Hunters, and the tick cost.
import { createWorld, step, snapshot, restore, hashState, removePlayer } from '../game/js/sim/world.js';
import { createEnemy } from '../game/js/sim/enemies.js';
import { BTN, HEROES, ENEMIES, ADAPT, TEAM, GAUGE, SQUAD } from '../game/js/sim/config.js';
import { SECTIONS } from '../game/js/sim/mission.js';
import { hitEnemy, spawnHitbox, resolveHitboxes, spawnProjectile } from '../game/js/sim/combat.js';
import { setHero, downPlayer } from '../game/js/sim/player.js';
import { bankPath } from '../game/js/sim/heroes/cyclops.js';
import { makeKid } from '../game/js/sim/kid.js';
import { resetAdapt } from '../game/js/sim/adapt.js';
import { newStreak } from '../game/js/sim/combo.js';

const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const bits = (...names) => names.reduce((b, n) => b | BTN[n], 0);
const cmd = (o = {}) => ({ mx: o.mx || 0, my: o.my || 0, ax: o.aim ? o.aim[0] : 1, ay: o.aim ? o.aim[1] : 0, aim: !!o.aim, b: o.b || 0 });
const count = (log, type, f = () => true) => log.filter(e => e.type === type && f(e)).length;

// A world for one check: heroes placed at x, the mission parked (no waves) unless `mission` is set
function setup({ heroes = ['cyclops'], x = 20, y = 0, seed = 3, mission = false } = {}) {
  const S = createWorld({ seed, players: heroes.length });
  heroes.forEach((h, i) => { const p = S.players[i]; if (p.hero !== h) setHero(S, p, h); p.x = x + i * 1.2; p.y = y; p.mercy = 0; });
  if (!mission) S.mission.phase = 'test';
  const log = [];
  // spec: one command for player 0, an array (one per player), or a function (tick, player index) => command
  const run = (spec = {}, n = 1, until = null) => {
    for (let i = 0; i < n; i++) {
      const cmds = {};
      S.players.forEach((p, j) => { const o = typeof spec === 'function' ? spec(i, j) : Array.isArray(spec) ? spec[j] : j === 0 ? spec : {}; cmds[p.slot] = cmd(o || {}); });
      step(S, cmds); log.push(...S.events);
      if (until && until()) return i + 1;
    }
    return n;
  };
  return { S, p: S.players[0], ps: S.players, run, log };
}
const enemy = (S, type, x, y = 0, o = {}) => { const e = createEnemy(S, type, x, y, { cd: 9999, onGround: true, ...o }); S.enemies.push(e); return e; };

// ---- Random play, for determinism and the tick cost --------------------------------------------------------
function randomInputs(seed, players, ticks) {
  let s = seed >>> 0;
  const r = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const cur = Array.from({ length: players }, () => ({ mx: 1, my: 0, ax: 1, ay: 0, aim: false, b: 0 })), out = [];
  for (let t = 0; t < ticks; t++) {
    const frame = {};
    cur.forEach((c, i) => {
      if (r() < 0.08) c.mx = r() < 0.75 ? 1 : r() < 0.5 ? -1 : 0;
      if (r() < 0.05) c.my = r() < 0.6 ? 0 : r() < 0.5 ? 1 : -1;
      if (r() < 0.04) { c.aim = r() < 0.5; const a = r() * Math.PI * 2; c.ax = Math.cos(a); c.ay = Math.sin(a); }
      if (r() < 0.12) c.b = (r() * 64) | 0;
      frame[i] = { ...c };
    });
    out.push(frame);
  }
  return out;
}
function playRandom(seed, players, ticks, every) {
  const S = createWorld({ seed, players }), cmds = randomInputs(seed * 31 + 7, players, ticks), hashes = [];
  let stuck = 0; const inState = new Map();
  const t0 = performance.now();
  for (let t = 0; t < ticks; t++) {
    step(S, cmds[t]);
    if (t % every === 0) hashes.push(hashState(S));
    for (const p of S.players) {
      const k = ['held', 'thrown', 'teamup'].includes(p.state) ? (inState.get(p.id) || 0) + 1 : 0;
      inState.set(p.id, k); stuck = Math.max(stuck, k);
    }
  }
  return { S, hashes, ms: (performance.now() - t0) / ticks, stuck };
}

{
  const a = playRandom(11, 4, 36000, 60), b = playRandom(11, 4, 36000, 60);
  const diverged = a.hashes.findIndex((h, i) => h !== b.hashes[i]);
  assert(diverged === -1 && a.hashes.length === 600, `ten minutes of four-player play replays exactly (600 state hashes match)${diverged >= 0 ? `; diverged at sample ${diverged}` : ''}`);
  const c = playRandom(12, 4, 3600, 60);
  assert(c.hashes.some((h, i) => h !== a.hashes[i]), 'a different seed and input stream gives a different run');
  assert(a.stuck < 300, `nobody stays held, thrown or mid team-up for 5 s or more under random play (longest ${a.stuck} ticks)`);
  assert(a.ms < 0.5, `a tick of four-player play costs ${a.ms.toFixed(3)} ms on average (budget 0.5 ms)`);
  assert(a.S.mission.stats.kills > 10, `random play still fights through the mission (${a.S.mission.stats.kills} Sentinels down, section ${a.S.mission.sec})`);
}

// ---- Snapshots ------------------------------------------------------------------------------------------
{
  const S = createWorld({ seed: 5, players: 3 }), cmds = randomInputs(99, 3, 3000);
  for (let t = 0; t < 1200; t++) step(S, cmds[t]);
  const snap = snapshot(S), bytes = JSON.stringify(snap).length;
  for (let t = 1200; t < 3000; t++) step(S, cmds[t]);
  const h1 = hashState(S);
  const R = restore(snap);
  for (let t = 1200; t < 3000; t++) step(R, cmds[t]);
  assert(hashState(R) === h1, 'restoring a snapshot and replaying the same inputs reaches the same state');
  assert(bytes < 32 * 1024, `a snapshot is ${(bytes / 1024).toFixed(1)} KB (target under 32 KB)`);
  const t0 = performance.now(); for (let i = 0; i < 200; i++) restore(snapshot(S));
  const ms = (performance.now() - t0) / 200;
  assert(ms < 0.5, `snapshot plus restore takes ${ms.toFixed(3)} ms`);
}

// ---- The mission ------------------------------------------------------------------------------------------
{
  const { S, p, run, log } = setup({ x: 2, mission: true });
  const kill = () => { for (const e of S.enemies) if (!e.dead) hitEnemy(S, e, { owner: p.id, team: 'p', inst: 1e6 + e.id, dmg: 9999, power: 'plain' }); };
  run({ mx: 1 }, 40);
  assert(count(log, 'sectionStart') === 1, 'crossing into the rooftop starts its fight');
  run({}, 30);
  assert(count(log, 'enemyDrop') === SECTIONS[0].waves[0].length, `the first wave drops in (${count(log, 'enemyDrop')} Sentinels)`);
  assert(S.gates.G1, 'the gate ahead stays shut while the fight is on');
  kill(); run({}, 80);
  assert(count(log, 'enemyDrop') === SECTIONS[0].waves[0].length + SECTIONS[0].waves[1].length, 'when a wave falls the next drops in');
  kill(); run({}, 10);
  assert(!S.gates.G1 && count(log, 'gateOpen', e => e.gate === 'G1') === 1 && S.mission.sec === 1, 'clearing the rooftop opens G1 and moves the mission to the cell block');
}
{
  // The cell block: break the door, the kid comes out, a Collector comes for her
  const { S, p, run, log } = setup({ heroes: ['wolverine'], x: 87.6, mission: true });
  S.mission.sec = 1; S.mission.secId = 'cells'; S.mission.phase = 'test'; S.gates.G1 = false;
  p.facing = 1;
  run((i) => ({ b: i % 8 < 3 ? bits('attack') : 0 }), 400, () => !S.gates.cell);
  assert(count(log, 'doorHit') > 0 && !S.gates.cell && count(log, 'doorBroken') === 1, 'claws break the cell door');
  run({}, 5);
  assert(S.kid.state !== 'caged' && count(log, 'kidReleased') === 1, 'the kid comes out of her cell');
  assert(count(log, 'enemyDrop', e => e.unit === 'collector') === 1, 'and the Sentinels send a Collector for her');
}
{
  // A Collector carries her out: the section fails and restarts with her back in the cell
  const { S, p, run, log } = setup({ heroes: ['cyclops'], x: 70, mission: true });
  S.mission.sec = 1; S.mission.secId = 'cells'; S.mission.phase = 'test'; S.gates.G1 = false; S.gates.cell = false; S.mission.released = true;
  S.kid = makeKid(67, 0, 'follow');
  const c = enemy(S, 'collector', 64, 0, { cd: 0 }); c.facing = 1;
  p.mercy = 99999;
  run({}, 1500, () => count(log, 'missionFail') > 0);
  assert(count(log, 'kidGrabbed') === 1 && count(log, 'kidTaken') >= 1 && count(log, 'missionFail', e => e.why === 'kid') === 1, 'a Collector that gets the kid out of the section fails it');
  run({}, 200, () => count(log, 'checkpoint') > 0);
  assert(count(log, 'checkpoint') === 1 && S.kid.state === 'caged' && S.gates.cell && S.mission.door.hp === 30, 'the section restarts with the kid back in her cell behind a fresh door');
  assert(S.players[0].x <= SECTIONS[1].spawn.x + 0.01 && S.enemies.length === 0 && S.mission.phase === 'wait', 'the team is back at the start of the cell block and its Sentinels are gone');
}
{
  // The whole team down: the section restarts
  const { S, ps, run, log } = setup({ heroes: ['cyclops', 'jean'], x: 20, mission: true });
  downPlayer(S, ps[0]); downPlayer(S, ps[1]);
  run({}, 300, () => count(log, 'checkpoint') > 0);
  assert(count(log, 'missionFail', e => e.why === 'team') === 1 && count(log, 'checkpoint') === 1, 'with every hero down the section fails and restarts');
  assert(ps.every(q => q.state === 'normal' && q.hp === q.maxHp), 'and everyone is back on their feet');
}
{
  // The hangar: the Mk-II falls, she runs for the X-Jet, the mission is won
  const { S, p, run, log } = setup({ heroes: ['cyclops'], x: 230, y: 3.6, mission: true });
  Object.assign(S.mission, { sec: 3, secId: 'hangar', phase: 'fight', wave: 1 });
  S.gates.G1 = S.gates.G2 = S.gates.G3 = false;
  S.kid = makeKid(204, 3.6, 'follow');
  const boss = enemy(S, 'mk2', 236, 3.6);
  run({}, 2);
  hitEnemy(S, boss, { owner: p.id, team: 'p', inst: 424242, dmg: 9999, power: 'team' }); log.push(...S.events);
  run({}, 900, () => S.mission.done);
  assert(count(log, 'kill', e => e.boss) === 1 && count(log, 'escape') === 1, 'the Mk-II falls and the escape is on');
  assert(count(log, 'kidRun') === 1 && count(log, 'kidBoarded') === 1 && S.mission.done && count(log, 'missionComplete') === 1, 'she runs up the ramp and the mission is complete');
}

// ---- Cyclops -------------------------------------------------------------------------------------------------
{
  const { S, p, run, log } = setup({ heroes: ['cyclops'], x: 26 });
  const pts = bankPath(S, 30, 1.5, 0.94, 0.34, 30, 2);
  assert(pts.length === 3 && Math.abs(pts[1][0] - 40) < 0.05, 'an optic blast banks off the closed gate at a true angle');
  const t1 = enemy(S, 'trooper', 30), t2 = enemy(S, 'trooper', 33);
  t1.hitstop = t2.hitstop = 1e9;
  run({ b: bits('power') }, 3); run({}, 3);
  assert(count(log, 'optic') === 1 && Math.abs(t1.maxHp - t1.hp - HEROES.cyclops.optic.dmg[0]) < 0.01 && t2.hp === t2.maxHp, 'a tapped blast hits the first Sentinel for the narrow-aperture damage and stops there');
  run({}, 20);
  const before = [t1.hp, t2.hp];
  run({ b: bits('power') }, 50); run({}, 3);
  assert(before[0] - t1.hp > 10 && before[1] - t2.hp > 10, 'held fully open, the beam is wider, harder and pierces both');
  assert(p.strain > 25, `blasts build strain (${p.strain.toFixed(0)})`);
  run({}, 30);
  run({ b: bits('jump') }, 8);
  run({ b: bits('power'), aim: [0, -1] }, 3); run({ aim: [0, -1] }, 2);
  assert(count(log, 'vault') === 1 && p.vy > 5, 'a blast fired at the floor vaults him upward');
}

{
  // Holding Power through the end of a combo still opens the visor once he is free
  const { S, p, run, log } = setup({ heroes: ['cyclops'], x: 16 });
  run({ b: bits('attack') }, 2); run({}, 4); run({ b: bits('attack') }, 2);
  run({ b: bits('power') }, 60);
  assert(p.openT > 0 && count(log, 'apertureOpen') === 1, 'Power held through an attack opens the visor as soon as he is free');
  run({}, 2);
  assert(count(log, 'optic') === 1, 'and letting go fires');
}

// ---- Wolverine ---------------------------------------------------------------------------------------------
{
  const { S, p, run, log } = setup({ heroes: ['wolverine'], x: 18 });
  const t = enemy(S, 'trooper', 24); t.hitstop = 1e9;
  const x0 = p.x;
  run({ b: bits('power') }, 50); run({}, 20);
  assert(count(log, 'drill', e => e.tier === 2) === 1 && p.x - x0 > 5, `a fully coiled Drill Claw lunges ${(p.x - x0).toFixed(1)} m`);
  assert(t.maxHp - t.hp >= HEROES.wolverine.drill.dmg[2] - 0.01, 'and drills through the Sentinel in its path');
  assert(p.rage > 0, `hits build rage (${p.rage.toFixed(1)})`);
  p.hp = 40; p.rage = 100; p.lastHurtT = 999;
  run({}, 240);
  assert(p.hp > 55 && p.rage < 100, `the healing factor spends rage as health (hp ${p.hp.toFixed(0)}, rage ${p.rage.toFixed(0)})`);
  p.rage = 75;
  run({ b: bits('sig') }, 2); run({}, 2);
  assert(count(log, 'berserk') === 0 && count(log, 'sigWait') === 1, 'below 80 rage, Signature waits');
  p.rage = 100;
  run({ b: bits('sig') }, 2);
  assert(count(log, 'berserk') === 1 && p.berserkT > 400 && p.rage === 0, 'with the rage up, Signature sends him berserk');
}

// ---- Jean Grey --------------------------------------------------------------------------------------------------
{
  const { S, p, run, log } = setup({ heroes: ['jean'], x: 18 });
  const a = enemy(S, 'trooper', 22), b = enemy(S, 'trooper', 31); b.hitstop = 1e9;
  run({ b: bits('power') }, 25);
  assert(count(log, 'tkGrab', e => e.kind === 'enemy' && e.target === a.id) === 1 && a.state === 'held', 'holding Power grips the Sentinel along her aim');
  run({}, 60, () => count(log, 'thrownImpact') > 0);
  assert(count(log, 'tkThrow', e => e.kind === 'enemy') === 1 && b.hp < b.maxHp && a.hp < a.maxHp, 'letting go throws it into the next one: both are hurt');
}
{
  const { S, p, run, log } = setup({ heroes: ['jean'], x: 18 });
  const g = enemy(S, 'gunner', 30); g.hitstop = 1e9;
  const shot = spawnProjectile(S, { team: 'e', owner: g.id, x: 25, y: 1.3, vx: -15, vy: 0, r: 0.18, dmg: 6, kind: 'bolt', ttl: 150 });
  run({ b: bits('power') }, 6);
  assert(count(log, 'tkGrab', e => e.kind === 'proj') === 1 && shot.heldBy === p.id, 'she catches an incoming shot (shots come first in her aim)');
  run({}, 40);
  assert(count(log, 'tkThrow', e => e.kind === 'proj') === 1 && g.hp < g.maxHp, 'and sends it back into the gunner');
}
{
  const { S, p, run, log } = setup({ heroes: ['jean'], x: 18 });
  run({ b: bits('sig') }, 2);
  const shot = spawnProjectile(S, { team: 'e', owner: 0, x: 22, y: 1.2, vx: -15, vy: 0, r: 0.18, dmg: 6, kind: 'bolt', ttl: 150 });
  const hp = p.hp;
  run({}, 30);
  assert(count(log, 'shield') === 1 && count(log, 'shieldBlock') >= 1 && p.hp === hp && shot.dead, 'the TK Shield stops enemy shots');
  run({ b: bits('jump') }, 20);
  let minVy = 0; run({ b: bits('jump') }, 40, () => { minVy = Math.min(minVy, p.vy); return false; });
  assert(p.levitating || minVy > -3, `holding jump in the air, she levitates (slowest fall ${minVy.toFixed(1)} m/s)`);
}

// ---- Team-ups (co-op) ----------------------------------------------------------------------------------------------
{
  const { S, ps, run, log } = setup({ heroes: ['jean', 'wolverine'], x: 16 });
  const [jean, wolv] = ps;
  const t = enemy(S, 'trooper', 27); t.hitstop = 1e9;
  run([{ b: bits('team') }, {}], 2);
  assert(count(log, 'teamup', e => e.kind === 'fastball') === 1 && wolv.state === 'held' && jean.state === 'teamup', 'Jean next to Wolverine: Team starts the Fastball Special');
  run([{}, {}], 8); run([{ b: bits('team') }, {}], 2);
  assert(count(log, 'fastballThrow') === 1 && wolv.state === 'thrown', 'a second press throws him');
  run([{}, {}], 40);
  assert(log.some(e => e.type === 'hit' && e.id === t.id && e.power === 'team') && count(log, 'fastballSlam') === 1 && wolv.state === 'normal', 'he drills through the Sentinel in line (a team hit) and lands');
  assert(S.gauge >= GAUGE.teamup, 'the team-up fills the shared X-Gauge');
}
{
  const { S, ps, run, log } = setup({ heroes: ['cyclops', 'jean'], x: 16 });
  const t = enemy(S, 'trooper', 26); t.hitstop = 1e9;
  run([{ b: bits('team') }, {}], 2);
  assert(count(log, 'teamup', e => e.kind === 'rapport') === 1 && S.rapportT > 0, 'Cyclops and Jean: Psychic Rapport');
  run([{}, {}], 12); run([{ b: bits('power') }, {}], 3); run([{}, {}], 3);
  assert(log.some(e => e.type === 'optic' && e.rapport) && log.some(e => e.type === 'hit' && e.id === t.id && e.power === 'team'), 'his blasts bend onto targets and count as team hits');
}
{
  const { S, ps, run, log } = setup({ heroes: ['jean', 'wolverine'], x: 16 });
  const [jean, wolv] = ps;
  wolv.x = 10; wolv.facing = 1;
  const t = enemy(S, 'trooper', 22); t.hitstop = 0;
  run([{ b: bits('team') }, {}], 2);
  assert(count(log, 'teamup', e => e.kind === 'lift') === 1 && t.liftT > 0, 'Jean aiming at a Sentinel, not an ally: Lift and Hold pins it in the air');
  S.adapt.active = 'claws';
  hitEnemy(S, t, { owner: wolv.id, team: 'p', inst: 31337, dmg: 10, power: 'claws' });
  const ev = log.length ? null : null; // events land on the next step's log; read S.events directly
  const hit = S.events.filter(e => e.type === 'hit' && e.id === t.id).pop();
  assert(hit && hit.power === 'team' && Math.abs(hit.dmg - 10 * TEAM.lift.bonus) < 0.01 && !hit.resisted, 'an ally\'s hit on the lifted Sentinel lands harder and goes round the counter');
}
{
  const { S, ps, run, log } = setup({ heroes: ['cyclops', 'wolverine'], x: 16 });
  const [cyc, wolv] = ps;
  const t = enemy(S, 'trooper', wolv.x + 1.3); t.hitstop = 1e9;
  run([{ b: bits('team') }, {}], 2);
  assert(count(log, 'teamup', e => e.kind === 'edge') === 1 && wolv.edge && wolv.edge.strikes === TEAM.edge.strikes, 'Cyclops and Wolverine: Optic Edge charges his claws');
  run([{}, { b: bits('attack') }], 3); run([{}, {}], 20);
  assert(count(log, 'edgeWave') >= 1, 'his claw strikes throw optic shockwaves');
}
{
  const { S, ps, run, log } = setup({ heroes: ['cyclops', 'jean'], x: 16 });
  const t = enemy(S, 'trooper', 24);
  S.gauge = GAUGE.max;
  run([{ b: bits('team', 'sig') }, {}], 2);
  assert(count(log, 'ultCast') === 1 && S.gauge === 0 && ps.every(q => q.state === 'ult'), 'Team and Signature together spend a full gauge: To Me, My X-Men');
  run([{}, {}], 120);
  assert(count(log, 'ultEnd') === 1 && t.hp < t.maxHp && ps.every(q => q.state === 'normal'), 'the team ultimate strikes every Sentinel near the team, then play resumes');
}

// ---- The solo squad ---------------------------------------------------------------------------------------------
{
  const { S, p, run, log } = setup({ heroes: ['cyclops'], x: 16 });
  assert(p.squad && p.squad.length === 3, 'alone, you run a squad of three');
  p.hp = 60;
  run({ b: bits('team') }, 3); run({}, 3);
  assert(count(log, 'tag', e => e.from === 'cyclops' && e.to === 'wolverine') === 1 && p.hero === 'wolverine', 'tapping Team tags the next hero in');
  assert(Math.abs(p.squad.find(s => s.hero === 'cyclops').hp - 60) < 1, 'the benched hero keeps his health (and heals slowly on the bench)');
  enemy(S, 'trooper', 22);
  run({}, SQUAD.tagCd);
  const g = S.gauge;
  run({ b: bits('team') }, SQUAD.holdTicks + 2); run({}, 2);
  assert(count(log, 'assist') === 1 && S.gauge > g, 'holding Team calls a benched hero in for an assist');
  run({}, 120);
  downPlayer(S, p);
  run({}, 60);
  assert(count(log, 'tag', e => e.forced) === 1 && p.state === 'normal', 'when the hero on the field goes down, the next one tags in');
}

// ---- Sentinels that adapt ------------------------------------------------------------------------------------------
{
  const { S, p, run, log } = setup({ heroes: ['cyclops'], x: 16 });
  const t = enemy(S, 'trooper', 30, 0, { hp: 9999, maxHp: 9999 }); t.hitstop = 1e9;
  // Each blast its own combo, so combo scaling (combo.js) stays out of this check
  for (let i = 0; i < 10; i++) { p.streak = newStreak(); hitEnemy(S, t, { owner: p.id, team: 'p', inst: 9000 + i, dmg: 10, power: 'optic' }); }
  run({}, ADAPT.check + 2);
  assert(count(log, 'adapting', e => e.power === 'optic') === 1 && S.adapt.warn === 'optic', 'leaning on optic blasts: the Sentinels warn they are adapting');
  run({}, ADAPT.warn + 2);
  assert(count(log, 'adapted') === 1 && S.adapt.active === 'optic', `then they field ${ADAPT.counters.optic.name}`);
  const hp = t.hp;
  hitEnemy(S, t, { owner: p.id, team: 'p', inst: 9100, dmg: 10, power: 'optic', heavy: true });
  assert(Math.abs(hp - t.hp - 10 * ADAPT.counters.optic.mult) < 0.01, 'optic damage is now cut to a fifth');
  const hp2 = t.hp;
  hitEnemy(S, t, { owner: p.id, team: 'p', inst: 9101, dmg: 10, power: 'team', heavy: true });
  hitEnemy(S, t, { owner: p.id, team: 'p', inst: 9102, dmg: 10, power: 'claws', heavy: true });
  assert(Math.abs(hp2 - t.hp - 20) < 0.01, 'team-ups and the other powers still land in full');
  resetAdapt(S);
  assert(S.adapt.active === null, 'the adaptation fades when the encounter ends');
}

// ---- Perfect defence ---------------------------------------------------------------------------------------------
{
  const { S, p, run, log } = setup({ heroes: ['wolverine'], x: 16 });
  const t = enemy(S, 'trooper', 17.6);
  run({ b: bits('evade') }, 1);
  const hp = p.hp;
  spawnHitbox(S, { owner: t.id, team: 'e', inst: 777, x0: p.x - 1, x1: p.x + 1, y0: p.y, y1: p.y + 2, dmg: 9, kb: [5, 3] });
  resolveHitboxes(S);
  assert(S.events.some(e => e.type === 'perfect') && p.hp === hp && t.slowT > 0, 'an Evade timed into a hit negates it and slows the attacker');
  run({ b: bits('attack') }, 2);
  assert(p.move && p.move.id === 'heavy' && p.move.counter, 'Attack inside the window counters with the heavy finisher');
}

// ---- Hunters ------------------------------------------------------------------------------------------------------------
{
  const { S, p, run, log } = setup({ heroes: ['cyclops'], x: 16 });
  const h = enemy(S, 'hunter', 24, 4.5, { cd: 0 });
  run({}, 200, () => p.markedBy > 0);
  assert(p.markedBy === h.id && count(log, 'marked') === 1, 'a Hunter locks on and marks a hero');
  p.mercy = 0;
  const hp = p.hp;
  spawnHitbox(S, { owner: 0, team: 'e', inst: 778, x0: p.x - 1, x1: p.x + 1, y0: p.y, y1: p.y + 2, dmg: 10, kb: [0, 2] });
  resolveHitboxes(S);
  assert(Math.abs(hp - p.hp - 10 * ENEMIES.hunter.mark.mult) < 0.01, 'the marked hero takes more damage');
  hitEnemy(S, h, { owner: p.id, team: 'p', inst: 779, dmg: 9999, power: 'plain' });
  assert(p.markedBy === 0, 'bringing the Hunter down clears the mark');
}

{
  // The team ultimate called mid-Fastball: Wolverine is let go, nobody is left holding anyone
  const { S, ps, run, log } = setup({ heroes: ['jean', 'wolverine', 'cyclops'], x: 16 });
  run([{ b: bits('team') }, {}, {}], 2);
  S.gauge = GAUGE.max;
  run([{}, {}, { b: bits('team', 'sig') }], 2); run([{}, {}, {}], 140);
  assert(count(log, 'ultEnd') === 1 && ps[1].state !== 'held' && !ps[0].fastball, 'a team ultimate in the middle of a Fastball Special lets Wolverine go');
}

// ---- Joining and leaving ------------------------------------------------------------------------------------------
{
  const { S, ps, run, log } = setup({ heroes: ['jean', 'wolverine'], x: 16 });
  run([{ b: bits('team') }, {}], 2);
  removePlayer(S, ps[0].slot);
  assert(S.players.length === 1 && S.players[0].state === 'normal' && !S.players[0].heldBy, 'a player leaving mid-Fastball lets Wolverine go');
}

// ---- Tagging out lets go (phase 1 found this: the kid stayed in Jean's grip for ever after she tagged out) ----------
{
  const { S, p, run } = setup({ heroes: ['jean'] });
  S.kid = makeKid(p.x + 3, 0, 'follow');
  run({ b: bits('power'), aim: [1, 0] }, 20, () => S.kid.state === 'held');
  const held = S.kid.state === 'held';
  run({ b: bits('power', 'team'), aim: [1, 0] }); run({ b: bits('power'), aim: [1, 0] }, 3);
  assert(held && p.hero !== 'jean' && S.kid.state === 'follow' && !S.kid.heldBy, `tagging Jean out while she holds the kid lets the kid go (held: ${held}, now ${p.hero}, kid ${S.kid.state})`);
}
{
  // And the kid frees herself if her holder is gone some other way
  const { S, p, run } = setup({ heroes: ['jean'] });
  S.kid = makeKid(p.x + 3, 0, 'follow');
  run({ b: bits('power'), aim: [1, 0] }, 20, () => S.kid.state === 'held');
  p.tk = null; run({}, 2);
  assert(S.kid.state === 'follow', 'a kid held by nobody is free again');
}
