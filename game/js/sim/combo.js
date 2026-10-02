// Combo rules and the personal meter (phase 1). Each hero keeps a running combo, `p.streak` (V2's `p.combo` is the
// chain's index, so the name differs): the hits landed without a break, how often each move was used in it, its
// damage, and its style. hitEnemy (combat.js) asks streakHit for the damage scale of every hit a hero lands; the
// combo ends after STREAK.gap ticks without a hit, or when the hero is hurt.
//   Scaling   hits 1 to SCALING.full deal full damage, each later hit SCALING.step less, down to SCALING.floor; a move
//             already used in the combo costs SCALING.repeat more per earlier use (floor still applies). One move
//             instance is one hit of the combo, however many Sentinels it catches.
//   Style     points for every hit, more for a move not yet used in the combo and for hits that keep a Sentinel in
//             the air; the rank (STYLE_RANKS, D to X) is read off STYLE.ranks. Style fills the meter faster.
//   Meter     p.meter, 0 to METER.max (three bars of METER.bar): it gains METER.dealt per point of damage dealt,
//             times (1 + STYLE.meterBonus × the rank's index), and METER.taken per point taken. Supers and ultimates
//             (step 1.6) spend it.
import { SCALING, STREAK, STYLE, METER } from './config.js';
import { emit } from './world.js';

export const STYLE_RANKS = ['D', 'C', 'B', 'A', 'S', 'X'];

// The damage scale of the combo's hit number n (1-based), for a move already used `repeats` times in it
export function comboScale(n, repeats) {
  const base = n <= SCALING.full ? 1 : 1 - SCALING.step * (n - SCALING.full);
  return Math.max(SCALING.floor, base - SCALING.repeat * repeats);
}
export const rankOf = style => { let r = 0; for (let i = 0; i < STYLE.ranks.length; i++) if (style >= STYLE.ranks[i]) r = i; return r; };
export const newStreak = () => ({ n: 0, t: 0, inst: 0, used: {}, dmg: 0, style: 0, rank: 0, scale: 1 });

// A hero's hit is about to land on e: count it into the combo and return its damage scale
export function streakHit(S, p, e, h) {
  const K = p.streak;
  if (h.inst !== K.inst) {
    // A new move instance: the next hit of the combo
    const id = h.move || h.kind || h.power || 'hit', repeats = K.used[id] || 0;
    K.n++; K.inst = h.inst; K.used[id] = repeats + 1;
    K.scale = comboScale(K.n, repeats);
    K.style += STYLE.hit + (repeats ? 0 : STYLE.fresh) + (!e.onGround ? STYLE.air : 0);
    const rank = rankOf(K.style);
    if (rank > K.rank) { K.rank = rank; emit(S, 'styleRank', { id: p.id, rank: STYLE_RANKS[rank], n: K.n, x: p.x, y: p.y + p.h + 0.6 }); }
  }
  K.t = 0;
  return K.scale;
}
// Damage dealt by p (after every multiplier): the combo's total, and the meter
export function streakDealt(p, dmg) {
  p.streak.dmg += dmg;
  gainMeter(p, dmg * METER.dealt * (1 + STYLE.meterBonus * p.streak.rank));
}
export function gainMeter(p, v) { p.meter = Math.min(METER.max, p.meter + v); }

// Every tick (not in hitstop): a combo with no hit for STREAK.gap ticks is over
export function tickStreak(S, p) {
  const K = p.streak;
  if (K.n && ++K.t > STREAK.gap) endStreak(S, p);
}
export function endStreak(S, p) {
  const K = p.streak;
  if (K.n >= 2) {
    emit(S, 'comboEnd', { id: p.id, n: K.n, rank: STYLE_RANKS[K.rank], dmg: K.dmg });
    const T = S.mission && S.mission.stats;
    if (T) { T.bestCombo = Math.max(T.bestCombo || 0, K.n); T.bestRank = Math.max(T.bestRank || 0, K.rank); }
  }
  p.streak = newStreak();
}
