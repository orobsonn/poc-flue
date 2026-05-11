---
paths:
  - "wrangler.toml"
  - "wrangler.jsonc"
  - "src/**/*.ts"
  - "worker/**/*.ts"
---

# Cloudflare Workers

Carrega em codigo Worker e config wrangler. Pareia com `~/.claude/rules/security.md` (secrets) e `~/.claude/rules/observability.md` (log).

## Conventions

### Bindings
- Bindings declarados em `wrangler.{toml,jsonc}` na raiz
- Apos adicionar/alterar binding: rodar `npx wrangler types` pra regerar `worker-configuration.d.ts`
- Sem `wrangler types` apos novo binding, `tsc --noEmit` falha — `env.<NOVO>` aparece como `any`
- Tipos do Env aumentados em `src/env.d.ts` quando preciso (interface `Cloudflare.Env`)

### Secrets vs vars
- `vars` em `wrangler.{toml,jsonc}` e PUBLICO — vai pro bundle. Apenas URL base, flags, IDs publicos
- Secrets reais via `wrangler secret put <NAME>` — ficam fora do bundle
- Local: `.dev.vars` (gitignored) com formato `KEY=valor` (sem aspas, sem espaco apos `=`)
- Cada secret novo: adicionar placeholder em `.dev.vars.example` e augmentar `Cloudflare.Env` em `src/env.d.ts`

### Entrypoint
- `src/index.ts` exporta default `{ fetch }` (ou `{ fetch, scheduled }`, etc.)
- Handler `fetch(request, env, ctx)` — env injetado pelo Workers, NUNCA importar de outro lugar
- `ctx.waitUntil(promise)` pra trabalho assincrono que continua apos response (log envio, cache warm)

### Fetch externo
- Sempre com timeout: `fetch(url, { signal: AbortSignal.timeout(5000) })`
- Erro upstream: capturar status + body truncado (max ~500 chars), nao propagar stack pro client
- Centralizar fetch externo em `src/lib/<servico>-client.ts` ou similar — handler nao bate fetch direto

### Scripts no `package.json`
- `dev`: `wrangler dev` (porta 8787 default)
- `deploy`: `wrangler deploy`
- `typecheck`: `tsc --noEmit`
- `test`: `vitest run`

### Plano Cloudflare
- Workers Free: suficiente pra projetos pequenos
- Workers Paid: necessario pra Worker Loader (Code Mode), Durable Objects sem KV fallback, alguns features avancados
- Custom domain em zone propria do account: necessario pra Cloudflare Access (nao funciona em `*.workers.dev`)

## Patterns

- **Entrypoint minimo**:
  ```typescript
  // src/index.ts
  /** @description Worker entrypoint. */
  export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
      const url = new URL(request.url);

      if (url.pathname === "/health") {
        return Response.json({ ok: true });
      }

      try {
        return await handleRequest(request, env, ctx);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(JSON.stringify({ op: "fetch", path: url.pathname, message }));
        return Response.json({ error: "Internal" }, { status: 500 });
      }
    },
  } satisfies ExportedHandler<Env>;
  ```

- **Cliente HTTP de servico externo**:
  ```typescript
  // src/lib/<servico>-client.ts
  /** @description Cliente HTTP de <servico> com header X-API-Key. */
  export class ServicoError extends Error {
    constructor(message: string, public readonly status?: number, public readonly body?: string) {
      super(message);
      this.name = "ServicoError";
    }
  }

  export async function servicoGet<T>(env: Env, path: string, query?: Record<string, string>): Promise<T> {
    const url = new URL(path, env.SERVICO_BASE_URL);
    if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);

    const res = await fetch(url, {
      headers: { "X-API-Key": env.SERVICO_API_KEY },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new ServicoError(`GET ${path} → ${res.status}`, res.status, body.slice(0, 500));
    }
    return res.json() as Promise<T>;
  }
  ```

- **Augmentar `Env` com secret novo**:
  ```typescript
  // src/env.d.ts
  declare global {
    namespace Cloudflare {
      interface Env {
        SERVICO_BASE_URL: string;
        SERVICO_API_KEY: string;
      }
    }
  }
  export {};
  ```

- **`.dev.vars.example`**:
  ```
  SERVICO_BASE_URL=https://api.servico.com
  SERVICO_API_KEY=replace-me
  ```

## Gotchas

- **`wrangler types` esquecido apos binding novo**: `env.<NOVO>` vira `any` silenciosamente. Rodar SEMPRE apos mexer em `wrangler.{toml,jsonc}`
- **`vars` em vez de secret**: `vars` e publico (entra no bundle final). Sempre `wrangler secret put` pra dado sensivel
- **`.dev.vars` com espaco apos `=`**: `KEY = valor` nao funciona — tem que ser `KEY=valor` colado
- **`fetch` sem timeout**: upstream travado paralisa o Worker (request count cresce). `AbortSignal.timeout(ms)` sempre
- **Body de Response sem `await`**: `res.json()` retorna Promise. Esquecer `await` retorna `Promise` no shape
- **`code: 10195` no deploy**: Worker Loader / Dynamic Workers exige plano Workers Paid. Upgrade no dashboard, propaga 5-30min
- **Custom domain em `*.workers.dev`**: Access nao liga ali. Pra proteger, precisa zone propria
- **`Cloudflare.Env` global vs Env tipado por handler**: SDK exporta `ExportedHandler<Env>` — usar pra ter type-checking no entrypoint
- **`ctx.waitUntil` sem catch**: erro silencioso. Sempre `.catch(err => console.error(...))` na promise passada
- **`globalOutbound` em sandbox de Worker Loader**: deixar em `null` (default) — codigo carregado nao pode fazer fetch externo. So abrir se ha justificativa documentada
