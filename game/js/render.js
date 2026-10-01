// Three.js view: scene, level geometry on the (curving) gameplay path, camera, post-processing.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { BOXES, GATES, pathFrame, ARC_START, ARC_END, ARC_R, TOWER_CENTER } from './level.js';
import { SETTINGS, PLAYER_COLORS, HOSTILE } from './config.js';
import { buildPlayerRig } from './rigs.js';
import { animatePlayer } from './anim.js';
import { buildEnemyRig, animateEnemy } from './enemyRigs.js';
import { FX, toWorld, ImpactShader } from './fx.js';

const yawAt = x => { const f = pathFrame(x); return Math.atan2(-f.tz, f.tx); };
// A rig leaving the scene frees its geometry buffers. Enemy rigs free their materials too (a warmed stand-in
// in fx.warm keeps those shaders compiled); player rigs keep theirs so a character swap never recompiles one.
function disposeTree(root, materials = true) {
  root.traverse(o => {
    if (o.geometry && !o.isSprite) o.geometry.dispose();
    if (materials && o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
  });
}

// Canvas textures for the environment, made once: lit windows for the skyline, the Danger Room's grid panels,
// the city's lights far below, and hazard stripes.
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
function envTextures() {
  const windows = canvasTex(128, 256, (g, w, h) => {
    g.fillStyle = '#000000'; g.fillRect(0, 0, w, h);
    for (let y = 6; y < h - 6; y += 12) for (let x = 6; x < w - 6; x += 10) {
      const r = Math.random();
      if (r < 0.42) { g.globalAlpha = 0.5 + Math.random() * 0.5; g.fillStyle = r < 0.05 ? '#9fd4ff' : r < 0.28 ? '#ffd9a0' : '#ffb870'; g.fillRect(x, y, 6, 7); }
    }
    g.globalAlpha = 1;
  });
  const grid = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#0d1824'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(64, 208, 255, 0.5)'; g.lineWidth = 2;
    for (let i = 32; i < 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
    g.strokeStyle = 'rgba(150, 238, 255, 0.95)'; g.lineWidth = 5; g.strokeRect(0, 0, w, h);
  });
  const city = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#000000'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255, 170, 90, 0.4)'; g.lineWidth = 2;
    for (let i = 8; i < w; i += 28 + Math.random() * 34) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, h); g.stroke(); }
    for (let i = 8; i < h; i += 28 + Math.random() * 34) { g.beginPath(); g.moveTo(0, i); g.lineTo(w, i); g.stroke(); }
    for (let i = 0; i < 1800; i++) { g.globalAlpha = Math.random(); g.fillStyle = Math.random() < 0.8 ? '#ffcf8a' : '#bfe3ff'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.globalAlpha = 1;
  });
  const hazard = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#e8b730'; g.fillRect(0, 0, w, h); g.fillStyle = '#16171b';
    for (let i = -64; i < 96; i += 32) { g.beginPath(); g.moveTo(i, h); g.lineTo(i + 16, h); g.lineTo(i + 80, 0); g.lineTo(i + 64, 0); g.closePath(); g.fill(); }
  });
  return { windows, grid, city, hazard };
}

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.r.toneMapping = THREE.ACESFilmicToneMapping; this.r.toneMappingExposure = 0.95;
    this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x8a6f8f, 60, 250);   // dusk haze, the colour of the low sky
    this.persp = new THREE.PerspectiveCamera(SETTINGS.fov, 16 / 9, 0.5, 600);
    this.ortho = new THREE.OrthographicCamera(-10, 10, 5, -5, 0.5, 600);
    this.camera = this.persp;
    this.cam = { x: 0, y: 3, dist: 16 };
    this.trauma = 0; this.time = 0; this.bloomKick = 0; this.punch = 0; this.impact = null; this.impactCd = 0; this.hitPause = 0;
    this.rigs = new Map(); this.enemyRigs = new Map();

    // Dusk: a low orange sun for the key, a violet sky fill, a cool blue rim from behind
    const hemi = new THREE.HemisphereLight(0xb3b9e8, 0x3d3340, 0.9); this.scene.add(hemi);
    this.sun = new THREE.DirectionalLight(0xffc08a, 2.0);
    this.sun.position.set(-18, 30, 22); this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 24; sc.bottom = -24; sc.near = 1; sc.far = 120;
    this.sun.shadow.bias = -0.0006; this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    const rim = new THREE.DirectionalLight(0x93a6ff, 1.35); rim.position.set(14, 12, -26); this.scene.add(rim);

    this.fx = new FX(this.scene, this.rigs);
    this.baked = new Map();
    this.buildSky(); this.buildBackdrop(); this.buildLevel(); this.buildProps(); this.flushBaked();

    this.composer = new EffectComposer(this.r);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(1280, 720), 0.65, 0.5, 1.5);
    this.output = new OutputPass();
    this.ink = new ShaderPass(ImpactShader); this.ink.enabled = false; this.dim = 0;
    this.composer.addPass(this.renderPass); this.composer.addPass(this.bloom); this.composer.addPass(this.output); this.composer.addPass(this.ink);
    this.fx.warm(this.r, this.camera, this.composer.renderTarget1);
    // The impact frame's pass is off until the first big moment: compile it now so that moment never stalls
    try { this.ink.enabled = true; this.ink.uniforms.amount.value = 1; this.composer.render(0); } catch (e) { /* best effort */ }
    this.ink.enabled = false; this.ink.uniforms.amount.value = 0;
  }

  resize(w, h, world) {
    this.r.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.persp.aspect = w / h; this.persp.updateProjectionMatrix();
    this.ink.uniforms.res.value.set(w, h);
    if (world) world.aspect = w / h;
    this.w = w; this.h = h;
  }

  // Static geometry is merged into one mesh per material to keep draw calls low.
  bake(mesh, cast = true) {
    mesh.updateMatrixWorld(true);
    let g = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    g.applyMatrix4(mesh.matrixWorld);
    const key = mesh.material.uuid + (cast ? ':c' : ':n');
    if (!this.baked.has(key)) this.baked.set(key, { mat: mesh.material, cast, geos: [] });
    this.baked.get(key).geos.push(g);
    return mesh;
  }
  flushBaked() {
    for (const { mat, cast, geos } of this.baked.values()) {
      const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
      m.castShadow = cast; m.receiveShadow = true; this.scene.add(m);
    }
    this.baked.clear();
  }

  // ---- Environment ----
  // Dusk over the city: an indigo-to-orange sky, the sun low on the horizon, lit windows in the skyline,
  // Sentinel patrols crossing it, the city's lights far below. The Danger Room (the training zone) is a dark
  // room of glowing grid panels; outside it, the route runs over steel and concrete with amber trim, around
  // Trask Tower and across the rooftops to the Sentinel beacon, a giant Sentinel head on a mast.
  buildSky() {
    const geo = new THREE.SphereGeometry(420, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(0x111842) }, mid: { value: new THREE.Color(0x5b4b8f) }, bot: { value: new THREE.Color(0xf09a62) } },
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'uniform vec3 top, mid, bot; varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.12 ? mix(mid, top, smoothstep(0.12, 0.62, h)) : mix(bot, mid, smoothstep(-0.12, 0.12, h)); gl_FragColor = vec4(c, 1.0); }',
    });
    this.sky = new THREE.Mesh(geo, mat); this.scene.add(this.sky);
    for (const [color, size, op] of [[0xff8a5c, 300, 0.35], [0xffb072, 120, 0.9]]) {
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fx.tex.glow, color, transparent: true, opacity: op, depthWrite: false, fog: false }));
      g.scale.set(size, size, 1); g.position.set(-160, 14, -300); this.scene.add(g);
    }
  }

  buildBackdrop() {
    const T = envTextures();
    this.envTex = T;
    // Dusk clouds, lit pink from below
    const cloudMat = new THREE.SpriteMaterial({ map: this.fx.tex.glow, color: 0xd99aa6, transparent: true, opacity: 0.32, depthWrite: false });
    for (let i = 0; i < 30; i++) {
      const s = new THREE.Sprite(cloudMat);
      const a = Math.random() * Math.PI * 2, r = 190 + Math.random() * 150;
      s.position.set(60 + Math.cos(a) * r, 6 + Math.random() * 34, -40 + Math.sin(a) * r * 0.8);
      const k = 30 + Math.random() * 60; s.scale.set(k * 2.2, k * 0.8, 1); this.scene.add(s);
    }
    // The city far below: streets and lights
    T.city.repeat.set(5, 5);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), new THREE.MeshStandardMaterial({ color: 0x10131d, roughness: 1, emissive: 0xffffff, emissiveMap: T.city, emissiveIntensity: 0.85 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -34; this.scene.add(ground);
    // The skyline: dark towers with lit windows, rooftop boxes and aviation lights
    const towerMat = new THREE.MeshStandardMaterial({ color: 0x1f2536, roughness: 0.7, metalness: 0.2, emissive: 0xffffff, emissiveMap: T.windows, emissiveIntensity: 0.75 });
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x232a3a, roughness: 0.8 });
    const redLamp = new THREE.MeshStandardMaterial({ color: 0xff6a3d, emissive: 0xff5a2d, emissiveIntensity: 2.4 });
    const box = (w, h, d) => {
      const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, n = g.attributes.normal;
      for (let i = 0; i < uv.count; i++) {
        const side = Math.abs(n.getX(i)) > 0.5 ? d : w;   // window columns follow the face's own width
        uv.setXY(i, uv.getX(i) * side / 10, uv.getY(i) * h / 20);
      }
      return g;
    };
    // Two bands: behind the first half of the route (looking north), and behind the rooftops (the camera turns
    // round with the path after Trask Tower and looks south)
    const spots = [];
    for (let i = 0; i < 46; i++) spots.push([-130 + i * 9.5 + (Math.random() - 0.5) * 6, -95 - Math.random() * 140]);
    for (let i = 0; i < 34; i++) spots.push([-150 + i * 9 + (Math.random() - 0.5) * 6, 95 + Math.random() * 130]);
    for (const [x, z] of spots) {
      const h = 38 + Math.random() * 80, w = 8 + Math.random() * 10, d = 8 + Math.random() * 10;
      const m = new THREE.Mesh(box(w, h, d), towerMat); m.position.set(x, h / 2 - 34, z); this.bake(m, false);
      const top = new THREE.Mesh(new THREE.BoxGeometry(w * 0.5, 2.5, d * 0.5), roofMat); top.position.set(x, h - 34 + 1.25, z); this.bake(top, false);
      if (Math.random() < 0.4) {
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 9, 6), roofMat); mast.position.set(x, h - 34 + 7, z); this.bake(mast, false);
        const l = new THREE.Mesh(new THREE.SphereGeometry(0.7, 10, 8), redLamp); l.position.set(x, h - 34 + 11.6, z); this.bake(l, false);
      }
    }
    // Sentinel patrols crossing the sky: purple hulls, one magenta eye each
    this.pods = [];
    const patrolMat = new THREE.MeshStandardMaterial({ color: 0x6d3aa8, roughness: 0.4, metalness: 0.25 });
    const greyMat = new THREE.MeshStandardMaterial({ color: 0xb2bac8, roughness: 0.35, metalness: 0.4 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: HOSTILE, emissive: HOSTILE, emissiveIntensity: 3 });
    for (const [y, z, speed] of [[26, -78, 9], [34, -104, -7], [20, -126, 12], [30, 40, -8], [38, 70, 10]]) {
      for (let i = 0; i < 2; i++) {
        const g = new THREE.Group();
        const hull = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 3.2, 4, 10), patrolMat); hull.rotation.z = Math.PI / 2; g.add(hull);
        const face = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.2, 1.4), greyMat); face.position.x = 2.5; g.add(face);
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 8), eyeMat); eye.position.set(2.8, 0.2, 0); g.add(eye);
        if (speed < 0) g.scale.x = -1;
        g.position.set(-200 + i * 230, y, z); this.scene.add(g); this.pods.push({ pod: g, speed });
      }
    }
    // Trask Tower, the one the route wraps around: dark glass, amber floor bands and light strips
    const glass = new THREE.MeshStandardMaterial({ color: 0x1b2232, roughness: 0.22, metalness: 0.65, emissive: 0xffffff, emissiveMap: T.windows, emissiveIntensity: 0.5 });
    T.windowsTower = T.windows.clone(); T.windowsTower.repeat.set(26, 11); T.windowsTower.needsUpdate = true; glass.emissiveMap = T.windowsTower;
    const amber = new THREE.MeshStandardMaterial({ color: 0xffb547, emissive: 0xff9a2a, emissiveIntensity: 1.6 });
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(ARC_R - 3.4, ARC_R - 2.4, 110, 48), glass);
    tower.position.set(TOWER_CENTER.x, 20, TOWER_CENTER.z); this.bake(tower, false);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 90, 0.3), amber);
      strip.position.set(TOWER_CENTER.x + Math.sin(a) * (ARC_R - 3.3), 25, TOWER_CENTER.z + Math.cos(a) * (ARC_R - 3.3)); this.bake(strip, false);
    }
    for (const y of [-4, 18, 40, 62]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(ARC_R - 2.8, 0.35, 8, 48), amber); ring.rotation.x = Math.PI / 2;
      ring.position.set(TOWER_CENTER.x, y, TOWER_CENTER.z); this.bake(ring, false);
    }
    // The Danger Room: walls of glowing grid panels behind and above the training floor
    T.gridWall = T.grid.clone(); T.gridWall.repeat.set(76 / 6, 30 / 6); T.gridWall.needsUpdate = true;
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x9fb3c8, map: T.gridWall, emissive: 0xffffff, emissiveMap: T.gridWall, emissiveIntensity: 0.6, roughness: 0.6 });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(76, 30), wallMat); wall.position.set(24, 9, -10.5); this.scene.add(wall);
  }

  buildLevel() {
    const T = this.envTex;
    const M = {
      cap: new THREE.MeshStandardMaterial({ color: 0xa9aeb6, roughness: 0.85 }),
      body: new THREE.MeshStandardMaterial({ color: 0x3a4150, roughness: 0.72, metalness: 0.2 }),
      dark: new THREE.MeshStandardMaterial({ color: 0x262b36, roughness: 0.7 }),
      trim: new THREE.MeshStandardMaterial({ color: 0xffb547, emissive: 0xff9a2a, emissiveIntensity: 1.7 }),
      gate: new THREE.MeshStandardMaterial({ color: 0xff2e7e, emissive: 0xff2e7e, emissiveIntensity: 1.6, transparent: true, opacity: 0.45, depthWrite: false }),
      // The Danger Room's floor and blocks: dark grid panels with cyan light
      gymCap: new THREE.MeshStandardMaterial({ color: 0x9fb3c8, map: T.grid, emissive: 0xffffff, emissiveMap: T.grid, emissiveIntensity: 0.45, roughness: 0.55 }),
      gymBody: new THREE.MeshStandardMaterial({ color: 0x1c2633, roughness: 0.6, metalness: 0.3 }),
      gymTrim: new THREE.MeshStandardMaterial({ color: 0x40d0ff, emissive: 0x2fc6ff, emissiveIntensity: 1.9 }),
    };
    this.gateMeshes = [];
    const pc = document.createElement('canvas'); pc.width = pc.height = 128;
    const g = pc.getContext('2d'); g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#b9bec6'; g.fillRect(0, 0, 128, 3); g.fillRect(0, 0, 3, 128);
    g.fillStyle = '#d6d9de'; g.fillRect(62, 20, 4, 88);
    this.panelTex = new THREE.CanvasTexture(pc); this.panelTex.colorSpace = THREE.SRGBColorSpace;
    this.panelTex.wrapS = this.panelTex.wrapT = THREE.RepeatWrapping; this.panelTex.anisotropy = 4;
    M.capTex = M.cap.clone(); M.capTex.map = this.panelTex;
    const depthFor = b => (b.type === 'o' ? 2.6 : ['panel', 'column', 'pillar'].includes(b.tag) ? 1.8 : b.type === 'g' ? 3.2 : 4.4);
    for (const b of BOXES) {
      const depth = depthFor(b), h = b.y1 - b.y0;
      const gym = b.x1 <= 60 && b.x0 >= -10;
      const segs = [];
      const curved = b.x1 > ARC_START && b.x0 < ARC_END;
      if (!curved) segs.push([b.x0, b.x1]);
      else { const n = Math.ceil((b.x1 - b.x0) / 0.9); for (let i = 0; i < n; i++) segs.push([b.x0 + (b.x1 - b.x0) * i / n, b.x0 + (b.x1 - b.x0) * (i + 1) / n]); }
      for (const [x0, x1] of segs) {
        const xm = (x0 + x1) / 2, w = (x1 - x0) * (curved ? 1.04 : 1), yaw = yawAt(xm);
        const place = (mesh, y, dz = 0, bake = true) => { toWorld(xm, y, dz, mesh.position); mesh.rotation.y = yaw; if (bake) this.bake(mesh, mesh.userData.cast !== false); else this.scene.add(mesh); return mesh; };
        if (b.type === 'g') {
          const g = place(new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), M.gate), b.y0 + h / 2, 0, false);
          this.gateMeshes.push({ mesh: g, tag: b.tag });
          continue;
        }
        if (b.tag === 'bound') { place(new THREE.Mesh(new THREE.BoxGeometry(w, h, depth), M.dark), b.y0 + h / 2); continue; }
        const capH = Math.min(0.22, h * 0.4);
        const bodyGeo = curved || b.type === 'o' ? new THREE.BoxGeometry(w, h - capH, depth) : new RoundedBoxGeometry(w, h - capH, depth, 2, 0.12);
        const bodyMesh = new THREE.Mesh(bodyGeo, b.type === 'o' ? M.dark : gym ? M.gymBody : M.body);
        bodyMesh.userData.cast = b.type !== 's' || h < 10;
        place(bodyMesh, b.y0 + (h - capH) / 2);
        const capGeo = curved ? new THREE.BoxGeometry(w, capH, depth + 0.1) : new RoundedBoxGeometry(w + 0.08, capH, depth + 0.1, 2, 0.06);
        const uv = capGeo.attributes.uv, tile = gym ? 3 : 2;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * Math.max(1, w / tile), uv.getY(i) * Math.max(1, (depth + 0.1) / tile));
        place(new THREE.Mesh(capGeo, gym ? M.gymCap : M.capTex), b.y1 - capH / 2);
        const trim = gym ? M.gymTrim : M.trim;
        if (b.tag !== 'tunnel' && b.tag !== 'panel') place(new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.06), trim), b.y1 - capH - 0.05, depth / 2 + 0.02);
        if (b.type === 'o') place(new THREE.Mesh(new THREE.BoxGeometry(w * 0.9, 0.05, depth * 0.8), trim), b.y0 - 0.01);
      }
    }
  }

  buildProps() {
    const T = this.envTex;
    const steel = new THREE.MeshStandardMaterial({ color: 0x2c323e, roughness: 0.55, metalness: 0.4 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0x7d838c, roughness: 0.9 });
    const lamp = new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffb15a, emissiveIntensity: 2.4 });
    const cyan = new THREE.MeshStandardMaterial({ color: 0x9feaff, emissive: 0x2fc6ff, emissiveIntensity: 2.4 });
    const amber = new THREE.MeshStandardMaterial({ color: 0xffb547, emissive: 0xff9a2a, emissiveIntensity: 1.8 });
    const hazard = new THREE.MeshStandardMaterial({ color: 0xffffff, map: T.hazard, roughness: 0.6 });
    const crate = new THREE.MeshStandardMaterial({ color: 0x5a4a3b, roughness: 0.85 });
    const redLamp = new THREE.MeshStandardMaterial({ color: 0xff6a3d, emissive: 0xff5a2d, emissiveIntensity: 2.4 });
    // Scale and shadow flags must be set before baking, since baking copies the geometry.
    const add = (geo, mat, x, y, z, { cast = true, scale = null } = {}) => {
      const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
      if (scale) m.scale.set(...scale);
      this.bake(m, cast); return m;
    };
    // A lower back terrace holds the props so they sit below and behind character silhouettes
    const Y = -1.1;
    add(new THREE.BoxGeometry(108, 5, 8), new THREE.MeshStandardMaterial({ color: 0x2f3542, roughness: 0.75 }), 43.5, Y - 2.5, -6.4, { cast: false });
    add(new THREE.BoxGeometry(108, 0.2, 8.1), new THREE.MeshStandardMaterial({ color: 0x6f7680, roughness: 0.85 }), 43.5, Y - 0.1, -6.4, { cast: false });
    for (let x = -4; x < 96; x += 11) {
      const z = -5.2;
      if (x < 58) {
        // Danger Room: hologram emitters, a dark pylon with a cyan lens
        add(new THREE.CylinderGeometry(0.22, 0.34, 2.4, 10), steel, x, Y + 1.2, z);
        add(new THREE.SphereGeometry(0.26, 12, 10), cyan, x, Y + 2.5, z, { cast: false });
        add(new THREE.BoxGeometry(1.6, 0.12, 0.3), cyan, x + 5, Y + 0.08, z - 1.5, { cast: false });
        continue;
      }
      // The Sentinel Works yard: hazard barriers, crates, sodium lamps
      add(new THREE.BoxGeometry(1.8, 0.9, 0.5), hazard, x, Y + 0.45, z);
      add(new THREE.BoxGeometry(1.1, 1.1, 1.1), crate, x + 2.2, Y + 0.55, z - 0.6);
      add(new THREE.BoxGeometry(0.8, 0.8, 0.8), crate, x + 2.0, Y + 1.5, z - 0.6, { scale: [1, 1, 1] });
      add(new THREE.CylinderGeometry(0.08, 0.1, 5.5, 8), steel, x + 5, Y + 2.75, z - 2, { cast: false });
      add(new THREE.BoxGeometry(0.9, 0.12, 0.3), steel, x + 5.35, Y + 5.45, z - 2, { cast: false });
      add(new THREE.SphereGeometry(0.2, 12, 10), lamp, x + 5.75, Y + 5.3, z - 2, { cast: false });
    }
    // Ribs over the Danger Room (cyan) and a steel gantry over the Sentinel Works (amber)
    const archGeo = new THREE.TorusGeometry(9, 0.55, 10, 40, Math.PI), stripGeo = new THREE.TorusGeometry(8.4, 0.08, 6, 40, Math.PI);
    for (const x of [8, 48, 88]) { add(archGeo, steel, x, -1, -16, { cast: false }); add(stripGeo, x < 58 ? cyan : amber, x, -1, -15.4, { cast: false }); }

    // Rooftop Relay dressing: masts with aviation lights behind the rooftops, and the Sentinel beacon at the end
    const at = (x, y, depth) => toWorld(x, y, depth, new THREE.Vector3());
    for (const [x, y, h] of [[195, 15.6, 6], [212, 15.6, 8], [226, 12.6, 5], [252, 18.6, 6], [262, 18.6, 7], [294, 18.6, 7]]) {
      const b = at(x, y, -2.9);
      add(new THREE.CylinderGeometry(0.1, 0.15, h, 10), steel, b.x, y + h / 2, b.z, { cast: false });
      add(new THREE.SphereGeometry(0.22, 12, 10), redLamp, b.x, y + h + 0.15, b.z, { cast: false });
    }
    // The beacon: a giant Sentinel head on a mast, its eyes burning magenta
    const bc = at(314, 18.6, -7);
    const purple = new THREE.MeshStandardMaterial({ color: 0x6d3aa8, roughness: 0.4, metalness: 0.25 });
    const grey = new THREE.MeshStandardMaterial({ color: 0xb2bac8, roughness: 0.35, metalness: 0.4 });
    const eyes = new THREE.MeshStandardMaterial({ color: HOSTILE, emissive: HOSTILE, emissiveIntensity: 3.2 });
    add(new THREE.CylinderGeometry(0.45, 0.85, 3.4, 16), steel, bc.x, 18.6 + 1.7, bc.z);
    const head = new THREE.Group(); head.position.set(bc.x, 18.6 + 5.2, bc.z); const nf = pathFrame(310); head.rotation.y = Math.atan2(nf.nx, nf.nz); head.scale.setScalar(0.75);   // its face turned to the camera
    const hp = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); head.add(m); return m; };
    hp(new RoundedBoxGeometry(4.2, 4.6, 4.1, 3, 0.8), purple, 0, 0, 0);
    hp(new RoundedBoxGeometry(3.4, 3.4, 0.7, 2, 0.2), grey, 0, -0.35, 1.9);
    for (const x of [-0.8, 0.8]) hp(new THREE.BoxGeometry(0.95, 0.38, 0.3), eyes, x, 0.45, 2.3);
    for (const y of [-1.0, -1.35, -1.7]) hp(new THREE.BoxGeometry(1.7, 0.12, 0.2), steel, 0, y, 2.3);
    for (const x of [-2.1, 2.1]) { const d = hp(new THREE.CylinderGeometry(0.95, 0.95, 0.35, 20), grey, x, 0, 0); d.rotation.z = Math.PI / 2; }
    head.updateMatrixWorld(true); head.traverse(o => { if (o.isMesh) { o.updateMatrixWorld(true); this.bake(o, false); } });
    const beacon = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fx.tex.glow, color: HOSTILE, transparent: true, opacity: 0.8, depthWrite: false }));
    beacon.scale.set(9, 9, 1); beacon.position.set(bc.x, 18.6 + 5.5, bc.z); this.scene.add(beacon);
  }

  // ---- Entities ----
  syncEntities(world, alpha, dt) {
    const t = this.time;
    const seen = new Set();
    for (const p of world.players) {
      seen.add(p);
      let rig = this.rigs.get(p);
      if (!rig || rig.char !== p.char) {
        if (rig) { this.scene.remove(rig.root); disposeTree(rig.root, false); }
        rig = buildPlayerRig(p.char);
        const ringMat = new THREE.MeshBasicMaterial({ color: PLAYER_COLORS[p.slot], transparent: true, opacity: 0.65, depthWrite: false });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 32), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
        rig.root.add(ring); rig.ring = ring;
        this.scene.add(rig.root); this.rigs.set(p, rig);
      }
      const x = p.prevX + (p.x - p.prevX) * alpha, y = p.prevY + (p.y - p.prevY) * alpha;
      toWorld(x, y, 0, rig.root.position);
      rig.root.rotation.y = yawAt(x);
      rig.flip.scale.x = p.facing;
      animatePlayer(rig, p, dt, t);
      // Echo is gone during Thousand Cuts until every cut lands at once; a dodging Nova flickers like a hologram
      const cutting = p.state === 'ult' && p.ultRun && p.ultRun.kind === 'echo' && p.ultRun.t < p.ultRun.fin;
      const phasing = p.state === 'dodge' && p.dodge && p.dodge.t <= 11 && Math.floor(t * 30) % 3 === 0;
      rig.root.visible = p.state !== 'dead' && !cutting && !phasing && !(p.mercy > 0 && p.state !== 'downed' && p.state !== 'ult' && Math.floor(t * 14) % 2 === 0);
      rig.ring.visible = p.state !== 'downed';
    }
    for (const [p, rig] of this.rigs) if (!seen.has(p)) { this.scene.remove(rig.root); disposeTree(rig.root, false); this.rigs.delete(p); }

    const seenE = new Set();
    for (const e of world.enemies) {
      seenE.add(e);
      let R = this.enemyRigs.get(e);
      if (!R) { R = buildEnemyRig(e); this.scene.add(R.root); this.enemyRigs.set(e, R); }
      const x = e.prevX + (e.x - e.prevX) * alpha, y = e.prevY + (e.y - e.prevY) * alpha;
      toWorld(x, y, 0, R.root.position);
      R.root.rotation.y = yawAt(x);
      animateEnemy(R, e, dt, t);
      if (e.tagged > 0 && !R.tag) {
        R.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fx.tex.star, color: 0xffa53a, transparent: true, depthWrite: false }));
        R.tag.scale.set(0.7, 0.7, 1); R.tag.position.set(0, e.h + 0.5, 0); R.root.add(R.tag);
      }
      if (R.tag) R.tag.visible = e.tagged > 0 && !e.dead;
    }
    for (const [e, R] of this.enemyRigs) if (!seenE.has(e)) { this.scene.remove(R.root); disposeTree(R.root); this.enemyRigs.delete(e); }

    for (const g of this.gateMeshes) {
      g.mesh.visible = GATES[g.tag];
      g.mesh.material.opacity = 0.35 + 0.12 * Math.sin(t * 6);
    }
    for (const pd of this.pods) { pd.pod.position.x += pd.speed * dt; if (pd.pod.position.x > 280) pd.pod.position.x = -220; if (pd.pod.position.x < -220) pd.pod.position.x = 280; }
  }

  // ---- Camera ----
  updateCamera(world, dt) {
    let T = world.cam, rate = 5.5;
    // An ultimate's call pushes in on whoever is calling it; while it plays out the frame eases back
    const U = world.ultCast;
    if (U && U.members.length) {
      const n = U.members.length, mx = U.members.reduce((a, m) => a + m.x, 0) / n, my = U.members.reduce((a, m) => a + m.y, 0) / n + 1.1;
      if (U.phase === 'cast') { T = { x: mx, y: my + 0.4, dist: Math.max(8.5, T.dist * 0.6) }; rate = 9; }
      else if (U.phase === 'run') T = { x: T.x * 0.7 + mx * 0.3, y: T.y * 0.7 + my * 0.3, dist: T.dist * 1.04 };
    }
    const k = 1 - Math.exp(-dt * rate);
    // Vertical follow speeds up the further behind it falls, so a big launch never leaves the frame
    const ky = 1 - Math.exp(-dt * (rate + Math.max(0, Math.abs(T.y - this.cam.y) - 1.2) * 5));
    this.cam.x += (T.x - this.cam.x) * k; this.cam.y += (T.y - this.cam.y) * ky; this.cam.dist += (T.dist - this.cam.dist) * k;
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    if (world.players.some(p => p.state === 'beam' && p.beam)) this.trauma = Math.max(this.trauma, 0.22);   // the beam shakes the frame the whole time
    if (world.players.some(p => p.state === 'ult' && p.ultRun && p.ultRun.segs)) this.trauma = Math.max(this.trauma, 0.4);   // and Supernova far more
    this.punch *= Math.exp(-dt * 10); this.bloomKick = Math.max(0, this.bloomKick - dt * 3.2);
    const f = pathFrame(this.cam.x);
    const look = new THREE.Vector3(f.px, this.cam.y, f.pz);
    const ortho = SETTINGS.camera === 'ortho';
    this.camera = ortho ? this.ortho : this.persp;
    this.renderPass.camera = this.camera;
    const d = this.cam.dist;
    this.camera.position.set(f.px + f.nx * d, this.cam.y + d * 0.1 + this.punch, f.pz + f.nz * d);
    look.y += this.punch * 0.6;   // a blast under a player thumps the whole frame down, then it settles
    if (SETTINGS.shake && this.trauma > 0) {
      const s = this.trauma * this.trauma * 0.35;
      this.camera.position.x += (Math.random() - 0.5) * s; this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(look);
    if (ortho) {
      const halfH = d * Math.tan(SETTINGS.fov * Math.PI / 360), halfW = halfH * (this.w / this.h || 16 / 9);
      Object.assign(this.ortho, { left: -halfW, right: halfW, top: halfH, bottom: -halfH });
      this.ortho.updateProjectionMatrix();
    } else if (this.persp.fov !== SETTINGS.fov) { this.persp.fov = SETTINGS.fov; this.persp.updateProjectionMatrix(); }
    // Keep the shadow frustum centred on the action
    this.sun.position.set(look.x - 18, 30 + look.y, look.z + 22); this.sun.target.position.copy(look);
  }

  onEvent(ev) {
    this.fx.onEvent(ev);
    const shake = { armorBreak: 0.5, slam: 0.45, guardBreak: 0.3, impact: 0.5, ambush: 0.35, challenge: 0.2, playerHit: ev.heavy ? 0.35 : 0.15,
      blast: 0.14 + (ev.level || 1) * 0.06 + (ev.perfect ? 0.1 : 0), burst: ev.charged ? 0.06 + ev.level * 0.04 : 0.05, perfectRelease: 0.1,
      splash: ev.level ? 0.04 + ev.level * 0.03 : 0, rocketJump: 0.2 + 0.42 * (ev.power || 0.5), enemyBlast: 0.3, chargeCrash: 0.3,
      shot: ev.level ? 0.03 + ev.level * 0.04 : 0, dash: ev.level ? 0.04 + ev.level * 0.05 : 0, dashLevel: 0.02 + ev.level * 0.02,
      chargeLevel: ev.level >= 4 ? 0.1 : ev.level >= 3 ? 0.04 : 0, walljump: 0.03,
      land: ev.vy < -16 ? Math.min(0.3, (-ev.vy - 16) * 0.025) : 0,
      snipe: 0.08 + 0.16 * (ev.f || 0), crit: 0.05, deflect: ev.perfect ? 0.12 : 0.05, dashSlash: 0.04 * (ev.tier || 1), crescent: 0.06, pogo: 0.04,
      poundLand: 0.22 + 0.12 * (ev.level || 0), poundDrop: 0.03, aegisHit: 0.05, beamStart: 0.3,
      aegisOff: ev.why === 'break' ? 0.3 : ev.why === 'detonate' ? 0.4 : 0, bossSlam: ev.big ? 0.55 : 0.35, bossPhase: 0.6, bossDown: 0.9, bossCrash: 0.45, bossIntro: 0.15,
      frag: 0.12 + 0.05 * (ev.level || 0), cluster: 0.1, chain: 0.04 + 0.03 * (ev.level || 0), wellOpen: 0.08, wellCollapse: 0.18 + 0.06 * (ev.level || 1), riseBlast: 0.14, perfectDodge: 0.2,
      ultCast: 0.35, ultJoin: 0.3, ultNova: 0.95, ultCut: 0.06, ultFinisher: 0.8, teamFinisher: 0.3,
      visor: 0.32, squall: 0.38, berserk: 0.3, drillLevel: 0.02 + (ev.level || 1) * 0.02, ultBolt: 0.12, ultThunder: 0.75 }[ev.type];
    if (shake) this.trauma = Math.min(1, this.trauma + shake);
    // Big releases light the whole frame for a moment (bloom) and the rocket jump thumps the camera
    const glow = { rocketJump: 0.45 + 0.75 * (ev.power || 0.5), perfectRelease: 0.4, dash: ev.level >= 3 ? 0.35 : 0,
      shot: ev.level >= 3 ? 0.22 : 0, blast: ev.level >= 3 ? 0.15 : 0, snipe: ev.full ? 0.3 : 0.08, beamStart: 0.6, chargeLevel: ev.level >= 4 ? 0.3 : 0,
      aegisOff: ev.why === 'detonate' ? 0.5 : ev.why === 'break' ? 0.3 : 0, poundLand: ev.level >= 2 ? 0.2 + 0.1 * ev.level : 0, bossPhase: 0.6, bossDown: 1,
      wellCollapse: 0.25, riseBlast: 0.2, perfectDodge: 0.35, ultCast: 0.6, ultJoin: 0.5, ultNova: 1.4, ultFinisher: 1, teamFinisher: 1.4, chain: 0.08 * (1 + (ev.level || 0)),
      visor: 0.6, squall: 0.35, berserk: 0.45, ultBolt: 0.28, ultThunder: 1.3 }[ev.type];
    if (glow) this.bloomKick = Math.min(1.4, this.bloomKick + glow);
    if (ev.type === 'rocketJump') this.punch = Math.min(this.punch, -(0.25 + 0.5 * (ev.power || 0.5)));
    if (ev.type === 'poundLand') this.punch = Math.min(this.punch, -(0.15 + 0.12 * ev.level));   // the frame thumps down with the landing
    if (ev.type === 'kill' && ev.e.type === 'brute') this.trauma = Math.min(1, this.trauma + 0.6);
    // The big moments get an impact frame
    if (ev.type === 'impact' || (ev.type === 'armorBreak' && ev.left === 0) || (ev.type === 'parry' && ev.perfect && ev.heavy)) this.startImpact(ev.x, ev.y, ev.type === 'impact' ? 1 : 0.8);
    else if (ev.type === 'kill' && (ev.e.type === 'brute' || ev.e.boss)) this.startImpact(ev.x, ev.y, 1);
    else if (ev.type === 'poundLand' && ev.level >= 3) this.startImpact(ev.x, ev.y + 0.6, 1);
    else if (ev.type === 'snipe' && ev.full && ev.crits > 0) this.startImpact(ev.x1, ev.y1, 0.8);
    else if (ev.type === 'bossPhase' || ev.type === 'bossDown') this.startImpact(ev.x, ev.y, 1.2);
    else if (ev.type === 'ultNova') this.startImpact(ev.x, ev.y, 1.4, true);
    else if (ev.type === 'ultFinisher') this.startImpact(ev.x, ev.y, 1.2, true);
    else if (ev.type === 'teamFinisher') this.pendingImpact = { t: 0.42, x: ev.x, y: ev.y, k: 1.5 };   // when the eclipse shatters
    else if (ev.type === 'perfectDodge') this.startImpact(ev.x, ev.y, 0.6);
    else if (ev.type === 'ultThunder') this.startImpact(ev.x, ev.y, 1.3, true);   // Storm's last thunderclap
    else if (ev.type === 'visor') this.startImpact(ev.x, ev.y, 0.5);
    if (ev.type === 'ultNova') this.punch = Math.min(this.punch, -0.6);
  }

  // Impact frame (Q-C test; sci-fi look since Version 9), phased: a cyan photonegative flash, then a hologram
  // grade with glowing edges, scanlines and a hex grid, light streaks, a shockwave ring and glitch tears
  // spreading from the hit, a zoom punch and colour split, easing back out. In play, a short hit-pause holds
  // the simulation (main.js) while it runs. At most one every 0.9 s. The same pass dims the world while an
  // ultimate is called.
  startImpact(x, y, strength = 1, force = false) {
    if (!SETTINGS.impactFrames || (this.impactCd > 0 && !force)) return;
    const s = this.screenOf(x, y), r = this.canvas.getBoundingClientRect();
    this.impact = { t: 0, dur: 0.26 + 0.12 * strength, cx: s.x / Math.max(1, r.width), cy: 1 - s.y / Math.max(1, r.height), k: strength, seed: Math.random() * 100 };
    this.impactCd = 0.9; this.hitPause = 0.05 + 0.05 * strength;
    this.trauma = Math.min(1, this.trauma + 0.25 * strength); this.bloomKick = Math.min(1.4, this.bloomKick + 0.4 * strength);
  }
  updateImpact(dt, world) {
    this.impactCd = Math.max(0, this.impactCd - dt);
    const I = this.impact, U = this.ink.uniforms, C = world && world.ultCast;
    // An ultimate's call drains the colour from the world; it comes back as the ultimate plays out
    // (and the world darkens again under a team finisher's eclipse, until it shatters)
    const dimTo = C ? (C.phase === 'cast' ? 0.85 : C.phase === 'run' ? 0.3 : C.t >= 8 && C.t < 34 ? 0.8 : 0.12) : 0;
    this.dim += (dimTo - this.dim) * (1 - Math.exp(-dt * (dimTo > this.dim ? 14 : 5)));
    if (this.dim < 0.01 && !dimTo) this.dim = 0;
    U.dim.value = this.dim; U.time.value = this.time;
    if (!I) { U.amount.value = 0; this.ink.enabled = this.dim > 0; return this.ink.enabled; }
    I.t += dt; const k = Math.min(1, I.t / I.dur);
    U.center.value.set(I.cx, I.cy); U.seed.value = I.seed;
    U.invert.value = k < 0.1 ? 1 : Math.max(0, 1 - (k - 0.1) / 0.06);
    U.amount.value = k < 0.78 ? 1 : Math.max(0, 1 - (k - 0.78) / 0.22);
    U.zoom.value = 0.07 * I.k * (1 - k) * (1 - k); U.split.value = 0.008 * I.k * (1 - k);
    U.ring.value = 0.05 + k * 1.25; U.glitch.value = Math.max(0, 1 - k * 2.4) * Math.min(1, I.k);
    this.ink.enabled = true;
    if (I.t >= I.dur) this.impact = null;
    return true;
  }

  render(world, alpha, dt) {
    this.time += dt;
    const PI = this.pendingImpact;
    if (PI && (PI.t -= dt) <= 0) { this.pendingImpact = null; this.startImpact(PI.x, PI.y, PI.k, true); this.punch = Math.min(this.punch, -0.6); this.trauma = 1; }
    this.syncEntities(world, alpha, dt);
    this.updateCamera(world, dt);
    this.fx.update(dt, world, { alpha, rigs: this.rigs, camera: this.camera });
    const inking = this.updateImpact(dt, world);
    if (SETTINGS.quality === 'low' && !inking) {
      this.r.shadowMap.enabled = false;
      this.r.render(this.scene, this.camera);
      return;
    }
    this.r.shadowMap.enabled = SETTINGS.quality !== 'low';
    this.bloom.enabled = SETTINGS.quality !== 'low';
    this.bloom.strength = 0.65 + this.bloomKick * 0.9;
    this.composer.render(dt);
  }

  // Sim point -> CSS pixel position on the canvas
  screenOf(x, y, out = { x: 0, y: 0, vis: true }) {
    const v = toWorld(x, y, 0, new THREE.Vector3()).project(this.camera);
    const r = this.canvas.getBoundingClientRect();
    out.x = (v.x * 0.5 + 0.5) * r.width; out.y = (-v.y * 0.5 + 0.5) * r.height; out.vis = v.z < 1;
    return out;
  }
  aimFromMouse(mx, my, p) {
    const c = this.screenOf(p.x, p.y + p.h * 0.62);
    const dx = mx - c.x, dy = -(my - c.y), m = Math.hypot(dx, dy);
    return m < 6 ? null : [dx / m, dy / m];
  }
}
