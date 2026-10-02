// Players: the movement feel kept from Version 9 (coyote time, input buffers, a variable jump, wall slides and
// wall jumps, drop-through platforms), Evade with its perfect defence, hitstun, downed and revive. Attack runs on
// the move engine (moveEngine.js, from the move tables in sim/moves/). What makes each hero different lives in
// their module (sim/heroes/): Power, Signature, their resource, their own movement, and their states. Team is
// handled in team.js.
import { DT, GRAVITY, FALL_MULT, RISE_CUT, MAX_FALL, COYOTE, JUMP_BUFFER, ACTION_BUFFER, MERCY, BTN, BTN_NAMES, HEROES, PERFECT, GAUGE } from './config.js';
import { moveBody, hasHeadroom } from './level.js';
import { emit, newId } from './world.js';
import { HERO } from './heroes/index.js';
import { tryAttack, startMove, runMove, counterMove } from './moveEngine.js';

export function makePlayer(S, slot, hero, x, y) {
  const H = HEROES[hero];
  const p = {
    kind: 'player', id: newId(S), slot, hero, x, y, vx: 0, vy: 0, w: H.w, h: H.h, facing: 1,
    onGround: true, wallDir: 0, hitWall: 0, hitCeil: false, dropT: 0,
    hp: H.hp, maxHp: H.hp, mercy: 0, state: 'normal', st: 0,
    held: 0, buf: {}, holdT: {}, mx: 0, my: 0, aimX: 1, aimY: 0, aimFree: false,
    coyote: 0, jumpsLeft: H.airJumps, wallLock: 0, wallSlide: false,
    move: null, combo: 0, comboT: 0, atkHeld: 0, hitstop: 0,
    evade: null, evadeCd: 0, counterT: 0,
    hitstunT: 0, downedT: 0, revive: 0, markedBy: 0, heldBy: 0, thrown: null,
    teamCd: 0, tagCd: 0, teamPress: 0, edge: null, squad: null, lastHurtT: 999, fastball: null,
  };
  for (const b of BTN_NAMES) { p.buf[b] = 99; p.holdT[b] = 0; }
  HERO[hero].init(p);
  return p;
}

// Swap the hero a player is running (solo tag): body and resources change, position and facing stay
export function setHero(S, p, hero, hp) {
  const H = HEROES[hero];
  p.hero = hero; p.w = H.w; p.h = H.h; p.maxHp = H.hp; p.hp = hp === undefined ? H.hp : hp;
  p.move = null; p.evade = null; p.combo = 0; p.state = 'normal'; p.st = 0; p.jumpsLeft = H.airJumps;
  HERO[hero].init(p);
}

const has = (bits, name) => (bits & BTN[name]) !== 0;
export const isDown = p => p.state === 'downed' || p.state === 'dead';

export function updatePlayer(S, p, cmd, frozen) {
  const H = HEROES[p.hero], mod = HERO[p.hero];
  // Inputs: edges come from the held bits we remember, so a command is just what is held now
  const b = cmd.b | 0, pressed = b & ~p.held, released = p.held & ~b;
  p.held = b;
  const E = { b, pressed, released };
  // In hitstop the buffers and hold counts do not age, so a press made during the freeze comes out after it
  const stopped = p.hitstop > 0 && !frozen;
  for (const n of BTN_NAMES) {
    p.buf[n] = has(pressed, n) ? 0 : stopped ? p.buf[n] : Math.min(99, p.buf[n] + 1);
    p.holdT[n] = has(b, n) ? (stopped ? p.holdT[n] : p.holdT[n] + 1) : 0;
  }
  p.mx = Math.max(-1, Math.min(1, cmd.mx || 0)); p.my = Math.max(-1, Math.min(1, cmd.my || 0));
  if (cmd.aim && (cmd.ax || cmd.ay)) { const m = Math.hypot(cmd.ax, cmd.ay); p.aimX = cmd.ax / m; p.aimY = cmd.ay / m; p.aimFree = true; }
  else {
    p.aimFree = false;
    if (Math.abs(p.mx) > 0.3 || Math.abs(p.my) > 0.3) { const m = Math.hypot(p.mx, p.my); p.aimX = p.mx / m; p.aimY = p.my / m; }
    else { p.aimX = p.facing; p.aimY = 0; }
  }
  if (frozen) return;
  if (stopped) { p.hitstop--; return; }   // hitstop: frozen with whoever they hit, or whoever hit them
  p.st++;
  for (const k of ['mercy', 'evadeCd', 'counterT', 'comboT', 'teamCd', 'tagCd', 'dropT', 'wallLock', 'coyote']) if (p[k] > 0) p[k]--;
  p.lastHurtT = Math.min(9999, p.lastHurtT + 1);
  if (p.edge && --p.edge.t <= 0) p.edge = null;

  if (p.state === 'downed') { downed(S, p); return; }
  if (p.state === 'held' || p.state === 'thrown' || p.state === 'teamup' || p.state === 'ult' || p.state === 'tagout') return;   // team.js moves them
  mod.tick(S, p, cmd, E);
  if (p.state === 'downed') return;

  if (p.state === 'hitstun') {
    if (--p.hitstunT <= 0) setState(p, 'normal');
    physics(S, p, 0, cmd, E, true);
    return;
  }
  if (p.state === 'evade') { evade(S, p, cmd, E); return; }
  if (p.state === 'attack') { runMove(S, p, cmd, E); return; }
  if (mod.states && mod.states[p.state]) { mod.states[p.state](S, p, cmd, E); return; }

  // Normal: the hero's own buttons first, then the shared ones
  if (tryEvade(S, p, cmd)) return;
  if (mod.sig && p.buf.sig === 0 && !has(b, 'team')) { p.buf.sig = 99; mod.sig(S, p, cmd, E); if (p.state !== 'normal') return; }
  if (mod.power(S, p, cmd, E)) return;
  if (tryAttack(S, p)) return;
  physics(S, p, H.run * mod.speedMult(p), cmd, E, false);
}

export function setState(p, s) { p.state = s; p.st = 0; }

// ---- Movement ----------------------------------------------------------------------------------------
// run: target speed for the move input (0 to coast). locked: no new jumps or facing changes (hitstun). keepVx: leave
// the horizontal speed alone (a move's step forward)
export function physics(S, p, run, cmd, E, locked, keepVx = false) {
  const H = HEROES[p.hero], mod = HERO[p.hero];
  const target = p.mx * run, accel = p.onGround ? (Math.abs(target) > Math.abs(p.vx) ? H.accel : H.decel) : H.airAccel;
  if ((p.wallLock <= 0 || p.onGround) && !keepVx) p.vx += Math.sign(target - p.vx) * Math.min(Math.abs(target - p.vx), accel * DT);
  if (!locked && Math.abs(p.mx) > 0.2 && p.wallLock <= 0) p.facing = p.mx > 0 ? 1 : -1;
  // Jumps: buffered presses, coyote time on the ground, then the air jump; down + jump drops through
  if (!locked) {
    if (p.buf.jump <= JUMP_BUFFER && p.my < -0.5 && p.onGround && dropThrough(S, p)) p.buf.jump = 99;
    else if (p.buf.jump <= JUMP_BUFFER && (p.onGround || p.coyote > 0)) {
      p.vy = H.jumpV; p.onGround = false; p.coyote = 0; p.buf.jump = 99; p.jumpsLeft = H.airJumps;
      emit(S, 'jump', { id: p.id, x: p.x, y: p.y });
    } else if (p.buf.jump === 0 && !p.onGround && p.wallDir && (mod.wallJump ? mod.wallJump(S, p) : wallJump(S, p))) p.buf.jump = 99;
    else if (p.buf.jump === 0 && !p.onGround && p.jumpsLeft > 0 && !mod.ownsJump(S, p)) {
      p.vy = H.dblJump; p.jumpsLeft--; p.buf.jump = 99;
      emit(S, 'djump', { id: p.id, x: p.x, y: p.y });
    }
  }
  // Gravity, with the hero's own air movement (levitation, wall climbing) taking over where it applies
  if (!mod.air(S, p, cmd, E)) {
    const rising = p.vy > 0, holdJump = has(p.held, 'jump');
    p.vy -= GRAVITY * DT * (rising ? (holdJump || locked ? 1 : RISE_CUT) : FALL_MULT);
    // Wall slide: pushing into a wall while falling slows the fall
    p.wallSlide = !p.onGround && p.wallDir !== 0 && Math.sign(p.mx) === p.wallDir && p.vy < 0;
    if (p.wallSlide) { p.vy = Math.max(p.vy, -3.6); p.jumpsLeft = HEROES[p.hero].airJumps; }
  }
  p.vy = Math.max(p.vy, -MAX_FALL);
  const was = p.onGround;
  moveBody(p, DT, S.gates);
  if (p.onGround) { p.coyote = COYOTE; p.jumpsLeft = H.airJumps; if (!was) emit(S, 'land', { id: p.id, x: p.x, y: p.y, vy: p.vy }); }
}

function dropThrough(S, p) { p.dropT = 12; p.onGround = false; p.vy = -2; return true; }
export function wallJump(S, p) {
  const d = p.wallDir;
  p.vx = -d * 9.5; p.vy = 16; p.facing = -d; p.wallLock = 7; p.jumpsLeft = HEROES[p.hero].airJumps;
  emit(S, 'walljump', { id: p.id, x: p.x, y: p.y, dir: -d });
  return true;
}

// ---- Evade ---------------------------------------------------------------------------------------------
// A short dash with invulnerability at the start. Timed into a hit (the first `perfect` ticks) it is a
// perfect defence: the hit is negated, the attacker slows, and Attack within the window counters.
export function tryEvade(S, p, cmd) {
  const V = HEROES[p.hero].evade;
  if (p.buf.evade > ACTION_BUFFER || p.evadeCd > 0) return false;
  p.buf.evade = 99;
  const dir = Math.abs(p.mx) > 0.25 ? Math.sign(p.mx) : V.back ? -p.facing : p.facing;
  p.evade = { dir, t: 0, perfect: false };
  p.vx = dir * V.speed; p.vy = p.onGround ? 0 : Math.max(p.vy * 0.3, 0);
  p.move = null; HERO[p.hero].cancel(S, p);
  setState(p, 'evade');
  emit(S, 'evade', { id: p.id, x: p.x, y: p.y, dir, hero: p.hero });
  return true;
}
function evade(S, p, cmd, E) {
  const V = HEROES[p.hero].evade, ev = p.evade;
  ev.t++;
  p.vx = ev.dir * V.speed * (1 - 0.5 * (ev.t / V.ticks));
  if (!p.onGround) p.vy = Math.max(p.vy - GRAVITY * DT * 0.5, -6);
  else p.vy = 0;
  moveBody(p, DT, S.gates);
  if (ev.t >= V.ticks) { p.evade = null; p.evadeCd = V.cd; setState(p, 'normal'); }
  // A counter straight out of a perfect defence
  if (ev.perfect && p.buf.attack <= ACTION_BUFFER) { p.evade = null; setState(p, 'normal'); startMove(S, p, counterMove(p), true); }
}
export const invulnerable = p => (p.state === 'evade' && p.evade && p.evade.t < HEROES[p.hero].evade.iframes) || p.mercy > 0 || p.state === 'held' || p.state === 'thrown' || p.state === 'ult' || p.state === 'tagout';
export const perfectWindow = p => p.state === 'evade' && p.evade && p.evade.t < HEROES[p.hero].evade.perfect;

export function perfectDefence(S, p, attacker) {
  p.evade.perfect = true; p.counterT = PERFECT.counter;
  if (attacker && attacker.kind === 'enemy') attacker.slowT = PERFECT.slow;
  S.gauge = Math.min(GAUGE.max, S.gauge + GAUGE.perfect);
  emit(S, 'perfect', { id: p.id, x: p.x, y: p.y + p.h * 0.6, hero: p.hero });
}

// ---- Attack ---------------------------------------------------------------------------------------------------
// The melee runs on the move engine (moveEngine.js): tryAttack in the normal state, runMove in the 'attack' state.

// ---- Hurt, downed, revive ----------------------------------------------------------------------------------
export function stagger(S, p, kb, ticks) {
  p.move = null; p.evade = null; HERO[p.hero].cancel(S, p);
  p.vx = kb[0]; p.vy = kb[1]; p.onGround = p.vy > 0 ? false : p.onGround;
  p.hitstunT = ticks; setState(p, 'hitstun');
}
export function downPlayer(S, p) {
  p.hp = 0; p.move = null; p.evade = null; HERO[p.hero].cancel(S, p);
  p.markedBy = 0; p.vx = 0; p.revive = 0; p.downedT = 0;
  setState(p, 'downed');
  emit(S, 'downed', { id: p.id, x: p.x, y: p.y, hero: p.hero });
}
// Down: a teammate standing close revives them. Alone, the next hero in the squad tags in (team.js).
function downed(S, p) {
  p.downedT++;
  if (!p.onGround) { p.vy -= GRAVITY * DT; moveBody(p, DT, S.gates); }
  const helpers = S.players.filter(q => q !== p && !isDown(q) && Math.abs(q.x - p.x) < 1.6 && Math.abs(q.y - p.y) < 1.6);
  if (helpers.length) p.revive += helpers.length; else p.revive = Math.max(0, p.revive - 0.5);
  if (p.revive >= 90) {
    p.hp = Math.round(p.maxHp * 0.45); p.mercy = MERCY; setState(p, 'normal');
    S.gauge = Math.min(GAUGE.max, S.gauge + GAUGE.revive);
    emit(S, 'revived', { id: p.id, x: p.x, y: p.y, hero: p.hero });
  }
}
