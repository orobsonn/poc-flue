import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DO_BASE = join(ROOT, 'dist/.wrangler/state/v3/do');
const R2_METADATA_BASE = join(ROOT, 'dist/.wrangler/state/v3/r2/miniflare-R2BucketObject');
const R2_BLOBS_BASE = join(ROOT, 'dist/.wrangler/state/v3/r2/auditor/blobs');
const OUT_DIR = join(ROOT, 'traces');

type SessionRow = { id: string; data: string; updated_at: number };
type R2Object = { key: string; blobId: string | null };

function sqlite(dbPath: string, query: string): string {
  return execFileSync('sqlite3', [dbPath, query], { encoding: 'utf8' });
}

function listDoSqlites(agentName: string): string[] {
  const dir = join(DO_BASE, `auditor-${agentName}`);
  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite')
      .map((f) => join(dir, f));
  } catch {
    return [];
  }
}

/** @description Encontra a sqlite com indexação de objetos R2 (não metadata.sqlite). */
function findR2ObjectsDb(): string | null {
  try {
    const files = readdirSync(R2_METADATA_BASE);
    const obj = files.find((f) => f.endsWith('.sqlite') && f !== 'metadata.sqlite');
    return obj ? join(R2_METADATA_BASE, obj) : null;
  } catch {
    return null;
  }
}

/** @description Lê o blob R2 dado o blobId. Miniflare guarda em `r2/<bucket>/blobs/<blobId>`. */
function readR2Blob(blobId: string): string | null {
  const blobPath = join(R2_BLOBS_BASE, blobId);
  try {
    return readFileSync(blobPath, 'utf8');
  } catch {
    return null;
  }
}

/** @description Busca sessions Flue cujo `id` contém o runId — varre todas as DO sqlite do AuditorAgentic. */
function findSessions(runId: string): Array<{ source: string; row: SessionRow }> {
  const dbs = listDoSqlites('AuditorAgentic');
  const hits: Array<{ source: string; row: SessionRow }> = [];
  for (const db of dbs) {
    const out = sqlite(
      db,
      `SELECT id, data, updated_at FROM flue_sessions WHERE id LIKE '%${runId}%' ORDER BY updated_at`,
    );
    for (const line of out.split('\n').filter(Boolean)) {
      const firstPipe = line.indexOf('|');
      const lastPipe = line.lastIndexOf('|');
      if (firstPipe < 0 || lastPipe === firstPipe) continue;
      hits.push({
        source: db,
        row: {
          id: line.slice(0, firstPipe),
          data: line.slice(firstPipe + 1, lastPipe),
          updated_at: parseInt(line.slice(lastPipe + 1), 10),
        },
      });
    }
  }
  return hits;
}

/** @description Classifica session id em kind + decision_id. */
function classifySession(sessionId: string): { kind: string; decision_id: string | null } {
  if (sessionId.includes('"main-')) return { kind: 'main', decision_id: null };
  if (sessionId.includes('"summarize-')) return { kind: 'summarize', decision_id: null };
  const detectMatch = sessionId.match(/"detect-([a-z0-9-]+?)-2026/);
  if (detectMatch && detectMatch[1]) return { kind: 'detect', decision_id: detectMatch[1] };
  if (sessionId.includes('"classify-')) return { kind: 'classify', decision_id: null };
  if (sessionId.includes('"suggest-')) return { kind: 'suggest', decision_id: null };
  return { kind: 'unknown', decision_id: null };
}

/** @description Lista objetos R2 que contém runId no key + lê o conteúdo. */
function readR2ForRun(runId: string): { metrics: unknown; artifacts: Record<string, string> } {
  const db = findR2ObjectsDb();
  if (!db) return { metrics: null, artifacts: {} };
  const out = sqlite(db, `SELECT key, blob_id FROM _mf_objects WHERE key LIKE '%${runId}%';`);
  const objects: R2Object[] = out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const i = line.indexOf('|');
      return { key: line.slice(0, i), blobId: line.slice(i + 1) || null };
    });

  let metrics: unknown = null;
  const artifacts: Record<string, string> = {};
  for (const obj of objects) {
    if (!obj.blobId) continue;
    const content = readR2Blob(obj.blobId);
    if (content === null) continue;
    if (obj.key.endsWith('/metrics.json')) {
      try { metrics = JSON.parse(content); } catch { /* keep null */ }
    } else {
      const basename = obj.key.split('/').slice(-1)[0] ?? obj.key;
      artifacts[basename] = content;
    }
  }
  return { metrics, artifacts };
}

async function main(): Promise<void> {
  const runId = process.argv[2];
  if (!runId) {
    console.error('Uso: tsx scripts/export-trace.ts <runId>');
    console.error('Ex: tsx scripts/export-trace.ts 2026-05-12-agentic-ab7e8b5d');
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });

  const sessionHits = findSessions(runId);
  if (sessionHits.length === 0) {
    console.error(`Nenhuma session encontrada pro runId "${runId}". DOs varridos: ${DO_BASE}/auditor-AuditorAgentic/`);
    process.exit(2);
  }

  const sessions = sessionHits.map(({ row }) => {
    const meta = classifySession(row.id);
    let parsed: unknown = null;
    try { parsed = JSON.parse(row.data); } catch { /* leave null */ }
    return {
      id: row.id,
      kind: meta.kind,
      decision_id: meta.decision_id,
      updated_at: row.updated_at,
      data: parsed,
    };
  });

  const r2 = readR2ForRun(runId);

  // agent_id_url = primeiro elemento da tupla na session id principal
  const mainSession = sessions.find((s) => s.kind === 'main');
  const agentIdUrl = (() => {
    if (!mainSession) return null;
    const m = mainSession.id.match(/\["([^"]+)"/);
    return m?.[1] ?? null;
  })();

  const bundle = {
    run_id: runId,
    agent_id_url: agentIdUrl,
    exported_at: new Date().toISOString(),
    metrics: r2.metrics,
    artifacts: r2.artifacts,
    session_count: sessions.length,
    sessions,
  };

  const outPath = join(OUT_DIR, `${runId}.json`);
  writeFileSync(outPath, JSON.stringify(bundle, null, 2));
  const sizeKb = (JSON.stringify(bundle).length / 1024).toFixed(1);
  console.log(`Exportado: ${outPath} (${sizeKb} KB, ${sessions.length} sessions)`);
}

main().catch((err) => {
  console.error('export-trace falhou:', err);
  process.exit(1);
});

export {};
