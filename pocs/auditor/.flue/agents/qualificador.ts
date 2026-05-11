import type { FlueContext } from '@flue/sdk/client';
import { QualificarLeadOutputSchema } from '@/schemas/skills';
import { applyRubrica, type Lead } from '@/lib/synthetic-templates';
import { fawRead } from '@/lib/faw';

export const triggers = { webhook: true };

type Env = {
  AUDITOR_R2: R2Bucket;
  MODEL_MAIN?: string;
};

/** @description Agente qualificador — instanciado, não disparado no loop POC. Aplica rubrica ICP + skill qualificar-lead. */
export default async function (ctx: FlueContext<unknown, Env>): Promise<unknown> {
  const lead = (ctx.payload ?? {}) as Lead;
  if (!lead.id) {
    return { error: 'lead inválido — id ausente' };
  }

  const { tier } = applyRubrica(lead);

  const harness = await ctx.init({
    model: ctx.env.MODEL_MAIN ?? 'cloudflare-workers-ai/@cf/meta/llama-4-scout-17b-16e-instruct',
    role: 'qualificador-sdr',
  });
  const session = await harness.session();

  const gabarito = (await fawRead(ctx.env.AUDITOR_R2, 'expected-reasoning/qualificador/fit-estrategico.md')) ?? '';

  const data = await session.skill('qualificar-lead', {
    args: { lead, objective_tier: tier, gabarito },
    result: QualificarLeadOutputSchema,
  });

  return data;
}
