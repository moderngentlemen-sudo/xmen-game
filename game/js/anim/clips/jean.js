// Jean Grey's strike clips, keyed by move id: open-palm telekinetic pushes with the far hand at her temple. Two palms
// and a push (the heavy reuses the push), a palm in the air, the lift. The clip format is in clips/index.js.
import { k, END, AIR } from './keys.js';
import * as S from './shared.js';

const PALM = { shN: 1.6, elN: 0.0, shF: 1.6, elF: 0.0 };   // the arms for the shared clips (clips/shared.js)

const palm1 = m => [k(0, { twist: -0.3, shN: 0.6, elN: 1.6, shF: 2.6, elF: 2.3 }), k(m.su, { spine: 0.22, twist: 0.35, shN: 1.62, elN: 0.04, shF: 2.6, elF: 2.3, hipN: 0.55, knN: -0.6, hipF: -0.45, hipY: 0.88 }, true),
  k(m.su + m.ac + 3, { spine: 0.18, twist: 0.25, shN: 1.55, elN: 0.1, shF: 2.5, elF: 2.2, hipN: 0.5, knN: -0.55, hipF: -0.4 }), k(END(m), {})];
const palm2 = m => [k(0, { twist: 0.35, shF: 0.4, elF: 1.6, shN: 2.5, elN: 2.2 }), k(m.su, { spine: 0.25, twist: -0.35, shF: 1.62, elF: 0.05, shN: 2.5, elN: 2.2, hipN: 0.6, knN: -0.6, hipF: -0.5, hipY: 0.87 }, true),
  k(m.su + m.ac + 3, { spine: 0.2, twist: -0.25, shF: 1.5, elF: 0.12 }), k(END(m), {})];
const push = m => [k(0, { spine: -0.1, shN: 0.4, elN: 1.9, shF: 0.3, elF: 1.9, hipY: 0.9 }),
  k(m.su, { spine: 0.35, shN: 1.62, elN: 0.02, shF: 1.5, elF: 0.06, hipN: 0.8, knN: -0.7, hipF: -0.65, knF: -0.2, hipY: 0.84, head: -0.15 }, true),
  k(m.su + m.ac + 4, { spine: 0.3, shN: 1.55, elN: 0.08, shF: 1.45, elF: 0.1, hipN: 0.75, knN: -0.7, hipF: -0.6, hipY: 0.85 }), k(END(m), {})];
const palmAir = m => [k(0, { ...AIR, spine: -0.15, shN: 2.2, elN: 0.8, shF: 2.6, elF: 2.3 }), k(m.su, { ...AIR, spine: 0.4, shN: 1.1, elN: 0.05, shF: 2.5, elF: 2.2, bodyZ: -0.15 }, true), k(END(m), { ...AIR })];
const lift = m => [k(0, { hipY: 0.82, spine: 0.3, shN: -0.3, elN: 0.6, shF: -0.4, elF: 0.6, hipN: 0.7, knN: -1.1, hipF: -0.1, knF: -0.9 }),
  k(m.su, { hipY: 0.95, spine: -0.15, shN: 2.9, elN: 0.05, shF: 2.8, elF: 0.1, hipN: 0.3, knN: -0.5, hipF: -0.2, knF: -0.7, head: 0.35 }, true), k(END(m), { ...AIR })];

export default {
  g1: { keys: palm1 },
  g2: { keys: palm2 },
  g3: { keys: push },
  air1: { keys: palmAir, base: 'air' },
  up: { keys: lift },
  heavy: { keys: push, tremble: true },
  counter: { keys: push },   // the heavy's strike, at once: no wind-up tremble
  // Phase 1's new slots, on the shared clips until step 1.8
  g4: { keys: S.burst(PALM) },
  g4alt: { keys: S.burst({ shN: 2.9, elN: 0.1, shF: 2.8, elF: 0.1 }) },
  fwd: { keys: S.lunge(PALM) },
  down: { keys: S.sweep({ shN: 0.6, elN: 0.2, shF: 0.4, elF: 0.2 }) },
  dash: { keys: S.lunge(PALM) },
  air2: { keys: S.air2(PALM), base: 'air' },
  airDown: { keys: S.dive({ shN: 0.3, elN: 0.1, shF: 0.3, elF: 0.1 }), base: 'air' },
  throwF: { keys: S.grab(PALM) },
  throwB: { keys: S.grab(PALM, { twist: 1.2, spine: -0.5 }) },
  throwU: { keys: S.grab(PALM, { spine: -0.6, shN: 3.0, shF: 2.9 }) },
  throwAir: { keys: S.grab({ ...AIR }), base: 'air' },
  exec: { keys: S.burst({ shN: 2.9, elN: 0.1, shF: 2.8, elF: 0.1 }), tremble: true },
  counterP: { keys: S.burst(PALM) },
  pFwd: { keys: S.burst(PALM) },
  pUp: { keys: S.upward() },
  super: { keys: S.brace({ shN: 2.8, elN: 0.3, shF: 2.7, elF: 0.3 }), tremble: true },
  ult: { keys: S.upward(), tremble: true },
};
