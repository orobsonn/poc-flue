# auditor

Agente que avalia outro agente em domínio de julgamento e propõe ajustes via PR. POC do monorepo `poc-flue`.

**Tese**: aplica a metodologia de Decision Log + Classificação de Ground Truth, materializada em Flue como sistema agêntico que audita outros sistemas agênticos e propõe ajustes via PR no GitHub.

> Vocabulário interno: `gabarito` é o **answer key** (expected reasoning) usado pra comparar o raciocínio do agente avaliado. Não confundir com o nome do POC.

## Documentação completa

- **Spec** (design): [`../../docs/superpowers/specs/2026-05-11-gabarito-poc-design.md`](../../docs/superpowers/specs/2026-05-11-gabarito-poc-design.md) (nome histórico — projeto renomeado pra `auditor`)
- **Plan** (implementação): [`../../docs/superpowers/plans/2026-05-11-gabarito-poc.md`](../../docs/superpowers/plans/2026-05-11-gabarito-poc.md)

## Status

Em desenvolvimento. Implementação seguindo o plano task-by-task.
