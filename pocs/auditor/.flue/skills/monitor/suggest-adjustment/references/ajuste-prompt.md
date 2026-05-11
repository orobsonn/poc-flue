# Ajuste de Prompt

## Quando aplicar
Divergência classificada como `prompt-issue`. O Hx do gabarito está bom, mas o `SKILL.md` do `qualificar-lead` não força o agente a citá-lo quando a condição literal aplica. A sugestão é adicionar uma sub-seção "Quando aplicar Hx" no body do SKILL.md, com critério literal e exemplo de `reasoned` correto.

## Target file
`.flue/skills/qualificador/qualificar-lead/SKILL.md`

## Sinais positivos pra esse ajuste
- Hx está claro no gabarito e a condição é verificável nos campos do lead
- Agente justifica decisão por tier ou outro Hx, ignorando o relevante
- Sub-seção "Quando aplicar Hx" não existe no SKILL.md

## Sinais que NÃO pedem ajuste-prompt (anti-patterns)
- Hx em si precisa refinar texto → `ajuste-gabarito`
- Rubrica não cobre o fator → `ajuste-criterio`
- Contexto-momento defasado → `ajuste-contexto`

## Template do `proposed_change`

Adicionar no body do SKILL.md (depois da seção "Formato do reasoned"):

~~~md
## Quando aplicar H1 — Fundador técnico

Se o contexto-livre menciona "fundador técnico", "CTO", "founder dev" ou equivalente
AND contexto-momento indica fase de produto:
- INVOQUE H1 explicitamente no `reasoned`, mesmo se `objective_tier` for B ou C
- Formato sugerido: "priorizar porque fundador técnico em fase de produto → feedback acelera roadmap (H1)"

Não pular H1 só porque o tier objetivo é C — H1 sobrescreve tier quando a condição aplica.
~~~

## Exemplo worked

**Input divergence (classificada como prompt-issue):**
```json
{
  "heuristic_ignored": "H1 — Fundador técnico em fase de produto",
  "evidence": "lead com CTO citado descartado por tier C; reasoned não invoca H1",
  "target": "prompt-issue"
}
```

**Output esperado:**
```json
{
  "target_file": ".flue/skills/qualificador/qualificar-lead/SKILL.md",
  "proposed_change": "<bloco do template acima, adaptado pro H1>",
  "rationale": "adicionar sub-seção 'Quando aplicar H1' obriga o agente a citar H1 quando a condição literal aplica, mesmo que objective_tier seja C — resolve o caso de fundadores técnicos em tier baixo sendo descartados"
}
```

## Limites de escopo
- 1 sub-seção por sugestão (1 Hx por vez)
- Não reescrever o SKILL.md inteiro
- Não tocar o frontmatter (`name`, `description`, `model`)
- Não mudar formato do `reasoned` global — só adicionar regra de invocação
