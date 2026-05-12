import type { FlueContext, ToolDef } from '@flue/sdk/client';
import * as v from 'valibot';
import {
  DetectDivergencesOutputSchema,
  ClassifyOriginOutputSchema,
  SuggestAdjustmentOutputSchema,
  SummarizePatternsOutputSchema,
  AgenticAuditOutputSchema,
  type AgenticAuditOutput,
} from '@/schemas/skills';
import { computeBucketKey, isBucketTranquilo, pickRepresentatives } from '@/lib/bucketing';
import { detectOutOfScopeGrowth, detectRegression, detectBudgetBlow } from '@/lib/criteria';
import { fawRead, fawWrite } from '@/lib/faw';
import { buildSkillsSandbox } from '@/lib/sandbox';
import { createPR } from '@/lib/github';
import { sendTelegramAlert } from '@/lib/telegram';
import { shouldPromoteToFinding } from '@/lib/promotion';
import { pseudonymize } from '@/lib/hmac';
import { recordRunMetrics } from '@/lib/metrics';
import {
  buildRunSummary,
  renderAnalysis,
  renderProposal,
  renderTelegramMessage,
  renderPrTitle,
  renderPrBody,
  type ClassificationForRender,
  type SqlCriteriaResult,
} from '@/lib/render';

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
  bucket_key: string;
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

/** @description Agente auditor-agentic (v0.3 Stage 1) — pipeline imperativo até sampling, miolo agêntico via session.prompt() com 4 custom tools. */
export default async function (ctx: FlueContext<unknown, Env>): Promise<unknown> {
  const env = ctx.env;
  const runStartTs = Date.now();
  const agentId = await pseudonymize('qualificador', env.HMAC_SECRET);
  const runId = `${new Date().toISOString().slice(0, 10)}-agentic-${crypto.randomUUID().slice(0, 8)}`;
  const janelaMs = parseInt(env.JANELA_HORAS, 10) * 3600_000;
  const k = parseInt(env.BUCKET_K_REPRESENTATIVES, 10);
  const minSample = parseInt(env.SAMPLE_MIN_PER_BUCKET, 10);

  const lastTsRow = await env.DB
    .prepare('SELECT last_processed_ts FROM audit_run WHERE agent_id = ?')
    .bind(agentId)
    .first<{ last_processed_ts: number }>();
  const fromTs = lastTsRow?.last_processed_ts ?? Date.now() - janelaMs;
  const toTs = Date.now();

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
    await recordRunMetrics(env.AUDITOR_R2, {
      run_id: runId,
      mode: 'agentic',
      severity: 'none',
      divergences_detected: 0,
      classifications_succeeded: 0,
      candidates: 0,
      buckets_active: 0,
      latency_ms_total: Date.now() - runStartTs,
      llm_calls_count: 0,
    });
    return { run_id: runId, status: 'no-candidates' };
  }

  const candidates: Candidate[] = candidatesRaw.results.map(rowToCandidate);

  const buckets = new Map<string, Candidate[]>();
  for (const c of candidates) {
    if (isBucketTranquilo(c.judgment_outcome, c.objective_tier, c.has_out_of_scope)) continue;
    if (!buckets.has(c.bucket_key)) buckets.set(c.bucket_key, []);
    buckets.get(c.bucket_key)!.push(c);
  }

  const bucketEntries = [...buckets.entries()].filter(([, items]) => items.length >= minSample);

  if (bucketEntries.length === 0) {
    await updateCheckpoint(env, agentId, toTs);
    await recordRunMetrics(env.AUDITOR_R2, {
      run_id: runId,
      mode: 'agentic',
      severity: 'none',
      divergences_detected: 0,
      classifications_succeeded: 0,
      candidates: candidates.length,
      buckets_active: 0,
      latency_ms_total: Date.now() - runStartTs,
      llm_calls_count: 0,
    });
    return { run_id: runId, status: 'no-suspicious-buckets' };
  }

  const sqlCriteria = await runSqlCriteria(env, agentId, fromTs, toTs);

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
    role: 'auditor-agentic',
  });

  const gabarito = (await fawRead(env.AUDITOR_R2, 'expected-reasoning/qualificador/fit-estrategico.md')) ?? '';
  const contextoMomento = (await fawRead(env.AUDITOR_R2, 'agents-config/qualificador/contexto-momento.md')) ?? '';
  const activeFindings: unknown[] = [];

  // sample reps por bucket (ainda imperativo no Stage 1 — Stage 2 move pro agente)
  const repsByBucket = new Map<string, Candidate[]>();
  const repsById = new Map<string, { rep: Candidate; bucketKey: string }>();
  for (const [bucketKey, items] of bucketEntries) {
    const reps = pickRepresentatives(items, k, hashSeed(runId + bucketKey));
    repsByBucket.set(bucketKey, reps);
    for (const r of reps) repsById.set(r.id, { rep: r, bucketKey });
  }

  // contador compartilhado de chamadas LLM via tools
  let llmCallsCount = 0;

  const detectTool: ToolDef = {
    name: 'detect_divergences',
    description: 'Roda a skill detect-divergences numa decisão representante. Retorna divergências encontradas (heurístico ignorado, evidência literal, severidade). Use uma vez por representante.',
    parameters: {
      type: 'object',
      properties: { decision_id: { type: 'string', description: 'ID da decisão representante (uso os IDs listados no prompt)' } },
      required: ['decision_id'],
    },
    async execute(args) {
      const decisionId = String((args as { decision_id?: unknown }).decision_id ?? '');
      const entry = repsById.get(decisionId);
      if (!entry) return JSON.stringify({ error: `decision_id "${decisionId}" não está na lista de representantes` });
      llmCallsCount++;
      try {
        const s = await harness.session(`detect-${sanitizeId(decisionId)}-${runId}`);
        const data = await s.skill('detect-divergences', {
          args: {
            decision: { id: entry.rep.id, did: entry.rep.did, reasoned: entry.rep.reasoned, out_of_scope: entry.rep.out_of_scope },
            lead: entry.rep.lead,
            gabarito,
            active_findings: activeFindings,
          },
          result: DetectDivergencesOutputSchema,
        });
        return JSON.stringify({ decision_id: decisionId, bucket_key: entry.bucketKey, divergences: data.divergences });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ op: 'detect_divergences', decision_id: decisionId, message }));
        return JSON.stringify({ error: message, decision_id: decisionId });
      }
    },
  };

  const classifyTool: ToolDef = {
    name: 'classify_origin',
    description: 'Classifica origem de uma divergência em prompt-issue | gabarito-stale | criterio-faltando | contexto-mudou | inconclusive. Use uma vez por divergência única (heuristic_ignored × bucket_key).',
    parameters: {
      type: 'object',
      properties: {
        decision_id: { type: 'string' },
        bucket_key: { type: 'string' },
        heuristic_ignored: { type: 'string' },
        evidence: { type: 'string', description: 'Evidência literal extraída do campo reasoned ou out_of_scope da decisão' },
        severity: { type: 'string', enum: ['low', 'med', 'high'] },
      },
      required: ['decision_id', 'bucket_key', 'heuristic_ignored', 'evidence', 'severity'],
    },
    async execute(args) {
      const a = args as { decision_id: string; bucket_key: string; heuristic_ignored: string; evidence: string; severity: 'low' | 'med' | 'high' };
      llmCallsCount++;
      try {
        const s = await harness.session(`classify-${sanitizeId(a.heuristic_ignored)}-${sanitizeId(a.bucket_key)}-${runId}`);
        const origin = await s.skill('classify-origin', {
          args: {
            divergencia: {
              decision_id: a.decision_id,
              heuristic_ignored: a.heuristic_ignored,
              evidence: a.evidence,
              severity: a.severity,
              bucket_key: a.bucket_key,
            },
            gabarito,
            contexto_momento: contextoMomento,
          },
          result: ClassifyOriginOutputSchema,
        });
        return JSON.stringify(origin);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ op: 'classify_origin', heuristic: a.heuristic_ignored, bucket: a.bucket_key, message }));
        return JSON.stringify({ error: message });
      }
    },
  };

  const suggestTool: ToolDef = {
    name: 'suggest_adjustment',
    description: 'Gera proposta de ajuste em texto pro arquivo target. Só chame se classify_origin não retornou inconclusive.',
    parameters: {
      type: 'object',
      properties: {
        decision_id: { type: 'string' },
        bucket_key: { type: 'string' },
        heuristic_ignored: { type: 'string' },
        evidence: { type: 'string' },
        severity: { type: 'string', enum: ['low', 'med', 'high'] },
        target: { type: 'string', enum: ['prompt-issue', 'gabarito-stale', 'criterio-faltando', 'contexto-mudou'] },
      },
      required: ['decision_id', 'bucket_key', 'heuristic_ignored', 'evidence', 'severity', 'target'],
    },
    async execute(args) {
      const a = args as { decision_id: string; bucket_key: string; heuristic_ignored: string; evidence: string; severity: 'low' | 'med' | 'high'; target: 'prompt-issue' | 'gabarito-stale' | 'criterio-faltando' | 'contexto-mudou' };
      llmCallsCount++;
      const targetFile = targetToFile(a.target);
      try {
        const currentContent = (await fawRead(env.AUDITOR_R2, targetFile)) ?? '';
        const s = await harness.session(`suggest-${sanitizeId(a.heuristic_ignored)}-${sanitizeId(a.bucket_key)}-${runId}`);
        const suggestion = await s.skill('suggest-adjustment', {
          args: {
            divergencia: {
              decision_id: a.decision_id,
              heuristic_ignored: a.heuristic_ignored,
              evidence: a.evidence,
              severity: a.severity,
              bucket_key: a.bucket_key,
              target: a.target,
            },
            current_content: currentContent,
            contexto_momento: contextoMomento,
          },
          result: SuggestAdjustmentOutputSchema,
        });
        return JSON.stringify(suggestion);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ op: 'suggest_adjustment', heuristic: a.heuristic_ignored, target: a.target, message }));
        return JSON.stringify({ error: message });
      }
    },
  };

  const summarizeTool: ToolDef = {
    name: 'summarize_patterns',
    description: 'Agrega lista de divergências em padrões (mechanism-divergence, gabarito-stale, etc.) e detecta cross-bucket signal. Chame uma única vez no fim, com todas as divergências detectadas.',
    parameters: {
      type: 'object',
      properties: {
        divergences: {
          type: 'array',
          description: 'Lista completa de divergências detectadas até agora (deduplicadas)',
          items: {
            type: 'object',
            properties: {
              decision_id: { type: 'string' },
              bucket_key: { type: 'string' },
              heuristic_ignored: { type: 'string' },
              evidence: { type: 'string' },
              severity: { type: 'string', enum: ['low', 'med', 'high'] },
            },
            required: ['decision_id', 'bucket_key', 'heuristic_ignored', 'evidence', 'severity'],
          },
        },
      },
      required: ['divergences'],
    },
    async execute(args) {
      const divergences = (args as { divergences?: unknown[] }).divergences ?? [];
      llmCallsCount++;
      try {
        const s = await harness.session(`summarize-${sanitizeId(runId)}`);
        const patterns = await s.skill('summarize-patterns', {
          args: { divergences, active_findings: activeFindings },
          result: SummarizePatternsOutputSchema,
        });
        return JSON.stringify(patterns);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ op: 'summarize_patterns', message }));
        return JSON.stringify({ error: message });
      }
    },
  };

  const goal = buildGoal({ bucketEntries, repsByBucket, gabarito, contextoMomento });

  const mainSession = await harness.session(`main-${runId}`);
  let audit: AgenticAuditOutput;
  try {
    audit = await mainSession.prompt(goal, {
      tools: [detectTool, classifyTool, suggestTool, summarizeTool],
      result: AgenticAuditOutputSchema,
      role: 'auditor-agentic',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ op: 'agentic-loop', message, run_id: runId }));
    await recordRunMetrics(env.AUDITOR_R2, {
      run_id: runId,
      mode: 'agentic',
      severity: 'none',
      divergences_detected: 0,
      classifications_succeeded: 0,
      candidates: candidates.length,
      buckets_active: bucketEntries.length,
      latency_ms_total: Date.now() - runStartTs,
      llm_calls_count: llmCallsCount,
    });
    throw err;
  }

  // bucket_size pra render (LLM não tem essa info)
  const bucketSizes = new Map(bucketEntries.map(([key, items]) => [key, items.length]));
  const repsAuditedByBucket = new Map(bucketEntries.map(([key, items]) => [key, Math.min(k, items.length)]));

  const maxBucketSize = bucketEntries.reduce((m, [, items]) => Math.max(m, items.length), 0);
  const patternsForSeverity = { patterns: audit.patterns, cross_bucket_signal: audit.cross_bucket_signal };
  const severity = computeSeverity(patternsForSeverity, sqlCriteria, maxBucketSize);

  const classificationsForRender: ClassificationForRender[] = audit.classifications
    .filter((c) => c.target !== 'inconclusive')
    .map((c) => {
      const div = audit.divergences.find((d) => d.decision_id === c.decision_id && d.heuristic_ignored === c.heuristic_ignored);
      const bucket_key = div?.bucket_key ?? '';
      return {
        div: {
          decision_id: c.decision_id,
          heuristic_ignored: c.heuristic_ignored,
          evidence: div?.evidence ?? '',
          severity: div?.severity ?? 'low',
          bucket_key,
          bucket_size: bucketSizes.get(bucket_key) ?? 0,
          representatives_audited: repsAuditedByBucket.get(bucket_key) ?? 0,
        },
        origin: { target: c.target, rationale: c.rationale },
        suggestion: c.proposed_change && c.target_file
          ? { target_file: c.target_file, proposed_change: c.proposed_change, rationale: c.suggestion_rationale ?? '' }
          : null,
      };
    });

  const summary = buildRunSummary({
    severity,
    fromTs,
    toTs,
    candidates: candidates.length,
    bucketEntries,
    divergencesDetected: audit.divergences.length,
    classifications: classificationsForRender,
    sqlCriteria,
  });

  const analysis = renderAnalysis({ runId, fromTs, toTs, candidates: candidates.length, bucketEntries, sqlCriteria, severity, modeNote: 'agentic (Stage 1)' });
  const proposal = renderProposal(classificationsForRender);
  const divergenciasJson = JSON.stringify(audit.divergences, null, 2);

  const datePrefix = new Date(toTs).toISOString().slice(0, 10);
  await fawWrite(env.AUDITOR_R2, `decisions/${datePrefix}/${runId}/analysis.md`, analysis);
  await fawWrite(env.AUDITOR_R2, `decisions/${datePrefix}/${runId}/proposal.md`, proposal);
  await fawWrite(env.AUDITOR_R2, `decisions/${datePrefix}/${runId}/divergencias.json`, divergenciasJson);

  let prUrl: string | null = null;
  if (severity !== 'info') {
    try {
      prUrl = await createPR(
        { pat: env.GITHUB_PAT, repo: env.GITHUB_REPO, defaultBranch: env.GITHUB_DEFAULT_BRANCH },
        {
          branch: `agentic/${runId}`,
          title: renderPrTitle(runId, summary, 'auditor-agentic'),
          body: renderPrBody(runId, summary, { modeNote: 'Stage 1 do v0.3 — pipeline imperativo até sampling, miolo agêntico (1 session.prompt com 4 custom tools).' }),
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
      renderTelegramMessage(runId, summary, prUrl, 'auditor-agentic'),
    );
  }

  await updateCheckpoint(env, agentId, toTs);

  await recordRunMetrics(env.AUDITOR_R2, {
    run_id: runId,
    mode: 'agentic',
    severity,
    divergences_detected: audit.divergences.length,
    classifications_succeeded: classificationsForRender.length,
    candidates: candidates.length,
    buckets_active: bucketEntries.length,
    latency_ms_total: Date.now() - runStartTs,
    llm_calls_count: llmCallsCount,
  });

  return { run_id: runId, severity, divergences: audit.divergences.length, llm_calls: llmCallsCount, pr: prUrl };
}

/** @description Constrói o prompt-goal com gabarito, contexto, buckets e representantes inline. */
function buildGoal(input: {
  bucketEntries: Array<[string, Candidate[]]>;
  repsByBucket: Map<string, Candidate[]>;
  gabarito: string;
  contextoMomento: string;
}): string {
  const bucketsSection = input.bucketEntries.map(([bucketKey, items]) => {
    const reps = input.repsByBucket.get(bucketKey) ?? [];
    const repsLines = reps.map((r) => {
      const lead = r.lead ? JSON.stringify({
        segmento: r.lead.segmento,
        faturamento_band: r.lead.faturamento_band,
        time_vendas: r.lead.time_vendas,
        ferramentas: r.lead.ferramentas,
        sinal: r.lead.sinal,
        fundador_tecnico: r.lead.fundador_tecnico,
        menciona_dor: r.lead.menciona_dor,
        contexto_livre_sanitized: r.lead.contexto_livre_sanitized,
      }) : 'null';
      return `- decision_id: \`${r.id}\`\n  reasoned: ${JSON.stringify(r.reasoned)}\n  out_of_scope: ${JSON.stringify(r.out_of_scope)}\n  lead: ${lead}`;
    }).join('\n');
    return `### Bucket \`${bucketKey}\` — ${items.length} decisões, ${reps.length} representantes auditáveis\n\n${repsLines}`;
  }).join('\n\n');

  return `# Auditoria agêntica de decisões

Você é o auditor-agentic. Use as tools disponíveis pra detectar divergências entre o reasoning do agente qualificador e o gabarito (answer key), classificar origem e propor ajustes.

## Gabarito (answer key)

${input.gabarito}

## Contexto-momento do qualificador

${input.contextoMomento}

## Buckets ativos com representantes amostrados

${bucketsSection}

## Fluxo esperado

1. Pra cada \`decision_id\` listado, chame \`detect_divergences(decision_id)\`. Faça em sequência, uma decisão por vez.
2. Junte todas as divergências retornadas. Deduplique por \`(heuristic_ignored, bucket_key)\` — uma divergência por par.
3. Pra cada divergência única, chame \`classify_origin(decision_id, bucket_key, heuristic_ignored, evidence, severity)\`.
4. Se \`target\` retornar diferente de \`inconclusive\`, chame em seguida \`suggest_adjustment(...mesmos args + target)\`.
5. Ao final, chame \`summarize_patterns(divergences)\` passando a lista deduplicada completa.
6. Devolva o resultado no schema final: \`divergences[]\`, \`classifications[]\`, \`patterns[]\`, \`cross_bucket_signal\`.

Princípios: cite evidência literal do \`reasoned\`/\`out_of_scope\`; marque \`inconclusive\` quando faltar dado; não invoque tools redundantes.`;
}

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
    bucket_key: computeBucketKey(row.judgment_outcome, row.objective_tier, row.has_out_of_scope),
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
