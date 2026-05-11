# gabarito POC — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir POC `gabarito` — monitor autônomo Flue que avalia agentes em domínio de julgamento, detecta divergência de mecanismo via skills LLM atômicas + bucketing cartesiano, e propõe ajustes via PR pra GitHub com alerta crítico no Telegram.

**Architecture:** Cloudflare Workers + Flue. Dois agentes Flue (`monitor` orquestrador disparado por POST/cron + `qualificador` instanciado mas não disparado no loop). Logs sintéticos gerados via código puro alimentam D1 dedicado; bucketing por chave estrutural reduz custo LLM em ~28×; pipeline orquestrado dentro do `agents/monitor.ts` chama 4 skills atômicas; saída commita em branch + PR + alerta condicional.

**Tech Stack:** TypeScript strict, Flue (`@flue/sdk`), Cloudflare Workers (D1, R2, Workers AI binding, AI Gateway), Wrangler 4, Vitest pra unit tests, Valibot pra schemas, Workers AI (modelo concreto após Spike #1).

**Spec source:** `docs/superpowers/specs/2026-05-11-gabarito-poc-design.md` (na raiz do monorepo)

---

## Convenção de paths (monorepo `poc-flue`)

Este POC vive dentro de `pocs/gabarito/` no monorepo `poc-flue`. Convenções:

- **Working directory de implementação**: `pocs/gabarito/` (todos os comandos `npm`, `wrangler`, `flue` rodam aqui, exceto onde explicitado)
- **Paths relativos no plano** (ex: `.flue/agents/monitor.ts`, `src/lib/bucketing.ts`) → resolvem **dentro de `pocs/gabarito/`**
- **Exceções que ficam na raiz do monorepo**:
  - `docs/superpowers/specs/` e `docs/superpowers/plans/` (cross-POC)
  - `.github/workflows/` (GitHub Actions só lê de `.github/` na raiz do repo) — workflows precisam `cd pocs/gabarito` antes de rodar build/deploy
  - `.gitignore` raiz já existe; cada POC pode ter o seu adicional dentro de `pocs/<nome>/.gitignore` se necessário
- **Branch de implementação**: `feat/gabarito-poc` (do repo `poc-flue` inteiro)
- **Comandos `gh` / `git`**: rodam da raiz do monorepo

Quando o plano disser `Create: src/lib/bucketing.ts`, leia como `Create: pocs/gabarito/src/lib/bucketing.ts`.

---

## Phase 0 — Spike & Setup

### Task 0.1: Spike — validar Flue ↔ Workers AI

**Files** (relativos à raiz do monorepo):
- Create: `pocs/gabarito/spike/flue-workers-ai.ts`
- Create: `pocs/gabarito/spike/README.md`

- [ ] **Step 1: Criar branch dedicada pro spike**

```bash
# raiz do monorepo
cd ~/Desktop/dev/poc-flue
git checkout -b spike/flue-workers-ai
```

- [ ] **Step 2: Init projeto mínimo no spike (dentro de pocs/gabarito/)**

```bash
cd pocs/gabarito
mkdir -p spike
cd spike
npm init -y
npm install --save-dev wrangler@latest typescript@latest @cloudflare/workers-types
npm install @flue/sdk valibot
```

- [ ] **Step 3: Escrever `spike/flue-workers-ai.ts`**

```ts
import type { FlueContext } from '@flue/sdk/client';
import * as v from 'valibot';

export const triggers = { webhook: true };

export default async function (ctx: FlueContext) {
  // Cenário A: model como string Workers AI
  const harness = await ctx.init({
    model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  });
  const session = await harness.session();
  const { data } = await session.prompt(
    'Diga "ok" e nada mais.',
    { schema: v.object({ result: v.string() }) },
  );
  return { cenario: 'A', data };
}
```

- [ ] **Step 4: Rodar local e observar resultado**

```bash
npx flue dev --target cloudflare
# em outro terminal:
curl -X POST http://localhost:3583/agents/flue-workers-ai/test
```

Expected: ou retorna `{cenario: 'A', data: {result: 'ok'}}` (Cenário A funciona) ou erro de provider desconhecido.

- [ ] **Step 5: Se Cenário A falhar, testar Cenário C (AI Gateway via baseURL)**

```ts
const harness = await ctx.init({
  model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  baseURL: `https://gateway.ai.cloudflare.com/v1/${ctx.env.CF_ACCOUNT_ID}/${ctx.env.CF_AI_GATEWAY_ID}/workers-ai`,
});
```

Expected: ou funciona ou identifica que precisa adapter.

- [ ] **Step 6: Documentar resultado em `spike/README.md`**

```md
# Spike: Flue ↔ Workers AI

**Resultado**: [Cenário A | Cenário C | Cenário B (precisa adapter)]

**Configuração que funcionou**:
[colar config exata]

**Modelo escolhido**: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (ou ajustar)

**Próximos passos**: [se precisa adapter, descrever interface esperada]
```

- [ ] **Step 7: Commit do spike**

```bash
git add spike/
git commit -m "spike: validar integração Flue + Workers AI"
```

---

### Task 0.2: Init do projeto principal

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `wrangler.toml`
- Create: `flue.config.ts`
- Create: `.gitignore`
- Create: `.dev.vars.example`

- [ ] **Step 1: Voltar pra main e criar branch de implementação**

```bash
# raiz do monorepo
cd ~/Desktop/dev/poc-flue
git checkout main
git checkout -b feat/gabarito-poc
cd pocs/gabarito
```

- [ ] **Step 2: Init npm dentro de pocs/gabarito/**

```bash
# cwd: ~/Desktop/dev/poc-flue/pocs/gabarito
npm init -y
```

- [ ] **Step 3: Instalar deps**

```bash
npm install @flue/sdk valibot
npm install --save-dev typescript wrangler @cloudflare/workers-types vitest @types/node
```

- [ ] **Step 4: Escrever `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "types": ["@cloudflare/workers-types"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*", ".flue/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 5: Escrever `wrangler.toml`**

```toml
name = "gabarito"
main = ".flue/dist/index.mjs"
compatibility_date = "2026-05-11"

[ai]
binding = "AI"

[[d1_databases]]
binding = "DB"
database_name = "gabarito-poc"
database_id = "<a-criar-via-wrangler-d1-create>"

[[r2_buckets]]
binding = "MONITOR_R2"
bucket_name = "gabarito-monitor"

[triggers]
crons = [
  "*/15 * * * *",
  "0 */6 * * *",
]

[vars]
JANELA_HORAS = "6"
BUCKET_K_REPRESENTATIVES = "3"
SAMPLE_MIN_PER_BUCKET = "5"
WINDOWS_SILENT_TO_RESOLVE = "2"
DAYS_ACTIVE_TO_STALE = "30"
GITHUB_DEFAULT_BRANCH = "main"
```

- [ ] **Step 6: Escrever `flue.config.ts`**

```ts
import { defineConfig } from '@flue/sdk/config';

export default defineConfig({
  target: 'cloudflare',
});
```

- [ ] **Step 7: Escrever `.gitignore`**

```
node_modules/
dist/
.flue/dist/
.dev.vars
.wrangler/
*.log
.DS_Store
```

- [ ] **Step 8: Escrever `.dev.vars.example`**

```
CF_ACCOUNT_ID=
CF_AI_GATEWAY_ID=
HMAC_SECRET=

GITHUB_PAT=
GITHUB_REPO=<owner>/gabarito

TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=
```

- [ ] **Step 9: Criar D1 e R2**

```bash
npx wrangler d1 create gabarito-poc
# copiar database_id retornado pra wrangler.toml
npx wrangler r2 bucket create gabarito-monitor
```

- [ ] **Step 10: Adicionar scripts ao `package.json`**

```json
{
  "scripts": {
    "dev": "flue dev --target cloudflare",
    "build": "flue build --target cloudflare",
    "deploy": "wrangler deploy",
    "test": "vitest run",
    "test:watch": "vitest",
    "smoke": "tsx scripts/smoke.ts",
    "replay": "tsx scripts/replay.ts",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json wrangler.toml flue.config.ts .gitignore .dev.vars.example
git commit -m "chore: bootstrap gabarito POC project"
```

---

### Task 0.3: Estrutura de diretórios + AGENTS.md

**Files:**
- Create: `AGENTS.md`
- Create: `.flue/agents/.gitkeep`
- Create: `.flue/skills/monitor/.gitkeep`
- Create: `.flue/skills/qualificador/.gitkeep`
- Create: `.flue/roles/.gitkeep`
- Create: `src/lib/.gitkeep`
- Create: `agents-config/qualificador/.gitkeep`
- Create: `expected-reasoning/qualificador/.gitkeep`
- Create: `fixtures/.gitkeep`
- Create: `migrations/.gitkeep`
- Create: `monitor-runs/.gitkeep`
- Create: `docs/.gitkeep`

- [ ] **Step 1: Criar estrutura de pastas**

```bash
mkdir -p .flue/agents .flue/skills/monitor .flue/skills/qualificador .flue/roles \
         src/lib agents-config/qualificador expected-reasoning/qualificador \
         fixtures migrations monitor-runs docs scripts
touch .flue/agents/.gitkeep .flue/skills/monitor/.gitkeep .flue/skills/qualificador/.gitkeep \
      .flue/roles/.gitkeep src/lib/.gitkeep agents-config/qualificador/.gitkeep \
      expected-reasoning/qualificador/.gitkeep fixtures/.gitkeep migrations/.gitkeep \
      monitor-runs/.gitkeep docs/.gitkeep
```

- [ ] **Step 2: Escrever `AGENTS.md` (raiz)**

```md
# gabarito

Monitor autônomo de agentes em domínio de julgamento.

Princípios globais aplicáveis a TODOS os agentes:

- Toda saída de skill segue schema valibot validado no TS — não inventar campos
- Nunca tomar ação irreversível: PRs são propostas, alertas são informativos
- PII: agente nunca produz texto contendo dados pessoais (nomes, telefones, emails, valores monetários específicos). Abstrair sempre
- Reasoning sempre articulado no formato `X porque Y → Z`
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "chore: estrutura de diretórios + AGENTS.md raiz"
```

---

## Phase 1 — Database Schema

### Task 1.1: Migration inicial

**Files:**
- Create: `migrations/0001_init.sql`

- [ ] **Step 1: Escrever `migrations/0001_init.sql`**

```sql
CREATE TABLE decision_log (
  id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL,
  agent_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  domain TEXT NOT NULL,
  phase TEXT,
  did TEXT NOT NULL,
  reasoned TEXT NOT NULL,
  out_of_scope TEXT,
  tools_called TEXT,
  duration_ms INTEGER,
  cost_usd REAL,
  model_main TEXT,
  expected_reasoning_ref TEXT,
  outcome TEXT,
  outcome_source TEXT,
  objective_tier TEXT NOT NULL,
  judgment_outcome TEXT NOT NULL,
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
  reason TEXT NOT NULL,
  rejected_by_layer INTEGER NOT NULL
);
```

- [ ] **Step 2: Aplicar migration local**

```bash
npx wrangler d1 execute gabarito-poc --local --file=migrations/0001_init.sql
```

Expected: `Successfully applied`

- [ ] **Step 3: Aplicar migration remoto**

```bash
npx wrangler d1 execute gabarito-poc --remote --file=migrations/0001_init.sql
```

- [ ] **Step 4: Verificar schema**

```bash
npx wrangler d1 execute gabarito-poc --local --command="SELECT name FROM sqlite_master WHERE type='table';"
```

Expected: `decision_log`, `audit_run`, `decision_log_rejected`

- [ ] **Step 5: Commit**

```bash
git add migrations/0001_init.sql
git commit -m "feat(db): migration inicial — decision_log + audit_run + rejected"
```

---

## Phase 2 — Schemas (Valibot)

### Task 2.1: Schema decision-log

**Files:**
- Create: `src/schemas/decision-log.ts`
- Test: `src/schemas/decision-log.test.ts`

- [ ] **Step 1: Escrever teste falhando**

```ts
// src/schemas/decision-log.test.ts
import { describe, it, expect } from 'vitest';
import { DecisionLogInsertSchema, JudgmentOutcomeSchema, ObjectiveTierSchema } from './decision-log';
import * as v from 'valibot';

describe('DecisionLogInsertSchema', () => {
  it('aceita decision válida', () => {
    const valid = {
      id: 'd-1',
      ts: 1700000000000,
      agent_id: 'hash-x',
      thread_id: 'hash-y',
      domain: 'qualificador',
      phase: 'fit-estrategico',
      did: 'priorizar',
      reasoned: 'X porque Y → Z',
      out_of_scope: null,
      duration_ms: 500,
      cost_usd: 0.0001,
      model_main: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
      expected_reasoning_ref: 'qualificador/fit-estrategico',
      objective_tier: 'A',
      judgment_outcome: 'priorizar',
      has_out_of_scope: 0,
    };
    expect(() => v.parse(DecisionLogInsertSchema, valid)).not.toThrow();
  });

  it('rejeita judgment_outcome inválido', () => {
    expect(() => v.parse(JudgmentOutcomeSchema, 'qualquer')).toThrow();
  });

  it('aceita os 3 tiers válidos', () => {
    expect(v.parse(ObjectiveTierSchema, 'A')).toBe('A');
    expect(v.parse(ObjectiveTierSchema, 'B')).toBe('B');
    expect(v.parse(ObjectiveTierSchema, 'C')).toBe('C');
  });
});
```

- [ ] **Step 2: Rodar teste pra ver falhar**

```bash
npm test -- src/schemas/decision-log.test.ts
```

Expected: FAIL com "Cannot find module './decision-log'"

- [ ] **Step 3: Implementar schema**

```ts
// src/schemas/decision-log.ts
import * as v from 'valibot';

/** @description Tier objetivo derivado da rubrica ICP determinística. */
export const ObjectiveTierSchema = v.picklist(['A', 'B', 'C']);
export type ObjectiveTier = v.InferOutput<typeof ObjectiveTierSchema>;

/** @description Outcome do eixo de julgamento P3. */
export const JudgmentOutcomeSchema = v.picklist(['priorizar', 'manter', 'descartar']);
export type JudgmentOutcome = v.InferOutput<typeof JudgmentOutcomeSchema>;

/** @description Schema de insert em decision_log — campos pseudonimizados, sem PII. */
export const DecisionLogInsertSchema = v.object({
  id: v.string(),
  ts: v.number(),
  agent_id: v.string(),
  thread_id: v.string(),
  domain: v.string(),
  phase: v.nullable(v.string()),
  did: v.string(),
  reasoned: v.string(),
  out_of_scope: v.nullable(v.string()),
  tools_called: v.optional(v.string()),
  duration_ms: v.number(),
  cost_usd: v.number(),
  model_main: v.string(),
  expected_reasoning_ref: v.nullable(v.string()),
  outcome: v.optional(v.nullable(v.string())),
  outcome_source: v.optional(v.nullable(v.string())),
  objective_tier: ObjectiveTierSchema,
  judgment_outcome: JudgmentOutcomeSchema,
  has_out_of_scope: v.picklist([0, 1]),
});
export type DecisionLogInsert = v.InferOutput<typeof DecisionLogInsertSchema>;
```

- [ ] **Step 4: Rodar testes — devem passar**

```bash
npm test -- src/schemas/decision-log.test.ts
```

Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/schemas/decision-log.ts src/schemas/decision-log.test.ts
git commit -m "feat(schemas): valibot schema pra decision_log"
```

---

### Task 2.2: Schema PII

**Files:**
- Create: `src/schemas/pii.ts`
- Test: `src/schemas/pii.test.ts`

- [ ] **Step 1: Escrever teste falhando**

```ts
// src/schemas/pii.test.ts
import { describe, it, expect } from 'vitest';
import { containsPII } from './pii';

describe('containsPII', () => {
  it('detecta telefone BR', () => {
    expect(containsPII('contato (11) 91234-5678')).toBe(true);
  });
  it('detecta email', () => {
    expect(containsPII('mande pra fulano@empresa.com')).toBe(true);
  });
  it('detecta CPF formatado', () => {
    expect(containsPII('cpf 123.456.789-00')).toBe(true);
  });
  it('detecta valor R$ específico', () => {
    expect(containsPII('valor de R$ 12.345,67')).toBe(true);
  });
  it('aceita texto abstrato sem PII', () => {
    expect(containsPII('valor médio compatível com o tier')).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar — falha**

```bash
npm test -- src/schemas/pii.test.ts
```

- [ ] **Step 3: Implementar**

```ts
// src/schemas/pii.ts

/** @description Regex de telefones brasileiros (com ou sem máscara). */
const PHONE_BR = /\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/;
/** @description Regex de emails. */
const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
/** @description Regex de CPF formatado. */
const CPF = /\d{3}\.\d{3}\.\d{3}-\d{2}/;
/** @description Regex de CNPJ formatado. */
const CNPJ = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;
/** @description Regex de valor monetário específico em R$. */
const VALOR_BRL = /R\$\s?\d{1,3}(\.\d{3})*,\d{2}/;

const PII_PATTERNS = [PHONE_BR, EMAIL, CPF, CNPJ, VALOR_BRL];

/** @description Detecta padrões de PII brasileira em texto livre. */
export function containsPII(text: string): boolean {
  return PII_PATTERNS.some((re) => re.test(text));
}

/** @description Substitui padrões de PII por placeholders genéricos. */
export function sanitizePII(text: string): string {
  return text
    .replace(PHONE_BR, '[TELEFONE]')
    .replace(EMAIL, '[EMAIL]')
    .replace(CPF, '[CPF]')
    .replace(CNPJ, '[CNPJ]')
    .replace(VALOR_BRL, '[VALOR]');
}
```

- [ ] **Step 4: Rodar — passa**

```bash
npm test -- src/schemas/pii.test.ts
```

Expected: PASS, 5 tests

- [ ] **Step 5: Adicionar teste de sanitizePII**

```ts
// adicionar ao describe
it('sanitiza email', () => {
  expect(sanitizePII('mande pra fulano@empresa.com')).toBe('mande pra [EMAIL]');
});
```

Importar `sanitizePII` no top do test.

- [ ] **Step 6: Rodar — passa**

```bash
npm test -- src/schemas/pii.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add src/schemas/pii.ts src/schemas/pii.test.ts
git commit -m "feat(schemas): detector e sanitizador de PII brasileira"
```

---

### Task 2.3: Schema das skills

**Files:**
- Create: `src/schemas/skills.ts`

- [ ] **Step 1: Escrever schemas literais do spec §7**

```ts
// src/schemas/skills.ts
import * as v from 'valibot';
import { JudgmentOutcomeSchema, ObjectiveTierSchema } from './decision-log';

/** @description Schema de output da skill detect-divergences. */
export const DetectDivergencesOutputSchema = v.object({
  divergences: v.array(v.object({
    heuristic_ignored: v.string(),
    evidence: v.string(),
    severity: v.picklist(['low', 'med', 'high']),
  })),
});
export type DetectDivergencesOutput = v.InferOutput<typeof DetectDivergencesOutputSchema>;

/** @description 4 alvos modificáveis pelos PRs do monitor. */
export const TargetSchema = v.picklist([
  'prompt-issue',
  'gabarito-stale',
  'criterio-faltando',
  'contexto-mudou',
]);
export type Target = v.InferOutput<typeof TargetSchema>;

/** @description Schema de output da skill classify-origin. */
export const ClassifyOriginOutputSchema = v.object({
  target: v.union([TargetSchema, v.literal('inconclusive')]),
  rationale: v.string(),
});
export type ClassifyOriginOutput = v.InferOutput<typeof ClassifyOriginOutputSchema>;

/** @description Schema de output da skill suggest-adjustment. */
export const SuggestAdjustmentOutputSchema = v.object({
  target_file: v.string(),
  proposed_change: v.string(),
  rationale: v.string(),
});
export type SuggestAdjustmentOutput = v.InferOutput<typeof SuggestAdjustmentOutputSchema>;

/** @description Schema de output da skill summarize-patterns. */
export const SummarizePatternsOutputSchema = v.object({
  patterns: v.array(v.object({
    type: v.picklist(['mechanism-divergence', 'gabarito-stale', 'criterio-faltando', 'contexto-mudou']),
    description: v.string(),
    affected_buckets: v.array(v.string()),
    inferred_decisions: v.number(),
    confidence: v.picklist(['high', 'med', 'low']),
    promotion_recommendation: v.picklist(['finding', 'wait', 'discard']),
  })),
  cross_bucket_signal: v.nullable(v.string()),
});
export type SummarizePatternsOutput = v.InferOutput<typeof SummarizePatternsOutputSchema>;

/** @description Schema de output da skill qualificar-lead (qualificador hipotético). */
export const QualificarLeadOutputSchema = v.object({
  outcome: JudgmentOutcomeSchema,
  reasoned: v.string(),
  out_of_scope: v.nullable(v.string()),
  objective_tier: ObjectiveTierSchema,
});
export type QualificarLeadOutput = v.InferOutput<typeof QualificarLeadOutputSchema>;
```

- [ ] **Step 2: Verificar typecheck**

```bash
npm run typecheck
```

Expected: sem erros

- [ ] **Step 3: Commit**

```bash
git add src/schemas/skills.ts
git commit -m "feat(schemas): schemas valibot das 5 skills"
```

---

## Phase 3 — Libs Utilitárias (TDD)

### Task 3.1: HMAC (pseudonimização)

**Files:**
- Create: `src/lib/hmac.ts`
- Test: `src/lib/hmac.test.ts`

- [ ] **Step 1: Escrever teste falhando**

```ts
// src/lib/hmac.test.ts
import { describe, it, expect } from 'vitest';
import { pseudonymize } from './hmac';

describe('pseudonymize', () => {
  it('retorna hash hex de 16 chars', async () => {
    const hash = await pseudonymize('user-123', 'test-secret');
    expect(hash).toMatch(/^[a-f0-9]{16}$/);
  });
  it('é determinístico', async () => {
    const a = await pseudonymize('user-x', 'secret');
    const b = await pseudonymize('user-x', 'secret');
    expect(a).toBe(b);
  });
  it('produz hashes distintos pra inputs distintos', async () => {
    const a = await pseudonymize('user-x', 'secret');
    const b = await pseudonymize('user-y', 'secret');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Rodar — falha**

```bash
npm test -- src/lib/hmac.test.ts
```

- [ ] **Step 3: Implementar**

```ts
// src/lib/hmac.ts

/** @description HMAC-SHA256 truncado em 16 chars hex pra pseudonimização determinística. */
export async function pseudonymize(input: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(input));
  const bytes = new Uint8Array(sig);
  return Array.from(bytes)
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
```

- [ ] **Step 4: Rodar — passa**

```bash
npm test -- src/lib/hmac.test.ts
```

Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/hmac.ts src/lib/hmac.test.ts
git commit -m "feat(lib): pseudonimização HMAC-SHA256 truncada"
```

---

### Task 3.2: PII (4 camadas — wrapper de defesa)

**Files:**
- Create: `src/lib/pii.ts`
- Test: `src/lib/pii.test.ts`

- [ ] **Step 1: Escrever teste falhando**

```ts
// src/lib/pii.test.ts
import { describe, it, expect } from 'vitest';
import { defendPII } from './pii';

describe('defendPII', () => {
  it('aceita texto limpo', () => {
    const result = defendPII({ reasoned: 'lead segmento compatível' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.sanitized.reasoned).toBe('lead segmento compatível');
  });
  it('rejeita texto com email (camada 3)', () => {
    const result = defendPII({ reasoned: 'mande email pra fulano@empresa.com' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.layer).toBe(3);
  });
  it('sanitiza residual (camada 4) quando ok', () => {
    // texto que passou na camada 3 mas tem padrão residual sutil — aqui simulamos passando direto
    const result = defendPII({ reasoned: 'texto sem PII detectada' });
    expect(result.ok).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar — falha**

```bash
npm test -- src/lib/pii.test.ts
```

- [ ] **Step 3: Implementar**

```ts
// src/lib/pii.ts
import { containsPII, sanitizePII } from '@/schemas/pii';

export type PIIDefenseResult<T> =
  | { ok: true; sanitized: T }
  | { ok: false; layer: 3 | 4; reason: string };

/** @description Aplica camadas 3 (validation) e 4 (sanitizer) em um objeto com campos texto. */
export function defendPII<T extends Record<string, unknown>>(input: T): PIIDefenseResult<T> {
  const fields: (keyof T)[] = Object.keys(input) as (keyof T)[];
  for (const field of fields) {
    const value = input[field];
    if (typeof value !== 'string') continue;
    if (containsPII(value)) {
      return { ok: false, layer: 3, reason: `pii_detected_in_${String(field)}` };
    }
  }
  const sanitized = { ...input };
  for (const field of fields) {
    const value = sanitized[field];
    if (typeof value === 'string') {
      (sanitized as Record<keyof T, unknown>)[field] = sanitizePII(value);
    }
  }
  return { ok: true, sanitized };
}
```

- [ ] **Step 4: Rodar — passa**

```bash
npm test -- src/lib/pii.test.ts
```

Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/pii.ts src/lib/pii.test.ts
git commit -m "feat(lib): defesa PII em camadas 3 e 4 (validation + sanitizer)"
```

---

### Task 3.3: Bucketing

**Files:**
- Create: `src/lib/bucketing.ts`
- Test: `src/lib/bucketing.test.ts`

- [ ] **Step 1: Escrever teste falhando**

```ts
// src/lib/bucketing.test.ts
import { describe, it, expect } from 'vitest';
import { computeBucketKey, isBucketTranquilo, pickRepresentatives } from './bucketing';

describe('bucketing', () => {
  it('computa bucket_key consistente', () => {
    expect(computeBucketKey('priorizar', 'A', 1)).toBe('priorizar/A/1');
    expect(computeBucketKey('descartar', 'C', 0)).toBe('descartar/C/0');
  });

  it('identifica buckets tranquilos (esperados)', () => {
    expect(isBucketTranquilo('priorizar', 'A', 0)).toBe(true);
    expect(isBucketTranquilo('manter', 'B', 0)).toBe(true);
    expect(isBucketTranquilo('descartar', 'C', 0)).toBe(true);
  });

  it('identifica buckets suspeitos', () => {
    expect(isBucketTranquilo('descartar', 'A', 1)).toBe(false);
    expect(isBucketTranquilo('priorizar', 'A', 1)).toBe(false);
    expect(isBucketTranquilo('manter', 'A', 0)).toBe(false);
  });

  it('escolhe K representantes aleatórios', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const reps = pickRepresentatives(items, 3, 42);
    expect(reps).toHaveLength(3);
    expect(new Set(reps).size).toBe(3);
  });

  it('retorna todos quando bucket menor que K', () => {
    const items = ['a', 'b'];
    const reps = pickRepresentatives(items, 3, 42);
    expect(reps).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Rodar — falha**

```bash
npm test -- src/lib/bucketing.test.ts
```

- [ ] **Step 3: Implementar**

```ts
// src/lib/bucketing.ts
import type { JudgmentOutcome, ObjectiveTier } from '@/schemas/decision-log';

/** @description Composição cartesiana das 3 dimensões enum em chave única. */
export function computeBucketKey(
  judgment: JudgmentOutcome,
  tier: ObjectiveTier,
  hasOutOfScope: 0 | 1,
): string {
  return `${judgment}/${tier}/${hasOutOfScope}`;
}

/** @description Buckets onde judgment alinha com tier e não há ambiguidade — comportamento esperado. */
export function isBucketTranquilo(
  judgment: JudgmentOutcome,
  tier: ObjectiveTier,
  hasOutOfScope: 0 | 1,
): boolean {
  if (hasOutOfScope === 1) return false;
  return (
    (judgment === 'priorizar' && tier === 'A') ||
    (judgment === 'manter' && tier === 'B') ||
    (judgment === 'descartar' && tier === 'C')
  );
}

/** @description Sample seedado pra reprodutibilidade — retorna até K elementos. */
export function pickRepresentatives<T>(items: T[], k: number, seed: number): T[] {
  if (items.length <= k) return [...items];
  const indices = items.map((_, i) => i);
  // Fisher-Yates seedado
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices.slice(0, k).map((i) => items[i]);
}
```

- [ ] **Step 4: Rodar — passa**

```bash
npm test -- src/lib/bucketing.test.ts
```

Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/bucketing.ts src/lib/bucketing.test.ts
git commit -m "feat(lib): bucketing por chave cartesiana + sample seedado"
```

---

### Task 3.4: Critérios SQL (#2, #3, #4)

**Files:**
- Create: `src/lib/criteria.ts`
- Test: `src/lib/criteria.test.ts`

- [ ] **Step 1: Escrever teste falhando**

```ts
// src/lib/criteria.test.ts
import { describe, it, expect } from 'vitest';
import { detectOutOfScopeGrowth, detectRegression, detectBudgetBlow } from './criteria';

describe('criteria', () => {
  it('detecta out-of-scope-growth quando aumento >=20pp', () => {
    const result = detectOutOfScopeGrowth({ current_pct: 0.45, previous_pct: 0.20 });
    expect(result.triggered).toBe(true);
    expect(result.delta_pp).toBeCloseTo(25);
  });
  it('não dispara abaixo de 20pp', () => {
    const result = detectOutOfScopeGrowth({ current_pct: 0.30, previous_pct: 0.20 });
    expect(result.triggered).toBe(false);
  });
  it('detecta regression quando contradições subiram >=30%', () => {
    const result = detectRegression({ current_rate: 0.13, baseline_rate: 0.10 });
    expect(result.triggered).toBe(true);
  });
  it('detecta budget-blow quando custo médio subiu >=50%', () => {
    const result = detectBudgetBlow({ current_avg: 0.0015, baseline_avg: 0.001 });
    expect(result.triggered).toBe(true);
  });
});
```

- [ ] **Step 2: Rodar — falha**

```bash
npm test -- src/lib/criteria.test.ts
```

- [ ] **Step 3: Implementar**

```ts
// src/lib/criteria.ts

const OUT_OF_SCOPE_GROWTH_THRESHOLD_PP = 20;
const REGRESSION_THRESHOLD_PCT = 0.30;
const BUDGET_BLOW_THRESHOLD_PCT = 0.50;

export type CriteriaResult = {
  triggered: boolean;
  delta_pp?: number;
  delta_pct?: number;
};

/** @description Critério #2 — crescimento de % out_of_scope vs janela anterior. */
export function detectOutOfScopeGrowth(input: {
  current_pct: number;
  previous_pct: number;
}): CriteriaResult {
  const delta_pp = (input.current_pct - input.previous_pct) * 100;
  return { triggered: delta_pp >= OUT_OF_SCOPE_GROWTH_THRESHOLD_PP, delta_pp };
}

/** @description Critério #3 — frequência de contradição obj↔julg vs baseline. */
export function detectRegression(input: {
  current_rate: number;
  baseline_rate: number;
}): CriteriaResult {
  if (input.baseline_rate === 0) return { triggered: false, delta_pct: 0 };
  const delta_pct = (input.current_rate - input.baseline_rate) / input.baseline_rate;
  return { triggered: delta_pct >= REGRESSION_THRESHOLD_PCT, delta_pct };
}

/** @description Critério #4 — custo/duração médios vs baseline. */
export function detectBudgetBlow(input: {
  current_avg: number;
  baseline_avg: number;
}): CriteriaResult {
  if (input.baseline_avg === 0) return { triggered: false, delta_pct: 0 };
  const delta_pct = (input.current_avg - input.baseline_avg) / input.baseline_avg;
  return { triggered: delta_pct >= BUDGET_BLOW_THRESHOLD_PCT, delta_pct };
}
```

- [ ] **Step 4: Rodar — passa**

```bash
npm test -- src/lib/criteria.test.ts
```

Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/criteria.ts src/lib/criteria.test.ts
git commit -m "feat(lib): critérios SQL #2 #3 #4 com thresholds explícitos"
```

---

### Task 3.5: FAW (wrapper R2)

**Files:**
- Create: `src/lib/faw.ts`

- [ ] **Step 1: Implementar wrapper R2**

```ts
// src/lib/faw.ts

export type R2Like = {
  get: (key: string) => Promise<{ text: () => Promise<string> } | null>;
  put: (key: string, body: string) => Promise<unknown>;
  list: (opts: { prefix: string }) => Promise<{ objects: Array<{ key: string }> }>;
};

/** @description Lê markdown do FAW. Retorna null se não existir. */
export async function fawRead(r2: R2Like, key: string): Promise<string | null> {
  const obj = await r2.get(key);
  if (!obj) return null;
  return obj.text();
}

/** @description Escreve markdown no FAW. */
export async function fawWrite(r2: R2Like, key: string, content: string): Promise<void> {
  await r2.put(key, content);
}

/** @description Lista keys com prefix — equivalente a glob por path. */
export async function fawList(r2: R2Like, prefix: string): Promise<string[]> {
  const result = await r2.list({ prefix });
  return result.objects.map((o) => o.key);
}

/** @description Lê todos os arquivos sob um prefix. */
export async function fawReadAll(r2: R2Like, prefix: string): Promise<Map<string, string>> {
  const keys = await fawList(r2, prefix);
  const result = new Map<string, string>();
  await Promise.all(
    keys.map(async (key) => {
      const content = await fawRead(r2, key);
      if (content !== null) result.set(key, content);
    }),
  );
  return result;
}
```

- [ ] **Step 2: Verificar typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/faw.ts
git commit -m "feat(lib): wrapper FAW pra R2 (read/write/list/readAll)"
```

---

### Task 3.6: GitHub PR client

**Files:**
- Create: `src/lib/github.ts`

- [ ] **Step 1: Implementar fetch direto**

```ts
// src/lib/github.ts

const GITHUB_API = 'https://api.github.com';

export type GitHubConfig = {
  pat: string;
  repo: string;        // 'owner/name'
  defaultBranch: string;
};

export type CreatePRInput = {
  branch: string;
  title: string;
  body: string;
  files: Array<{ path: string; content: string }>;
};

/** @description Cria branch a partir do default, commita arquivos, abre PR. */
export async function createPR(cfg: GitHubConfig, input: CreatePRInput): Promise<string> {
  // 1. Pega SHA do default branch
  const refRes = await ghFetch(cfg, `/repos/${cfg.repo}/git/refs/heads/${cfg.defaultBranch}`);
  const baseSha = refRes.object.sha as string;

  // 2. Cria branch
  await ghFetch(cfg, `/repos/${cfg.repo}/git/refs`, {
    method: 'POST',
    body: { ref: `refs/heads/${input.branch}`, sha: baseSha },
  });

  // 3. Cria blobs e tree
  const tree = await Promise.all(
    input.files.map(async (f) => {
      const blob = await ghFetch(cfg, `/repos/${cfg.repo}/git/blobs`, {
        method: 'POST',
        body: { content: f.content, encoding: 'utf-8' },
      });
      return { path: f.path, mode: '100644', type: 'blob', sha: blob.sha as string };
    }),
  );
  const treeRes = await ghFetch(cfg, `/repos/${cfg.repo}/git/trees`, {
    method: 'POST',
    body: { base_tree: baseSha, tree },
  });

  // 4. Cria commit
  const commitRes = await ghFetch(cfg, `/repos/${cfg.repo}/git/commits`, {
    method: 'POST',
    body: {
      message: input.title,
      tree: treeRes.sha,
      parents: [baseSha],
    },
  });

  // 5. Atualiza ref do branch
  await ghFetch(cfg, `/repos/${cfg.repo}/git/refs/heads/${input.branch}`, {
    method: 'PATCH',
    body: { sha: commitRes.sha, force: false },
  });

  // 6. Abre PR
  const pr = await ghFetch(cfg, `/repos/${cfg.repo}/pulls`, {
    method: 'POST',
    body: {
      title: input.title,
      head: input.branch,
      base: cfg.defaultBranch,
      body: input.body,
    },
  });

  return pr.html_url as string;
}

async function ghFetch(
  cfg: GitHubConfig,
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<Record<string, unknown>> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${cfg.pat}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'gabarito-monitor',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 500);
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return (await res.json()) as Record<string, unknown>;
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/github.ts
git commit -m "feat(lib): cliente GitHub pra criar branch + commit + PR via fetch"
```

---

### Task 3.7: Telegram alerter

**Files:**
- Create: `src/lib/telegram.ts`

- [ ] **Step 1: Implementar**

```ts
// src/lib/telegram.ts

export type TelegramConfig = {
  botToken: string;
  chatId: string;
};

/** @description Envia mensagem texto pra chat. Não retry — log e segue se falhar. */
export async function sendTelegramAlert(
  cfg: TelegramConfig,
  message: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${cfg.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: cfg.chatId,
          text: message,
          parse_mode: 'Markdown',
        }),
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!res.ok) {
      const text = (await res.text()).slice(0, 500);
      return { ok: false, error: `Telegram ${res.status}: ${text}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown' };
  }
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/telegram.ts
git commit -m "feat(lib): alerter Telegram via Bot API com timeout"
```

---

### Task 3.8: Promotion (regra de promoção a finding)

**Files:**
- Create: `src/lib/promotion.ts`
- Test: `src/lib/promotion.test.ts`

- [ ] **Step 1: Escrever teste falhando**

```ts
// src/lib/promotion.test.ts
import { describe, it, expect } from 'vitest';
import { shouldPromoteToFinding } from './promotion';

describe('shouldPromoteToFinding', () => {
  it('promove quando >=3 buckets distintos com mesmo heurístico', () => {
    expect(shouldPromoteToFinding({
      distinct_buckets_count: 3,
      max_bucket_size: 10,
      confidence: 'med',
    })).toBe(true);
  });

  it('promove quando 1 bucket grande com confidence high', () => {
    expect(shouldPromoteToFinding({
      distinct_buckets_count: 1,
      max_bucket_size: 25,
      confidence: 'high',
    })).toBe(true);
  });

  it('não promove quando bucket grande mas confidence low', () => {
    expect(shouldPromoteToFinding({
      distinct_buckets_count: 1,
      max_bucket_size: 30,
      confidence: 'low',
    })).toBe(false);
  });

  it('não promove quando 2 buckets e bucket pequeno', () => {
    expect(shouldPromoteToFinding({
      distinct_buckets_count: 2,
      max_bucket_size: 15,
      confidence: 'high',
    })).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar — falha**

```bash
npm test -- src/lib/promotion.test.ts
```

- [ ] **Step 3: Implementar**

```ts
// src/lib/promotion.ts

const MIN_DISTINCT_BUCKETS = 3;
const SINGLE_BUCKET_MIN_SIZE = 20;

/** @description Regra de promoção do spec §6.4: cross-bucket OU single-bucket grande high-conf. */
export function shouldPromoteToFinding(input: {
  distinct_buckets_count: number;
  max_bucket_size: number;
  confidence: 'high' | 'med' | 'low';
}): boolean {
  const crossBucket = input.distinct_buckets_count >= MIN_DISTINCT_BUCKETS;
  const singleBucketHighConf =
    input.max_bucket_size > SINGLE_BUCKET_MIN_SIZE && input.confidence === 'high';
  return crossBucket || singleBucketHighConf;
}
```

- [ ] **Step 4: Rodar — passa**

```bash
npm test -- src/lib/promotion.test.ts
```

Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/promotion.ts src/lib/promotion.test.ts
git commit -m "feat(lib): regra de promoção a finding (cross-bucket OU single-bucket grande)"
```

---

### Task 3.9: Resolution (transição de status)

**Files:**
- Create: `src/lib/resolution.ts`
- Test: `src/lib/resolution.test.ts`

- [ ] **Step 1: Escrever teste falhando**

```ts
// src/lib/resolution.test.ts
import { describe, it, expect } from 'vitest';
import { computeNextStatus } from './resolution';

describe('computeNextStatus', () => {
  it('mantém active quando padrão ainda aparece', () => {
    expect(computeNextStatus({
      current_status: 'active',
      windows_silent: 0,
      detected_at_ms: Date.now() - 1000,
      pattern_seen_in_current_window: true,
    }, { silentToResolve: 2, daysToStale: 30 })).toEqual({ status: 'active', windows_silent: 0 });
  });

  it('resolve após 2 janelas silent', () => {
    const result = computeNextStatus({
      current_status: 'active',
      windows_silent: 1,
      detected_at_ms: Date.now() - 86400_000,
      pattern_seen_in_current_window: false,
    }, { silentToResolve: 2, daysToStale: 30 });
    expect(result.status).toBe('resolved');
  });

  it('marca stale após 30 dias active sem mudança', () => {
    const result = computeNextStatus({
      current_status: 'active',
      windows_silent: 0,
      detected_at_ms: Date.now() - 31 * 86400_000,
      pattern_seen_in_current_window: true,
    }, { silentToResolve: 2, daysToStale: 30 });
    expect(result.status).toBe('stale');
  });
});
```

- [ ] **Step 2: Rodar — falha**

```bash
npm test -- src/lib/resolution.test.ts
```

- [ ] **Step 3: Implementar**

```ts
// src/lib/resolution.ts

export type FindingStatus = 'active' | 'resolved' | 'stale';

export type ResolutionInput = {
  current_status: FindingStatus;
  windows_silent: number;
  detected_at_ms: number;
  pattern_seen_in_current_window: boolean;
};

export type ResolutionConfig = {
  silentToResolve: number;
  daysToStale: number;
};

/** @description Transição de status conforme §6.7 do spec. */
export function computeNextStatus(
  input: ResolutionInput,
  config: ResolutionConfig,
): { status: FindingStatus; windows_silent: number } {
  if (input.current_status !== 'active') {
    return { status: input.current_status, windows_silent: input.windows_silent };
  }
  if (input.pattern_seen_in_current_window) {
    const ageDays = (Date.now() - input.detected_at_ms) / 86400_000;
    if (ageDays >= config.daysToStale) {
      return { status: 'stale', windows_silent: 0 };
    }
    return { status: 'active', windows_silent: 0 };
  }
  const nextSilent = input.windows_silent + 1;
  if (nextSilent >= config.silentToResolve) {
    return { status: 'resolved', windows_silent: nextSilent };
  }
  return { status: 'active', windows_silent: nextSilent };
}
```

- [ ] **Step 4: Rodar — passa**

```bash
npm test -- src/lib/resolution.test.ts
```

Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/resolution.ts src/lib/resolution.test.ts
git commit -m "feat(lib): transição active→resolved/stale do finding"
```

---

## Phase 4 — Synthetic Generator

### Task 4.1: Modes & templates

**Files:**
- Create: `src/lib/synthetic-modes.ts`
- Create: `src/lib/synthetic-templates.ts`

- [ ] **Step 1: Implementar modes**

```ts
// src/lib/synthetic-modes.ts

export type SyntheticMode = 'baseline' | 'drift-h1' | 'drift-multi' | 'high-budget';

export type ModeConfig = {
  ignore_h1_probability: number;
  ignore_h2_probability: number;
  out_of_scope_probability: number;
  cost_multiplier: number;
  duration_multiplier: number;
};

export const MODE_CONFIGS: Record<SyntheticMode, ModeConfig> = {
  baseline: {
    ignore_h1_probability: 0,
    ignore_h2_probability: 0,
    out_of_scope_probability: 0.10,
    cost_multiplier: 1,
    duration_multiplier: 1,
  },
  'drift-h1': {
    ignore_h1_probability: 0.40,
    ignore_h2_probability: 0,
    out_of_scope_probability: 0.10,
    cost_multiplier: 1,
    duration_multiplier: 1,
  },
  'drift-multi': {
    ignore_h1_probability: 0.40,
    ignore_h2_probability: 0.40,
    out_of_scope_probability: 0.15,
    cost_multiplier: 1,
    duration_multiplier: 1,
  },
  'high-budget': {
    ignore_h1_probability: 0.10,
    ignore_h2_probability: 0,
    out_of_scope_probability: 0.10,
    cost_multiplier: 2.5,
    duration_multiplier: 2.5,
  },
};
```

- [ ] **Step 2: Implementar templates**

```ts
// src/lib/synthetic-templates.ts
import type { JudgmentOutcome, ObjectiveTier } from '@/schemas/decision-log';
import type { ModeConfig } from './synthetic-modes';

export type Lead = {
  id: string;
  nome_empresa: string;
  segmento: string;
  faturamento_mensal: string;
  time_vendas: 'dedicado' | 'solo' | null;
  ferramentas: 'crm' | 'planilha' | null;
  sinal: 'demo' | 'form' | 'material' | null;
  contexto_livre: string;
};

export type SimulatedDecision = {
  outcome: JudgmentOutcome;
  reasoned: string;
  out_of_scope: string | null;
  duration_ms: number;
  cost_usd: number;
};

/** @description Aplica rubrica determinística pra calcular tier objetivo do lead. */
export function applyRubrica(lead: Lead): { score: number; tier: ObjectiveTier } {
  let score = 0;
  if (['infoprodutor', 'agência de marketing', 'SaaS B2B'].includes(lead.segmento)) score += 30;
  // simplificado pra POC: assume número parsed se possível
  if (lead.faturamento_mensal.includes('k') || lead.faturamento_mensal.includes('M')) {
    const num = parseInt(lead.faturamento_mensal.replace(/\D/g, ''));
    if (num >= 50) score += 25;
  }
  if (lead.time_vendas === 'dedicado') score += 20;
  if (lead.ferramentas === 'crm') score += 15;
  if (lead.sinal === 'demo' || lead.sinal === 'form') score += 10;
  const tier: ObjectiveTier = score >= 75 ? 'A' : score >= 50 ? 'B' : 'C';
  return { score, tier };
}

/** @description Simula decisão do qualificador com drift conforme mode. */
export function simulateDecision(
  lead: Lead,
  tier: ObjectiveTier,
  mode: ModeConfig,
  random: () => number,
): SimulatedDecision {
  const isFundadorTecnico = /fundador (técnico|tech|cto)/i.test(lead.contexto_livre);
  const mencionaDor = /dor|problema espec[ií]fic/i.test(lead.contexto_livre);

  const ignoreH1 = isFundadorTecnico && random() < mode.ignore_h1_probability;
  const ignoreH2 = mencionaDor && random() < mode.ignore_h2_probability;
  const declareOoS = random() < mode.out_of_scope_probability;

  let outcome: JudgmentOutcome;
  let reasoned: string;

  if (isFundadorTecnico && !ignoreH1 && tier !== 'C') {
    outcome = 'priorizar';
    reasoned = `priorizar porque fundador técnico em fase de produto → feedback acelera roadmap (H1)`;
  } else if (mencionaDor && !ignoreH2) {
    outcome = 'priorizar';
    reasoned = `priorizar porque menciona dor específica em hipótese não validada → valor de aprendizado supera custo (H2)`;
  } else if (tier === 'A') {
    outcome = 'priorizar';
    reasoned = `priorizar porque tier objetivo A → fit estrutural alto`;
  } else if (tier === 'B') {
    outcome = 'manter';
    reasoned = `manter porque tier objetivo B → fit médio sem sinal compensatório`;
  } else {
    outcome = 'descartar';
    reasoned = `descartar porque tier objetivo C → custo de oportunidade do time supera valor`;
  }

  const out_of_scope = declareOoS
    ? 'faltou dado sobre maturidade do time pra avaliar capacidade de absorção'
    : null;

  return {
    outcome,
    reasoned,
    out_of_scope,
    duration_ms: Math.round(500 * mode.duration_multiplier * (0.8 + random() * 0.4)),
    cost_usd: 0.0001 * mode.cost_multiplier * (0.8 + random() * 0.4),
  };
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/synthetic-modes.ts src/lib/synthetic-templates.ts
git commit -m "feat(lib): synthetic modes + templates de decisão"
```

---

### Task 4.2: Generator + insert no D1

**Files:**
- Create: `src/lib/synthetic-generator.ts`

- [ ] **Step 1: Implementar generator**

```ts
// src/lib/synthetic-generator.ts
import * as v from 'valibot';
import { DecisionLogInsertSchema } from '@/schemas/decision-log';
import { defendPII } from './pii';
import { pseudonymize } from './hmac';
import { MODE_CONFIGS, type SyntheticMode } from './synthetic-modes';
import { applyRubrica, simulateDecision, type Lead } from './synthetic-templates';

export type GeneratorEnv = {
  DB: D1Database;
  HMAC_SECRET: string;
};

/** @description Gera N decisions sintéticas no modo dado e insere em D1. */
export async function generateRun(
  env: GeneratorEnv,
  leads: Lead[],
  mode: SyntheticMode,
  modelLabel: string,
  count = 10,
): Promise<{ inserted: number; rejected: number }> {
  const config = MODE_CONFIGS[mode];
  let inserted = 0;
  let rejected = 0;
  const random = () => Math.random();

  for (let i = 0; i < count; i++) {
    const lead = leads[Math.floor(random() * leads.length)];
    const { tier } = applyRubrica(lead);
    const decision = simulateDecision(lead, tier, config, random);

    const agentId = await pseudonymize('qualificador', env.HMAC_SECRET);
    const threadId = await pseudonymize(`run-${Date.now()}-${i}`, env.HMAC_SECRET);

    const candidate = {
      id: `d-${Date.now()}-${i}`,
      ts: Date.now(),
      agent_id: agentId,
      thread_id: threadId,
      domain: 'qualificador',
      phase: 'fit-estrategico',
      did: decision.outcome,
      reasoned: decision.reasoned,
      out_of_scope: decision.out_of_scope,
      duration_ms: decision.duration_ms,
      cost_usd: decision.cost_usd,
      model_main: modelLabel,
      expected_reasoning_ref: 'qualificador/fit-estrategico',
      objective_tier: tier,
      judgment_outcome: decision.outcome,
      has_out_of_scope: decision.out_of_scope ? 1 : 0,
    } as const;

    const piiResult = defendPII(candidate);
    if (!piiResult.ok) {
      await env.DB.prepare(
        'INSERT INTO decision_log_rejected (id, ts, reason, rejected_by_layer) VALUES (?, ?, ?, ?)',
      )
        .bind(candidate.id, candidate.ts, piiResult.reason, piiResult.layer)
        .run();
      rejected++;
      continue;
    }

    try {
      const validated = v.parse(DecisionLogInsertSchema, piiResult.sanitized);
      await env.DB.prepare(
        `INSERT INTO decision_log (
          id, ts, agent_id, thread_id, domain, phase, did, reasoned, out_of_scope,
          duration_ms, cost_usd, model_main, expected_reasoning_ref,
          objective_tier, judgment_outcome, has_out_of_scope
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
        .bind(
          validated.id, validated.ts, validated.agent_id, validated.thread_id,
          validated.domain, validated.phase, validated.did, validated.reasoned,
          validated.out_of_scope, validated.duration_ms, validated.cost_usd,
          validated.model_main, validated.expected_reasoning_ref,
          validated.objective_tier, validated.judgment_outcome, validated.has_out_of_scope,
        )
        .run();
      inserted++;
    } catch {
      rejected++;
    }
  }

  return { inserted, rejected };
}

/** @description Escolhe mode baseado na hora UTC + scenarios. */
export function pickModeForHour(scenarios: Array<{ from_hour: number; to_hour: number; mode: SyntheticMode }>, hour: number): SyntheticMode {
  for (const s of scenarios) {
    if (hour >= s.from_hour && hour < s.to_hour) return s.mode;
  }
  return 'baseline';
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/synthetic-generator.ts
git commit -m "feat(lib): generator sintético com pipeline PII + insert D1"
```

---

### Task 4.3: Fixtures (leads + scenarios)

**Files:**
- Create: `fixtures/leads.json`
- Create: `fixtures/scenarios.json`

- [ ] **Step 1: Escrever `fixtures/leads.json` com 20 leads**

```json
[
  { "id": "L01", "nome_empresa": "EduPro", "segmento": "infoprodutor", "faturamento_mensal": "120k", "time_vendas": "dedicado", "ferramentas": "crm", "sinal": "demo", "contexto_livre": "fundador é dev solo escalando, fala de dor de qualificação manual" },
  { "id": "L02", "nome_empresa": "AgenciaAlpha", "segmento": "agência de marketing", "faturamento_mensal": "200k", "time_vendas": "dedicado", "ferramentas": "crm", "sinal": "demo", "contexto_livre": "agência grande com processo definido" },
  { "id": "L03", "nome_empresa": "SaasBeta", "segmento": "SaaS B2B", "faturamento_mensal": "300k", "time_vendas": "dedicado", "ferramentas": "crm", "sinal": "form", "contexto_livre": "CTO mencionou interesse em explicabilidade" },
  { "id": "L04", "nome_empresa": "CursoY", "segmento": "infoprodutor", "faturamento_mensal": "80k", "time_vendas": "dedicado", "ferramentas": "crm", "sinal": "demo", "contexto_livre": "lançamento perpetuo consolidado" },
  { "id": "L05", "nome_empresa": "MarketingZ", "segmento": "agência de marketing", "faturamento_mensal": "150k", "time_vendas": "dedicado", "ferramentas": "crm", "sinal": "demo", "contexto_livre": "time de growth pleno" },
  { "id": "L06", "nome_empresa": "EduMaster", "segmento": "infoprodutor", "faturamento_mensal": "100k", "time_vendas": "dedicado", "ferramentas": "crm", "sinal": "demo", "contexto_livre": "operação tradicional" },
  { "id": "L07", "nome_empresa": "FreelaJP", "segmento": "outro", "faturamento_mensal": "10k", "time_vendas": "solo", "ferramentas": "planilha", "sinal": "material", "contexto_livre": "freelancer começando" },
  { "id": "L08", "nome_empresa": "MicroLoja", "segmento": "ecommerce", "faturamento_mensal": "5k", "time_vendas": "solo", "ferramentas": "planilha", "sinal": "material", "contexto_livre": "loja pequena curiosa" },
  { "id": "L09", "nome_empresa": "Estudante1", "segmento": "outro", "faturamento_mensal": "0", "time_vendas": null, "ferramentas": "planilha", "sinal": "material", "contexto_livre": "estudante pesquisando" },
  { "id": "L10", "nome_empresa": "MeiBlog", "segmento": "outro", "faturamento_mensal": "3k", "time_vendas": "solo", "ferramentas": "planilha", "sinal": "material", "contexto_livre": "blogueiro testando ferramentas" },
  { "id": "L11", "nome_empresa": "ConsultorX", "segmento": "outro", "faturamento_mensal": "8k", "time_vendas": "solo", "ferramentas": "planilha", "sinal": "form", "contexto_livre": "consultor solo sem time" },
  { "id": "L12", "nome_empresa": "MicroSaaS", "segmento": "outro", "faturamento_mensal": "12k", "time_vendas": "solo", "ferramentas": "planilha", "sinal": "material", "contexto_livre": "indie hacker explorando" },
  { "id": "L13", "nome_empresa": "TechStart", "segmento": "SaaS B2B", "faturamento_mensal": "60k", "time_vendas": "solo", "ferramentas": "crm", "sinal": "form", "contexto_livre": "fundador técnico solo, dor de qualificação" },
  { "id": "L14", "nome_empresa": "EduFlow", "segmento": "infoprodutor", "faturamento_mensal": "45k", "time_vendas": "dedicado", "ferramentas": "planilha", "sinal": "demo", "contexto_livre": "infoprodutora ascendente" },
  { "id": "L15", "nome_empresa": "MegaCorp", "segmento": "SaaS B2B", "faturamento_mensal": "5M", "time_vendas": "dedicado", "ferramentas": "crm", "sinal": "form", "contexto_livre": "enterprise com 200 usuários" },
  { "id": "L16", "nome_empresa": "AgenciaSmall", "segmento": "agência de marketing", "faturamento_mensal": "40k", "time_vendas": "dedicado", "ferramentas": "planilha", "sinal": "demo", "contexto_livre": "agência crescendo" },
  { "id": "L17", "nome_empresa": "DevShop", "segmento": "SaaS B2B", "faturamento_mensal": "70k", "time_vendas": "dedicado", "ferramentas": "crm", "sinal": "material", "contexto_livre": "fundador técnico cético" },
  { "id": "L18", "nome_empresa": "CourseFlow", "segmento": "infoprodutor", "faturamento_mensal": "90k", "time_vendas": "solo", "ferramentas": "crm", "sinal": "form", "contexto_livre": "menciona dor específica de explicabilidade do agente" },
  { "id": "L19", "nome_empresa": "InfoMid", "segmento": "infoprodutor", "faturamento_mensal": "55k", "time_vendas": null, "ferramentas": null, "sinal": "demo", "contexto_livre": "lead novo sem dados completos" },
  { "id": "L20", "nome_empresa": "AgYoung", "segmento": "agência de marketing", "faturamento_mensal": "65k", "time_vendas": "dedicado", "ferramentas": null, "sinal": "form", "contexto_livre": "agência jovem crescendo rápido" }
]
```

- [ ] **Step 2: Escrever `fixtures/scenarios.json`**

```json
[
  { "from_hour": 0, "to_hour": 6, "mode": "baseline" },
  { "from_hour": 6, "to_hour": 12, "mode": "drift-h1" },
  { "from_hour": 12, "to_hour": 18, "mode": "drift-multi" },
  { "from_hour": 18, "to_hour": 24, "mode": "high-budget" }
]
```

- [ ] **Step 3: Commit**

```bash
git add fixtures/leads.json fixtures/scenarios.json
git commit -m "feat(fixtures): 20 leads sintéticos + cenários por hora"
```

---

## Phase 5 — Roles & Skills

### Task 5.1: Roles

**Files:**
- Create: `.flue/roles/auditor-monitor.md`
- Create: `.flue/roles/qualificador-sdr.md`

- [ ] **Step 1: Escrever `.flue/roles/auditor-monitor.md`** (literal do spec §8)

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

- [ ] **Step 2: Escrever `.flue/roles/qualificador-sdr.md`**

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

- [ ] **Step 3: Commit**

```bash
git add .flue/roles/
git commit -m "feat(roles): auditor-monitor + qualificador-sdr"
```

---

### Task 5.2: Skill `qualificador/qualificar-lead`

**Files:**
- Create: `.flue/skills/qualificador/qualificar-lead/SKILL.md`

- [ ] **Step 1: Escrever SKILL.md**

```md
---
name: qualificar-lead
description: Qualifica um lead aplicando dois eixos — score objetivo via rubrica ICP (P1, código) e fit estratégico via heurísticos do gabarito (P3, articulação causal). Use sempre que receber um lead com campos estruturados — sempre articula `reasoned` no formato "X porque Y → Z" e preenche `out_of_scope` quando faltar dado pra aplicar heurístico. Skip apenas se o input do lead estiver malformado.
model: main
---

# Qualificar Lead

Você qualifica leads aplicando dois eixos independentes que produzem outputs separados.

## Eixo 1 — Objetivo (P1, determinístico)
Recebe `objective_tier` já calculado pela rubrica ICP em código. Não recalcule. Apenas inclua no output.

## Eixo 2 — Julgamento (P3)
Avalie fit estratégico do lead aplicando os heurísticos do gabarito (`expected_reasoning`):

- Identifique qual heurístico do gabarito se aplica ao lead atual
- Articule causalmente: "X porque Y → Z"
- Se faltar dado pra aplicar com confiança, preencha `out_of_scope`
- Output: `outcome` em {priorizar, manter, descartar}

## Formato do `reasoned`
Sempre cite o heurístico aplicado pelo nome (H1, H2...) ou pela condição literal.

Exemplo:
```
"priorizar porque fundador técnico em fase de produto → feedback acelera roadmap (H1)"
```

## Quando preencher `out_of_scope`
Sempre que faltar dado essencial pra aplicar heurístico relevante. Exemplo:
```
"faltou informação sobre o time atual do lead pra aplicar H3"
```
```

- [ ] **Step 2: Commit**

```bash
git add .flue/skills/qualificador/qualificar-lead/SKILL.md
git commit -m "feat(skill): qualificar-lead (qualificador hipotético)"
```

---

### Task 5.3: Skill `monitor/detect-divergences`

**Files:**
- Create: `.flue/skills/monitor/detect-divergences/SKILL.md`

- [ ] **Step 1: Escrever SKILL.md**

```md
---
name: detect-divergences
description: Identifica heurísticos do gabarito que foram ignorados ou mal-aplicados em UMA decisão específica do agente avaliado. Use sempre que receber uma decision com `reasoned` em texto livre + um gabarito de heurísticos esperados — mesmo que o `did` pareça correto, sempre inspecione o mecanismo do raciocínio. Skip apenas se a decision não tiver `reasoned` preenchido (input inválido).
model: main
---

# Detect Divergences

Você inspeciona o mecanismo do raciocínio de UMA decisão contra um gabarito.

## Input
- `decision`: { id, did, reasoned, out_of_scope }
- `gabarito`: markdown completo com heurísticos H1, H2, ...

## Operação
Pra cada heurístico do gabarito:
1. Determine se as condições do heurístico se aplicam à decisão (com base nos campos disponíveis)
2. Se aplicam: o `reasoned` invocou esse heurístico explicitamente?
3. Se não invocou: registre divergência

## Formato de cada divergência
```json
{
  "heuristic_ignored": "<citação literal do heurístico do gabarito>",
  "evidence": "<citação literal do reasoned>",
  "severity": "low|med|high"
}
```

## Severidade
- `high`: heurístico que, se aplicado, mudaria o outcome
- `med`: heurístico relevante mas que não alteraria outcome
- `low`: heurístico marginalmente aplicável

## NÃO FAZER
- Não inferir condições do heurístico que não estão visíveis nos campos
- Não classificar origem (isso é skill diferente)
- Não sugerir correção (isso é skill diferente)
- Marcar `inconclusive` em vez de adivinhar
```

- [ ] **Step 2: Commit**

```bash
git add .flue/skills/monitor/detect-divergences/
git commit -m "feat(skill): detect-divergences (monitor)"
```

---

### Task 5.4: Skill `monitor/classify-origin` + references

**Files:**
- Create: `.flue/skills/monitor/classify-origin/SKILL.md`
- Create: `.flue/skills/monitor/classify-origin/references/prompt-issue.md`
- Create: `.flue/skills/monitor/classify-origin/references/gabarito-stale.md`
- Create: `.flue/skills/monitor/classify-origin/references/criterio-faltando.md`
- Create: `.flue/skills/monitor/classify-origin/references/contexto-mudou.md`

- [ ] **Step 1: Escrever SKILL.md**

```md
---
name: classify-origin
description: Classifica a ORIGEM de uma divergência detectada entre 4 alvos possíveis (prompt do agente, gabarito desatualizado, critério faltando na rubrica, contexto de negócio mudou). Use sempre que receber uma divergência detectada com `heuristic_ignored` + `evidence`, antes de qualquer sugestão de ajuste — a classificação determina QUAL arquivo o ajuste vai modificar. Skip se a divergência for marcada como inconclusive na detecção.
model: main
---

# Classify Origin

Você categoriza a ORIGEM de uma divergência entre 4 alvos possíveis.

## Decision tree
1. O heurístico foi ignorado mas o gabarito está claro e atual? → `prompt-issue` (carregue `references/prompt-issue.md`)
2. O heurístico do gabarito está desatualizado pelo contexto de negócio? → `gabarito-stale` (carregue `references/gabarito-stale.md`)
3. A divergência aponta critério que não existe na rubrica objetiva? → `criterio-faltando` (carregue `references/criterio-faltando.md`)
4. O contexto-momento referenciado mudou e o gabarito ainda reflete o antigo? → `contexto-mudou` (carregue `references/contexto-mudou.md`)
5. Nenhuma das anteriores? → `inconclusive`

## Output
```json
{
  "target": "prompt-issue|gabarito-stale|criterio-faltando|contexto-mudou|inconclusive",
  "rationale": "<1-2 linhas explicando por que esse target>"
}
```

## NÃO FAZER
- Não chutar — `inconclusive` é resposta válida
- Não combinar targets — escolha 1
```

- [ ] **Step 2: Escrever references**

```md
<!-- references/prompt-issue.md -->
# Target: prompt-issue

A divergência indica que o prompt do agente (SKILL.md do qualificar-lead) precisa ser ajustado pra invocar mais explicitamente o heurístico ignorado.

Sinais:
- Heurístico do gabarito aplicava, mas reasoned não cita
- Comportamento sistemático em múltiplos casos similares
- Gabarito está claro — falha está em traduzir pro prompt
```

```md
<!-- references/gabarito-stale.md -->
# Target: gabarito-stale

O gabarito (`expected-reasoning/`) precisa ser atualizado.

Sinais:
- Heurístico do gabarito é específico demais ou genérico demais pra realidade atual
- Reasoned do agente revela raciocínio mais nuançado que o gabarito
- Mercado/produto mudou e o heurístico não acompanhou
```

```md
<!-- references/criterio-faltando.md -->
# Target: criterio-faltando

A rubrica objetiva (`agents-config/qualificador/criterios-icp.md`) precisa de critério novo.

Sinais:
- Divergência aponta dimensão objetiva não capturada nos critérios atuais
- Reasoned justifica decisão por fator que deveria ser parte da rubrica
- Padrão recorrente em buckets distintos
```

```md
<!-- references/contexto-mudou.md -->
# Target: contexto-mudou

O contexto-momento (`agents-config/qualificador/contexto-momento.md`) precisa de atualização.

Sinais:
- Reasoned referencia capacidade/foco/fase distinta da declarada
- Decisão sistemática contradiz contexto declarado
- Hipóteses não validadas precisam de revisão
```

- [ ] **Step 3: Commit**

```bash
git add .flue/skills/monitor/classify-origin/
git commit -m "feat(skill): classify-origin com 4 references de target"
```

---

### Task 5.5: Skill `monitor/suggest-adjustment` + references

**Files:**
- Create: `.flue/skills/monitor/suggest-adjustment/SKILL.md`
- Create: `.flue/skills/monitor/suggest-adjustment/references/ajuste-prompt.md`
- Create: `.flue/skills/monitor/suggest-adjustment/references/ajuste-gabarito.md`
- Create: `.flue/skills/monitor/suggest-adjustment/references/ajuste-criterio.md`
- Create: `.flue/skills/monitor/suggest-adjustment/references/ajuste-contexto.md`

- [ ] **Step 1: SKILL.md**

```md
---
name: suggest-adjustment
description: Gera texto de mudança proposta para um arquivo target específico baseado em divergência classificada. Use sempre que receber uma divergência com origem já classificada — o output é texto livre da sugestão, NÃO diff (humano edita no PR). Skip se o target for unknown ou inconclusive.
model: main
---

# Suggest Adjustment

Você gera texto de sugestão pra um arquivo específico.

## Input
- `divergencia`: { heuristic_ignored, evidence, target }
- `current_content`: conteúdo atual do arquivo target

## Operação
Conforme `target`, carregue a reference específica em `references/ajuste-<target>.md` e siga o template.

## Output
```json
{
  "target_file": "<caminho relativo ao repo>",
  "proposed_change": "<texto livre da mudança proposta>",
  "rationale": "<por que essa mudança resolve a divergência>"
}
```

## REGRAS DURAS
- NÃO gere diff — humano edita no PR
- NÃO modifique seções não-relacionadas à divergência
- Mantenha tom e estrutura do arquivo original
- Se a sugestão for grande, divida em pontos numerados
```

- [ ] **Step 2: Escrever references (4 arquivos)**

```md
<!-- references/ajuste-prompt.md -->
# Ajuste de Prompt

Sugira mudança no body do SKILL.md do qualificar-lead que torne mais explícito invocar o heurístico ignorado.

Padrão sugerido:
- Adicionar sub-seção "Quando aplicar Hx" com critério literal
- Adicionar exemplo de reasoned aplicando o heurístico
- Marcar como obrigatório citar Hx quando condições aplicam
```

```md
<!-- references/ajuste-gabarito.md -->
# Ajuste de Gabarito

Sugira atualização no heurístico do `expected-reasoning/qualificador/fit-estrategico.md`.

Padrão:
- Manter formato "condição → ação, porque mecanismo"
- Refinar condição (mais específica ou mais genérica conforme evidência)
- Atualizar mecanismo se realidade mudou
- Adicionar/remover heurístico se justificado
```

```md
<!-- references/ajuste-criterio.md -->
# Ajuste de Critério

Sugira novo critério (ou refinamento) na `agents-config/qualificador/criterios-icp.md`.

Padrão:
- Adicionar linha na tabela: critério, regra, peso
- Justificar peso baseado em quantos casos divergiram por esse fator
- Manter total da rubrica em 100
```

```md
<!-- references/ajuste-contexto.md -->
# Ajuste de Contexto

Sugira atualização em `agents-config/qualificador/contexto-momento.md`.

Padrão:
- Atualizar seção relevante (Fase, Capacidade, Foco, Hipóteses)
- Datar mudança
- Manter tom curto e direto
```

- [ ] **Step 3: Commit**

```bash
git add .flue/skills/monitor/suggest-adjustment/
git commit -m "feat(skill): suggest-adjustment com 4 references de ajuste"
```

---

### Task 5.6: Skill `monitor/summarize-patterns`

**Files:**
- Create: `.flue/skills/monitor/summarize-patterns/SKILL.md`

- [ ] **Step 1: Escrever SKILL.md**

```md
---
name: summarize-patterns
description: Identifica padrões agregados em um conjunto de divergências de um run, considerando metadados de bucket. Use 1 vez ao final de cada run com TODAS as divergências detectadas. Detecta cross-bucket signal (mesmo heurístico ignorado em buckets estruturalmente distintos = problema sistêmico) e recomenda promoção a finding. Skip se zero divergências.
model: main
---

# Summarize Patterns

Você identifica padrões agregados a partir do conjunto de divergências detectadas no run.

## Input
- `divergences`: lista de { decision_id, heuristic_ignored, evidence, severity, bucket_key, bucket_size, representatives_audited }
- `active_findings`: lista de findings prévios (pra evitar redescobrir)

## Operação
1. Agrupe divergências por `heuristic_ignored`
2. Pra cada grupo, identifique:
   - `affected_buckets`: lista de bucket_keys distintos
   - `inferred_decisions`: soma de bucket_size dos buckets afetados
   - `confidence`: high se padrão aparece em ≥2 buckets E ≥3 representantes; med se 1 bucket grande; low caso contrário
   - `promotion_recommendation`: 'finding' | 'wait' | 'discard'
3. Identifique `cross_bucket_signal` se mesmo heurístico aparece em buckets estruturalmente distintos (ex: `descartar/A/sim` E `priorizar/C/sim`) — sinal sistêmico

## Output
Schema validado em valibot — siga o `SummarizePatternsOutputSchema`.

## NÃO FAZER
- Não inventar pattern_type — use só os 4 do schema
- Não inferir confidence sem dado suporte
- Não recomendar `finding` sem cross-bucket OU bucket grande high-conf
```

- [ ] **Step 2: Commit**

```bash
git add .flue/skills/monitor/summarize-patterns/
git commit -m "feat(skill): summarize-patterns (monitor)"
```

---

## Phase 6 — Agent Configs (Seeds)

### Task 6.1: Rubrica ICP + contexto + gabarito

**Files:**
- Create: `agents-config/qualificador/criterios-icp.md`
- Create: `agents-config/qualificador/contexto-momento.md`
- Create: `expected-reasoning/qualificador/fit-estrategico.md`

- [ ] **Step 1: Escrever os 3 arquivos literais do spec §10**

(usar conteúdo literal do spec — copiando aqui pra não duplicar; veja seção 10.1, 10.2, 10.3 do spec)

- [ ] **Step 2: Commit**

```bash
git add agents-config/ expected-reasoning/
git commit -m "feat(seeds): rubrica ICP + contexto-momento + gabarito fit-estrategico"
```

---

## Phase 7 — Agentes Flue

### Task 7.1: Agente qualificador (instanciado, não disparado)

**Files:**
- Create: `.flue/agents/qualificador.ts`

- [ ] **Step 1: Implementar**

```ts
// .flue/agents/qualificador.ts
import type { FlueContext } from '@flue/sdk/client';
import * as v from 'valibot';
import { QualificarLeadOutputSchema } from '@/schemas/skills';
import { applyRubrica, type Lead } from '@/lib/synthetic-templates';
import { fawRead } from '@/lib/faw';

export const triggers = { webhook: true };

export default async function (ctx: FlueContext): Promise<unknown> {
  const lead = (ctx.payload ?? {}) as Lead;
  if (!lead.id) {
    return { error: 'lead inválido — id ausente' };
  }

  const { tier } = applyRubrica(lead);

  const harness = await ctx.init({
    model: ctx.env.MODEL_MAIN ?? '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    role: 'qualificador-sdr',
  });
  const session = await harness.session();

  const gabarito = (await fawRead(ctx.env.MONITOR_R2, 'expected-reasoning/qualificador/fit-estrategico.md')) ?? '';

  const { data } = await session.skill('qualificar-lead', {
    args: { lead, objective_tier: tier, gabarito },
    schema: QualificarLeadOutputSchema,
  });

  return data;
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add .flue/agents/qualificador.ts
git commit -m "feat(agent): qualificador instanciado (não disparado no loop POC)"
```

---

### Task 7.2: Agente monitor (orquestrador principal)

**Files:**
- Create: `.flue/agents/monitor.ts`

- [ ] **Step 1: Implementar orquestrador**

```ts
// .flue/agents/monitor.ts
import type { FlueContext } from '@flue/sdk/client';
import * as v from 'valibot';
import {
  DetectDivergencesOutputSchema,
  ClassifyOriginOutputSchema,
  SuggestAdjustmentOutputSchema,
  SummarizePatternsOutputSchema,
} from '@/schemas/skills';
import { computeBucketKey, isBucketTranquilo, pickRepresentatives } from '@/lib/bucketing';
import {
  detectOutOfScopeGrowth,
  detectRegression,
  detectBudgetBlow,
} from '@/lib/criteria';
import { fawRead, fawWrite } from '@/lib/faw';
import { createPR } from '@/lib/github';
import { sendTelegramAlert } from '@/lib/telegram';
import { shouldPromoteToFinding } from '@/lib/promotion';

export const triggers = { webhook: true };

type Env = {
  DB: D1Database;
  MONITOR_R2: R2Bucket;
  HMAC_SECRET: string;
  GITHUB_PAT: string;
  GITHUB_REPO: string;
  GITHUB_DEFAULT_BRANCH: string;
  TELEGRAM_BOT_TOKEN: string;
  TELEGRAM_CHAT_ID: string;
  CF_ACCOUNT_ID: string;
  CF_AI_GATEWAY_ID: string;
  JANELA_HORAS: string;
  BUCKET_K_REPRESENTATIVES: string;
  SAMPLE_MIN_PER_BUCKET: string;
};

export default async function (ctx: FlueContext): Promise<unknown> {
  const env = ctx.env as Env;
  const agentId = 'qualificador';
  const runId = `${new Date().toISOString().slice(0, 10)}-${crypto.randomUUID().slice(0, 8)}`;
  const janelaMs = parseInt(env.JANELA_HORAS) * 3600_000;
  const k = parseInt(env.BUCKET_K_REPRESENTATIVES);
  const minSample = parseInt(env.SAMPLE_MIN_PER_BUCKET);

  // 1. checkpoint
  const lastTsRow = await env.DB
    .prepare('SELECT last_processed_ts FROM audit_run WHERE agent_id = ?')
    .bind(agentId)
    .first<{ last_processed_ts: number }>();
  const fromTs = lastTsRow?.last_processed_ts ?? Date.now() - janelaMs;
  const toTs = Date.now();

  // 2. candidates: out_of_scope OR contradição obj↔julg
  const candidates = await env.DB
    .prepare(
      `SELECT id, did, reasoned, out_of_scope, objective_tier, judgment_outcome, has_out_of_scope, cost_usd, duration_ms
       FROM decision_log
       WHERE agent_id = ? AND ts > ? AND ts <= ?
         AND (
           has_out_of_scope = 1
           OR (judgment_outcome = 'descartar' AND objective_tier = 'A')
           OR (judgment_outcome = 'priorizar' AND objective_tier = 'C')
         )`,
    )
    .bind(agentId, fromTs, toTs)
    .all<{
      id: string;
      did: string;
      reasoned: string;
      out_of_scope: string | null;
      objective_tier: 'A' | 'B' | 'C';
      judgment_outcome: 'priorizar' | 'manter' | 'descartar';
      has_out_of_scope: 0 | 1;
      cost_usd: number;
      duration_ms: number;
    }>();

  if (!candidates.results || candidates.results.length === 0) {
    await updateCheckpoint(env, agentId, toTs);
    return { run_id: runId, status: 'no-candidates' };
  }

  // 3. bucketing
  const buckets = new Map<string, typeof candidates.results>();
  for (const c of candidates.results) {
    if (isBucketTranquilo(c.judgment_outcome, c.objective_tier, c.has_out_of_scope)) continue;
    const key = computeBucketKey(c.judgment_outcome, c.objective_tier, c.has_out_of_scope);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(c);
  }

  const bucketEntries = [...buckets.entries()].filter(([, items]) => items.length >= minSample);

  if (bucketEntries.length === 0) {
    await updateCheckpoint(env, agentId, toTs);
    return { run_id: runId, status: 'no-suspicious-buckets' };
  }

  // 4. critérios SQL
  const sqlCriteria = await runSqlCriteria(env, agentId, fromTs, toTs);

  // 5. setup Flue session
  const harness = await ctx.init({
    model: env.MODEL_MAIN ?? '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    baseURL: env.CF_ACCOUNT_ID && env.CF_AI_GATEWAY_ID
      ? `https://gateway.ai.cloudflare.com/v1/${env.CF_ACCOUNT_ID}/${env.CF_AI_GATEWAY_ID}/workers-ai`
      : undefined,
    role: 'auditor-monitor',
  });
  const session = await harness.session();

  // 6. carrega gabarito + active findings
  const gabarito = (await fawRead(env.MONITOR_R2, 'expected-reasoning/qualificador/fit-estrategico.md')) ?? '';
  // active_findings simplificado pra POC — list pasta findings/qualificador/, parse frontmatter status: active
  // (pra MVP, passamos array vazio)
  const activeFindings: unknown[] = [];

  // 7. detect-divergences nos representantes (paralelo)
  const allDivergences: Array<{
    decision_id: string;
    heuristic_ignored: string;
    evidence: string;
    severity: 'low' | 'med' | 'high';
    bucket_key: string;
    bucket_size: number;
    representatives_audited: number;
  }> = [];

  await Promise.all(
    bucketEntries.map(async ([bucketKey, items]) => {
      const reps = pickRepresentatives(items, k, hashSeed(runId + bucketKey));
      const detections = await Promise.all(
        reps.map(async (rep) => {
          try {
            const { data } = await session.skill('monitor/detect-divergences', {
              args: { decision: rep, gabarito, active_findings: activeFindings },
              schema: DetectDivergencesOutputSchema,
            });
            return { rep, data };
          } catch {
            return null;
          }
        }),
      );
      for (const det of detections) {
        if (!det) continue;
        for (const div of det.data.divergences) {
          allDivergences.push({
            decision_id: det.rep.id,
            heuristic_ignored: div.heuristic_ignored,
            evidence: div.evidence,
            severity: div.severity,
            bucket_key: bucketKey,
            bucket_size: items.length,
            representatives_audited: reps.length,
          });
        }
      }
    }),
  );

  // 8. dedup por (heuristic_ignored, bucket_key)
  const dedupMap = new Map<string, typeof allDivergences[number]>();
  for (const d of allDivergences) {
    const k = `${d.heuristic_ignored}|${d.bucket_key}`;
    if (!dedupMap.has(k)) dedupMap.set(k, d);
  }
  const uniqueDivergences = [...dedupMap.values()];

  // 9. classify-origin + suggest-adjustment (paralelo)
  const classifications = await Promise.all(
    uniqueDivergences.map(async (div) => {
      try {
        const { data: origin } = await session.skill('monitor/classify-origin', {
          args: { divergencia: div, gabarito },
          schema: ClassifyOriginOutputSchema,
        });
        if (origin.target === 'inconclusive') return { div, origin, suggestion: null };
        const targetFile = targetToFile(origin.target);
        const currentContent = (await fawRead(env.MONITOR_R2, targetFile)) ?? '';
        const { data: suggestion } = await session.skill('monitor/suggest-adjustment', {
          args: { divergencia: { ...div, target: origin.target }, current_content: currentContent },
          schema: SuggestAdjustmentOutputSchema,
        });
        return { div, origin, suggestion };
      } catch {
        return null;
      }
    }),
  );

  // 10. summarize-patterns (1 chamada)
  let patterns: v.InferOutput<typeof SummarizePatternsOutputSchema> = { patterns: [], cross_bucket_signal: null };
  if (uniqueDivergences.length > 0) {
    try {
      const { data } = await session.skill('monitor/summarize-patterns', {
        args: { divergences: uniqueDivergences, active_findings: activeFindings },
        schema: SummarizePatternsOutputSchema,
      });
      patterns = data;
    } catch {
      /* ignore */
    }
  }

  // 11. determinar severidade e gerar artefatos
  const severity = computeSeverity(patterns, sqlCriteria);
  const analysis = renderAnalysis({ runId, fromTs, toTs, candidates: candidates.results.length, bucketEntries, sqlCriteria, severity });
  const proposal = renderProposal(classifications.filter(Boolean) as Array<NonNullable<typeof classifications[number]>>);
  const divergenciasJson = JSON.stringify(uniqueDivergences, null, 2);

  // 12. R2: salvar artefatos do run
  const datePrefix = new Date(toTs).toISOString().slice(0, 10);
  await fawWrite(env.MONITOR_R2, `decisions/${datePrefix}/${runId}/analysis.md`, analysis);
  await fawWrite(env.MONITOR_R2, `decisions/${datePrefix}/${runId}/proposal.md`, proposal);
  await fawWrite(env.MONITOR_R2, `decisions/${datePrefix}/${runId}/divergencias.json`, divergenciasJson);

  // 13. PR + Telegram (se severidade adequada)
  let prUrl: string | null = null;
  if (severity !== 'info') {
    try {
      prUrl = await createPR(
        { pat: env.GITHUB_PAT, repo: env.GITHUB_REPO, defaultBranch: env.GITHUB_DEFAULT_BRANCH },
        {
          branch: `monitor/${runId}`,
          title: `monitor: ${severity} em ${agentId}/fit-estrategico (run ${runId})`,
          body: prBody({ runId, severity, analysis, proposal }),
          files: [
            { path: `monitor-runs/${runId}/analysis.md`, content: analysis },
            { path: `monitor-runs/${runId}/proposal.md`, content: proposal },
            { path: `monitor-runs/${runId}/divergencias.json`, content: divergenciasJson },
          ],
        },
      );
    } catch (err) {
      console.error(JSON.stringify({ op: 'createPR', err: err instanceof Error ? err.message : String(err) }));
    }
  }
  if (severity === 'critical' && prUrl) {
    await sendTelegramAlert(
      { botToken: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID },
      `🚨 Monitor gabarito: ${agentId}/fit-estrategico\nRun ${runId.slice(-8)}\nSeveridade: critical\nPadrões: ${patterns.patterns.length}\nPR: ${prUrl}`,
    );
  }

  // 14. checkpoint
  await updateCheckpoint(env, agentId, toTs);

  return { run_id: runId, severity, divergences: uniqueDivergences.length, pr: prUrl };
}

// helpers locais (mantidos no agent.ts pra simplicidade do POC)

async function updateCheckpoint(env: Env, agentId: string, ts: number): Promise<void> {
  await env.DB
    .prepare('INSERT OR REPLACE INTO audit_run (agent_id, last_processed_ts) VALUES (?, ?)')
    .bind(agentId, ts)
    .run();
}

function targetToFile(target: 'prompt-issue' | 'gabarito-stale' | 'criterio-faltando' | 'contexto-mudou'): string {
  switch (target) {
    case 'prompt-issue': return '.flue/skills/qualificador/qualificar-lead/SKILL.md';
    case 'gabarito-stale': return 'expected-reasoning/qualificador/fit-estrategico.md';
    case 'criterio-faltando': return 'agents-config/qualificador/criterios-icp.md';
    case 'contexto-mudou': return 'agents-config/qualificador/contexto-momento.md';
  }
}

async function runSqlCriteria(env: Env, agentId: string, fromTs: number, toTs: number) {
  const window = await env.DB.prepare(
    `SELECT
       AVG(cost_usd) as avg_cost,
       AVG(duration_ms) as avg_duration,
       SUM(CASE WHEN has_out_of_scope = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as oos_pct,
       SUM(CASE WHEN (judgment_outcome = 'descartar' AND objective_tier = 'A')
                  OR (judgment_outcome = 'priorizar' AND objective_tier = 'C') THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as contra_rate
     FROM decision_log WHERE agent_id = ? AND ts > ? AND ts <= ?`,
  ).bind(agentId, fromTs, toTs).first<{ avg_cost: number; avg_duration: number; oos_pct: number; contra_rate: number }>();

  // baseline simplificado: janela anterior do mesmo tamanho
  const sizeMs = toTs - fromTs;
  const baseline = await env.DB.prepare(
    `SELECT
       AVG(cost_usd) as avg_cost,
       SUM(CASE WHEN has_out_of_scope = 1 THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as oos_pct,
       SUM(CASE WHEN (judgment_outcome = 'descartar' AND objective_tier = 'A')
                  OR (judgment_outcome = 'priorizar' AND objective_tier = 'C') THEN 1 ELSE 0 END) * 1.0 / COUNT(*) as contra_rate
     FROM decision_log WHERE agent_id = ? AND ts > ? AND ts <= ?`,
  ).bind(agentId, fromTs - sizeMs, fromTs).first<{ avg_cost: number; oos_pct: number; contra_rate: number }>();

  return {
    out_of_scope_growth: detectOutOfScopeGrowth({ current_pct: window?.oos_pct ?? 0, previous_pct: baseline?.oos_pct ?? 0 }),
    regression: detectRegression({ current_rate: window?.contra_rate ?? 0, baseline_rate: baseline?.contra_rate ?? 0 }),
    budget_blow: detectBudgetBlow({ current_avg: window?.avg_cost ?? 0, baseline_avg: baseline?.avg_cost ?? 0 }),
  };
}

function computeSeverity(
  patterns: v.InferOutput<typeof SummarizePatternsOutputSchema>,
  sql: { out_of_scope_growth: { triggered: boolean }; regression: { triggered: boolean }; budget_blow: { triggered: boolean } },
): 'critical' | 'warn' | 'info' {
  if (patterns.cross_bucket_signal) return 'critical';
  for (const p of patterns.patterns) {
    if (p.promotion_recommendation === 'finding' && shouldPromoteToFinding({
      distinct_buckets_count: p.affected_buckets.length,
      max_bucket_size: Math.ceil(p.inferred_decisions / Math.max(1, p.affected_buckets.length)),
      confidence: p.confidence,
    })) return 'critical';
  }
  if (sql.out_of_scope_growth.triggered || sql.regression.triggered) return 'warn';
  if (sql.budget_blow.triggered) return 'info';
  return 'info';
}

function renderAnalysis(input: {
  runId: string;
  fromTs: number;
  toTs: number;
  candidates: number;
  bucketEntries: Array<[string, unknown[]]>;
  sqlCriteria: ReturnType<typeof Object>;
  severity: string;
}): string {
  return `# Run ${input.runId}\n\nWindow: ${new Date(input.fromTs).toISOString()} → ${new Date(input.toTs).toISOString()}\n\nCandidatos: ${input.candidates}\nBuckets ativos: ${input.bucketEntries.length}\nSeveridade: **${input.severity}**\n`;
}

function renderProposal(classifications: Array<{ div: { heuristic_ignored: string }; origin: { target: string; rationale: string }; suggestion: { target_file: string; proposed_change: string; rationale: string } | null }>): string {
  const lines: string[] = ['# Sugestões de Ajuste\n'];
  for (const c of classifications) {
    if (!c.suggestion) continue;
    lines.push(`## Heurístico ignorado: ${c.div.heuristic_ignored}`);
    lines.push(`**Target**: ${c.suggestion.target_file}`);
    lines.push(`**Origem**: ${c.origin.rationale}`);
    lines.push(`\n${c.suggestion.proposed_change}\n`);
    lines.push(`_Rationale_: ${c.suggestion.rationale}\n`);
  }
  return lines.join('\n');
}

function prBody(input: { runId: string; severity: string; analysis: string; proposal: string }): string {
  return `## Run ${input.runId}\n\nSeveridade: **${input.severity}**\n\n${input.analysis}\n\n---\n\n${input.proposal}\n\n---\n\nArtefatos completos em \`monitor-runs/${input.runId}/\`.`;
}

function hashSeed(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add .flue/agents/monitor.ts
git commit -m "feat(agent): monitor orquestrador com pipeline completo"
```

---

### Task 7.3: Agente gerador (endpoint pra disparar synthetic)

**Files:**
- Create: `.flue/agents/qualificador-generator.ts`

- [ ] **Step 1: Implementar wrapper que dispara o gerador**

```ts
// .flue/agents/qualificador-generator.ts
import type { FlueContext } from '@flue/sdk/client';
import { generateRun, pickModeForHour } from '@/lib/synthetic-generator';
import leads from '../../fixtures/leads.json';
import scenarios from '../../fixtures/scenarios.json';

export const triggers = { webhook: true };

type Env = {
  DB: D1Database;
  HMAC_SECRET: string;
  MODEL_MAIN?: string;
};

export default async function (ctx: FlueContext): Promise<unknown> {
  const env = ctx.env as Env;
  const now = new Date();
  const hour = now.getUTCHours();
  const mode = pickModeForHour(scenarios as Array<{ from_hour: number; to_hour: number; mode: 'baseline' | 'drift-h1' | 'drift-multi' | 'high-budget' }>, hour);
  const result = await generateRun(
    env,
    leads as Parameters<typeof generateRun>[1],
    mode,
    env.MODEL_MAIN ?? '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    10,
  );
  return { mode, ...result };
}
```

- [ ] **Step 2: Typecheck**

```bash
npm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add .flue/agents/qualificador-generator.ts
git commit -m "feat(agent): qualificador-generator (substitui agente real no POC)"
```

---

## Phase 8 — CI Workflows

> **NOTA monorepo**: workflows ficam em `.github/workflows/` **na raiz do monorepo `poc-flue`**, não dentro de `pocs/gabarito/`. GitHub Actions só lê de `.github/` raiz. Cada step roda da raiz; usar `cd pocs/gabarito` quando precisar do contexto do POC.

### Task 8.1: Sync R2

**Files** (relativos à raiz do monorepo):
- Create: `.github/workflows/gabarito-sync-r2.yml`

- [ ] **Step 1: Escrever workflow**

```yaml
name: gabarito — Sync expected-reasoning to R2

on:
  push:
    branches: [main]
    paths:
      - 'pocs/gabarito/expected-reasoning/**'

jobs:
  sync:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: pocs/gabarito
    steps:
      - uses: actions/checkout@v4
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      - name: Install wrangler
        run: npm install -g wrangler
      - name: Sync expected-reasoning to R2
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
        run: |
          for file in $(find expected-reasoning -name "*.md"); do
            key="${file}"
            wrangler r2 object put "gabarito-monitor/${key}" --file="${file}" --remote
          done
```

- [ ] **Step 2: Commit (da raiz do monorepo)**

```bash
cd ~/Desktop/dev/poc-flue
git add .github/workflows/gabarito-sync-r2.yml
git commit -m "ci(gabarito): workflow pra espelhar expected-reasoning pro R2"
```

---

### Task 8.2: Deploy

**Files** (relativos à raiz do monorepo):
- Create: `.github/workflows/gabarito-deploy.yml`

- [ ] **Step 1: Escrever workflow**

```yaml
name: gabarito — Deploy

on:
  push:
    branches: [main]
    paths:
      - 'pocs/gabarito/**'

jobs:
  deploy:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: pocs/gabarito
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npx flue build --target cloudflare
      - run: npx wrangler deploy
        env:
          CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
```

- [ ] **Step 2: Commit (da raiz do monorepo)**

```bash
cd ~/Desktop/dev/poc-flue
git add .github/workflows/gabarito-deploy.yml
git commit -m "ci(gabarito): workflow de deploy"
```

---

## Phase 9 — Verificação

### Task 9.1: Smoke script

**Files:**
- Create: `scripts/smoke.ts`

- [ ] **Step 1: Implementar**

```ts
// scripts/smoke.ts
// Roda 1 ciclo completo localmente — dispara gerador, dispara monitor, valida output
// Pré-requisito: `npm run dev` rodando em outra aba

const BASE = process.env.BASE_URL ?? 'http://localhost:3583';

async function main(): Promise<void> {
  console.log('1. Disparando gerador...');
  const genRes = await fetch(`${BASE}/agents/qualificador-generator`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!genRes.ok) throw new Error(`gerador falhou: ${genRes.status}`);
  const genData = await genRes.json();
  console.log('   →', genData);

  console.log('2. Disparando monitor...');
  const monRes = await fetch(`${BASE}/agents/monitor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!monRes.ok) throw new Error(`monitor falhou: ${monRes.status}`);
  const monData = await monRes.json();
  console.log('   →', monData);

  console.log('SMOKE OK');
}

main().catch((err) => {
  console.error('SMOKE FAIL:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Instalar tsx pra rodar TS direto**

```bash
npm install --save-dev tsx
```

- [ ] **Step 3: Rodar smoke (com `npm run dev` em outra aba)**

```bash
npm run smoke
```

Expected: prints do gerador + monitor sem erros, status final "SMOKE OK".

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke.ts package.json package-lock.json
git commit -m "test: smoke script ponta-a-ponta"
```

---

### Task 9.2: Replay script

**Files:**
- Create: `scripts/replay.ts`

- [ ] **Step 1: Implementar**

```ts
// scripts/replay.ts
// Reprocessa um run específico. Pra POC, força o monitor a rodar com janela específica.
const BASE = process.env.BASE_URL ?? 'http://localhost:3583';

async function main(): Promise<void> {
  const runId = process.argv[2];
  if (!runId) {
    console.error('Usage: npm run replay <run-id>');
    process.exit(1);
  }
  console.log(`Replay run ${runId}...`);
  const res = await fetch(`${BASE}/agents/monitor`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ replay: runId }),
  });
  console.log(await res.json());
}

main();
```

- [ ] **Step 2: Commit**

```bash
git add scripts/replay.ts
git commit -m "test: replay script (POC simplificado)"
```

---

## Phase 10 — Docs

### Task 10.1: README + ARCHITECTURE + VAULT-NOTES + CONTRIBUTING

**Files:**
- Create: `docs/README.md`
- Create: `docs/ARCHITECTURE.md`
- Create: `docs/VAULT-NOTES.md`
- Create: `docs/CONTRIBUTING.md`

- [ ] **Step 1: Escrever `docs/README.md`**

```md
# gabarito

Monitor autônomo de agentes em domínio de julgamento. POC educacional construído com Flue + Cloudflare Workers.

**Tese**: aplica literal a metodologia de Decision Log + Classificação de Ground Truth do vault, materializada em Flue como sistema agêntico que avalia outros sistemas agênticos e propõe ajustes via PR.

## Quickstart

```bash
npm install
cp .dev.vars.example .dev.vars  # preencher
npx wrangler d1 create gabarito-poc
npx wrangler r2 bucket create gabarito-monitor
npx wrangler d1 execute gabarito-poc --local --file=migrations/0001_init.sql
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
```

- [ ] **Step 2: Escrever `docs/ARCHITECTURE.md`** (resumo do spec)

```md
# Arquitetura

POC com 2 agentes Flue:
- `monitor` — orquestrador disparado por POST/cron, executa pipeline de auditoria
- `qualificador` — instanciado mas não disparado no loop (logs vêm do gerador sintético)
- `qualificador-generator` — endpoint que produz logs sintéticos no D1

Pipeline do monitor:
1. SQL filter + bucketing cartesiano (3×3×2=18, exclui 3 tranquilos)
2. K=3 representantes/bucket
3. detect-divergences (LLM, paralelo)
4. classify-origin → suggest-adjustment (LLM, paralelo, 1×por divergência)
5. summarize-patterns (LLM, 1×, agregado)
6. PR + Telegram (condicional severity)

Veja `docs/superpowers/specs/2026-05-11-gabarito-poc-design.md` pro design completo.
```

- [ ] **Step 3: Escrever `docs/VAULT-NOTES.md`** (literal §20 do spec)

(copiar tabela de notas com IDs e papel)

- [ ] **Step 4: Escrever `docs/CONTRIBUTING.md`**

```md
# Como estudar e estender

## Pra estudar o POC
- Leia o spec em `docs/superpowers/specs/`
- Leia ARCHITECTURE.md pra mapeamento de notas embutidas
- Rode `npm run smoke` e observe o pipeline ponta-a-ponta

## Pra estender
- Adicionar agente avaliado: criar `.flue/agents/<nome>.ts` + `.flue/skills/<nome>/`
- Adicionar critério novo: `src/lib/criteria.ts` + atualizar pipeline
- Adicionar tipo de target: schema em `src/schemas/skills.ts` + reference em `.flue/skills/monitor/classify-origin/references/`

## Princípios obrigatórios
- TypeScript strict, sem `any`
- 1 export principal por arquivo
- JSDoc em toda função exportada
- Comentários só pro PORQUÊ não-óbvio
- Defesa PII em todo insert
- Schema valibot na borda
```

- [ ] **Step 5: Commit**

```bash
git add docs/
git commit -m "docs: README + ARCHITECTURE + VAULT-NOTES + CONTRIBUTING"
```

---

## Phase 11 — Validação Final

### Task 11.1: Validação end-to-end

- [ ] **Step 1: Rodar typecheck completo**

```bash
npm run typecheck
```

Expected: sem erros.

- [ ] **Step 2: Rodar todos os testes**

```bash
npm test
```

Expected: todos os tests passam.

- [ ] **Step 3: Build**

```bash
npx flue build --target cloudflare
```

Expected: build sucesso, `.flue/dist/` populado.

- [ ] **Step 4: Smoke local**

```bash
# aba 1:
npm run dev

# aba 2:
npm run smoke
```

Expected: gerador insere ~10 decisions, monitor processa, retorna severity + run_id.

- [ ] **Step 5: Verificar D1 local**

```bash
npx wrangler d1 execute gabarito-poc --local --command="SELECT COUNT(*) FROM decision_log;"
```

Expected: count > 0.

- [ ] **Step 6: Verificar R2 local**

```bash
npx wrangler r2 object list gabarito-monitor --local | head
```

Expected: arquivos em `decisions/<date>/<run-id>/`.

- [ ] **Step 7: Tag de POC**

```bash
git tag poc-v0.1.0 -m "POC inicial gabarito"
```

- [ ] **Step 8: Push + PR pra main**

```bash
git push -u origin feat/gabarito-poc
gh pr create --title "feat: gabarito POC inicial" --body "Implementa POC conforme docs/superpowers/specs/2026-05-11-gabarito-poc-design.md"
```

---

## Self-Review do plano

**Spec coverage**:
- §1 Tese — coberto pela Phase 0-11 (POC inteiro)
- §2 Notas vault — referenciadas em commits e docs
- §3 Arquitetura macro — Phase 7 (agents) + 4 (synthetic)
- §4 Estrutura repo — Task 0.3
- §5 Stack — Tasks 0.1, 0.2
- §6.1 Agentes — Tasks 7.1, 7.2, 7.3
- §6.2 Schema D1 — Task 1.1
- §6.3 R2/FAW — Task 3.5
- §6.4 Critérios — Task 3.4
- §6.5 Bucketing — Task 3.3
- §6.6 Pipeline — Task 7.2 (orquestrador)
- §6.7 Mecânica de status — Task 3.9 (resolution.ts) **NOTA**: integração da resolution no pipeline do monitor.ts não foi feita explicitamente em Task 7.2 — adicionar como TODO da iteração v0.2 (POC inicial não persiste/lê findings ainda)
- §7 Skills — Tasks 5.2-5.6
- §8 Roles — Task 5.1
- §9 AGENTS.md — Task 0.3
- §10 Conteúdo seed — Task 6.1
- §11 Gerador sintético — Tasks 4.1, 4.2
- §12 PII 4 camadas — Tasks 3.1, 3.2 + integração no generator (4.2)
- §13 Saídas — Task 7.2 (renderAnalysis, renderProposal, prBody)
- §14 Erros — embutido no Task 7.2
- §15 Verificação — Tasks 9.1, 9.2
- §16 wrangler.toml — Task 0.2
- §17 .dev.vars — Task 0.2
- §18 Spike — Task 0.1
- §19 Princípios qualidade — aplicados ao longo (TS strict, JSDoc, naming)
- §20 Conexão vault — Task 10.1 (VAULT-NOTES.md)
- §21 Limitações — documentadas no spec, não viram tarefas

**Gaps identificados**:
- Mecânica de transição de status (active→resolved/stale) tem o `lib/resolution.ts` mas **não é chamada no pipeline do monitor v0.1**. POC v0.1 não lê/escreve findings persistentes — fica como TODO claro pra v0.2.
- Workflow `sync-r2` não testado em CI real — só configurado.

**Placeholder scan**:
- Task 6.1 Step 1 diz "(usar conteúdo literal do spec — copiando aqui pra não duplicar)" — placeholder leve. Justificativa: conteúdo já está no spec §10.1-10.3 verbatim, executor copia direto. Aceitável pra evitar duplicação massiva.
- Task 10.1 Step 3 diz "(copiar tabela de notas)" — placeholder leve, mesma justificativa.

**Type consistency**:
- `JudgmentOutcome`, `ObjectiveTier` definidos em Task 2.1, usados em 3.1, 3.3, 4.2, 7.2 — consistente.
- `DetectDivergencesOutputSchema` em 2.3, usado em 7.2 — consistente.
- `pseudonymize`, `defendPII`, `computeBucketKey`, `pickRepresentatives` — assinaturas batem entre definição e uso.
- Uma observação: `session.skill('monitor/detect-divergences', ...)` em 7.2 — paths de skill seguem convenção `<agente>/<skill-name>` documentada na §7 do spec. Consistente.

**Decisões pendentes pro spike (Task 0.1)**:
- Modelo concreto (Llama 3.3 70b é hipótese — a confirmar)
- baseURL via AI Gateway (Cenário C provável)
- Cron via wrangler.toml apenas (não Flue triggers)
