# Queries de tendência cross-janela

Os 3 sinais que o pipeline v0.2 pré-computava via `runSqlCriteria`. Quando relevantes pra severity do run, vale rodar uma dessas queries.

## 1. `regression` — taxa de contradição (descartar+A OU priorizar+C)

**Hipótese**: o agente está flip-against-tier mais nessa janela que em janelas anteriores.

**Query** (substitua `<agent_id>`, `<from_ts>`, `<to_ts>`, `<size_ms>` pelos timestamps do prompt):

```sql
SELECT
  CASE WHEN ts > <from_ts> THEN 'atual' ELSE 'anterior' END AS janela,
  COUNT(*) AS total,
  SUM(CASE WHEN (judgment_outcome = 'descartar' AND objective_tier = 'A')
              OR (judgment_outcome = 'priorizar' AND objective_tier = 'C')
           THEN 1 ELSE 0 END) AS contradicoes,
  SUM(CASE WHEN (judgment_outcome = 'descartar' AND objective_tier = 'A')
              OR (judgment_outcome = 'priorizar' AND objective_tier = 'C')
           THEN 1 ELSE 0 END) * 100.0 / COUNT(*) AS contradicao_pct
FROM decision_log
WHERE agent_id = '<agent_id>'
  AND ts > <from_ts - size_ms> AND ts <= <to_ts>
GROUP BY 1
ORDER BY 1;
```

**Critério v0.2**: se `atual.contradicao_pct > anterior.contradicao_pct + 5pp`, marca `regression: triggered`. Use isso como benchmark mas confie no seu julgamento — diferença pequena com amostra pequena pode ser ruído.

## 2. `out_of_scope_growth` — crescimento de OOS

**Hipótese**: o agente está marcando `out_of_scope` em mais decisões — indica que critérios da rubrica estão ficando insuficientes pro material que chega.

**Query**:

```sql
SELECT
  CASE WHEN ts > <from_ts> THEN 'atual' ELSE 'anterior' END AS janela,
  COUNT(*) AS total,
  SUM(has_out_of_scope) AS oos,
  SUM(has_out_of_scope) * 100.0 / COUNT(*) AS oos_pct
FROM decision_log
WHERE agent_id = '<agent_id>'
  AND ts > <from_ts - size_ms> AND ts <= <to_ts>
GROUP BY 1
ORDER BY 1;
```

**Critério v0.2**: se `atual.oos_pct > anterior.oos_pct + 5pp`, marca `out_of_scope_growth: triggered`.

## 3. `budget_blow` — custo médio aumentou

**Hipótese**: custo unitário por decisão subiu — geralmente indica que o agente está re-fazendo trabalho, fazendo retries, ou consumindo mais tokens em reasoning.

**Query**:

```sql
SELECT
  CASE WHEN ts > <from_ts> THEN 'atual' ELSE 'anterior' END AS janela,
  COUNT(*) AS total,
  AVG(cost_usd) AS cost_avg,
  AVG(duration_ms) AS duration_avg
FROM decision_log
WHERE agent_id = '<agent_id>'
  AND ts > <from_ts - size_ms> AND ts <= <to_ts>
GROUP BY 1
ORDER BY 1;
```

**Critério v0.2**: se `atual.cost_avg > anterior.cost_avg * 1.30` (30% acima), marca `budget_blow: triggered`.

## Como integrar no output

Se uma query revela tendência, registre no campo `description` do pattern correspondente em `summarize_patterns`, OU mais forte: use no `cross_bucket_signal` se a tendência cruzar múltiplos buckets.

Exemplo:
- Detectou H6 ignorado em `descartar/A/0` no run atual + query mostrou `contradicao_pct` saltou de 2% pra 18% vs janela anterior → cross_bucket_signal = "Taxa de contradição contra tier subiu 16pp na janela atual; H6 e H5 ignorados em buckets distintos sugere problema sistêmico no prompt, não ruído pontual."

Esse é o tipo de conclusão que justifica `severity: critical` mesmo sem promotion_recommendation explícito.
