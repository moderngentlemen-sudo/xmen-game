// Procedural animation for the player rigs. Every pose aims for the same energy as the charged-dash coil:
// strong, asymmetric silhouettes, weight low and committed, anticipation before a strike and follow-through
// after it, the torso twisting into blows, and secondary motion (breathing, bob, head counter-motion).
// Attacks are keyframed per move (windup, a snapping strike, follow-through); everything eases toward its
// target at a rate set per state, independent of frame rate.
import { MOVES, SCARF, SETTINGS, ATTACH_LOOK, DASH_CHARGE, HUNTER, MARKSMAN, DASH_SLASH, ULT } from './config.js';
import { chargeStage, burstStage } from './player.js';

// Joints: spine pitch (+ leans forward), twist (torso turn), shoulders/elbows (near = weapon arm, far),
// hips/knees, hip height, whole-body tilt, head pitch
const J = ['spine', 'twist', 'shN', 'elN', 'shF', 'elF', 'hipN', 'knN', 'hipF', 'knF', 'hipY', 'bodyZ', 'head'];
const REST = { spine: 0.04, twist: 0, shN: 0.12, elN: 0.3, shF: -0.1, elF: 0.3, hipN: 0.04, knN: -0.08, hipF: -0.04, knF: -0.08, hipY: 0.95, bodyZ: 0, head: 0 };
// A ready fighting stance that attack poses build on
const FIGHT = { spine: 0.18, twist: 0, shN: 0.7, elN: 1.0, shF: 0.35, elF: 1.1, hipN: 0.4, knN: -0.5, hipF: -0.32, knF: -0.35, hipY: 0.9, bodyZ: 0, head: -0.1 };
const AIR = { hipN: 0.9, knN: -1.35, hipF: 0.45, knF: -1.05, hipY: 0.95 };

const ease = k => k * k * (3 - 2 * k);
const snapEase = k => 1 - Math.pow(1 - k, 3);
function mixPose(a, b, k, out) { for (const j of J) out[j] = a[j] + (b[j] - a[j]) * k; return out; }

// ---- Attack keyframes ------------------------------------------------------------------------
// keys(m) returns [[tick, pose, snap?], ...]; poses are partial and merge over the move's base stance
// (FIGHT on the ground, FIGHT + AIR in the air). `yaw` (whole-body spin) is given separately per move.
const k = (t, pose, snap = false) => ({ t, pose, snap });
const END = m => m.su + m.ac + m.rc;
const KEYS = {
  // Nova, Marksman close range: backhand, hard-light elbow, blast punch, axe kick
  nova_k1: m => [k(0, { spine: 0.05, twist: -0.4, shN: -0.4, elN: 1.7, hipY: 0.9 }), k(m.su, { spine: 0.32, twist: 0.45, shN: 1.75, elN: 0.1, hipN: 0.65, knN: -0.7, hipF: -0.55, hipY: 0.86 }, true),
    k(m.su + m.ac + 3, { spine: 0.28, twist: 0.3, shN: 1.45, elN: 0.35, hipN: 0.6, knN: -0.65, hipF: -0.5 }), k(END(m), {})],
  nova_k2: m => [k(0, { twist: 0.4, shF: -0.35, elF: 2.2, shN: 0.9, elN: 1.4 }), k(m.su, { spine: 0.38, twist: -0.5, shF: 1.45, elF: 1.65, shN: -0.3, elN: 1.4, hipN: 0.7, knN: -0.75, hipF: -0.55, hipY: 0.86 }, true),
    k(m.su + m.ac + 3, { spine: 0.3, twist: -0.35, shF: 1.2, elF: 1.4, shN: 0.2, elN: 1.3 }), k(END(m), {})],
  nova_k3: m => [k(0, { spine: 0.1 }), k(m.su - 1, { spine: -0.18, twist: -0.65, shN: -0.95, elN: 1.9, shF: 0.9, elF: 1.2, hipN: 0.2, knN: -0.95, hipF: -0.85, knF: -0.2, hipY: 0.8 }),
    k(m.su + 1, { spine: 0.48, twist: 0.6, shN: 1.62, elN: 0.0, shF: -0.7, elF: 1.1, hipN: 0.95, knN: -0.72, hipF: -0.8, knF: -0.12, hipY: 0.8 }, true),
    k(m.su + m.ac + 4, { spine: 0.4, twist: 0.45, shN: 1.5, elN: 0.15, shF: -0.5, hipN: 0.9, knN: -0.7, hipF: -0.75, hipY: 0.82 }), k(END(m), {})],
  nova_kair: m => [k(0, { ...AIR, spine: -0.1, hipN: 2.1, knN: -0.35, shN: 0.9, shF: 1.3 }), k(m.su, { ...AIR, spine: -0.25, hipN: 2.4, knN: -0.15, shN: 1.2, shF: 1.6 }),
    k(m.su + 2, { ...AIR, spine: 0.45, hipN: 0.05, knN: -0.1, shN: 0.4, shF: 0.6, bodyZ: -0.2 }, true), k(END(m), { ...AIR })],
  // Solar Uppercut: crouched with the fist cocked low, then driven straight up as the boots fire
  nova_rise: m => [k(0, { hipY: 0.72, spine: 0.42, twist: -0.45, hipN: 1.25, knN: -1.9, hipF: 0.2, knF: -1.8, shN: -0.45, elN: 1.95, shF: 0.7, elF: 1.6 }),
    k(m.su, { hipY: 0.95, spine: -0.2, twist: 0.4, shN: 3.05, elN: 0.04, shF: -0.45, elF: 1.25, hipN: 0.35, knN: -0.45, hipF: -0.25, knF: -1.15, head: 0.35 }, true),
    k(m.su + m.ac, { hipY: 0.95, spine: -0.12, twist: 0.3, shN: 2.95, elN: 0.1, shF: -0.25, elF: 1.3, hipN: 0.6, knN: -1.0, hipF: 0.1, knF: -1.1, head: 0.25 }),
    k(END(m), { ...AIR })],
  // Echo, Hunter kit: blades, then the glaive
  echo_b1: m => [k(0, { spine: -0.05, twist: -0.35, shN: 2.6, elN: 1.0, hipN: 0.35, hipF: -0.25 }),
    k(m.su, { spine: 0.42, twist: 0.5, shN: 0.55, elN: 0.08, shF: -0.4, hipN: 0.78, knN: -0.72, hipF: -0.58, knF: -0.3, hipY: 0.84 }, true),
    k(m.su + m.ac + 2, { spine: 0.36, twist: 0.4, shN: 0.2, elN: 0.3, hipN: 0.72, knN: -0.7, hipF: -0.55, hipY: 0.85 }), k(END(m), {})],
  echo_b2: m => [k(0, { twist: 0.45, shF: -0.55, elF: 0.6, shN: 0.9, elN: 1.2 }),
    k(m.su, { spine: 0.3, twist: -0.45, shF: 2.45, elF: 0.12, shN: -0.45, elN: 0.8, hipN: 0.72, knN: -0.7, hipF: -0.55, hipY: 0.85 }, true),
    k(m.su + m.ac + 2, { spine: 0.24, twist: -0.3, shF: 2.6, elF: 0.3, shN: -0.3 }), k(END(m), {})],
  echo_b3: m => [k(0, { spine: -0.12, shN: 2.85, shF: 2.6, elN: 1.3, elF: 1.3, hipY: 0.92 }),
    k(m.su, { spine: 0.48, shN: 0.85, shF: 0.7, elN: 0.05, elF: 0.1, hipN: 0.82, knN: -0.85, hipF: -0.62, knF: -0.25, hipY: 0.82 }, true),
    k(m.su + m.ac + 2, { spine: 0.4, shN: 0.4, shF: 0.3, elN: 0.2, elF: 0.3, hipN: 0.8, knN: -0.82, hipF: -0.6, hipY: 0.83 }), k(END(m), {})],
  echo_b4: m => [k(0, { twist: -0.9, shN: 1.2, shF: 1.1, elN: 0.3, elF: 0.4, spine: 0.1, hipY: 0.86 }),
    k(m.su, { twist: 0.2, shN: 1.62, shF: 1.58, elN: 0.05, elF: 0.05, spine: 0.3, hipN: 0.65, knN: -0.65, hipF: -0.62, hipY: 0.83 }, true),
    k(m.su + m.ac, { twist: 0.4, shN: 1.5, shF: 1.5, elN: 0.1, elF: 0.1, spine: 0.3, hipN: 0.65, knN: -0.65, hipF: -0.62, hipY: 0.83 }),
    k(END(m), {})],
  echo_rise: m => [k(0, { hipY: 0.72, spine: 0.42, hipN: 1.2, knN: -1.85, hipF: 0.3, knF: -1.9, shN: -0.5, shF: -0.7 }),
    k(m.su, { hipY: 0.95, spine: -0.1, shN: 2.9, shF: 2.7, elN: 0.1, elF: 0.2, hipN: 0.3, knN: -0.6, hipF: -0.3, knF: -0.95 }, true),
    k(m.su + m.ac, { hipY: 0.95, spine: -0.05, shN: 2.8, shF: 2.6, elN: 0.2, elF: 0.3, hipN: 0.6, knN: -1.1, hipF: 0.2, knF: -1.0 }),
    k(END(m), { ...AIR })],
  echo_ab1: m => [k(0, { ...AIR, twist: -0.35, shN: 2.6, elN: 1.0 }), k(m.su, { ...AIR, spine: 0.4, twist: 0.45, shN: 0.55, elN: 0.08 }, true), k(END(m), { ...AIR })],
  echo_ab2: m => [k(0, { ...AIR, twist: 0.45, shF: -0.55, elF: 0.6 }), k(m.su, { ...AIR, spine: 0.3, twist: -0.45, shF: 2.45, elF: 0.12, shN: -0.4 }, true), k(END(m), { ...AIR })],
  echo_ab3: m => [k(0, { ...AIR, spine: -0.25, shN: 2.7, shF: 2.5, elN: 0.4, elF: 0.5 }),
    k(m.su, { ...AIR, spine: 0.65, shN: 0.5, shF: 0.4, elN: 0.1, elF: 0.15, bodyZ: -0.3 }, true), k(END(m), { ...AIR })],
  echo_spin: m => [k(0, { ...AIR, shN: 1.6, shF: 1.6, elN: 0.1, elF: 0.1, hipN: 1.15, knN: -1.7, hipF: 0.95, knF: -1.6 }),
    k(END(m), { ...AIR, shN: 1.2, shF: 1.1, elN: 0.4, elF: 0.4 })],
  echo_wall: m => [k(0, { spine: -0.1, twist: -0.4, shN: 2.5, elN: 0.9, shF: -2.2, elF: 0.35, hipN: 0.75, knN: -1.25, hipF: -0.35, knF: -0.45, hipY: 0.95 }),
    k(m.su, { spine: 0.35, twist: 0.5, shN: 0.4, elN: 0.05, shF: -2.2, elF: 0.35, hipN: 0.8, knN: -1.2, hipF: -0.35, knF: -0.45, hipY: 0.95 }, true),
    k(END(m), { spine: -0.1, shN: 0.6, elN: 0.8, shF: -2.2, elF: 0.35, hipN: 0.75, knN: -1.25, hipF: -0.35, knF: -0.45, hipY: 0.95 })],
  echo_charged: m => [k(0, { spine: 0.1 }), k(m.su - 1, { spine: -0.32, twist: -0.5, shN: 3.0, shF: 2.9, elN: 0.2, elF: 0.3, hipN: 0.6, knN: -0.8, hipF: -0.7, knF: -0.2, hipY: 0.84 }),
    k(m.su + 1, { spine: 0.62, twist: 0.45, shN: 0.7, shF: 0.6, elN: 0.1, elF: 0.2, hipN: 0.95, knN: -0.95, hipF: -0.75, knF: -0.15, hipY: 0.79 }, true),
    k(m.su + m.ac + 5, { spine: 0.5, twist: 0.3, shN: 0.5, shF: 0.4, hipN: 0.9, knN: -0.9, hipF: -0.72, hipY: 0.8 }), k(END(m), {})],
  echo_riposte: m => [k(0, { shN: 0.4, elN: 1.8, twist: -0.3 }), k(m.su, { spine: 0.48, twist: 0.5, shN: 1.62, elN: 0.0, shF: -0.6, hipN: 0.95, knN: -0.8, hipF: -0.8, knF: -0.15, hipY: 0.8 }, true), k(END(m), {})],
};
// The Pass 1 kits reuse the closest look
Object.assign(KEYS, {
  nova_jab1: KEYS.nova_k1, nova_jab2: KEYS.nova_k2, nova_shove: KEYS.nova_k3, nova_brace: KEYS.nova_k3, nova_air: KEYS.nova_kair,
  echo_g1: KEYS.echo_b1, echo_g2: KEYS.echo_b2, echo_g3: KEYS.echo_b4, echo_launch: KEYS.echo_rise,
  echo_air1: KEYS.echo_ab1, echo_air2: KEYS.echo_ab2, echo_air3: KEYS.echo_ab3,
});
// Whole-body spins (turns) spread over a move's active frames: 'y' turns about the vertical axis (a
// corkscrew), 'z' is a somersault in the view plane about the hips, so the glaive draws a full disk on screen
const SPIN = { echo_b4: [1, 'y'], echo_rise: [2, 'y'], echo_spin: [2, 'z'] };

const keyCache = new Map();
function attackPose(p, out) {
  const id = p.moveId, m = MOVES[id];
  let ks = keyCache.get(id);
  if (!ks) {
    const base = m.air ? { ...FIGHT, ...AIR } : FIGHT;
    ks = (KEYS[id] || KEYS.echo_b1)(m).map(q => ({ t: q.t, snap: q.snap, pose: { ...base, ...q.pose } }));
    keyCache.set(id, ks);
  }
  const u = p.st;
  if (u <= ks[0].t) return Object.assign(out, ks[0].pose);
  for (let i = 1; i < ks.length; i++) {
    const a = ks[i - 1], b = ks[i];
    if (u <= b.t) { const f = (u - a.t) / Math.max(1e-6, b.t - a.t); return mixPose(a.pose, b.pose, b.snap ? snapEase(f) : ease(f), out); }
  }
  return Object.assign(out, ks[ks.length - 1].pose);
}

function staffMove(id) { return id && MOVES[id] && MOVES[id].staff; }
const dashLevelOf = p => (p.state !== 'dashCharge' ? 0 : p.dashChargeT >= DASH_CHARGE.charge[2] ? 3 : p.dashChargeT >= DASH_CHARGE.charge[1] ? 2 : p.dashChargeT >= DASH_CHARGE.charge[0] ? 1 : 0);

// ---- The pose for this frame -----------------------------------------------------------------
export function animatePlayer(rig, p, dt, t) {
  const P = { ...REST };
  const speed = Math.abs(p.vx), st = p.state, echo = p.char === 'echo', mk = !echo && SETTINGS.novaKit === 'marksman';
  const aimAng = Math.atan2(p.aimY, Math.abs(p.aimX) < 1e-3 ? 1e-3 : p.aimX * p.facing);
  let rate = 18, yaw = 0, roll = 0;   // rate: how fast joints ease toward the pose (per second)
  const breathe = Math.sin(t * 2.2 + (echo ? 1 : 0));

  if (st === 'downed' || st === 'dead') {
    Object.assign(P, { bodyZ: 1.45, hipY: 0.2, shN: 2.6, shF: 2.2, hipN: 0.2, hipF: -0.1 }); rate = 10;
  } else if (st === 'slide') {
    // Low slide: lead leg out straight, trailing leg folded, leaning back, the far hand dragging on the floor
    Object.assign(P, { hipY: 0.46, spine: -0.45, hipN: 1.38, knN: -0.08, hipF: -0.38, knF: -1.95, shN: 0.95, elN: 0.7, shF: -0.55, elF: 0.2, bodyZ: -0.06, head: 0.3 });
    if (mk) Object.assign(P, { hipY: 0.52, spine: 0.1, hipN: 1.05, knN: -1.0, hipF: -0.9, knF: -0.35, shN: -0.8, shF: -1.1, elN: 0.3, elF: 0.3, head: -0.05 });   // skate power slide
    rate = 30;
  } else if (st === 'dashCharge') {
    const f = Math.min(1, p.dashChargeT / DASH_CHARGE.charge[0]);
    Object.assign(P, { hipY: 0.95 - 0.3 * f, spine: 0.1 + 0.45 * f, hipN: 0.4 + 0.9 * f, knN: -0.3 - 1.5 * f, hipF: -0.2 - 0.45 * f, knF: -0.2 - 0.5 * f,
      shN: -0.4 - 0.7 * f, elN: 0.5, shF: -0.6 - 0.7 * f, elF: 0.5, head: -0.25 * f });
    if (p.dashChargeT >= DASH_CHARGE.charge[1]) P.hipY += (Math.random() - 0.5) * (p.dashChargeT >= DASH_CHARGE.charge[2] ? 0.035 : 0.018);
    rate = 22;
  } else if (st === 'dash' || st === 'zip') {
    Object.assign(P, { spine: 0.58, hipN: -0.35, knN: -0.95, hipF: -0.95, knF: -0.45, shN: -1.05, shF: -1.25, elN: 0.25, elF: 0.3, head: -0.3 });
    const dy = st === 'dash' && p.dash ? p.dash.dy : Math.sign(p.vy) * 0.4;
    P.bodyZ = Math.atan2(dy, 1) * 0.8; rate = 34;
  } else if (st === 'dashslash') {
    // Echo's Dash Slash: arms thrown back, then one long horizontal cut as he lunges through
    const u = p.st, s = u < 2 ? 0 : u < 6 ? snapEase((u - 2) / 4) : 1;
    Object.assign(P, { spine: 0.55, twist: -0.5 + 1.1 * s, shN: -0.8 + 2.9 * s, shF: -0.9 + 2.3 * s, elN: 0.25, elF: 0.3, hipN: 1.0, knN: -0.8, hipF: -0.95, knF: -0.2, hipY: 0.8, head: -0.3,
      bodyZ: p.slash ? Math.atan2(p.slash.dy, 1) * 0.7 : 0 });
    if (u > DASH_SLASH.ticks) Object.assign(P, { spine: 0.35, twist: 0.3, shN: 1.6, shF: 1.2, hipY: 0.86 });
    rate = 40;
  } else if (st === 'pound' && p.pound) {
    const S = p.pound;
    if (S.phase === 'hold') {
      // The hang: knees tucked high, Nova's fist cocked overhead, Echo's glaive raised point-down; the body
      // trembles more with each charge level. Echo whips round once as it starts.
      const k = Math.min(1, S.t / 6);
      Object.assign(P, { hipY: 0.95, spine: -0.18 * k, hipN: 1.55, knN: -2.2, hipF: 1.25, knF: -2.05, head: 0.18,
        shN: echo ? 2.95 : 2.75, elN: echo ? 0.25 : 1.35, shF: echo ? 2.75 : 1.2, elF: echo ? 0.35 : 1.5 });
      if (S.level) { const j = (Math.random() - 0.5) * 0.025 * S.level; P.spine += j; P.hipY += j; }
      if (echo && S.t <= 9) yaw = Math.PI * 2 * snapEase(S.t / 9);
      rate = 26;
    } else if (S.phase === 'drop') {
      // Dropping: upright and driving straight down, fist or glaive leading, one knee drawn up
      Object.assign(P, { spine: 0.18, bodyZ: 0, hipN: 0.9, knN: -1.6, hipF: -0.15, knF: -0.35, head: -0.5, hipY: 0.95,
        shN: echo ? 0.12 : -0.05, elN: 0.02, shF: echo ? 0.2 : 1.1, elF: 1.2 });
      rate = 42;
    } else {
      // The landing: down on one knee, the fist or glaive driven into the floor, then rising out of it
      const up = Math.max(0, Math.min(1, (S.t - 5) / 7));
      Object.assign(P, { hipY: 0.5 + 0.3 * up, spine: 0.72 - 0.4 * up, hipN: 1.55 - 0.8 * up, knN: -2.3 + 1.3 * up, hipF: -0.25, knF: -2.1 + 1.4 * up,
        shN: 0.45, elN: 0.05, shF: -0.65, elF: 0.45, head: 0.1 });
      rate = 40;
    }
  } else if (st === 'dive') {
    // Plunge: tucked tight, glaive driven down, pitched head-first
    Object.assign(P, { spine: 0.55, bodyZ: -0.35, hipN: 1.3, knN: -2.0, hipF: 1.0, knF: -1.8, shN: 0.25, elN: 0.4, shF: 0.15, elF: 0.5, head: -0.3 }); rate = 30;
  } else if (st === 'vb') {
    const f = Math.min(1, p.st / 3);
    Object.assign(P, { spine: 0.35 * f, hipN: 0.75, knN: -0.65, hipF: -0.65, knF: -0.3, hipY: 0.82, twist: 0.4 * f });
    if (!echo) Object.assign(P, { shN: 1.57, elN: 0.05, shF: 0.9, elF: 1.2 });
    else Object.assign(P, { shN: 2.6 - 1.6 * f, shF: 2.4 - 1.5 * f, elN: 0.3, elF: 0.4 });
    rate = 40;
  } else if (st === 'attack' && p.move) {
    attackPose(p, P);
    const m = p.move, sp = SPIN[p.moveId];
    if (sp) { const a = Math.max(0, Math.min(1, (p.st - m.su) / m.ac)), ang = Math.PI * 2 * sp[0] * snapEase(a); if (sp[1] === 'z') roll = -ang; else yaw = ang; }
    rate = 48;
  } else if (st === 'dodge' && p.dodge) {
    // Nova's dodge: a low, light hop; backwards he leans away with the bracer up, forwards he dips his shoulder
    const back = p.dodge.dx * p.facing < 0, u = Math.min(1, p.dodge.t / 4);
    if (back) Object.assign(P, { spine: -0.3 * u, hipN: 0.75, knN: -1.35, hipF: -0.35, knF: -1.0, shN: 1.25, elN: 1.7, shF: 0.35, elF: 1.3, hipY: 0.84, head: 0.2, bodyZ: 0.1 * u });
    else Object.assign(P, { spine: 0.5 * u, hipN: 1.05, knN: -1.45, hipF: -0.65, knF: -0.55, shN: -0.7, shF: -0.9, elN: 0.35, elF: 0.3, hipY: 0.78, head: -0.2, bodyZ: -0.12 * u, twist: 0.3 * u });
    rate = 34;
  } else if (st === 'ult') {
    const R = p.ultRun;
    if (echo) {
      // Echo: crouched to spring while it is called; the follow-through of a great cut when he reappears
      if (!R) Object.assign(P, { spine: 0.45, hipN: 1.15, knN: -1.7, hipF: -0.55, knF: -0.65, shN: -0.9, elN: 0.4, shF: -1.1, elF: 0.4, hipY: 0.7, head: -0.2, twist: -0.3 });
      else Object.assign(P, { spine: 0.5, twist: 0.55, shN: 1.62, elN: 0.05, shF: 1.35, elF: 0.2, hipN: 0.95, knN: -0.9, hipF: -0.8, knF: -0.2, hipY: 0.8, head: -0.1 });
    } else {
      // Nova: arms flung wide, head back while it is called; both hands raised to the gathering sun; braced
      // behind the beam; arms thrown open by the nova
      const N = ULT.nova, t2 = R ? R.t : 0;
      if (!R) Object.assign(P, { spine: -0.32, shN: 2.35, elN: 0.25, shF: 2.2, elF: 0.3, hipN: 0.3, knN: -0.45, hipF: -0.3, knF: -0.35, hipY: 0.92, head: 0.45 });
      else if (t2 <= N.gather) Object.assign(P, { spine: -0.22, shN: 3.0, elN: 0.25, shF: 2.9, elF: 0.3, hipN: 0.55, knN: -0.95, hipF: 0.2, knF: -0.8, hipY: 0.95, head: 0.4 });
      else if (R.segs) {
        const j = (Math.random() - 0.5) * 0.04, a = Math.atan2(R.dy, Math.abs(R.dx) < 1e-3 ? 1e-3 : R.dx * p.facing);
        Object.assign(P, { spine: -0.18 + j, shN: a + Math.PI / 2, elN: 0.02, shF: a + Math.PI / 2 - 0.15, elF: 0.1, hipN: 0.7, knN: -1.0, hipF: -0.5, knF: -0.6, hipY: 0.95 + j, head: -0.1 });
      } else Object.assign(P, { spine: -0.35, shN: 2.2, elN: 0.1, shF: 2.0, elF: 0.1, hipN: 0.4, knN: -0.7, hipF: -0.2, knF: -0.5, hipY: 0.95, head: 0.3 });
    }
    rate = 26;
  } else if (st === 'parry') {
    // Echo twirls the staff in front of him; Nova raises the bracer
    if (echo) Object.assign(P, { spine: 0.1, shN: 1.5, elN: 0.45, shF: 1.25, elF: 0.9, hipN: 0.45, knN: -0.55, hipF: -0.4, knF: -0.3, hipY: 0.88 });
    else Object.assign(P, { shN: 1.3, elN: 1.7, shF: 1.1, elF: 1.8, spine: -0.08, hipN: 0.3, knN: -0.4, hipY: 0.9 });
    rate = 40;
  } else if (st === 'hitstun') {
    Object.assign(P, { spine: -0.5, head: 0.35, shN: 1.0, shF: 1.4, elN: 0.7, elF: 0.4, hipN: 0.35, knN: -0.55, hipF: -0.1, twist: -0.3 }); rate = 30;
  } else if (st === 'bulwark') {
    Object.assign(P, { spine: 0.15, shN: aimAng + Math.PI / 2 + 0.15, elN: 0.02, shF: 0.7, elF: 1.1, hipN: 0.5, knN: -0.4, hipF: -0.4 }); rate = 40;
  } else if (st === 'beam') {
    // Braced against the beam's push: wide stance, leaning into it, the free hand steadying the bracer
    const j = (Math.random() - 0.5) * 0.03;
    Object.assign(P, { spine: -0.12 + j, shN: aimAng + Math.PI / 2 - 0.12, elN: 0.02, shF: aimAng + Math.PI / 2 - 0.3, elF: 0.7, hipN: 0.85, knN: -0.95, hipF: -0.65, knF: -0.35, hipY: 0.8 + j, head: -0.1 });
    if (!p.onGround) Object.assign(P, { hipN: 0.6, knN: -0.9, hipF: -0.2, knF: -0.7, hipY: 0.95 });
    rate = 30;
  } else if (st === 'lash') {
    Object.assign(P, { spine: 0.2, shN: aimAng + Math.PI / 2 + 0.2, elN: 0.05, shF: 0.3, twist: 0.3 }); rate = 36;
  } else if (!p.onGround) {
    if (p.wallSliding) Object.assign(P, { shF: -2.2, elF: 0.35, shN: 0.55, elN: 0.9, hipN: 0.75, knN: -1.25, hipF: -0.35, knF: -0.45, spine: -0.12, head: 0.1 });
    else if (p.rocketT > 0 && p.vy > 4) Object.assign(P, { hipN: 0.45, knN: -0.95, hipF: -0.25, knF: -0.6, shN: -0.55, shF: -0.75, elN: 0.2, elF: 0.2, spine: -0.08, head: 0.15 });   // launched, arms swept down
    else if (p.vy > 3) Object.assign(P, { hipN: 0.95, knN: -1.45, hipF: 0.2, knF: -0.85, shN: 1.7, shF: 1.25, elN: 0.5, spine: 0.12, head: 0.05 });
    else if (p.vy > -3) Object.assign(P, { hipN: 0.7, knN: -1.2, hipF: 0.35, knF: -1.1, shN: 1.2, shF: 1.4, elN: 0.6, elF: 0.6, spine: 0.08 });   // floating at the apex
    else Object.assign(P, { hipN: 0.3, knN: -0.4, hipF: -0.3, knF: -0.75, shN: 1.05, shF: 0.85, elN: 0.5, elF: 0.4, spine: 0.04, head: -0.1 });
    rate = 16;
  } else if (p.crouch) {
    // Coiled crouch: lead knee up, back knee low, torso forward over it, guard up; it breathes and shifts
    const walk = speed > 0.3;
    if (walk) rig.phase += dt * speed * 3.2;
    const s = walk ? Math.sin(rig.phase) : 0;
    Object.assign(P, { hipY: 0.56 + breathe * 0.012, spine: 0.42 + breathe * 0.02, hipN: 1.25 + s * 0.25, knN: -2.0 - s * 0.15, hipF: 0.25 - s * 0.25, knF: -2.3 + s * 0.15,
      shN: echo ? 0.95 : 1.1, elN: echo ? 1.4 : 1.6, shF: -0.4, elF: 0.6, head: -0.25, twist: -0.12 });
    rate = 20;
  } else if (speed > 0.6) {
    const back = p.vx * p.facing < 0, amp = Math.min(1, speed / 7);
    if (mk) {
      // Skate stride: long, low pushes with arms swinging wide; at full glide both feet come together
      rig.phase += dt * speed * 0.95 * (back ? -1 : 1);
      const s = Math.sin(rig.phase), c = Math.cos(rig.phase), coast = Math.max(0, 1 - Math.abs(p.vx - p.prevVx || 0) * 20) * (speed > 7 ? 1 : 0);
      Object.assign(P, { hipN: 0.25 + s * 0.35 * amp, knN: -0.75 - Math.max(0, c) * 0.4, hipF: -0.3 - s * 0.45 * amp, knF: -0.55 - Math.max(0, -c) * 0.3,
        shN: -s * 0.9 * amp + 0.1, shF: s * 0.9 * amp - 0.1, elN: 0.5, elF: 0.5, spine: 0.36 * amp, hipY: 0.84 - Math.abs(c) * 0.03, twist: s * 0.18 * amp, head: -0.2 * amp });
      if (coast > 0.5) Object.assign(P, { hipN: 0.35, knN: -0.95, hipF: 0.1, knF: -0.9, shN: -0.6, shF: -0.8, spine: 0.42, hipY: 0.8 });
      p.prevVx = p.vx;
    } else {
      // Sprint: knees high, arms pumping, leaning into it, torso counter-twisting the stride
      rig.phase += dt * speed * 1.8 * (back ? -1 : 1);
      const s = Math.sin(rig.phase), c = Math.cos(rig.phase);
      Object.assign(P, { hipN: s * 0.95 * amp + 0.05, hipF: -s * 0.95 * amp + 0.05, knN: -Math.max(0, -c) * 1.45 * amp - 0.15, knF: -Math.max(0, c) * 1.45 * amp - 0.15,
        shN: -s * 0.95 * amp, shF: s * 0.95 * amp, elN: 1.15, elF: 1.15, spine: (back ? 0.05 : 0.3) * amp, hipY: 0.95 - Math.abs(c) * 0.07, twist: -s * 0.15 * amp, head: -0.2 * amp });
    }
    rate = 22;
  } else {
    // Idle: weight settled, breathing, a small sway; each has their own ready stance
    Object.assign(P, echo ? { spine: 0.14 + breathe * 0.02, hipN: 0.3, knN: -0.35, hipF: -0.2, knF: -0.25, hipY: 0.92 + breathe * 0.006, shN: 0.35, elN: 0.6, shF: 0.1, elF: 0.7, head: -0.05, twist: 0.08 }
      : { spine: 0.06 + breathe * 0.015, hipN: 0.12, knN: -0.15, hipF: -0.1, knF: -0.12, hipY: 0.94 + breathe * 0.005, shN: 0.3, elN: 0.7, shF: -0.05, elF: 0.4 });
    rate = 10;
  }

  // Aiming layer: Nova's bracer arm and Echo's rifle follow the aim while shooting
  const rifle = echo && (p.rifleT >= HUNTER.rifle.raise || (p.rifleCd > 0 && (p.rifleCdMax || 0) - p.rifleCd < 14));
  const shooting = (p.chargeT > 0 || p.fireCd > 0 || p.shootT > 0 || rifle || (p.aimFree && !echo)) && ['normal', 'dash', 'slide'].includes(st);
  if (shooting) {
    P.shN = aimAng + Math.PI / 2 + P.spine; P.elN = 0.02;
    if (echo) {
      P.shF = aimAng + Math.PI / 2 + P.spine - 0.28; P.elF = 0.75;
      // Scoped on the ground: he drops to a kneel and steadies the rifle
      if (p.rifleT >= HUNTER.rifle.raise && p.onGround && st === 'normal' && speed < 1.5) Object.assign(P, { hipY: 0.66, hipN: 0.95, knN: -1.7, hipF: -0.15, knF: -2.1, spine: 0.12, head: -0.12 });
    }
  }
  // Head counters the spine so the gaze stays level
  P.head += -P.spine * 0.45;

  // Ease every joint toward its target (frame-rate independent)
  const cur = rig.cur, a = 1 - Math.exp(-rate * dt);
  for (const j of J) cur[j] = cur[j] === undefined ? P[j] : cur[j] + (P[j] - cur[j]) * a;

  // Squash and stretch: a stretch on launches and jumps, a squash on every landing (bigger the harder)
  if (p.rocketT > rig.lastRocketT) rig.stretch = 0.12 + 0.14 * (p.rocketPow || 0);
  if (!p.onGround && rig.wasGround && p.vy > 8) rig.stretch = Math.max(rig.stretch, 0.07);
  if (p.onGround && !rig.wasGround) rig.stretch = -Math.min(0.16, Math.max(0.03, (-rig.lastVy - 4) * 0.008));
  if (p.crouch && !rig.wasCrouch && p.onGround) rig.stretch = Math.min(rig.stretch, -0.07);   // dropping into the crouch
  rig.lastRocketT = p.rocketT; rig.wasGround = p.onGround; rig.wasCrouch = !!p.crouch; if (!p.onGround) rig.lastVy = p.vy;
  rig.stretch *= Math.exp(-dt * 10);
  const sy = 1 + rig.stretch, sxz = 1 / Math.sqrt(sy);
  rig.body.scale.set(sxz, sy, sxz);

  rig.spine.rotation.z = -cur.spine; rig.spine.rotation.y = cur.twist;
  rig.head.rotation.z = -cur.head;
  rig.armN.top.rotation.z = cur.shN; rig.armN.joint.rotation.z = cur.elN;
  rig.armF.top.rotation.z = cur.shF; rig.armF.joint.rotation.z = cur.elF;
  rig.legN.top.rotation.z = cur.hipN; rig.legN.joint.rotation.z = cur.knN;
  rig.legF.top.rotation.z = cur.hipF; rig.legF.joint.rotation.z = cur.knF;
  rig.hips.position.y = cur.hipY;
  rig.body.rotation.z = cur.bodyZ;
  // Whole-body spins are driven directly (easing would unwind them); between spins it settles to 0
  rig.yaw = yaw ? yaw : rig.yaw * Math.exp(-dt * 20);
  if (!yaw && Math.abs(rig.yaw) > 0.01) { rig.yaw = rig.yaw % (Math.PI * 2); if (rig.yaw > Math.PI) rig.yaw -= Math.PI * 2; }
  rig.body.rotation.y = rig.yaw;
  rig.roll = roll ? roll : (rig.roll || 0) * Math.exp(-dt * 20);
  if (!roll && Math.abs(rig.roll) > 0.01) { rig.roll = rig.roll % (Math.PI * 2); if (rig.roll < -Math.PI) rig.roll += Math.PI * 2; }
  rig.hips.rotation.z = rig.roll;
  rig.body.position.y = st === 'downed' || st === 'dead' ? 0.1 : 0;

  // ---- Suit details ----
  if (!echo) {
    const ex = rig.extra;
    const open = st === 'bulwark' ? Math.min(1, p.st / 3) * (p.st < 12 ? 1 : Math.max(0, 1 - (p.st - 12) / 3)) : 0;
    const s = Math.max(0.001, open);
    ex.shield.scale.set(s, s, s);
    // Energy lines brighten with each charge level (either weapon), flash in the Perfect window, blaze at
    // Level 4 and while the beam fires, and glow gold-white with Overcharge
    const LV = { L1: 1, L2: 2, L3: 3, perfect: 3, L4: 4 };
    const stage = chargeStage(p), bstage = mk ? burstStage(p) : '';
    const charge = Math.max(LV[stage] || 0, LV[bstage] || 0, dashLevelOf(p), st === 'beam' ? 4 : 0, st === 'pound' && p.pound ? p.pound.level : 0), flash = stage === 'perfect' || bstage === 'perfect';
    rig.mats.energy.emissiveIntensity = 2.2 + charge * 1.2 + (p.chargeT > 0 || p.burstT > 0 || p.dashChargeT > 0 || st === 'beam' ? Math.sin(t * 30) * 0.4 : 0) + (flash ? 2.5 : 0)
      + (p.overcharge > 0 ? 1.2 + Math.sin(t * 12) * 0.5 : 0) + (st === 'ult' ? 4 + Math.sin(t * 36) * 0.8 : 0);
    ex.jets.forEach(j => { j.visible = !!p.thrusting; j.scale.set(1, 0.8 + Math.random() * 0.5, 1); });
    ex.module.visible = mk; ex.blades.forEach(b => { b.visible = mk; });
    if (mk && ex.moduleTint !== p.attachment) {
      const c = ATTACH_LOOK[p.attachment].tint; ex.moduleTint = p.attachment; ex.moduleMat.color.set(c); ex.moduleMat.emissive.set(c);
    }
    // Close-range strikes: the bracer's hard light forms gauntlets over the fists (a greave over the boot for
    // the air kick). It grows in fast, flares on the strike frames and melts away after the combo.
    const pound = st === 'pound' && !!p.pound;
    const fist = (st === 'attack' && !!p.move && !!p.move.fist) || pound, kick = fist && !pound && p.moveId === 'nova_kair';
    rig.hard = (rig.hard || 0) + ((fist ? 1 : 0) - (rig.hard || 0)) * (1 - Math.exp(-dt * (fist ? 34 : 10)));
    const strike = pound ? p.pound.phase !== 'hold' || p.pound.level > 0 : fist && p.st >= p.move.su && p.st < p.move.su + p.move.ac + 2;
    const hs = rig.hard * (strike ? 1.25 : 1) * (pound && p.pound.phase === 'hold' ? 1 + 0.12 * p.pound.level : 1);
    ex.gauntlets.forEach(g => { g.visible = rig.hard > 0.04 && !kick; g.scale.set(1.1 * hs, 1.3 * hs, hs); });
    ex.greave.visible = rig.hard > 0.04 && kick; ex.greave.scale.set(1.7 * hs, 0.9 * hs, hs);
    ex.hardMat.emissiveIntensity = strike ? 5.5 : 2.6; ex.hardMat.opacity = 0.35 + 0.5 * rig.hard;
  } else {
    const ex = rig.extra, hunter = SETTINGS.echoKit === 'hunter';
    const staffOut = (st === 'attack' && staffMove(p.moveId)) || st === 'vb' || st === 'dive' || st === 'pound' || st === 'ult' || (st === 'parry' && hunter) ||
      ((p.fireCd > 0 || p.chargeT > 0 || p.tracerCd > 60 || rifle) && ['normal', 'dash', 'slide'].includes(st));
    ex.handStaff.visible = staffOut; ex.backStaff.visible = !staffOut;
    // Rifle hold: the staff turns to lie along the forearm like a rifle barrel; parry: it twirls in the hand
    const rifleHold = rifle && staffOut && !(st === 'attack' || st === 'vb' || st === 'dive' || st === 'parry' || st === 'pound');
    // Pound: the glaive hangs point-down from his raised hands, then leads the drop point-first
    const pz = st === 'pound' && p.pound ? (p.pound.phase === 'hold' ? Math.PI / 2 : -Math.PI / 2) : null;
    ex.hand.rotation.z = pz !== null ? pz : rifleHold ? -Math.PI / 2 : st === 'parry' && hunter ? t * 34 : 0;
    ex.hand.position.y = rifleHold ? -0.32 : -0.02;
    ex.glaive[1].visible = !rifleHold && hunter;
    const bladeOut = (st === 'attack' && p.move && p.move.blade) || st === 'dashslash';
    ex.blade.visible = !!bladeOut && (hunter ? true : !p.move || !p.move.offhand);
    ex.bladeF.visible = !!bladeOut && hunter;
    ex.glaive[0].visible = hunter;
    ex.backTips.forEach(g => { g.visible = hunter; });
    ex.beltSnares.forEach((g, i) => { g.visible = hunter && i < p.snares; });
    rig.setHead(SETTINGS.echoHead || 'helmet');
    const flare = p.scarfMode === 'flare' && p.state !== 'downed';
    const focus = p.rifleT >= HUNTER.rifle.raise + HUNTER.rifle.focus;
    rig.mats.energy.emissiveIntensity = 2.0 + p.resolve / 50 + (flare ? 1.1 + Math.sin(t * 9) * 0.45 : 0) + dashLevelOf(p) * 1.1 + (st === 'pound' && p.pound ? p.pound.level * 1.1 : 0)
      + (focus ? 1.2 + Math.sin(t * 24) * 0.5 : 0) + (st === 'attack' || st === 'dashslash' ? 0.8 : 0) + (st === 'ult' ? 4 + Math.sin(t * 36) * 0.8 : 0);
    const veil = p.scarfMode === 'veil' && p.state !== 'downed' ? Math.min(1, p.veilCharge / SCARF.veilFade) : 0;
    let ck = rig.cloak + (veil - rig.cloak) * (veil > rig.cloak ? 0.25 : 0.45);
    if (Math.abs(ck - veil) < 0.01) ck = veil;
    rig.setCloak(ck);
  }
}
