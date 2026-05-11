import { Bash, InMemoryFs } from 'just-bash';
import type { BashFactory, BashLike } from '@flue/sdk/client';
import { fawList, fawRead, type R2Like } from './faw';

const SKILLS_PREFIX = '.agents/skills/';
const SANDBOX_CWD = '/workspace';

/** @description Lê todos os arquivos de skill do R2 sob `.agents/skills/` e devolve um BashFactory com InMemoryFs pré-populado em /workspace. Flue descobre skills a partir do cwd da session — montamos esses arquivos em memória pra cada request. */
export async function buildSkillsSandbox(r2: R2Like): Promise<BashFactory> {
  const keys = await fawList(r2, SKILLS_PREFIX);
  const initialFiles: Record<string, string> = {};
  await Promise.all(
    keys.map(async (key) => {
      const content = await fawRead(r2, key);
      if (content === null) return;
      initialFiles[`${SANDBOX_CWD}/${key}`] = content;
    }),
  );
  return (): BashLike => {
    const fs = new InMemoryFs(initialFiles);
    return new Bash({
      fs,
      cwd: SANDBOX_CWD,
      network: { dangerouslyAllowFullInternetAccess: true },
    }) as unknown as BashLike;
  };
}
