import * as v from 'valibot';
import { DecisionLogInsertSchema } from '@/schemas/decision-log';
import { sanitizePII } from '@/schemas/pii';
import { defendPII } from './pii';
import { pseudonymize } from './hmac';
import { MODE_CONFIGS, type SyntheticMode } from './synthetic-modes';
import { applyRubrica, faturamentoToBand, simulateDecision, type Lead } from './synthetic-templates';

export type GeneratorEnv = {
  DB: D1Database;
  HMAC_SECRET: string;
};

const FUNDADOR_TECNICO_RE = /fundador (técnico|tech|cto)/i;
const MENCIONA_DOR_RE = /dor|problema espec[ií]fic/i;

/** @description Gera N decisions sintéticas no modo dado e insere em D1. */
export async function generateRun(
  env: GeneratorEnv,
  leads: Lead[],
  mode: SyntheticMode,
  modelLabel: string,
  count = 10,
): Promise<{ inserted: number; rejected: number }> {
  const config = MODE_CONFIGS[mode];
  let inserted = 0;
  let rejected = 0;
  const random = () => Math.random();

  for (let i = 0; i < count; i++) {
    const lead = leads[Math.floor(random() * leads.length)];
    if (!lead) continue;
    const { tier } = applyRubrica(lead);
    const decision = simulateDecision(lead, tier, config, random);

    const agentId = await pseudonymize('qualificador', env.HMAC_SECRET);
    const threadId = await pseudonymize(`run-${Date.now()}-${i}`, env.HMAC_SECRET);

    const fundadorTecnico = FUNDADOR_TECNICO_RE.test(lead.contexto_livre) ? 1 : 0;
    const mencionaDor = MENCIONA_DOR_RE.test(lead.contexto_livre) ? 1 : 0;
    const contextoSanitized = sanitizePII(lead.contexto_livre);
    const faturamentoBand = faturamentoToBand(lead.faturamento_mensal);

    await env.DB.prepare(
      `INSERT OR IGNORE INTO lead (
        id, segmento, faturamento_band, time_vendas, ferramentas, sinal,
        fundador_tecnico, menciona_dor, contexto_livre_sanitized
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        lead.id, lead.segmento, faturamentoBand, lead.time_vendas, lead.ferramentas,
        lead.sinal, fundadorTecnico, mencionaDor, contextoSanitized,
      )
      .run();

    const candidate = {
      id: `d-${Date.now()}-${i}`,
      ts: Date.now(),
      agent_id: agentId,
      thread_id: threadId,
      domain: 'qualificador',
      phase: 'fit-estrategico',
      did: decision.outcome,
      reasoned: decision.reasoned,
      out_of_scope: decision.out_of_scope,
      duration_ms: decision.duration_ms,
      cost_usd: decision.cost_usd,
      model_main: modelLabel,
      expected_reasoning_ref: 'qualificador/fit-estrategico',
      objective_tier: tier,
      judgment_outcome: decision.outcome,
      has_out_of_scope: (decision.out_of_scope ? 1 : 0) as 0 | 1,
      lead_id: lead.id,
    } as const;

    const piiResult = defendPII(candidate, ['reasoned', 'out_of_scope']);
    if (!piiResult.ok) {
      await env.DB.prepare(
        'INSERT INTO decision_log_rejected (id, ts, reason, rejected_by_layer) VALUES (?, ?, ?, ?)',
      )
        .bind(candidate.id, candidate.ts, piiResult.reason, piiResult.layer)
        .run();
      rejected++;
      continue;
    }

    try {
      const validated = v.parse(DecisionLogInsertSchema, piiResult.sanitized);
      await env.DB.prepare(
        `INSERT INTO decision_log (
          id, ts, agent_id, thread_id, domain, phase, did, reasoned, out_of_scope,
          duration_ms, cost_usd, model_main, expected_reasoning_ref,
          objective_tier, judgment_outcome, has_out_of_scope, lead_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          validated.id, validated.ts, validated.agent_id, validated.thread_id,
          validated.domain, validated.phase, validated.did, validated.reasoned,
          validated.out_of_scope, validated.duration_ms, validated.cost_usd,
          validated.model_main, validated.expected_reasoning_ref,
          validated.objective_tier, validated.judgment_outcome, validated.has_out_of_scope,
          validated.lead_id,
        )
        .run();
      inserted++;
    } catch {
      rejected++;
    }
  }

  return { inserted, rejected };
}

/** @description Escolhe mode baseado na hora UTC + scenarios. */
export function pickModeForHour(scenarios: Array<{ from_hour: number; to_hour: number; mode: SyntheticMode }>, hour: number): SyntheticMode {
  for (const s of scenarios) {
    if (hour >= s.from_hour && hour < s.to_hour) return s.mode;
  }
  return 'baseline';
}
