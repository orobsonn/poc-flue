import * as v from 'valibot';

/** @description Tier objetivo derivado da rubrica ICP determinística. */
export const ObjectiveTierSchema = v.picklist(['A', 'B', 'C']);
export type ObjectiveTier = v.InferOutput<typeof ObjectiveTierSchema>;

/** @description Outcome do eixo de julgamento P3. */
export const JudgmentOutcomeSchema = v.picklist(['priorizar', 'manter', 'descartar']);
export type JudgmentOutcome = v.InferOutput<typeof JudgmentOutcomeSchema>;

/** @description Schema de insert em decision_log — campos pseudonimizados, sem PII. */
export const DecisionLogInsertSchema = v.object({
  id: v.string(),
  ts: v.number(),
  agent_id: v.string(),
  thread_id: v.string(),
  domain: v.string(),
  phase: v.nullable(v.string()),
  did: v.string(),
  reasoned: v.string(),
  out_of_scope: v.nullable(v.string()),
  tools_called: v.optional(v.string()),
  duration_ms: v.number(),
  cost_usd: v.number(),
  model_main: v.string(),
  expected_reasoning_ref: v.nullable(v.string()),
  outcome: v.optional(v.nullable(v.string())),
  outcome_source: v.optional(v.nullable(v.string())),
  objective_tier: ObjectiveTierSchema,
  judgment_outcome: JudgmentOutcomeSchema,
  has_out_of_scope: v.picklist([0, 1]),
});
export type DecisionLogInsert = v.InferOutput<typeof DecisionLogInsertSchema>;
