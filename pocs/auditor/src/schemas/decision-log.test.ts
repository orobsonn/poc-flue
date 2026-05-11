import { describe, it, expect } from 'vitest';
import { DecisionLogInsertSchema, JudgmentOutcomeSchema, ObjectiveTierSchema } from './decision-log';
import * as v from 'valibot';

describe('DecisionLogInsertSchema', () => {
  it('aceita decision válida', () => {
    const valid = {
      id: 'd-1',
      ts: 1700000000000,
      agent_id: 'hash-x',
      thread_id: 'hash-y',
      domain: 'qualificador',
      phase: 'fit-estrategico',
      did: 'priorizar',
      reasoned: 'X porque Y → Z',
      out_of_scope: null,
      duration_ms: 500,
      cost_usd: 0.0001,
      model_main: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      expected_reasoning_ref: 'qualificador/fit-estrategico',
      objective_tier: 'A',
      judgment_outcome: 'priorizar',
      has_out_of_scope: 0,
    };
    expect(() => v.parse(DecisionLogInsertSchema, valid)).not.toThrow();
  });

  it('rejeita judgment_outcome inválido', () => {
    expect(() => v.parse(JudgmentOutcomeSchema, 'qualquer')).toThrow();
  });

  it('aceita os 3 tiers válidos', () => {
    expect(v.parse(ObjectiveTierSchema, 'A')).toBe('A');
    expect(v.parse(ObjectiveTierSchema, 'B')).toBe('B');
    expect(v.parse(ObjectiveTierSchema, 'C')).toBe('C');
  });
});
