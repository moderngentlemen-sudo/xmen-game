// The world: one plain-data object (no classes, no functions, no references between entities: they point
// at each other by id), advanced one fixed tick at a time by step(S, cmds). Because the state is plain data
// and the only randomness is the seeded generator inside it, snapshot/restore/hash are trivial, and the
// same seed plus the same inputs always gives the same run.
import { DT, HEROES, HERO_IDS, ENEMIES, KID } from './config.js';
import { seedState } from './rng.js';
import { KILL_Y } from './level.js';
import { updatePlayer, makePlayer } from './player.js';
import { updateEnemies } from './enemies.js';
import { updateKid } from './kid.js';
import { updateProps, updateProjectiles, resolveHitboxes } from './combat.js';
import { updateTeam } from './team.js';
import { HERO } from './heroes/index.js';
import { updateAdapt } from './adapt.js';
import { updateMission, startMission } from './mission.js';

export const EMPTY_CMD = Object.freeze({ mx: 0, my: 0, ax: 1, ay: 0, aim: false, b: 0 });

export function createWorld({ seed = 1, players = 1 } = {}) {
  const S = {
    v: 1, tick: 0, seed, rng: seedState(seed), nextId: 1,
    players: [], enemies: [], projectiles: [], hitboxes: [], props: [], assists: [], fx: [],
    kid: null, gates: { G1: false, G2: false, G3: false, cell: true },
    gauge: 0, ult: null, rapportT: 0, called: null,
    adapt: { log: { optic: 0, claws: 0, tk: 0 }, warn: null, warnT: 0, active: null, checkT: 0 },
    director: { melee: 0, ranged: 0 },
    mission: null, cam: { x: 0, y: 3, dist: 16, halfW: 14, halfH: 8 },
    events: [],
  };
  startMission(S);
  for (let i = 0; i < players; i++) addPlayer(S, i, players === 1);
  return S;
}

export const newId = S => S.nextId++;
export function emit(S, type, data = {}) { S.events.push({ ...data, type, tick: S.tick }); }   // data never overrides the type

// A player joins as the first hero nobody else is playing; alone, they run a squad of all three
export function addPlayer(S, slot, solo = false) {
  const hero = HERO_IDS.find(h => !S.players.some(p => p.hero === h)) || HERO_IDS[slot % HERO_IDS.length];
  // Joining mid-mission: next to a teammate who is still standing, else at the section's start
  const lead = S.players.find(q => q.state !== 'downed' && q.state !== 'dead');
  const cp = lead ? { x: lead.x + 0.9, y: lead.y + 0.5 } : S.mission ? S.mission.spawn : { x: 0, y: 0 };
  const p = makePlayer(S, slot, hero, cp.x - slot * 0.9, cp.y);
  if (solo) p.squad = HERO_IDS.map(h => ({ hero: h, hp: HEROES[h].hp, assistCd: 0, down: false }));
  S.players.push(p);
  // A second player ends solo squad play: everyone keeps one hero
  if (S.players.length > 1) for (const q of S.players) q.squad = null;
  emit(S, 'join', { id: p.id, slot, hero });
  return p;
}
export function removePlayer(S, slot) {
  const i = S.players.findIndex(p => p.slot === slot);
  if (i < 0) return;
  const p = S.players[i];
  HERO[p.hero].cancel(S, p);
  // Let go of anything this player was holding, or anyone holding them
  for (const q of S.players) if (q.heldBy === p.id) { q.heldBy = 0; q.state = 'normal'; q.st = 0; }
  if (p.heldBy) { const j = ent(S, p.heldBy); if (j && j.fastball) j.fastball = null; if (j && j.state === 'teamup') { j.state = 'normal'; j.st = 0; } }
  emit(S, 'leave', { id: p.id, slot });
  S.players.splice(i, 1);
}

// Entity lookup by id (players, enemies, props, assists, projectiles); the kid is id -1
export function ent(S, id) {
  if (id === -1) return S.kid;
  for (const L of [S.players, S.enemies, S.props, S.assists, S.projectiles]) for (const e of L) if (e.id === id) return e;
  return null;
}

export function step(S, cmds = {}) {
  S.tick++;
  S.events = [];
  S.hitboxes = [];
  const frozen = S.ult && S.ult.phase === 'cast';   // the team ultimate's call holds the world still
  for (const p of S.players) updatePlayer(S, p, cmds[p.slot] || EMPTY_CMD, frozen);
  if (!frozen) {
    updateKid(S);
    updateEnemies(S);
    updateProps(S);
    updateProjectiles(S);
  }
  updateTeam(S, cmds);
  resolveHitboxes(S);
  updateAdapt(S);
  updateMission(S);
  updateCamera(S);
  // Anything that falls out of the level comes back to safety (players) or is gone (enemies, props)
  for (const p of S.players) if (p.y < KILL_Y) { const cp = S.mission.spawn; p.x = cp.x; p.y = cp.y + 1; p.vx = p.vy = 0; p.mercy = 60; }
  for (const e of S.enemies) if (e.y < KILL_Y && !e.dead) { e.dead = true; e.deathT = 0; }
  const k = S.kid, lead = S.players.find(p => p.state !== 'downed');
  if (k && k.y < KILL_Y && lead) { k.x = lead.x - lead.facing; k.y = lead.y + 1; k.vx = k.vy = 0; k.carriedBy = 0; if (k.state === 'carried') k.state = 'follow'; }
}

// The shared camera frames every living hero (and the kid), within the level
function updateCamera(S) {
  const pts = [];
  for (const p of S.players) if (p.state !== 'dead') pts.push([p.x, p.y + 1]);
  if (S.kid && S.kid.state !== 'caged' && S.kid.state !== 'boarded') pts.push([S.kid.x, S.kid.y + 0.6]);
  if (!pts.length) return;
  // A boss close to the team stays in frame, head and all
  for (const e of S.enemies) if (!e.dead && ENEMIES[e.type].boss && pts.some(([x]) => Math.abs(e.x - x) < 24)) { pts.push([e.x, e.y + e.h + 0.5]); pts.push([e.x, e.y]); }
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const spanX = x1 - x0 + 10, spanY = y1 - y0 + 7;
  const dist = Math.max(15, Math.min(28, Math.max(spanX / 1.6, spanY / 0.9)));
  const halfH = dist * Math.tan(17 * Math.PI / 180), halfW = halfH * 16 / 9;
  S.cam = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 + 1.2, dist, halfW, halfH };
}

// ---- Snapshots -------------------------------------------------------------------------------------------
// The whole world as a copy that can be restored later (replays, rollback, checkpoints). Events are transient.
export function snapshot(S) { const { events, ...rest } = S; return structuredClone(rest); }
export function restore(snap) { const S = structuredClone(snap); S.events = []; return S; }
// A 32-bit FNV-1a hash of the state's serialised form: two runs agree tick by tick only if every number does
export function hashState(S) {
  const { events, ...rest } = S;
  const s = JSON.stringify(rest);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

export { DT, ENEMIES, KID };
