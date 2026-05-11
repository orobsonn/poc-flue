import { describe, it, expect } from 'vitest';
import { shouldPromoteToFinding } from './promotion';

describe('shouldPromoteToFinding', () => {
  it('promove quando >=3 buckets distintos com mesmo heurístico', () => {
    expect(shouldPromoteToFinding({
      distinct_buckets_count: 3,
      max_bucket_size: 10,
      confidence: 'med',
    })).toBe(true);
  });

  it('promove quando 1 bucket grande com confidence high', () => {
    expect(shouldPromoteToFinding({
      distinct_buckets_count: 1,
      max_bucket_size: 25,
      confidence: 'high',
    })).toBe(true);
  });

  it('não promove quando bucket grande mas confidence low', () => {
    expect(shouldPromoteToFinding({
      distinct_buckets_count: 1,
      max_bucket_size: 30,
      confidence: 'low',
    })).toBe(false);
  });

  it('não promove quando 2 buckets e bucket pequeno', () => {
    expect(shouldPromoteToFinding({
      distinct_buckets_count: 2,
      max_bucket_size: 15,
      confidence: 'high',
    })).toBe(false);
  });
});
