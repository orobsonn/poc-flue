# Target: prompt-issue

## Definição precisa

`prompt-issue` = **o heurístico existe no gabarito, a condição se aplica ao lead, mas o agente não o invoca**. A falha está no prompt do `qualificar-lead`, que não força citar o heurístico quando deveria.

> Default quando o `heuristic_ignored` aparece literal no gabarito. Só procure outro target se houver evidência clara contra `prompt-issue`.

## Quando aplicar

A condição literal de um heurístico do gabarito se aplica ao lead (verificável nos campos estruturados ou no contexto-livre), mas o `reasoned` do agente não cita o Hx correspondente e justifica a decisão por outro caminho. O gabarito em si está correto e atual — o que falha é a tradução pro prompt do `qualificar-lead`, que não força citar o heurístico quando a condição aplica. Tem que ser sistemático em buckets similares, não caso isolado.

## Sinais positivos
- O `heuristic_ignored` aparece **literal** no markdown do gabarito (procurar pela sigla Hx ou pela primeira linha da seção)
- Gabarito está claro e a condição do Hx é objetivamente verificável no input do lead
- Múltiplos representantes do mesmo bucket (ou buckets adjacentes) ignoram o mesmo Hx
- O `reasoned` justifica a decisão por tier objetivo ou outro Hx, sem mencionar o ignorado
- O `contexto_momento` confirma que a fase/capacidade descrita no Hx ainda vale (excluindo `gabarito-stale`)

## Sinais que NÃO indicam prompt-issue (anti-patterns)
- Heurístico aparece ignorado em 1 caso isolado → `inconclusive` (provável ruído)
- O `reasoned` articula uma versão mais nuançada que o gabarito → `gabarito-stale`
- A condição do Hx depende de contexto-momento defasado (ex: gabarito assume fase X mas `contexto_momento` mostra fase Y) → `contexto-mudou`
- O fator que aparece no `reasoned` **não tem Hx correspondente no gabarito** → `criterio-faltando`

## Fronteira com targets adjacentes
| Pista | prompt-issue | Outro target |
|---|---|---|
| Hx existe no gabarito, condição aplica, agente não cita | **sim** | — |
| Hx precisa refinar condição/mecanismo | não | gabarito-stale |
| Heurístico do `heuristic_ignored` **não aparece** no markdown do gabarito | não | criterio-faltando |
| Capacidade/fase do `contexto_momento` contradiz o reasoned | não | contexto-mudou |

## Worked example 1 — H1 ignorado (caso clássico)

**Input divergence:**
```json
{
  "heuristic_ignored": "H1 — Fundador técnico em fase de produto",
  "evidence": "lead tem CTO citado no contexto-livre e contexto-momento indica fase de produto; reasoned justifica 'descartar porque tier objetivo C → custo de oportunidade supera valor' sem invocar H1",
  "severity": "high"
}
```

**Verificação**:
- "H1 — Fundador técnico em fase de produto" está no gabarito? Sim (procurar `## H1`).
- Condição aplica? Sim — `lead.fundador_tecnico=1` AND `contexto_momento` em fase de produto.
- `contexto_momento` ainda diz "fase de produto"? Sim — então não é `gabarito-stale` nem `contexto-mudou`.

```json
{
  "target": "prompt-issue",
  "rationale": "H1 está no gabarito e a condição aplica (fundador técnico + fase de produto confirmada no contexto-momento), mas o reasoned justifica por tier puro sem invocar H1 — falha no prompt do qualificar-lead, que não força citar H1 quando a condição dispara."
}
```

## Worked example 2 — H6 ignorado (caso do trace pré-refino que estava sendo classificado errado)

**Input divergence:**
```json
{
  "heuristic_ignored": "H6 — Default por tier A",
  "evidence": "descartar mesmo tier A — interlocutor sinalizou descomprometimento na call",
  "severity": "high"
}
```

**Verificação**:
- "H6 — Default por tier A" está no gabarito? **Sim** (seção `## H6 — Default por tier A` existe).
- Condição aplica? Sim — tier objetivo é A e nenhum H1..H5 dispara em sentido contrário.
- `contexto_momento` mudou? Não — H6 é regra de tier, independe de fase.

```json
{
  "target": "prompt-issue",
  "rationale": "H6 está no gabarito (`## H6 — Default por tier A`) e a condição aplica (tier A sem heurístico contrário disparado). O reasoned inventa critério qualitativo ('descomprometimento na call') ausente do gabarito e contraria a recomendação de priorizar — falha está no prompt do qualificar-lead, que não força citar H6 quando tier=A e nenhum heurístico contrário aparece. Não é `criterio-faltando` porque H6 existe — o que falta é o prompt forçar o uso."
}
```

**Erro comum a evitar**: classificar este caso como `criterio-faltando` (alvo: `criterios-icp.md`) porque o reasoned menciona "descomprometimento" — esse é o fator inventado pelo agente, não a regra do gabarito. O critério ignorado é H6, e H6 existe.

## Limites de escopo
Não estender pra "talvez o gabarito também precise melhorar" — se a divergência é dupla, separar em duas divergências. Aqui só classifica origem.
