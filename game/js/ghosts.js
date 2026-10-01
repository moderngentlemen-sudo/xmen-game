// Afterimages: translucent copies of a character's pose left behind by fast moves (charged dashes,
// rocket launches). A ghost is one mesh: at spawn, simple body parts (torso, head, limbs) are placed
// with the live rig's joint transforms and baked into the ghost's own vertex buffer, so each ghost is a
// single draw call however many body parts it has. One material per ghost so each fades on its own.
import * as THREE from 'three';

const cap = (r, len) => new THREE.CapsuleGeometry(r, Math.max(0.01, len), 3, 8);

// Body parts: which rig joint carries each, and where the part sits in that joint's space (the same
// layout as buildPlayerRig: arms 0.3 + 0.29 m, legs 0.46 + 0.46 m)
function partList() {
  const T = (x, y, z = 0) => new THREE.Matrix4().makeTranslation(x, y, z);
  return [
    { joint: r => r.hips, geo: new THREE.BoxGeometry(0.3, 0.22, 0.34), at: T(0, 0.02) },
    { joint: r => r.spine, geo: new THREE.BoxGeometry(0.36, 0.52, 0.44), at: T(0.02, 0.33) },
    { joint: r => r.head, geo: new THREE.SphereGeometry(0.155, 12, 8), at: T(0, 0.1) },
    { joint: r => r.armN.top, geo: cap(0.07, 0.24), at: T(0, -0.15) }, { joint: r => r.armN.joint, geo: cap(0.064, 0.23), at: T(0, -0.145) },
    { joint: r => r.armF.top, geo: cap(0.07, 0.24), at: T(0, -0.15) }, { joint: r => r.armF.joint, geo: cap(0.064, 0.23), at: T(0, -0.145) },
    { joint: r => r.legN.top, geo: cap(0.095, 0.37), at: T(0, -0.23) }, { joint: r => r.legN.joint, geo: cap(0.085, 0.38), at: T(0, -0.23) },
    { joint: r => r.legF.top, geo: cap(0.095, 0.37), at: T(0, -0.23) }, { joint: r => r.legF.joint, geo: cap(0.085, 0.38), at: T(0, -0.23) },
  ].map(p => ({ ...p, pos: (p.geo.index ? p.geo.toNonIndexed() : p.geo).attributes.position.array }));
}

export class Ghosts {
  constructor(scene, max = 30) { this.scene = scene; this.max = max; this.pool = []; this.parts = null; this.m = new THREE.Matrix4(); this.v = new THREE.Vector3(); }

  build() {
    if (!this.parts) { this.parts = partList(); this.verts = this.parts.reduce((n, p) => n + p.pos.length / 3, 0); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.verts * 3), 3).setUsage(THREE.DynamicDrawUsage));
    // Ordinary blending and untone-mapped colour, so afterimages read as solid colour on bright scenes;
    // colours above 1 (strong levels) also catch the bloom and glow
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    const root = new THREE.Mesh(g, mat);
    root.frustumCulled = false; root.visible = false; root.renderOrder = 2; this.scene.add(root);
    return { root, mat, geo: g, life: 0, max: 1, base: 0, center: new THREE.Vector3() };
  }

  // Leave a ghost in the rig's current pose
  spawn(rig, color, opacity = 0.4, life = 0.25) {
    let g = this.pool.find(q => q.life <= 0);
    if (!g) {
      if (this.pool.length < this.max) { g = this.build(); this.pool.push(g); }
      else g = this.pool.reduce((a, b) => (a.life < b.life ? a : b));
    }
    rig.root.updateMatrixWorld(true);
    const out = g.geo.attributes.position.array, v = this.v;
    let o = 0;
    for (const P of this.parts) {
      this.m.multiplyMatrices(P.joint(rig).matrixWorld, P.at);
      const src = P.pos;
      for (let i = 0; i < src.length; i += 3) {
        v.set(src[i], src[i + 1], src[i + 2]).applyMatrix4(this.m);
        out[o++] = v.x; out[o++] = v.y; out[o++] = v.z;
      }
    }
    g.geo.attributes.position.needsUpdate = true;
    g.center.copy(rig.root.position); g.root.position.set(0, 0, 0); g.root.scale.setScalar(1);
    g.mat.color.set(color); g.base = opacity; g.mat.opacity = opacity; g.life = g.max = life; g.root.visible = true;
    return g;
  }

  update(dt) {
    for (const g of this.pool) {
      if (g.life <= 0) { if (g.root.visible) g.root.visible = false; continue; }
      g.life -= dt;
      const k = Math.max(0, g.life / g.max);
      g.mat.opacity = g.base * k * k;
      // A slight swell about the body as it fades
      const s = 1 + (1 - k) * 0.08;
      g.root.scale.setScalar(s); g.root.position.copy(g.center).multiplyScalar(1 - s);
    }
  }
  count() { return this.pool.filter(g => g.life > 0).length; }
}
