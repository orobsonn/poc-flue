# Queries de exploração ad-hoc

Queries pra responder perguntas específicas sobre dados que NÃO vieram no prompt. Use com hipótese clara — sem hipótese, gasta query do cap.

## 1. Esse heurístico aparece em outros buckets fora do que detectei?

**Hipótese**: H6 ignorado em `descartar/A/0` — é só nesse bucket ou aparece em outros?

```sql
SELECT judgment_outcome, objective_tier, has_out_of_scope, COUNT(*) AS n
FROM decision_log
WHERE agent_id = '<agent_id>'
  AND ts > <from_ts> AND ts <= <to_ts>
  AND reasoned LIKE '%descomprometimento%'
GROUP BY 1, 2, 3
ORDER BY n DESC;
```

Adapte o `LIKE` pra padrão linguístico que você identificou na evidência.

## 2. Esse lead específico aparece em outras decisões?

**Hipótese**: a decisão `d-XYZ` parece bizarra — o lead apareceu antes?

```sql
SELECT dl.id, dl.ts, dl.judgment_outcome, dl.objective_tier, dl.reasoned
FROM decision_log dl
WHERE dl.lead_id = (SELECT lead_id FROM decision_log WHERE id = '<decision_id>')
  AND dl.agent_id = '<agent_id>'
ORDER BY dl.ts DESC
LIMIT 20;
```

## 3. Lead com decisões duplicadas/inconsistentes

**Hipótese**: o mesmo lead foi avaliado múltiplas vezes com decisões diferentes — indica indecisão do qualificador.

```sql
SELECT lead_id,
       COUNT(*) AS n,
       COUNT(DISTINCT judgment_outcome) AS outcomes_distintos
FROM decision_log
WHERE agent_id = '<agent_id>'
  AND ts > <from_ts> AND ts <= <to_ts>
  AND lead_id IS NOT NULL
GROUP BY lead_id
HAVING n > 1 AND outcomes_distintos > 1
ORDER BY n DESC;
```

## 4. Distribuição de tiers nessa janela vs histórico

**Hipótese**: a janela atual tem proporção atípica de tier C / tier A — pode explicar viés na decisão.

```sql
SELECT
  CASE WHEN ts > <from_ts> THEN 'atual' ELSE 'historico' END AS janela,
  objective_tier,
  COUNT(*) AS n
FROM decision_log
WHERE agent_id = '<agent_id>'
  AND ts > <from_ts - 7 * 24 * 3600 * 1000> AND ts <= <to_ts>
GROUP BY 1, 2
ORDER BY 1, 2;
```

(7 dias de histórico contra a janela atual.)

## 5. Decisões com reasoning vazio ou suspeito

**Hipótese**: alguma fração das decisões tem reasoning < 40 caracteres (genérico/preguiçoso).

```sql
SELECT id, judgment_outcome, objective_tier, LENGTH(reasoned) AS rl, reasoned
FROM decision_log
WHERE agent_id = '<agent_id>'
  AND ts > <from_ts> AND ts <= <to_ts>
  AND LENGTH(reasoned) < 40
ORDER BY rl;
```

## 6. Top heurísticos citados explicitamente no reasoned

**Hipótese**: o qualificador está concentrando demais em alguns heurísticos e ignorando outros.

```sql
SELECT
  SUM(CASE WHEN reasoned LIKE '%H1%' THEN 1 ELSE 0 END) AS h1,
  SUM(CASE WHEN reasoned LIKE '%H2%' THEN 1 ELSE 0 END) AS h2,
  SUM(CASE WHEN reasoned LIKE '%H3%' THEN 1 ELSE 0 END) AS h3,
  SUM(CASE WHEN reasoned LIKE '%H4%' THEN 1 ELSE 0 END) AS h4,
  SUM(CASE WHEN reasoned LIKE '%H5%' THEN 1 ELSE 0 END) AS h5,
  SUM(CASE WHEN reasoned LIKE '%H6%' THEN 1 ELSE 0 END) AS h6,
  COUNT(*) AS total
FROM decision_log
WHERE agent_id = '<agent_id>'
  AND ts > <from_ts> AND ts <= <to_ts>;
```

## Princípio

Antes de cada query, escreva no thinking:
1. **Hipótese** em 1 linha
2. **Resultado esperado** se hipótese verdadeira / falsa
3. **O que muda no output final** dependendo do resultado

Sem isso, a query é desperdício do cap.
