// The move engine: every hero's melee, run from their move tables (sim/moves/, documented in moves/schema.js). A
// buffered Attack press picks a move (selectMove) and starts it (startMove); then the move runs a tick at a time
// (runMove): its clock, the charge rule, the step forward, its hitbox on active ticks, the launcher's lift, its end,
// and its cancels.
// Phase 0 moved V2's melee here from player.js with no change in behaviour: the order of operations and the float
// arithmetic are V2's, down to the fractional clock under berserk, and tests/golden-test.mjs holds it to that. Its
// state on the player is V2's too: p.move = { id, t, inst, counter, charged }, p.combo, p.comboT and p.atkHeld.
import { ACTION_BUFFER, BTN, COMBO_WINDOW, HEROES, HITSTOP, STICK } from './config.js';
import { MOVESETS } from './moves/index.js';
import { emit, newId } from './world.js';
import { spawnHitbox } from './combat.js';
import { physics, setState, tryEvade } from './player.js';
import { HERO } from './heroes/index.js';

// Per hero, built once from the tables: what Attack starts in each context and direction (the chain covers the
// ground with no direction), the counter move, and which move holding Attack through another winds up
const RULES = {};
for (const [hero, set] of Object.entries(MOVESETS)) {
  const start = { ground: {}, air: {} }, chargeInto = {};
  let counter = null;
  for (const [id, m] of Object.entries(set.moves)) {
    if (m.charge) chargeInto[m.charge.from] = id;
    if (set.chain.includes(id)) continue;
    if (m.input.ctx === 'counter') counter = id;
    else for (const dir of m.input.dir === 'any' ? ['neutral', 'up'] : [m.input.dir]) start[m.input.ctx][dir] = id;
  }
  RULES[hero] = { start, counter, chargeInto };
}
const holding = (p, name) => (p.held & BTN[name]) !== 0;
// A move's hitstop in ticks (moves/schema.js, hitstop)
export const hitstopOf = m => typeof m.hitstop === 'number' ? m.hitstop : HITSTOP[m.hitstop || (m.heavy ? 'heavy' : 'light')];

// The move a perfect defence's counter starts
export const counterMove = p => RULES[p.hero].counter;

// A buffered Attack press: { id, counter } for the move it starts, or null when there is no press to take. Inside a
// perfect defence's counter window it is the counter move; otherwise the move for where the hero is and the
// direction held; on the ground with no direction, the chain's next strike while the chain's window is open, else
// its first.
export function selectMove(S, p) {
  if (p.buf.attack > ACTION_BUFFER) return null;
  p.buf.attack = 99;
  const R = RULES[p.hero];
  if (p.counterT > 0) { p.counterT = 0; return { id: R.counter, counter: true }; }
  const id = R.start[p.onGround ? 'ground' : 'air'][p.my > STICK.up ? 'up' : 'neutral'];
  if (id) return { id, counter: false };
  const chain = MOVESETS[p.hero].chain;
  p.combo = p.comboT > 0 ? (p.combo + 1) % chain.length : 0;
  return { id: chain[p.combo], counter: false };
}
export function tryAttack(S, p) {
  const pick = selectMove(S, p);
  if (!pick) return false;
  startMove(S, p, pick.id, pick.counter);
  return true;
}

export function startMove(S, p, id, counter) {
  p.move = { id, t: 0, inst: newId(S), counter, charged: false };
  p.atkHeld = 0;
  if (p.aimFree && Math.abs(p.aimX) > 0.2) p.facing = p.aimX > 0 ? 1 : -1;
  setState(p, 'attack');
  emit(S, 'swing', { id: p.id, move: id, hero: p.hero, x: p.x, y: p.y, facing: p.facing });
}

// One tick of the move in progress (the player's 'attack' state)
export function runMove(S, p, cmd, E) {
  const M = p.move, set = MOVESETS[p.hero], m = set.moves[M.id], speed = 1 / HERO[p.hero].attackSpeed(p);
  M.t += speed;
  // Holding Attack through a move another charges from winds that one up instead. The hold counts from the press
  // that started the move and breaks for good once Attack is let go. While it lasts, the move holds its pose at
  // the end of its active ticks (`posed`: no hitbox, no step; Evade still gets out). Let go before `hold` and the
  // move recovers as usual; once the hold is reached the charged move fires on release, or by itself at
  // `hold + release`.
  const into = RULES[p.hero].chargeInto[M.id];
  M.posed = false;
  if (into) {
    const C = set.moves[into].charge, down = holding(p, 'attack');
    if (!down) M.letGo = true; else if (!M.letGo) p.atkHeld++;
    if (M.t >= m.su + m.ac && p.atkHeld >= C.hold) {
      if (!down || p.atkHeld >= C.hold + C.release) { startMove(S, p, into, false); p.move.charged = true; emit(S, 'charged', { id: p.id, x: p.x, y: p.y + 1 }); return; }
      M.t = m.su + m.ac; M.posed = true;
    } else if (M.t >= m.su + m.ac && down && !M.letGo) { M.t = m.su + m.ac; M.posed = true; }
    if (p.atkHeld === C.hold && down && !M.letGo) emit(S, 'chargeReady', { id: p.id, x: p.x, y: p.y + 1 });
    if (M.posed && tryEvade(S, p, cmd)) return;
  }
  const t = M.t;
  // Air moves keep the body moving; on the ground the hero steps forward through startup and active, and the step
  // is kept (physics leaves vx alone while stepping), so the hero travels
  const stepping = t <= m.su + m.ac && p.onGround && !M.posed;
  if (stepping) p.vx = p.facing * m.step;
  if (t > m.su && t <= m.su + m.ac && !M.posed) {
    const [x0, w, y0, h] = m.boxes[0], bonus = m.counter, charge = m.charge;
    spawnHitbox(S, {
      owner: p.id, team: 'p', inst: M.inst, power: HEROES[p.hero].power,
      x0: p.x + p.facing * x0 - (p.facing < 0 ? w : 0), x1: p.x + p.facing * x0 + (p.facing > 0 ? w : 0),
      y0: p.y + y0, y1: p.y + y0 + h,
      dmg: m.dmg * (M.counter ? bonus.dmgMult : 1) * (M.charged ? charge.dmgMult : 1), poise: m.poise * (M.counter ? bonus.poiseMult : 1),
      kb: [p.facing * m.kb[0], m.kb[1]], launch: !!m.launch, heavy: !!m.heavy, melee: true, hitstop: hitstopOf(m),
    });
    if (m.lift && t <= m.su + m.lift.ticks) p.vy = Math.max(p.vy, m.lift.vy);   // the launcher carries the hero up a little
  }
  physics(S, p, 0, cmd, E, true, stepping);
  if (t >= m.su + m.ac + m.rc) { p.move = null; p.comboT = COMBO_WINDOW; setState(p, 'normal'); return; }
  // Cancels, in the table's order: into Evade, or into the next Attack (taken at the start of recovery, so a chain
  // flows)
  for (const c of m.cancel) {
    if (c.when === 'recovery' && t <= m.su + m.ac) continue;
    for (const to of c.into) {
      if (to === 'evade') { if (tryEvade(S, p, cmd)) return; }
      else if (to === 'attack' && p.buf.attack <= ACTION_BUFFER) { p.comboT = COMBO_WINDOW; p.move = null; setState(p, 'normal'); tryAttack(S, p); return; }
    }
  }
}
