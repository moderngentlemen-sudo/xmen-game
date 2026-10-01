// The comic-book look: flat cel shading in three bands (MeshToonMaterial over one shared ramp), and a single
// post-processing pass that inks the outlines (edges in the depth buffer) and lays Ben-Day halftone dots into
// the shadows. Glows are additive sprites rather than bloom: flat colour plus ink reads better than haze, and
// it costs a weak GPU far less.
import * as THREE from 'three';

let ramp = null;
export function toonRamp() {
  if (ramp) return ramp;
  ramp = new THREE.DataTexture(new Uint8Array([84, 170, 255]), 3, 1, THREE.RedFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.generateMipmaps = false; ramp.needsUpdate = true;
  return ramp;
}
export const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: toonRamp(), ...extra });
// An emissive toon material: lit flat in its own colour (energy, lenses, lights)
export const glow = (color, k = 1.6, extra = {}) => new THREE.MeshToonMaterial({ color, emissive: color, emissiveIntensity: k, gradientMap: toonRamp(), ...extra });

// A rim of colour round a silhouette (the player's identity colour on a hero, white on a hit). The uniforms
// live on mat.userData.rim so they can be driven every frame.
export function addRim(mat, color, strength = 0.5, power = 2.2) {
  const u = { rimColor: { value: new THREE.Color(color) }, rimStrength: { value: strength } };
  mat.userData.rim = u; mat.userData.rimBase = strength;
  mat.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = 'uniform vec3 rimColor; uniform float rimStrength;\n' + shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
      vec3 rimV = isOrthographic ? vec3(0.0, 0.0, 1.0) : normalize(vViewPosition);
      float rimF = pow(1.0 - clamp(abs(dot(normal, rimV)), 0.0, 1.0), ${power.toFixed(2)});
      totalEmissiveRadiance += rimColor * smoothstep(0.35, 0.6, rimF) * rimStrength;`);
  };
  mat.customProgramCacheKey = () => 'rim-' + power.toFixed(2);
  return mat;
}

// The comic pass: ink where depth jumps (silhouettes, overlaps), halftone dots where the image is dark.
export const ComicShader = {
  uniforms: {
    tDiffuse: { value: null }, tDepth: { value: null },
    resolution: { value: new THREE.Vector2(1280, 720) }, cameraNear: { value: 0.5 }, cameraFar: { value: 600 },
    inkColor: { value: new THREE.Color('#120d1a') }, ink: { value: 1 }, width: { value: 1 },
    halftone: { value: 1 }, dotSize: { value: 5.5 }, threshold: { value: 0.07 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    #include <packing>
    uniform sampler2D tDiffuse; uniform sampler2D tDepth;
    uniform vec2 resolution; uniform float cameraNear, cameraFar, ink, width, halftone, dotSize, threshold;
    uniform vec3 inkColor;
    varying vec2 vUv;
    float viewZ(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar); }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec2 px = width / resolution;
      float d = viewZ(vUv);
      float tl = viewZ(vUv + px * vec2(-1.0, 1.0)), t = viewZ(vUv + px * vec2(0.0, 1.0)), tr = viewZ(vUv + px * vec2(1.0, 1.0));
      float l = viewZ(vUv + px * vec2(-1.0, 0.0)), r = viewZ(vUv + px * vec2(1.0, 0.0));
      float bl = viewZ(vUv + px * vec2(-1.0, -1.0)), b = viewZ(vUv + px * vec2(0.0, -1.0)), br = viewZ(vUv + px * vec2(1.0, -1.0));
      float gx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
      float gy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
      // Relative to the nearer depth, so a far edge is not drawn heavier than a near one
      float g = sqrt(gx * gx + gy * gy) / max(min(d, min(min(l, r), min(t, b))), 0.5);
      float edge = smoothstep(threshold, threshold * 2.4, g) * step(d, cameraFar * 0.98 + 1.0);
      // Ben-Day dots in the shadows: a 45-degree grid of dots that grow as the tone darkens
      float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      vec2 q = mat2(0.7071, -0.7071, 0.7071, 0.7071) * gl_FragCoord.xy / dotSize;
      float dark = clamp((0.36 - lum) / 0.36, 0.0, 1.0);
      float rad = 0.62 * sqrt(dark);
      float dotMask = (1.0 - smoothstep(rad - 0.09, rad + 0.09, length(fract(q) - 0.5))) * step(0.02, dark);
      vec3 col = mix(c.rgb, c.rgb * 0.42, dotMask * halftone);
      col = mix(col, inkColor, edge * ink);
      gl_FragColor = vec4(col, c.a);
    }`,
};
