# Sinais de divergência aparente no `reasoned`

Padrões linguísticos que aparecem em decisões onde o agent **provavelmente ignorou ou mal-aplicou** um heurístico do gabarito. NÃO confirmam divergência (essa é tarefa de `detect-divergences`) — apenas indicam que vale auditar.

## Sinais fortes (peso alto na triage)

### 1. Justificativa subjetiva sem heurístico citado

Padrões: "interlocutor sinalizou X", "sinal forte de Y", "interesse aparente", "potencial alto", "intenção clara", "fit baixo compensado por Z", "descomprometimento na call", "engajamento aparente".

Diagnóstico: o gabarito é uma lista finita de heurísticos com siglas (H1, H2, ...). Reasoning que decide sem **invocar pelo menos uma sigla ou a mecânica literal de um heurístico** é candidato a violar a rubrica.

Exemplo:
- `reasoned`: "priorizar porque sinal forte de intenção compensa fit baixo"
- Análise: bucket priorizar/C/0. Nenhum heurístico do gabarito autoriza "sinal forte de intenção" como compensador. Suspeito de violar H5 ("tier C sem heurístico compensatório → descartar").

### 2. Contradição interna entre reasoned e lead

Padrões: reasoning afirma fato sobre o lead que o `lead` snapshot contradiz.

Exemplos:
- reasoning: "menciona dor específica" + `lead.menciona_dor === 0` → contradição.
- reasoning: "fundador técnico em fase produto" + `lead.fundador_tecnico === 0` → contradição.
- reasoning: "enterprise" + `lead.faturamento_band === '0-50k'` → contradição.

Diagnóstico: o agent inventou ou mal-leu o lead. Auditoria deve confirmar com `detect-divergences`.

### 3. Contradição entre reasoned e outcome

Padrões: reasoning argumenta em direção X, mas o `judgment_outcome` é direção oposta. Ou o reasoning invoca heurístico que recomenda Y mas decide Z.

Exemplos:
- reasoning: "H3 enterprise sem capacidade → manter" + `judgment_outcome: 'descartar'` → contradição.
- reasoning: "tier A confere fit estrutural alto" + `judgment_outcome: 'descartar'` sem heurístico de inversão → contradição.

### 4. Out-of-scope amplo demais

Padrões: `out_of_scope` afirma "faltou contexto" / "faltou dado de X" mas o `lead.contexto_livre_sanitized` tem texto rico, OU o lead.X tem valor preenchido.

Exemplos:
- `out_of_scope`: "faltou dado sobre maturidade do time" + `lead.time_vendas === 'enterprise-time'` (já indica maturidade).
- `out_of_scope`: "faltou contexto sobre dor" + `lead.menciona_dor === 1`.

## Sinais médios (peso moderado)

### 5. Heurístico invocado com restrição inventada

Padrões: reasoning cita Hn mas adiciona condicional que não está no gabarito.

Exemplos:
- reasoning: "H6 default tier A não se aplica em mid-market" — gabarito não cria restrição mid-market em H6.
- reasoning: "H1 só vale se segmento é saas" — gabarito não restringe H1 a segmento.

### 6. Empilhamento de sinais sem heurístico mestre

Padrões: reasoning lista 3+ observações qualitativas e conclui sem invocar heurístico explícito.

Exemplo:
- "priorizar porque demonstra interesse, time pequeno, contexto promissor" — 3 observações, zero heurísticos. Provavelmente está pulando avaliação rubrica.

## Sinais fracos (peso baixo, só desempate)

### 7. Reasoning muito curto

Padrão: `reasoned` com < 40 caracteres. Pode ser preguiça do agent ou caso trivial.

### 8. Reasoning sem articulação causal X porque Y → Z

Padrão: o projeto convenciona formato "X porque Y → Z" pro `reasoned`. Reasoning que não segue isso é candidato a auditar (mas não é divergência por si só).

## Como combinar sinais

- 1 sinal forte: suspeita confirmada, vale auditar.
- 2+ sinais médios: suspeita, vale auditar.
- Apenas fracos: depende de diversidade — use só se faltar candidato.

Lembre: este passo é **triage**, não diagnóstico. A confirmação vem do `detect_divergences`.
