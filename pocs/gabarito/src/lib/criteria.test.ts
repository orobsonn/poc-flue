import { describe, it, expect } from 'vitest';
import { detectOutOfScopeGrowth, detectRegression, detectBudgetBlow } from './criteria';

describe('criteria', () => {
  it('detecta out-of-scope-growth quando aumento >=20pp', () => {
    const result = detectOutOfScopeGrowth({ current_pct: 0.45, previous_pct: 0.20 });
    expect(result.triggered).toBe(true);
    expect(result.delta_pp).toBeCloseTo(25);
  });
  it('não dispara abaixo de 20pp', () => {
    const result = detectOutOfScopeGrowth({ current_pct: 0.30, previous_pct: 0.20 });
    expect(result.triggered).toBe(false);
  });
  it('detecta regression quando contradições subiram >=30%', () => {
    const result = detectRegression({ current_rate: 0.13, baseline_rate: 0.10 });
    expect(result.triggered).toBe(true);
  });
  it('detecta budget-blow quando custo médio subiu >=50%', () => {
    const result = detectBudgetBlow({ current_avg: 0.0015, baseline_avg: 0.001 });
    expect(result.triggered).toBe(true);
  });
});
