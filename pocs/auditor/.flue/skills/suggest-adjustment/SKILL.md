---
name: suggest-adjustment
description: Gera texto de mudança proposta para um arquivo target específico baseado em divergência classificada. Recebe agora `contexto_momento` como insumo extra para grounding da sugestão no estado atual de negócio (fase, capacidade, foco). Use sempre que receber uma divergência com origem já classificada — o output é texto livre da sugestão, NÃO diff (humano edita no PR). Skip se o target for unknown ou inconclusive.
model: main
---

# Suggest Adjustment

Você gera texto de sugestão pra um arquivo específico.

## Input
- `divergencia`: { heuristic_ignored, evidence, target }
- `current_content`: conteúdo atual do arquivo target
- `contexto_momento`: markdown do contexto-momento.md (use como referência de fase, capacidade, foco atual ao formular a sugestão)

## Operação
Conforme `target`, carregue a reference específica via tool `read` (path absoluto no sandbox). Mapeamento `target` → arquivo:

| target              | arquivo a ler                                                              |
|---------------------|----------------------------------------------------------------------------|
| `prompt-issue`      | `.agents/skills/suggest-adjustment/references/ajuste-prompt.md`            |
| `gabarito-stale`    | `.agents/skills/suggest-adjustment/references/ajuste-gabarito.md`          |
| `criterio-faltando` | `.agents/skills/suggest-adjustment/references/ajuste-criterio.md`          |
| `contexto-mudou`    | `.agents/skills/suggest-adjustment/references/ajuste-contexto.md`          |

> O nome do arquivo NÃO repete o sufixo do target (não existe `ajuste-prompt-issue.md` — é `ajuste-prompt.md`). Use o mapeamento acima literalmente.

Siga o template da reference. Use `contexto_momento` para garantir que a sugestão reflete a fase/capacidade/foco atuais — especialmente em targets `gabarito-stale` e `contexto-mudou`.

## Output
```json
{
  "target_file": "<caminho relativo ao repo>",
  "proposed_change": "<texto livre da mudança proposta>",
  "rationale": "<por que essa mudança resolve a divergência>"
}
```

## REGRAS DURAS DE FORMATO (não-negociáveis — o parser do framework lê o conteúdo cru entre `---RESULT_START---` e `---RESULT_END---`)

- **NUNCA inclua cerca markdown** (```` ``` ````, ```` ```json ````) dentro do bloco entre os marcadores. O parser não remove cerca; um único ` ``` ` quebra o JSON inteiro. Coloque o objeto JSON direto, sem nenhum prefixo/sufixo.
- **Aspas e quebras de linha dentro das strings**: use `\n` literal para newline e `\"` para aspa interna. Não use crases nem aspas tipográficas (`"` e `"`).
- **Sem texto fora do objeto**: nada antes do `{` nem depois do `}` dentro do bloco. Sem `Note:`, sem comentários, sem `// ...`.
- **`proposed_change` é uma única string JSON**: se a sugestão tem múltiplos parágrafos ou pontos numerados, junte tudo numa única string usando `\n` (ex: `"1. Item um.\n\n2. Item dois."`). NÃO quebre em array nem em objeto aninhado — o schema é `string`.
- **Cap de tamanho de `proposed_change`**: ~1500 caracteres. Se a sugestão for maior, sintetize em pontos numerados e mantenha foco no que muda no arquivo target — não repita evidência ou rationale.

## REGRAS DURAS DE CONTEÚDO
- NÃO gere diff — humano edita no PR
- NÃO modifique seções não-relacionadas à divergência
- Mantenha tom e estrutura do arquivo original
- Se a sugestão for grande, divida em pontos numerados (dentro da string única de `proposed_change`)

## Exemplo de output bem formado (entre os marcadores do framework)

```
---RESULT_START---
{"target_file":".flue/skills/qualificador/qualificar-lead/SKILL.md","proposed_change":"Adicionar subseção \"Quando aplicar H6\" no fluxo de decisão:\n\n1. Se tier objetivo for A AND nenhum H1..H5 disparar em sentido contrário, cite H6 explicitamente no reasoned.\n2. Não invente critérios qualitativos (descomprometimento, intenção) para inverter H6 — só H3 (enterprise sem capacidade) pode contradizê-lo.","rationale":"Trace mostra 3 leads tier A descartados com justificativa qualitativa não suportada por nenhum Hx. Forçar citação de H6 no prompt elimina a inversão sem precisar mudar o gabarito."}
---RESULT_END---
```

Note: nenhuma cerca markdown entre os marcadores, JSON puro, `\n` literal nas quebras de linha.
