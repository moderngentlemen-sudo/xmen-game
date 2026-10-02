// The view: three.js scene, the set, the camera that frames the whole team, every character and prop synced
// from the simulation each frame (interpolated between ticks), and the comic pass on top.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ComicShader, toon } from './toon.js';
import { DistortShader } from './vfx/post.js';
import { MOVES } from './sim/config.js';
import { HERO_LOOKS } from './looks.js';
import { buildSet, updateSet, ROOMS } from './level3d.js';
import { buildHeroRig, buildKidRig } from './rigs.js';
import { animateHero, animateKid } from './anim.js';
import { buildSentinelRig, animateSentinel } from './sentinels.js';
import { FX, fxTextures } from './fx.js';
import { PLAYER_COLORS, HOSTILE } from './looks.js';
import { SETTINGS } from './settings.js';

const FOV = 34;   // matches the simulation's framing (it frames with tan(17 degrees))
const ADAPT_SHEEN = { optic: '#7fe8ff', claws: '#f2f6fb', tk: '#8f7bff' };

function disposeTree(root) {
  root.traverse(o => {
    if (o.geometry && !o.isSprite) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
  });
}

export class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.r = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.r.toneMapping = THREE.NoToneMapping;
    this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog('#a07ab0', 70, 300);
    this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 600);
    this.cam = { x: 2, y: 3, dist: 16 };
    this.trauma = 0; this.time = 0;
    this.prev = new Map();
    this.rigs = new Map(); this.enemyRigs = new Map(); this.crates = new Map(); this.kidRig = null;

    this.hemi = new THREE.HemisphereLight('#c9a2e8', '#4b2f4f', 1.0); this.scene.add(this.hemi);
    this.key = new THREE.DirectionalLight('#ffc58a', 2.5);
    this.key.castShadow = true; this.key.shadow.mapSize.set(2048, 2048);
    const sc = this.key.shadow.camera; sc.left = -28; sc.right = 28; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 90;
    this.key.shadow.bias = -0.0008; this.key.shadow.normalBias = 0.04;
    this.scene.add(this.key); this.scene.add(this.key.target);
    this.fill = new THREE.AmbientLight('#ffffff', 0.55); this.scene.add(this.fill);

    this.tex = fxTextures();
    this.fx = new FX(this.scene, this.tex);
    this.set = buildSet(this.scene, this.tex);
    this.crateMat = toon('#9a6a3c'); this.crateEdge = toon('#5e3d22');
    this.crateGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);

    // Render into a target that keeps its depth, so the comic pass can ink the edges
    const rt = new THREE.WebGLRenderTarget(1280, 720, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1280, 720) });
    this.composer = new EffectComposer(this.r, rt);
    this.renderPass = new RenderPass(this.scene, this.camera);
    this.comic = new ShaderPass(ComicShader);
    this.output = new OutputPass();
    this.distortPass = new ShaderPass(DistortShader);   // the distortion rings (vfx/post.js)
    this.composer.addPass(this.renderPass); this.composer.addPass(this.comic); this.composer.addPass(this.distortPass); this.composer.addPass(this.output);
  }

  resize(w, h) {
    this.r.setSize(w, h, false);
    this.composer.setSize(w, h);
    const pr = this.r.getPixelRatio();
    this.comic.uniforms.resolution.value.set(w * pr, h * pr);
    this.comic.uniforms.width.value = Math.max(1.4, pr * 1.4);
    this.comic.uniforms.dotSize.value = 5 * pr;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.w = w; this.h = h;
  }

  // A new run: drop every rig (entity ids start again from 1)
  reset() {
    for (const rig of this.rigs.values()) { this.scene.remove(rig.root); disposeTree(rig.root); }
    for (const R of this.enemyRigs.values()) { this.scene.remove(R.root); disposeTree(R.root); }
    for (const m of this.crates.values()) this.scene.remove(m);
    this.rigs.clear(); this.enemyRigs.clear(); this.crates.clear(); this.prev.clear();
  }

  // Positions before a tick, so rendering can interpolate between ticks
  beforeStep(S) {
    const P = this.prev;
    for (const L of [S.players, S.enemies, S.props, S.assists]) for (const e of L) P.set(e.id, [e.x, e.y]);
    if (S.kid) P.set(-1, [S.kid.x, S.kid.y]);
  }
  lerpPos(e, alpha) { const q = this.prev.get(e.id); return q ? [q[0] + (e.x - q[0]) * alpha, q[1] + (e.y - q[1]) * alpha] : [e.x, e.y]; }

  onEvent(ev, S) {
    this.fx.onEvent(ev, S);
    const shake = { optic: ev.a > 0.6 ? 0.25 : 0.06, drill: 0.08 + 0.05 * (ev.tier || 0), playerHit: ev.heavy ? 0.35 : 0.15, kill: ev.unit === 'mk2' ? 1 : ev.unit === 'collector' ? 0.45 : 0.18,
      slam: ev.big ? 0.6 : 0.35, bossLand: 0.7, bossPhase: 0.6, fastballSlam: 0.55, ultStrike: 0.9, teamup: 0.15, armourBreak: 0.3, doorBroken: 0.4, perfect: 0.18, berserk: 0.3,
      thrownImpact: 0.25, vault: 0.12, downed: 0.3 }[ev.type];
    if (shake) this.trauma = Math.min(1, this.trauma + shake);
    if (ev.type === 'doorHit' && this.set.door) this.set.door.shake = 1;
  }

  syncEntities(S, alpha, dt) {
    const t = this.time;
    const seen = new Set();
    // Heroes on the field, and benched heroes called in for an assist
    for (const p of [...S.players, ...S.assists]) {
      seen.add(p.id);
      let rig = this.rigs.get(p.id);
      if (!rig || rig.hero !== p.hero) {
        if (rig) { this.scene.remove(rig.root); disposeTree(rig.root); }
        const col = p.kind === 'assist' ? '#ffffff' : PLAYER_COLORS[p.slot] || '#ffffff';
        rig = buildHeroRig(p.hero, col);
        if (p.kind !== 'assist') {
          const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.58, 32), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.75, depthWrite: false }));
          ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; rig.root.add(ring); rig.ring = ring;
        }
        this.scene.add(rig.root); this.rigs.set(p.id, rig);
      }
      const [x, y] = this.lerpPos(p, alpha);
      rig.root.position.set(x, y, 0);
      rig.flip.scale.x = p.facing;
      animateHero(rig, p, dt, t);
      const blink = p.state === 'evade' && p.hero === 'jean' && p.evade && p.evade.t < 9 && Math.floor(t * 40) % 2 === 0;
      const mercy = p.mercy > 0 && !['downed', 'ult', 'held', 'thrown', 'teamup'].includes(p.state) && Math.floor(t * 14) % 2 === 0;
      rig.root.visible = p.state !== 'dead' && p.state !== 'tagout' && !blink && !mercy;
      if (rig.ring) rig.ring.visible = p.state !== 'downed' && p.onGround;
      // A trail behind the striking hand or foot, from just before the strike to just after it
      const m = p.move && MOVES[p.hero][p.move.id];
      const striking = p.state === 'attack' && m && m.su !== undefined && p.move.t >= m.su - 2 && p.move.t <= m.su + m.ac + 4;
      this.fx.trails.track(p.id, rig, striking && rig.root.visible, HERO_LOOKS[p.hero] ? HERO_LOOKS[p.hero].energy : '#ffffff', SETTINGS.clarity ? 0.12 : 0.22);
    }
    this.fx.trails.keep(seen);
    for (const [id, rig] of this.rigs) if (!seen.has(id)) { this.scene.remove(rig.root); disposeTree(rig.root); this.rigs.delete(id); }

    // Sentinels: adapted ones wear their counter-tech's sheen; while they study the team, a magenta pulse
    const A = S.adapt, sheen = A.active ? ADAPT_SHEEN[A.active] : null, warn = !!A.warn;
    const seenE = new Set();
    for (const e of S.enemies) {
      seenE.add(e.id);
      let R = this.enemyRigs.get(e.id);
      if (!R) { R = buildSentinelRig(e); this.scene.add(R.root); this.enemyRigs.set(e.id, R); }
      const [x, y] = this.lerpPos(e, alpha);
      R.root.position.set(x, y, 0);
      animateSentinel(R, e, dt, t);
      R.root.visible = !(e.dead && e.deathT > 40);
      const rim = R.mats.plate.userData.rim;
      if (rim) {
        if (warn) { rim.rimColor.value.set(HOSTILE); rim.rimStrength.value = 0.6 + 0.6 * Math.max(0, Math.sin(t * 14)); }
        else if (sheen) { rim.rimColor.value.set(sheen); rim.rimStrength.value = 1.3; }
        else { rim.rimColor.value.set('#ff9cc5'); rim.rimStrength.value = 0.35; }
      }
    }
    for (const [id, R] of this.enemyRigs) if (!seenE.has(id)) { this.scene.remove(R.root); disposeTree(R.root); this.enemyRigs.delete(id); }

    // The kid
    const k = S.kid;
    if (k) {
      if (!this.kidRig) { this.kidRig = buildKidRig(); this.scene.add(this.kidRig.root); }
      const [x, y] = this.lerpPos(k, alpha);
      this.kidRig.root.position.set(x, y, 0);
      this.kidRig.flip.scale.x = k.facing || 1;
      animateKid(this.kidRig, k, dt, t);
      this.kidRig.root.visible = k.state !== 'boarded' && !(k.mercy > 0 && Math.floor(t * 14) % 2 === 0);
    } else if (this.kidRig) this.kidRig.root.visible = false;

    // Crates
    const seenC = new Set();
    for (const c of S.props) {
      seenC.add(c.id);
      let m = this.crates.get(c.id);
      if (!m) {
        m = new THREE.Group();
        const b = new THREE.Mesh(this.crateGeo, this.crateMat); b.castShadow = true; m.add(b);
        for (const [sx, sy] of [[1, 0.12], [0.12, 1]]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.92 * sx + 0.02, 0.92 * sy + 0.02, 0.94), this.crateEdge); m.add(s); }
        this.scene.add(m); this.crates.set(c.id, m);
      }
      const [x, y] = this.lerpPos(c, alpha);
      m.position.set(x, y + 0.45, -0.6);
      if (c.thrown) { m.rotation.z -= dt * 12 * Math.sign(c.vx || 1); } else if (c.heldBy) m.rotation.z += dt * 2; else m.rotation.z *= Math.exp(-dt * 8);
    }
    for (const [id, m] of this.crates) if (!seenC.has(id)) { this.scene.remove(m); this.crates.delete(id); }
  }

  updateCamera(S, dt) {
    const T = S.cam, U = S.ult;
    let tx = T.x, ty = T.y, td = T.dist, rate = 5;
    if (U && U.phase === 'cast') { td = Math.max(9, T.dist * 0.65); rate = 8; }   // the call pushes in on the team
    const k = 1 - Math.exp(-dt * rate);
    const ky = 1 - Math.exp(-dt * (rate + Math.max(0, Math.abs(ty - this.cam.y) - 1.2) * 5));
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * ky; this.cam.dist += (td - this.cam.dist) * k;
    this.trauma = Math.max(0, this.trauma - dt * 1.8);
    const d = this.cam.dist;
    this.camera.position.set(this.cam.x, this.cam.y + d * 0.08, d);
    if (SETTINGS.shake && this.trauma > 0) {
      const s = this.trauma * this.trauma * 0.45;
      this.camera.position.x += (Math.random() - 0.5) * s; this.camera.position.y += (Math.random() - 0.5) * s;
    }
    this.camera.lookAt(this.cam.x, this.cam.y, 0);
    // The key light follows the action; the room's light blends across each doorway
    this.key.position.set(this.cam.x - 14, this.cam.y + 26, 24); this.key.target.position.set(this.cam.x, this.cam.y, 0);
    this.blendRoom(this.cam.x, dt);
  }
  blendRoom(x, dt) {
    let i = ROOMS.findIndex(r => x < r.x1); if (i < 0) i = ROOMS.length - 1;
    const R = ROOMS[i], next = ROOMS[Math.min(ROOMS.length - 1, i + 1)], band = 6, f = Math.max(0, Math.min(1, (x - (R.x1 - band)) / band)) * (next !== R ? 0.5 : 0);
    const mix = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), f);
    const k = 1 - Math.exp(-dt * 3);
    this.hemi.color.lerp(mix(R.sky, next.sky), k); this.hemi.groundColor.lerp(mix(R.ground, next.ground), k);
    this.key.color.lerp(mix(R.key, next.key), k); this.key.intensity += (R.keyK - this.key.intensity) * k;
    this.scene.fog.color.lerp(mix(R.fog, next.fog), k);
  }

  render(S, alpha, dt) {
    this.time += dt;
    this.syncEntities(S, alpha, dt);
    this.updateCamera(S, dt);
    updateSet(this.set, S, dt, this.time);
    this.fx.update(dt, S, this.time);
    const U = this.distortPass.uniforms;
    U.aspect.value = this.w && this.h ? this.w / this.h : 16 / 9;
    this.fx.distort.update(dt, (x, y) => { const s = this.screenOf(x, y); return [s.x / (this.w || 1), 1 - s.y / (this.h || 1)]; }, U.rings.value);
    this.distortPass.enabled = U.rings.value.some((v, i) => i % 4 === 3 && v > 0);
    const low = SETTINGS.quality === 'low';
    this.r.shadowMap.enabled = !low;
    this.comic.uniforms.cameraNear.value = this.camera.near; this.comic.uniforms.cameraFar.value = this.camera.far;
    this.comic.uniforms.halftone.value = low ? 0 : 1;
    this.composer.render(dt);
  }

  // A simulation point to CSS pixels on the canvas
  screenOf(x, y, out = { x: 0, y: 0, vis: true }) {
    const v = new THREE.Vector3(x, y, 0).project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.w; out.y = (-v.y * 0.5 + 0.5) * this.h; out.vis = v.z < 1;
    return out;
  }
  // Mouse aim: the direction from a hero's chest to the pointer, in simulation space
  aimFromMouse(mx, my, p) {
    const c = this.screenOf(p.x, p.y + p.h * 0.7);
    const dx = mx - c.x, dy = -(my - c.y), m = Math.hypot(dx, dy);
    return m < 6 ? null : [dx / m, dy / m];
  }
}
