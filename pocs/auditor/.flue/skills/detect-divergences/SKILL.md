---
name: detect-divergences
description: Identifica heurísticos do gabarito que foram ignorados ou mal-aplicados em UMA decisão específica do agente avaliado, usando o snapshot do `lead` pra verificar pré-condições de cada heurístico (ex: "lead com fundador técnico"). Use sempre que receber uma decision com `reasoned` em texto livre + `lead` + gabarito de heurísticos esperados — mesmo que o `did` pareça correto, sempre inspecione o mecanismo do raciocínio. Se `lead` vier `null` (decisão legada sem snapshot), as pré-condições não podem ser verificadas com confiança — retorne `divergences: []`.
model: main
---

# Detect Divergences

Você inspeciona o mecanismo do raciocínio de UMA decisão contra um gabarito, cruzando as pré-condições dos heurísticos com o snapshot do `lead`.

## Input
- `decision`: { id, did, reasoned, out_of_scope }
- `lead`: { segmento, faturamento_band, time_vendas, ferramentas, sinal, fundador_tecnico, menciona_dor, contexto_livre_sanitized } | null
- `gabarito`: markdown completo com heurísticos H1, H2, ...

## Operação
Pra cada heurístico do gabarito:
1. **Verifique as pré-condições do heurístico contra o objeto `lead`.** Por exemplo:
   - Se H1 requer fundador técnico, cheque `lead.fundador_tecnico === 1`.
   - Se H2 exige menção a dor específica, cheque `lead.menciona_dor === 1` (e use `lead.contexto_livre_sanitized` para confirmar a dor citada).
   - Se um heurístico depende de segmento/faturamento/sinal, leia os campos correspondentes em `lead`.
2. Se as pré-condições aplicam: o `reasoned` invocou esse heurístico explicitamente?
3. Se não invocou: registre divergência.
4. Se `lead` for `null`: você não tem como checar pré-condições com confiança — **retorne `divergences: []`** em vez de adivinhar.

## Formato de cada divergência
```json
{
  "heuristic_ignored": "<citação literal do heurístico do gabarito>",
  "evidence": "<citação literal do reasoned>",
  "severity": "low|med|high"
}
```

## Severidade
- `high`: heurístico que, se aplicado, mudaria o outcome
- `med`: heurístico relevante mas que não alteraria outcome
- `low`: heurístico marginalmente aplicável

## NÃO FAZER
- Não inferir condições do heurístico que não estão visíveis em `decision` nem em `lead`
- Não classificar origem (isso é skill diferente)
- Não sugerir correção (isso é skill diferente)
- Marcar `inconclusive` em vez de adivinhar
- Se `lead === null`, não tentar deduzir pré-condições do `reasoned` — retorne lista vazia
