---
status: APPROVED — pronto pra implementação
date: 2026-05-11
project_name: gabarito
tagline: Monitor autônomo de agentes em domínio de julgamento — sem gabarito, não dá pra auditar mecanismo.
---

# gabarito — POC Flue: Monitor Autônomo de Agentes

## 1. Tese central

POC = aplicação literal das notas do vault sobre **arquitetura de log agêntica** (`jugb68g4o8q4` Decision Log 4 Camadas) e **classificação de ground truth** (`ic379ez19ew2` P1/P2/P3), materializada em Flue como **monitor autônomo que avalia agentes em domínio de julgamento, detecta divergência de mecanismo e propõe ajustes via PR**.

**Foco**: construir o sistema de monitoramento. O agente avaliado (qualificador de leads) existe na estrutura Flue completa, mas não dispara no loop do POC — seus logs vêm de gerador sintético código puro, sem LLM. O monitor abre PRs modificando os artefatos REAIS desse agente.

**Modo**: α — loop fechado auto-aplicado. PR aprovado modifica artefatos versionados, próxima execução do gerador reflete o ajuste, loop fecha.

**Gap do Flue que tapamos**: eval/replay (dos 7 limites em `k3vjj4ue4pud`).

## 2. Notas do vault que ancoram

**Centrais (blueprint)**:
- `jugb68g4o8q4` Decision Log 4 Camadas — schema D1, 3 campos canônicos, defesa PII
- `ic379ez19ew2` Classificação de Ground Truth P1/P2/P3 — agente avaliado tem eixo P3
- `ce6mp2xtdpkc` Arqueologia de Julgamento — `expected-reasoning` é gabarito codificado

**Arquitetura agêntica**:
- `wdg0dh9ljzyd` Anatomia de Skill (Open Standard) — skills como pastas, progressive disclosure
- `wdit02rgh0z8` Description Pushy — defesa contra undertriggering
- `0tps2bt60pab` Folder-as-Workspace — R2 com markdown como router
- `vef583g2wdx9` KB Markdown pra LLM — atomicidade, hierarquia rasa, naming queryável
- `s8xg0k5bgy30` Composição Multi-Agente — escolhemos isolated (1 agente por loop)
- `rz7bekzmqm82` Memória 3 Níveis — N1 Session.history, N2 sandbox, N3 R2+FAW

**Princípios aplicados**:
- `8w6an1fp6rqp` Mapear Espaço Cartesiano antes de Atacar — bucketing
- `l58nbk6k65os` Identificar Julgamentos Embutidos antes de Delegar — filtro aplicado pro monitor
- `x2v9dpk8n8dp` Automação Esforço vs Supervisão — separação SQL puro vs LLM
- `qj55bth18tzo` 4 Critérios de Elegibilidade pra Agêntico

**Específicas Flue**:
- `412ehi8jxu5q` Modelo Mental Real
- `zxcr9hupg1p1` 5 Bordas de Estado Órfão — mitigações aplicadas
- `k3vjj4ue4pud` Limites do Flue — POC tapa eval/replay
- `z6eq6wsko79x` Familiaridade vs Compreensão — validamos doc real antes de assumir

## 3. Arquitetura macro

```
┌─────────────────────┐     escreve     ┌──────────────┐
│ Gerador sintético   │ ──────────────► │  D1          │
│ (código puro)       │   decision_log  │  (dedicado)  │
└─────────────────────┘                 └──────┬───────┘
       ▲                                       │ query
       │ POST /agents/qualificador-generator   ▼
       │ (ou cron */15 em produção)    ┌─────────────────────┐
       │                               │  Agente monitor     │
       │                               │  (.flue/agents/     │
       │                               │   monitor.ts)       │
       │      ┌───────────────────────►│  orquestra pipeline │
       │      │     read/write FAW    └──┬─────────┬────────┘
       │      ▼                          │         │
       │  ┌──────────┐                   │ fetch   │ fetch
       │  │ R2       │                   ▼         ▼
       │  │ FAW puro │            ┌──────────┐  ┌──────────┐
       │  └──────────┘            │ GitHub   │  │ Telegram │
       │                          │ (PR)     │  │ (alerta) │
       └──────────────────────────│          │  │          │
        PR aprovado modifica       └──────────┘  └──────────┘
        artefatos do qualificador →
        próxima execução reflete
```

**Runtime vs cron**: agente Flue é endpoint `POST /agents/<name>`. POC valida o pipeline via POST manual (curl). Cron configurado em `wrangler.toml` pra rodar automaticamente, mas a validação inicial e iteração rápida é por chamada direta.

## 4. Estrutura do repo

```
gabarito/
├── .flue/
│   ├── agents/
│   │   ├── monitor.ts                    # orquestrador principal do POC
│   │   └── qualificador.ts               # agente avaliado (estrutura existe, não roda no loop)
│   ├── roles/
│   │   ├── auditor-monitor.md            # postura do monitor (harness level)
│   │   └── qualificador-sdr.md           # postura do qualificador
│   └── skills/
│       ├── monitor/
│       │   ├── detect-divergences/
│       │   │   └── SKILL.md
│       │   ├── classify-origin/
│       │   │   ├── SKILL.md
│       │   │   └── references/
│       │   │       ├── prompt-issue.md
│       │   │       ├── gabarito-stale.md
│       │   │       ├── criterio-faltando.md
│       │   │       └── contexto-mudou.md
│       │   ├── suggest-adjustment/
│       │   │   ├── SKILL.md
│       │   │   └── references/
│       │   │       ├── ajuste-prompt.md
│       │   │       ├── ajuste-gabarito.md
│       │   │       ├── ajuste-criterio.md
│       │   │       └── ajuste-contexto.md
│       │   └── summarize-patterns/
│       │       └── SKILL.md
│       └── qualificador/
│           └── qualificar-lead/
│               └── SKILL.md
├── AGENTS.md                              # system prompt default global (raiz)
├── flue.config.ts
├── wrangler.toml
├── package.json
├── tsconfig.json
├── .dev.vars.example
├── src/
│   └── lib/                              # libs por domínio (1 responsabilidade por arquivo)
│       ├── bucketing.ts
│       ├── criteria.ts
│       ├── faw.ts
│       ├── github.ts
│       ├── telegram.ts
│       ├── pii.ts
│       ├── hmac.ts
│       ├── promotion.ts                  # regra: padrão vira finding
│       ├── resolution.ts                 # regra: finding active→resolved/stale
│       ├── synthetic-generator.ts
│       ├── synthetic-templates.ts
│       └── synthetic-modes.ts
├── agents-config/                         # config versionada de cada agente (modificável por PR)
│   └── qualificador/
│       ├── criterios-icp.md              # alvo 3: criterio-faltando
│       └── contexto-momento.md           # alvo 4: contexto-mudou
├── expected-reasoning/                    # gabarito (alvo 2: gabarito-stale)
│   └── qualificador/
│       └── fit-estrategico.md
├── fixtures/
│   ├── leads.json                         # ~20 leads sintéticos
│   └── scenarios.json                     # sequência de modes pro gerador
├── migrations/
│   └── 0001_init.sql
├── monitor-runs/                          # populado pelos PRs do monitor
│   └── .gitkeep
├── .github/workflows/
│   ├── deploy.yml
│   └── sync-r2.yml                       # espelha expected-reasoning/ pro R2
└── docs/
    ├── README.md                          # entry doc do repo
    ├── ARCHITECTURE.md                    # cada nota do vault embutida onde
    ├── VAULT-NOTES.md                     # lista de IDs com papel
    └── CONTRIBUTING.md                    # como estudar e estender
```

## 5. Stack

- **Runtime**: Cloudflare Workers
- **Framework agêntico**: Flue (TS)
- **Modelos**: Workers AI (binding nativo `env.AI`) — decisão de modelo concreto na implementação após spike (ver §18)
- **AI Gateway**: na frente do Workers AI — cache cross-request + analytics
- **Storage**:
  - **D1 dedicado** ao POC (justificativa em §6.2)
  - **R2 dedicado** ao POC pra FAW
- **Cron**: Cloudflare Cron Triggers (configurado, não bloqueia POC)
- **CI**: GitHub Actions

## 6. Decisões fechadas

### 6.1 Agentes

**Dois agentes Flue existem na estrutura. Um dispara no loop, o outro não.**

#### `monitor` (loop principal do POC)
- Arquivo: `.flue/agents/monitor.ts`
- Role: `auditor-monitor` (harness level)
- Skills: 4 em `.flue/skills/monitor/`
- Triggers: webhook (POST manual no POC; cron em produção)
- Responsabilidade: orquestrar pipeline de auditoria

#### `qualificador` (avaliado, instanciado mas não disparado no POC)
- Arquivo: `.flue/agents/qualificador.ts`
- Role: `qualificador-sdr` (harness level)
- Skills: 1 em `.flue/skills/qualificador/qualificar-lead/`
- Triggers: webhook (não disparado pelo loop; logs vêm do gerador sintético)
- Responsabilidade: qualificar lead aplicando rubrica P1 + julgamento P3

**Por que instanciar o qualificador sem disparar**:
- PRs do monitor modificam artefatos REAIS de um agente que existe
- POC fica didaticamente completo (ecossistema Flue full)
- Em produção, basta apontar cron pro qualificador também — sem redesign

**Por que não disparar no POC**:
- Custo de tokens evitável — gerador sintético produz logs determinísticos com drift controlado
- Iteração mais rápida (reproduzibilidade total)

### 6.2 D1 dedicado — justificativa

Alternativas consideradas:
- **D1 compartilhado com prefixo de tabela** — acopla escopos, dificulta drop posterior
- **DO Storage** — perde queries SQL pro bucketing (precisaria reimplementar listagem)
- **KV** — sem queries, inviável

**Escolha**: D1 dedicado (`gabarito-poc`). Isolar é virtude pra POC. Free tier cobre. Drop trivial depois.

#### Schema (literal de `jugb68g4o8q4` + campos derivados pra bucketing)

```sql
CREATE TABLE decision_log (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  agent_id TEXT NOT NULL,                 -- pseudonimizado HMAC
  thread_id TEXT NOT NULL,                -- pseudonimizado HMAC
  domain TEXT NOT NULL,                   -- 'qualificador'
  phase TEXT,                             -- 'fit-estrategico'
  did TEXT NOT NULL,                      -- outcome do P3
  reasoned TEXT NOT NULL,                 -- 'X porque Y → Z'
  out_of_scope TEXT,                      -- nullable
  tools_called JSON,
  duration_ms INTEGER,
  cost_usd REAL,
  model_main TEXT,                        -- '@cf/...' concreto vem na impl
  expected_reasoning_ref TEXT,            -- 'qualificador/fit-estrategico'
  outcome TEXT,
  outcome_source TEXT,
  -- derivados pra bucketing rápido:
  objective_tier TEXT NOT NULL,           -- 'A' | 'B' | 'C'
  judgment_outcome TEXT NOT NULL,         -- 'priorizar' | 'manter' | 'descartar'
  has_out_of_scope INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_decision_log_window ON decision_log(agent_id, ts);
CREATE INDEX idx_decision_log_bucket ON decision_log(judgment_outcome, objective_tier, has_out_of_scope);

CREATE TABLE audit_run (
  agent_id TEXT NOT NULL,
  last_processed_ts INTEGER NOT NULL,
  PRIMARY KEY (agent_id)
);

CREATE TABLE decision_log_rejected (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  reason TEXT NOT NULL,                   -- 'pii_detected' | 'schema_invalid' | 'pii_concern_flag'
  rejected_by_layer INTEGER NOT NULL      -- 1 | 2 | 3 | 4
);
```

### 6.3 R2 + FAW (memória do monitor)

```
r2://gabarito-monitor/
├── index.md                              # router raiz
├── expected-reasoning/                   # espelhado do repo via CI
│   └── qualificador/
│       └── fit-estrategico.md
├── findings/                             # padrões aprendidos
│   ├── index.md
│   └── qualificador/
│       └── <slug>.md                     # frontmatter padrão (§6.7)
└── decisions/                            # registro por run
    └── <YYYY-MM-DD>/
        └── <run-id>/
            ├── analysis.md
            ├── divergencias.json
            └── proposal.md
```

Acesso via `r2.list({ prefix })` + `r2.get/put`. Sem D1 como index — FAW puro.

### 6.4 Critérios do auditor (4)

| # | Critério | Detecção | Threshold | Severidade |
|---|---|---|---|---|
| 1 | mechanism-divergence | LLM (skill `detect-divergences`) | ≥3 buckets distintos com mesmo heurístico ignorado, OU 1 bucket >20 com confidence high | critical → PR + Telegram |
| 2 | out-of-scope-growth | SQL puro | +20pp absoluto vs janela anterior | warn → PR |
| 3 | regression objetivo↔julgamento | SQL puro | +30% relativo vs baseline | warn → PR |
| 4 | budget-blow | SQL puro | +50% vs baseline em `cost_usd` ou `duration_ms` médio | info → R2 só |

**Parâmetros**: janela = 6h, baseline = média móvel últimas 4 janelas, sample mínimo por bucket = 5.

### 6.5 Bucketing (princípio cartesiano aplicado)

Chave: `(judgment_outcome, objective_tier, has_out_of_scope)`. Cartesiano: 3 × 3 × 2 = 18 teóricos.

**Excluídos automaticamente** (3 buckets tranquilos):
- `(priorizar, A, 0)` — comportamento esperado
- `(manter, B, 0)` — comportamento esperado
- `(descartar, C, 0)` — comportamento esperado

Restam até 15 buckets suspeitos. Tipicamente 3-5 ativos por run.

**K=3 representantes** por bucket (configurável). LLM audita representantes; veredito propaga ao bucket por inferência.

**Trade-off documentado**: inferência pode mascarar variação interna do bucket. Pra POC, aceitável. Pra produção, adicionar SQL re-check pós-detecção.

### 6.6 Pipeline (orquestrado dentro do `agent.ts` do monitor)

```
1. [código] query D1: candidatos suspeitos desde last_processed_ts
2. [código] bucketing.ts: agrupa, escolhe K representantes/bucket
3. [código] criteria.ts: critérios SQL #2, #3, #4 sobre janela inteira
4. [código] resolution.ts: marca findings active→resolved/stale (transições)
5. detect-divergences (LLM, paralelo, 1×por representante)
6. [código] dedup por (heuristic_ignored, bucket_key)
7. classify-origin (LLM, paralelo, 1×por divergência única)
8. suggest-adjustment (LLM, paralelo, 1×por divergência classificada)
9. summarize-patterns (LLM, 1×, recebe agregado com bucket metadata)
10. [código] promotion.ts: aplica regra de promoção (cria finding ou wait)
11. [código] gera analysis.md + proposal.md (templates)
12. [código] commit + PR via fetch GitHub
13. [código] alerta Telegram se critical
14. [código] r2.put em decisions/<date>/<run>/
15. [código] update audit_run.last_processed_ts
```

Custo típico (1000 decisions/janela): ~15-25 chamadas LLM.

### 6.7 Mecânica de transição de status (novo)

Status do finding tem ciclo de vida controlado por `src/lib/resolution.ts`:

```
active     → finding criado pela primeira vez
resolved   → 2 janelas seguidas SEM o padrão reaparecer
stale      → 30 dias active sem mudança de evidência (sugestão ignorada)
```

**Execução**: passo 4 do pipeline (antes da detecção nova). Itera findings `active` no R2, pra cada um:
1. Query SQL conta decisions na janela ATUAL com mesmo `bucket_key` que match o padrão do finding
2. Se zero **e** janela anterior já era zero → atualiza frontmatter `status: resolved`
3. Se `detected_at` > 30 dias e nenhuma mudança no `sample_size` → `status: stale`

**Frontmatter do finding** (com campos de controle):

```yaml
---
agent_id: qualificador
phase: fit-estrategico
type: mechanism-divergence | out-of-scope-growth | regression | budget-blow
detected_at: 2026-05-11
last_seen_at: 2026-05-11
sample_size: 12                          # último tamanho de bucket observado
representatives_audited: 3
windows_silent: 0                        # incrementado quando padrão não aparece em janela
status: active | resolved | stale
related_decisions: [...]
related_prs: [...]                       # URLs dos PRs abertos
---
```

**Findings `resolved` e `stale`**: ficam no R2 pra histórico/aprendizado, mas **não influenciam** thresholds de novas promoções. Skill `detect-divergences` recebe só `active` como `active_findings` no input.

Sem essa mecânica, status vira lixo — você apontou certo.

## 7. Skills

### Estrutura geral (Open Standard)

Cada skill é pasta com `SKILL.md` (frontmatter + body) + `references/` opcional. Description pushy obrigatória.

### 7.1 `monitor/detect-divergences`

```yaml
---
name: detect-divergences
description: Identifica heurísticos do gabarito que foram ignorados ou mal-aplicados em UMA decisão específica do agente avaliado. Use sempre que receber uma decision com `reasoned` em texto livre + um gabarito de heurísticos esperados — mesmo que o `did` pareça correto, sempre inspecione o mecanismo do raciocínio. Skip apenas se a decision não tiver `reasoned` preenchido.
model: main
---
```

**Input**: 1 decision + gabarito completo + active findings prévios.
**Output schema**: lista de divergências com `heuristic_ignored` + `evidence` (citações literais) + `severity`.

### 7.2 `monitor/classify-origin`

```yaml
---
name: classify-origin
description: Classifica a ORIGEM de uma divergência detectada entre 4 alvos possíveis (prompt do agente, gabarito desatualizado, critério faltando na rubrica, contexto de negócio mudou). Use sempre que receber uma divergência detectada com `heuristic_ignored` + `evidence`, antes de qualquer sugestão de ajuste — a classificação determina QUAL arquivo o ajuste vai modificar. Skip se a divergência for marcada como inconclusive na detecção.
model: main
---
```

References (`references/<target>.md`) descrevem cada alvo em detalhe, carregados conforme classificação.

### 7.3 `monitor/suggest-adjustment`

```yaml
---
name: suggest-adjustment
description: Gera texto de mudança proposta para um arquivo target específico baseado em divergência classificada. Use sempre que receber uma divergência com origem já classificada — o output é texto livre da sugestão, NÃO diff (humano edita no PR). Skip se o target for unknown ou inconclusive.
model: main
---
```

References (`references/ajuste-<target>.md`) são templates de como sugerir pra cada tipo de target.

### 7.4 `monitor/summarize-patterns`

```yaml
---
name: summarize-patterns
description: Identifica padrões agregados em um conjunto de divergências de um run, considerando metadados de bucket. Use 1 vez ao final de cada run com TODAS as divergências detectadas. Detecta cross-bucket signal (mesmo heurístico ignorado em buckets estruturalmente distintos = problema sistêmico) e recomenda promoção a finding. Skip se zero divergências.
model: main
---
```

### 7.5 `qualificador/qualificar-lead`

```yaml
---
name: qualificar-lead
description: Qualifica um lead aplicando dois eixos — score objetivo via rubrica ICP (P1, código) e fit estratégico via heurísticos do gabarito (P3, articulação causal). Use sempre que receber um lead com campos estruturados — sempre articula `reasoned` no formato "X porque Y → Z" e preenche `out_of_scope` quando faltar dado pra aplicar heurístico. Skip apenas se o input do lead estiver malformado.
model: main
---
```

**Input**: lead + rubrica + gabarito + contexto-momento.
**Output**: `outcome` + `reasoned` + `out_of_scope` + `objective_tier`.

Não é disparado no loop do POC, mas a skill existe funcional pra ser modificada via PR (alvo 1 do monitor).

## 8. Roles

### `.flue/roles/auditor-monitor.md`

```md
---
name: auditor-monitor
description: Postura de auditor de agentes em domínio de julgamento (P3). Use no nível harness do agente monitor.
---

Você é um auditor de agentes em domínio de julgamento. Princípios não-negociáveis:

- Cético sobre inferências sem evidência literal nos logs
- Output sempre estruturado conforme schema da skill
- Nunca propor merge automático — humano sempre é juiz final
- Citar evidência literal (campo `reasoned`, `out_of_scope`) ao apontar divergência
- Marcar `inconclusive` em vez de adivinhar quando faltar dado
```

### `.flue/roles/qualificador-sdr.md`

```md
---
name: qualificador-sdr
description: Postura de SDR qualificando leads com dois eixos (objetivo e julgamento). Use no nível harness do agente qualificador.
---

Você é um SDR qualificando leads. Princípios:

- Aplique rubrica ICP determinística pra o eixo objetivo
- Articule sempre o eixo de julgamento no formato "X porque Y → Z"
- Quando faltar dado pra aplicar heurístico do gabarito, registre em `out_of_scope`
- Nunca invente dados que não estão no input do lead
- PII: abstrair valores, nomes, contatos — referir como "interlocutor", "valor compatível"
```

## 9. AGENTS.md (raiz)

```md
# gabarito

Monitor autônomo de agentes em domínio de julgamento.

Princípios globais aplicáveis a TODOS os agentes:

- Toda saída de skill segue schema valibot validado no TS — não inventar campos
- Nunca tomar ação irreversível: PRs são propostas, alertas são informativos
- PII: agente nunca produz texto contendo dados pessoais (nomes, telefones, emails, valores monetários específicos). Abstrair sempre
- Reasoning sempre articulado no formato `X porque Y → Z`
```

## 10. Conteúdo seed

### 10.1 `agents-config/qualificador/criterios-icp.md`

```md
# Rubrica ICP — Eixo Objetivo

Aplicação determinística (código puro, sem LLM). Score 0-100. Tier: A >= 75, B 50-74, C < 50.

| # | Critério | Regra | Peso |
|---|---|---|---|
| 1 | Segmento | está em [infoprodutor, agência de marketing, SaaS B2B] | 30 |
| 2 | Faturamento mensal | >= R$ 50k | 25 |
| 3 | Time de vendas | tem time dedicado (não solo) | 20 |
| 4 | Ferramentas atuais | usa CRM ou plataforma de automação | 15 |
| 5 | Sinal de intenção | pediu demo OU preencheu form qualificado | 10 |

Dado ausente = 0 pontos no critério. Acima de 2 ausentes = `confidence: baixa`.
```

### 10.2 `expected-reasoning/qualificador/fit-estrategico.md`

```md
# Gabarito — Fit Estratégico no Momento Atual

Heurísticos no formato "condição → ação, porque mecanismo".

## H1 — Fundador técnico em fase de produto
Se o lead tem fundador técnico/CTO AND contexto-momento indica fase de produto,
→ priorizar mesmo se score objetivo médio,
porque feedback técnico de fundador acelera roadmap mais que receita marginal.

## H2 — Dor específica em hipótese não validada
Se o lead menciona dor X que coincide com hipótese não validada do produto,
→ priorizar independente de tamanho,
porque valor de aprendizado supera custo de oportunidade.

## H3 — Enterprise sem capacidade
Se o lead tem segmento enterprise (faturamento > R$ 1M/mês) AND capacidade atual não suporta,
→ manter mesmo com score alto,
porque vender sem entregar queima reputação.

## H4 — Sinal forte com fit médio
Se o lead pediu demo direta AND score objetivo é B,
→ priorizar,
porque sinal forte de intenção compensa fit médio em janela de aprendizado.

## H5 — Score baixo sem sinal compensatório
Se score objetivo é C AND nenhum dos heurísticos acima se aplica,
→ descartar,
porque custo de oportunidade do time supera valor esperado.
```

### 10.3 `agents-config/qualificador/contexto-momento.md`

```md
# Contexto-Momento — Atualizado 2026-05

## Fase
Produto em validação (não escala) — coletando feedback técnico, ajustando arquitetura.

## Capacidade
Time de 3 pessoas. Suporta até ~20 clientes ativos. Enterprise (>50 usuários/cliente) inviável.

## Foco
- Infoprodutores brasileiros faturando R$ 50k-500k/mês
- Mercado: lançamentos digitais e perpetuos

## Hipóteses não validadas
- H-NV1: automação de qualificação de leads é dor real
- H-NV2: decisores técnicos pagariam premium por explicabilidade
```

### 10.4 `fixtures/leads.json` (~20 leads sintéticos)

```ts
{
  id: string,
  nome_empresa: string,
  segmento: string,
  faturamento_mensal: string,
  time_vendas: 'dedicado' | 'solo' | null,
  ferramentas: 'crm' | 'planilha' | null,
  sinal: 'demo' | 'form' | 'material' | null,
  contexto_livre: string  // gerador usa pra inferir fundador técnico, dor mencionada
}
```

Distribuição: 6 claros A, 6 claros C, 8 ambíguos cobrindo (1-2 cada) os heurísticos H1-H5.

### 10.5 `fixtures/scenarios.json`

```json
[
  { "from_hour": 0, "to_hour": 6, "mode": "baseline" },
  { "from_hour": 6, "to_hour": 12, "mode": "drift-h1" },
  { "from_hour": 12, "to_hour": 18, "mode": "drift-multi" },
  { "from_hour": 18, "to_hour": 24, "mode": "high-budget" }
]
```

## 11. Gerador sintético

Código puro (`src/lib/synthetic-*.ts`), sem LLM. Modes:

- `baseline` — agente bem-comportado, raros `out_of_scope`
- `drift-h1` — ignora H1 silenciosamente em ~40% dos elegíveis
- `drift-multi` — ignora H1 + H2
- `high-budget` — eleva `cost_usd` e `duration_ms` progressivamente

Insert direto em D1 via SQL. Schema validation (camada 3 da defesa PII) executa em todo insert pra validar o pipeline.

## 12. Defesa PII (4 camadas, todas implementadas)

POC educacional — implementadas mesmo com leads sintéticos:

1. **HMAC determinístico** em `agent_id` e `thread_id` (`src/lib/hmac.ts`)
2. **Skill rigorosa** — role + AGENTS.md instruem abstrair
3. **Schema validation** — valibot regex pra padrões PII. Rejeita → `decision_log_rejected`
4. **Sanitizer determinístico** — regex final mascara residual: `[TELEFONE]`, `[EMAIL]`, `[VALOR]`

Pipeline: `produtor → camada 3 → camada 4 → INSERT`.

## 13. Saídas do monitor

### 13.1 PR no GitHub

- Branch: `monitor/<run-id>`
- Title: `monitor: <severity> em qualificador/fit-estrategico (run <id>)`
- Body (template em código): resumo do run + padrões + sugestões agrupadas por target + link pra `monitor-runs/<run-id>/`
- Commit incluso: `monitor-runs/<run-id>/{analysis.md,proposal.md,divergencias.json}`
- Auto-merge: nunca

### 13.2 Telegram

Só severidade `critical`. Anti-ruído: max 1/agente/janela.

```
🚨 Monitor gabarito: qualificador/fit-estrategico
Run <id-curto>
Severidade: critical
Padrões: <count>
PR: <url>
```

### 13.3 R2 (acumulador histórico)

`decisions/<YYYY-MM-DD>/<run-id>/` sempre populado, independente de severidade.

## 14. Tratamento de erros

| Cenário | Ação |
|---|---|
| Skill falha (timeout/error) | Retry 1× com backoff. Falhar 2× = registra `decision_log_rejected` com layer=skill, continua run |
| D1 indisponível | Aborta run, log em CF Logs, próximo cron tenta |
| R2 indisponível (read gabarito) | Aborta, log, próximo cron |
| GitHub API falha | Salva proposta em `r2://pending-prs/`, próximo run tenta abrir |
| Telegram falha | Log e segue. PR já cobriu |

## 15. Verificação

### 15.1 Smoke
`npm run smoke` — 1 ciclo local com fixtures, mock GitHub/Telegram.

### 15.2 Replay
`npm run replay <run-id>` — reprocessa logs do run, confirma resultado idêntico (determinismo bucketing + cache do AI Gateway).

### 15.3 Sem testes unitários estritos
Escopo POC. Lib boundaries (`bucketing.ts`, `criteria.ts`, `pii.ts`) ganham smoke próprios. Skills LLM cobertas via replay.

## 16. Configuração — `wrangler.toml`

```toml
name = "gabarito"
main = ".flue/dist/index.mjs"
compatibility_date = "2026-05-11"

[ai]
binding = "AI"

[[d1_databases]]
binding = "DB"
database_name = "gabarito-poc"
database_id = "<a-criar-via-wrangler>"

[[r2_buckets]]
binding = "MONITOR_R2"
bucket_name = "gabarito-monitor"

[triggers]
crons = [
  "*/15 * * * *",   # gerador sintético
  "0 */6 * * *",    # monitor (4x/dia)
]

[vars]
JANELA_HORAS = "6"
BUCKET_K_REPRESENTATIVES = "3"
SAMPLE_MIN_PER_BUCKET = "5"
WINDOWS_SILENT_TO_RESOLVE = "2"
DAYS_ACTIVE_TO_STALE = "30"
GITHUB_DEFAULT_BRANCH = "main"
```

## 17. `.dev.vars.example`

```
# AI Gateway
CF_ACCOUNT_ID=
CF_AI_GATEWAY_ID=

# Pseudonimização
HMAC_SECRET=

# GitHub
GITHUB_PAT=                              # repo:write
GITHUB_REPO=<owner>/gabarito

# Telegram
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

## 18. Spike #1 — decisão da implementação (bloqueador potencial)

Antes de qualquer outra coisa, spike de ~30min pra validar:

1. **Flue ↔ Workers AI** — `init({ model: '@cf/...' })` funciona via SDK Flue?
   - Cenário A: aceita direto (alta probabilidade — Flue usa SDK CF)
   - Cenário B: precisa adapter custom (~50 linhas) chamando `env.AI.run()`
   - Cenário C: via `baseURL` apontando pro AI Gateway endpoint OpenAI-compat (`workers-ai/v1/chat/completions`)
2. **Cron via Flue** — `triggers = { cron: '...' }` no agente `.ts` OU só via `wrangler.toml [triggers]`?
3. **Modelo concreto** — após spike confirmar mecanismo, escolher `@cf/...` específico (provável `@cf/meta/llama-3.3-70b-instruct-fp8-fast` como default, mas decidir após teste real)

**Decisão registrada**: NÃO escolher modelo concreto antes do spike validar mecanismo.

## 19. Princípios de qualidade do código

POC é material de estudo — código precisa carregar boas práticas além da ideia do Flue.

### Atomicidade
- 1 função = 1 responsabilidade. Nome com "and" sinaliza quebrar
- Função > 40 linhas exige justificativa
- Arquivo > 300 linhas exige justificativa

### Estrutura
- Libs em `src/lib/<dominio>.ts`, 1 export principal por arquivo
- Nominar por domínio: `bucketing.ts`, `criteria.ts` — nunca `utils.ts` ou `helpers.ts`
- Sem barrels profundos (`index.ts` reexportando `index.ts`)

### Naming
- kebab-case pra arquivos (`bucketing.ts`, `synthetic-generator.ts`)
- camelCase pra funções/variáveis (`fetchDecisions`, `bucketKey`)
- PascalCase pra tipos/componentes (`DecisionLog`, `BucketKey`)
- SCREAMING_SNAKE_CASE pra constantes module-level (`MAX_RETRIES`)
- Booleans com prefixo `is/has/should/can` (`isResolved`, `hasOutOfScope`)
- Handlers com prefixo `on/handle` (`onSkillError`, `handleCronTrigger`)

### Tipagem
- `strict: true` no `tsconfig.json`
- Evitar `any` — usar `unknown` na borda + narrowing com valibot
- Generics onde a função opera sobre tipo arbitrário

### Comentários
- Default zero
- Comentar só o PORQUÊ não-óbvio (constraint escondido, workaround específico, decisão surpreendente)
- NUNCA comentar o QUE — código bem nomeado dispensa
- JSDoc `/** @description ... */` em toda função exportada — verificável via script no CI

### Segurança
- Wrapper de erro sanitizado em toda response — sem leak de stack/path interno
- Validação valibot na borda (skill input, HTTP request)
- Truncar body de erro upstream antes de logar (max ~500 chars)
- Nunca logar API key, JWT, body inteiro com PII

### Imports
- Path alias `@/` pra cross-module (configurar `tsconfig.paths`)
- Ordenar builtins → externos → aliases → relativos (ESLint `import/order`)
- Sem import circular

### Documentação
- `docs/README.md` é entry point pra quem clona
- `docs/ARCHITECTURE.md` explica como cada nota do vault tá embutida no código
- `docs/VAULT-NOTES.md` lista IDs com papel concreto no POC
- `docs/CONTRIBUTING.md` orienta como estudar e estender

### Conexão com rules globais
Aderir às rules `code-quality.md`, `git.md`, `security.md` do `~/.claude/rules/`. POC respeita o mesmo padrão de qualquer projeto serio.

## 20. Conexão com o cluster do vault (sessão 08/05/2026)

POC valida ou exercita 14 notas da Metodologia de Agentes LLM:

| Nota | Papel no POC |
|---|---|
| `wo376zfdqhr0` Arquitetura de Estado 3 Camadas | Implícito (POC simples — 1 macro/modo/fase) |
| `rz7bekzmqm82` Memória 3 Níveis | N1 Session.history, N2 sandbox, N3 R2+FAW |
| `f11ogz64i2q3` Roteamento Implícito | Não usado (POC sem fases conversacionais) |
| `37g4pvtcm7r2` Capability Registry | Não usado (1 fase, sem tools dinâmicas) |
| `jugb68g4o8q4` Decision Log 4 Camadas | **Aplicado literal** — schema, defesa PII, cron auditor, PR humano |
| `0tps2bt60pab` Folder-as-Workspace | R2 monitor + repo de artefatos |
| `vef583g2wdx9` KB Markdown pra LLM | Convenção R2 (atomicidade, hierarquia rasa) |
| `wdg0dh9ljzyd` Anatomia de Skill | Skills como pastas, frontmatter, references |
| `wdit02rgh0z8` Description Pushy | Aplicado em todas as 5 skills |
| `s8xg0k5bgy30` Composição Multi-Agente | Modo isolated (1 agente disparado por loop) |
| `412ehi8jxu5q` Modelo Mental Real | Documentado em `docs/ARCHITECTURE.md` |
| `zxcr9hupg1p1` 5 Bordas de Estado Órfão | Mitigações em try/finally e abort race |
| `z6eq6wsko79x` Familiaridade vs Compreensão | Validamos doc real do Flue antes de assumir |
| `k3vjj4ue4pud` Limites do Flue | POC tapa eval/replay |
| `8w6an1fp6rqp` Espaço Cartesiano antes de Atacar | Bucketing aplicado direto |

## 21. Limitações conhecidas

- Representante propaga veredito ao bucket por inferência, não verificação
- Buckets tranquilos não auditados — mascara divergência sutil em comportamento esperado
- Sem testes unitários estritos
- Defesa PII aplica a leads sintéticos sem PII real — demo do pipeline, não validação de eficácia
- K=3 representantes — pode perder padrões em buckets com sub-variação interna >3
- Compatibilidade Flue ↔ Workers AI a confirmar no spike #1
- Mecânica de transição de status depende de presença/ausência operacional no D1 — não detecta merge de PR (não usamos GitHub webhook pra POC)
