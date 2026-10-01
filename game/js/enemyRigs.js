// Enemy rigs (procedural placeholder art, an unofficial fan take). The Sentinel program's machines wear purple
// plate with grey faceplates and hands; every eye and tell keeps the reserved hostile magenta so threats read
// the same everywhere. The Danger Room's training rigs are grey with hazard yellow. The two bosses are people:
// Juggernaut in his maroon armour and iron-banded helmet, Magneto in red and purple inside a ring of orbiting
// steel. The bosses keep the part names their animation drives (legs/hip/knee, torso, chest, head, eye, core,
// pod, plates, armN/armF, hammer, blade for Juggernaut; hull, rotors, cannon, muzzle, eye, shield for Magneto).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { HOSTILE } from './config.js';
import { addRim } from './rigs.js';

const rbox = (w, h, d, r = 0.06) => new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
const cap = (r, len) => new THREE.CapsuleGeometry(r, len, 4, 10);
const std = (color, rough, metal = 0.1, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

// Palettes. `plate` and `face` flash white when hit (their emissive), `energy` carries every tell.
const LOOKS = {
  sentinel: { plate: 0x6d3aa8, face: 0xb2bac8, joint: 0x2a2638 },
  training: { plate: 0x8d96a3, face: 0xe8b730, joint: 0x2e333c },
  juggernaut: { plate: 0x8a3324, face: 0x6f6b69, joint: 0x4a2f25 },
  magneto: { plate: 0xb3222b, face: 0x8d939c, joint: 0x4b2a7a },
};
const LOOK_OF = { post: 'training', turret: 'training', warden: 'juggernaut', stormcaller: 'magneto' };

function mats(type) {
  const L = LOOKS[LOOK_OF[type] || 'sentinel'];
  const M = {
    plate: std(L.plate, 0.4, 0.22, { emissive: 0xffffff, emissiveIntensity: 0 }),
    face: std(L.face, 0.34, 0.4, { emissive: 0xffffff, emissiveIntensity: 0 }),
    joint: std(L.joint, 0.62, 0.25),
    energy: new THREE.MeshStandardMaterial({ color: HOSTILE, emissive: HOSTILE, emissiveIntensity: 2.2, roughness: 0.3 }),
  };
  addRim(M.plate, '#ff9cc5', 0.35); addRim(M.face, '#ffc2dc', 0.3); addRim(M.joint, '#ff7fb2', 0.3);
  return M;
}
function add(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m;
}
function grp(parent, x = 0, y = 0, z = 0) { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; }

// The Sentinel head, facing +x: the purple helmet, the grey faceplate with two magenta eye slits and a mouth
// grille, and the round grey discs at the sides. s is its height.
function sentinelHead(parent, M, s, x = 0, y = 0) {
  const h = grp(parent, x, y, 0);
  add(h, rbox(s * 0.92, s, s * 0.9, s * 0.22), M.plate);
  add(h, rbox(s * 0.16, s * 0.74, s * 0.72, s * 0.06), M.face, s * 0.42, -s * 0.08);
  const eyes = [];
  for (const z of [s * 0.17, -s * 0.17]) eyes.push(add(h, rbox(s * 0.06, s * 0.08, s * 0.2, s * 0.02), M.energy, s * 0.51, s * 0.1, z));
  for (const yy of [-0.2, -0.28, -0.36]) add(h, rbox(s * 0.05, s * 0.026, s * 0.36, s * 0.01), M.joint, s * 0.51, s * yy);
  for (const z of [s * 0.46, -s * 0.46]) { const d = add(h, new THREE.CylinderGeometry(s * 0.2, s * 0.2, s * 0.08, 16), M.face, -s * 0.02, 0, z); d.rotation.x = Math.PI / 2; }
  return { head: h, eye: eyes[0] };
}

export function buildEnemyRig(e) {
  const M = mats(e.type);
  const root = new THREE.Group(), flip = grp(root), body = grp(flip);
  const R = { root, flip, body, mats: M, type: e.type, parts: {}, lean: 0, bob: 0 };
  const P = R.parts;
  switch (e.type) {
    case 'swarmer': {   // Prowler: a low Sentinel crawler, faceplate forward
      P.core = grp(body, 0, 0.42, 0);
      add(P.core, rbox(0.62, 0.42, 0.52, 0.16), M.plate);
      add(P.core, rbox(0.3, 0.12, 0.54, 0.05), M.joint, -0.05, 0.2);
      add(P.core, rbox(0.1, 0.3, 0.42, 0.04), M.face, 0.28, 0.0);
      P.eye = add(P.core, rbox(0.05, 0.07, 0.28, 0.02), M.energy, 0.34, 0.05);
      for (const [x, z] of [[0.18, 0.2], [-0.18, 0.2], [0.18, -0.2], [-0.18, -0.2]]) {
        const l = add(body, cap(0.045, 0.3), M.joint, x, 0.2, z); l.rotation.z = x > 0 ? -0.5 : 0.5;
      }
      break;
    }
    case 'shield': {    // Sentinel Guard: a trooper behind a grey riot shield
      for (const z of [0.16, -0.16]) add(body, cap(0.09, 0.62), M.joint, 0, 0.42, z);
      P.torso = grp(body, 0, 1.0, 0);
      add(P.torso, rbox(0.55, 0.62, 0.6, 0.12), M.plate, 0, 0.2);
      add(P.torso, rbox(0.62, 0.14, 0.66, 0.05), M.face, 0, 0.5);
      P.eye = sentinelHead(P.torso, M, 0.34, 0.04, 0.72).eye;
      P.shield = grp(P.torso, 0.55, 0.1, 0);
      add(P.shield, rbox(0.14, 1.55, 1.05, 0.08), M.face);
      for (const y of [-0.74, 0.74]) add(P.shield, rbox(0.16, 0.05, 1.0, 0.02), M.energy, 0.02, y);
      for (const z of [-0.5, 0.5]) add(P.shield, rbox(0.16, 1.45, 0.05, 0.02), M.energy, 0.02, 0, z);
      break;
    }
    case 'sniper': {    // Spotter: a slim Sentinel with a long rifle
      for (const z of [0.12, -0.12]) add(body, cap(0.07, 0.7), M.joint, 0, 0.45, z);
      P.torso = grp(body, 0, 1.05, 0);
      add(P.torso, rbox(0.4, 0.5, 0.46, 0.1), M.plate, 0, 0.16);
      P.eye = sentinelHead(P.torso, M, 0.3, 0.03, 0.56).eye;
      P.gun = grp(P.torso, 0.05, 0.3, 0.26);
      const barrel = add(P.gun, new THREE.CylinderGeometry(0.05, 0.06, 1.5, 10), M.joint, 0.75, 0, 0); barrel.rotation.z = Math.PI / 2;
      add(P.gun, rbox(0.4, 0.14, 0.12, 0.03), M.face, 0.1, 0, 0);
      P.muzzle = add(P.gun, new THREE.SphereGeometry(0.06, 10, 8), M.energy, 1.52, 0, 0);
      break;
    }
    case 'brute': {     // Mk-I Sentinel: the classic hulk, purple plate, grey head and hands, armour plates that break
      for (const z of [0.36, -0.36]) { add(body, cap(0.2, 0.8), M.joint, 0, 0.62, z); add(body, rbox(0.46, 0.22, 0.4, 0.08), M.plate, 0.08, 0.1, z); }
      P.torso = grp(body, 0, 1.4, 0);
      add(P.torso, rbox(1.1, 1.05, 1.1, 0.25), M.plate, 0, 0.35);
      add(P.torso, rbox(1.16, 0.16, 1.16, 0.06), M.face, 0, -0.1);    // belt
      P.core = add(P.torso, new THREE.SphereGeometry(0.2, 16, 12), M.energy, 0.55, 0.42);
      P.plates = [
        add(P.torso, rbox(0.3, 0.8, 0.95, 0.12), M.face, 0.52, 0.35),
        add(P.torso, rbox(0.7, 0.3, 0.45, 0.12), M.face, 0, 0.98, 0.42),
        add(P.torso, rbox(0.7, 0.3, 0.45, 0.12), M.face, 0, 0.98, -0.42),
      ];
      P.head = sentinelHead(P.torso, M, 0.5, 0.12, 1.12).head;
      P.armN = grp(P.torso, 0, 0.8, 0.72); P.armF = grp(P.torso, 0, 0.8, -0.72);
      for (const a of [P.armN, P.armF]) {
        add(a, cap(0.17, 0.75), M.plate, 0, -0.45);
        add(a, rbox(0.5, 0.45, 0.45, 0.14), M.face, 0.05, -1.0);
      }
      break;
    }
    case 'post': {      // Danger Room training post
      add(body, new THREE.CylinderGeometry(0.5, 0.6, 0.25, 20), M.joint, 0, 0.12);
      add(body, cap(0.2, 1.4), M.plate, 0, 1.0);
      for (const y of [0.55, 1.3]) add(body, new THREE.CylinderGeometry(0.215, 0.215, 0.12, 18), M.face, 0, y);
      P.arm = grp(body, 0, 1.45, 0.3);
      add(P.arm, rbox(1.3, 0.2, 0.2, 0.06), M.plate, 0.6, 0);
      add(P.arm, rbox(0.25, 0.22, 0.22, 0.06), M.face, 1.2, 0);
      P.eye = add(body, new THREE.SphereGeometry(0.12, 14, 10), M.energy, 0.18, 1.8);
      break;
    }
    case 'turret': {    // Danger Room turret
      add(body, new THREE.SphereGeometry(0.42, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.plate, 0, 0);
      add(body, new THREE.TorusGeometry(0.4, 0.04, 6, 24), M.face, 0, 0.05).rotation.x = Math.PI / 2;
      P.gun = grp(body, 0, 0.25, 0);
      const b = add(P.gun, new THREE.CylinderGeometry(0.07, 0.09, 0.8, 10), M.joint, 0.4, 0, 0); b.rotation.z = Math.PI / 2;
      P.eye = add(P.gun, new THREE.SphereGeometry(0.07, 10, 8), M.energy, 0.82, 0, 0);
      break;
    }
    case 'drone': {     // Sentinel drone: a flattened pod under a spinning rotor ring, a grey face with one eye
      P.core = grp(body, 0, 0.3, 0);
      add(P.core, new THREE.SphereGeometry(0.3, 18, 12), M.plate).scale.set(1.2, 0.72, 1.2);
      add(P.core, rbox(0.12, 0.2, 0.34, 0.04), M.face, 0.3, -0.02);
      P.eye = add(P.core, new THREE.SphereGeometry(0.08, 12, 10), M.energy, 0.37, -0.02);
      add(P.core, rbox(0.5, 0.04, 0.05, 0.01), M.energy, 0, -0.2);                                 // underglow
      for (const z of [0.26, -0.26]) add(P.core, rbox(0.3, 0.12, 0.05, 0.02), M.joint, -0.12, -0.06, z);   // fins
      P.rotor = grp(P.core, 0, 0.24, 0);
      const ring = add(P.rotor, new THREE.TorusGeometry(0.44, 0.035, 6, 28), M.joint); ring.rotation.x = Math.PI / 2;
      for (let i = 0; i < 3; i++) { const blade = add(P.rotor, rbox(0.82, 0.02, 0.08, 0.01), M.face); blade.rotation.y = i * Math.PI / 3; }
      break;
    }
    case 'mortar': {    // Mortar unit: a squat emplacement with a tilted tube; the rim glows when it fires
      add(body, new THREE.CylinderGeometry(0.56, 0.64, 0.3, 20), M.joint, 0, 0.15);
      P.torso = grp(body, 0, 0.55, 0);
      add(P.torso, rbox(0.82, 0.5, 0.82, 0.14), M.plate);
      add(P.torso, rbox(0.12, 0.3, 0.6, 0.04), M.face, 0.38, 0.02);
      P.eye = add(P.torso, rbox(0.05, 0.07, 0.5, 0.02), M.energy, 0.45, 0.08);
      P.tube = grp(P.torso, 0.05, 0.22, 0);
      add(P.tube, new THREE.CylinderGeometry(0.17, 0.21, 0.95, 14), M.face, 0, 0.47);
      P.muzzle = add(P.tube, new THREE.TorusGeometry(0.17, 0.045, 6, 16), M.energy, 0, 0.95); P.muzzle.rotation.x = Math.PI / 2;
      P.tube.rotation.z = -0.45;
      break;
    }
    case 'charger': {   // Ram unit: low, wide, four-legged; a grey ram plate with magenta slits and two energy horns
      P.legs = [];
      for (const [x, z] of [[0.38, 0.3], [-0.38, 0.3], [0.38, -0.3], [-0.38, -0.3]]) {
        const l = grp(body, x, 0.62, z); add(l, cap(0.09, 0.42), M.joint, 0, -0.3); P.legs.push(l);
      }
      P.torso = grp(body, 0, 0.9, 0);
      add(P.torso, rbox(1.1, 0.66, 0.82, 0.2), M.plate, -0.05, 0);
      P.ram = add(P.torso, rbox(0.3, 0.78, 0.92, 0.12), M.face, 0.56, 0.02);
      for (const y of [-0.12, 0.16]) add(P.ram, rbox(0.04, 0.05, 0.6, 0.02), M.energy, 0.16, y);
      P.horns = [];
      for (const z of [0.3, -0.3]) { const h = add(P.torso, new THREE.ConeGeometry(0.07, 0.4, 6), M.energy, 0.66, 0.46, z); h.rotation.z = -1.0; P.horns.push(h); }
      P.plates = [add(P.torso, rbox(0.72, 0.16, 0.86, 0.07), M.face, -0.12, 0.4)];   // armour plate: gone once broken
      break;
    }
    case 'warden': buildJuggernaut(R, M); break;
    case 'stormcaller': buildMagneto(R, M); break;
  }
  return R;
}

// ---- Juggernaut -------------------------------------------------------------------------------------
// A wall of a man: maroon armour over a brown suit, iron bands, the domed helmet with his face in its opening
// (his eyes burn with the Crimson Gem's power before the thunderclap), armour plates that break, and a slab
// of floor he tears up and holds overhead before he hurls it as rubble.
function buildJuggernaut(R, M) {
  const P = R.parts, body = R.body;
  const skin = std('#d9a77f', 0.8), stone = std('#8f877c', 0.92);
  addRim(stone, '#ffc2dc', 0.25);
  P.legs = [];
  for (const z of [0.5, -0.5]) {
    const hip = grp(body, 0, 1.55, z), knee = grp(hip, 0.05, -0.75, 0);
    add(hip, cap(0.26, 0.5), M.joint, 0, -0.38); add(hip, rbox(0.56, 0.58, 0.48, 0.16), M.plate, 0.06, -0.32);
    add(knee, cap(0.22, 0.5), M.joint, 0, -0.35); add(knee, rbox(0.46, 0.52, 0.42, 0.14), M.plate, 0.1, -0.36);
    add(knee, rbox(0.5, 0.08, 0.46, 0.03), M.face, 0.1, -0.12);           // iron band at the knee
    add(knee, rbox(0.86, 0.26, 0.54, 0.09), M.joint, 0.14, -0.72);        // boot
    P.legs.push({ hip, knee });
  }
  P.torso = grp(body, 0, 1.65, 0);
  add(P.torso, rbox(1.3, 0.42, 1.06, 0.14), M.face, 0, 0);                 // iron belt
  P.chest = grp(P.torso, 0, 0.3, 0);
  add(P.chest, rbox(1.45, 1.1, 1.3, 0.34), M.plate, 0, 0.55);
  add(P.chest, rbox(1.5, 0.1, 1.34, 0.04), M.face, 0, 0.18);
  P.core = add(P.chest, new THREE.SphereGeometry(0.2, 18, 14), M.energy, 0.72, 0.62);   // the Crimson Gem's glow
  // The helmet: a dome over his whole head, an iron band, rivets, his face in the front opening
  P.head = grp(P.chest, 0.36, 1.32, 0);
  add(P.head, new THREE.SphereGeometry(0.42, 26, 18), M.plate).scale.set(1, 1.04, 0.98);
  add(P.head, new THREE.SphereGeometry(0.3, 20, 14), skin, 0.2, -0.06).scale.set(0.8, 0.9, 0.9);
  const band = add(P.head, new THREE.TorusGeometry(0.425, 0.035, 8, 32), M.face, 0, -0.02); band.rotation.x = Math.PI / 2;
  for (let i = 0; i < 7; i++) { const a = -0.9 + i * 0.3; add(P.head, new THREE.SphereGeometry(0.03, 8, 6), M.face, -Math.cos(a) * 0.43, 0.06, Math.sin(a) * 0.43); }
  P.eye = grp(P.head, 0.36, 0.0, 0);
  for (const z of [0.09, -0.09]) add(P.eye, rbox(0.04, 0.035, 0.08, 0.01), M.energy, 0, 0, z);
  P.pod = grp(P.chest, 0.05, 2.25, 0);                                      // the torn-up slab, held overhead
  add(P.pod, rbox(1.4, 0.42, 1.0, 0.1), stone);
  for (const [x, z] of [[-0.45, 0.3], [0.3, -0.25], [0.55, 0.32]]) add(P.pod, new THREE.DodecahedronGeometry(0.16), stone, x, 0.24, z);
  P.pod.visible = false; P.tubes = [];
  // Armour: chest plate, two pauldrons, the helmet's crest (hidden as they break)
  P.plates = [add(P.chest, rbox(0.3, 0.84, 1.08, 0.12), M.face, 0.72, 0.5), add(P.chest, rbox(0.86, 0.38, 0.6, 0.16), M.plate, 0, 1.14, 0.64),
    add(P.chest, rbox(0.86, 0.38, 0.6, 0.16), M.plate, 0, 1.14, -0.64), add(P.head, rbox(0.62, 0.14, 0.22, 0.06), M.face, -0.05, 0.42)];
  // Near arm: the hammer fist; far arm: the long sweeping forearm
  P.armN = grp(P.chest, 0.05, 0.95, 0.98); P.armF = grp(P.chest, 0.05, 0.95, -0.98);
  add(P.armN, cap(0.22, 0.7), M.joint, 0, -0.45); add(P.armN, rbox(0.42, 0.14, 0.42, 0.05), M.face, 0, -0.55);
  P.hammer = grp(P.armN, 0.05, -1.05, 0);
  add(P.hammer, rbox(0.7, 0.62, 0.62, 0.18), M.joint); add(P.hammer, rbox(0.74, 0.16, 0.66, 0.05), M.face, 0, 0.26);
  add(P.armF, cap(0.2, 0.65), M.joint, 0, -0.42);
  P.blade = add(P.armF, rbox(0.4, 1.3, 0.4, 0.14), M.joint, 0.06, -1.25);
  add(P.blade, rbox(0.46, 0.16, 0.46, 0.05), M.face, 0, 0.42);
  add(P.blade, rbox(0.5, 0.42, 0.48, 0.14), M.joint, 0.02, -0.66);         // the fist
}

// ---- Magneto ------------------------------------------------------------------------------------------
// Flying in red and purple, cape out behind him, helmet on; his near arm aims the magnetism (the old chin
// cannon's job: shots, the floor-raking beam), the far hand glows as he gathers it, two rings of torn steel
// orbit him (the old rotors), and the force field (the old storm shield) is his magenta bubble.
function buildMagneto(R, M) {
  const P = R.parts, body = R.body;
  const red = M.plate, purple = M.joint, steel = M.face, skin = std('#e2b896', 0.8);
  P.hull = grp(body, 0, 0.75, 0);
  const fig = grp(P.hull, 0, -0.1, 0); P.fig = fig;
  add(fig, rbox(0.36, 0.22, 0.42, 0.08), purple, 0, 0.02);                  // trunks
  P.legs = [];
  for (const z of [0.12, -0.12]) {
    const hip = grp(fig, 0, 0, z), knee = grp(hip, 0, -0.46, 0);
    add(hip, cap(0.09, 0.36), red, 0, -0.23);
    add(knee, cap(0.08, 0.36), red, 0, -0.22);
    add(knee, rbox(0.17, 0.3, 0.17, 0.06), purple, 0.02, -0.32);            // boot
    add(knee, rbox(0.28, 0.1, 0.17, 0.04), purple, 0.06, -0.48);
    P.legs.push({ hip, knee });
  }
  const spine = grp(fig, 0, 0.08, 0); P.spine = spine;
  add(spine, rbox(0.32, 0.32, 0.38, 0.09), red, 0, 0.18);
  add(spine, rbox(0.38, 0.36, 0.5, 0.11), red, 0.02, 0.44);
  add(spine, rbox(0.34, 0.07, 0.4, 0.03), purple, 0, 0.04);                // belt
  for (const z of [0.27, -0.27]) add(spine, rbox(0.24, 0.15, 0.2, 0.07), red, 0, 0.58, z);
  // Helmet: the red dome, the ridge over the top, cheek guards and the pointed brow
  const head = grp(spine, 0.02, 0.8, 0); P.head = head;
  add(head, new THREE.SphereGeometry(0.135, 20, 16), skin, 0, -0.01);
  add(head, new THREE.SphereGeometry(0.155, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.6), red, -0.01, 0.0).rotation.z = 0.2;
  add(head, rbox(0.34, 0.04, 0.07, 0.015), purple, -0.02, 0.15);
  for (const z of [0.13, -0.13]) add(head, rbox(0.13, 0.15, 0.03, 0.012), red, 0.06, -0.02, z);
  const brow = add(head, new THREE.ConeGeometry(0.04, 0.13, 4), red, 0.15, 0.07, 0); brow.rotation.z = -Math.PI / 2 - 0.35; brow.scale.z = 0.5;
  // Cape: two hinged panels in the view plane, so the camera sees its whole profile streaming out behind him
  P.capeTop = grp(spine, -0.16, 0.62, 0);
  const capeMat = std('#5a2f8f', 0.7, 0.05, { side: THREE.DoubleSide }); addRim(capeMat, '#ffb3e0', 0.25);
  const panel = (top, bot, h) => new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0.06, 0), new THREE.Vector2(-top, 0), new THREE.Vector2(-bot, -h), new THREE.Vector2(0.06, -h)]));
  add(P.capeTop, panel(0.2, 0.42, 0.78), capeMat, 0, 0, -0.05);
  P.capeLow = grp(P.capeTop, 0, -0.76, 0);
  add(P.capeLow, panel(0.42, 0.7, 0.82), capeMat, 0, 0, -0.05);
  // Near arm (the aim): out along +x from the shoulder, purple glove, the magnetism gathering at the hand
  P.cannon = grp(spine, 0.02, 0.56, 0.3);
  add(P.cannon, cap(0.07, 0.5), red, 0.3, 0).rotation.z = Math.PI / 2;
  add(P.cannon, new THREE.SphereGeometry(0.09, 12, 10), purple, 0.62, 0);
  P.muzzle = add(P.cannon, new THREE.SphereGeometry(0.06, 10, 8), M.energy, 0.72, 0, 0);
  // Far arm raised, its hand glowing (the tell: it swells as he charges)
  P.armF = grp(spine, 0.0, 0.56, -0.3);
  add(P.armF, cap(0.065, 0.48), red, 0, 0.3);
  add(P.armF, new THREE.SphereGeometry(0.085, 12, 10), purple, 0, 0.6);
  P.eye = add(P.armF, new THREE.SphereGeometry(0.12, 14, 10), M.energy, 0, 0.66, 0);
  P.armF.rotation.z = 0.5;
  // Two rings of torn steel orbiting him
  P.rotors = [];
  for (const [y, r, n, tilt] of [[0.25, 1.32, 9, 0.18], [-0.3, 1.02, 7, -0.24]]) {
    const holder = grp(P.hull, 0, y, 0); holder.rotation.x = tilt;
    const ring = grp(holder);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, piece = i % 3 === 0 ? rbox(0.36, 0.06, 0.12, 0.02) : i % 3 === 1 ? new THREE.DodecahedronGeometry(0.1) : rbox(0.16, 0.16, 0.05, 0.02);
      const m = add(ring, piece, steel, Math.cos(a) * r, Math.sin(i * 1.7) * 0.06, Math.sin(a) * r); m.rotation.set(i * 0.7, a, i * 0.4);
    }
    P.rotors.push(ring);
  }
  // The force field: his magenta bubble
  const shieldMat = new THREE.MeshStandardMaterial({ color: HOSTILE, emissive: HOSTILE, emissiveIntensity: 1.6, transparent: true, opacity: 0.22, flatShading: true, depthWrite: false, side: THREE.DoubleSide });
  P.shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), shieldMat); P.shield.scale.set(1.5, 1.3, 1.3); P.shield.position.y = 0.25; P.shield.visible = false; P.hull.add(P.shield);
  P.shieldMat = shieldMat;
}

export function animateEnemy(R, e, dt, t) {
  const P = R.parts, M = R.mats;
  R.flip.scale.x = e.type === 'shield' ? e.shieldDir : e.facing;
  let lean = 0, glow = 2.2;
  const s = e.state;
  if (s === 'windup' || s === 'slamWindup' || s === 'aim') {
    lean = -0.18; glow = 3.5 + Math.sin(t * 30) * 1.2;
    if (s === 'slamWindup') { lean = -0.3; glow = 5 + Math.sin(t * 45) * 2; R.body.position.x = Math.sin(t * 70) * 0.03; }
  } else if (s === 'lock') { glow = 6; }
  else if (s === 'attack') lean = 0.35;
  else if (s === 'charge') { lean = 0.28; glow = 5; }
  else if (s === 'dazed') { lean = -0.3 + Math.sin(t * 7) * 0.1; glow = 0.5; }
  else if (s === 'stagger') { lean = -0.35 + Math.sin(t * 9) * 0.12; glow = 0.6; }
  else if (s === 'hitstun') lean = -0.2;
  else if (s === 'launched') lean = Math.sin(t * 12) * 0.5;
  else if (s === 'caught') lean = 0.3;
  if (s !== 'slamWindup') R.body.position.x = 0;
  R.lean += (lean - R.lean) * 0.35;
  R.body.rotation.z = -R.lean;
  M.energy.emissiveIntensity = glow;
  M.plate.emissiveIntensity = M.face.emissiveIntensity = e.flash > 0 ? 0.9 : 0;

  if (e.type === 'swarmer') {
    const moving = Math.abs(e.vx) > 0.5 && e.onGround;
    R.bob = moving ? Math.abs(Math.sin(t * 16)) * 0.12 : R.bob * 0.8;
    P.core.position.y = 0.42 + R.bob + (s === 'windup' ? -0.1 : 0);
  } else if (e.type === 'sniper') {
    if (s === 'aim' || s === 'lock') {
      const dx = (e.aimX - e.x) * e.facing, dy = e.aimY - (e.y + 1.35);
      P.gun.rotation.z = Math.atan2(dy, Math.max(0.1, dx));
    } else P.gun.rotation.z *= 0.9;
  } else if (e.type === 'brute') {
    P.plates.forEach((pl, i) => { pl.visible = i < e.armor; });
    const swing = s === 'windup' ? -1.2 : s === 'attack' ? 1.4 : s === 'slamWindup' ? -2.6 : s === 'slamRecover' && e.st < 8 ? 1.2 : 0;
    P.armN.rotation.z += (swing - P.armN.rotation.z) * 0.3;
    P.armF.rotation.z += ((s === 'slamWindup' ? -2.6 : s === 'slamRecover' && e.st < 8 ? 1.2 : 0.1) - P.armF.rotation.z) * 0.3;
    M.energy.emissiveIntensity = glow + (3 - e.armor) * 0.8;
  } else if (e.type === 'post') {
    const target = s === 'windup' ? -0.9 : s === 'attack' ? 1.1 : 0;
    P.arm.rotation.z += (target - P.arm.rotation.z) * 0.3;
  } else if (e.type === 'drone') {
    P.rotor.rotation.y += dt * (s === 'windup' ? 40 : 22);
    P.core.rotation.z = -Math.max(-0.4, Math.min(0.4, e.vx * 0.06 * e.facing));
  } else if (e.type === 'mortar') {
    const raise = s === 'windup' ? Math.min(1, e.st / 20) : 0, kick = s === 'recover' && e.st < 10 ? 1 - e.st / 10 : 0;
    P.tube.rotation.z = -0.45 + raise * 0.25 - kick * 0.2;
    P.tube.scale.y = 1 - kick * 0.18;
  } else if (e.type === 'charger') {
    P.plates.forEach(pl => { pl.visible = e.armor > 0; });
    const run = s === 'charge' ? 26 : Math.abs(e.vx) > 0.5 ? 12 : 0, paw = s === 'windup' ? Math.sin(t * 22) * 0.35 : 0;
    P.legs.forEach((l, i) => { l.rotation.z = run ? Math.sin(t * run + i * Math.PI / 2) * 0.55 : i === 0 ? paw : 0; });
  } else if (e.type === 'turret') {
    const tg = e.target;
    if (tg) { const a = Math.atan2(tg.y + 1 - (e.y + 0.25), (tg.x - e.x) * e.facing); P.gun.rotation.z += (a - P.gun.rotation.z) * 0.2; }
  }

  if (e.type === 'warden') animateWarden(R, e, dt, t);
  else if (e.type === 'stormcaller') animateMagneto(R, e, dt, t);

  if (e.dead && e.boss) {
    // A boss shudders and sags through its explosions, then goes in the last blast
    const k = Math.min(1, e.deathT / 68), gone = Math.max(0, (e.deathT - 68) / 8);
    R.body.position.x = Math.sin(t * 60) * 0.06 * (1 - gone); R.body.rotation.z = -0.35 * k + Math.sin(t * 23) * 0.04;
    R.root.scale.setScalar(Math.max(0.01, 1 - Math.min(1, gone)));
    M.energy.emissiveIntensity = 4 + Math.sin(t * 40) * 3; M.plate.emissiveIntensity = Math.max(0, Math.sin(t * 25)) * 0.8;
  } else if (e.dead) {
    const k = Math.min(1, e.deathT / 40);
    R.root.scale.setScalar(Math.max(0.01, 1 - k * 0.9));
    R.body.rotation.z = -0.8 * k;
  }
}

const ease = (v, target, k) => v + (target - v) * k;

// Juggernaut: heavy, bobbing strides; each attack has its own windup and strike pose. The rubble volley lifts
// the slab overhead; the thunderclap pulls both arms back, then claps them together in front of him.
function animateWarden(R, e, dt, t) {
  const P = R.parts, M = R.mats, s = e.state, A = e.atk, k = Math.min(1, dt * 14), kind = A && A.kind;
  P.plates.forEach((pl, i) => { pl.visible = i < e.armor; });
  const walking = (s === 'idle' || s === 'approach') && Math.abs(e.vx) > 0.4;
  R.phase = (R.phase || 0) + (walking ? dt * Math.abs(e.vx) * 1.6 : 0);
  const sw = walking ? Math.sin(R.phase) : 0;
  let hipN = sw * 0.45, hipF = -sw * 0.45, knN = -Math.max(0, -Math.cos(R.phase)) * 0.6 * (walking ? 1 : 0), knF = -Math.max(0, Math.cos(R.phase)) * 0.6 * (walking ? 1 : 0);
  let armN = 0.15, armF = -0.1, twist = 0, crouch = walking ? Math.abs(Math.cos(R.phase)) * 0.08 : 0, lean = 0, head = 0, pod = 0;
  const w = s === 'windup', u = w && A ? Math.min(1, e.st / Math.max(1, A.wind)) : 0;
  if (s === 'intro' && !e.onGround) { hipN = 0.3; hipF = -0.2; knN = -0.3; knF = -0.4; armN = -0.6; armF = -0.6; }
  else if (s === 'intro' && e.st < 140) { crouch = Math.max(0, 0.5 - e.st * 0.01); armN = 0.9; armF = 0.9; }
  else if (s === 'roar') { armN = -1.9; armF = -1.9; head = -0.4; lean = -0.2; twist = Math.sin(t * 30) * 0.03; }
  else if (s === 'dazed' || s === 'stagger') { lean = 0.35 + Math.sin(t * 6) * 0.08; head = 0.5; armN = 0.4; armF = 0.3; crouch = 0.25; }
  else if (kind === 'sweep') { if (w) { armF = -1.5 * u; twist = 0.5 * u; } else if (s === 'attack') { armF = 1.5; twist = -0.55; } else { armF = 0.9; twist = -0.3; } }
  else if (kind === 'hammer') { if (w) { armN = -2.7 * u; lean = -0.15 * u; } else if (s === 'attack') { armN = 1.35; lean = 0.35; crouch = 0.2; } else { armN = 1.1; lean = 0.25; crouch = 0.15; } }
  else if (kind === 'stomp') {
    if (w) { crouch = 0.45 * u; armN = armF = -0.8 * u; }
    else if (s === 'jump') { hipN = hipF = 0.9; knN = knF = -1.4; armN = armF = -1.2; }
    else { crouch = Math.max(0, 0.35 - e.st * 0.02); armN = armF = 0.6; }
  } else if (kind === 'missiles') {
    // Tears up a slab of floor and lifts it overhead; the throw snaps both arms forward
    pod = w ? Math.min(1, u * 1.6) : 0;
    if (w) { armN = armF = -2.95 * Math.min(1, u * 1.4); crouch = u < 0.3 ? 0.3 * (1 - u / 0.3) : 0; lean = -0.1 * u; }
    else { armN = armF = Math.max(0, 1.2 - e.st * 0.06); lean = 0.2 * Math.max(0, 1 - e.st / 14); }
  } else if (kind === 'charge' || s === 'charge') { lean = 0.5; armN = 0.9; armF = -0.9; crouch = 0.15; if (s === 'charge') { hipN = Math.sin(t * 20) * 0.7; hipF = -hipN; } }
  else if (kind === 'laser') {
    // Thunderclap: arms flung back and wide, then clapped together in front of him at the height of the wave
    head = A && A.high ? -0.15 : 0.25;
    if (w) { armN = armF = -1.35 * u; lean = -0.12 * u; }
    else { const c = A && A.high ? 1.75 : 1.2; armN = armF = c; lean = 0.15; crouch = A && A.high ? 0 : 0.2; }
  }
  const L = P.legs;
  L[0].hip.rotation.z = ease(L[0].hip.rotation.z, hipN, k); L[1].hip.rotation.z = ease(L[1].hip.rotation.z, hipF, k);
  L[0].knee.rotation.z = ease(L[0].knee.rotation.z, knN, k); L[1].knee.rotation.z = ease(L[1].knee.rotation.z, knF, k);
  P.armN.rotation.z = ease(P.armN.rotation.z, armN, s === 'attack' || s === 'laser' ? Math.min(1, dt * 30) : k);
  P.armF.rotation.z = ease(P.armF.rotation.z, armF, s === 'attack' || s === 'laser' ? Math.min(1, dt * 30) : k);
  P.chest.rotation.y = ease(P.chest.rotation.y, twist, k); P.head.rotation.z = ease(P.head.rotation.z, -head, k);
  P.torso.position.y = 1.65 - crouch; for (const l of L) l.hip.position.y = 1.55 - crouch;
  R.body.rotation.z = ease(R.body.rotation.z, -lean, k);
  P.pod.visible = pod > 0.02; P.pod.scale.setScalar(Math.max(0.02, pod));
  // His power: the gem's glow brightens as he weakens; windups and the thunderclap blaze; his eyes burn
  const hurt = 1 - e.hp / e.maxHp, charging = w || s === 'laser' || s === 'charge' || s === 'roar';
  M.energy.emissiveIntensity = 2.2 + hurt * 2 + (charging ? 2.5 + Math.sin(t * 34) * 1.2 : 0) + (s === 'dazed' || s === 'stagger' ? -1.6 : 0);
  const burn = kind === 'laser' && (w || s === 'laser') ? 1.8 : 1;
  P.eye.scale.set(1, burn, burn);
  P.core.scale.setScalar(1 + hurt * 0.4 + (charging ? Math.sin(t * 30) * 0.08 : 0));
}

// Magneto: hovers upright with his cape streaming, leans into his flight, aims with his near arm, raises both
// to rain scrap, dives head-first fists out, and drops to one knee when he crashes onto the pad.
function animateMagneto(R, e, dt, t) {
  const P = R.parts, M = R.mats, s = e.state, A = e.atk, k = Math.min(1, dt * 8);
  const down = s === 'crashed';
  const fwd = Math.max(-1, Math.min(1, (e.vx || 0) * (e.facing || 1) / 7));
  let pitch = -0.32 * fwd, bank = 0, armF = 0.5, hipN = 0.15, hipF = -0.05, kneeN = -0.25, kneeF = -0.15, head = 0, low = 0;
  if (s === 'dive' && A) {
    // Head-first along the dive, both arms driven out ahead of him
    const ax = (A.dx || 0) * (e.facing || 1), ay = A.dy || -1;
    pitch = Math.atan2(-ax, ay); armF = Math.PI - 0.2; hipN = hipF = 0; kneeN = kneeF = -0.05;
  } else if (down) { pitch = -0.35; low = 0.45; hipN = 1.5; kneeN = -1.6; hipF = -0.4; kneeF = -1.4; armF = 1.2; head = 0.35; }
  else if (s === 'roar') { armF = 2.6; head = -0.25; bank = Math.sin(t * 24) * 0.05; }
  else if (s === 'windup' && A && A.kind === 'rain') { armF = Math.PI - 0.15; head = -0.3; }
  else if (s === 'windup' && A && A.kind === 'dive') { pitch = 0.25; armF = 1.6; hipN = 0.6; kneeN = -1.2; }
  else if (s === 'volley' || (s === 'windup' && A && A.kind === 'volley')) armF = -0.2;
  P.hull.rotation.z = ease(P.hull.rotation.z, pitch, s === 'dive' ? Math.min(1, dt * 20) : k);
  P.hull.rotation.x = ease(P.hull.rotation.x, bank, k);
  P.hull.position.y = 0.75 - low + (down ? 0 : Math.sin(t * 2.4) * 0.05);
  P.armF.rotation.z = ease(P.armF.rotation.z, armF, k);
  P.head.rotation.z = ease(P.head.rotation.z, -head, k);
  const L = P.legs;
  L[0].hip.rotation.z = ease(L[0].hip.rotation.z, hipN, k); L[1].hip.rotation.z = ease(L[1].hip.rotation.z, hipF, k);
  L[0].knee.rotation.z = ease(L[0].knee.rotation.z, kneeN, k); L[1].knee.rotation.z = ease(L[1].knee.rotation.z, kneeF, k);
  // The cape streams back with his speed and ripples
  P.capeTop.rotation.z = ease(P.capeTop.rotation.z, -(0.12 + 0.55 * Math.abs(fwd) + (s === 'dive' ? 0.7 : 0)) + Math.sin(t * 3.1) * 0.06, k);
  P.capeLow.rotation.z = -0.25 * Math.abs(fwd) - 0.08 + Math.sin(t * 3.1 - 0.9) * 0.14;
  // The steel orbits slowly, faster in a dive, barely moving while he is down
  for (const r of P.rotors) r.rotation.y += dt * (down ? 0.3 : s === 'dive' ? 4 : 1.3);
  // The near arm follows the target (or rakes the floor for the beam; up for the scrap rain)
  const tg = e.target; let aim = 0;
  if (s === 'laser' || (s === 'windup' && A && A.kind === 'sweep')) aim = -0.55;
  else if (s === 'windup' && A && A.kind === 'rain') aim = 1.45;
  else if (s === 'dive') aim = Math.PI / 2 - 0.15;
  else if (down) aim = -1.2;
  else if (tg) aim = Math.max(-1.2, Math.min(0.9, Math.atan2(tg.y + 1 - (e.y + 1.3), Math.max(0.5, (tg.x - e.x) * e.facing))));
  P.cannon.rotation.z = ease(P.cannon.rotation.z, aim, k);
  P.shield.visible = e.armor > 0; if (P.shield.visible) { P.shield.rotation.y += dt * 0.6; P.shieldMat.opacity = 0.18 + 0.08 * Math.sin(t * 6) + (e.flash > 0 ? 0.25 : 0); }
  const hurt = 1 - e.hp / e.maxHp, charging = s === 'windup' || s === 'laser' || s === 'dive' || s === 'roar' || s === 'volley';
  M.energy.emissiveIntensity = 2.2 + hurt * 2 + (charging ? 2.4 + Math.sin(t * 30) * 1.1 : 0) - (down ? 1.4 : 0);
  P.eye.scale.setScalar(1 + (charging ? 0.35 : 0));
}
