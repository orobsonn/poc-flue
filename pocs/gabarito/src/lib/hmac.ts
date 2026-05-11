/** @description HMAC-SHA256 truncado em 16 chars hex pra pseudonimização determinística. */
export async function pseudonymize(input: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(input));
  const bytes = new Uint8Array(sig);
  return Array.from(bytes)
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
