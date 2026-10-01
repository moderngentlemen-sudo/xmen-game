// Procedural animation for every character rig, driven by the simulation's state. Strong, asymmetric
// silhouettes, weight low and committed, anticipation before a strike and follow-through after it. Attacks are
// keyframed per hero and move; every joint eases toward its target at a rate set per state, independent of
// frame rate. (Kept from Version 9's animator, rebuilt for the team edition's states.)
import { MOVES, HEROES } from './sim/config.js';

// Joints: spine pitch (+ leans forward), twist (torso turn), shoulders/elbows (near arm, far arm),
// hips/knees, hip height, whole-body tilt, head pitch
const J = ['spine', 'twist', 'shN', 'elN', 'shF', 'elF', 'hipN', 'knN', 'hipF', 'knF', 'hipY', 'bodyZ', 'head'];
const REST = { spine: 0.04, twist: 0, shN: 0.12, elN: 0.3, shF: -0.1, elF: 0.3, hipN: 0.04, knN: -0.08, hipF: -0.04, knF: -0.08, hipY: 0.95, bodyZ: 0, head: 0 };
const FIGHT = { spine: 0.18, twist: 0, shN: 0.7, elN: 1.0, shF: 0.35, elF: 1.1, hipN: 0.4, knN: -0.5, hipF: -0.32, knF: -0.35, hipY: 0.9, bodyZ: 0, head: -0.1 };
const AIR = { hipN: 0.9, knN: -1.35, hipF: 0.45, knF: -1.05, hipY: 0.95 };

const ease = k => k * k * (3 - 2 * k);
const snapEase = k => 1 - Math.pow(1 - k, 3);
function mixPose(a, b, k, out) { for (const j of J) out[j] = a[j] + (b[j] - a[j]) * k; return out; }

// ---- Attack keyframes ----------------------------------------------------------------------------------
// Each strike returns [{ t, pose, snap }]; poses are partial and merge over FIGHT (plus AIR in the air)
const k = (t, pose, snap = false) => ({ t, pose, snap });
const END = m => m.su + m.ac + m.rc;
const STRIKES = {
  // Cyclops: martial-arts strikes, backhand, elbow, a driving punch, an axe kick, the rising uppercut
  backhand: m => [k(0, { spine: 0.05, twist: -0.4, shN: -0.4, elN: 1.7, hipY: 0.9 }), k(m.su, { spine: 0.32, twist: 0.45, shN: 1.75, elN: 0.1, hipN: 0.65, knN: -0.7, hipF: -0.55, hipY: 0.86 }, true),
    k(m.su + m.ac + 3, { spine: 0.28, twist: 0.3, shN: 1.45, elN: 0.35, hipN: 0.6, knN: -0.65, hipF: -0.5 }), k(END(m), {})],
  elbow: m => [k(0, { twist: 0.4, shF: -0.35, elF: 2.2, shN: 0.9, elN: 1.4 }), k(m.su, { spine: 0.38, twist: -0.5, shF: 1.45, elF: 1.65, shN: -0.3, elN: 1.4, hipN: 0.7, knN: -0.75, hipF: -0.55, hipY: 0.86 }, true),
    k(m.su + m.ac + 3, { spine: 0.3, twist: -0.35, shF: 1.2, elF: 1.4, shN: 0.2, elN: 1.3 }), k(END(m), {})],
  punch: m => [k(0, { spine: 0.1 }), k(m.su - 1, { spine: -0.18, twist: -0.65, shN: -0.95, elN: 1.9, shF: 0.9, elF: 1.2, hipN: 0.2, knN: -0.95, hipF: -0.85, knF: -0.2, hipY: 0.8 }),
    k(m.su + 1, { spine: 0.48, twist: 0.6, shN: 1.62, elN: 0.0, shF: -0.7, elF: 1.1, hipN: 0.95, knN: -0.72, hipF: -0.8, knF: -0.12, hipY: 0.8 }, true),
    k(m.su + m.ac + 4, { spine: 0.4, twist: 0.45, shN: 1.5, elN: 0.15, shF: -0.5, hipN: 0.9, knN: -0.7, hipF: -0.75, hipY: 0.82 }), k(END(m), {})],
  axe: m => [k(0, { ...AIR, spine: -0.1, hipN: 2.1, knN: -0.35, shN: 0.9, shF: 1.3 }), k(m.su, { ...AIR, spine: -0.25, hipN: 2.4, knN: -0.15, shN: 1.2, shF: 1.6 }),
    k(m.su + 2, { ...AIR, spine: 0.45, hipN: 0.05, knN: -0.1, shN: 0.4, shF: 0.6, bodyZ: -0.2 }, true), k(END(m), { ...AIR })],
  rise: m => [k(0, { hipY: 0.72, spine: 0.42, twist: -0.45, hipN: 1.25, knN: -1.9, hipF: 0.2, knF: -1.8, shN: -0.45, elN: 1.95, shF: 0.7, elF: 1.6 }),
    k(m.su, { hipY: 0.95, spine: -0.2, twist: 0.4, shN: 3.05, elN: 0.04, shF: -0.45, elF: 1.25, hipN: 0.35, knN: -0.45, hipF: -0.25, knF: -1.15, head: 0.35 }, true),
    k(m.su + m.ac, { hipY: 0.95, spine: -0.12, twist: 0.3, shN: 2.95, elN: 0.1, shF: -0.25, elF: 1.3, hipN: 0.6, knN: -1.0, hipF: 0.1, knF: -1.1, head: 0.25 }), k(END(m), { ...AIR })],
  // Wolverine: the claw chain, a spinning finisher, the rising slash, a two-claw overhead heavy
  slash1: m => [k(0, { spine: -0.05, twist: -0.35, shN: 2.6, elN: 1.0, hipN: 0.35, hipF: -0.25 }),
    k(m.su, { spine: 0.42, twist: 0.5, shN: 0.55, elN: 0.08, shF: -0.4, hipN: 0.78, knN: -0.72, hipF: -0.58, knF: -0.3, hipY: 0.84 }, true),
    k(m.su + m.ac + 2, { spine: 0.36, twist: 0.4, shN: 0.2, elN: 0.3, hipN: 0.72, knN: -0.7, hipF: -0.55, hipY: 0.85 }), k(END(m), {})],
  slash2: m => [k(0, { twist: 0.45, shF: -0.55, elF: 0.6, shN: 0.9, elN: 1.2 }),
    k(m.su, { spine: 0.3, twist: -0.45, shF: 2.45, elF: 0.12, shN: -0.45, elN: 0.8, hipN: 0.72, knN: -0.7, hipF: -0.55, hipY: 0.85 }, true),
    k(m.su + m.ac + 2, { spine: 0.24, twist: -0.3, shF: 2.6, elF: 0.3, shN: -0.3 }), k(END(m), {})],
  slash3: m => [k(0, { spine: -0.12, shN: 2.85, shF: 2.6, elN: 1.3, elF: 1.3, hipY: 0.92 }),
    k(m.su, { spine: 0.48, shN: 0.85, shF: 0.7, elN: 0.05, elF: 0.1, hipN: 0.82, knN: -0.85, hipF: -0.62, knF: -0.25, hipY: 0.82 }, true),
    k(m.su + m.ac + 2, { spine: 0.4, shN: 0.4, shF: 0.3, elN: 0.2, elF: 0.3, hipN: 0.8, knN: -0.82, hipF: -0.6, hipY: 0.83 }), k(END(m), {})],
  spin: m => [k(0, { twist: -0.9, shN: 1.2, shF: 1.1, elN: 0.3, elF: 0.4, spine: 0.1, hipY: 0.86 }),
    k(m.su, { twist: 0.2, shN: 1.62, shF: 1.58, elN: 0.05, elF: 0.05, spine: 0.3, hipN: 0.65, knN: -0.65, hipF: -0.62, hipY: 0.83 }, true),
    k(m.su + m.ac, { twist: 0.4, shN: 1.5, shF: 1.5, elN: 0.1, elF: 0.1, spine: 0.3, hipN: 0.65, knN: -0.65, hipF: -0.62, hipY: 0.83 }), k(END(m), {})],
  clawRise: m => [k(0, { hipY: 0.72, spine: 0.42, hipN: 1.2, knN: -1.85, hipF: 0.3, knF: -1.9, shN: -0.5, shF: -0.7 }),
    k(m.su, { hipY: 0.95, spine: -0.1, shN: 2.9, shF: 2.7, elN: 0.1, elF: 0.2, hipN: 0.3, knN: -0.6, hipF: -0.3, knF: -0.95 }, true),
    k(m.su + m.ac, { hipY: 0.95, spine: -0.05, shN: 2.8, shF: 2.6, elN: 0.2, elF: 0.3, hipN: 0.6, knN: -1.1, hipF: 0.2, knF: -1.0 }), k(END(m), { ...AIR })],
  clawAir: m => [k(0, { ...AIR, spine: -0.25, shN: 2.7, shF: 2.5, elN: 0.4, elF: 0.5 }),
    k(m.su, { ...AIR, spine: 0.65, shN: 0.5, shF: 0.4, elN: 0.1, elF: 0.15, bodyZ: -0.3 }, true), k(END(m), { ...AIR })],
  clawHeavy: m => [k(0, { spine: 0.1 }), k(m.su - 1, { spine: -0.32, twist: -0.5, shN: 3.0, shF: 2.9, elN: 0.2, elF: 0.3, hipN: 0.6, knN: -0.8, hipF: -0.7, knF: -0.2, hipY: 0.84 }),
    k(m.su + 1, { spine: 0.62, twist: 0.45, shN: 0.7, shF: 0.6, elN: 0.1, elF: 0.2, hipN: 0.95, knN: -0.95, hipF: -0.75, knF: -0.15, hipY: 0.79 }, true),
    k(m.su + m.ac + 5, { spine: 0.5, twist: 0.3, shN: 0.5, shF: 0.4, hipN: 0.9, knN: -0.9, hipF: -0.72, hipY: 0.8 }), k(END(m), {})],
  // Jean: open-palm telekinetic pushes, the far hand at her temple
  palm1: m => [k(0, { twist: -0.3, shN: 0.6, elN: 1.6, shF: 2.6, elF: 2.3 }), k(m.su, { spine: 0.22, twist: 0.35, shN: 1.62, elN: 0.04, shF: 2.6, elF: 2.3, hipN: 0.55, knN: -0.6, hipF: -0.45, hipY: 0.88 }, true),
    k(m.su + m.ac + 3, { spine: 0.18, twist: 0.25, shN: 1.55, elN: 0.1, shF: 2.5, elF: 2.2, hipN: 0.5, knN: -0.55, hipF: -0.4 }), k(END(m), {})],
  palm2: m => [k(0, { twist: 0.35, shF: 0.4, elF: 1.6, shN: 2.5, elN: 2.2 }), k(m.su, { spine: 0.25, twist: -0.35, shF: 1.62, elF: 0.05, shN: 2.5, elN: 2.2, hipN: 0.6, knN: -0.6, hipF: -0.5, hipY: 0.87 }, true),
    k(m.su + m.ac + 3, { spine: 0.2, twist: -0.25, shF: 1.5, elF: 0.12 }), k(END(m), {})],
  push: m => [k(0, { spine: -0.1, shN: 0.4, elN: 1.9, shF: 0.3, elF: 1.9, hipY: 0.9 }),
    k(m.su, { spine: 0.35, shN: 1.62, elN: 0.02, shF: 1.5, elF: 0.06, hipN: 0.8, knN: -0.7, hipF: -0.65, knF: -0.2, hipY: 0.84, head: -0.15 }, true),
    k(m.su + m.ac + 4, { spine: 0.3, shN: 1.55, elN: 0.08, shF: 1.45, elF: 0.1, hipN: 0.75, knN: -0.7, hipF: -0.6, hipY: 0.85 }), k(END(m), {})],
  palmAir: m => [k(0, { ...AIR, spine: -0.15, shN: 2.2, elN: 0.8, shF: 2.6, elF: 2.3 }), k(m.su, { ...AIR, spine: 0.4, shN: 1.1, elN: 0.05, shF: 2.5, elF: 2.2, bodyZ: -0.15 }, true), k(END(m), { ...AIR })],
  lift: m => [k(0, { hipY: 0.82, spine: 0.3, shN: -0.3, elN: 0.6, shF: -0.4, elF: 0.6, hipN: 0.7, knN: -1.1, hipF: -0.1, knF: -0.9 }),
    k(m.su, { hipY: 0.95, spine: -0.15, shN: 2.9, elN: 0.05, shF: 2.8, elF: 0.1, hipN: 0.3, knN: -0.5, hipF: -0.2, knF: -0.7, head: 0.35 }, true), k(END(m), { ...AIR })],
};
// Which strike each hero's move plays
const MOVE_KEYS = {
  cyclops: { g1: 'backhand', g2: 'elbow', g3: 'punch', air: 'axe', up: 'rise', heavy: 'punch' },
  wolverine: { g1: 'slash1', g2: 'slash2', g3: 'slash3', g4: 'spin', air: 'clawAir', up: 'clawRise', heavy: 'clawHeavy' },
  jean: { g1: 'palm1', g2: 'palm2', g3: 'push', air: 'palmAir', up: 'lift', heavy: 'push' },
};
const SPIN = { wolverine: { g4: [1, 'y'] } };

const keyCache = new Map();
function attackPose(p, out) {
  const id = p.move.id, m = MOVES[p.hero][id], name = (MOVE_KEYS[p.hero] || {})[id] || 'backhand', ck = p.hero + ':' + id;
  let ks = keyCache.get(ck);
  if (!ks) {
    const base = id === 'air' ? { ...FIGHT, ...AIR } : FIGHT;
    ks = STRIKES[name](m).map(q => ({ t: q.t, snap: q.snap, pose: { ...base, ...q.pose } }));
    keyCache.set(ck, ks);
  }
  const u = p.move.t;
  if (u <= ks[0].t) return Object.assign(out, ks[0].pose);
  for (let i = 1; i < ks.length; i++) {
    const a = ks[i - 1], b = ks[i];
    if (u <= b.t) { const f = (u - a.t) / Math.max(1e-6, b.t - a.t); return mixPose(a.pose, b.pose, b.snap ? snapEase(f) : ease(f), out); }
  }
  return Object.assign(out, ks[ks.length - 1].pose);
}

// ---- A hero's pose for this frame ------------------------------------------------------------------------------
// p: a player, or an assist (a benched hero called in, with a few of the same fields). t: seconds since start.
export function animateHero(rig, p, dt, t) {
  const P = { ...REST }, H = HEROES[p.hero];
  const speed = Math.abs(p.vx), st = p.state, hero = p.hero, onGround = !!p.onGround;
  const aimX = p.aimX === undefined ? p.facing : p.aimX, aimY = p.aimY || 0;
  const aimAng = Math.atan2(aimY, Math.abs(aimX) < 1e-3 ? 1e-3 : aimX * p.facing);
  let rate = 18, yaw = 0, roll = 0;
  const breathe = Math.sin(t * 2.2 + (hero === 'wolverine' ? 1 : 0));

  if (st === 'downed' || st === 'dead') {
    Object.assign(P, { bodyZ: 1.45, hipY: 0.2, shN: 2.6, shF: 2.2, hipN: 0.2, hipF: -0.1 }); rate = 10;
  } else if (st === 'held') {
    // Held overhead for the Fastball Special: curled tight, claws out, ready to fly
    Object.assign(P, { spine: 0.6, hipN: 1.6, knN: -2.2, hipF: 1.4, knF: -2.1, shN: 1.9, elN: 0.2, shF: 1.7, elF: 0.3, hipY: 0.95, head: -0.3, bodyZ: 0.3 }); rate = 24;
  } else if (st === 'thrown' && p.thrown) {
    // Claws first along the throw, the body laid out behind them, corkscrewing
    const a = Math.atan2(p.thrown.dy, Math.abs(p.thrown.dx) < 1e-3 ? 1e-3 : p.thrown.dx * p.facing);
    Object.assign(P, { spine: 0.1, shN: Math.PI - 0.08, elN: 0.05, shF: Math.PI + 0.08, elF: 0.05, hipN: 0.2, knN: -0.3, hipF: 0.1, knF: -0.2, hipY: 0.95, head: -0.2, bodyZ: a - Math.PI / 2 });
    yaw = Math.PI * 2 * 3 * Math.min(1, (p.thrown.t || 0) / 26) * (p.facing > 0 ? 1 : -1);
    rate = 60;
  } else if (st === 'teamup' || p.fastball) {
    // Jean holding Wolverine overhead, aiming the throw
    Object.assign(P, { spine: -0.2, shN: 2.95, elN: 0.25, shF: 3.0, elF: 0.3, hipN: 0.5, knN: -0.6, hipF: -0.45, knF: -0.3, hipY: 0.9, head: Math.max(-0.5, Math.min(0.5, -aimAng * 0.6)) }); rate = 26;
  } else if (st === 'ult') {
    // To Me, My X-Men: everyone braced, fists or hands raised
    Object.assign(P, { spine: -0.3, shN: 2.9, elN: 0.2, shF: 2.4, elF: 0.6, hipN: 0.55, knN: -0.8, hipF: -0.45, knF: -0.4, hipY: 0.88, head: 0.35 });
    P.spine += Math.sin(t * 40) * 0.02; rate = 26;
  } else if (st === 'drill' && p.drill) {
    // The Drill Claw: both fists driven out ahead, the body laid along the drill, corkscrewing
    const a = Math.atan2(p.drill.dy, Math.abs(p.drill.dx) < 1e-3 ? 1e-3 : p.drill.dx * p.facing);
    Object.assign(P, { spine: 0.1, shN: Math.PI - 0.08, elN: 0.05, shF: Math.PI + 0.08, elF: 0.05, hipN: 0.5, knN: -0.9, hipF: 0.2, knF: -0.7, hipY: 0.95, head: -0.2, bodyZ: a - Math.PI / 2 });
    yaw = Math.PI * 2 * 2.5 * snapEase(Math.min(1, p.drill.t / 14)) * (p.facing > 0 ? 1 : -1);
    rate = 60;
  } else if (st === 'attack' && p.move) {
    attackPose(p, P);
    const sp = (SPIN[hero] || {})[p.move.id], m = MOVES[hero][p.move.id];
    if (sp) { const a = Math.max(0, Math.min(1, (p.move.t - m.su) / m.ac)), ang = Math.PI * 2 * sp[0] * snapEase(a); if (sp[1] === 'z') roll = -ang; else yaw = ang; }
    if (p.move.id === 'heavy' && p.move.t < m.su) P.spine += (Math.random() - 0.5) * 0.03;   // trembling as it winds up
    rate = 48;
  } else if (st === 'evade' && p.evade) {
    const V = H.evade, u = Math.min(1, p.evade.t / V.ticks), back = p.evade.dir * p.facing < 0;
    if (hero === 'cyclops') {
      // A backflip: tucked, a full turn over the evade
      Object.assign(P, { spine: 0.5, hipN: 1.5, knN: -2.1, hipF: 1.3, knF: -2.0, shN: 1.3, elN: 1.4, shF: 1.1, elF: 1.5, hipY: 0.9 });
      roll = (back ? 1 : -1) * Math.PI * 2 * snapEase(u);
    } else if (hero === 'wolverine') {
      // A roll along the floor
      Object.assign(P, { spine: 0.9, hipN: 1.6, knN: -2.2, hipF: 1.4, knF: -2.1, shN: 1.5, elN: 1.6, shF: 1.3, elF: 1.6, hipY: 0.6 });
      roll = (back ? 1 : -1) * Math.PI * 2 * u;
    } else {
      // A telekinetic blink: a light lean, arms trailing (the view flickers her)
      Object.assign(P, { spine: back ? -0.3 : 0.45, hipN: 0.6, knN: -1.0, hipF: -0.4, knF: -0.6, shN: back ? 1.3 : -0.8, elN: 0.5, shF: back ? 1.0 : -1.0, elF: 0.4, hipY: 0.9 });
    }
    rate = 40;
  } else if (st === 'hitstun') {
    Object.assign(P, { spine: -0.5, head: 0.35, shN: 1.0, shF: 1.4, elN: 0.7, elF: 0.4, hipN: 0.35, knN: -0.55, hipF: -0.1, twist: -0.3 }); rate = 30;
  } else if (!onGround) {
    if (p.climbing) {
      // Wolverine climbing: claws into the wall, alternating reaches
      const s = Math.sin(t * 12);
      Object.assign(P, { spine: -0.25, shN: 2.6 + s * 0.3, elN: 0.6, shF: 2.4 - s * 0.3, elF: 0.7, hipN: 0.9 + s * 0.4, knN: -1.4, hipF: 0.7 - s * 0.4, knF: -1.3, head: 0.3 });
    } else if (p.levitating) {
      // Jean levitating: upright, arms out and down
      Object.assign(P, { spine: -0.05 + breathe * 0.03, shN: 0.8, elN: 0.3, shF: 0.7, elF: 0.3, hipN: 0.15, knN: -0.35, hipF: -0.05, knF: -0.5, head: 0.1 });
    } else if (p.wallSlide) Object.assign(P, { shF: -2.2, elF: 0.35, shN: 0.55, elN: 0.9, hipN: 0.75, knN: -1.25, hipF: -0.35, knF: -0.45, spine: -0.12, head: 0.1 });
    else if (p.vy > 3) Object.assign(P, { hipN: 0.95, knN: -1.45, hipF: 0.2, knF: -0.85, shN: 1.7, shF: 1.25, elN: 0.5, spine: 0.12, head: 0.05 });
    else if (p.vy > -3) Object.assign(P, { hipN: 0.7, knN: -1.2, hipF: 0.35, knF: -1.1, shN: 1.2, shF: 1.4, elN: 0.6, elF: 0.6, spine: 0.08 });
    else Object.assign(P, { hipN: 0.3, knN: -0.4, hipF: -0.3, knF: -0.75, shN: 1.05, shF: 0.85, elN: 0.5, elF: 0.4, spine: 0.04, head: -0.1 });
    rate = 16;
  } else if (hero === 'wolverine' && p.drillT > 0) {
    // Coiling the Drill Claw: low, both fists back, trembling more at each tier
    const tier = p.drillT >= H.drill.tiers[2] ? 2 : p.drillT >= H.drill.tiers[1] ? 1 : 0;
    Object.assign(P, { hipY: 0.66, spine: 0.55, hipN: 1.3, knN: -1.9, hipF: -0.4, knF: -0.9, shN: -0.9, elN: 0.5, shF: -1.0, elF: 0.6, head: -0.3 });
    const j = (Math.random() - 0.5) * 0.02 * (tier + 1); P.spine += j; P.hipY += j;
    rate = 24;
  } else if (speed > 0.6) {
    // Sprint: knees high, arms pumping, leaning into it
    const back = p.vx * p.facing < 0, amp = Math.min(1, speed / 7);
    rig.phase += dt * speed * 1.8 * (back ? -1 : 1);
    const s = Math.sin(rig.phase), c = Math.cos(rig.phase);
    Object.assign(P, { hipN: s * 0.95 * amp + 0.05, hipF: -s * 0.95 * amp + 0.05, knN: -Math.max(0, -c) * 1.45 * amp - 0.15, knF: -Math.max(0, c) * 1.45 * amp - 0.15,
      shN: -s * 0.95 * amp, shF: s * 0.95 * amp, elN: 1.15, elF: 1.15, spine: (back ? 0.05 : 0.3) * amp, hipY: 0.95 - Math.abs(c) * 0.07, twist: -s * 0.15 * amp, head: -0.2 * amp });
    if (hero === 'wolverine' && p.berserkT > 0) Object.assign(P, { spine: 0.55 * amp, shN: -s * 1.2 * amp - 0.3, shF: s * 1.2 * amp - 0.3, elN: 0.6, elF: 0.6 });
    rate = 22;
  } else {
    // Idle: each their own ready stance, breathing
    if (hero === 'wolverine') Object.assign(P, { spine: 0.22 + breathe * 0.02, hipN: 0.45, knN: -0.6, hipF: -0.3, knF: -0.35, hipY: 0.86 + breathe * 0.006, shN: 0.6, elN: 1.2, shF: 0.3, elF: 1.3, head: -0.12, twist: 0.1 });
    else if (hero === 'jean') Object.assign(P, { spine: 0.04 + breathe * 0.015, hipN: 0.1, knN: -0.1, hipF: -0.12, knF: -0.18, hipY: 0.94 + breathe * 0.005, shN: 0.35, elN: 0.5, shF: 0.15, elF: 0.8 });
    else Object.assign(P, { spine: 0.06 + breathe * 0.015, hipN: 0.2, knN: -0.25, hipF: -0.15, knF: -0.15, hipY: 0.93 + breathe * 0.005, shN: 0.3, elN: 0.7, shF: -0.05, elF: 0.4 });
    if (hero === 'wolverine' && p.berserkT > 0) Object.assign(P, { spine: 0.5, shN: 1.4, elN: 0.6, shF: 1.2, elF: 0.7, hipY: 0.8, knN: -0.9, head: -0.25 });
    if (hero === 'cyclops' && p.overheatT > 0) Object.assign(P, { spine: 0.35, shN: 2.55, elN: 2.35, head: 0.25, hipY: 0.9 });   // a breather, hand to the visor
    rate = 10;
  }

  // Aiming layers: Cyclops's hand to the visor while he holds it open; Jean's arm along her grip
  if (hero === 'cyclops' && p.openT > 0 && st === 'normal') { P.shN = 2.55 + P.spine * 0.5; P.elN = 2.35; P.head = Math.max(-0.7, Math.min(0.7, -aimAng * 0.85)); }
  if (hero === 'jean' && p.tk && st === 'normal') { P.shN = aimAng + Math.PI / 2 + P.spine; P.elN = 0.04; P.shF = 2.6; P.elF = 2.3; P.head = Math.max(-0.5, Math.min(0.5, -aimAng * 0.5)); }
  P.head += -P.spine * 0.45;

  applyPose(rig, P, rate, dt, yaw, roll, onGround, p.vy, st === 'downed' || st === 'dead');

  // Suit details: Wolverine's claws come out to fight; Cyclops's visor blazes with the aperture
  const ex = rig.extra;
  if (ex.claws) {
    const out = ['attack', 'drill', 'held', 'thrown', 'ult'].includes(st) || p.drillT > 0 || p.berserkT > 0 || !!p.edge;
    rig.claws += ((out ? 1 : 0) - rig.claws) * (1 - Math.exp(-dt * (out ? 40 : 12)));
    for (const c of ex.claws) { c.visible = rig.claws > 0.05; c.scale.set(1, Math.max(0.01, rig.claws), 1); }
    ex.clawMat.emissive.set(p.edge ? '#ff3a24' : p.berserkT > 0 ? '#ff8a1f' : '#eef3f8');
    ex.clawMat.emissiveIntensity = p.edge ? 2.2 + Math.sin(t * 30) * 0.4 : p.berserkT > 0 ? 1.2 + Math.sin(t * 22) * 0.5 : 0.5;
  }
  if (ex.visor) {
    const open = p.openT > 0 ? Math.min(1, p.openT / H.optic.open) : 0;
    ex.visor.emissiveIntensity = p.overheatT > 0 ? 0.3 + (Math.sin(t * 25) > 0 ? 0.3 : 0) : 1.0 + open * 2.4 + (open ? Math.sin(t * 30) * 0.3 : 0);
  }
}

// The kid: caged, following, cowering, carried off, held in Jean's grip, running for the jet
export function animateKid(rig, k, dt, t) {
  const P = { ...REST }; let rate = 14;
  const speed = Math.abs(k.vx), breathe = Math.sin(t * 3);
  if (k.state === 'downed') { Object.assign(P, { bodyZ: 1.45, hipY: 0.2, shN: 2.6, shF: 2.2, hipN: 0.2, hipF: -0.1 }); rate = 10; }
  else if (k.state === 'carried') {
    const s = Math.sin(t * 16);
    Object.assign(P, { spine: 0.6, bodyZ: 0.9, hipN: 0.6 + s * 0.6, knN: -1.2, hipF: 0.2 - s * 0.6, knF: -1.0, shN: 2.2 + s * 0.4, elN: 0.6, shF: 1.6 - s * 0.4, elF: 0.6, head: 0.4 }); rate = 30;
  } else if (k.state === 'held') {
    Object.assign(P, { spine: -0.1, shN: 1.2, elN: 0.2, shF: 1.0, elF: 0.3, hipN: 0.3, knN: -0.6, hipF: 0.1, knF: -0.7, head: 0.2 }); rate = 12;
  } else if (k.state === 'cower') {
    Object.assign(P, { hipY: 0.55, spine: 0.85 + breathe * 0.04, hipN: 1.5, knN: -2.2, hipF: 1.3, knF: -2.2, shN: 2.9, elN: 2.4, shF: 2.8, elF: 2.4, head: 0.3 }); rate = 18;
  } else if (k.state === 'caged') {
    // Pacing behind the door
    Object.assign(P, { spine: 0.1 + breathe * 0.02, shN: 1.5, elN: 0.9, shF: 1.3, elF: 1.0, hipN: 0.05, hipF: -0.05, head: 0.15 }); rate = 8;
    if (speed > 0.1) { rig.phase += dt * speed * 3; const s = Math.sin(rig.phase); Object.assign(P, { hipN: s * 0.3, hipF: -s * 0.3, knN: -0.3, knF: -0.3 }); }
  } else if (!k.onGround) Object.assign(P, { hipN: 0.95, knN: -1.45, hipF: 0.2, knF: -0.85, shN: 1.9, shF: 1.6, elN: 0.5, spine: 0.1 });
  else if (speed > 0.5) {
    rig.phase += dt * speed * 2.2;
    const s = Math.sin(rig.phase), c = Math.cos(rig.phase), amp = Math.min(1, speed / 5);
    Object.assign(P, { hipN: s * 0.9 * amp, hipF: -s * 0.9 * amp, knN: -Math.max(0, -c) * 1.3 * amp - 0.1, knF: -Math.max(0, c) * 1.3 * amp - 0.1,
      shN: -s * 0.8 * amp, shF: s * 0.8 * amp, elN: 1.2, elF: 1.2, spine: 0.25 * amp, hipY: 0.95 - Math.abs(c) * 0.06 });
    rate = 22;
  } else Object.assign(P, { spine: 0.08 + breathe * 0.02, shN: 0.3, elN: 0.8, shF: 0.2, elF: 0.9, head: 0.1, hipY: 0.94 });
  P.head += -P.spine * 0.4;
  applyPose(rig, P, rate, dt, 0, 0, !!k.onGround, k.vy, k.state === 'downed');
}

function applyPose(rig, P, rate, dt, yaw, roll, onGround, vy, lying) {
  const cur = rig.cur, a = 1 - Math.exp(-rate * dt);
  for (const j of J) cur[j] = cur[j] === undefined ? P[j] : cur[j] + (P[j] - cur[j]) * a;
  // Squash on every landing (bigger the harder), a stretch on take-off
  if (!onGround && rig.wasGround && vy > 8) rig.stretch = Math.max(rig.stretch, 0.08);
  if (onGround && !rig.wasGround) rig.stretch = -Math.min(0.16, Math.max(0.03, (-rig.lastVy - 4) * 0.008));
  rig.wasGround = onGround; if (!onGround) rig.lastVy = vy;
  rig.stretch *= Math.exp(-dt * 10);
  const sy = 1 + rig.stretch, sxz = 1 / Math.sqrt(sy);
  const base = rig.body.userData.base || (rig.body.userData.base = rig.body.scale.x);
  rig.body.scale.set(base * sxz, base * sy, base * sxz);
  rig.spine.rotation.z = -cur.spine; rig.spine.rotation.y = cur.twist;
  rig.head.rotation.z = -cur.head;
  rig.armN.top.rotation.z = cur.shN; rig.armN.joint.rotation.z = cur.elN;
  rig.armF.top.rotation.z = cur.shF; rig.armF.joint.rotation.z = cur.elF;
  rig.legN.top.rotation.z = cur.hipN; rig.legN.joint.rotation.z = cur.knN;
  rig.legF.top.rotation.z = cur.hipF; rig.legF.joint.rotation.z = cur.knF;
  rig.hips.position.y = cur.hipY;
  rig.body.rotation.z = cur.bodyZ;
  // Whole-body spins are driven directly (easing would unwind them); between spins they settle to 0
  rig.yaw = yaw ? yaw : rig.yaw * Math.exp(-dt * 20);
  if (!yaw && Math.abs(rig.yaw) > 0.01) { rig.yaw = rig.yaw % (Math.PI * 2); if (rig.yaw > Math.PI) rig.yaw -= Math.PI * 2; }
  rig.body.rotation.y = rig.yaw;
  rig.roll = roll ? roll : rig.roll * Math.exp(-dt * 20);
  if (!roll && Math.abs(rig.roll) > 0.01) { rig.roll = rig.roll % (Math.PI * 2); if (rig.roll < -Math.PI) rig.roll += Math.PI * 2; }
  rig.hips.rotation.z = rig.roll;
  rig.body.position.y = lying ? 0.1 : 0;
}
