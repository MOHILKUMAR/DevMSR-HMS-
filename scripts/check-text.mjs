import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

const files = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .filter((f) => /\.(ts|tsx|js|mjs|cjs|css|json|md|prisma|sql|html|yml|yaml)$/.test(f));

const forbidden = /[\u2013\u2014]/;
let failed = false;

for (const file of files) {
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    if (forbidden.test(line)) {
      console.error(`${file}:${i + 1}: em dash or en dash found`);
      failed = true;
    }
  });
}

process.exit(failed ? 1 : 0);
