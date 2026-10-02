// The golden replays: fixed cases (the bot playing whole missions, and seeded random inputs) and the behavioural
// fingerprint taken from them. tests/golden/record.mjs runs the cases and writes v2.json; tests/golden-test.mjs runs
// them again and compares. A refactor that keeps behaviour keeps every fingerprint.
//
// Why a fingerprint and not hashState: hashState hashes the whole serialised state, so it changes when a refactor
// merely adds a field or builds an object's keys in another order, even with identical behaviour. The fingerprint
// holds the numbers that are behaviour (positions, speeds, health, states, moves and their time, the Sentinels, the
// kid, the gauge, the mission, the generator) and nothing else. It is taken at two rates:
//   every tick     a running digest (FNV-1a) of the players, the Sentinels, the live hitboxes and the events, so a
//                  difference is caught even if it heals before the next full fingerprint
//   every second   (EVERY ticks) the full fingerprint, so a failure can say what differs
// The random cases draw from their own generator (an LCG), never the world's, so the inputs never depend on the run.
// Recorded with Node 22: the simulation uses Math.hypot, atan2, sin and cos, which another JS engine could round
// differently in the last bit.
import { createWorld, step, hashState } from '../../game/js/sim/world.js';
import { BTN } from '../../game/js/sim/config.js';
import { playMission } from '../lib/bot.mjs';

export const EVERY = 60;

// The bot cases are the mission bot's own runs (tests/mission-bot-test.mjs plays the same seeds); the random cases
// start at the mission's start, so they fight through the rooftop and on.
export const CASES = [
  { name: 'bot alone, seed 2', bot: true, players: 1, seed: 2 },
  { name: 'bot with 2 players, seed 1', bot: true, players: 2, seed: 1 },
  { name: 'bot with 4 players, seed 3', bot: true, players: 4, seed: 3 },
  { name: 'random inputs alone', players: 1, seed: 101, ticks: 6000 },
  { name: 'random inputs with 2 players', players: 2, seed: 202, ticks: 6000 },
  { name: 'random inputs with 3 players', players: 3, seed: 303, ticks: 6000 },
  { name: 'random inputs with 4 players', players: 4, seed: 404, ticks: 6000 },
];

// ---- The fingerprint ------------------------------------------------------------------------------------------
// Rows are arrays, to keep the file small; LAYOUT names their columns (it is written into the golden file too).
export const LAYOUT = {
  player: ['slot', 'hero', 'x', 'y', 'vx', 'vy', 'hp', 'state', 'facing', 'move', 'move t', 'strain', 'rage', 'berserkT', 'conc', 'phoenix'],
  enemy: ['id', 'type', 'x', 'y', 'vx', 'vy', 'hp', 'state', 'dead'],
  kid: ['x', 'y', 'hp', 'state'],
  mission: ['sec', 'phase', 'wave', 'done', 'kills', 'teamups', 'perfects', 'downs', 'fails', 'dmg optic', 'dmg claws', 'dmg tk', 'dmg team', 'dmg plain'],
  team: ['rapportT', 'called', 'ult phase', 'adapt warn', 'adapt active'],
  counts: ['projectiles', 'props', 'assists'],
};
const playerRow = p => [p.slot, p.hero, p.x, p.y, p.vx, p.vy, p.hp, p.state, p.facing, p.move ? p.move.id : null, p.move ? p.move.t : null,
  p.strain, p.rage, p.berserkT, p.conc, p.phoenix];
const enemyRow = e => [e.id, e.type, e.x, e.y, e.vx, e.vy, e.hp, e.state, e.dead];

export function fingerprint(S) {
  const M = S.mission, T = M.stats, k = S.kid;
  const fp = {
    tick: S.tick, rng: S.rng, gauge: S.gauge,
    mission: [M.sec, M.phase, M.wave, M.done, T.kills, T.teamups, T.perfects, T.downs, T.fails, T.dmg.optic, T.dmg.claws, T.dmg.tk, T.dmg.team, T.dmg.plain],
    team: [S.rapportT, S.called ? S.called.id : 0, S.ult ? S.ult.phase : null, S.adapt.warn, S.adapt.active],
    players: S.players.map(playerRow),
    enemies: S.enemies.map(enemyRow),
    kid: k ? [k.x, k.y, k.hp, k.state] : null,
    counts: [S.projectiles.length, S.props.length, S.assists.length],
  };
  return JSON.parse(JSON.stringify(fp));   // as the file stores it (undefined becomes null)
}

// What the running digest folds in every tick
function tickRecord(S) {
  return JSON.stringify([
    S.players.map(p => [p.x, p.y, p.vx, p.vy, p.hp, p.state, p.facing, p.move ? p.move.id : null, p.move ? p.move.t : null]),
    S.enemies.map(e => [e.id, e.x, e.y, e.vx, e.vy, e.hp, e.state]),
    S.hitboxes.map(h => [h.owner, h.team, h.power, h.x0, h.x1, h.y0, h.y1, h.dmg, h.poise, h.kb, !!h.launch, !!h.heavy, h.kind]),
    S.events.map(ev => [ev.type, ev.id, ev.move, ev.dmg, ev.x, ev.y]),
  ]);
}
function fnv(h, s) {
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

// ---- Running a case ---------------------------------------------------------------------------------------------
// Returns the samples: { tick, digest, hash, fp } every EVERY ticks and at the end. onTick(S) runs after every tick.
export function runCase(c, onTick = null) {
  const samples = [];
  let S = null, digest = 0x811c9dc5;
  const sample = () => samples.push({ tick: S.tick, digest, hash: hashState(S), fp: fingerprint(S) });
  const after = () => {
    digest = fnv(digest, tickRecord(S));
    if (onTick) onTick(S);
    if (S.tick % EVERY === 0) sample();
  };
  if (c.bot) playMission({ players: c.players, seed: c.seed, maxMin: 25, onStep: w => { S = w; after(); } });
  else {
    S = createWorld({ seed: c.seed, players: c.players });
    const pads = S.players.map((p, i) => randomPlayer(lcg(c.seed * 977 + i * 7919 + 1)));
    for (let t = 0; t < c.ticks; t++) {
      const cmds = {};
      S.players.forEach((p, i) => { cmds[p.slot] = pads[i](); });
      step(S, cmds);
      after();
    }
  }
  if (S.tick % EVERY !== 0) sample();   // the end state
  return samples;
}

// ---- Random inputs ---------------------------------------------------------------------------------------------
export function lcg(seed) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}
const between = (r, a, b) => a + Math.floor(r() * (b - a + 1));
function weighted(r, list) {
  let x = r() * list.reduce((sum, o) => sum + o[0], 0);
  for (const o of list) if ((x -= o[0]) < 0) return o;
  return list[list.length - 1];
}
// Each button stays up for `up` ticks, then is held for one of the `down` spans ([weight, min, max] ticks)
const BUTTONS = {
  attack: { up: [2, 40], down: [[7, 1, 4], [2, 5, 20], [1, 24, 70]] },   // taps, short holds, and holds that charge the heavy
  power: { up: [10, 120], down: [[4, 1, 8], [6, 10, 80]] },              // taps, and holds through the aperture, the coil, the grip
  jump: { up: [10, 90], down: [[1, 1, 30]] },
  evade: { up: [20, 150], down: [[1, 1, 3]] },
  sig: { up: [200, 900], down: [[1, 1, 3]] },
  team: { up: [120, 600], down: [[7, 1, 5], [3, 14, 30]] },             // taps (team-ups, tags) and holds (assists)
};
const STICK_X = [[10, 1], [4, -1], [4, 0], [1, 0.5], [1, -0.5]];        // mostly onward, so the mission's fights come
const STICK_Y = [[14, 0], [3, 1], [3, -1]];

// One player's pad: every button, the stick and the aim are held for random lengths
export function randomPlayer(r) {
  const names = Object.keys(BUTTONS), btn = {};
  for (const n of names) btn[n] = { down: false, left: between(r, ...BUTTONS[n].up) };
  let mx = 0, mxT = 0, my = 0, myT = 0, aim = false, ax = 1, ay = 0, aimT = 0;
  return () => {
    if (--mxT <= 0) { mx = weighted(r, STICK_X)[1]; mxT = between(r, 5, 120); }
    if (--myT <= 0) { my = weighted(r, STICK_Y)[1]; myT = between(r, 3, 60); }
    if (--aimT <= 0) { aim = r() < 0.4; ax = r() * 2 - 1; ay = r() * 2 - 1; aimT = between(r, 10, 90); }
    let b = 0;
    for (const n of names) {
      const s = btn[n], B = BUTTONS[n];
      if (--s.left <= 0) { s.down = !s.down; s.left = s.down ? between(r, ...weighted(r, B.down).slice(1)) : between(r, ...B.up); }
      if (s.down) b |= BTN[n];
    }
    return { mx, my, ax, ay, aim, b };
  };
}

// ---- Comparing ----------------------------------------------------------------------------------------------------
// The first `max` differences between two fingerprints, as 'where: recorded → now' lines
export function diff(want, got, max = 8) {
  const out = [];
  (function walk(a, b, path) {
    if (out.length >= max || a === b) return;
    if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
      if (Array.isArray(a) && a.length !== b.length) out.push(`${label(path)}: ${a.length} rows → ${b.length}`);
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) walk(a[key], b[key], path ? `${path}.${key}` : key);
      return;
    }
    out.push(`${label(path)}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`);
  })(want, got, '');
  return out;
}
// 'players.0.2' → 'players[0].x', with LAYOUT's column names
function label(path) {
  const row = path.match(/^(players|enemies)\.(\d+)\.(\d+)$/);
  if (row) return `${row[1]}[${row[2]}].${LAYOUT[row[1] === 'players' ? 'player' : 'enemy'][+row[3]]}`;
  const col = path.match(/^(kid|mission|team|counts)\.(\d+)$/);
  return col ? `${col[1]}.${LAYOUT[col[1]][+col[2]]}` : path;
}
