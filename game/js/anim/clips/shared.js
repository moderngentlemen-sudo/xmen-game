// Strike clips the heroes share for phase 1's new slots, until step 1.8 gives every move its own keys (6 to 10, with
// anticipation, smear, overshoot and settle). Each is a keys(m) function in the format of clips/index.js; `arms`
// merges a hero's own arm pose over the strike (claws, palms, fists).
import { k, END, AIR } from './keys.js';

const w = (pose, arms) => ({ ...pose, ...(arms || {}) });
// A high kick swung round (with spin [1, 'y'] in the clip): the roundhouse
export const roundhouse = arms => m => [k(0, w({ twist: -0.6, spine: 0.1, hipN: 0.6, knN: -1.4 }, arms)),
  k(m.su, w({ twist: 0.3, spine: -0.35, hipN: 1.95, knN: -0.2, hipF: -0.3, hipY: 0.9, shN: 0.6, shF: 0.9 }, arms), true),
  k(m.su + m.ac, w({ twist: 0.4, spine: -0.3, hipN: 1.8, knN: -0.3, hipF: -0.3, hipY: 0.9 }, arms)), k(END(m), {})];
// Low along the floor, the lead leg out: the slide
export const slide = arms => m => [k(0, w({ hipY: 0.75, spine: 0.3, hipN: 0.8, knN: -1.2 }, arms)),
  k(m.su, w({ hipY: 0.42, spine: -0.55, hipN: 1.45, knN: -0.05, hipF: 0.4, knF: -1.6, shN: -0.6, shF: -0.9, bodyZ: 0.35 }, arms), true),
  k(m.su + m.ac, w({ hipY: 0.45, spine: -0.5, hipN: 1.4, knN: -0.1, hipF: 0.4, knF: -1.5, bodyZ: 0.3 }, arms)), k(END(m), {})];
// Crouched, a leg swept round low (with spin [0.5, 'y'] in the clip): the sweep
export const sweep = arms => m => [k(0, w({ hipY: 0.7, spine: 0.4, hipN: 0.9, knN: -1.6, hipF: 0.2, knF: -1.6 }, arms)),
  k(m.su, w({ hipY: 0.5, spine: 0.55, hipN: 1.5, knN: -0.1, hipF: 0.9, knF: -2.1 }, arms), true),
  k(m.su + m.ac, w({ hipY: 0.5, spine: 0.5, hipN: 1.4, knN: -0.2, hipF: 0.9, knF: -2.0 }, arms)), k(END(m), {})];
// A knee driven up on the run: the flying knee, the barge
export const knee = arms => m => [k(0, w({ spine: 0.35, hipN: -0.4, knN: -0.6, hipF: 0.3, shN: -0.8, shF: 0.9 }, arms)),
  k(m.su, w({ spine: -0.1, hipN: 1.75, knN: -2.1, hipF: -0.5, knF: -0.3, hipY: 0.98, shN: 1.1, shF: -0.9 }, arms), true),
  k(m.su + m.ac, w({ spine: 0, hipN: 1.5, knN: -2.0, hipF: -0.4, hipY: 0.96 }, arms)), k(END(m), {})];
// Lunging in, body long and low behind the strike: the thrust, the shove
export const lunge = arms => m => [k(0, w({ spine: -0.1, twist: -0.5, hipN: 0.3, knN: -0.9, hipY: 0.84 }, arms)),
  k(m.su, w({ spine: 0.55, twist: 0.35, hipN: 1.0, knN: -0.6, hipF: -0.95, knF: -0.1, hipY: 0.74 }, arms), true),
  k(m.su + m.ac + 2, w({ spine: 0.5, twist: 0.3, hipN: 0.95, knN: -0.6, hipF: -0.9, hipY: 0.76 }, arms)), k(END(m), {})];
// Wound up, then everything forward at once: the bursts and palms, the ender that crumples
export const burst = arms => m => [k(0, w({ spine: -0.2, twist: -0.3, hipY: 0.86 }, arms)),
  k(Math.max(0, m.su - 2), w({ spine: -0.35, twist: -0.55, hipN: 0.3, knN: -1.0, hipF: -0.4, hipY: 0.8 }, arms)),
  k(m.su, w({ spine: 0.45, twist: 0.25, hipN: 0.9, knN: -0.7, hipF: -0.8, hipY: 0.82 }, arms), true),
  k(m.su + m.ac + 3, w({ spine: 0.4, twist: 0.2, hipN: 0.85, knN: -0.7, hipF: -0.75, hipY: 0.82 }, arms)), k(END(m), {})];
// The second air strike: a turn the other way, the other leg or arm
export const air2 = arms => m => [k(0, w({ ...AIR, twist: 0.5, spine: -0.2 }, arms)),
  k(m.su, w({ ...AIR, twist: -0.4, spine: 0.3, hipF: 1.6, knF: -0.2, bodyZ: -0.15 }, arms), true), k(END(m), { ...AIR })];
// Down out of the air, everything below: the dive and the stomp
export const dive = arms => m => [k(0, w({ ...AIR, spine: -0.3, hipN: 1.6, knN: -1.6, hipF: 1.2, knF: -1.6 }, arms)),
  k(m.su, w({ spine: 0.35, hipN: 0.35, knN: -0.1, hipF: -0.1, knF: -0.3, hipY: 0.98, bodyZ: -0.1 }, arms), true),
  k(m.su + m.ac, w({ spine: 0.4, hipN: 0.6, knN: -1.0, hipF: -0.4, knF: -0.8, hipY: 0.82 }, arms)), k(END(m), {})];
// Arms out to take hold, then a heave the way the throw goes: the throws and the execution
export const grab = (arms, heave = {}) => m => [k(0, w({ spine: 0.35, shN: 1.4, elN: 0.5, shF: 1.3, elF: 0.6, hipN: 0.6, knN: -0.8, hipF: -0.5, hipY: 0.84 }, arms)),
  k(m.su, w({ spine: -0.25, twist: -0.4, shN: 2.4, elN: 0.6, shF: 2.3, elF: 0.6, hipN: 0.4, knN: -1.0, hipF: -0.6, hipY: 0.8, ...heave }, arms), true),
  k(m.su + m.ac + 4, w({ spine: 0.4, twist: 0.4, shN: 1.2, elN: 0.2, shF: 1.0, elF: 0.3, hipN: 0.9, knN: -0.7, hipF: -0.8, hipY: 0.82 }, arms)), k(END(m), {})];
// Both hands thrown up (with the head back): the anti-air blasts, the uplift, the rising drill
export const upward = arms => m => [k(0, w({ hipY: 0.76, spine: 0.35, shN: 0.3, elN: 1.4, shF: 0.2, elF: 1.4, hipN: 0.7, knN: -1.3, hipF: -0.3, knF: -1.1 }, arms)),
  k(m.su, w({ hipY: 0.97, spine: -0.3, shN: 3.0, elN: 0.05, shF: 2.9, elF: 0.1, head: 0.4, hipN: 0.2, knN: -0.3, hipF: -0.2, knF: -0.5 }, arms), true),
  k(m.su + m.ac, w({ hipY: 0.95, spine: -0.25, shN: 2.9, elN: 0.1, shF: 2.8, elF: 0.15, head: 0.3 }, arms)), k(END(m), {})];
// Braced wide and low, the power held out ahead: the beams, the flurries and the ultimates
export const brace = arms => m => [k(0, w({ spine: -0.2, hipY: 0.88, twist: -0.3 }, arms)),
  k(Math.max(0, m.su - 3), w({ spine: -0.4, twist: -0.6, hipN: 0.7, knN: -1.2, hipF: -0.7, knF: -0.3, hipY: 0.76, head: -0.2 }, arms)),
  k(m.su, w({ spine: 0.3, twist: 0.1, hipN: 0.9, knN: -0.9, hipF: -0.9, knF: -0.2, hipY: 0.76, shN: 1.6, elN: 0.0, shF: 1.5, elF: 0.1 }, arms), true),
  k(m.su + m.ac, w({ spine: 0.3, twist: 0.1, hipN: 0.9, knN: -0.9, hipF: -0.9, hipY: 0.76, shN: 1.6, shF: 1.5 }, arms)), k(END(m), {})];
