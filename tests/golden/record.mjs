// Records the golden replays:  node tests/golden/record.mjs [label] [out = tests/golden/replays.json]
// Runs every case in cases.mjs and writes its samples, then prints what the cases exercised (moves by hero, charged
// and counter heavies, cancels, interruptions, berserk's fractional move time), so a gap in coverage shows.
// Re-record only when behaviour changes on purpose, and say so in the commit; `label` names the behaviour recorded
// (such as "phase 1: hitstop") and goes into the file. tests/golden-test.mjs compares against the file.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CASES, EVERY, LAYOUT, runCase } from './cases.mjs';
import { MOVES } from '../../game/js/sim/config.js';

const label = process.argv[2] || 'unlabelled';
const outPath = process.argv[3] || fileURLToPath(new URL('./replays.json', import.meta.url));

// What a case exercised, counted from the events and the players' states tick by tick
function coverage() {
  const seen = {}, prev = new Map();
  const add = k => { seen[k] = (seen[k] || 0) + 1; };
  const tick = S => {
    for (const ev of S.events) {
      if (ev.type === 'swing') {
        const p = S.players.find(q => q.id === ev.id), was = prev.get(ev.id);
        add(`swing ${ev.hero} ${ev.move}`);
        if (p && p.move && p.move.counter) add(`counter ${was && was.state === 'evade' ? 'out of the evade' : 'after the evade'}`);
        if (was && was.state === 'attack') add(`attack cancel out of ${was.move}`);
      }
      if (ev.type === 'charged') add('charged heavy');
      if (ev.type === 'jump' && ev.cancel) add(`jump cancel out of ${ev.cancel}`);
      if (ev.type === 'react') add(`reaction ${ev.react}`);
      if (ev.type === 'comboEnd') add(`combo of ${ev.n >= 10 ? '10 or more' : ev.n >= 5 ? '5 to 9' : '2 to 4'} hits`);
      if (ev.type === 'evade' && prev.get(ev.id) && prev.get(ev.id).state === 'attack') add('evade cancel out of a move');
      if (ev.type === 'perfect') add('perfect defence');
      if (ev.type === 'berserk') add('berserk');
    }
    for (const p of S.players) {
      const was = prev.get(p.id);
      if (p.move && p.move.t % 1 !== 0) add('move ticks with fractional t (berserk)');
      const m = p.move && MOVES[p.hero][p.move.id];
      if (m && (p.move.id === 'heavy' || p.move.id === 'counter') && p.buf.attack === 0 && p.move.t > m.su + m.ac) add('attack pressed in a heavy\'s recovery (no cancel)');
      if (was && was.state === 'attack' && p.state !== 'attack' && !(p.state === 'normal' || p.state === 'evade')) add(`move interrupted: ${p.state}`);
      if (was && was.state === 'attack' && was.hero !== p.hero) add('move interrupted: tag');
      prev.set(p.id, { state: p.state, move: p.move ? p.move.id : null, hero: p.hero });
    }
  };
  return { seen, tick };
}

const total = {};
const parts = [];
for (const c of CASES) {
  const cov = coverage(), t0 = performance.now();
  const samples = runCase(c, cov.tick);
  const end = samples[samples.length - 1];
  parts.push(`{"name": ${JSON.stringify(c.name)}, "ticks": ${end.tick}, "samples": [\n${samples.map(s => JSON.stringify(s)).join(',\n')}\n]}`);
  for (const [k, n] of Object.entries(cov.seen)) total[k] = (total[k] || 0) + n;
  console.log(`${c.name}: ${end.tick} ticks, ${samples.length} samples, ${((performance.now() - t0) / 1000).toFixed(1)} s${c.bot ? `, mission ${end.fp.mission[3] ? 'finished' : 'NOT finished'}` : ''}`);
}
const about = `The behaviour of ${label}, recorded by tests/golden/record.mjs; tests/golden-test.mjs replays the cases in tests/golden/cases.mjs and compares. Each sample is { tick, digest, hash, fp }: the running digest of every tick so far, hashState (for information only), and the fingerprint, whose rows LAYOUT names.`;
fs.writeFileSync(outPath, `{"about": ${JSON.stringify(about)},\n"node": ${JSON.stringify(process.version)},\n"every": ${EVERY},\n"layout": ${JSON.stringify(LAYOUT)},\n"cases": [\n${parts.join(',\n')}\n]}\n`);
console.log(`\nwrote ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(0)} KB)\n\nCoverage over all cases:`);
for (const k of Object.keys(total).sort()) console.log(`  ${String(total[k]).padStart(6)}  ${k}`);
