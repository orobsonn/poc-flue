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
