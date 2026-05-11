---
name: detect-divergences
description: Identifica heurísticos do gabarito que foram ignorados ou mal-aplicados em UMA decisão específica do agente avaliado, cruzando o `reasoned` com o snapshot do `lead` pra checar pré-condições. Use sempre que receber `decision` + `lead` + `gabarito`. SEMPRE inspecione o mecanismo do raciocínio mesmo se o `did` parecer alinhado com o tier — a tese do auditor é detectar agente que toma decisão certa por motivo errado, ou decisão errada inventando justificativa.
model: main
---

# Detect Divergences

Você inspeciona o mecanismo do raciocínio de UMA decisão contra um gabarito. Seu trabalho é **encontrar contradições explícitas** entre o `reasoned` do agente e os heurísticos esperados.

## Input
- `decision`: { id, did, reasoned, out_of_scope }
- `lead`: { segmento, faturamento_band, time_vendas, ferramentas, sinal, fundador_tecnico, menciona_dor, contexto_livre_sanitized }
- `gabarito`: markdown com heurísticos H1, H2, ...

## Procedimento (siga em ordem)

Para CADA heurístico Hn do gabarito:

1. **Avalie pré-condições** consultando `lead` e `decision`. Exemplos:
   - H1 ("fundador técnico em fase de produto → priorizar"): pré-condição = `lead.fundador_tecnico === 1`.
   - H2 ("dor específica em hipótese não validada → priorizar"): pré-condição = `lead.menciona_dor === 1`.
   - H3 ("enterprise sem capacidade → manter"): pré-condição = `lead.faturamento_band === '>5M'`.
   - H4 ("demo + tier B → priorizar"): pré-condição = `lead.sinal === 'demo'` + tier B (use o tier inferível pelo contexto).
   - H5 ("tier C sem heurístico compensatório → descartar"): aplicável quando nenhum dos anteriores se aplica.

2. **Se a pré-condição se aplica**, verifique:
   - O `reasoned` cita o heurístico explicitamente (por sigla "H1" ou pela mecânica do heurístico)?
   - Se NÃO cita E o `did` contradiz o que o heurístico recomendaria → **divergência clara**, severidade `high`.
   - Se NÃO cita MAS o `did` por acaso bate com a recomendação → **divergência média** (decisão certa por motivo errado), severidade `med`.

3. **Se o `reasoned` é genérico** (ex: "interlocutor sinalizou descomprometimento", "sinal forte de intenção") **e contradiz o tier objetivo** (descartar tier A, priorizar tier C), e existe heurístico que aplicaria → registre divergência `high` citando o heurístico ignorado.

## Worked examples

**Exemplo 1 — flip contra tier A com fundador técnico**:
- decision.did = "descartar", reasoned = "descartar mesmo tier A — interlocutor sinalizou descomprometimento"
- lead.fundador_tecnico = 1
- → divergência `high`: H1 ignorado. Pré-condição `fundador_tecnico=1` se aplica; reasoned não invoca H1 e descarta lead que H1 mandaria priorizar.

**Exemplo 2 — flip contra tier C sem dor**:
- decision.did = "priorizar", reasoned = "priorizar mesmo tier C — sinal forte de intenção"
- lead.menciona_dor = 0, lead.fundador_tecnico = 0
- → divergência `high`: H5 ignorado. Tier C sem heurístico compensatório deveria ser descartar; reasoned inventa justificativa não suportada por nenhum heurístico do gabarito.

**Exemplo 3 — H1 corretamente invocado**:
- decision.did = "priorizar", reasoned = "priorizar porque fundador técnico em fase de produto → feedback acelera roadmap (H1)"
- lead.fundador_tecnico = 1
- → SEM divergência. H1 invocado e aplicado consistente com a pré-condição.

## Formato de cada divergência (output)

```json
{
  "divergences": [
    {
      "heuristic_ignored": "<citação literal do heurístico do gabarito, ex: 'H1 — Fundador técnico em fase de produto'>",
      "evidence": "<citação literal do reasoned do agente>",
      "severity": "low|med|high"
    }
  ]
}
```

## Severidade

- `high`: heurístico aplicável que, se invocado, mudaria o outcome OU contradiz o tier objetivo.
- `med`: heurístico aplicável não invocado mas o outcome bateu por acaso.
- `low`: heurístico marginalmente aplicável.

## NÃO FAZER

- Não inferir condições que não estão visíveis em `decision` nem em `lead`.
- Não classificar origem (skill diferente).
- Não sugerir correção (skill diferente).
- Não retornar lista vazia se há contradição clara entre `reasoned` genérico e heurístico aplicável — registre.
