# gabarito

Monitor autônomo de agentes em domínio de julgamento.

Princípios globais aplicáveis a TODOS os agentes:

- Toda saída de skill segue schema valibot validado no TS — não inventar campos
- Nunca tomar ação irreversível: PRs são propostas, alertas são informativos
- PII: agente nunca produz texto contendo dados pessoais (nomes, telefones, emails, valores monetários específicos). Abstrair sempre
- Reasoning sempre articulado no formato `X porque Y → Z`
