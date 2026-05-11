const GITHUB_API = 'https://api.github.com';

export type GitHubConfig = {
  pat: string;
  repo: string;
  defaultBranch: string;
};

export type CreatePRInput = {
  branch: string;
  title: string;
  body: string;
  files: Array<{ path: string; content: string }>;
};

/** @description Cria branch a partir do default, commita arquivos, abre PR. */
export async function createPR(cfg: GitHubConfig, input: CreatePRInput): Promise<string> {
  const refRes = await ghFetch(cfg, `/repos/${cfg.repo}/git/refs/heads/${cfg.defaultBranch}`);
  const refObject = refRes.object as { sha: string };
  const baseSha = refObject.sha;

  await ghFetch(cfg, `/repos/${cfg.repo}/git/refs`, {
    method: 'POST',
    body: { ref: `refs/heads/${input.branch}`, sha: baseSha },
  });

  const tree = await Promise.all(
    input.files.map(async (f) => {
      const blob = await ghFetch(cfg, `/repos/${cfg.repo}/git/blobs`, {
        method: 'POST',
        body: { content: f.content, encoding: 'utf-8' },
      });
      return { path: f.path, mode: '100644', type: 'blob', sha: blob.sha as string };
    }),
  );
  const treeRes = await ghFetch(cfg, `/repos/${cfg.repo}/git/trees`, {
    method: 'POST',
    body: { base_tree: baseSha, tree },
  });

  const commitRes = await ghFetch(cfg, `/repos/${cfg.repo}/git/commits`, {
    method: 'POST',
    body: {
      message: input.title,
      tree: treeRes.sha,
      parents: [baseSha],
    },
  });

  await ghFetch(cfg, `/repos/${cfg.repo}/git/refs/heads/${input.branch}`, {
    method: 'PATCH',
    body: { sha: commitRes.sha, force: false },
  });

  const pr = await ghFetch(cfg, `/repos/${cfg.repo}/pulls`, {
    method: 'POST',
    body: {
      title: input.title,
      head: input.branch,
      base: cfg.defaultBranch,
      body: input.body,
    },
  });

  return pr.html_url as string;
}

async function ghFetch(
  cfg: GitHubConfig,
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<Record<string, unknown>> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${cfg.pat}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'auditor-poc',
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = (await res.text()).slice(0, 500);
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }
  return (await res.json()) as Record<string, unknown>;
}
