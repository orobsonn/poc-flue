# Rubrica ICP — Eixo Objetivo

Aplicação determinística (código puro, sem LLM). Score 0-100. Tier: A >= 75, B 50-74, C < 50.

| # | Critério | Regra | Peso |
|---|---|---|---|
| 1 | Segmento | está em [infoprodutor, agência de marketing, SaaS B2B] | 30 |
| 2 | Faturamento mensal | >= R$ 50k | 25 |
| 3 | Time de vendas | tem time dedicado (não solo) | 20 |
| 4 | Ferramentas atuais | usa CRM ou plataforma de automação | 15 |
| 5 | Sinal de intenção | pediu demo OU preencheu form qualificado | 10 |

Dado ausente = 0 pontos no critério. Acima de 2 ausentes = `confidence: baixa`.
