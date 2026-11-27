import { AppError, ERROR_CODES } from '../utils/errors.js';

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com';
const DEFAULT_CONCURRENCY = 16;
const MAX_RETRIES = 2;

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new AppError(ERROR_CODES.ABORTED, 'Aborted'));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(new AppError(ERROR_CODES.ABORTED, 'Aborted'));
      },
      { once: true }
    );
  });
}

function buildGitHubHeaders(token) {
  const headers = {
    Accept: 'application/vnd.github+json',
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function parseRateLimitReset(response) {
  const resetEpoch = response.headers.get('X-RateLimit-Reset');
  if (!resetEpoch) return '';
  const ts = Number(resetEpoch) * 1000;
  if (!Number.isFinite(ts) || ts <= 0) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function encodeGitHubPath(path) {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/**
 * Decodes GitHub base64 blob content cleanly into UTF-8 text.
 */
export function decodeBase64Utf8(base64Str) {
  const clean = (base64Str || '').replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
}

async function fetchWithRetry(url, options = {}, { retries = MAX_RETRIES, signal } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) {
      throw new AppError(ERROR_CODES.ABORTED, 'Request aborted');
    }

    let response;
    try {
      response = await fetch(url, { ...options, signal });
    } catch (err) {
      if (err?.name === 'AbortError') {
        throw new AppError(ERROR_CODES.ABORTED, 'Request aborted');
      }
      lastError = new AppError(ERROR_CODES.NETWORK_ERROR, err?.message || 'Network request failed');
      if (attempt < retries) {
        await sleep(350 * Math.pow(2, attempt) + Math.random() * 150, signal);
        continue;
      }
      throw lastError;
    }

    if (response.ok) {
      return response;
    }

    const remaining = response.headers.get('X-RateLimit-Remaining');
    const retryAfterSec = Number(response.headers.get('Retry-After') || 0);

    // Retry transient server errors or short secondary rate limits
    if ((response.status >= 500 || response.status === 429) && attempt < retries) {
      const waitMs =
        retryAfterSec > 0 && retryAfterSec <= 8
          ? retryAfterSec * 1000
          : 450 * Math.pow(2, attempt) + Math.random() * 200;
      await sleep(waitMs, signal);
      continue;
    }

    if (response.status === 401) {
      throw new AppError(ERROR_CODES.PRIVATE_OR_UNAUTHORIZED, 'GitHub authentication failed (401).');
    }

    if (response.status === 403 || response.status === 429) {
      if (remaining === '0' || response.status === 429) {
        throw new AppError(ERROR_CODES.GITHUB_RATE_LIMIT, 'GitHub API rate limit exceeded.', {
          resetAt: parseRateLimitReset(response),
        });
      }
      throw new AppError(ERROR_CODES.PRIVATE_OR_UNAUTHORIZED, 'GitHub access forbidden (403).');
    }

    if (response.status === 404) {
      throw new AppError(ERROR_CODES.REPO_NOT_FOUND, 'GitHub resource not found (404).');
    }

    throw new AppError(ERROR_CODES.UNKNOWN, `GitHub API returned status ${response.status}.`);
  }

  throw lastError || new AppError(ERROR_CODES.UNKNOWN, 'GitHub request failed.');
}

/**
 * Fetches the authenticated user's private repositories using a GitHub token.
 */
export async function fetchUserPrivateRepos({ token, signal }) {
  if (!token) return [];
  const allPrivate = [];
  const MAX_PAGES = 3;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${GITHUB_API_BASE}/user/repos?visibility=private&per_page=100&sort=updated&page=${page}`;
    const res = await fetchWithRetry(url, { headers: buildGitHubHeaders(token) }, { signal });
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;

    for (const r of data) {
      if (r.private) {
        allPrivate.push({
          id: r.id,
          name: r.name,
          fullName: r.full_name,
          url: r.html_url,
          description: r.description || '',
          language: r.language || '',
          defaultBranch: r.default_branch || 'main',
          updatedAt: r.updated_at,
          isPrivate: true,
        });
      }
    }

    if (data.length < 100) break;
  }

  return allPrivate;
}

/**
 * Fetches repository metadata (`default_branch`, `private`, `description`, etc.).
 */
export async function fetchRepoMetadata({ owner, repo, token, signal }) {
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  try {
    const res = await fetchWithRetry(url, { headers: buildGitHubHeaders(token) }, { signal });
    return await res.json();
  } catch (err) {
    if (err.code === ERROR_CODES.REPO_NOT_FOUND) {
      throw new AppError(ERROR_CODES.REPO_NOT_FOUND, err.message, {
        target: `${owner}/${repo}`,
      });
    }
    throw err;
  }
}

/**
 * Fetches the full recursive file tree for a repository branch.
 * Handles `truncated: true` on massive repos by traversing subdirectories via `/git/trees/:sha`.
 */
export async function fetchRepoTree({ owner, repo, branch, token, signal }) {
  const headers = buildGitHubHeaders(token);
  const encodedBranch = encodeGitHubPath(branch);
  const treeUrl = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodedBranch}?recursive=1`;

  let data;
  try {
    const res = await fetchWithRetry(treeUrl, { headers }, { signal });
    data = await res.json();
  } catch (err) {
    if (err.code === ERROR_CODES.REPO_NOT_FOUND) {
      throw new AppError(ERROR_CODES.REPO_NOT_FOUND, err.message, {
        target: `${owner}/${repo}@${branch}`,
      });
    }
    throw err;
  }

  if (!data?.truncated) {
    return Array.isArray(data?.tree) ? data.tree : [];
  }

  // Fallback for huge repos where GitHub truncates recursive=1: breadth-first tree traversal
  const rootUrl = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodedBranch}`;
  const rootRes = await fetchWithRetry(rootUrl, { headers }, { signal });
  const rootData = await rootRes.json();

  const collected = [];
  const queue = (rootData.tree || []).map((item) => ({
    ...item,
    fullPath: item.path,
  }));

  let treeCalls = 0;
  const MAX_TREE_CALLS = 35;

  while (queue.length > 0) {
    const item = queue.shift();
    if (item.type === 'blob') {
      collected.push({ ...item, path: item.fullPath });
    } else if (item.type === 'tree' && treeCalls < MAX_TREE_CALLS) {
      const seg = item.fullPath.split('/').pop()?.toLowerCase();
      if (seg === 'node_modules' || seg === '.git' || seg === 'dist' || seg === 'build' || seg === 'vendor') {
        continue;
      }
      treeCalls++;
      const subUrl = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${item.sha}`;
      const subRes = await fetchWithRetry(subUrl, { headers }, { signal });
      const subData = await subRes.json();
      for (const child of subData.tree || []) {
        queue.push({
          ...child,
          fullPath: `${item.fullPath}/${child.path}`,
        });
      }
    }
  }

  return collected;
}

/**
 * Fetches file content for one repository file.
 * - Uses `raw.githubusercontent.com` (zero API rate limit) for public repos without a token,
 *   falling back to the GitHub git blob API if needed.
 * - Uses GitHub git blob API with Bearer auth for private repos or when a token is provided
 *   (raw.githubusercontent.com rejects CORS preflights with Authorization headers).
 */
async function fetchSingleFileContent({ owner, repo, branch, file, isPrivate, token, signal }) {
  const preferBlobApi = Boolean(token) || Boolean(isPrivate);

  if (!preferBlobApi) {
    const rawUrl = `${GITHUB_RAW_BASE}/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeGitHubPath(branch)}/${encodeGitHubPath(file.path)}`;
    try {
      const res = await fetchWithRetry(rawUrl, {}, { retries: 1, signal });
      return await res.text();
    } catch (err) {
      if (err.code === ERROR_CODES.ABORTED) throw err;
      // Fall through to GitHub REST blob API
    }
  }

  const blobUrl = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/blobs/${file.sha}`;
  const res = await fetchWithRetry(blobUrl, { headers: buildGitHubHeaders(token) }, { signal });
  const data = await res.json();
  if (data.encoding === 'base64' && typeof data.content === 'string') {
    return decodeBase64Utf8(data.content);
  }
  return typeof data.content === 'string' ? data.content : '';
}

/**
 * Downloads filtered repository files in parallel with a bounded concurrency pool
 * and reports live progress (`fetched / total`).
 */
export async function fetchRepositoryFiles({
  owner,
  repo,
  branch,
  files,
  isPrivate = false,
  token = '',
  concurrency = DEFAULT_CONCURRENCY,
  onProgress,
  signal,
}) {
  const total = files.length;
  const results = new Array(total);
  let nextIndex = 0;
  let fetchedCount = 0;
  let failedCount = 0;
  let fatalError = null;

  async function worker() {
    while (true) {
      if (signal?.aborted) {
        throw new AppError(ERROR_CODES.ABORTED, 'Aborted');
      }
      if (fatalError) return;

      const index = nextIndex++;
      if (index >= total) return;

      const file = files[index];
      try {
        const content = await fetchSingleFileContent({
          owner,
          repo,
          branch,
          file,
          isPrivate,
          token,
          signal,
        });

        // Guard against disguised binary files containing null bytes
        if (content.includes('\u0000')) {
          results[index] = null;
        } else {
          results[index] = {
            ...file,
            content,
            lines: content.split('\n').length,
          };
        }
      } catch (err) {
        if (
          err.code === ERROR_CODES.ABORTED ||
          err.code === ERROR_CODES.GITHUB_RATE_LIMIT ||
          err.code === ERROR_CODES.PRIVATE_OR_UNAUTHORIZED
        ) {
          fatalError = err;
          return;
        }
        failedCount += 1;
        results[index] = null;
      } finally {
        fetchedCount += 1;
        onProgress?.({
          fetched: Math.min(fetchedCount, total),
          total,
          currentPath: file.path,
          failed: failedCount,
        });
      }
    }
  }

  const workerCount = Math.min(concurrency, Math.max(1, total));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  if (fatalError) {
    throw fatalError;
  }

  return {
    files: results.filter(Boolean),
    failedCount,
  };
}
