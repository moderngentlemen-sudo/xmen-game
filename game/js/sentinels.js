// The Sentinel program's machines, in the comic look (procedural placeholder art, an unofficial fan take):
// purple plate, grey faceplates and hands, and every eye and tell in the reserved hostile magenta.
//   trooper    a man-sized Sentinel that closes in and swings or slams
//   gunner     slimmer, an arm cannon on the near forearm
//   hunter     a hovering pod with one great lens and two thrusters
//   collector  bulky, a capture claw on one arm and a cage frame on its back
//   mk2        the Mk-II: a giant Sentinel with armour plates that break and an eye that rakes the floor
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HOSTILE } from './looks.js';
import { toon, glow, addRim } from './toon.js';
import { ENEMIES } from './sim/config.js';

const rbox = (w, h, d, r = 0.06) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10);
function add(parent, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }
function grp(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

function mats() {
  const M = {
    plate: toon('#6d3aa8', { emissive: '#ffffff', emissiveIntensity: 0 }),
    face: toon('#b2bac8', { emissive: '#ffffff', emissiveIntensity: 0 }),
    joint: toon('#2a2638'),
    energy: glow(HOSTILE, 1.4),
  };
  addRim(M.plate, '#ff9cc5', 0.35); addRim(M.face, '#ffc2dc', 0.25);
  return M;
}

// The Sentinel head, facing +x: purple helmet, grey faceplate with two magenta eye slits and a mouth grille,
// round discs at the sides. s is its height.
function sentinelHead(parent, M, s, x = 0, y = 0) {
  const h = grp(parent, x, y, 0);
  add(h, rbox(s * 0.92, s, s * 0.9, s * 0.22), M.plate);
  add(h, rbox(s * 0.16, s * 0.74, s * 0.72, s * 0.06), M.face, s * 0.42, -s * 0.08);
  for (const z of [s * 0.17, -s * 0.17]) add(h, rbox(s * 0.06, s * 0.08, s * 0.2, s * 0.02), M.energy, s * 0.51, s * 0.1, z);
  for (const yy of [-0.2, -0.28, -0.36]) add(h, rbox(s * 0.05, s * 0.026, s * 0.36, s * 0.01), M.joint, s * 0.51, s * yy);
  for (const z of [s * 0.46, -s * 0.46]) { const d = add(h, new THREE.CylinderGeometry(s * 0.2, s * 0.2, s * 0.08, 16), M.face, -s * 0.02, 0, z); d.rotation.x = Math.PI / 2; }
  return h;
}
// A two-segment leg hanging from a hip joint
function leg(parent, M, len, r, z) {
  const hip = grp(parent, 0, 0, z);
  add(hip, cap(r, len * 0.5), M.joint, 0, -len * 0.25);
  const knee = grp(hip, 0, -len * 0.5, 0);
  add(knee, cap(r * 1.15, len * 0.45), M.plate, 0, -len * 0.25);
  add(knee, rbox(r * 3.2, r * 1.2, r * 2.6, r * 0.4), M.face, r * 0.6, -len * 0.5 + r * 0.4);
  return { hip, knee };
}
function arm(parent, M, len, r, z, handScale = 1) {
  const sh = grp(parent, 0, 0, z);
  add(sh, new THREE.SphereGeometry(r * 1.5, 12, 10), M.plate);
  add(sh, cap(r, len * 0.45), M.plate, 0, -len * 0.25);
  const el = grp(sh, 0, -len * 0.5, 0);
  add(el, cap(r * 0.95, len * 0.4), M.joint, 0, -len * 0.22);
  const hand = add(el, rbox(r * 2.6 * handScale, r * 2.4 * handScale, r * 2.4 * handScale, r * 0.6), M.face, 0.02, -len * 0.5);
  return { sh, el, hand };
}

export function buildSentinelRig(e) {
  const M = mats(), T = ENEMIES[e.type];
  const root = new THREE.Group(), flip = grp(root), body = grp(flip);
  const R = { root, flip, body, mats: M, type: e.type, parts: {}, phase: Math.random() * 6, lean: 0, flash: 0, s: 1 };
  const P = R.parts;
  switch (e.type) {
    case 'trooper': case 'gunner': {
      const gun = e.type === 'gunner', s = gun ? 0.92 : 1;
      P.hips = grp(body, 0, 1.0 * s, 0);
      add(P.hips, rbox(0.5 * s, 0.24, 0.62 * s, 0.08), M.joint);
      P.legs = [leg(P.hips, M, 1.0 * s, 0.11 * s, 0.2 * s), leg(P.hips, M, 1.0 * s, 0.11 * s, -0.2 * s)];
      P.torso = grp(P.hips, 0, 0.12, 0);
      add(P.torso, rbox(0.62 * s, 0.7 * s, 0.78 * s, 0.16), M.plate, 0, 0.36 * s);
      add(P.torso, rbox(0.66 * s, 0.12, 0.82 * s, 0.05), M.face, 0, 0.02);
      add(P.torso, new THREE.SphereGeometry(0.1 * s, 12, 10), M.energy, 0.33 * s, 0.42 * s);   // the chest core
      P.head = sentinelHead(P.torso, M, 0.38 * s, 0.06, 0.92 * s);
      P.armN = arm(P.torso, M, 0.85 * s, 0.09 * s, 0.5 * s); P.armN.sh.position.y = 0.62 * s;
      P.armF = arm(P.torso, M, 0.85 * s, 0.09 * s, -0.5 * s); P.armF.sh.position.y = 0.62 * s;
      if (gun) {
        // The arm cannon: a grey barrel along the near forearm, its muzzle glowing magenta when it fires
        const c = add(P.armN.el, new THREE.CylinderGeometry(0.09, 0.12, 0.55, 12), M.face, 0.06, -0.42); P.cannon = c;
        P.muzzle = add(P.armN.el, new THREE.SphereGeometry(0.075, 10, 8), M.energy, 0.06, -0.72);
      }
      break;
    }
    case 'hunter': {
      P.core = grp(body, 0, 0.95, 0);
      add(P.core, new THREE.SphereGeometry(0.55, 20, 16), M.plate).scale.set(1.1, 0.85, 0.95);
      add(P.core, rbox(0.2, 0.62, 0.7, 0.08), M.face, 0.46, 0.0);
      P.lens = add(P.core, new THREE.SphereGeometry(0.2, 16, 12), M.energy, 0.58, 0.02);
      add(P.core, new THREE.TorusGeometry(0.25, 0.04, 8, 20), M.joint, 0.55, 0.02).rotation.y = Math.PI / 2;
      P.thrusters = [];
      for (const z of [0.55, -0.55]) {
        const t = grp(P.core, -0.1, -0.15, z);
        add(t, new THREE.CylinderGeometry(0.14, 0.18, 0.4, 12), M.joint);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.5, 10, 1, true),
          new THREE.MeshBasicMaterial({ color: '#ffb1d0', transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }));
        flame.rotation.z = Math.PI; flame.position.y = -0.42; t.add(flame); P.thrusters.push(flame);
      }
      for (const z of [0.3, -0.3]) add(P.core, cap(0.04, 0.5), M.joint, -0.05, -0.62, z).rotation.z = 0.25;
      break;
    }
    case 'collector': {
      P.hips = grp(body, 0, 1.0, 0);
      add(P.hips, rbox(0.7, 0.28, 0.9, 0.1), M.joint);
      P.legs = [leg(P.hips, M, 1.0, 0.15, 0.3), leg(P.hips, M, 1.0, 0.15, -0.3)];
      P.torso = grp(P.hips, 0, 0.14, 0);
      add(P.torso, rbox(0.9, 0.85, 1.1, 0.2), M.plate, 0, 0.42);
      P.plates = [add(P.torso, rbox(0.22, 0.6, 0.9, 0.08), M.face, 0.46, 0.42)];
      add(P.torso, new THREE.SphereGeometry(0.13, 12, 10), M.energy, 0.52, 0.66);
      P.head = sentinelHead(P.torso, M, 0.36, 0.12, 1.06);
      // The cage frame on its back, where a captive rides
      const cage = grp(P.torso, -0.55, 0.55, 0);
      for (const z of [-0.4, 0, 0.4]) add(cage, new THREE.CylinderGeometry(0.035, 0.035, 0.9, 6), M.joint, -0.12, 0, z);
      add(cage, new THREE.TorusGeometry(0.42, 0.04, 6, 16, Math.PI), M.face, -0.12, 0.45, 0).rotation.x = Math.PI / 2;
      P.armN = arm(P.torso, M, 1.0, 0.12, 0.62, 1.4); P.armN.sh.position.y = 0.74;
      P.armF = arm(P.torso, M, 1.0, 0.12, -0.62); P.armF.sh.position.y = 0.74;
      // The capture claw: three grey fingers round a magenta grip field
      P.claw = [];
      for (const a of [0.9, -0.9, 0]) { const f = add(P.armN.el, new THREE.ConeGeometry(0.06, 0.38, 5), M.face, 0.12, -0.72, a === 0 ? 0 : a * 0.12); f.rotation.z = Math.PI + (a === 0 ? -0.5 : 0.35); P.claw.push(f); }
      P.grip = add(P.armN.el, new THREE.SphereGeometry(0.14, 12, 10), M.energy, 0.14, -0.68);
      break;
    }
    case 'mk2': {
      P.hips = grp(body, 0, 1.75, 0);
      add(P.hips, rbox(1.0, 0.5, 1.5, 0.15), M.joint);
      P.legs = [leg(P.hips, M, 1.75, 0.24, 0.5), leg(P.hips, M, 1.75, 0.24, -0.5)];
      P.torso = grp(P.hips, 0, 0.25, 0);
      add(P.torso, rbox(1.6, 1.5, 2.0, 0.35), M.plate, 0, 0.75);
      add(P.torso, rbox(1.66, 0.22, 2.06, 0.08), M.face, 0, 0.06);
      P.core = add(P.torso, new THREE.SphereGeometry(0.28, 16, 12), M.energy, 0.8, 0.8);
      P.plates = [
        add(P.torso, rbox(0.4, 1.1, 1.6, 0.14), M.face, 0.78, 0.8),
        add(P.torso, rbox(1.0, 0.4, 0.7, 0.14), M.face, 0, 1.55, 0.62),
        add(P.torso, rbox(1.0, 0.4, 0.7, 0.14), M.face, 0, 1.55, -0.62),
      ];
      P.head = sentinelHead(P.torso, M, 0.95, 0.15, 2.05);
      P.eye = add(P.head, new THREE.SphereGeometry(0.16, 12, 10), M.energy, 0.5, 0.1, 0);
      P.armN = arm(P.torso, M, 1.9, 0.22, 1.2, 1.3); P.armN.sh.position.y = 1.35;
      P.armF = arm(P.torso, M, 1.9, 0.22, -1.2, 1.3); P.armF.sh.position.y = 1.35;
      break;
    }
  }
  R.root.traverse(o => { if (o.isMesh) o.receiveShadow = false; });
  return R;
}

// The hit reactions (sim/reactions.js) that throw the body about
const REACTING = ['stagger', 'launched', 'knockdown', 'wallBounce', 'groundBounce', 'crumple', 'spinOut', 'stun', 'flipOut'];

// Pose for this frame. Telegraphs show in the eyes (they flare through a windup) and in the body (raised arms).
export function animateSentinel(R, e, dt, t) {
  const P = R.parts, T = ENEMIES[e.type], st = e.state, k = 1 - Math.exp(-dt * 16);
  R.flip.scale.x = e.facing;
  const windup = st === 'windup', wk = windup && e.atk ? Math.min(1, e.st / Math.max(1, e.atk.wind || (T[e.atk.kind] && T[e.atk.kind].wind) || 20)) : 0;
  // Hit flash and the telegraph glow in the eyes
  const flash = e.flash > 0 ? 1.4 : 0;
  R.mats.plate.emissiveIntensity = flash * 0.6; R.mats.face.emissiveIntensity = flash * 0.7;
  R.mats.energy.emissiveIntensity = 1.4 + wk * 3 + (st === 'beam' || st === 'burst' || st === 'aim' ? 2.5 + Math.sin(t * 40) * 0.6 : 0);
  // Death: topple and sink (the view drops the rig once it has fallen)
  if (e.dead) {
    const d = Math.min(1, e.deathT / 30);
    R.body.rotation.z = -d * 1.4; R.body.position.y = -d * 0.4 * (e.h / 2); return;
  }
  R.body.rotation.z = 0; R.body.position.y = 0; R.body.rotation.y = 0;
  const moving = Math.abs(e.vx) > 0.4 && e.onGround;
  if (moving) R.phase += dt * Math.abs(e.vx) * (e.type === 'mk2' ? 1.1 : 2.4);
  const s = Math.sin(R.phase);
  const stag = REACTING.includes(st) || st === 'thrown' || st === 'held' || e.liftT > 0;
  let lean = st === 'crumple' ? 0.4 : st === 'stun' ? 0.15 : stag ? -0.35 : e.flinchT > 0 ? -0.25 : windup ? -0.12 * wk : moving ? 0.12 : 0;
  if (P.legs) {
    const amp = moving ? 0.55 : 0.05;
    P.legs[0].hip.rotation.z = s * amp; P.legs[1].hip.rotation.z = -s * amp;
    P.legs[0].knee.rotation.z = -Math.max(0, -Math.cos(R.phase)) * amp * 1.4; P.legs[1].knee.rotation.z = -Math.max(0, Math.cos(R.phase)) * amp * 1.4;
    if (!e.onGround && !stag) { P.legs[0].hip.rotation.z = 0.5; P.legs[1].hip.rotation.z = 0.2; P.legs[0].knee.rotation.z = -0.8; P.legs[1].knee.rotation.z = -0.6; }
  }
  // Arms by attack
  let aN = moving ? -s * 0.4 : 0.1, aF = moving ? s * 0.4 : -0.1, eN = 0.3, eF = 0.3;
  const kind = e.atk && e.atk.kind;
  if (kind === 'swing' || kind === 'sweep') {
    if (windup) { aN = -1.2 * wk - 0.4; eN = 0.4; }
    else if (st === 'attack') { aN = 1.6; eN = 0.1; lean = 0.25; }
    else if (st === 'recover') { aN = 1.0; eN = 0.4; }
  } else if (kind === 'slam' || kind === 'stomp') {
    if (windup) { aN = aF = 2.8 * wk; eN = eF = 0.3; lean = -0.25 * wk; }
    else if (st === 'attack' || st === 'stomp') { aN = aF = 0.9; eN = eF = 0.1; lean = 0.45; }
  } else if (kind === 'burst') {
    aN = 1.55; eN = 0.05; if (windup) aN = 1.2 + wk * 0.35;
  } else if (kind === 'grab') {
    if (windup) { aN = -0.6 + wk * 2.2; eN = 0.2; lean = -0.1; }
  } else if (kind === 'beam') {
    lean = st === 'beam' ? 0.5 : windup ? 0.5 * wk : lean;
  }
  if (st === 'carry') { aN = 2.4; eN = 1.2; aF = -s * 0.5; }
  if (st === 'roar') { aN = aF = 2.6 + Math.sin(t * 30) * 0.1; eN = eF = 0.6; lean = -0.4; }
  if (stag && st !== 'stun' && st !== 'crumple') { aN = 1.9; aF = 2.2; eN = eF = 0.8; }
  if (st === 'stun' || st === 'crumple') { aN = 0.35; aF = 0.15; eN = eF = 0.9; }   // arms hanging, dazed
  if (P.armN) { P.armN.sh.rotation.z += (aN - P.armN.sh.rotation.z) * k; P.armN.el.rotation.z += (eN - P.armN.el.rotation.z) * k; }
  if (P.armF) { P.armF.sh.rotation.z += (aF - P.armF.sh.rotation.z) * k; P.armF.el.rotation.z += (eF - P.armF.el.rotation.z) * k; }
  R.lean += (lean - R.lean) * k;
  if (P.torso) P.torso.rotation.z = -R.lean;
  // The Mk-II's beam: the head dips toward the floor it rakes
  if (P.head && e.type === 'mk2') P.head.rotation.z = st === 'beam' || (windup && kind === 'beam') ? -0.45 : 0;
  if (e.type === 'hunter') {
    P.core.position.y = 0.95 + Math.sin(t * 3 + R.phase) * 0.08;
    P.core.rotation.z = -Math.max(-0.4, Math.min(0.4, e.vx * 0.06 * e.facing));
    for (const f of P.thrusters) f.scale.set(1, 0.7 + Math.random() * 0.6, 1);
    P.lens.scale.setScalar(st === 'aim' ? 1.25 + Math.sin(t * 30) * 0.1 : 1);
  }
  if (P.grip) P.grip.visible = kind === 'grab' || st === 'carry';
  // Broken plates fall away as the armour goes
  if (P.plates) P.plates.forEach((pl, i) => { pl.visible = i < e.armour; });
  // Lifted (Jean's hold): a slow helpless turn
  R.body.rotation.x = e.liftT > 0 ? Math.sin(t * 2) * 0.3 : 0;
  if (st === 'thrown') R.body.rotation.z = -(e.st || 0) * 0.35;
  // Hit reactions: on its back, folding, spinning, flipping, swaying dazed
  if (st === 'knockdown') { R.body.rotation.z = e.lying ? -1.45 : -0.7; R.body.position.y = e.lying ? -0.25 * (e.h / 2) : 0; }
  else if (st === 'launched' && e.juggle > 0) R.body.rotation.z = -0.5 - Math.min(0.6, e.juggle / 150);
  else if (st === 'crumple') { const f = 1 - Math.max(0, e.crumpleT || 0) / 40; R.body.rotation.z = 0.15 + f * 0.75; R.body.position.y = -f * 0.5 * (e.h / 2); }   // folds forward
  else if (st === 'spinOut') R.body.rotation.y = (e.st || 0) * 0.55;
  else if (st === 'groundBounce') R.body.rotation.z = 0.9;
  else if (st === 'wallBounce') R.body.rotation.z = -1.1;
  else if (st === 'flipOut') R.body.rotation.z = ((e.st || 0) / 20) * Math.PI * 2;
  else if (st === 'stun') { R.body.rotation.z = Math.sin(t * 5) * 0.14; R.body.rotation.x = Math.sin(t * 3.3) * 0.12; }
}
