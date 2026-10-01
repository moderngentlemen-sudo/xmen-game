// The ultimates. The call: a pillar of light and rising energy around each caster (the render dims the rest
// of the world). The beam (Nova's Supernova, Cyclops's Optic Overload, Jean's Phoenix Force): light gathering
// into a small sun (at Cyclops's visor; Jean's spreads into wings of fire), the colossal beam they steer
// (rippling, throwing sparks and rings), then the burst. The cuts (Echo's Thousand Cuts, Wolverine's Berserker
// Barrage X, Psylocke's Thousand Butterflies): a storm of cuts, each leaving an afterimage beside its target
// (and three claw marks for Wolverine, a psychic butterfly for Psylocke), then every cut at once. Storm's Eye
// of the Storm: storm cloud over her, bolts of lightning from the sky onto every target, then the thunderclap.
// A team ultimate ends in an eclipse over the whole screen that shatters into light. Presentation only.
import * as THREE from 'three';
import { ULT, CHARS, fxPal } from './config.js';
import { toWorld, planeDir } from './space.js';
import { Strip } from './beamfx.js';

const CYAN = '#7fe3ff', GOLD = CHARS.nova.energy, ORANGE = CHARS.echo.energy;
// The colossal beam's three layers (halo, sheath, core) as linear RGB, per caster
const BEAM_LOOK = {
  nova: { halo: [0.3, 0.72, 1.0], sheath: [1.35, 0.92, 0.38], core: [2.1, 2.0, 1.75] },
  cyclops: { halo: [1.0, 0.2, 0.12], sheath: [1.7, 0.32, 0.22], core: [2.2, 1.7, 1.6] },
  jean: { halo: [1.0, 0.42, 0.08], sheath: [1.7, 0.75, 0.2], core: [2.2, 1.95, 1.5] },
};

export class UltFX {
  constructor(fx) {
    this.fx = fx; this.scene = fx.scene; this.t = 0;
    this.beams = new Map(); this.pending = []; this.lastCut = new Map();
    this.v = new THREE.Vector3(); this.v2 = new THREE.Vector3(); this.v3 = new THREE.Vector3();
    // The eclipse: a solid dark disc (ordinary blending, so it can darken) over a corona of light, with a thin
    // bright rim
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d'), grad = g.createRadialGradient(64, 64, 54, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(64, 64, 64, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(64, 64, 54, 0, Math.PI * 2); g.fill();
    const solid = new THREE.CanvasTexture(cv); solid.colorSpace = THREE.SRGBColorSpace;
    const sp = (map, blend, color, order) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map, color, transparent: true, depthWrite: false, depthTest: false, blending: blend })); s.visible = false; s.renderOrder = order; this.scene.add(s); return s; };
    this.eclipse = { disc: sp(solid, THREE.NormalBlending, 0x02040a, 12), corona: sp(fx.tex.glow, THREE.AdditiveBlending, 0xbff4ff, 11), ring: sp(fx.tex.ring, THREE.AdditiveBlending, 0xffffff, 12), t: -1 };
    // Storm's lightning from the sky: a pool of bolts, each a glow strip under a white core
    this.skyBolts = Array.from({ length: 8 }, () => ({ glow: new Strip(fx.scene, 6), core: new Strip(fx.scene, 7), life: 0, max: 1, top: null, bot: null, pts: [] }));
    // Psylocke's butterflies: sprites that drift up and fade
    this.flies = [];
  }
  // A jagged line from the sky to a point, redrawn every frame so it flickers
  skyBolt(x, y, top, big = false) {
    const b = this.skyBolts.find(q => q.life <= 0) || this.skyBolts.reduce((a, c) => (a.life < c.life ? a : c));
    b.x = x; b.y = y; b.top = top; b.life = b.max = big ? 0.32 : 0.2; b.big = big;
  }
  fly(x, y, color, size = 0.9, life = 0.9) {
    const F = this.fx, it = F.sprite(x, y, 'fly', color, size, life, 1.15, 0.5, 1, (Math.random() - 0.5) * 0.6);
    this.flies.push({ it, vy: 1.2 + Math.random(), vx: (Math.random() - 0.5) * 1.2, x, y, flap: Math.random() * 6 });
  }
  beamOf(p) {
    let B = this.beams.get(p); if (B) return B;
    const sp = (tex) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.fx.tex[tex], transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.visible = false; s.renderOrder = 7; this.scene.add(s); return s; };
    B = { halo: new Strip(this.scene, 4), sheath: new Strip(this.scene, 5), core: new Strip(this.scene, 6), sun: sp('glow'), sunCore: sp('glow'), flare: sp('star'), pts: [], ringT: 0, end: 1 };
    this.beams.set(p, B); return B;
  }
  after(secs, fn) { this.pending.push({ t: secs, fn }); }

  onEvent(ev) {
    const F = this.fx;
    switch (ev.type) {
      case 'ultCast': case 'ultJoin': {
        // A pillar of light around the caster, rings spreading over the floor, energy rising
        const p = ev.p, x = p.x, y = p.y, col = fxPal(p).energy;
        F.sprite(x, y + 3, 'glow', CYAN, 7.5, 0.9, 1.08, 0.1, 0.16); F.sprite(x, y + 3, 'glow', '#ffffff', 7, 0.5, 1.05, 0.12, 0.05);
        F.sprite(x, y + 1, 'star', '#ffffff', 3.2, 0.3, 1.6); F.sprite(x, y + 1, 'ring', CYAN, 1.2, 0.6, 4.5);
        F.groundRing(x, y, CYAN, 0.4, 4.5, 0.8, 0.9); F.groundRing(x, y, col, 0.3, 3, 0.6, 0.8);
        F.burst(x, y + 0.6, CYAN, 40, 7, 0.3, 0.8, { dir: Math.PI / 2, spread: 1.4, drag: 0.94, grav: -4 });
        F.burst(x, y + 1, col, 24, 5, 0.26, 0.6);
        F.dust(x, y, 0.8, [0, Math.PI]);
        break;
      }
      case 'ultRun': for (const m of ev.members) F.sprite(m.x, m.y + 1, 'star', '#ffffff', 2.4, 0.2, 1.5); break;
      case 'ultBegin':
        if (ev.kind === 'echo') {
          // They vanish: a burst of light and a ring (Psylocke into a cloud of butterflies)
          const p = ev.p, c = fxPal(p).energy; F.sprite(p.x, p.y + 1, 'ring', c, 1.1, 0.3, 3); F.burst(p.x, p.y + 1, c, 30, 8, 0.3, 0.4); F.burst(p.x, p.y + 1, '#ffffff', 14, 6, 0.22, 0.3);
          if (p.char === 'psylocke') for (let i = 0; i < 10; i++) this.fly(p.x + (Math.random() - 0.5) * 1.4, p.y + 0.6 + Math.random() * 1.4, i % 3 ? c : '#ffffff', 0.6 + Math.random() * 0.4);
          this.lastCut.set(p, { x: p.x, y: p.y + 1 });
        } else if (ev.kind === 'storm') {
          const p = ev.p; F.sprite(p.x, p.y + 1, 'ring', '#ffffff', 1.4, 0.35, 3.2); F.burst(p.x, p.y + 1, fxPal(p).energy, 30, 8, 0.3, 0.45);
        }
        break;
      case 'ultBolt': {
        // A bolt from the storm onto its target: a flash where it lands and a ring over the floor
        const P = fxPal(ev.p);
        this.skyBolt(ev.x, ev.y + ev.e.h * 0.55, ev.top);
        F.sprite(ev.x, ev.y + ev.e.h * 0.55, 'star', '#ffffff', 1.6, 0.12, 1.4); F.sprite(ev.x, ev.y + ev.e.h * 0.55, 'glow', P.energy, 1.8, 0.16, 1.6);
        F.burst(ev.x, ev.y + ev.e.h * 0.55, Math.random() < 0.5 ? '#ffffff' : P.energy, 14, 9, 0.24, 0.25);
        const fl = F.floorUnder(ev.x, ev.y, 1); if (fl !== null) F.groundRing(ev.x, fl, P.soft, 0.3, 1.6, 0.25, 0.8);
        break;
      }
      case 'ultThunder': {
        // The thunderclap: a great bolt on every target at once and a ring of lightning round her
        const P = fxPal(ev.p);
        for (const e of ev.targets) {
          this.skyBolt(e.x, e.y + e.h * 0.5, e.y + e.h + 14, true);
          F.sprite(e.x, e.y + e.h * 0.5, 'star', '#ffffff', 3.2, 0.2, 1.6); F.burst(e.x, e.y + e.h * 0.5, P.energy, 30, 12, 0.32, 0.4); F.burst(e.x, e.y + e.h * 0.5, '#ffffff', 16, 8, 0.24, 0.3);
          const fl = F.floorUnder(e.x, e.y, 1); if (fl !== null) { F.groundRing(e.x, fl, '#ffffff', 0.4, 2.6, 0.35, 0.9); F.dust(e.x, fl, 0.9); }
        }
        if (ev.flourish) { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; this.skyBolt(ev.x + Math.cos(a) * ev.r * 0.7, ev.y + Math.sin(a) * ev.r * 0.3, ev.y + 12, true); } }
        F.sprite(ev.x, ev.y, 'glow', '#ffffff', 9, 0.3, 1.5); F.sprite(ev.x, ev.y, 'ring', P.energy, 3, 0.5, 4);
        break;
      }
      case 'ultNova': {
        // The burst: light the size of its reach, rings, sparks, a column of smoke (Jean's spreads into wings of fire)
        const x = ev.x, y = ev.y, r = ev.r, P = fxPal(ev.p), GOLD = P.energy;
        F.sprite(x, y, 'star', '#ffffff', r * 1.6, 0.35, 1.6); F.sprite(x, y, 'glow', P.hot, r * 1.8, 0.45, 1.5);
        F.fireball(x, y, P.energy, r * 0.9, 0.5);
        if (ev.p && ev.p.char === 'jean') for (const k of [1, -1]) for (let i = 0; i < 3; i++) F.slashMark(x + k * (1.6 + i * 0.9), y + 0.9 + i * 0.5, i ? P.energy : P.hot, 6 - i, k * (0.45 + i * 0.25), 0.55);
        for (const [sz, life, g] of [[r * 0.5, 0.45, 4.4], [r * 0.35, 0.65, 6], [r * 0.2, 0.8, 8]]) F.sprite(x, y, 'ring', '#ffffff', sz, life, g);
        F.sprite(x, y, 'ring', CYAN, r * 0.4, 0.7, 5.5);
        F.burst(x, y, GOLD, 90, 18, 0.45, 0.8, { grav: 4 }); F.burst(x, y, '#ffffff', 50, 14, 0.3, 0.5);
        const fl = F.floorUnder(x, y, 4);
        if (fl !== null) { F.groundRing(x, fl, P.hot, 0.5, r * 1.3, 0.6, 0.95); F.dust(x, fl, 1.4, [0, Math.PI], { reach: 4 }); }
        F.smoke(x, y, '#8e97a3', 14, 2.5, 1.2, 1.4, { op: 0.45, grow: 2.6, grav: -0.8 });
        break;
      }
      case 'ultCut': this.cut(ev); break;
      case 'ultFinisher': {
        const p = ev.p, P = fxPal(p), ORANGE = P.energy;
        if (ev.flourish) { F.sprite(p.x, p.y + 1, 'ring', ORANGE, 2, 0.4, 3.6); F.slashMark(p.x, p.y + 1, P.hot, 9, 0.1, 0.3); F.burst(p.x, p.y + 1, ORANGE, 40, 12, 0.35, 0.5); break; }
        // Every cut lands again at once: a cross of slashes on every target, and a long cut across the screen
        for (const e of ev.targets) {
          const x = e.x, y = e.y + e.h * 0.55;
          F.slashMark(x, y, P.hot, 3.6, 0.7, 0.28); F.slashMark(x, y, ORANGE, 3.6, -0.7, 0.28); F.slashMark(x, y, '#ffffff', 4.4, 0, 0.2);
          if (p.char === 'wolverine') for (const k of [-1, 1]) F.slashMark(x + k * 0.22, y + k * 0.22, P.soft, 3.4, 0.7, 0.28);
          if (p.char === 'psylocke') for (let i = 0; i < 4; i++) this.fly(x + (Math.random() - 0.5) * 1.2, y + (Math.random() - 0.5) * 1.2, i % 2 ? ORANGE : '#ffffff', 0.7 + Math.random() * 0.5, 1.1);
          F.sprite(x, y, 'star', '#ffffff', 2.4, 0.2, 1.5); F.burst(x, y, ORANGE, 30, 10, 0.34, 0.45); F.burst(x, y, '#ffffff', 14, 8, 0.24, 0.3);
        }
        const mid = ev.targets.length ? ev.targets.reduce((s, e) => s + e.x, 0) / ev.targets.length : p.x;
        F.slashMark(mid, p.y + 1.2, '#ffffff', 26, 0, 0.3);
        // They are back, landing the last cut
        F.sprite(p.x, p.y + 1, 'ring', ORANGE, 1.4, 0.35, 3.4); F.burst(p.x, p.y + 1, ORANGE, 20, 6, 0.28, 0.35);
        break;
      }
      case 'ultEnd': F.sprite(ev.p.x, ev.p.y + 1, 'ring', CYAN, 0.9, 0.3, 2.8); break;
      case 'teamFinisher': this.teamFinisher(ev); break;
    }
  }

  // One of Echo's cuts: a long slash across the target, an afterimage of him beside it mid-strike, sparks, and
  // a streak of light from where the last cut was
  cut(ev) {
    const F = this.fx, p = ev.p, x = ev.x, y = ev.y, side = -ev.dir, rig = this.fx.rigs.get(p), P = fxPal(p), ORANGE = P.energy;
    F.slashMark(x, y, P.hot, 3 + Math.random(), ev.ang, 0.2); F.slashMark(x, y, ORANGE, 2.2, ev.ang + 0.25, 0.16);
    // Wolverine: three claw marks side by side; Psylocke: a butterfly lifts off the cut
    if (p.char === 'wolverine') { const nx = -Math.sin(ev.ang) * 0.2, ny = Math.cos(ev.ang) * 0.2; for (const k of [-1, 1]) F.slashMark(x + nx * k, y + ny * k, P.soft, 2.8, ev.ang, 0.2); }
    if (p.char === 'psylocke') this.fly(x, y, Math.random() < 0.5 ? ORANGE : '#ffffff', 0.7);
    F.sprite(x, y, 'star', '#ffffff', 1.1, 0.12, 1.4);
    F.burst(x, y, Math.random() < 0.5 ? '#ffffff' : ORANGE, 12, 9, 0.24, 0.24);
    const gx = x + side * 1.1, gy = ev.e.y;
    if (rig) {
      // Stand the (hidden) rig beside the target for a moment and leave a ghost of it there
      const pos = rig.root.position.clone(), rot = rig.root.rotation.y, fl = rig.flip.scale.x;
      toWorld(gx, gy, 0, rig.root.position); rig.flip.scale.x = -side;
      F.ghosts.spawn(rig, new THREE.Color(ORANGE).multiplyScalar(1.8), 0.6, 0.3);
      rig.root.position.copy(pos); rig.root.rotation.y = rot; rig.flip.scale.x = fl; rig.root.updateMatrixWorld(true);
    }
    const last = this.lastCut.get(p);
    if (last) {
      // A thin streak of light along the blink
      const n = 6;
      for (let i = 0; i <= n; i++) { const u = i / n; F.burst(last.x + (gx - last.x) * u, last.y + (gy + 1 - last.y) * u, i % 2 ? '#ffffff' : ORANGE, 1, 1, 0.18, 0.16); }
    }
    this.lastCut.set(p, { x: gx, y: gy + 1 });
  }

  // The team finisher: an eclipse fills the screen, its corona flares, then it shatters into light
  teamFinisher(ev) {
    const E = this.eclipse, F = this.fx;
    E.t = 0; E.x = ev.x; E.y = ev.y;
    this.after(0.42, () => {
      F.sprite(ev.x, ev.y, 'star', '#ffffff', 14, 0.45, 1.6); F.sprite(ev.x, ev.y, 'glow', '#ffffff', 16, 0.5, 1.4);
      for (const [sz, life, g] of [[3, 0.5, 5], [2, 0.7, 7], [1.2, 0.9, 10]]) F.sprite(ev.x, ev.y, 'ring', '#ffffff', sz, life, g);
      F.sprite(ev.x, ev.y, 'ring', CYAN, 2.4, 0.9, 7);
      F.burst(ev.x, ev.y, CYAN, 120, 22, 0.45, 0.9); F.burst(ev.x, ev.y, '#ffffff', 60, 16, 0.3, 0.6);
      for (const c of ev.chars || []) F.burst(ev.x, ev.y, fxPal({ char: c }).energy, 50, 18, 0.38, 0.7);
    });
  }

  update(dt, world, view) {
    this.t += dt;
    const F = this.fx, cam = view.camera.position;
    for (const q of this.pending) { q.t -= dt; if (q.t <= 0) { q.done = true; q.fn(); } }
    this.pending = this.pending.filter(q => !q.done);
    // The eclipse
    const E = this.eclipse;
    if (E.t >= 0) {
      E.t += dt; const k = E.t, grow = Math.min(1, k / 0.3), gone = k > 0.42 ? Math.max(0, 1 - (k - 0.42) / 0.12) : 1;
      for (const s of [E.disc, E.corona, E.ring]) { toWorld(E.x, E.y, 1.5, s.position); s.visible = gone > 0; }
      E.disc.scale.setScalar(6.4 * grow); E.disc.material.opacity = gone;
      E.corona.scale.setScalar(11.5 * grow * (1 + 0.05 * Math.sin(this.t * 40))); E.corona.material.opacity = gone;
      E.ring.scale.setScalar(8 * grow); E.ring.material.opacity = 0.9 * gone; E.ring.material.rotation = this.t * 2;
      if (gone <= 0) { E.t = -1; for (const s of [E.disc, E.corona, E.ring]) s.visible = false; }
    }
    // Storm's bolts: jagged lines from the cloud down to each target, flickering as they fade
    for (const b of this.skyBolts) {
      if (b.life <= 0) { b.glow.mesh.visible = b.core.mesh.visible = false; continue; }
      b.life -= dt;
      const k = Math.max(0, b.life / b.max), fl = 0.55 + Math.random() * 0.45, pts = b.pts; pts.length = 0;
      const n = 12, len = b.top - b.y;
      for (let i = 0; i <= n; i++) { const u = i / n, j = i === 0 || i === n ? 0 : (Math.random() - 0.5) * (b.big ? 1.1 : 0.7) * Math.sin(Math.PI * u); pts.push(toWorld(b.x + j, b.top - len * u, 0.3, new THREE.Vector3())); }
      b.glow.build(pts, cam, () => (b.big ? 0.42 : 0.26) * (0.6 + 0.4 * k), () => [0.6, 1.1, 1.6, 0.55 * k * fl]);
      b.core.build(pts, cam, () => (b.big ? 0.1 : 0.06), () => [2, 2, 2.1, k * fl]);
    }
    for (const f of this.flies) {
      if (f.it.life <= 0) { f.dead = true; continue; }
      f.x += f.vx * dt; f.y += f.vy * dt; toWorld(f.x, f.y, 0.5, f.it.s.position);
      f.it.sx = 0.55 + 0.45 * Math.abs(Math.sin(this.t * 14 + f.flap));   // wings beating
    }
    this.flies = this.flies.filter(f => !f.dead);
    for (const p of world.players) {
      const R = p.ultRun;
      if (p.state !== 'ult' || !R || R.kind !== 'storm') continue;
      // Storm: a dark cloud gathers above her, wind and sparks whirl round her
      if (Math.random() < 0.8) F.smoke(p.x + (Math.random() - 0.5) * 8, p.y + 5.5 + Math.random() * 2, '#3b4352', 1, 0.8, 1.6, 1.2, { op: 0.55, grow: 1.8, grav: 0, drag: 0.97 });
      if (Math.random() < 0.6) { const a = Math.random() * Math.PI * 2, w = toWorld(p.x + Math.cos(a) * 1.4, p.y + 1 + Math.sin(a) * 1.4, 0.3, this.v); const P = F.particle(w, Math.random() < 0.5 ? '#ffffff' : fxPal(p).energy, 0.16, 0.35); planeDir(p.x, -Math.sin(a) * 6, Math.cos(a) * 6, P.v); P.drag = 0.9; }
    }
    // The call: energy rising around every member while it is called
    const U = world.ultCast;
    if (U && U.phase === 'cast') {
      for (const m of U.members) {
        for (let i = 0; i < 3; i++) {
          const w = toWorld(m.x + (Math.random() - 0.5) * 1.6, m.y + Math.random() * 0.4, (Math.random() - 0.5) * 0.8, this.v);
          const P = F.particle(w, Math.random() < 0.5 ? CYAN : '#ffffff', 0.18, 0.5); P.v.set(0, 5 + Math.random() * 4, 0); P.drag = 0.97;
        }
      }
    }
    // Nova's Supernova
    for (const p of world.players) {
      const R = p.ultRun, live = p.state === 'ult' && R && R.kind === 'nova' && world.players.includes(p);
      if (!live && !this.beams.has(p)) continue;
      const B = this.beamOf(p), N = ULT.nova;
      const hide = () => { for (const s of [B.halo.mesh, B.sheath.mesh, B.core.mesh, B.sun, B.sunCore, B.flare]) s.visible = false; };
      if (!live) { hide(); if (!world.players.includes(p)) this.beams.delete(p); continue; }
      const PAL = fxPal(p), GOLD = PAL.energy, eyes = p.char === 'cyclops', c = { x: p.x, y: p.y + p.h * (eyes ? 0.9 : 0.62) };
      // The gathering sun over the raised hands (at Cyclops's visor)
      if (R.t <= N.gather + 2) {
        const k = Math.min(1, R.t / N.gather), at = toWorld(c.x + (eyes ? p.facing * 0.25 : 0), c.y + (eyes ? 0 : 1.1), 0.3, this.v);
        if (p.char === 'jean' && R.t % 4 === 0) for (const s of [1, -1]) F.slashMark(c.x + s * (0.8 + 1.4 * k), c.y + 1.2 + 0.6 * k, R.t % 8 ? GOLD : PAL.hot, 2.5 + 3 * k, s * 0.5, 0.25);
        B.sun.position.copy(at); B.sun.material.color.set(GOLD); B.sun.scale.setScalar(0.4 + 2.4 * k * (1 + 0.08 * Math.sin(this.t * 50))); B.sun.visible = true;
        B.sunCore.position.copy(at); B.sunCore.material.color.set('#ffffff'); B.sunCore.scale.setScalar(0.2 + 1.2 * k); B.sunCore.visible = true;
        for (let i = 0; i < 4; i++) {
          const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 1.5, tv = planeDir(c.x, Math.cos(a) * r, Math.sin(a) * r, this.v2);
          const P = F.particle(this.v3.copy(at).add(tv), Math.random() < 0.4 ? '#ffffff' : GOLD, 0.2, 0.28); P.v.copy(tv).multiplyScalar(-3.4); P.drag = 1;
        }
      } else { B.sun.visible = false; B.sunCore.visible = false; }
      if (!R.segs) { B.halo.mesh.visible = B.sheath.mesh.visible = B.core.mesh.visible = B.flare.visible = false; continue; }
      // The beam: along its segment every 0.8 m; it opens fast, ripples, and narrows away at the end
      const g = R.segs[0], len = Math.hypot(g.x1 - g.x0, g.y1 - g.y0), n = Math.min(60, Math.ceil(len / 0.8)), pts = B.pts;
      pts.length = 0;
      for (let i = 0; i <= n; i++) pts.push(toWorld(g.x0 + (g.x1 - g.x0) * i / n, g.y0 + (g.y1 - g.y0) * i / n, 0.25, new THREE.Vector3()));
      const bt = R.t - N.gather, open = Math.min(1, bt / 6), close = Math.min(1, (N.beam - bt) / 8), base = Math.max(0, open * close), W = N.width, t = this.t;
      // A cyan halo, a gold sheath that surges along it, and a white-hot core (kept below clipping so the colours read)
      const look = BEAM_LOOK[p.char] || BEAM_LOOK.nova;
      B.halo.build(pts, cam, i => W * 1.9 * base * Math.min(1, 0.35 + i * 0.2), i => [...look.halo, 0.22 * Math.min(1, 0.3 + i * 0.2)]);
      B.sheath.build(pts, cam, i => W * base * Math.min(1, 0.4 + i * 0.25) * (1 + 0.14 * Math.sin(t * 34 - i * 0.7) + 0.05 * Math.sin(t * 87 + i)), i => [...look.sheath, 0.62]);
      B.core.build(pts, cam, i => W * 0.4 * base * (0.9 + Math.random() * 0.2) * Math.min(1, 0.5 + i * 0.3), () => [...look.core, 1]);
      if (p.char === 'jean' && Math.random() < 0.5) { const j = Math.floor(Math.random() * pts.length); F.burstAt(pts[j], Math.random() < 0.5 ? PAL.hot : GOLD, 2, 2.5, 0.3, 0.4); }   // embers off the phoenix fire
      B.flare.position.copy(pts[0]); B.flare.material.color.set('#ffffff'); B.flare.scale.setScalar((2.4 + Math.random()) * base); B.flare.material.rotation = t * 5; B.flare.visible = true;
      // Sparks down its length, rings pushed along it, and dust blown off the floor under it
      for (let i = 0; i < 8; i++) {
        const j = Math.floor(Math.random() * (pts.length - 1)), P = F.particle(pts[j], Math.random() < 0.5 ? '#ffffff' : GOLD, 0.24, 0.16);
        P.v.copy(pts[j + 1]).sub(pts[j]).normalize().multiplyScalar(30 + Math.random() * 16); P.v.x += (Math.random() - 0.5) * 6; P.v.y += (Math.random() - 0.5) * 6; P.drag = 0.95;
      }
      B.ringT -= dt;
      if (B.ringT <= 0) { B.ringT = 0.06; F.charge.shockRing(pts[0].clone(), planeDir(p.x, R.dx, R.dy, new THREE.Vector3()).normalize(), '#ffffff', 0.5, 1.6, 0.26, 7); }
      for (let d = 1; d < len; d += 2.2) {
        if (Math.random() > 0.2) continue;
        const x = g.x0 + (g.x1 - g.x0) * d / len, y = g.y0 + (g.y1 - g.y0) * d / len, fl = F.floorUnder(x, y, 2.5);
        if (fl !== null) F.smoke(x, fl + 0.1, '#b9c1cb', 1, 3, 0.4, 0.5, { dir: g.x1 >= g.x0 ? 0.35 : Math.PI - 0.35, spread: 0.6, grav: -0.5, op: 0.35 });
      }
    }
  }

  // Warm-up stand-ins (compiles the beam strips and the eclipse sprites at load)
  warmShow(at, cam) {
    const B = this.beamOf('warm'); B.pts = [at.clone(), at.clone().add(new THREE.Vector3(1, 0, 0)), at.clone().add(new THREE.Vector3(2, 0, 0))];
    B.halo.build(B.pts, cam, () => 0.2, () => [1, 1, 1, 1]); B.sheath.build(B.pts, cam, () => 0.2, () => [1, 1, 1, 1]); B.core.build(B.pts, cam, () => 0.1, () => [1, 1, 1, 1]);
    const E = this.eclipse; for (const s of [E.disc, E.corona, E.ring, B.sun, B.flare]) { s.position.copy(at); s.visible = true; }
    const sb = this.skyBolts[0]; sb.glow.build(B.pts, cam, () => 0.2, () => [1, 1, 1, 1]); sb.core.build(B.pts, cam, () => 0.1, () => [1, 1, 1, 1]);
    return [B.halo.mesh, B.sheath.mesh, B.core.mesh, E.disc, E.corona, E.ring, B.sun, B.flare, sb.glow.mesh, sb.core.mesh];
  }
  warmDone() {
    const B = this.beams.get('warm');
    if (B) { for (const s of [B.halo.mesh, B.sheath.mesh, B.core.mesh, B.sun, B.sunCore, B.flare]) s.visible = false; this.beams.delete('warm'); this.warmB = B; }
    const E = this.eclipse; for (const s of [E.disc, E.corona, E.ring]) s.visible = false;
    const sb = this.skyBolts[0]; sb.glow.mesh.visible = sb.core.mesh.visible = false;
  }
}
