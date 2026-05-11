# auditor

Monitor autônomo de agentes em domínio de julgamento. POC educacional construído com Flue + Cloudflare Workers.

**Tese**: aplica literal a metodologia de Decision Log + Classificação de Ground Truth do vault, materializada em Flue como sistema agêntico que avalia outros sistemas agênticos e propõe ajustes via PR.

## Quickstart

```bash
npm install
cp ../../.dev.vars.example ../../.dev.vars  # preencher na raiz do monorepo
npx wrangler d1 execute auditor --local --file=migrations/0001_init.sql
npm run dev
# em outra aba:
npm run smoke
```

## Estrutura
Veja `docs/ARCHITECTURE.md`.

## Notas do vault embutidas
Veja `docs/VAULT-NOTES.md`.

## Como estudar / estender
Veja `docs/CONTRIBUTING.md`.

## Spec autoritativa
`/docs/superpowers/specs/2026-05-11-gabarito-poc-design.md` (nome histórico — POC renomeado pra auditor).
