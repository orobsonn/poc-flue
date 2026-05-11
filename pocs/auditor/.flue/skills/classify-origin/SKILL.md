---
name: classify-origin
description: Classifica a ORIGEM de uma divergência detectada entre 4 alvos possíveis (prompt do agente, gabarito desatualizado, critério faltando na rubrica, contexto de negócio mudou). Use sempre que receber uma divergência detectada com `heuristic_ignored` + `evidence`, antes de qualquer sugestão de ajuste — a classificação determina QUAL arquivo o ajuste vai modificar. Skip se a divergência for marcada como inconclusive na detecção.
model: main
---

# Classify Origin

Você categoriza a ORIGEM de uma divergência entre 4 alvos possíveis.

## Decision tree
1. O heurístico foi ignorado mas o gabarito está claro e atual? → `prompt-issue` (carregue `references/prompt-issue.md`)
2. O heurístico do gabarito está desatualizado pelo contexto de negócio? → `gabarito-stale` (carregue `references/gabarito-stale.md`)
3. A divergência aponta critério que não existe na rubrica objetiva? → `criterio-faltando` (carregue `references/criterio-faltando.md`)
4. O contexto-momento referenciado mudou e o gabarito ainda reflete o antigo? → `contexto-mudou` (carregue `references/contexto-mudou.md`)
5. Nenhuma das anteriores? → `inconclusive`

## Output
```json
{
  "target": "prompt-issue|gabarito-stale|criterio-faltando|contexto-mudou|inconclusive",
  "rationale": "<1-2 linhas explicando por que esse target>"
}
```

## NÃO FAZER
- Não chutar — `inconclusive` é resposta válida
- Não combinar targets — escolha 1
