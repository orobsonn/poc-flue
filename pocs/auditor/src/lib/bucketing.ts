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
  let s = seed;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = indices[i] as number;
    indices[i] = indices[j] as number;
    indices[j] = tmp;
  }
  return indices.slice(0, k).map((i) => items[i] as T);
}
