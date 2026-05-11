import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';

const REMOTE = process.argv.includes('--remote');
const SKILLS_ROOT = '.flue/skills';
const R2_BUCKET = 'auditor';
const R2_PREFIX = '.agents/skills';

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile() && entry.name.endsWith('.md')) yield path;
  }
}

/** @description Sincroniza .flue/skills/ pro R2 sob .agents/skills/. Use --remote pra prod, --local pra dev. */
async function main(): Promise<void> {
  const files: string[] = [];
  for await (const f of walk(SKILLS_ROOT)) files.push(f);
  console.log(`Found ${files.length} markdown files`);
  for (const file of files) {
    const rel = relative(SKILLS_ROOT, file);
    const r2Key = `${R2_PREFIX}/${rel}`;
    const args = [
      'wrangler',
      'r2',
      'object',
      'put',
      `${R2_BUCKET}/${r2Key}`,
      `--file=${file}`,
      REMOTE ? '--remote' : '--local',
    ];
    console.log(`→ ${r2Key}`);
    const result = spawnSync('npx', args, { stdio: 'inherit' });
    if (result.status !== 0) {
      throw new Error(`wrangler put failed for ${r2Key} (exit ${result.status})`);
    }
  }
  console.log('Sync done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export {};
