export type FindingStatus = 'active' | 'resolved' | 'stale';

export type ResolutionInput = {
  current_status: FindingStatus;
  windows_silent: number;
  detected_at_ms: number;
  pattern_seen_in_current_window: boolean;
};

export type ResolutionConfig = {
  silentToResolve: number;
  daysToStale: number;
};

/** @description Transição de status conforme §6.7 do spec. */
export function computeNextStatus(
  input: ResolutionInput,
  config: ResolutionConfig,
): { status: FindingStatus; windows_silent: number } {
  if (input.current_status !== 'active') {
    return { status: input.current_status, windows_silent: input.windows_silent };
  }
  if (input.pattern_seen_in_current_window) {
    const ageDays = (Date.now() - input.detected_at_ms) / 86400_000;
    if (ageDays >= config.daysToStale) {
      return { status: 'stale', windows_silent: 0 };
    }
    return { status: 'active', windows_silent: 0 };
  }
  const nextSilent = input.windows_silent + 1;
  if (nextSilent >= config.silentToResolve) {
    return { status: 'resolved', windows_silent: nextSilent };
  }
  return { status: 'active', windows_silent: nextSilent };
}
