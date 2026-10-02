// Ribbon trails from bones: while a hero strikes, the hand or foot doing the striking draws a fading ribbon behind
// it. Each rig keeps the world positions of its two hands and its near foot; the one moving fastest leads the
// trail. A ribbon is a strip of 2 × LEN vertices rebuilt every frame, its colour fading to black along its length
// (additive blending turns black into nothing).
import * as THREE from 'three';

const LEN = 10, V = new THREE.Vector3();
export class Trails {
  constructor(scene) { this.scene = scene; this.by = new Map(); }
  // Called every frame for every hero rig; `on` is whether the hero is in a strike's startup-to-recovery
  track(id, rig, on, color, width = 0.22) {
    let T = this.by.get(id);
    if (!T) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LEN * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(LEN * 2 * 3), 3).setUsage(THREE.DynamicDrawUsage));
      const idx = []; for (let i = 0; i + 1 < LEN; i++) { const b = i * 2; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
      geo.setIndex(idx);
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.frustumCulled = false; this.scene.add(m);
      T = { m, pts: [], last: {}, fade: 0, color: new THREE.Color() };
      this.by.set(id, T);
    }
    T.color.set(color);
    // The ends: both hands and the near foot, in world space; the fastest leads
    let best = null, bv = 0;
    for (const [k, node] of [['hN', rig.armN.end], ['hF', rig.armF.end], ['fN', rig.legN.end]]) {
      node.getWorldPosition(V);
      const L = T.last[k];
      const v = L ? Math.hypot(V.x - L[0], V.y - L[1]) : 0;
      T.last[k] = [V.x, V.y, V.z];
      if (v > bv) { bv = v; best = k; }
    }
    if (on && best && bv > 0.02) { T.pts.unshift(T.last[best]); T.fade = 1; }
    else { T.fade *= 0.8; if (T.pts.length) T.pts.unshift(T.pts[0]); }
    T.pts.length = Math.min(T.pts.length, LEN);
    this.draw(T, width);
  }
  draw(T, width) {
    const pos = T.m.geometry.attributes.position, col = T.m.geometry.attributes.color, P = T.pts;
    T.m.visible = P.length > 1 && T.fade > 0.05;
    if (!T.m.visible) return;
    for (let i = 0; i < LEN; i++) {
      const p = P[Math.min(i, P.length - 1)], q = P[Math.min(i + 1, P.length - 1)], o = P[Math.min(Math.max(i - 1, 0), P.length - 1)];
      let dx = q[0] - o[0], dy = q[1] - o[1]; const m = Math.hypot(dx, dy) || 1; dx /= m; dy /= m;
      const w = width * (1 - i / LEN), f = T.fade * (1 - i / LEN);
      pos.setXYZ(i * 2, p[0] - dy * w, p[1] + dx * w, p[2] + 0.05); pos.setXYZ(i * 2 + 1, p[0] + dy * w, p[1] - dx * w, p[2] + 0.05);
      col.setXYZ(i * 2, T.color.r * f, T.color.g * f, T.color.b * f); col.setXYZ(i * 2 + 1, T.color.r * f, T.color.g * f, T.color.b * f);
    }
    pos.needsUpdate = true; col.needsUpdate = true;
  }
  // Drop the trails of heroes no longer on the field
  keep(ids) { for (const [id, T] of this.by) if (!ids.has(id)) { this.scene.remove(T.m); T.m.geometry.dispose(); T.m.material.dispose(); this.by.delete(id); } }
}
