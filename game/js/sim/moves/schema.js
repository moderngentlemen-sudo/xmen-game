// The move tables' format, the shorthands the tables share, and validateMoves(), which the tests run on every table.
// A hero's moveset is { hero, chain, moves }: `chain` is the order of the ground strikes on Attack, and `moves` maps
// each move id to its fields. The move engine (sim/moveEngine.js) runs them. Phase 0 encodes exactly what V2's melee
// does and nothing more; phase 1 grows the format (the full move grammar, reactions, juggles, hitstop, cancel
// windows in ticks, armour, meter).
//
// A move's fields (all required unless marked optional):
//   input      how the Attack button reaches it: { btn: 'attack', ctx, dir }
//                ctx  'ground' or 'air': where the hero is when Attack is pressed
//                     'counter': Attack inside a perfect defence's counter window (one move per set)
//                dir  'neutral', 'up' (the stick past STICK.up) or 'any'
//              The chain's strikes all take { ctx: 'ground', dir: 'neutral' }; `chain` orders them.
//   su, ac, rc startup, active and recovery, in ticks. The move's clock `t` gains 1 / attackSpeed a tick, so it can
//              be fractional (Wolverine's berserk); a hitbox is out while su < t <= su + ac, and the move ends at
//              t >= su + ac + rc
//   dmg, poise damage, and poise damage, per hit
//   kb         knockback [x, y] in m/s, x pointing forward
//   boxes      [[x0, width, y0, height]]: the hitbox (m) for every active tick, from the feet, facing +x
//   step       forward speed (m/s) while on the ground, through startup and active (kept: no deceleration then)
//   cancel     [{ into, when }]: what the move can cancel into, tried in order. `into` lists 'evade' (the hero's
//              Evade) and 'attack' (whatever Attack would start now); `when` is 'recovery' (after the active ticks)
//   launch     optional, true: launches light Sentinels
//   heavy      optional, true: a heavy hit (it breaks armour plates and staggers longer)
//   lift       optional, { vy, ticks }: the hero rises at no less than vy (m/s) in the first `ticks` active ticks
//   charge     optional, { from, hold, release, dmgMult }: holding Attack through the move `from` winds this one up.
//              While Attack stays down from the press that started `from`, `from` holds its pose at the end of its
//              active ticks. Let go before `hold` ticks and it recovers as usual; once the hold reaches `hold`, this
//              move fires when Attack is let go, or by itself once the hold reaches `hold + release`, and deals
//              dmg × dmgMult. (V2 only posed after the hold was reached, which the first strike never lived to see,
//              so V2's charge never fired; phase 1 fixed it.)
//   counter    optional, { dmgMult, poiseMult, react? }: what it deals extra as the counter out of a perfect defence,
//              and the reaction it causes then instead of `react`
//   react      the reaction a hit causes (REACTIONS in config.js, run by reactions.js; not held or thrown)
//   juggle     optional, juggle weight a hit adds in the air (JUGGLE in config.js: 10, a launcher 20)
//   hitstop    optional, 'light', 'heavy', 'super' (HITSTOP in config.js) or whole ticks: how long a hit freezes
//              the hero and the target together. Without it: heavy for a `heavy` move, else light
const FIELDS = ['input', 'su', 'ac', 'rc', 'dmg', 'poise', 'kb', 'boxes', 'step', 'cancel', 'launch', 'heavy', 'lift', 'charge', 'counter', 'hitstop', 'react', 'juggle'];
import { REACTIONS } from '../config.js';
// The reactions a move may cause (read when validating: config.js imports the tables, so not at load time)
const moveReacts = () => REACTIONS.filter(r => r !== 'held' && r !== 'thrown');
const CTX = ['ground', 'air', 'counter'], DIRS = ['neutral', 'up', 'any'], CANCEL_INTO = ['evade', 'attack'];

// Shorthands for the tables
export const ON = Object.freeze({
  chain: Object.freeze({ btn: 'attack', ctx: 'ground', dir: 'neutral' }),
  up: Object.freeze({ btn: 'attack', ctx: 'ground', dir: 'up' }),
  air: Object.freeze({ btn: 'attack', ctx: 'air', dir: 'any' }),
  counter: Object.freeze({ btn: 'attack', ctx: 'counter', dir: 'any' }),
});
const cancels = (...into) => Object.freeze([Object.freeze({ into: Object.freeze(into), when: 'recovery' })]);
export const CANCEL = Object.freeze({
  evadeOrAttack: cancels('evade', 'attack'),   // V2: every strike but the heavy, from its recovery
  evade: cancels('evade'),                     // V2: the heavy, which ends a chain
});

// Every problem with a moveset, as readable lines; an empty list means it is valid
export function validateMoves(set) {
  const bad = [], ids = Object.keys((set && set.moves) || {}), chain = set && Array.isArray(set.chain) ? set.chain : [];
  const num = v => typeof v === 'number' && Number.isFinite(v);
  const tick = v => Number.isInteger(v) && v >= 0;
  if (!set || typeof set.hero !== 'string') return ['a moveset needs a hero id'];
  const who = set.hero;
  if (!ids.length) bad.push(`${who}: no moves`);
  if (!chain.length) bad.push(`${who}: no chain`);
  for (const id of chain) if (!set.moves[id]) bad.push(`${who}: the chain names ${id}, which is not a move`);
  const taken = {};
  for (const id of ids) {
    const m = set.moves[id], at = `${who}.${id}`;
    for (const k of Object.keys(m)) if (!FIELDS.includes(k)) bad.push(`${at}: unknown field ${k}`);
    const I = m.input;
    if (!I || I.btn !== 'attack' || !CTX.includes(I.ctx) || !DIRS.includes(I.dir)) bad.push(`${at}: input must be { btn: 'attack', ctx: ${CTX.join('|')}, dir: ${DIRS.join('|')} }`);
    else {
      const inChain = chain.includes(id);
      if (inChain !== (I.ctx === 'ground' && I.dir === 'neutral')) bad.push(`${at}: the chain's strikes, and only they, take { ctx: 'ground', dir: 'neutral' }`);
      if (!inChain) for (const d of I.ctx === 'counter' ? ['counter'] : I.dir === 'any' ? ['neutral', 'up'] : [I.dir]) {
        const key = I.ctx + ' ' + d;
        if (taken[key]) bad.push(`${at}: ${key} already starts ${taken[key]}`); else taken[key] = id;
      }
    }
    if (!tick(m.su) || !tick(m.ac) || m.ac < 1 || !tick(m.rc)) bad.push(`${at}: su and rc must be whole ticks, ac at least 1`);
    if (!num(m.dmg) || m.dmg < 0 || !num(m.poise) || m.poise < 0) bad.push(`${at}: dmg and poise must be numbers, 0 or more`);
    if (!Array.isArray(m.kb) || m.kb.length !== 2 || !m.kb.every(num)) bad.push(`${at}: kb must be [x, y]`);
    if (!Array.isArray(m.boxes) || m.boxes.length !== 1 || !m.boxes.every(b => Array.isArray(b) && b.length === 4 && b.every(num) && b[1] > 0 && b[3] > 0))
      bad.push(`${at}: boxes must hold one [x0, width, y0, height] with a width and height above 0 (one box for every active tick)`);
    if (!num(m.step) || m.step < 0) bad.push(`${at}: step must be a speed, 0 or more`);
    if (!Array.isArray(m.cancel) || !m.cancel.every(c => c && c.when === 'recovery' && Array.isArray(c.into) && c.into.length && c.into.every(t => CANCEL_INTO.includes(t))))
      bad.push(`${at}: cancel must be a list of { into: [${CANCEL_INTO.join(', ')}], when: 'recovery' }`);
    for (const k of ['launch', 'heavy']) if (k in m && typeof m[k] !== 'boolean') bad.push(`${at}: ${k} must be true or false`);
    if ('lift' in m && !(m.lift && num(m.lift.vy) && m.lift.vy > 0 && Number.isInteger(m.lift.ticks) && m.lift.ticks >= 1 && m.lift.ticks <= m.ac)) bad.push(`${at}: lift must be { vy above 0, ticks from 1 to ac }`);
    if ('charge' in m) {
      const C = m.charge;
      if (!C || !set.moves[C.from] || C.from === id || !Number.isInteger(C.hold) || C.hold < 1 || !tick(C.release) || !num(C.dmgMult) || C.dmgMult <= 0)
        bad.push(`${at}: charge must be { from: another move, hold: ticks, release: ticks, dmgMult above 0 }`);
    }
    if ('counter' in m && !(m.counter && num(m.counter.dmgMult) && m.counter.dmgMult > 0 && num(m.counter.poiseMult) && m.counter.poiseMult > 0))
      bad.push(`${at}: counter must be { dmgMult, poiseMult }, both above 0`);
    if (!moveReacts().includes(m.react)) bad.push(`${at}: react must be one of ${moveReacts().join(', ')}`);
    if ('juggle' in m && !(tick(m.juggle))) bad.push(`${at}: juggle must be whole weight, 0 or more`);
    if (m.counter && 'react' in m.counter && !moveReacts().includes(m.counter.react)) bad.push(`${at}: counter.react must be a reaction`);
    if ('hitstop' in m && !(['light', 'heavy', 'super'].includes(m.hitstop) || tick(m.hitstop))) bad.push(`${at}: hitstop must be light, heavy, super or whole ticks`);
    if (I && I.ctx === 'counter' && !m.counter) bad.push(`${at}: the counter move needs its counter bonus`);
  }
  const charges = ids.filter(id => set.moves[id].charge).map(id => set.moves[id].charge.from);
  if (new Set(charges).size !== charges.length) bad.push(`${who}: two moves charge from the same move`);
  if (!taken['air neutral']) bad.push(`${who}: nothing starts in the air`);
  if (!taken['counter counter']) bad.push(`${who}: no counter move`);
  return bad;
}
