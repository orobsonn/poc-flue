# Como estudar e estender

## Pra estudar o POC

- Leia o spec em `/docs/superpowers/specs/2026-05-11-gabarito-poc-design.md`
- Leia `docs/ARCHITECTURE.md` pro mapa do pipeline (14 passos)
- Rode `npm run smoke` e observe o pipeline ponta-a-ponta
- Inspecione `decision_log` no D1 e os artefatos em R2 (`decisions/<date>/<run-id>/`)

## Pra estender

### Adicionar agente avaliado
- Criar `.flue/agents/<nome>.ts` + role em `.flue/roles/<nome>-<papel>.md`
- Criar skills em `.flue/skills/<nome>/<skill>/SKILL.md`
- Adicionar gabarito em `expected-reasoning/<nome>/<fase>.md`
- Configs em `agents-config/<nome>/`

### Adicionar critério SQL novo
- Implementar em `src/lib/criteria.ts` (função pura testável)
- Plugar em `runSqlCriteria` no `.flue/agents/monitor.ts`
- Plugar em `computeSeverity` se relevante pra threshold de criticidade

### Adicionar tipo de target
- Schema: novo valor no `TargetSchema` em `src/schemas/skills.ts`
- Mapeamento: nova branch em `targetToFile()` no monitor
- Reference de detecção: `.flue/skills/monitor/classify-origin/references/<novo>.md`
- Reference de ajuste: `.flue/skills/monitor/suggest-adjustment/references/ajuste-<novo>.md`

## Princípios obrigatórios

- TypeScript strict, `noUncheckedIndexedAccess: true`, sem `any`
- 1 export principal por arquivo
- JSDoc `/** @description ... */` em toda função exportada (lib + agentes)
- Comentários só pro PORQUÊ não-óbvio
- Defesa PII em todo insert
- Schema valibot na borda (input HTTP, output de skill)
- Sem `Co-Authored-By: Claude` em commits
- Conventional Commits em pt-br
