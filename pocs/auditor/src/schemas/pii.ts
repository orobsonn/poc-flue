/** @description Regex de telefones brasileiros (com ou sem máscara). */
const PHONE_BR = /\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}/;
/** @description Regex de emails. */
const EMAIL = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
/** @description Regex de CPF formatado. */
const CPF = /\d{3}\.\d{3}\.\d{3}-\d{2}/;
/** @description Regex de CNPJ formatado. */
const CNPJ = /\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/;
/** @description Regex de valor monetário específico em R$. */
const VALOR_BRL = /R\$\s?\d{1,3}(\.\d{3})*,\d{2}/;

const PII_PATTERNS = [PHONE_BR, EMAIL, CPF, CNPJ, VALOR_BRL];

/** @description Detecta padrões de PII brasileira em texto livre. */
export function containsPII(text: string): boolean {
  return PII_PATTERNS.some((re) => re.test(text));
}

/** @description Substitui padrões de PII por placeholders genéricos. */
export function sanitizePII(text: string): string {
  return text
    .replace(PHONE_BR, '[TELEFONE]')
    .replace(EMAIL, '[EMAIL]')
    .replace(CPF, '[CPF]')
    .replace(CNPJ, '[CNPJ]')
    .replace(VALOR_BRL, '[VALOR]');
}
