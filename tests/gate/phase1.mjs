// Phase 1's gate, written down before the work: node tests/gate/phase1.mjs
// Not part of tests/run-all.mjs (that only runs the suites directly in tests/), because most of these fail until
// the phase is done. Each step of phase 1 (HANDOFF-EXPANSION.md, section 4) turns some of them green; the phase's
// gate needs all of them green, plus the user's approval of the feel. When a check here passes for good, its
// behaviour also gets a proper test in a tests/<area>-test.mjs suite, so run-all guards it from then on.
// The checks reach the game through the names phase 1 plans (config's HITSTOP, JUGGLE, SCALING, METER and STUN,
// sim/reactions.js, schema.js's SLOTS, sim/trials.js); a missing one fails with what is missing.
import fs from 'node:fs';

const root = new URL('../../', import.meta.url);
const sim = f => import(new URL(`game/js/sim/${f}`, root));
let pass = 0, fail = 0;
async function check(name, fn) {
  let ok = false, why = '';
  try { const r = await fn(); ok = r === true; if (!ok && typeof r === 'string') why = r; } catch (err) { why = err.message.split('\n')[0]; }
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${!ok && why ? ` (${why})` : ''}`);
  ok ? pass++ : fail++;
}
const cmd = (o = {}) => ({ mx: o.mx || 0, my: o.my || 0, ax: 1, ay: 0, aim: false, b: o.b || 0 });

const W = await sim('world.js'), C = await sim('config.js'), P = await sim('player.js'), EN = await sim('enemies.js');
const { MOVESETS } = await sim('moves/index.js');
const HEROES3 = ['cyclops', 'wolverine', 'jean'];

// A hero on the rooftop with the mission parked, and one trooper in front that stands still (no AI) unless told
function arena(hero, { trooper = true, dist = 1.2 } = {}) {
  const S = W.createWorld({ seed: 3, players: 1 }), p = S.players[0];
  if (p.hero !== hero) P.setHero(S, p, hero);
  S.enemies = []; p.x = 20; p.y = 0; p.mercy = 0; S.mission.phase = 'test';
  let e = null;
  if (trooper) { e = EN.createEnemy(S, 'trooper', p.x + dist, 0); e.onGround = true; e.cd = 9999; S.enemies.push(e); }
  const log = [];
  const run = (o = {}, n = 1) => { for (let i = 0; i < n; i++) { W.step(S, { [p.slot]: cmd(typeof o === 'function' ? o(i) : o) }); log.push(...S.events); } };
  return { S, p, e, run, log };
}

// ---- Hitstop in the simulation ----------------------------------------------------------------------------------
await check('HITSTOP is light 3, heavy 8, super 14 ticks', () => C.HITSTOP && C.HITSTOP.light === 3 && C.HITSTOP.heavy === 8 && C.HITSTOP.super === 14);
await check('a light hit freezes the attacker and the target together for 3 ticks', () => {
  const { p, e, run, log } = arena('cyclops');
  run({ b: C.BTN.attack });
  for (let i = 0; i < 20 && !log.some(v => v.type === 'hit'); i++) run();
  if (!log.some(v => v.type === 'hit')) return 'no hit landed';
  const t = p.move && p.move.t, ex = e.x;
  run({}, 2);
  const frozen = p.move && p.move.t === t && e.x === ex && p.hitstop > 0 && e.hitstop > 0;
  run({}, 2);
  return frozen && p.move && p.move.t > t ? true : `attacker t ${t} → ${p.move && p.move.t}, hitstop ${p.hitstop}/${e.hitstop}`;
});
await check('the client no longer freezes the whole world (main.js has no hitPause)', () => !fs.readFileSync(new URL('game/js/main.js', root), 'utf8').includes('hitPause'));

// ---- What phase 0 found ------------------------------------------------------------------------------------------
for (const hero of HEROES3) await check(`${hero}: holding Attack alone fires the charged heavy`, () => {
  const { run, log } = arena(hero, { trooper: false });
  run({ b: C.BTN.attack }, 90); run({}, 40);
  return log.some(v => v.type === 'charged');
});
for (const hero of HEROES3) await check(`${hero}: a ground strike steps the hero forward at least 0.15 m`, () => {
  const { p, run } = arena(hero, { trooper: false });
  const x0 = p.x; run({ b: C.BTN.attack }); run({}, 30);
  return p.x - x0 >= 0.15 || `moved ${(p.x - x0).toFixed(3)} m`;
});

// ---- Reactions -----------------------------------------------------------------------------------------------------
const TWELVE = ['flinch', 'stagger', 'knockdown', 'launch', 'airHit', 'wallBounce', 'groundBounce', 'crumple', 'spinOut', 'stun', 'held', 'thrown'];
await check('sim/reactions.js lists the twelve reactions', async () => {
  const R = await sim('reactions.js');
  const missing = TWELVE.filter(r => !R.REACTIONS.includes(r));
  return !missing.length || `missing ${missing.join(', ')}`;
});
await check('juggle: 10 per air hit, 20 per launcher, flip-out at 100 for 20 invulnerable ticks', () =>
  C.JUGGLE && C.JUGGLE.hit === 10 && C.JUGGLE.launcher === 20 && C.JUGGLE.limit === 100 && C.JUGGLE.flipOut === 20);
await check('stun: a broken poise bar stuns for 120 ticks', () => C.STUN && C.STUN.ticks === 120);

// ---- Combo rules and the meter ---------------------------------------------------------------------------------
await check('scaling: 100% for hits 1 to 3, then 10% less per hit to a floor of 40%; a repeat costs 10% more', async () => {
  const { comboScale } = await sim('combo.js');
  const s = n => comboScale(n, 0);
  return s(1) === 1 && s(3) === 1 && Math.abs(s(4) - 0.9) < 1e-9 && Math.abs(s(20) - 0.4) < 1e-9 && Math.abs(comboScale(4, 1) - 0.8) < 1e-9;
});
await check('style ranks run D, C, B, A, S, X', async () => (await sim('combo.js')).STYLE_RANKS.join('') === 'DCBASX');
await check('meter: 300 max (three bars), super 100, ultimate 200', () => C.METER && C.METER.max === 300 && C.METER.super === 100 && C.METER.ult === 200);

// ---- The move grammar ------------------------------------------------------------------------------------------
await check('schema.js lists the 29 slots', async () => {
  const { SLOTS } = await sim('moves/schema.js');
  return (SLOTS && SLOTS.length === 29) || `${SLOTS ? SLOTS.length : 0} slots`;
});
for (const hero of HEROES3) await check(`${hero}: all 29 slots are filled, and the table is valid`, async () => {
  const { SLOTS, validateMoves } = await sim('moves/schema.js');
  const set = MOVESETS[hero], filled = new Set(Object.values(set.moves).map(m => m.slot));
  const missing = (SLOTS || []).filter(s => !filled.has(s)), bad = validateMoves(set);
  return (SLOTS && !missing.length && !bad.length) || `missing ${missing.length} slots${bad.length ? `; ${bad[0]}` : ''}`;
});

// ---- Every move has a test, and the trials ---------------------------------------------------------------------
await check('every move is named in a test suite', () => {
  const suites = fs.readdirSync(new URL('tests/', root)).filter(f => f.endsWith('-test.mjs')).map(f => fs.readFileSync(new URL(`tests/${f}`, root), 'utf8')).join('\n');
  const listed = suites.match(/EVERY_MOVE_TESTED/);   // a suite that walks every table says so with this marker
  return !!listed || 'no suite walks every move (marker EVERY_MOVE_TESTED)';
});
await check('5 combo trials per hero, 15 in all', async () => {
  const { TRIALS } = await sim('trials.js');
  return HEROES3.every(h => TRIALS[h] && TRIALS[h].length === 5);
});
await check('tests/trials-test.mjs exists (it runs every trial)', () => fs.existsSync(new URL('tests/trials-test.mjs', root)));

// ---- Tools -------------------------------------------------------------------------------------------------------
await check('the contact-sheet tool exists (tools/contact.mjs)', () => fs.existsSync(new URL('tools/contact.mjs', root)));

console.log(`\nphase 1 gate: ${pass} passed, ${fail} to go`);
