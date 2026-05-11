---
paths:
  - ".github/workflows/**"
  - ".github/dependabot.yml"
---

# CI/CD

Carrega ao editar workflows GitHub Actions ou config Dependabot.

## Conventions

- CI roda em PRs contra main (`on: pull_request`)
- Steps obrigatorios: typecheck (`npx tsc --noEmit`) + testes (`npm test`) + audit + secret detection
- Audit: `npm audit --omit=dev --audit-level=moderate` — falha se vulnerabilidade moderate+ em deps de prod. Deps de dev fora porque nao sao bundled
- Secrets nunca hardcoded — `.env`, `.dev.vars`, `.local.*` no `.gitignore`. CI verifica e falha se encontrar staged
- Dependabot conservador: auto-PR so pra `minor`/`patch`. Majors planejados manualmente
- Pacotes pre-1.0 (`0.x`): bloquear minor tambem — `0.x → 0.x+1` frequentemente breaking
- Versionamento semver: comeca em `v0.0.1`, cada release autorizado incrementa patch (ver `~/.claude/rules/releases.md`)

## Patterns

- **Workflow basico**:
  ```yaml
  name: CI

  on:
    pull_request:
      branches: [main]

  jobs:
    ci:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with:
            node-version: 22
            cache: npm
        - run: npm ci
        - name: Typecheck
          run: npx tsc --noEmit
        - name: Test
          run: npm test
        - name: Audit prod deps
          run: npm audit --omit=dev --audit-level=moderate
        - name: Check no secrets staged
          run: |
            if git ls-files | grep -E '\.(env|dev\.vars)(\.|$)' | grep -v 'example'; then
              echo "Secrets staged!"; exit 1
            fi
  ```

- **Dependabot conservador**:
  ```yaml
  version: 2
  updates:
    - package-ecosystem: "npm"
      directory: "/"
      schedule:
        interval: "weekly"
      open-pull-requests-limit: 5
      ignore:
        # Majors sempre manuais
        - dependency-name: "*"
          update-types: ["version-update:semver-major"]
        # Pre-1.0: minor pode ser breaking
        - dependency-name: "@cloudflare/codemode"
          update-types: ["version-update:semver-minor"]
    - package-ecosystem: "github-actions"
      directory: "/"
      schedule:
        interval: "monthly"
  ```

- **Verificar CI antes de merge**:
  ```bash
  gh pr checks <PR_NUMBER>
  ```

## Gotchas

- **Pre-1.0 pacote**: bumps minor podem quebrar. Configurar Dependabot pra ignorar `version-update:semver-minor`
- **`npm audit` com deps transitivas**: CVE em pacote dev sem fix direto — esperar mantenedor. Validar se e dev-only
- **Dependabot PRs sempre revisadas antes de merge**: minor pode ter regressao. CI roda automatico na PR, ler diff antes de merge
- **Secrets do GitHub vs Dependabot**: abas separadas em `Settings → Secrets and variables`. PRs do Dependabot nao recebem `Actions secrets` por default — cadastrar tambem em "Dependabot" se CI precisar
- **CI nao roda em push direto pra main nem em tags**: `pull_request` nao dispara nesses casos. Validar localmente antes de release commits
- **Types como devDependency explicita**: se `tsconfig.json` declara `"types": ["@types/node"]`, cada tipo citado DEVE estar em `devDependencies`. Confiar em dep transitiva quebra silenciosamente em bumps
