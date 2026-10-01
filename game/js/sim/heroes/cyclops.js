// Cyclops, the tactician. Power is the optic blast: hold to open the visor's aperture (wider: more damage, a
// wider beam that pierces, more banks off walls at true angles), let go to fire. Every blast builds strain;
// at the top he has to take a breather. A blast aimed at the ground vaults him up. Signature: Tactical Call
// tags a target; teammates' hits on it become team hits (harder, never countered, and they fill the X-Gauge).
// While Jean's psychic rapport is up, his blasts bend round cover onto targets.
import { DT, HEROES, TEAM, ADAPT } from '../config.js';
import { rayCast, rayBoxT } from '../level.js';
import { emit, newId } from '../world.js';
import { physics } from '../player.js';
import { hitEnemy, breakProp } from '../combat.js';

const C = () => HEROES.cyclops;

export default {
  init(p) { p.openT = 0; p.strain = 0; p.overheatT = 0; p.blastCd = 0; p.callCd = 0; p.vaulted = false; },

  tick(S, p) {
    const O = C().optic;
    if (p.blastCd > 0) p.blastCd--;
    if (p.callCd > 0) p.callCd--;
    if (p.overheatT > 0) { if (--p.overheatT === 0) { p.strain = 40; emit(S, 'cooled', { id: p.id }); } }
    else if (p.openT === 0) p.strain = Math.max(0, p.strain - O.cool);
    if (p.onGround) p.vaulted = false;
  },

  power(S, p, cmd, E) {
    const O = C().optic, holding = (p.held & 2) !== 0;
    if (p.overheatT > 0) { if (p.openT) p.openT = 0; return false; }
    if (holding && p.openT === 0 && p.blastCd === 0) { p.openT = 1; p.buf.power = 99; emit(S, 'apertureOpen', { id: p.id }); }   // a held Power opens it as soon as he is free
    if (p.openT > 0) {
      if (holding) {
        p.openT++;
        p.strain = Math.min(O.strainMax, p.strain + 0.06);   // holding the visor open wears on him too
        if (Math.abs(p.aimX) > 0.15) p.facing = p.aimX > 0 ? 1 : -1;
        physics(S, p, C().run * 0.55, cmd, E, false);
        p.facing = Math.abs(p.aimX) > 0.15 ? (p.aimX > 0 ? 1 : -1) : p.facing;
        return true;
      }
      fire(S, p);
      return false;
    }
    return false;
  },

  sig(S, p) {
    const K = C().call;
    if (p.callCd > 0) { emit(S, 'sigWait', { id: p.id, t: p.callCd }); return; }
    // The enemy nearest the line of his aim
    let best = null, bestScore = -Infinity;
    for (const e of S.enemies) {
      if (e.dead) continue;
      const dx = e.x - p.x, dy = e.y + e.h * 0.6 - (p.y + p.h * 0.9), d = Math.hypot(dx, dy);
      if (d > K.range || d < 0.1) continue;
      const dot = (dx * p.aimX + dy * p.aimY) / d;
      const score = dot * 2 - d / K.range;
      if (dot > 0.4 && score > bestScore) { bestScore = score; best = e; }
    }
    if (!best) { emit(S, 'sigFail', { id: p.id, why: 'no target' }); return; }
    S.called = { id: best.id, by: p.id, t: K.ticks };
    p.callCd = K.cd;
    emit(S, 'called', { id: p.id, target: best.id, x: best.x, y: best.y + best.h });
  },

  cancel(S, p) { p.openT = 0; },
};

// ---- The optic blast -----------------------------------------------------------------------------------------
function fire(S, p) {
  const O = C().optic, a = p.openT < O.tap ? 0 : Math.min(1, (p.openT - O.tap) / (O.open - O.tap));
  p.openT = 0; p.blastCd = O.cd;
  const lerp = (r) => r[0] + (r[1] - r[0]) * a;
  const eye = { x: p.x + p.facing * 0.12, y: p.y + p.h * 0.9 };
  let dx = p.aimX, dy = p.aimY;
  if (!p.aimFree && Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1) { dx = p.facing; dy = 0; }
  const rapport = S.rapportT > 0;
  const blast = { dmg: lerp(O.dmg), width: lerp(O.width), banks: Math.round(lerp(O.banks)), poise: lerp(O.poise), pierce: a >= 0.6, power: rapport ? 'team' : 'optic',
    inst: newId(S), mult: rapport ? TEAM.rapport.bonus : 1 };
  const pts = rapport ? bentPath(S, eye.x, eye.y, dx, dy, O.range) : bankPath(S, eye.x, eye.y, dx, dy, O.range, blast.banks);
  const hits = sweep(S, p, pts, blast);
  p.strain += lerp(O.strain);
  if (p.strain >= O.strainMax) { p.strain = O.strainMax; p.overheatT = O.breather; emit(S, 'overheat', { id: p.id, x: p.x, y: p.y + p.h }); }
  // Fired at the ground: he vaults (once per airtime)
  if (dy < -0.7 && !p.vaulted) { p.vy = O.vault * (0.65 + 0.35 * a); p.onGround = false; p.vaulted = true; emit(S, 'vault', { id: p.id, x: p.x, y: p.y }); }
  else p.vx -= dx * 2.5 * a;
  emit(S, 'optic', { id: p.id, pts, a, width: blast.width, hits, rapport, x: eye.x, y: eye.y });
}

// The beam's path: straight along the aim, reflecting off solid walls at true angles, up to `banks` times
export function bankPath(S, x, y, dx, dy, range, banks) {
  const pts = [[x, y]];
  let left = range;
  for (let i = 0; i <= banks && left > 0.2; i++) {
    const w = rayCast(x, y, dx, dy, left, S.gates);
    pts.push([w.x, w.y]); left -= w.t;
    if (!w.wall || i === banks) break;
    if (w.nx) dx = -dx; if (w.ny) dy = -dy;
    x = w.x + dx * 0.02; y = w.y + dy * 0.02;
  }
  return pts;
}
// Psychic rapport: Jean's telekinesis steers the beam toward the nearest enemy it can find, round cover
function bentPath(S, x, y, dx, dy, range) {
  const pts = [[x, y]], R = TEAM.rapport, step = 0.5;
  let target = null, best = Infinity;
  for (const e of S.enemies) {
    if (e.dead) continue;
    const ex = e.x - x, ey = e.y + e.h * 0.6 - y, d = Math.hypot(ex, ey);
    const dot = (ex * dx + ey * dy) / (d || 1);
    const score = d * (1.6 - dot);
    if (d < range && score < best) { best = score; target = e; }
  }
  let travelled = 0;
  while (travelled < range) {
    if (target && !target.dead) {
      const tx = target.x - x, ty = target.y + target.h * 0.6 - y, td = Math.hypot(tx, ty);
      if (td < 0.4) break;
      // Turn toward the target, but never into a wall: try the turned heading, then wider ones
      const want = Math.atan2(ty, tx);
      let ang = Math.atan2(dy, dx);
      let diff = want - ang; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2;
      ang += Math.max(-R.turn * step, Math.min(R.turn * step, diff));
      for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1]) {
        const a2 = ang + off, nx = Math.cos(a2), ny = Math.sin(a2);
        if (!rayCast(x, y, nx, ny, step + 0.1, S.gates).wall) { dx = nx; dy = ny; break; }
      }
    }
    const w = rayCast(x, y, dx, dy, step, S.gates);
    x = w.x; y = w.y; travelled += w.t;
    pts.push([x, y]);
    if (w.wall) break;
  }
  return pts;
}

// Everything the beam's segments touch: enemies (all of them at a wide aperture, else the first), crates,
// the cell door. Returns the ids hit.
function sweep(S, p, pts, B) {
  const hits = [], r = B.width / 2;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], len = Math.hypot(bx - ax, by - ay);
    if (len < 1e-4) continue;
    const ux = (bx - ax) / len, uy = (by - ay) / len;
    const cand = [];
    for (const e of S.enemies) {
      if (e.dead || hits.includes(e.id)) continue;
      const t = rayBoxT(ax, ay, ux, uy, e.x - e.w / 2 - r, e.y - r, e.x + e.w / 2 + r, e.y + e.h + r);
      if (t && t.t <= len) cand.push({ e, t: t.t });
    }
    cand.sort((m, n) => m.t - n.t);
    for (const { e } of cand) {
      hits.push(e.id);
      hitEnemy(S, e, { owner: p.id, team: 'p', inst: B.inst, power: B.power, dmg: B.dmg * B.mult, poise: B.poise, kb: [ux * 7, 3 + uy * 4], heavy: B.dmg > 8, kind: 'optic' });
      if (!B.pierce) return hits;
    }
    for (const c of S.props) {
      if (c.broken || c.heldBy) continue;
      const t = rayBoxT(ax, ay, ux, uy, c.x - c.w / 2 - r, c.y - r, c.x + c.w / 2 + r, c.y + c.h + r);
      if (t && t.t <= len) breakProp(S, c);
    }
    const D = S.mission.door;
    if (D && D.hp > 0) {
      const t = rayBoxT(ax, ay, ux, uy, D.x0 - r, D.y0, D.x1 + r, D.y1);
      if (t && t.t <= len) { D.hp -= B.dmg; emit(S, 'doorHit', { x: (D.x0 + D.x1) / 2, y: 1.6, hp: D.hp }); if (D.hp <= 0) { S.gates.cell = false; emit(S, 'doorBroken', { x: (D.x0 + D.x1) / 2, y: 1.6 }); } }
    }
  }
  return hits;
}
export { ADAPT, DT };
