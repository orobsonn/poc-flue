# Target: criterio-faltando

## Quando aplicar
A rubrica objetiva (`agents-config/qualificador/criterios-icp.md`) não pondera uma dimensão que o agente está sistematicamente usando pra justificar decisão. O `reasoned` puxa do contexto-livre um fator que parece objetivo (mensurável, recorrente), mas nenhum dos 5 critérios atuais (segmento, faturamento, time, ferramentas, sinal de intenção) cobre. O Hx do gabarito não dá conta porque não é refinamento de heurístico — é dimensão objetiva ausente da rubrica.

## Sinais positivos
- `reasoned` justifica decisão por fator objetivo (ex: "tem 10k usuários ativos", "API integrada com Stripe", "100 leads/mês")
- O fator aparece em buckets distintos como motivo de priorizar/descartar
- A rubrica atual zera ou penaliza o lead apesar do fator forte
- Os 5 critérios atuais claramente não modelam essa dimensão

## Sinais que NÃO indicam criterio-faltando (anti-patterns)
- Fator único, sem recorrência → `inconclusive` (ruído)
- O fator já existe na rubrica e agente só ignorou → `prompt-issue`
- O Hx do gabarito que cobriria o fator está fraco → `gabarito-stale`
- A dimensão é capacidade/fase do próprio produto → `contexto-mudou`

## Fronteira com targets adjacentes
| Pista | criterio-faltando | Outro target |
|---|---|---|
| Rubrica não captura dimensão recorrente | sim | — |
| Critério existe, agente não cita | não | prompt-issue |
| Critério existe, peso/regra precisa refinar | não | gabarito-stale (raro) |
| Dimensão é sobre nós (capacidade) | não | contexto-mudou |

## Exemplo worked

**Input divergence:**
```json
{
  "heuristic_ignored": "H5 — Score baixo sem sinal compensatório",
  "evidence": "3 leads SaaS B2B com >10k usuários ativos descartados como tier C (faturamento <50k) — reasoned cita 'base de usuários relevante mas rubrica não pondera' em 2 dos 3 casos",
  "severity": "high"
}
```

**Output esperado:**
```json
{
  "target": "criterio-faltando",
  "rationale": "múltiplos leads SaaS B2B com >10k usuários ativos descartados porque rubrica só pondera faturamento mensal — base de usuários ativos é dimensão objetiva, recorrente em buckets distintos, e nenhum dos 5 critérios atuais captura. Não é prompt-issue (agente até reconhece a lacuna no reasoned) nem gabarito-stale (Hx não cobre essa dimensão)"
}
```

## Limites de escopo
Não definir aqui o peso novo nem qual critério perde — isso é tarefa do `suggest-adjustment` com `ajuste-criterio.md`.
