import { describe, it, expect } from 'vitest';
import { containsPII, sanitizePII } from './pii';

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
  it('sanitiza email', () => {
    expect(sanitizePII('mande pra fulano@empresa.com')).toBe('mande pra [EMAIL]');
  });
});
