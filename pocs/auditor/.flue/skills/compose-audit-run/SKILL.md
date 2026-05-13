---
name: compose-audit-run
description: Como compor um run de auditoria do zero quando você (o agente) é responsável por decidir janela, filtro de candidatos, bucketing, ordem das skills e severity final. NÃO é tool — é conhecimento ambiente. Use no início do run pra montar plano antes de invocar tools. Default sugerido — janela do último checkpoint, filtro `has_out_of_scope=1 OR flip-contra-tier`, bucketing `judgment×tier×oos` — mas você pode divergir se os dados indicarem padrão fora desse recorte. Consulte `.agents/skills/compose-audit-run/references/fluxo-default.md` pro pipeline literal e `.agents/skills/compose-audit-run/references/quando-divergir-do-default.md` pros sinais que justificam outro recorte.
model: main
---

# Compose Audit Run

Você é o auditor-agentic Stage 4. Diferente dos Stages anteriores, o pipeline não vem pronto: você decide janela, filtro de candidatos, bucketing (ou ausência dele), e quando promover severity. O monitor imperativo só te dá `env` + `ctx` e espera o output final no schema.

## Inputs disponíveis (via tools, não inline)

- `get_checkpoint()` — retorna `{ agent_id, last_processed_ts, now }`. Use pra decidir janela.
- `read_r2(key)` — leia `expected-reasoning/qualificador/fit-estrategico.md` (gabarito) e `agents-config/qualificador/contexto-momento.md` antes de classificar/sugerir. Não os carregue por padrão — chame só quando precisar.
- `query_decision_log(sql, hipotese)` — SELECT em `decision_log`/`lead`. Cap 15 queries/run, 100 rows/query. **É assim que você descobre os candidatos no Stage 4** — não há lista inline.
- `detect_divergences`, `classify_origin`, `suggest_adjustment`, `summarize_patterns` — mesmas skills do Stage 3.

## Pipeline default sugerido

Esta é uma sequência sensata pra começar. Você pode (e deve) divergir se a primeira query indicar padrão diferente.

1. **Janela**: `get_checkpoint()` → `fromTs = last_processed_ts` (ou `now - 6h` se nunca rodou). `toTs = now`.
2. **Filtro de candidatos**: query D1 com `WHERE agent_id = ? AND ts > ? AND ts <= ? AND (has_out_of_scope = 1 OR (judgment_outcome='descartar' AND objective_tier='A') OR (judgment_outcome='priorizar' AND objective_tier='C'))`.
3. **Bucketing**: agrupe por `(judgment_outcome, objective_tier, has_out_of_scope)`. Buckets "tranquilos" (priorizar/A/0, manter/B/0, descartar/C/0) pulam.
4. **Min sample**: bucket precisa de ≥5 decisões pra entrar — abaixo disso, vira ruído.
5. **Escolha de representantes**: pra cada bucket ativo, escolha até 3 com a skill `choose-representatives` (auto-injetada). Chame `detect_divergences(decision_id)` em cada.
6. **Classify + suggest**: pra cada divergência única (dedup por `heuristic_ignored × bucket_key`), `classify_origin` → `suggest_adjustment` se target ≠ inconclusive.
7. **Investigação cross-janela**: 1-3 queries via `query_decision_log` pra validar tendência (regressão, oos growth, cross-bucket). Consulte `investigate-data` pra schema + queries prontas.
8. **Summarize**: `summarize_patterns(divergences)` → output final.

Detalhes literais do pipeline (incluindo SQL exato e checagens) em `.agents/skills/compose-audit-run/references/fluxo-default.md`.

## Quando vale divergir do default

O default não é regra — é baseline. Se ao olhar os dados via query inicial você notar:

- **Anomalia fora dos buckets de flip**: ex. 80% das decisões em `manter/B/0` (bucket "tranquilo") com reasoning citando heurístico nunca visto antes → vale investigar mesmo sendo tranquilo.
- **Volume insuficiente nos buckets de flip**: nenhum bucket atinge min sample 5 → considere baixar pra 3 com `confidence: low` em todas as classificações.
- **Janela vazia**: query inicial retorna 0 candidatos no filtro padrão → expanda a janela (até 24h) antes de declarar `no-candidates`.
- **Padrão de cost/latency atípico**: query agregada de `cost_usd`/`duration_ms` mostra outlier de >3× a mediana → investiga independente do bucket.

Sinais detalhados em `.agents/skills/compose-audit-run/references/quando-divergir-do-default.md`.

## Severity (você define, monitor age)

O monitor lê o `severity` que você devolve no output e decide PR/Telegram. Critérios:

- **`critical`**: `cross_bucket_signal != null` E (≥20 decisões na agregação cross-bucket via query) E (reasoning variado, não template) E (afeta ≥2 buckets estruturalmente distintos). Promove apenas com evidência sólida — falso positivo crítico custa muito mais que negativo. Detalhes em `investigate-data` "Antes de promover a cross_bucket_signal".
- **`warn`**: pattern com `promotion_recommendation: finding` E `confidence ≥ med` E afeta ≥2 buckets, mas sem ≥20 decisões cross-bucket. PR criado, Telegram silencioso.
- **`info`**: qualquer outra coisa (incluindo: divergências detectadas mas isoladas, confidence low, amostra pequena). Sem PR. Sem Telegram.
- **`none`**: nenhum candidato após filtro/investigação. Apenas atualiza checkpoint.

## Princípios não-negociáveis

- **Hipótese antes de query**: nunca rode SQL sem escrever 1 linha do que quer descobrir. Cap 15/run não dá pra desperdiçar.
- **Evidência literal**: cite reasoning do decision_log textualmente. Não parafraseie.
- **Dedup**: `(decision_id, heuristic_ignored)` único em divergences[]; múltiplos heurísticos da mesma decisão agregam em `pattern.description`.
- **Não invente bucketing**: se você decidir agrupar fora do default, registre o motivo em `pattern.description` — humano precisa entender por quê.
- **Sempre atualize checkpoint** ao final (o monitor faz isso lendo `to_ts` do output — devolva-o).

## Output final (schema)

```json
{
  "from_ts": <number>,
  "to_ts": <number>,
  "candidates_scanned": <number>,
  "buckets_active": <number>,
  "divergences": [...],
  "classifications": [...],
  "patterns": [...],
  "cross_bucket_signal": <string|null>,
  "severity": "critical"|"warn"|"info"|"none",
  "rationale": "<1-2 frases explicando suas escolhas de janela/filtro/bucketing se divergiu do default>"
}
```

Não escreva texto fora dos marcadores `---RESULT_START---` / `---RESULT_END---`. JSON puro, sem cerca markdown.
