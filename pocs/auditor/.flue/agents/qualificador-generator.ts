import type { FlueContext } from '@flue/sdk/client';
import { generateRun, pickModeForHour } from '@/lib/synthetic-generator';
import type { SyntheticMode } from '@/lib/synthetic-modes';
import leads from '../../fixtures/leads.json';
import scenarios from '../../fixtures/scenarios.json';

export const triggers = { webhook: true };

type Env = {
  DB: D1Database;
  HMAC_SECRET: string;
  MODEL_MAIN?: string;
};

/** @description Endpoint sintético — gera N decisions no D1 conforme mode escolhido por hora UTC. */
export default async function (ctx: FlueContext<unknown, Env>): Promise<unknown> {
  const env = ctx.env;
  const now = new Date();
  const hour = now.getUTCHours();
  const mode = pickModeForHour(scenarios as Array<{ from_hour: number; to_hour: number; mode: SyntheticMode }>, hour);
  const result = await generateRun(
    env,
    leads as Parameters<typeof generateRun>[1],
    mode,
    env.MODEL_MAIN ?? 'cloudflare-workers-ai/@cf/meta/llama-4-scout-17b-16e-instruct',
    10,
  );
  return { mode, ...result };
}
