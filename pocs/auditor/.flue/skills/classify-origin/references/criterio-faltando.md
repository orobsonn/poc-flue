# Target: criterio-faltando

## Definição precisa

`criterio-faltando` = **o heurístico necessário não existe no gabarito**. A rubrica está incompleta — falta dimensão objetiva que deveria fazer parte da regra.

> Se o heurístico **existe no gabarito** (qualquer H1..Hn está listado lá) mas o agente não o invoca, NÃO é `criterio-faltando`. É `prompt-issue`. Sempre verifique antes: o heurístico aparece literalmente no markdown do gabarito?

## Quando aplicar

A rubrica objetiva (`agents-config/qualificador/criterios-icp.md`) não pondera uma dimensão que o agente está sistematicamente usando pra justificar decisão. O `reasoned` puxa do contexto-livre um fator que parece objetivo (mensurável, recorrente), mas nenhum dos 5 critérios atuais (segmento, faturamento, time, ferramentas, sinal de intenção) cobre. **E nenhum heurístico Hx do gabarito cobriria essa dimensão** — não é refinamento de prompt, é lacuna real.

## Pré-checagem obrigatória

Antes de classificar como `criterio-faltando`, responda:

1. O `heuristic_ignored` da divergência aparece literal no `gabarito` recebido como input? Se **sim**, NÃO é `criterio-faltando` — é `prompt-issue`.
2. O fator usado pelo agente pode ser modelado por algum Hx existente (mesmo que com adaptação)? Se **sim**, considere `gabarito-stale` (refinar Hx) antes de `criterio-faltando`.
3. A dimensão é sobre a empresa que vende (fase, capacidade)? Então é `contexto-mudou`.

Só responda `criterio-faltando` se as 3 respostas forem **não**.

## Sinais positivos
- `reasoned` justifica decisão por fator objetivo (ex: "tem 10k usuários ativos", "API integrada com Stripe", "100 leads/mês")
- O fator aparece em buckets distintos como motivo de priorizar/descartar
- A rubrica atual zera ou penaliza o lead apesar do fator forte
- Os 5 critérios atuais claramente não modelam essa dimensão
- **Nenhum Hx do gabarito menciona essa dimensão** (verificado linha a linha)

## Sinais que NÃO indicam criterio-faltando (anti-patterns)
- Fator único, sem recorrência → `inconclusive` (ruído)
- O fator já existe na rubrica e agente só ignorou → `prompt-issue`
- O Hx do gabarito que cobriria o fator está fraco → `gabarito-stale`
- A dimensão é capacidade/fase do próprio produto → `contexto-mudou`
- **O heurístico ignorado aparece nominalmente no gabarito (ex: "H6 — Default por tier A")** → `prompt-issue` (o agente ignorou um Hx existente, não precisa criar critério novo)

## Fronteira com targets adjacentes
| Pista | criterio-faltando | Outro target |
|---|---|---|
| Hx do gabarito não cobre dimensão recorrente | sim | — |
| Hx existe no gabarito, agente não cita | **não** | **prompt-issue** |
| Hx existe, peso/regra precisa refinar | não | gabarito-stale |
| Dimensão é sobre nós (capacidade) | não | contexto-mudou |

## Worked example correto (caso onde criterio-faltando se aplica)

**Input divergence:**
```json
{
  "heuristic_ignored": "[Critério ausente] — Base de usuários ativos",
  "evidence": "3 leads SaaS B2B com >10k usuários ativos descartados como tier C (faturamento <50k) — reasoned cita 'base de usuários relevante mas rubrica não pondera' em 2 dos 3 casos",
  "severity": "high"
}
```

**Pré-checagem**:
1. "Base de usuários ativos" aparece como Hx do gabarito? Não.
2. Algum Hx existente cobre isso? Não — H1..H7 olham fundador técnico, dor, enterprise, sinal demo, tier, defaults. Nenhum modela base de usuários.
3. É sobre a empresa que vende? Não, é sobre o lead.

→ Classifica como `criterio-faltando`.

```json
{
  "target": "criterio-faltando",
  "rationale": "múltiplos leads SaaS B2B com >10k usuários ativos descartados porque rubrica só pondera faturamento mensal — base de usuários ativos é dimensão objetiva, recorrente em buckets distintos, e nenhum dos 5 critérios atuais nem dos heurísticos H1..H7 captura essa dimensão. Não é prompt-issue porque não há Hx existente sendo ignorado."
}
```

## Worked example INCORRETO (não confundir com prompt-issue)

**Input divergence:**
```json
{
  "heuristic_ignored": "H6 — Default por tier A",
  "evidence": "descartar mesmo tier A — interlocutor sinalizou descomprometimento na call",
  "severity": "high"
}
```

**Pré-checagem**:
1. "H6 — Default por tier A" aparece no gabarito? **Sim** (é uma das seções `## H6 ...` do markdown do gabarito).

→ **NÃO é `criterio-faltando`.** O heurístico existe. Classifica como `prompt-issue`.

Se você marcar isso como `criterio-faltando`, o `suggest-adjustment` vai propor mudar `agents-config/qualificador/criterios-icp.md` (rubrica de pontuação), mas o problema real é que o prompt do `qualificar-lead` não força citar H6 quando tier=A. PR resultante muda arquivo errado.

## Limites de escopo
Não definir aqui o peso novo nem qual critério perde — isso é tarefa do `suggest-adjustment` com `ajuste-criterio.md`.
