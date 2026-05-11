# Ajuste de Contexto

## Quando aplicar
Divergência classificada como `contexto-mudou`. Uma das 4 seções do `contexto-momento.md` (Fase, Capacidade, Foco, Hipóteses não validadas) está defasada em relação ao que o `reasoned` do agente recorrente afirma. A sugestão atualiza UMA seção, com data explícita, mantendo o tom curto e direto do arquivo original.

## Target file
`agents-config/qualificador/contexto-momento.md`

## Sinais positivos pra esse ajuste
- `reasoned` referencia capacidade/fase/foco distinta da declarada
- Mudança recorrente em buckets distintos (não 1 caso isolado)
- Hipótese não validada já tem sinal claro de validação/refutação

## Sinais que NÃO pedem ajuste-contexto (anti-patterns)
- Texto de um Hx específico precisa refinar → `ajuste-gabarito`
- Hx aplicável foi só ignorado → `ajuste-prompt`
- Dimensão objetiva nova → `ajuste-criterio`

## Template do `proposed_change`

Substituir UMA das 4 seções (manter as outras intactas):

~~~md
## Capacidade (atualizado 2026-05)
Time de 5 pessoas (dobrou de 3 em maio/2026). Suporta até ~40 clientes ativos.
Enterprise (>50 usuários/cliente) viável pra 2-3 contas estratégicas selecionadas.
~~~

Para Hipóteses, anotar status sem deletar histórico:

~~~md
## Hipóteses não validadas (atualizado 2026-05)
- H-NV1: automação de qualificação de leads é dor real — VALIDADA em maio/2026 (3 leads citaram dor explícita)
- H-NV2: decisores técnicos pagariam premium por explicabilidade
~~~

## Exemplo worked

**Input divergence (classificada como contexto-mudou):**
```json
{
  "heuristic_ignored": "H3 — Enterprise sem capacidade",
  "evidence": "3 leads enterprise priorizados; reasoned recorrente diz 'time atual já comporta enterprise — capacidade dobrou'",
  "target": "contexto-mudou"
}
```

**Output esperado:**
```json
{
  "target_file": "agents-config/qualificador/contexto-momento.md",
  "proposed_change": "<bloco do template acima atualizando a seção Capacidade>",
  "rationale": "atualizar Capacidade de 'time de 3 / 20 clientes / enterprise inviável' pra refletir o crescimento citado nos reasoneds (time dobrou). H3 continua válido na lógica — só opera sobre o snapshot atualizado"
}
```

## Limites de escopo
- 1 seção por sugestão (não atualizar Capacidade E Foco no mesmo PR)
- Datar a mudança no header da seção (`atualizado YYYY-MM`)
- Não remover hipóteses sem motivo registrado — preferir marcar como VALIDADA/REFUTADA
- Manter as outras 3 seções intactas
- Tom curto e direto, igual ao arquivo original (sem prosa explicativa)
