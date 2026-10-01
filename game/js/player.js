// Player controller: movement, actions, cancel rules. Operates on plain data; the world
// supplies spawning helpers and events. Frame data lives in config.js.
import {
  DT, GRAVITY, FALL_MULT, RISE_CUT_MULT, MAX_FALL, FAST_FALL, HIGH_VEL,
  COYOTE, JUMP_BUFFER, ACTION_BUFFER, PARRY_BUFFER, PARRY, CHARS, MOVES, VB, NOVA, MARKSMAN, ECHO, HUNTER, SCARF, SETTINGS,
  WALL, DASH_CHARGE, LOCK, AEGIS, DASH_SLASH, POUND, SUBS, SUB, DODGE, ULT, DRILL, BERSERK, HEAL, kitOf, boostOf,
} from './config.js';
import { moveBody, hasHeadroom } from './level.js';

const sign = v => (v > 0 ? 1 : v < 0 ? -1 : 0);
const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));

// A hero on the Nova frame with the Marksman kit (attachments, secondary powers, dodge; hover and glide
// where their kit has them): Cyclops, Storm, Jean Grey, and Nova himself
export const marksman = p => p.arch === 'nova' && SETTINGS.novaKit === 'marksman';
// The attachments and secondary powers this hero carries
const attachList = p => (marksman(p) && kitOf(p).attachments) || MARKSMAN.attachments;
const subList = p => (marksman(p) && kitOf(p).subs) || SUBS;

export function snap8(x, y) {
  if (Math.hypot(x, y) < 0.35) return null;
  const a = Math.round(Math.atan2(y, x) / (Math.PI / 4)) * (Math.PI / 4);
  return [Math.cos(a), Math.sin(a)];
}

export function createPlayer(slot, device, charId, x, y) {
  const c = CHARS[charId], kit = c.kit;
  return {
    kind: 'player', slot, device, char: charId, arch: c.arch,
    x, y, vx: 0, vy: 0, w: c.width, h: c.height, prevX: x, prevY: y,
    facing: 1, onGround: false, wallDir: 0, coyote: 0, jumpsUsed: 0, airDashes: 1,
    state: 'normal', st: 0, crouch: false, dropT: 0, controlLock: 0, wallSliding: false,
    dash: null, dashCd: 0, postDash: 99, dashCarry: false, fastFall: false,
    launchedT: 0, zipArriveT: 0, boostT: 0, iframe: false,
    move: null, moveId: null, queued: null, hitConfirm: false, instance: 0,
    chargeT: 0, fireCd: 0, meleeHeldT: 0, meleeCharged: false,
    hp: c.hp, maxHp: c.hp, strain: 0, strainT: 0,
    mercy: 0, hitstop: 0, stun: 0,
    parryT: 0, parryResult: null, riposteT: 0,
    bulwarkCd: 0, lashCharges: ECHO.lashCharges, lashRecharge: 0, lash: null, zip: null,
    resolve: 0, calmT: 0, lastResolveHitT: 0, cells: ECHO.cellsMax, tracerCd: 0,
    snares: HUNTER.snareCharges, snareRecharge: 0, leash: null,
    scarfMode: 'tether', modeCd: 0, veiled: false, veilCharge: 0, veilBreakT: 0, ambushT: 0, targetedBy: 0,
    attachment: (kit.attachments || ['lance'])[0], focus: 0, focusT: 0, burstCd: 0, burstT: 0, shootT: 0, carveT: 0,
    fuel: kit.boost ? kit.boost.fuel : 0, thrusting: false, rockets: 0, rocketT: 0, rocketPow: 0,
    aegis: null, aegisCd: 0, overcharge: 0, overT: 0, beam: null, slash: null, pound: null,
    sub: (kit.subs || ['scatter'])[0], subSwCd: 0, subArmed: false, dodge: null, dodgeCd: 0, airDodge: true, airRise: true, stick: [0, 0],
    sigCd: 0, berserkT: 0, drillT: 0, drillCd: 0, airDrill: true, hurtT: 0,
    ult: 0, ultRun: null, chordP: 99, chordF: 99,
    aimX: 1, aimY: 0, aimFree: false,
    wallT: 0, wallStick: 0, wallCoyote: 0, lastWallDir: 0, dashChargeT: 0, rifleT: 0, rifleCd: 0,
    lockT: null, lockHeld: 0, lockHoldDone: false, lockLost: 0, lockSuspend: false,
    buf: { jump: 99, dash: 99, melee: 99, fire: 99, parry: 99, sig: 99 },
    downedT: 0, revive: 0, respawnT: 0, secondWind: true,
    lastSafeX: x, lastSafeY: y, offscreenT: 0, vbTierShown: 0,
  };
}

export function setCharacter(p, charId) {
  const c = CHARS[charId], kit = c.kit;
  p.char = charId; p.arch = c.arch; p.w = c.width; p.h = c.height; p.maxHp = c.hp;
  p.hp = Math.min(p.hp, p.maxHp); p.chargeT = 0; p.resolve = 0; p.strain = 0;
  p.cells = ECHO.cellsMax; p.lashCharges = ECHO.lashCharges; p.state = 'normal'; p.st = 0;
  p.veiled = false; p.veilCharge = 0; p.veilBreakT = 0; p.ambushT = 0; p.targetedBy = 0;
  p.focus = 0; p.focusT = 0; p.burstCd = 0; p.burstT = 0; p.shootT = 0;
  p.fuel = kit.boost ? kit.boost.fuel : 0; p.thrusting = false; p.rockets = 0; p.rocketT = 0;
  p.rifleT = 0; p.rifleCd = 0; p.dashChargeT = 0; p.overcharge = 0; p.overT = 0; p.beam = null; p.aegis = null;
  p.subArmed = false; p.dodge = null; p.pound = null;
  // A new hero brings their own loadout; the Signature cooldown carries over (no swapping to dodge it)
  if (kit.attachments && !kit.attachments.includes(p.attachment)) p.attachment = kit.attachments[0];
  if (kit.subs && !kit.subs.includes(p.sub)) p.sub = kit.subs[0];
  if (!kit.scarf) p.scarfMode = 'tether';
  p.berserkT = 0; p.drillT = 0; p.drillCd = 0; p.airDrill = true; p.hurtT = 0;
}

export function chest(p) { return { x: p.x, y: p.y + p.h * 0.62 }; }
// Where a hero's shots leave from: the chest, or for Cyclops the visor
export function muzzle(p) { return kitOf(p).eyes ? { x: p.x + p.facing * 0.1, y: p.y + p.h * 0.9 } : chest(p); }

// Which Velocity Break tier is available right now (0 = none)?
export function vbTier(p) {
  if (p.state === 'pound') return 0;   // the pound's drop is fast, but it is not a Velocity Break
  if (p.boostT > 0 || p.launchedT > 0) return 3;
  if (p.dash && p.dash.level >= 2 && (p.state === 'dash' || p.postDash <= 6)) return p.dash.level;
  if (p.zipArriveT > 0) return 2;
  if (p.state === 'dash' || p.state === 'slide' || p.postDash <= 6) return 1;
  if (p.fastFall && p.vy < -18) return 2;
  if (p.dashCarry && !p.onGround && Math.hypot(p.vx, p.vy) > HIGH_VEL) return 2;
  return 0;
}

function setState(p, s) { p.state = s; p.st = 0; }

function updateAim(p, cmd, world) {
  let d;
  if (cmd.aimFree) { d = [cmd.ax, cmd.ay]; p.aimFree = true; }
  else {
    p.aimFree = false;
    d = snap8(cmd.mx, cmd.my);
    if (d && p.onGround && d[1] < 0) d = [p.facing, 0];      // down on the ground means crouch
    if (!d) d = [p.facing, 0];
    if (SETTINGS.aimAssist && p.device !== 'kbm') {
      const c = chest(p);
      const e = world.nearestEnemyInCone(c.x, c.y, d[0], d[1], 14, Math.PI / 8);
      if (e) { const dx = e.x - c.x, dy = e.y + e.h / 2 - c.y, m = Math.hypot(dx, dy); d = [dx / m, dy / m]; }
    }
  }
  // Locked on: aim straight at the target. With automatic lock-on, free aim (right stick, mouse) still
  // aims where it points, and holding the stick up or down aims that way.
  if (p.lockT && (SETTINGS.lockMode === 'manual' || (!cmd.aimFree && Math.abs(cmd.my) < 0.55))) {
    const c = chest(p), t = p.lockT, dx = t.x - c.x, dy = t.y + t.h * 0.55 - c.y, m = Math.hypot(dx, dy) || 1;
    d = [dx / m, dy / m];
  } else if (p.wallSliding && p.wallDir && d[0] * p.wallDir > 0) d = [-d[0], d[1]];   // on a wall: shoot out from it
  p.aimX = d[0]; p.aimY = d[1];
}

export function updatePlayer(p, cmd, world) {
  p.prevX = p.x; p.prevY = p.y;
  for (const b in p.buf) p.buf[b] = cmd.pressed[b] ? 0 : Math.min(99, p.buf[b] + 1);
  trackChord(p, cmd); p.stick = [cmd.mx, cmd.my];
  if (p.state === 'dead') return;
  // Mode switches (the scarf or sash, the loaded attachment and secondary power) are instant, so a press
  // during hitstop is never lost. Wolverine has no modes.
  if (cmd.pressed.mode && p.modeCd === 0 && p.state !== 'downed' && p.state !== 'ult') {
    if (p.arch === 'echo') { if (kitOf(p).scarf) cycleScarf(p, world); }
    else if (marksman(p)) cycleAttachment(p, world);
  }
  if (cmd.pressed.sub && p.subSwCd === 0 && marksman(p) && p.state !== 'downed' && p.state !== 'ult') cycleSub(p, world);
  if (p.hitstop > 0) { p.hitstop--; return; }
  // Both triggers together with a full bar: the ultimate (the world takes over from here)
  if (p.ult >= ULT.max && chordReady(p, cmd) && !world.ultCast && p.state !== 'downed' && p.state !== 'ult') { world.startUlt(p); return; }

  p.st++;
  for (const k of ['mercy', 'dashCd', 'fireCd', 'bulwarkCd', 'tracerCd', 'controlLock', 'launchedT',
    'zipArriveT', 'boostT', 'dropT', 'riposteT', 'coyote', 'modeCd', 'ambushT', 'burstCd', 'shootT', 'carveT', 'rocketT',
    'rifleCd', 'wallCoyote', 'aegisCd', 'subSwCd', 'dodgeCd', 'sigCd', 'drillCd', 'hurtT']) if (p[k] > 0) p[k]--;
  // Aegis time, and Overcharge draining once it has not grown for a while
  if (p.aegis && --p.aegis.t <= 0) world.endAegis(p, 'expire');
  if (p.overcharge > 0) { if (p.overT > 0) p.overT--; else p.overcharge = Math.max(0, p.overcharge - AEGIS.over.drain); }
  // Berserker Rage runs out; its cooldown starts then
  if (p.berserkT > 0 && --p.berserkT === 0) { p.sigCd = BERSERK.cd; world.emit('berserkEnd', { p }); }
  p.postDash = Math.min(99, p.postDash + 1);
  if (p.arch === 'echo') tickEcho(p, world, cmd);
  else tickFocus(p, world);

  if (p.state === 'downed') { updateDowned(p, cmd, world); return; }
  updateLock(p, cmd, world);
  updateAim(p, cmd, world);
  p.meleeHeldT = cmd.held.melee ? p.meleeHeldT + 1 : 0;

  const wasSliding = p.wallSliding;
  p.wallPrev = wasSliding; p.wallSliding = false;   // set again by wallCling in the states that allow a wall slide
  switch (p.state) {
    case 'normal': stateNormal(p, cmd, world); break;
    case 'dashCharge': stateDashCharge(p, cmd, world); break;
    case 'beam': stateBeam(p, cmd, world); break;
    case 'dashslash': stateDashSlash(p, cmd, world); break;
    case 'dash': stateDash(p, cmd, world); break;
    case 'slide': stateSlide(p, cmd, world); break;
    case 'vb': stateVB(p, cmd, world); break;
    case 'attack': stateAttack(p, cmd, world); break;
    case 'parry': stateParry(p, cmd, world); break;
    case 'hitstun': stateHitstun(p, cmd, world); break;
    case 'bulwark': stateBulwark(p, cmd, world); break;
    case 'lash': stateLash(p, cmd, world); break;
    case 'zip': stateZip(p, cmd, world); break;
    case 'dive': stateDive(p, cmd, world); break;
    case 'pound': statePound(p, cmd, world); break;
    case 'dodge': stateDodge(p, cmd, world); break;
    case 'ult': world.ultStep(p, cmd); break;
  }
  if (p.state !== 'ult') handleFire(p, cmd, world);
  // Boosters only run in the normal state; anything else (dash, hitstun, a burst...) cuts them
  if (p.thrusting && (p.state !== 'normal' || p.onGround)) { p.thrusting = false; world.emit('thrustOff', { p }); }
  if (p.wallSliding !== wasSliding) world.emit('wallSlide', { p, on: p.wallSliding, dir: p.wallSliding ? p.wallDir : p.lastWallDir });

  const wasGround = p.onGround, fallV = p.vy;
  if (!['dash', 'zip'].includes(p.state)) p.h = (p.crouch || p.state === 'slide' || p.state === 'dashCharge') ? CHARS[p.char].crouchH : CHARS[p.char].height;
  moveBody(p, DT);
  if (p.onGround) {
    p.coyote = COYOTE; p.jumpsUsed = 0; p.airDashes = 1; p.fastFall = false; p.dashCarry = false; p.airDodge = true; p.airRise = true;
    p.rockets = 0; p.rocketT = 0; p.wallCoyote = 0; p.airDrill = true;
    const B = boostOf(p); if (B && p.fuel < B.fuel) p.fuel = Math.min(B.fuel, p.fuel + B.refill);
    if (!wasGround && p.st > 1) world.emit('land', { p, vy: fallV });
    p.lastSafeX = p.x; p.lastSafeY = p.y;
  }
  if (p.wallDir && !p.onGround) {
    // Touching a wall gives back the air dash and the double jump, and remembers the wall for a late wall jump
    p.airDashes = 1; p.jumpsUsed = 0; p.airDodge = true; p.airRise = true; p.airDrill = true; p.lastWallDir = p.wallDir; p.wallCoyote = WALL.coyote;
  }
  p.iframe = (SETTINGS.dashIframes && p.state === 'dash' && p.st <= 8) || (p.state === 'dash' && !!p.dash && p.st <= p.dash.iframes) ||
    (p.state === 'dodge' && !!p.dodge && p.dodge.t <= DODGE.iframes) || p.state === 'ult';
}

// ---- Shared action starters ------------------------------------------------------------

function tryJump(p, cmd, world) {
  if (p.buf.jump > JUMP_BUFFER) return false;
  if (p.onGround && p.crouch && cmd.my < -0.6 && world.onOneWay(p)) {
    p.dropT = 12; p.y -= 0.05; p.buf.jump = 99; p.onGround = false; return true;
  }
  if (p.onGround || p.coyote > 0) {
    const c = CHARS[p.char];
    p.vy = c.jumpV; p.coyote = 0; p.onGround = false; p.crouch = false;
    if (p.postDash <= 8) p.dashCarry = true;
    p.buf.jump = 99; setState(p, 'normal'); world.emit('jump', { p });
    return true;
  }
  const wd = p.wallDir !== 0 ? p.wallDir : p.wallCoyote > 0 ? p.lastWallDir : 0;
  if (wd !== 0) {
    // Holding away from the wall leaps off it; toward it or neutral is a climb kick that rises high and
    // lets you come straight back to the same wall
    const w = CHARS[p.char].wall, away = cmd.mx * wd < -0.3;
    p.vx = -wd * (away ? w.jumpVx : WALL.climb.vx); p.vy = w.jumpVy * (away ? WALL.leapVy : 1);
    p.controlLock = away ? w.lock : WALL.climb.lock; p.facing = -wd;
    p.wallCoyote = 0; p.wallStick = 0; p.wallSliding = false;
    p.buf.jump = 99; p.fastFall = false; setState(p, 'normal'); world.emit('walljump', { p, climb: !away, dir: -wd });
    return true;
  }
  if (p.jumpsUsed < 1) {
    // While a rocket launch still climbs faster than a double jump would, the press waits in the buffer
    if (p.rocketT > 0 && p.vy > CHARS[p.char].dblV) return false;
    p.vy = CHARS[p.char].dblV; p.jumpsUsed = 1; p.fastFall = false;
    p.buf.jump = 99; setState(p, 'normal'); world.emit('djump', { p });
    return true;
  }
  return false;
}

function tryDash(p, cmd, world) {
  if (p.buf.dash > ACTION_BUFFER || p.dashCd > 0) return false;
  const c = CHARS[p.char];
  if (p.onGround && cmd.my < -0.5) {
    p.buf.dash = 99; p.dashCd = c.dash.cooldown;
    const dir = Math.abs(cmd.mx) > 0.3 ? sign(cmd.mx) : p.facing;
    p.facing = dir; p.vx = dir * c.slide.speed; p.crouch = true;
    setState(p, 'slide'); world.emit('slide', { p });
    return true;
  }
  // Charged dash: on the ground with no direction held, holding dash plants the feet and charges
  if (SETTINGS.dashCharge && p.onGround && p.state === 'normal' && cmd.held.dash && Math.abs(cmd.mx) < 0.3 && Math.abs(cmd.my) < 0.5) {
    p.buf.dash = 99; p.dashChargeT = 0; p.crouch = false;
    setState(p, 'dashCharge'); world.emit('dashChargeStart', { p });
    return true;
  }
  if (!p.onGround && p.airDashes <= 0) return false;
  let d = snap8(cmd.mx, cmd.my) || [p.wallSliding ? -p.wallDir : p.facing, 0];
  if (p.onGround && d[1] < 0) d = [sign(d[0]) || p.facing, 0];
  if (p.wallDir && d[0] * p.wallDir > 0) d = [-d[0], d[1]];   // from a wall, a dash goes out from it
  if (!p.onGround) p.airDashes--;
  startDash(p, d, world, 0);
  return true;
}

// Level 0 is an ordinary dash; 1-3 come from a charged release (DASH_CHARGE)
function startDash(p, d, world, level) {
  const c = CHARS[p.char], D = DASH_CHARGE, L = level - 1;
  p.buf.dash = 99; p.dashCd = c.dash.cooldown;
  if (d[0] !== 0) p.facing = sign(d[0]);
  p.dash = { dx: d[0], dy: d[1], t: Math.round(c.dash.ticks * (level ? D.ticks[L] : 1)), grounded: p.onGround, level,
    speed: c.dash.speed * (level ? D.speed[L] : 1), keep: level ? D.exitKeep[L] : c.dash.exitKeep,
    iframes: level ? D.iframes[L] : 0, instance: level === 3 ? world.newInstance() : 0 };
  p.fastFall = false; p.crouch = false; p.dashChargeT = 0;
  setState(p, 'dash'); world.emit('dash', { p, level, dx: d[0], dy: d[1] });
}

// Planted and charging: skid to a stop, aim with the stick, let go to launch. Jump or parry cancel it;
// a tap (released before DASH_CHARGE.tap) is an ordinary dash toward where you face.
function stateDashCharge(p, cmd, world) {
  const D = DASH_CHARGE, C = D.charge;
  p.dashChargeT++;
  // For the first few ticks nothing changes, so a quick tap reads as an ordinary dash; then he plants
  if (p.dashChargeT >= D.tap) p.vx = approach(p.vx, 0, 70 * DT);
  applyGravity(p, cmd);
  const lv = C.indexOf(p.dashChargeT); if (lv >= 0) world.emit('dashLevel', { p, level: lv + 1 });
  if (Math.abs(cmd.mx) > 0.3) p.facing = sign(cmd.mx);
  if (tryParry(p, world)) { p.dashChargeT = 0; return; }
  if (p.buf.jump <= JUMP_BUFFER || !p.onGround) {
    p.dashChargeT = 0; setState(p, 'normal'); world.emit('dashChargeEnd', { p });
    if (p.onGround) tryJump(p, cmd, world);
    return;
  }
  if (cmd.held.dash) return;
  const t = p.dashChargeT, level = t >= C[2] ? 3 : t >= C[1] ? 2 : t >= C[0] ? 1 : 0;
  let d = snap8(cmd.mx, cmd.my) || [p.facing, 0];
  if (d[1] < 0) d = [sign(d[0]) || p.facing, 0];   // no digging into the floor
  startDash(p, d, world, level);
}

function tryParry(p, world) {
  if (p.buf.parry > PARRY_BUFFER) return false;
  if (marksman(p)) return tryDodge(p, world);   // Nova's Marksman kit dodges instead (Echo keeps his parry and deflect)
  p.buf.parry = 99; p.parryT = 0; p.parryResult = null;
  setState(p, 'parry'); world.emit('parryStart', { p });
  return true;
}

function trySignature(p, cmd, world) {
  if (p.buf.sig > ACTION_BUFFER) return false;
  const sig = kitOf(p).sig;
  if (p.arch === 'nova') {
    if (marksman(p)) {
      // Cyclops's Visor Overdrive and Storm's Squall: instant, on a cooldown, he or she keeps moving and shooting
      if (sig === 'visor' || sig === 'squall') {
        if (p.sigCd > 0) return false;
        p.buf.sig = 99;
        if (sig === 'visor') world.visorOverdrive(p); else world.squall(p);
        return false;
      }
      // The shield dome (Nova's hard-light Aegis, Jean's TK Shield). Instant: no state change, she keeps
      // moving and shooting. Pressing again while it is up detonates it outward.
      if (p.aegis) { p.buf.sig = 99; world.detonateAegis(p); return false; }
      if (p.aegisCd > 0) return false;
      p.buf.sig = 99; world.raiseAegis(p);
      return false;
    }
    if (p.bulwarkCd > 0) return false;
    p.buf.sig = 99; p.bulwarkCd = NOVA.bulwarkCd;
    setState(p, 'bulwark');
    return true;
  }
  // Wolverine's Berserker Rage: instant, so the swing under way carries on
  if (sig === 'berserk') {
    if (p.sigCd > 0 || p.berserkT > 0) return false;
    p.buf.sig = 99; world.berserk(p);
    return false;
  }
  // Every scarf Signature spends a scarf charge; Vanish is not spent while already hidden
  if (p.lashCharges <= 0 || (p.scarfMode === 'veil' && p.veiled)) return false;
  p.buf.sig = 99; p.lashCharges--;
  if (p.lashRecharge <= 0) p.lashRecharge = ECHO.lashRecharge;
  // Vanish and Challenge are instant: no state change, so the current action carries on
  if (p.scarfMode === 'veil') {
    p.veiled = true; p.veilCharge = SCARF.veilFade; p.veilBreakT = 0;
    world.shakeOffTrackers(p); world.emit('vanish', { p });
    return false;
  }
  if (p.scarfMode === 'flare') { world.challenge(p); return false; }
  const c = chest(p);
  const target = world.findLashTarget(p, c.x, c.y, p.aimX, p.aimY, ECHO.lashRange);
  p.lash = { tx: c.x + p.aimX * ECHO.lashRange, ty: c.y + p.aimY * ECHO.lashRange, target, len: 0, hit: false };
  if (target) { p.lash.tx = target.x; p.lash.ty = target.y + target.h * 0.55; }
  if (Math.abs(p.aimX) > 0.1) p.facing = sign(p.aimX);
  setState(p, 'lash'); world.emit('lash', { p });
  return true;
}

function tryMelee(p, cmd, world) {
  if (p.buf.melee > ACTION_BUFFER) return false;
  const hunter = p.arch === 'echo' && SETTINGS.echoKit === 'hunter';
  // Echo on a wall: Wall Slash (before anything else, so a slide never turns it into something else)
  if (hunter && p.wallSliding && !p.onGround) { p.buf.melee = 99; startMove(p, 'echo_wall', world); return true; }
  // In the air, the secondary aimed down: the ground pound. Holding down to fast-fall must not turn it into
  // a Velocity Break; a dash, slide, launch or zip still does.
  const down = cmd.my < -0.55 || (p.aimFree && p.aimY < POUND.aimDown);
  const moving = p.state === 'dash' || p.state === 'slide' || p.postDash <= 6 || p.boostT > 0 || p.launchedT > 0 || p.zipArriveT > 0;
  if (!p.onGround && down && !moving && (p.arch === 'nova' || hunter)) { p.buf.melee = 99; startPound(p, world); return true; }
  const tier = vbTier(p);
  if (tier > 0) { velocityBreak(p, tier, world); return true; }
  // Nova's rising attack, the Solar Uppercut (up + melee; once per airtime in the air)
  if (p.arch === 'nova' && cmd.my > 0.55 && (p.onGround || p.airRise)) {
    p.buf.melee = 99; if (!p.onGround) p.airRise = false;
    startMove(p, 'nova_rise', world); return true;
  }
  if (marksman(p)) {
    // Marksman kit: close to an enemy, his bracer combo; otherwise his secondary weapon (it cancels whatever
    // it interrupts)
    if (meleeTarget(p, world)) { p.buf.melee = 99; startMove(p, p.onGround ? 'nova_k1' : 'nova_kair', world); return true; }
    return pressSub(p, world);
  }
  p.buf.melee = 99;
  if (p.arch === 'echo' && p.riposteT > 0) { startMove(p, 'echo_riposte', world); p.riposteT = 0; return true; }
  if (p.arch === 'echo' && !p.onGround && cmd.my < -0.55) {
    // Pursuit kit: the dive (fast fall into a Velocity Break on landing)
    breakVeil(p, world, 'attack');
    p.vy = -FAST_FALL; p.vx = p.facing * 5;
    p.hitConfirm = false; p.instance = world.newInstance();
    setState(p, 'dive'); world.emit('dive', { p });
    return true;
  }
  let id;
  if (p.arch === 'nova') id = p.onGround ? 'nova_jab1' : 'nova_air';
  else if (!p.onGround) id = hunter ? (cmd.my > 0.55 ? 'echo_spin' : 'echo_ab1') : 'echo_air1';
  else if (cmd.my > 0.55) id = 'echo_rise';   // Echo's rising attack in either kit
  else id = hunter ? 'echo_b1' : 'echo_g1';
  startMove(p, id, world);
  return true;
}

// Marksman kit: an enemy close enough in front for the bracer combo (or the lock-on target in reach)
function meleeTarget(p, world) {
  const R = MARKSMAN.melee, face = p.aimFree && Math.abs(p.aimX) > 0.2 ? sign(p.aimX) : p.facing;
  for (const e of world.enemies) {
    if (e.dead) continue;
    const ahead = (e.x - p.x) * face, gap = ahead - e.w / 2 - p.w / 2;
    const dy = Math.abs(e.y + e.h / 2 - (p.y + p.h * 0.5));
    if (ahead > -0.2 && gap < R.reach - 0.8 && dy < R.up) return e;
    if (e === p.lockT && lockChosen(p) && Math.abs(e.x - p.x) < LOCK.magnet && dy < R.up) return e;
  }
  return null;
}

// Echo's Dash Slash (Hunter kit's Velocity Break): a lunging cut along the dash that carries him through.
// Wolverine's Drill Claw starts one along an aim of its own (`dir`), at any angle.
function startDashSlash(p, tier, world, dir = null) {
  breakVeil(p, world, 'attack');
  p.buf.melee = 99;
  const sp = Math.hypot(p.vx, p.vy);
  let dx = sp > 0.5 ? p.vx / sp : p.facing, dy = sp > 0.5 ? p.vy / sp : 0;
  if (p.state === 'dash' && p.dash) { dx = p.dash.dx; dy = p.dash.dy; }
  if (dir) { dx = dir.dx; dy = dir.dy; if (Math.abs(dy) < 0.2) { dy = 0; dx = sign(dx) || p.facing; } }
  else if (Math.abs(dy) < 0.45) { dy = 0; dx = sign(dx) || p.facing; }
  const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
  if (Math.abs(dx) > 0.2) p.facing = sign(dx);
  p.slash = { tier, dx, dy, drill: !!(dir && dir.drill) };
  p.hitConfirm = false; p.instance = world.newInstance();
  p.boostT = 0; p.launchedT = 0; p.zipArriveT = 0; p.postDash = 99; p.fastFall = false;
  if (p.slash.drill && dy > 0.2) p.onGround = false;
  setState(p, 'dashslash'); world.emit('dashSlash', { p, tier, dx, dy, drill: p.slash.drill });
}

function stateDashSlash(p, cmd, world) {
  const D = DASH_SLASH, s = p.slash, t = p.st, T = s.tier - 1;
  if (t <= D.ticks) { const v = D.speed[T] * Math.pow(D.keep, t); p.vx = s.dx * v; p.vy = s.dy * v; }
  else if (!p.onGround) { p.vx = approach(p.vx, cmd.mx * CHARS[p.char].run * 0.5, 30 * DT); applyGravity(p, cmd); }
  else { p.vx *= 0.8; p.vy = -0.5; }
  if (t >= 2 && t <= D.ticks - 3) {
    // The Drill Claw's box leads along its own direction (up, down or diagonal); the Dash Slash's sweeps ahead
    const B = s.drill ? DRILL.box : D.box;
    const cx = s.drill ? p.x + s.dx * D.box.fx : p.x + p.facing * D.box.fx, cy = s.drill ? p.y + 0.95 + s.dy * D.box.fx : p.y + 0.95 + s.dy * 0.5;
    world.spawnHitbox({ owner: p, team: 'p', x0: cx - B.w / 2, x1: cx + B.w / 2, y0: cy - B.h / 2, y1: cy + B.h / 2,
      dmg: D.dmg[T], poise: D.poise[T], kb: [(sign(s.dx) || p.facing) * 7, s.drill ? 3 + Math.max(0, s.dy) * 6 : 3], armorBreak: D.armorBreak[T],
      instance: p.instance, vbTier: s.tier, dashSlash: true, drill: s.drill });
  }
  if (p.hitConfirm && t >= 4) {
    if (SETTINGS.vbRefund && !p.onGround) p.airDashes = 1;
    if (cancelInto(p, cmd, world)) return;
  }
  if (t >= D.ticks + (p.hitConfirm ? D.hitRecover : D.recover)) setState(p, 'normal');
}

// Berserker Rage runs every swing faster: the same hits on quicker windups and recoveries
const fastMoves = new Map();
export function moveFor(p, id) {
  if (!(p.berserkT > 0)) return MOVES[id];
  let m = fastMoves.get(id);
  if (!m) {
    const b = MOVES[id];
    m = { ...b, su: Math.max(1, Math.round(b.su * BERSERK.speed)), rc: Math.max(2, Math.round(b.rc * BERSERK.speed)), fast: true };
    fastMoves.set(id, m);
  }
  return m;
}

function startMove(p, id, world) {
  breakVeil(p, world, 'attack');
  p.moveId = id; p.move = moveFor(p, id); p.queued = null; p.hitConfirm = false; p.instance = world.newInstance();
  p.crouch = false; p.riseAir = !p.onGround;
  if (Math.abs(p.aimX) > 0.2 && p.aimFree) p.facing = sign(p.aimX);
  // Lock-on: turn to a target that is close, and step in toward it during the swing (lungeTo)
  p.lungeTo = null;
  const t = p.lockT;
  if (t && !t.dead && Math.abs(t.x - p.x) < LOCK.magnet && Math.abs(t.y - p.y) < 2.5) {
    p.facing = sign(t.x - p.x) || p.facing; p.lungeTo = t;
    if (p.onGround && Math.abs(t.x - p.x) - t.w / 2 - p.w / 2 > 0.3) p.vx = p.facing * LOCK.lunge;   // the step starts at once
  }
  setState(p, 'attack'); world.emit('swing', { p, id });
}

// A Velocity Break: Echo's Hunter kit turns it into the Dash Slash
function velocityBreak(p, tier, world) {
  if (p.arch === 'echo' && SETTINGS.echoKit === 'hunter') startDashSlash(p, Math.max(1, tier), world); else startVB(p, tier, world);
}

function startVB(p, tier, world) {
  breakVeil(p, world, 'attack');
  p.buf.melee = 99;
  const sp = Math.hypot(p.vx, p.vy);
  let dx = sp > 0.5 ? p.vx / sp : p.facing, dy = sp > 0.5 ? p.vy / sp : 0;
  if (p.state === 'dash' && p.dash) { dx = p.dash.dx; dy = p.dash.dy; }
  if (Math.abs(dx) > 0.2) p.facing = sign(dx);
  p.vbInfo = { tier, dx, dy, keep: SETTINGS.vbStop === 'keep30' ? 0.3 : 0, v0x: p.vx, v0y: p.vy };
  p.hitConfirm = false; p.instance = world.newInstance();
  p.boostT = 0; p.launchedT = 0; p.zipArriveT = 0; p.postDash = 99;
  setState(p, 'vb'); world.emit('vbStart', { p, tier });
}

// Anything that may interrupt a state early (on hit-confirm or late whiff recovery).
function cancelInto(p, cmd, world, { jump = true, dash = true, parry = true, sig = true, melee = true } = {}) {
  if (parry && tryParry(p, world)) return true;
  if (dash && tryDash(p, cmd, world)) return true;
  if (jump && tryJump(p, cmd, world)) return true;
  if (sig && trySignature(p, cmd, world)) return true;
  if (melee && tryMelee(p, cmd, world)) return true;
  return false;
}

// ---- States ----------------------------------------------------------------------------

function horizontalControl(p, cmd, world, scale = 1) {
  const c = CHARS[p.char], skates = marksman(p) && !!kitOf(p).skate, B = boostOf(p);
  let tgt = cmd.mx * (skates ? MARKSMAN.skate.top : c.run) * (p.crouch ? c.crouchSpeed : 1) * (p.thrusting && B ? B.air : 1) * scale;
  const rifle = p.rifleT >= HUNTER.rifle.raise;   // Echo's staff-rifle up: slower on foot
  if (rifle && p.onGround) tgt *= HUNTER.rifle.slow;
  const firing = p.chargeT > 0 || p.fireCd > 0 || p.shootT > 0 || rifle;
  const facingAim = (p.aimFree || firing) && Math.abs(p.aimX) > 0.2;
  if (facingAim) {
    if (cmd.mx !== 0 && sign(cmd.mx) !== sign(p.aimX)) tgt *= skates ? MARKSMAN.skate.backpedal : c.backpedal;
    p.facing = sign(p.aimX);
  } else if (p.lockT && Math.abs(cmd.mx) <= 0.1 && Math.abs(p.aimX) > 0.05) {
    p.facing = sign(p.aimX);   // standing still while locked on: face the target
  } else if (Math.abs(cmd.mx) > 0.1 && p.controlLock === 0) {
    p.facing = sign(cmd.mx);
  }
  if (p.controlLock > 0) return;
  if (p.onGround && skates) { skateGround(p, tgt, world); return; }
  if (p.onGround) {
    const accel = (tgt !== 0 && sign(tgt) === sign(p.vx)) || Math.abs(p.vx) < 0.1 ? c.accelG : c.decelG;
    p.vx = approach(p.vx, tgt, accel * DT);
  } else {
    // Keep dash-carried momentum in the air unless the player steers against it
    if (p.dashCarry && Math.abs(p.vx) > Math.abs(tgt) && sign(tgt) !== -sign(p.vx)) return;
    p.vx = approach(p.vx, tgt, c.accelA * DT);
  }
}

// Skate-blade glide: a little slower to reach top speed, keeps momentum when the stick is let go,
// and carves to a stop when reversed. Crouching at speed tucks into a low glide.
function skateGround(p, tgt, world) {
  const S = MARKSMAN.skate, speed = Math.abs(p.vx);
  let a;
  if (p.crouch && speed > S.tuckMin) { tgt = 0; a = S.tuck; }
  else if (tgt === 0) a = S.coast;
  else if (sign(tgt) !== sign(p.vx) && speed > 0.5) {
    a = S.carve;
    if (speed > 5 && p.carveT === 0) { p.carveT = 10; world.emit('carve', { p }); }
  } else a = speed < Math.abs(tgt) ? S.accel : S.coast;
  p.vx = approach(p.vx, tgt, a * DT);
}

function applyGravity(p, cmd, mult = 1) {
  if (p.onGround && p.vy <= 0) { p.vy = -0.5; return; }
  let g = GRAVITY * mult;
  if (p.vy < 0) g *= FALL_MULT;
  else if (!cmd.held.jump && !p.dashCarry) g *= RISE_CUT_MULT;
  p.vy -= g * DT;
  const cap = p.fastFall ? FAST_FALL : MAX_FALL;
  if (p.vy < -cap) p.vy = -cap;
}

function stateNormal(p, cmd, world) {
  const c = CHARS[p.char];
  if (p.onGround && cmd.my < -0.55) p.crouch = true;
  else if (p.crouch && hasHeadroom(p.x, p.y, p.w, c.height)) p.crouch = false;

  horizontalControl(p, cmd, world);
  if (!p.onGround && cmd.my < -0.7 && p.vy < 3 && p.wallDir === 0) p.fastFall = true;
  if (!thrust(p, cmd, world)) applyGravity(p, cmd);
  wallCling(p, cmd, true);
  cancelInto(p, cmd, world);
  if (p.state !== 'normal') { if (!cmd.held.melee) p.meleeCharged = false; return; }
  if (marksman(p)) return;   // the Marksman kit charges its secondary blaster instead (fireMarksman)
  // Charged melee: release after holding
  if (p.meleeCharged && !cmd.held.melee) {
    p.meleeCharged = false;
    startMove(p, p.arch === 'nova' ? 'nova_brace' : 'echo_charged', world);
  }
  if (p.meleeHeldT >= 30 && p.state === 'normal' && !p.meleeCharged) { p.meleeCharged = true; world.emit('meleeCharged', { p }); }
}

// Wall slide (every character, in the normal, attack and parry states). Holding toward a wall in the air
// while not rising starts it; it grips for a moment, then eases up to the slide speed, braking a fall on
// the way in. Letting go of the stick keeps the grip for WALL.stick ticks (so press away, then jump, is
// still a wall jump). The character faces out from the wall; `turn` is off during an attack so a swing
// already under way keeps its direction.
function wallCling(p, cmd, turn) {
  const c = CHARS[p.char], W = WALL, was = !!p.wallPrev;
  let on = false;
  if (!p.onGround && p.wallDir !== 0 && p.vy <= 0.5) {
    const toward = cmd.mx * p.wallDir > 0.3;
    if (toward) p.wallStick = W.stick;
    else if (was && p.wallStick > 0) p.wallStick--;
    on = toward || (was && p.wallStick > 0);
  }
  if (!on) { p.wallT = 0; return false; }
  p.wallT = was ? p.wallT + 1 : 0;
  const ramp = Math.max(0, Math.min(1, (p.wallT - W.grip) / W.ease));
  const target = cmd.my < -0.6 ? c.wall.slide * W.fast : W.gripSpeed + (c.wall.slide - W.gripSpeed) * ramp;
  if (p.vy < -target) p.vy = Math.min(-target, p.vy + (W.brake + GRAVITY * FALL_MULT) * DT);   // brake a fall into the slide
  else p.vy = Math.max(p.vy, -target);
  if (cmd.mx * p.wallDir <= 0.3) p.vx = p.wallDir * 0.5;              // grip: stay against the wall
  p.wallSliding = true; p.fastFall = false;
  if (turn) p.facing = -p.wallDir;
  return true;
}

// Marksman kit: light boosters. Once the double jump is spent, pressing jump again fires them and
// holding keeps them on: he hovers and climbs gently on a small tank of fuel that refills on the
// ground. Ordinary jumps are untouched. Returns true while thrusting.
function thrust(p, cmd, world) {
  const B = boostOf(p);
  if (!marksman(p) || !B) return false;   // Cyclops has no hover; Jean levitates, Storm flies
  const start = cmd.pressed.jump && p.jumpsUsed >= 1 && p.wallDir === 0 && p.fuel >= B.minStart;
  const on = !p.onGround && !p.wallSliding && p.fuel > 0 && cmd.held.jump && (p.thrusting || start);
  if (on !== p.thrusting) { p.thrusting = on; world.emit(on ? 'thrustOn' : 'thrustOff', { p }); }
  if (!on) return false;
  p.fuel = Math.max(0, p.fuel - 1); p.fastFall = false;
  // They only add lift below their climb speed, so they never cut a rising jump short
  if (p.vy > B.rise) p.vy -= GRAVITY * DT; else p.vy = approach(p.vy, B.rise, B.thrust * DT);
  return true;
}

function stateDash(p, cmd, world) {
  const c = CHARS[p.char], d = p.dash;
  if (d.pursuit) {
    const t = d.pursuit;
    if (t.dead) d.pursuit = null;
    else {
      const tx = t.x - sign(t.x - p.x) * (t.w / 2 + p.w / 2 + 0.2), ty = t.y + t.h * 0.3;
      const dx = tx - p.x, dy = ty - p.y, m = Math.hypot(dx, dy);
      if (m < 0.9) { p.zipArriveT = 12; d.t = 0; } else { d.dx = dx / m; d.dy = dy / m; if (Math.abs(d.dx) > 0.2) p.facing = sign(d.dx); }
    }
  }
  const boost = p.boostT > 0 ? 1.35 : 1, speed = d.speed || c.dash.speed;
  p.vx = d.dx * speed * boost; p.vy = d.dy * speed * boost;
  d.t--;
  if (d.level === 3) {
    // A full charge turns the dash into a strike through everything in its path (each enemy once)
    const S = DASH_CHARGE.strike;
    world.spawnHitbox({ owner: p, team: 'p', x0: p.x - 0.8, x1: p.x + 0.8, y0: p.y, y1: p.y + p.h + 0.2, dmg: S.dmg, poise: S.poise,
      kb: [(sign(d.dx) || p.facing) * S.kb, 3], armorBreak: true, instance: d.instance, dashStrike: true });
  }
  if (p.buf.jump <= JUMP_BUFFER && (d.grounded || p.coyote > 0) && d.dy <= 0) {
    // Dash-jump: a charged dash carries more speed into the jump, up to DASH_CHARGE.jumpCarry
    p.vy = c.jumpV; p.vx = d.dx * Math.min(speed, DASH_CHARGE.jumpCarry) * 0.85; p.dashCarry = true; p.onGround = false;
    p.buf.jump = 99; setState(p, 'normal'); world.emit('jump', { p, dashJump: true });
    return;
  }
  if (p.buf.melee <= ACTION_BUFFER) { velocityBreak(p, vbTier(p), world); return; }
  if (tryParry(p, world)) return;
  if (d.t <= 0 || p.hitWall) {
    p.vx = d.dx * speed * (d.keep ?? c.dash.exitKeep); p.vy = d.dy > 0 ? d.dy * speed * 0.4 : 0;
    p.postDash = 0; setState(p, 'normal');
  }
}

function stateSlide(p, cmd, world) {
  const c = CHARS[p.char];
  p.vx *= c.slide.decay; applyGravity(p, cmd);
  if (tryJump(p, cmd, world)) { p.dashCarry = true; return; }
  if (p.buf.melee <= ACTION_BUFFER) { velocityBreak(p, 1, world); return; }
  if (tryParry(p, world)) return;
  if (p.st >= c.slide.ticks || Math.abs(p.vx) < 2 || !p.onGround) {
    p.crouch = !hasHeadroom(p.x, p.y, p.w, c.height);
    setState(p, 'normal');
  }
}

function stateVB(p, cmd, world) {
  const v = p.vbInfo, t = p.st;
  if (t <= VB.stopTicks) {
    const k = t >= VB.stopTicks ? v.keep : 1 - (1 - v.keep) * (t / VB.stopTicks);
    p.vx = v.v0x * k; p.vy = v.v0y * k;
  } else if (!p.onGround) {
    if (t < VB.activeTo) p.vy = Math.max(p.vy, 0);         // brief hang for precision stops
    else applyGravity(p, cmd);
  } else { p.vx *= 0.8; p.vy = -0.5; }
  if (t >= VB.activeFrom && t < VB.activeTo) {
    const down = v.dy < -0.6;
    const box = down ? { x0: p.x - 1.0, x1: p.x + 1.0, y0: p.y - 0.4, y1: p.y + 1.0 }
      : { x0: p.x + (p.facing > 0 ? 0 : -1.7), x1: p.x + (p.facing > 0 ? 1.7 : 0), y0: p.y + 0.2, y1: p.y + 1.6 };
    const tier = VB.tiers[v.tier];
    world.spawnHitbox({ owner: p, team: 'p', ...box, dmg: tier.dmg, poise: tier.poise, kb: [p.facing * tier.kb, down ? 4 : 3],
      armorBreak: tier.armorBreak, instance: p.instance, vbTier: v.tier });
  }
  if (p.hitConfirm && t >= VB.activeFrom) {
    if (SETTINGS.vbRefund && !p.onGround) p.airDashes = 1;
    if (cancelInto(p, cmd, world)) return;
  }
  const end = VB.activeTo + (p.hitConfirm ? 4 : VB.whiffRecovery);
  if (t >= VB.activeTo + VB.driftAfter && !p.onGround) p.vx = approach(p.vx, cmd.mx * CHARS[p.char].run * 0.5, 30 * DT);
  if (t >= end) setState(p, 'normal');
}

function stateDive(p, cmd, world) {
  p.vy = -FAST_FALL; p.fastFall = true;
  const hitBelow = world.enemyBelow(p, 1.2);
  if (p.onGround || hitBelow || p.st > 90) {
    p.vbInfo = { tier: 2, dx: 0, dy: -1, keep: 0, v0x: p.vx, v0y: p.vy };
    p.hitConfirm = false; p.instance = world.newInstance();
    setState(p, 'vb'); world.emit('vbStart', { p, tier: 2 });
  }
}

// Ground pound (POUND). Phases: 'hold' (he hangs; holding the button charges it), 'drop' (a fast fall that
// hits what it passes through), 'land' (the scatter blast has gone off; a short recovery). A parry or dash
// cancels the hold.
function startPound(p, world) {
  breakVeil(p, world, 'attack');
  p.pound = { phase: 'hold', t: 0, level: 0, held: true, y0: p.y };
  p.hitConfirm = false; p.instance = world.newInstance();
  p.dashCarry = false; p.fastFall = false; p.lungeTo = null;
  if (Math.abs(p.aimX) > 0.2 && p.aimFree) p.facing = sign(p.aimX);
  setState(p, 'pound'); world.emit('poundStart', { p });
}

function statePound(p, cmd, world) {
  const P = POUND, S = p.pound;
  if (!S) { setState(p, 'normal'); return; }
  S.t++;
  if (S.phase === 'hold') {
    // The mid-air slowdown: his rise and drift die away fast and he sinks slowly while it charges
    p.vx = approach(p.vx, 0, 50 * DT); p.vy = approach(p.vy, -P.hang, 80 * DT); p.fastFall = false;
    if (!cmd.held.melee) S.held = false;
    if (S.held) {
      const lv = S.t >= P.charge[2] ? 3 : S.t >= P.charge[1] ? 2 : S.t >= P.charge[0] ? 1 : 0;
      if (lv > S.level) { S.level = lv; world.emit('poundLevel', { p, level: lv }); }
    }
    if (tryParry(p, world) || tryDash(p, cmd, world)) { p.pound = null; return; }
    if (p.onGround) { landPound(p, world); return; }
    if ((!S.held && S.t >= P.windup) || S.t >= P.maxHold) { S.phase = 'drop'; S.t = 0; S.y0 = p.y; p.instance = world.newInstance(); world.emit('poundDrop', { p, level: S.level }); }
    return;
  }
  if (S.phase === 'drop') {
    // Echo's quick pound bounces off what it hits
    if (p.arch === 'echo' && S.level === 0 && p.hitConfirm) {
      p.vy = P.bounce; p.vx *= 0.5; p.airDashes = 1; p.jumpsUsed = 0; p.fastFall = false; p.dashCarry = false;
      p.pound = null; setState(p, 'normal'); world.emit('pogo', { p });
      return;
    }
    p.vy = -P.speed; p.fastFall = true; p.vx *= 0.9;
    const k = 1 + 0.25 * S.level;
    world.spawnHitbox({ owner: p, team: 'p', x0: p.x - P.box.w / 2, x1: p.x + P.box.w / 2, y0: p.y - 0.7, y1: p.y + P.box.h - 0.7,
      dmg: P.drop.dmg * k, poise: P.drop.poise * k, kb: [0, -4], instance: p.instance, pound: true });
    if (p.onGround) { landPound(p, world); return; }
    if (S.t > P.maxDrop) { p.pound = null; setState(p, 'normal'); }   // fell a long way (a pit)
    return;
  }
  // 'land': the blast has gone off; a short recovery, cancellable once it has hit something
  p.vx *= 0.7; p.vy = -0.5;
  if (p.hitConfirm) S.hit = true;
  if (S.hit && S.t >= P.hitRecover && cancelInto(p, cmd, world, { melee: false })) { p.pound = null; return; }
  if (S.t >= P.recover) { p.pound = null; setState(p, 'normal'); }
}

// The scatter blast: every enemy in reach is hit and thrown outward, away from the impact
function landPound(p, world) {
  const P = POUND, S = p.pound, L = P.land[S.level], fall = Math.max(0, S.y0 - p.y);
  const r = L.r + P.fallBonus * Math.min(1, fall / 12);
  const inst = world.newInstance();
  world.spawnHitbox({ owner: p, team: 'p', x0: p.x - r, x1: p.x + r, y0: p.y - 0.3, y1: p.y + 1.6 + 0.3 * S.level, dmg: L.dmg, poise: L.poise,
    kb: [L.kb, L.up], radial: true, cx: p.x, armorBreak: !!L.armorBreak, instance: inst, scatter: true });
  S.phase = 'land'; S.t = 0; S.inst = inst; S.hit = false;
  p.vx = 0; p.hitConfirm = false; p.hitstop = 2 + S.level;   // a beat of impact freeze, longer the bigger the pound
  world.emit('poundLand', { p, x: p.x, y: p.y, level: S.level, r, fall });
}

function stateAttack(p, cmd, world) {
  const m = p.move, t = p.st;
  const activeStart = m.su, activeEnd = m.su + m.ac, end = m.su + m.ac + m.rc;
  // A rising attack takes off (no rise cut); from the air it climbs a little less
  if (m.rise && t === activeStart) { p.vy = m.rise * (p.riseAir ? m.airRise || 1 : 1); p.onGround = false; p.vx = p.facing * (m.fist ? 1.5 : 2.5); p.dashCarry = true; p.fastFall = false; }
  if (m.riseBlast && t === activeEnd) {
    // The Solar Uppercut's flare: a burst of light off the fist at the top of the climb
    world.explode({ owner: p, x: p.x + p.facing * 0.35, y: p.y + p.h + 0.55, spec: { ...m.riseBlast, armorBreak: false }, kind: 'riseBlast', level: 1 });
  }
  // On the ground an attack keeps pressing into the floor, so it never reads as airborne mid-swing
  if (p.onGround) { p.vx *= 0.82; p.vy = -0.5; }
  else { applyGravity(p, cmd, m.hoverAll ?? (m.hover && p.hitConfirm ? 0.25 : 1)); wallCling(p, cmd, false); }
  if (m.hover && p.hitConfirm && p.vy < 1.5) p.vy = 1.5;
  if (m.hoverAll && p.vy < -3) p.vy = -3;
  if (t === activeStart && p.onGround && !m.launcher) p.vx += p.facing * 2.2;
  if (m.multi && t > activeStart && t < activeEnd && (t - activeStart) % m.multi === 0) p.instance = world.newInstance();
  if (t === activeStart && m.blastFist) {
    world.explode({ owner: p, x: p.x + p.facing * 1.2, y: p.y + 1.1, spec: { ...m.blastFist, armorBreak: false }, kind: 'blast', level: 1 });
  }
  if (t === activeStart && m.wave && SETTINGS.echoKit === 'hunter') {
    // Crescent wave: the charged swing looses an energy crescent that flies on and cuts through shots
    const W = m.wave;
    world.spawnProjectile({ team: 'p', owner: p, x: p.x + p.facing * 1.0, y: p.y + 1.0, vx: p.facing * W.speed, vy: 0, ttl: W.ttl, r: W.r,
      dmg: W.dmg, poise: W.poise, kb: 6, pierce: true, intercept: true, interceptHeavy: true, kind: 'wave' });
    world.emit('crescent', { p, x: p.x + p.facing * 1.0, y: p.y + 1.0 });
  }
  if (p.lungeTo && t < activeEnd && p.onGround) {
    // Locked on: close the gap to the target until the swing lands
    const e = p.lungeTo, gap = Math.abs(e.x - p.x) - e.w / 2 - p.w / 2;
    if (!e.dead && gap > 0.3) p.vx = p.facing * Math.min(LOCK.lunge, gap * 30); else p.lungeTo = null;
  }
  if (t >= activeStart && t < activeEnd) {
    const b = m.box, cx = m.spin ? p.x : p.x + p.facing * b.fx;
    world.spawnHitbox({ owner: p, team: 'p', x0: cx - b.w / 2, x1: cx + b.w / 2, y0: p.y + b.y - b.h / 2, y1: p.y + b.y + b.h / 2,
      dmg: m.dmg, poise: m.poise, kb: [p.facing * m.kb[0], m.kb[1]], armorBreak: !!m.armorBreak, heavy: !!m.heavy,
      launcher: !!m.launcher, shove: !!m.shove, instance: p.instance, moveId: p.moveId, spin: !!m.spin, cx: p.x });
  }
  if (m.launcher && t === activeEnd && p.hitConfirm) p.vy = 9;   // Echo hops after a launched enemy
  if (p.buf.melee <= ACTION_BUFFER && m.next && t >= activeStart) p.queued = m.next;
  if (t >= activeEnd) {
    if (p.queued && t >= activeEnd + 2) {
      const nxt = p.queued;
      if (MOVES[nxt].air === !p.onGround || !MOVES[nxt].air) { p.buf.melee = 99; startMove(p, nxt, world); return; }
    }
    const lateWhiff = t >= activeEnd + Math.floor(m.rc * 0.6);
    if (p.hitConfirm) { if (cancelInto(p, cmd, world, { melee: false })) return; }
    else if (lateWhiff) { if (cancelInto(p, cmd, world, { jump: false, sig: false, melee: false })) return; }
  }
  if (t >= end) setState(p, 'normal');
}

function stateParry(p, cmd, world) {
  p.parryT++;
  if (p.onGround) p.vx *= 0.7; else { applyGravity(p, cmd); p.vx = approach(p.vx, cmd.mx * 2, 20 * DT); wallCling(p, cmd, true); }
  if (p.parryResult) {
    // Successful parry: short, cancellable recovery
    if (p.st > 3 && cancelInto(p, cmd, world)) return;
    if (p.st > 10) setState(p, 'normal');
    return;
  }
  if (p.parryT >= PARRY.window + PARRY.whiff) setState(p, 'normal');
}

function stateHitstun(p, cmd, world) {
  if (p.onGround) p.vx *= 0.85;
  applyGravity(p, cmd);
  if (p.st >= p.stun) setState(p, 'normal');
}

function stateBulwark(p, cmd, world) {
  if (p.onGround) p.vx *= 0.7; else { p.vy = Math.max(p.vy - 10 * DT, -2); }
  if (p.st === 3) world.bulwarkPulse(p);
  if (p.st >= 8 && cancelInto(p, cmd, world, { sig: false })) return;
  if (p.st >= 14) setState(p, 'normal');
}

function stateLash(p, cmd, world) {
  const L = p.lash;
  if (p.onGround) p.vx *= 0.75; else { p.vy = Math.max(p.vy - 20 * DT, -3); }
  L.len = Math.min(1, p.st / 8);
  const hunter = SETTINGS.echoKit === 'hunter';
  if (p.st === 8 && L.target) {
    L.hit = true;
    const heavy = L.target.kind === 'enemy' && !(L.target.light && L.target.armor <= 0);
    // Hunter kit: keep holding to reel a light enemy in; a heavy one waits a moment to tell yank from zip
    if (hunter && heavy && cmd.held.sig) L.pending = true;
    else { world.lashConnect(p, L.target, hunter && cmd.held.sig); if (p.state !== 'lash') return; }
  }
  if (L.pending && p.st === 13) {
    L.pending = false;
    world.lashConnect(p, L.target, cmd.held.sig);
    if (p.state !== 'lash') return;
  }
  if (p.st >= 8 && L.hit && !L.pending && cancelInto(p, cmd, world, { sig: false })) { p.lash = null; return; }
  if (p.st >= (L.hit ? 14 : 20)) { p.lash = null; setState(p, 'normal'); }
}

function stateZip(p, cmd, world) {
  const z = p.zip, tgt = z.target;
  const tx = tgt.x - sign(tgt.x - p.x) * (tgt.w / 2 + p.w / 2 + 0.1), ty = tgt.y + 0.2;
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
  if (d < 0.6 || p.st > 30 || tgt.dead || p.hitWall) {
    p.vx *= 0.6; p.vy *= 0.6; p.zipArriveT = 12; p.lash = null;
    setState(p, 'normal');
    return;
  }
  p.vx = dx / d * ECHO.zipSpeed; p.vy = dy / d * ECHO.zipSpeed;
  p.facing = sign(dx) || p.facing;
  if (p.buf.melee <= ACTION_BUFFER && d < 3) { p.zipArriveT = 12; velocityBreak(p, 2, world); }
}

function updateDowned(p, cmd, world) {
  p.vx = cmd.mx * 1.2; p.crouch = false;
  applyGravity(p, cmd);
  p.h = 0.6;
  moveBody(p, DT);
  p.downedT--;
  if (p.downedT <= 0) world.bleedOut(p);
}

// Echo's sniper focus (0-1) after holding fire for t ticks
export function rifleFocus(t) { const R = HUNTER.rifle; return Math.max(0, Math.min(1, (t - R.raise) / R.focus)); }

// ---- Lock-on ---------------------------------------------------------------------------

// A lock the player chose (any lock in manual mode; with automatic lock-on, one picked with the button)
export const lockChosen = p => SETTINGS.lockMode === 'manual' || !!p.lockPicked;

// A press locks onto the best target at once. While locked, a tap cycles to the next target and holding
// for LOCK.hold ticks lets go. The world keeps the lock valid (target death, range, line of sight).
// Automatic lock-on (the default) also locks the nearest enemy in sight whenever there is no target;
// letting go by holding the button pauses that until the next press.
function updateLock(p, cmd, world) {
  if (!SETTINGS.lockOn) { if (p.lockT) world.setLock(p, null, 'off'); p.lockSuspend = false; return; }
  const auto = SETTINGS.lockMode !== 'manual';
  const held = !!(cmd.held && cmd.held.lock), pressed = !!(cmd.pressed && cmd.pressed.lock);
  if (pressed) {
    p.lockHeld = 1; p.lockHoldDone = false;
    if (!p.lockT || p.lockSuspend) { p.lockSuspend = false; world.setLock(p, world.bestLockTarget(p), 'on'); p.lockHoldDone = true; }
  } else if (held && p.lockHeld > 0) {
    p.lockHeld++;
    if (p.lockHeld >= LOCK.hold && !p.lockHoldDone) { p.lockHoldDone = true; world.setLock(p, null, 'release'); if (auto) p.lockSuspend = true; }
  }
  if (!held && p.lockHeld > 0) {
    if (!p.lockHoldDone && p.lockT) world.setLock(p, world.nextLockTarget(p), 'cycle');
    p.lockHeld = 0; p.lockHoldDone = false;
  }
  world.validateLock(p);
  if (auto && !p.lockT && !p.lockSuspend) { const t = world.autoLockTarget(p); if (t) world.setLock(p, t, 'auto'); }
  if (!auto) p.lockSuspend = false;
}

// ---- Firing ----------------------------------------------------------------------------

function canFire(p) { return ['normal', 'dash', 'slide', 'lash', 'dodge'].includes(p.state) || (p.state === 'attack' && p.hitConfirm); }

function handleFire(p, cmd, world) {
  if (marksman(p)) { fireMarksman(p, cmd, world); return; }
  if (p.arch === 'nova') {
    if (cmd.pressed.fire && p.fireCd === 0 && canFire(p)) {
      world.fireShot(p, 0); p.fireCd = NOVA.shotCd;
    }
    if (cmd.held.fire && canFire(p)) {
      p.chargeT++;
      if (p.chargeT === NOVA.charge1 || p.chargeT === NOVA.charge2) world.emit('chargeLevel', { p, level: p.chargeT === NOVA.charge1 ? 1 : 2 });
    }
    if (cmd.released.fire || (!cmd.held.fire && p.chargeT > 0)) {
      if (p.chargeT >= NOVA.charge2) world.fireShot(p, 2);
      else if (p.chargeT >= NOVA.charge1) world.fireShot(p, 1);
      p.chargeT = 0;
    }
    return;
  }
  // Wolverine: the Drill Claw
  if (kitOf(p).fire === 'drill' && SETTINGS.echoKit === 'hunter') { fireDrill(p, cmd, world); return; }
  // Echo and Psylocke, Hunter kit: tap to throw a snare (crouch + tap plants one at your feet); hold to raise
  // the staff-rifle and let go to fire a long shot, or hold longer for a marking shot (HUNTER.rifle)
  if (SETTINGS.echoKit === 'hunter') {
    const R = HUNTER.rifle;
    if (cmd.pressed.fire) p.plantPress = p.onGround && cmd.my < -0.55;   // crouched when pressed: plant on release
    if (cmd.held.fire && canFire(p)) {
      p.rifleT++;
      if (p.rifleT === R.raise) world.emit('rifleRaise', { p });
      else if (p.rifleT === R.raise + R.focus) world.emit('rifleFocus', { p });   // full focus
    }
    if (!cmd.held.fire && p.rifleT > 0) {
      const t = p.rifleT; p.rifleT = 0;
      if (t < R.raise) {
        if (p.snares > 0 && canFire(p)) {
          if (p.onGround && (p.plantPress || cmd.my < -0.55)) world.plantSnare(p);   // setting a trap keeps Veil up
          else { world.throwSnare(p); breakVeil(p, world, 'attack'); }
          p.snares--;
          if (p.snareRecharge <= 0) p.snareRecharge = HUNTER.snareRecharge;
        }
      } else if (p.rifleCd === 0 && canFire(p)) {
        world.fireSniper(p, rifleFocus(t)); p.rifleCd = p.rifleCdMax = R.cd; breakVeil(p, world, 'attack');
      } else world.emit('rifleLower', { p });
    }
    p.chargeT = 0;
    return;
  }
  // Echo, Pursuit kit: ranged options under test (Q-A)
  const mode = SETTINGS.echoRanged;
  if (mode === 'C') { p.chargeT = 0; return; }
  if (mode === 'A') {
    if (cmd.pressed.fire && p.tracerCd === 0 && canFire(p)) { world.fireTracer(p); p.tracerCd = ECHO.tracerCd; breakVeil(p, world, 'attack'); }
    return;
  }
  if (cmd.pressed.fire && p.fireCd === 0 && p.cells > 0 && canFire(p)) {
    world.fireBolt(p); p.cells--; p.fireCd = ECHO.boltCd; breakVeil(p, world, 'attack');
  }
  if (cmd.held.fire) p.chargeT++;
  if (!cmd.held.fire && p.chargeT > 0) {
    if (p.chargeT >= ECHO.tracerHold && p.tracerCd === 0 && canFire(p)) { world.fireTracer(p); p.tracerCd = ECHO.tracerCd; breakVeil(p, world, 'attack'); }
    p.chargeT = 0;
  }
}

// Wolverine's Drill Claw (DRILL): holding fire coils him (tiers 2 and 3 at DRILL.charge); letting go launches
// a corkscrew lunge along the aim, a Dash Slash in that direction. In the air he gets one per airtime.
function fireDrill(p, cmd, world) {
  const D = DRILL, ready = p.drillCd === 0 && (p.onGround || p.airDrill || p.wallSliding) && canFire(p);
  if (cmd.held.fire && ready) {
    p.drillT++;
    if (p.drillT === D.charge[0] || p.drillT === D.charge[1]) world.emit('drillLevel', { p, level: p.drillT === D.charge[0] ? 2 : 3 });
  }
  if (!cmd.held.fire && p.drillT > 0) {
    const t = p.drillT; p.drillT = 0;
    if (!ready) return;
    const tier = t >= D.charge[1] ? 3 : t >= D.charge[0] ? 2 : 1;
    let dx = p.aimX, dy = p.aimY;
    if (p.onGround && dy < -0.3) { dx = p.facing; dy = 0; }   // no drilling into the floor
    const m = Math.hypot(dx, dy) || 1;
    if (!p.onGround && !p.wallSliding) p.airDrill = false;
    p.drillCd = D.cd;
    startDashSlash(p, tier, world, { dx: dx / m, dy: dy / m, drill: true });
  }
  p.chargeT = 0;
}

// Marksman kit: tap for basic rounds, hold to charge the loaded attachment through three levels.
// Letting go within MARKSMAN.perfectWindow ticks of level 3 is a Perfect Release. The secondary
// blaster works the same way on the melee button: the press fires a quick burst (tryMelee) and
// holding charges a bigger one.
const levelOf = (t, C) => (t >= C[2] ? 3 : t >= C[1] ? 2 : t >= C[0] ? 1 : 0);
// Charge levels reached going from t0 to t1 (a charge can grow by more than one a tick with Overcharge)
function crossed(t0, t1, marks, fn) { marks.forEach((m, i) => { if (t0 < m && t1 >= m) fn(i + 1); }); }

function fireMarksman(p, cmd, world) {
  const M = MARKSMAN, C = M.charge, B = M.burst, L4 = M.beam.at;
  const rate = p.overcharge > 0 ? AEGIS.over.charge : 1;
  if (cmd.pressed.fire && p.fireCd === 0 && canFire(p)) { world.fireShot(p, 0); p.fireCd = NOVA.shotCd; }
  if (cmd.held.fire && canFire(p)) {
    const t0 = p.chargeT; p.chargeT += rate;
    crossed(t0, p.chargeT, [...C, L4], level => world.emit('chargeLevel', { p, level }));
  }
  if (cmd.released.fire || (!cmd.held.fire && p.chargeT > 0)) {
    const t = p.chargeT, level = levelOf(t, C); p.chargeT = 0;
    if (t >= L4) { if (canFire(p)) startBeam(p, world); }
    else if (level) world.fireAttachment(p, p.attachment, level, level === 3 && t < C[2] + M.perfectWindow, t);
  }
  // Secondary weapon: holding charges it (not while a disc or well of his is still out); letting go fires
  // the charged level, or a tap (the Scatter fired its tap on the press, in tryMelee)
  const ready = subReady(p, world);
  if (cmd.held.melee && canFire(p) && ready) {
    const t0 = p.burstT; p.burstT += rate;
    crossed(t0, p.burstT, B.charge, level => world.emit('burstLevel', { p, level, sub: p.sub }));
  }
  if (!cmd.held.melee && (p.burstT > 0 || p.subArmed)) {
    const t = p.burstT, level = levelOf(t, B.charge), armed = p.subArmed; p.burstT = 0; p.subArmed = false;
    if (level && canFire(p) && ready) world.fireSub(p, level, level === 3 && t < B.charge[2] + B.perfectWindow);
    else if (!level && armed && canFire(p) && ready && p.sub !== 'scatter') world.fireSub(p, 0, false);
  }
}

// The secondary button pressed with no enemy close enough for the combo. The Scatter fires at once; the
// others fire when it is let go (fireMarksman). A disc or well already out is called back or collapsed.
function pressSub(p, world) {
  if (!subReady(p, world)) { p.buf.melee = 99; world.recallSub(p, p.sub); return false; }
  if (p.burstCd > 0) return false;
  p.buf.melee = 99;
  if (p.state !== 'normal') { if (p.state === 'dodge') p.dodge = null; setState(p, 'normal'); }
  if (p.sub === 'scatter') world.fireSub(p, 0, false); else p.subArmed = true;
  return true;
}
// A disc or a well: one of each at a time
const subReady = (p, world) => !((p.sub === 'disc' || p.sub === 'well') && world.subOut(p, p.sub));

function cycleSub(p, world) {
  const S = subList(p);
  if (S.length < 2) return;
  p.sub = S[(S.indexOf(p.sub) + 1) % S.length]; p.subSwCd = SUB.switchCd; p.burstT = 0; p.subArmed = false;
  world.emit('subSwitch', { p, sub: p.sub });
}

// ---- Nova: the dodge (Marksman kit, on the parry button) --------------------------------------
function tryDodge(p, world) {
  if (p.dodgeCd > 0 || (!p.onGround && !p.airDodge && !p.wallSliding)) return false;
  const D = DODGE, [mx] = p.stick;
  // The way the stick points; with it centred, a backstep. Off a wall it always goes out from the wall.
  const dx = p.wallSliding ? -p.wallDir : Math.abs(mx) > 0.3 ? sign(mx) : -p.facing;
  p.buf.parry = 99; p.dodgeCd = D.cd;
  if (!p.onGround) p.airDodge = false;
  p.dodge = { dx, t: 0, air: !p.onGround, speed: p.onGround ? D.speed : D.airSpeed, perfect: false };
  p.crouch = false; p.fastFall = false; p.dashCarry = false; p.wallSliding = false;
  setState(p, 'dodge'); world.emit('dodge', { p, dx, air: p.dodge.air });
  return true;
}
function stateDodge(p, cmd, world) {
  const D = DODGE, d = p.dodge;
  if (!d) { setState(p, 'normal'); return; }
  d.t++;
  if (d.t <= D.ticks - 4) p.vx = d.dx * d.speed * Math.pow(D.keep, Math.max(0, d.t - 3));
  else p.vx = approach(p.vx, cmd.mx * CHARS[p.char].run * 0.6, 60 * DT);
  if (d.air && d.t <= 8) p.vy = 0; else applyGravity(p, cmd);
  // It can be cut short: a jump from the fourth tick, anything else once he is hittable again
  if (d.t >= 4 && tryJump(p, cmd, world)) { p.dodge = null; return; }
  if (d.t > D.iframes && cancelInto(p, cmd, world, { parry: false, jump: false })) { if (p.state !== 'dodge') p.dodge = null; return; }
  if (d.t >= D.ticks) { p.dodge = null; setState(p, 'normal'); }
}

// ---- Ultimates -----------------------------------------------------------------------------
// Both triggers pulled together: each press counted from when it happened, both within ULT.chord ticks of
// each other and both still held (so pulling the second trigger long after the first never counts)
export function trackChord(p, cmd) {
  p.chordP = cmd.pressed.parry ? 0 : Math.min(99, p.chordP + 1);
  p.chordF = cmd.pressed.fire ? 0 : Math.min(99, p.chordF + 1);
}
export const chordReady = (p, cmd) => !!cmd.pressed.ult ||
  (!!cmd.held.parry && !!cmd.held.fire && p.chordP <= ULT.chord && p.chordF <= ULT.chord);
export function gainUlt(p, amount, world) {
  if (!p || p.kind !== 'player' || !(amount > 0) || p.state === 'ult') return;
  const was = p.ult; p.ult = Math.min(ULT.max, p.ult + amount);
  if (was < ULT.max && p.ult >= ULT.max) world.emit('ultReady', { p });
}

// Level 4: the sustained beam. He braces (slow on the ground, hovering in the air), the beam follows the
// aim at a limited turn rate, and the world deals its damage (world.beamTick). Dash or parry cut it short;
// a hit ends it (combat.hitPlayer).
function startBeam(p, world) {
  const B = MARKSMAN.beam;
  p.beam = { t: B.ticks, dx: p.aimX, dy: p.aimY, mult: focusMult(p) * spendOvercharge(p), attach: p.attachment, pulse: 0,
    armor: new Map(), family: { focused: false, rocketed: true, perfect: false }, segs: [] };
  p.chargeT = 0;
  setState(p, 'beam'); world.emit('beamStart', { p, attach: p.attachment, over: p.beam.mult > focusMult(p) });
}
function stateBeam(p, cmd, world) {
  const B = MARKSMAN.beam, b = p.beam;
  if (!b) { setState(p, 'normal'); return; }
  const a0 = Math.atan2(b.dy, b.dx);
  let da = Math.atan2(p.aimY, p.aimX) - a0;
  while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
  const a = a0 + Math.max(-B.turn, Math.min(B.turn, da));
  b.dx = Math.cos(a); b.dy = Math.sin(a);
  if (Math.abs(b.dx) > 0.2) p.facing = sign(b.dx);
  // No push-back: on the ground he can creep along; in the air he hangs, sinking slowly, while it fires
  if (p.onGround) { p.vx = approach(p.vx, cmd.mx * CHARS[p.char].run * B.slow, 40 * DT); p.vy = -0.5; }
  else { p.vx = approach(p.vx, 0, 20 * DT); p.vy = approach(p.vy, -B.hover, 40 * DT); p.fastFall = false; }
  if (tryParry(p, world) || tryDash(p, cmd, world)) { world.endBeam(p, 'cancel'); return; }
  world.beamTick(p);
  if (--b.t <= 0) { world.endBeam(p, 'done'); setState(p, 'normal'); }
}

// Overcharge (from the Aegis) makes a charged release hit harder, at a cost; returns the damage multiplier
export function spendOvercharge(p) {
  if (!(p.overcharge > 0)) return 1;
  p.overcharge = Math.max(0, p.overcharge - AEGIS.over.cost);
  return AEGIS.over.dmg;
}

// Charge stage from a charge counter: '', 'charging', 'L1', 'L2', 'perfect' (the release window), 'L3',
// or 'L4' (Marksman primary only: the beam)
function stageOf(t, C, win, l4 = Infinity) {
  if (t <= 0) return '';
  if (t < C[0]) return 'charging';
  if (t < C[1]) return 'L1';
  if (t < C[2]) return 'L2';
  if (t >= l4) return 'L4';
  return t < C[2] + win ? 'perfect' : 'L3';
}
export function chargeStage(p) {
  if (marksman(p)) return stageOf(p.chargeT, MARKSMAN.charge, MARKSMAN.perfectWindow, MARKSMAN.beam.at);
  // Sentinel kit: two levels (lance, rail) and no Perfect Release
  return p.chargeT <= 0 ? '' : p.chargeT < NOVA.charge1 ? 'charging' : p.chargeT < NOVA.charge2 ? 'L1' : 'L2';
}
export const burstStage = p => stageOf(p.burstT, MARKSMAN.burst.charge, MARKSMAN.burst.perfectWindow);

// Rocket jump height (m, for a burst at his feet) earned by a shot charged for t ticks: it climbs
// steadily from charge level 1 to level 3; a Perfect Release reaches the highest. Attachments scale it.
export function rocketHeight(t, attach, perfect) {
  const R = MARKSMAN.rocket, C = MARKSMAN.charge;
  const f = Math.max(0, Math.min(1, (t - C[0]) / (C[2] - C[0])));
  return (perfect ? R.perfect : R.h[0] + (R.h[1] - R.h[0]) * f) * (R.attach[attach] ?? 1);
}

// ---- Nova: bracer attachments and Focus ---------------------------------------------------

function cycleAttachment(p, world) {
  const A = attachList(p);
  if (A.length < 2) return;
  p.attachment = A[(A.indexOf(p.attachment) + 1) % A.length]; p.modeCd = MARKSMAN.switchCd;
  world.emit('attach', { p, attach: p.attachment });
}

export const focusMult = p => (marksman(p) ? 1 + MARKSMAN.focus.dmgPer * Math.floor(p.focus) : 1);

export function gainFocus(p, amount, world) {
  if (!marksman(p)) return;
  const F = MARKSMAN.focus, before = Math.floor(p.focus);
  p.focus = Math.min(F.max, p.focus + amount); p.focusT = F.decay;
  if (Math.floor(p.focus) > before) world.emit('focusUp', { p, level: Math.floor(p.focus) });
}

export function loseFocus(p, world) {
  if (p.focus >= 1) world.emit('focusLost', { p });
  p.focus = 0; p.focusT = 0;
}

// Focus drains one level after a quiet stretch, then another every decayStep ticks
function tickFocus(p, world) {
  if (p.focus <= 0 || --p.focusT > 0) return;
  p.focus = Math.max(0, p.focus - 1); p.focusT = MARKSMAN.focus.decayStep;
}

// ---- Echo: Resolve and Rally ------------------------------------------------------------

function tickEcho(p, world, cmd) {
  if (p.snares < HUNTER.snareCharges) {
    p.snareRecharge--;
    if (p.snareRecharge <= 0) { p.snares++; p.snareRecharge = p.snares < HUNTER.snareCharges ? HUNTER.snareRecharge : 0; }
  }
  if (p.leash) {
    const L = p.leash; L.t++;
    const e = L.e;
    if (!cmd.held.sig || L.t > HUNTER.leashTicks || e.dead || e.state !== 'caught' || ['hitstun', 'downed', 'dead'].includes(p.state)) world.releaseLeash(p);
  }
  if (p.lashCharges < ECHO.lashCharges) {
    p.lashRecharge--;
    if (p.lashRecharge <= 0) { p.lashCharges++; p.lashRecharge = p.lashCharges < ECHO.lashCharges ? ECHO.lashRecharge : 0; }
  }
  tickScarf(p, world);
  // Wolverine's healing factor: a little while after the last hit he took, he knits back together
  if (kitOf(p).heal && p.hurtT === 0 && p.hp < p.maxHp && p.state !== 'downed' && p.state !== 'dead') {
    p.hp = Math.min(p.maxHp, p.hp + HEAL.rate / 60);
    p.strain = Math.min(p.strain, p.maxHp - p.hp);
    if (p.hp >= p.maxHp) world.emit('healed', { p });
  }
  const near = world.nearestEnemyDist(p.x, p.y + 1) < 6 || (p.scarfMode === 'flare' && p.targetedBy > 0);
  p.calmT = near ? 0 : p.calmT + 1;
  if (p.calmT > 120) p.resolve = Math.max(0, p.resolve - 5 / 60);
  if (p.strainT > 0) { p.strainT--; if (p.strainT === 0) p.strain = 0; }
}

export function addResolve(p, amount) {
  if (p.arch !== 'echo') return;
  if (p.scarfMode === 'flare') amount *= SCARF.flareResolve;
  p.resolve = Math.min(100, p.resolve + amount);
}

// Called when this player deals damage (Rally recovery + ranged refills).
export function onDealtDamage(p, dmg, isMelee) {
  if (p.arch !== 'echo') return;
  // Berserker Rage: his claw hits heal him
  if (p.berserkT > 0 && isMelee && p.state !== 'downed') { p.hp = Math.min(p.maxHp, p.hp + dmg * BERSERK.steal); p.strain = Math.min(p.strain, p.maxHp - p.hp); }
  if (p.strain > 0) {
    const heal = Math.min(p.strain, dmg * 3);
    p.strain -= heal; p.hp = Math.min(p.maxHp, p.hp + heal);
  }
  if (isMelee) { addResolve(p, 6); if (p.cells < ECHO.cellsMax) p.cells++; }
}

// ---- Echo: scarf modes -----------------------------------------------------------------

export function setScarfMode(p, mode, world) {
  if (p.leash) world.releaseLeash(p);
  p.scarfMode = mode; p.modeCd = SCARF.switchCd;
  p.veiled = false; p.veilCharge = 0; p.veilBreakT = 0;
  world.emit('scarfMode', { p, mode });
}

function cycleScarf(p, world) {
  const M = SCARF.modes;
  setScarfMode(p, M[(M.indexOf(p.scarfMode) + 1) % M.length], world);
}

// Attacking or taking a hit drops Veil; it re-arms after SCARF.veilRearm quiet ticks.
// Breaking it with an attack while fully hidden makes that attack's first hit an ambush.
export function breakVeil(p, world, reason) {
  if (p.arch !== 'echo' || p.scarfMode !== 'veil') return;
  const wasHidden = p.veiled, fading = p.veilCharge > 0;
  p.veilBreakT = SCARF.veilRearm;
  if (!wasHidden && !fading) return;
  p.veiled = false; p.veilCharge = 0;
  if (wasHidden && reason === 'attack') p.ambushT = SCARF.ambushWindow;
  world.emit('veilBreak', { p, reason, wasHidden });
}

// Flare widens the parry windows while at least one enemy is targeting Echo.
export function parryWindows(p) {
  const on = p.arch === 'echo' && p.scarfMode === 'flare' && p.targetedBy > 0;
  return { window: PARRY.window + (on ? SCARF.flareParry : 0), perfect: PARRY.perfect + (on ? SCARF.flarePerfect : 0) };
}

function tickScarf(p, world) {
  p.targetedBy = 0;
  for (const e of world.enemies) if (!e.dead && e.target === p) p.targetedBy++;
  if (p.state === 'downed') { p.veiled = false; p.veilCharge = 0; return; }
  if (p.scarfMode === 'veil') {
    if (p.veilBreakT > 0) p.veilBreakT--;
    else if (!p.veiled && ++p.veilCharge >= SCARF.veilFade) { p.veiled = true; world.emit('veilOn', { p }); }
  } else if (p.scarfMode === 'flare' && p.targetedBy > 0) {
    p.resolve = Math.min(100, p.resolve + SCARF.flareTrickle * Math.min(3, p.targetedBy) / 60);
  }
}
