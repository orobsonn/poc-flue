# Sugestões de Ajuste

## Heurístico ignorado: H6 — Default por tier A
**Target**: agents-config/qualificador/criterios-icp.md
**Origem**: O agente invocou um sinal qualitativo (descomprometimento na call) inexistente na rubrica objetiva e nos heurísticos para inverter H6; a fase de validação atual torna engajamento um critério legítimo que falta no gabarito, forçando o agente a improvisar uma justificativa fora da estrutura.

Incluir critério objetivo #6 e redistribuir 10 pontos dos critérios #3 e #4, mantendo a soma em 100.

Tabela revisada:

| # | Critério | Regra | Peso |
|---|---|---|---|
| 1 | Segmento | está em [infoprodutor, agência de marketing, SaaS B2B] | 30 |
| 2 | Faturamento mensal | >= R$ 50k | 25 |
| 3 | Time de vendas | tem time dedicado (não solo) | 15 |
| 4 | Ferramentas atuais | usa CRM ou plataforma de automação | 10 |
| 5 | Sinal de intenção | pediu demo OU preencheu form qualificado | 10 |
| 6 | Comprometimento na call | interlocutor confirmou próximo passo concreto (ex: envio de dados, agendamento de follow-up ou apresentação interna); se recusou, não compareceu sem aviso ou sinalizou desinteresse explícito, 0 pontos | 10 |

(Ajuste: critério #3 perde 5 pontos e critério #4 perde 5 pontos, totalizando os 10 pontos do novo critério #6.)

_Rationale_: A rubrica objetiva carece de dimensão para sinais comportamentais verificáveis pós-interação, o que obrigou o agente a ignorar o default de tier A e descartar um lead com descomprometimento na call sem critério determinístico de apoio. O novo critério 'Comprometimento na call' transforma o red flag em regra binária e mensurável (confirmação de próximo passo, comparecimento, desinteresse explícito), permitindo que exceções ao default de tier A sejam codificadas em vez de inferidas livremente. A redistribuição retira 5 pontos de 'Time de vendas' e 5 de 'Ferramentas atuais', refletindo que infoprodutores na faixa de R$ 50k-500k operam frequentemente sem time dedicado ou CRM, tornando o engajamento do interlocutor um sinal mais preditivo de ICP-fit para o estágio atual de validação e capacidade limitada do time.

## Heurístico ignorado: H2 — Dor específica em hipótese não validada
**Target**: prompts/qualificador.md
**Origem**: O gabarito é claro em H2 e H6 (mandam priorizar leads com dor em hipótese não validada e tier A), e o contexto-momento está em fase de validação de produto onde aprendizado é prioritário; o agente descartou com base em 'descomprometimento na call', critério ausente dos heurísticos, indicando falha no carregamento ou reforço do gabarito via prompt.

1. Inserir uma regra de precedência explícita na seção de heurísticos: **H2 deve ser avaliada antes de H1**. O agente só deve aplicar o bônus do perfil do fundador técnico (H1) quando a dor específica do lead já tiver sido mapeada para uma hipótese validada ou, no mínimo, quando não houver evidência de que a dor pertence a uma hipótese não validada (H-NV1, H-NV2, etc.).

2. Adicionar uma verificação obrigatória de "checkpoint de hipótese" no fluxo de raciocínio: antes de concluir que um lead deve ser priorizado por ser "fundador técnico em fase de produto → feedback acelera roadmap", o agente deve explicitamente escrever no campo `reasoned` se a dor do lead está fora do escopo das hipóteses validadas. Se a dor for genérica ("feedback de produto") e não estiver vinculada à automação de qualificação (H-NV1) ou explicabilidade técnica (H-NV2), o agente deve marcar `out_of_scope` ou reduzir o tier, mesmo que o perfil do fundador seja tecnicamente atrativo.

3. Atualizar a descrição de H1 para deixar claro que ela é um **tiebreaker de fit**, não um override de problem-solution fit: "O bônus de fundador técnico (H1) só eleva a prioridade de leads que já demonstraram dor alinhada ao ICP atual (infoprodutores R$ 50k-500k/mês). Ele nunca deve elevar leads cujo problema principal não foi validado ou que está fora do escopo de atuação do time de 3 pessoas."

_Rationale_: A divergência detectada evidencia que o agente descartou um lead tier A fundamentado unicamente no descomprometimento do interlocutor durante a call, ignorando o heurístico H2. Em fase de validação de produto com time de 3 pessoas e foco em infoprodutores brasileiros (R$ 50k–500k/mês), a prioridade é validar se as dores de H-NV1 e H-NV2 são reais. Descartar leads que carregam esses sinais específicos por motivos comportamentais gera falsos negativos críticos e corrói a taxa de aprendizado. A mudança insere no prompt uma regra explícita de contenção que prioriza a coleta de evidência de dor alinhada às hipóteses não validadas acima de heurísticos genéricos de engajamento.

## Heurístico ignorado: H2 — Dor específica em hipótese não validada
**Target**: prompts/qualificador.md
**Origem**: O gabarito possui H2 de forma clara e o contexto-momento mantém a fase de validação de produto com hipóteses não validadas ativas, portanto o heurístico não está desatualizado nem faltante na rubrica estratégica. O agente simplesmente deixou de aplicar uma regra explícita, priorizando apenas H1, o que indica falha de execução/aplicação do prompt.

1. Inserir uma regra de precedência explícita na seção de heurísticos: **H2 deve ser avaliada antes de H1**. O agente só deve aplicar o bônus do perfil do fundador técnico (H1) quando a dor específica do lead já tiver sido mapeada para uma hipótese validada ou, no mínimo, quando não houver evidência de que a dor pertence a uma hipótese não validada (H-NV1, H-NV2, etc.).

2. Adicionar uma verificação obrigatória de "checkpoint de hipótese" no fluxo de raciocínio: antes de concluir que um lead deve ser priorizado por ser "fundador técnico em fase de produto → feedback acelera roadmap", o agente deve explicitamente escrever no campo `reasoned` se a dor do lead está fora do escopo das hipóteses validadas. Se a dor for genérica ("feedback de produto") e não estiver vinculada à automação de qualificação (H-NV1) ou explicabilidade técnica (H-NV2), o agente deve marcar `out_of_scope` ou reduzir o tier, mesmo que o perfil do fundador seja tecnicamente atrativo.

3. Atualizar a descrição de H1 para deixar claro que ela é um **tiebreaker de fit**, não um override de problem-solution fit: "O bônus de fundador técnico (H1) só eleva a prioridade de leads que já demonstraram dor alinhada ao ICP atual (infoprodutores R$ 50k-500k/mês). Ele nunca deve elevar leads cujo problema principal não foi validado ou que está fora do escopo de atuação do time de 3 pessoas."

_Rationale_: A divergência mostra que o agente está usando H1 (perfil do fundador técnico) como um atalho para priorizar leads, ignorando H2 (dor atrelada a hipótese não validada). No contexto atual de produto em validação com time enxuto, receber feedback de roadmap de um fundador técnico é uma oportunidade secundária — não justifica priorizar um lead se o problema dele não mapeia para as hipóteses que estamos testando (H-NV1, H-NV2). Sem essa regra de precedência no prompt, o agente continuará inflando a prioridade de leads fora do ICP apenas porque o interlocutor tem perfil técnico.

## Heurístico ignorado: H4 — Sinal forte com fit médio
**Target**: prompts/qualificador-sdr.md
**Origem**: O gabarito define H4 de forma clara e atual (demo direta + tier B → priorizar, porque janela de aprendizado), e o contexto-momento sustenta essa lógica ao indicar fase de validação/produto. A decisão de 'manter' citando 'sem sinal compensatório' aponta falha do agente em reconhecer/aplicar o heurístico, caracterizando problema no carregamento da regra.

Adicionar uma seção explícita de aplicação do heurístico H4 no fluxo de decisão para leads Tier B:

1. Inserir regra condicional no prompt: "Se o lead for classificado como Tier B E o fit estratégico for médio (2–3 em escala de 1–5), o agente DEVE verificar a existência de um sinal forte compensatório antes de recomendar 'manter'. Sinais fortes compensatórios incluem, mas não se limitam a: urgência declarada do lead, engajamento direto do decisor, orçamento compatível já confirmado, ou alinhamento excepcional com o ICP de infoprodutores brasileiros na faixa R$ 50k–500k/mês."
2. Determinar comportamento padrão para ausência de sinal: "Na ausência de sinal forte compensatório documentado no campo `reasoned`, a recomendação deve ser 'descartar' ou, caso faltem dados para avaliar o sinal, preencher `out_of_scope` explicitamente. A mera classificação em Tier B não sobrescreve H4 quando o fit é médio."
3. Reforçar no contexto de capacidade: "Dado o time atual de 3 pessoas e limite de ~20 clientes ativos, manter leads de fit médio sem sinal compensatório consome pipeline e desfoca o foco em lançamentos digitais e perpetuos."

_Rationale_: A divergência detectada (decision_id d-1778621596138-3) mostrou o agente mantendo um lead apenas pelo tier objetivo B, ignorando H4 (sinal forte com fit médio), o que resultou em retenção de lead de fit médio sem sinal compensatório. Como a capacidade do time é restrita e o produto está em validação, o prompt precisa tornar explícito que Tier B + fit médio exige ativação de H4; caso contrário, a decisão padrão não deve ser 'manter'. Isso alinha o agente às restrições de capacidade e ao foco atual em infoprodutores brasileiros.
