// The move engine: every hero's melee, run from their move tables (sim/moves/, documented in moves/schema.js). A
// buffered Attack press picks a move (selectMove) and starts it (startMove); then the move runs a tick at a time
// (runMove): its clock, the charge rule, the step forward, its hitbox on active ticks, the launcher's lift, its end,
// and its cancel windows.
// Phase 0 moved V2's melee here with no change in behaviour; phase 1 grows it into the move grammar (directions read
// relative to facing, the dash and air chain contexts, cancel windows in ticks, cancels on hit). Its state on the
// player: p.move = { id, t, inst, counter, charged, hit, posed, letGo }, p.combo (the ground chain's index),
// p.airCombo (the air chain's), p.comboT (the window to continue a chain) and p.atkHeld (the charge hold).
import { ACTION_BUFFER, BTN, COMBO_WINDOW, DASH, HEROES, HITSTOP, JUMP_BUFFER, STICK } from './config.js';
import { MOVESETS } from './moves/index.js';
import { emit, newId } from './world.js';
import { spawnHitbox } from './combat.js';
import { physics, setState, tryEvade } from './player.js';
import { HERO } from './heroes/index.js';

const DIRS = ['neutral', 'fwd', 'back', 'up', 'down'];
// Per hero, built once from the tables: what Attack starts in each context and direction (the chains cover the
// ground and the air with no direction; a move for 'any' direction yields to one for a specific direction), the
// counter move, and which move holding Attack through another winds up
const RULES = {};
for (const [hero, set] of Object.entries(MOVESETS)) {
  const start = { ground: {}, air: {}, dash: {} }, chargeInto = {};
  let counter = null;
  const chains = [...set.chain, ...(set.airChain || [])];
  for (const pass of ['any', 'specific']) for (const [id, m] of Object.entries(set.moves)) {
    if (pass === 'any' && m.charge) chargeInto[m.charge.from] = id;
    if (chains.includes(id) || m.input.ctx === 'hold') continue;
    if (m.input.ctx === 'counter') { counter = id; continue; }
    if ((m.input.dir === 'any') !== (pass === 'any')) continue;
    for (const dir of m.input.dir === 'any' ? DIRS : [m.input.dir]) start[m.input.ctx][dir] = id;
  }
  RULES[hero] = { start, counter, chargeInto };
}
const holding = (p, name) => (p.held & BTN[name]) !== 0;
// A move's hitstop in ticks (moves/schema.js, hitstop)
export const hitstopOf = m => typeof m.hitstop === 'number' ? m.hitstop : HITSTOP[m.hitstop || (m.heavy ? 'heavy' : 'light')];

// The move a perfect defence's counter starts
export const counterMove = p => RULES[p.hero].counter;

// The direction held, relative to where the hero faces: up and down first, then forward and back
export function dirOf(p) {
  if (p.my > STICK.up) return 'up';
  if (p.my < -STICK.up) return 'down';
  const f = p.mx * p.facing;
  return f > STICK.up ? 'fwd' : f < -STICK.up ? 'back' : 'neutral';
}
// Running flat out the way they face, on the ground: Attack is a dash strike
export const dashing = p => p.onGround && p.vx * p.facing >= DASH.speed * HEROES[p.hero].run * HERO[p.hero].speedMult(p);

// A buffered Attack press: { id, counter } for the move it starts, or null when there is no press to take. Inside a
// perfect defence's counter window it is the counter move. Otherwise the context (the air; a dash; the ground) and
// the direction pick the move. Inside a chain (its window still open) only up and down branch out; forward and back
// read as no direction, so a hero walking into a fight keeps their string. With no move for the direction, it reads
// as no direction; a dash with no dash strike reads as the ground; and no direction walks the chain for where the
// hero is: its next strike while the chain's window is open, else its first.
export function selectMove(S, p) {
  if (p.buf.attack > ACTION_BUFFER) return null;
  p.buf.attack = 99;
  const R = RULES[p.hero], set = MOVESETS[p.hero];
  if (p.counterT > 0) { p.counterT = 0; return { id: R.counter, counter: true }; }
  const inChain = p.comboT > 0, air = !p.onGround;
  let dir = dirOf(p);
  if (inChain && (dir === 'fwd' || dir === 'back')) dir = 'neutral';
  const ctx = air ? 'air' : !inChain && dashing(p) ? 'dash' : 'ground';
  const id = R.start[ctx][dir] || (ctx === 'dash' && R.start.ground[dir]) || (dir !== 'neutral' && R.start[ctx === 'dash' ? 'ground' : ctx].neutral);
  if (id) return { id, counter: false };
  if (air && set.airChain) {
    p.airCombo = inChain ? (p.airCombo + 1) % set.airChain.length : 0;
    return { id: set.airChain[p.airCombo], counter: false };
  }
  p.combo = inChain ? (p.combo + 1) % set.chain.length : 0;
  return { id: set.chain[p.combo], counter: false };
}
export function tryAttack(S, p) {
  const pick = selectMove(S, p);
  if (!pick) return false;
  startMove(S, p, pick.id, pick.counter);
  return true;
}

export function startMove(S, p, id, counter) {
  p.move = { id, t: 0, inst: newId(S), counter, charged: false, hit: false };
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
      react: M.counter && bonus.react ? bonus.react : m.react, juggle: m.juggle, move: M.id,
    });
    if (m.lift && t <= m.su + m.lift.ticks) p.vy = Math.max(p.vy, m.lift.vy);   // the launcher carries the hero up a little
  }
  physics(S, p, 0, cmd, E, true, stepping);
  if (t >= m.su + m.ac + m.rc) { p.move = null; p.comboT = COMBO_WINDOW; setState(p, 'normal'); return; }
  // Cancel windows, in the table's order: into Evade, a jump (kept as a full jump: the launcher's follow-up), or the
  // next Attack (taken from the window's start, so a chain flows). A window runs after `from` up to `to` on the
  // move's clock: by default from the first active tick for a cancel on hit (a hit can only come then), else from
  // the recovery, to the end
  for (const c of m.cancel) {
    const from = c.from !== undefined ? c.from : c.on === 'hit' ? m.su : m.su + m.ac, to = c.to !== undefined ? c.to : Infinity;
    if (t <= from || t > to || (c.on === 'hit' && !M.hit)) continue;
    for (const into of c.into) {
      if (into === 'evade') { if (tryEvade(S, p, cmd)) return; }
      else if (into === 'jump' && p.buf.jump <= JUMP_BUFFER) {
        p.move = null; p.comboT = COMBO_WINDOW; setState(p, 'normal');
        p.vy = Math.max(p.vy, HEROES[p.hero].jumpV); p.onGround = false; p.buf.jump = 99;
        emit(S, 'jump', { id: p.id, x: p.x, y: p.y, cancel: M.id });
        return;
      }
      else if (into === 'attack' && p.buf.attack <= ACTION_BUFFER) { p.comboT = COMBO_WINDOW; p.move = null; setState(p, 'normal'); tryAttack(S, p); return; }
    }
  }
}
