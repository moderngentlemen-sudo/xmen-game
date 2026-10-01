// The mission: "Extraction at the Sentinel Works". Four sections, each an arena whose gate ahead stays shut while
// its Sentinels fight: the rooftop; the cell block, where the young mutant is held (break the cell door to free
// her, and Collectors come for her); the assembly hall; and the hangar, where the Mk-II Sentinel guards the
// X-Jet. Waves drop in by script as the last one falls. Sentinel adaptation fades between sections.
// Failing (the kid carried out of the section, or the whole team down) puts the team back at the start of the
// section: only that section's progress is lost.
import { HEROES, ENEMIES } from './config.js';
import { CELL, JET, CRATES, BOXES, groundBelow } from './level.js';
import { emit } from './world.js';
import { createEnemy } from './enemies.js';
import { makeKid } from './kid.js';
import { makeCrate, killEnemy } from './combat.js';
import { resetAdapt } from './adapt.js';
import { isDown } from './player.js';
import { HERO } from './heroes/index.js';

export const MISSION_NAME = 'Extraction at the Sentinel Works';

// Units: [type, x], dropping in from above (fliers arrive at hover height)
export const SECTIONS = [
  { id: 'roof', name: 'The rooftop', spawn: { x: 2, y: 0 }, start: 6, gate: 'G1', x0: -12, x1: 40,
    waves: [
      [['trooper', 22], ['trooper', 28]],
      [['gunner', 34], ['trooper', 16], ['trooper', 37]],
    ] },
  { id: 'cells', name: 'The cell block', spawn: { x: 44, y: 0 }, start: 48, gate: 'G2', kid: true, x0: 41, x1: 96,
    waves: [
      [['trooper', 58], ['gunner', 66], ['hunter', 72]],
      [['trooper', 76], ['trooper', 54], ['gunner', 82]],
    ],
    // When the cell door breaks, the Sentinels send a Collector for her
    onRelease: [['collector', 52], ['trooper', 60]] },
  { id: 'hall', name: 'The assembly hall', spawn: { x: 100, y: 0 }, start: 106, gate: 'G3', x0: 97, x1: 176,
    waves: [
      [['trooper', 120], ['trooper', 126], ['gunner', 136], ['hunter', 130]],
      [['collector', 152], ['trooper', 142], ['gunner', 114], ['trooper', 160]],
      [['hunter', 150], ['trooper', 134], ['trooper', 148], ['collector', 168], ['gunner', 172]],
    ] },
  { id: 'hangar', name: 'The hangar', spawn: { x: 180, y: 0 }, start: 200, gate: null, boss: true, x0: 177, x1: 264,
    waves: [[['mk2', 228]]] },
];
const CELLS = SECTIONS.findIndex(s => s.kid);
const WAVE_GAP = 45;     // ticks between one wave falling and the next dropping in
const FAIL_TICKS = 150;  // the failure call stays up this long before the section restarts

export function startMission(S) {
  S.mission = {
    name: MISSION_NAME, sec: 0, secId: SECTIONS[0].id, x0: SECTIONS[0].x0, x1: SECTIONS[0].x1, phase: 'wait', wave: 0, waveT: 0, released: false,
    spawn: { ...SECTIONS[0].spawn }, door: { ...CELL.door }, failed: null, failT: 0, done: false, doneT: 0, t: 0,
    stats: { kills: 0, teamups: 0, assists: 0, perfects: 0, downs: 0, fails: 0, dmg: { optic: 0, claws: 0, tk: 0, team: 0, plain: 0 } },
  };
  S.gates.G1 = S.gates.G2 = S.gates.G3 = true; S.gates.cell = true;
  S.kid = makeKid(CELL.x, CELL.y, 'caged');
  S.props = CRATES.map(([x, y]) => makeCrate(S, x, y));
  emit(S, 'missionStart', { name: MISSION_NAME });
  emit(S, 'section', { sec: 0, name: SECTIONS[0].name });
}

export function updateMission(S) {
  const M = S.mission;
  if (!M) return;
  if (M.done) { M.doneT++; return; }
  M.t++;
  tally(S, M);
  if (M.failT > 0) { if (--M.failT === 0) resetSection(S); return; }
  if (M.failed || teamDown(S)) { fail(S, M.failed || 'team'); return; }
  const sec = SECTIONS[M.sec];
  // The kid leaves her cell when its door breaks, and the Sentinels come for her
  if (sec.kid && !M.released && !S.gates.cell) { M.released = true; spawnWave(S, sec.onRelease); }

  if (M.phase === 'wait') {
    if (S.players.some(p => !isDown(p) && p.x >= sec.start)) {
      M.phase = 'fight'; M.wave = 0; M.waveT = 20;
      emit(S, 'sectionStart', { sec: M.sec, name: sec.name });
    }
    return;
  }
  if (M.phase === 'fight') {
    // A Sentinel thrown (or flown) out of the room is out of the fight: a ring-out counts as a kill
    for (const e of S.enemies) if (!e.dead && (e.x < sec.x0 - 0.5 || e.x > sec.x1 + 0.5)) killEnemy(S, e, null);
    if (M.waveT > 0) { if (--M.waveT === 0) { spawnWave(S, sec.waves[M.wave]); M.wave++; } return; }
    if (S.enemies.some(e => !e.dead)) return;
    if (M.wave < sec.waves.length) { M.waveT = WAVE_GAP; return; }
    if (sec.kid && !M.released) return;   // the floor is clear but she is still behind the door
    if (sec.boss) { M.phase = 'escape'; emit(S, 'escape', { x: JET.ramp, y: JET.y }); return; }
    clearSection(S);
    return;
  }
  if (M.phase === 'escape') {
    // The Mk-II is down: she runs for the X-Jet (once she is on her feet and out of anyone's grip)
    const k = S.kid;
    if (k.state === 'follow' || k.state === 'cower') { k.state = 'run'; k.st = 0; emit(S, 'kidRun', { x: k.x, y: k.y }); }
    if (k.state === 'boarded') { M.done = true; emit(S, 'missionComplete', { t: M.t, stats: M.stats }); }
  }
}

function spawnWave(S, units) {
  if (!units) return;
  const list = units.slice();
  // Three or four heroes: an extra trooper per hero beyond two (the director still caps who attacks at once)
  if (!units.some(u => ENEMIES[u[0]].boss)) for (let i = 2; i < S.players.length; i++) list.push(['trooper', units[0][1] + 3 * (i - 1)]);
  for (const u of list) spawnUnit(S, u);
}
function spawnUnit(S, [type, x]) {
  const T = ENEMIES[type], g = groundBelow(x, 40, S.gates), base = g > -Infinity ? g : 0;
  const e = createEnemy(S, type, x, T.flier ? base + 5 : base + 8, T.boss ? { state: 'intro' } : {});
  e.hp = e.maxHp = Math.round(T.hp * (T.boss ? 1 + 0.35 * (S.players.length - 1) : 1 + 0.15 * Math.max(0, S.players.length - 1)));
  let near = null, nd = Infinity;
  for (const p of S.players) { const d = Math.abs(p.x - x); if (d < nd) { nd = d; near = p; } }
  e.facing = near && near.x < x ? -1 : 1;
  S.enemies.push(e);
  emit(S, 'enemyDrop', { id: e.id, unit: type, x, y: base, boss: !!T.boss });
}

function teamDown(S) {
  if (!S.players.length) return false;
  return S.players.every(p => isDown(p) && p.downedT > 60 && !(p.squad && p.squad.some(s => s.hero !== p.hero && !s.down)));
}

function fail(S, why) {
  const M = S.mission;
  M.failed = null; M.failT = FAIL_TICKS; M.stats.fails++;
  emit(S, 'missionFail', { why, sec: M.sec, name: SECTIONS[M.sec].name });
}

// Back to the start of the section: its Sentinels gone, its gate shut, the team on its feet
function resetSection(S) {
  const M = S.mission, sec = SECTIONS[M.sec];
  S.enemies = []; S.projectiles = []; S.assists = []; S.called = null; S.rapportT = 0; S.ult = null;
  S.director = { melee: 0, ranged: 0 };
  resetAdapt(S);
  M.phase = 'wait'; M.wave = 0; M.waveT = 0; M.failed = null;
  if (sec.gate) S.gates[sec.gate] = true;
  if (sec.kid) { S.gates.cell = true; M.door = { ...CELL.door }; M.released = false; S.kid = makeKid(CELL.x, CELL.y, 'caged'); }
  else if (M.sec > CELLS) S.kid = makeKid(sec.spawn.x - 1.4, sec.spawn.y, 'follow');
  S.players.forEach((p, i) => {
    HERO[p.hero].cancel(S, p);
    Object.assign(p, { x: sec.spawn.x - i * 0.9, y: sec.spawn.y, vx: 0, vy: 0, hp: p.maxHp, state: 'normal', st: 0, mercy: 90,
      move: null, evade: null, markedBy: 0, heldBy: 0, thrown: null, fastball: null, edge: null, downedT: 0, revive: 0, hitstunT: 0 });
    HERO[p.hero].init(p);
    if (p.squad) for (const s of p.squad) { s.down = false; s.hp = HEROES[s.hero].hp; s.res = null; s.assistCd = 0; }
  });
  emit(S, 'checkpoint', { sec: M.sec, name: sec.name });
}

function clearSection(S) {
  const M = S.mission, sec = SECTIONS[M.sec];
  if (sec.gate) {
    S.gates[sec.gate] = false;
    const b = BOXES.find(o => o.tag === sec.gate);
    emit(S, 'gateOpen', { gate: sec.gate, x: (b.x0 + b.x1) / 2 });
  }
  resetAdapt(S);
  emit(S, 'sectionClear', { sec: M.sec, name: sec.name });
  // A breather: anyone down gets back up for the next fight
  for (const p of S.players) if (isDown(p)) {
    Object.assign(p, { hp: Math.round(p.maxHp * 0.5), state: 'normal', st: 0, mercy: 90, downedT: 0, revive: 0 });
    emit(S, 'revived', { id: p.id, x: p.x, y: p.y, hero: p.hero });
  }
  M.sec++; M.phase = 'wait'; M.wave = 0; M.waveT = 0;
  const next = SECTIONS[M.sec];
  M.secId = next.id; M.x0 = next.x0; M.x1 = next.x1; M.spawn = { ...next.spawn };
  emit(S, 'section', { sec: M.sec, name: next.name });
}

// Running totals for the debrief (and for the playtest measures: how much damage team play does)
function tally(S, M) {
  const T = M.stats;
  for (const ev of S.events) {
    switch (ev.type) {
      case 'kill': T.kills++; break;
      case 'teamup': case 'ultCast': T.teamups++; break;
      case 'assist': T.assists++; break;
      case 'perfect': T.perfects++; break;
      case 'downed': T.downs++; break;
      case 'hit': T.dmg[ev.power in T.dmg ? ev.power : 'plain'] += ev.dmg; break;
    }
  }
}
