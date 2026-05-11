# Arquitetura

POC com 3 agentes Flue (dois disparados, um instanciado):

- `monitor` — orquestrador disparado por POST/cron. Executa pipeline de auditoria.
- `qualificador-generator` — endpoint que produz logs sintéticos no D1 (substitui o agente "real" no POC).
- `qualificador` — instanciado, mas não disparado no loop do monitor (logs vêm do gerador).

## Pipeline do monitor (14 passos)

1. Checkpoint (lê `last_processed_ts` de `audit_run`)
2. SELECT candidates: out_of_scope OU contradição obj↔julg na janela
3. Bucketing cartesiano (3×3×2 = 18 buckets, exclui 3 tranquilos)
4. Filtro: buckets com count >= `SAMPLE_MIN_PER_BUCKET`
5. SQL criteria (#2 out_of_scope_growth, #3 regression, #4 budget_blow)
6. Inicializa session Flue com AI Gateway provider
7. Carrega gabarito do R2
8. `detect-divergences` paralelo: K representantes por bucket
9. Dedup por (heuristic_ignored, bucket_key)
10. `classify-origin` + `suggest-adjustment` paralelo: 1 chamada por divergência única
11. `summarize-patterns` (1 chamada agregada)
12. Severidade: cross-bucket signal → critical; promoção a finding → critical; SQL → warn/info
13. R2: grava `analysis.md`, `proposal.md`, `divergencias.json` em `decisions/<date>/<run-id>/`
14. PR no GitHub (se severity != info) + alerta Telegram (se severity == critical)
15. Atualiza checkpoint

## Skills

| Skill | Função | Onde |
|---|---|---|
| `qualificar-lead` | Aplica 2 eixos (objetivo determinístico + julgamento LLM) | `.flue/skills/qualificador/` |
| `detect-divergences` | Identifica heurísticos ignorados em 1 decision | `.flue/skills/monitor/` |
| `classify-origin` | Classifica origem da divergência em 4 targets | `.flue/skills/monitor/` |
| `suggest-adjustment` | Gera texto de mudança proposta pro target | `.flue/skills/monitor/` |
| `summarize-patterns` | Agrega divergências, detecta cross-bucket signal | `.flue/skills/monitor/` |

## Defesa PII (4 camadas, spec §12)

1. **Camada 1** — Role do qualificador-sdr instrui abstrair valores/nomes
2. **Camada 2** — Prompt da skill `qualificar-lead` reforça abstração
3. **Camada 3** — Validation (`containsPII`) rejeita antes do insert; rejeitados vão pra `decision_log_rejected`
4. **Camada 4** — Sanitizer (`sanitizePII`) substitui padrões PII restantes por placeholders

Pipeline aplica camadas 3+4 em `defendPII` antes de qualquer write em D1.

## Recursos Cloudflare

- D1 `auditor` (binding `DB`) — decision_log + decision_log_rejected + audit_run
- R2 `auditor` (binding `AUDITOR_R2`) — FAW (gabarito, contexto, artefatos de run)
- AI Gateway `poc-flue` — concentra tráfego LLM (rastreabilidade + retry/cache)
- Workers AI (`@cf/meta/llama-4-scout-17b-16e-instruct` por default)

Spec completa: `/docs/superpowers/specs/2026-05-11-gabarito-poc-design.md`.
