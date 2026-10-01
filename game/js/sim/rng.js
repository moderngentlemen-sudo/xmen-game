// The simulation's only source of randomness: mulberry32 over a 32-bit state kept inside the world, so a
// snapshot carries it and a replay repeats it. Presentation code may use Math.random freely; sim code never.

export function rand(S) {
  S.rng = (S.rng + 0x6D2B79F5) | 0;
  let t = S.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const randRange = (S, a, b) => a + (b - a) * rand(S);
export const randInt = (S, a, b) => a + Math.floor(rand(S) * (b - a + 1));   // inclusive
export const pick = (S, list) => list[Math.floor(rand(S) * list.length)];
export function seedState(seed) { return (seed >>> 0) || 1; }
