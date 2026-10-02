// What the strike clips share: k(t, pose, snap) makes a keyframe (t in move ticks; snap eases out hard, for the
// strike itself), END(m) is the move's last tick, and AIR is the airborne leg pose that air clips merge over.
export const k = (t, pose, snap = false) => ({ t, pose, snap });
export const END = m => m.su + m.ac + m.rc;
export const AIR = { hipN: 0.9, knN: -1.35, hipF: 0.45, knF: -1.05, hipY: 0.95 };
