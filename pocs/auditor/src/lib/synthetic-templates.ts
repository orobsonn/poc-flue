import type { JudgmentOutcome, ObjectiveTier } from '@/schemas/decision-log';
import type { ModeConfig } from './synthetic-modes';

export type Lead = {
  id: string;
  nome_empresa: string;
  segmento: string;
  faturamento_mensal: string;
  time_vendas: 'dedicado' | 'solo' | null;
  ferramentas: 'crm' | 'planilha' | null;
  sinal: 'demo' | 'form' | 'material' | null;
  contexto_livre: string;
};

export type SimulatedDecision = {
  outcome: JudgmentOutcome;
  reasoned: string;
  out_of_scope: string | null;
  duration_ms: number;
  cost_usd: number;
};

/** @description Aplica rubrica determinística pra calcular tier objetivo do lead. */
export function applyRubrica(lead: Lead): { score: number; tier: ObjectiveTier } {
  let score = 0;
  if (['infoprodutor', 'agência de marketing', 'SaaS B2B'].includes(lead.segmento)) score += 30;
  // simplificado pra POC: assume número parsed se possível
  if (lead.faturamento_mensal.includes('k') || lead.faturamento_mensal.includes('M')) {
    const num = parseInt(lead.faturamento_mensal.replace(/\D/g, ''));
    if (num >= 50) score += 25;
  }
  if (lead.time_vendas === 'dedicado') score += 20;
  if (lead.ferramentas === 'crm') score += 15;
  if (lead.sinal === 'demo' || lead.sinal === 'form') score += 10;
  const tier: ObjectiveTier = score >= 75 ? 'A' : score >= 50 ? 'B' : 'C';
  return { score, tier };
}

/** @description Simula decisão do qualificador com drift conforme mode. */
export function simulateDecision(
  lead: Lead,
  tier: ObjectiveTier,
  mode: ModeConfig,
  random: () => number,
): SimulatedDecision {
  const isFundadorTecnico = /fundador (técnico|tech|cto)/i.test(lead.contexto_livre);
  const mencionaDor = /dor|problema espec[ií]fic/i.test(lead.contexto_livre);

  const ignoreH1 = isFundadorTecnico && random() < mode.ignore_h1_probability;
  const ignoreH2 = mencionaDor && random() < mode.ignore_h2_probability;
  const declareOoS = random() < mode.out_of_scope_probability;

  let outcome: JudgmentOutcome;
  let reasoned: string;

  if (isFundadorTecnico && !ignoreH1 && tier !== 'C') {
    outcome = 'priorizar';
    reasoned = `priorizar porque fundador técnico em fase de produto → feedback acelera roadmap (H1)`;
  } else if (mencionaDor && !ignoreH2) {
    outcome = 'priorizar';
    reasoned = `priorizar porque menciona dor específica em hipótese não validada → valor de aprendizado supera custo (H2)`;
  } else if (tier === 'A') {
    outcome = 'priorizar';
    reasoned = `priorizar porque tier objetivo A → fit estrutural alto`;
  } else if (tier === 'B') {
    outcome = 'manter';
    reasoned = `manter porque tier objetivo B → fit médio sem sinal compensatório`;
  } else {
    outcome = 'descartar';
    reasoned = `descartar porque tier objetivo C → custo de oportunidade do time supera valor`;
  }

  const out_of_scope = declareOoS
    ? 'faltou dado sobre maturidade do time pra avaliar capacidade de absorção'
    : null;

  return {
    outcome,
    reasoned,
    out_of_scope,
    duration_ms: Math.round(500 * mode.duration_multiplier * (0.8 + random() * 0.4)),
    cost_usd: 0.0001 * mode.cost_multiplier * (0.8 + random() * 0.4),
  };
}
