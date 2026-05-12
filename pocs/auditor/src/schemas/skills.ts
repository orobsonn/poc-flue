import * as v from 'valibot';
import { JudgmentOutcomeSchema, ObjectiveTierSchema } from './decision-log';

/** @description Snapshot do lead persistido na tabela `lead`, usado pela skill detect-divergences pra checar pré-condições dos heurísticos. */
export const LeadSnapshotSchema = v.object({
  id: v.string(),
  segmento: v.nullable(v.string()),
  faturamento_band: v.nullable(v.string()),
  time_vendas: v.nullable(v.string()),
  ferramentas: v.nullable(v.string()),
  sinal: v.nullable(v.string()),
  fundador_tecnico: v.picklist([0, 1]),
  menciona_dor: v.picklist([0, 1]),
  contexto_livre_sanitized: v.nullable(v.string()),
});
export type LeadSnapshot = v.InferOutput<typeof LeadSnapshotSchema>;

/** @description Schema de output da skill detect-divergences. */
export const DetectDivergencesOutputSchema = v.object({
  divergences: v.array(v.object({
    heuristic_ignored: v.string(),
    evidence: v.string(),
    severity: v.picklist(['low', 'med', 'high']),
  })),
});
export type DetectDivergencesOutput = v.InferOutput<typeof DetectDivergencesOutputSchema>;

/** @description 4 alvos modificáveis pelos PRs do monitor. */
export const TargetSchema = v.picklist([
  'prompt-issue',
  'gabarito-stale',
  'criterio-faltando',
  'contexto-mudou',
]);
export type Target = v.InferOutput<typeof TargetSchema>;

/** @description Schema de output da skill classify-origin. */
export const ClassifyOriginOutputSchema = v.object({
  target: v.union([TargetSchema, v.literal('inconclusive')]),
  rationale: v.string(),
});
export type ClassifyOriginOutput = v.InferOutput<typeof ClassifyOriginOutputSchema>;

/** @description Schema de output da skill suggest-adjustment. */
export const SuggestAdjustmentOutputSchema = v.object({
  target_file: v.string(),
  proposed_change: v.string(),
  rationale: v.string(),
});
export type SuggestAdjustmentOutput = v.InferOutput<typeof SuggestAdjustmentOutputSchema>;

/** @description Schema de output da skill summarize-patterns. */
export const SummarizePatternsOutputSchema = v.object({
  patterns: v.array(v.object({
    type: v.picklist(['mechanism-divergence', 'gabarito-stale', 'criterio-faltando', 'contexto-mudou']),
    description: v.string(),
    affected_buckets: v.array(v.string()),
    inferred_decisions: v.number(),
    confidence: v.picklist(['high', 'med', 'low']),
    promotion_recommendation: v.picklist(['finding', 'wait', 'discard']),
  })),
  cross_bucket_signal: v.nullable(v.string()),
});
export type SummarizePatternsOutput = v.InferOutput<typeof SummarizePatternsOutputSchema>;

/** @description Schema de output do auditor-agentic — agrega divergências, classificações e padrões num único output do loop agêntico. */
export const AgenticAuditOutputSchema = v.object({
  divergences: v.array(v.object({
    decision_id: v.string(),
    bucket_key: v.string(),
    heuristic_ignored: v.string(),
    evidence: v.string(),
    severity: v.picklist(['low', 'med', 'high']),
  })),
  classifications: v.array(v.object({
    decision_id: v.string(),
    heuristic_ignored: v.string(),
    target: v.union([TargetSchema, v.literal('inconclusive')]),
    rationale: v.string(),
    proposed_change: v.nullable(v.string()),
    target_file: v.nullable(v.string()),
    suggestion_rationale: v.nullable(v.string()),
  })),
  patterns: v.array(v.object({
    type: v.picklist(['mechanism-divergence', 'gabarito-stale', 'criterio-faltando', 'contexto-mudou']),
    description: v.string(),
    affected_buckets: v.array(v.string()),
    inferred_decisions: v.number(),
    confidence: v.picklist(['high', 'med', 'low']),
    promotion_recommendation: v.picklist(['finding', 'wait', 'discard']),
  })),
  cross_bucket_signal: v.nullable(v.string()),
});
export type AgenticAuditOutput = v.InferOutput<typeof AgenticAuditOutputSchema>;

/** @description Schema de output da skill qualificar-lead (qualificador hipotético). */
export const QualificarLeadOutputSchema = v.object({
  outcome: JudgmentOutcomeSchema,
  reasoned: v.string(),
  out_of_scope: v.nullable(v.string()),
  objective_tier: ObjectiveTierSchema,
});
export type QualificarLeadOutput = v.InferOutput<typeof QualificarLeadOutputSchema>;
