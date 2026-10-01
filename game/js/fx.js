// Visual effects: particles, glints, telegraph markers, projectiles, barriers, lasers, scarf.
import * as THREE from 'three';
import { pathFrame, groundBelow } from './level.js';
import { CHARS, HOSTILE, NOVA, SETTINGS, ATTACH_LOOK, DASH_CHARGE, DASH_SLASH, POUND, MARKSMAN, SUB_LOOK, attachLook, subLook, fxPal, kitOf, FXPAL } from './config.js';
import { toWorld, planeDir } from './space.js';
import { Ghosts } from './ghosts.js';
import { buildPlayerRig } from './rigs.js';
import { buildEnemyRig } from './enemyRigs.js';
import { ChargeFX } from './chargefx.js';
import { SweepTrails } from './trails.js';
import { AegisFX } from './aegisfx.js';
import { BeamFX } from './beamfx.js';
import { SubFX } from './subfx.js';
import { UltFX } from './ultfx.js';
export { toWorld, planeDir };

function canvasTex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const glowTex = () => canvasTex(64, (g, s) => {
  const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, s, s);
});
const starTex = () => canvasTex(128, (g, s) => {
  g.translate(s / 2, s / 2); g.fillStyle = '#fff';
  for (let i = 0; i < 2; i++) {
    g.beginPath(); g.moveTo(0, -s * 0.48); g.lineTo(s * 0.05, 0); g.lineTo(0, s * 0.48); g.lineTo(-s * 0.05, 0); g.closePath(); g.fill();
    g.rotate(Math.PI / 2);
  }
  const r = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.18); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.beginPath(); g.arc(0, 0, s * 0.18, 0, Math.PI * 2); g.fill();
});
const ringTex = () => canvasTex(128, (g, s) => {
  g.strokeStyle = '#fff'; g.lineWidth = s * 0.07; g.beginPath(); g.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2); g.stroke();
});
// A butterfly (Psylocke's psychic sign): two pairs of wings and a thin body, white so it can be tinted
const flyTex = () => canvasTex(128, (g, s) => {
  g.translate(s / 2, s / 2); g.fillStyle = '#fff';
  for (const k of [1, -1]) {
    g.beginPath(); g.ellipse(k * s * 0.2, -s * 0.12, s * 0.2, s * 0.15, k * -0.5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(k * s * 0.15, s * 0.14, s * 0.12, s * 0.1, k * 0.45, 0, Math.PI * 2); g.fill();
  }
  g.fillRect(-s * 0.02, -s * 0.2, s * 0.04, s * 0.4);
});
const jagTex = () => canvasTex(128, (g, s) => {
  g.fillStyle = 'rgba(255,255,255,0)'; g.fillRect(0, 0, s, s); g.fillStyle = '#fff';
  for (let i = 0; i < 4; i++) { const x = i * s / 4; g.beginPath(); g.moveTo(x, s); g.lineTo(x + s / 8, s * 0.25); g.lineTo(x + s / 4, s); g.closePath(); g.fill(); }
});

const PARTICLE_VS = `
attribute float size; attribute float alpha; attribute vec3 pcolor;
varying float vA; varying vec3 vC;
void main(){ vA = alpha; vC = pcolor; vec4 mv = modelViewMatrix * vec4(position,1.0);
  gl_PointSize = size * (300.0 / -mv.z); gl_Position = projectionMatrix * mv; }`;
const PARTICLE_FS = `
uniform sampler2D map; varying float vA; varying vec3 vC;
void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * vA); }`;
// Smoke and dust are drawn with ordinary blending, so they show against the bright sky and floors
// where glowing (additive) particles wash out
const SMOKE_FS = `
uniform sampler2D map; varying float vA; varying vec3 vC;
void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC, t.a * vA); }`;

export class FX {
  constructor(scene, rigs = new Map()) {
    this.scene = scene; this.rigs = rigs;
    this.tex = { glow: glowTex(), star: starTex(), ring: ringTex(), jag: jagTex(), fly: flyTex() };
    this.tex.jag.wrapS = THREE.RepeatWrapping;
    // Particles (one draw call)
    const N = 1600; this.N = N; this.pi = 0;
    const g = new THREE.BufferGeometry();
    this.pPos = new Float32Array(N * 3); this.pCol = new Float32Array(N * 3);
    this.pSize = new Float32Array(N); this.pAlpha = new Float32Array(N);
    g.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    g.setAttribute('pcolor', new THREE.BufferAttribute(this.pCol, 3));
    g.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.pAlpha, 1));
    this.parts = Array.from({ length: N }, () => ({ life: 0, max: 1, v: new THREE.Vector3(), drag: 0.9, grav: 0, size: 0.3 }));
    const m = new THREE.ShaderMaterial({ uniforms: { map: { value: this.tex.glow } }, vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.points = new THREE.Points(g, m); this.points.frustumCulled = false; scene.add(this.points);
    // Smoke/dust pool (ordinary blending)
    const SN = 500; this.SN = SN; this.si = 0;
    const sg = new THREE.BufferGeometry();
    this.sPos = new Float32Array(SN * 3); this.sCol = new Float32Array(SN * 3); this.sSize = new Float32Array(SN); this.sAlpha = new Float32Array(SN);
    sg.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3)); sg.setAttribute('pcolor', new THREE.BufferAttribute(this.sCol, 3));
    sg.setAttribute('size', new THREE.BufferAttribute(this.sSize, 1)); sg.setAttribute('alpha', new THREE.BufferAttribute(this.sAlpha, 1));
    this.sparts = Array.from({ length: SN }, () => ({ life: 0, max: 1, v: new THREE.Vector3(), drag: 0.9, grav: 0, size: 0.5, grow: 1, op: 0.5 }));
    const sm = new THREE.ShaderMaterial({ uniforms: { map: { value: this.tex.glow } }, vertexShader: PARTICLE_VS, fragmentShader: SMOKE_FS, transparent: true, depthWrite: false });
    this.smokePts = new THREE.Points(sg, sm); this.smokePts.frustumCulled = false; this.smokePts.renderOrder = 1; scene.add(this.smokePts);
    // Billboard sprites (glints, rings)
    this.sprites = [];
    for (let i = 0; i < 72; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.star, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      s.visible = false; scene.add(s); this.sprites.push({ s, life: 0, max: 1, grow: 1, base: 1 });
    }
    // Enemy status glyphs ('?' lost track, '!' taunted): normal blending so they read on bright skies
    this.glyphTex = {}; this.glyphs = [];
    for (let i = 0; i < 12; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false }));
      s.visible = false; s.renderOrder = 10; scene.add(s); this.glyphs.push({ s, life: 0, max: 1, e: null });
    }
    this.projMeshes = new Map(); this.barrierMeshes = new Map(); this.lasers = new Map();
    this.shockMeshes = new Map(); this.markers = []; this.scarves = new Map(); this.telegraphs = [];
    this.tmp = new THREE.Vector3(); this.tmp2 = new THREE.Vector3();
    this.buildProjectileTemplates();
    this.ghosts = new Ghosts(scene);
    this.charge = new ChargeFX(this);
    this.trails = new SweepTrails(scene); this.aegis = new AegisFX(this); this.beam = new BeamFX(this);
    this.sub = new SubFX(this); this.ult = new UltFX(this);
    this.slashes = new Map(); this.texts = []; this.poundT = new Map(); this.prevVx = new Map(); this.stepT = new Map();
    // Flat rings on the ground (shockwaves); a small pool
    this.rings = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: this.tex.ring, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); this.rings.push({ m, life: 0 });
    }
    this.ghostTick = new Map();
  }

  // Smoke or dust puffs (ordinary blending): they grow as they fade. opts: dir, spread, drag, grav, grow, op
  smoke(x, y, color, n = 6, speed = 2, size = 0.6, life = 0.6, opts = {}) {
    const c = new THREE.Color(color), w = toWorld(x, y, opts.depth ?? 0.15, this.tmp);
    for (let i = 0; i < n; i++) {
      const P = this.sparts[this.si], idx = this.si; this.si = (this.si + 1) % this.SN;
      const a = opts.dir !== undefined ? opts.dir + (Math.random() - 0.5) * (opts.spread || 1) : Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      planeDir(x, Math.cos(a) * sp, Math.sin(a) * sp, P.v);
      const f = pathFrame(x); P.v.x += f.nx * (Math.random() - 0.5) * sp * 0.3; P.v.z += f.nz * (Math.random() - 0.5) * sp * 0.3;
      this.sPos.set([w.x, w.y, w.z], idx * 3); this.sCol.set([c.r, c.g, c.b], idx * 3);
      P.life = P.max = life * (0.7 + Math.random() * 0.6); P.size = size * (0.7 + Math.random() * 0.6);
      P.drag = opts.drag ?? 0.92; P.grav = opts.grav ?? -0.6; P.grow = opts.grow ?? 1.8; P.op = opts.op ?? 0.5;
    }
  }
  updateSmoke(dt) {
    for (let i = 0; i < this.SN; i++) {
      const P = this.sparts[i];
      if (P.life <= 0) { this.sAlpha[i] = 0; continue; }
      P.life -= dt; P.v.multiplyScalar(Math.pow(P.drag, dt * 60)); P.v.y -= P.grav * dt;
      this.sPos[i * 3] += P.v.x * dt; this.sPos[i * 3 + 1] += P.v.y * dt; this.sPos[i * 3 + 2] += P.v.z * dt;
      const k = Math.max(0, P.life / P.max);
      this.sAlpha[i] = P.op * Math.min(1, k * 1.6); this.sSize[i] = P.size * (1 + (P.grow - 1) * (1 - k));
    }
    const g = this.smokePts.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.pcolor.needsUpdate = true;
  }

  // Compile every effect material once at start-up (with a stand-in of each effect briefly visible), so
  // the first rocket jump, charge or afterimage does not stall on shader compilation mid-fight
  warm(renderer, camera, target = null) {
    const keep = [], shown = [];
    const show = o => { o.traverse(q => { if (!q.visible) { q.visible = true; shown.push(q); } }); };
    // Stand-ins sit in front of the (not yet placed) camera, so warming also draws each one once
    const at = new THREE.Vector3(0, 0, -9), put = o => o.position.copy(at).add(new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 0));
    const dummy = { char: 'nova' };
    const S = this.charge.of(dummy);
    for (const o of [S.orb, S.core, S.halo, S.crystal, S.sight, S.laser, S.laserDot, S.dots, S.aura, S.land, S.apex.group, S.apex.beam, ...S.motes, ...S.apex.ticks]) { put(o); show(o); }
    const stand = buildPlayerRig('nova'); stand.root.position.copy(at); this.scene.add(stand.root); stand.root.updateMatrixWorld(true);
    const g = this.ghosts.spawn(stand, '#ffb547', 0.01, 0.01); this.scene.remove(stand.root);
    // (It is only used for the ghost here; the real rigs compile their own shaders when they first appear)
    stand.root.traverse(q => { if (q.geometry) q.geometry.dispose(); });
    this.warmMats = []; stand.root.traverse(q => { if (q.material) this.warmMats.push(q.material); });
    for (const k in this.tmpl) { const m = this.tmpl[k](); put(m); this.scene.add(m); keep.push(m); }
    for (const it of this.sprites.slice(0, 3)) { put(it.s); it.s.visible = true; shown.push(it.s); }
    this.charge.shockRing(at, new THREE.Vector3(1, 0, 0), '#ffffff', 0.1, 0.2, 0.01, 0);
    this.charge.flash(at, 'glow', '#ffffff', 0.1, 0.01, 1);
    this.charge.trail({ kind: 'lance', team: 'p', level: 2 }, at);
    put(this.rings[0].m); show(this.rings[0].m); show(this.smokePts);
    const extra = [this.trails.warmShow(at), this.aegis.warmShow(at), ...this.beam.warmShow(at, camera.position), ...this.sub.warmShow(at, camera.position), ...this.ult.warmShow(at, camera.position)];
    for (const m of extra) { m.visible = true; }
    this.popText(0, 0, 'CRIT', '#ffffff', 0.01); for (const it of this.texts) { put(it.s); it.s.visible = true; }
    // Boss pieces that only appear mid-fight: a laser cylinder and the Stormcaller (its storm shield material)
    const bl = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 10, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false }));
    put(bl); this.scene.add(bl); keep.push(bl);
    const sr = buildEnemyRig({ type: 'stormcaller' }); sr.parts.shield.visible = true; put(sr.root); this.scene.add(sr.root); keep.push(sr.root);
    this.particle(at, '#ffffff', 0.2, 0.01); this.smoke(0, 0, '#888888', 1, 0, 0.2, 0.01);
    // Compile for the target the scene is really drawn into (the bloom chain renders offscreen in linear
    // colour without tone mapping, which is a different shader variant from drawing to the screen)
    try {
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(target); renderer.compile(this.scene, camera); renderer.render(this.scene, camera);
      if (target) { renderer.setRenderTarget(null); renderer.compile(this.scene, camera); }   // low quality draws straight to the screen
      renderer.setRenderTarget(prev);
    } catch (e) { /* warm-up is best effort */ }
    for (const q of shown) q.visible = false;
    for (const m of keep) this.scene.remove(m);
    this.trails.clearAll(); this.aegis.warmDone(); this.beam.warmDone(); this.sub.warmDone(); this.ult.warmDone(); for (const it of this.texts) { it.life = 0; it.s.visible = false; }
    g.life = 0; g.root.visible = false;
    // The stand-ins stay (hidden): disposing their materials would let the renderer drop the compiled
    // shaders again, and the first real effect would recompile them
    this.charge.state.delete(dummy); this.charge.warmState = S;
    for (const [pr, r] of this.charge.trails) { r.mesh.visible = false; this.charge.trails.delete(pr); }
    this.smokePts.visible = true;
  }

  // One particle at a world-space point; the caller sets its velocity (P.v), drag and gravity
  particle(v, color, size, life) {
    const P = this.parts[this.pi], idx = this.pi; this.pi = (this.pi + 1) % this.N;
    const c = typeof color === 'string' ? new THREE.Color(color) : color;
    this.pPos.set([v.x, v.y, v.z], idx * 3); this.pCol.set([c.r, c.g, c.b], idx * 3);
    P.life = P.max = life; P.size = size; P.drag = 0.9; P.grav = 0; P.v.set(0, 0, 0);
    return P;
  }
  // A flat shockwave ring on the ground at a sim point, growing from r0 to r1 m
  groundRing(x, y, color, r0, r1, life, opacity = 0.9) {
    const it = this.rings.find(q => q.life <= 0) || this.rings.reduce((a, b) => (a.life < b.life ? a : b));
    toWorld(x, y + 0.05, 0, it.m.position); it.m.material.color.set(color);
    Object.assign(it, { life, max: life, r0, r1, op: opacity }); it.m.scale.setScalar(r0); it.m.visible = true;
    return it;
  }
  updateRings(dt) {
    for (const it of this.rings) {
      if (it.life <= 0) { it.m.visible = false; continue; }
      it.life -= dt; const k = 1 - Math.max(0, it.life) / it.max, e = 1 - (1 - k) * (1 - k);
      it.m.scale.setScalar(it.r0 + (it.r1 - it.r0) * e); it.m.material.opacity = it.op * (1 - k);
    }
  }

  // ---- Ground dust ----
  // The floor under a sim point, if it is within `reach` m below; dust is drawn on the floor surface
  floorUnder(x, y, reach = 1.2) { const g = groundBelow(x, y + 0.25); return g > -Infinity && y - g <= reach ? g : null; }
  // Dust thrown along the floor: `dirs` are angles (0 = forward along +x, PI = back), strength 0-1+
  dust(x, y, strength = 0.5, dirs = [0, Math.PI], opts = {}) {
    const g = this.floorUnder(x, y, opts.reach ?? 1.2); if (g === null) return false;
    const k = strength;
    for (const dir of dirs) this.smoke(x, g + 0.12, opts.color || DUST, Math.max(1, Math.round(2 + 7 * k)), 1.5 + 6 * k, 0.4 + 0.35 * k, 0.45 + 0.35 * k,
      { dir: dir + (dir === Math.PI / 2 ? 0 : dir > Math.PI / 2 ? -0.12 : 0.12), spread: opts.spread ?? 0.45, drag: 0.88, grav: -0.35, grow: 2.2, op: opts.op ?? 0.5 });
    if (k >= 0.6 && !opts.noRing) this.groundRing(x, g, '#eef2f6', 0.3, 1 + 1.6 * k, 0.3, 0.55);
    return true;
  }
  // A few puffs swirling off the floor around the feet (charging on the ground)
  dustSwirl(x, y, k, color = DUST) {
    const g = this.floorUnder(x, y, 0.4); if (g === null) return;
    const side = Math.random() < 0.5 ? -1 : 1, d = 0.3 + Math.random() * 0.5;
    this.smoke(x + side * d, g + 0.1, color, 1, 1 + 2.5 * k, 0.3 + 0.25 * k, 0.5, { dir: side > 0 ? 0.25 : Math.PI - 0.25, spread: 0.6, grav: -0.8, grow: 2.2, op: 0.35 + 0.2 * k });
  }

  // ---- Particles and sprites ----
  burst(x, y, color, n = 10, speed = 5, size = 0.35, life = 0.35, opts = {}) {
    const c = new THREE.Color(color), w = toWorld(x, y, 0, this.tmp);
    for (let i = 0; i < n; i++) {
      const P = this.parts[this.pi]; const idx = this.pi; this.pi = (this.pi + 1) % this.N;
      const a = opts.dir !== undefined ? opts.dir + (Math.random() - 0.5) * (opts.spread || 1) : Math.random() * Math.PI * 2;
      const sp = speed * (0.4 + Math.random() * 0.8);
      planeDir(x, Math.cos(a) * sp, Math.sin(a) * sp, P.v);
      const f = pathFrame(x); P.v.x += f.nx * (Math.random() - 0.5) * sp * 0.4; P.v.z += f.nz * (Math.random() - 0.5) * sp * 0.4;
      this.pPos.set([w.x, w.y, w.z], idx * 3); this.pCol.set([c.r, c.g, c.b], idx * 3);
      P.life = P.max = life * (0.7 + Math.random() * 0.6); P.size = size * (0.6 + Math.random() * 0.8);
      P.drag = opts.drag ?? 0.9; P.grav = opts.grav ?? 0;
    }
  }
  sprite(x, y, tex, color, size, life, grow = 1.6, depth = 0.3, sx = 1, rot = 0) {
    const it = this.sprites.find(q => q.life <= 0) || this.sprites.reduce((a, b) => (a.life < b.life ? a : b));
    if (it.normal) { it.s.material.blending = THREE.AdditiveBlending; it.normal = false; }
    it.s.material.map = this.tex[tex]; it.s.material.color.set(color); it.s.material.rotation = rot; it.s.material.needsUpdate = true;
    toWorld(x, y, depth, it.s.position); it.life = it.max = life; it.grow = grow; it.base = size; it.sx = sx; it.s.visible = true;
    return it;
  }
  // A slash mark: a long thin glint across a hit, at an angle
  slashMark(x, y, color, len, rot, life = 0.14) { this.sprite(x, y, 'star', color, len * 0.55, life, 1.25, 0.45, 2.6, rot); }
  // Floating words over a hit ("CRIT"): drawn once per word, normal blending so they read on bright skies
  popText(x, y, text, color, life = 0.7) {
    const key = text; this.textTex = this.textTex || {};
    const tex = this.textTex[key] || (this.textTex[key] = canvasTex(256, (g, s) => {
      g.font = `italic 900 ${Math.round(s * 0.34)}px "Arial Black", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = s * 0.05; g.strokeStyle = 'rgba(12,16,26,0.95)'; g.strokeText(text, s / 2, s / 2);
      g.fillStyle = '#ffffff'; g.fillText(text, s / 2, s / 2);
    }));
    let it = this.texts.find(q => q.life <= 0);
    if (!it) {
      if (this.texts.length < 8) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false })); sp.renderOrder = 11; this.scene.add(sp); it = { s: sp, life: 0 }; this.texts.push(it); }
      else it = this.texts.reduce((a, b) => (a.life < b.life ? a : b));
    }
    it.s.material.map = tex; it.s.material.color.set(color); it.s.material.needsUpdate = true;
    it.x = x; it.y = y; it.life = it.max = life; it.s.visible = true;
  }
  updateTexts(dt) {
    for (const it of this.texts) {
      if (it.life <= 0) { it.s.visible = false; continue; }
      it.life -= dt; const k = 1 - Math.max(0, it.life) / it.max;
      toWorld(it.x, it.y + k * 0.6, 0.6, it.s.position);
      const pop = k < 0.12 ? 0.6 + 4 * k : 1.08 - 0.08 * Math.min(1, (k - 0.12) * 4);
      it.s.scale.set(1.6 * pop, 1.6 * pop, 1); it.s.material.opacity = Math.min(1, Math.max(0, it.life) / 0.2);
    }
  }
  // Particles at a world-space point, drifting upward (embers)
  burstAt(v, color, n = 1, speed = 1, size = 0.2, life = 0.3) {
    const c = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      const P = this.parts[this.pi]; const idx = this.pi; this.pi = (this.pi + 1) % this.N;
      P.v.set((Math.random() - 0.5) * speed, Math.random() * speed, (Math.random() - 0.5) * speed);
      this.pPos.set([v.x, v.y, v.z], idx * 3); this.pCol.set([c.r, c.g, c.b], idx * 3);
      P.life = P.max = life * (0.7 + Math.random() * 0.6); P.size = size * (0.6 + Math.random() * 0.8); P.drag = 0.9; P.grav = -1.5;
    }
  }
  glyph(e, ch, color, life = 0.9) {
    const tex = this.glyphTex[ch] || (this.glyphTex[ch] = canvasTex(128, (g, s) => {
      g.font = `900 ${Math.round(s * 0.8)}px "Arial Black", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = s * 0.12; g.strokeStyle = 'rgba(12,16,26,0.92)'; g.strokeText(ch, s / 2, s * 0.54);
      g.fillStyle = '#ffffff'; g.fillText(ch, s / 2, s * 0.54);
    }));
    const it = this.glyphs.find(q => q.e === e && q.life > 0) || this.glyphs.find(q => q.life <= 0) || this.glyphs[0];
    it.s.material.map = tex; it.s.material.color.set(color); it.s.material.needsUpdate = true;
    it.e = e; it.life = it.max = life; it.s.visible = true;
  }
  updateGlyphs(dt) {
    for (const it of this.glyphs) {
      if (it.life <= 0) { it.s.visible = false; continue; }
      it.life -= dt;
      const e = it.e; if (!e || e.dead) { it.life = 0; continue; }
      const k = 1 - Math.max(0, it.life) / it.max;
      toWorld(e.x, e.y + e.h + 0.6 + k * 0.25, 0.4, it.s.position);
      const sc = 0.8 * Math.min(1, k / 0.12); it.s.scale.set(sc, sc, 1);
      it.s.material.opacity = Math.min(1, Math.max(0, it.life) / 0.25);
    }
  }

  // ---- Event reactions ----
  onEvent(ev, world) {
    const pc = ev.p ? CHARS[ev.p.char].energy : '#ffffff', pal = fxPal(ev.p || (ev.owner && ev.owner.kind === 'player' ? ev.owner : null));
    switch (ev.type) {
      case 'hit': {
        const col = ev.owner && ev.owner.kind === 'player' ? CHARS[ev.owner.char].energy : '#ffffff', d = ev.dmg || 1;
        this.burst(ev.x, ev.y, col, (ev.heavy ? 18 : 9) + Math.min(14, d * 2), (ev.heavy ? 9 : 6) + Math.min(5, d * 0.5), ev.heavy ? 0.5 : 0.35, 0.3);
        if (ev.heavy || d >= 4) this.sprite(ev.x, ev.y, 'ring', col, 0.6 + Math.min(1, d * 0.1), 0.22, 3);
        if (ev.tier) this.sprite(ev.x, ev.y, 'ring', '#ffffff', 1 + ev.tier * 0.5, 0.25, 3.5);
        // Echo's blades and glaive leave a slash mark across what they cut; Nova's fists a hard-light flash
        const o = ev.owner;
        if (o && o.kind === 'player' && ev.source === 'melee') {
          const P = fxPal(o);
          if (o.arch === 'echo') {
            const ds = o.state === 'dashslash' && o.slash, rot = ds ? Math.atan2(ds.dy, ds.dx) : (Math.random() - 0.5) * 1.2 + (Math.random() < 0.5 ? 0 : 0.5);
            if (kitOf(o).fire === 'drill') {
              // Three parallel claw marks across what he cuts
              const nx = -Math.sin(rot) * 0.22, ny = Math.cos(rot) * 0.22;
              for (const k of [-1, 0, 1]) this.slashMark(ev.x + nx * k, ev.y + ny * k, k ? P.soft : P.hot, 1.1 + Math.min(1.2, d * 0.16), rot, ds ? 0.2 : 0.15);
            } else this.slashMark(ev.x, ev.y, P.hot, 1.2 + Math.min(1.4, d * 0.18), rot, ds ? 0.2 : 0.14);
            if (d >= 4) this.slashMark(ev.x, ev.y, col, 1.6 + d * 0.12, rot + 1.2, 0.16);
          } else this.sprite(ev.x, ev.y, 'star', P.hot, 0.7 + Math.min(1, d * 0.15), 0.12, 1.5);
        }
        break;
      }
      case 'blocked': this.burst(ev.x, ev.y, '#cfe8ff', 8, 6, 0.3, 0.25); this.sprite(ev.x, ev.y, 'star', '#dff2ff', 0.6, 0.15, 1.2); break;
      case 'guardBreak': this.burst(ev.x, ev.y, '#ffffff', 22, 10, 0.5, 0.45); this.sprite(ev.x, ev.y, 'ring', '#ffffff', 1.2, 0.3, 3); break;
      case 'armorBreak': this.burst(ev.x, ev.y + 0.4, '#e6e9f0', 26, 11, 0.55, 0.6, { grav: 14 }); this.sprite(ev.x, ev.y, 'ring', HOSTILE, 1.5, 0.35, 3); break;
      case 'armorHit': this.burst(ev.x, ev.y, '#b9c3d6', 5, 4, 0.25, 0.2); break;
      case 'stagger': this.sprite(ev.x, ev.y + 0.6, 'star', '#fff4c2', 0.9, 0.5, 1.4); this.burst(ev.x, ev.y + 0.5, '#fff4c2', 12, 4, 0.3, 0.6); break;
      case 'kill':
        this.burst(ev.x, ev.y, HOSTILE, 24, 9, 0.45, 0.55, { grav: 6 }); this.burst(ev.x, ev.y, '#ffffff', 10, 5, 0.3, 0.3);
        if (ev.e && !ev.e.flier) this.dust(ev.e.x, ev.e.y, ev.e.type === 'brute' || ev.e.boss ? 0.9 : 0.3);
        break;
      case 'parry': {
        const col = ev.perfect ? '#fff6d8' : '#cfe8ff';
        this.sprite(ev.x, ev.y, 'ring', col, ev.perfect ? 1.4 : 0.9, ev.perfect ? 0.3 : 0.2, ev.perfect ? 3.2 : 2.2);
        this.sprite(ev.x, ev.y, 'star', col, ev.perfect ? 1.6 : 0.9, 0.25, 1.3);
        this.burst(ev.x, ev.y, ev.perfect ? pc : '#cfe8ff', ev.perfect ? 22 : 10, ev.perfect ? 10 : 6, 0.4, 0.35);
        break;
      }
      case 'parryFail': this.burst(ev.x, ev.y, HOSTILE, 10, 5, 0.3, 0.3); break;
      case 'playerHit': this.burst(ev.x, ev.y, '#ffffff', 10, 6, 0.35, 0.25); break;
      case 'intercept': this.burst(ev.x, ev.y, '#ffd28a', 16, 8, 0.4, 0.3); this.sprite(ev.x, ev.y, 'star', '#ffe7b5', 0.9, 0.18, 1.5); break;
      case 'interceptFail': this.burst(ev.x, ev.y, '#ffd28a', 5, 4, 0.2, 0.15); break;
      case 'barrierBlock': this.burst(ev.x, ev.y, '#ffd28a', 12, 6, 0.35, 0.3); break;
      case 'erase': this.burst(ev.x, ev.y, '#ffe2a8', 8, 5, 0.3, 0.25); break;
      case 'amplify': this.sprite(ev.x, ev.y, 'ring', '#ffe2a8', 0.5, 0.15, 2); break;
      case 'bulwark': {
        this.sprite(ev.x + ev.ax * 1.2, ev.y + ev.ay * 1.2, 'ring', pal.energy, 1.4, 0.3, 3);
        this.burst(ev.x + ev.ax * 1.5, ev.y + ev.ay * 1.5, pal.energy, 26, 10, 0.4, 0.35, { dir: Math.atan2(ev.ay, ev.ax), spread: 1.6 });
        break;
      }
      case 'boost': this.sprite(ev.x, ev.y, 'ring', '#ffe2a8', 1.2, 0.25, 2.5); this.burst(ev.x, ev.y, '#ffe2a8', 14, 8, 0.35, 0.3); break;
      case 'vbStart': this.burst(ev.p.x, ev.p.y + 0.8, pc, 6 + ev.tier * 6, 4 + ev.tier * 3, 0.35, 0.25); break;
      case 'lashPull': case 'lashZip': this.burst(ev.e.x, ev.e.y + ev.e.h / 2, pc, 14, 6, 0.35, 0.3); break;
      case 'tag': this.sprite(ev.x, ev.y + 0.3, 'star', '#ffb347', 0.7, 0.4, 1.2); break;
      case 'land':
        if (!ev.p) break;
        if (ev.p.state === 'pound') break;   // the pound has its own landing
        if (ev.vy < -16) {   // a hard landing (after a rocket jump or a long fall) kicks up a ring of dust
          const k = Math.min(1, (-ev.vy - 16) / 12);
          this.groundRing(ev.p.x, ev.p.y, '#e6ecf2', 0.4, 1.4 + k, 0.3, 0.6);
          this.dust(ev.p.x, ev.p.y, 0.45 + 0.45 * k, [Math.PI, 0], { noRing: true });
        } else this.dust(ev.p.x, ev.p.y, Math.min(0.35, 0.08 + -ev.vy * 0.018), [Math.PI, 0], { noRing: true, op: 0.4 });
        break;
      case 'jump': case 'djump': if (ev.p) this.burst(ev.p.x, ev.p.y + 0.1, '#e8eef5', 5, 2.5, 0.3, 0.25, { dir: -Math.PI / 2, spread: 2 }); break;
      case 'walljump': {
        // Kick-off puff where the boot left the wall; Nova's skate blades throw sparks
        const wx = ev.p.x - ev.dir * ev.p.w / 2;
        this.smoke(wx, ev.p.y + 0.3, '#a3abb5', ev.climb ? 4 : 6, 2.5, 0.35, 0.4, { dir: ev.dir > 0 ? 0 : Math.PI, spread: 1.6, op: 0.5 });
        if (ev.p.arch === 'nova' && kitOf(ev.p).skate) this.burst(wx, ev.p.y + 0.1, pal.soft, 8, 5, 0.16, 0.25, { dir: ev.dir > 0 ? -0.6 : Math.PI + 0.6, spread: 1, grav: 8 });
        this.sprite(wx, ev.p.y + 0.5, 'ring', '#ffffff', 0.35, 0.14, 2.4);
        break;
      }
      case 'wallSlide': if (ev.on) this.burst(ev.p.x + ev.dir * ev.p.w / 2, ev.p.y + ev.p.h * 0.8, '#e8eef5', 6, 2, 0.3, 0.3); break;
      case 'dash': {
        if (!ev.p) break;
        const L = ev.level || 0, a = Math.atan2(ev.dy || 0, ev.dx || ev.p.facing);
        if (ev.p.onGround || ev.p.y - ev.p.lastSafeY < 0.2) this.dust(ev.p.x, ev.p.y, 0.3 + 0.2 * L, [a + Math.PI], { noRing: L < 2 });
        if (!L) { this.burst(ev.p.x, ev.p.y + 0.9, pc, 10, 4, 0.3, 0.25); break; }
        // A charged dash bursts away: a ring behind, streaks thrown back, a ground ring; level 3 flashes
        const col = new THREE.Color(pc).lerp(new THREE.Color('#ffffff'), L >= 3 ? 0.55 : L * 0.15);
        this.sprite(ev.p.x, ev.p.y + 0.9, 'ring', col, 0.6 + L * 0.2, 0.18 + L * 0.03, 2.2);
        this.smoke(ev.p.x, ev.p.y + 0.15, '#9aa3ae', 4 + L * 3, 3 + L, 0.4, 0.45, { dir: a + Math.PI, spread: 0.8, op: 0.45 });
        this.burst(ev.p.x, ev.p.y + 0.9, col, 12 + L * 8, 8 + L * 3, 0.32, 0.3, { dir: a + Math.PI, spread: 1.1 });
        if (ev.p.onGround || ev.p.y - ev.p.lastSafeY < 0.2) this.groundRing(ev.p.x, ev.p.y, col, 0.3, 1.2 + L * 0.5, 0.3, 0.8);
        if (L >= 3) this.sprite(ev.p.x, ev.p.y + 0.9, 'star', '#ffffff', 1.6, 0.16, 1.5);
        break;
      }
      case 'dashChargeStart': break;
      case 'dashLevel': this.charge.levelUp(ev.p, this.rigs.get(ev.p), ev.level, 'dash'); break;
      case 'rifleRaise': this.charge.levelUp(ev.p, this.rigs.get(ev.p), 1, 'rifle'); break;
      case 'rifleFocus': this.charge.levelUp(ev.p, this.rigs.get(ev.p), 3, 'rifle'); break;
      case 'snipe': this.snipe(ev); break;
      case 'crit': this.popText(ev.x, ev.y + 0.5, 'CRIT', '#ffd27a', 0.75); this.sprite(ev.x, ev.y, 'star', '#ffffff', 1.5, 0.16, 1.5); break;
      case 'deflect': {
        // The staff knocks the shot back: a sharp spark flash, a ring, and sparks along its new path
        const c = ev.perfect ? pal.hot : pal.energy;
        this.sprite(ev.x, ev.y, 'star', '#ffffff', ev.perfect ? 1.8 : 1.1, 0.14, 1.4);
        this.sprite(ev.x, ev.y, 'ring', c, ev.perfect ? 1.1 : 0.7, 0.22, 2.8);
        this.burst(ev.x, ev.y, c, ev.perfect ? 24 : 14, ev.perfect ? 11 : 8, 0.26, 0.28, { grav: 6 });
        this.slashMark(ev.x, ev.y, '#ffffff', ev.perfect ? 1.8 : 1.2, (Math.random() - 0.5) * 1.4, 0.12);
        break;
      }
      case 'dashSlash': {
        const p = ev.p, a = Math.atan2(ev.dy, ev.dx), col = ev.tier >= 3 ? pal.hot : pal.energy;
        this.slashes.set(p, { x0: p.x, y0: p.y + 0.95, tier: ev.tier, drawn: false });
        this.sprite(p.x, p.y + 0.9, 'ring', col, 0.6 + ev.tier * 0.15, 0.18, 2.4);
        this.burst(p.x, p.y + 0.9, col, 10 + ev.tier * 6, 8 + ev.tier * 2, 0.3, 0.25, { dir: a + Math.PI, spread: 1 });
        if (p.onGround) this.smoke(p.x, p.y + 0.15, '#9aa3ae', 3 + ev.tier * 2, 3 + ev.tier, 0.4, 0.4, { dir: a + Math.PI, spread: 0.7, op: 0.45 });
        break;
      }
      case 'crescent': {
        const p = ev.p;
        this.sprite(ev.x, ev.y, 'star', '#ffffff', 1.5, 0.14, 1.4); this.sprite(ev.x, ev.y, 'ring', pal.energy, 0.9, 0.2, 2.6);
        this.burst(ev.x, ev.y, pal.energy, 18, 9, 0.3, 0.3, { dir: p.facing > 0 ? 0 : Math.PI, spread: 1.2 });
        break;
      }

      case 'pogo': {
        const p = ev.p;
        this.sprite(p.x, p.y, 'ring', pal.hot, 0.9, 0.2, 2.6); this.sprite(p.x, p.y + 0.9, 'ring', pal.energy, 0.7, 0.25, 2.4);
        this.burst(p.x, p.y - 0.1, pal.energy, 16, 8, 0.28, 0.25, { dir: -Math.PI / 2, spread: 1.6 });
        break;
      }
      case 'swing':
        // Echo's whirling glaive moves: a spinning ring of wind around him as they start
        if (ev.id === 'echo_spin' || ev.id === 'echo_rise') { this.sprite(ev.p.x, ev.p.y + 1, 'ring', '#fff1d6', 1.3, 0.3, 1.8); this.burst(ev.p.x, ev.p.y + 1, '#e8eef5', 12, 6, 0.3, 0.35); }
        if (ev.id === 'echo_rise') this.dust(ev.p.x, ev.p.y, 0.55);
        if (ev.id === 'nova_k3' || ev.id === 'echo_charged' || ev.id === 'echo_b4') this.dust(ev.p.x, ev.p.y, 0.25, [ev.p.facing > 0 ? Math.PI : 0], { noRing: true });
        break;
      // Ground pound
      case 'poundStart': {
        // The air brakes: a burst of wind and a ring around him as he stops dead
        const p = ev.p, c = CHARS[p.char].energy;
        this.sprite(p.x, p.y + 1, 'ring', '#ffffff', 1.1, 0.25, 2.2); this.sprite(p.x, p.y + 1, 'ring', c, 0.7, 0.35, 2.8);
        this.burst(p.x, p.y + 1, '#e8eef5', 14, 5, 0.3, 0.3);
        this.poundT.set(p, 0);
        break;
      }
      case 'poundLevel': this.charge.levelUp(ev.p, this.rigs.get(ev.p), ev.level, 'pound'); break;
      case 'poundDrop': {
        const p = ev.p, c = CHARS[p.char].energy;
        this.sprite(p.x, p.y + 1, 'star', '#ffffff', 1 + 0.3 * ev.level, 0.12, 1.4);
        this.burst(p.x, p.y + 1.4, c, 12 + 6 * ev.level, 6, 0.28, 0.25, { dir: Math.PI / 2, spread: 1.2 });
        break;
      }
      case 'poundLand': this.poundLand(ev); break;
      // Bosses
      case 'bossSlam': {
        const k = ev.big ? 1 : 0.6;
        this.dust(ev.x, ev.y, 0.7 + 0.5 * k, [0, Math.PI], { noRing: true, spread: 0.3 });
        this.groundRing(ev.x, ev.y, '#ffffff', 0.4, 2.5 + 2.5 * k, 0.35, 0.8); this.groundRing(ev.x, ev.y, HOSTILE, 0.3, 1.8 + 2 * k, 0.3, 0.9);
        this.burst(ev.x, ev.y + 0.2, '#5d6674', 10 + 10 * k, 8, 0.32, 0.6, { dir: Math.PI / 2, spread: 2, grav: 18 });
        this.sprite(ev.x, ev.y + 0.3, 'star', '#ffd2e4', 1.4 + k, 0.16, 1.4);
        break;
      }
      case 'bossPhase': {
        // The roar: rings of force burst off it, and it flares
        const c = { x: ev.x, y: ev.y };
        for (const [sz, life, col] of [[1.6, 0.35, '#ffffff'], [2.6, 0.5, HOSTILE], [3.6, 0.65, '#ffd2e4']]) this.sprite(c.x, c.y, 'ring', col, sz, life, 3.2);
        this.sprite(c.x, c.y, 'star', '#ffffff', 3.2, 0.2, 1.5); this.fireball(c.x, c.y, '#ff5aa0', 2, 0.3);
        this.burst(c.x, c.y, HOSTILE, 40, 12, 0.4, 0.5); this.burst(c.x, c.y, '#ffffff', 16, 8, 0.3, 0.3);
        if (!ev.e.flier) this.dust(ev.e.x, ev.e.y, 1.2);
        break;
      }
      case 'bossDazed': case 'bossCrash': {
        const e = ev.e;
        this.sprite(e.x, e.y + e.h + 0.3, 'star', '#fff4c2', 1.2, 0.5, 1.4); this.burst(e.x, e.y + e.h * 0.6, '#fff4c2', 16, 5, 0.3, 0.5);
        if (ev.type === 'bossCrash') { this.dust(e.x, e.y, ev.parried ? 1.2 : 0.9); this.burst(e.x, e.y + 0.3, '#5d6674', 14, 8, 0.3, 0.6, { dir: Math.PI / 2, spread: 2, grav: 18 }); this.sprite(e.x, e.y + 0.4, 'star', '#ffffff', 2.2, 0.16, 1.5); }
        break;
      }
      case 'bossMissiles': { const e = ev.e; this.burst(e.x - e.facing * 0.6, e.y + e.h + 0.2, HOSTILE, 14, 5, 0.3, 0.3, { dir: Math.PI / 2, spread: 1 }); this.smoke(e.x - e.facing * 0.6, e.y + e.h + 0.2, '#8e97a3', 5, 1.5, 0.5, 0.7, { dir: Math.PI / 2, spread: 1.2, op: 0.45 }); break; }
      case 'bossLaser': {
        const e = ev.e;
        if (e.type === 'warden') {
          // Juggernaut's thunderclap: a white flash and a burst ring where his hands meet
          const hx = e.x + e.facing * 1.7, hy = e.y + (ev.high ? 1.35 : 0.55);
          this.sprite(hx, hy, 'glow', '#ffffff', 2.6, 0.22, 2.4); this.sprite(hx, hy, 'star', '#ffe1ee', 2.2, 0.18, 1.8);
          this.charge.shockRing(toWorld(hx, hy, 0.2, new THREE.Vector3()), new THREE.Vector3(0, 0, 1), '#ffffff', 0.3, 2.6, 0.32, 0);
          this.burst(hx, hy, '#ffffff', 16, 9, 0.25, 0.25, { spread: Math.PI * 2 });
        } else this.sprite(e.x + e.facing * 0.75, e.y + 1.25, 'star', '#ffffff', 1.6, 0.16, 1.4);
        break;
      }
      case 'bossDive': { const e = ev.e; this.sprite(e.x, e.y + 0.7, 'ring', HOSTILE, 2, 0.25, 2.4); break; }
      case 'bossCall': { const e = ev.e; for (const d of [-4, 4]) { this.sprite(e.x + d, e.y + 1.5, 'ring', HOSTILE, 1.2, 0.35, 2.4); this.burst(e.x + d, e.y + 1.5, HOSTILE, 14, 5, 0.3, 0.35); } break; }
      case 'bossDown': this.bossExplosion(ev); break;
      case 'shot':
        if (ev.level > 0 && ev.p) this.charge.release(ev, ev.p, this.rigs.get(ev.p));
        break;
      case 'downed': this.burst(ev.p.x, ev.p.y + 0.4, '#ffffff', 16, 5, 0.35, 0.5); break;
      case 'revived': this.sprite(ev.p.x, ev.p.y + 1, 'ring', '#9cf5c8', 1.2, 0.4, 2.5); this.burst(ev.p.x, ev.p.y + 1, '#9cf5c8', 18, 5, 0.35, 0.5); break;
      case 'recall': case 'respawn': case 'join': if (ev.p) { this.sprite(ev.p.x, ev.p.y + 1, 'ring', '#bfe9ff', 1.1, 0.35, 2.4); this.burst(ev.p.x, ev.p.y + 1, '#bfe9ff', 16, 4, 0.3, 0.5); } break;
      case 'slam': this.burst(ev.e.x, ev.e.y + 0.2, HOSTILE, 24, 9, 0.5, 0.45, { dir: Math.PI / 2, spread: 3 }); this.dust(ev.e.x, ev.e.y, 0.9); break;
      case 'telegraph': this.telegraphs.push({ e: ev.e, cat: ev.cat, ticks: ev.ticks, t: 0 }); break;
      case 'lock': this.sprite(ev.e.x + ev.e.facing * 1.3, ev.e.y + 1.35, 'star', '#ffffff', 0.9, 0.2, 1.3); break;
      case 'snareThrow': this.burst(ev.x, ev.y, pal.energy, 6, 3, 0.25, 0.2); break;
      case 'snarePlant': this.sprite(ev.x, ev.y + 0.1, 'ring', pal.energy, 0.9, 0.3, 2); break;
      case 'snareTrigger': { const c = fxPal(ev.owner).energy; this.sprite(ev.x, ev.y + 0.3, 'ring', c, 1.4, 0.3, 2.6); this.burst(ev.x, ev.y + 0.3, c, 20, 7, 0.35, 0.35); break; }
      case 'snared': this.burst(ev.x, ev.y, pal.energy, ev.weak ? 6 : 14, 5, 0.3, 0.35); break;
      case 'leash': this.sprite(ev.e.x, ev.e.y + ev.e.h / 2, 'ring', pal.energy, 0.8, 0.25, 2); break;
      case 'yank': this.burst(ev.e.x, ev.e.y + ev.e.h / 2, pal.energy, 18, 8, 0.4, 0.35); this.sprite(ev.e.x, ev.e.y + ev.e.h / 2, 'ring', '#ffffff', 1.3, 0.25, 2.8); break;
      // Scarf modes
      case 'scarfMode': this.burst(ev.p.x, ev.p.y + 1.4, ev.mode === 'veil' ? VEIL_PALE : pal.energy, ev.mode === 'flare' ? 18 : 12, 3, 0.3, 0.3); break;
      case 'veilOn': this.burst(ev.p.x, ev.p.y + 1, VEIL_PALE, 14, 2.5, 0.35, 0.45); break;
      case 'veilBreak': if (ev.wasHidden) this.burst(ev.p.x, ev.p.y + 1, VEIL_PALE, 12, 5, 0.3, 0.3); break;
      case 'vanish': this.sprite(ev.p.x, ev.p.y + 1, 'ring', VEIL_PALE, 1.2, 0.3, 2.4); this.burst(ev.p.x, ev.p.y + 1, VEIL_PALE, 20, 6, 0.35, 0.4); break;
      case 'ambush': this.sprite(ev.x, ev.y, 'star', '#ffffff', 2.0, 0.28, 1.6); this.burst(ev.x, ev.y, pal.energy, 26, 10, 0.45, 0.45); break;
      case 'challenge': this.sprite(ev.x, ev.y, 'ring', pal.energy, 2.2, 0.45, 4.2); this.burst(ev.x, ev.y, pal.energy, 30, 9, 0.4, 0.45); break;
      case 'lostTrack': this.glyph(ev.e, '?', '#ffffff', 1.0); break;
      case 'taunted': this.glyph(ev.e, '!', fxPal(ev.e.taunter).energy, 0.9); break;
      // Nova, Marksman kit
      case 'attach': {
        const c = attachLook(ev.p, ev.attach).tint, x = ev.p.x + ev.p.facing * 0.35, y = ev.p.y + 1.05;
        this.sprite(x, y, 'ring', c, 0.5, 0.2, 2); this.burst(x, y, c, 6, 2.5, 0.25, 0.25);
        break;
      }
      case 'chargeLevel': case 'burstLevel':
        if (ev.p.arch === 'nova') this.charge.levelUp(ev.p, this.rigs.get(ev.p), ev.level, ev.type === 'burstLevel' ? 'burst' : 'shot');
        break;
      case 'splash': if (ev.r > 1.2) this.dust(ev.x, ev.y, 0.15 + 0.1 * (ev.level || 0), [0, Math.PI], { reach: ev.r * 0.6, noRing: true });
        this.sprite(ev.x, ev.y, 'ring', pal.energy, 0.35 + ev.r * 0.7, 0.2, 2.2);
        this.burst(ev.x, ev.y, pal.energy, 5 + Math.round(ev.r * 6), 3 + ev.r * 3, 0.28, 0.25, { grav: 5 });
        break;
      case 'rocketJump': this.rocketBlast(ev); break;
      case 'mortarShot': this.addLandingMark(ev.x, ev.y, ev.r, ev.ticks / 60); break;
      case 'enemyBlast': this.dust(ev.x, ev.y, 0.8, [0, Math.PI], { reach: 1.5 });
        this.sprite(ev.x, ev.y + 0.3, 'ring', HOSTILE, ev.r * 1.1, 0.3, 2.4); this.sprite(ev.x, ev.y + 0.3, 'star', '#ffd2e4', ev.r, 0.2, 1.3);
        this.burst(ev.x, ev.y + 0.3, HOSTILE, 26, 9, 0.45, 0.45, { grav: 7 }); this.burst(ev.x, ev.y + 0.3, '#ffffff', 8, 5, 0.3, 0.25);
        break;
      case 'chargeStart': this.burst(ev.e.x - ev.e.facing * 0.7, ev.e.y + 0.2, '#c9d3de', 12, 4, 0.4, 0.4, { dir: Math.PI / 2, spread: 1.6 }); break;
      case 'chargeCrash': this.dust(ev.e.x + ev.e.facing * 0.8, ev.e.y, 0.6, [ev.e.facing > 0 ? Math.PI : 0]);
        this.sprite(ev.e.x + ev.e.facing * 0.8, ev.e.y + 0.9, 'star', '#ffffff', 1.6, 0.25, 1.5);
        this.burst(ev.e.x + ev.e.facing * 0.8, ev.e.y + 0.9, '#e6e9f0', 20, 8, 0.4, 0.45, { grav: 10 });
        break;
      case 'perfectRelease':
        this.sprite(ev.x, ev.y, 'star', '#ffffff', 1.8, 0.22, 1.5); this.sprite(ev.x, ev.y, 'ring', pal.energy, 1.0, 0.3, 3);
        this.burst(ev.x, ev.y, pal.hot, 14, 7, 0.35, 0.3);
        break;
      case 'blast': {
        this.dust(ev.x, ev.y, 0.35 + 0.15 * (ev.level || 1), [0, Math.PI], { reach: 1 + (ev.r || 1) * 0.6 });
        const c = ev.p && ev.p.kind === 'player' ? attachLook(ev.p, 'arc').tint : ATTACH_LOOK.arc.tint;
        this.sprite(ev.x, ev.y, 'ring', c, ev.r * 0.9, 0.3, 2.4); this.sprite(ev.x, ev.y, 'star', pal.hot, ev.r * 0.8, 0.18, 1.3);
        this.burst(ev.x, ev.y, c, 22 + ev.level * 6, 7 + ev.r * 2, 0.45, 0.4, { grav: 6 }); this.burst(ev.x, ev.y, '#ffffff', 8, 4, 0.3, 0.25);
        break;
      }
      case 'split': { const c = ev.p ? attachLook(ev.p, 'prism').tint : ATTACH_LOOK.prism.tint; this.sprite(ev.x, ev.y, 'star', c, 1.1, 0.18, 1.4); this.burst(ev.x, ev.y, c, 10, 6, 0.3, 0.25); break; }
      case 'ricochet': { const o = ev.pr && ev.pr.owner; this.burst(ev.x, ev.y, o && o.kind === 'player' ? fxPal(o).energy : ATTACH_LOOK.prism.tint, 4, 4, 0.22, 0.18); break; }
      case 'burst':
        this.burst(ev.x, ev.y, subLook(ev.p, 'scatter').tint, ev.charged ? 22 : 14, ev.charged ? 14 : 11, 0.32, 0.16, { dir: Math.atan2(ev.ay, ev.ax), spread: ev.charged ? 0.9 : 0.7 });
        this.sprite(ev.x, ev.y, 'ring', pal.energy, ev.charged ? 0.8 : 0.5, 0.14, 2.2);
        break;
      case 'carve': this.dust(ev.p.x, ev.p.y, 0.25, [ev.p.vx > 0 ? 0 : Math.PI], { noRing: true }); this.burst(ev.p.x + Math.sign(ev.p.vx) * 0.2, ev.p.y + 0.05, pal.soft, 8, 4, 0.22, 0.25, { dir: ev.p.vx > 0 ? 0.5 : Math.PI - 0.5, spread: 0.9, grav: 8 }); break;
      case 'focusUp': this.sprite(ev.p.x, ev.p.y + ev.p.h + 0.35, 'star', pal.energy, 0.45 + ev.level * 0.08, 0.3, 1.3); break;
      case 'focusLost': this.burst(ev.p.x, ev.p.y + 1.2, '#9aa6b8', 8, 3, 0.25, 0.3); break;
      // Nova: the hard-light Aegis and the Level 4 beam
      case 'aegisOn': case 'aegisHit': case 'aegisOff': this.aegis.onEvent(ev); break;
      case 'beamStart': {
        this.beam.onEvent(ev);
        const p = ev.p, rig = this.rigs.get(p);
        this.charge.release({ level: 4, attach: ev.attach, perfect: true, ax: p.aimX, ay: p.aimY, beam: true }, p, rig);
        this.fireball(p.x + p.aimX * 0.8, p.y + p.h * (kitOf(p).eyes ? 0.9 : 0.62) + p.aimY * 0.8, pal.energy, 1.4, 0.2);
        break;
      }
      // Version 9: secondary weapons, the dodge, the Solar Uppercut, and the ultimates
      case 'subSwitch': case 'grenadeThrow': case 'bounce': case 'frag': case 'cluster': case 'chain': case 'discThrow': case 'discRecall': case 'discCatch':
      case 'discFade': case 'wellLaunch': case 'wellOpen': case 'wellCollapse': case 'dodge': case 'perfectDodge': case 'riseBlast':
        this.sub.onEvent(ev); break;
      case 'ultCast': case 'ultJoin': case 'ultRun': case 'ultBegin': case 'ultNova': case 'ultCut': case 'ultFinisher': case 'ultEnd': case 'teamFinisher':
        this.ult.onEvent(ev); break;
      // The X-Men's Signatures
      case 'visor': {
        // Visor Overdrive: a red flare off the visor, a ring of concussive force, a streak of light across his eyes
        const p = ev.p;
        this.sprite(ev.x, ev.y, 'star', '#ffffff', 1.6, 0.16, 1.4); this.slashMark(ev.x, ev.y, pal.energy, 4.2, 0, 0.22); this.slashMark(ev.x, ev.y, pal.hot, 2.6, 0, 0.16);
        this.sprite(p.x, p.y + 1, 'ring', pal.energy, ev.r * 0.9, 0.3, 3); this.groundRing(p.x, p.y, pal.energy, 0.4, ev.r + 0.6, 0.35, 0.8);
        this.burst(p.x, p.y + 1, pal.energy, 34, 11, 0.36, 0.4); this.burst(ev.x, ev.y, pal.hot, 12, 6, 0.24, 0.25);
        this.dust(p.x, p.y, 0.5, [0, Math.PI], { noRing: true });
        break;
      }
      case 'squall': {
        // Squall: rings of wind blow outward, a swirl of white and blue around her, dust kicked off the floor
        for (const [sz, life] of [[1.2, 0.3], [ev.r * 0.9, 0.4], [ev.r * 1.25, 0.5]]) this.sprite(ev.x, ev.y, 'ring', pal.soft, sz, life, 2.6);
        for (let i = 0; i < 3; i++) this.burst(ev.x, ev.y, i ? pal.energy : '#ffffff', 22, 13, 0.3, 0.45, { drag: 0.86 });
        this.smoke(ev.x, ev.y, '#d9e6f2', 12, 6, 0.7, 0.6, { op: 0.35, grow: 2.4, drag: 0.85, grav: 0 });
        this.dust(ev.x, ev.p.y, 0.8, [0, Math.PI], { reach: 2.5 });
        break;
      }
      case 'berserk': {
        const p = ev.p;
        this.popText(p.x, p.y + p.h + 0.5, 'BERSERK', '#ffcf3a', 0.9);
        this.sprite(p.x, p.y + 1, 'ring', '#ff6a2a', 1.6, 0.35, 3); this.sprite(p.x, p.y + 1, 'star', '#ffffff', 1.8, 0.18, 1.5);
        this.burst(p.x, p.y + 1, '#ff7a2a', 30, 10, 0.4, 0.45); this.burst(p.x, p.y + 1, pal.energy, 20, 7, 0.3, 0.4);
        this.dust(p.x, p.y, 0.7);
        break;
      }
      case 'berserkEnd': this.smoke(ev.p.x, ev.p.y + 1, '#c9a27a', 6, 1.5, 0.5, 0.6, { op: 0.35 }); break;
      case 'drillLevel': this.charge.levelUp(ev.p, this.rigs.get(ev.p), ev.level, 'dash'); break;
      case 'healed': this.sprite(ev.p.x, ev.p.y + 1.1, 'ring', '#bff7d4', 0.9, 0.3, 2.2); break;
      case 'ultBolt': case 'ultThunder': this.ult.onEvent(ev); break;
      case 'ultReady': this.sprite(ev.p.x, ev.p.y + 1, 'ring', '#7fe3ff', 1, 0.4, 3); this.burst(ev.p.x, ev.p.y + 1, '#7fe3ff', 20, 5, 0.28, 0.45); break;
      case 'beamEnd': {
        this.beam.onEvent(ev);
        const p = ev.p, c = { x: p.x + p.facing * 0.5, y: p.y + p.h * 0.62 };
        this.smoke(c.x, c.y, '#8e97a3', 6, 1.6, 0.5, 0.7, { dir: Math.PI / 2, spread: 1.4, op: 0.4 });
        this.burst(c.x, c.y, pal.hot, 10, 4, 0.2, 0.3);
        break;
      }
    }
  }

  // Echo's sniper shot: a muzzle blast, a tracer to where it stopped with a vapour trail left along it, and at
  // full focus a white rail with shock rings down its length
  snipe(ev) {
    const p = ev.p, rig = this.rigs.get(p), f = ev.f, full = ev.full;
    const at = this.charge.muzzle(p, rig, new THREE.Vector3()), end = toWorld(ev.x1, ev.y1, 0.25, new THREE.Vector3());
    this.charge.release({ level: 1 + Math.round(f * 2), rifle: true, mark: full, ax: ev.ax, ay: ev.ay }, p, rig);
    const line = this.charge.line(full ? '#ffffff' : '#ffc070', 0.025 + 0.035 * f + (full ? 0.02 : 0));
    this.charge.span(line, at, end); this.charge.flashes.push({ m: line, life: full ? 0.3 : 0.16, max: full ? 0.3 : 0.16, base: 1, dispose: true });
    if (full) {
      const glow = this.charge.line('#ff9a1f', 0.12); this.charge.span(glow, at, end); this.charge.flashes.push({ m: glow, life: 0.22, max: 0.22, base: 0.7, dispose: true });
    }
    const len = Math.hypot(ev.x1 - ev.x0, ev.y1 - ev.y0);
    // Vapour trail: smoke left hanging along the shot
    for (let d = 0.6; d < len; d += 0.55) this.smoke(ev.x0 + ev.ax * d, ev.y0 + ev.ay * d, '#c4ccd6', 1, 0.3, 0.26 + 0.12 * f, 0.5 + 0.3 * f, { op: 0.3 + 0.15 * f, grow: 1.9, grav: -0.3 });
    // Recoil smoke out of the back of the rifle
    this.smoke(ev.x0 - ev.ax * 0.6, ev.y0 - ev.ay * 0.6, '#9aa3ae', 3, 2, 0.4, 0.5, { dir: Math.atan2(-ev.ay, -ev.ax), spread: 0.8, op: 0.45 });
    if (ev.wall) {
      this.burst(ev.x1, ev.y1, '#ffe0b0', 14 + f * 10, 7, 0.22, 0.3, { dir: Math.atan2(-ev.ay, -ev.ax), spread: 2.2, grav: 10 });
      this.smoke(ev.x1, ev.y1, '#8e97a3', 4, 1.5, 0.45, 0.6, { op: 0.45 });
      this.sprite(ev.x1, ev.y1, 'star', '#fff1d6', 0.8 + f * 0.6, 0.12, 1.4);
    }
    if (full) {
      const dir = planeDir(ev.x0, ev.ax, ev.ay, new THREE.Vector3()).normalize();
      for (const u of [0.18, 0.45, 0.72]) if (u * len > 1) this.charge.shockRing(toWorld(ev.x0 + ev.ax * len * u, ev.y0 + ev.ay * len * u, 0.25, new THREE.Vector3()), dir, '#fff1d6', 0.3, 0.9, 0.28, 1.5);
    }
  }

  // The pound lands: a flash, rings the size of the real blast, dust and debris thrown out both ways along the
  // floor, and sparks (Nova's in hard-light gold, Echo's in orange with a cross of slash marks). All of it
  // grows with the charge level.
  poundLand(ev) {
    const p = ev.p, x = ev.x, y = ev.y, L = ev.level, r = ev.r, c = CHARS[p.char].energy, k = 0.4 + 0.2 * L, pal = fxPal(p);
    this.sprite(x, y + 0.4, 'star', '#ffffff', 1.8 + 0.6 * L, 0.16 + 0.02 * L, 1.5);
    this.fireball(x, y + 0.3, pal.energy, 0.9 + 0.35 * L, 0.2 + 0.04 * L);
    this.groundRing(x, y, '#fff6e0', 0.3, r * 1.1, 0.32 + 0.05 * L, 0.95); this.groundRing(x, y, c, 0.2, r * 0.8, 0.28, 0.9);
    if (L >= 2) this.groundRing(x, y, '#ffffff', 0.5, r * 1.35, 0.45, 0.7);
    this.dust(x, y, 0.7 + 0.25 * L, [0, Math.PI], { noRing: true, spread: 0.3 });
    this.smoke(x, y + 0.4, '#8e97a3', 4 + 3 * L, 1.2, 0.8 + 0.2 * L, 0.9 + 0.2 * L, { dir: Math.PI / 2, spread: 1.4, grav: -1, grow: 2.4, op: 0.45 });
    for (const dir of [0.1, Math.PI - 0.1]) this.burst(x, y + 0.15, c, 10 + 6 * L, 9 + 3 * L, 0.3, 0.32, { dir, spread: 0.35, grav: 5 });
    this.burst(x, y + 0.2, '#5d6674', 8 + 5 * L, 6 + 2 * L, 0.3, 0.6, { dir: Math.PI / 2, spread: 1.9, grav: 18 });
    this.burst(x, y + 0.3, '#ffffff', 10 + 4 * L, 6 + 2 * L, 0.22, 0.25);
    if (p.arch === 'echo') { this.slashMark(x, y + 0.5, pal.hot, 1.6 + 0.4 * L, 0.6, 0.18); this.slashMark(x, y + 0.5, c, 1.6 + 0.4 * L, -0.6, 0.18); }
    else this.sprite(x, y + 0.5, 'ring', pal.hot, 0.8 + 0.3 * L, 0.3, 3);
    this.poundT.delete(p);
  }

  // While a pound hangs: energy drawn into the fist or glaive, slow ripples in the air around him and motes
  // drifting past slowly (the slowdown). While it drops: streaks rushing past him, and just before it lands
  // the air it pushes ahead lifts dust off the floor.
  poundFx(world, view, dt) {
    for (const p of world.players) {
      if (p.state !== 'pound' || !p.pound) continue;
      const rig = view.rigs.get(p); if (!rig || !rig.root.visible) continue;
      const S = p.pound, c = CHARS[p.char].energy;
      if (S.phase === 'hold') {
        const at = this.charge.muzzle(p, rig, this.tmp2), n = 1 + S.level;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2, r = 0.9 + Math.random() * 0.6, tv = planeDir(p.x, Math.cos(a) * r, Math.sin(a) * r, new THREE.Vector3());
          this.charge.inward(at, tv.x, tv.y, tv.z, Math.random() < 0.3 ? '#ffffff' : c, 0.15, 0.24);
        }
        const t = (this.poundT.get(p) || 0) + dt; this.poundT.set(p, t);
        if (t > 0.22 - 0.03 * S.level) {
          this.poundT.set(p, 0);
          this.sprite(p.x, p.y + 1, 'ring', S.level >= 3 ? '#ffffff' : c, 0.8, 0.55, 3.2);
        }
        if (Math.random() < 0.5) {   // slow motes drifting up past him
          const w = toWorld(p.x + (Math.random() - 0.5) * 3, p.y - 0.5 + Math.random() * 3, (Math.random() - 0.5) * 1.5, new THREE.Vector3());
          const P = this.particle(w, Math.random() < 0.5 ? '#ffffff' : c, 0.1, 0.6); P.v.set(0, 0.6, 0); P.drag = 1;
        }
        this.dustSwirl(p.x, p.y, 0.3 + 0.2 * S.level);   // close over the floor, the charge stirs it
      } else if (S.phase === 'drop') {
        for (let i = 0; i < 3; i++) this.burst(p.x + (Math.random() - 0.5) * 1.2, p.y + Math.random() * 2, '#ffffff', 1, 26, 0.12, 0.08, { dir: Math.PI / 2, spread: 0.05 });
        if (this.floorUnder(p.x, p.y, 1.6) !== null && Math.random() < 0.7) this.dust(p.x, p.y, 0.25, [0, Math.PI], { reach: 1.6, noRing: true, op: 0.35 });
      }
    }
  }

  // Dust and grit from the characters in general: stirred up around the feet while charging on the ground
  // (a charged dash, a weapon charge), blown off the floor by the boosters and under the beam, kicked back by
  // a sprint's footfalls and by skids, and trailed by a charging Charger
  groundFx(world, view, dt) {
    for (const p of world.players) {
      if (p.state === 'dead' || p.state === 'downed') continue;
      const rig = view.rigs.get(p); if (!rig || !rig.root.visible) continue;
      if (p.onGround) {
        const dl = p.state === 'dashCharge' ? (p.dashChargeT >= DASH_CHARGE.charge[2] ? 3 : p.dashChargeT >= DASH_CHARGE.charge[1] ? 2 : p.dashChargeT >= DASH_CHARGE.charge[0] ? 1 : 0.3) : 0;
        const cl = p.arch === 'nova' && SETTINGS.novaKit === 'marksman' && p.chargeT > MARKSMAN.charge[1] ? (p.chargeT >= MARKSMAN.beam.at ? 3 : p.chargeT >= MARKSMAN.charge[2] ? 2 : 1) : 0;
        const k = Math.max(dl, cl);
        if (k && Math.random() < 0.25 + 0.2 * k) this.dustSwirl(p.x, p.y, 0.25 * k);
        // Sprint footfalls and skids
        const pv = this.prevVx.get(p) ?? p.vx; this.prevVx.set(p, p.vx);
        if (p.state === 'normal' && Math.abs(pv) > 6 && Math.sign(p.vx) !== Math.sign(pv) && Math.abs(p.vx) > 0.5) this.dust(p.x, p.y, 0.35, [pv > 0 ? 0 : Math.PI], { noRing: true });
        if (p.arch === 'echo' && p.state === 'normal' && Math.abs(p.vx) > 7.5) {
          const t = (this.stepT.get(p) || 0) + dt; this.stepT.set(p, t);
          if (t > 0.19) { this.stepT.set(p, 0); this.smoke(p.x - Math.sign(p.vx) * 0.2, p.y + 0.08, DUST, 1, 1.4, 0.3, 0.4, { dir: p.vx > 0 ? Math.PI - 0.4 : 0.4, spread: 0.5, grav: -0.4, op: 0.4 }); }
        }
      } else if (p.thrusting && Math.random() < 0.6) this.dust(p.x, p.y, 0.25, [0, Math.PI], { reach: 3.2, noRing: true, op: 0.35 });   // boosters over the floor
      // Under the beam: wherever it passes low over the floor, dust is blown along it
      if (p.state === 'beam' && p.beam && p.beam.segs) {
        for (const g of p.beam.segs) {
          const len = Math.hypot(g.x1 - g.x0, g.y1 - g.y0);
          for (let d = 0.5; d < len; d += 1.6) {
            if (Math.random() > 0.22) continue;
            const x = g.x0 + (g.x1 - g.x0) * d / len, y = g.y0 + (g.y1 - g.y0) * d / len, fl = this.floorUnder(x, y, 1.6);
            if (fl === null) continue;
            const dir = g.x1 >= g.x0 ? 0.35 : Math.PI - 0.35;
            this.smoke(x, fl + 0.08, DUST, 1, 2.5 + 2 * (1.6 - (y - fl)), 0.28, 0.45, { dir, spread: 0.5, grav: -0.5, grow: 2, op: 0.3 });
          }
        }
        if (p.onGround && Math.random() < 0.5) this.dust(p.x, p.y, 0.2, [p.beam.dx > 0 ? Math.PI : 0], { noRing: true, op: 0.35 });
      }
    }
    for (const e of world.enemies) {
      if (!e.dead && e.type === 'charger' && e.state === 'charge' && e.onGround && Math.random() < 0.6) this.dust(e.x - e.facing * 0.6, e.y, 0.25, [e.facing > 0 ? Math.PI : 0], { noRing: true });
    }
  }

  // A boss falls: a string of explosions across its body over a second or so, then one last blast
  bossExplosion(ev) {
    const e = ev.e; this.booms = this.booms || [];
    // Offsets are relative to the boss as it is when each goes off (a downed gunship is falling)
    for (let i = 0; i < 9; i++) this.booms.push({ t: i * 0.11 + Math.random() * 0.05, e, ox: (Math.random() - 0.5) * e.w, oy: Math.random() * e.h, big: false });
    this.booms.push({ t: 1.15, e, ox: 0, oy: e.h * 0.5, big: true });
  }
  updateBooms(dt) {
    if (!this.booms || !this.booms.length) return;
    for (const b of this.booms) {
      b.t -= dt; if (b.t > 0) continue;
      b.done = true; b.x = b.e.x + b.ox; b.y = b.e.y + b.oy; b.ground = this.floorUnder(b.e.x, b.e.y, 1) !== null ? b.e.y : null;
      if (!b.big) { this.fireball(b.x, b.y, '#ff5aa0', 0.9, 0.22); this.burst(b.x, b.y, HOSTILE, 14, 7, 0.3, 0.35, { grav: 6 }); this.smoke(b.x, b.y, '#6d7480', 3, 1.4, 0.6, 0.8, { op: 0.5 }); continue; }
      this.fireball(b.x, b.y, '#ffd2e4', 3, 0.4); this.sprite(b.x, b.y, 'star', '#ffffff', 5, 0.25, 1.5);
      for (const [sz, life] of [[2.5, 0.4], [4, 0.6]]) this.sprite(b.x, b.y, 'ring', '#ffffff', sz, life, 3);
      this.burst(b.x, b.y, HOSTILE, 60, 14, 0.45, 0.7, { grav: 8 }); this.burst(b.x, b.y, '#ffffff', 30, 10, 0.3, 0.4);
      this.burst(b.x, b.y, '#5d6674', 24, 10, 0.34, 0.9, { grav: 20 });
      this.smoke(b.x, b.y, '#6d7480', 16, 2.5, 1.1, 1.4, { op: 0.55, grow: 2.6, grav: -0.8 });
      if (b.ground !== null) this.dust(b.x, b.ground, 1.4);
    }
    this.booms = this.booms.filter(b => !b.done);
  }

  // Boss lasers: a thin flickering line where it will fire during the windup, then a thick beam with a
  // white-hot core, sparks where it ends and dust kicked off the floor under a low one
  syncBossLasers(world) {
    this.bossBeams = this.bossBeams || new Map();
    const seen = new Set();
    for (const e of world.enemies) {
      const A = e.atk;
      if (!e.boss || e.dead || !A || !A.span || !(e.state === 'laser' || (e.state === 'windup' && (A.kind === 'laser' || A.kind === 'sweep')))) continue;
      seen.add(e);
      let B = this.bossBeams.get(e);
      if (!B) {
        const mk = (r, col, op, blend) => { const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 1, 10, 1, true), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, blending: blend, toneMapped: false })); m.renderOrder = 4; this.scene.add(m); return m; };
        B = { core: mk(0.07, new THREE.Color('#ffffff').multiplyScalar(2.5), 1, THREE.NormalBlending), glow: mk(0.26, new THREE.Color(HOSTILE).multiplyScalar(2), 0.55, THREE.NormalBlending),
          feed: mk(0.1, new THREE.Color(HOSTILE).multiplyScalar(2.2), 0.7, THREE.NormalBlending), a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() };
        this.bossBeams.set(e, B);
      }
      const L = A.span, live = e.state === 'laser';
      toWorld(L.x0, L.y, 0.2, B.a); toWorld(L.x1, L.y, 0.2, B.b);
      this.charge.span(B.core, B.a, B.b); this.charge.span(B.glow, B.a, B.b);
      // Magneto (a flier) drives it down from his aimed hand to where it starts, so the two read as one beam
      if (e.flier) { toWorld(e.x + e.facing * 0.75, e.y + 1.25, 0.2, B.c); this.charge.span(B.feed, B.c, B.a); B.feed.material.opacity = live ? 0.75 : 0.25; B.feed.scale.x = B.feed.scale.z = live ? 1 : 0.35; }
      else B.feed.visible = false;
      if (live && e.type === 'warden') {
        // Thunderclap: a pulsing band of pressure with rings racing along it from his hands to the wall
        const now = performance.now() * 0.001, f = 1 + 0.25 * Math.sin(now * 40);
        B.core.scale.x = B.core.scale.z = 2.2 * f; B.glow.scale.x = B.glow.scale.z = 1.25 * f;
        B.core.material.opacity = 0.32; B.glow.material.opacity = 0.42;
        B.n = (B.n || 0) + 1;
        if (B.n % 3 === 1) {
          const d = B.c.copy(B.b).sub(B.a), len = d.length();
          if (len > 0.1) this.charge.shockRing(B.a.clone(), d.divideScalar(len), B.n % 6 === 1 ? '#ffffff' : HOSTILE, 0.28, 0.62, 0.36, len);
        }
        this.burst(L.x1, L.y, Math.random() < 0.5 ? '#ffffff' : '#c9d3de', 3, 7, 0.2, 0.25, { dir: L.x1 > L.x0 ? Math.PI : 0, spread: 2.4, grav: 6 });
        if (L.y0 - (this.floorUnder(L.x0, L.y0, 3) ?? -99) < 1.2) for (let i = 0; i < 3; i++) { const x = L.x0 + (L.x1 - L.x0) * Math.random(); const g = this.floorUnder(x, L.y0, 1.3); if (g !== null) this.smoke(x, g + 0.1, DUST, 1, 3.5, 0.4, 0.45, { dir: L.x1 > L.x0 ? 0.3 : Math.PI - 0.3, spread: 0.5, op: 0.5 }); }
      } else if (live) {
        const f = 0.85 + Math.random() * 0.3;
        B.core.scale.x = B.core.scale.z = f; B.glow.scale.x = B.glow.scale.z = f * (1 + 0.1 * Math.sin(performance.now() * 0.05));
        B.core.material.opacity = 1; B.glow.material.opacity = 0.6;
        this.burst(L.x1, L.y, Math.random() < 0.5 ? '#ffffff' : HOSTILE, 3, 8, 0.2, 0.2, { dir: L.x1 > L.x0 ? Math.PI : 0, spread: 2.2, grav: 8 });
        if (L.y0 - (this.floorUnder(L.x0, L.y0, 3) ?? -99) < 1.2) for (let i = 0; i < 2; i++) { const x = L.x0 + (L.x1 - L.x0) * Math.random(); const g = this.floorUnder(x, L.y0, 1.3); if (g !== null) this.smoke(x, g + 0.1, DUST, 1, 2.5, 0.35, 0.4, { dir: L.x1 > L.x0 ? 0.4 : Math.PI - 0.4, spread: 0.6, op: 0.4 }); }
      } else {
        const on = Math.random() < 0.75;
        B.core.scale.x = B.core.scale.z = 0.25; B.glow.scale.x = B.glow.scale.z = 0.12;
        B.core.material.opacity = on ? 0.55 : 0.1; B.glow.material.opacity = on ? 0.5 : 0.1;
      }
    }
    for (const [e, B] of this.bossBeams) if (!seen.has(e)) { B.core.visible = B.glow.visible = B.feed.visible = false; if (e.dead || !world.enemies.includes(e)) { for (const m of [B.core, B.glow, B.feed]) { this.scene.remove(m); m.geometry.dispose(); m.material.dispose(); } this.bossBeams.delete(e); } }
  }

  // A badly damaged boss smokes and throws sparks
  bossDamage(world) {
    for (const e of world.enemies) {
      if (!e.boss || e.dead || e.hp > e.maxHp * 0.6) continue;
      const k = 1 - e.hp / (e.maxHp * 0.6);
      if (Math.random() < 0.15 + 0.4 * k) this.smoke(e.x + (Math.random() - 0.5) * e.w * 0.8, e.y + e.h * (0.4 + Math.random() * 0.5), '#5d6674', 1, 0.8, 0.5 + 0.3 * k, 0.9, { dir: Math.PI / 2, spread: 0.8, grav: -1, op: 0.45 });
      if (Math.random() < 0.06 + 0.2 * k) this.burst(e.x + (Math.random() - 0.5) * e.w, e.y + e.h * Math.random(), Math.random() < 0.5 ? '#ffffff' : '#ffd2e4', 4, 5, 0.14, 0.25, { grav: 12 });
    }
  }

  // Echo's Dash Slash: as the lunge ends, a bright cut line along his whole path flashes and fades
  updateSlashes(world) {
    for (const [p, S] of this.slashes) {
      const done = p.state !== 'dashslash' || p.st >= DASH_SLASH.ticks;
      if (!done || S.drawn) { if (p.state !== 'dashslash' && S.drawn) this.slashes.delete(p); continue; }
      S.drawn = true;
      const x1 = p.x, y1 = p.y + 0.95, len = Math.hypot(x1 - S.x0, y1 - S.y0);
      if (len < 1) continue;
      const a = toWorld(S.x0, S.y0, 0.3, new THREE.Vector3()), b = toWorld(x1, y1, 0.3, new THREE.Vector3());
      const col = fxPal(p).energy, core = this.charge.line('#ffffff', 0.03 + S.tier * 0.012), glow = this.charge.line(col, 0.09 + S.tier * 0.03);
      this.charge.span(core, a, b); this.charge.span(glow, a, b);
      this.charge.flashes.push({ m: core, life: 0.26, max: 0.26, base: 1, dispose: true }, { m: glow, life: 0.3, max: 0.3, base: 0.75, dispose: true });
      for (let d = 0; d < len; d += 0.4) {
        const u = d / len; this.burst(S.x0 + (x1 - S.x0) * u, S.y0 + (y1 - S.y0) * u, Math.random() < 0.4 ? '#ffffff' : col, 1, 2, 0.2, 0.3);
      }
    }
  }

  // Slides: Echo's hand drags sparks off the floor and his boots kick up dust; Nova's skates spray sparks
  slideFx(world, view) {
    for (const p of world.players) {
      if (p.state !== 'slide' || !p.onGround) continue;
      const rig = view.rigs.get(p); if (!rig || !rig.root.visible) continue;
      const back = p.vx > 0 ? Math.PI - 0.35 : 0.35, sp = Math.min(1, Math.abs(p.vx) / 10);
      const pal = fxPal(p);
      if (p.arch === 'echo') {
        const hand = rig.armF.end.getWorldPosition(this.tmp2);
        if (Math.random() < 0.7) { const P = this.particle(hand, Math.random() < 0.5 ? pal.soft : pal.energy, 0.14, 0.2); planeDir(p.x, Math.cos(back) * 5 * sp, Math.sin(back) * 5 * sp + 1.5, P.v); P.grav = 10; P.drag = 0.9; }
      } else if (Math.random() < 0.8) this.burst(p.x + Math.sign(p.vx) * 0.3, p.y + 0.04, pal.soft, 2, 4 * sp + 1, 0.15, 0.22, { dir: back, spread: 0.5, grav: 8 });
      if (Math.random() < 0.5) this.smoke(p.x - Math.sign(p.vx) * 0.2, p.y + 0.1, '#a3abb5', 1, 1.2, 0.35, 0.45, { dir: back, spread: 0.6, op: 0.4 });
    }
  }

  // Rocket jump launch: a white flash and a shock ring where it burst, a ground shockwave, dust thrown
  // out along the ground both ways, sparks and debris, and a column of smoke. Everything scales with the
  // launch power, so a Perfect Release reads as the biggest blast.
  rocketBlast(ev) {
    const pal = fxPal(ev.p), k = ev.power || 0.5, x = ev.x, y = ev.y, gold = pal.energy;
    const vertical = (ev.dy ?? 1) > 0.6;
    this.sprite(x, y + 0.1, 'star', '#ffffff', 1.4 + k * 2.2, 0.16, 1.6);
    this.sprite(x, y + 0.1, 'glow', ev.perfect ? '#ffffff' : pal.soft, 2 + k * 3, 0.22, 1.8);
    this.fireball(x, y + 0.25, ev.perfect ? pal.energy : pal.deep, 0.9 + k * 1.4, 0.3 + k * 0.1);
    this.sprite(x, y + 0.2, 'ring', pal.hot, 0.9 + k * 1.2, 0.28, 3.4);
    if (vertical) {
      this.groundRing(x, y, pal.hot, 0.3, 2.4 + k * 3.2, 0.42 + k * 0.1, 0.95);
      this.groundRing(x, y, gold, 0.2, 1.4 + k * 2, 0.3, 0.8);
      // Dust thrown out low along the ground in both directions
      for (const dir of [0.12, Math.PI - 0.12]) {
        this.burst(x, y + 0.1, '#dfe6ee', 8 + k * 10, 7 + k * 8, 0.45, 0.45, { dir, spread: 0.45, drag: 0.9, grav: 1.5 });
        this.smoke(x, y + 0.2, '#9aa3ae', 7 + k * 8, 6 + k * 7, 0.7 + k * 0.4, 0.55 + k * 0.3, { dir, spread: 0.35, drag: 0.88, grav: -0.3, op: 0.55 });
      }
    }
    // Sparks and burning debris, most of them thrown down and out from under his boots
    const away = Math.atan2(-(ev.dy ?? 1), -(ev.dx ?? 0));
    this.burst(x, y + 0.2, gold, 18 + k * 22, 9 + k * 9, 0.28, 0.45, { dir: away, spread: 2.6, grav: 16 });
    this.burst(x, y + 0.2, '#ffffff', 8 + k * 10, 6 + k * 6, 0.22, 0.25, { dir: away, spread: 3 });
    this.burst(x, y + 0.2, '#5d6674', 6 + k * 8, 6 + k * 5, 0.3, 0.7, { dir: away, spread: 2.2, grav: 20 });
    // A column of smoke that rises and spreads slowly
    this.smoke(x, y + 0.4, '#7d8692', 10 + k * 12, 1.4 + k, 0.9 + k * 0.6, 1.1 + k * 0.5, { dir: Math.PI / 2, spread: 1.3, drag: 0.94, grav: -1.2, grow: 2.4, op: 0.5 });
    if (ev.perfect) this.sprite(x, y + 0.4, 'ring', '#ffffff', 1.6, 0.35, 4.2);
  }

  // A short-lived ball of fire drawn with ordinary blending (reads on bright backgrounds), bright core on top
  fireball(x, y, color, size, life) {
    const it = this.sprite(x, y, 'glow', color, size, life, 2.2, 0.35);
    it.s.material.blending = THREE.NormalBlending; it.s.material.needsUpdate = true; it.normal = true;
    this.sprite(x, y, 'glow', '#fff4d6', size * 0.55, life * 0.7, 1.8, 0.4);
  }

  // Afterimages: charged dashes leave more, brighter and longer-lived ghosts with each level; strong rocket
  // launches leave a trail of gold ones on the way up
  updateGhosts(world, view) {
    for (const p of world.players) {
      const rig = view.rigs.get(p); if (!rig || !rig.root.visible) continue;
      const last = this.ghostTick.get(p) ?? -99, dt = world.tick - last;
      const col = new THREE.Color(CHARS[p.char].energy);
      if (p.state === 'dash' && p.dash) {
        const L = p.dash.level || 0, every = [5, 4, 3, 2][L];
        if (dt >= every) {
          this.ghostTick.set(p, world.tick);
          // Stronger with each level: more of them, more opaque, longer-lived, and at level 3 hot enough to glow
          const c = col.clone().lerp(new THREE.Color('#fff6e0'), [0, 0.05, 0.2, 0.35][L]).multiplyScalar([1, 1, 1.3, 2.2][L]);
          this.ghosts.spawn(rig, c, [0.16, 0.3, 0.45, 0.62][L], [0.12, 0.2, 0.28, 0.4][L]);
        }
      } else if (p.state === 'dashslash' && dt >= 2) {
        // Dash Slash: a dense line of bright afterimages, stronger with the tier
        this.ghostTick.set(p, world.tick);
        const T = p.slash ? p.slash.tier : 1;
        this.ghosts.spawn(rig, col.clone().lerp(new THREE.Color('#fff6e0'), 0.12 * T).multiplyScalar(1 + 0.45 * T), 0.26 + 0.08 * T, 0.2 + 0.05 * T);
      } else if (p.state === 'pound' && p.pound && p.pound.phase === 'drop' && dt >= 2) {
        this.ghostTick.set(p, world.tick);
        this.ghosts.spawn(rig, col.clone().lerp(new THREE.Color('#fff6e0'), 0.1 * p.pound.level).multiplyScalar(1.2 + 0.3 * p.pound.level), 0.26 + 0.06 * p.pound.level, 0.16 + 0.03 * p.pound.level);
      } else if (p.state === 'attack' && p.move && ['echo_spin', 'echo_rise', 'echo_b4', 'echo_charged', 'nova_rise'].includes(p.moveId) && p.st >= p.move.su && p.st < p.move.su + p.move.ac && dt >= 3) {
        this.ghostTick.set(p, world.tick);
        this.ghosts.spawn(rig, col, 0.2, 0.14);
      } else if (p.rocketT > 0 && p.vy > 8 && (p.rocketPow || 0) > 0.55 && dt >= 3) {
        this.ghostTick.set(p, world.tick);
        this.ghosts.spawn(rig, new THREE.Color(fxPal(p).energy).multiplyScalar(1 + p.rocketPow), 0.2 + 0.25 * p.rocketPow, 0.3);
      }
    }
  }

  // Rocket climb: a jet of sparks and smoke from his boots while he is still going up fast
  rocketTrails(world) {
    for (const p of world.players) {
      if (!(p.rocketT > 0 && p.vy > 6 && !p.onGround)) continue;
      const k = Math.min(1, p.vy / 30) * (p.rocketPow || 0.5), pal = fxPal(p);
      for (let i = 0; i < 1 + k * 3; i++) {
        this.burst(p.x + (Math.random() - 0.5) * 0.25, p.y - 0.05, Math.random() < 0.5 ? pal.hot : pal.energy, 1, 2, 0.3 + k * 0.2, 0.22, { dir: -Math.PI / 2, spread: 0.6 });
      }
      if (Math.random() < 0.7) this.smoke(p.x, p.y - 0.2, '#8e97a3', 1, 0.8, 0.45 + k * 0.35, 0.7, { dir: -Math.PI / 2, spread: 1, drag: 0.93, grav: -0.4, op: 0.4 });
    }
  }

  // Wall slides: grit off the wall at the hand and boot; Nova's skate blades grind sparks
  wallGrit(world) {
    for (const p of world.players) {
      if (!p.wallSliding) continue;
      const wx = p.x + p.wallDir * p.w / 2, speed = Math.min(1, -p.vy / 6);
      if (Math.random() < 0.2 + speed * 0.4) this.smoke(wx, p.y + p.h * 0.85, '#aab2bc', 1, 1.0, 0.22, 0.35, { dir: Math.PI / 2, spread: 1, op: 0.45 });
      if (Math.random() < 0.3 + speed * 0.5) this.smoke(wx, p.y + 0.08, '#a3abb5', 1, 1.4, 0.28, 0.4, { dir: Math.PI / 2 + p.wallDir * 0.6, spread: 0.8, op: 0.5 });
      if (p.arch === 'nova' && SETTINGS.novaKit === 'marksman' && kitOf(p).skate && Math.random() < 0.35 + speed * 0.5) {
        this.burst(wx, p.y + 0.05, fxPal(p).soft, 1, 3 + speed * 2, 0.15, 0.22, { dir: p.wallDir > 0 ? Math.PI - 0.5 : 0.5, spread: 0.8, grav: 10 });
      }
    }
  }

  // ---- Per-frame update ----
  update(dt, world, view) {
    this.updateRings(dt);
    this.updateSmoke(dt);
    this.updateGhosts(world, view);
    this.ghosts.update(dt);
    this.rocketTrails(world);
    this.wallGrit(world);
    this.charge.update(dt, world, view);
    this.updateParticles(dt);
    this.updateSprites(dt);
    this.updateTelegraphs(world);
    this.trails.update(dt, world, view.rigs);
    this.aegis.update(dt, world);
    this.beam.update(dt, world, view);
    this.sub.update(dt, world, view); this.ult.update(dt, world, view);
    this.updateSlashes(world);
    this.slideFx(world, view);
    this.poundFx(world, view, dt);
    this.groundFx(world, view, dt);
    this.syncBossLasers(world);
    this.bossDamage(world);
    this.updateBooms(dt);
    this.updateTexts(dt);
    this.syncProjectiles(world, view.alpha);
    this.syncBarriers(world);
    this.syncLasers(world);
    this.syncShockwaves(world);
    this.syncScarves(dt, world, view);
    this.syncSnares(world);
    this.syncSnaredRings(world);
    this.updateGlyphs(dt);
    this.skateSparks(world);
    this.updateMarks(dt);
    this.thrusterJets(world, view);
  }
  // Marksman Nova's light boosters: two small jets under the boots while they fire
  thrusterJets(world, view) {
    for (const p of world.players) {
      if (!p.thrusting) continue;
      for (const dz of [-0.13, 0.13]) {
        const v = toWorld(p.x + (Math.random() - 0.5) * 0.1, p.y - 0.05, dz, this.tmp2);
        const P = this.parts[this.pi], idx = this.pi; this.pi = (this.pi + 1) % this.N;
        P.v.set((Math.random() - 0.5) * 0.6, -5 - Math.random() * 3, (Math.random() - 0.5) * 0.6);
        const pal = fxPal(p); this.pPos.set([v.x, v.y, v.z], idx * 3); const c = new THREE.Color(Math.random() < 0.5 ? pal.hot : pal.energy); this.pCol.set([c.r, c.g, c.b], idx * 3);
        P.life = P.max = 0.16 + Math.random() * 0.08; P.size = 0.26; P.drag = 0.86; P.grav = 0;
      }
    }
  }
  // Marksman Nova: a few sparks trail from the skate blades at speed
  skateSparks(world) {
    if (SETTINGS.novaKit !== 'marksman') return;
    for (const p of world.players) {
      if (p.arch !== 'nova' || !kitOf(p).skate || !p.onGround || Math.abs(p.vx) < 6 || Math.random() > 0.35) continue;
      this.burst(p.x - Math.sign(p.vx) * 0.15, p.y + 0.03, fxPal(p).soft, 1, 1.5, 0.16, 0.2, { dir: p.vx > 0 ? Math.PI - 0.3 : 0.3, spread: 0.6, grav: 4 });
    }
  }
  updateParticles(dt) {
    for (let i = 0; i < this.N; i++) {
      const P = this.parts[i];
      if (P.life <= 0) { this.pAlpha[i] = 0; continue; }
      P.life -= dt; P.v.multiplyScalar(Math.pow(P.drag, dt * 60)); P.v.y -= P.grav * dt;
      this.pPos[i * 3] += P.v.x * dt; this.pPos[i * 3 + 1] += P.v.y * dt; this.pPos[i * 3 + 2] += P.v.z * dt;
      const k = Math.max(0, P.life / P.max);
      this.pAlpha[i] = k; this.pSize[i] = P.size * (0.5 + k * 0.5);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true; g.attributes.alpha.needsUpdate = true; g.attributes.size.needsUpdate = true; g.attributes.pcolor.needsUpdate = true;
  }
  updateSprites(dt) {
    for (const it of this.sprites) {
      if (it.life <= 0) { it.s.visible = false; continue; }
      it.life -= dt; const k = 1 - Math.max(0, it.life) / it.max;
      const sc = it.base * (1 + (it.grow - 1) * k); it.s.scale.set(sc * (it.sx || 1), sc, 1); it.s.material.opacity = 1 - k;
    }
  }
  updateTelegraphs(world) {
    for (const tg of this.telegraphs) {
      const e = tg.e; tg.t++;
      const eye = { x: e.x + e.facing * e.w * 0.35, y: e.y + e.h * 0.8 };
      const pops = tg.cat === 'standard' ? [0, tg.ticks - 7] : tg.cat === 'heavy' ? [0, 7, tg.ticks - 7] : [];
      if (pops.includes(tg.t - 1)) this.sprite(eye.x, eye.y, 'star', tg.cat === 'heavy' ? '#fff3cf' : '#ffffff', tg.cat === 'heavy' ? 1.5 : 1.0, 0.2, 1.2, 0.8);
      if (tg.cat === 'unblockable' && tg.t === 1 && e.type !== 'mortar' && !e.flier) this.addMarker(e, tg.ticks);   // mortars and fliers mark their own targets
    }
    this.telegraphs = this.telegraphs.filter(tg => tg.t < tg.ticks && !tg.e.dead);
    for (const mk of this.markers) {
      mk.t++; const k = mk.t / mk.ticks;
      mk.mesh.material.opacity = 0.35 + 0.45 * Math.abs(Math.sin(mk.t * 0.35));
      mk.mesh.material.map.offset.x = -mk.t * 0.04;
      mk.mesh.scale.x = 0.3 + 0.7 * Math.min(1, k * 2);
      if (mk.t >= mk.ticks || mk.e.dead) { this.scene.remove(mk.mesh); mk.dead = true; }
    }
    this.markers = this.markers.filter(m => !m.dead);
  }
  // Mortar landing marker: a pulsing magenta ring on the ground where the shell will burst
  addLandingMark(x, y, r, secs) {
    const mat = new THREE.MeshBasicMaterial({ map: this.tex.ring, color: HOSTILE, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.4, r * 2.4), mat);
    toWorld(x, y + 0.04, 0, mesh.position); mesh.rotation.x = -Math.PI / 2;
    this.scene.add(mesh);
    (this.marks = this.marks || []).push({ mesh, life: secs, max: secs });
  }
  updateMarks(dt) {
    if (!this.marks) return;
    for (const m of this.marks) {
      m.life -= dt; const k = 1 - Math.max(0, m.life) / m.max;
      m.mesh.material.opacity = 0.35 + 0.5 * k * (0.6 + 0.4 * Math.sin(k * 40));
      m.mesh.scale.setScalar(1.25 - 0.25 * k);
      if (m.life <= 0) { this.scene.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.material.dispose(); m.dead = true; }
    }
    this.marks = this.marks.filter(m => !m.dead);
  }
  addMarker(e, ticks) {
    const len = e.type === 'post' ? 7 : 12;
    const tex = this.tex.jag.clone(); tex.needsUpdate = true; tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(len / 1.2, 1);
    const mat = new THREE.MeshBasicMaterial({ map: tex, color: HOSTILE, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.5), mat);
    const f = pathFrame(e.x); toWorld(e.x, e.y + 0.26, 0.9, mesh.position);
    mesh.rotation.y = Math.atan2(-f.tz, f.tx);
    this.scene.add(mesh); this.markers.push({ e, mesh, t: 0, ticks });
  }
  // ---- Projectiles ----
  buildProjectileTemplates() {
    const em = (c, i = 3) => new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: i, roughness: 0.3 });
    const glowB = (c, k, op) => new THREE.MeshBasicMaterial({ color: new THREE.Color(c).multiplyScalar(k), transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
    const grp = (...ms) => { const g = new THREE.Group(); for (const m of ms) g.add(m); return g; };
    const at = (m, x = 0, y = 0, z = 0, rz = 0) => { m.position.set(x, y, z); m.rotation.z = rz; return m; };
    const capsule = (r, len, c, k) => new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 3, 8), em(c, k));
    // A beam of light: a hot core inside a coloured sheath (Cyclops's optic blasts)
    const beam = (r, len, c, hot, k = 4) => grp(capsule(r, len, c, k), capsule(r * 0.45, len * 1.02, hot, k + 2));
    // A jagged bolt of lightning (Storm): three offset segments along the flight line
    const bolt = (len, c, hot) => {
      const g = new THREE.Group(), seg = len / 3;
      for (let i = 0; i < 3; i++) {
        const m = capsule(0.045 * (len > 1 ? 1.4 : 1), seg, i === 1 ? hot : c, 5); m.position.set(i === 1 ? 0.09 : -0.06 * (i - 1), (i - 1) * seg * 0.9, 0); m.rotation.z = i === 1 ? -0.45 : 0.4; g.add(m);
      }
      g.add(capsule(0.03, len * 0.95, '#ffffff', 6)); return g;
    };
    const crescent = (c, hot) => {
      const g = new THREE.Group();
      const outer = new THREE.RingGeometry(0.5, 0.86, 28, 1, Math.PI / 2 - 1.15, 2.3); outer.translate(0, -0.72, 0);
      const edge = new THREE.RingGeometry(0.74, 0.86, 28, 1, Math.PI / 2 - 1.05, 2.1); edge.translate(0, -0.72, 0);
      g.add(new THREE.Mesh(outer, glowB(c, 2.2, 0.8))); g.add(new THREE.Mesh(edge, glowB(hot, 3, 1))); return g;
    };
    // Enemy shots and the villains' pieces: Juggernaut throws rubble, Magneto hurls steel and drops scrap
    const enemy = {
      std: () => new THREE.Mesh(new THREE.OctahedronGeometry(0.2), em(HOSTILE, 3)),
      heavy: () => grp(new THREE.Mesh(new THREE.OctahedronGeometry(0.34), em(HOSTILE, 3)), new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), em('#ffffff', 4))),
      mortar: () => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.05, 6, 18), em(HOSTILE, 4)); return grp(new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), em('#2b2f3a', 0.2)), r); },
      missile: () => { const n = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), em('#ffffff', 4)); n.position.y = 0.28; return grp(capsule(0.1, 0.42, HOSTILE, 3), n); },
      rubble: () => {
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32, 0), new THREE.MeshStandardMaterial({ color: '#8d877f', roughness: 0.95, flatShading: true }));
        rock.scale.set(1.2, 0.85, 1); const rebar = capsule(0.025, 0.5, '#5a4636', 0.2); rebar.rotation.z = 0.9;
        return grp(rock, rebar, new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), em(HOSTILE, 3)));
      },
      steel: () => {
        const blade = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.62, 4), new THREE.MeshStandardMaterial({ color: '#c8ced8', roughness: 0.25, metalness: 0.9, emissive: HOSTILE, emissiveIntensity: 0.6 }));
        blade.scale.z = 0.3; return grp(blade);
      },
      scrap: () => {
        const beamM = new THREE.MeshStandardMaterial({ color: '#7c838e', roughness: 0.5, metalness: 0.8, emissive: HOSTILE, emissiveIntensity: 0.35 });
        const a = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.2), beamM), b = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.5, 0.2), beamM);
        b.position.x = 0.25; return grp(a, b, new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.03, 6, 18), em(HOSTILE, 3.5)));
      },
    };
    // A hero's shots, in their colours (the frame decides which kinds they fire)
    const hero = id => {
      const P = FXPAL[id] || FXPAL.nova, who = { char: id }, A = k => attachLook(who, k).tint, S = k => subLook(who, k).tint;
      const T = {
        shot: () => capsule(0.08, 0.34, P.energy, 4),
        lance: () => capsule(0.13, 0.9, A('lance'), 5),
        rail: () => capsule(0.15, 1.9, P.hot, 6),
        bolt: () => capsule(0.07, 0.4, P.energy, 4),
        tracer: () => grp(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 6, 14), em(P.energy, 5)), capsule(0.05, 0.3, P.energy, 5)),
        snare: () => { const g = grp(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.05, 6, 16), em(P.energy, 4))); for (let i = 0; i < 3; i++) g.add(at(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), em(P.hot, 4)), Math.cos(i * 2.1) * 0.22, Math.sin(i * 2.1) * 0.22)); return g; },
        dart: () => capsule(0.05, 0.3, A('volley'), 5),
        shell: () => { const r = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.03, 6, 18), em(P.hot, 4)); return grp(new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), em(A('arc'), 3.5)), r); },
        prism: () => new THREE.Mesh(new THREE.OctahedronGeometry(0.22), em(A('prism'), 4)),
        shard: () => new THREE.Mesh(new THREE.TetrahedronGeometry(0.12), em(A('prism'), 5)),
        pellet: () => new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), em(S('scatter'), 5)),
        rifle: () => capsule(0.045, 0.5, P.energy, 5),
        markShot: () => grp(capsule(0.07, 0.8, P.hot, 6), new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 16), em(P.energy, 5))),
        wave: () => crescent(P.energy, P.hot),
        grenade: () => { const b = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.035, 6, 18), em(S('grenade'), 4)); b.rotation.x = Math.PI / 2; return grp(new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 10), new THREE.MeshStandardMaterial({ color: '#2d3240', roughness: 0.45, metalness: 0.4 })), b); },
        bomblet: () => new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), em(S('grenade'), 4)),
        disc: () => {
          const face = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.04, 28), new THREE.MeshBasicMaterial({ color: new THREE.Color(S('disc')).multiplyScalar(1.1), transparent: true, opacity: 0.4, depthWrite: false, toneMapped: false }));
          const rim = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.045, 6, 28), em(S('disc'), 2.6)); rim.rotation.x = Math.PI / 2;
          const hub = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.03, 6, 18), em(P.hot, 2.4)); hub.rotation.x = Math.PI / 2;
          return grp(face, rim, hub);
        },
        deflected: () => grp(new THREE.Mesh(new THREE.OctahedronGeometry(0.24), em(P.energy, 4)), new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), em('#ffffff', 4))),
      };
      if (id === 'cyclops') Object.assign(T, {
        // Optic blasts: every shot is a ruby beam with a white-hot core; the Optic Mine is a dark puck banded red
        shot: () => beam(0.07, 0.42, P.energy, P.hot), lance: () => beam(0.12, 1.0, P.energy, P.hot, 5), rail: () => beam(0.16, 2.2, P.energy, '#ffffff', 6),
        dart: () => beam(0.05, 0.36, A('volley'), P.hot), prism: () => beam(0.1, 0.55, A('prism'), '#ffffff'), shard: () => beam(0.05, 0.3, A('prism'), P.hot),
        pellet: () => beam(0.05, 0.16, S('scatter'), P.hot),
      });
      if (id === 'storm') Object.assign(T, {
        // Lightning bolts; hailstones of ice; a thunderhead that bursts; a ball of hail for the Hailstorm
        shot: () => bolt(0.4, P.energy, P.hot), lance: () => bolt(1.0, P.energy, P.hot), rail: () => bolt(2.0, P.hot, '#ffffff'),
        dart: () => new THREE.Mesh(new THREE.OctahedronGeometry(0.1), new THREE.MeshStandardMaterial({ color: '#eaf8ff', emissive: '#bfeaff', emissiveIntensity: 1.2, roughness: 0.1, flatShading: true })),
        shell: () => {
          const cloud = new THREE.MeshStandardMaterial({ color: '#5d6878', roughness: 1, emissive: '#2a3a52', emissiveIntensity: 0.4 });
          const g = grp(at(new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), cloud)), at(new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), cloud), 0.15, -0.03), at(new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), cloud), -0.15, -0.04));
          g.add(at(capsule(0.03, 0.25, P.hot, 6), 0.02, -0.2, 0, 0.3)); return g;
        },
        grenade: () => new THREE.Mesh(new THREE.IcosahedronGeometry(0.21, 0), new THREE.MeshStandardMaterial({ color: '#e6f6ff', emissive: '#a6dcff', emissiveIntensity: 0.9, roughness: 0.15, flatShading: true })),
        bomblet: () => new THREE.Mesh(new THREE.OctahedronGeometry(0.11), new THREE.MeshStandardMaterial({ color: '#eaf8ff', emissive: '#bfeaff', emissiveIntensity: 1.2, roughness: 0.1, flatShading: true })),
        pellet: () => new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), em(P.soft, 3)),
      });
      if (id === 'jean') Object.assign(T, {
        // Telekinesis: a pulse of force; a spear of it; thrown chunks of the street wrapped in her glow
        shot: () => grp(new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), em(P.energy, 4)), new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.025, 6, 16), em(P.soft, 3))),
        lance: () => beam(0.1, 0.95, A('lance'), P.hot, 5),
        shell: () => {
          const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), new THREE.MeshStandardMaterial({ color: '#8e8880', roughness: 0.9, flatShading: true }));
          const aura = new THREE.Mesh(new THREE.DodecahedronGeometry(0.26, 0), glowB(P.energy, 1.6, 0.35)); return grp(rock, aura);
        },
        disc: () => {
          const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.06, 24), new THREE.MeshStandardMaterial({ color: '#7d828a', roughness: 0.45, metalness: 0.8 }));
          const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.045, 6, 28), em(P.energy, 2.6)); rim.rotation.x = Math.PI / 2;
          return grp(plate, rim);
        },
      });
      if (id === 'wolverine') Object.assign(T, {
        // A charged claw swipe flies on as three parallel cuts
        wave: () => { const g = new THREE.Group(); for (const dy of [-0.26, 0, 0.26]) { const c = crescent(P.energy, P.hot); c.position.y = dy; c.scale.setScalar(0.8); g.add(c); } return g; },
      });
      return T;
    };
    this.enemyLooks = enemy; this.heroLooks = hero; this.protos = {}; this.heroTmpl = {};
    // Templates are built once per look; projectiles are clones that share geometry and materials
    this.tmpl = {};
    for (const k in enemy) this.tmpl[k] = () => (this.protos[k] || (this.protos[k] = enemy[k]())).clone();
    const nova = hero('nova');
    for (const k in nova) if (!this.tmpl[k]) this.tmpl[k] = () => (this.protos['nova:' + k] || (this.protos['nova:' + k] = nova[k]())).clone();
  }
  // The look for one projectile: its owner's (a hero's colours, a villain's pieces)
  projMesh(pr) {
    const o = pr.owner;
    let key, make;
    if (pr.team === 'e' && !pr.deflected) {
      const t = o && o.type, k = t === 'warden' && pr.kind === 'missile' ? 'rubble' : t === 'stormcaller' && pr.kind === 'std' ? 'steel' : t === 'stormcaller' && pr.kind === 'mortar' ? 'scrap' : pr.kind;
      key = this.enemyLooks[k] ? k : 'std'; make = this.enemyLooks[key];
    } else {
      const id = o && o.kind === 'player' ? o.char : 'nova', T = this.heroTmpl[id] || (this.heroTmpl[id] = this.heroLooks(id)), k = pr.deflected ? 'deflected' : pr.kind;
      key = id + ':' + (T[k] ? k : 'shot'); make = T[T[k] ? k : 'shot'];
    }
    return (this.protos[key] || (this.protos[key] = make())).clone();
  }
  syncProjectiles(world, alpha) {
    const seen = new Set();
    const Y = new THREE.Vector3(0, 1, 0);
    for (const pr of world.projectiles) {
      seen.add(pr);
      let m = this.projMeshes.get(pr);
      // A deflected enemy shot changes hands: swap its look for Echo's
      if (m && pr.deflected && !m.userData.defl) { this.scene.remove(m); m = null; }
      if (!m) { m = this.projMesh(pr); m.userData.defl = !!pr.deflected; this.scene.add(m); this.projMeshes.set(pr, m); }
      const x = pr.px + (pr.x - pr.px) * alpha, y = pr.py + (pr.y - pr.py) * alpha;
      toWorld(x, y, 0.1, m.position);
      const d = planeDir(x, pr.vx, pr.vy, this.tmp).normalize();
      if (pr.kind === 'disc') {
        // Edge-on to the camera, spinning fast (a level 2+ disc is bigger)
        m.rotation.set(Math.PI / 2 - 0.35, (m.userData.spin = (m.userData.spin || 0) + 0.55), 0); m.scale.setScalar(pr.r / 0.4);
      } else if (SPIN.has(pr.kind)) { if (!pr.rest) { m.rotation.x += 0.2; m.rotation.y += 0.15; } }
      else m.quaternion.setFromUnitVectors(Y, d);
      // A grenade's light blinks faster as its fuse runs down
      if (pr.kind === 'grenade' && (pr.ttl < 24 ? pr.ttl % 4 === 0 : pr.ttl % 10 === 0) && m.userData.blink !== pr.ttl) {
        m.userData.blink = pr.ttl; this.sprite(x, y, 'glow', pr.ttl < 24 ? '#ff5a3a' : SUB_LOOK.grenade.tint, 0.55, 0.08, 1.2);
      }
      if (pr.amplified) m.scale.setScalar(1.35);
      if (this.charge.wantsTrail(pr)) this.charge.trail(pr, m.position);
      if (pr.kind === 'missile' && Math.random() < 0.8) this.smoke(x - pr.vx * 0.012, y - pr.vy * 0.012, pr.owner && pr.owner.type === 'warden' ? '#a39b90' : '#8e97a3', 1, 0.4, 0.35, 0.5, { op: 0.45, grav: -0.3 });
      if (pr.kind === 'wave') { const c = fxPal(pr.owner).energy; for (let i = 0; i < 3; i++) this.burst(x - Math.sign(pr.vx) * 0.2, y + (Math.random() - 0.5) * 1.3, Math.random() < 0.4 ? '#ffffff' : c, 1, 1.5, 0.24, 0.2); }
      else if (Math.random() < (pr.kind === 'pellet' ? 0.25 : 0.6)) this.burst(x, y, trailColor(pr), 1, 0.6, pr.kind === 'rail' ? 0.5 : 0.22, 0.18);
    }
    for (const [pr, m] of this.projMeshes) if (!seen.has(pr)) { this.scene.remove(m); this.projMeshes.delete(pr); }
    this.charge.orphanUnseen(seen);
  }
  syncBarriers(world) {
    const seen = new Set();
    for (const b of world.barriers) {
      seen.add(b);
      let m = this.barrierMeshes.get(b);
      if (!m) {
        const mat = new THREE.MeshStandardMaterial({ color: '#fff0cc', emissive: NOVA_GOLD, emissiveIntensity: 2.2, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
        m = new THREE.Mesh(new THREE.BoxGeometry(b.half * 2, 0.22, 1.6), mat);
        const T = planeDir(b.x, -b.ny, b.nx, new THREE.Vector3()).normalize();
        const Nn = planeDir(b.x, b.nx, b.ny, new THREE.Vector3()).normalize();
        const Z = new THREE.Vector3().crossVectors(T, Nn).normalize();
        m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(T, Nn, Z));
        toWorld(b.x, b.y, 0, m.position);
        this.scene.add(m); this.barrierMeshes.set(b, m);
      }
      const k = b.ttl / b.max;
      m.material.opacity = 0.25 + 0.4 * k + (b.ttl % 10 < 5 && k < 0.25 ? 0.2 : 0);
    }
    for (const [b, m] of this.barrierMeshes) if (!seen.has(b)) { this.scene.remove(m); this.barrierMeshes.delete(b); }
  }
  syncLasers(world) {
    const seen = new Set();
    for (const e of world.enemies) {
      if (e.type !== 'sniper' || e.dead || (e.state !== 'aim' && e.state !== 'lock')) continue;
      seen.add(e);
      let m = this.lasers.get(e);
      if (!m) {
        m = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 6), new THREE.MeshBasicMaterial({ color: HOSTILE, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
        this.scene.add(m); this.lasers.set(e, m);
      }
      const sx = e.x + e.facing * 1.3, sy = e.y + 1.35;
      const dx = e.aimX - sx, dy = e.aimY - sy, d = Math.hypot(dx, dy) || 1;
      const len = 26, ex = sx + dx / d * len, ey = sy + dy / d * len;
      const a = toWorld(sx, sy, 0.25, new THREE.Vector3()), b = toWorld(ex, ey, 0.25, new THREE.Vector3());
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.scale.set(e.state === 'lock' ? 2.6 : 1, a.distanceTo(b), e.state === 'lock' ? 2.6 : 1);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      m.material.color.set(e.state === 'lock' ? '#ffffff' : HOSTILE);
    }
    for (const [e, m] of this.lasers) if (!seen.has(e)) { this.scene.remove(m); this.lasers.delete(e); }
  }
  syncShockwaves(world) {
    const seen = new Set();
    for (const s of world.shockwaves) {
      seen.add(s);
      let m = this.shockMeshes.get(s);
      if (!m) {
        m = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 4), new THREE.MeshStandardMaterial({ color: HOSTILE, emissive: HOSTILE, emissiveIntensity: 3, transparent: true, opacity: 0.85 }));
        this.scene.add(m); this.shockMeshes.set(s, m);
      }
      toWorld(s.x, s.y + 0.5, 0.2, m.position);
      m.rotation.y += 0.4;
      if (Math.random() < 0.8) this.burst(s.x, s.y + 0.2, HOSTILE, 2, 3, 0.35, 0.25, { dir: Math.PI / 2, spread: 1.5 });
    }
    for (const [s, m] of this.shockMeshes) if (!seen.has(s)) { this.scene.remove(m); this.shockMeshes.delete(s); }
  }

  // ---- Cloth: Echo's nano-scarf (a spring chain that becomes the lash), Psylocke's sash (the same, tied at her
  // waist, showing her modes), Storm's cape and Jean's sash ----
  syncScarves(dt, world, view) {
    const seen = new Set();
    for (const p of world.players) {
      const C = CLOTH[p.char]; if (!C) continue;
      const rig = view.rigs.get(p); if (!rig) continue;
      seen.add(p);
      let S = this.scarves.get(p);
      if (S && S.char !== p.char) { this.scene.remove(S.mesh); this.scarves.delete(p); S = null; }
      if (!S) S = this.makeScarf(p, rig, C);
      const anchor = rig.collar.getWorldPosition(this.tmp2);
      const pts = S.pts, n = pts.length;
      const fast = Math.hypot(p.vx, p.vy) > 10 || p.state === 'dash' || p.state === 'zip';
      const seg = (fast ? 1.33 : 1) * C.seg;
      pts[0].copy(anchor);
      const reel = p.leash && !p.leash.e.dead ? p.leash.e : null;
      if (((p.state === 'lash' || p.state === 'zip') && p.lash) || reel) {
        const L = reel ? { tx: reel.x, ty: reel.y + reel.h * 0.55, len: 1 } : p.lash, tgt = toWorld(L.tx, L.ty, 0.2, new THREE.Vector3());
        const k = p.state === 'zip' || reel ? 1 : L.len;
        for (let i = 1; i < n; i++) { const u = i / (n - 1) * k; S.prev[i].copy(pts[i]); pts[i].copy(anchor).lerp(tgt, u); }
      } else {
        const g = fast ? -2 : C.cape ? -12 : -9.5;
        const back = planeDir(p.x, -p.facing, 0, new THREE.Vector3());
        const sway = Math.sin(view.camera.position.x * 0.2 + performance.now() * 0.003) * 0.0012;
        for (let i = 1; i < n; i++) {
          const v = this.tmp.copy(pts[i]).sub(S.prev[i]).multiplyScalar(0.92);
          S.prev[i].copy(pts[i]); pts[i].add(v); pts[i].y += g * dt * dt;
          pts[i].addScaledVector(back, (C.cape ? 0.0024 : 0.0016) * i); pts[i].y += sway * i;
        }
        for (let it = 0; it < 3; it++) for (let i = 1; i < n; i++) {
          const a = pts[i - 1], b = pts[i], d = b.distanceTo(a) || 1e-4;
          b.sub(a).multiplyScalar(seg / d).add(a);
        }
      }
      // Rebuild the ribbon facing the camera
      const cam = view.camera.position, pos = S.geo.attributes.position.array;
      for (let i = 0; i < n; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
        const dir = this.tmp.copy(b).sub(a).normalize();
        const toCam = new THREE.Vector3().copy(cam).sub(pts[i]).normalize();
        const side = new THREE.Vector3().crossVectors(dir, toCam).normalize().multiplyScalar(C.w * (1 - i / n * C.taper));
        pos.set([pts[i].x + side.x, pts[i].y + side.y, pts[i].z + side.z, pts[i].x - side.x, pts[i].y - side.y, pts[i].z - side.z], i * 6);
      }
      S.geo.attributes.position.needsUpdate = true; S.geo.computeVertexNormals();
      // The scarf shows its mode to everyone: off-white with orange edges (Tether), slate and
      // fading with the body (Veil), glowing along its whole length with rising embers (Flare)
      const mode = C.modes ? p.scarfMode || 'tether' : 'tether';
      if (S.mode !== mode) { S.mode = mode; S.mesh.material = S.mats[mode]; }
      if (mode === 'flare') {
        S.mats.flare.emissiveIntensity = 1.2 + Math.sin(performance.now() * 0.009) * 0.35;
        if (Math.random() < 0.45) this.burstAt(pts[1 + Math.floor(Math.random() * (n - 1))], C.flareEm, 1, 1.2, 0.18, 0.45);
      } else if (mode === 'veil') S.mats.veil.opacity = 1 - 0.8 * (rig.cloak || 0);
      else S.mat.emissiveIntensity = C.modes ? (fast || p.state === 'lash' || reel ? 1.6 : 0.5) : C.glow;
      S.mesh.visible = rig.root.visible;   // it goes with him (he vanishes during Thousand Cuts)
    }
    for (const [p, S] of this.scarves) if (!seen.has(p)) { this.scene.remove(S.mesh); this.scarves.delete(p); }
  }
  syncSnares(world) {
    this.snareMeshes = this.snareMeshes || new Map();
    const seen = new Set();
    for (const s of world.snares) {
      seen.add(s);
      let m = this.snareMeshes.get(s);
      if (!m) {
        m = new THREE.Group();
        m.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.46, 0.08, 20), new THREE.MeshStandardMaterial({ color: '#2a2a31', roughness: 0.5 })));
        const sc = fxPal(s.owner).energy, ring = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 24), new THREE.MeshStandardMaterial({ color: sc, emissive: sc, emissiveIntensity: 2 }));
        ring.rotation.x = Math.PI / 2; ring.position.y = 0.06; m.add(ring); m.userData.ring = ring;
        toWorld(s.x, s.y + 0.04, 0.35, m.position); this.scene.add(m); this.snareMeshes.set(s, m);
      }
      const armed = s.armT <= 0;
      m.userData.ring.material.emissiveIntensity = armed ? 1.6 + Math.sin(performance.now() * 0.012) * 0.9 : 0.4;
    }
    for (const [s, m] of this.snareMeshes) if (!seen.has(s)) { this.scene.remove(m); this.snareMeshes.delete(s); }
  }
  syncSnaredRings(world) {
    this.bands = this.bands || new Map();
    const seen = new Set();
    for (const e of world.enemies) {
      if (e.dead || e.state !== 'snared') continue;
      seen.add(e);
      let g = this.bands.get(e);
      if (!g) {
        g = new THREE.Group();
        const bc = fxPal(e.snaredBy).energy, mat = new THREE.MeshStandardMaterial({ color: bc, emissive: bc, emissiveIntensity: 2.4, transparent: true, opacity: 0.85 });
        for (const f of [0.25, 0.55]) { const r = new THREE.Mesh(new THREE.TorusGeometry(e.w * 0.75, 0.04, 6, 24), mat); r.rotation.x = Math.PI / 2; r.position.y = e.h * f; g.add(r); }
        this.scene.add(g); this.bands.set(e, g);
      }
      toWorld(e.x, e.y, 0, g.position);
      g.rotation.y += 0.08;
    }
    for (const [e, g] of this.bands) if (!seen.has(e)) { this.scene.remove(g); this.bands.delete(e); }
  }

  makeScarf(p, rig, C) {
    const n = C.n, geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 6), 3));
    const uv = [], idx = [];
    for (let i = 0; i < n; i++) { uv.push(0, i / (n - 1), 1, i / (n - 1)); if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2)); geo.setIndex(idx);
    const tex = canvasTex(64, (g, s) => { g.fillStyle = C.fabric; g.fillRect(0, 0, s, s); g.fillStyle = C.edge; g.fillRect(0, 0, s * 0.12, s); g.fillRect(s * 0.88, 0, s * 0.12, s); });
    // Only the edges glow; the off-white fabric stays unlit
    const edges = canvasTex(64, (g, s) => { g.fillStyle = '#000'; g.fillRect(0, 0, s, s); g.fillStyle = '#fff'; g.fillRect(0, 0, s * 0.12, s); g.fillRect(s * 0.88, 0, s * 0.12, s); });
    const mat = new THREE.MeshStandardMaterial({ map: tex, emissive: C.edge, emissiveMap: edges, emissiveIntensity: C.modes ? 1.2 : C.glow, side: THREE.DoubleSide, roughness: 0.6 });
    const veilTex = canvasTex(64, (g, s) => { g.fillStyle = C.veil || '#7d8896'; g.fillRect(0, 0, s, s); g.fillStyle = C.veilEdge || '#e4f1ff'; g.fillRect(0, 0, s * 0.1, s); g.fillRect(s * 0.9, 0, s * 0.1, s); });
    const mats = {
      tether: mat,
      veil: new THREE.MeshStandardMaterial({ map: veilTex, emissive: C.veilEdge || '#cde8ff', emissiveMap: edges, emissiveIntensity: 0.8, side: THREE.DoubleSide, roughness: 0.4, transparent: true }),
      flare: new THREE.MeshStandardMaterial({ color: C.flare || '#ff9f3a', emissive: C.flareEm || '#ff7a00', emissiveIntensity: 1.3, side: THREE.DoubleSide, roughness: 0.5 }),
    };
    const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.castShadow = true; this.scene.add(mesh);
    const a = rig.collar.getWorldPosition(new THREE.Vector3());
    const pts = Array.from({ length: n }, (_, i) => a.clone().add(new THREE.Vector3(0, -i * 0.1, 0)));
    const S = { geo, mat, mats, mode: 'tether', mesh, pts, prev: pts.map(v => v.clone()), char: p.char };
    this.scarves.set(p, S); return S;
  }
}

const NOVA_GOLD = CHARS.nova.energy;
// Who wears cloth, and how it hangs: n points `seg` m apart, half-width `w` narrowing by `taper` to the end (a
// negative taper widens it, for a cape); `modes` shows the scarf modes; `glow` is the edge glow otherwise
const CLOTH = {
  echo: { n: 14, seg: 0.12, w: 0.09, taper: 0.55, modes: true, fabric: '#ecebe6', edge: '#ff9a1f', flareEm: '#ff7a00' },
  psylocke: { n: 15, seg: 0.12, w: 0.08, taper: 0.45, modes: true, fabric: '#c8203c', edge: '#c08cff', veil: '#2c2548', veilEdge: '#d9c6ff', flare: '#d77bff', flareEm: '#a64dff' },
  storm: { n: 10, seg: 0.125, w: 0.24, taper: -0.5, cape: true, modes: false, fabric: '#17171f', edge: '#e9edf5', glow: 0.12 },
  jean: { n: 7, seg: 0.1, w: 0.055, taper: 0.3, modes: false, fabric: '#f0c23a', edge: '#ffe08a', glow: 0.35 },
};
const DUST = '#b9c1cb';
const ECHO_ORANGE = CHARS.echo.energy;
const VEIL_PALE = '#dcecff';
const SPIN = new Set(['std', 'heavy', 'snare', 'shell', 'prism', 'mortar', 'grenade', 'bomblet', 'missile']);
const KIND_TINT = { dart: ATTACH_LOOK.volley.tint, shell: ATTACH_LOOK.arc.tint, prism: ATTACH_LOOK.prism.tint, shard: ATTACH_LOOK.prism.tint, pellet: '#ffcf7a',
  grenade: SUB_LOOK.grenade.tint, bomblet: SUB_LOOK.grenade.tint, disc: SUB_LOOK.disc.tint };
function trailColor(pr) {
  if (pr.team === 'e' && !pr.deflected) return pr.owner && pr.owner.type === 'warden' ? '#b3aa9e' : HOSTILE;
  const o = pr.owner && pr.owner.kind === 'player' ? pr.owner : null, P = fxPal(o);
  if (pr.deflected || pr.kind === 'wave' || pr.kind === 'bolt' || pr.kind === 'tracer' || pr.kind === 'rifle' || pr.kind === 'markShot') return P.energy;
  const who = o || { char: 'nova' };
  const tint = { dart: attachLook(who, 'volley').tint, shell: attachLook(who, 'arc').tint, prism: attachLook(who, 'prism').tint, shard: attachLook(who, 'prism').tint,
    lance: attachLook(who, 'lance').tint, pellet: subLook(who, 'scatter').tint, grenade: subLook(who, 'grenade').tint, bomblet: subLook(who, 'grenade').tint, disc: subLook(who, 'disc').tint }[pr.kind];
  return tint || P.energy;
}

// Impact frame (Q-C test), sci-fi look since Version 9, phased: `invert` is the opening flash, a cyan
// photonegative white-hot at the impact; then the frame turns to a hologram: deep teal shadows, cyan mids,
// glowing cyan edges (the brightest, most saturated light keeps its colour), scanlines and a faint hex grid,
// light streaks radiating from the impact, a shockwave `ring` bending the image as it spreads, `glitch`
// slices tearing sideways, a `zoom` toward the impact and a radial colour `split`; `amount` blends it all
// back out. `dim` (with amount 0) drains colour and light from everything but what glows, for an
// ultimate's call.
export const ImpactShader = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 0 }, res: { value: new THREE.Vector2(1280, 720) }, center: { value: new THREE.Vector2(0.5, 0.5) },
    invert: { value: 0 }, zoom: { value: 0 }, split: { value: 0 }, seed: { value: 0 }, time: { value: 0 }, ring: { value: -1 }, glitch: { value: 0 }, dim: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float amount, invert, zoom, split, seed, time, ring, glitch, dim; uniform vec2 res, center; varying vec2 vUv;
    float hash(float n) { return fract(sin(n) * 43758.5453); }
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    float hexEdge(vec2 p) {
      vec2 r = vec2(1.0, 1.732), h = r * 0.5, a = mod(p, r) - h, b = mod(p - h, r) - h, g = dot(a, a) < dot(b, b) ? a : b;
      g = abs(g); return smoothstep(0.43, 0.5, max(dot(g, normalize(r)), g.x));
    }
    void main(){
      vec4 src = texture2D(tDiffuse, vUv);
      if (amount <= 0.0 && dim <= 0.0) { gl_FragColor = src; return; }
      vec2 asp = vec2(res.x / res.y, 1.0), d = vUv - center, dir = normalize(d * asp + vec2(1e-5));
      float r = length(d * asp);
      if (amount <= 0.0) {
        float l0 = luma(src.rgb), keep = smoothstep(0.72, 1.05, max(max(src.r, src.g), src.b));
        vec3 cool = vec3(l0) * vec3(0.46, 0.62, 0.8) * 0.55;
        gl_FragColor = vec4(mix(src.rgb, mix(cool, src.rgb, keep), dim), 1.0); return;
      }
      float wv = ring - r, rm = ring > 0.0 ? exp(-wv * wv * 900.0) : 0.0;
      vec2 uv = center + d * (1.0 - zoom) - dir / asp * rm * 0.03;
      float band = floor(vUv.y * 30.0), g = step(0.84, hash(band * 1.31 + floor(time * 24.0) * 3.7 + seed)) * glitch;
      uv.x += (hash(band * 7.13 + seed + floor(time * 24.0)) - 0.5) * 0.09 * g;
      vec2 off = dir / asp * (split + g * 0.012);
      vec3 c = vec3(texture2D(tDiffuse, uv + off).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - off).b);
      float l = luma(c);
      vec2 px = 1.5 / res;
      float e = abs(luma(texture2D(tDiffuse, uv + px * vec2(-1.0, 1.0)).rgb) - luma(texture2D(tDiffuse, uv + px * vec2(1.0, -1.0)).rgb))
              + abs(luma(texture2D(tDiffuse, uv + px).rgb) - luma(texture2D(tDiffuse, uv - px).rgb));
      float edge = clamp(e * 3.2, 0.0, 1.0);
      vec3 holo = mix(vec3(0.01, 0.035, 0.065), vec3(0.22, 0.8, 1.0), smoothstep(0.04, 0.95, l)) + vec3(0.55, 0.96, 1.0) * edge * 1.5;
      float sat = max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
      holo = mix(holo, c * 1.3, smoothstep(0.3, 0.6, sat) * smoothstep(0.5, 0.85, l));
      holo *= 0.86 + 0.14 * sin(vUv.y * res.y * 1.35 - time * 40.0);
      holo += vec3(0.3, 0.8, 1.0) * hexEdge(vUv * asp * 26.0) * 0.14 * (1.0 - smoothstep(0.15, 0.85, r));
      float a = (atan(dir.y, dir.x) + 3.14159) / 6.28318, cell = floor(a * 96.0), w = hash(cell * 1.37 + seed), bnd = fract(a * 96.0);
      holo += vec3(0.6, 0.95, 1.0) * step(0.6, w) * smoothstep(0.12, 0.0, abs(bnd - 0.5)) * smoothstep(0.1 + 0.2 * w, 0.42 + 0.3 * w, r) * 0.6;
      holo += vec3(0.5, 0.92, 1.0) * rm * 0.75;
      vec3 neg = (vec3(1.0) - c).bgr * vec3(0.5, 0.92, 1.15);
      neg = mix(neg, vec3(0.9, 0.99, 1.0), smoothstep(0.24, 0.0, r));
      gl_FragColor = vec4(mix(c, mix(holo, neg, invert), amount), 1.0);
    }`,
};
