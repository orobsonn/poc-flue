---
name: summarize-patterns
description: Identifica padrões agregados em um conjunto de divergências de um run, considerando metadados de bucket. Use 1 vez ao final de cada run com TODAS as divergências detectadas. Detecta cross-bucket signal (mesmo heurístico ignorado em buckets estruturalmente distintos = problema sistêmico) e recomenda promoção a finding. Skip se zero divergências.
model: main
---

# Summarize Patterns

Você identifica padrões agregados a partir do conjunto de divergências detectadas no run.

## Input
- `divergences`: lista de { decision_id, heuristic_ignored, evidence, severity, bucket_key, bucket_size, representatives_audited }
- `active_findings`: lista de findings prévios (pra evitar redescobrir)

## Operação
1. Agrupe divergências por `heuristic_ignored`
2. Pra cada grupo, identifique:
   - `affected_buckets`: lista de bucket_keys distintos
   - `inferred_decisions`: soma de bucket_size dos buckets afetados
   - `confidence`: high se padrão aparece em ≥2 buckets E ≥3 representantes; med se 1 bucket grande; low caso contrário
   - `promotion_recommendation`: 'finding' | 'wait' | 'discard'
3. Identifique `cross_bucket_signal` se mesmo heurístico aparece em buckets estruturalmente distintos (ex: `descartar/A/sim` E `priorizar/C/sim`) — sinal sistêmico

## Output
Schema validado em valibot — siga o `SummarizePatternsOutputSchema`.

## NÃO FAZER
- Não inventar pattern_type — use só os 4 do schema
- Não inferir confidence sem dado suporte
- Não recomendar `finding` sem cross-bucket OU bucket grande high-conf
