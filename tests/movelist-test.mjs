// Every move of every hero's table (EVERY_MOVE_TESTED: the phase 1 gate looks for this marker). For each move:
//   1. its input reaches it: real button presses (the grammar of moves/schema.js), from a standing start
//   2. it hits: started by itself with a trooper placed in its hitbox, it lands within its active ticks
//   3. the trooper reacts the way the move's `react` says (reactions.js): an air hit on a Sentinel in the air
// A move added to a table is covered here at once; a new kind of input needs a recipe in `reach`.
import { createWorld, step } from '../game/js/sim/world.js';
import { BTN, ENEMIES } from '../game/js/sim/config.js';
import { setHero } from '../game/js/sim/player.js';
import { createEnemy } from '../game/js/sim/enemies.js';
import { startMove } from '../game/js/sim/moveEngine.js';
import { MOVESETS } from '../game/js/sim/moves/index.js';

const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const cmd = (o = {}) => ({ mx: o.mx || 0, my: o.my || 0, ax: 1, ay: 0, aim: false, b: o.b || 0 });

function setup(hero) {
  const S = createWorld({ seed: 3, players: 1 }), p = S.players[0];
  if (p.hero !== hero) setHero(S, p, hero);
  S.enemies = []; p.x = 17; p.y = 0;   // clear floor ahead (the rooftop vent ends at 15.5)
  p.mercy = 0; p.facing = 1; S.mission.phase = 'test';
  const log = [];
  const run = (o = {}, n = 1) => { for (let i = 0; i < n; i++) { step(S, { [p.slot]: cmd(typeof o === 'function' ? o(i) : o) }); log.push(...S.events); } };
  return { S, p, run, log };
}
const swung = (log, id) => log.some(e => e.type === 'swing' && e.move === id);

// ---- 1. Reached by its input -----------------------------------------------------------------------------------
// Each recipe presses buttons the way a player would and returns once the move has started (or gives up)
function reach(hero, id) {
  const set = MOVESETS[hero], m = set.moves[id], { S, p, run, log } = setup(hero);
  const tap = (o = {}) => { run({ ...o, b: (o.b || 0) | BTN.attack }); run({ mx: o.mx, my: o.my }); };
  const walkChain = (chain, upTo, air = false) => {
    // Taps in each strike's recovery walk the chain up to the strike before `upTo`
    tap(air ? { b: BTN.jump } : {});
    for (let i = 0; i < 200 && !swung(log, upTo); i++) {
      const cur = p.move && set.moves[p.move.id];
      if (cur && p.move.t > cur.su + cur.ac) tap(air ? { b: BTN.jump } : {}); else run(air ? { b: BTN.jump } : {});
    }
  };
  const I = m.input;
  // A pair needs a Sentinel to take hold of: a stunned one for an execution, one in reach for a throw (in the air
  // for a throw in the air); Attack first, then Power two ticks later, inside the pair's window
  if (I.btn === 'pair') {
    const e = createEnemy(S, 'trooper', p.x + 1.1, 0, { cd: 9999, onGround: true, hp: 999, maxHp: 999 }); S.enemies.push(e);
    if (I.ctx === 'stunned') { e.state = 'stun'; e.stunT = 999; }
    if (I.ctx === 'air') { run({ b: BTN.jump }, 6); e.y = p.y; e.onGround = false; e.state = 'launched'; e.juggle = 20; e.hitstop = 1e9; e.x = p.x + 1.0; }
    const hold = I.ctx === 'air' ? BTN.jump : 0, dir = { mx: I.dir === 'back' ? -1 : I.dir === 'fwd' ? 1 : 0, my: I.dir === 'up' ? 1 : 0 };
    run({ ...dir, b: hold | BTN.attack }); run({ ...dir, b: hold }); run({ ...dir, b: hold | BTN.power }); run({ b: hold });
    return swung(log, id);
  }
  if (I.btn === 'power') {
    // Power inside a perfect defence's counter window: a perfect Evade into a trooper's swing first
    const e = createEnemy(S, 'trooper', p.x + 1.3, 0, { cd: 0, onGround: true, hp: 999, maxHp: 999 }); S.enemies.push(e);
    for (let i = 0; i < 200 && !log.some(v => v.type === 'perfect'); i++) {
      const tell = e.state === 'windup' && e.atk && (e.atk.wind || ENEMIES.trooper[e.atk.kind].wind) - e.st <= 2;
      run(tell ? { b: BTN.evade } : {});
    }
    run({ b: BTN.power }); run({}, 2);
    return swung(log, id);
  }
  if (set.chain.includes(id)) walkChain(set.chain, id);
  else if (set.airChain && set.airChain.includes(id)) { run({ b: BTN.jump }, 6); walkChain(set.airChain, id, true); }
  else if (I.ctx === 'alt') {
    // The chain up to the strike before `alt.at`, then a pause into the window before the last press
    const at = set.chain.indexOf(set.alt.at), before = set.chain[at - 1];
    walkChain(set.chain, before);
    while (p.move) run();
    run({}, set.alt.pause + 1); tap();
  }
  else if (I.ctx === 'hold') { run({ b: BTN.attack }, 1 + m.charge.hold + m.charge.release); run({}, 2); }
  else if (I.ctx === 'counter') { p.counterT = 10; tap(); }
  else if (I.ctx === 'dash') { run({ mx: 1 }, 40); tap({ mx: 1 }); }
  else if (I.ctx === 'air') { run({ b: BTN.jump }, 6); tap({ b: BTN.jump, my: I.dir === 'down' ? -1 : I.dir === 'up' ? 1 : 0 }); }
  else if (I.ctx === 'ground') tap({ mx: I.dir === 'fwd' ? 1 : I.dir === 'back' ? -1 : 0, my: I.dir === 'up' ? 1 : I.dir === 'down' ? -1 : 0 });
  return swung(log, id);
}

// ---- 2 and 3. It hits, and the trooper reacts --------------------------------------------------------------------
// What the trooper's state says about each reaction, right after the hit lands
const SHOWS = {
  flinch: e => e.flinchT > 0, stagger: e => e.state === 'stagger', knockdown: e => e.state === 'knockdown', launch: e => e.state === 'launched',
  airHit: e => e.state === 'launched', wallBounce: e => e.state === 'wallBounce', groundBounce: e => e.state === 'groundBounce',
  crumple: e => e.state === 'crumple', spinOut: e => e.state === 'spinOut', stun: e => e.state === 'stun',
};
function hitAndReact(hero, id) {
  const set = MOVESETS[hero], m = set.moves[id], { S, p, run, log } = setup(hero);
  const air = m.input.ctx === 'air', [x0, w, y0, h] = m.boxes[0];
  if (air) { p.y = m.dive ? 2.6 : 3; p.onGround = false; p.vy = 0; }
  // The trooper stands in the middle of the hitbox (on the floor for a dive, which comes down onto it), frozen in
  // place by a long hitstop so only the hit moves it
  const e = createEnemy(S, 'trooper', p.x + x0 + w / 2, 0, { cd: 9999, onGround: true, hp: 999, maxHp: 999 });
  if (air && !m.dive) { e.y = Math.max(0, p.y + y0 + h / 2 - e.h / 2); e.onGround = false; e.state = 'launched'; e.juggle = 20; }
  if (m.input.ctx === 'stunned') { e.state = 'stun'; e.stunT = 999; }
  e.hitstop = 1e9; S.enemies.push(e);
  startMove(S, p, id, I_COUNTER(m), m.grab ? e.id : 0);
  let landedAt = null;
  for (let i = 0; i < 80 && landedAt === null && p.move; i++) {
    run(air && !m.dive ? { b: BTN.jump } : {});
    if (log.some(v => v.type === 'hit' && v.id === e.id)) landedAt = p.move ? p.move.t : -1;
  }
  const want = m.input.ctx === 'counter' && m.counter.react ? m.counter.react : m.react;
  return { landed: landedAt !== null, inActive: landedAt !== null && (landedAt === -1 || (landedAt > m.su && landedAt <= m.su + m.ac + 0.001)), reacted: landedAt !== null && SHOWS[want](e), want, state: e.state };
}
const I_COUNTER = m => m.input.ctx === 'counter';   // either counter, by Attack or by Power

for (const hero of Object.keys(MOVESETS)) {
  const set = MOVESETS[hero], ids = Object.keys(set.moves), unreached = [], missed = [], wrong = [];
  for (const id of ids) {
    if (!reach(hero, id)) unreached.push(id);
    const r = hitAndReact(hero, id);
    if (!r.landed || !r.inActive) missed.push(id);
    else if (!r.reacted) wrong.push(`${id} (wanted ${r.want}, got ${r.state})`);
  }
  assert(!unreached.length, `${hero}: every move (${ids.length}) starts from its input${unreached.length ? `; not: ${unreached.join(', ')}` : ''}`);
  assert(!missed.length, `${hero}: every move lands on a Sentinel in its hitbox, on an active tick${missed.length ? `; not: ${missed.join(', ')}` : ''}`);
  assert(!wrong.length, `${hero}: every move causes its reaction${wrong.length ? `; not: ${wrong.join('; ')}` : ''}`);
}
