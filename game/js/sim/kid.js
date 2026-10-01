// The young mutant the team came for. Caged in the cell block until the door is broken; then she follows the
// nearest hero, ducks when Sentinels come close, hops small steps, and can be knocked down (a hero standing by
// her brings her round). Collectors grab her and carry her off; Jean can hold her in her telekinetic grip,
// which keeps her out of reach. At the end she runs for the X-Jet.
import { DT, GRAVITY, MAX_FALL, KID } from './config.js';
import { moveBody, CELL, JET } from './level.js';
import { emit } from './world.js';
import { isDown } from './player.js';

export function makeKid(x, y, state = 'caged') {
  return { kind: 'kid', id: -1, x, y, vx: 0, vy: 0, w: KID.w, h: KID.h, facing: 1, onGround: true, hp: KID.hp, maxHp: KID.hp,
    state, st: 0, mercy: 0, revive: 0, carriedBy: 0, heldBy: 0, leader: 0, scared: 0 };
}

export function updateKid(S) {
  const k = S.kid;
  if (!k) return;
  k.st++;
  if (k.mercy > 0) k.mercy--;
  switch (k.state) {
    case 'caged':
      if (!S.gates.cell) { k.state = 'follow'; k.st = 0; emit(S, 'kidReleased', { x: k.x, y: k.y }); }
      else { k.vx = Math.sin(S.tick * 0.03) * 0.6; body(S, k); }   // pacing the cell
      return;
    case 'carried': case 'held': case 'boarded': return;
    case 'downed': {
      k.vx *= 0.8; body(S, k);
      const near = S.players.some(p => !isDown(p) && Math.abs(p.x - k.x) < 1.5 && Math.abs(p.y - k.y) < 1.5);
      k.revive = near ? k.revive + 1 : Math.max(0, k.revive - 0.5);
      if (k.revive >= KID.revive) { k.hp = Math.round(KID.hp * 0.5); k.state = 'follow'; k.st = 0; k.mercy = 60; emit(S, 'kidUp', { x: k.x, y: k.y }); }
      return;
    }
    case 'run': {
      // For the jet: straight to the ramp, hopping steps
      k.facing = 1; k.vx = KID.speed; hop(S, k); body(S, k);
      if (k.x >= JET.ramp && k.y >= JET.y - 0.2) { k.state = 'boarded'; k.st = 0; emit(S, 'kidBoarded', { x: k.x, y: k.y }); }
      return;
    }
  }
  // Follow or cower: stay near the nearest hero, a little behind them
  let lead = null, ld = Infinity;
  for (const p of S.players) { if (isDown(p) || p.state === 'held' || p.state === 'thrown') continue; const d = Math.abs(p.x - k.x) + Math.abs(p.y - k.y); if (d < ld) { ld = d; lead = p; } }
  let danger = 0;
  for (const e of S.enemies) if (!e.dead && Math.abs(e.x - k.x) < 3 && Math.abs(e.y - k.y) < 2.5) danger++;
  k.scared = danger;
  if (danger && k.state === 'follow') { k.state = 'cower'; k.st = 0; emit(S, 'kidScared', { x: k.x, y: k.y }); }
  if (!danger && k.state === 'cower' && k.st > 40) { k.state = 'follow'; k.st = 0; }
  if (lead) {
    const want = lead.x - lead.facing * 1.4, dx = want - k.x, far = Math.abs(lead.x - k.x);
    const speed = k.state === 'cower' ? KID.speed * 0.7 : KID.speed;
    if (far > KID.follow[0] && Math.abs(dx) > 0.4) { k.vx = Math.sign(dx) * speed * Math.min(1, far / 3); k.facing = Math.sign(dx); }
    else k.vx *= 0.7;
    if (lead.y > k.y + 1 && Math.abs(lead.x - k.x) < 4 && k.onGround) { k.vy = KID.jumpV; k.onGround = false; }
  } else k.vx *= 0.8;
  hop(S, k);
  body(S, k);
}
// Hop over anything knee-high in the way
function hop(S, k) { if (k.onGround && k.hitWall && Math.abs(k.vx) > 0.5) { k.vy = KID.jumpV; k.onGround = false; } }
function body(S, k) {
  k.vy = Math.max(k.vy - GRAVITY * DT, -MAX_FALL);
  moveBody(k, DT, S.gates);
}
export { CELL };
