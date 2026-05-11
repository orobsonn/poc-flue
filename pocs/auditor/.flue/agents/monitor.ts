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
import { buildSkillsSandbox } from '@/lib/sandbox';
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

type SqlCriteriaResult = {
  out_of_scope_growth: { triggered: boolean; delta_pp?: number };
  regression: { triggered: boolean; delta_pct?: number };
  budget_blow: { triggered: boolean; delta_pct?: number };
};

type CandidateLead = {
  id: string;
  segmento: string | null;
  faturamento_band: string | null;
  time_vendas: string | null;
  ferramentas: string | null;
  sinal: string | null;
  fundador_tecnico: 0 | 1;
  menciona_dor: 0 | 1;
  contexto_livre_sanitized: string | null;
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
  lead: CandidateLead | null;
};

type CandidateRow = {
  id: string;
  did: string;
  reasoned: string;
  out_of_scope: string | null;
  objective_tier: 'A' | 'B' | 'C';
  judgment_outcome: 'priorizar' | 'manter' | 'descartar';
  has_out_of_scope: 0 | 1;
  cost_usd: number;
  duration_ms: number;
  lead_id: string | null;
  segmento: string | null;
  faturamento_band: string | null;
  time_vendas: string | null;
  ferramentas: string | null;
  sinal: string | null;
  fundador_tecnico: 0 | 1 | null;
  menciona_dor: 0 | 1 | null;
  contexto_livre_sanitized: string | null;
};

/** @description Agente monitor — orquestrador do pipeline de auditoria. Disparado por POST/cron. */
export default async function (ctx: FlueContext<unknown, Env>): Promise<unknown> {
  const env = ctx.env;
  const agentId = await pseudonymize('qualificador', env.HMAC_SECRET);
  const runId = `${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;
  const janelaMs = parseInt(env.JANELA_HORAS, 10) * 3600_000;
  const k = parseInt(env.BUCKET_K_REPRESENTATIVES, 10);
  const minSample = parseInt(env.SAMPLE_MIN_PER_BUCKET, 10);

  // 1. checkpoint
  const lastTsRow = await env.DB
    .prepare('SELECT last_processed_ts FROM audit_run WHERE agent_id = ?')
    .bind(agentId)
    .first<{ last_processed_ts: number }>();
  const fromTs = lastTsRow?.last_processed_ts ?? Date.now() - janelaMs;
  const toTs = Date.now();

  // 2. candidates: out_of_scope OR contradição obj↔julg
  const candidatesRaw = await env.DB
    .prepare(
      `SELECT decision_log.id, decision_log.did, decision_log.reasoned, decision_log.out_of_scope,
              decision_log.objective_tier, decision_log.judgment_outcome, decision_log.has_out_of_scope,
              decision_log.cost_usd, decision_log.duration_ms,
              lead.id AS lead_id, lead.segmento, lead.faturamento_band, lead.time_vendas,
              lead.ferramentas, lead.sinal, lead.fundador_tecnico, lead.menciona_dor,
              lead.contexto_livre_sanitized
       FROM decision_log
       LEFT JOIN lead ON decision_log.lead_id = lead.id
       WHERE decision_log.agent_id = ? AND decision_log.ts > ? AND decision_log.ts <= ?
         AND (
           decision_log.has_out_of_scope = 1
           OR (decision_log.judgment_outcome = 'descartar' AND decision_log.objective_tier = 'A')
           OR (decision_log.judgment_outcome = 'priorizar' AND decision_log.objective_tier = 'C')
         )`,
    )
    .bind(agentId, fromTs, toTs)
    .all<CandidateRow>();

  if (!candidatesRaw.results || candidatesRaw.results.length === 0) {
    await updateCheckpoint(env, agentId, toTs);
    return { run_id: runId, status: 'no-candidates' };
  }

  const candidates = candidatesRaw.results.map(rowToCandidate);

  // 3. bucketing
  const buckets = new Map<string, Candidate[]>();
  for (const c of candidates) {
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
  const sandboxFactory = await buildSkillsSandbox(env.AUDITOR_R2);
  const harness = await ctx.init({
    model: env.MODEL_MAIN ?? 'cloudflare-workers-ai/@cf/meta/llama-4-scout-17b-16e-instruct',
    sandbox: sandboxFactory,
    providers: {
      'cloudflare-workers-ai': {
        baseUrl: `https://gateway.ai.cloudflare.com/v1/${env.CLOUDFLARE_ACCOUNT_ID}/${env.CLOUDFLARE_AI_GATEWAY_ID}/workers-ai/v1`,
        apiKey: env.CLOUDFLARE_API_TOKEN,
        headers: { 'cf-aig-authorization': `Bearer ${env.CLOUDFLARE_AI_GATEWAY_TOKEN}` },
      },
    },
    role: 'auditor-monitor',
  });

  // 6. carrega gabarito + contexto-momento + active findings
  const gabarito = (await fawRead(env.AUDITOR_R2, 'expected-reasoning/qualificador/fit-estrategico.md')) ?? '';
  const contextoMomento = (await fawRead(env.AUDITOR_R2, 'agents-config/qualificador/contexto-momento.md')) ?? '';
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
            const s = await harness.session(`detect-${sanitizeId(rep.id)}`);
            const data = await s.skill('detect-divergences', {
              args: {
                decision: { id: rep.id, did: rep.did, reasoned: rep.reasoned, out_of_scope: rep.out_of_scope },
                lead: rep.lead,
                gabarito,
                active_findings: activeFindings,
              },
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
        const sessionId = `classify-${sanitizeId(div.heuristic_ignored)}-${sanitizeId(div.bucket_key)}`;
        const s = await harness.session(sessionId);
        const origin = await s.skill('classify-origin', {
          args: { divergencia: div, gabarito, contexto_momento: contextoMomento },
          result: ClassifyOriginOutputSchema,
        });
        if (origin.target === 'inconclusive') return { div, origin, suggestion: null };
        const targetFile = targetToFile(origin.target);
        const currentContent = (await fawRead(env.AUDITOR_R2, targetFile)) ?? '';
        const suggestion = await s.skill('suggest-adjustment', {
          args: { divergencia: { ...div, target: origin.target }, current_content: currentContent, contexto_momento: contextoMomento },
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
      const s = await harness.session(`summarize-${sanitizeId(runId)}`);
      patterns = await s.skill('summarize-patterns', {
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
  const analysis = renderAnalysis({ runId, fromTs, toTs, candidates: candidates.length, bucketEntries, sqlCriteria, severity });
  const proposal = renderProposal(classifications.filter(Boolean) as Array<NonNullable<typeof classifications[number]>>);
  const divergenciasJson = JSON.stringify(uniqueDivergences, null, 2);

  // 12. R2: salvar artefatos do run
  const datePrefix = new Date(toTs).toISOString().slice(0, 10);
  await fawWrite(env.AUDITOR_R2, `decisions/${datePrefix}/${runId}/analysis.md`, analysis);
  await fawWrite(env.AUDITOR_R2, `decisions/${datePrefix}/${runId}/proposal.md`, proposal);
  await fawWrite(env.AUDITOR_R2, `decisions/${datePrefix}/${runId}/divergencias.json`, divergenciasJson);

  // 13. PR + Telegram (se severidade adequada)
  const summary = buildRunSummary({
    severity,
    fromTs,
    toTs,
    candidates: candidates.length,
    bucketEntries,
    divergencesDetected: uniqueDivergences.length,
    classifications: classifications.filter(Boolean) as ClassificationResult[],
    sqlCriteria,
  });

  let prUrl: string | null = null;
  if (severity !== 'info') {
    try {
      prUrl = await createPR(
        { pat: env.GITHUB_PAT, repo: env.GITHUB_REPO, defaultBranch: env.GITHUB_DEFAULT_BRANCH },
        {
          branch: `monitor/${runId}`,
          title: prTitle(runId, summary),
          body: prBody(runId, summary),
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
      telegramMessage(runId, summary, prUrl),
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

async function runSqlCriteria(env: Env, agentId: string, fromTs: number, toTs: number): Promise<SqlCriteriaResult> {
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
  sql: SqlCriteriaResult,
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
  sqlCriteria: SqlCriteriaResult;
  severity: string;
}): string {
  const sql = input.sqlCriteria;
  const sqlLines = [
    `- out_of_scope_growth: ${sql.out_of_scope_growth.triggered ? 'triggered' : 'ok'}${sql.out_of_scope_growth.delta_pp !== undefined ? ` (Δ ${sql.out_of_scope_growth.delta_pp.toFixed(1)}pp)` : ''}`,
    `- regression: ${sql.regression.triggered ? 'triggered' : 'ok'}${sql.regression.delta_pct !== undefined ? ` (Δ ${(sql.regression.delta_pct * 100).toFixed(1)}%)` : ''}`,
    `- budget_blow: ${sql.budget_blow.triggered ? 'triggered' : 'ok'}${sql.budget_blow.delta_pct !== undefined ? ` (Δ ${(sql.budget_blow.delta_pct * 100).toFixed(1)}%)` : ''}`,
  ].join('\n');
  return `# Run ${input.runId}\n\nWindow: ${new Date(input.fromTs).toISOString()} → ${new Date(input.toTs).toISOString()}\n\nCandidatos: ${input.candidates}\nBuckets ativos: ${input.bucketEntries.length}\nSeveridade: **${input.severity}**\n\n## Critérios SQL\n${sqlLines}\n`;
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

const AGENT_LABEL = 'qualificador/fit-estrategico';

type ClassificationResult = {
  div: {
    decision_id: string;
    heuristic_ignored: string;
    evidence: string;
    severity: 'low' | 'med' | 'high';
    bucket_key: string;
    bucket_size: number;
    representatives_audited: number;
  };
  origin: { target: string; rationale: string };
  suggestion: { target_file: string; proposed_change: string; rationale: string } | null;
};

type RunSummary = {
  severity: 'critical' | 'warn' | 'info';
  divergencesDetected: number;
  classifications: ClassificationResult[];
  candidates: number;
  bucketCount: number;
  windowHours: number;
  topDivergence: ClassificationResult | null;
  sqlCriteria: SqlCriteriaResult;
};

/** @description Strip markdown headers/whitespace de um heuristic_ignored cru pra render humano. */
function humanizeHeuristic(raw: string): string {
  const firstLine = raw.split('\n')[0]?.trim() ?? raw;
  return firstLine.replace(/^#+\s*/, '').trim();
}

/** @description Pega a divergência "principal" — maior severidade desempata por bucket_size. */
function pickTopDivergence(classifications: ClassificationResult[]): ClassificationResult | null {
  if (classifications.length === 0) return null;
  const order = { high: 3, med: 2, low: 1 } as const;
  return [...classifications].sort((a, b) => {
    const sevDiff = order[b.div.severity] - order[a.div.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.div.bucket_size - a.div.bucket_size;
  })[0] ?? null;
}

/** @description Constrói sumário estruturado do run pra alimentar PR + Telegram com lead-first framing. */
function buildRunSummary(input: {
  severity: 'critical' | 'warn' | 'info';
  fromTs: number;
  toTs: number;
  candidates: number;
  bucketEntries: Array<[string, unknown[]]>;
  divergencesDetected: number;
  classifications: ClassificationResult[];
  sqlCriteria: SqlCriteriaResult;
}): RunSummary {
  return {
    severity: input.severity,
    divergencesDetected: input.divergencesDetected,
    classifications: input.classifications,
    candidates: input.candidates,
    bucketCount: input.bucketEntries.length,
    windowHours: Math.round((input.toTs - input.fromTs) / 3600_000),
    topDivergence: pickTopDivergence(input.classifications),
    sqlCriteria: input.sqlCriteria,
  };
}

/** @description Mensagem Telegram — direta, lead-first, sem markdown pesado. */
function telegramMessage(runId: string, s: RunSummary, prUrl: string): string {
  const lines = [
    `[${s.severity.toUpperCase()}] auditor • ${AGENT_LABEL}`,
    '',
    `${s.divergencesDetected} divergência${s.divergencesDetected === 1 ? '' : 's'} em ${s.candidates} decisões (janela ${s.windowHours}h, ${s.bucketCount} bucket${s.bucketCount === 1 ? '' : 's'} ativo${s.bucketCount === 1 ? '' : 's'})`,
  ];
  if (s.topDivergence) {
    const d = s.topDivergence.div;
    lines.push('', `Principal: ${humanizeHeuristic(d.heuristic_ignored)} (${d.severity}) em ${d.bucket_size} decisões do bucket ${d.bucket_key}`);
    lines.push(`Evidência: "${d.evidence}"`);
  } else if (s.divergencesDetected > 0) {
    lines.push('', `(classificação de origem falhou para todas as divergências — ver PR pra detalhes brutos)`);
  }
  lines.push('', `PR: ${prUrl}`, `Run: ${runId}`);
  return lines.join('\n');
}

/** @description Title do PR — ação + número + label do agente, max ~70 chars. */
function prTitle(runId: string, s: RunSummary): string {
  return `auditor[${s.severity}]: ${s.divergencesDetected} divergência${s.divergencesDetected === 1 ? '' : 's'} em ${AGENT_LABEL} (run ${runId.slice(-8)})`;
}

/** @description Body do PR — TL;DR, divergências em linguagem humana, critérios SQL, run metadata. */
function prBody(runId: string, s: RunSummary): string {
  const sqlRows = [
    ['out_of_scope_growth', s.sqlCriteria.out_of_scope_growth.triggered ? 'triggered' : 'ok', s.sqlCriteria.out_of_scope_growth.delta_pp !== undefined ? `${s.sqlCriteria.out_of_scope_growth.delta_pp.toFixed(1)}pp` : '-'],
    ['regression', s.sqlCriteria.regression.triggered ? 'triggered' : 'ok', s.sqlCriteria.regression.delta_pct !== undefined ? `${(s.sqlCriteria.regression.delta_pct * 100).toFixed(1)}%` : '-'],
    ['budget_blow', s.sqlCriteria.budget_blow.triggered ? 'triggered' : 'ok', s.sqlCriteria.budget_blow.delta_pct !== undefined ? `${(s.sqlCriteria.budget_blow.delta_pct * 100).toFixed(1)}%` : '-'],
  ];

  const tldr = s.topDivergence
    ? `${s.divergencesDetected} divergência${s.divergencesDetected === 1 ? '' : 's'} em ${s.candidates} decisões da janela de ${s.windowHours}h. Severidade **${s.severity}**. Principal: ${humanizeHeuristic(s.topDivergence.div.heuristic_ignored)} ignorado em ${s.topDivergence.div.bucket_size} decisões do bucket \`${s.topDivergence.div.bucket_key}\`.`
    : s.divergencesDetected > 0
      ? `${s.divergencesDetected} divergência${s.divergencesDetected === 1 ? '' : 's'} detectada${s.divergencesDetected === 1 ? '' : 's'} em ${s.candidates} decisões, mas a classificação de origem falhou (LLM não respondeu no contrato esperado). Severidade **${s.severity}** — ver \`divergencias.json\` no run pra detalhes brutos.`
      : `Sem divergências detectadas pela skill, mas critérios SQL dispararam — severidade **${s.severity}**.`;

  const divLines: string[] = ['## Divergências encontradas', ''];
  if (s.classifications.length === 0 && s.divergencesDetected === 0) {
    divLines.push('_Nenhuma divergência detectada pela LLM neste run. Severidade vem dos critérios SQL abaixo._', '');
  } else if (s.classifications.length === 0) {
    divLines.push(`_${s.divergencesDetected} divergência(s) bruta(s) detectada(s) — classify-origin falhou em todas. Conteúdo cru em \`monitor-runs/${runId}/divergencias.json\`._`, '');
  } else {
    s.classifications.forEach((c, i) => {
      divLines.push(`### ${i + 1}. ${humanizeHeuristic(c.div.heuristic_ignored)} (severity: ${c.div.severity})`);
      divLines.push(`- **Bucket**: \`${c.div.bucket_key}\` — ${c.div.bucket_size} decisões afetadas, ${c.div.representatives_audited} auditadas`);
      divLines.push(`- **Evidência (reasoned do agente)**: "${c.div.evidence}"`);
      divLines.push(`- **Origem**: \`${c.origin.target}\` — ${c.origin.rationale}`);
      if (c.suggestion) {
        divLines.push(`- **Ajuste sugerido em** \`${c.suggestion.target_file}\`:`);
        divLines.push('', '> ' + c.suggestion.proposed_change.split('\n').join('\n> '), '');
        divLines.push(`  _Rationale_: ${c.suggestion.rationale}`);
      } else {
        divLines.push('- **Sugestão**: _origem inconclusiva, sem ajuste proposto_');
      }
      divLines.push('');
    });
  }

  return [
    '## TL;DR', '', tldr, '',
    divLines.join('\n'),
    '## Critérios SQL', '',
    '| Critério | Status | Δ vs janela anterior |',
    '| --- | --- | --- |',
    ...sqlRows.map((r) => `| ${r[0]} | ${r[1]} | ${r[2]} |`),
    '',
    '## Metadata do run', '',
    `- Run ID: \`${runId}\``,
    `- Janela: ${s.windowHours}h`,
    `- Candidatos avaliados: ${s.candidates}`,
    `- Buckets ativos: ${s.bucketCount}`,
    '',
    `Artefatos completos em \`monitor-runs/${runId}/\` (analysis.md, proposal.md, divergencias.json).`,
  ].join('\n');
}

/** @description Mapeia row plana do JOIN decision_log×lead pra Candidate com lead aninhado. */
function rowToCandidate(row: CandidateRow): Candidate {
  const lead: CandidateLead | null = row.lead_id
    ? {
        id: row.lead_id,
        segmento: row.segmento,
        faturamento_band: row.faturamento_band,
        time_vendas: row.time_vendas,
        ferramentas: row.ferramentas,
        sinal: row.sinal,
        fundador_tecnico: (row.fundador_tecnico ?? 0) as 0 | 1,
        menciona_dor: (row.menciona_dor ?? 0) as 0 | 1,
        contexto_livre_sanitized: row.contexto_livre_sanitized,
      }
    : null;
  return {
    id: row.id,
    did: row.did,
    reasoned: row.reasoned,
    out_of_scope: row.out_of_scope,
    objective_tier: row.objective_tier,
    judgment_outcome: row.judgment_outcome,
    has_out_of_scope: row.has_out_of_scope,
    cost_usd: row.cost_usd,
    duration_ms: row.duration_ms,
    lead,
  };
}

function sanitizeId(input: string): string {
  return input.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 60);
}

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
