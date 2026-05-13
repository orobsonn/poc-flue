---
name: investigate-data
description: Como investigar tendências e padrões cross-janela no D1 do qualificador usando a tool `query_decision_log(sql)`. Útil pra detectar regressão, growth de out_of_scope, blow-out de custo, ou validar se um padrão observado no run atual aparece em janelas anteriores. NÃO é um tool — é conhecimento ambiente. A tool tem cap (10 queries/run, max 100 rows, só SELECT em decision_log/lead). Use antes de finalizar o summarize quando quiser confirmar se um padrão é sistêmico ou pontual. Consulte `.agents/skills/investigate-data/references/` pra queries prontas (tendência) e padrões de exploração ad-hoc.
model: main
---

# Investigate Data

Você tem acesso direto ao D1 do agente qualificador via tool `query_decision_log(sql)`. Use pra responder perguntas que os dados de candidatos no prompt não respondem por si só.

## Quando vale fazer query

- **Antes de finalizar**: verificar se o padrão detectado no run atual é tendência (`regression`, `out_of_scope_growth`) ou ruído pontual. Sem isso, severity fica calibrada só com 1 janela.
- **Validação cross-bucket**: se 2 buckets diferentes mostram o mesmo heurístico ignorado, vale ver se outras decisões fora dos buckets ativos também ignoram o mesmo heurístico.
- **Investigação de outlier**: se 1 decisão tem reasoning bizarro, vale ver se aquele lead (`lead_id`) aparece em outras decisões do agente — pode revelar problema sistêmico com aquele perfil.
- **Custo anômalo**: se uma decisão tem `cost_usd` ou `duration_ms` atípico, vale comparar com janela anterior.

## Quando NÃO fazer query

- Você já tem evidência suficiente do conjunto inline no prompt — não desperdice o cap.
- Pra olhar **as decisões individuais que estão no prompt** — elas já estão lá. Query é pra dados que NÃO vieram inline.
- Pra rodar consulta sem hipótese — "vou ver o que tem aí" é desperdício. Pergunte primeiro "que sinal eu quero confirmar?".

## Schema do D1 disponível (read-only)

```sql
-- 1 linha por decisão tomada pelo qualificador
decision_log (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,           -- epoch ms
  agent_id TEXT NOT NULL,        -- pseudonimizado (HMAC)
  thread_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  phase TEXT,
  did TEXT NOT NULL,             -- 'priorizar' | 'manter' | 'descartar' (texto do outcome)
  reasoned TEXT NOT NULL,        -- raciocínio articulado X porque Y → Z
  out_of_scope TEXT,             -- preenchido quando faltou dado pra aplicar heurístico
  tools_called TEXT,             -- JSON array de tools invocadas (raramente útil)
  duration_ms INTEGER,
  cost_usd REAL,
  model_main TEXT,
  expected_reasoning_ref TEXT,
  outcome TEXT,
  outcome_source TEXT,
  objective_tier TEXT NOT NULL,  -- 'A' | 'B' | 'C' (score objetivo da rubrica)
  judgment_outcome TEXT NOT NULL,-- 'priorizar' | 'manter' | 'descartar' (canônico)
  has_out_of_scope INTEGER NOT NULL DEFAULT 0,  -- 0 ou 1
  lead_id TEXT
);

-- 1 linha por lead avaliado
lead (
  id TEXT PRIMARY KEY,
  segmento TEXT,
  faturamento_band TEXT,
  time_vendas TEXT,
  ferramentas TEXT,
  sinal TEXT,
  fundador_tecnico INTEGER,
  menciona_dor INTEGER,
  contexto_livre_sanitized TEXT
);
```

Índices úteis: `idx_decision_log_window(agent_id, ts)`, `idx_decision_log_bucket(judgment_outcome, objective_tier, has_out_of_scope)`, `idx_decision_log_lead(lead_id)`.

## Restrições duras da tool

- Só `SELECT` (DML/DDL rejeitados pelo parser).
- Só `FROM decision_log` ou `FROM lead` (ou JOIN entre os dois). `audit_run` e `decision_log_rejected` são bloqueados — não interessam.
- `LIMIT 100` é forçado (queries sem LIMIT recebem `LIMIT 100` adicionado).
- Timeout 5s.
- Cap de 10 queries por run — gaste com hipótese clara.

## Exemplos rápidos

### 1. Comparar % out_of_scope janela atual vs anterior

Use quando quiser saber se OOS está crescendo.

```sql
SELECT
  CASE WHEN ts > ? THEN 'atual' ELSE 'anterior' END AS janela,
  COUNT(*) AS total,
  SUM(has_out_of_scope) AS oos,
  SUM(has_out_of_scope) * 100.0 / COUNT(*) AS oos_pct
FROM decision_log
WHERE agent_id = ? AND ts > ? AND ts <= ?
GROUP BY 1;
```

(Parâmetros são strings — o agente substitui pelos timestamps reais lidos do prompt.)

### 2. Heurístico ignorado em outros buckets

Se você detectou H6 ignorado em `descartar/A/0`, vale ver se aparece em outras combinações.

```sql
SELECT judgment_outcome, objective_tier, has_out_of_scope, COUNT(*) AS n
FROM decision_log
WHERE agent_id = ? AND reasoned LIKE '%tier A%' AND reasoned LIKE '%descomprometimento%'
GROUP BY 1,2,3;
```

### 3. Quantos leads únicos vs decisões repetidas

```sql
SELECT lead_id, COUNT(*) AS decisoes
FROM decision_log
WHERE agent_id = ? AND ts > ?
GROUP BY lead_id
HAVING COUNT(*) > 1
ORDER BY decisoes DESC
LIMIT 20;
```

## Como pensar antes de cada query

1. **Qual a hipótese?** Escreva (mesmo só pra você no thinking): "Hipótese: o heurístico X foi violado em mais de N decisões fora desse bucket."
2. **Que coluna distingue?** A query precisa de uma coluna binária ou agregada que confirme/refute.
3. **Que LIMIT esperar?** Se a hipótese é "padrão sistêmico", espera > 5 rows. Se é "outlier", espera 0-1.
4. **Após o resultado**, escreva o que aprendeu — esse aprendizado vai pro `description` do pattern em `summarize_patterns` ou pro `cross_bucket_signal`.

## Antes de promover a `cross_bucket_signal`

`cross_bucket_signal` é o gatilho de `severity=critical` no run e dispara PR + alerta Telegram. **Não promova sem evidência de volume.** Regras duras:

1. **Amostra mínima — 20 decisões agregadas nas duas janelas**: pra afirmar "padrão sistêmico" (ex: "X% das decisões `descartar/A` mencionam Y"), o conjunto agregado (janela atual + janela anterior, ou cross-bucket) precisa ter **≥ 20 decisões reais** vindas de query — não da lista inline. Abaixo disso, marque `confidence: low` no pattern e use linguagem de **hipótese** (`indica padrão a confirmar em próxima janela`, não `padrão sistêmico confirmado`).
2. **N na lista de candidatos inline ≠ evidência cross-bucket**: os 9-20 candidatos do prompt já passaram pelo filtro de bucketing. Eles **não** representam o universo. Se a query retornou 4 decisões anteriores + os 5 candidatos atuais, isso é 9 — fica abaixo do mínimo.
3. **Reasoning literal vindo de template fixo**: se o `reasoned` que sustenta o padrão é frase-cópia (ex: `"descartar mesmo tier A — interlocutor sinalizou descomprometimento na call"` aparecendo idêntico em todas as decisões), suspeite de **gerador sintético** — não vire `cross_bucket_signal` baseado nisso. Note no `description` que o padrão pode ser artefato.
4. **Quando vale `cross_bucket_signal`**: 2+ buckets estruturalmente distintos (ex: `descartar/A/0` E `priorizar/A/1`) mostrando o mesmo heurístico ignorado, **com ≥ 20 decisões na agregação cross-bucket via query**, E reasonings variados (não template). Sem os 3 critérios, mantenha o achado dentro de `patterns[]` com `promotion_recommendation: 'wait'` e descrição cautelosa.

Quando em dúvida, **prefira `null`** em `cross_bucket_signal` e deixe o pattern em `patterns[]` com `confidence: low`. Falso positivo crítico custa muito mais que falso negativo no Stage 3 (PR + Telegram disparados a toa).

Pra exemplos detalhados de cada tipo de query, leia via tool `read` (paths absolutos no sandbox):
- `.agents/skills/investigate-data/references/queries-de-tendencia.md` — métricas cross-janela (regression, oos_growth, budget_blow)
- `.agents/skills/investigate-data/references/queries-de-exploracao.md` — investigação ad-hoc (outlier, repetição, cross-bucket)
