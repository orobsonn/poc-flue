# Target: gabarito-stale

## Quando aplicar
O heurístico do gabarito (`expected-reasoning/qualificador/fit-estrategico.md`) está fraco: a condição é específica demais (não captura caso recorrente que deveria), genérica demais (dispara sem precisão), ou o mecanismo causal já não bate com a realidade do produto/mercado. O `reasoned` do agente revela um raciocínio mais maduro que o próprio gabarito — e isso aparece em múltiplos casos. O contexto-momento em si está OK; quem precisa refinar é o Hx.

## Sinais positivos
- `reasoned` articula uma versão mais nuançada/precisa que o texto do Hx
- A condição do Hx é binária mas a realidade é gradiente (ex: "fundador técnico" vs "qualquer perfil técnico no time")
- Hx não cobre um caso comum que claramente devia entrar nele
- Padrão se repete em buckets distintos com o mesmo Hx

## Sinais que NÃO indicam gabarito-stale (anti-patterns)
- Agente ignorou um Hx claro cujo texto está bom → `prompt-issue`
- Capacidade/fase do contexto-momento mudou e Hx ainda referencia o antigo → `contexto-mudou`
- Fator usado no `reasoned` deveria estar na rubrica objetiva → `criterio-faltando`
- Caso único sem recorrência → `inconclusive`

## Fronteira com targets adjacentes
| Pista | gabarito-stale | Outro target |
|---|---|---|
| Texto do Hx precisa refinar condição/mecanismo | sim | — |
| Hx OK mas prompt não invoca | não | prompt-issue |
| Hx OK mas contexto-momento antigo | não | contexto-mudou |
| Dimensão nova que merece Hx ou critério próprio | não | criterio-faltando |

## Exemplo worked

**Input divergence:**
```json
{
  "heuristic_ignored": "H2 — Dor específica em hipótese não validada",
  "evidence": "lead menciona 'desafio operacional na qualificação manual' sem ser exatamente as hipóteses H-NV1/H-NV2; reasoned diz 'priorizar porque interlocutor menciona desafio operacional → aprendizado supera custo'",
  "severity": "med"
}
```

**Output esperado:**
```json
{
  "target": "gabarito-stale",
  "rationale": "reasoned articula H2 de forma mais nuançada que o gabarito — o texto atual exige coincidência literal com hipótese não validada, mas a evidência mostra que qualquer desafio operacional adjacente já é aprendizado relevante. O Hx precisa refinar a condição de 'dor coincidente com hipótese' pra abrir pra adjacências"
}
```

## Limites de escopo
Não propor o texto novo do Hx aqui — isso é trabalho do `suggest-adjustment`. Aqui só classifica.
