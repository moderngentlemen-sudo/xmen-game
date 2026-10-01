// Gameplay space to world space. The sim is 2D (x along the path, y up); the path curves around the
// Storm Spire, so a sim point maps onto the path frame, with `depth` toward the camera.
import * as THREE from 'three';
import { pathFrame } from './level.js';

export function toWorld(x, y, depth = 0, out = new THREE.Vector3()) {
  const f = pathFrame(x);
  return out.set(f.px + f.nx * depth, y, f.pz + f.nz * depth);
}
export function planeDir(x, dx, dy, out = new THREE.Vector3()) {
  const f = pathFrame(x);
  return out.set(f.tx * dx, dy, f.tz * dx);
}
