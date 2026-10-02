// The move tables' format, the shorthands the tables share, and validateMoves(), which the tests run on every table.
// A hero's moveset is { hero, chain, airChain?, alt?, moves }: `chain` is the order of the ground strikes on Attack,
// `airChain` the order of the air strikes, `alt` the second ender ({ at, id, pause }: a press for the chain's strike
// `at` that comes `pause` ticks or more into the chain's window starts `id` instead), and `moves` maps each move id
// to its fields. The move engine
// (sim/moveEngine.js) runs them. Phase 0 encoded exactly what V2's melee did; phase 1 grows the format into the move
// grammar of 29 slots (SLOTS, below; HANDOFF-EXPANSION.md section 5.2).
//
// A move's fields (all required unless marked optional):
//   slot       the grammar slot it fills (SLOTS), or 'extra' for a hero's own addition (Wolverine's g5)
//   input      how the buttons reach it: { btn: 'attack', ctx, dir }
//                ctx  'ground', 'air': where the hero is when Attack is pressed
//                     'dash': on the ground, running at DASH.speed of run speed or more, the way they face
//                     'hold': reached by holding Attack through another move (see `charge`)
//                     'alt': the second ender, reached from the chain after a pause (the moveset's `alt`)
//                     'counter': Attack inside a perfect defence's counter window (one move per set)
//                dir  'neutral', 'fwd', 'back', 'up', 'down' (the stick past STICK.up, read relative to facing) or
//                     'any'. Inside a chain, fwd and back are not read: only up and down branch out of it
//              The chain's strikes all take { ctx: 'ground', dir: 'neutral' }, the air chain's { ctx: 'air', dir:
//              'neutral' }; `chain` and `airChain` order them.
//   su, ac, rc startup, active and recovery, in ticks. The move's clock `t` gains 1 / attackSpeed a tick, so it can
//              be fractional (Wolverine's berserk); a hitbox is out while su < t <= su + ac, and the move ends at
//              t >= su + ac + rc
//   dmg, poise damage, and poise damage, per hit
//   kb         knockback [x, y] in m/s, x pointing forward
//   boxes      [[x0, width, y0, height]]: the hitbox (m) for every active tick, from the feet, facing +x
//   step       forward speed (m/s) while on the ground, through startup and active (kept: no deceleration then)
//   cancel     [{ into, on, from?, to? }]: what the move can cancel into, tried in order, and when. `into` lists
//              'evade' (the hero's Evade), 'attack' (whatever Attack would start now) and 'jump' (a full jump, kept
//              for the launcher); `on` is 'any', or 'hit' (only once this move has hit something); `from` and `to`
//              are the window on the move's clock: from after `from` up to `to`, by default its recovery (after
//              su + ac, to the end)
//   react      the reaction a hit causes (REACTIONS in config.js, run by reactions.js; not held or thrown)
//   launch     optional, true: launches light Sentinels
//   heavy      optional, true: a heavy hit (it breaks armour plates and staggers longer)
//   lift       optional, { vy, ticks }: the hero rises at no less than vy (m/s) in the first `ticks` active ticks
//   dive       optional, { vy }: the hero drives down at vy (m/s) from the last startup tick through the active ticks,
//              while in the air
//   charge     optional, { from, hold, release, dmgMult }: holding Attack through the move `from` winds this one up.
//              While Attack stays down from the press that started `from`, `from` holds its pose at the end of its
//              active ticks. Let go before `hold` ticks and it recovers as usual; once the hold reaches `hold`, this
//              move fires when Attack is let go, or by itself once the hold reaches `hold + release`, and deals
//              dmg × dmgMult. (V2 only posed after the hold was reached, which the first strike never lived to see,
//              so V2's charge never fired; phase 1 fixed it.) Its input is { ctx: 'hold' }
//   counter    optional, { dmgMult, poiseMult, react? }: what it deals extra as the counter out of a perfect defence,
//              and the reaction it causes then instead of `react`
//   juggle     optional, juggle weight a hit adds in the air (JUGGLE in config.js: 10, a launcher 20)
//   hitstop    optional, 'light', 'heavy', 'super' (HITSTOP in config.js) or whole ticks: how long a hit freezes
//              the hero and the target together. Without it: heavy for a `heavy` move, else light
import { REACTIONS } from '../config.js';

// The move grammar's 29 slots (section 5.2 of the handoff). Phase 1 fills them for the first three heroes.
export const SLOTS = Object.freeze(['g1', 'g2', 'g3', 'g4', 'g4alt', 'fwd', 'up', 'down', 'heavy', 'dash', 'air1', 'air2', 'airDown',
  'throwF', 'throwB', 'throwU', 'throwAir', 'pTap', 'pHold', 'pFwd', 'pUp', 'pAir', 'evade', 'counter', 'counterP', 'sig', 'super', 'ult', 'exec']);

const FIELDS = ['slot', 'input', 'su', 'ac', 'rc', 'dmg', 'poise', 'kb', 'boxes', 'step', 'cancel', 'react', 'launch', 'heavy', 'lift', 'charge', 'counter', 'hitstop', 'juggle', 'dive'];
// The reactions a move may cause (read when validating: config.js imports the tables, so not at load time)
const moveReacts = () => REACTIONS.filter(r => r !== 'held' && r !== 'thrown');
const CTX = ['ground', 'air', 'dash', 'hold', 'alt', 'counter'], DIRS = ['neutral', 'fwd', 'back', 'up', 'down', 'any'];
const CANCEL_INTO = ['evade', 'attack', 'jump'], CANCEL_ON = ['any', 'hit'];

// Shorthands for the tables
const on = (ctx, dir) => Object.freeze({ btn: 'attack', ctx, dir });
export const ON = Object.freeze({
  chain: on('ground', 'neutral'), fwd: on('ground', 'fwd'), up: on('ground', 'up'), down: on('ground', 'down'),
  dash: on('dash', 'any'), hold: on('hold', 'any'), alt: on('alt', 'any'),
  air: on('air', 'neutral'), airDown: on('air', 'down'),
  counter: on('counter', 'any'),
});
const cancels = (...into) => Object.freeze([Object.freeze({ into: Object.freeze(into), on: 'any' })]);
export const CANCEL = Object.freeze({
  evadeOrAttack: cancels('evade', 'attack'),   // V2: every strike but the heavy, from its recovery
  evade: cancels('evade'),                     // V2: the heavy, which ends a chain
  // The launcher: on hit, from its first active tick, into a jump to follow the Sentinel up; else as a strike
  launcher: Object.freeze([Object.freeze({ into: Object.freeze(['jump']), on: 'hit' }), ...cancels('evade', 'attack')]),
});

// Every problem with a moveset, as readable lines; an empty list means it is valid
export function validateMoves(set) {
  const bad = [], ids = Object.keys((set && set.moves) || {});
  const num = v => typeof v === 'number' && Number.isFinite(v);
  const tick = v => Number.isInteger(v) && v >= 0;
  if (!set || typeof set.hero !== 'string') return ['a moveset needs a hero id'];
  const who = set.hero, chain = Array.isArray(set.chain) ? set.chain : [], airChain = Array.isArray(set.airChain) ? set.airChain : [];
  if (!ids.length) bad.push(`${who}: no moves`);
  if (!chain.length) bad.push(`${who}: no chain`);
  for (const id of [...chain, ...airChain]) if (!set.moves[id]) bad.push(`${who}: a chain names ${id}, which is not a move`);
  const taken = {}, slots = {};
  for (const id of ids) {
    const m = set.moves[id], at = `${who}.${id}`;
    for (const k of Object.keys(m)) if (!FIELDS.includes(k)) bad.push(`${at}: unknown field ${k}`);
    if (m.slot !== 'extra' && !SLOTS.includes(m.slot)) bad.push(`${at}: slot must be one of the grammar's slots, or 'extra'`);
    else if (m.slot !== 'extra') { if (slots[m.slot]) bad.push(`${at}: slot ${m.slot} is already filled by ${slots[m.slot]}`); slots[m.slot] = id; }
    const I = m.input;
    if (!I || I.btn !== 'attack' || !CTX.includes(I.ctx) || !DIRS.includes(I.dir)) bad.push(`${at}: input must be { btn: 'attack', ctx: ${CTX.join('|')}, dir: ${DIRS.join('|')} }`);
    else {
      const inChain = chain.includes(id), inAir = airChain.includes(id);
      if (inChain !== (I.ctx === 'ground' && I.dir === 'neutral')) bad.push(`${at}: the chain's strikes, and only they, take { ctx: 'ground', dir: 'neutral' }`);
      if (airChain.length && inAir !== (I.ctx === 'air' && I.dir === 'neutral')) bad.push(`${at}: the air chain's strikes, and only they, take { ctx: 'air', dir: 'neutral' }`);
      if (!inChain && !inAir && I.ctx !== 'hold' && I.ctx !== 'alt') for (const d of I.ctx === 'counter' ? ['counter'] : I.dir === 'any' ? DIRS.filter(x => x !== 'any') : [I.dir]) {
        const key = I.ctx + ' ' + d;
        if (taken[key] && I.dir === 'any') continue;   // a specific direction elsewhere wins over 'any'
        if (taken[key]) bad.push(`${at}: ${key} already starts ${taken[key]}`); else taken[key] = id;
      }
      if (I.ctx === 'hold' && !m.charge) bad.push(`${at}: a hold move needs its charge`);
      if (I.ctx === 'alt' && !(set.alt && set.alt.id === id)) bad.push(`${at}: an alt move must be the moveset's alt`);
    }
    if (!tick(m.su) || !tick(m.ac) || m.ac < 1 || !tick(m.rc)) bad.push(`${at}: su and rc must be whole ticks, ac at least 1`);
    if (!num(m.dmg) || m.dmg < 0 || !num(m.poise) || m.poise < 0) bad.push(`${at}: dmg and poise must be numbers, 0 or more`);
    if (!Array.isArray(m.kb) || m.kb.length !== 2 || !m.kb.every(num)) bad.push(`${at}: kb must be [x, y]`);
    if (!Array.isArray(m.boxes) || m.boxes.length !== 1 || !m.boxes.every(b => Array.isArray(b) && b.length === 4 && b.every(num) && b[1] > 0 && b[3] > 0))
      bad.push(`${at}: boxes must hold one [x0, width, y0, height] with a width and height above 0 (one box for every active tick)`);
    if (!num(m.step) || m.step < 0) bad.push(`${at}: step must be a speed, 0 or more`);
    if (!Array.isArray(m.cancel) || !m.cancel.every(c => c && CANCEL_ON.includes(c.on) && Array.isArray(c.into) && c.into.length && c.into.every(t => CANCEL_INTO.includes(t))
      && (c.from === undefined || num(c.from)) && (c.to === undefined || num(c.to))))
      bad.push(`${at}: cancel must be a list of { into: [${CANCEL_INTO.join(', ')}], on: ${CANCEL_ON.join('|')}, from?, to? }`);
    if (!moveReacts().includes(m.react)) bad.push(`${at}: react must be one of ${moveReacts().join(', ')}`);
    for (const k of ['launch', 'heavy']) if (k in m && typeof m[k] !== 'boolean') bad.push(`${at}: ${k} must be true or false`);
    if ('lift' in m && !(m.lift && num(m.lift.vy) && m.lift.vy > 0 && Number.isInteger(m.lift.ticks) && m.lift.ticks >= 1 && m.lift.ticks <= m.ac)) bad.push(`${at}: lift must be { vy above 0, ticks from 1 to ac }`);
    if ('charge' in m) {
      const C = m.charge;
      if (!C || !set.moves[C.from] || C.from === id || !Number.isInteger(C.hold) || C.hold < 1 || !tick(C.release) || !num(C.dmgMult) || C.dmgMult <= 0)
        bad.push(`${at}: charge must be { from: another move, hold: ticks, release: ticks, dmgMult above 0 }`);
    }
    if ('counter' in m && !(m.counter && num(m.counter.dmgMult) && m.counter.dmgMult > 0 && num(m.counter.poiseMult) && m.counter.poiseMult > 0
      && (!('react' in m.counter) || moveReacts().includes(m.counter.react))))
      bad.push(`${at}: counter must be { dmgMult, poiseMult, react? }, both multipliers above 0`);
    if (I && I.ctx === 'counter' && !m.counter) bad.push(`${at}: the counter move needs its counter bonus`);
    if ('dive' in m && !(m.dive && num(m.dive.vy) && m.dive.vy > 0)) bad.push(`${at}: dive must be { vy above 0 }`);
    if ('juggle' in m && !tick(m.juggle)) bad.push(`${at}: juggle must be whole weight, 0 or more`);
    if ('hitstop' in m && !(['light', 'heavy', 'super'].includes(m.hitstop) || tick(m.hitstop))) bad.push(`${at}: hitstop must be light, heavy, super or whole ticks`);
  }
  if (set.alt && !(chain.includes(set.alt.at) && set.moves[set.alt.id] && Number.isInteger(set.alt.pause) && set.alt.pause > 0)) bad.push(`${who}: alt must be { at: a chain strike, id: a move, pause: ticks }`);
  const charges = ids.filter(id => set.moves[id].charge).map(id => set.moves[id].charge.from);
  if (new Set(charges).size !== charges.length) bad.push(`${who}: two moves charge from the same move`);
  if (!taken['air neutral'] && !airChain.length) bad.push(`${who}: nothing starts in the air`);
  if (!taken['counter counter']) bad.push(`${who}: no counter move`);
  return bad;
}
