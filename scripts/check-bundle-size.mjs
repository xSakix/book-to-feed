#!/usr/bin/env node
/**
 * Bundle budget check (#10).
 *
 * The app has to load over mobile data before anyone can read anything, so the
 * shell size is a product constraint rather than a nice-to-have. This fails the
 * build when the gzipped total crosses the budget; raising the budget is a
 * deliberate, reviewable act.
 */
import { gzipSync } from 'node:zlib';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

const DIST = 'dist';
const BUDGETS_KB = {
  js: 320,
  css: 60,
};

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    }),
  );
  return files.flat();
}

const kb = (bytes) => bytes / 1024;
const fmt = (bytes) => `${kb(bytes).toFixed(1)} kB`;

try {
  await stat(DIST);
} catch {
  console.error(`No ${DIST}/ directory — run \`npm run build\` first.`);
  process.exit(1);
}

const files = await walk(DIST);
const totals = { js: 0, css: 0 };
const rows = [];

for (const file of files) {
  const ext = file.endsWith('.js') ? 'js' : file.endsWith('.css') ? 'css' : null;
  if (!ext) continue;

  const gzipped = gzipSync(await readFile(file)).length;
  totals[ext] += gzipped;
  rows.push({ file, gzipped });
}

rows.sort((a, b) => b.gzipped - a.gzipped);
console.log('\nGzipped bundle contents:\n');
for (const { file, gzipped } of rows) {
  console.log(`  ${fmt(gzipped).padStart(10)}  ${file}`);
}

let failed = false;
console.log('\nBudgets:\n');
for (const [ext, budget] of Object.entries(BUDGETS_KB)) {
  const used = kb(totals[ext]);
  const status = used > budget ? 'OVER' : 'ok';
  if (used > budget) failed = true;
  console.log(
    `  ${ext.toUpperCase().padEnd(4)} ${used.toFixed(1).padStart(7)} kB / ${budget} kB  ${status}`,
  );
}
console.log('');

if (failed) {
  console.error('Bundle budget exceeded. Either trim the bundle or raise the budget on purpose.');
  process.exit(1);
}
