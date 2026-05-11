const BASE = process.env.BASE_URL ?? 'http://localhost:3583';

/** @description Smoke test ponta-a-ponta — gera + audita. Pré-req: npm run dev rodando. */
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
