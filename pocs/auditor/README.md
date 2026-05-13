# auditor

Agente que **avalia outro agente** em domínio de julgamento e propõe ajustes via PR no GitHub. POC do monorepo [`poc-flue`](../../).

> Vocabulário interno: `gabarito` é o **answer key** (expected reasoning) usado pra comparar o raciocínio do agente avaliado. Não confundir com o nome do POC (renomeado de `gabarito` → `auditor`).

## O que esse POC ensina

A **primitiva**: como construir um meta-agente — um agente cuja função é observar, classificar e corrigir o comportamento de outros agentes em produção. Em específico:

- **Decision Log + Ground Truth classification** — toda decisão do agente avaliado vira linha auditável; divergências contra o gabarito são classificadas em 4 origens (`prompt-issue`, `criterio-faltando`, `contexto-mudou`, `gabarito-stale`).
- **Ação propositiva, nunca destrutiva** — o auditor abre PRs e dispara alertas; humano decide o merge. Nenhum efeito colateral é irreversível.
- **Defesa PII em 4 camadas** — saídas de skill validadas com valibot + pseudonimização HMAC antes de qualquer write. Mostra um padrão concreto pra agente que toca dado sensível.
- **Pipeline agêntico de 14 passos** orquestrado num único Worker, com cron triggers, D1 pra log estruturado e R2 pra artefatos.

Se você está estudando como dar **observabilidade e auto-correção** a agentes LLM em produção, esse é o ponto de partida.

## Roteiro de leitura (start here)

Em ordem crescente de profundidade:

1. **[Showcase v0.3](./docs/showcase/v0.3.html)** *(abrir no navegador)* — visualização de um run real, o jeito mais rápido de pegar a intuição.
2. **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** — diagrama dos 3 agentes, 5 skills e fluxo do pipeline.
3. **[Spec do design](../../docs/superpowers/specs/2026-05-11-gabarito-poc-design.md)** — o "porquê" de cada decisão (nome histórico: gabarito).
4. **[Plan de implementação](../../docs/superpowers/plans/2026-05-11-gabarito-poc.md)** — o "como" passo-a-passo (task-by-task).
5. **Código**: comece por `src/lib/` (utilidades puras, fácil de ler isoladas) → `.flue/skills/*/SKILL.md` (skills com schema valibot) → `.flue/agents/monitor` (orquestração).

Evolução pós v0.1: [V0.2-EVOLUTION](./docs/V0.2-EVOLUTION.md) → [V0.3-EVOLUTION](./docs/V0.3-EVOLUTION.md) → [V0.3-RESULTS](./docs/V0.3-RESULTS.md) mostram como o design foi sendo refinado.

## Rodar local

Pré-requisitos: setup do monorepo (`.dev.vars` na raiz preenchido — veja [`../../.dev.vars.example`](../../.dev.vars.example)).

```bash
cd pocs/auditor/
npm install
npm run dev          # flue dev --target cloudflare --env ../../.dev.vars
npm test             # vitest
npm run typecheck    # tsc --noEmit
npm run smoke        # smoke ponta-a-ponta
```

Outros scripts úteis: `npm run replay`, `npm run sync-r2`, `npm run seed-baseline`. Detalhes em [`.claude/CLAUDE.md`](./.claude/CLAUDE.md).

## Status

v0.3 — auditor agêntico em 4 stages + veredito Flue. Próximas evoluções acumulam em `docs/`.
