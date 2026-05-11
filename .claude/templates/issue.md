# Template de Issue

Formato padrao para criar issues no GitHub a partir de um plano. Copie o bloco abaixo e adapte ao criar via `gh issue create`.

---

```markdown
## Contexto

Parte [N/TOTAL] da feature **<nome>**. Plano completo em `.claude/plans/current.md`.

[Descricao curta do que esta issue resolve e como encaixa no todo]

**Depende de #[N]** (se houver, caso contrario remover)

## Tarefas

- [ ] [Tarefa 1 — concreta, verificavel]
- [ ] [Tarefa 2]
- [ ] [Tarefa 3]

## Regras importantes

- [Regra de arquitetura/convencao relevante]
- [Gotcha ja identificado no plano]

## Criterio de aceite

- [ ] `npx tsc --noEmit` → zero erros
- [ ] `npm test` → verde (nao quebra testes existentes)
- [ ] [Criterio especifico desta issue]
- [ ] [Criterio especifico 2 — ex: smoke manual passa]

Referencia: `.claude/plans/current.md`
```

## Como usar

### Fluxo medio/grande (feature em multiplas issues)

1. Usuario descreve objetivo
2. `@planner` cria spec em `.claude/plans/current.md`
3. Usuario aprova
4. Agente principal cria issues manualmente com `gh issue create`, baseado nas tarefas `@main` do plano, seguindo o template acima
5. Para cada issue: implementar → `/ship` (review → [security] → docs → shipper)

### Notas

- Issues pequenas (1-2 dias de trabalho max) sao melhores que gigantes
- Sempre referenciar `Closes #N` no commit da PR
- Depender de outras issues: usar `**Depende de #N**` no body

### Comando exemplo

```bash
gh issue create \
  --title "feat: [1/3] <feature> — <parte>" \
  --body "$(cat <<'EOF'
## Contexto
Parte 1/3 da feature <nome>. Plano em .claude/plans/current.md.

## Tarefas
- [ ] Criar src/...
- [ ] Wirar em src/...

## Criterio de aceite
- [ ] tsc ok, test ok
- [ ] <criterio especifico>

Referencia: .claude/plans/current.md
EOF
)"
```
