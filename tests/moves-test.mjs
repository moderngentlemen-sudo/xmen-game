// The move tables (game/js/sim/moves/) and the move engine (game/js/sim/moveEngine.js): every table is valid, every
// cancel resolves to a real move, hitboxes come out on active ticks only, every hero keeps V2's moves, the Attack
// button picks what the grammar says (the chain, up, air, the counter, the charge), and every move has its
// animation clip (game/js/anim/clips/).
import { createWorld, step } from '../game/js/sim/world.js';
import { BTN, HEROES } from '../game/js/sim/config.js';
import { setHero } from '../game/js/sim/player.js';
import { startMove } from '../game/js/sim/moveEngine.js';
import { MOVESETS } from '../game/js/sim/moves/index.js';
import { validateMoves } from '../game/js/sim/moves/schema.js';
import { CLIPS } from '../game/js/anim/clips/index.js';

const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const cmd = (o = {}) => ({ mx: o.mx || 0, my: o.my || 0, ax: 1, ay: 0, aim: false, b: o.b || 0 });
const HERO_IDS = Object.keys(MOVESETS);

// One hero standing on the rooftop, the mission parked (no waves)
function setup(hero) {
  const S = createWorld({ seed: 3, players: 1 }), p = S.players[0];
  if (p.hero !== hero) setHero(S, p, hero);
  p.x = 20; p.y = 0; p.mercy = 0; S.mission.phase = 'test';
  const log = [];
  const run = (o = {}, n = 1) => { for (let i = 0; i < n; i++) { step(S, { [p.slot]: cmd(typeof o === 'function' ? o(i) : o) }); log.push(...S.events); } };
  return { S, p, run, log };
}

// ---- The tables ----------------------------------------------------------------------------------------------------
for (const hero of HERO_IDS) {
  const bad = validateMoves(MOVESETS[hero]);
  assert(!bad.length, `${hero}'s move table is valid${bad.length ? ': ' + bad.slice(0, 4).join('; ') : ''}`);
}
// V2's moves, which phase 0 keeps (phase 1 renames them to the grammar's slots)
const V2 = { cyclops: { chain: 'g1 g2 g3', moves: 'g1 g2 g3 air up heavy' }, wolverine: { chain: 'g1 g2 g3 g4', moves: 'g1 g2 g3 g4 air up heavy' }, jean: { chain: 'g1 g2 g3', moves: 'g1 g2 g3 air up heavy' } };
for (const hero of Object.keys(V2)) {
  const set = MOVESETS[hero];
  assert(set && set.chain.join(' ') === V2[hero].chain && Object.keys(set.moves).join(' ') === V2[hero].moves, `${hero} has V2's moves (${V2[hero].moves}) and chain`);
}
// Every cancel lands on something real: each move runs into its recovery, then takes each of its cancels. 'evade' must
// start the hero's Evade; 'attack' must start a move of the hero's own table, whichever way Attack is pressed
// (no direction, up, inside the counter window).
for (const hero of HERO_IDS) {
  const set = MOVESETS[hero], problems = [];
  for (const [id, m] of Object.entries(set.moves)) for (const c of m.cancel) for (const to of c.into) {
    for (const how of to === 'attack' ? ['neutral', 'up', 'counter'] : ['evade']) {
      const { S, p, run } = setup(hero);
      if (m.input.ctx === 'air') { p.y = 2.5; p.onGround = false; }
      startMove(S, p, id, false);
      const M = p.move;
      while (p.move === M && M.t <= m.su + m.ac) run();
      if (p.move !== M) { problems.push(`${id} ended before its recovery`); continue; }
      if (how === 'counter') p.counterT = 10;
      run({ my: how === 'up' ? 1 : 0, b: how === 'evade' ? BTN.evade : BTN.attack });
      if (how === 'evade' ? p.state !== 'evade' : !(p.move && p.move !== M && set.moves[p.move.id])) problems.push(`${id} → ${to} (${how}) landed on ${p.state}${p.move ? ' ' + p.move.id : ''}`);
    }
  }
  assert(!problems.length, `every cancel of ${hero}'s lands on a real move or the Evade${problems.length ? ': ' + problems.slice(0, 4).join('; ') : ''}`);
}

// ---- Hitboxes on active ticks only ---------------------------------------------------------------------------------
// Each move runs untouched from its start; its hitbox must be out exactly while su < t <= su + ac, and the move must
// end once t reaches su + ac + rc. Under berserk Wolverine's clock runs fractional, and the rule still holds.
for (const [hero, berserk] of [['cyclops', false], ['wolverine', false], ['wolverine', true], ['jean', false]]) {
  const wrong = [];
  for (const [id, m] of Object.entries(MOVESETS[hero].moves)) {
    const { S, p, run } = setup(hero);
    if (berserk) p.berserkT = 9999;
    if (m.input.ctx === 'air') { p.y = 2.5; p.onGround = false; }
    startMove(S, p, id, false);
    const M = p.move, end = m.su + m.ac + m.rc, tick = 1 / (berserk ? HEROES.wolverine.berserk.speed : 1);
    let ticks = 0, endedAt = null;
    while (ticks < 120 && endedAt === null) {
      run(); ticks++;
      const out = S.hitboxes.some(h => h.inst === M.inst), active = M.t > m.su && M.t <= m.su + m.ac;
      if (out !== active) wrong.push(`${id} t=${+M.t.toFixed(3)}: hitbox ${out ? 'out' : 'missing'}`);
      if (p.move !== M) endedAt = M.t;
    }
    // It ends on the first tick its clock reaches the end: exactly at it on a whole-tick clock
    if (endedAt === null || endedAt < end || endedAt >= end + tick) wrong.push(`${id} ended at t=${endedAt}, not on reaching ${end}`);
  }
  assert(!wrong.length, `${hero}${berserk ? ' (berserk, a fractional clock)' : ''}: every move's hitbox is out on its active ticks only, and the move ends on time${wrong.length ? ': ' + wrong.slice(0, 4).join('; ') : ''}`);
}

// ---- What Attack starts ----------------------------------------------------------------------------------------------
for (const hero of HERO_IDS) {
  const set = MOVESETS[hero], heavy = set.moves.heavy;
  // Taps landing in each strike's recovery walk the chain, and it starts over after the last
  const chain = (() => {
    const { p, run, log } = setup(hero);
    let last = false;
    run(i => {
      const m = p.move && set.moves[p.move.id], ready = !p.move || p.move.t > m.su + m.ac;
      const press = ready && !last; last = press;
      return { b: press ? BTN.attack : 0 };
    }, 160);
    return log.filter(e => e.type === 'swing').map(e => e.move).slice(0, set.chain.length + 1).join(' ');
  })();
  // Up and Attack: the launcher. In the air: the air move. In a perfect defence's window: the counter, with its bonus.
  const up = (() => { const { p, run, log } = setup(hero); run({ my: 1, b: BTN.attack }); return log.find(e => e.type === 'swing')?.move; })();
  const air = (() => { const { p, run, log } = setup(hero); run({ b: BTN.jump }, 6); run({ b: BTN.jump | BTN.attack }); return log.find(e => e.type === 'swing')?.move; })();
  const counter = (() => {
    const { S, p, run } = setup(hero);
    p.counterT = 10;
    run({ b: BTN.attack });
    const started = p.move && p.move.counter && p.move.id;
    let box = null;
    for (let i = 0; i < 40 && !box; i++) { run(); box = S.hitboxes.find(h => h.owner === p.id); }
    return { started, box };
  })();
  const want = [...set.chain, set.chain[0]].join(' ');
  assert(chain === want && up === 'up' && air === 'air' && counter.started === 'heavy'
    && counter.box && counter.box.dmg === heavy.dmg * heavy.counter.dmgMult && counter.box.poise === heavy.poise * heavy.counter.poiseMult && counter.box.heavy,
    `${hero}: Attack walks the chain (${chain}), up starts the launcher, the air move in the air, and the counter window the heavy at ${heavy.counter.dmgMult}× damage and poise`);
}

// ---- The charge rule --------------------------------------------------------------------------------------------------
// In V2 holding Attack never reaches the charge (the first strike ends before the hold does; phase 1 fixes that), so
// these give the hold a head start to check the rule itself: once the hold reaches `hold` and the first strike is past
// its active ticks it holds its pose; letting go, or holding on to `hold + release`, fires the charged heavy.
for (const hero of HERO_IDS) {
  const set = MOVESETS[hero], heavy = set.moves.heavy, C = heavy.charge, from = set.moves[C.from];
  const attempt = letGo => {
    const { S, p, run, log } = setup(hero);
    run({ b: BTN.attack });   // the first strike starts
    p.atkHeld = C.hold;       // the head start: the hold is reached
    let after = 0;
    while (after < 200 && !log.some(e => e.type === 'charged')) {
      const posed = p.move && p.move.id === C.from && p.move.t === from.su + from.ac;
      run({ b: letGo && posed ? 0 : BTN.attack }); after++;
    }
    let box = null;
    for (let i = 0; i < 40 && !box; i++) { run(); box = S.hitboxes.find(h => h.owner === p.id); }
    return { after, charged: p.move && p.move.charged, box };
  };
  const release = attempt(true), hold = attempt(false);
  const dmg = heavy.dmg * 1 * C.dmgMult;
  assert(release.charged && release.box && release.box.dmg === dmg && hold.charged && hold.box && hold.box.dmg === dmg && hold.after === C.release,
    `${hero}: with the hold reached, letting go fires the charged heavy (${dmg.toFixed(1)} damage), and holding on fires it ${C.release} ticks later`);
}

// ---- Every move has its animation clip -------------------------------------------------------------------------------
// The client plays a clip per move id (game/js/anim/clips/, plain data that loads without three.js): every move needs
// one, every clip needs its move, and a clip's keyframes start at 0 and run in time order within the move.
for (const hero of HERO_IDS) {
  const set = MOVESETS[hero], clips = CLIPS[hero] || {}, problems = [];
  for (const [id, m] of Object.entries(set.moves)) {
    const clip = clips[id];
    if (!clip) { problems.push(`${id} has no clip`); continue; }
    const ks = clip.keys(m), end = m.su + m.ac + m.rc;
    if (!ks.length || ks[0].t !== 0 || ks.some((q, i) => q.t > end || (i && q.t < ks[i - 1].t))) problems.push(`${id}'s keyframes are out of order or outside its ${end} ticks`);
  }
  for (const id of Object.keys(clips)) if (!set.moves[id]) problems.push(`the clip ${id} has no move`);
  assert(!problems.length, `${hero}: every move has an animation clip, and every clip a move${problems.length ? ': ' + problems.join('; ') : ''}`);
}
