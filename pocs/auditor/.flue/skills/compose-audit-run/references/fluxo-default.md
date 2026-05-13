# Pipeline default — passo a passo

Sequência sensata pra começar. Cada passo lista as tools envolvidas e o SQL literal quando aplicável.

## Passo 0 — Setup

Você não precisa de input do prompt principal. Tudo vem de tools.

## Passo 1 — Janela temporal

Chame `get_checkpoint()`. Retorna:

```json
{
  "agent_id": "<hash hmac do qualificador>",
  "last_processed_ts": <number|null>,
  "now": <number>
}
```

- Se `last_processed_ts` existe: `fromTs = last_processed_ts`.
- Se é `null` (primeiro run): `fromTs = now - 6 * 3600 * 1000`.
- `toTs = now`.

**Anote**: o `from_ts` e `to_ts` que você escolheu vão pro output final.

## Passo 2 — Filtro de candidatos

Query default (substitua `?` pelos valores reais):

```sql
SELECT
  decision_log.id, decision_log.did, decision_log.reasoned, decision_log.out_of_scope,
  decision_log.objective_tier, decision_log.judgment_outcome, decision_log.has_out_of_scope,
  decision_log.cost_usd, decision_log.duration_ms,
  lead.id AS lead_id, lead.segmento, lead.faturamento_band, lead.time_vendas,
  lead.ferramentas, lead.sinal, lead.fundador_tecnico, lead.menciona_dor,
  lead.contexto_livre_sanitized
FROM decision_log
LEFT JOIN lead ON decision_log.lead_id = lead.id
WHERE decision_log.agent_id = '<agent_id>'
  AND decision_log.ts > <fromTs>
  AND decision_log.ts <= <toTs>
  AND (
    decision_log.has_out_of_scope = 1
    OR (decision_log.judgment_outcome = 'descartar' AND decision_log.objective_tier = 'A')
    OR (decision_log.judgment_outcome = 'priorizar' AND decision_log.objective_tier = 'C')
  )
LIMIT 100
```

Hipótese a registrar: "puxar candidatos suspeitos da janela (flip contra tier + out_of_scope) pra auditoria".

- Se retornou 0 rows: **expanda janela pra `now - 24h`** antes de declarar `no-candidates`.
- Se retornou >50 rows: você está saturando o `LIMIT 100`. Considere apertar o filtro (ex. excluir `has_out_of_scope=1` em decisões `priorizar/A` que provavelmente são ruído).

## Passo 3 — Bucketing

Agrupe em memória por `(judgment_outcome, objective_tier, has_out_of_scope)`. Buckets "tranquilos" pulam:

- `priorizar/A/0` (esperado — tier A com flag limpa)
- `manter/B/0` (esperado — tier B com flag limpa)
- `descartar/C/0` (esperado — tier C com flag limpa)

Buckets restantes são "ativos". Min sample = 5 decisões por bucket (regra default — pode flexibilizar pra 3 se nenhum bucket atinge 5, mas marque `confidence: low`).

## Passo 4 — Sample por bucket

Pra cada bucket ativo, escolha até 3 representantes via skill `choose-representatives` (auto-injetada). Critérios resumidos:

1. Triage por divergência aparente: flip contra tier, justificativa subjetiva sem heurístico, contradição interna, OOS suspeito.
2. Se há ≥1 suspeita, prefira suspeitas.
3. Desempate por diversidade de lead.

Pra cada escolhido, chame `detect_divergences(decision_id)`.

## Passo 5 — Classify + suggest

Dedup primeiro: agrupe divergências por `(heuristic_ignored, bucket_key)`. Uma classificação por par único.

Pra cada divergência única, chame em sequência:

1. `classify_origin(decision_id, bucket_key, heuristic_ignored, evidence, severity)`
2. Se `target != "inconclusive"`: `suggest_adjustment(decision_id, bucket_key, heuristic_ignored, evidence, severity, target)`

## Passo 6 — Investigação cross-janela (1-3 queries)

Antes do summarize, valide com queries D1. Consulte a skill `investigate-data` pra schema completo e queries prontas. Sugestões:

- **Regressão de tier A descartado**: comparar `% descartar/A` na janela atual vs anterior do mesmo tamanho.
- **OOS growth**: comparar `% has_out_of_scope=1` cross-janela.
- **Cross-bucket do heurístico mais comum**: se H_x apareceu ignorado em 2 buckets, confirmar via query se aparece em mais.

Cada query precisa de `hipotese` (string). Sem hipótese, tool rejeita.

## Passo 7 — Summarize

Chame `summarize_patterns(divergences)` passando o array deduplicado. A skill retorna:

```json
{
  "patterns": [
    {
      "type": "mechanism-divergence" | ...,
      "description": "...",
      "affected_buckets": [...],
      "inferred_decisions": N,
      "confidence": "high"|"med"|"low",
      "promotion_recommendation": "finding"|"wait"|"discard"
    }
  ],
  "cross_bucket_signal": <string|null>
}
```

## Passo 8 — Severity

Aplique a regra do SKILL.md principal:

- `critical` apenas com `cross_bucket_signal != null` E ≥20 decisões agregadas via query E ≥2 buckets E reasoning variado.
- `warn` se há `promotion_recommendation: finding` com `confidence ≥ med` em ≥2 buckets.
- `info` no resto.
- `none` se 0 candidatos.

## Passo 9 — Output

Devolva o objeto final no schema. Inclua `from_ts`, `to_ts`, `candidates_scanned` (rows da query do passo 2), `buckets_active` (count após filtro de min sample), `divergences`, `classifications`, `patterns`, `cross_bucket_signal`, `severity`, e `rationale` curto.
