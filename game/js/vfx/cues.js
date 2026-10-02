// Effect cues: what each simulation event shows, as calls on the effects layer (fx.js): sparks, flashes, rings,
// smoke, ribbons, debris. FX.onEvent plays the event's cue; effects that last as long as a state (shield bubbles,
// grips, marks, beams) are drawn from the state in FX.update instead. Phase 0 moved V2's event switch here as it
// was, call for call.
// Colours follow looks.js: every threat in hostile magenta (violet for unblockables), every hero effect in that
// hero's power colour.
import { HOSTILE, TELL, POWER_COLORS, HERO_LOOKS } from '../looks.js';

const pc = POWER_COLORS;

// Visuals that last as long as a move's active ticks, drawn every frame from the move's state (FX.syncPersistent
// calls these): keyed by hero, then move id; `k` runs 0 to 1 over the active ticks
const eyeOf = p => [p.x + p.facing * 0.15, p.y + p.h * 0.9];
export const MOVE_FX = {
  cyclops: {
    // Optic Overdrive: the full beam, swept across the room, wider and whiter at its heart
    super(fx, p, m, k) { const [x, y] = eyeOf(p), len = m.boxes[0][1]; fx.ribbon([[x, y], [x + p.facing * len, y + Math.sin(k * 6) * 0.15]], 1.3, pc.optic, 0.05); fx.ribbon([[x, y], [x + p.facing * len, y]], 0.45, '#ffffff', 0.05); },
    pFwd(fx, p) { const [x, y] = eyeOf(p); for (const a of [-0.25, 0, 0.25]) fx.ribbon([[x, y], [x + p.facing * 3.6, y + a * 3.6]], 0.5, pc.optic, 0.06); },
    pUp(fx, p) { const [x, y] = eyeOf(p); fx.ribbon([[x, y], [x + p.facing * 0.4, y + 4.5]], 0.7, pc.optic, 0.06); },
  },
  wolverine: {
    pFwd(fx, p) { fx.sparks(p.x + p.facing * 0.8, p.y + 1, pc.claws, 3, 9, 0.2); },
    super(fx, p) { fx.sparks(p.x + p.facing * 0.9, p.y + 1.1, pc.rage, 4, 11, 0.2); },
    ult(fx, p) { fx.sparks(p.x, p.y + 1, pc.rage, 6, 14, 0.25); },
  },
  jean: {
    // Psychic Crush: the Sentinels pressed into a ball of telekinetic force ahead of her
    super(fx, p, m, k) { fx.flash(p.x + p.facing * 3, p.y + 1.6, pc.tk, 2.5 + k * 2, 0.06, 'ring'); fx.sparks(p.x + p.facing * 3, p.y + 1.6, pc.tk, 3, 6, 0.2); },
    // Phoenix Rising: a firestorm round her
    ult(fx, p) { for (let i = 0; i < 3; i++) { const a = Math.random() * 6.28, r = 2 + Math.random() * 8; fx.sparks(p.x + Math.cos(a) * r, p.y + 0.5 + Math.abs(Math.sin(a)) * 3, i ? '#ff8a1f' : '#ffd23f', 2, 7, 0.4); } },
  },
};

export const CUES = {
  optic(fx, ev) {
    // The beam: a wide red ribbon, a hot white core, flares where it banks and where it ends
    const col = ev.rapport ? pc.tk : pc.optic, w = (ev.width || 0.3) * 1.6 + 0.12;
    fx.ribbon(ev.pts, w * 2.2, col, 0.2); fx.ribbon(ev.pts, w, col, 0.16); fx.ribbon(ev.pts, w * 0.35, '#ffffff', 0.12, 0.4);
    for (let i = 1; i < ev.pts.length; i++) fx.flash(ev.pts[i][0], ev.pts[i][1], col, 1.2 + (ev.a || 0) * 1.5, 0.14, i < ev.pts.length - 1 ? 'star' : 'glow');
    fx.flash(ev.x, ev.y, '#ffffff', 0.9 + (ev.a || 0), 0.1);
  },
  overheat(fx, ev) { fx.smoke(ev.x, ev.y, 5, '#9a8f98', 0.8); },
  vault(fx, ev) { fx.ring(ev.x, ev.y + 0.05, pc.optic, 0.3, 2.4, 0.25, true); },
  swing(fx, ev) {
    if (ev.hero === 'wolverine') {
      const p = fx.spawn({ x: ev.x + ev.facing * 0.9, y: ev.y + 1.1, color: pc.claws, tex: 'slash', s0: 1.7, s1: 1.9, life: 0.13, rot: ev.facing > 0 ? -0.4 : Math.PI + 0.4 }); if (p) p.s.material.opacity = 0.9;
    } else if (ev.hero === 'jean') fx.spawn({ x: ev.x + ev.facing * 1.0, y: ev.y + 1.2, color: pc.tk, tex: 'ring', s0: 0.4, s1: 1.6, life: 0.16 });
  },
  drill(fx, ev) { fx.flash(ev.x, ev.y, pc.rage, 1.6 + ev.tier * 0.5, 0.15, 'star'); },
  drillLevel(fx, ev) { fx.ring(ev.x, ev.y, pc.rage, 0.3, 1.4 + ev.level * 0.3, 0.2); },
  berserk(fx, ev) { fx.ring(ev.x, ev.y, pc.rage, 0.5, 4, 0.35); fx.sparks(ev.x, ev.y, pc.rage, 18, 12); },
  pounce(fx, ev) { fx.smoke(ev.x, ev.y + 0.8, 3, '#d8d0e0', 0.6); },
  land(fx, ev) { if (ev.vy < -14) fx.smoke(ev.x, ev.y, 4, '#d8d0e0', 0.7); },
  evade(fx, ev) {
    const col = HERO_LOOKS[ev.hero] ? HERO_LOOKS[ev.hero].energy : '#fff';
    fx.spawn({ x: ev.x, y: ev.y + 0.9, color: col, s0: 1.4, s1: 0.2, life: 0.18 });
  },
  perfect(fx, ev) { fx.ring(ev.x, ev.y, '#ffffff', 0.4, 3.6, 0.28); fx.flash(ev.x, ev.y, '#ffffff', 3, 0.16, 'star'); },
  tkGrab(fx, ev) { fx.ring(ev.x, ev.y, pc.tk, 0.2, 1.6, 0.22); },
  tkThrow(fx, ev) { fx.flash(ev.x, ev.y, pc.tk, 1.6, 0.14, 'star'); },
  shield(fx, ev) { fx.ring(ev.x, ev.y, pc.tk, 0.5, ev.r * 1.1, 0.3); },
  shieldBlock(fx, ev) { fx.flash(ev.x, ev.y, pc.tk, 1.1, 0.12, 'star'); },
  teamup(fx, ev) {
    fx.ring(ev.x, ev.y + 1, pc.team, 0.4, 4.5, 0.4); fx.flash(ev.x, ev.y + 1, pc.team, 4, 0.22, 'star');
    if (ev.kind === 'edge' && ev.from) fx.ribbon([[ev.from.x, ev.from.y], [ev.x, ev.y]], 0.35, pc.optic, 0.25);
  },
  fastballThrow(fx, ev) { fx.flash(ev.x, ev.y + 0.8, pc.team, 2.4, 0.15, 'star'); },
  fastballSlam(fx, ev) { fx.ring(ev.x, ev.y + 0.1, pc.team, 0.5, 5, 0.35, true); fx.sparks(ev.x, ev.y + 0.6, pc.claws, 20, 14); fx.smoke(ev.x, ev.y, 8, '#cfc8d8', 1.4); },
  called(fx, ev) { fx.flash(ev.x, ev.y, '#ffd23f', 1.4, 0.2, 'reticle'); },
  tag(fx, ev) { fx.ring(ev.x, ev.y + 1, HERO_LOOKS[ev.to] ? HERO_LOOKS[ev.to].energy : '#fff', 0.3, 2.6, 0.25); fx.sparks(ev.x, ev.y + 1, '#ffffff', 10, 8); },
  assist(fx, ev) { fx.flash(ev.x, ev.y + 1, HERO_LOOKS[ev.hero] ? HERO_LOOKS[ev.hero].energy : '#fff', 2.2, 0.2, 'star'); },
  ultCast(fx, ev) { fx.ring(ev.x, ev.y + 1, pc.team, 0.5, 9, 0.6); },
  ultStrike(fx, ev) { fx.ring(ev.x, ev.y, pc.team, 1, 30, 0.6); fx.flash(ev.x, ev.y, '#ffffff', 30, 0.3); },
  hit(fx, ev) {
    const col = ev.resisted ? '#9aa4b4' : pc[ev.power] || '#ffffff';
    // Light hits: a few sparks. Heavy hits: about 40 sparks and metal, a flash of the power's colour, a ripple
    fx.sparks(ev.x, ev.y, col, ev.heavy ? 40 : 12, ev.heavy ? 13 : 8, ev.heavy ? 0.4 : 0.25);
    fx.flash(ev.x, ev.y, col, ev.heavy ? 1.8 : 1.1, 0.09, ev.resisted ? 'ring' : 'star');
    if (ev.heavy && !ev.resisted) { fx.light(ev.x, ev.y, col, 5, 7, 0.18); fx.chunks(ev.x, ev.y, 'grey', 3, 8); fx.ripple(ev.x, ev.y, 0.6, 0.3, 0.2); }
  },
  // Hit reactions (sim/reactions.js)
  react(fx, ev) {
    switch (ev.react) {
      case 'launch': fx.ring(ev.x, ev.y - 0.6, '#ffffff', 0.3, 2, 0.2, true); break;
      case 'crumple': fx.flash(ev.x, ev.y, '#ffffff', 2.2, 0.16, 'star'); break;
      case 'stun': fx.ring(ev.x, ev.y + 1.2, '#ffd23f', 0.3, 1.4, 0.4); fx.sparks(ev.x, ev.y + 1.2, '#ffd23f', 8, 4, 0.5); break;
      case 'flipOut': fx.ring(ev.x, ev.y, '#ffffff', 0.4, 2.2, 0.22); break;
      case 'otg': fx.sparks(ev.x, ev.y, '#ffffff', 8, 7); break;
      case 'down': fx.smoke(ev.x, ev.y - 0.3, 4, '#cfc8d8', 0.9); break;
      case 'spinOut': fx.ring(ev.x, ev.y, '#ffffff', 0.3, 1.8, 0.2); break;
    }
  },
  // Supers and ultimates, their areas and volleys, throws (phase 1's moves)
  super(fx, ev) {
    const col = HERO_LOOKS[ev.hero] ? HERO_LOOKS[ev.hero].energy : '#fff';
    fx.ring(ev.x, ev.y, col, 0.5, ev.ult ? 8 : 5, 0.45); fx.flash(ev.x, ev.y, '#ffffff', ev.ult ? 6 : 4, 0.2, 'star'); fx.sparks(ev.x, ev.y, col, ev.ult ? 200 : 120, 16, 0.6);
    fx.light(ev.x, ev.y, col, ev.ult ? 14 : 9, ev.ult ? 26 : 16, 0.6); fx.ripple(ev.x, ev.y, ev.ult ? 1.4 : 1, 0.55, ev.ult ? 0.6 : 0.4);
  },
  area(fx, ev) {
    const col = HERO_LOOKS[ev.hero] ? HERO_LOOKS[ev.hero].energy : '#fff1b8';
    fx.ring(ev.x, ev.y, col, 1, ev.r, 0.5); fx.ring(ev.x, ev.y, '#ffffff', 0.5, ev.r * 0.6, 0.35, true);
    fx.light(ev.x, ev.y, col, 10, ev.r * 1.2, 0.5); fx.ripple(ev.x, ev.y, 1.2, 0.6, 0.7);
  },
  shots(fx, ev) { fx.flash(ev.x + ev.facing * 0.7, ev.y, pc.tk, 1.6, 0.14, 'star'); },
  throw(fx, ev) { fx.flash(ev.x, ev.y, '#ffffff', 2.2, 0.14, 'star'); fx.sparks(ev.x, ev.y, '#ffffff', 10, 9); },
  wallBounce(fx, ev) { fx.ring(ev.x - ev.dir * 0.5, ev.y, '#ffffff', 0.5, 3, 0.25); fx.sparks(ev.x, ev.y, '#ffd27a', 24, 10); fx.chunks(ev.x, ev.y, 'steel', 4, 7); fx.light(ev.x, ev.y, '#ffd27a', 4, 6, 0.2); fx.ripple(ev.x, ev.y, 0.7, 0.35, 0.25); },
  groundBounce(fx, ev) { fx.ring(ev.x, ev.y + 0.05, '#ffffff', 0.5, 3.4, 0.28, true); fx.smoke(ev.x, ev.y, 6, '#cfc8d8', 1.2); fx.chunks(ev.x, ev.y, 'grey', 4, 8); fx.decal(ev.x, ev.y, 2.2); fx.ripple(ev.x, ev.y, 0.7, 0.35, 0.25); },
  armourBreak(fx, ev) { fx.chunks(ev.x, ev.y, 'grey', 6, 9); fx.flash(ev.x, ev.y, '#ffffff', 2.5, 0.15, 'star'); },
  kill(fx, ev) {
    const big = ev.unit === 'mk2' || ev.unit === 'collector';
    fx.flash(ev.x, ev.y, HOSTILE, big ? 8 : 4, 0.25); fx.flash(ev.x, ev.y, '#ffe9a8', big ? 5 : 2.5, 0.35);
    fx.chunks(ev.x, ev.y, 'sentinel', big ? 18 : 9, big ? 14 : 10); fx.chunks(ev.x, ev.y, 'grey', big ? 10 : 4, 10);
    fx.smoke(ev.x, ev.y, big ? 16 : 7, '#3a3348', big ? 2.4 : 1.4); fx.ring(ev.x, ev.y, '#ffb547', 0.5, big ? 9 : 4, 0.35);
    fx.light(ev.x, ev.y, '#ffb547', big ? 10 : 6, big ? 16 : 9, 0.35); fx.decal(ev.x, ev.y, big ? 4 : 2.6, 12);
  },
  telegraph(fx, ev) {
    const col = TELL[ev.cat] || TELL.standard;
    fx.flash(ev.x, ev.y, col, ev.cat === 'standard' ? 1.3 : 2, 0.22, 'star');
    if (ev.cat !== 'standard') fx.ring(ev.x, ev.y, col, 0.2, ev.cat === 'heavy' ? 2 : 2.6, 0.3);
  },
  enemyShot(fx, ev) { fx.flash(ev.x, ev.y, HOSTILE, 0.9, 0.08); },
  projWall(fx, ev) { fx.sparks(ev.x, ev.y, ev.team === 'e' ? HOSTILE : POWER_COLORS.tk, 5, 6, 0.2); },
  slam(fx, ev) {
    fx.decal(ev.x, ev.y, ev.big ? 5 : 3); fx.ring(ev.x, ev.y + 0.05, ev.big ? TELL.unblockable : HOSTILE, 0.5, ev.big ? 7 : 3.4, 0.3, true); fx.smoke(ev.x, ev.y, ev.big ? 10 : 5, '#cfc8d8', ev.big ? 1.8 : 1.1); },
  bossLand(fx, ev) { fx.ring(ev.x, ev.y + 0.05, '#ffffff', 1, 10, 0.5, true); fx.smoke(ev.x, ev.y, 16, '#cfc8d8', 2.4); },
  bossPhase(fx, ev) { fx.ring(ev.x, ev.y, HOSTILE, 1, 12, 0.6); fx.chunks(ev.x, ev.y - 1, 'grey', 10, 12); },
  marked(fx, ev) { fx.flash(ev.x, ev.y + 0.4, HOSTILE, 1.6, 0.25, 'reticle'); },
  kidGrabbed(fx, ev) { fx.ring(ev.x, ev.y + 0.6, HOSTILE, 0.3, 2.4, 0.3); },
  kidFreed(fx, ev) { fx.ring(ev.x, ev.y + 0.6, '#ffffff', 0.3, 2.4, 0.3); },
  crateBreak(fx, ev) { fx.chunks(ev.x, ev.y, 'wood', 7, 8); fx.smoke(ev.x, ev.y, 3, '#c9b28f', 0.8); },
  doorHit(fx, ev) { fx.sparks(ev.x, ev.y, '#ffd27a', 8, 9); },
  doorBroken(fx, ev) { fx.chunks(ev.x, ev.y, 'steel', 12, 12); fx.flash(ev.x, ev.y, '#ffffff', 4, 0.2, 'star'); fx.smoke(ev.x, ev.y - 1, 8, '#9a94a8', 1.5); },
  gateOpen(fx, ev) { fx.sparks(ev.x, 3, '#3dff8a', 20, 8, 0.5); },
  enemyDrop(fx, ev) { fx.flash(ev.x, ev.y + 7, HOSTILE, 2.4, 0.3); },
  adapting(fx, ev, S) {
    // A scan sweeps every Sentinel: the machines studying the team
    if (S) for (const e of S.enemies) if (!e.dead) fx.ring(e.x, e.y + e.h / 2, ev.type === 'adapting' ? HOSTILE : '#ffffff', 0.4, e.h * 1.3, 0.45);
  },
  revived(fx, ev) { fx.ring(ev.x, ev.y + 0.1, '#7dff6a', 0.4, 2.6, 0.35, true); },
  downed(fx, ev) { fx.flash(ev.x, ev.y + 0.5, '#ff4b4b', 2, 0.2); },
  kidBoarded(fx, ev) { fx.ring(ev.x, ev.y + 0.6, '#7fd3ff', 0.4, 3, 0.4); },
};
// Events that share a cue
CUES.walljump = CUES.pounce;
CUES.adapted = CUES.adapting;
// Events with no cue of their own, which the state-driven effects or the overlay cover: anchored, apertureOpen,
// edgeWave, markAim, stagger, tkMiss
