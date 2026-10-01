// Runs every headless simulation suite in this folder with Node and prints a total.
// Exit code 1 if any check fails or a suite crashes.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const suites = readdirSync(here).filter(f => f.endsWith('.mjs') && f !== 'run-all.mjs').sort();
let pass = 0, fail = 0;
for (const f of suites) {
  const r = spawnSync(process.execPath, [join(here, f)], { encoding: 'utf8' });
  const out = (r.stdout || '') + (r.stderr || '');
  const p = (out.match(/^PASS /gm) || []).length, x = (out.match(/^FAIL /gm) || []).length;
  const crashed = r.status !== 0 && x === 0;
  pass += p; fail += x + (crashed ? 1 : 0);
  console.log(`${r.status === 0 ? 'ok  ' : 'FAIL'} ${f}: ${p} passed${x ? `, ${x} failed` : ''}${crashed ? ' (crashed)' : ''}`);
  if (r.status !== 0) console.log(out.split('\n').filter(l => /^FAIL|Error/.test(l)).slice(0, 10).join('\n'));
}
console.log(`\n${pass} checks passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
