// A fixed pool of 8 point lights for hit flashes and supers. All 8 stay in the scene from the start and an idle one
// has intensity 0: adding or removing lights recompiles every material's shader and stalls frames (a V2 lesson).
// flash() takes the dimmest light, so the newest, brightest flashes win when more than 8 are wanted.
import * as THREE from 'three';

export const LIGHT_POOL = 8;
export class LightPool {
  constructor(scene) {
    this.lights = [];
    for (let i = 0; i < LIGHT_POOL; i++) {
      const L = new THREE.PointLight('#ffffff', 0, 10, 2);
      L.position.set(0, -100, 0); scene.add(L);
      this.lights.push({ L, peak: 0, life: 0, max: 1 });
    }
  }
  // A flash of light: colour, peak intensity, reach (m) and life (s)
  flash(x, y, color, intensity = 4, reach = 8, life = 0.2) {
    let o = this.lights[0];
    for (const q of this.lights) if (q.L.intensity < o.L.intensity) o = q;
    o.L.color.set(color); o.L.position.set(x, y, 1.5); o.L.distance = reach;
    o.peak = intensity; o.life = 0; o.max = life; o.L.intensity = intensity;
  }
  update(dt, scale = 1) {
    for (const o of this.lights) {
      if (o.peak <= 0) continue;
      o.life += dt;
      const k = Math.min(1, o.life / o.max);
      o.L.intensity = o.peak * (1 - k) * (1 - k) * scale;
      if (k >= 1) { o.peak = 0; o.L.intensity = 0; }
    }
  }
  get active() { return this.lights.filter(o => o.L.intensity > 0).length; }
}
