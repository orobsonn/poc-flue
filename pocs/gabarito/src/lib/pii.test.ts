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
    const result = defendPII({ reasoned: 'texto sem PII detectada' });
    expect(result.ok).toBe(true);
  });
});
