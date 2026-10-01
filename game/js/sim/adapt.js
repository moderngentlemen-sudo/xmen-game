// Sentinels that adapt. Every hit a hero lands is logged by power type (optic, claws, tk). Once enough has
// landed in an encounter and one type dominates, the Sentinels warn (an on-screen call and a scanning sweep
// over every unit), then field counter-tech against it: prism plating against optic blasts, adamantium weave
// against claws, magnetic anchors against telekinesis (which also stops Jean gripping them). Only one counter
// at a time, so two good answers always remain; team-ups and team hits are never countered; the log keeps
// running, so leaning on the next power brings the counter round to that one; it all fades when the
// encounter ends (resetAdapt, called by the mission).
import { ADAPT, POWER_TYPES } from './config.js';
import { emit } from './world.js';

export function updateAdapt(S) {
  const A = S.adapt;
  if (A.warn) {
    if (--A.warnT <= 0) {
      A.active = A.warn; A.warn = null;
      emit(S, 'adapted', { power: A.active, name: ADAPT.counters[A.active].name });
    }
    return;
  }
  if (++A.checkT < ADAPT.check) return;
  A.checkT = 0;
  const total = POWER_TYPES.reduce((s, t) => s + A.log[t], 0);
  if (total < ADAPT.min) return;
  let top = null;
  for (const t of POWER_TYPES) if (A.log[t] / total >= ADAPT.share && (!top || A.log[t] > A.log[top])) top = t;
  if (!top || top === A.active) return;
  A.warn = top; A.warnT = ADAPT.warn;
  for (const t of POWER_TYPES) A.log[t] = 0;
  emit(S, 'adapting', { power: top, name: ADAPT.counters[top].name, warn: ADAPT.warn });
}

export function resetAdapt(S) {
  const A = S.adapt;
  const had = A.active || A.warn;
  A.log = { optic: 0, claws: 0, tk: 0 }; A.warn = null; A.warnT = 0; A.active = null; A.checkT = 0;
  if (had) emit(S, 'adaptReset', {});
}
