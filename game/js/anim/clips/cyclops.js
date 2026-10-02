// Cyclops's strike clips, keyed by move id: martial-arts strikes. A backhand, an elbow and a driving punch (the
// heavy reuses the punch), an axe kick in the air, the rising kick. The clip format is in clips/index.js.
import { k, END, AIR } from './keys.js';
import * as S from './shared.js';

const PALM = { shN: 1.65, elN: 0.0, shF: 0.4, elF: 1.4 };   // the arms for the shared clips (clips/shared.js)

const backhand = m => [k(0, { spine: 0.05, twist: -0.4, shN: -0.4, elN: 1.7, hipY: 0.9 }), k(m.su, { spine: 0.32, twist: 0.45, shN: 1.75, elN: 0.1, hipN: 0.65, knN: -0.7, hipF: -0.55, hipY: 0.86 }, true),
  k(m.su + m.ac + 3, { spine: 0.28, twist: 0.3, shN: 1.45, elN: 0.35, hipN: 0.6, knN: -0.65, hipF: -0.5 }), k(END(m), {})];
const elbow = m => [k(0, { twist: 0.4, shF: -0.35, elF: 2.2, shN: 0.9, elN: 1.4 }), k(m.su, { spine: 0.38, twist: -0.5, shF: 1.45, elF: 1.65, shN: -0.3, elN: 1.4, hipN: 0.7, knN: -0.75, hipF: -0.55, hipY: 0.86 }, true),
  k(m.su + m.ac + 3, { spine: 0.3, twist: -0.35, shF: 1.2, elF: 1.4, shN: 0.2, elN: 1.3 }), k(END(m), {})];
const punch = m => [k(0, { spine: 0.1 }), k(m.su - 1, { spine: -0.18, twist: -0.65, shN: -0.95, elN: 1.9, shF: 0.9, elF: 1.2, hipN: 0.2, knN: -0.95, hipF: -0.85, knF: -0.2, hipY: 0.8 }),
  k(m.su + 1, { spine: 0.48, twist: 0.6, shN: 1.62, elN: 0.0, shF: -0.7, elF: 1.1, hipN: 0.95, knN: -0.72, hipF: -0.8, knF: -0.12, hipY: 0.8 }, true),
  k(m.su + m.ac + 4, { spine: 0.4, twist: 0.45, shN: 1.5, elN: 0.15, shF: -0.5, hipN: 0.9, knN: -0.7, hipF: -0.75, hipY: 0.82 }), k(END(m), {})];
const axe = m => [k(0, { ...AIR, spine: -0.1, hipN: 2.1, knN: -0.35, shN: 0.9, shF: 1.3 }), k(m.su, { ...AIR, spine: -0.25, hipN: 2.4, knN: -0.15, shN: 1.2, shF: 1.6 }),
  k(m.su + 2, { ...AIR, spine: 0.45, hipN: 0.05, knN: -0.1, shN: 0.4, shF: 0.6, bodyZ: -0.2 }, true), k(END(m), { ...AIR })];
const rise = m => [k(0, { hipY: 0.72, spine: 0.42, twist: -0.45, hipN: 1.25, knN: -1.9, hipF: 0.2, knF: -1.8, shN: -0.45, elN: 1.95, shF: 0.7, elF: 1.6 }),
  k(m.su, { hipY: 0.95, spine: -0.2, twist: 0.4, shN: 3.05, elN: 0.04, shF: -0.45, elF: 1.25, hipN: 0.35, knN: -0.45, hipF: -0.25, knF: -1.15, head: 0.35 }, true),
  k(m.su + m.ac, { hipY: 0.95, spine: -0.12, twist: 0.3, shN: 2.95, elN: 0.1, shF: -0.25, elF: 1.3, hipN: 0.6, knN: -1.0, hipF: 0.1, knF: -1.1, head: 0.25 }), k(END(m), { ...AIR })];

export default {
  g1: { keys: backhand },
  g2: { keys: elbow },
  g3: { keys: punch },
  air1: { keys: axe, base: 'air' },
  up: { keys: rise },
  heavy: { keys: punch, tremble: true },
  counter: { keys: punch },   // the heavy's strike, at once: no wind-up tremble
  // Phase 1's new slots, on the shared clips until step 1.8
  g4: { keys: S.roundhouse(), spin: [1, 'y'] },
  g4alt: { keys: S.burst(PALM) },
  fwd: { keys: S.slide() },
  down: { keys: S.sweep(), spin: [0.5, 'y'] },
  dash: { keys: S.knee() },
  air2: { keys: S.air2(), base: 'air' },
  airDown: { keys: S.dive(), base: 'air' },
};
