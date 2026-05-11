# Ajuste de Gabarito

## Quando aplicar
Divergência classificada como `gabarito-stale`. O texto de um Hx existente precisa refinar (condição mais precisa, mecanismo mais alinhado com a realidade), ou um Hx novo (H6+) precisa ser adicionado pra cobrir um caso recorrente. A sugestão MANTÉM o formato canônico "condição → ação, porque mecanismo".

## Target file
`expected-reasoning/qualificador/fit-estrategico.md`

## Sinais positivos pra esse ajuste
- `reasoned` do agente articula uma versão mais nuançada que o Hx atual
- Padrão recorrente em buckets distintos com o mesmo Hx
- Condição binária do Hx não dá conta de uma gradiente real

## Sinais que NÃO pedem ajuste-gabarito (anti-patterns)
- Hx está OK, prompt é que não força citar → `ajuste-prompt`
- Dimensão objetiva ausente da rubrica → `ajuste-criterio`
- Capacidade/fase mudou → `ajuste-contexto`

## Template do `proposed_change`

Substituir o Hx atual (ou adicionar Hx novo) no `fit-estrategico.md`:

~~~md
## H2 — Dor específica em hipótese não validada (atualizado)
Se o lead menciona dor X que coincide com hipótese não validada
OU descreve desafio operacional adjacente (ex: qualificação manual, triagem),
→ priorizar independente de tamanho,
porque valor de aprendizado supera custo de oportunidade.
~~~

Para Hx novo, manter numeração sequencial (H6, H7...) sem renumerar os existentes.

## Exemplo worked

**Input divergence (classificada como gabarito-stale):**
```json
{
  "heuristic_ignored": "H2 — Dor específica em hipótese não validada",
  "evidence": "lead menciona desafio operacional na triagem manual; reasoned prioriza por aprendizado mas H2 atual exige coincidência literal com hipótese não validada",
  "target": "gabarito-stale"
}
```

**Output esperado:**
```json
{
  "target_file": "expected-reasoning/qualificador/fit-estrategico.md",
  "proposed_change": "<bloco do template acima, refinando H2 pra incluir desafio operacional adjacente>",
  "rationale": "a condição original de H2 exige coincidência literal com H-NV1/H-NV2; refinar pra incluir desafios operacionais adjacentes captura o padrão real sem tornar o Hx genérico demais (mecanismo causal de aprendizado permanece o mesmo)"
}
```

## Limites de escopo
- 1 Hx por sugestão (refinar 1 existente OU adicionar 1 novo)
- Não renumerar Hx existentes
- Manter formato "condição → ação, porque mecanismo" literalmente
- Não tocar Hx adjacentes não-relacionados à divergência
