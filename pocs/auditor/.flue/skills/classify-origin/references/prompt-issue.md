# Target: prompt-issue

## Quando aplicar
A condição literal de um heurístico do gabarito se aplica ao lead (dá pra verificar nos campos estruturados ou no contexto-livre), mas o `reasoned` do agente não cita o Hx correspondente e justifica a decisão por outro caminho. O gabarito em si está correto e atual — o que falha é a tradução pro prompt do `qualificar-lead`, que não força citar o heurístico quando a condição aplica. Tem que ser sistemático em buckets similares, não caso isolado.

## Sinais positivos
- Gabarito está claro e a condição do Hx é objetivamente verificável no input do lead
- Múltiplos representantes do mesmo bucket (ou buckets adjacentes) ignoram o mesmo Hx
- O `reasoned` justifica a decisão por tier objetivo ou outro Hx, sem mencionar o ignorado
- Existe sub-seção "Quando aplicar Hx" faltando no SKILL.md do `qualificar-lead`

## Sinais que NÃO indicam prompt-issue (anti-patterns)
- Heurístico aparece ignorado em 1 caso isolado → `inconclusive` (provável ruído)
- O `reasoned` articula uma versão mais nuançada que o gabarito → `gabarito-stale`
- A condição do Hx depende de contexto-momento defasado → `contexto-mudou`
- O fator que aparece no `reasoned` não tem Hx correspondente → `criterio-faltando`

## Fronteira com targets adjacentes
| Pista | prompt-issue | Outro target |
|---|---|---|
| Hx existe, condição aplica, agente não cita | sim | — |
| Hx precisa refinar condição/mecanismo | não | gabarito-stale |
| Rubrica objetiva não cobre o fator usado | não | criterio-faltando |
| Capacidade/fase contradiz o reasoned | não | contexto-mudou |

## Exemplo worked

**Input divergence:**
```json
{
  "heuristic_ignored": "H1 — Fundador técnico em fase de produto",
  "evidence": "lead tem CTO citado no contexto-livre e contexto-momento indica fase de produto; reasoned justifica 'descartar porque tier objetivo C → custo de oportunidade supera valor' sem invocar H1",
  "severity": "high"
}
```

**Output esperado:**
```json
{
  "target": "prompt-issue",
  "rationale": "H1 se aplica (contexto-livre menciona fundador técnico AND fase é produto) mas reasoned não invoca H1 e justifica por tier puro — falha está no prompt do qualificar-lead, que não força citar H1 quando a condição aplica e o tier objetivo é C"
}
```

## Limites de escopo
Não estender pra "talvez o gabarito também precise melhorar" — se a divergência é dupla, separar em duas divergências. Aqui só classifica origem.
