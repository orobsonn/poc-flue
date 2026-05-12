export type SqlCriteriaResult = {
  out_of_scope_growth: { triggered: boolean; delta_pp?: number };
  regression: { triggered: boolean; delta_pct?: number };
  budget_blow: { triggered: boolean; delta_pct?: number };
};

export type ClassificationForRender = {
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

export type RunSummary = {
  severity: 'critical' | 'warn' | 'info';
  divergencesDetected: number;
  classifications: ClassificationForRender[];
  candidates: number;
  bucketCount: number;
  windowHours: number;
  topDivergence: ClassificationForRender | null;
  sqlCriteria: SqlCriteriaResult;
};

const AUDITED_AGENT_LABEL = 'qualificador/fit-estrategico';

function humanizeHeuristic(raw: string): string {
  const firstLine = raw.split('\n')[0]?.trim() ?? raw;
  return firstLine.replace(/^#+\s*/, '').trim();
}

function pickTopDivergence(classifications: ClassificationForRender[]): ClassificationForRender | null {
  if (classifications.length === 0) return null;
  const order = { high: 3, med: 2, low: 1 } as const;
  return [...classifications].sort((a, b) => {
    const sevDiff = order[b.div.severity] - order[a.div.severity];
    if (sevDiff !== 0) return sevDiff;
    return b.div.bucket_size - a.div.bucket_size;
  })[0] ?? null;
}

/** @description Sumário estruturado do run pra alimentar PR + Telegram (lead-first framing). */
export function buildRunSummary(input: {
  severity: 'critical' | 'warn' | 'info';
  fromTs: number;
  toTs: number;
  candidates: number;
  bucketEntries: Array<[string, unknown[]]>;
  divergencesDetected: number;
  classifications: ClassificationForRender[];
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

/** @description Render analysis.md — metadata do run + critérios SQL. */
export function renderAnalysis(input: {
  runId: string;
  fromTs: number;
  toTs: number;
  candidates: number;
  bucketEntries: Array<[string, unknown[]]>;
  sqlCriteria: SqlCriteriaResult;
  severity: string;
  modeNote?: string;
}): string {
  const sql = input.sqlCriteria;
  const sqlLines = [
    `- out_of_scope_growth: ${sql.out_of_scope_growth.triggered ? 'triggered' : 'ok'}${sql.out_of_scope_growth.delta_pp !== undefined ? ` (Δ ${sql.out_of_scope_growth.delta_pp.toFixed(1)}pp)` : ''}`,
    `- regression: ${sql.regression.triggered ? 'triggered' : 'ok'}${sql.regression.delta_pct !== undefined ? ` (Δ ${(sql.regression.delta_pct * 100).toFixed(1)}%)` : ''}`,
    `- budget_blow: ${sql.budget_blow.triggered ? 'triggered' : 'ok'}${sql.budget_blow.delta_pct !== undefined ? ` (Δ ${(sql.budget_blow.delta_pct * 100).toFixed(1)}%)` : ''}`,
  ].join('\n');
  const modeLine = input.modeNote ? `Modo: ${input.modeNote}\n` : '';
  return `# Run ${input.runId}\n\nWindow: ${new Date(input.fromTs).toISOString()} → ${new Date(input.toTs).toISOString()}\n\n${modeLine}Candidatos: ${input.candidates}\nBuckets ativos: ${input.bucketEntries.length}\nSeveridade: **${input.severity}**\n\n## Critérios SQL\n${sqlLines}\n`;
}

/** @description Render proposal.md — sugestões de ajuste agrupadas por heurístico. */
export function renderProposal(classifications: ClassificationForRender[]): string {
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

/** @description Mensagem Telegram — direta, lead-first, sem markdown pesado. */
export function renderTelegramMessage(runId: string, s: RunSummary, prUrl: string, auditorVariant: string): string {
  const lines = [
    `[${s.severity.toUpperCase()}] ${auditorVariant} • ${AUDITED_AGENT_LABEL}`,
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

/** @description Title do PR — auditorVariant[severity]: N divergências em <audited> (run <suffix>). */
export function renderPrTitle(runId: string, s: RunSummary, auditorVariant: string): string {
  return `${auditorVariant}[${s.severity}]: ${s.divergencesDetected} divergência${s.divergencesDetected === 1 ? '' : 's'} em ${AUDITED_AGENT_LABEL} (run ${runId.slice(-8)})`;
}

/** @description Body do PR — TL;DR, divergências, critérios SQL, run metadata. `modeNote` insere nota de modo (ex: Stage 1 do v0.3). */
export function renderPrBody(runId: string, s: RunSummary, options?: { modeNote?: string }): string {
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

  const modeSection = options?.modeNote
    ? ['## Modo', '', `_${options.modeNote}_`, '']
    : [];

  return [
    '## TL;DR', '', tldr, '',
    ...modeSection,
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
