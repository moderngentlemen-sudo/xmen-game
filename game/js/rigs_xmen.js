// The X-Men, built on the Nova Striker skeleton (procedural placeholder art, an unofficial fan take on each
// costume). Every hero keeps the attachment points their frame's animation and effects expect, hidden
// where they have no use for them. Nova frame: muzzle, bracer shield, gauntlets, greave, jets. Echo frame:
// blades, staff, glaive tips, staff tip, edges, belt snares. On top of that each hero gets their own costume,
// read side-on the way the camera sees them:
//   Cyclops: navy suit, yellow gloves, boots and harness, the ruby visor (his shots and charge glow there)
//   Wolverine: yellow and blue, the finned cowl, three adamantium claws a hand that only come out to fight
//   Storm: black suit, white mane and cape, gold tiara; lightning gathers in her hand
//   Jean Grey: Phoenix green and gold, long red hair, a gold sash
//   Psylocke: deep blue, long violet hair, the red sash (her scarf modes), psychic blades and a psi-glaive
import * as THREE from 'three';
import { CHARS } from './config.js';
import { rbox, cap, mats, rimAll, mesh, group, limb, addCloak, addRim } from './rigs.js';

const std = (color, rough = 0.5, metal = 0.08, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
const glowMat = (color, k = 2.4, extra = {}) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: k, roughness: 0.3, ...extra });
// A band round the front half of the head (visor, tiara), centred on the face (+x)
const frontBand = (r, h, arc = Math.PI * 0.86) => new THREE.CylinderGeometry(r, r, h, 28, 1, true, Math.PI / 2 - arc / 2, arc);
// A cap over the top of the head, down to `cover` of the way (0 top, 1 bottom)
const capGeo = (r, cover, phiStart = 0, phiLength = Math.PI * 2) => new THREE.SphereGeometry(r, 28, 16, phiStart, phiLength, 0, Math.PI * cover);

export function buildHeroRig(charId) {
  const c = CHARS[charId], L = c.look || {}, nova = c.arch === 'nova';
  const M = rimAll(mats(c));
  M.skin = std(L.skin || '#e2b896', 0.82); M.hair = std(L.hair || '#3a2a1a', 0.86);
  M.dark = std('#15161c', 0.6); addRim(M.dark, '#d6ecff', 0.35);
  M.gold = std('#e9c46a', 0.32, 0.55); addRim(M.gold, '#fff2c8', 0.4);
  const root = group(), flip = group(), body = group();
  root.add(flip); flip.add(body);
  const hips = group(0, 0.95, 0); body.add(hips);
  const spine = group(0, 0.08, 0); hips.add(spine);
  const head = group(0, 0.66, 0); spine.add(head);
  const collar = group(-0.2, 0.58, 0.16); spine.add(collar);   // where a scarf, sash or cape hangs from
  const armN = limb(spine, M, 0.3, 0.29, 0.065, 0.3, true), armF = limb(spine, M, 0.3, 0.29, 0.065, -0.3, true);
  armN.top.position.y = 0.53; armF.top.position.y = 0.53;
  const legN = limb(hips, M, 0.46, 0.46, 0.085, 0.13, false), legF = limb(hips, M, 0.46, 0.46, 0.085, -0.13, false);
  const R = { id: charId, c, L, M, hips, spine, head, collar, armN, armF, legN, legF, arms: [armN, armF], legs: [legN, legF] };
  // Limb colours: upper and lower segment of each arm and leg
  R.paintLimb = (l, upper, lower) => { l.top.children[0].material = upper; l.joint.children[0].material = lower; };
  const extra = {};
  BUILD[charId](R, extra);
  if (nova) novaFrame(R, extra); else echoFrame(R, extra);
  root.traverse(o => { if (o.isMesh) o.receiveShadow = false; });
  const rig = { root, flip, body, hips, spine, head, collar, armN, armF, legN, legF, extra, mats: M, char: charId, phase: 0, cur: {}, scarf: null,
    heads: {}, headMode: null, yaw: 0, stretch: 0, lastVy: 0, wasGround: true, lastRocketT: 0, wasCrouch: false, hero: true };
  rig.setHead = () => {};
  addCloak(rig, M);
  return rig;
}

// ---- The frames' working parts -----------------------------------------------------------------

// Nova frame (Cyclops, Storm, Jean): close-range strikes flare in the hero's energy over the fists (and the
// lead boot for the air kick); hover jets show under the boots while they fly. No bracer, no skate blades.
function novaFrame(R, extra) {
  const { M, armN, armF, legN, legF } = R;
  const bracer = group(0, -0.14, 0); armN.joint.add(bracer);
  const shield = group(0.14, -0.1, 0); bracer.add(shield); shield.scale.setScalar(0.001);
  const plateMat = std('#ffffff'); shield.add(new THREE.Mesh(new THREE.CircleGeometry(0.55, 6), plateMat));
  extra.bracer = bracer; extra.shield = shield; extra.plateMat = plateMat;
  if (!extra.muzzle) { const m = group(0.04, -0.08, 0); armN.end.add(m); extra.muzzle = m; }
  // The loaded attachment is shown on the HUD only (a stand-in the animation can tint)
  extra.moduleMat = std('#ffffff'); extra.module = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.01, 0.01), extra.moduleMat);
  const hardMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: R.c.energy, emissiveIntensity: 2.6, transparent: true, opacity: 0.7, roughness: 0.15, flatShading: true });
  extra.gauntlets = [armN, armF].map(a => {
    const g = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), hardMat); g.position.set(0.02, -0.05, 0); g.scale.set(1.1, 1.3, 1); g.visible = false; a.end.add(g); return g;
  });
  const greave = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), hardMat); greave.position.set(0.08, -0.03, 0); greave.scale.set(1.7, 0.9, 1); greave.visible = false;
  legN.end.add(greave); extra.greave = greave; extra.hardMat = hardMat;
  extra.edges = { fistN: [armN.joint, armN.end, 0.55], fistF: [armF.joint, armF.end, 0.55], boot: [legN.joint, legN.end, 0.5] };
  extra.jets = [];
  if (CHARS[R.id].kit.boost) {
    const jetMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(R.c.energy).lerp(new THREE.Color('#ffffff'), 0.6), transparent: true, opacity: 0.6,
      blending: THREE.AdditiveBlending, depthWrite: false });
    for (const l of [legN, legF]) {
      const j = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.42, 10, 1, true), jetMat); j.rotation.z = Math.PI; j.position.set(0.04, -0.28, 0);
      j.visible = false; l.end.add(j); extra.jets.push(j);
    }
  }
  extra.blades = [];
}

// Echo frame (Wolverine, Psylocke): blades on both hands and a staff held for staff moves. Wolverine's blades
// are his claws and he has no staff (the hidden parts keep the animation's references valid).
function echoFrame(R, extra) {
  const { M, armN, armF, spine, hips } = R;
  if (!extra.blade) {
    const g = new THREE.BoxGeometry(0.035, 0.62, 0.11);
    extra.blade = mesh(g, M.energy, 0.02, -0.36, 0); extra.bladeF = mesh(g, M.energy, 0.02, -0.36, 0);
    armN.end.add(extra.blade); armF.end.add(extra.bladeF);
  }
  extra.blade.visible = extra.bladeF.visible = false;
  const tipN = group(0.02, -0.62, 0), tipF = group(0.02, -0.62, 0); armN.end.add(tipN); armF.end.add(tipF);
  const hand = group(0, -0.02, 0); armN.end.add(hand); hand.visible = false;
  const staffTip = group(1.05, 0, 0), staffTail = group(-1.05, 0, 0); hand.add(staffTip); hand.add(staffTail);
  const back = group(-0.24, 0.42, 0); spine.add(back); back.visible = false;
  let glaive = [group(), group()], backTips = [group(), group()];
  if (extra.staffMat) {
    // A staff of light, double-bladed, conjured only while she uses it
    const staffGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.5, 10);
    const hs = mesh(staffGeo, extra.staffMat); hs.rotation.z = Math.PI / 2; hand.add(hs);
    const tipGeo = new THREE.ConeGeometry(0.065, 0.5, 4);
    const tA = mesh(tipGeo, extra.staffMat, 1.0, 0, 0), tB = mesh(tipGeo, extra.staffMat, -1.0, 0, 0);
    tA.rotation.z = -Math.PI / 2; tB.rotation.z = Math.PI / 2; tA.scale.z = tB.scale.z = 0.35; hand.add(tA); hand.add(tB);
    glaive = [tA, tB];
  }
  extra.hand = hand; extra.handStaff = hand; extra.backStaff = back; extra.staffTip = staffTip; extra.glaive = glaive; extra.backTips = backTips;
  extra.beltSnares = [];
  // Swing trails: the blades always; staff moves trail from the staff (Psylocke) or the claws again (Wolverine)
  extra.edges = { bladeN: [armN.end, tipN, 0.15], bladeF: [armF.end, tipF, 0.15],
    glaiveA: extra.staffMat ? [hand, staffTip, 0.4] : [armN.end, tipN, 0.15], glaiveB: extra.staffMat ? [hand, staffTail, 0.4] : [armF.end, tipF, 0.15] };
  hips.add(mesh(rbox(0.36, 0.07, 0.4, 0.03), extra.beltMat || M.under, 0, 0.1));   // belt
}

// ---- Shared body pieces ---------------------------------------------------------------------------

function torso(R, { chestW = 0.46, chestD = 0.36, chest, waist, pelvis, shoulder, shoulderMat }) {
  const { spine, hips } = R;
  hips.add(mesh(rbox(0.34, 0.2, 0.38, 0.07), pelvis, 0, 0.02));
  spine.add(mesh(rbox(0.3, 0.3, 0.34, 0.08), waist, 0, 0.18));
  spine.add(mesh(rbox(chestD, 0.34, chestW, 0.1), chest, 0.02, 0.42));
  for (const z of [0.28, -0.28]) spine.add(mesh(rbox(shoulder ? shoulder[0] : 0.24, shoulder ? shoulder[1] : 0.15, 0.2, 0.07), shoulderMat, 0, 0.55, z));
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
// Long hair with volume: a crown fuller than the skull, swept back off the face; side curtains past the jaw;
// a fall of locks down the back; optional bangs. Static: it moves with the head.
function hairDo(head, mat, { len = 2.6, width = 1.25, locks = 3, vol = 1.1, tilt = 0.3, bangs = true, sides = 1.6, back = 0 } = {}) {
  const crown = mesh(capGeo(0.158 * vol, 0.56), mat, -0.014, 0.112, 0); crown.rotation.z = tilt; head.add(crown);
  if (bangs) head.add(mesh(frontBand(0.118, 0.05, Math.PI * 0.7), mat, 0.004, 0.19, 0));   // a fringe across the forehead
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

// ---- The heroes ---------------------------------------------------------------------------------------

const BUILD = {
  cyclops(R, extra) {
    const { M, L, head } = R;
    torso(R, { chestW: 0.48, chestD: 0.37, chest: M.base, waist: M.base, pelvis: M.under, shoulderMat: M.trim, shoulder: [0.22, 0.13] });
    for (const l of [...R.arms, ...R.legs]) R.paintLimb(l, M.base, M.base);
    gloves(R, M.trim); hands(R, M.trim); boots(R, M.trim, M.trim);
    for (const l of R.legs) l.top.add(mesh(rbox(0.12, 0.1, 0.2, 0.03), M.trim, 0.0, -0.32));   // thigh holster straps
    // Harness: yellow straps over the shoulders to the belt, and the belt's X buckle
    R.spine.add(mesh(rbox(0.04, 0.42, 0.06, 0.015), M.trim, 0.2, 0.36, 0.1)); R.spine.add(mesh(rbox(0.04, 0.42, 0.06, 0.015), M.trim, 0.2, 0.36, -0.1));
    R.hips.add(mesh(rbox(0.37, 0.07, 0.41, 0.03), M.trim, 0, 0.11));
    const buckle = group(0.19, 0.11, 0); R.hips.add(buckle);
    for (const a of [0.7, -0.7]) { const b = mesh(rbox(0.02, 0.09, 0.025, 0.006), glowMat(c3(L.visor), 1.2)); b.rotation.x = a; buckle.add(b); }
    // Head: the navy cowl over the skull, chin and mouth bare, and the ruby visor in its gold housing
    head.add(mesh(new THREE.SphereGeometry(0.14, 24, 18), M.skin, 0, 0.1));
    head.add(mesh(capGeo(0.149, 0.62), M.base, 0, 0.1));
    head.add(mesh(frontBand(0.156, 0.085), M.trim, 0, 0.122));
    const lens = mesh(frontBand(0.162, 0.045, Math.PI * 0.8), M.energy, 0, 0.122); head.add(lens);   // the visor glows with every charge
    const muzzle = group(0.18, 0.122, 0); head.add(muzzle); extra.muzzle = muzzle;
    for (const z of [0.15, -0.15]) head.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 12), M.trim, 0, 0.122, z).rotateX(Math.PI / 2));
  },

  wolverine(R, extra) {
    const { M, L, head } = R;
    const blue = M.trim, yellow = M.base, black = M.dark;
    torso(R, { chestW: 0.5, chestD: 0.38, chest: yellow, waist: yellow, pelvis: blue, shoulderMat: blue, shoulder: [0.27, 0.17] });
    for (const a of R.arms) R.paintLimb(a, blue, yellow);
    for (const l of R.legs) R.paintLimb(l, yellow, blue);
    gloves(R, blue); hands(R, blue); boots(R, blue, blue);
    // Black tiger stripes down his sides, the red belt and its X
    for (const y of [0.52, 0.44, 0.36]) for (const z of [0.236, -0.236]) { const st = mesh(rbox(0.24, 0.032, 0.012, 0.006), black, -0.03, y, z); st.rotation.z = -0.38; R.spine.add(st); }
    extra.beltMat = std('#b8232b', 0.5);
    const xb = group(0.19, 0.1, 0); R.hips.add(xb);
    for (const a of [0.7, -0.7]) { const b = mesh(rbox(0.02, 0.08, 0.025, 0.006), yellow); b.rotation.x = a; xb.add(b); }
    // Head: the yellow mask in front, the blue cowl behind, a black band round the eyes sweeping up into the
    // fins, white eye slits, the jaw bare
    head.add(mesh(new THREE.SphereGeometry(0.142, 24, 18), M.skin, 0, 0.1));
    head.add(mesh(capGeo(0.151, 0.6, Math.PI / 2, Math.PI), yellow, 0, 0.1));
    head.add(mesh(capGeo(0.153, 0.64, -Math.PI / 2, Math.PI), blue, 0, 0.1));
    head.add(mesh(frontBand(0.156, 0.05, Math.PI * 0.62), black, 0, 0.132));
    for (const z of [0.1, -0.1]) {
      const fin = mesh(new THREE.ConeGeometry(0.05, 0.28, 4), black, 0.03, 0.24, z); fin.scale.z = 0.32; fin.rotation.set(z > 0 ? 0.22 : -0.22, 0, 0.78); head.add(fin);
    }
    eyes(head, glowMat('#ffffff', 0.6), 0.052, 0.153, 0.133, 0.017);
    for (const z of [0.125, -0.125]) head.add(mesh(rbox(0.07, 0.08, 0.02, 0.01), M.hair, 0.02, 0.04, z));   // sideburns
    // The claws: three adamantium blades from each fist, out only when he fights
    const clawMat = std(L.claw || '#eef3f8', 0.14, 0.9, { emissive: '#b9cde0', emissiveIntensity: 0.6 });
    addRim(clawMat, '#ffffff', 0.9);
    const claws = a => {
      const g = group(0.03, 0, 0); a.end.add(g);
      for (const z of [-0.045, 0, 0.045]) { const cl = mesh(new THREE.ConeGeometry(0.024, 0.5, 4), clawMat, 0, -0.34, z); cl.rotation.z = Math.PI; cl.scale.x = 0.7; g.add(cl); }
      return g;
    };
    extra.blade = claws(R.armN); extra.bladeF = claws(R.armF);
  },

  storm(R, extra) {
    const { M, L, head } = R;
    torso(R, { chestW: 0.42, chestD: 0.33, chest: M.base, waist: M.base, pelvis: M.under, shoulderMat: M.base, shoulder: [0.2, 0.12] });
    for (const l of [...R.arms, ...R.legs]) R.paintLimb(l, M.base, M.base);
    hands(R, M.trim, 0.066); boots(R, M.base, M.base);
    for (const a of R.arms) a.joint.add(mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.06, 14), M.gold, 0, -0.22));    // gold cuffs
    R.hips.add(mesh(rbox(0.35, 0.06, 0.4, 0.025), M.gold, 0, 0.12));
    // Head: dark skin, the white mane falling down her back, a gold tiara; her eyes whiten with power
    head.add(mesh(new THREE.SphereGeometry(0.138, 24, 18), M.skin, 0, 0.1));
    hairDo(head, M.hair, { len: 3.6, width: 1.7, locks: 5, vol: 1.22, tilt: 0.42, bangs: false, sides: 2.3, back: 0.02 });
    head.add(mesh(frontBand(0.16, 0.024, Math.PI * 0.62), M.gold, 0, 0.178));
    head.add(mesh(new THREE.OctahedronGeometry(0.032), M.gold, 0.162, 0.184, 0));
    eyes(head, glowMat('#eaf6ff', 1.4), 0.045, 0.126, 0.125, 0.017);
    const m = group(0.04, -0.09, 0); R.armN.end.add(m); extra.muzzle = m;
    R.collar.position.set(-0.16, 0.6, 0);   // the cape hangs from her shoulders
  },

  jean(R, extra) {
    const { M, L, head } = R;
    torso(R, { chestW: 0.42, chestD: 0.33, chest: M.base, waist: M.base, pelvis: M.base, shoulderMat: M.base, shoulder: [0.2, 0.12] });
    for (const l of [...R.arms, ...R.legs]) R.paintLimb(l, M.base, M.base);
    gloves(R, M.trim); hands(R, M.trim, 0.066); boots(R, M.trim, M.trim);
    // The Phoenix emblem on her chest and the gold sash at her waist
    const em = group(0.2, 0.44, 0); R.spine.add(em);
    for (const a of [0.55, -0.55]) { const w = mesh(rbox(0.02, 0.13, 0.03, 0.008), glowMat('#ffd27a', 1.1)); w.rotation.x = a; w.position.y = 0.02; em.add(w); }
    R.hips.add(mesh(rbox(0.36, 0.08, 0.41, 0.03), M.trim, 0, 0.1));
    head.add(mesh(new THREE.SphereGeometry(0.138, 24, 18), M.skin, 0, 0.1));
    hairDo(head, M.hair, { len: 2.4, width: 1.55, locks: 4, vol: 1.12, tilt: 0.4, sides: 1.9, bangs: false });
    eyes(head, std('#1f6b4a', 0.4), 0.045, 0.126, 0.125, 0.016);
    const m = group(0.04, -0.09, 0); R.armN.end.add(m); extra.muzzle = m;
    R.collar.position.set(-0.17, 0.12, 0.12);   // the sash hangs from her belt
  },

  psylocke(R, extra) {
    const { M, L, head } = R;
    torso(R, { chestW: 0.41, chestD: 0.32, chest: M.base, waist: M.base, pelvis: M.base, shoulderMat: M.base, shoulder: [0.2, 0.12] });
    for (const l of [...R.arms, ...R.legs]) R.paintLimb(l, M.base, M.base);
    hands(R, M.under, 0.066); boots(R, M.under, M.under);
    for (const a of R.arms) a.joint.add(mesh(new THREE.CylinderGeometry(0.074, 0.07, 0.16, 14), M.trim, 0, -0.17));   // red arm wraps
    extra.beltMat = M.trim;
    head.add(mesh(new THREE.SphereGeometry(0.138, 24, 18), M.skin, 0, 0.1));
    hairDo(head, M.hair, { len: 3.9, width: 1.35, locks: 3, vol: 1.08, tilt: 0.3, sides: 2.2 });
    eyes(head, std('#20182e', 0.4), 0.045, 0.126, 0.125, 0.016);
    // Psychic blades: a glowing edge of thought from each fist; the psi-glaive is the same light
    const bladeGeo = new THREE.BoxGeometry(0.03, 0.64, 0.09), psi = glowMat('#c04dff', 1.25, { transparent: true, opacity: 0.92 });
    extra.blade = mesh(bladeGeo, psi, 0.02, -0.37, 0); extra.bladeF = mesh(bladeGeo, psi, 0.02, -0.37, 0);
    R.armN.end.add(extra.blade); R.armF.end.add(extra.bladeF);
    extra.staffMat = glowMat('#c04dff', 1.1, { transparent: true, opacity: 0.9 });
    R.collar.position.set(-0.18, 0.12, 0.1);   // the sash ties at her waist
  },
};
const c3 = v => v || '#ff2a1f';
