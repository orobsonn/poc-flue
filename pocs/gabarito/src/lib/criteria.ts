const OUT_OF_SCOPE_GROWTH_THRESHOLD_PP = 20;
const REGRESSION_THRESHOLD_PCT = 0.30;
const BUDGET_BLOW_THRESHOLD_PCT = 0.50;

export type CriteriaResult = {
  triggered: boolean;
  delta_pp?: number;
  delta_pct?: number;
};

/** @description Critério #2 — crescimento de % out_of_scope vs janela anterior. */
export function detectOutOfScopeGrowth(input: {
  current_pct: number;
  previous_pct: number;
}): CriteriaResult {
  const delta_pp = (input.current_pct - input.previous_pct) * 100;
  return { triggered: delta_pp >= OUT_OF_SCOPE_GROWTH_THRESHOLD_PP, delta_pp };
}

/** @description Critério #3 — frequência de contradição obj↔julg vs baseline. */
export function detectRegression(input: {
  current_rate: number;
  baseline_rate: number;
}): CriteriaResult {
  if (input.baseline_rate === 0) return { triggered: false, delta_pct: 0 };
  const delta_pct = (input.current_rate - input.baseline_rate) / input.baseline_rate;
  return { triggered: delta_pct >= REGRESSION_THRESHOLD_PCT, delta_pct };
}

/** @description Critério #4 — custo/duração médios vs baseline. */
export function detectBudgetBlow(input: {
  current_avg: number;
  baseline_avg: number;
}): CriteriaResult {
  if (input.baseline_avg === 0) return { triggered: false, delta_pct: 0 };
  const delta_pct = (input.current_avg - input.baseline_avg) / input.baseline_avg;
  return { triggered: delta_pct >= BUDGET_BLOW_THRESHOLD_PCT, delta_pct };
}
