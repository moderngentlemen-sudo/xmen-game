// Floor decals: scorches and cracks left where Sentinels hit the floor, slam down or are destroyed. A fixed pool of
// flat quads laid on the floor just above it; the oldest is reused when the pool is full, and each fades out over
// its last seconds. The floor height comes from the level (groundBelow), so decals land on walkways and stairs too.
import * as THREE from 'three';
import { groundBelow } from '../sim/level.js';

const POOL = 32, OPEN = { G1: false, G2: false, G3: false, cell: false };
function decalTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'), r = g.createRadialGradient(64, 64, 4, 64, 64, 62);
  r.addColorStop(0, 'rgba(0,0,0,0.85)'); r.addColorStop(0.55, 'rgba(0,0,0,0.5)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = 3;
  for (let i = 0; i < 7; i++) { const a = i * 0.9 + 0.3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 58, 64 + Math.sin(a) * 58); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export class Decals {
  constructor(scene) {
    const tex = decalTex(), geo = new THREE.PlaneGeometry(1, 1);
    this.pool = [];
    for (let i = 0; i < POOL; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0, polygonOffset: true, polygonOffsetFactor: -2 }));
      m.rotation.x = -Math.PI / 2; m.visible = false; m.renderOrder = 1; scene.add(m);
      this.pool.push({ m, age: 0, life: 0 });
    }
    this.next = 0;
  }
  // A mark on the floor under x (near height y): size m across, lasting life s
  add(x, y, size = 2, life = 8, tint = '#000000') {
    const g = groundBelow(x, y + 0.6, OPEN);
    if (!(g > -Infinity) || y - g > 3) return;
    const o = this.pool[this.next]; this.next = (this.next + 1) % POOL;
    o.m.position.set(x, g + 0.02, (Math.random() - 0.5) * 0.6); o.m.scale.set(size, size, 1); o.m.rotation.z = Math.random() * 6.28;
    o.m.material.color.set(tint); o.m.material.opacity = 0.75; o.m.visible = true; o.age = 0; o.life = life;
  }
  update(dt) {
    for (const o of this.pool) {
      if (!o.m.visible) continue;
      o.age += dt;
      const left = o.life - o.age;
      o.m.material.opacity = 0.75 * Math.min(1, Math.max(0, left / 2));
      if (left <= 0) o.m.visible = false;
    }
  }
  get live() { return this.pool.filter(o => o.m.visible).length; }
}
