// Run: node check-syntax.mjs  — syntax-checks every .js module in this folder.
import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { copyFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';

const root = new URL('./', import.meta.url).pathname;
const tmp = mkdtempSync(join(tmpdir(), '8cm-'));
const files = (await readdir(root)).filter((n) => n.endsWith('.js'));
let failures = 0;
for (const name of files) {
  const copy = join(tmp, name.replace(/\.js$/, '.mjs'));   // .js files are ES modules; check them as such
  copyFileSync(join(root, name), copy);
  const r = spawnSync(process.execPath, ['--check', copy], { encoding: 'utf8' });
  if (r.status !== 0) { failures++; process.stderr.write(`FAIL ${name}\n${r.stderr || r.stdout}`); }
}
console.log(`Syntax check: ${files.length - failures}/${files.length} files passed.`);
if (failures) process.exitCode = 1;
