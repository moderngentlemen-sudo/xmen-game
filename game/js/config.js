// X-Men: Sentinel Strike — tuning data. An unofficial fan prototype built on the Nova Striker Version 9 engine.
// Units: metres, seconds. Frame data is in simulation ticks (60 per second).

export const TICK_HZ = 60;
export const DT = 1 / TICK_HZ;

export const GRAVITY = 49;          // gives a ~3.2 m jump that peaks in ~0.36 s
export const FALL_MULT = 1.35;      // heavier on the way down
export const RISE_CUT_MULT = 2.4;   // releasing jump while rising cuts the arc
export const MAX_FALL = 22;
export const FAST_FALL = 30;
export const HIGH_VEL = 16;         // speed above which melee becomes a Velocity Break

export const COYOTE = 6;
export const JUMP_BUFFER = 6;
export const ACTION_BUFFER = 6;
export const PARRY_BUFFER = 3;      // short on purpose: long parry buffers make late parries

export const PARRY = { window: 12, perfect: 4, whiff: 16 };
export const MERCY_TICKS = 60;

// Two body frames from Nova Striker carry every hero: 'nova', the ranged frame (charged shots, the Level 4
// beam, rocket jumps, the dodge, the close-range combo) and 'echo', the close-range frame (blade chains, the
// Dash Slash, parry and deflect). A hero takes movement and physics from its frame (`arch`), and its kit,
// colours and voice from its own entry. Nova and Echo stay in the table as the frames' reference builds: the
// regression suite drives them, and they are never offered in the hero select.
const NOVA_FRAME = {
  arch: 'nova', hp: 100,
  run: 7.4, backpedal: 0.8, accelG: 95, decelG: 120, accelA: 60, crouchSpeed: 0.4,
  jumpV: 17.7, dblV: 15.2,
  dash: { ticks: 11, speed: 22, exitKeep: 0.3, cooldown: 18 },
  slide: { ticks: 16, speed: 12.5, decay: 0.965 },
  wall: { slide: 3.6, jumpVx: 9.5, jumpVy: 16, lock: 7 },
  width: 0.72, height: 1.72, crouchH: 0.95,
};
const ECHO_FRAME = {
  arch: 'echo', hp: 100,
  run: 8.8, backpedal: 0.65, accelG: 70, decelG: 50, accelA: 52, crouchSpeed: 0.45,
  jumpV: 17.7, dblV: 15.2,
  dash: { ticks: 13, speed: 24, exitKeep: 0.6, cooldown: 16 },
  slide: { ticks: 18, speed: 13.5, decay: 0.972 },
  wall: { slide: 4.2, jumpVx: 10.5, jumpVy: 16, lock: 6 },
  width: 0.68, height: 1.74, crouchH: 0.95,
};

// What each hero's buttons do.
// Nova frame: `attachments` (charged fire, cycled with the mode button), `subs` (secondary powers on the melee
//   button when nobody is close, cycled with LB), `sig` ('aegis' the shield dome, 'visor' Visor Overdrive,
//   'squall' Squall), `boost` (null: no hover; otherwise the hover tank, BOOST below), `skate` (glide on the
//   ground), `eyes` (shots leave from the eyes rather than the chest).
// Echo frame: `fire` ('rifle': focus shot and snares, 'drill': Drill Claw), `snares`, `scarf` (the three modes
//   on the mode button and the Signature), `sig` ('scarf' or 'berserk'), `heal` (healing factor).
// `ult` picks the ultimate's engine: 'beam' (a colossal steerable beam, then a burst), 'cuts' (a storm of
//   blink strikes), 'storm' (lightning from the sky on everything in sight).
const ALL_ATTACH = ['lance', 'volley', 'arc', 'prism'], ALL_SUBS = ['scatter', 'grenade', 'chain', 'disc', 'well'];
export const BOOST = {
  nova: { fuel: 60, rise: 3.5, thrust: 70, refill: 2.5, minStart: 6, air: 1.1 },
  jean: { fuel: 96, rise: 3.8, thrust: 72, refill: 2.5, minStart: 6, air: 1.12 },     // telekinetic levitation
  storm: { fuel: 170, rise: 4.8, thrust: 86, refill: 3, minStart: 6, air: 1.25 },     // she rides the wind: real flight
};

export const CHARS = {
  nova: { ...NOVA_FRAME, name: 'Nova', role: 'Sentinel', hidden: true,
    energy: '#ffb547', trim: '#2f5f9e', base: '#eef2f7', under: '#1c2c48',
    kit: { attachments: ALL_ATTACH, subs: ALL_SUBS, sig: 'aegis', boost: BOOST.nova, skate: true, eyes: false, ult: 'beam' } },
  echo: { ...ECHO_FRAME, name: 'Echo', role: 'Pursuit', hidden: true,
    energy: '#ff9a1f', trim: '#15151b', base: '#f4f4f2', under: '#1b1b22',
    kit: { fire: 'rifle', snares: true, scarf: true, sig: 'scarf', heal: false, ult: 'cuts' } },

  // The X-Men. `look` holds the costume colours the rigs use beyond the four shared ones.
  cyclops: { ...NOVA_FRAME, name: 'Cyclops', role: 'Field Leader', power: 'Optic blasts',
    energy: '#ff3b30', trim: '#f2c230', base: '#2d55b8', under: '#16234d',
    look: { visor: '#ff2a1f', hair: '#5a3a22', skin: '#e2b896' },
    kit: { attachments: ['lance', 'prism', 'volley'], subs: ['scatter', 'grenade'], sig: 'visor', boost: null, skate: false, eyes: true, ult: 'beam' } },
  wolverine: { ...ECHO_FRAME, name: 'Wolverine', role: 'Berserker', power: 'Adamantium claws, healing factor',
    energy: '#ffd84d', trim: '#2a4bb0', base: '#f4c21f', under: '#17224f',
    look: { claw: '#dfe6ee', skin: '#d9a77f', hair: '#1c1714', stripe: '#121216' },
    kit: { fire: 'drill', snares: false, scarf: false, sig: 'berserk', heal: true, ult: 'cuts' } },
  storm: { ...NOVA_FRAME, name: 'Storm', role: 'Weather Witch', power: 'Lightning, wind and flight',
    energy: '#9fe9ff', trim: '#e9edf5', base: '#1d1d26', under: '#2b2b38',
    look: { hair: '#f2f4fa', skin: '#6b4430', tiara: '#e9c46a', cape: '#16161e', capeIn: '#e9edf5' },
    kit: { attachments: ['lance', 'arc', 'volley'], subs: ['chain', 'well', 'grenade'], sig: 'squall', boost: BOOST.storm, skate: true, eyes: false, ult: 'storm' } },
  jean: { ...NOVA_FRAME, name: 'Jean Grey', role: 'Telekinetic', power: 'Telekinesis and telepathy',
    energy: '#ff8a1f', trim: '#f0c23a', base: '#1f9a55', under: '#0f5a33',
    look: { hair: '#c8331c', skin: '#efc8a8', sash: '#f0c23a' },
    kit: { attachments: ['volley', 'arc', 'lance'], subs: ['disc', 'well', 'scatter'], sig: 'aegis', boost: BOOST.jean, skate: true, eyes: false, ult: 'beam' } },
  psylocke: { ...ECHO_FRAME, name: 'Psylocke', role: 'Psi-Ninja', power: 'Psychic blades',
    energy: '#b77bff', trim: '#d0213f', base: '#2a2f86', under: '#16183f',
    look: { hair: '#4a2a7a', skin: '#e8c1a0', sash: '#d0213f' },
    kit: { fire: 'rifle', snares: true, scarf: true, sig: 'scarf', heal: false, ult: 'cuts' } },
};
// The hero select, in order (number keys 1-5); new players join in this order
export const HEROES = ['cyclops', 'wolverine', 'storm', 'jean', 'psylocke'];
export const kitOf = p => CHARS[p.char].kit;
export const boostOf = p => CHARS[p.char].kit.boost || null;

// Wall play (both characters). Touching a wall in the air while holding toward it starts a slide that
// eases in: a brief grip at gripSpeed, then over `ease` ticks up to the character's slide speed (hold down
// to slide `fast` times quicker). A fall is braked into the slide rather than stopped dead. While sliding
// the character faces away from the wall and can shoot and attack without letting go. Letting go of the
// stick keeps the grip for `stick` ticks, so pressing away and then jump is still a wall jump, and a jump
// within `coyote` ticks of leaving a wall still counts. Touching a wall gives back the double jump.
// Jumping while holding toward the wall (or with the stick neutral) is a climb kick: a small push out and
// a high rise, so a single wall can be climbed. Holding away is a leap (the character's wall.jumpVx).
export const WALL = { grip: 8, gripSpeed: 1.1, ease: 14, brake: 90, fast: 2.2, stick: 7, coyote: 6,
  climb: { vx: 4.2, lock: 5 }, leapVy: 0.92 };

// Charged dash (both characters). On the ground with no direction held, hold dash to charge through three
// levels (charge = ticks to reach each), aim with the stick, and let go to launch. A quick tap (released
// before `tap` ticks) is an ordinary dash toward where you face; with a direction held, dashing is
// instant as always. Each level dashes faster (speed) and longer (ticks) and keeps more momentum at the
// end (exitKeep). From level 2 the first `iframes` ticks are invulnerable; level 3 makes the dash itself
// a strike through every enemy in its path and primes a tier 3 Velocity Break.
export const DASH_CHARGE = { tap: 6, charge: [16, 34, 54], speed: [1.15, 1.3, 1.45], ticks: [1.25, 1.5, 1.75],
  exitKeep: [0.45, 0.55, 0.65], iframes: [0, 10, 99], jumpCarry: 25, strike: { dmg: 2.5, poise: 40, kb: 9 } };

// Lock-on (every player). Press lock to lock onto the best target in front (nearest, in view); while
// locked, a tap cycles to the next target and holding for `hold` ticks lets go. Locked shots and aim go
// straight at the target, homing shots curve to it, a standing player faces it, and melee attacks step
// in toward it. When the target dies the lock jumps to the next one in range; out of range or out of
// sight for `lost` ticks, it lets go. magnet = how close a target must be for a swing to turn and step
// in toward it (at up to `lunge` m/s).
// Automatic lock-on (the default, Settings: Lock-on mode): whenever a player has no target, the nearest enemy
// in sight within `auto` m is locked at once. R3 (F) switches to the next target; holding it lets go and
// pauses automatic locking until the next press. Free aim (right stick, mouse) still aims where it points;
// without it, shots go to the target unless the stick is held up or down.
export const LOCK = { range: 18, keep: 24, hold: 20, lost: 90, magnet: 2.8, lunge: 18, auto: 14 };

// Melee frame data. box = hitbox relative to feet: fx forward offset, y centre, w, h.
// cancelFrom = tick of recovery after which a whiffed move may cancel into parry/dash.
export const MOVES = {
  nova_jab1:  { su: 5, ac: 3, rc: 12, box: { fx: 0.8, y: 1.15, w: 1.0, h: 0.7 }, dmg: 1.2, poise: 12, kb: [2, 0], next: 'nova_jab2' },
  nova_jab2:  { su: 5, ac: 3, rc: 12, box: { fx: 0.8, y: 1.15, w: 1.0, h: 0.7 }, dmg: 1.2, poise: 12, kb: [2.5, 0], next: 'nova_shove' },
  nova_shove: { su: 8, ac: 4, rc: 16, box: { fx: 0.85, y: 1.1, w: 1.2, h: 1.1 }, dmg: 1.6, poise: 30, kb: [11, 3], shove: true },
  nova_brace: { su: 13, ac: 4, rc: 18, box: { fx: 0.9, y: 1.1, w: 1.4, h: 1.3 }, dmg: 2.5, poise: 55, kb: [15, 4], shove: true, armorBreak: true },
  nova_air:   { su: 5, ac: 4, rc: 10, box: { fx: 0.75, y: 0.9, w: 1.1, h: 1.0 }, dmg: 1.2, poise: 12, kb: [4, 2], air: true },
  // Marksman kit, close range: bracer backhand, hard-light elbow, then a point-blank blast punch; an axe kick in the air
  nova_k1:    { su: 4, ac: 3, rc: 11, box: { fx: 0.85, y: 1.15, w: 1.15, h: 0.85 }, dmg: 1.8, poise: 16, kb: [2.5, 0], next: 'nova_k2', fist: true },
  nova_k2:    { su: 4, ac: 3, rc: 11, box: { fx: 0.85, y: 1.0, w: 1.15, h: 0.95 }, dmg: 1.8, poise: 16, kb: [2.5, 0], next: 'nova_k3', fist: true, offhand: true },
  nova_k3:    { su: 7, ac: 4, rc: 16, box: { fx: 1.0, y: 1.1, w: 1.45, h: 1.15 }, dmg: 3.5, poise: 45, kb: [12, 4], shove: true, fist: true, heavy: true,
    blastFist: { r: 1.3, dmg: 1.5, poise: 15 } },
  nova_kair:  { su: 5, ac: 4, rc: 10, box: { fx: 0.8, y: 0.65, w: 1.25, h: 1.1 }, dmg: 2.2, poise: 20, kb: [4, -2], air: true, fist: true },
  // Every character has a rising attack on up + melee, each designed for them (Echo: the Rising Glaive).
  // Nova's is the Solar Uppercut: his boots fire and he drives a hard-light fist straight up, three hits on
  // the way, and a flare of light bursts off the fist at the top (riseBlast). Once per airtime in the air,
  // a little lower (airRise).
  nova_rise:  { su: 4, ac: 14, rc: 14, box: { fx: 0.45, y: 1.55, w: 1.35, h: 2.1 }, dmg: 1.4, poise: 16, kb: [1, 16], launcher: true, fist: true,
    rise: 16, airRise: 0.8, multi: 5, riseBlast: { r: 1.7, dmg: 3, poise: 40 } },

  echo_g1:    { su: 4, ac: 3, rc: 10, box: { fx: 0.75, y: 1.15, w: 1.0, h: 0.7 }, dmg: 1.3, poise: 12, kb: [1.5, 0], next: 'echo_g2', blade: true },
  echo_g2:    { su: 5, ac: 3, rc: 11, box: { fx: 0.8, y: 1.15, w: 1.1, h: 0.8 }, dmg: 1.3, poise: 12, kb: [2, 0], next: 'echo_g3', blade: true },
  echo_g3:    { su: 7, ac: 4, rc: 16, box: { fx: 1.0, y: 1.0, w: 1.9, h: 1.2 }, dmg: 2.2, poise: 28, kb: [7, 2], staff: true },
  echo_launch:{ su: 8, ac: 4, rc: 14, box: { fx: 0.8, y: 1.4, w: 1.2, h: 1.6 }, dmg: 1.5, poise: 20, kb: [1.5, 15], launcher: true, staff: true },
  echo_air1:  { su: 4, ac: 3, rc: 9, box: { fx: 0.75, y: 0.95, w: 1.1, h: 1.0 }, dmg: 1.1, poise: 10, kb: [1.5, 5], air: true, hover: true, next: 'echo_air2', blade: true },
  echo_air2:  { su: 4, ac: 3, rc: 9, box: { fx: 0.75, y: 0.95, w: 1.1, h: 1.0 }, dmg: 1.1, poise: 10, kb: [1.5, 5], air: true, hover: true, next: 'echo_air3', blade: true },
  echo_air3:  { su: 6, ac: 4, rc: 12, box: { fx: 0.9, y: 0.9, w: 1.6, h: 1.2 }, dmg: 1.8, poise: 22, kb: [7, 1], air: true, staff: true },
  // Charged staff swing; the Hunter kit also looses a crescent wave that flies on (wave)
  echo_charged:{ su: 14, ac: 4, rc: 18, box: { fx: 1.1, y: 1.0, w: 2.2, h: 1.4 }, dmg: 7, poise: 60, kb: [10, 3], armorBreak: true, staff: true, heavy: true, deflect: true,
    wave: { speed: 22, ttl: 38, dmg: 5, poise: 40, r: 0.75 } },
  echo_riposte:{ su: 2, ac: 4, rc: 12, box: { fx: 1.0, y: 1.1, w: 1.8, h: 1.4 }, dmg: 7, poise: 80, kb: [8, 3], staff: true, deflect: true },

  // Hunter kit: a fast twin-blade chain with a glaive finisher, and Zero-style specials. Staff and glaive
  // swings (deflect) knock enemy shots back the way they came. multi = the hitbox renews every that many
  // ticks (multi-hit); rise = upward speed at the start; spin = a full-circle hitbox around him;
  // hoverAll = gravity scale for the whole move; wall = done from a wall slide.
  echo_b1:    { su: 3, ac: 2, rc: 8, box: { fx: 0.7, y: 1.15, w: 1.05, h: 0.85 }, dmg: 1.7, poise: 12, kb: [1, 0], next: 'echo_b2', blade: true },
  echo_b2:    { su: 3, ac: 2, rc: 8, box: { fx: 0.75, y: 1.15, w: 1.1, h: 0.85 }, dmg: 1.7, poise: 12, kb: [1, 0], next: 'echo_b3', blade: true, offhand: true },
  echo_b3:    { su: 4, ac: 3, rc: 9, box: { fx: 0.85, y: 1.1, w: 1.3, h: 1.0 }, dmg: 2.1, poise: 16, kb: [1.5, 0], next: 'echo_b4', blade: true, cross: true },
  echo_b4:    { su: 5, ac: 5, rc: 13, box: { fx: 1.1, y: 1.0, w: 2.3, h: 1.4 }, dmg: 4.2, poise: 40, kb: [8, 2], staff: true, glaive: true, deflect: true },
  // Rising Glaive: a spinning uppercut that carries him up and hits three times on the way
  echo_rise:  { su: 3, ac: 15, rc: 12, box: { fx: 0.55, y: 1.35, w: 1.6, h: 2.1 }, dmg: 1.5, poise: 18, kb: [1.5, 16], launcher: true, staff: true, glaive: true,
    rise: 15, multi: 5, deflect: true },
  echo_ab1:   { su: 3, ac: 3, rc: 8, box: { fx: 0.75, y: 0.95, w: 1.15, h: 1.05 }, dmg: 1.6, poise: 11, kb: [1.5, 5], air: true, hover: true, next: 'echo_ab2', blade: true },
  echo_ab2:   { su: 3, ac: 3, rc: 8, box: { fx: 0.75, y: 0.95, w: 1.15, h: 1.05 }, dmg: 1.6, poise: 11, kb: [1.5, 5], air: true, hover: true, next: 'echo_ab3', blade: true, offhand: true },
  echo_ab3:   { su: 5, ac: 4, rc: 11, box: { fx: 0.95, y: 0.9, w: 1.8, h: 1.3 }, dmg: 3.2, poise: 28, kb: [7, 1], air: true, staff: true, glaive: true, deflect: true },
  // Spin Slash (up + melee in the air): the glaive whirls all the way round him, four hits, a slow fall
  echo_spin:  { su: 2, ac: 16, rc: 10, box: { fx: 0, y: 0.9, w: 2.6, h: 2.4 }, dmg: 1.3, poise: 12, kb: [4, 4], air: true, staff: true, glaive: true,
    spin: true, multi: 4, hoverAll: 0.35, deflect: true },
  // Wall Slash: a wide crescent cut out from the wall, and he keeps his grip
  echo_wall:  { su: 3, ac: 4, rc: 10, box: { fx: 1.1, y: 1.0, w: 2.1, h: 2.0 }, dmg: 2.6, poise: 26, kb: [7, 3], air: true, blade: true, wall: true, deflect: true },
};

// Echo's Dash Slash (Hunter kit): melee during or just after a dash (a Velocity Break) is a lunging cut
// that carries him on through the enemy, Zero-style; the power tier (1-3) comes from the speed source,
// as for any Velocity Break.
export const DASH_SLASH = { ticks: 12, speed: [19, 22, 26], keep: 0.93, box: { fx: 0.9, w: 2.5, h: 1.6 }, dmg: [2.8, 4.5, 7], poise: [30, 50, 90],
  armorBreak: [false, true, true], recover: 9, hitRecover: 4 };
// Ground pound (Nova's hard-light fist, Echo's glaive; Echo's Pursuit kit keeps its dive): in the air, the
// secondary attack with the stick held down, or aimed within ~25 degrees of straight down (`aimDown`). He
// hangs for a `windup`, then drops at `speed` m/s hitting whatever he passes through (`drop`), and landing
// sets off a scatter blast that throws enemies outward (`land`, one entry per charge level). Holding the
// button charges it through levels 1-3 (`charge` ticks) while he hangs in the air, sinking at `hang` m/s,
// for up to `maxHold` ticks; a longer fall widens the blast a little (`fallBonus` m at 12 m or more).
// Echo's quick (uncharged) pound bounces off an enemy it hits on the way down (`bounce`), giving back the
// air dash and double jump, Shovel Knight style.
export const POUND = {
  windup: 5, hang: 1.2, maxHold: 110, charge: [20, 44, 72], speed: 34, maxDrop: 100, aimDown: -0.9, bounce: 13,
  box: { w: 1.3, h: 1.6 }, drop: { dmg: 2.5, poise: 24 }, recover: 12, hitRecover: 5, fallBonus: 0.6,
  land: [
    { r: 2.4, dmg: 4, poise: 45, kb: 9, up: 6 },
    { r: 3.0, dmg: 6, poise: 65, kb: 11, up: 7 },
    { r: 3.7, dmg: 8.5, poise: 90, kb: 13, up: 8, armorBreak: true },
    { r: 4.6, dmg: 12, poise: 130, kb: 16, up: 9, armorBreak: true },
  ],
};
// Echo's staff deflect: during a parry (the first `window` ticks) or any staff swing marked `deflect`, enemy
// shots that reach him are knocked back toward whoever fired them, faster, as his own; a perfect parry
// hits harder. Unblockable shells cannot be deflected.
export const DEFLECT = { window: 22, reach: 1.15, speed: 1.35, dmg: { standard: 3, heavy: 6 }, perfect: 1.6 };

export const HUNTER = {
  snareCharges: 2, snareRecharge: 300, throwSpeed: 15, throwLift: 5, snareGravity: 32,
  armTicks: 10, life: 600, maxPlanted: 2,
  rootLight: 96, rootHeavyPoise: 38,
  leashTicks: 110, leashLen: 2.3, yankPoise: 45,
  // Sniper rifle: a tap of fire still throws a snare (crouch + tap plants one). Hold to raise the rifle and
  // scope in (after `raise` ticks); focus builds over `focus` more ticks. Let go to fire: an instant shot
  // down the whole level (range m) doing minDmg-maxDmg with focus (poise likewise); an upper-body hit
  // (above critZone of the enemy's height) is a critical for x`crit`. At full focus the shot pierces
  // every enemy in line, breaks armor and tags them. A bolt cycle (cd ticks) follows every shot; there is no
  // recoil. He moves at `slow` speed while scoped on the ground. It cannot shoot down enemy fire (that stays
  // Nova's job).
  rifle: { raise: 10, focus: 60, cd: 48, range: 60, minDmg: 5, maxDmg: 18, poise: [18, 70], crit: 1.6, critZone: 0.62, kb: 6, slow: 0.35, tag: 600 },
};

// Echo's scarf modes (approved for testing). One button cycles them; the Signature button
// does something different in each: Tether = Scarf Lash, Veil = Vanish, Flare = Challenge.
// All three Signature moves spend the same scarf charges (ECHO.lashCharges).
export const SCARF = {
  modes: ['tether', 'veil', 'flare'],
  switchCd: 10,
  veilFade: 20,          // ticks to fade out after entering Veil or after it re-arms
  veilRearm: 150,        // after Veil breaks, it re-arms after this long without attacking or being hit
  ambushWindow: 24,      // after breaking Veil with an attack, the first melee hit in this window is an ambush
  ambushDmg: 1.5,
  flareRange: 12,        // enemies this close prefer a flaring Echo over nearer teammates
  flareParry: 4,         // extra parry-window ticks while at least one enemy targets him
  flarePerfect: 3,       // extra perfect-parry ticks while targeted
  flareResolve: 1.6,     // Resolve gain multiplier while flaring
  flareTrickle: 2,       // Resolve per second for each enemy targeting him (counts up to 3)
  challengeRange: 9,     // Challenge pulls every enemy this close onto Echo
  tauntTicks: 180,
};

// Velocity Break v0: power tier comes from what produced the speed.
export const VB = {
  stopTicks: 2, activeFrom: 2, activeTo: 6, whiffRecovery: 10, driftAfter: 6,
  tiers: {
    1: { dmg: 2, poise: 30, kb: 6, armorBreak: false },
    2: { dmg: 3.5, poise: 50, kb: 9, armorBreak: true },
    3: { dmg: 6, poise: 90, kb: 13, armorBreak: true },
  },
};

export const NOVA = {
  shotCd: 8, shotSpeed: 30, shotDmg: 1, shotRange: 20,
  charge1: 30, charge2: 72,
  lance: { dmg: 3, poise: 30, speed: 36 },
  rail: { dmg: 6, poise: 60, speed: 44 },
  bulwarkCd: 480, bulwarkRange: 4, barrierTicks: 120, barrierHalf: 1.6,
};

// Nova's Marksman kit (proposal under test). The bracer takes four attachments that all fire
// projectiles; the mode button cycles them. Hold fire to charge through three levels, and let go
// just as level 3 completes for a Perfect Release. His secondary weapons (SUBS, on the melee button)
// charge the same way. Every shot splashes where it lands, and a charged shot that bursts close to
// him launches him: aim at your feet to rocket jump. Light boosters let him hover, skate-blade boots
// let him glide, and his shots fly until they hit something or leave the level.
// The Pass 1 Sentinel kit stays in Settings.
export const MARKSMAN = {
  attachments: ['lance', 'volley', 'arc', 'prism'],
  switchCd: 10,
  charge: [34, 72, 115], // ticks to reach charge levels 1, 2 and 3 (level 4 is beam.at)
  perfectWindow: 10,     // a Perfect Release lets go within this many ticks of reaching level 3
  perfectMult: 1.5,      // damage and poise bonus on a Perfect Release
  life: 900,             // safety cap only: his shots otherwise fly until they hit something or leave the level
  // Splash: r (m), dmg and poise dealt to enemies around the impact; rocket = it can rocket-jump him
  // when it bursts on terrain close to him (charged shots only; the height comes from `rocket` below)
  round: { splash: { r: 0.9, dmg: 0.35, poise: 4 } },   // basic tap-fire round
  lance: {               // one fast round that pierces a line of enemies
    1: { speed: 40, dmg: 4.2, poise: 36, r: 0.22, kb: 5, splash: { r: 1.0, dmg: 1.6, poise: 12, rocket: true } },
    2: { speed: 46, dmg: 7, poise: 60, r: 0.26, kb: 8, armorBreak: true, splash: { r: 1.4, dmg: 2.8, poise: 20, rocket: true } },
    3: { speed: 52, dmg: 11.5, poise: 95, r: 0.32, kb: 11, armorBreak: true, rail: true, splash: { r: 1.9, dmg: 4.5, poise: 30, rocket: true } },
  },
  volley: {              // a fan of homing darts, spread over the enemies in front of him
    darts: { 1: 3, 2: 5, 3: 7, perfect: 9 }, fan: { 1: 0.9, 2: 1.1, 3: 1.35, perfect: 1.6 },
    speed: 20, dmg: 1.55, poise: 11, r: 0.14, seekDelay: 6, seekFor: 150, turn: 0.1, seekRange: 16, seekCone: 1.2,
    splash: { r: 0.8, dmg: 0.55, poise: 5 }, rocket: true,
  },
  arc: {                 // a lobbed shell that bursts on contact; the blast hits shielded enemies too
    speed: 17, lift: 0.7, gravity: 32,
    1: { r: 1.8, dmg: 4.2, poise: 42, rocket: true },
    2: { r: 2.3, dmg: 6.3, poise: 60, armorBreak: true, rocket: true },
    3: { r: 2.9, dmg: 9, poise: 90, armorBreak: true, rocket: true },
    perfectRadius: 1.25,
  },
  prism: {               // a crystal round that splits into shards on impact; shards ricochet off walls
    speed: 30, r: 0.2,
    1: { dmg: 2.2, poise: 17, shards: 2, bounces: 1, splash: { r: 1.2, dmg: 0.85, poise: 7, rocket: true } },
    2: { dmg: 3.1, poise: 22, shards: 3, bounces: 1, splash: { r: 1.4, dmg: 1.25, poise: 10, rocket: true } },
    3: { dmg: 4.2, poise: 29, shards: 5, bounces: 2, splash: { r: 1.7, dmg: 1.7, poise: 12, rocket: true } },
    perfectBounces: 1,   // extra bounces on a Perfect Release
    shard: { speed: 24, dmg: 1.7, poise: 10, r: 0.12, fan: 0.36, splash: { r: 0.7, dmg: 0.5, poise: 5 } },
  },
  burst: {               // Scatter, the first of his secondary weapons: point-blank pellets (no recoil)
    cd: 24,
    charge: [30, 62, 98], perfectWindow: 10,   // every secondary weapon charges on this clock
    falloff: 14,         // pellets fly on, but lose damage over this distance (down to a quarter)
    tap: { pellets: 5, fan: 0.63, speed: 28, dmg: 0.5, poise: 7, kb: 8 },
    1: { pellets: 7, fan: 0.7, speed: 29, dmg: 0.6, poise: 10, kb: 10 },
    2: { pellets: 9, fan: 0.8, speed: 30, dmg: 0.7, poise: 12, kb: 12, armorBreak: true },
    3: { pellets: 12, fan: 0.9, speed: 32, dmg: 0.8, poise: 14, kb: 14, armorBreak: true,
      blast: { r: 1.7, dmg: 2.5, poise: 30 } },
  },
  // Rocket jump: a charged shot bursting within its radius + reach of Nova's centre launches him away
  // from the burst. How high grows with how long the shot was charged: h[0] m at charge level 1, rising
  // steadily to h[1] m at level 3, and `perfect` m on a Perfect Release (for a burst at his feet, i.e.
  // within `close` m below his centre and `slack` m to either side; further away launches less, by up to
  // `falloff`). Attachments scale
  // the height (the Arc shell is the strongest). The launch sets his climb speed rather than adding to
  // it, so the height is a real ceiling. Each extra rocket jump in the same airtime is weaker (air), so he
  // cannot fly by shooting down. `freeze` = impact pause in ticks before he leaves (weak, strong, full);
  // `side`/`sideMax` = sideways push off walls.
  rocket: { h: [3.6, 8.4], perfect: 10.5, attach: { lance: 0.95, volley: 0.8, arc: 1, prism: 0.9 },
    reach: 1.1, close: 0.9, slack: 0.35, falloff: 0.45, air: [1, 0.6, 0.35, 0.2], side: 0.6, sideMax: 18, freeze: [2, 3, 4] },
  // Level 4: hold past level 3 to `at` ticks, then let go for a sustained beam that lasts `ticks`. It pulses
  // every `pulse` ticks (dmg, poise) through every enemy in line up to the first wall (range m), breaks
  // armor every `armorEvery` ticks per enemy, and erases enemy shots it touches. It follows the aim at up to
  // `turn` rad per tick; Nova is braced (moves at `slow` speed on the ground; in the air he hangs, sinking at
  // `hover` m/s). It has no push-back.
  // Dash or parry cuts it short. Attachments flavour it: Volley sheds a homing dart every `volley.every`
  // ticks, Arc bursts where the beam lands every `arc.every` ticks, Prism bounces off the first wall.
  beam: { at: 170, ticks: 96, pulse: 6, dmg: 2.4, poise: 16, width: 0.34, range: 42, turn: 0.04, slow: 0.2, hover: 0.8, armorEvery: 24,
    volley: { every: 10 }, arc: { every: 14, blast: { r: 1.7, dmg: 2.4, poise: 22 } }, prism: { bounces: 1 } },
  // Close range: with an enemy within reach m ahead (up m up or down), melee is his bracer combo instead of
  // his secondary weapon
  melee: { reach: 1.9, up: 1.6 },
  // Light boosters: after the double jump, press and hold jump to hover and climb gently
  boost: { fuel: 60, rise: 3.5, thrust: 70, refill: 2.5, minStart: 6, air: 1.1 },
  // Focus: each charged shot that lands adds 1 (2 on a Perfect Release), basic rounds add a little.
  // Every level adds dmgPer to his projectile damage. Taking damage clears it; idling drains it.
  focus: { max: 5, dmgPer: 0.06, perRound: 0.34, decay: 360, decayStep: 120 },
  // Skate glide on the ground: slower to reach top speed, keeps momentum, brakes hard when reversed
  skate: { top: 8.2, accel: 60, coast: 30, carve: 95, tuck: 12, tuckMin: 3, backpedal: 1 },
};
// Nova's hard-light Aegis (Marksman kit Signature): a dome of hard light around him for `ticks` that blocks
// every attack (unblockables too) for him and any ally inside it. It holds `hp` of damage; each point it
// absorbs adds over.perDmg Overcharge (max over.max). While he has Overcharge, his shots charge
// over.charge times faster and each charged release (or beam) deals over.dmg times the damage, costing
// over.cost. Overcharge starts draining over.hold ticks after it last grew. Broken by damage, the dome
// shatters in a burst that hits enemies around him (shatter); pressing Signature again detonates it on
// purpose (detonate, scaled by the hard light left). Cooldown `cd` from when it ends.
export const AEGIS = { hp: 70, ticks: 300, cd: 660, radius: 1.55,
  over: { perDmg: 2.2, max: 100, hold: 360, drain: 0.25, charge: 1.6, dmg: 1.4, cost: 34 },
  shatter: { r: 3.2, dmg: 3, poise: 45, kb: 10 }, detonate: { r: 3.0, dmg: 4, poise: 45, kb: 10, over: 20 } };

// Nova's secondary weapons (Marksman kit, on the melee button; LB or T switches). None of them has any
// recoil. Each fires on a tap (level 0) and charges through levels 1-3 on MARKSMAN.burst.charge, with a
// Perfect Release as for his primary. The Scatter fires the moment you press; the others fire when you
// let go. Arrays are per level (0 = tap).
//   Grenade: a bouncing frag with a fuse (bounces keep `bounce` of their speed); it bursts early on an
//     enemy. Level 3 scatters bomblets.
//   Chain: instant lightning to the nearest enemy in front (the lock-on target first), then jumping to the
//     next nearest within `hop` m, up to `jumps` enemies; it arcs round shields and stuns light enemies.
//   Disc: a hard-light disc that flies out and comes back to him, cutting everything on the way (each
//     enemy once each way) and slicing enemy shots out of the air; from level 2 it hovers at the far end,
//     cutting every `tick` ticks. Press again while it is out to call it back. One at a time.
//   Well: an orb that opens a gravity well where it stops (after `travel` ticks, or on an enemy or a
//     wall): light enemies are pulled in and held, heavy ones dragged (`heavy`), bosses only hurt; enemy
//     shots are swallowed. It collapses in a blast after `life` ticks, or when you press again. One at a time.
export const SUBS = ['scatter', 'grenade', 'chain', 'disc', 'well'];
export const SUB = {
  switchCd: 10,
  grenade: { cd: 26, speed: [14, 15, 16.5, 18], lift: 0.55, gravity: 30, bounce: 0.5, roll: 0.82, r: 0.2, fuse: [58, 64, 70, 76],
    blast: [{ r: 1.8, dmg: 3, poise: 30 }, { r: 2.2, dmg: 4.5, poise: 45 }, { r: 2.7, dmg: 6.5, poise: 65, armorBreak: true },
      { r: 3.2, dmg: 9, poise: 90, armorBreak: true }],
    bomblets: { n: 4, speed: 8, lift: 7, fuse: 28, blast: { r: 1.3, dmg: 2.2, poise: 22 } } },
  chain: { cd: 28, range: [7, 8, 9, 10], jumps: [3, 4, 5, 7], hop: 5, dmg: [1.3, 1.9, 2.5, 3.4], poise: [12, 18, 26, 38], stun: [14, 20, 28, 40], cone: 0.9 },
  disc: { cd: 16, speed: [22, 24, 26, 28], out: [16, 18, 20, 22], hover: [0, 0, 40, 60], back: 26, r: [0.4, 0.45, 0.55, 0.65],
    dmg: [1.6, 2.2, 3, 4], poise: [12, 16, 22, 30], tick: 8, maxBack: 150 },
  well: { cd: 30, speed: 13, travel: [24, 26, 28, 30], life: [70, 90, 110, 130], r: [3.2, 3.6, 4.2, 5], pull: [6, 7, 8, 9.5], heavy: 0.3,
    tick: 12, tickDmg: [0.35, 0.45, 0.6, 0.8], lift: 1.1,
    implode: [{ r: 2.2, dmg: 3, poise: 40 }, { r: 2.6, dmg: 4.5, poise: 55 }, { r: 3.1, dmg: 6.5, poise: 75, armorBreak: true },
      { r: 3.8, dmg: 9, poise: 100, armorBreak: true }] },
};
// Presentation only: HUD names and tints, in Nova's gold family like his attachments
export const SUB_LOOK = {
  scatter: { name: 'Scatter', tint: '#ffcf7a' }, grenade: { name: 'Grenade', tint: '#ff9a3d' }, chain: { name: 'Chain', tint: '#ffe066' },
  disc: { name: 'Disc', tint: '#ffd36b' }, well: { name: 'Gravity Well', tint: '#ffb547' },
};

// Nova's dodge (Marksman kit, on the parry button; Echo keeps his parry and deflect). A quick hop the way
// the stick points (backwards with it centred) that leaves him untouchable for the first `iframes` ticks;
// in the air he can dodge once per airtime. An attack that would have hit him in the first `perfect` ticks
// is a perfect dodge: enemies within `slowRange` m move at half speed for `slowTicks` ticks (their shots
// too), and he gains `over` Overcharge (faster charging, harder shots) and ultimate charge. He can shoot
// and keep charging while he dodges. `cd` counts from the start.
export const DODGE = { ticks: 16, speed: 13, airSpeed: 11, keep: 0.86, iframes: 11, perfect: 7, cd: 28, slowTicks: 100, slowRange: 7, over: 20 };

// Ultimates. Everyone has an ultimate bar that fills in play (dealing damage, taking it, kills, perfect
// parries, dodges and deflects). When it is full, pull both triggers together (V on the keyboard) for the
// character's ultimate. It opens with a short call (`cast` ticks) where the world holds still: any
// teammate with a full bar can pull both triggers then to join in for a team ultimate. Enemies and their
// shots stay frozen while the ultimate plays out; the ones using it can't be hurt.
//   Nova, Supernova: he rises into a hover and fires a colossal beam he can steer (through walls), then
//     bursts in a nova of light.
//   Echo, Thousand Cuts: he vanishes and cuts every enemy close by in a storm of blinks (`strikes` shared
//     among up to `targets` enemies), then every cut lands again at once.
//   Storm, Eye of the Storm: she rises into the eye and calls lightning down on every enemy in sight (within
//     `reach` m of the screen; `strikes` bolts shared among up to `targets`), then a great bolt on each at once.
//   Team: everyone who joined runs their ultimate together at `team.power`, then a team finisher hits every
//     enemy on screen for `team.dmg` per member. Bosses take `boss` of ultimate damage.
// A hero's kit picks the engine (`ult`: 'beam' runs Nova's, 'cuts' Echo's, 'storm' Storm's); `names` is
// what the call shows: Cyclops's Optic Overload and Jean's Phoenix Force are beams, Wolverine's Berserker
// Barrage X and Psylocke's Thousand Butterflies are cuts.
export const ULT = {
  max: 100, gain: { dealt: 0.6, taken: 0.35, kill: 2, perfect: 6 }, chord: 6, cast: 54, join: 18, boss: 0.5, mercy: 60,
  nova: { name: 'Supernova', rise: 1.6, gather: 24, beam: 110, pulse: 5, dmg: 5, width: 1.25, range: 40, turn: 0.06, nova: { r: 6, dmg: 12, poise: 120 }, end: 150 },
  echo: { name: 'Thousand Cuts', range: 16, targets: 8, strikes: 20, every: 3, dmg: 3, start: 10, finisher: 14, flourish: { r: 5, dmg: 10 }, end: 40 },
  storm: { rise: 2.2, reach: 2, targets: 10, strikes: 24, every: 4, dmg: 3, start: 20, finisher: 14, flourish: { r: 6, dmg: 10 }, end: 56 },
  team: { power: 1.3, dmg: 12, t: 50 },
  names: {
    nova: 'Supernova', echo: 'Thousand Cuts',
    cyclops: 'Optic Overload', wolverine: 'Berserker Barrage X', storm: 'Eye of the Storm', jean: 'Phoenix Force', psylocke: 'Thousand Butterflies',
  },
  // Two heroes together (ids in alphabetical order); three or four together is teamAll
  teamNames: {
    'echo+nova': 'Eclipse Protocol', 'nova+nova': 'Binary Star', 'echo+echo': 'Twin Phantom',
    'cyclops+jean': 'Bonded Minds', 'cyclops+psylocke': 'Optic Blade', 'cyclops+storm': 'Storm Front', 'cyclops+wolverine': 'Uneasy Alliance',
    'jean+psylocke': 'Psychic Chorus', 'jean+storm': 'Sky of Fire', 'jean+wolverine': 'Feral Flame',
    'psylocke+storm': 'Silent Thunder', 'psylocke+wolverine': 'Shadow Claws', 'storm+wolverine': 'Thunderclaw',
    'cyclops+cyclops': 'Double Vision', 'jean+jean': 'Twin Phoenix', 'psylocke+psylocke': 'Mirror Butterflies',
    'storm+storm': 'Perfect Storm', 'wolverine+wolverine': 'Snikt Squared',
  },
  teamAll: 'To Me, My X-Men',
};
export const ultName = p => ULT.names[p.char] || ULT[CHARS[p.char].arch].name;

// Cyclops's Visor Overdrive (Signature): he opens the visor wide. Overcharge fills (`over`, held `hold` ticks
// before it drains: faster charging and harder charged releases, as from the shield dome) and a concussive
// flare bursts round him. Cooldown `cd` from use.
export const VISOR = { cd: 600, over: 100, hold: 300, flare: { r: 2.4, dmg: 2.5, poise: 35, kb: 9 } };
// Storm's Squall (Signature): a burst of wind round her that throws enemies away and blows their shots out of
// the air. In the air it also lifts her (`lift` m/s) and tops up her flight by `fuel`.
export const SQUALL = { cd: 420, r: 4.2, dmg: 2.5, poise: 45, kb: 13, up: 6, lift: 7, fuel: 60 };
// Wolverine's Drill Claw (fire): a corkscrew lunge along the aim (eight ways, or at the lock-on target) that
// cuts through everything on the way, using the Dash Slash tiers. Tap for tier 1; hold `charge` ticks for
// tiers 2 and 3. Once per airtime in the air (a wall gives it back); `cd` ticks from the release.
export const DRILL = { charge: [22, 50], cd: 26, box: { w: 2.0, h: 2.0 } };
// Wolverine's Berserker Rage (Signature): `ticks` of fury. Melee hits deal `dmg` times the damage and heal
// `steal` of it, swings run `speed` times their usual windup and recovery, and hits taken don't stagger him
// (damage x `taken`). Cooldown `cd` from when it ends.
export const BERSERK = { ticks: 360, cd: 840, dmg: 1.3, steal: 0.3, speed: 0.7, taken: 0.8 };
// Wolverine's healing factor: `delay` ticks after the last hit he took, he regenerates `rate` hp a second.
export const HEAL = { delay: 150, rate: 4 };

// Presentation only: HUD names and a tint for each attachment, kept inside Nova's gold family so
// his shots still read as his in a 4-player fight (shapes tell the attachments apart)
export const ATTACH_LOOK = {
  lance: { name: 'Lance', tint: '#ffb547' }, volley: { name: 'Volley', tint: '#ffd889' },
  arc: { name: 'Arc', tint: '#ff9f40' }, prism: { name: 'Prism', tint: '#fff0c8' },
};
// Each X-Man's names and tints for the same mechanics, in their own colour family
export const HERO_LOOK = {
  cyclops: {
    attach: { lance: { name: 'Piercing Blast', tint: '#ff3b30' }, prism: { name: 'Ricochet Blast', tint: '#ff8f80' }, volley: { name: 'Spread Blast', tint: '#ff5e4a' } },
    sub: { scatter: { name: 'Optic Spray', tint: '#ff6a55' }, grenade: { name: 'Optic Mine', tint: '#ff2f45' } },
  },
  storm: {
    attach: { lance: { name: 'Lightning Bolt', tint: '#bff4ff' }, arc: { name: 'Thunderhead', tint: '#8fd8ff' }, volley: { name: 'Hailstones', tint: '#e6fbff' } },
    sub: { chain: { name: 'Chain Lightning', tint: '#d6f7ff' }, well: { name: 'Cyclone', tint: '#a6e6ff' }, grenade: { name: 'Hailstorm', tint: '#e6fbff' } },
  },
  jean: {
    attach: { volley: { name: 'Mind Darts', tint: '#ff9f40' }, arc: { name: 'TK Debris', tint: '#ffb35c' }, lance: { name: 'Psi Spear', tint: '#ff7a1f' } },
    sub: { disc: { name: 'TK Throw', tint: '#ffc06b' }, well: { name: 'TK Grip', tint: '#ff8a1f' }, scatter: { name: 'Psychic Push', tint: '#ffd08a' } },
  },
};
// Presentation only: each hero's effect colours. `energy` is their signature glow (shots, slashes, charge),
// `hot` the white-hot core, `soft` a pale accent (sparks, dust glints), `deep` a darker accent.
export const FXPAL = {
  nova: { energy: '#ffb547', hot: '#fff1c9', soft: '#ffe2a8', deep: '#ff8a1f' },
  echo: { energy: '#ff9a1f', hot: '#fff1d6', soft: '#ffe2a8', deep: '#ff6a00' },
  cyclops: { energy: '#ff3b30', hot: '#ffe3dc', soft: '#ff9c8c', deep: '#c8101e' },
  wolverine: { energy: '#ffd84d', hot: '#fffbe8', soft: '#e8eef5', deep: '#ffae00' },
  storm: { energy: '#9fe9ff', hot: '#ffffff', soft: '#dff8ff', deep: '#4aa8ff' },
  jean: { energy: '#ff8a1f', hot: '#fff0d6', soft: '#ffc27a', deep: '#ff3d1f' },
  psylocke: { energy: '#b77bff', hot: '#f4e9ff', soft: '#e0b8ff', deep: '#7b3cff' },
};
export const fxPal = p => FXPAL[p && p.char] || FXPAL.nova;
export const attachLook = (p, k) => (HERO_LOOK[p.char] && HERO_LOOK[p.char].attach[k]) || ATTACH_LOOK[k];
export const subLook = (p, k) => (HERO_LOOK[p.char] && HERO_LOOK[p.char].sub[k]) || SUB_LOOK[k];

export const ECHO = {
  cellsMax: 4, boltCd: 12, boltDmg: 1.5, boltSpeed: 34,
  tracerCd: 72, tracerHold: 24, tracerDmg: 0.8,
  lashRange: 6.5, lashCharges: 2, lashRecharge: 240, zipSpeed: 24,
  resolveHalf: 50,
};

export const PLAYER_COLORS = ['#5ac8fa', '#7ed957', '#f5f5f5', '#4dd0b8'];
export const PLAYER_MARKS = ['▲', '◆', '●', '■'];
export const HOSTILE = '#ff2e7e';

export const DEFAULT_SETTINGS = {
  novaKit: 'marksman',  // 'marksman' (projectile proposal) or 'sentinel' (Pass 1 kit)
  echoKit: 'hunter',    // 'hunter' (close-range proposal) or 'pursuit' (Pass 1 kit)
  echoHead: 'helmet',   // presentation only: 'helmet', 'mask' or 'bare'
  echoRanged: 'B',      // Pursuit kit only. A: Tracer only · B: Bolts + Tracer · C: no ranged
  dashIframes: false,
  vbStop: 'hard',       // 'hard' stop or 'keep30' momentum
  vbRefund: true,
  impactFrames: true,   // impact frames on the biggest moments (sci-fi look since Version 9; on by default since Version 8)
  camera: 'persp',
  fov: 34,
  aimAssist: true,
  difficulty: 'normal',
  shake: true,
  quality: 'high',
  hitboxes: false,
  barks: true,
  volume: 0.6,
  music: 0.6,
  p1Aim: 'mouse',
  lockOn: true,         // lock-on (F, R3, mouse forward)
  lockMode: 'auto',     // 'auto': the nearest enemy is locked automatically, R3 switches · 'manual': press to lock
  dashCharge: true,     // hold dash while standing still to charge it (off: dash is always instant)
  haptics: true,        // controller rumble, and phone vibration where the browser allows it
  hapticStrength: 0.8,
  settingsVersion: 9,
};

export const SETTINGS = { ...DEFAULT_SETTINGS };

// Kept apart from Nova Striker's own settings. The X-Men always play the frames' current kits (Marksman,
// Hunter); the Pass 1 kits stay in the engine for the regression suite only.
const KEY = 'xmen-sentinel-strike-settings';
export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      for (const k of ['novaKit', 'echoKit', 'echoHead', 'echoRanged', 'settingsVersion']) delete saved[k];
      Object.assign(SETTINGS, saved);
    }
  } catch (e) { /* storage unavailable: keep defaults */ }
}
export function saveSettings() {
  try { localStorage.setItem(KEY, JSON.stringify(SETTINGS)); } catch (e) { /* ignore */ }
}

export const DIFFICULTY = {
  easy:   { tokens: -1, dmg: 0.7 },
  normal: { tokens: 0, dmg: 1 },
  hard:   { tokens: 1, dmg: 1.3 },
};
