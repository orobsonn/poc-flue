import { fawWrite, type R2Like } from '@/lib/faw';

export type RunMetrics = {
  run_id: string;
  ts_utc: string;
  severity: 'critical' | 'warn' | 'info' | 'none';
  divergences_detected: number;
  classifications_succeeded: number;
  candidates: number;
  buckets_active: number;
  latency_ms_total: number;
  llm_calls_count: number;
  mode: 'pipeline' | 'agentic';
};

/** @description Persiste métricas do run em monitor-runs/<runId>/metrics.json no FAW pra comparação cross-stage. */
export async function recordRunMetrics(r2: R2Like, payload: Omit<RunMetrics, 'ts_utc'>): Promise<void> {
  const full: RunMetrics = { ...payload, ts_utc: new Date().toISOString() };
  await fawWrite(r2, `monitor-runs/${payload.run_id}/metrics.json`, JSON.stringify(full, null, 2));
}
