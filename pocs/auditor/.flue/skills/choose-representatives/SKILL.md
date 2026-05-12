---
name: choose-representatives
description: Como escolher K representantes pra auditar dentro de um bucket de decisões. Prioriza divergência aparente do gabarito > diversidade de lead > random. NÃO é um tool — é conhecimento ambiente consultado pelo auditor agêntico antes de chamar `detect_divergences`. Se bucket tem ≤K decisões, audite todas e pule a escolha. Consulte references/ pra padrões linguísticos detalhados.
model: main
---

# Choose Representatives

Você está auditando decisões de um agente qualificador. Cada bucket tem N decisões; você só pode pagar o custo de auditar K (cap duro no tool `detect_divergences`). Escolha bem — auditar K decisões aleatórias é desperdício se há sinais óbvios pra priorizar.

## Input mental

- `bucket_key`: identifica o quadrante (judgment/tier/oos) — diz que tipo de viés esperar
- Lista de decisões com `decision_id`, `reasoned`, `out_of_scope`, `lead`
- `K`: cap por bucket (geralmente 3)

## Procedimento (em ordem)

### Passo 1 — Triage por sinal de divergência aparente

Antes de tudo, varra o `reasoned` de cada decisão procurando **padrões linguísticos suspeitos**. Sinais fortes:

- **Flip contra tier**: bucket é `descartar/A/*` ou `priorizar/C/*`. Esses são por definição candidatos prioritários — o agent contrariou o score objetivo. Geralmente vale auditar **todos** nesses buckets, mesmo que > K (mas o tool vai cortar em K — escolha os K mais suspeitos).
- **Justificativa subjetiva sem heurístico**: reasoning cita "interlocutor sinalizou X", "sinal forte de Y", "intenção forte", "potencial de upside" sem invocar nenhum heurístico do gabarito (H1, H2, etc.) por sigla ou mecânica.
- **Contradição interna**: reasoning diz "menciona dor X" mas o `lead.menciona_dor === 0`; ou diz "fundador técnico" mas `lead.fundador_tecnico === 0`.
- **OOS texto suspeito**: campo `out_of_scope` com afirmação ampla tipo "faltou contexto" mas o `lead.contexto_livre_sanitized` tem texto rico.

Marque as decisões que disparam ≥1 sinal forte como **suspeitas**.

### Passo 2 — Se há suspeitas ≤ K

Escolha **todas** as suspeitas. Completa o restante até K com diversidade (passo 3).

### Passo 3 — Se há suspeitas > K

Pegue as K com mais sinais fortes acumulados. Desempate por diversidade de lead (passo 3).

### Passo 4 — Se não há suspeitas

Use diversidade pra escolher K. Maximize variabilidade em (segmento, faturamento_band, time_vendas, fundador_tecnico, menciona_dor):

- Tente cobrir pelo menos 2 segmentos distintos
- Tente cobrir pelo menos 2 faixas de faturamento
- Evite 2 reps com mesmo (segmento, faturamento_band, time_vendas)

Se ainda assim houver empate, ordem de inserção (primeiros K do bucket).

## Worked examples

**Exemplo 1 — bucket `descartar/A/0` com 4 decisões, K=3**:

Decisões (resumido):
- d-A1: reasoned "descartar — interlocutor sinalizou descomprometimento", lead={segmento:saas, faturamento:50-500k, fundador_tecnico:1, menciona_dor:1}
- d-A2: reasoned "descartar mesmo tier A — sinal forte de baixo engajamento", lead={segmento:agencia, faturamento:0-50k}
- d-A3: reasoned "descartar porque H3 enterprise sem capacidade → manter (contradição: outcome=descartar mas justificativa pede manter)", lead={faturamento:>5M}
- d-A4: reasoned "descartar porque H6 default tier A não se aplica em mid-market", lead={faturamento:500k-5M}

Análise:
- d-A1: suspeita FORTE — justificativa subjetiva ("descomprometimento") + ignora H1 (fundador_tecnico=1, menciona_dor=1 ambos disparam priorizar).
- d-A2: suspeita FORTE — "sinal forte de baixo engajamento" não é heurístico do gabarito.
- d-A3: suspeita FORTE — contradição interna entre justificativa e outcome.
- d-A4: suspeita MÉDIA — invoca H6 mas inventa restrição "não se aplica em mid-market" não no gabarito.

Todas suspeitas, são 4 > K=3. Escolha: d-A1, d-A2, d-A3 (3 sinais fortes claros). Deixa d-A4.

**Exemplo 2 — bucket `priorizar/A/0` com 5 decisões alinhadas, K=3**:

Nenhuma decisão suspeita (reasoning cita H1/H2/H6 consistentemente). Use diversidade.

Escolha 3 com leads em segmentos distintos: 1 saas+founder técnico, 1 agência+não técnico, 1 infoprodutor. Cobre 3 segmentos × 3 faturamentos diferentes.

## NÃO FAZER

- Não classifique origem (`prompt-issue` etc.) — isso é skill diferente, vem depois.
- Não chame `detect_divergences` mais que K vezes por bucket — o tool rejeita.
- Não escolha apenas a 1ª decisão de cada bucket sem inspecionar — vira sampling random, perde valor do agentic.
- Não copie o reasoned bruto pro classify; suspeição aqui ≠ divergência confirmada (isso é detect-divergences que decide).
- Não invente sinais novos sem evidência literal no `reasoned`/`out_of_scope`/`lead`.

## Output

Esta skill **não retorna nada estruturado** — é conhecimento ambiente. Após consultar, simplesmente chame `detect_divergences(decision_id)` nos K escolhidos.

Para padrões linguísticos detalhados de "justificativa subjetiva" e "contradição interna", consulte `references/sinais-de-divergencia-aparente.md`.
