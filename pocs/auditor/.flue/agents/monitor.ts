import type { FlueContext } from '@flue/sdk/client';
import * as v from 'valibot';
import {
  DetectDivergencesOutputSchema,
  ClassifyOriginOutputSchema,
  SuggestAdjustmentOutputSchema,
  SummarizePatternsOutputSchema,
} from '@/schemas/skills';
import { computeBucketKey, isBucketTranquilo, pickRepresentatives } from '@/lib/bucketing';
import {
  detectOutOfScopeGrowth,
  detectRegression,
  detectBudgetBlow,
} from '@/lib/criteria';
import { fawRead, fawWrite } from '@/lib/faw';
import { createPR } from '@/lib/github';
import { sendTelegramAlert } from '@/lib/telegram';
import { shouldPromoteToFinding } from '@/lib/promotion';
import { pseudonymize } from '@/lib/hmac';

export const triggers = { webhook: true };

type Env = {
  DB: D1Database;
  AUDITOR_R2: R2Bucket;
  HMAC_SECRET: string;
  GITHUB_PAT: string;
  GITHUB_REPO: string;
  GITHUB_DEFAULT_BRANCH: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  CLOUDFLARE_ACCOUNT_ID: string;
  CLOUDFLARE_AI_GATEWAY_ID: string;
  CLOUDFLARE_AI_GATEWAY_TOKEN: string;
  CLOUDFLARE_API_TOKEN: string;
  MODEL_MAIN?: string;
  JANELA_HORAS: string;
  BUCKET_K_REPRESENTATIVES: string;
  SAMPLE_MIN_PER_BUCKET: string;
};

type Candidate = {
  id: string;
  did: string;
  reasoned: string;
  out_of_scope: string | null;
  objective_tier: 'A' | 'B' | 'C';
  judgment_outcome: 'priorizar' | 'manter' | 'descartar';
  has_out_of_scope: 0 | 1;
  cost_usd: number;
  duration_ms: number;
};

export default async function (ctx: FlueContext<unknown, Env>): Promise<unknown> {
  const env = ctx.env;
  const agentId = await pseudonymize('qualificador', env.HMAC_SECRET);
  const runId = `${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;
  const janelaMs = parseInt(env.JANELA_HORAS) * 3600_000;
  const k = parseInt(env.BUCKET_K_REPRESENTATIVES);
  const minSample = parseInt(env.SAMPLE_MIN_PER_BUCKET);

  // 1. checkpoint
  const lastTsRow = await env.DB
    .prepare('SELECT last_processed_ts FROM audit_run WHERE agent_id = ?')
    .bind(agentId)
    .first<{ last_processed_ts: number }>();
  const fromTs = lastTsRow?.last_processed_ts ?? Date.now() - janelaMs;
  const toTs = Date.now();

  // 2. candidates: out_of_scope OR contradição obj↔julg
  const candidates = await env.DB
    .prepare(
      `SELECT id, did, reasoned, out_of_scope, objective_tier, judgment_outcome, has_out_of_scope, cost_usd, duration_ms
       FROM decision_log
       WHERE agent_id = ? AND ts > ? AND ts <= ?
         AND (
           has_out_of_scope = 1
           OR (judgment_outcome = 'descartar' AND objective_tier = 'A')
           OR (judgment_outcome = 'priorizar' AND objective_tier = 'C')
         )`,
    )
    .bind(agentId, fromTs, toTs)
    .all<Candidate>();

  if (!candidates.results || candidates.results.length === 0) {
    await updateCheckpoint(env, agentId, toTs);
    return { run_id: runId, status: 'no-candidates' };
  }

  // 3. bucketing
  const buckets = new Map<string, Candidate[]>();
  for (const c of candidates.results) {
    if (isBucketTranquilo(c.judgment_outcome, c.objective_tier, c.has_out_of_scope)) continue;
    const key = computeBucketKey(c.judgment_outcome, c.objective_tier, c.has_out_of_scope);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(c);
  }

  const bucketEntries = [...buckets.entries()].filter(([, items]) => items.length >= minSample);

  if (bucketEntries.length === 0) {
    await updateCheckpoint(env, agentId, toTs);
    return { run_id: runId, status: 'no-suspicious-buckets' };
  }

  // 4. critérios SQL
  const sqlCriteria = await runSqlCriteria(env, agentId, fromTs, toTs);

  // 5. setup Flue session (Cenário C — AI Gateway)
  const harness = await ctx.init({
    model: env.MODEL_MAIN ?? 'cloudflare-workers-ai/@cf/meta/llama-4-scout-17b-16e-instruct',
    providers: {
      'cloudflare-workers-ai': {
        baseUrl: `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.CLOUDFLARE_AI_GATEWAY_ID}/workers-ai/v1`,
        apiKey: env.CLOUDFLARE_API_TOKEN,
        headers: { 'cf-aig-authorization': `Bearer ${env.CLOUDFLARE_AI_GATEWAY_TOKEN}` },
      },
    },
    role: 'auditor-monitor',
  });
  const session = await harness.session();

  // 6. carrega gabarito + active findings
  const gabarito = (await fawRead(env.AUDITOR_R2, 'expected-reasoning/qualificador/fit-estrategico.md')) ?? '';
  // active_findings simplificado pra POC — pra MVP, array vazio
  const activeFindings: unknown[] = [];

  // 7. detect-divergences nos representantes (paralelo)
  const allDivergences: Array<{
    decision_id: string;
    heuristic_ignored: string;
    evidence: string;
    severity: 'low' | 'med' | 'high';
    bucket_key: string;
    bucket_size: number;
    representatives_audited: number;
  }> = [];

  await Promise.all(
    bucketEntries.map(async ([bucketKey, items]) => {
      const reps = pickRepresentatives(items, k, hashSeed(runId + bucketKey));
      const detections = await Promise.all(
        reps.map(async (rep) => {
          try {
            const data = await session.skill('monitor/detect-divergences', {
              args: { decision: rep, gabarito, active_findings: activeFindings },
              result: DetectDivergencesOutputSchema,
            });
            return { rep, data };
          } catch (err) {
            console.error(JSON.stringify({ op: 'detect-divergences', err: err instanceof Error ? err.message : String(err), rep_id: rep.id }));
            return null;
          }
        }),
      );
      for (const det of detections) {
        if (!det) continue;
        for (const div of det.data.divergences) {
          allDivergences.push({
            decision_id: det.rep.id,
            heuristic_ignored: div.heuristic_ignored,
            evidence: div.evidence,
            severity: div.severity,
            bucket_key: bucketKey,
            bucket_size: items.length,
            representatives_audited: reps.length,
          });
        }
      }
    }),
  );

  // 8. dedup por (heuristic_ignored, bucket_key)
  const dedupMap = new Map<string, typeof allDivergences[number]>();
  for (const d of allDivergences) {
    const dedupKey = `${d.heuristic_ignored}|${d.bucket_key}`;
    if (!dedupMap.has(dedupKey)) dedupMap.set(dedupKey, d);
  }
  const uniqueDivergences = [...dedupMap.values()];

  // 9. classify-origin + suggest-adjustment (paralelo)
  const classifications = await Promise.all(
    uniqueDivergences.map(async (div) => {
      try {
        const origin = await session.skill('monitor/classify-origin', {
          args: { divergencia: div, gabarito },
          result: ClassifyOriginOutputSchema,
        });
        if (origin.target === 'inconclusive') return { div, origin, suggestion: null };
        const targetFile = targetToFile(origin.target);
        const currentContent = (await fawRead(env.AUDITOR_R2, targetFile)) ?? '';
        const suggestion = await session.skill('monitor/suggest-adjustment', {
          args: { divergencia: { ...div, target: origin.target }, current_content: currentContent },
          result: SuggestAdjustmentOutputSchema,
        });
        return { div, origin, suggestion };
      } catch (err) {
        console.error(JSON.stringify({ op: 'classify+suggest', err: err instanceof Error ? err.message : String(err), bucket_key: div.bucket_key, heuristic: div.heuristic_ignored }));
        return null;
      }
    }),
  );

  // 10. summarize-patterns (1 chamada)
  let patterns: v.InferOutput<typeof SummarizePatternsOutputSchema> = { patterns: [], cross_bucket_signal: null };
  if (uniqueDivergences.length > 0) {
    try {
      patterns = await session.skill('monitor/summarize-patterns', {
        args: { divergences: uniqueDivergences, active_findings: activeFindings },
        result: SummarizePatternsOutputSchema,
      });
    } catch (err) {
      console.error(JSON.stringify({ op: 'summarize-patterns', err: err instanceof Error ? err.message : String(err) }));
    }
  }

  // 11. determinar severidade e gerar artefatos
  const maxBucketSize = bucketEntries.reduce((m, [, items]) => Math.max(m, items.length), 0);
  const severity = computeSeverity(patterns, sqlCriteria, maxBucketSize);
  const analysis = renderAnalysis({ runId, fromTs, toTs, candidates: candidates.results.length, bucketEntries, sqlCriteria, severity });
  const proposal = renderProposal(classifications.filter(Boolean) as Array<NonNullable<typeof classifications[number]>>);
  const divergenciasJson = JSON.stringify(uniqueDivergences, null, 2);

  // 12. R2: salvar artefatos do run
  const datePrefix = new Date(toTs).toISOString().slice(0, 10);
  await fawWrite(env.AUDITOR_R2, `decisions/${datePrefix}/${runId}/analysis.md`, analysis);
  await fawWrite(env.AUDITOR_R2, `decisions/${datePrefix}/${runId}/proposal.md`, proposal);
  await fawWrite(env.AUDITOR_R2, `decisions/${datePrefix}/${runId}/divergencias.json`, divergenciasJson);

  // 13. PR + Telegram (se severidade adequada)
  let prUrl: string | null = null;
  if (severity !== 'info') {
    try {
      prUrl = await createPR(
        { pat: env.GITHUB_PAT, repo: env.GITHUB_REPO, defaultBranch: env.GITHUB_DEFAULT_BRANCH },
        {
          branch: `monitor/${runId}`,
          title: `monitor: ${severity} em ${agentId}/fit-estrategico (run ${runId})`,
          body: prBody({ runId, severity, analysis, proposal }),
          files: [
            { path: `monitor-runs/${runId}/analysis.md`, content: analysis },
            { path: `monitor-runs/${runId}/proposal.md`, content: proposal },
            { path: `monitor-runs/${runId}/divergencias.json`, content: divergenciasJson },
          ],
        },
      );
    } catch (err) {
      console.error(JSON.stringify({ op: 'createPR', err: err instanceof Error ? err.message : String(err) }));
    }
  }
  if (severity === 'critical' && prUrl) {
    await sendTelegramAlert(
      { botToken: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID },
      `Monitor auditor: ${agentId}/fit-estrategico\nRun ${runId.slice(-8)}\nSeveridade: critical\nPadrões: ${patterns.patterns.length}\nPR: ${prUrl}`,
    );
  }

  // 14. checkpoint
  await updateCheckpoint(env, agentId, toTs);

  return { run_id: runId, severity, divergences: uniqueDivergences.length, pr: prUrl };
}

// helpers locais (mantidos no agent.ts pra simplicidade do POC)

async function updateCheckpoint(env: Env, agentId: string, ts: number): Promise<void> {
  await env.DB
    .prepare('INSERT OR REPLACE INTO audit_run (agent_id, last_processed_ts) VALUES (?, ?)')
    .bind(agentId, ts)
    .run();
}

function targetToFile(target: 'prompt-issue' | 'gabarito-stale' | 'criterio-faltando' | 'contexto-mudou'): string {
  switch (target) {
    case 'prompt-issue': return '.flue/skills/qualificador/qualificar-lead/SKILL.md';
    case 'gabarito-stale': return 'expected-reasoning/qualificador/fit-estrategico.md';
    case 'criterio-faltando': return 'agents-config/qualificador/criterios-icp.md';
    case 'contexto-mudou': return 'agents-config/qualificador/contexto-momento.md';
  }
}

async function runSqlCriteria(env: Env, agentId: string, fromTs: number, toTs: number) {
  const window = await env.DB.prepare(
    `SELECT
       AVG(cost_usd) as avg_cost,
       AVG(duration_ms) as avg_duration,
       SUM(CASE WHEN has_out_of_scope = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as oos_pct,
       SUM(CASE WHEN (judgment_outcome = 'descartar' AND objective_tier = 'A')
                  OR (judgment_outcome = 'priorizar' AND objective_tier = 'C') THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as contra_rate
     FROM decision_log WHERE agent_id = ? AND ts > ? AND ts <= ?`,
  ).bind(agentId, fromTs, toTs).first<{ avg_cost: number; avg_duration: number; oos_pct: number; contra_rate: number }>();

  // baseline simplificado: janela anterior do mesmo tamanho
  const sizeMs = toTs - fromTs;
  const baseline = await env.DB.prepare(
    `SELECT
       AVG(cost_usd) as avg_cost,
       SUM(CASE WHEN has_out_of_scope = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as oos_pct,
       SUM(CASE WHEN (judgment_outcome = 'descartar' AND objective_tier = 'A')
                  OR (judgment_outcome = 'priorizar' AND objective_tier = 'C') THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as contra_rate
     FROM decision_log WHERE agent_id = ? AND ts > ? AND ts <= ?`,
  ).bind(agentId, fromTs - sizeMs, fromTs).first<{ avg_cost: number; oos_pct: number; contra_rate: number }>();

  return {
    out_of_scope_growth: detectOutOfScopeGrowth({ current_pct: window?.oos_pct ?? 0, previous_pct: baseline?.oos_pct ?? 0 }),
    regression: detectRegression({ current_rate: window?.contra_rate ?? 0, baseline_rate: baseline?.contra_rate ?? 0 }),
    budget_blow: detectBudgetBlow({ current_avg: window?.avg_cost ?? 0, baseline_avg: baseline?.avg_cost ?? 0 }),
  };
}

function computeSeverity(
  patterns: v.InferOutput<typeof SummarizePatternsOutputSchema>,
  sql: { out_of_scope_growth: { triggered: boolean }; regression: { triggered: boolean }; budget_blow: { triggered: boolean } },
  maxBucketSize: number,
): 'critical' | 'warn' | 'info' {
  if (patterns.cross_bucket_signal) return 'critical';
  for (const p of patterns.patterns) {
    if (p.promotion_recommendation === 'finding' && shouldPromoteToFinding({
      distinct_buckets_count: p.affected_buckets.length,
      max_bucket_size: maxBucketSize,
      confidence: p.confidence,
    })) return 'critical';
  }
  if (sql.out_of_scope_growth.triggered || sql.regression.triggered) return 'warn';
  if (sql.budget_blow.triggered) return 'info';
  return 'info';
}

function renderAnalysis(input: {
  runId: string;
  fromTs: number;
  toTs: number;
  candidates: number;
  bucketEntries: Array<[string, unknown[]]>;
  sqlCriteria: ReturnType<typeof Object>;
  severity: string;
}): string {
  return `# Run ${input.runId}\n\nWindow: ${new Date(input.fromTs).toISOString()} → ${new Date(input.toTs).toISOString()}\n\nCandidatos: ${input.candidates}\nBuckets ativos: ${input.bucketEntries.length}\nSeveridade: **${input.severity}**\n`;
}

function renderProposal(classifications: Array<{ div: { heuristic_ignored: string }; origin: { target: string; rationale: string }; suggestion: { target_file: string; proposed_change: string; rationale: string } | null }>): string {
  const lines: string[] = ['# Sugestões de Ajuste\n'];
  for (const c of classifications) {
    if (!c.suggestion) continue;
    lines.push(`## Heurístico ignorado: ${c.div.heuristic_ignored}`);
    lines.push(`**Target**: ${c.suggestion.target_file}`);
    lines.push(`**Origem**: ${c.origin.rationale}`);
    lines.push(`\n${c.suggestion.proposed_change}\n`);
    lines.push(`_Rationale_: ${c.suggestion.rationale}\n`);
  }
  return lines.join('\n');
}

function prBody(input: { runId: string; severity: string; analysis: string; proposal: string }): string {
  return `## Run ${input.runId}\n\nSeveridade: **${input.severity}**\n\n${input.analysis}\n\n---\n\n${input.proposal}\n\n---\n\nArtefatos completos em \`monitor-runs/${input.runId}/\`.`;
}

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
