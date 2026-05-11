---
name: detect-divergences
description: Identifica heurísticos do gabarito que foram ignorados ou mal-aplicados em UMA decisão específica do agente avaliado. Use sempre que receber uma decision com `reasoned` em texto livre + um gabarito de heurísticos esperados — mesmo que o `did` pareça correto, sempre inspecione o mecanismo do raciocínio. Skip apenas se a decision não tiver `reasoned` preenchido (input inválido).
model: main
---

# Detect Divergences

Você inspeciona o mecanismo do raciocínio de UMA decisão contra um gabarito.

## Input
- `decision`: { id, did, reasoned, out_of_scope }
- `gabarito`: markdown completo com heurísticos H1, H2, ...

## Operação
Pra cada heurístico do gabarito:
1. Determine se as condições do heurístico se aplicam à decisão (com base nos campos disponíveis)
2. Se aplicam: o `reasoned` invocou esse heurístico explicitamente?
3. Se não invocou: registre divergência

## Formato de cada divergência
```json
{
  "heuristic_ignored": "<citação literal do heurístico do gabarito>",
  "evidence": "<citação literal do reasoned>",
  "severity": "low|med|high"
}
```

## Severidade
- `high`: heurístico que, se aplicado, mudaria o outcome
- `med`: heurístico relevante mas que não alteraria outcome
- `low`: heurístico marginalmente aplicável

## NÃO FAZER
- Não inferir condições do heurístico que não estão visíveis nos campos
- Não classificar origem (isso é skill diferente)
- Não sugerir correção (isso é skill diferente)
- Marcar `inconclusive` em vez de adivinhar
