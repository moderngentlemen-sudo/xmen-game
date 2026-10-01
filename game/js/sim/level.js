// The mission's level: "Extraction at the Sentinel Works". A side-on route of boxes, read by collision and by
// the renderer. Collision is Version 9's (AABB bodies, one-way platforms, gates), changed so that gate state
// is part of the world state and travels with snapshots.
//
//   rooftop entry ─ G1 ─ cell block (the kid's cell) ─ G2 ─ assembly hall ─ G3 ─ freight stairs ─ hangar and the X-Jet
//
// Boxes: [x0, x1, y0, y1, type, tag]. type 's' solid, 'o' one-way (stand on it, pass up through it), 'g' a gate
// (solid while its gate is closed).
const RAW = [
  [-14, -12, -6, 30, 's', 'bound'],
  // Rooftop entry
  [-12, 40, -6, 0, 's', 'roof'],
  [13, 15.5, 0, 1.2, 's', 'vent'],
  [23, 30, 3.0, 3.3, 'o', 'catwalk'],
  [40, 41, 0, 9, 'g', 'G1'],
  // Cell block: Hunter perches, the cell at the end
  [41, 96, -6, 0, 's', 'floor'],
  [52, 58, 4.2, 4.5, 'o', 'perch'],
  [68, 74, 4.2, 4.5, 'o', 'perch'],
  [79, 81, 0, 1.0, 's', 'barrier'],
  [86.5, 87.2, 0, 3.4, 'g', 'cell'],
  [87.2, 93.6, 3.4, 3.7, 's', 'cellroof'],
  [93, 93.6, 0, 3.4, 's', 'cellwall'],
  [96, 97, 0, 9, 'g', 'G2'],
  // Assembly hall: conveyor walkways overhead
  [97, 176, -6, 0, 's', 'floor'],
  [110, 118, 3.4, 3.7, 'o', 'walkway'],
  [128, 140, 3.4, 3.7, 'o', 'walkway'],
  [150, 158, 3.4, 3.7, 'o', 'walkway'],
  [143, 145.5, 0, 1.1, 's', 'crate-stack'],
  [176, 177, 0, 9, 'g', 'G3'],
  // Freight stairs up to the hangar
  [177, 184, -6, 0, 's', 'floor'],
  [184, 189, -6, 1.2, 's', 'step'],
  [189, 194, -6, 2.4, 's', 'step'],
  [194, 264, -6, 3.6, 's', 'hangar'],
  [206, 212, 7.0, 7.3, 'o', 'gantry'],
  [224, 230, 7.0, 7.3, 'o', 'gantry'],
  [264, 266, -6, 34, 's', 'bound'],
];
export const BOXES = RAW.map(([x0, x1, y0, y1, type, tag]) => ({ x0, x1, y0, y1, type, tag }));
export const LEVEL_X0 = -12, LEVEL_X1 = 264, KILL_Y = -10;
export const GATE_IDS = ['G1', 'G2', 'G3', 'cell'];
// Where the young mutant is held, where Collectors carry a captive out (each section has its own way out), and
// the X-Jet's ramp
export const CELL = { x: 90, y: 0, door: { x0: 86.5, x1: 87.2, y0: 0, y1: 3.4, hp: 30 } };
export const EXITS = [{ x: 42.5, y: 0, sec: 'cells' }, { x: 175.2, y: 0, sec: 'hall' }, { x: 262.5, y: 3.6, sec: 'hangar' }];
export const JET = { x0: 244, x1: 262, y: 3.6, ramp: 246 };
// Crates Jean can throw (and anyone can break), placed at the start of the mission
export const CRATES = [[9, 0], [10.1, 0], [33, 0], [47, 0], [62, 0], [64.5, 0], [104, 0], [121, 0], [122.1, 0], [147, 1.1], [168, 0], [200, 3.6], [218, 3.6], [236, 3.6]];

function isSolid(b, gates) { return b.type === 's' || (b.type === 'g' && gates[b.tag]); }
const overlaps = (x0, x1, y0, y1, b) => x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0;

// Body: { x (centre), y (feet), w, h, vx, vy, dropT? }. Sets onGround, wallDir, hitWall, hitCeil.
export function moveBody(body, dt, gates) {
  const hw = body.w / 2;
  body.hitWall = 0; body.hitCeil = false;
  body.x += body.vx * dt;
  for (const b of BOXES) {
    if (!isSolid(b, gates)) continue;
    if (overlaps(body.x - hw, body.x + hw, body.y, body.y + body.h, b)) {
      if (body.x < (b.x0 + b.x1) / 2) { body.x = b.x0 - hw - 1e-4; body.hitWall = 1; }
      else { body.x = b.x1 + hw + 1e-4; body.hitWall = -1; }
      body.vx = 0;
    }
  }
  const prevY = body.y;
  body.y += body.vy * dt;
  body.onGround = false;
  for (const b of BOXES) {
    const solid = isSolid(b, gates);
    if (!solid && b.type !== 'o') continue;
    if (!overlaps(body.x - hw, body.x + hw, body.y, body.y + body.h, b)) continue;
    if (b.type === 'o') {
      if (body.vy <= 0 && prevY >= b.y1 - 0.02 && !(body.dropT > 0)) { body.y = b.y1; body.vy = 0; body.onGround = true; }
      continue;
    }
    if (body.vy <= 0 && prevY >= b.y1 - 0.08) { body.y = b.y1; body.vy = 0; body.onGround = true; }
    else if (body.vy > 0) { body.y = b.y0 - body.h - 1e-4; body.vy = 0; body.hitCeil = true; }
    else {
      const up = b.y1 - body.y, down = body.y + body.h - b.y0;
      if (up < down) { body.y = b.y1; body.onGround = true; } else body.y = b.y0 - body.h;
      body.vy = 0;
    }
  }
  body.wallDir = 0;
  if (!body.onGround) {
    for (const b of BOXES) {
      if (!isSolid(b, gates) || b.type === 'g') continue;
      const ya = body.y + 0.3, yb = body.y + body.h - 0.2;
      if (ya < b.y1 && yb > b.y0) {
        if (Math.abs(body.x + hw - b.x0) < 0.06) body.wallDir = 1;
        else if (Math.abs(body.x - hw - b.x1) < 0.06) body.wallDir = -1;
      }
    }
  }
}

export function hasHeadroom(x, y, w, h, gates) {
  const hw = w / 2;
  for (const b of BOXES) if (isSolid(b, gates) && overlaps(x - hw, x + hw, y + 0.05, y + h, b)) return false;
  return true;
}

export function groundBelow(x, y, gates) {
  let best = -Infinity;
  for (const b of BOXES) {
    if (!(isSolid(b, gates) || b.type === 'o')) continue;
    if (x > b.x0 && x < b.x1 && b.y1 <= y + 0.01 && b.y1 > best) best = b.y1;
  }
  return best;
}

// Slab test of a ray from (x, y) along (dx, dy) against a box: entry distance and face normal, or null
export function rayBoxT(x, y, dx, dy, x0, y0, x1, y1) {
  let tin = -Infinity, tout = Infinity, nx = 0, ny = 0;
  if (Math.abs(dx) < 1e-9) { if (x <= x0 || x >= x1) return null; }
  else {
    const ta = (x0 - x) / dx, tb = (x1 - x) / dx, tn = Math.min(ta, tb);
    if (tn > tin) { tin = tn; nx = dx > 0 ? -1 : 1; ny = 0; }
    tout = Math.min(tout, Math.max(ta, tb));
  }
  if (Math.abs(dy) < 1e-9) { if (y <= y0 || y >= y1) return null; }
  else {
    const ta = (y0 - y) / dy, tb = (y1 - y) / dy, tn = Math.min(ta, tb);
    if (tn > tin) { tin = tn; nx = 0; ny = dy > 0 ? -1 : 1; }
    tout = Math.min(tout, Math.max(ta, tb));
  }
  if (tin > tout || tout < 0) return null;
  return { t: Math.max(0, tin), nx, ny };
}

// The first solid surface along a ray (unit direction) within range: where, how far, and its normal
export function rayCast(x, y, dx, dy, range, gates) {
  let best = range, nx = 0, ny = 0;
  for (const b of BOXES) {
    if (!isSolid(b, gates)) continue;
    const h = rayBoxT(x, y, dx, dy, b.x0, b.y0, b.x1, b.y1);
    if (h && h.t < best) { best = h.t; nx = h.nx; ny = h.ny; }
  }
  return { t: best, x: x + dx * best, y: y + dy * best, nx, ny, wall: best < range };
}

export function segmentBlocked(ax, ay, bx, by, gates) {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
  if (len < 1e-6) return false;
  return rayCast(ax, ay, dx / len, dy / len, len, gates).wall;
}

export function pointInSolid(x, y, gates) {
  for (const b of BOXES) if (isSolid(b, gates) && x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) return true;
  return false;
}
