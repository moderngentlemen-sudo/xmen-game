// X-Men: Sentinel Strike, team edition — tuning data for the simulation. An unofficial fan prototype.
// Units: metres and seconds; frame data in simulation ticks (60 per second). Nothing in sim/ touches the DOM,
// three.js or the clock, and every random number comes from the world's own seeded generator, so a run is a
// pure function of its seed and its inputs (the base for replays and rollback netcode).

export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

// Movement feel, kept from Nova Striker Version 9
export const GRAVITY = 49;
export const FALL_MULT = 1.35;     // heavier on the way down
export const RISE_CUT = 2.4;       // letting go of jump while rising cuts the arc
export const MAX_FALL = 22;
export const COYOTE = 6;
export const JUMP_BUFFER = 6;
export const ACTION_BUFFER = 8;
export const MERCY = 60;           // invulnerable ticks after being hit
// Hitstop: a melee hit freezes the attacker and the target together for this many ticks (a shot freezes only its
// target). A move's `hitstop` field picks the class, or gives ticks.
export const HITSTOP = { light: 3, heavy: 8, super: 14 };

// The six inputs. A command is { mx, my, ax, ay, aim, b }: move axes (-1..1), aim direction (unit vector,
// `aim` true when it is free aim rather than the move direction), and `b`, the held buttons as bits.
export const BTN = { attack: 1, power: 2, jump: 4, evade: 8, sig: 16, team: 32 };
export const BTN_NAMES = Object.keys(BTN);
export const STICK = { up: 0.55 };   // the stick past this reads as a direction for the moves (sim/moves/)
// A dash strike: Attack while running the way the hero faces at `speed` of their run speed or more
export const DASH = { speed: 0.8 };

// Power types: the Sentinels log damage by type and adapt to whatever the team leans on. 'team' (team-ups
// and the team ultimate) is never countered; 'plain' is environmental and unlogged.
export const POWER_TYPES = ['optic', 'claws', 'tk'];

// ---- Heroes ---------------------------------------------------------------------------------------
// Each hero: body and movement, Evade, and the numbers its own module reads (sim/heroes/<id>.js).
export const HEROES = {
  cyclops: {
    name: 'Cyclops', role: 'The tactician', power: 'optic', hp: 100, w: 0.7, h: 1.74,
    run: 7.6, accel: 90, decel: 110, airAccel: 60, jumpV: 17.4, dblJump: 15, airJumps: 1,
    evade: { ticks: 16, speed: 13, iframes: 9, perfect: 7, cd: 22, back: true },   // a backflip: away from where he faces unless pushed
    // Optic blast: hold Power to open the visor's aperture (wider: more damage, a wider beam, more banks off walls)
    optic: { open: 42, tap: 10, range: 30, dmg: [4, 11], width: [0.18, 0.55], banks: [1, 3], poise: [20, 70],
      strain: [8, 30], strainMax: 100, cool: 0.55, breather: 100, vault: 15.5, cd: 12 },
    attack: 'cyclops',
    call: { ticks: 420, cd: 600, range: 26, bonus: 1.25 },   // Tactical Call
  },
  wolverine: {
    name: 'Wolverine', role: 'The berserker', power: 'claws', hp: 115, w: 0.74, h: 1.6,
    run: 8.6, accel: 80, decel: 70, airAccel: 56, jumpV: 17.0, dblJump: 14, airJumps: 1,
    evade: { ticks: 15, speed: 15, iframes: 10, perfect: 7, cd: 20, back: false },   // a roll in the pushed direction
    // Drill Claw: hold Power to coil (three tiers), let go to lunge along the aim, drilling through what is in line
    drill: { tiers: [0, 20, 44], speed: [20, 25, 31], ticks: [10, 13, 16], dmg: [5, 8, 12], poise: [30, 55, 90], cd: 24 },
    rage: { max: 100, ready: 80, dealt: 0.55, taken: 0.9, healDelay: 120, healRate: 0.12, healCost: 1.6 },   // healing factor spends rage as health; berserk from `ready`
    berserk: { ticks: 480, dmg: 1.4, speed: 0.72, steal: 0.25, taken: 1.15 },   // full rage: faster, harder, no guard
    climb: { speed: 4.5, pounce: { vx: 16, vy: 9 } },
    attack: 'wolverine',
  },
  jean: {
    name: 'Jean Grey', role: 'The mover', power: 'tk', hp: 95, w: 0.68, h: 1.72,
    run: 7.2, accel: 85, decel: 100, airAccel: 62, jumpV: 17.0, dblJump: 14.5, airJumps: 1,
    evade: { ticks: 14, speed: 14, iframes: 10, perfect: 7, cd: 22, back: false },   // a telekinetic blink
    levitate: { fuel: 110, fall: 1.4, rise: 3.2, refill: 1.6 },
    // Telekinesis: hold Power to grab what is along the aim (enemies, debris, enemy shots, allies), steer it
    // with the aim, let go to throw it. Concentration drains while she holds; Phoenix power grows with use.
    tk: { range: 9, cone: 0.5, holdDist: 3.2, follow: 14, drain: 0.55, heavyDrain: 1.2, regen: 0.7, max: 100,
      throwSpeed: 26, dmg: 7, splash: 1.6, splashDmg: 4, poise: 60, cd: 14 },
    phoenix: { gain: 6, decay: 0.03, burnAt: 75, burn: 0.03, maxBonus: 0.6 },
    shield: { ticks: 270, cd: 720, r: 2.3, absorb: 6 },   // TK Shield: a bubble that stops shots
    attack: 'jean',
  },
};
export const HERO_IDS = ['cyclops', 'wolverine', 'jean'];

// ---- Melee: each hero's moves live in a move table (sim/moves/<hero>.js, fields in sim/moves/schema.js), run by
// the move engine (sim/moveEngine.js). MOVES (each hero's moves by id) and COMBO (each hero's chain) are views of
// the tables, for the client and the tools.
export { MOVES, COMBO } from './moves/index.js';
export const COMBO_WINDOW = 20;   // ticks after a strike's recovery in which the next press continues the chain; a pause into it swaps in the second ender (the moveset's `alt`)
// Combo rules and the personal meter (sim/combo.js). Damage scaling: full for `full` hits, then `step` less a hit
// to `floor`; `repeat` less per earlier use of the same move in the combo. A combo ends `gap` ticks after its last
// hit. Style points per hit (`fresh` more for a move new to the combo, `air` more on a Sentinel in the air); the
// ranks D, C, B, A, S and X start at `ranks`; each rank adds `meterBonus` to the meter gained. The meter: three bars.
export const SCALING = { full: 3, step: 0.1, floor: 0.4, repeat: 0.1 };
export const STREAK = { gap: 50 };
export const STYLE = { hit: 10, fresh: 20, air: 10, ranks: [0, 60, 150, 280, 450, 700], meterBonus: 0.1 };
export const METER = { max: 300, bar: 100, dealt: 1, taken: 0.5, super: 100, ult: 200 };   // ticks after a hit's recovery in which the next press continues the chain

// Perfect defence: an Evade timed into a hit (within its first `perfect` ticks) negates it, slows the attacker
// and opens a counter: Attack inside the window does the heavy move at once with bonus damage
export const PERFECT = { slow: 40, counter: 36, bonus: 1.5, gauge: 5 };

// ---- Team play -------------------------------------------------------------------------------------
// The X-Gauge is shared by the whole team. Team-ups, assists and called-target hits fill it; Team and
// Signature together spend a full gauge on the team ultimate.
export const GAUGE = { max: 100, teamup: 18, assist: 6, called: 0.6, perfect: 5, rescue: 10, revive: 6 };
export const TEAM = {
  range: 3.6,          // a team-up starts with an ally this close...
  aimRange: 11,        // ...or one you aim at, this far
  aimCone: 0.82,       // cos of the aim cone
  cd: 150,             // per player, after a team-up
  // Fastball Special (Jean + Wolverine): she holds him, aims, throws; he drills through everything in line
  fastball: { hold: 50, speed: 30, ticks: 26, dmg: 16, poise: 160, slam: { r: 2.4, dmg: 10 } },
  // Psychic rapport (Cyclops + Jean): for a while her telekinesis bends his blasts round cover onto targets
  rapport: { ticks: 360, turn: 0.9, bonus: 1.3 },
  // Lift and hold (Jean + anyone): she pins an enemy in the air; allies' hits on it land harder and always juggle
  lift: { ticks: 200, height: 2.2, bonus: 1.5, range: 10 },
  // Optic edge (Cyclops + Wolverine, the 'empower' template): a blast into the claws; his next strikes throw
  // optic shockwaves
  edge: { strikes: 6, ticks: 420, wave: { speed: 22, ttl: 22, dmg: 4, poise: 30 } },
  ult: { cast: 50, dmg: 45, poise: 400, r: 30 },   // To Me, My X-Men: the team ultimate
};
// Solo play: a squad of three; tap Team to tag the next hero in, hold Team to call a benched hero's assist
// (their team-up with you where the pair has one). Benched heroes heal slowly.
export const SQUAD = { tagCd: 40, holdTicks: 14, assistCd: 420, benchHeal: 1.2 / 60, tagIn: { iframes: 20, dmg: 4, poise: 40 } };

// ---- Sentinels that adapt ----------------------------------------------------------------------------
// Damage is logged by power type; once enough has landed and one type dominates, the Sentinels warn, then
// field counter-tech against it. Only one counter at a time (two good answers always remain), team-ups are
// never countered, and it fades when the encounter ends.
export const ADAPT = { check: 60, min: 70, share: 0.55, warn: 120,
  counters: { optic: { name: 'prism plating', mult: 0.2 }, claws: { name: 'adamantium weave', mult: 0.25 }, tk: { name: 'magnetic anchors', mult: 0.4 } } };

// ---- Enemies ---------------------------------------------------------------------------------------------
// Telegraph categories as in V9: standard (parry or evade), heavy (perfect-evade it), unblockable (move).
export const ENEMIES = {
  trooper: { name: 'Sentinel trooper', hp: 34, w: 0.95, h: 2.1, speed: 3.6, poise: 50, mass: 1,
    swing: { wind: 20, active: 5, rec: 26, dmg: 9, reach: 1.9, kb: [8, 4] },
    slam: { wind: 34, active: 5, rec: 36, dmg: 16, reach: 2.2, kb: [11, 8] } },
  gunner: { name: 'Sentinel gunner', hp: 24, w: 0.9, h: 2.0, speed: 3.0, poise: 35, mass: 1,
    burst: { wind: 26, shots: 3, every: 8, speed: 15, dmg: 6, rec: 40 }, keep: [6, 11] },
  hunter: { name: 'Hunter', hp: 28, w: 0.9, h: 1.9, speed: 2.4, poise: 40, mass: 1, flier: true,
    mark: { aim: 96, range: 26, mult: 1.5, cd: 240 } },
  collector: { name: 'Collector', hp: 46, w: 1.2, h: 2.2, speed: 4.4, poise: 120, mass: 2, armour: 1,
    grab: { wind: 24, reach: 1.4, carry: 3.1 }, drop: 70 },
  mk2: { name: 'Mk-II Sentinel', hp: 320, w: 2.2, h: 4.2, speed: 2.2, poise: 400, mass: 4, armour: 3, boss: true,
    stomp: { wind: 40, dmg: 18, r: 3.6 }, sweep: { wind: 30, active: 8, rec: 34, dmg: 14, reach: 3.8, kb: [12, 6] },
    beam: { wind: 56, ticks: 50, dmg: 2.2, band: [0.25, 0.85] } },
};

// ---- Hit reactions (sim/reactions.js) ------------------------------------------------------------------------
export const REACTIONS = ['flinch', 'stagger', 'knockdown', 'launch', 'airHit', 'wallBounce', 'groundBounce', 'crumple', 'spinOut', 'stun', 'held', 'thrown'];
// Juggle weight: added per hit in the air (a launcher adds more); gravity on a juggled Sentinel grows by weight / 100,
// and at the limit it flips out, untouchable for `flipOut` ticks
export const JUGGLE = { hit: 10, launcher: 20, limit: 100, flipOut: 20 };
// The stun bar fills with poise damage up to `bar` × the Sentinel's poise; full, the next grounded hit stuns for
// `ticks`. Left alone for `calm` ticks, it drains by `drain` a tick
export const STUN = { ticks: 120, bar: 3, calm: 90, drain: 0.5 };
// Reaction timings (ticks) and speeds (m/s): flinch recoil, lying down, the crumple's fold; a wall bounce keeps
// `wallKeep` of its speed and looks for a wall for `wallTicks`; a spike drives down at `spikeVy` and the floor sends
// it back up at `groundVy`; an air hit pops up at least `airPop`; a spin-out slides at `spinSpeed` for `spinTicks`,
// dealing `spinDmg` to what it bowls over
export const REACT = { flinch: 10, down: 30, crumple: 40, wallKeep: 0.6, wallSpeed: 14, wallTicks: 30, groundVy: 9, spikeVy: 14, airPop: 4,
  spinSpeed: 12, spinTicks: 36, spinDmg: 3 };

// The young mutant the team is there to bring home
export const KID = { hp: 60, w: 0.5, h: 1.15, speed: 6.4, follow: [1.6, 3.2], jumpV: 13.5, revive: 90 };
