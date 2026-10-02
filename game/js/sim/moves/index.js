// The move tables, one per hero, and the views of them the rest of the game reads. A new hero adds a table here.
import cyclops from './cyclops.js';
import wolverine from './wolverine.js';
import jean from './jean.js';

export const MOVESETS = { cyclops, wolverine, jean };
// Each hero's moves by id (the client reads su, ac and rc for its animation clips), and each hero's chain
export const MOVES = Object.fromEntries(Object.entries(MOVESETS).map(([hero, set]) => [hero, set.moves]));
export const COMBO = Object.fromEntries(Object.entries(MOVESETS).map(([hero, set]) => [hero, set.chain]));
