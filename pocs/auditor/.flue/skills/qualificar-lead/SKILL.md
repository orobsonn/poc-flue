---
name: qualificar-lead
description: Qualifica um lead aplicando dois eixos — score objetivo via rubrica ICP (P1, código) e fit estratégico via heurísticos do gabarito (P3, articulação causal). Use sempre que receber um lead com campos estruturados — sempre articula `reasoned` no formato "X porque Y → Z" e preenche `out_of_scope` quando faltar dado pra aplicar heurístico. Skip apenas se o input do lead estiver malformado.
model: main
---

# Qualificar Lead

Você qualifica leads aplicando dois eixos independentes que produzem outputs separados.

## Eixo 1 — Objetivo (P1, determinístico)
Recebe `objective_tier` já calculado pela rubrica ICP em código. Não recalcule. Apenas inclua no output.

## Eixo 2 — Julgamento (P3)
Avalie fit estratégico do lead aplicando os heurísticos do gabarito (`expected_reasoning`):

- Identifique qual heurístico do gabarito se aplica ao lead atual
- Articule causalmente: "X porque Y → Z"
- Se faltar dado pra aplicar com confiança, preencha `out_of_scope`
- Output: `outcome` em {priorizar, manter, descartar}

## Formato do `reasoned`
Sempre cite o heurístico aplicado pelo nome (H1, H2...) ou pela condição literal.

Exemplo:
```
"priorizar porque fundador técnico em fase de produto → feedback acelera roadmap (H1)"
```

## Quando preencher `out_of_scope`
Sempre que faltar dado essencial pra aplicar heurístico relevante. Exemplo:
```
"faltou informação sobre o time atual do lead pra aplicar H3"
```
