export type SyntheticMode = 'baseline' | 'drift-h1' | 'drift-multi' | 'high-budget';

export type ModeConfig = {
  ignore_h1_probability: number;
  ignore_h2_probability: number;
  out_of_scope_probability: number;
  cost_multiplier: number;
  duration_multiplier: number;
};

/** @description Probabilidades por modo de drift sintético — controla taxa de ignorar heurísticos e out-of-scope. */
export const MODE_CONFIGS: Record<SyntheticMode, ModeConfig> = {
  baseline: {
    ignore_h1_probability: 0,
    ignore_h2_probability: 0,
    out_of_scope_probability: 0.10,
    cost_multiplier: 1,
    duration_multiplier: 1,
  },
  'drift-h1': {
    ignore_h1_probability: 0.40,
    ignore_h2_probability: 0,
    out_of_scope_probability: 0.10,
    cost_multiplier: 1,
    duration_multiplier: 1,
  },
  'drift-multi': {
    ignore_h1_probability: 0.40,
    ignore_h2_probability: 0.40,
    out_of_scope_probability: 0.15,
    cost_multiplier: 1,
    duration_multiplier: 1,
  },
  'high-budget': {
    ignore_h1_probability: 0.10,
    ignore_h2_probability: 0,
    out_of_scope_probability: 0.10,
    cost_multiplier: 2.5,
    duration_multiplier: 2.5,
  },
};
