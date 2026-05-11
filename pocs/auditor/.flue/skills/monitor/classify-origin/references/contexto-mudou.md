# Target: contexto-mudou

## Quando aplicar
O `reasoned` do agente referencia capacidade, fase, foco ou hipóteses diferentes do que está declarado no `agents-config/qualificador/contexto-momento.md`. O gabarito até pode estar OK em si, mas opera sobre um contexto-momento defasado — quem precisa atualizar é o snapshot de "onde a empresa está agora", não o Hx. Hipóteses não validadas que o mercado já validou (ou refutou) também caem aqui.

## Sinais positivos
- `reasoned` afirma "agora suportamos enterprise" mas contexto-momento diz "enterprise inviável"
- Decisões sistemáticas contradizem o que o contexto-momento declara (capacidade, foco, fase)
- Hipóteses não validadas (H-NV1, H-NV2) já têm sinal claro de validação/refutação que não foi incorporado
- A defasagem aparece em buckets distintos, sempre puxando da mesma seção do contexto

## Sinais que NÃO indicam contexto-mudou (anti-patterns)
- Divergência é sobre o texto de um Hx específico → `gabarito-stale`
- Hx aplicável foi ignorado mas contexto está OK → `prompt-issue`
- Fator novo do `reasoned` é dimensão objetiva ausente da rubrica → `criterio-faltando`
- Decisão isolada citando capacidade futura sem padrão → `inconclusive`

## Fronteira com targets adjacentes
| Pista | contexto-mudou | Outro target |
|---|---|---|
| Capacidade/fase/foco/hipóteses contradiz o reasoned | sim | — |
| Texto do Hx precisa refinar | não | gabarito-stale |
| Rubrica objetiva sem dimensão nova | não | criterio-faltando |
| Hx claro ignorado | não | prompt-issue |

## Exemplo worked

**Input divergence:**
```json
{
  "heuristic_ignored": "H3 — Enterprise sem capacidade",
  "evidence": "3 leads enterprise (>R$ 5M/mês) priorizados em vez de mantidos; reasoned recorrente: 'priorizar porque time atual já comporta enterprise — capacidade dobrou nas últimas semanas'",
  "severity": "high"
}
```

**Output esperado:**
```json
{
  "target": "contexto-mudou",
  "rationale": "reasoned afirma capacidade dobrada mas contexto-momento (2026-05) declara time de 3 pessoas, ~20 clientes ativos e enterprise inviável. O Hx H3 ainda está correto na lógica — quem precisa atualizar é a seção 'Capacidade' do contexto-momento pra refletir o novo tamanho do time"
}
```

## Limites de escopo
Não inventar o novo texto da seção aqui — isso é trabalho do `suggest-adjustment` com `ajuste-contexto.md`. Aqui só sinaliza qual seção do contexto-momento parece defasada.
