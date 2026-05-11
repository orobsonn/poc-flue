# Sugestões de Ajuste

## Heurístico ignorado: ## H5 — Score baixo sem sinal compensatório
Se score objetivo é C AND nenhum dos heurísticos acima se aplica,
→ descartar,
porque custo de oportunidade do time supera valor esperado.
**Target**: .agents/skills/qualificar-lead/SKILL.md
**Origem**: O gabarito é explícito em H5: score C sem heurístico compensatório aplicável deve ser descartado. O agente ignorou essa regra clara e inventou uma compensação por 'sinal forte de intenção' para tier C, caracterizando falha no cumprimento do prompt.

Adicionar no body do SKILL.md (depois da seção "Quando preencher `out_of_scope`"):

~~~md
## Quando aplicar H5 — Score baixo sem sinal compensatório

Se `objective_tier` é C AND nenhum dos heurísticos H1, H2, H3 ou H4 se aplica ao lead:

- INVOQUE H5 explicitamente no `reasoned`
- Formato sugerido: "descartar porque score objetivo é C e nenhum heurístico compensatório aplica → custo de oportunidade do time supera valor esperado (H5)"
- OUTCOME deve ser `descartar`

Não inventar sinal compensatório genérico (ex: "sinal forte de intenção") para tier C — H4 já cobre sinal forte, mas **apenas quando score objetivo é B**. Se tier é C e não há H1–H4, H5 é definitivo.
~~~

_Rationale_: O agente ignorou H5 e justificou a priorização de tier C com um 'sinal forte de intenção' genérico, confundindo com H4 (que vale só para tier B). A sub-seção obriga a invocação literal de H5 quando nenhum heurístico compensatório se aplica a tier C, bloqueando essa substituição improvisada.

## Heurístico ignorado: Se score objetivo é C AND nenhum dos heurísticos acima se aplica,
→ descartar,
porque custo de oportunidade do time supera valor esperado.
**Target**: .agents/skills/qualificar-lead/SKILL.md
**Origem**: Gabarito é claro e atual: H5 determina descarte para tier C quando nenhum heurístico acima aplica, e H4 restringe compensação por sinal de intenção ao tier B. O agente ignorou H5 e aplicou o raciocínio de H4 ao tier C, o que indica falha no prompt do qualificar-lead em forçar aplicação sistemática e delimitação correta dos heurísticos por tier.

Adicionar ao SKILL.md do `qualificar-lead`, logo após a seção "Formato do `reasoned`", a seguinte sub-seção:

## Quando aplicar H5 — Score baixo sem sinal compensatório

Se `objective_tier` for C:

1. Verifique H1, H2 e H3. Se qualquer um deles se aplicar ao lead, invoque-o explicitamente no `reasoned` e obedeça sua ação.
2. Verifique H4 — ele se aplica **apenas** quando o score objetivo é B. Nunca use H4 para justificar priorização de um lead tier C.
3. Se nenhum dos heurísticos H1–H3 se aplicar e o tier for C:
   - Invoque H5 explicitamente no `reasoned`.
   - Ação obrigatória: `descartar`.
   - Formato sugerido: `"descartar porque score objetivo é C e nenhum heurístico anterior se aplica → custo de oportunidade do time supera valor esperado (H5)"`.

Não substitua H5 por H4 em tier C. O mecanismo "sinal forte de intenção compensa fit" vale apenas para tier B (H4); para tier C, a regra padrão é H5.

_Rationale_: O agente ignorou H5 e priorizou um lead tier C usando o raciocínio de H4 (sinal de intenção compensa fit), quando H4 restringe explicitamente a score B. A sub-seção impõe uma verificação sequencial que bloqueia a aplicação cruzada de H4 em tier C e força a invocação explícita de H5 quando nenhum heurístico anterior aplica, fechando a lacuna no prompt.

## Heurístico ignorado: ## H6 — Default por tier A
Se score objetivo é A AND nenhum heurístico acima dispara em sentido contrário (H3 enterprise),
→ priorizar,
porque o tier A já refletiu fit estrutural alto na rubrica determinística — só inverter mediante motivo registrado.
**Target**: prompts/qualificador-sdr.md
**Origem**: O gabarito em H6 é claro e atual: score A sem heurístico contrário (H1–H5) → priorizar. O agente ignorou essa regra ao descartar o lead por 'descomprometimento na call', critério subjetivo que não consta como exceção válida no gabarito. Não há evidência de mudança de contexto de negócio nem de que esse critério devesse integrar a rubrica objetiva.

Adicionar uma seção explícita no final das instruções de julgamento, intitulada 'Regras de desempate e proteção de tier A', contendo:

1. **Default obrigatório para tier A**: quando o score objetivo for A e nenhum heurístico contrário do gabarito (H1–H5) estiver ativo, a decisão deve ser 'priorizar'. O heurístico H6 é a regra terminal e só pode ser invertida mediante motivo registrado e alinhado a um dos heurísticos de exceção do gabarito.

2. **Proibição de critérios subjetivos como exceção**: julgamentos como 'descomprometimento na call', 'falta de interesse', 'vibe negativa' ou similar não são critérios válidos para descartar um lead de tier A. Sinais comportamentais ou qualitativos não listados no gabarito devem ser ignorados na decisão final de priorização/descarte.

3. **Processo para inverter H6**: caso o agente identifique motivo real para não priorizar um tier A, ele deve (a) explicitar qual heurístico do gabarito (H1–H5) justifica a inversão, e (b) registrar esse motivo literalmente no campo 'reasoned' antes de emitir qualquer decisão contrária ao default.

4. **Confirmação de conformidade**: antes de finalizar a decisão, o agente deve verificar: 'Score é A? Há heurístico contrário explícito? Se sim, qual? Se não, priorizar.'

_Rationale_: A divergência ocorreu porque o agente substituiu o heurístico H6 (default por tier A) por uma inferência subjetiva ('descomprometimento na call') que não consta no gabarito como exceção válida. Reforçar o prompt com uma trava explícita impede que critérios comportamentais não codificados sobrescrevam regras determinísticas de fit estrutural, mantendo a decisão auditável e alinhada aos heurísticos documentados.
