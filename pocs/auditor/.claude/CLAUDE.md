# auditor

## O que e este projeto
POC do monorepo `poc-flue`. Agente Flue que **audita outro agente** em dominio de julgamento — compara o raciocinio do agente avaliado contra um **gabarito** (answer key / expected reasoning), detecta divergencias, classifica origem e propoe ajustes via PR no GitHub.

Tese: aplicar Decision Log + Classificacao de Ground Truth como sistema agentico que avalia outros sistemas agenticos.

> Vocabulario interno: `gabarito` aqui = **answer key**, nao o nome do projeto (que foi renomeado de `gabarito` → `auditor`).

## Stack
Cloudflare Workers + Flue SDK 0.3 + TypeScript 5.9 strict + Vitest + valibot 1.4 + Node 22.
Bindings: D1, R2, Workers AI. Cron triggers a cada 15min e a cada 6h.
LLM via AI Gateway (`poc-flue`) com modelo default `cloudflare-workers-ai/@cf/openai/gpt-oss-120b`.

## Comandos
- `npm run dev` — `flue dev --target cloudflare --env ../../.dev.vars` (puxa secrets da raiz)
- `npm run build` — `flue build --target cloudflare`
- `npm run deploy` — `wrangler deploy`
- `npm test` — `vitest run` (unitarios de lib + schemas)
- `npm run test:watch` — vitest em watch
- `npm run typecheck` — `tsc --noEmit`
- `npm run smoke` — `tsx scripts/smoke.ts` (smoke ponta-a-ponta)
- `npm run replay` — `tsx scripts/replay.ts` (POC simplificado)
- `npm run sync-r2` — `tsx scripts/sync-r2.ts` (espelha `.flue/skills/`, `expected-reasoning/` e `agents-config/` pro R2)
- `npm run seed-baseline` — `tsx scripts/seed-baseline.ts` (dispara o gerador 2× pra popular janela anterior antes do primeiro monitor)

## Verificacoes locais (rodar antes de commit/PR)
```bash
npm run typecheck
npm test
```
(`/ship` roda passo 0.3 aqui)

## Nao faca
- NAO commitar `.dev.vars` (na raiz do monorepo) — secrets reais
- NAO commitar `.claude/settings.local.json`, `.claude/plans/current.md`
- NAO commitar `dist/`, `.wrangler/`, `node_modules/`, `monitor-runs/` (artefatos)
- NAO produzir texto com PII em logs ou saidas de skill — toda saida valida contra schema valibot + passa por 4 camadas de defesa
- NAO confundir `gabarito` (answer key) com nome de projeto (renomeado pra `auditor`)
- NAO tomar acao irreversivel: PRs sao **propostas**, alertas sao **informativos**

## Arquitetura
Detalhes em [`docs/ARCHITECTURE.md`](../docs/ARCHITECTURE.md). Resumo:

3 agentes Flue:
- `monitor` — orquestrador disparado por POST/cron (pipeline de 14 passos: SELECT → bucketing → SQL criteria → detect-divergences → classify-origin → suggest-adjustment → summarize-patterns → R2 + PR + Telegram)
- `qualificador-generator` — endpoint que produz logs sinteticos no D1 (substitui o agente "real" no POC)
- `qualificador` — instanciado, nao disparado (logs vem do gerador)

5 skills (em `.flue/skills/`):
- `qualificar-lead` — 2 eixos: objetivo deterministico + julgamento LLM
- `detect-divergences` — identifica heuristicos ignorados em 1 decision
- `classify-origin` — classifica origem em 4 targets (prompt-issue, criterio-faltando, contexto-mudou, gabarito-stale)
- `suggest-adjustment` — gera texto de mudanca proposta pro target
- `summarize-patterns` — agrega divergencias, detecta cross-bucket signal

Defesa PII em 4 camadas (camadas 3+4 aplicadas em `defendPII` antes de qualquer write no D1).

```
pocs/auditor/
├── .flue/
│   ├── agents/             # monitor, qualificador-generator, qualificador
│   ├── roles/              # auditor-monitor, qualificador-sdr
│   └── skills/             # 5 skills com SKILL.md + references/
├── agents-config/          # contexto-momento, criterios-icp
├── expected-reasoning/     # gabaritos (answer keys)
├── fixtures/               # leads sinteticos + cenarios
├── migrations/             # 0001_init.sql (D1: decision_log + rejected + audit_run)
├── monitor-runs/           # artefatos de execucao (gitignored)
├── scripts/                # smoke, seed-baseline, replay, sync-r2
├── src/
│   ├── lib/                # bucketing, criteria, faw, github, hmac, pii, promotion, resolution, sandbox, synthetic-*, telegram
│   └── schemas/            # decision-log, pii, skills (valibot)
├── flue.config.ts
├── vitest.config.ts
├── wrangler.toml
└── tsconfig.json
```

## Secrets / Env vars
Secrets reais em `../../.dev.vars` (raiz do monorepo, gitignored). Vars publicas em `wrangler.toml [vars]`:

| Nome | Proposito | Onde setar |
|------|-----------|-----------|
| `CLOUDFLARE_AI_GATEWAY_ID` / `_TOKEN` | Routa LLM via Gateway | `.dev.vars` / `wrangler secret put` |
| `HMAC_SECRET` | Pseudonimizacao de agent_id/lead_id | `.dev.vars` / `wrangler secret put` |
| `GITHUB_REPO` / `GITHUB_PAT` | Cliente pra abrir PR | `.dev.vars` / `wrangler secret put` |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Alertas (so se severity = critical) | `.dev.vars` / `wrangler secret put` |
| `MODEL_MAIN` | Modelo default | `wrangler.toml [vars]` (publico) |
| `JANELA_HORAS`, `BUCKET_K_REPRESENTATIVES`, `SAMPLE_MIN_PER_BUCKET`, `WINDOWS_SILENT_TO_RESOLVE`, `DAYS_ACTIVE_TO_STALE`, `GITHUB_DEFAULT_BRANCH` | Tuning knobs do pipeline | `wrangler.toml [vars]` |

## Cloudflare Resources
Bindings em `wrangler.toml`:
- **D1** `auditor` (binding `DB`) — `decision_log`, `decision_log_rejected`, `audit_run`
- **R2** `auditor` (binding `AUDITOR_R2`) — FAW (gabarito, contexto, artefatos de run em `decisions/<date>/<run-id>/`, skills espelhadas em `.agents/skills/`)
- **AI** (binding `AI`) — Workers AI
- **AI Gateway** `poc-flue` — concentra trafego LLM (rastreabilidade + retry/cache)
- **Cron triggers**: `*/15 * * * *` (monitor) + `0 */6 * * *` (housekeeping)

Apos mudar binding em `wrangler.toml`: rodar `npx wrangler types` pra regerar `worker-configuration.d.ts`.

## Coding Standards

Rules globais (em `~/.claude/rules/`):
- code-quality, security, git, observability, testing-unit, testing-e2e, releases

Rules do projeto (em `.claude/rules/`):
- `ci.md` — convencoes de CI
- `workers.md` — Cloudflare Workers (bindings, secrets, entrypoint, fetch externo, gotchas)

Convencoes especificas (do `AGENTS.md` da POC):
- Toda saida de skill valida contra schema valibot — nao inventar campos
- Nunca acao irreversivel: PR = proposta, alerta = informativo
- PII nunca aparece em texto produzido pelo agente (nomes, telefones, emails, valores monetarios) — abstrair sempre
- Reasoning articulado no formato `X porque Y → Z`

## Fluxo de Trabalho

### Inicio de sessao
1. `git fetch origin && git status` — ver estado local + se divergiu de origin/main
2. Se uncommitted changes: parar e perguntar
3. Se main divergente e tree limpo: `git checkout main && git pull`

### Implementar feature
1. Pedido vago → `/superpowers:brainstorming`
2. Pedido claro mas medio/grande → `@planner` direto (escreve `.claude/plans/current.md`)
3. Pedido trivial (1-2 arquivos) → implementar direto
4. Implementar
5. `/ship` (orquestra @reviewer → [@security] → @docs → @shipper)

### Releases
- Mudancas acumulam em `## [Unreleased]` do `CHANGELOG.md` (a criar)
- Bump via `/release` (patch default) → tag `auditor-vX.Y.Z` → GitHub Release → `npm run deploy`
- Detalhes em `~/.claude/rules/releases.md`

### Roadmap
Proximas evolucoes em `docs/V0.2-EVOLUTION.md`.

## Context
- @package.json
- @wrangler.toml
- @AGENTS.md
- @docs/ARCHITECTURE.md
- @docs/V0.2-EVOLUTION.md
- @../../docs/superpowers/specs/2026-05-11-gabarito-poc-design.md
