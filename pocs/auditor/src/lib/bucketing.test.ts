import { describe, it, expect } from 'vitest';
import { computeBucketKey, isBucketTranquilo, pickRepresentatives } from './bucketing';

describe('bucketing', () => {
  it('computa bucket_key consistente', () => {
    expect(computeBucketKey('priorizar', 'A', 1)).toBe('priorizar/A/1');
    expect(computeBucketKey('descartar', 'C', 0)).toBe('descartar/C/0');
  });

  it('identifica buckets tranquilos (esperados)', () => {
    expect(isBucketTranquilo('priorizar', 'A', 0)).toBe(true);
    expect(isBucketTranquilo('manter', 'B', 0)).toBe(true);
    expect(isBucketTranquilo('descartar', 'C', 0)).toBe(true);
  });

  it('identifica buckets suspeitos', () => {
    expect(isBucketTranquilo('descartar', 'A', 1)).toBe(false);
    expect(isBucketTranquilo('priorizar', 'A', 1)).toBe(false);
    expect(isBucketTranquilo('manter', 'A', 0)).toBe(false);
  });

  it('escolhe K representantes aleatórios', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const reps = pickRepresentatives(items, 3, 42);
    expect(reps).toHaveLength(3);
    expect(new Set(reps).size).toBe(3);
  });

  it('retorna todos quando bucket menor que K', () => {
    const items = ['a', 'b'];
    const reps = pickRepresentatives(items, 3, 42);
    expect(reps).toHaveLength(2);
  });
});
