# Ajuste de Critério

## Quando aplicar
Divergência classificada como `criterio-faltando`. A rubrica ICP (`agents-config/qualificador/criterios-icp.md`) não pondera uma dimensão objetiva que aparece recorrente nos `reasoned`. A sugestão adiciona linha nova na tabela markdown e redistribui pesos pra somar 100 — indicando explicitamente qual critério perde peso pra abrir espaço.

## Target file
`agents-config/qualificador/criterios-icp.md`

## Sinais positivos pra esse ajuste
- Fator objetivo, mensurável, recorrente em buckets distintos
- Nenhum dos 5 critérios atuais cobre
- Direção do impacto é clara (mais usuários = mais ICP-fit, por exemplo)

## Sinais que NÃO pedem ajuste-criterio (anti-patterns)
- Fator subjetivo (qualidade de pitch, percepção de maturidade) → provavelmente `ajuste-gabarito`
- Critério já existe, agente só não usou → `ajuste-prompt`
- Dimensão é sobre nós (capacidade do time) → `ajuste-contexto`

## Template do `proposed_change`

Substituir a tabela da rubrica (ou adicionar linha + ajustar pesos):

~~~md
| # | Critério | Regra | Peso |
|---|---|---|---|
| 1 | Segmento | está em [infoprodutor, agência de marketing, SaaS B2B] | 30 |
| 2 | Faturamento mensal | >= R$ 50k | 10 |
| 3 | Time de vendas | tem time dedicado (não solo) | 20 |
| 4 | Ferramentas atuais | usa CRM ou plataforma de automação | 15 |
| 5 | Sinal de intenção | pediu demo OU preencheu form qualificado | 10 |
| 6 | Base de usuários ativos | tem >5k usuários ativos no produto | 15 |

(Ajuste: critério #2 Faturamento mensal de 25 → 10, redistribuído pra capturar tração de produto SaaS sem faturamento alto. Total continua 100.)
~~~

## Exemplo worked

**Input divergence (classificada como criterio-faltando):**
```json
{
  "heuristic_ignored": "H5 — Score baixo sem sinal compensatório",
  "evidence": "3 leads SaaS B2B com >10k usuários descartados como tier C — reasoned cita 'base relevante mas rubrica não pondera'",
  "target": "criterio-faltando"
}
```

**Output esperado:**
```json
{
  "target_file": "agents-config/qualificador/criterios-icp.md",
  "proposed_change": "<tabela do template acima com critério 6 'Base de usuários ativos' peso 15>",
  "rationale": "base de usuários ativos é dimensão objetiva recorrente; peso 15 vem de redistribuir o faturamento (de 25 pra 10), reconhecendo que SaaS B2B em estágio inicial pode ter tração de produto sem faturamento alto"
}
```

## Limites de escopo
- Total da rubrica DEVE somar 100 — checar antes de propor
- Indicar EXPLICITAMENTE de qual critério vem o peso novo (não deixar implícito)
- 1 critério novo por sugestão
- Não mexer nas thresholds de tier (A >= 75, B 50-74, C < 50)
