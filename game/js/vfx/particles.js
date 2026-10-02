// GPU particles: every plain glowing spark in one draw call. A fixed pool of CAP particles lives in typed arrays;
// update() moves the live ones on the CPU and uploads position, colour, size and alpha once a frame, and a small
// shader draws each as a soft round glow (no texture), additively, sized by distance. Sprites remain for the shaped
// effects (stars, rings, slashes, smoke) in fx.js.
import * as THREE from 'three';

const CAP = 4096;
const VERT = `
  attribute float size; attribute float alpha; attribute vec3 tint;
  varying float vAlpha; varying vec3 vTint;
  void main() {
    vAlpha = alpha; vTint = tint;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * 600.0 / max(1.0, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = `
  varying float vAlpha; varying vec3 vTint;
  void main() {
    vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0;
    if (r > 1.0) discard;
    float core = smoothstep(1.0, 0.0, r); core *= core;
    gl_FragColor = vec4(vTint * (core + smoothstep(0.35, 0.0, r)), core * vAlpha);
  }`;

export class GpuParticles {
  constructor(scene) {
    this.n = 0;
    this.pos = new Float32Array(CAP * 3); this.vel = new Float32Array(CAP * 2); this.col = new Float32Array(CAP * 3);
    this.size = new Float32Array(CAP); this.alpha = new Float32Array(CAP);
    this.life = new Float32Array(CAP); this.max = new Float32Array(CAP); this.g = new Float32Array(CAP); this.drag = new Float32Array(CAP);
    this.s0 = new Float32Array(CAP); this.s1 = new Float32Array(CAP);
    const geo = new THREE.BufferGeometry();
    this.aPos = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.aCol = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    this.aSize = new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage);
    this.aAlpha = new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.aPos); geo.setAttribute('tint', this.aCol); geo.setAttribute('size', this.aSize); geo.setAttribute('alpha', this.aAlpha);
    geo.setDrawRange(0, 0);
    this.points = new THREE.Points(geo, new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.c = new THREE.Color();
  }
  get count() { return this.n; }
  // One particle: x, y, z, vx, vy, gravity, drag, colour, start and end size (m), life (s)
  add(x, y, z, vx, vy, g, drag, color, s0, s1, life) {
    if (this.n >= CAP) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z; this.vel[i * 2] = vx; this.vel[i * 2 + 1] = vy;
    this.c.set(color); this.col[i * 3] = this.c.r; this.col[i * 3 + 1] = this.c.g; this.col[i * 3 + 2] = this.c.b;
    this.g[i] = g; this.drag[i] = drag; this.s0[i] = s0; this.s1[i] = s1; this.life[i] = 0; this.max[i] = life; this.size[i] = s0; this.alpha[i] = 1;
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] += dt;
      if (this.life[i] >= this.max[i]) { this.move(this.n - 1, i); this.n--; continue; }   // swap the last one in
      const k = this.life[i] / this.max[i], dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 2] *= dr; this.vel[i * 2 + 1] = this.vel[i * 2 + 1] * dr - this.g[i] * dt;
      this.pos[i * 3] += this.vel[i * 2] * dt; this.pos[i * 3 + 1] += this.vel[i * 2 + 1] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * k; this.alpha[i] = 1 - k * k;
      i++;
    }
    for (const a of [this.aPos, this.aCol, this.aSize, this.aAlpha]) a.needsUpdate = true;
    this.points.geometry.setDrawRange(0, this.n);
  }
  move(from, to) {
    if (from === to) return;
    for (let k = 0; k < 3; k++) { this.pos[to * 3 + k] = this.pos[from * 3 + k]; this.col[to * 3 + k] = this.col[from * 3 + k]; }
    for (let k = 0; k < 2; k++) this.vel[to * 2 + k] = this.vel[from * 2 + k];
    for (const A of [this.size, this.alpha, this.life, this.max, this.g, this.drag, this.s0, this.s1]) A[to] = A[from];
  }
}
