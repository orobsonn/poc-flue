# poc-flue

## O que e este projeto
Monorepo de POCs explorando primitivas do design de agentes com [Flue](https://flueframework.com). Cada POC e self-contained (proprio Worker, package.json, wrangler) e materializa uma primitiva em dominio aplicado.

## Stack
Monorepo orquestrador — sem stack propria na raiz. Cada POC define a sua:
- Cloudflare Workers + Flue SDK em `pocs/<nome>/wrangler.toml` + `package.json`
- TypeScript 5.9 strict, Vitest, valibot — padrao das POCs
- `.dev.vars` **centralizado** na raiz e referenciado por cada POC (`flue dev --env ../../.dev.vars`)
- CI compartilhado em `.github/workflows/` (deploy roteado por POC)

## Comandos
Sem scripts npm na raiz. Operacoes ficam dentro de cada POC:
```bash
cd pocs/<nome>/
npm run dev          # flue dev --target cloudflare --env ../../.dev.vars
npm run build        # flue build --target cloudflare
npm test             # vitest run
npm run typecheck    # tsc --noEmit
npm run deploy       # wrangler deploy
```

## Verificacoes locais (rodar antes de commit/PR)
```bash
# Para cada POC tocada na branch:
cd pocs/<nome>/
npm run typecheck
npm test
```
(`/ship` roda passo 0.3 em cada POC modificada)

## Nao faca
- NAO commitar `.dev.vars` (raiz), `.env*`, `.local.*` — secrets reais centralizados aqui
- NAO commitar `.claude/settings.local.json`, `.claude/plans/current.md`
- NAO misturar mudancas de POCs diferentes na mesma PR — 1 POC por branch (excecao: refactor cross-POC documentado)
- NAO criar dependencia entre POCs — cada uma e isolada e tem seu proprio destino de deploy

## Arquitetura

```
poc-flue/
├── pocs/                              # POCs self-contained
│   └── <nome>/
│       ├── README.md
│       ├── package.json               # deps da POC
│       ├── wrangler.toml              # bindings Cloudflare
│       ├── tsconfig.json
│       ├── vitest.config.ts
│       ├── flue.config.ts
│       ├── .flue/                     # agents, roles, skills (Flue)
│       ├── src/                       # lib + schemas
│       ├── migrations/                # D1 SQL
│       ├── scripts/                   # smoke, replay, sync
│       ├── docs/                      # ARCHITECTURE, README, CONTRIBUTING
│       └── .claude/                   # CLAUDE.md + rules da POC
├── docs/superpowers/
│   ├── specs/                         # designs cross-POC
│   └── plans/                         # planos executaveis
├── .github/workflows/                 # CI compartilhado (1 workflow por POC)
├── .dev.vars                          # secrets centralizados (gitignored)
└── .claude/                           # contexto do monorepo
```

POCs ativas:
- `pocs/auditor/` — agente que audita outro agente em dominio de julgamento (v0.1)

## Secrets / Env vars
Todos centralizados em `.dev.vars` na raiz (gitignored). Cada POC importa via `--env ../../.dev.vars`:

| Nome | Proposito | Onde setar |
|------|-----------|-----------|
| `CLOUDFLARE_ACCOUNT_ID` | Conta CF pra deploy | `.dev.vars` / GitHub Actions secret |
| `CLOUDFLARE_API_TOKEN` | Deploy via wrangler | `.dev.vars` / `wrangler secret put` |
| `CLOUDFLARE_AI_GATEWAY_ID` | Gateway concentrando trafego LLM | `.dev.vars` |
| `CLOUDFLARE_AI_GATEWAY_TOKEN` | Auth do gateway | `.dev.vars` / `wrangler secret put` |
| `HMAC_SECRET` | Pseudonimizacao de IDs (auditor) | `.dev.vars` / `wrangler secret put` |
| `GITHUB_REPO` / `GITHUB_PAT` | Cliente GitHub pra abrir PR (auditor) | `.dev.vars` / `wrangler secret put` |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | Alertas Telegram (auditor) | `.dev.vars` / `wrangler secret put` |

Detalhes por POC em `pocs/<nome>/.claude/CLAUDE.md`.

## Cloudflare Resources
Bindings ficam em `pocs/<nome>/wrangler.toml`. Inventario por POC:

- **auditor**: D1 `auditor` (`DB`), R2 `auditor` (`AUDITOR_R2`), Workers AI (`AI`), 2 cron triggers

## Coding Standards

Rules globais (em `~/.claude/rules/`):
- code-quality, security, git, observability, testing-unit, testing-e2e, releases

Rules do projeto (em `.claude/rules/`):
- `ci.md` — convencoes de CI compartilhado

Rules de POC (em `pocs/<nome>/.claude/rules/`):
- auditor: `workers.md` (Cloudflare), `ci.md`

## Fluxo de Trabalho

### Inicio de sessao
1. `git fetch origin && git status` — ver estado local + se divergiu de origin/main
2. Se uncommitted changes: parar e perguntar
3. Se main divergente e tree limpo: `git checkout main && git pull`

### Implementar feature
1. Pedido vago → `/superpowers:brainstorming`
2. Pedido claro mas medio/grande → `@planner` direto (escreve `.claude/plans/current.md`)
3. Pedido trivial (1-2 arquivos) → implementar direto
4. Implementar dentro da POC alvo (`pocs/<nome>/`)
5. `/ship` (orquestra @reviewer → [@security] → @docs → @shipper)

### Nova POC
1. Criar `pocs/<nome>/` com `package.json`, `wrangler.toml`, `tsconfig`, `vitest.config`
2. Rodar `/init-project` dentro de `pocs/<nome>/` pra setar `.claude/` da POC
3. Adicionar workflow em `.github/workflows/<nome>-deploy.yml`
4. Listar a POC no `README.md` da raiz

### Releases
Cada POC versiona separado:
- Mudancas acumulam em `## [Unreleased]` do `pocs/<nome>/CHANGELOG.md`
- Bump via `/release` (patch default) dentro da POC → tag `<nome>-vX.Y.Z` → GitHub Release → deploy
- Detalhes em `~/.claude/rules/releases.md`

## Context
- @README.md
- @pocs/auditor/README.md
- @docs/superpowers/specs/
