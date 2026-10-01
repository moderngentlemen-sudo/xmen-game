// Level data, the curved gameplay path (CP-08), and collision helpers.
// The simulation is purely 2D (x along the path, y up). Rendering maps x onto
// a path that runs straight, bends 180° around the Storm Spire tower, then runs straight.

export const ARC_START = 104;
export const ARC_R = 14;
export const ARC_END = ARC_START + Math.PI * ARC_R;

// Returns world position/tangent/normal for sim x. Normal points toward the camera.
export function pathFrame(x) {
  if (x <= ARC_START) {
    return { px: x, pz: 0, tx: 1, tz: 0, nx: 0, nz: 1 };
  }
  if (x < ARC_END) {
    const th = (x - ARC_START) / ARC_R;
    const s = Math.sin(th), c = Math.cos(th);
    return { px: ARC_START + ARC_R * s, pz: -ARC_R + ARC_R * c, tx: c, tz: -s, nx: s, nz: c };
  }
  const d = x - ARC_END;
  return { px: ARC_START - d, pz: -2 * ARC_R, tx: -1, tz: 0, nx: 0, nz: -1 };
}
export const TOWER_CENTER = { x: ARC_START, z: -ARC_R };

// Boxes: [x0, x1, y0, y1, type, tag]. type 's' solid, 'o' one-way, 'g' gate (solid when closed).
const RAW = [
  // Movement gym
  [-12, -10, -6, 30, 's', 'bound'],
  [-10, 14, -6, 0, 's', 'ground'],
  [18, 32, -6, 0, 's', 'ground'],
  [28.5, 29.3, 2.1, 8.6, 's', 'panel'],      // floating wall for wall-jump practice
  [32, 40, -6, 6, 's', 'ledge'],
  [40, 60, -6, 0, 's', 'ground'],
  [44, 50, 1.0, 6.5, 's', 'tunnel'],         // slide or crouch under
  [57.5, 58.5, 0, 3, 's', 'pillar'],         // turret pillar
  // Concourse Lock arena
  [60, 97, -6, 0, 's', 'ground'],
  // Gates reach far above any jump, rocket jump or booster climb, and cannot be wall-slid (energy)
  [62, 62.8, 0, 30, 'g', 'L'],
  [96.2, 97, 0, 30, 'g', 'R'],
  [74, 84, 2.0, 2.4, 'o', 'dais'],
  [63.2, 66.6, 5.0, 5.4, 'o', 'perch'],
  [92.2, 96.0, 5.0, 5.4, 'o', 'perch'],
  [67.5, 68.3, 2.6, 5.0, 's', 'column'],      // floats above head height: walk under, wall-jump off
  [89.9, 90.7, 2.6, 5.0, 's', 'column'],
  // Storm Spire climb (curved path)
  [97, 113, -6, 0, 's', 'ground'],
  [113, 118, -6, 2.5, 's', 'step'],
  [118, 143, -6, 0, 's', 'ground'],
  [120, 124, 4.6, 5.2, 'o', 'plat'],
  [126, 130, 7.6, 8.2, 'o', 'plat'],
  [132, 136.5, 10.6, 11.2, 'o', 'plat'],
  [138.5, 142, 13.2, 13.8, 'o', 'plat'],
  [143, 162, -6, 15.6, 's', 'top'],
  // Skyline Relay: rooftops and sky bridges beyond the Storm Spire (gaps are safe to fail: a fall
  // brings you back to solid ground for a little damage)
  [162, 186, 12.6, 15.6, 's', 'bridge'],      // sky bridge off the tower top
  [190, 214, 5, 15.6, 's', 'roof'],           // relay roof: drone patrol (4 m gap before it)
  [200, 203.5, 15.6, 17.4, 's', 'cover'],     // low block to hide behind or stand on
  [219, 244, 5, 12.6, 's', 'yard'],           // mortar yard, 3 m below the roof
  [229, 229.8, 12.6, 14.8, 's', 'wall'],      // cover walls (chargers crash into them)
  [238, 238.8, 12.6, 14.8, 's', 'wall'],
  [244, 248, 5, 15.6, 's', 'step'],           // climb: step, then the mortar ledge
  [248, 258, 5, 18.6, 's', 'ledge'],
  [258, 258.8, 18.6, 50, 'g', 'L2'],          // Relay Gate
  [258, 298, 5, 18.6, 's', 'relay'],
  [264, 270, 21.6, 22.0, 'o', 'plat'],
  [276, 281, 23.6, 24.0, 'o', 'plat'],
  [287, 293, 21.6, 22.0, 'o', 'plat'],
  [297.2, 298, 18.6, 50, 'g', 'R2'],
  [298, 316, 5, 18.6, 's', 'pad'],            // beacon pad: the end of the route, and the Stormcaller's arena
  [301.5, 305, 21.8, 22.2, 'o', 'plat'],      // perches over the pad: above its sweep, closer to the gunship
  [309, 312.5, 21.8, 22.2, 'o', 'plat'],
  [316, 318, -6, 50, 's', 'bound'],
];

export const BOXES = RAW.map(([x0, x1, y0, y1, type, tag]) => ({ x0, x1, y0, y1, type, tag }));
// Left and right ends of the level: projectiles that leave this span are gone
export const LEVEL_X0 = Math.min(...BOXES.map(b => b.x0)), LEVEL_X1 = Math.max(...BOXES.map(b => b.x1));
export const GATES = { L: false, R: false, L2: false, R2: false };

export const ZONES = [
  { id: 'gym', name: 'Danger Room', x0: -10, x1: 60, spawn: { x: 0, y: 0 } },
  { id: 'arena', name: 'Sentinel Works', x0: 60, x1: 97, spawn: { x: 58.5, y: 0 } },
  { id: 'tower', name: 'Trask Tower', x0: 97, x1: 162, spawn: { x: 100, y: 0 } },
  { id: 'skyline', name: 'Rooftop Relay', x0: 162, x1: 318, spawn: { x: 166, y: 15.6 } },
];
export function zoneAt(x) {
  return ZONES.find(z => x >= z.x0 && x < z.x1) || ZONES[0];
}

export const CHECKPOINTS = [
  { x: 0, y: 0 }, { x: 58.5, y: 0 }, { x: 100, y: 0 }, { x: 152, y: 15.6 },
  { x: 166, y: 15.6 }, { x: 193, y: 15.6 }, { x: 222, y: 12.6 }, { x: 252, y: 18.6 }, { x: 302, y: 18.6 },
];

// Skyline Relay encounters. Each starts when a player passes `trigger`; the next wave comes when at
// most one enemy of the current wave is left, and the last wave must be cleared. `extra` joins the
// first wave with three or more players. Gated encounters seal the Relay Gate until cleared.
export const ENCOUNTERS = [
  { id: 'patrol', trigger: 191, banner: ['Rooftop Relay', 'Sentinel drones inbound.'],
    waves: [[['drone', 204, 19.5], ['drone', 209, 20.5], ['swarmer', 207, 15.6], ['swarmer', 211, 15.6]]],
    extra: [['drone', 212, 19]] },
  { id: 'yard', trigger: 221, banner: ['Artillery Deck', 'Watch for the landing markers.'],
    waves: [[['mortar', 251, 18.6], ['mortar', 255.5, 18.6], ['charger', 240, 12.6], ['swarmer', 233, 12.6]]],
    extra: [['swarmer', 236, 12.6]] },
  { id: 'relay', trigger: 261, gates: ['L2', 'R2'], inside: 260, banner: ['Relay Gate', 'Gates sealed. Take the relay.'],
    waves: [
      [['shield', 286, 18.6], ['charger', 292, 18.6], ['drone', 272, 23], ['drone', 284, 25], ['sniper', 278.5, 24]],
      [['brute', 290, 18.6], ['charger', 266, 18.6], ['drone', 270, 24], ['drone', 288, 24.5], ['mortar', 294, 18.6],
        ['swarmer', 280, 18.6], ['swarmer', 284, 18.6]],
    ],
    waveBanners: [null, ['Final wave', 'A Mk-I Sentinel holds the relay.']],
    extra: [['swarmer', 276, 18.6]],
    cleared: ['Relay secured', 'Gates open. The beacon is ahead.'] },
  // The level boss: Magneto, on a slab of steel above the beacon he has seized. Its gate seals behind the team.
  { id: 'beacon', trigger: 300.5, gates: ['R2'], inside: 299.5, boss: 'stormcaller', bossAt: [308, 32], banner: ['Magneto', 'He has seized the Sentinel beacon.'],
    cleared: ['Beacon secured', 'Magneto is down. The Sentinels go quiet.'] },
];
export const ROUTE_END_X = 304;

export const KILL_Y = -10;
export const ARENA_TRIGGER_X = 64;
export const TOWER_TRIGGER_X = 108;

function isSolid(b) {
  return b.type === 's' || (b.type === 'g' && GATES[b.tag]);
}

function overlaps(x0, x1, y0, y1, b) {
  return x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0;
}

// Body: { x (centre), y (feet), w, h, vx, vy }. Sets onGround, wallDir, hitWall, hitCeil.
export function moveBody(body, dt) {
  const hw = body.w / 2;
  body.hitWall = 0; body.hitCeil = false;
  // Horizontal
  body.x += body.vx * dt;
  for (const b of BOXES) {
    if (!isSolid(b)) continue;
    if (overlaps(body.x - hw, body.x + hw, body.y, body.y + body.h, b)) {
      if (body.x < (b.x0 + b.x1) / 2) { body.x = b.x0 - hw - 1e-4; body.hitWall = 1; }
      else { body.x = b.x1 + hw + 1e-4; body.hitWall = -1; }
      body.vx = 0;
    }
  }
  // Vertical
  const prevY = body.y;
  body.y += body.vy * dt;
  body.onGround = false;
  for (const b of BOXES) {
    const solid = isSolid(b);
    if (!solid && b.type !== 'o') continue;
    if (!overlaps(body.x - hw, body.x + hw, body.y, body.y + body.h, b)) {
      continue;
    }
    if (b.type === 'o') {
      if (body.vy <= 0 && prevY >= b.y1 - 0.02 && !(body.dropT > 0)) {
        body.y = b.y1; body.vy = 0; body.onGround = true;
      }
      continue;
    }
    if (body.vy <= 0 && prevY >= b.y1 - 0.08) {
      body.y = b.y1; body.vy = 0; body.onGround = true;
    } else if (body.vy > 0) {
      body.y = b.y0 - body.h - 1e-4; body.vy = 0; body.hitCeil = true;
    } else {
      // Embedded (e.g. stood up under a ceiling): push toward the nearer vertical side
      const up = b.y1 - body.y, down = body.y + body.h - b.y0;
      if (up < down) { body.y = b.y1; body.onGround = true; } else { body.y = b.y0 - body.h; }
      body.vy = 0;
    }
  }
  // Wall contact probe (for wall cling while airborne). Gates are energy barriers: nothing to cling to.
  body.wallDir = 0;
  if (!body.onGround) {
    for (const b of BOXES) {
      if (!isSolid(b) || b.type === 'g') continue;
      const ya = body.y + 0.3, yb = body.y + body.h - 0.2;
      if (ya < b.y1 && yb > b.y0) {
        if (Math.abs(body.x + hw - b.x0) < 0.06) body.wallDir = 1;
        else if (Math.abs(body.x - hw - b.x1) < 0.06) body.wallDir = -1;
      }
    }
  }
}

// Can a body of height h stand at (x, y)?
export function hasHeadroom(x, y, w, h) {
  const hw = w / 2;
  for (const b of BOXES) {
    if (!isSolid(b)) continue;
    if (overlaps(x - hw, x + hw, y + 0.05, y + h, b)) return false;
  }
  return true;
}

export function groundBelow(x, y) {
  let best = -Infinity;
  for (const b of BOXES) {
    if (!(isSolid(b) || b.type === 'o')) continue;
    if (x > b.x0 && x < b.x1 && b.y1 <= y + 0.01 && b.y1 > best) best = b.y1;
  }
  return best;
}

// Segment-vs-solid test for line of sight (slab method).
export function segmentBlocked(ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay;
  for (const b of BOXES) {
    if (!isSolid(b)) continue;
    let t0 = 0, t1 = 1;
    const check = (p, q) => {
      if (Math.abs(p) < 1e-9) return q >= 0;
      const r = q / p;
      if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; }
      else { if (r < t0) return false; if (r < t1) t1 = r; }
      return true;
    };
    if (check(-dx, ax - b.x0) && check(dx, b.x1 - ax) && check(-dy, ay - b.y0) && check(dy, b.y1 - ay)) {
      if (t0 <= t1) return true;
    }
  }
  return false;
}

// Slab test of a ray from (x, y) along (dx, dy) against a box: the entry distance and the face normal hit,
// or null. A ray that starts inside the box enters at 0.
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

// The first solid surface along a ray (unit direction), up to `range` m: where it is, how far, and the
// surface normal there (wall: false when nothing is hit within range)
export function rayCast(x, y, dx, dy, range) {
  let best = range, nx = 0, ny = 0;
  for (const b of BOXES) {
    if (!isSolid(b)) continue;
    const h = rayBoxT(x, y, dx, dy, b.x0, b.y0, b.x1, b.y1);
    if (h && h.t < best) { best = h.t; nx = h.nx; ny = h.ny; }
  }
  return { t: best, x: x + dx * best, y: y + dy * best, nx, ny, wall: best < range };
}

export function pointInSolid(x, y) {
  for (const b of BOXES) {
    if (isSolid(b) && x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) return true;
  }
  return false;
}
