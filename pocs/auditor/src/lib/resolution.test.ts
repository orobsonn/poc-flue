import { describe, it, expect } from 'vitest';
import { computeNextStatus } from './resolution';

describe('computeNextStatus', () => {
  it('mantém active quando padrão ainda aparece', () => {
    expect(computeNextStatus({
      current_status: 'active',
      windows_silent: 0,
      detected_at_ms: Date.now() - 1000,
      pattern_seen_in_current_window: true,
    }, { silentToResolve: 2, daysToStale: 30 })).toEqual({ status: 'active', windows_silent: 0 });
  });

  it('resolve após 2 janelas silent', () => {
    const result = computeNextStatus({
      current_status: 'active',
      windows_silent: 1,
      detected_at_ms: Date.now() - 86400_000,
      pattern_seen_in_current_window: false,
    }, { silentToResolve: 2, daysToStale: 30 });
    expect(result.status).toBe('resolved');
  });

  it('marca stale após 30 dias active sem mudança', () => {
    const result = computeNextStatus({
      current_status: 'active',
      windows_silent: 0,
      detected_at_ms: Date.now() - 31 * 86400_000,
      pattern_seen_in_current_window: true,
    }, { silentToResolve: 2, daysToStale: 30 });
    expect(result.status).toBe('stale');
  });
});
