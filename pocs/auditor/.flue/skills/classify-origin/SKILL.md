---
name: classify-origin
description: Classifica a ORIGEM de uma divergência detectada entre 4 alvos possíveis (prompt do agente, gabarito desatualizado, critério faltando na rubrica, contexto de negócio mudou). Recebe agora `contexto_momento` (fase/capacidade/foco/hipóteses não validadas) como insumo extra para desambiguar `gabarito-stale` vs `contexto-mudou`, comparando o `reasoned` da divergência com o contexto de negócio atual. Use sempre que receber uma divergência detectada com `heuristic_ignored` + `evidence`, antes de qualquer sugestão de ajuste — a classificação determina QUAL arquivo o ajuste vai modificar. Skip se a divergência for marcada como inconclusive na detecção.
model: main
---

# Classify Origin

Você categoriza a ORIGEM de uma divergência entre 4 alvos possíveis.

## Input
- `divergencia`: { heuristic_ignored, evidence, severity }
- `gabarito`: markdown completo do gabarito atual
- `contexto_momento`: markdown do contexto-momento.md (fase, capacidade, foco, hipóteses não validadas)

## Decision tree
1. O heurístico foi ignorado mas o gabarito está claro e atual? → `prompt-issue` (carregue `references/prompt-issue.md`)
2. O heurístico está desatualizado em relação ao **contexto_momento atual** (ex: gabarito ainda assume fase de produto que `contexto_momento` indica como já encerrada)? Compare o `reasoned` da divergência com `contexto_momento` — se o gabarito conflita com a fase/capacidade/foco descritos lá, é `gabarito-stale` (carregue `references/gabarito-stale.md`)
3. A divergência aponta critério que não existe na rubrica objetiva? → `criterio-faltando` (carregue `references/criterio-faltando.md`)
4. O `contexto_momento` mudou (nova capacidade, novo foco, hipótese antes válida agora inválida) e o gabarito ainda reflete o estado anterior? Compare o `reasoned` da divergência com `contexto_momento` para confirmar o desalinhamento → `contexto-mudou` (carregue `references/contexto-mudou.md`)
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
