// Golden replays: the behaviour recorded in tests/golden/v2.json must come out again. Every case in
// tests/golden/cases.mjs (the mission bot over whole missions, seeded random inputs for one to four players) runs
// and its behavioural fingerprints must match the recorded ones: the running digest of every tick and the full
// fingerprint every second. This is how a refactor proves it changed nothing (phase 0 moved V2's melee onto move
// tables under it). When behaviour changes on purpose, re-record with `node tests/golden/record.mjs` and say so in
// the commit. hashState is compared too, for information only: it also changes with the state's layout.
import fs from 'node:fs';
import { CASES, runCase, diff } from './golden/cases.mjs';

const assert = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) process.exitCode = 1; };
const golden = JSON.parse(fs.readFileSync(new URL('./golden/v2.json', import.meta.url), 'utf8'));

let hashSamples = 0, hashSame = 0, hashFirst = null;
for (const c of CASES) {
  const want = golden.cases.find(g => g.name === c.name);
  if (!want) { assert(false, `${c.name}: not in v2.json (a new case: re-record)`); continue; }
  const got = runCase(c), W = want.samples;
  // The first sample where the running digest or the fingerprint differs
  let bad = -1;
  for (let i = 0; i < Math.min(W.length, got.length) && bad < 0; i++) {
    if (W[i].tick !== got[i].tick || W[i].digest !== got[i].digest || diff(W[i].fp, got[i].fp, 1).length) bad = i;
    hashSamples++;
    if (W[i].hash === got[i].hash) hashSame++; else if (!hashFirst) hashFirst = `${c.name}, tick ${W[i].tick}`;
  }
  if (bad < 0 && W.length === got.length) { assert(true, `${c.name}: ${W.length} fingerprints match, to tick ${W[W.length - 1].tick}`); continue; }
  if (bad < 0) { assert(false, `${c.name}: the run ends at tick ${got[got.length - 1].tick}, recorded ${W[W.length - 1].tick}`); continue; }
  const from = bad ? W[bad - 1].tick : 0, d = diff(W[bad].fp, got[bad].fp);
  const why = d.length ? d.join('; ') : 'only the per-tick digest differs (a hitbox, an event, or a position between samples): step it tick by tick beside the last good commit';
  assert(false, `${c.name}: behaviour diverged after tick ${from}, by tick ${W[bad].tick}: ${why}`);
}
console.log(hashSame === hashSamples ? `state hashes: identical in all ${hashSamples} samples compared`
  : `state hashes: ${hashSame} of ${hashSamples} samples identical, first different at ${hashFirst} (information only: the state's layout changed)`);
