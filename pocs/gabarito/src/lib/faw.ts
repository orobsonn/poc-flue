export type R2Like = {
  get: (key: string) => Promise<{ text: () => Promise<string> } | null>;
  put: (key: string, body: string) => Promise<unknown>;
  list: (opts: { prefix: string }) => Promise<{ objects: Array<{ key: string }> }>;
};

/** @description Lê markdown do FAW. Retorna null se não existir. */
export async function fawRead(r2: R2Like, key: string): Promise<string | null> {
  const obj = await r2.get(key);
  if (!obj) return null;
  return obj.text();
}

/** @description Escreve markdown no FAW. */
export async function fawWrite(r2: R2Like, key: string, content: string): Promise<void> {
  await r2.put(key, content);
}

/** @description Lista keys com prefix — equivalente a glob por path. */
export async function fawList(r2: R2Like, prefix: string): Promise<string[]> {
  const result = await r2.list({ prefix });
  return result.objects.map((o) => o.key);
}

/** @description Lê todos os arquivos sob um prefix. */
export async function fawReadAll(r2: R2Like, prefix: string): Promise<Map<string, string>> {
  const keys = await fawList(r2, prefix);
  const result = new Map<string, string>();
  await Promise.all(
    keys.map(async (key) => {
      const content = await fawRead(r2, key);
      if (content !== null) result.set(key, content);
    }),
  );
  return result;
}
