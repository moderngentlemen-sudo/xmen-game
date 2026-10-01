// Jean Grey, the mover. Power is telekinesis: hold it to grab whatever lies along her aim (an enemy shot, an
// enemy, a crate, the kid, a teammate), steer it with the aim, and let go to throw it (shots go back where they
// came from; the kid and teammates are set down gently). Holding drains concentration; heavy Sentinels can
// only be pinned, not moved. Phoenix power grows with every telekinetic hit and makes them hit harder; pushed
// too far, it burns her. Holding jump in the air levitates her. Signature: the TK Shield, a bubble that stops
// enemy shots for a few seconds.
import { DT, HEROES, ENEMIES, TEAM } from '../config.js';
import { moveBody } from '../level.js';
import { emit, ent } from '../world.js';
import { physics } from '../player.js';

const J = () => HEROES.jean;

export default {
  init(p) { p.conc = p.conc === undefined ? J().tk.max : p.conc; p.phoenix = p.phoenix || 0; p.tk = null; p.tkCd = 0; p.levFuel = J().levitate.fuel; p.levitating = false;
    p.shieldT = 0; p.shieldCd = 0; p.shieldX = p.x; p.shieldY = p.y + 1; },

  tick(S, p) {
    const T = J().tk, P = J().phoenix;
    if (p.tkCd > 0) p.tkCd--;
    if (p.shieldCd > 0) p.shieldCd--;
    if (p.shieldT > 0) { p.shieldT--; p.shieldX = p.x; p.shieldY = p.y + p.h * 0.55; if (p.shieldT === 0) emit(S, 'shieldDown', { id: p.id }); }
    if (!p.tk) p.conc = Math.min(T.max, p.conc + T.regen);
    p.phoenix = Math.max(0, p.phoenix - P.decay);
    if (p.phoenix > P.burnAt && p.hp > 1) { p.hp = Math.max(1, p.hp - P.burn); p.burning = true; } else p.burning = false;
    if (p.onGround) p.levFuel = Math.min(J().levitate.fuel, p.levFuel + J().levitate.refill);
    // A grip only lasts while she can act
    if (p.tk && (p.state !== 'normal' || p.conc <= 0)) drop(S, p, false);
  },

  power(S, p, cmd, E) {
    const T = J().tk, holding = (p.held & 2) !== 0;
    if (!p.tk && holding && p.buf.power <= 8 && p.tkCd === 0 && p.conc > 8) {
      p.buf.power = 99;
      const t = findTarget(S, p);
      if (t && t.anchored) emit(S, 'anchored', { id: p.id, target: t.id, x: t.x, y: t.y });
      else if (t) grab(S, p, t);
      else emit(S, 'tkMiss', { id: p.id });
    }
    if (p.tk) {
      if (holding) { hold(S, p); if (Math.abs(p.aimX) > 0.2) p.facing = p.aimX > 0 ? 1 : -1; physics(S, p, J().run * 0.6, cmd, E, false); return true; }
      drop(S, p, true);
    }
    return false;
  },

  sig(S, p) {
    const SH = J().shield;
    if (p.shieldCd > 0 || p.shieldT > 0) { emit(S, 'sigWait', { id: p.id, t: p.shieldCd }); return; }
    p.shieldT = SH.ticks; p.shieldCd = SH.cd; p.shieldX = p.x; p.shieldY = p.y + p.h * 0.55;
    emit(S, 'shield', { id: p.id, x: p.shieldX, y: p.shieldY, r: SH.r });
  },

  // Levitation: holding jump while falling, she floats (and rises a little with up held)
  air(S, p) {
    const L = J().levitate;
    p.levitating = !p.onGround && (p.held & 4) !== 0 && p.vy <= 0.5 && p.levFuel > 0 && p.state === 'normal';
    if (!p.levitating) return false;
    const want = p.my > 0.5 ? L.rise : -L.fall;
    p.vy += Math.sign(want - p.vy) * Math.min(Math.abs(want - p.vy), 40 * DT);
    p.levFuel--;
    return true;
  },

  dmgMult: (p, h) => (h && h.power === 'tk' ? 1 + (p.phoenix / 100) * J().phoenix.maxBonus : 1),
  onDealt(S, p, e, dmg, h) { if (h.power === 'tk' || h.kind === 'crate' || h.kind === 'thrown') p.phoenix = Math.min(100, p.phoenix + J().phoenix.gain * Math.min(2, dmg / 6)); },
  cancel(S, p) { if (p.tk) drop(S, p, false); },
};

// ---- The grip ---------------------------------------------------------------------------------------------------
const hand = p => ({ x: p.x + p.facing * 0.25, y: p.y + p.h * 0.75 });
const point = p => { const T = J().tk, h = hand(p); return { x: h.x + p.aimX * T.holdDist, y: h.y + p.aimY * T.holdDist }; };

// What lies along her aim, best first: an enemy shot (catching it first matters most), an enemy, a crate, the
// kid, a teammate. Sentinels wearing magnetic anchors can't be gripped (unless she is lifting them).
function findTarget(S, p) {
  const T = J().tk, h = hand(p);
  let best = null, bestScore = Infinity;
  const consider = (o, x, y, kind, bias) => {
    const dx = x - h.x, dy = y - h.y, d = Math.hypot(dx, dy);
    if (d > T.range) return;
    const dot = d < 0.6 ? 1 : (dx * p.aimX + dy * p.aimY) / d;
    if (dot < T.cone) return;
    const score = d * (2 - dot) + bias;
    if (score < bestScore) { bestScore = score; best = { o, kind, id: o.id, x, y }; }
  };
  for (const pr of S.projectiles) if (pr.team === 'e' && !pr.heldBy) consider(pr, pr.x, pr.y, 'proj', -3);
  for (const e of S.enemies) if (!e.dead && e.state !== 'thrown' && !e.heldBy && !ENEMIES[e.type].boss) consider(e, e.x, e.y + e.h / 2, 'enemy', 0);
  for (const c of S.props) if (!c.broken && !c.heldBy) consider(c, c.x, c.y + c.h / 2, 'crate', 0.5);
  const k = S.kid;
  if (k && (k.state === 'follow' || k.state === 'cower' || k.state === 'downed' || k.state === 'run')) consider(k, k.x, k.y + k.h / 2, 'kid', 1.5);
  for (const q of S.players) if (q !== p && q.state !== 'held' && q.state !== 'thrown') consider(q, q.x, q.y + q.h / 2, 'ally', 2.5);
  if (best && best.kind === 'enemy' && S.adapt.active === 'tk' && !(best.o.liftT > 0)) best.anchored = true;
  return best;
}

function grab(S, p, t) {
  const o = t.o, heavy = t.kind === 'enemy' && ENEMIES[o.type].mass >= 2;
  p.tk = { kind: t.kind, id: o.id, t: 0, heavy };
  if (t.kind === 'enemy') { o.heldBy = p.id; o.atk = null; o.state = 'held'; o.st = 0; if (o.carry) { /* a gripped Collector lets go */ o.dropNow = true; } }
  else if (t.kind === 'proj') { o.heldBy = p.id; }
  else if (t.kind === 'crate') { o.heldBy = p.id; o.thrown = false; }
  else if (t.kind === 'kid') { o.state = 'held'; o.heldBy = p.id; }
  else if (t.kind === 'ally') { o.state = 'held'; o.heldBy = p.id; o.move = null; }
  emit(S, 'tkGrab', { id: p.id, target: o.id, kind: t.kind, x: t.x, y: t.y, heavy });
}

function hold(S, p) {
  const T = J().tk, tk = p.tk, o = ent(S, tk.id);
  tk.t++;
  p.conc -= tk.heavy ? T.heavyDrain : T.drain;
  if (!o || o.dead || o.broken) { p.tk = null; p.tkCd = T.cd; return; }
  const P = point(p);
  if (tk.kind === 'proj') { o.x += (P.x - o.x) * Math.min(1, T.follow * DT); o.y += (P.y - o.y) * Math.min(1, T.follow * DT); o.vx = 0; o.vy = 0; o.ttl = Math.max(o.ttl, 30); return; }
  if (tk.heavy) { o.vx = 0; o.vy = Math.max(o.vy, 0); return; }   // pinned where it stands
  const cy = o.y + o.h / 2;
  o.vx = Math.max(-30, Math.min(30, (P.x - o.x) * T.follow));
  o.vy = Math.max(-30, Math.min(30, (P.y - cy) * T.follow));
  moveBody(o, DT, S.gates);
}

// Let go: with a throw (Power released) or without (interrupted, out of concentration)
function drop(S, p, throwIt) {
  const T = J().tk, tk = p.tk, o = ent(S, tk.id);
  p.tk = null; p.tkCd = T.cd;
  if (!o) return;
  const rapport = S.rapportT > 0, boost = 1 + 0.3 * (p.phoenix / 100);
  const vx = p.aimX * T.throwSpeed * boost, vy = p.aimY * T.throwSpeed * boost;
  if (tk.kind === 'enemy') {
    o.heldBy = 0;
    if (throwIt && !tk.heavy) { o.state = 'thrown'; o.st = 0; o.thrownBy = p.id; o.vx = vx; o.vy = vy + 3; o.onGround = false; o.homing = rapport; emit(S, 'tkThrow', { id: p.id, kind: 'enemy', target: o.id, x: o.x, y: o.y }); }
    else { o.state = 'stagger'; o.st = 0; o.staggerT = 20; }
  } else if (tk.kind === 'proj') {
    o.heldBy = 0;
    if (throwIt) { o.team = 'p'; o.owner = p.id; o.power = rapport ? 'team' : 'tk'; o.vx = p.aimX * 30; o.vy = p.aimY * 30; o.dmg *= 1.8; o.ttl = 90; o.hit = []; o.kind = 'returned'; emit(S, 'tkThrow', { id: p.id, kind: 'proj', x: o.x, y: o.y }); }
    else o.dead = true;
  } else if (tk.kind === 'crate') {
    o.heldBy = 0;
    if (throwIt) { o.thrown = true; o.thrownBy = p.id; o.vx = vx; o.vy = vy + 2; o.power = rapport ? 'team' : 'tk'; o.homing = rapport; o.bonus = 0; emit(S, 'tkThrow', { id: p.id, kind: 'crate', x: o.x, y: o.y }); }
  } else if (tk.kind === 'kid') {
    o.heldBy = 0; o.state = 'follow'; o.st = 0; o.vx = p.aimX * 3; o.vy = 2; o.onGround = false;
  } else if (tk.kind === 'ally') {
    o.heldBy = 0; o.state = o.hp <= 0 ? 'downed' : 'normal'; o.st = 0;
    if (throwIt && o.hp > 0) { o.vx = p.aimX * 12; o.vy = p.aimY * 12 + 4; o.onGround = false; o.mercy = Math.max(o.mercy, 20); }
  }
}
export { TEAM };
