// The Danger Room: a training mode in the simulation (deterministic, so demos and trials replay exactly). It uses the
// rooftop's open floor with the mission switched off: S.danger replaces the mission's tick (world.js), and keeps
// sparring Sentinels in front of the hero by its settings:
//   foe        the unit to spar with ('trooper', 'gunner', 'collector')
//   count      how many at once, 1 to 3
//   behaviour  'stand' (never attack: a dummy) or 'fight' (their own brains)
//   sturdy     true: 999 health, so combos run long; false: their own health, and they are rebuilt when destroyed
//   meter      true: the hero's meter stays full, to practise supers
// A downed hero is back up a second later; the kid and the gates play no part.
import { ENEMIES, METER } from './config.js';
import { createEnemy } from './enemies.js';
import { emit } from './world.js';

export const DANGER_X = 24;   // where the room is set up: the clear rooftop from 16 to 40
export const DANGER_DEFAULTS = Object.freeze({ foe: 'trooper', count: 1, behaviour: 'stand', sturdy: true, meter: false });
export const FOES = ['trooper', 'gunner', 'collector'];

export function setupDanger(S, opts = {}) {
  const D = { ...DANGER_DEFAULTS, ...(S.danger || {}), ...opts, respawnT: 0 };
  D.count = Math.max(1, Math.min(3, D.count | 0));
  if (!FOES.includes(D.foe)) D.foe = 'trooper';
  S.danger = D;
  S.mission.phase = 'danger';
  S.enemies = []; S.projectiles = []; S.called = null;
  for (const g of Object.keys(S.gates)) if (g !== 'cell') S.gates[g] = false;
  for (const p of S.players) { p.x = DANGER_X; p.y = 0; p.vx = p.vy = 0; p.facing = 1; if (p.state === 'downed') { p.hp = p.maxHp; p.state = 'normal'; p.st = 0; } }
  for (let i = 0; i < D.count; i++) spawnFoe(S, i);
  emit(S, 'dangerSetup', { foe: D.foe, count: D.count });
  return D;
}
function spawnFoe(S, i) {
  const D = S.danger, T = ENEMIES[D.foe];
  const e = createEnemy(S, D.foe, DANGER_X + 2.5 + i * 2.2, T.flier ? 3 : 0, { onGround: true });
  if (D.sturdy) { e.hp = e.maxHp = 999; }
  S.enemies.push(e);
  return e;
}

// Every tick, in the mission's place
export function updateDanger(S) {
  const D = S.danger;
  for (const e of S.enemies) {
    if (e.dead) continue;
    if (D.behaviour === 'stand') { e.cd = Math.max(e.cd, 9999); if (e.state === 'windup') { e.state = 'idle'; e.atk = null; } }
    else if (e.cd > 600) e.cd = 30;
    // A sturdy dummy left alone heals back to full
    if (D.sturdy && e.calmT > 180 && e.hp < e.maxHp) e.hp = e.maxHp;
  }
  // Destroyed ones are rebuilt a moment later
  const live = S.enemies.filter(e => !e.dead).length;
  if (live < D.count) { if (++D.respawnT >= 60) { D.respawnT = 0; spawnFoe(S, live); } } else D.respawnT = 0;
  for (const p of S.players) {
    if (D.meter) p.meter = METER.max;
    if (p.state === 'downed' && p.downedT >= 60) { p.hp = p.maxHp; p.state = 'normal'; p.st = 0; p.mercy = 60; emit(S, 'revived', { id: p.id, x: p.x, y: p.y, hero: p.hero }); }
    if (p.squad) for (const q of p.squad) q.down = false;
  }
}
