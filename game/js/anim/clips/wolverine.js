// Wolverine's strike clips, keyed by move id: the claw chain, a spinning finisher, the claws in the air, the rising
// slash, a two-claw overhead heavy. The clip format is in clips/index.js.
import { k, END, AIR } from './keys.js';

const slash1 = m => [k(0, { spine: -0.05, twist: -0.35, shN: 2.6, elN: 1.0, hipN: 0.35, hipF: -0.25 }),
  k(m.su, { spine: 0.42, twist: 0.5, shN: 0.55, elN: 0.08, shF: -0.4, hipN: 0.78, knN: -0.72, hipF: -0.58, knF: -0.3, hipY: 0.84 }, true),
  k(m.su + m.ac + 2, { spine: 0.36, twist: 0.4, shN: 0.2, elN: 0.3, hipN: 0.72, knN: -0.7, hipF: -0.55, hipY: 0.85 }), k(END(m), {})];
const slash2 = m => [k(0, { twist: 0.45, shF: -0.55, elF: 0.6, shN: 0.9, elN: 1.2 }),
  k(m.su, { spine: 0.3, twist: -0.45, shF: 2.45, elF: 0.12, shN: -0.45, elN: 0.8, hipN: 0.72, knN: -0.7, hipF: -0.55, hipY: 0.85 }, true),
  k(m.su + m.ac + 2, { spine: 0.24, twist: -0.3, shF: 2.6, elF: 0.3, shN: -0.3 }), k(END(m), {})];
const slash3 = m => [k(0, { spine: -0.12, shN: 2.85, shF: 2.6, elN: 1.3, elF: 1.3, hipY: 0.92 }),
  k(m.su, { spine: 0.48, shN: 0.85, shF: 0.7, elN: 0.05, elF: 0.1, hipN: 0.82, knN: -0.85, hipF: -0.62, knF: -0.25, hipY: 0.82 }, true),
  k(m.su + m.ac + 2, { spine: 0.4, shN: 0.4, shF: 0.3, elN: 0.2, elF: 0.3, hipN: 0.8, knN: -0.82, hipF: -0.6, hipY: 0.83 }), k(END(m), {})];
const spin = m => [k(0, { twist: -0.9, shN: 1.2, shF: 1.1, elN: 0.3, elF: 0.4, spine: 0.1, hipY: 0.86 }),
  k(m.su, { twist: 0.2, shN: 1.62, shF: 1.58, elN: 0.05, elF: 0.05, spine: 0.3, hipN: 0.65, knN: -0.65, hipF: -0.62, hipY: 0.83 }, true),
  k(m.su + m.ac, { twist: 0.4, shN: 1.5, shF: 1.5, elN: 0.1, elF: 0.1, spine: 0.3, hipN: 0.65, knN: -0.65, hipF: -0.62, hipY: 0.83 }), k(END(m), {})];
const clawRise = m => [k(0, { hipY: 0.72, spine: 0.42, hipN: 1.2, knN: -1.85, hipF: 0.3, knF: -1.9, shN: -0.5, shF: -0.7 }),
  k(m.su, { hipY: 0.95, spine: -0.1, shN: 2.9, shF: 2.7, elN: 0.1, elF: 0.2, hipN: 0.3, knN: -0.6, hipF: -0.3, knF: -0.95 }, true),
  k(m.su + m.ac, { hipY: 0.95, spine: -0.05, shN: 2.8, shF: 2.6, elN: 0.2, elF: 0.3, hipN: 0.6, knN: -1.1, hipF: 0.2, knF: -1.0 }), k(END(m), { ...AIR })];
const clawAir = m => [k(0, { ...AIR, spine: -0.25, shN: 2.7, shF: 2.5, elN: 0.4, elF: 0.5 }),
  k(m.su, { ...AIR, spine: 0.65, shN: 0.5, shF: 0.4, elN: 0.1, elF: 0.15, bodyZ: -0.3 }, true), k(END(m), { ...AIR })];
const clawHeavy = m => [k(0, { spine: 0.1 }), k(m.su - 1, { spine: -0.32, twist: -0.5, shN: 3.0, shF: 2.9, elN: 0.2, elF: 0.3, hipN: 0.6, knN: -0.8, hipF: -0.7, knF: -0.2, hipY: 0.84 }),
  k(m.su + 1, { spine: 0.62, twist: 0.45, shN: 0.7, shF: 0.6, elN: 0.1, elF: 0.2, hipN: 0.95, knN: -0.95, hipF: -0.75, knF: -0.15, hipY: 0.79 }, true),
  k(m.su + m.ac + 5, { spine: 0.5, twist: 0.3, shN: 0.5, shF: 0.4, hipN: 0.9, knN: -0.9, hipF: -0.72, hipY: 0.8 }), k(END(m), {})];

export default {
  g1: { keys: slash1 },
  g2: { keys: slash2 },
  g3: { keys: slash3 },
  g4: { keys: spin, spin: [1, 'y'] },
  air: { keys: clawAir, base: 'air' },
  up: { keys: clawRise },
  heavy: { keys: clawHeavy, tremble: true },
};
