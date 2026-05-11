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
