// Side by side: this tree against a reference tree (a worktree of another commit), tick by tick, reporting the first
// difference. It proves a refactor changes nothing, or finds where a golden replay diverged.
//   git worktree add --detach ../ref <commit>         (say, the last good commit)
//   node tools/sidebyside.mjs ../ref [sim|anim|cues|all] [--state] [--charge]
// sim       both simulations on the golden replays' random cases (tests/golden/cases.mjs): every tick's behaviour
//           (the golden fingerprint, the live hitboxes, the events), or with --state the whole serialised state
// anim      both trees' anim.js pose stand-in rigs from this tree's simulation, with Math.random replayed alike
// cues      both trees' fx.js record the effect calls each event makes (three.js stubbed out)
// --charge  gives each first strike's hold a head start, so the charged heavy happens (holding alone cannot reach it)
// The sim mode leaves the bot cases to tests/golden-test.mjs: the bot steers by the state, so it cannot drive two
// worlds at once. Phase 0 used these checks to show its refactor changed nothing; anim and cues assume today's
// animateHero(rig, p, dt, t) and FX.onEvent, and need updating when those change shape.
import path from 'node:path';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { CASES, fingerprint, tickRecord, runCase, randomPlayer, lcg, diff } from '../tests/golden/cases.mjs';

const args = process.argv.slice(2);
if (!args[0]) { console.log('usage: node tools/sidebyside.mjs <reference tree> [sim|anim|cues|all] [--state] [--charge]'); process.exit(1); }
const mode = args[1] && !args[1].startsWith('--') ? args[1] : 'all', flags = new Set(args.filter(a => a.startsWith('--')));
const HERE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), REF = path.resolve(args[0]);
const load = (root, rel) => import(pathToFileURL(path.join(root, rel)).href);
let failed = false;
const report = (ok, line) => { console.log(`${ok ? 'same' : 'DIFFERENT'}  ${line}`); if (!ok) failed = true; };
const around = (a, b) => { let i = 0; while (a[i] === b[i]) i++; return `\n  here …${a.slice(Math.max(0, i - 160), i + 80)}\n  ref  …${b.slice(Math.max(0, i - 160), i + 80)}`; };

async function sim() {
  const trees = await Promise.all([HERE, REF].map(async root => ({ W: await load(root, 'game/js/sim/world.js'), C: await load(root, 'game/js/sim/config.js') })));
  let ticks = 0, charged = 0;
  for (const c of CASES.filter(k => !k.bot)) {
    const runs = trees.map(({ W, C }) => {
      const S = W.createWorld({ seed: c.seed, players: c.players });
      return { W, C, S, pads: S.players.map((p, i) => randomPlayer(lcg(c.seed * 977 + i * 7919 + 1))), boosted: new Set() };
    });
    for (let t = 0; t < c.ticks; t++) {
      for (const r of runs) {
        const cmds = {};
        r.S.players.forEach((p, i) => { cmds[p.slot] = r.pads[i](); if (flags.has('--charge') && t % 200 < 100) cmds[p.slot].b |= r.C.BTN.attack; });
        r.W.step(r.S, cmds);
        if (flags.has('--charge')) for (const p of r.S.players) if (p.move && p.move.id === r.C.COMBO[p.hero][0] && !r.boosted.has(p.move.inst)) { r.boosted.add(p.move.inst); p.atkHeld += 20; }
      }
      ticks++;
      charged += runs[0].S.events.filter(e => e.type === 'charged').length;
      const [a, b] = runs.map(r => r.S);
      const ka = flags.has('--state') ? JSON.stringify(a) : JSON.stringify([fingerprint(a), tickRecord(a)]);
      const kb = flags.has('--state') ? JSON.stringify(b) : JSON.stringify([fingerprint(b), tickRecord(b)]);
      if (ka !== kb) {
        const d = diff(fingerprint(b), fingerprint(a));
        return report(false, `sim: ${c.name}, tick ${a.tick}: ${d.length ? d.join('; ') + ' (ref → here)' : around(ka, kb)}`);
      }
    }
  }
  report(true, `sim: ${flags.has('--state') ? 'the whole state' : 'behaviour'} tick by tick, ${ticks} ticks${flags.has('--charge') ? `, ${charged} charged heavies` : ''}`);
}

async function anim() {
  const [A, B] = await Promise.all([HERE, REF].map(root => load(root, 'game/js/anim.js')));
  const vec = () => ({ x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } });
  const node = () => ({ rotation: vec(), position: vec(), scale: Object.assign(vec(), { x: 1, y: 1, z: 1 }), userData: {} });
  const rig = () => ({ cur: {}, phase: 0, stretch: 0, wasGround: true, lastVy: 0, yaw: 0, roll: 0, claws: 0, body: node(), spine: node(), head: node(), hips: node(),
    armN: { top: node(), joint: node() }, armF: { top: node(), joint: node() }, legN: { top: node(), joint: node() }, legF: { top: node(), joint: node() }, extra: {} });
  const pose = r => JSON.stringify([r.cur, r.yaw, r.roll, r.stretch, r.phase, r.body, r.spine, r.head, r.hips, r.armN, r.armF, r.legN, r.legF]);
  const random = Math.random;
  let s = 1, frames = 0, first = null;
  const replay = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  for (const c of CASES) {
    const rigs = new Map();
    runCase(c, S => {
      for (const p of S.players) {
        if (!rigs.has(p.id)) rigs.set(p.id, [rig(), rig()]);
        const [a, b] = rigs.get(p.id), seed = S.tick * 7919 + p.id;
        s = seed; Math.random = replay; A.animateHero(a, p, 1 / 60, S.tick / 60);
        s = seed; B.animateHero(b, p, 1 / 60, S.tick / 60); Math.random = random;
        frames++;
        if (!first && pose(a) !== pose(b)) first = `${c.name}, tick ${S.tick}, ${p.hero} ${p.state}${p.move ? ` ${p.move.id} t=${p.move.t}` : ''}`;
      }
    });
    if (first) break;
  }
  report(!first, first ? `anim: ${first}` : `anim: the heroes' poses in ${frames} frames`);
}

async function cues() {
  const STUB = 'data:text/javascript,' + encodeURIComponent('export class Vector3 { constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; } }');
  register('data:text/javascript,' + encodeURIComponent(`export async function resolve(s, c, next) { return s === 'three' ? { url: ${JSON.stringify(STUB)}, shortCircuit: true } : next(s, c); }`));
  const [A, B] = await Promise.all([HERE, REF].map(root => load(root, 'game/js/fx.js')));
  const recorder = FX => {
    const fx = Object.create(FX.prototype), calls = [];
    for (const m of ['spawn', 'sparks', 'flash', 'smoke', 'ring', 'chunks', 'ribbon']) fx[m] = (...a) => { const mat = {}; calls.push([m, a, mat]); return { s: { material: mat } }; };
    return { fx, calls };
  };
  let events = 0, first = null;
  for (const c of CASES) {
    runCase(c, S => {
      for (const ev of S.events) {
        const a = recorder(A.FX), b = recorder(B.FX);
        a.fx.onEvent(ev, S); b.fx.onEvent(ev, S); events++;
        if (!first && JSON.stringify(a.calls) !== JSON.stringify(b.calls)) first = `${c.name}, tick ${S.tick}, event ${ev.type}`;
      }
    });
    if (first) break;
  }
  report(!first, first ? `cues: ${first}` : `cues: the effect calls of ${events} events`);
}

for (const [name, run] of [['sim', sim], ['anim', anim], ['cues', cues]]) if (mode === 'all' || mode === name) await run();
process.exitCode = failed ? 1 : 0;
