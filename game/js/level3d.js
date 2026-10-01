// The mission's set, in the comic look: "Extraction at the Sentinel Works", built round the simulation's
// collision boxes (sim/level.js). Four rooms, each with its own palette:
//   the rooftop at dusk (skyline, water tower, Sentinels crossing the sky)
//   the cell block (dark steel, red alarm lights, empty cells, the kid's cell with its barred door)
//   the assembly hall (half-built Sentinels hanging on chains, conveyors, amber work lights)
//   the hangar (open to the night, the X-Jet waiting on its ramp)
// Static geometry is merged into one mesh per material to keep draw calls low.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BOXES, JET, CELL } from './sim/level.js';
import { toon, glow, addRim } from './toon.js';
import { HOSTILE } from './looks.js';

// Where each room starts, and its light: hemisphere sky/ground, key light colour, fog, background
export const ROOMS = [
  { id: 'roof', x0: -14, x1: 40.5, sky: '#c9a2e8', ground: '#4b2f4f', key: '#ffc58a', keyK: 2.5, fog: '#a07ab0', bg: '#6b4c8f' },
  { id: 'cells', x0: 40.5, x1: 96.5, sky: '#9fb6d6', ground: '#2a2f3d', key: '#d9e6ff', keyK: 2.1, fog: '#1b2130', bg: '#141a26' },
  { id: 'hall', x0: 96.5, x1: 176.5, sky: '#e8c79f', ground: '#3a2b2a', key: '#ffd29a', keyK: 2.3, fog: '#2a1f22', bg: '#22191c' },
  { id: 'hangar', x0: 176.5, x1: 270, sky: '#8fa6e8', ground: '#23283a', key: '#b9c9ff', keyK: 2.2, fog: '#141a33', bg: '#0e1430' },
];
export const roomAt = x => ROOMS.find(r => x < r.x1) || ROOMS[ROOMS.length - 1];

function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
// Seeded randomness for set dressing, so the set looks the same every time
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function textures() {
  const r = rng(7);
  const windows = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let y = 8; y < h - 8; y += 14) for (let x = 8; x < w - 8; x += 12) if (r() < 0.38) { g.fillStyle = r() < 0.15 ? '#9fd4ff' : '#ffd27a'; g.fillRect(x, y, 6, 8); }
  });
  const hazard = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#f2c12e'; g.fillRect(0, 0, w, h); g.fillStyle = '#16171b';
    for (let i = -64; i < 96; i += 32) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + 16, h); g.lineTo(i + 80, 0); g.lineTo(i + 64, 0); g.closePath(); g.fill(); }
  });
  const panel = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c3c8d0'; g.fillRect(0, 0, w, 4); g.fillRect(0, 0, 4, h);
    g.fillStyle = '#dadde3'; for (const [x, y] of [[14, 14], [114, 14], [14, 114], [114, 114]]) { g.beginPath(); g.arc(x, y, 4, 0, 7); g.fill(); }
  });
  const stencil = (text, col = '#f2c12e') => canvasTex(512, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.fillStyle = col; g.font = 'bold 76px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  }, false);
  const scan = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.85)'; for (let y = 0; y < h; y += 8) g.fillRect(0, y, w, 3);
  });
  const belt = canvasTex(64, 16, (g, w, h) => { g.fillStyle = '#1b1c22'; g.fillRect(0, 0, w, h); g.fillStyle = '#3a3c46'; for (let x = 0; x < w; x += 16) g.fillRect(x, 0, 6, h); });
  return { windows, hazard, panel, stencil, scan, belt };
}

export function buildSet(scene, fxTex) {
  const T = textures(), baked = new Map(), dyn = { gates: [], belts: [], lamps: [], door: null, bars: null, pods: [], sky: null };
  const bake = (mesh, cast = true) => {
    if (!mesh.parent) mesh.updateMatrixWorld(true);
    let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(mesh.matrixWorld);
    const key = mesh.material.uuid + (cast ? ':c' : ':n');
    if (!baked.has(key)) baked.set(key, { mat: mesh.material, cast, geos: [] });
    baked.get(key).geos.push(g);
  };
  const box = (w, h, d, mat, x, y, z, cast = true, rot = null) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); if (rot) m.rotation.set(...rot); bake(m, cast); return m; };
  const cyl = (r0, r1, h, mat, x, y, z, seg = 14, cast = true, rot = null) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, h, seg), mat); m.position.set(x, y, z); if (rot) m.rotation.set(...rot); bake(m, cast); return m; };
  const sprite = (color, size, x, y, z, op = 0.8) => {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: fxTex.glow, color, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    s.scale.set(size, size, 1); s.position.set(x, y, z); scene.add(s); return s;
  };

  const M = {
    roofTop: toon('#b8b2c4', { map: T.panel }), roofSide: toon('#4a4358'), concrete: toon('#8d8a96'),
    steel: toon('#3b4250'), steelDark: toon('#232833'), steelLight: toon('#7d8698'), floorIn: toon('#5a6272', { map: T.panel }),
    hallFloor: toon('#6e5f58', { map: T.panel }), hallSide: toon('#3c302e'), amber: glow('#ffb547', 1.3), red: glow('#ff3b30', 1.6),
    hazard: toon('#ffffff', { map: T.hazard }), cyan: glow('#59d9ff', 1.2), hangarFloor: toon('#4b5368', { map: T.panel }), stripe: glow('#f2c12e', 0.6),
    purple: toon('#6d3aa8'), grey: toon('#b2bac8'), eye: glow(HOSTILE, 2), wood: toon('#8a5a32'), water: toon('#5d6f8f'),
  };
  for (const k of ['steel', 'steelDark', 'steelLight', 'purple', 'grey']) addRim(M[k], '#ffffff', 0.12);

  // ---- The sky: a flat comic gradient, a big moon, a skyline in three flat layers ----
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color('#1d1648') }, mid: { value: new THREE.Color('#7a3f8f') }, bot: { value: new THREE.Color('#ff9a5c') } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top, mid, bot; varying vec3 vP;
      void main(){ float h = vP.y; float b = floor(clamp((h + 0.05) / 0.5, 0.0, 1.0) * 6.0) / 6.0;   // stepped bands, like a printed gradient
        vec3 c = b < 0.5 ? mix(bot, mid, b * 2.0) : mix(mid, top, (b - 0.5) * 2.0); gl_FragColor = vec4(c, 1.0); }`,
  });
  dyn.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), skyMat); scene.add(dyn.sky);
  const moon = new THREE.Mesh(new THREE.CircleGeometry(16, 40), new THREE.MeshBasicMaterial({ color: '#fff4cf', fog: false }));
  moon.position.set(-40, 70, -330); scene.add(moon);
  sprite('#ffd9a0', 90, -40, 70, -329, 0.35);
  const r = rng(21);
  const layers = [[-90, '#3b2a5c', 18, 42], [-150, '#2c2048', 38, 72], [-230, '#21183a', 55, 100]];
  for (const [z, col, hMin, hMax] of layers) {
    const mat = new THREE.MeshBasicMaterial({ color: col, fog: false });
    const winMat = new THREE.MeshBasicMaterial({ color: '#ffffff', map: T.windows, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    for (let x = -120; x < 380; x += 9 + r() * 12) {
      const h = hMin + r() * (hMax - hMin), w = 7 + r() * 9;
      const b = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat); b.position.set(x, h / 2 - 30, z); bake(b, false);
      if (z > -200) { const g = new THREE.PlaneGeometry(w * 0.8, h * 0.8); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 10, uv.getY(i) * h / 22); const wm = new THREE.Mesh(g, winMat); wm.position.set(x, h / 2 - 30, z + 0.2); bake(wm, false); }
    }
  }
  // Sentinel patrols crossing the sky
  for (const [y, z, speed, x] of [[30, -140, 7, -60], [42, -200, -5, 120], [24, -110, 9, 200]]) {
    const g = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.2, 3.2, 4, 10), M.purple); hull.rotation.z = Math.PI / 2; g.add(hull);
    const face = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.3, 1.5), M.grey); face.position.x = 2.6; g.add(face);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), M.eye); eye.position.set(2.95, 0.2, 0); g.add(eye);
    if (speed < 0) g.scale.x = -1;
    g.position.set(x, y, z); scene.add(g); dyn.pods.push({ pod: g, speed });
  }

  // ---- The collision boxes ----
  const room = x => roomAt(x).id;
  for (const b of BOXES) {
    const w = b.x1 - b.x0, h = b.y1 - b.y0, xm = (b.x0 + b.x1) / 2, rid = room(xm);
    if (b.type === 'g') {
      if (b.tag === 'cell') continue;   // the cell door is its own object (it can be broken)
      // A Sentinel energy door: magenta field between two grey pylons
      const fieldMat = new THREE.MeshBasicMaterial({ color: HOSTILE, map: T.scan.clone(), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      fieldMat.map.repeat.set(1, h / 1.2);
      const field = new THREE.Mesh(new THREE.PlaneGeometry(4.4, h), fieldMat); field.position.set(xm, b.y0 + h / 2, 0); field.rotation.y = Math.PI / 2; scene.add(field);
      for (const z of [2.4, -2.4]) box(0.7, h + 0.6, 0.6, M.grey, xm, b.y0 + h / 2 + 0.3, z);
      box(0.8, 0.4, 5.6, M.steelDark, xm, b.y1 + 0.5, 0);
      const lamp = sprite(HOSTILE, 2.2, xm, b.y1 + 0.9, 2.6, 0.9);
      dyn.gates.push({ tag: b.tag, field, lamp, k: 1 });
      continue;
    }
    if (b.tag === 'bound') { box(w, h, 9, M.steelDark, xm, b.y0 + h / 2, 0); continue; }
    const depth = b.type === 'o' ? 2.4 : 8;
    if (b.type === 'o') {
      // A catwalk or walkway: grating on posts, hazard-striped edge
      box(w, 0.18, depth, M.steel, xm, b.y1 - 0.09, 0);
      box(w, 0.08, 0.1, M.amber, xm, b.y1 - 0.2, depth / 2 + 0.02, false);
      for (let x = b.x0 + 0.5; x < b.x1; x += 2.5) for (const z of [depth / 2 - 0.2, -depth / 2 + 0.2]) cyl(0.07, 0.07, b.y1, M.steelDark, x, b.y1 / 2 - 0.05, z, 6);
      // Railings at the back
      box(w, 0.06, 0.06, M.steelLight, xm, b.y1 + 0.9, -depth / 2 + 0.1);
      continue;
    }
    // Solid: floors, steps, low obstacles
    const top = rid === 'roof' ? M.roofTop : rid === 'hall' ? M.hallFloor : rid === 'hangar' ? M.hangarFloor : M.floorIn;
    const side = rid === 'roof' ? M.roofSide : rid === 'hall' ? M.hallSide : M.steel;
    if (['vent', 'barrier', 'crate-stack', 'cellwall', 'cellroof'].includes(b.tag)) continue;   // dressed below
    const capH = 0.25;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h - capH, depth), side); body.position.set(xm, b.y0 + (h - capH) / 2, 0); bake(body, false);
    const capGeo = new THREE.BoxGeometry(w, capH, depth + 0.05), uv = capGeo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, w / 2.5), uv.getY(i) * Math.max(1, depth / 2.5));
    const capM = new THREE.Mesh(capGeo, top); capM.position.set(xm, b.y1 - capH / 2, 0); bake(capM, false);
    // A hazard edge along the front of every floor
    const edge = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, 0.06), M.hazard); edge.position.set(xm, b.y1 - 0.12, depth / 2 + 0.03);
    const eu = edge.geometry.attributes.uv; for (let i = 0; i < eu.count; i++) eu.setXY(i, eu.getX(i) * w / 0.6, eu.getY(i)); bake(edge, false);
  }

  // ---- The rooftop ----
  // The vent (a solid box in the simulation): a ribbed rooftop air unit
  box(2.5, 1.2, 2.2, M.concrete, 14.25, 0.6, 0); for (let x = 13.3; x < 15.4; x += 0.35) box(0.08, 0.9, 2.25, M.steelDark, x, 0.6, 0, false);
  cyl(0.5, 0.5, 0.2, M.steelDark, 14.25, 1.3, 0, 16);
  // The water tower, the stairwell hut, a satellite dish, antennas, a parapet with lights
  const tower = new THREE.Group(); tower.position.set(4, 0, -7);
  for (const [x, z] of [[-1.4, -1.4], [1.4, -1.4], [-1.4, 1.4], [1.4, 1.4]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 6), M.steelDark); l.position.set(x, 3, z); tower.add(l); }
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 4, 18), M.wood); tank.position.y = 8; tower.add(tank);
  const roofC = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.6, 18), M.steelDark); roofC.position.y = 10.8; tower.add(roofC);
  for (const y of [6.6, 9.2]) { const band = new THREE.Mesh(new THREE.TorusGeometry(2.42, 0.06, 6, 24), M.steelDark); band.rotation.x = Math.PI / 2; band.position.y = y; tower.add(band); }
  tower.updateMatrixWorld(true); tower.traverse(o => { if (o.isMesh) bake(o, true); });
  box(6, 4, 4, M.concrete, 31, 2, -6.5); box(2, 3, 0.2, M.steelDark, 31, 1.5, -4.4); box(6.4, 0.4, 4.4, M.roofSide, 31, 4.2, -6.5);
  box(0.3, 4, 0.3, M.steelLight, -6, 2, -5); cyl(1.4, 0.2, 0.6, M.steelLight, -6, 4.3, -5, 20, true, [0.6, 0, 0.4]);
  for (const x of [20, 36]) { cyl(0.05, 0.05, 6, M.steelDark, x, 3, -5, 6); sprite('#ff5a3d', 1.4, x, 6.1, -5); }
  box(52, 0.8, 0.3, M.roofSide, 14, 0.4, -3.9);

  // ---- The cell block ----
  const backIn = toon('#2b3442'), ribs = toon('#1b2130');
  box(56, 11, 0.4, backIn, 68.5, 4.5, -4.2, false);
  for (let x = 42; x < 96; x += 4) box(0.4, 11, 0.5, ribs, x, 4.5, -4.0, false);
  box(56, 0.8, 9, M.steelDark, 68.5, 10.2, 0, false);   // the ceiling
  for (let x = 44; x < 96; x += 6) box(0.5, 0.6, 9, ribs, x, 9.6, 0, false);
  // Empty cells along the back: bars and frames
  for (let x = 58; x < 84; x += 6) {
    box(5, 0.3, 0.4, M.steelLight, x, 3.3, -3.6); box(5, 0.3, 0.4, M.steelLight, x, 0.15, -3.6);
    for (let bx = x - 2.2; bx <= x + 2.2; bx += 0.45) cyl(0.04, 0.04, 3.2, M.steelLight, bx, 1.7, -3.6, 6, false);
  }
  // Red alarm lamps
  for (let x = 46; x < 96; x += 12) { box(0.5, 0.3, 0.3, M.red, x, 8.2, -3.9, false); dyn.lamps.push(sprite('#ff3b30', 3, x, 8.2, -3.6, 0.7)); }
  const det = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: T.stencil('DETENTION'), transparent: true, depthWrite: false }));
  det.position.set(66, 6.6, -3.95); scene.add(det);
  // Perches: grey Sentinel docking rails under the walkways (the walkways themselves come from the boxes)
  // The low security barrier
  box(2, 1, 1.4, M.hazard, 80, 0.5, 0);
  // The kid's cell: back wall, roof and the barred door (the door is dynamic: it breaks)
  box(0.6, 3.4, 3, M.steel, 93.3, 1.7, 0); box(6.4, 0.3, 3, M.steel, 90.4, 3.55, 0);
  box(6.2, 3.3, 0.2, toon('#39404f'), 90.2, 1.7, -1.5, false);
  const doorG = new THREE.Group(); doorG.position.set(86.85, 0, 0);
  const frameMat = toon('#7d8698'); addRim(frameMat, '#ffffff', 0.2);
  for (const y of [0.1, 3.3]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 3), frameMat); f.position.y = y; doorG.add(f); }
  for (let z = -1.3; z <= 1.31; z += 0.37) { const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 3.2, 8), frameMat); bar.position.set(0, 1.7, z); bar.castShadow = true; doorG.add(bar); }
  const lock = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.4), glow(HOSTILE, 1.6)); lock.position.set(0.1, 1.6, 0.6); doorG.add(lock);
  scene.add(doorG); dyn.door = { group: doorG, lock };
  sprite('#ffd27a', 2.4, 90.2, 3.1, 0.5, 0.35);   // a dim lamp inside the cell

  // ---- The assembly hall ----
  const backHall = toon('#3a2f4a');
  box(80, 14, 0.4, backHall, 136.5, 6, -6.2, false);
  for (let x = 98; x < 176; x += 8) box(0.6, 14, 0.6, M.steelDark, x, 6, -6.0, false);
  box(80, 1, 13, M.steelDark, 136.5, 12.5, -0.5, false);
  for (let x = 100; x < 176; x += 10) box(0.6, 1.2, 13, M.steel, x, 11.6, -0.5, false);
  // Half-built Sentinels hanging on chains along the line
  for (let x = 104; x < 174; x += 9) {
    cyl(0.06, 0.06, 4, M.steelDark, x, 10, -4.6, 6, false);
    const t = new THREE.Group(); t.position.set(x, 6.4, -4.6); t.rotation.y = 0.5 + (x % 3) * 0.2;
    const tor = new THREE.Mesh(new RoundedBoxGeometry(2.2, 2.0, 2.4, 3, 0.4), M.purple); t.add(tor);
    const hd = new THREE.Mesh(new RoundedBoxGeometry(1.1, 1.2, 1.1, 3, 0.25), M.purple); hd.position.y = 1.7; t.add(hd);
    const fp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.9, 0.9), M.grey); fp.position.set(0.55, 1.6, 0); t.add(fp);
    t.updateMatrixWorld(true); t.traverse(o => { if (o.isMesh) bake(o, false); });
  }
  // Conveyors along the back, rollers moving
  const beltMat = new THREE.MeshBasicMaterial({ map: T.belt.clone() }); beltMat.map.repeat.set(80 / 1.2, 1);
  const belt = new THREE.Mesh(new THREE.PlaneGeometry(80, 1.4), beltMat); belt.rotation.x = -Math.PI / 2; belt.position.set(136.5, 1.21, -3.2); scene.add(belt);
  dyn.belts.push(beltMat.map);
  box(80, 1.2, 1.6, M.steel, 136.5, 0.6, -3.2, false); box(80, 0.12, 0.12, M.amber, 136.5, 1.25, -2.4, false);
  for (let x = 100; x < 176; x += 7) { box(0.3, 3, 0.3, M.steelDark, x, 4.5, -2.8, false); dyn.lamps.push(sprite('#ffb547', 2.6, x, 6.2, -2.6, 0.55)); box(0.6, 0.25, 0.6, M.amber, x, 6.1, -2.8, false); }
  const asm = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.6), new THREE.MeshBasicMaterial({ map: T.stencil('ASSEMBLY 2'), transparent: true, depthWrite: false }));
  asm.position.set(124, 9.4, -5.95); scene.add(asm);
  // The crate stack
  for (const [x, y] of [[143.6, 0.27], [144.9, 0.27], [144.25, 0.82]]) box(0.65, 0.55, 1.2, M.wood, x, y, 0);

  // ---- The freight stairs and the hangar ----
  box(88, 22, 0.4, toon('#262d42'), 220, 9, -9, false);
  box(46, 14, 0.2, new THREE.MeshBasicMaterial({ color: '#0b1027' }), 228, 10.6, -8.85, false);   // the open hangar door, night behind
  for (let i = 0; i < 18; i++) sprite(i % 3 ? '#9fd4ff' : '#ffd27a', 0.9, 206 + i * 2.6, 3.8 + (i % 2) * 0.2, -8.7, 0.8);   // runway lights out there
  box(46, 1.2, 0.6, M.hazard, 228, 17.9, -8.7, false);
  for (const x of [204, 252]) box(1.2, 16, 1.2, M.steel, x, 10, -8.4);
  for (let x = 196; x < 262; x += 8) box(4, 0.06, 0.4, M.stripe, x, 3.62, 1.5, false);
  // The X-Jet: a long black jet on the hangar floor, nose toward the open door, yellow trim, cockpit glass
  const jet = new THREE.Group(); jet.position.set((JET.x0 + JET.x1) / 2 + 1, JET.y + 1.4, -3.4);
  const jetMat = toon('#20232c'), trimMat = toon('#f2c12e'), glass = glow('#7fd3ff', 0.5, { transparent: true, opacity: 0.85 });
  addRim(jetMat, '#9fb4ff', 0.25);
  const fus = new THREE.Mesh(new THREE.CapsuleGeometry(1.25, 11, 6, 16), jetMat); fus.rotation.z = Math.PI / 2; jet.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.25, 3.4, 16), jetMat); nose.rotation.z = -Math.PI / 2; nose.position.x = 7.4; jet.add(nose);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.0, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), glass); cockpit.scale.set(2.2, 0.8, 0.9); cockpit.position.set(4.6, 0.9, 0); jet.add(cockpit);
  for (const z of [1, -1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(5, 0.25, 6), jetMat); wing.position.set(-1, -0.3, z * 3.6); wing.rotation.y = z * 0.35; jet.add(wing);
    const tr = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.27, 0.35), trimMat); tr.position.set(-1, -0.3, z * 5.8); tr.rotation.y = z * 0.35; jet.add(tr);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 0.2), jetMat); fin.position.set(-5.4, 1.6, z * 0.9); fin.rotation.x = z * 0.35; jet.add(fin);
  }
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(10, 0.25, 2.55), trimMat); stripe.position.set(0, 0.2, 0); jet.add(stripe);
  for (const x of [-4, 3]) { const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 8), M.steelDark); gear.position.set(x, -1.2, 0); jet.add(gear); }
  jet.updateMatrixWorld(true); jet.traverse(o => { if (o.isMesh) bake(o, true); });
  // The ramp down from the jet's side hatch to the floor
  box(3.2, 0.2, 2.4, M.steelLight, JET.ramp + 1.6, JET.y + 0.4, -1.2, true, [0, 0, -0.18]);
  dyn.lamps.push(sprite('#7fd3ff', 3, JET.ramp + 2, JET.y + 2.6, -1.8, 0.6));
  // Gantry supports
  for (const x of [206, 212, 224, 230]) cyl(0.12, 0.12, 3.4, M.steelDark, x, 5.3, -1, 6);

  for (const { mat, cast, geos } of baked.values()) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat); m.castShadow = cast; m.receiveShadow = true; scene.add(m);
  }
  return dyn;
}

// Per-frame set animation: gates fade open, lamps pulse, belts run, patrols cross the sky
export function updateSet(dyn, S, dt, t) {
  for (const g of dyn.gates) {
    const want = S.gates[g.tag] ? 1 : 0;
    g.k += (want - g.k) * (1 - Math.exp(-dt * 6));
    g.field.visible = g.k > 0.02; g.field.material.opacity = 0.5 * g.k + 0.05 * Math.sin(t * 9) * g.k;
    g.field.material.map.offset.y = (t * 0.6) % 1;
    g.lamp.material.color.set(want ? HOSTILE : '#3dff8a');
  }
  if (dyn.door) {
    const D = S.mission && S.mission.door, open = !S.gates.cell;
    dyn.door.group.visible = !open;
    // A hit shakes the door; the lock flickers as it weakens
    const hpK = D ? Math.max(0, D.hp / CELL.door.hp) : 0;
    dyn.door.shake = Math.max(0, (dyn.door.shake || 0) - dt * 3);
    dyn.door.group.position.x = 86.85 + (Math.random() - 0.5) * 0.08 * dyn.door.shake;
    dyn.door.lock.material.emissiveIntensity = hpK > 0.35 ? 1.6 : (Math.sin(t * 30) > 0 ? 2 : 0.2);
  }
  for (const L of dyn.lamps) L.material.opacity = L.userData.base === undefined ? (L.userData.base = L.material.opacity) : L.userData.base * (0.8 + 0.2 * Math.sin(t * 3 + L.position.x));
  for (const b of dyn.belts) b.offset.x = (b.offset.x - dt * 0.8) % 1;
  for (const pd of dyn.pods) { pd.pod.position.x += pd.speed * dt; if (pd.pod.position.x > 380) pd.pod.position.x = -150; if (pd.pod.position.x < -150) pd.pod.position.x = 380; }
}
