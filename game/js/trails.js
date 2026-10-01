// Weapon swing trails: a ribbon swept by a weapon edge (from partway along the weapon out to its tip) over
// the last few frames, white-hot at the tip and fading toward the base and with age, like a sword smear.
// The samples are smoothed (Catmull-Rom) so fast spins read as clean arcs rather than polygons. Echo's
// blades and glaive and Nova's hard-light fists use it. Presentation only: reads the sim, never changes it.
import * as THREE from 'three';
import { CHARS, SETTINGS, DASH_SLASH } from './config.js';

const MAXS = 14, SUB = 3, MAXP = (MAXS - 1) * SUB + 1;
const WHITE = new THREE.Color('#ffffff');

// Which weapon edges are sweeping for a player this frame, with the trail's life (s) and brightness
function activeEdges(p, rig) {
  const st = p.state, m = p.move, E = rig.extra.edges;
  if (!E) return null;
  if (p.char === 'echo') {
    const hunter = SETTINGS.echoKit === 'hunter';
    if (st === 'dashslash') return p.st >= 1 && p.st <= DASH_SLASH.ticks ? [['bladeN', 0.17, 1.3], ['bladeF', 0.17, 1.3]] : null;
    if (st === 'parry' && hunter && !p.parryResult) return [['glaiveA', 0.09, 0.7], ['glaiveB', 0.09, 0.7]];
    if (st === 'pound' && p.pound) return p.pound.phase === 'drop' ? [['glaiveA', 0.16, 1.3]] : p.pound.phase === 'hold' && p.pound.t <= 10 ? [['glaiveA', 0.12, 1], ['glaiveB', 0.12, 0.9]] : null;
    if (st !== 'attack' || !m) return null;
    if (p.st < m.su - 1 || p.st > m.su + m.ac + 2) return null;
    if (m.blade) return m.cross ? [['bladeN', 0.11, 1], ['bladeF', 0.11, 1]] : [[m.offhand && hunter ? 'bladeF' : 'bladeN', 0.11, 1]];
    if (m.staff) {
      const big = m.spin || m.glaive || m.launcher || m.heavy;
      if (m.spin) return [['glaiveA', 0.1, 0.75], ['glaiveB', 0.1, 0.6]];   // a whole disk builds up: keep it lighter
      return big ? [['glaiveA', 0.15, 1.2], ['glaiveB', 0.13, 0.9]] : [['glaiveA', 0.13, 1]];
    }
    return null;
  }
  if (st === 'pound' && p.pound) return p.pound.phase === 'drop' ? [['fistN', 0.16, 1.4]] : null;
  if (st !== 'attack' || !m || !m.fist) return null;
  if (p.st < m.su - 1 || p.st > m.su + m.ac + 2) return null;
  if (p.moveId === 'nova_kair') return [['boot', 0.12, 1]];
  return [[m.offhand ? 'fistF' : 'fistN', m.heavy ? 0.14 : 0.1, m.heavy ? 1.3 : 1]];
}

class Sweep {
  constructor(scene, mat) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 6), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXP * 8), 4).setUsage(THREE.DynamicDrawUsage));
    const idx = []; for (let i = 0; i < MAXP - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 3; this.mesh.visible = false;
    scene.add(this.mesh);
    this.s = []; this.key = null; this.life = 0.12; this.gain = 1;
    this.color = new THREE.Color(); this.hot = new THREE.Color();
  }
}

// Catmull-Rom point between p1 and p2 at u (p0, p3 are the neighbours)
function cr(p0, p1, p2, p3, u, out) {
  const u2 = u * u, u3 = u2 * u;
  for (const k of ['x', 'y', 'z']) {
    out[k] = 0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * u + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3);
  }
  return out;
}

export class SweepTrails {
  constructor(scene, n = 14) {
    this.scene = scene;
    // Ordinary blending with un-tone-mapped colours above 1: it reads on the bright sky and still blooms
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    this.pool = Array.from({ length: n }, () => new Sweep(scene, this.mat));
    this.v = new THREE.Vector3(); this.a = new THREE.Vector3(); this.b = new THREE.Vector3(); this.ta = new THREE.Vector3(); this.tb = new THREE.Vector3();
  }

  get(key) {
    let s = this.pool.find(q => q.key === key);
    if (s) return s;
    s = this.pool.find(q => !q.s.length) || this.pool.reduce((x, y) => (x.s.length < y.s.length ? x : y));
    s.key = key; s.s.length = 0; return s;
  }

  update(dt, world, rigs) {
    for (const p of world.players) {
      const rig = rigs.get(p);
      const edges = rig && rig.root.visible && p.state !== 'downed' ? activeEdges(p, rig) : null;
      if (!edges) continue;
      rig.root.updateMatrixWorld(true);
      const col = CHARS[p.char].energy;
      for (const [name, life, gain] of edges) {
        const E = rig.extra.edges[name]; if (!E) continue;
        const [baseObj, tipObj, from] = E;
        const s = this.get(p.slot + ':' + name);
        s.life = life; s.gain = gain; s.color.set(col); s.hot.copy(s.color).lerp(WHITE, 0.65);
        const tip = tipObj.getWorldPosition(this.b), base = baseObj.getWorldPosition(this.a).lerp(tip, from);
        s.s.unshift({ a: base.clone(), b: tip.clone(), age: 0, fresh: true });
        if (s.s.length > MAXS) s.s.pop();
      }
    }
    for (const s of this.pool) {
      if (!s.s.length) { s.mesh.visible = false; continue; }
      for (const q of s.s) { if (!q.fresh) q.age += dt; q.fresh = false; }
      while (s.s.length && s.s[s.s.length - 1].age > s.life) s.s.pop();
      if (s.s.length < 2) { s.mesh.visible = false; if (!s.s.length) s.key = null; continue; }
      this.rebuild(s);
    }
  }

  rebuild(s) {
    const S = s.s, n = S.length, pos = s.mesh.geometry.attributes.position.array, col = s.mesh.geometry.attributes.color.array;
    let k = 0;
    const put = (a, b, age) => {
      if (k >= MAXP) return;
      const f = Math.max(0, 1 - age / s.life), fa = f * f * Math.min(1, s.gain);
      pos[k * 6] = a.x; pos[k * 6 + 1] = a.y; pos[k * 6 + 2] = a.z; pos[k * 6 + 3] = b.x; pos[k * 6 + 4] = b.y; pos[k * 6 + 5] = b.z;
      const g = 1.4 * s.gain;
      col[k * 8] = s.color.r * g; col[k * 8 + 1] = s.color.g * g; col[k * 8 + 2] = s.color.b * g; col[k * 8 + 3] = 0.05 * fa;   // base edge: faint
      col[k * 8 + 4] = s.hot.r * 2.2 * g; col[k * 8 + 5] = s.hot.g * 2.2 * g; col[k * 8 + 6] = s.hot.b * 2.2 * g; col[k * 8 + 7] = 0.95 * fa;   // tip: white-hot
      k++;
    };
    for (let i = 0; i < n - 1; i++) {
      const p0 = S[Math.max(0, i - 1)], p1 = S[i], p2 = S[i + 1], p3 = S[Math.min(n - 1, i + 2)];
      for (let j = 0; j < SUB; j++) {
        const u = j / SUB;
        put(cr(p0.a, p1.a, p2.a, p3.a, u, this.ta), cr(p0.b, p1.b, p2.b, p3.b, u, this.tb), p1.age + (p2.age - p1.age) * u);
      }
    }
    put(S[n - 1].a, S[n - 1].b, S[n - 1].age);
    // Collapse the unused tail onto the last point so it draws nothing
    for (let i = k; i < MAXP; i++) { for (let j = 0; j < 6; j++) pos[i * 6 + j] = pos[(k - 1) * 6 + j]; for (let j = 0; j < 8; j++) col[i * 8 + j] = 0; }
    s.mesh.geometry.attributes.position.needsUpdate = true; s.mesh.geometry.attributes.color.needsUpdate = true;
    s.mesh.visible = true;
  }

  // Warm-up: one visible stand-in so the shader compiles at load
  warmShow(at) {
    const s = this.pool[0]; s.s = [{ a: at.clone(), b: at.clone().add(new THREE.Vector3(0.3, 0.3, 0)), age: 0 }, { a: at.clone().add(new THREE.Vector3(0.2, 0, 0)), b: at.clone().add(new THREE.Vector3(0.5, 0.2, 0)), age: 0 }];
    s.life = 1; s.gain = 1; s.color.set('#ffffff'); s.hot.set('#ffffff'); this.rebuild(s); return s.mesh;
  }
  clearAll() { for (const s of this.pool) { s.s.length = 0; s.key = null; s.mesh.visible = false; } }
}
