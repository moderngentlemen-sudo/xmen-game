// The move engine: every hero's melee, run from their move tables (sim/moves/, documented in moves/schema.js). A
// buffered Attack press picks a move (selectMove) and starts it (startMove); then the move runs a tick at a time
// (runMove): its clock, the charge rule, the step forward, its hitbox on active ticks, the launcher's lift, its end,
// and its cancel windows.
// Phase 0 moved V2's melee here with no change in behaviour; phase 1 grows it into the move grammar (directions read
// relative to facing, the dash and air chain contexts, cancel windows in ticks, cancels on hit). Its state on the
// player: p.move = { id, t, inst, counter, charged, hit, posed, letGo }, p.combo (the ground chain's index),
// p.airCombo (the air chain's), p.chainOf (which chain the last strike belonged to), p.comboT (the window to continue a chain) and p.atkHeld (the charge hold).
import { ACTION_BUFFER, BTN, COMBO_WINDOW, DASH, ENEMIES, EXEC, HEROES, HITSTOP, JUMP_BUFFER, PAIR, STICK, THROW, METER } from './config.js';
import { MOVESETS } from './moves/index.js';
import { emit, newId, ent } from './world.js';
import { spawnHitbox, spawnProjectile, hitEnemy, releaseToken } from './combat.js';
import { hittable } from './reactions.js';
import { physics, setState, tryEvade } from './player.js';
import { HERO } from './heroes/index.js';

const DIRS = ['neutral', 'fwd', 'back', 'up', 'down'];
// Per hero, built once from the tables: what Attack starts in each context and direction (the chains cover the
// ground and the air with no direction; a move for 'any' direction yields to one for a specific direction), the
// counter move, and which move holding Attack through another winds up
const RULES = {};
for (const [hero, set] of Object.entries(MOVESETS)) {
  const start = { ground: {}, air: {}, dash: {} }, chargeInto = {}, pair = { beside: {}, air: {}, stunned: {} }, special = {}, sigMove = {};
  let counter = null, counterP = null;
  const chains = [...set.chain, ...(set.airChain || [])];
  for (const pass of ['any', 'specific']) for (const [id, m] of Object.entries(set.moves)) {
    if (m.module) continue;   // run by the hero's module
    if (pass === 'any' && m.charge) chargeInto[m.charge.from] = id;
    if (m.input.btn === 'power') { if (m.input.ctx === 'counter') counterP = id; else special[m.input.dir] = id; continue; }
    if (m.input.btn === 'sig') { sigMove[m.input.dir] = id; continue; }
    if (m.input.btn === 'pair') { if ((m.input.dir === 'any') === (pass === 'any')) for (const dir of m.input.dir === 'any' ? DIRS : [m.input.dir]) pair[m.input.ctx][dir] = id; continue; }
    if (chains.includes(id) || m.input.ctx === 'hold' || m.input.ctx === 'alt') continue;
    if (m.input.ctx === 'counter') { counter = id; continue; }
    if ((m.input.dir === 'any') !== (pass === 'any')) continue;
    for (const dir of m.input.dir === 'any' ? DIRS : [m.input.dir]) start[m.input.ctx][dir] = id;
  }
  RULES[hero] = { start, counter, counterP, chargeInto, pair, special, sigMove };
}
const holding = (p, name) => (p.held & BTN[name]) !== 0;
// A move's hitstop in ticks (moves/schema.js, hitstop)
export const hitstopOf = m => typeof m.hitstop === 'number' ? m.hitstop : HITSTOP[m.hitstop || (m.heavy ? 'heavy' : 'light')];

// The move a perfect defence's counter starts: by Attack, or by Power (null if the hero has none)
export const counterMove = p => RULES[p.hero].counter;
export const counterPowerMove = p => RULES[p.hero].counterP;
// A move's invulnerability window covers the hero now
export const moveInvuln = p => { const m = p.move && MOVESETS[p.hero].moves[p.move.id]; return !!(m && m.invuln && p.move.t >= m.invuln[0] && p.move.t <= m.invuln[1]); };

// ---- Specials, supers and ultimates ------------------------------------------------------------------------------
// A Power tap with forward or up held: the directional special, instead of whatever the hero's module would have done
// with the tap (the module's power is cancelled first). Returns true if one started.
export function trySpecial(S, p) {
  const id = RULES[p.hero].special[dirOf(p)];
  if (!id) return false;
  if (p.move || p.state !== 'normal') p.move = null;
  HERO[p.hero].cancel(S, p); setState(p, 'normal');
  p.buf.power = 99;
  startMove(S, p, id, false);
  return true;
}
// Signature with forward held: the super; with up: the ultimate. Without the meter for it, false (the caller falls
// back to the plain Signature) and a meterLow event.
export function trySigMove(S, p) {
  const id = RULES[p.hero].sigMove[dirOf(p)];
  if (!id) return false;
  const m = MOVESETS[p.hero].moves[id];
  if (p.meter < m.cost) { emit(S, 'meterLow', { id: p.id, need: m.cost, have: p.meter }); return false; }
  if (p.move || p.state !== 'normal') p.move = null;
  HERO[p.hero].cancel(S, p); setState(p, 'normal');
  p.buf.sig = 99;
  startMove(S, p, id, false);
  return true;
}

// ---- Pairs: Attack and Power together (PAIR in config.js) ------------------------------------------------------------
// Attack and Power both pressed within PAIR.window ticks, one of them just now (p.lastPress ages the presses: starting
// a move does not consume them, and hitstop does not age them, so a pair pressed in a freeze comes out after it)
export const pairPressed = p => (p.lastPress.attack === 0 || p.lastPress.power === 0) && p.lastPress.attack <= PAIR.window && p.lastPress.power <= PAIR.window;
// What a grab can take hold of: a Sentinel that is not a boss, not armoured, not already held, lifted or thrown
const grabbable = e => !e.dead && hittable(e) && !ENEMIES[e.type].boss && !(e.armour > 0) && !e.heldBy && !(e.liftT > 0) && e.state !== 'thrown';
// The nearest Sentinel that passes `ok`, within `reach` (m, past its half-width) in front, or on either side when `both`
function nearTarget(S, p, ok, reach, both) {
  let best = null, bd = Infinity;
  for (const e of S.enemies) {
    if (!ok(e)) continue;
    const dx = (e.x - p.x) * p.facing, gap = Math.abs(e.x - p.x) - e.w / 2;
    if (Math.abs(e.y - p.y) > 1.4 || gap > reach || (!both && dx < -0.3)) continue;
    if (gap < bd) { bd = gap; best = e; }
  }
  return best;
}
// A pair was pressed: an execution on a stunned Sentinel in reach, else a throw beside one. Whatever the first press
// started (a strike, a power) is cancelled into it. Nothing in reach, or no move for it: nothing happens, and the
// first press's move carries on.
export function tryPair(S, p) {
  const R = RULES[p.hero], air = !p.onGround;
  let ctx = 'stunned', target = air ? null : nearTarget(S, p, e => grabbable(e) && e.state === 'stun', EXEC.reach, true);
  if (!target) { ctx = air ? 'air' : 'beside'; target = nearTarget(S, p, grabbable, THROW.reach, false); }
  const dir = dirOf(p), id = target && (R.pair[ctx][dir] || R.pair[ctx].fwd || R.pair[ctx].neutral);
  if (!id) return false;
  p.lastPress.attack = p.lastPress.power = 99; p.buf.attack = p.buf.power = 99;
  if (p.move || p.state !== 'normal') { p.move = null; HERO[p.hero].cancel(S, p); setState(p, 'normal'); }
  p.facing = target.x >= p.x ? 1 : -1;
  startMove(S, p, id, false, target.id);
  return true;
}

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
  // A chain continues only from its own last strike (a launcher or a jump in between starts the next one afresh)
  if (air && set.airChain) {
    p.airCombo = inChain && p.chainOf === 'air' ? (p.airCombo + 1) % set.airChain.length : 0;
    return { id: set.airChain[p.airCombo], counter: false };
  }
  p.combo = inChain && p.chainOf === 'ground' ? (p.combo + 1) % set.chain.length : 0;
  // The second ender: the press for the chain's strike `alt.at` that comes after a pause into the chain's window
  const A = set.alt;
  if (A && inChain && set.chain[p.combo] === A.at && COMBO_WINDOW - p.comboT >= A.pause) return { id: A.id, counter: false };
  return { id: set.chain[p.combo], counter: false };
}
export function tryAttack(S, p) {
  const pick = selectMove(S, p);
  if (!pick) return false;
  startMove(S, p, pick.id, pick.counter);
  return true;
}

export function startMove(S, p, id, counter, target = 0) {
  p.move = { id, t: 0, inst: newId(S), counter, charged: false, hit: false, target };
  const mv = MOVESETS[p.hero].moves[id];
  // A super or an ultimate spends its meter, and a resource it burns, as it starts
  if (mv.cost) { p.meter = Math.max(0, p.meter - mv.cost); emit(S, 'super', { id: p.id, move: id, hero: p.hero, ult: mv.cost >= METER.ult, x: p.x, y: p.y + p.h * 0.6 }); }
  if (mv.spend) p[mv.spend] = 0;
  // A grab takes hold of its target at once
  const tgt = target ? ent(S, target) : null;
  if (tgt) { tgt.state = 'held'; tgt.st = 0; tgt.heldBy = p.id; tgt.atk = null; tgt.vx = tgt.vy = 0; releaseToken(S, tgt); }
  const set = MOVESETS[p.hero];
  p.chainOf = set.chain.includes(id) ? 'ground' : set.airChain && set.airChain.includes(id) ? 'air' : null;
  p.atkHeld = 0;
  if (p.aimFree && Math.abs(p.aimX) > 0.2) p.facing = p.aimX > 0 ? 1 : -1;
  setState(p, 'attack');
  emit(S, 'swing', { id: p.id, move: id, hero: p.hero, x: p.x, y: p.y, facing: p.facing });
}

// A grab's tick: hold the target at arm's length, and on the first active tick let go with the move's hit. If the
// target got away (another hit knocked it loose, Jean took it), the grab carries on empty-handed.
function grabTick(S, p, M, m, t) {
  const e = M.target ? ent(S, M.target) : null, holds = e && !e.dead && e.state === 'held' && e.heldBy === p.id;
  if (holds && !M.thrown) { e.x = p.x + p.facing * (p.w / 2 + e.w / 2 + 0.05); e.y = p.y + (p.onGround ? 0 : -0.2); e.vx = e.vy = 0; e.facing = -p.facing; }
  if (t <= m.su || M.thrown) return;
  M.thrown = true;
  if (!holds) return;
  e.heldBy = 0; e.state = 'idle'; e.st = 0;
  hitEnemy(S, e, { owner: p.id, team: 'p', inst: M.inst, power: HEROES[p.hero].power, dmg: m.dmg, poise: m.poise, kb: [p.facing * m.kb[0], m.kb[1]],
    heavy: !!m.heavy, melee: true, hitstop: hitstopOf(m), react: m.react, juggle: m.juggle, move: M.id, kind: 'grab' });
  emit(S, 'throw', { id: p.id, move: M.id, target: e.id, x: e.x, y: e.y + e.h * 0.5, hero: p.hero });
}

// The move's shots: fanned around the hero's facing, from chest height
function fireShots(S, p, m) {
  const Q = m.shots;
  for (let i = 0; i < Q.n; i++) {
    const a = (i - (Q.n - 1) / 2) * Q.spread, dx = Math.cos(a) * p.facing, dy = Math.sin(a);
    spawnProjectile(S, { team: 'p', owner: p.id, x: p.x + p.facing * 0.6, y: p.y + p.h * 0.6, vx: dx * Q.speed, vy: dy * Q.speed, r: Q.r, dmg: Q.dmg, poise: Q.poise,
      kind: Q.kind || 'shot', power: HEROES[p.hero].power, ttl: Q.ttl, react: m.react, minst: p.move.inst });
  }
  emit(S, 'shots', { id: p.id, move: p.move.id, n: Q.n, x: p.x, y: p.y + p.h * 0.6, facing: p.facing });
}
// The area: every Sentinel within r of the hero is hit, wherever it is
function areaHit(S, p, M, m) {
  for (const e of S.enemies) {
    if (e.dead || !hittable(e) || Math.hypot(e.x - p.x, e.y + e.h / 2 - (p.y + p.h / 2)) > m.area.r) continue;
    hitEnemy(S, e, { owner: p.id, team: 'p', inst: M.inst, power: HEROES[p.hero].power, dmg: m.dmg, poise: m.poise, kb: [Math.sign(e.x - p.x || 1) * m.kb[0], m.kb[1]],
      heavy: !!m.heavy, hitstop: hitstopOf(m), react: m.react, juggle: m.juggle, move: M.id, kind: 'area' });
  }
  emit(S, 'area', { id: p.id, move: M.id, hero: p.hero, r: m.area.r, x: p.x, y: p.y + p.h / 2 });
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
  // Rehits: a fresh instance every `rehit` active ticks, so the same targets are hit again
  if (m.rehit && t > m.su && t <= m.su + m.ac) { const k = Math.floor((t - m.su - 1e-9) / m.rehit); if (k !== (M.rehitK || 0)) { M.rehitK = k; M.inst = newId(S); } }
  const firstActive = t > m.su && !M.fired;
  if (firstActive) M.fired = true;
  if (m.shots && firstActive) fireShots(S, p, m);
  if (m.area && t > m.su && t <= m.su + m.ac && (firstActive || M.inst !== M.areaInst)) { M.areaInst = M.inst; areaHit(S, p, M, m); }
  if (m.grab) grabTick(S, p, M, m, t);
  else if (m.shots || m.area) { /* their hits come from the shots or the area */ }
  else if (t > m.su && t <= m.su + m.ac && !M.posed) {
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
  if (m.dive && !p.onGround && t >= m.su - 1 && t <= m.su + m.ac) p.vy = -m.dive.vy;   // a dive drives the hero down
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
      // Up the ladder: Power pressed with forward or up is the special; Signature with forward the super
      else if (into === 'special' && p.buf.power <= ACTION_BUFFER && RULES[p.hero].special[dirOf(p)]) { if (trySpecial(S, p)) return; }
      else if (into === 'super' && p.buf.sig <= ACTION_BUFFER && RULES[p.hero].sigMove[dirOf(p)]) { if (trySigMove(S, p)) return; }
    }
  }
}
