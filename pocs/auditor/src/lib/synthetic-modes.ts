export type SyntheticMode = 'baseline' | 'drift-h1' | 'drift-multi' | 'high-budget' | 'drift-flip';

export type ModeConfig = {
  ignore_h1_probability: number;
  ignore_h2_probability: number;
  out_of_scope_probability: number;
  flip_against_tier_probability: number;
  cost_multiplier: number;
  duration_multiplier: number;
};

/** @description Probabilidades por modo de drift sintético — controla taxa de ignorar heurísticos, out-of-scope e flip contra tier. */
export const MODE_CONFIGS: Record<SyntheticMode, ModeConfig> = {
  baseline: {
    ignore_h1_probability: 0,
    ignore_h2_probability: 0,
    out_of_scope_probability: 0.10,
    flip_against_tier_probability: 0,
    cost_multiplier: 1,
    duration_multiplier: 1,
  },
  'drift-h1': {
    ignore_h1_probability: 0.40,
    ignore_h2_probability: 0,
    out_of_scope_probability: 0.10,
    flip_against_tier_probability: 0,
    cost_multiplier: 1,
    duration_multiplier: 1,
  },
  'drift-multi': {
    ignore_h1_probability: 0.40,
    ignore_h2_probability: 0.40,
    out_of_scope_probability: 0.15,
    flip_against_tier_probability: 0,
    cost_multiplier: 1,
    duration_multiplier: 1,
  },
  'high-budget': {
    ignore_h1_probability: 0.10,
    ignore_h2_probability: 0,
    out_of_scope_probability: 0.10,
    flip_against_tier_probability: 0,
    cost_multiplier: 2.5,
    duration_multiplier: 2.5,
  },
  'drift-flip': {
    ignore_h1_probability: 0,
    ignore_h2_probability: 0,
    out_of_scope_probability: 0.10,
    flip_against_tier_probability: 0.20,
    cost_multiplier: 1,
    duration_multiplier: 1,
  },
};
