import { readdir, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
const files = (await readdir(root)).filter((name) => name.endsWith('.js'));
const testFiles = ['tests/firestore.rules.test.mjs', 'tests/auth-contract.test.mjs'];
const targets = [...files.map((name) => join(root, name)), ...testFiles.map((name) => join(root, name))];
let failures = 0;
for (const file of targets) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failures++;
    process.stderr.write(`FAIL ${file}\n${result.stderr || result.stdout}`);
  }
}
console.log(`Syntax check: ${targets.length - failures}/${targets.length} files passed.`);
if (failures) process.exitCode = 1;
