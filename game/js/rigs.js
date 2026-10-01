// Procedural character rigs in the comic look (placeholder art: an unofficial fan take on each costume). Every
// character shares one skeleton (hips, spine, head, two-segment arms and legs) so one animator drives them all.
// Read side-on, the way the camera sees them: +x is the way they face.
//   Cyclops: navy suit, yellow gloves, boots and harness, the ruby visor
//   Wolverine: yellow and blue, the finned cowl, three claws a hand that only come out to fight
//   Jean Grey: Phoenix green and gold, long red hair, a gold sash
//   Storm and Psylocke are kept for later versions; the young mutant the team rescues is built here too.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HERO_LOOKS } from './looks.js';
import { toon, glow, addRim } from './toon.js';

export const rbox = (w, h, d, r = 0.05) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
export const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 12);
export function mesh(geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; }
export function group(x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); return g; }
// A band round the front half of the head (visor, tiara), centred on the face (+x)
const frontBand = (r, h, arc = Math.PI * 0.86) => new THREE.CylinderGeometry(r, r, h, 28, 1, true, Math.PI / 2 - arc / 2, arc);
// A cap over the top of the head, down to `cover` of the way (0 top, 1 bottom)
const capGeo = (r, cover, phiStart = 0, phiLength = Math.PI * 2) => new THREE.SphereGeometry(r, 28, 16, phiStart, phiLength, 0, Math.PI * cover);

function limb(parent, mat, upperLen, lowerLen, r, z) {
  const top = group(0, 0, z); parent.add(top);
  top.add(mesh(cap(r, upperLen - r), mat, 0, -upperLen / 2));
  const joint = group(0, -upperLen, 0); top.add(joint);
  joint.add(mesh(cap(r * 0.92, lowerLen - r), mat, 0, -lowerLen / 2));
  const end = group(0, -lowerLen, 0); joint.add(end);
  return { top, joint, end };
}

// The skeleton every character is built on. `scale` shrinks it (the kid).
function skeleton(M, scale = 1) {
  const root = group(), flip = group(), body = group();
  root.add(flip); flip.add(body); body.scale.setScalar(scale);
  const hips = group(0, 0.95, 0); body.add(hips);
  const spine = group(0, 0.08, 0); hips.add(spine);
  const head = group(0, 0.66, 0); spine.add(head);
  const collar = group(-0.2, 0.58, 0.16); spine.add(collar);
  const armN = limb(spine, M.under, 0.3, 0.29, 0.065, 0.3), armF = limb(spine, M.under, 0.3, 0.29, 0.065, -0.3);
  armN.top.position.y = 0.53; armF.top.position.y = 0.53;
  const legN = limb(hips, M.under, 0.46, 0.46, 0.085, 0.13), legF = limb(hips, M.under, 0.46, 0.46, 0.085, -0.13);
  return { root, flip, body, hips, spine, head, collar, armN, armF, legN, legF, arms: [armN, armF], legs: [legN, legF] };
}
const paintLimb = (l, upper, lower) => { l.top.children[0].material = upper; l.joint.children[0].material = lower; };

function torso(R, { chestW = 0.46, chestD = 0.36, chest, waist, pelvis, shoulder = [0.24, 0.15], shoulderMat }) {
  R.hips.add(mesh(rbox(0.34, 0.2, 0.38, 0.07), pelvis, 0, 0.02));
  R.spine.add(mesh(rbox(0.3, 0.3, 0.34, 0.08), waist, 0, 0.18));
  R.spine.add(mesh(rbox(chestD, 0.34, chestW, 0.1), chest, 0.02, 0.42));
  for (const z of [0.28, -0.28]) R.spine.add(mesh(rbox(shoulder[0], shoulder[1], 0.2, 0.07), shoulderMat, 0, 0.55, z));
}
function hands(R, mat, r = 0.072) { for (const a of R.arms) a.end.add(mesh(new THREE.SphereGeometry(r, 12, 10), mat, 0, -0.03)); }
function boots(R, mat, shinMat = null) {
  for (const l of R.legs) {
    l.end.add(mesh(rbox(0.27, 0.11, 0.17, 0.045), mat, 0.06, -0.02));
    if (shinMat) l.joint.add(mesh(rbox(0.19, 0.3, 0.18, 0.06), shinMat, 0.03, -0.3));
  }
}
function gloves(R, mat) { for (const a of R.arms) a.joint.add(mesh(rbox(0.15, 0.17, 0.16, 0.05), mat, 0.01, -0.21)); }
function eyes(head, mat, z = 0.048, x = 0.128, y = 0.125, r = 0.018) { for (const s of [z, -z]) head.add(mesh(new THREE.SphereGeometry(r, 8, 6), mat, x, y, s)); }
// Long hair with volume: a crown fuller than the skull, swept back; side curtains past the jaw; locks down the back
function hairDo(head, mat, { len = 2.6, width = 1.25, locks = 3, vol = 1.1, tilt = 0.3, bangs = true, sides = 1.6, back = 0 } = {}) {
  const crown = mesh(capGeo(0.158 * vol, 0.56), mat, -0.014, 0.112, 0); crown.rotation.z = tilt; head.add(crown);
  if (bangs) head.add(mesh(frontBand(0.118, 0.05, Math.PI * 0.7), mat, 0.004, 0.19, 0));
  for (const z of [0.118, -0.118]) {
    const side = mesh(new THREE.SphereGeometry(0.07, 14, 10), mat, -0.03, 0.06, z * vol);
    side.scale.set(1.15, sides, 0.6); side.rotation.z = -0.12; head.add(side);
  }
  for (let i = 0; i < locks; i++) {
    const z = (i - (locks - 1) / 2) * 0.075;
    const lock = mesh(new THREE.SphereGeometry(0.085 * vol, 12, 10), mat, -0.105 - Math.abs(z) * 0.2 - back, 0.02 - 0.06 * len, z);
    lock.scale.set(0.8, len, width * (1 - Math.abs(z) * 2)); lock.rotation.z = -0.2; head.add(lock);
  }
}

// A hero, outlined in the player's colour (a rim round the silhouette: identity lives there, not in the costume)
export function buildHeroRig(id, playerColor = '#ffffff') {
  const L = HERO_LOOKS[id];
  const M = {
    base: toon(L.base), trim: toon(L.trim), under: toon(L.under), energy: glow(L.energy, 1.2),
    skin: toon(L.skin), hair: toon(L.hair), dark: toon('#15161c'), gold: toon('#e9c46a'),
  };
  for (const k of ['base', 'trim', 'under', 'dark', 'gold', 'hair']) addRim(M[k], playerColor, 0.55);
  const R = { id, L, M, ...skeleton(M) };
  const extra = {};
  BUILD[id](R, extra);
  R.root.traverse(o => { if (o.isMesh) o.receiveShadow = false; });
  return { ...R, extra, mats: M, hero: id, cur: {}, phase: 0, stretch: 0, lastVy: 0, wasGround: true, yaw: 0, roll: 0, claws: 0 };
}

const BUILD = {
  cyclops(R, extra) {
    const { M, L, head } = R;
    torso(R, { chestW: 0.48, chestD: 0.37, chest: M.base, waist: M.base, pelvis: M.under, shoulderMat: M.trim, shoulder: [0.22, 0.13] });
    for (const l of [...R.arms, ...R.legs]) paintLimb(l, M.base, M.base);
    gloves(R, M.trim); hands(R, M.trim); boots(R, M.trim, M.trim);
    for (const l of R.legs) l.top.add(mesh(rbox(0.12, 0.1, 0.2, 0.03), M.trim, 0.0, -0.32));
    // Harness: yellow straps over the shoulders to the belt
    R.spine.add(mesh(rbox(0.04, 0.42, 0.06, 0.015), M.trim, 0.2, 0.36, 0.1)); R.spine.add(mesh(rbox(0.04, 0.42, 0.06, 0.015), M.trim, 0.2, 0.36, -0.1));
    R.hips.add(mesh(rbox(0.37, 0.07, 0.41, 0.03), M.trim, 0, 0.11));
    // The navy cowl over the skull, chin bare, and the ruby visor in its gold housing
    head.add(mesh(new THREE.SphereGeometry(0.14, 24, 18), M.skin, 0, 0.1));
    head.add(mesh(capGeo(0.149, 0.62), M.base, 0, 0.1));
    head.add(mesh(frontBand(0.156, 0.085), M.trim, 0, 0.122));
    head.add(mesh(frontBand(0.162, 0.045, Math.PI * 0.8), M.energy, 0, 0.122));
    for (const z of [0.15, -0.15]) head.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), M.trim, 0, 0.122, z).rotateX(Math.PI / 2));
    extra.visor = M.energy;
  },
  wolverine(R, extra) {
    const { M, L, head } = R;
    const blue = M.trim, yellow = M.base, black = M.dark;
    torso(R, { chestW: 0.5, chestD: 0.38, chest: yellow, waist: yellow, pelvis: blue, shoulderMat: blue, shoulder: [0.27, 0.17] });
    for (const a of R.arms) paintLimb(a, blue, yellow);
    for (const l of R.legs) paintLimb(l, yellow, blue);
    gloves(R, blue); hands(R, blue); boots(R, blue, blue);
    for (const y of [0.52, 0.44, 0.36]) for (const z of [0.236, -0.236]) { const st = mesh(rbox(0.24, 0.032, 0.012, 0.006), black, -0.03, y, z); st.rotation.z = -0.38; R.spine.add(st); }
    R.hips.add(mesh(rbox(0.36, 0.07, 0.4, 0.03), toon('#b8232b'), 0, 0.1));
    // The yellow mask in front, the blue cowl behind, a black band round the eyes sweeping up into the fins
    head.add(mesh(new THREE.SphereGeometry(0.142, 24, 18), M.skin, 0, 0.1));
    head.add(mesh(capGeo(0.151, 0.6, Math.PI / 2, Math.PI), yellow, 0, 0.1));
    head.add(mesh(capGeo(0.153, 0.64, -Math.PI / 2, Math.PI), blue, 0, 0.1));
    head.add(mesh(frontBand(0.156, 0.05, Math.PI * 0.62), black, 0, 0.132));
    for (const z of [0.1, -0.1]) {
      const fin = mesh(new THREE.ConeGeometry(0.05, 0.28, 4), black, 0.03, 0.24, z); fin.scale.z = 0.32; fin.rotation.set(z > 0 ? 0.22 : -0.22, 0, 0.78); head.add(fin);
    }
    eyes(head, glow('#ffffff', 0.6), 0.052, 0.153, 0.133, 0.017);
    for (const z of [0.125, -0.125]) head.add(mesh(rbox(0.07, 0.08, 0.02, 0.01), M.hair, 0.02, 0.04, z));
    // The claws: three blades from each fist, out only when he fights
    const clawMat = glow(L.claw, 0.5); addRim(clawMat, '#ffffff', 0.9);
    const claws = a => {
      const g = group(0.03, 0, 0); a.end.add(g);
      for (const z of [-0.045, 0, 0.045]) { const cl = mesh(new THREE.ConeGeometry(0.024, 0.5, 4), clawMat, 0, -0.34, z); cl.rotation.z = Math.PI; cl.scale.x = 0.7; g.add(cl); }
      return g;
    };
    extra.claws = [claws(R.armN), claws(R.armF)]; extra.clawMat = clawMat;
  },
  jean(R, extra) {
    const { M, L, head } = R;
    torso(R, { chestW: 0.42, chestD: 0.33, chest: M.base, waist: M.base, pelvis: M.base, shoulderMat: M.base, shoulder: [0.2, 0.12] });
    for (const l of [...R.arms, ...R.legs]) paintLimb(l, M.base, M.base);
    gloves(R, M.trim); hands(R, M.trim, 0.066); boots(R, M.trim, M.trim);
    const em = group(0.2, 0.44, 0); R.spine.add(em);
    for (const a of [0.55, -0.55]) { const w = mesh(rbox(0.02, 0.13, 0.03, 0.008), glow('#ffd27a', 0.9)); w.rotation.x = a; w.position.y = 0.02; em.add(w); }
    R.hips.add(mesh(rbox(0.36, 0.08, 0.41, 0.03), M.trim, 0, 0.1));
    head.add(mesh(new THREE.SphereGeometry(0.138, 24, 18), M.skin, 0, 0.1));
    hairDo(head, M.hair, { len: 2.4, width: 1.55, locks: 4, vol: 1.12, tilt: 0.4, sides: 1.9, bangs: false });
    eyes(head, toon('#1f6b4a'), 0.045, 0.126, 0.125, 0.016);
    const m = group(0.04, -0.09, 0); R.armN.end.add(m); extra.muzzle = m;
  },
  storm(R, extra) {
    const { M, L, head } = R;
    torso(R, { chestW: 0.42, chestD: 0.33, chest: M.base, waist: M.base, pelvis: M.under, shoulderMat: M.base, shoulder: [0.2, 0.12] });
    for (const l of [...R.arms, ...R.legs]) paintLimb(l, M.base, M.base);
    hands(R, M.trim, 0.066); boots(R, M.base, M.base);
    for (const a of R.arms) a.joint.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 14), M.gold, 0, -0.22));
    R.hips.add(mesh(rbox(0.35, 0.06, 0.4, 0.025), M.gold, 0, 0.12));
    head.add(mesh(new THREE.SphereGeometry(0.138, 24, 18), M.skin, 0, 0.1));
    hairDo(head, M.hair, { len: 3.6, width: 1.7, locks: 5, vol: 1.22, tilt: 0.42, bangs: false, sides: 2.3, back: 0.02 });
    head.add(mesh(frontBand(0.16, 0.024, Math.PI * 0.62), M.gold, 0, 0.178));
    head.add(mesh(new THREE.OctahedronGeometry(0.032), M.gold, 0.162, 0.184, 0));
    eyes(head, glow('#eaf6ff', 1.2), 0.045, 0.126, 0.125, 0.017);
    const m = group(0.04, -0.09, 0); R.armN.end.add(m); extra.muzzle = m;
    // A short cape from the shoulders
    const capeMat = toon('#f4f6fb', { side: THREE.DoubleSide }); addRim(capeMat, '#ffffff', 0.3);
    const cape = mesh(new THREE.PlaneGeometry(0.5, 0.95, 1, 4), capeMat, -0.2, 0.15, 0); cape.rotation.y = Math.PI / 2; cape.castShadow = false;
    R.spine.add(cape); extra.cape = cape;
  },
  psylocke(R, extra) {
    const { M, L, head } = R;
    torso(R, { chestW: 0.41, chestD: 0.32, chest: M.base, waist: M.base, pelvis: M.base, shoulderMat: M.base, shoulder: [0.2, 0.12] });
    for (const l of [...R.arms, ...R.legs]) paintLimb(l, M.base, M.base);
    hands(R, M.under, 0.066); boots(R, M.under, M.under);
    for (const a of R.arms) a.joint.add(mesh(new THREE.CylinderGeometry(0.074, 0.07, 0.16, 14), M.trim, 0, -0.17));
    head.add(mesh(new THREE.SphereGeometry(0.138, 24, 18), M.skin, 0, 0.1));
    hairDo(head, M.hair, { len: 3.9, width: 1.35, locks: 3, vol: 1.08, tilt: 0.3, sides: 2.2 });
    eyes(head, toon('#20182e'), 0.045, 0.126, 0.125, 0.016);
    const psi = glow(L.energy, 1.1, { transparent: true, opacity: 0.92 }), g = new THREE.BoxGeometry(0.03, 0.64, 0.09);
    extra.blades = [mesh(g, psi, 0.02, -0.37, 0), mesh(g, psi, 0.02, -0.37, 0)];
    R.armN.end.add(extra.blades[0]); R.armF.end.add(extra.blades[1]);
  },
};

// The young mutant: a teenager in an orange hoodie, jeans and trainers, small beside the X-Men
export function buildKidRig() {
  const M = { hood: toon('#ff7a1a'), jeans: toon('#2f4f86'), shoe: toon('#f2f2f2'), skin: toon('#c98d64'), hair: toon('#1d1714'), under: toon('#2f4f86') };
  for (const k of ['hood', 'jeans', 'shoe', 'hair']) addRim(M[k], '#ffffff', 0.35);
  const R = { M, ...skeleton(M, 0.66) };
  torso(R, { chestW: 0.44, chestD: 0.34, chest: M.hood, waist: M.hood, pelvis: M.jeans, shoulderMat: M.hood, shoulder: [0.2, 0.14] });
  for (const a of R.arms) paintLimb(a, M.hood, M.hood);
  for (const l of R.legs) paintLimb(l, M.jeans, M.jeans);
  hands(R, M.skin, 0.068); boots(R, M.shoe);
  R.spine.add(mesh(rbox(0.12, 0.16, 0.3, 0.05), toon('#e86812'), -0.2, 0.62));   // the hood, down
  R.head.add(mesh(new THREE.SphereGeometry(0.15, 24, 18), M.skin, 0, 0.1));
  R.head.add(mesh(capGeo(0.162, 0.5), M.hair, -0.01, 0.11));
  eyes(R.head, toon('#1a1a20'), 0.048, 0.138, 0.125, 0.02);
  R.root.traverse(o => { if (o.isMesh) o.receiveShadow = false; });
  return { ...R, extra: {}, mats: M, kid: true, cur: {}, phase: 0, stretch: 0, lastVy: 0, wasGround: true, yaw: 0, roll: 0 };
}
