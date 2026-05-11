import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { join, relative } from 'node:path';

const REMOTE = process.argv.includes('--remote');
const R2_BUCKET = 'auditor';

type SyncSpec = {
  /** @description Diretório local relativo à raiz do POC. */
  local: string;
  /** @description Prefixo do key no R2. */
  prefix: string;
};

const SYNC_SPECS: SyncSpec[] = [
  { local: '.flue/skills', prefix: '.agents/skills' },
  { local: 'expected-reasoning', prefix: 'expected-reasoning' },
  { local: 'agents-config', prefix: 'agents-config' },
];

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile() && entry.name.endsWith('.md')) yield path;
  }
}

/** @description Sincroniza skills + expected-reasoning + agents-config pro R2. Use --remote pra prod, omitir pra dev. */
async function main(): Promise<void> {
  let total = 0;
  for (const spec of SYNC_SPECS) {
    const files: string[] = [];
    for await (const f of walk(spec.local)) files.push(f);
    console.log(`[${spec.local}] ${files.length} arquivos`);
    for (const file of files) {
      const rel = relative(spec.local, file);
      const r2Key = `${spec.prefix}/${rel}`;
      const args = [
        'wrangler',
        'r2',
        'object',
        'put',
        `${R2_BUCKET}/${r2Key}`,
        `--file=${file}`,
        REMOTE ? '--remote' : '--local',
      ];
      console.log(`  → ${r2Key}`);
      const result = spawnSync('npx', args, { stdio: 'inherit' });
      if (result.status !== 0) {
        throw new Error(`wrangler put falhou para ${r2Key} (exit ${result.status})`);
      }
      total++;
    }
  }
  console.log(`Sync concluído (${total} objetos).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export {};
