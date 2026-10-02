// Effects, driven by the simulation's events and state: optic beams that bank off walls, claw slashes and the
// Drill Claw's streak, Jean's grip and shield, team-up flashes, Sentinel shots and tells, hits, wrecks. Each event
// plays its cue (vfx/cues.js); effects that last as long as a state are drawn from it every frame (update).
// Particles are pooled sprites; beams are ribbons in the play plane. Colours follow looks.js: every threat in
// hostile magenta (or violet for unblockables), every hero effect in that hero's power colour.
import * as THREE from 'three';
import { HOSTILE, TELL, POWER_COLORS } from './looks.js';
import { HEROES, ENEMIES } from './sim/config.js';
import { groundBelow } from './sim/level.js';
import { CUES, MOVE_FX } from './vfx/cues.js';
import { MOVES } from './sim/config.js';
import { GpuParticles } from './vfx/particles.js';
import { LightPool } from './vfx/lights.js';
import { Decals } from './vfx/decals.js';
import { Trails } from './vfx/trails.js';
import { DistortRings } from './vfx/post.js';
import { SETTINGS } from './settings.js';

function tex(size, draw) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function fxTextures() {
  return {
    glow: tex(64, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, s, s); }),
    star: tex(64, (g, s) => { g.translate(s / 2, s / 2); g.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, -s * 0.48); g.lineTo(s * 0.07, 0); g.lineTo(-s * 0.07, 0); g.fill(); } g.beginPath(); g.arc(0, 0, s * 0.1, 0, 7); g.fill(); }),
    ring: tex(128, (g, s) => { g.strokeStyle = '#fff'; g.lineWidth = s * 0.07; g.beginPath(); g.arc(s / 2, s / 2, s * 0.42, 0, 7); g.stroke(); }),
    slash: tex(128, (g, s) => { g.translate(s / 2, s / 2); for (const [w, a] of [[0.16, 0.9], [0.08, 1]]) { g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = s * w; g.lineCap = 'round'; g.beginPath(); g.arc(0, 0, s * 0.36, -1.1, 1.1); g.stroke(); } }),
    smoke: tex(64, (g, s) => { const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2); r.addColorStop(0, 'rgba(255,255,255,0.9)'); r.addColorStop(0.7, 'rgba(255,255,255,0.5)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.beginPath(); g.arc(s / 2, s / 2, s / 2, 0, 7); g.fill(); }),
    reticle: tex(128, (g, s) => { g.strokeStyle = '#fff'; g.lineWidth = 7; g.beginPath(); g.arc(s / 2, s / 2, s * 0.32, 0, 7); g.stroke(); for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.beginPath(); g.moveTo(s / 2 + Math.cos(a) * s * 0.18, s / 2 + Math.sin(a) * s * 0.18); g.lineTo(s / 2 + Math.cos(a) * s * 0.47, s / 2 + Math.sin(a) * s * 0.47); g.stroke(); } }),
  };
}

const V = new THREE.Vector3();
export class FX {
  constructor(scene, tex) {
    this.scene = scene; this.tex = tex;
    this.parts = []; this.free = [];
    this.beams = [];   // fading ribbons
    this.rings = [];
    this.debris = [];
    this.persist = new Map();   // per-entity effects that follow state (shield bubbles, grips, marks)
    this.ribbonMat = c => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.debrisGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22);
    this.debrisMats = { sentinel: new THREE.MeshToonMaterial({ color: '#6d3aa8' }), grey: new THREE.MeshToonMaterial({ color: '#b2bac8' }), wood: new THREE.MeshToonMaterial({ color: '#8a5a32' }), steel: new THREE.MeshToonMaterial({ color: '#7d8698' }) };
    // The shield bubble, the grip aura and the mark reticle are reused per entity
    this.shieldGeo = new THREE.SphereGeometry(1, 28, 18);
    // Phase 1's effect tools (vfx/): GPU sparks, the fixed light pool, floor decals, bone trails, distortion rings
    this.gpu = new GpuParticles(scene);
    this.lights = new LightPool(scene);
    this.decals = new Decals(scene);
    this.trails = new Trails(scene);
    this.distort = new DistortRings();
  }
  // Clarity thins the particles out so a crowded fight stays readable; Reduce flashing tames flashes and lights
  get thin() { return SETTINGS.clarity ? 0.5 : 1; }
  light(x, y, color, intensity = 4, reach = 8, life = 0.2) { this.lights.flash(x, y, color, intensity * (SETTINGS.reduceFlashing ? 0.35 : 1), reach, life); }
  decal(x, y, size = 2, life = 8) { this.decals.add(x, y, size, life); }
  ripple(x, y, strength = 1, life = 0.45, size = 0.35) { this.distort.add(x, y, strength * (SETTINGS.reduceFlashing ? 0.5 : 1), life, size); }

  // ---- Particles --------------------------------------------------------------------------------------------
  spawn(o) {
    let p = this.free.pop();
    if (!p) {
      if (this.parts.length > 700) return null;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      p = { s }; this.scene.add(s);
    }
    const m = p.s.material;
    m.map = this.tex[o.tex || 'glow']; m.color.set(o.color || '#ffffff'); m.blending = o.normal ? THREE.NormalBlending : THREE.AdditiveBlending; m.rotation = o.rot || 0; m.opacity = o.op ?? 1;
    Object.assign(p, { x: o.x, y: o.y, z: o.z || 0.3, vx: o.vx || 0, vy: o.vy || 0, g: o.g || 0, drag: o.drag ?? 2, life: 0, max: o.life || 0.4, s0: o.s0 ?? 0.6, s1: o.s1 ?? 0, op: o.op ?? 1, spin: o.spin || 0, stretch: o.stretch || 0 });
    p.s.visible = true;
    this.parts.push(p);
    return p;
  }
  // Sparks go to the GPU pool: one draw call however many there are
  sparks(x, y, color, n = 8, speed = 9, life = 0.3) {
    n = Math.max(1, Math.round(n * this.thin));
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8); this.gpu.add(x, y, 0.3 + (Math.random() - 0.5) * 0.4, Math.cos(a) * v, Math.sin(a) * v + 2, 18, 2, color, 0.3, 0.03, life * (0.6 + Math.random() * 0.6)); }
  }
  flash(x, y, color, size = 2, life = 0.12, tex = 'glow') {
    if (SETTINGS.reduceFlashing) { size = Math.min(size, 2.4) * 0.7; color = color === '#ffffff' ? '#c8c8c8' : color; }
    this.spawn({ x, y, color, s0: size, s1: size * 1.4, life, tex, op: SETTINGS.reduceFlashing ? 0.5 : 1 });
  }
  smoke(x, y, n = 6, color = '#4a4458', size = 1.4) {
    n = SETTINGS.clarity ? Math.ceil(n / 3) : n;
    for (let i = 0; i < n; i++) this.spawn({ x: x + (Math.random() - 0.5), y: y + Math.random() * 0.6, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, drag: 1.5, color, normal: true, tex: 'smoke', s0: size * 0.5, s1: size * (1.2 + Math.random()), life: 0.7 + Math.random() * 0.5, op: 0.6 });
  }
  ring(x, y, color, r0 = 0.3, r1 = 3, life = 0.3, flat = false) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.tex.ring, color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(x, y, 0.4); if (flat) m.rotation.x = -Math.PI / 2;
    this.scene.add(m); this.rings.push({ m, r0, r1, life: 0, max: life });
  }
  chunks(x, y, kind, n = 8, speed = 8) {
    const mat = this.debrisMats[kind] || this.debrisMats.grey;
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(this.debrisGeo, mat); const s = 0.6 + Math.random() * 1.2; m.scale.set(s, s * 0.7, s);
      m.position.set(x + (Math.random() - 0.5) * 0.6, y + Math.random() * 0.6, (Math.random() - 0.5) * 0.8); m.castShadow = true; this.scene.add(m);
      const a = Math.random() * Math.PI, v = speed * (0.4 + Math.random() * 0.8);
      this.debris.push({ m, vx: Math.cos(a) * v, vy: Math.abs(Math.sin(a)) * v + 3, vz: (Math.random() - 0.5) * 4, life: 0, max: 0.9 + Math.random() * 0.5, sx: Math.random() * 10, sz: Math.random() * 10 });
    }
  }
  // A ribbon along a polyline in the play plane, fading out
  ribbon(pts, width, color, life = 0.16, z = 0.35) {
    const pos = [], idx = [];
    for (let i = 0; i < pts.length; i++) {
      const [x, y] = pts[i], [ax, ay] = pts[Math.max(0, i - 1)], [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
      let dx = bx - ax, dy = by - ay; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
      pos.push(x - dy * width / 2, y + dx * width / 2, z, x + dy * width / 2, y - dx * width / 2, z);
      if (i > 0) { const b = (i - 1) * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    const m = new THREE.Mesh(g, this.ribbonMat(color)); this.scene.add(m);
    this.beams.push({ m, life: 0, max: life });
    return m;
  }

  // ---- Events: each plays its cue (vfx/cues.js) -------------------------------------------------------------
  onEvent(ev, S) {
    const cue = CUES[ev.type];
    if (cue) cue(this, ev, S);
  }

  // ---- Per-frame: state-driven effects and the particle pool ------------------------------------------------
  update(dt, S, t) {
    // Projectiles: Sentinel bolts in magenta, returned shots and edge waves in the team's colours
    this.gpu.update(dt); this.lights.update(dt); this.decals.update(dt);
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.life += dt;
      if (p.life >= p.max) { p.s.visible = false; this.parts.splice(i, 1); this.free.push(p); continue; }
      const k = p.life / p.max, dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vy = p.vy * dr - p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
      const sz = p.s0 + (p.s1 - p.s0) * k;
      p.s.position.set(p.x, p.y, p.z);
      if (p.stretch) { const sp = Math.hypot(p.vx, p.vy); p.s.scale.set(sz * (1 + sp * 0.06), sz, 1); p.s.material.rotation = Math.atan2(p.vy, p.vx); }
      else { p.s.scale.set(sz, sz, 1); p.s.material.rotation += p.spin * dt; }
      p.s.material.opacity = p.op * (1 - k * k);
    }
    for (let i = this.beams.length - 1; i >= 0; i--) {
      const b = this.beams[i]; b.life += dt;
      if (b.life >= b.max) { this.scene.remove(b.m); b.m.geometry.dispose(); b.m.material.dispose(); this.beams.splice(i, 1); continue; }
      b.m.material.opacity = 1 - b.life / b.max;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.life += dt; const k = r.life / r.max;
      if (k >= 1) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.rings.splice(i, 1); continue; }
      const s = (r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k))) * 2; r.m.scale.set(s, s, s); r.m.material.opacity = 1 - k;
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]; d.life += dt;
      if (d.life >= d.max) { this.scene.remove(d.m); this.debris.splice(i, 1); continue; }
      d.vy -= 26 * dt; d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
      // Bounce on whatever floor is below (walkways and the hangar included), then settle there
      if (d.vy < 0) { const g = groundAt(d.m.position.x, d.m.position.y); if (d.m.position.y < g + 0.08) { d.m.position.y = g + 0.08; d.vy *= -0.35; d.vx *= 0.6; d.vz *= 0.6; d.sx *= 0.5; d.sz *= 0.5; } }
      d.m.rotation.x += d.sx * dt; d.m.rotation.z += d.sz * dt;
      const sc = d.life > d.max - 0.25 ? (d.max - d.life) / 0.25 : 1; d.m.scale.multiplyScalar(sc < 1 ? 0.96 : 1);
    }
    // State-driven effects last, after the fading above, so a short-lived ribbon made this frame is drawn at least once
    this.syncProjectiles(S);
    this.syncPersistent(S, t);
  }

  syncProjectiles(S) {
    const seen = this.projSeen || (this.projSeen = new Map());
    const live = new Set();
    for (const pr of S.projectiles) {
      live.add(pr.id);
      let o = seen.get(pr.id);
      if (!o) {
        const color = pr.team === 'e' ? HOSTILE : pr.kind === 'wave' ? POWER_COLORS.optic : POWER_COLORS[pr.power] || POWER_COLORS.tk;
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex[pr.kind === 'wave' ? 'slash' : 'glow'], color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        this.scene.add(s); this.scene.add(core); o = { s, core, team: pr.team }; seen.set(pr.id, o);
      }
      if (o.team !== pr.team) { o.s.material.color.set(POWER_COLORS[pr.power] || POWER_COLORS.tk); o.team = pr.team; }
      const big = pr.kind === 'wave' ? 1.6 : pr.kind === 'returned' ? 1.1 : 0.75;
      o.s.position.set(pr.x, pr.y, 0.35); o.s.scale.set(big * 1.5, big, 1); o.s.material.rotation = Math.atan2(pr.vy, pr.vx);
      o.core.position.set(pr.x, pr.y, 0.36); o.core.scale.set(big * 0.45, big * 0.45, 1);
      if (Math.random() < 0.5) this.spawn({ x: pr.x, y: pr.y, color: o.s.material.color.getStyle(), s0: big * 0.4, s1: 0, life: 0.12 });
    }
    for (const [id, o] of seen) if (!live.has(id)) { this.scene.remove(o.s); this.scene.remove(o.core); o.s.material.dispose(); o.core.material.dispose(); seen.delete(id); }
  }

  // Effects that last as long as a state: Jean's shield bubbles, grip auras and tethers, lifted Sentinels,
  // Hunter aim beams and marks, the called target's reticle, the Mk-II's eye beam, adaptation sheen
  syncPersistent(S, t) {
    const want = new Set();
    const get = (key, make) => { want.add(key); let o = this.persist.get(key); if (!o) { o = make(); this.persist.set(key, o); } return o; };
    const sprite = (map, color, blend = THREE.AdditiveBlending) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, blending: blend })); this.scene.add(s); return s; };
    for (const p of [...S.players, ...S.assists]) {
      // A move's own visual over its active ticks (vfx/cues.js, MOVE_FX)
      const mfx = p.move && p.state === 'attack' && MOVE_FX[p.hero] && MOVE_FX[p.hero][p.move.id];
      if (mfx) { const m = MOVES[p.hero][p.move.id]; if (p.move.t > m.su && p.move.t <= m.su + m.ac) mfx(this, p, m, (p.move.t - m.su) / m.ac); }
      if (p.shieldT > 0) {
        const o = get('shield' + p.id, () => {
          const m = new THREE.Mesh(this.shieldGeo, new THREE.MeshBasicMaterial({ color: POWER_COLORS.tk, transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false }));
          this.scene.add(m); return { m };
        });
        const r = HEROES.jean.shield.r * (1 + Math.sin(t * 8) * 0.02); o.m.position.set(p.shieldX, p.shieldY, 0); o.m.scale.setScalar(r);
        o.m.material.opacity = p.shieldT < 60 && Math.sin(t * 30) > 0 ? 0.08 : 0.18;
      }
      if (p.tk) {
        const tgt = entOf(S, p.tk.id);
        if (tgt) {
          const o = get('grip' + p.id, () => ({ aura: sprite(this.tex.glow, POWER_COLORS.tk), ring: sprite(this.tex.ring, POWER_COLORS.tk) }));
          const ty = tgt.y + (tgt.h || 0.3) / 2;
          o.aura.position.set(tgt.x, ty, 0.5); o.aura.scale.setScalar((tgt.w || 0.4) * 2.4 + Math.sin(t * 20) * 0.15);
          o.ring.position.set(tgt.x, ty, 0.5); o.ring.scale.setScalar((tgt.w || 0.4) * 2 + (t * 3 % 1) * 0.8); o.ring.material.opacity = 1 - (t * 3 % 1);
          if (Math.random() < 0.6) this.spawn({ x: p.x + p.facing * 0.4, y: p.y + p.h * 0.75, vx: (tgt.x - p.x) * 2.2, vy: (ty - p.y - p.h * 0.75) * 2.2, drag: 0, color: POWER_COLORS.tk, s0: 0.35, s1: 0.05, life: 0.4 });
        }
      }
      if (p.markedBy) {
        const o = get('mark' + p.id, () => ({ s: sprite(this.tex.reticle, HOSTILE) }));
        o.s.position.set(p.x, p.y + p.h + 0.55, 0.6); o.s.scale.setScalar(0.8 + Math.sin(t * 10) * 0.08); o.s.material.rotation = t * 2;
      }
      if (p.levitating) { if (Math.random() < 0.4) this.spawn({ x: p.x + (Math.random() - 0.5) * 0.5, y: p.y, vy: -2, color: POWER_COLORS.tk, s0: 0.4, s1: 0, life: 0.3 }); }
      if (p.berserkT > 0 && Math.random() < 0.5) this.spawn({ x: p.x + (Math.random() - 0.5) * 0.6, y: p.y + Math.random() * p.h, vy: 2.5, color: POWER_COLORS.rage, s0: 0.5, s1: 0, life: 0.3 });
      if (p.state === 'thrown' || p.state === 'drill') this.spawn({ x: p.x, y: p.y + 0.8, color: p.state === 'thrown' ? POWER_COLORS.team : POWER_COLORS.rage, s0: 1.2, s1: 0.1, life: 0.2 });
      if (p.openT > 0 && p.hero === 'cyclops') {
        const o = get('visor' + p.id, () => ({ s: sprite(this.tex.glow, POWER_COLORS.optic) }));
        const a = Math.min(1, p.openT / HEROES.cyclops.optic.open);
        o.s.position.set(p.x + p.facing * 0.15, p.y + p.h * 0.9, 0.6); o.s.scale.setScalar(0.5 + a * 1.2 + Math.sin(t * 40) * 0.08);
      }
    }
    for (const e of S.enemies) {
      if (e.dead) continue;
      if (e.liftT > 0) {
        const o = get('lift' + e.id, () => ({ s: sprite(this.tex.ring, POWER_COLORS.tk) }));
        o.s.position.set(e.x, e.y + e.h / 2, 0.6); o.s.scale.setScalar(e.h * 1.5 + Math.sin(t * 6) * 0.2); o.s.material.rotation = t;
      }
      if (e.type === 'hunter' && e.state === 'aim') {
        const q = entOf(S, e.target);
        if (q) {
          const o = get('aim' + e.id, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.ribbonMat(HOSTILE)); this.scene.add(m); return { m }; });
          const x0 = e.x + e.facing * 0.6, y0 = e.y + 0.95, x1 = q.x, y1 = q.y + q.h * 0.6, len = Math.hypot(x1 - x0, y1 - y0);
          o.m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0.3); o.m.rotation.z = Math.atan2(y1 - y0, x1 - x0);
          o.m.scale.set(len, 0.05 + (e.st / ENEMY_AIM) * 0.12, 1); o.m.material.opacity = 0.35 + 0.4 * (e.st / ENEMY_AIM) + (Math.sin(t * 30) > 0 ? 0.15 : 0);
        }
      }
      if (S.called && S.called.id === e.id) {
        const o = get('call' + e.id, () => ({ s: sprite(this.tex.reticle, '#ffd23f') }));
        o.s.position.set(e.x, e.y + e.h + 0.5, 0.7); o.s.scale.setScalar(1.1 + Math.sin(t * 8) * 0.1); o.s.material.rotation = -t * 1.5;
      }
      if (e.type === 'mk2' && (e.state === 'beam' || (e.state === 'windup' && e.atk && e.atk.kind === 'beam')) && e.atk && e.atk.span) {
        const L = e.atk.span, firing = e.state === 'beam';
        const o = get('beam' + e.id, () => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.ribbonMat(TELL.unblockable)); const g = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.ribbonMat('#ffffff')); this.scene.add(m); this.scene.add(g); return { m, g }; });
        const x0 = Math.min(L.x0, L.x1), x1 = Math.max(L.x0, L.x1);
        o.m.position.set((x0 + x1) / 2, (L.y0 + L.y1) / 2, 0.3); o.m.scale.set(x1 - x0, firing ? (L.y1 - L.y0) * 1.4 : 0.06, 1); o.m.material.opacity = firing ? 0.8 : 0.5 + 0.4 * Math.sin(t * 30);
        o.g.position.copy(o.m.position); o.g.scale.set(x1 - x0, firing ? 0.18 : 0.02, 1); o.g.visible = firing;
        if (firing && Math.random() < 0.8) this.sparks(L.x1, L.y, TELL.unblockable, 2, 6, 0.2);
      }
    }
    for (const [key, o] of this.persist) {
      if (want.has(key)) continue;
      for (const v of Object.values(o)) { this.scene.remove(v); v.geometry && v.geometry !== this.shieldGeo && !(v.isSprite) && v.geometry.dispose(); v.material && v.material.dispose(); }
      this.persist.delete(key);
    }
  }
}
const ENEMY_AIM = ENEMIES.hunter.mark.aim;
function entOf(S, id) {
  if (id === -1) return S.kid;
  for (const L of [S.players, S.enemies, S.props, S.assists, S.projectiles]) for (const e of L) if (e.id === id) return e;
  return null;
}
// The floor under a point, for debris to bounce on (a simple lookup of the level's surfaces)
const OPEN = { G1: false, G2: false, G3: false, cell: false };
function groundAt(x, y = 12) { const g = groundBelow(x, y + 0.3, OPEN); return g > -Infinity ? g : -20; }
