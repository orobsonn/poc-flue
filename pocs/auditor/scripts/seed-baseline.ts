const BASE = process.env.BASE_URL ?? 'http://localhost:3583';

/**
 * @description Dispara o gerador 2× pra popular janela anterior + janela atual antes do smoke.
 *
 * Contexto: `runSqlCriteria` no monitor compara a janela atual com a anterior (de mesmo
 * tamanho). No primeiro run não há janela anterior → baselines = 0 → `detectRegression`
 * e `detectBudgetBlow` retornam `triggered: false` mesmo com sinal real.
 *
 * Esta seed dispara o gerador duas vezes em sequência. Para uma baseline com backdating
 * real, o fluxo do POC depende de rodar o monitor após duas invocações em janelas
 * distintas (o run anterior vira baseline do próximo).
 */
async function main(): Promise<void> {
  const ts = Date.now();
  console.log('1. Populando baseline (janela anterior)...');
  const r1 = await fetch(`${BASE}/agents/qualificador-generator/seed-baseline-${ts}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!r1.ok) throw new Error(`baseline gen falhou: ${r1.status}`);
  console.log('   →', await r1.json());

  await new Promise((resolve) => setTimeout(resolve, 1000));

  console.log('2. Populando janela atual...');
  const r2 = await fetch(`${BASE}/agents/qualificador-generator/seed-current-${ts}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });
  if (!r2.ok) throw new Error(`current gen falhou: ${r2.status}`);
  console.log('   →', await r2.json());

  console.log('SEED OK');
}

main().catch((err) => {
  console.error('SEED FAIL:', err);
  process.exit(1);
});

export {};
