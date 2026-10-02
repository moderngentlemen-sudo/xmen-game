// Hit reactions: what a Sentinel does when a hero's hit lands (phase 1). hitEnemy (combat.js) deals the damage and
// the hitstop, then hands the hit to react(), which picks one of the twelve reactions and starts it; updateReaction
// runs the reaction states a tick at a time from updateEnemies. The numbers live in config.js (REACT, JUGGLE, STUN).
//
// The twelve (REACTIONS in config.js):
//   flinch        light hits: a short recoil (REACT.flinch ticks) that pauses the Sentinel's brain without
//                 cancelling its attack, so a tell keeps its timing. Heavy units (mass above 1, or armoured) ignore it
//   stagger       heavy hits and broken poise: stumbles back and cannot act (V2's stagger)
//   knockdown     sweeps and string enders: flies with the knockback, lands on its back for REACT.down ticks, then
//                 gets up. It can be hit once on the floor (OTG): that hit pops it up into a juggle
//   launch        launchers: flies up, open to an air combo (V2's launch)
//   airHit        any hit on a Sentinel in the air: it hangs, pushed a little higher
//   wallBounce    lunges and forward throws: flies flat; at a wall it comes back at REACT.wallKeep of its speed,
//                 into a juggle. Once per combo
//   groundBounce  spikes and slams: driven into the floor, it bounces back up at REACT.groundVy. Once per combo
//   crumple       counters and some heavies: folds slowly in place for REACT.crumple ticks, then lies down
//   spinOut       sweeping strikes: spins away along the floor and knocks over the Sentinels it meets
//   stun          a broken stun bar: sways, dazed, for STUN.ticks; open to an execution (step 1.6)
//   held, thrown  Jean's grip and throw (enemies.js and heroes/jean.js run them)
// Rules on top: juggle weight (JUGGLE) builds with every hit in the air and makes the Sentinel fall faster; at
// JUGGLE.limit it flips out, lands on its feet and cannot be hit for JUGGLE.flipOut ticks. The stun bar fills with
// poise damage and drains when the Sentinel is left alone. Bosses, and Sentinels that are lifted, held or thrown,
// react as in V2 (stagger or launch on broken poise, else a shove).
//
// A move picks its reaction with its `react` field (moves/schema.js); a hit without one (powers, team-ups, crates)
// reacts as in V2: launch for a launcher, stagger on broken poise, else a flinch.
import { ENEMIES, JUGGLE, REACT, STUN } from './config.js';
import { emit, newId } from './world.js';
import { hitEnemy, releaseToken, dropCarried } from './combat.js';

export { REACTIONS } from './config.js';

// The states a reaction puts a Sentinel in, besides V2's stagger and launched
const OWN = ['flinch', 'knockdown', 'wallBounce', 'groundBounce', 'crumple', 'spinOut', 'stun', 'flipOut'];
export const isReacting = e => OWN.includes(e.state) || e.state === 'stagger' || e.state === 'launched';
// In the air in a juggle: further hits are air hits and add juggle weight
const AIRBORNE = ['launched', 'knockdown', 'wallBounce', 'groundBounce', 'spinOut', 'stagger'];
const inAir = e => !e.onGround && AIRBORNE.includes(e.state);

// Can a hero's hit land on it now? Not in the first JUGGLE.flipOut ticks of a flip-out, nor once its one hit on the floor (OTG) is spent
export const hittable = e => !(e.flipT > 0) && !(e.state === 'knockdown' && e.lying && e.otgUsed);

function setR(S, e, state, kind) {
  e.state = state; e.st = 0; e.atk = null; releaseToken(S, e);
  if (kind) emit(S, 'react', { id: e.id, react: kind, x: e.x, y: e.y + e.h * 0.6 });
}

// V2's reaction, for bosses and for Sentinels that are lifted, held or thrown
function legacy(S, e, h, T) {
  const lifted = e.liftT > 0, carrying = e.carry;
  if (e.poise >= T.poise || (h.launch && T.mass <= 1) || lifted) {
    if (!lifted) e.poise = 0;
    if (carrying) dropCarried(S, e);
    if (!T.boss || e.poise === 0) {
      e.atk = null; releaseToken(S, e);
      const kb = h.kb || [0, 0], m = T.mass;
      e.vx = kb[0] / m; e.vy = lifted ? Math.max(e.vy, 1.5) : kb[1] / m;
      if (e.vy > 0) e.onGround = false;
      e.state = (h.launch || e.vy > 6) && !lifted ? 'launched' : 'stagger'; e.st = 0; e.staggerT = h.heavy ? 50 : 30;
      emit(S, 'stagger', { id: e.id, x: e.x, y: e.y + e.h * 0.6 });
    }
  } else if (T.mass <= 1 && !T.boss) {
    e.vx += (h.kb ? h.kb[0] : 0) * 0.35;   // light shove
  }
}

// A hero's hit has landed on e (alive, damage dealt, poise added by hitEnemy): start the reaction it causes
export function react(S, e, h, poiseDealt) {
  const T = ENEMIES[e.type];
  e.stun = (e.stun || 0) + poiseDealt; e.calmT = 0;
  if (T.boss || e.liftT > 0 || e.state === 'held' || e.state === 'thrown') { legacy(S, e, h, T); return; }
  const kb = h.kb || [0, 0], m = T.mass, heavyUnit = m > 1 || e.armour > 0;
  const broke = e.poise >= T.poise;
  if (broke) e.poise = 0;
  // The floor hit (OTG): one hit on a Sentinel lying down pops it back up into a juggle
  if (e.state === 'knockdown' && e.lying) {
    e.otgUsed = true; e.lying = false; e.vy = 6; e.vx = kb[0] * 0.2 / m; e.onGround = false;
    e.juggle += JUGGLE.hit; setR(S, e, 'launched', 'otg'); return;
  }
  let kind = h.react || (h.launch ? 'launch' : broke ? (kb[1] / m > 6 ? 'launch' : 'stagger') : 'flinch');
  if (kind === 'flinch' && broke) kind = 'stagger';
  if (kind === 'launch' && m > 1) kind = broke ? 'stagger' : 'flinch';   // heavy units are not launched (V2)
  const air = inAir(e);
  if (kind === 'airHit' && !air) kind = broke ? 'stagger' : 'flinch';   // an air move on a Sentinel standing
  if (e.carry && (broke || kind !== 'flinch')) dropCarried(S, e);
  // The stun bar: once full, the next grounded hit that would flinch or stagger stuns instead
  if (!air && e.stun >= T.poise * STUN.bar && (kind === 'flinch' || kind === 'stagger' || kind === 'crumple')) kind = 'stun';
  if (air && !['launch', 'wallBounce', 'groundBounce', 'spinOut'].includes(kind)) kind = 'airHit';
  // Juggle weight: hits in the air, and launchers. Past the limit the Sentinel flips out of the combo
  if (air || kind === 'launch') {
    e.juggle += h.juggle !== undefined ? h.juggle : kind === 'launch' ? JUGGLE.launcher : JUGGLE.hit;
    if (air && e.juggle >= JUGGLE.limit) {
      e.vy = 7; e.vx = -Math.sign(kb[0] || e.facing) * 2; e.flipT = JUGGLE.flipOut;
      setR(S, e, 'flipOut', 'flipOut'); return;
    }
  }
  // Stunned: lighter blows keep it dazed (with a nudge); anything that sends it flying ends the stun
  if (e.state === 'stun' && (kind === 'flinch' || kind === 'stagger' || kind === 'stun' || kind === 'crumple')) { e.vx += kb[0] * 0.15 / m; return; }
  if (kind === 'flinch') {
    if (heavyUnit) return;   // armour shrugs off light hits: the hitstop is all
    e.flinchT = REACT.flinch; e.vx += kb[0] * 0.35;
    return;
  }
  if (e.state === 'stun' || kind === 'stun') { e.stun = 0; }
  switch (kind) {
    case 'stagger':
      e.vx = kb[0] / m; e.vy = kb[1] / m; if (e.vy > 0) e.onGround = false;
      e.state = 'stagger'; e.st = 0; e.atk = null; releaseToken(S, e); e.staggerT = h.heavy ? 50 : 30;
      emit(S, 'stagger', { id: e.id, x: e.x, y: e.y + e.h * 0.6 });
      return;
    case 'launch':
      e.vx = kb[0] / m; e.vy = Math.max(kb[1] / m, 6); e.onGround = false; e.staggerT = h.heavy ? 50 : 30;
      setR(S, e, 'launched', 'launch'); emit(S, 'stagger', { id: e.id, x: e.x, y: e.y + e.h * 0.6 });
      return;
    case 'airHit':
      e.vx = kb[0] * 0.3 / m; e.vy = Math.max(e.vy, REACT.airPop + Math.max(0, kb[1]) * 0.2);
      if (e.state !== 'launched') setR(S, e, 'launched'); else e.st = 0;
      emit(S, 'react', { id: e.id, react: 'airHit', x: e.x, y: e.y + e.h * 0.6 });
      return;
    case 'knockdown':
      e.vx = kb[0] / m; e.vy = Math.max(kb[1] / m, 3); e.onGround = false; e.lying = false; e.downT = 0;
      setR(S, e, 'knockdown', 'knockdown'); return;
    case 'wallBounce':
      if (e.wallBounced) { e.vx = kb[0] / m; e.vy = Math.max(kb[1] / m, 3); e.onGround = false; e.lying = false; e.downT = 0; setR(S, e, 'knockdown', 'knockdown'); return; }
      e.vx = Math.sign(kb[0] || 1) * Math.max(Math.abs(kb[0]), REACT.wallSpeed) / m; e.vy = 2.5; e.onGround = false;
      setR(S, e, 'wallBounce', 'wallBounce'); return;
    case 'groundBounce':
      if (e.groundBounced) { e.vx = kb[0] * 0.3 / m; e.vy = Math.min(e.vy, -6); e.lying = false; e.downT = 0; setR(S, e, 'knockdown', 'knockdown'); return; }
      e.vx = kb[0] * 0.3 / m; e.vy = -REACT.spikeVy; e.onGround = false;
      setR(S, e, 'groundBounce', 'groundBounce'); return;
    case 'crumple':
      e.vx = 0; e.crumpleT = REACT.crumple; setR(S, e, 'crumple', 'crumple'); return;
    case 'spinOut':
      e.vx = Math.sign(kb[0] || 1) * Math.max(Math.abs(kb[0]), REACT.spinSpeed) / m; e.vy = 2; e.onGround = false;
      e.spinInst = newId(S); e.spinBy = h.owner || 0;
      setR(S, e, 'spinOut', 'spinOut'); return;
    case 'stun':
      e.vx = 0; e.stunT = STUN.ticks; setR(S, e, 'stun', 'stun'); return;
  }
}

// One tick of a reaction state; false when e is not in one (updateEnemies runs its brain instead). `physics` is
// enemies.js's body step, (S, e, friction)
export function updateReaction(S, e, physics) {
  if (e.flipT > 0) e.flipT--;
  switch (e.state) {
    case 'stagger':
      if (--e.staggerT <= 0 && e.onGround) recover(e);
      physics(S, e, 0.9); return true;
    case 'launched':
      physics(S, e, 0.9);
      // A launched Sentinel that comes down lands on its back; one only nudged into the air lands on its feet
      if (e.onGround && e.st > 3) { if (e.juggle > 0) layDown(S, e); else if (--e.staggerT <= 0) recover(e); }
      return true;
    case 'knockdown':
      physics(S, e, 0.85);
      if (!e.lying && e.onGround && e.st > 2) layDown(S, e);
      else if (e.lying && ++e.downT >= REACT.down) recover(e);
      return true;
    case 'wallBounce':
      physics(S, e, 1);   // flat and fast, skidding along the floor if it comes down, until a wall or `wallTicks`
      if (e.hitWall) {
        e.wallBounced = true; e.vx = -e.vx * REACT.wallKeep; if (Math.abs(e.vx) < 3) e.vx = -Math.sign(e.vx || e.facing) * 3; e.vy = 6; e.onGround = false;
        e.juggle += JUGGLE.hit; e.state = 'launched'; e.st = 0; e.staggerT = 30;
        emit(S, 'wallBounce', { id: e.id, x: e.x, y: e.y + e.h * 0.5, dir: Math.sign(e.vx) });
      } else if (e.st > REACT.wallTicks) { e.state = 'launched'; e.st = 4; e.juggle = Math.max(e.juggle, 1); }   // no wall in reach: it skids to a fall
      return true;
    case 'groundBounce':
      physics(S, e, 1);
      if (e.onGround) {
        e.groundBounced = true; e.vy = REACT.groundVy; e.onGround = false; e.juggle += JUGGLE.hit;
        e.state = 'launched'; e.st = 0; e.staggerT = 30;
        emit(S, 'groundBounce', { id: e.id, x: e.x, y: e.y });
      }
      return true;
    case 'crumple':
      e.vx *= 0.7; physics(S, e, 0.7);
      if (--e.crumpleT <= 0) layDown(S, e);
      return true;
    case 'spinOut': {
      physics(S, e, 0.97);
      // It bowls over the Sentinels it meets, once each
      for (const o of S.enemies) {
        if (o === e || o.dead || !hittable(o) || (o.hitInst && o.hitInst.includes(e.spinInst))) continue;
        if (Math.abs(o.x - e.x) > (o.w + e.w) / 2 || e.y > o.y + o.h || e.y + e.h < o.y) continue;
        (o.hitInst ||= []).push(e.spinInst); if (o.hitInst.length > 8) o.hitInst.shift();
        hitEnemy(S, o, { owner: e.spinBy, team: 'p', inst: e.spinInst, power: 'plain', dmg: REACT.spinDmg, poise: 0, kb: [Math.sign(e.vx) * 7, 5], react: 'knockdown', kind: 'spinOut' });
      }
      if (e.st > REACT.spinTicks || (e.onGround && e.st > 6 && Math.abs(e.vx) < 2)) layDown(S, e);
      return true;
    }
    case 'stun':
      e.vx *= 0.8; physics(S, e, 0.8);
      if (--e.stunT <= 0) recover(e);
      return true;
    case 'flipOut':
      physics(S, e, 0.9);
      if (e.onGround && e.st > 2) { e.flipT = 0; recover(e); }
      return true;
  }
  return false;
}

function layDown(S, e) {
  e.state = 'knockdown'; e.st = 0; e.lying = true; e.downT = 0; e.vx *= 0.3;   // the floor hit stays spent until it gets up
  emit(S, 'react', { id: e.id, react: 'down', x: e.x, y: e.y + 0.3 });
}
// Back on its feet: the combo on it is over
function recover(e) {
  e.state = 'idle'; e.st = 0; e.lying = false; e.juggle = 0; e.wallBounced = false; e.groundBounced = false; e.otgUsed = false;
}
