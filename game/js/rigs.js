// Procedural character rigs. Nova and Echo (the two body frames' reference builds) keep their original
// placeholder art; the X-Men are built on the same skeleton by buildHeroRig (rigs_xmen.js), with the same
// attachment points (muzzle, blades, staff, edges) so animation and effects drive every hero alike.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { CHARS, ATTACH_LOOK } from './config.js';
import { buildHeroRig } from './rigs_xmen.js';

export const rbox = (w, h, d, r = 0.05) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
export const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 12);

// Fresnel rim so characters separate from bright backgrounds (readability, especially in 4P)
// The uniforms persist on mat.userData.rim so Echo's Veil can turn the rim into a shimmering outline;
// rimAlpha keeps that outline visible while the rest of the body fades out.
export function addRim(mat, color, strength = 0.45, power = 2.4) {
  const u = { rimColor: { value: new THREE.Color(color) }, rimStrength: { value: strength }, rimAlpha: { value: 0 } };
  mat.userData.rim = u; mat.userData.rimBase = strength; mat.userData.rimCol = new THREE.Color(color);
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = 'uniform vec3 rimColor; uniform float rimStrength; uniform float rimAlpha;\n' + shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      vec3 rimV = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
      float rimF = pow(1.0 - clamp(abs(dot(normal, rimV)), 0.0, 1.0), ${power.toFixed(2)});
      totalEmissiveRadiance += rimColor * rimF * rimStrength;
      diffuseColor.a = max(diffuseColor.a, rimF * rimAlpha);`);
  };
  mat.customProgramCacheKey = () => 'rim-' + power.toFixed(2);
}

export function mats(c) {
  const std = (color, rough, metal = 0.08) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
  return {
    base: std(c.base, 0.36), trim: std(c.trim, 0.42, 0.18), under: std(c.under, 0.72),
    energy: new THREE.MeshStandardMaterial({ color: c.energy, emissive: c.energy, emissiveIntensity: 2.4, roughness: 0.3 }),
    visor: new THREE.MeshStandardMaterial({ color: 0x0b1018, roughness: 0.12, metalness: 0.7 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xffa53a, emissive: 0xff8a1a, emissiveIntensity: 0.6, roughness: 0.1, transparent: true, opacity: 0.72 }),
  };
}
export function rimAll(M) { for (const k of ['base', 'trim', 'under']) addRim(M[k], '#d6ecff', k === 'under' ? 0.35 : 0.5); return M; }

export function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m;
}
export function group(x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); return g; }

export function limb(parent, M, upperLen, lowerLen, r, z, isArm) {
  const top = group(0, 0, z); parent.add(top);
  top.add(mesh(cap(r, upperLen - r), isArm ? M.under : M.under, 0, -upperLen / 2));
  const joint = group(0, -upperLen, 0); top.add(joint);
  joint.add(mesh(cap(r * 0.92, lowerLen - r), M.under, 0, -lowerLen / 2));
  const end = group(0, -lowerLen, 0); joint.add(end);
  return { top, joint, end };
}

export function buildPlayerRig(charId) {
  if (charId !== 'nova' && charId !== 'echo') return buildHeroRig(charId);
  const c = CHARS[charId], M = rimAll(mats(c)), nova = charId === 'nova';
  const root = group(), flip = group(), body = group();
  root.add(flip); flip.add(body);
  const hips = group(0, 0.95, 0); body.add(hips);
  hips.add(mesh(rbox(0.34, 0.2, 0.38, 0.07), M.trim, 0, 0.02));
  const spine = group(0, 0.08, 0); hips.add(spine);
  // Torso: armored chest over the undersuit
  spine.add(mesh(rbox(0.3, 0.3, 0.34, 0.08), M.under, 0, 0.18));
  const chestW = nova ? 0.5 : 0.44;
  spine.add(mesh(rbox(nova ? 0.38 : 0.34, 0.34, chestW, 0.1), M.base, 0.02, 0.42));
  spine.add(mesh(rbox(0.05, 0.05, chestW * 0.7, 0.02), M.energy, nova ? 0.2 : 0.18, 0.44));   // chest seam
  // Shoulders
  for (const z of [0.28, -0.28]) spine.add(mesh(rbox(0.26, 0.16, 0.2, 0.07), nova ? M.base : M.trim, 0, 0.55, z * (nova ? 1.05 : 0.95)));
  // Head
  const head = group(0, 0.66, 0); spine.add(head);
  const heads = {};
  if (nova) head.add(mesh(new THREE.SphereGeometry(0.15, 20, 16), M.base, 0, 0.1));
  if (nova) {
    head.add(mesh(rbox(0.2, 0.08, 0.28, 0.03), M.visor, 0.07, 0.11));
    head.add(mesh(rbox(0.04, 0.02, 0.26, 0.01), M.energy, 0.17, 0.11));
    head.add(mesh(rbox(0.18, 0.05, 0.1, 0.02), M.trim, -0.05, 0.25));      // helmet crest
  } else {
    // Neutral face core: his face and hair come from your approved reference, not from here
    const faceMat = new THREE.MeshStandardMaterial({ color: 0xc9bdb1, roughness: 0.85 });
    head.add(mesh(new THREE.SphereGeometry(0.14, 24, 18), faceMat, 0, 0.1));
    const eyeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a20, roughness: 0.4 });
    for (const z of [0.045, -0.045]) head.add(mesh(new THREE.SphereGeometry(0.018, 8, 6), eyeMat, 0.128, 0.125, z));
    // Short, messy blond hair (shown with the bare face and the mask; tucked away under the helmet)
    const hairMat = new THREE.MeshStandardMaterial({ color: 0xd9b464, roughness: 0.8 });
    const hair = group(0, 0.1, 0); head.add(hair);
    const hairCap = mesh(new THREE.SphereGeometry(0.15, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), hairMat);
    hairCap.rotation.z = 0.35; hair.add(hairCap);   // tilted back: hairline above the brow, fuller at the back
    for (const [x, y, z, rz] of [[0.09, 0.1, 0.05, -0.9], [0.1, 0.09, -0.04, -1.05], [0.05, 0.13, 0.0, -0.6], [0.0, 0.14, -0.06, -0.3]]) {
      const tuft = mesh(new THREE.ConeGeometry(0.035, 0.09, 5), hairMat, x, y, z); tuft.rotation.z = rz; hair.add(tuft);
    }
    // Full helmet: open-faced shell with a semi-transparent amber visor (face stays visible)
    const helmet = group(); head.add(helmet);
    helmet.add(mesh(new THREE.SphereGeometry(0.165, 28, 18, Math.PI + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.78), M.base, 0, 0.1));
    const visor = mesh(new THREE.SphereGeometry(0.17, 20, 14, Math.PI - 0.98, 1.96, 0.62, 1.2), M.amber, 0, 0.1);
    helmet.add(visor);
    for (const z of [0.15, -0.15]) helmet.add(mesh(rbox(0.07, 0.03, 0.02, 0.008), M.energy, 0.02, 0.17, z));
    // Survival mask: covers the lower face and both ears; eyes stay visible
    const mask = group(); head.add(mask);
    mask.add(mesh(new THREE.SphereGeometry(0.152, 24, 12, 0, Math.PI * 2, Math.PI * 0.55, Math.PI * 0.45), M.base, 0, 0.1));
    for (const z of [0.148, -0.148]) {
      const ear = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 16), M.trim, -0.01, 0.1, z); ear.rotation.x = Math.PI / 2; mask.add(ear);
    }
    for (const z of [0.03, -0.03]) mask.add(mesh(rbox(0.02, 0.018, 0.03, 0.006), M.energy, 0.148, 0.03, z));
    heads.helmet = helmet; heads.mask = mask; heads.hair = hair;
    // Protective collar the scarf is built into
    const ring = mesh(new THREE.TorusGeometry(0.17, 0.06, 10, 20), M.trim, 0.0, 0.62);
    ring.rotation.x = Math.PI / 2; spine.add(ring);
  }
  const collar = group(-0.2, 0.58, 0.16); spine.add(collar);

  const armN = limb(spine, M, 0.3, 0.29, 0.065, 0.3, true);
  const armF = limb(spine, M, 0.3, 0.29, 0.065, -0.3, true);
  armN.top.position.y = 0.53; armF.top.position.y = 0.53;
  for (const a of [armN, armF]) a.end.add(mesh(new THREE.SphereGeometry(0.07, 12, 10), M.under, 0, -0.03));
  const legN = limb(hips, M, 0.46, 0.46, 0.085, 0.13, false);
  const legF = limb(hips, M, 0.46, 0.46, 0.085, -0.13, false);
  for (const l of [legN, legF]) {
    l.top.add(mesh(rbox(0.2, 0.26, 0.2, 0.07), M.base, 0.02, -0.18));                  // thigh plate
    l.joint.add(mesh(rbox(0.19, 0.3, 0.18, 0.06), nova ? M.base : M.trim, 0.03, -0.24)); // shin guard
    l.end.add(mesh(rbox(0.26, 0.1, 0.16, 0.04), M.trim, 0.06, -0.02));                   // boot
  }
  // Marksman kit: skate blades kept subtle, just a fine gold line along each side of the sole;
  // light-booster jets under the boots, shown only while they fire
  const blades = [], jets = [];
  if (nova) {
    const jetMat = new THREE.MeshBasicMaterial({ color: 0xfff1c9, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    for (const l of [legN, legF]) {
      const j = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.34, 10, 1, true), jetMat); j.rotation.z = Math.PI; j.position.set(0.04, -0.26, 0);
      j.visible = false; l.end.add(j); jets.push(j);
    }
    const bladeMat = new THREE.MeshStandardMaterial({ color: c.energy, emissive: c.energy, emissiveIntensity: 1.6, roughness: 0.3 });
    for (const l of [legN, legF]) for (const z of [0.083, -0.083]) {
      const b = mesh(rbox(0.28, 0.018, 0.01, 0.004), bladeMat, 0.06, -0.066, z); l.end.add(b); blades.push(b);
    }
  }

  const extra = {};
  if (nova) {
    // CP-07: the Sentinel Bracer, gun and shield in one device
    const bracer = group(0, -0.14, 0); armN.joint.add(bracer);
    bracer.add(mesh(rbox(0.16, 0.34, 0.2, 0.04), M.base, 0.02, 0));
    bracer.add(mesh(rbox(0.05, 0.3, 0.14, 0.02), M.trim, 0.1, 0));
    bracer.add(mesh(rbox(0.03, 0.22, 0.03, 0.01), M.energy, 0.12, -0.02, 0.06));
    const muzzle = mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.08, 12), M.energy, 0.0, -0.2, 0); bracer.add(muzzle);
    extra.muzzle = muzzle;   // charge effects gather here
    const shield = group(0.14, -0.1, 0); bracer.add(shield);
    const plateMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: c.energy, emissiveIntensity: 1.6, transparent: true, opacity: 0.55, side: THREE.DoubleSide, roughness: 0.2 });
    const plate = new THREE.Mesh(new THREE.CircleGeometry(0.55, 6), plateMat); plate.rotation.y = Math.PI / 2; shield.add(plate);
    shield.scale.setScalar(0.001);
    extra.bracer = bracer; extra.shield = shield; extra.plateMat = plateMat;
    // Marksman kit: the loaded attachment, tinted to match the HUD
    const moduleMat = new THREE.MeshStandardMaterial({ color: ATTACH_LOOK.lance.tint, emissive: ATTACH_LOOK.lance.tint, emissiveIntensity: 2.2, roughness: 0.3 });
    const module = mesh(rbox(0.07, 0.1, 0.09, 0.02), moduleMat, 0.11, 0.09, 0); bracer.add(module);
    extra.module = module; extra.moduleMat = moduleMat;
    // Close range: hard light forms a faceted gauntlet over each fist, and a greave over the lead boot for
    // the air kick. Hidden until a strike needs it.
    const hardMat = new THREE.MeshStandardMaterial({ color: '#fff4d6', emissive: c.energy, emissiveIntensity: 2.6, transparent: true, opacity: 0.82, roughness: 0.15, flatShading: true });
    extra.gauntlets = [armN, armF].map(a => {
      const g = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), hardMat); g.position.set(0.02, -0.05, 0); g.scale.set(1.1, 1.3, 1); g.visible = false; a.end.add(g); return g;
    });
    const greave = new THREE.Mesh(new THREE.IcosahedronGeometry(0.15, 0), hardMat); greave.position.set(0.08, -0.03, 0); greave.scale.set(1.7, 0.9, 1); greave.visible = false;
    legN.end.add(greave); extra.greave = greave; extra.hardMat = hardMat;
    // Back pack
    spine.add(mesh(rbox(0.14, 0.3, 0.3, 0.05), M.trim, -0.22, 0.4));
    extra.edges = { fistN: [armN.joint, armN.end, 0.55], fistF: [armF.joint, armF.end, 0.55], boot: [legN.joint, legN.end, 0.5] };
  } else {
    // Gauntlet multi-tools
    for (const a of [armN, armF]) {
      a.joint.add(mesh(rbox(0.15, 0.24, 0.16, 0.04), M.trim, 0.01, -0.15));
      a.joint.add(mesh(rbox(0.03, 0.2, 0.03, 0.01), M.energy, 0.09, -0.15));
    }
    // Hunter kit: hard-light combat blades that extend from both gauntlets past the fist
    const bladeGeo = new THREE.BoxGeometry(0.035, 0.62, 0.11);
    const bladeN = mesh(bladeGeo, M.energy, 0.02, -0.36, 0), bladeF = mesh(bladeGeo, M.energy, 0.02, -0.36, 0);
    armN.end.add(bladeN); armF.end.add(bladeF); bladeN.visible = bladeF.visible = false;
    extra.blade = bladeN; extra.bladeF = bladeF;
    // Staff: stowed diagonally on the back, drawn into the hands for staff moves and rifle shots
    const staffGeo = new THREE.CylinderGeometry(0.035, 0.035, 1.5, 10);
    const back = mesh(staffGeo, M.trim, -0.24, 0.42, 0); back.rotation.z = 0.9; spine.add(back);
    const bt1 = mesh(new THREE.ConeGeometry(0.06, 0.4, 4), M.energy, 0, 0.95, 0), bt2 = mesh(new THREE.ConeGeometry(0.06, 0.4, 4), M.energy, 0, -0.95, 0);
    bt2.rotation.z = Math.PI; bt1.scale.z = bt2.scale.z = 0.35; back.add(bt1); back.add(bt2); extra.backTips = [bt1, bt2];
    const hand = group(0, -0.02, 0); armN.end.add(hand);
    const hs = mesh(staffGeo, M.trim, 0, 0, 0); hs.rotation.z = Math.PI / 2; hand.add(hs);
    for (const s of [-0.75, 0.75]) hand.add(mesh(new THREE.SphereGeometry(0.05, 10, 8), M.energy, s, 0, 0));
    // Glaive edges on both ends (Hunter kit)
    const tipGeo = new THREE.ConeGeometry(0.07, 0.5, 4);
    const tipA = mesh(tipGeo, M.energy, 1.0, 0, 0), tipB = mesh(tipGeo, M.energy, -1.0, 0, 0);
    tipA.rotation.z = -Math.PI / 2; tipB.rotation.z = Math.PI / 2; tipA.scale.z = tipB.scale.z = 0.35;
    hand.add(tipA); hand.add(tipB); extra.glaive = [tipA, tipB];
    const staffTip = group(1.05, 0, 0); hand.add(staffTip); extra.staffTip = staffTip;   // rifle muzzle (front tip)
    const staffTail = group(-1.05, 0, 0); hand.add(staffTail);
    const bladeTipN = group(0.02, -0.67, 0), bladeTipF = group(0.02, -0.67, 0); armN.end.add(bladeTipN); armF.end.add(bladeTipF);
    // Weapon edges for swing trails: [base, tip, how far out from the base the trail starts (0-1)]
    extra.edges = { bladeN: [armN.end, bladeTipN, 0.15], bladeF: [armF.end, bladeTipF, 0.15], glaiveA: [hand, staffTip, 0.4], glaiveB: [hand, staffTail, 0.4] };
    hand.visible = false; extra.hand = hand;
    extra.backStaff = back; extra.handStaff = hand;
    // Utility belt
    hips.add(mesh(rbox(0.36, 0.07, 0.4, 0.03), M.under, 0, 0.1));
    for (const z of [-0.12, 0.12]) hips.add(mesh(rbox(0.08, 0.09, 0.07, 0.02), M.trim, 0.17, 0.08, z));
    // Hunter kit: two energy snares clipped to the belt
    extra.beltSnares = [];
    for (const z of [0.22, -0.22]) {
      const g = group(-0.03, 0.05, z); hips.add(g);
      const disc = mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.035, 18), M.under); disc.rotation.x = Math.PI / 2; g.add(disc);
      const ring = mesh(new THREE.TorusGeometry(0.07, 0.012, 6, 18), M.energy, 0, 0, z > 0 ? 0.02 : -0.02); g.add(ring);
      extra.beltSnares.push(g);
    }
  }

  extra.blades = blades; extra.jets = jets;
  root.traverse(o => { if (o.isMesh) o.receiveShadow = false; });
  const rig = { root, flip, body, hips, spine, head, collar, armN, armF, legN, legF, extra, mats: M, char: charId, phase: 0, cur: {}, scarf: null, heads, headMode: null,
    yaw: 0, stretch: 0, lastVy: 0, wasGround: true, lastRocketT: 0, wasCrouch: false };
  rig.setHead = mode => {
    if (nova || rig.headMode === mode) return;
    rig.headMode = mode; heads.helmet.visible = mode === 'helmet'; heads.mask.visible = mode === 'mask'; heads.hair.visible = mode !== 'helmet';
  };
  rig.setHead('helmet');

  addCloak(rig, M);
  return rig;
}

// Veil: the body turns glassy and a pale rim outlines it. Collected before render.js adds the player-colour
// ring, so the ring stays solid for teammates.
export function addCloak(rig, M) {
  const SHIMMER = new THREE.Color('#e6f4ff');
  const cloakMats = new Set(); rig.root.traverse(o => { if (o.isMesh) cloakMats.add(o.material); });
  const cloakBase = [...cloakMats].map(m => ({ m, op: m.opacity, tr: m.transparent, energy: m === M.energy }));
  rig.cloak = 0;
  rig.setCloak = k => {
    k = Math.max(0, Math.min(1, k));
    if (k === rig.cloak) return;
    const flip = (rig.cloak > 0.001) !== (k > 0.001); rig.cloak = k;
    for (const b of cloakBase) {
      if (flip) { b.m.transparent = k > 0.001 || b.tr; b.m.needsUpdate = true; }
      b.m.opacity = b.op * (1 - (b.energy ? 0.55 : 0.88) * k);
      const r = b.m.userData.rim;
      if (r) {
        r.rimStrength.value = b.m.userData.rimBase + 1.8 * k; r.rimAlpha.value = 0.95 * k;
        r.rimColor.value.copy(b.m.userData.rimCol).lerp(SHIMMER, k);
      }
    }
  };
}
