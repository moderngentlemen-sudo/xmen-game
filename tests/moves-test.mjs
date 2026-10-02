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
import { clipKeys } from '../game/js/anim.js';

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
// Phase 1 named the moves after the grammar's slots: every move's id is its slot (or it is a hero's extra)
for (const hero of HERO_IDS) {
  const set = MOVESETS[hero], off = Object.entries(set.moves).filter(([id, m]) => m.slot !== id && m.slot !== 'extra').map(([id]) => id);
  assert(!off.length && set.chain.every(id => set.moves[id]) && (set.airChain || []).every(id => set.moves[id]),
    `${hero}'s moves are named after their slots (${Object.keys(set.moves).join(' ')})${off.length ? `; not: ${off.join(', ')}` : ''}`);
}
// Every cancel lands on something real: each move runs to the start of each cancel window (a cancel on hit gets its
// hit), then takes each of its cancels. 'evade' must start the hero's Evade; 'attack' must start a move of the
// hero's own table, whichever way Attack is pressed (no direction, up, inside the counter window); 'jump' must leave
// the hero rising, free.
for (const hero of HERO_IDS) {
  const set = MOVESETS[hero], problems = [];
  for (const [id, m] of Object.entries(set.moves)) if (!m.module) for (const c of m.cancel) for (const to of c.into) {
    const from = c.from !== undefined ? c.from : c.on === 'hit' ? m.su : m.su + m.ac;
    for (const how of to === 'attack' ? ['neutral', 'up', 'counter'] : [to]) {
      const { S, p, run } = setup(hero);
      if (m.input.ctx === 'air') { p.y = 2.5; p.onGround = false; }
      startMove(S, p, id, false);
      const M = p.move;
      while (p.move === M && M.t <= from) run();
      if (p.move !== M) { problems.push(`${id} ended before its cancel window`); continue; }
      if (c.on === 'hit') M.hit = true;
      if (how === 'counter') p.counterT = 10;
      if (how === 'super') p.meter = 300;
      const btn = { evade: BTN.evade, jump: BTN.jump, special: BTN.power, super: BTN.sig }[how] || BTN.attack;
      run({ my: how === 'up' ? 1 : 0, mx: how === 'special' || how === 'super' ? p.facing : 0, b: btn });
      const ok = how === 'evade' ? p.state === 'evade' : how === 'jump' ? p.state === 'normal' && !p.move && p.vy > 0 && !p.onGround
        : how === 'special' ? p.move && p.move.id === 'pFwd' : how === 'super' ? p.move && p.move.id === 'super'
        : p.move && p.move !== M && set.moves[p.move.id];
      if (!ok) problems.push(`${id} → ${to} (${how}) landed on ${p.state}${p.move ? ' ' + p.move.id : ''}`);
    }
  }
  assert(!problems.length, `every cancel of ${hero}'s lands on a real move, the Evade or a jump${problems.length ? ': ' + problems.slice(0, 4).join('; ') : ''}`);
}
// A cancel on hit waits for the hit: the launcher whiffed cannot be jump-cancelled
for (const hero of HERO_IDS) {
  const { p, run } = setup(hero);
  run({ my: 1, b: BTN.attack });
  const M = p.move;
  run({}, MOVESETS[hero].moves.up.su + 1);
  run({ b: BTN.jump });
  assert(M.id === 'up' && p.move === M, `${hero}: a launcher that hits nothing cannot be cancelled into a jump`);
}

// ---- Hitboxes on active ticks only ---------------------------------------------------------------------------------
// Each move runs untouched from its start; its hitbox must be out exactly while su < t <= su + ac, and the move must
// end once t reaches su + ac + rc. Under berserk Wolverine's clock runs fractional, and the rule still holds.
for (const [hero, berserk] of [['cyclops', false], ['wolverine', false], ['wolverine', true], ['jean', false]]) {
  const wrong = [];
  for (const [id, m] of Object.entries(MOVESETS[hero].moves)) {
    // a module move is the hero module's; a grab, shots and an area have no hitbox (tests/movelist-test.mjs covers them)
    if (m.module || m.grab || m.shots || m.area) continue;
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
  const set = MOVESETS[hero], counterM = set.moves.counter;
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
  assert(chain === want && up === 'up' && air === 'air1' && counter.started === 'counter'
    && counter.box && counter.box.dmg === counterM.dmg * counterM.counter.dmgMult && counter.box.poise === counterM.poise * counterM.counter.poiseMult && counter.box.heavy,
    `${hero}: Attack walks the chain (${chain}), up starts the launcher, the air chain in the air, and the counter window the counter at ${counterM.counter.dmgMult}× damage and poise`);
}

// ---- The charge rule --------------------------------------------------------------------------------------------------
// Holding Attack from the press: the first strike holds its pose at the end of its active ticks; letting go once the hold
// is reached fires the charged heavy, holding on fires it by itself at `hold + release`, and letting go early just lets
// the strike recover (no charge). Phase 1 made this reachable (V2's pose came only after the hold, which the strike never
// lived to see).
for (const hero of HERO_IDS) {
  const set = MOVESETS[hero], heavy = set.moves.heavy, C = heavy.charge, from = set.moves[C.from];
  const attempt = letGoAt => {
    const { S, p, run, log } = setup(hero);
    let ticks = 0, posed = 0;
    while (ticks < 200 && !log.some(e => e.type === 'charged') && (p.move || ticks === 0)) {
      run({ b: letGoAt !== null && ticks >= letGoAt ? 0 : BTN.attack }); ticks++;
      if (p.move && p.move.id === C.from && p.move.posed) posed++;
    }
    let box = null;
    for (let i = 0; i < 40 && !box; i++) { run(); box = S.hitboxes.find(h => h.owner === p.id && h.dmg > from.dmg); }
    return { ticks, posed, charged: !!(p.move && p.move.charged) || log.some(e => e.type === 'charged'), box, swings: log.filter(e => e.type === 'swing').length };
  };
  const release = attempt(C.hold + 2), hold = attempt(null), early = attempt(from.su + from.ac + 3);
  const dmg = heavy.dmg * 1 * C.dmgMult;
  assert(release.charged && release.box && release.box.dmg === dmg && hold.charged && hold.box && hold.box.dmg === dmg && hold.ticks === 1 + C.hold + C.release
    && !early.charged && early.swings === 1 && early.posed > 0,
    `${hero}: holding Attack poses the first strike; letting go after ${C.hold} ticks fires the charged heavy (${dmg.toFixed(1)} damage), holding on fires it at ${C.hold + C.release}, letting go early just recovers`);
}

// ---- Every move has its animation clip -------------------------------------------------------------------------------
// The client plays a clip per move id (game/js/anim/clips/, plain data that loads without three.js): every move needs
// one, every clip needs its move, and a clip's keyframes start at 0 and run in time order within the move.
for (const hero of HERO_IDS) {
  const set = MOVESETS[hero], clips = CLIPS[hero] || {}, problems = [];
  for (const [id, m] of Object.entries(set.moves)) {
    if (m.module) continue;   // the hero module animates its own moves
    const clip = clips[id];
    if (!clip) { problems.push(`${id} has no clip`); continue; }
    const ks = clip.keys(m), end = m.su + m.ac + m.rc;
    if (!ks.length || ks[0].t !== 0 || ks.some((q, i) => q.t > end || (i && q.t < ks[i - 1].t))) problems.push(`${id}'s keyframes are out of order or outside its ${end} ticks`);
  }
  for (const id of Object.keys(clips)) if (!set.moves[id]) problems.push(`the clip ${id} has no move`);
  assert(!problems.length, `${hero}: every move has an animation clip, and every clip a move${problems.length ? ': ' + problems.join('; ') : ''}`);
}

// ---- Clips play with weight (phase 1, step 1.8) ----------------------------------------------------------------------
// Polished (anim.js), every strike clip has 6 to 10 keys in time order inside its move, with an anticipation before
// the strike and an overshoot after it where the clip has room for them
for (const hero of HERO_IDS) {
  const set = MOVESETS[hero], problems = [];
  let antic = 0, over = 0, total = 0;
  for (const [id, m] of Object.entries(set.moves)) {
    if (m.module) continue;
    const ks = clipKeys(hero, id), end = m.su + m.ac + m.rc;
    total++;
    if (ks.length < 6 || ks.length > 10) problems.push(`${id} has ${ks.length} keys`);
    if (ks.some((q, i) => q.t < 0 || q.t > end || (i && q.t < ks[i - 1].t))) problems.push(`${id}'s keys are out of order`);
    if (ks.some(q => q.tag === 'anticipation')) antic++;
    if (ks.some(q => q.tag === 'overshoot')) over++;
  }
  assert(!problems.length && antic >= total * 0.8 && over >= total * 0.8,
    `${hero}: every clip plays with 6 to 10 keys (anticipation in ${antic} of ${total}, overshoot in ${over})${problems.length ? ': ' + problems.join('; ') : ''}`);
}
