const BASE = process.env.BASE_URL ?? 'http://localhost:3583';

/** @description Replay de um run específico — força monitor a reprocessar. */
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

export {};
