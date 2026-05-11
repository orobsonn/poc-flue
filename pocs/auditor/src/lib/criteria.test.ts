import { describe, it, expect } from 'vitest';
import { detectOutOfScopeGrowth, detectRegression, detectBudgetBlow } from './criteria';

describe('criteria', () => {
  it('detecta out-of-scope-growth quando aumento >=10pp', () => {
    const result = detectOutOfScopeGrowth({ current_pct: 0.32, previous_pct: 0.20 });
    expect(result.triggered).toBe(true);
    expect(result.delta_pp).toBeCloseTo(12);
  });
  it('não dispara out-of-scope-growth abaixo de 10pp', () => {
    const result = detectOutOfScopeGrowth({ current_pct: 0.29, previous_pct: 0.20 });
    expect(result.triggered).toBe(false);
  });
  it('detecta regression quando contradições subiram >=15%', () => {
    const result = detectRegression({ current_rate: 0.12, baseline_rate: 0.10 });
    expect(result.triggered).toBe(true);
  });
  it('não dispara regression abaixo de 15%', () => {
    const result = detectRegression({ current_rate: 0.11, baseline_rate: 0.10 });
    expect(result.triggered).toBe(false);
  });
  it('detecta budget-blow quando custo médio subiu >=25%', () => {
    const result = detectBudgetBlow({ current_avg: 0.00125, baseline_avg: 0.001 });
    expect(result.triggered).toBe(true);
  });
  it('não dispara budget-blow abaixo de 25%', () => {
    const result = detectBudgetBlow({ current_avg: 0.0012, baseline_avg: 0.001 });
    expect(result.triggered).toBe(false);
  });
});
