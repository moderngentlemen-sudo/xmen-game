// Every hero's strike clips, keyed by move id (the ids of the move tables in sim/moves/). A clip is
//   keys(m)   the keyframes [{ t, pose, snap }] for the move's frame data m (t in move ticks); poses are partial
//             joint angles that merge over the fighting stance (anim.js)
//   base      optional, 'air': merge over the airborne stance instead
//   spin      optional, [turns, axis]: a whole-body spin through the active ticks ('y' turns, 'z' rolls)
//   tremble   optional, true: the body trembles while the move winds up
// anim.js plays the clip of the move a hero is in, at the move's clock.
import cyclops from './cyclops.js';
import wolverine from './wolverine.js';
import jean from './jean.js';

export const CLIPS = { cyclops, wolverine, jean };
