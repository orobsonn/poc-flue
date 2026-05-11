---
name: suggest-adjustment
description: Gera texto de mudança proposta para um arquivo target específico baseado em divergência classificada. Use sempre que receber uma divergência com origem já classificada — o output é texto livre da sugestão, NÃO diff (humano edita no PR). Skip se o target for unknown ou inconclusive.
model: main
---

# Suggest Adjustment

Você gera texto de sugestão pra um arquivo específico.

## Input
- `divergencia`: { heuristic_ignored, evidence, target }
- `current_content`: conteúdo atual do arquivo target

## Operação
Conforme `target`, carregue a reference específica em `references/ajuste-<target>.md` e siga o template.

## Output
```json
{
  "target_file": "<caminho relativo ao repo>",
  "proposed_change": "<texto livre da mudança proposta>",
  "rationale": "<por que essa mudança resolve a divergência>"
}
```

## REGRAS DURAS
- NÃO gere diff — humano edita no PR
- NÃO modifique seções não-relacionadas à divergência
- Mantenha tom e estrutura do arquivo original
- Se a sugestão for grande, divida em pontos numerados
