import type { FlueContext, ToolDef } from '@flue/sdk/client';
import {
  DetectDivergencesOutputSchema,
  ClassifyOriginOutputSchema,
  SuggestAdjustmentOutputSchema,
  SummarizePatternsOutputSchema,
  AgenticStage4OutputSchema,
  type AgenticStage4Output,
} from '@/schemas/skills';
import { fawRead, fawWrite } from '@/lib/faw';
import { buildSkillsSandbox } from '@/lib/sandbox';
import { createPR } from '@/lib/github';
import { sendTelegramAlert } from '@/lib/telegram';
import { pseudonymize } from '@/lib/hmac';
import { recordRunMetrics } from '@/lib/metrics';

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
};

const MAX_QUERIES_PER_RUN = 15;
const MAX_ROWS_PER_QUERY = 100;
const MAX_TOOL_CALLS_TOTAL = 50;
const ALLOWED_R2_KEYS = new Set([
  'expected-reasoning/qualificador/fit-estrategico.md',
  'agents-config/qualificador/contexto-momento.md',
  'agents-config/qualificador/criterios-icp.md',
]);

/** @description Auditor-agentic Stage 4 — agente full. Monitor imperativo ~30 linhas: dá sandbox/harness, recebe output, decide PR/Telegram baseado em severity do agente. */
export default async function (ctx: FlueContext<unknown, Env>): Promise<unknown> {
  const env = ctx.env;
  const runStartTs = Date.now();
  const agentId = await pseudonymize('qualificador', env.HMAC_SECRET);
  const runId = `${new Date().toISOString().slice(0, 10)}-stage4-${crypto.randomUUID().slice(0, 8)}`;
  const k = parseInt(env.BUCKET_K_REPRESENTATIVES, 10);

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
    role: 'auditor-agentic-stage4',
  });

  let toolCallsCount = 0;
  let queriesCount = 0;
  let llmCallsCount = 0;
  const detectsByBucket = new Map<string, number>();

  function bumpToolCalls(toolName: string): { error: string } | null {
    toolCallsCount++;
    if (toolCallsCount > MAX_TOOL_CALLS_TOTAL) {
      return { error: `cap global de ${MAX_TOOL_CALLS_TOTAL} tool calls excedido (chamou ${toolName}); finalize com o que tem e devolva o output.` };
    }
    return null;
  }

  const getCheckpointTool: ToolDef = {
    name: 'get_checkpoint',
    description: 'Retorna { agent_id, last_processed_ts, now }. Use no início pra decidir janela temporal. Se last_processed_ts for null, é o primeiro run.',
    parameters: { type: 'object', properties: {}, required: [] },
    async execute() {
      const cap = bumpToolCalls('get_checkpoint');
      if (cap) return JSON.stringify(cap);
      try {
        const row = await env.DB
          .prepare('SELECT last_processed_ts FROM audit_run WHERE agent_id = ?')
          .bind(agentId)
          .first<{ last_processed_ts: number }>();
        return JSON.stringify({
          agent_id: agentId,
          last_processed_ts: row?.last_processed_ts ?? null,
          now: Date.now(),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ op: 'get_checkpoint', message }));
        return JSON.stringify({ error: message });
      }
    },
  };

  const readR2Tool: ToolDef = {
    name: 'read_r2',
    description: `Lê arquivo do R2 (gabarito ou contexto-momento). Keys permitidas: ${[...ALLOWED_R2_KEYS].join(', ')}. Outras keys retornam erro.`,
    parameters: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Path do arquivo no R2 (uma das keys da whitelist)' },
      },
      required: ['key'],
    },
    async execute(args) {
      const cap = bumpToolCalls('read_r2');
      if (cap) return JSON.stringify(cap);
      const key = String((args as { key?: unknown }).key ?? '');
      if (!ALLOWED_R2_KEYS.has(key)) {
        return JSON.stringify({ error: `key '${key}' não permitida; whitelist: ${[...ALLOWED_R2_KEYS].join(', ')}` });
      }
      try {
        const content = await fawRead(env.AUDITOR_R2, key);
        if (content === null) return JSON.stringify({ error: `key '${key}' não encontrada no R2` });
        return JSON.stringify({ key, content });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ op: 'read_r2', key, message }));
        return JSON.stringify({ error: message });
      }
    },
  };

  const queryTool: ToolDef = {
    name: 'query_decision_log',
    description: `SELECT em decision_log/lead. Cap ${MAX_QUERIES_PER_RUN} queries/run, max ${MAX_ROWS_PER_QUERY} rows. Stage 4: é assim que você descobre candidatos — não há lista inline.`,
    parameters: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'Query SELECT. Whitelist: só FROM decision_log/lead (JOIN ok). Sem WHERE em audit_run/decision_log_rejected. LIMIT 100 forçado.' },
        hipotese: { type: 'string', description: 'Em 1 linha: o que quer descobrir e como usar o resultado.' },
      },
      required: ['sql', 'hipotese'],
    },
    async execute(args) {
      const cap = bumpToolCalls('query_decision_log');
      if (cap) return JSON.stringify(cap);
      const a = args as { sql?: unknown; hipotese?: unknown };
      const sqlRaw = typeof a.sql === 'string' ? a.sql.trim() : '';
      const hipotese = typeof a.hipotese === 'string' ? a.hipotese.trim() : '';
      if (!hipotese) return JSON.stringify({ error: 'campo `hipotese` obrigatório — escreva em 1 linha o que quer descobrir' });
      if (queriesCount >= MAX_QUERIES_PER_RUN) return JSON.stringify({ error: `cap de ${MAX_QUERIES_PER_RUN} queries/run excedido` });

      const validation = validateSelectSql(sqlRaw);
      if (validation.error !== undefined) return JSON.stringify({ error: validation.error });
      const finalSql = validation.sql;

      queriesCount++;
      try {
        const result = await env.DB.prepare(finalSql).all();
        const rows = result.results ?? [];
        return JSON.stringify({ hipotese, sql: finalSql, row_count: rows.length, rows: rows.slice(0, MAX_ROWS_PER_QUERY) });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ op: 'query_decision_log', sql: finalSql.slice(0, 200), message }));
        return JSON.stringify({ error: `erro D1: ${message.slice(0, 300)}`, sql: finalSql });
      }
    },
  };

  const detectTool: ToolDef = {
    name: 'detect_divergences',
    description: `Roda a skill detect-divergences numa decisão. Você precisa ter lido o gabarito via read_r2 antes (a skill recebe gabarito como input). Cap ${k} detect_divergences por bucket.`,
    parameters: {
      type: 'object',
      properties: {
        decision_id: { type: 'string' },
        bucket_key: { type: 'string', description: 'bucket dessa decisão (judgment/tier/oos), usado pro cap por bucket' },
      },
      required: ['decision_id', 'bucket_key'],
    },
    async execute(args) {
      const cap = bumpToolCalls('detect_divergences');
      if (cap) return JSON.stringify(cap);
      const a = args as { decision_id?: unknown; bucket_key?: unknown };
      const decisionId = String(a.decision_id ?? '');
      const bucketKey = String(a.bucket_key ?? 'unknown');
      const prev = detectsByBucket.get(bucketKey) ?? 0;
      if (prev >= k) {
        return JSON.stringify({ error: `cap de ${k} detect_divergences excedido no bucket ${bucketKey}` });
      }
      try {
        const decisionRow = await env.DB
          .prepare(
            `SELECT decision_log.id, decision_log.did, decision_log.reasoned, decision_log.out_of_scope,
                    lead.id AS lead_id, lead.segmento, lead.faturamento_band, lead.time_vendas,
                    lead.ferramentas, lead.sinal, lead.fundador_tecnico, lead.menciona_dor,
                    lead.contexto_livre_sanitized
             FROM decision_log
             LEFT JOIN lead ON decision_log.lead_id = lead.id
             WHERE decision_log.id = ? AND decision_log.agent_id = ?`,
          )
          .bind(decisionId, agentId)
          .first<DecisionDetailRow>();
        if (!decisionRow) {
          return JSON.stringify({ error: `decision_id '${decisionId}' não encontrado no agente ${agentId}` });
        }
        const gabarito = (await fawRead(env.AUDITOR_R2, 'expected-reasoning/qualificador/fit-estrategico.md')) ?? '';
        detectsByBucket.set(bucketKey, prev + 1);
        llmCallsCount++;
        const s = await harness.session(`detect-${sanitizeId(decisionId)}-${runId}`);
        const data = await s.skill('detect-divergences', {
          args: {
            decision: {
              id: decisionRow.id,
              did: decisionRow.did,
              reasoned: decisionRow.reasoned,
              out_of_scope: decisionRow.out_of_scope,
            },
            lead: decisionRow.lead_id
              ? {
                  id: decisionRow.lead_id,
                  segmento: decisionRow.segmento,
                  faturamento_band: decisionRow.faturamento_band,
                  time_vendas: decisionRow.time_vendas,
                  ferramentas: decisionRow.ferramentas,
                  sinal: decisionRow.sinal,
                  fundador_tecnico: (decisionRow.fundador_tecnico ?? 0) as 0 | 1,
                  menciona_dor: (decisionRow.menciona_dor ?? 0) as 0 | 1,
                  contexto_livre_sanitized: decisionRow.contexto_livre_sanitized,
                }
              : null,
            gabarito,
            active_findings: [],
          },
          result: DetectDivergencesOutputSchema,
        });
        return JSON.stringify({ decision_id: decisionId, bucket_key: bucketKey, divergences: data.divergences });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(JSON.stringify({ op: 'detect_divergences', decision_id: decisionId, message }));
        return JSON.stringify({ error: message, decision_id: decisionId });
      }
    },
  };

  const classifyTool: ToolDef = {
    name: 'classify_origin',
    description: 'Classifica origem de divergência. Você precisa ter lido gabarito + contexto-momento via read_r2 antes.',
    parameters: {
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
    async execute(args) {
      const cap = bumpToolCalls('classify_origin');
      if (cap) return JSON.stringify(cap);
      const a = args as { decision_id: string; bucket_key: string; heuristic_ignored: string; evidence: string; severity: 'low' | 'med' | 'high' };
      try {
        const [gabarito, contextoMomento] = await Promise.all([
          fawRead(env.AUDITOR_R2, 'expected-reasoning/qualificador/fit-estrategico.md').then((c) => c ?? ''),
          fawRead(env.AUDITOR_R2, 'agents-config/qualificador/contexto-momento.md').then((c) => c ?? ''),
        ]);
        llmCallsCount++;
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
      const cap = bumpToolCalls('suggest_adjustment');
      if (cap) return JSON.stringify(cap);
      const a = args as { decision_id: string; bucket_key: string; heuristic_ignored: string; evidence: string; severity: 'low' | 'med' | 'high'; target: 'prompt-issue' | 'gabarito-stale' | 'criterio-faltando' | 'contexto-mudou' };
      const targetFile = targetToFile(a.target);
      try {
        const [currentContent, contextoMomento] = await Promise.all([
          fawRead(env.AUDITOR_R2, targetFile).then((c) => c ?? ''),
          fawRead(env.AUDITOR_R2, 'agents-config/qualificador/contexto-momento.md').then((c) => c ?? ''),
        ]);
        llmCallsCount++;
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
    description: 'Agrega divergências em padrões + detecta cross_bucket_signal. Chame uma vez no fim, com array completo de divergências deduplicadas.',
    parameters: {
      type: 'object',
      properties: {
        divergences: {
          type: 'array',
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
      const cap = bumpToolCalls('summarize_patterns');
      if (cap) return JSON.stringify(cap);
      const divergences = (args as { divergences?: unknown[] }).divergences ?? [];
      try {
        llmCallsCount++;
        const s = await harness.session(`summarize-${sanitizeId(runId)}`);
        const patterns = await s.skill('summarize-patterns', {
          args: { divergences, active_findings: [] },
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

  const goal = buildGoal({ agentId, k });

  const mainSession = await harness.session(`main-${runId}`);
  let audit: AgenticStage4Output;
  try {
    audit = await mainSession.prompt(goal, {
      tools: [getCheckpointTool, readR2Tool, queryTool, detectTool, classifyTool, suggestTool, summarizeTool],
      result: AgenticStage4OutputSchema,
      role: 'auditor-agentic-stage4',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ op: 'agentic-loop-stage4', message, run_id: runId }));
    await recordRunMetrics(env.AUDITOR_R2, {
      run_id: runId,
      mode: 'agentic',
      stage: 4,
      severity: 'none',
      divergences_detected: 0,
      classifications_succeeded: 0,
      candidates: 0,
      buckets_active: 0,
      latency_ms_total: Date.now() - runStartTs,
      llm_calls_count: llmCallsCount,
      queries_made: queriesCount,
      tool_calls_total: toolCallsCount,
    });
    throw err;
  }

  const datePrefix = new Date(audit.to_ts).toISOString().slice(0, 10);
  const analysis = renderStage4Analysis(runId, audit);
  const proposal = renderStage4Proposal(audit);
  const divergenciasJson = JSON.stringify(audit.divergences, null, 2);
  await fawWrite(env.AUDITOR_R2, `decisions/${datePrefix}/${runId}/analysis.md`, analysis);
  await fawWrite(env.AUDITOR_R2, `decisions/${datePrefix}/${runId}/proposal.md`, proposal);
  await fawWrite(env.AUDITOR_R2, `decisions/${datePrefix}/${runId}/divergencias.json`, divergenciasJson);

  let prUrl: string | null = null;
  if (audit.severity === 'warn' || audit.severity === 'critical') {
    try {
      prUrl = await createPR(
        { pat: env.GITHUB_PAT, repo: env.GITHUB_REPO, defaultBranch: env.GITHUB_DEFAULT_BRANCH },
        {
          branch: `stage4/${runId}`,
          title: `[auditor-stage4] ${audit.severity} — ${runId} (${audit.divergences.length} divergências em ${audit.buckets_active} buckets)`,
          body: renderStage4PrBody(runId, audit),
          files: [
            { path: `monitor-runs/${runId}/analysis.md`, content: analysis },
            { path: `monitor-runs/${runId}/proposal.md`, content: proposal },
            { path: `monitor-runs/${runId}/divergencias.json`, content: divergenciasJson },
          ],
        },
      );
    } catch (err) {
      console.error(JSON.stringify({ op: 'createPR-stage4', err: err instanceof Error ? err.message : String(err) }));
    }
  }
  if (audit.severity === 'critical' && prUrl) {
    await sendTelegramAlert(
      { botToken: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID },
      `🚨 auditor-stage4 critical — ${audit.divergences.length} divergências, ${audit.buckets_active} buckets\n${audit.cross_bucket_signal ?? '(sem cross_bucket_signal)'}\nPR: ${prUrl}`,
    );
  }

  if (audit.severity !== 'none') {
    await updateCheckpoint(env, agentId, audit.to_ts);
  }

  await recordRunMetrics(env.AUDITOR_R2, {
    run_id: runId,
    mode: 'agentic',
    stage: 4,
    severity: audit.severity,
    divergences_detected: audit.divergences.length,
    classifications_succeeded: audit.classifications.filter((c) => c.target !== 'inconclusive').length,
    candidates: audit.candidates_scanned,
    buckets_active: audit.buckets_active,
    latency_ms_total: Date.now() - runStartTs,
    llm_calls_count: llmCallsCount,
    reps_audited_total: [...detectsByBucket.values()].reduce((a, b) => a + b, 0),
    reps_audited_per_bucket: Object.fromEntries(detectsByBucket),
    queries_made: queriesCount,
    tool_calls_total: toolCallsCount,
  });

  return {
    run_id: runId,
    severity: audit.severity,
    divergences: audit.divergences.length,
    buckets_active: audit.buckets_active,
    candidates_scanned: audit.candidates_scanned,
    llm_calls: llmCallsCount,
    tool_calls: toolCallsCount,
    queries: queriesCount,
    pr: prUrl,
    rationale: audit.rationale,
  };
}

type DecisionDetailRow = {
  id: string;
  did: string;
  reasoned: string;
  out_of_scope: string | null;
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

/** @description Stage 4: goal curto — apenas tarefa de alto nível, sem candidatos/buckets/SQL crit inline. Agente puxa tudo via tools + skill compose-audit-run. */
function buildGoal(input: { agentId: string; k: number }): string {
  return `# Auditoria agêntica de decisões (Stage 4)

Você é o auditor-agentic full. Diferente dos Stages anteriores, **não há candidatos, buckets, gabarito ou SQL crit pré-computados** no prompt. Você descobre tudo via tools.

## Tarefa

Audite o agente qualificador (pseudonimizado: \`${input.agentId}\`) desde o último checkpoint até agora. Devolva divergências, classificações, padrões, severity e rationale.

## Primeiros passos sugeridos

1. **Leia a skill principal**: \`read .agents/skills/compose-audit-run/SKILL.md\`. Lá tem o pipeline default + critérios pra divergir.
2. **Janela**: chame \`get_checkpoint()\`.
3. **Descoberta**: query D1 inicial pra puxar candidatos (filtro default no \`fluxo-default.md\`).
4. **Decida**: seguir o default ou divergir? Explique no \`rationale\` final.

## Caps duros

- \`query_decision_log\`: ${MAX_QUERIES_PER_RUN} queries/run, ${MAX_ROWS_PER_QUERY} rows/query, só SELECT em decision_log/lead, \`hipotese\` obrigatória.
- \`detect_divergences\`: ${input.k} por bucket.
- **Cap global**: ${MAX_TOOL_CALLS_TOTAL} tool calls totais. Acima disso, tools retornam erro — finalize com o que tem.

## Severity (sua decisão final, monitor obedece)

- \`critical\`: cross_bucket_signal != null **E** ≥20 decisões cross-bucket via query **E** ≥2 buckets **E** reasoning variado. Cria PR + Telegram.
- \`warn\`: pattern com promotion_recommendation=finding, confidence ≥ med, ≥2 buckets, mas sem ≥20 decisões cross-bucket. Cria PR.
- \`info\`: divergências isoladas, confidence low, ou amostra pequena. Sem PR.
- \`none\`: 0 candidatos (mesmo após expandir janela). Sem PR, sem update de checkpoint.

Default cético: **em dúvida, escolha menor severity**. Falso positivo crítico custa muito.

## Output

JSON puro entre \`---RESULT_START---\` e \`---RESULT_END---\`. Sem cerca markdown. Schema descrito no role e no SKILL.md de \`compose-audit-run\`. Não esqueça \`from_ts\`, \`to_ts\`, \`candidates_scanned\`, \`buckets_active\`, \`severity\`, \`rationale\`.`;
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

function validateSelectSql(sqlRaw: string): { sql: string; error?: undefined } | { error: string; sql?: undefined } {
  if (!sqlRaw) return { error: 'sql vazio' };
  const stripped = sqlRaw.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').trim();
  if (!stripped) return { error: 'sql só com comentários' };
  if (stripped.includes(';') && stripped.replace(/;\s*$/, '').includes(';')) {
    return { error: 'múltiplos statements não permitidos' };
  }
  const cleaned = stripped.replace(/;\s*$/, '');
  if (!/^\s*select\b/i.test(cleaned)) return { error: 'só SELECT é permitido' };

  const forbiddenKeywords = /\b(insert|update|delete|drop|create|alter|attach|pragma|vacuum|reindex|replace)\b/i;
  if (forbiddenKeywords.test(cleaned)) return { error: 'DML/DDL detectado — só SELECT puro é aceito' };

  const forbiddenTables = /\b(audit_run|decision_log_rejected)\b/i;
  if (forbiddenTables.test(cleaned)) return { error: 'queries em audit_run/decision_log_rejected bloqueadas' };

  const allowedFromTable = /\bfrom\s+(decision_log|lead)\b/i;
  if (!allowedFromTable.test(cleaned)) return { error: 'FROM precisa ser decision_log ou lead' };

  const limitMatch = cleaned.match(/\blimit\s+(\d+)\b/i);
  let finalSql = cleaned;
  if (!limitMatch) {
    finalSql = `${cleaned} LIMIT ${MAX_ROWS_PER_QUERY}`;
  } else {
    const lim = parseInt(limitMatch[1] ?? '0', 10);
    if (lim > MAX_ROWS_PER_QUERY) finalSql = cleaned.replace(/\blimit\s+\d+\b/i, `LIMIT ${MAX_ROWS_PER_QUERY}`);
  }
  return { sql: finalSql };
}

function sanitizeId(input: string): string {
  return input.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 60);
}

function renderStage4Analysis(runId: string, audit: AgenticStage4Output): string {
  const lines: string[] = [];
  lines.push(`# Auditor Stage 4 — run ${runId}`);
  lines.push('');
  lines.push(`**Janela**: ${new Date(audit.from_ts).toISOString()} → ${new Date(audit.to_ts).toISOString()}`);
  lines.push(`**Candidatos**: ${audit.candidates_scanned} | **Buckets ativos**: ${audit.buckets_active}`);
  lines.push(`**Severity**: \`${audit.severity}\``);
  lines.push('');
  lines.push(`**Rationale do agente**: ${audit.rationale}`);
  lines.push('');
  if (audit.cross_bucket_signal) {
    lines.push(`## Cross-bucket signal`);
    lines.push('');
    lines.push(audit.cross_bucket_signal);
    lines.push('');
  }
  if (audit.patterns.length > 0) {
    lines.push(`## Patterns (${audit.patterns.length})`);
    lines.push('');
    for (const p of audit.patterns) {
      lines.push(`- **${p.type}** (confidence: ${p.confidence}, promotion: ${p.promotion_recommendation}, decisões: ${p.inferred_decisions}, buckets: ${p.affected_buckets.join(', ')})`);
      lines.push(`  ${p.description}`);
    }
    lines.push('');
  }
  if (audit.divergences.length > 0) {
    lines.push(`## Divergências (${audit.divergences.length})`);
    lines.push('');
    for (const d of audit.divergences) {
      lines.push(`- \`${d.bucket_key}\` / decisão \`${d.decision_id}\` — **${d.heuristic_ignored}** (${d.severity})`);
      lines.push(`  Evidência: ${d.evidence}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

function renderStage4Proposal(audit: AgenticStage4Output): string {
  const lines: string[] = [];
  lines.push(`# Propostas de ajuste`);
  lines.push('');
  const acted = audit.classifications.filter((c) => c.target !== 'inconclusive' && c.proposed_change && c.target_file);
  if (acted.length === 0) {
    lines.push('_Nenhuma proposta acionável (todas inconclusive ou sem suggestion)._');
    return lines.join('\n');
  }
  for (const c of acted) {
    lines.push(`## ${c.heuristic_ignored} → \`${c.target_file}\``);
    lines.push('');
    lines.push(`**Target**: \`${c.target}\``);
    lines.push(`**Rationale (classify)**: ${c.rationale}`);
    if (c.suggestion_rationale) lines.push(`**Rationale (suggest)**: ${c.suggestion_rationale}`);
    lines.push('');
    lines.push('### Mudança proposta');
    lines.push('');
    lines.push(c.proposed_change ?? '');
    lines.push('');
  }
  return lines.join('\n');
}

function renderStage4PrBody(runId: string, audit: AgenticStage4Output): string {
  return `## Auditor Stage 4 — run \`${runId}\`

**Severity**: \`${audit.severity}\`
**Janela**: ${new Date(audit.from_ts).toISOString()} → ${new Date(audit.to_ts).toISOString()}
**Candidatos**: ${audit.candidates_scanned} | **Buckets ativos**: ${audit.buckets_active}
**Divergências**: ${audit.divergences.length}

**Rationale do agente**:
> ${audit.rationale}

${audit.cross_bucket_signal ? `**Cross-bucket signal**: ${audit.cross_bucket_signal}\n\n` : ''}Detalhes em \`monitor-runs/${runId}/analysis.md\` e \`monitor-runs/${runId}/proposal.md\`.

---
🤖 Generated by auditor-agentic Stage 4`;
}
