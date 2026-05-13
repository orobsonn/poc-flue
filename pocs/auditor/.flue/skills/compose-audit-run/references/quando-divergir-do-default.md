# Quando divergir do default

O pipeline default cobre o caso "auditar suspeitas de flip + OOS". Mas há sinais que justificam outro recorte. Sempre que divergir, registre o motivo em `output.rationale` (1-2 frases) — é assim que humano entende sua escolha.

## Sinal 1 — Janela vazia no filtro padrão

**Observação**: query do passo 2 retorna 0 rows.

**Ação**: NÃO devolva `no-candidates` imediatamente. Expanda a janela em ordem:

1. `fromTs = now - 24 * 3600 * 1000` (24h, em vez de 6h ou último checkpoint).
2. Se ainda 0 rows: relax o filtro — drope `(descartar AND tier='A')` ou `(priorizar AND tier='C')` e fique só com `has_out_of_scope=1`.
3. Se ainda 0 rows: aceite `none` e devolva `severity: "none"`.

Anote `rationale: "janela vazia em filtro padrão; expandi pra 24h e ainda assim 0 candidatos"`.

## Sinal 2 — Nenhum bucket atinge min sample 5

**Observação**: você tem candidatos mas nenhum bucket tem ≥5 decisões.

**Ação**: rode com min sample = 3 mas marque toda classificação resultante como `confidence: low` no pattern, e use linguagem de hipótese (`"indica padrão a confirmar"`, não `"padrão sistêmico"`). NÃO promova `cross_bucket_signal`.

Rationale: `"buckets pequenos (max=N decisões); baixei min sample pra 3 com confidence: low em todas as patterns"`.

## Sinal 3 — Saturando LIMIT 100

**Observação**: query do passo 2 retorna 100 rows (LIMIT atingido). Você não viu o universo completo.

**Ação**: aperte o filtro com hipótese específica. Exemplos:

- Excluir buckets já saturados de OOS: `AND NOT (has_out_of_scope = 1 AND judgment_outcome = 'manter')`.
- Filtrar pelos `out_of_scope` reasoning textuais mais comuns: rode 1 query agregada antes pra ver os top 3 textos de `out_of_scope` e exclua os "OK" conhecidos.

Rationale: `"100 rows no filtro inicial — restringi pra buckets de flip puro pra evitar dispersão de cap"`.

## Sinal 4 — Anomalia em bucket "tranquilo"

**Observação**: durante a query inicial você nota >70% das decisões em `priorizar/A/0` (esperado/tranquilo) com `reasoned` curtíssimo (< 30 chars) ou citando heurístico inexistente no gabarito.

**Ação**: trate como bucket ativo extraordinário. Faça query específica:

```sql
SELECT id, reasoned, lead_id
FROM decision_log
WHERE agent_id = ? AND ts > ? AND ts <= ?
  AND judgment_outcome = 'priorizar' AND objective_tier = 'A' AND has_out_of_scope = 0
  AND LENGTH(reasoned) < 30
LIMIT 30
```

Aplique `detect_divergences` em alguns. Patterns desse bucket vão pra `patterns[]` com `description` explicitando "encontrado fora dos buckets de flip — sinal de erosão em decisão de baseline".

Rationale: `"detectei anomalia em priorizar/A/0 (bucket tranquilo) — reasoning curto/genérico em >70% das decisões; investiguei como bucket extraordinário"`.

## Sinal 5 — Outlier de custo/latência

**Observação**: você quer validar se o qualificador degradou em custo. Query agregada:

```sql
SELECT
  CASE WHEN ts > ? THEN 'atual' ELSE 'anterior' END AS janela,
  AVG(cost_usd) AS avg_cost, MAX(cost_usd) AS max_cost,
  AVG(duration_ms) AS avg_dur, MAX(duration_ms) AS max_dur, COUNT(*) AS n
FROM decision_log
WHERE agent_id = ? AND ts > ? AND ts <= ?
GROUP BY 1
```

Se `max_cost atual > 3 × max_cost anterior`: emita um pattern `type: "criterio-faltando"` com `description` mencionando o blow-out de custo (mesmo que não haja heurístico ignorado — é sinal de regressão de eficiência).

Rationale: `"custo máximo da janela atual = N × o da anterior; sinalizei como pattern adicional pra investigação humana"`.

## Sinal 6 — Reasoning idêntico em volume

**Observação**: muitas decisões têm `reasoned` byte-idêntico (sintoma de template/gerador sintético OU agente travado num único raciocínio).

**Ação**: NÃO promova `cross_bucket_signal` baseado em padrão de template. Inclua nota em `pattern.description`: `"reasoning literal idêntico em N decisões — pode ser template do gerador, não viés real. Confirme com humano antes de tratar como sistêmico."`.

Rationale: `"reasoning idêntico em N de M decisões; padrão pode ser artefato — mantive severity baixa apesar do volume"`.

## Princípio geral

Divergir do default é OK, **desde que você explique no `rationale`**. O monitor não consegue revisar sua lógica — humano lendo o PR depende do `rationale` pra confiar nas escolhas. Frases curtas, factuais, sem floreio.
