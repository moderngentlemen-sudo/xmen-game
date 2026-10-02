// The screen-space distortion ring: a post pass that bends the picture outward in an expanding ring, for heavy
// impacts and supers. Up to 4 rings at once, each { x, y } in screen UV, a radius that grows over its life and a
// strength that fades. View.render feeds it (vfx/post.js's DistortRings keeps the rings' clock).
export const MAX_RINGS = 4;
export const DistortShader = {
  uniforms: { tDiffuse: { value: null }, rings: { value: Array.from({ length: MAX_RINGS }, () => [0, 0, 0, 0]).flat() }, aspect: { value: 16 / 9 } },
  vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float rings[${MAX_RINGS * 4}]; uniform float aspect; varying vec2 vUv;
    void main() {
      vec2 uv = vUv;
      for (int i = 0; i < ${MAX_RINGS}; i++) {
        float s = rings[i * 4 + 3]; if (s <= 0.0) continue;
        vec2 c = vec2(rings[i * 4], rings[i * 4 + 1]); float r = rings[i * 4 + 2];
        vec2 d = uv - c; d.x *= aspect; float len = length(d);
        float band = 1.0 - smoothstep(0.0, 0.06, abs(len - r));
        vec2 dir = len > 0.0001 ? d / len : vec2(0.0); dir.x /= aspect;
        uv -= dir * band * s * 0.035;
      }
      gl_FragColor = texture2D(tDiffuse, uv);
    }`,
};
// The rings' clock: add() in world space, update() returns the uniform array given a world-to-UV projection
export class DistortRings {
  constructor() { this.rings = []; }
  add(x, y, strength = 1, life = 0.45, size = 0.35) { this.rings.push({ x, y, strength, life, size, t: 0 }); if (this.rings.length > MAX_RINGS) this.rings.shift(); }
  update(dt, toUV, out) {
    this.rings = this.rings.filter(r => (r.t += dt) < r.life);
    out.fill(0);
    this.rings.forEach((r, i) => {
      const k = r.t / r.life, uv = toUV(r.x, r.y);
      out[i * 4] = uv[0]; out[i * 4 + 1] = uv[1]; out[i * 4 + 2] = r.size * (0.15 + 0.85 * Math.sqrt(k)); out[i * 4 + 3] = r.strength * (1 - k);
    });
    return out;
  }
}
