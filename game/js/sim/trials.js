// Combo trials for the Danger Room: five per hero. Each trial is a list of inputs, the route of moves they must
// produce and the hits the combo must reach. runTrial plays a trial in a fresh world the way a sharp player would:
// each input is pressed at the first moment it can be taken (the move before it is past its active ticks, or has hit
// and can cancel), so the same trial always plays out the same. tests/trials-test.mjs runs every trial; the Danger
// Room's demos play them back.
//
// Inputs: 'A' Attack; 'P' a Power tap; 'S' Signature; 'J' Jump; 'E' Evade; 'AP' Attack and Power together (a
// throw). A direction goes in front: 'f' forward, 'b' back, 'u' up, 'd' down ('uA' is up and Attack). 'r' before an
// input runs at it first (a dash strike); 'h' holds it (Attack through the charge, Power for 40 ticks). 'w12' waits 12
// ticks; 'z' waits until the hero is free (the move before has ended). 'C' puts the hero in a perfect Evade, its
// counter window open, and the next input comes at once (the Danger Room's demos of the counters use it).
// A trial's setup: where the trooper stands (`dist` m in front, or with its back to the rooftop's left wall: `wall`),
// whether it starts stunned, and the hero's meter.
import { createWorld, step } from './world.js';
import { BTN, PERFECT } from './config.js';
import { setHero } from './player.js';
import { createEnemy } from './enemies.js';
import { MOVESETS } from './moves/index.js';

export const TRIALS = {
  cyclops: [
    { name: 'Full string', inputs: ['A', 'A', 'A', 'A'], route: ['g1', 'g2', 'g3', 'g4'], hits: 4 },
    { name: 'Launch and follow', inputs: ['A', 'A', 'uA', 'J', 'A', 'A'], route: ['g1', 'g2', 'up', 'air1', 'air2'], hits: 5 },
    { name: 'Into the wall', setup: { wall: true }, inputs: ['fA', 'w22', 'A', 'A', 'A'], route: ['fwd', 'g1', 'g2', 'g3'], hits: 4 },
    { name: 'Up the ladder', setup: { meter: 100 }, inputs: ['A', 'A', 'fP', 'fS'], route: ['g1', 'g2', 'pFwd', 'super'], hits: 4 },
    { name: 'Toss and blast', inputs: ['uAP', 'w8', 'uP'], route: ['throwU', 'pUp'], hits: 2 },
  ],
  wolverine: [
    { name: 'Full string', inputs: ['A', 'A', 'A', 'A', 'A'], route: ['g1', 'g2', 'g3', 'g4', 'g5'], hits: 5 },
    { name: 'Launch and follow', inputs: ['A', 'uA', 'J', 'A', 'A'], route: ['g1', 'up', 'air1', 'air2'], hits: 4 },
    { name: 'Barge and drill', setup: { dist: 6 }, inputs: ['rA', 'fP'], route: ['dash', 'pFwd'], hits: 2 },
    { name: 'Up the ladder', setup: { meter: 100 }, inputs: ['A', 'A', 'fP', 'fS'], route: ['g1', 'g2', 'pFwd', 'super'], hits: 5 },
    { name: 'Execution', setup: { stunned: true }, inputs: ['A', 'AP'], route: ['g1', 'exec'], hits: 2 },
  ],
  jean: [
    { name: 'Full string', inputs: ['A', 'A', 'A', 'A'], route: ['g1', 'g2', 'g3', 'g4'], hits: 4 },
    { name: 'Launch and follow', inputs: ['A', 'uA', 'J', 'A', 'A'], route: ['g1', 'up', 'air1', 'air2'], hits: 4 },
    { name: 'Off the wall', setup: { wall: true }, inputs: ['fA', 'w26', 'uP'], route: ['fwd', 'pUp'], hits: 2 },
    { name: 'Uplift', inputs: ['A', 'uP', 'J', 'A', 'A'], route: ['g1', 'pUp', 'air1', 'air2'], hits: 4 },
    { name: 'Up the ladder', setup: { meter: 100 }, inputs: ['A', 'A', 'fP', 'fS'], route: ['g1', 'g2', 'pFwd', 'super'], hits: 4 },
  ],
};

const DIR = { f: [1, 0], b: [-1, 0], u: [0, 1], d: [0, -1] };
function parse(token) {
  if (token[0] === 'w') return { wait: +token.slice(1) };
  if (token === 'C') return { counter: true };
  if (token === 'z') return { idle: true };
  let run = false, hold = 0, dir = [0, 0], s = token;
  if (s[0] === 'r') { run = true; s = s.slice(1); }
  if (s[0] === 'h') { hold = 1; s = s.slice(1); }
  if (DIR[s[0]] && s.length > 1) { dir = DIR[s[0]]; s = s.slice(1); }
  const b = (s.includes('A') ? BTN.attack : 0) | (s.includes('P') ? BTN.power : 0) | (s.includes('S') ? BTN.sig : 0) | (s.includes('J') ? BTN.jump : 0) | (s.includes('E') ? BTN.evade : 0);
  return { run, hold, dir, b, jump: s === 'J' };
}

// Sets a trial up in a world: the hero placed, the trooper where the trial wants it (frozen in its stance: it never
// attacks), the meter. Returns the trooper. Used headless by runTrial and live by the Danger Room.
export function setupTrial(S, p, trial) {
  const U = trial.setup || {};
  S.enemies = []; S.projectiles = []; p.mercy = 0; p.facing = 1; p.meter = U.meter || 0; p.move = null; p.state = 'normal'; p.st = 0;
  p.x = U.wall ? -6.5 : 24 - (U.dist || 0); p.y = 0; p.vx = p.vy = 0;   // clear rooftop from 16 to 40 (the vent ends at 15.5)
  if (U.wall) p.facing = -1;
  const e = createEnemy(S, 'trooper', U.wall ? -9.5 : 24 + (U.dist ? 0 : 1.1), 0, { cd: 9999, onGround: true, hp: 999, maxHp: 999 });
  if (U.stunned) { e.state = 'stun'; e.stunT = 999; }
  if (U.rage) p.rage = U.rage;
  S.enemies.push(e);
  return e;
}

// The pilot: a generator that plays a trial's inputs, yielding the hero's command for each tick; the caller steps
// the world between yields (headless in runTrial, live in the Danger Room's demos). Each input is pressed at the first
// moment it can be taken: free, or the move before it past its active ticks, or hit (cancels on hit); and it waits
// for the input to be taken before the next (a press still in the buffer is not done, and a second press right on
// top of it would read as a pair). It returns the route of moves and the hits the combo reached.
export function* pilot(S, p, trial, tail = 90) {
  const set = MOVESETS[p.hero], route = [], e = S.enemies[0];
  let hits = 0, held = 0, mx = 0, my = 0, force = false;
  const cmd = b => ({ mx: mx * p.facing, my, ax: 1, ay: 0, aim: false, b: b | held });
  const seen = () => { for (const v of S.events) if (v.type === 'swing' && v.id === p.id) route.push(v.move); hits = Math.max(hits, p.streak.n); };
  const ready = () => {
    if (p.hitstop > 0) return false;
    if (!p.move) return p.state === 'normal';
    const m = set.moves[p.move.id];
    return p.move.hit ? p.move.t > m.su : p.move.t > m.su + m.ac;
  };
  for (const token of trial.inputs) {
    const I = parse(token);
    if (I.wait !== undefined) { for (let i = 0; i < I.wait; i++) { yield cmd(0); seen(); } continue; }
    if (I.counter) { p.state = 'evade'; p.st = 0; p.evade = { dir: -p.facing, t: 0, perfect: true }; p.counterT = PERFECT.counter; force = true; continue; }
    if (I.idle) { for (let i = 0; i < 120 && (p.move || p.state !== 'normal'); i++) { yield cmd(0); seen(); } continue; }
    for (let i = 0; i < 120 && !force && !ready(); i++) { yield cmd(0); seen(); }
    force = false;
    if (I.run) { mx = 1; for (let i = 0; i < 40 && e && Math.abs(e.x - p.x) > 2.2; i++) { yield cmd(0); seen(); } }
    [mx, my] = I.dir;
    const before = route.length, move = p.move;
    yield cmd(I.b); seen();
    if (I.jump) { held = BTN.jump; for (let i = 0; i < 6; i++) { yield cmd(0); seen(); } held = 0; }   // a jump is held a moment to rise
    else if (I.hold) {
      // Held: Attack through the first strike's charge, Power for 40 ticks, then let go
      const C = set.moves.heavy && set.moves.heavy.charge, n = I.b & BTN.attack && C ? C.hold + 12 : 40;   // (hitstop on a hit holds the count)
      for (let i = 0; i < n; i++) { yield cmd(I.b); seen(); }
      yield cmd(0); seen();
    }
    else {
      yield cmd(0); seen();
      for (let i = 0; i < 40 && route.length === before && p.move === move; i++) { yield cmd(0); seen(); }
    }
    mx = 0; my = 0;
  }
  for (let i = 0; i < tail; i++) { yield cmd(0); seen(); }
  return { route, hits };
}

// Plays a trial in a fresh world; returns { route, hits, ok, S, ticks }. onTick(S), if given, runs after every tick.
export function runTrial(hero, trial, onTick = null) {
  const S = createWorld({ seed: 7, players: 1 }), p = S.players[0];
  if (p.hero !== hero) setHero(S, p, hero);
  S.mission.phase = 'test';
  setupTrial(S, p, trial);
  const g = pilot(S, p, trial);
  let t = 0, r = g.next();
  while (!r.done) { step(S, { [p.slot]: r.value }); if (onTick) onTick(S); t++; r = g.next(); }
  const { route, hits } = r.value;
  return { route, hits, ok: trialPassed(trial, route, hits), S, ticks: t };
}
// A trial is passed when the route matches exactly and the combo reached its hits
export const trialPassed = (trial, route, hits) => route.join(' ') === trial.route.join(' ') && hits >= trial.hits;

// How a trial's inputs read to a player: 'uA' → '↑ Attack'
const WORD = { A: 'Attack', P: 'Power', S: 'Signature', J: 'Jump', E: 'Evade' }, ARROW = { f: '→', b: '←', u: '↑', d: '↓' };
export function inputLabel(token) {
  if (token[0] === 'w') return 'wait';
  if (token === 'C') return 'perfect Evade';
  let s = token, out = '';
  if (s[0] === 'r') { out += 'run, '; s = s.slice(1); }
  if (s[0] === 'h') { out += 'hold '; s = s.slice(1); }
  if (ARROW[s[0]] && s.length > 1) { out += ARROW[s[0]] + ' '; s = s.slice(1); }
  return out + [...s].map(c => WORD[c]).join(' + ');
}
