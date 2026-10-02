// Prepares game/ for publishing as a claude.ai artifact:  node tools/publish-prep.mjs <out-dir>
// The artifact host wraps the page in its own document, so index.html loses its doctype, <html>, <head>, <body>
// and <meta> tags (everything else stays: the title, the stylesheet, the import map, the scripts). The js/ tree
// is copied as is. Prints the Artifact publish arguments: file_path, root and the files map.
// <out-dir> must sit under the session's working directory or its scratchpad, or the Artifact tool refuses it.
// Publish again from the same out-dir and file_path to update the same link.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.resolve(process.argv[2] || '');
if (!process.argv[2]) { console.log('usage: node tools/publish-prep.mjs <out-dir>'); process.exit(1); }
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
fs.cpSync(path.join(ROOT, 'game/js'), path.join(outDir, 'js'), { recursive: true });
const html = fs.readFileSync(path.join(ROOT, 'game/index.html'), 'utf8')
  .split('\n')
  .filter(l => !/^\s*(<!doctype html>|<\/?html[^>]*>|<\/?head>|<\/?body[^>]*>|<meta [^>]*>)\s*$/i.test(l))
  .join('\n');
fs.writeFileSync(path.join(outDir, 'index.html'), html);
const files = {};
(function walk(dir) {
  for (const f of fs.readdirSync(dir).sort()) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else { const rel = path.relative(outDir, p); files[rel] = rel; }
  }
})(path.join(outDir, 'js'));
console.log(JSON.stringify({ file_path: path.join(outDir, 'index.html'), root: outDir, files }, null, 1));
