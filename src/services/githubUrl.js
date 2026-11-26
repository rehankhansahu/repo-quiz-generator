import { AppError, ERROR_CODES } from '../utils/errors.js';

const SEGMENT_RE = /^[A-Za-z0-9_.-]+$/;

/**
 * Parses a GitHub repository URL or shorthand (`owner/repo[@branch]`) into structured parts.
 * Supports:
 * - https://github.com/owner/repo
 * - https://github.com/owner/repo.git
 * - https://github.com/owner/repo/tree/branch/name
 * - https://github.com/owner/repo/blob/branch/path/to/file
 * - owner/repo or owner/repo@branch
 */
export function parseGitHubRepoUrl(rawInput, explicitBranch = '') {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) {
    throw new AppError(ERROR_CODES.INVALID_URL, 'GitHub repository URL is required.');
  }

  let owner = '';
  let repo = '';
  let branchHint = '';

  // Support shorthand `owner/repo` or `owner/repo@branch`
  if (!trimmed.includes('://') && !trimmed.startsWith('github.com') && !trimmed.startsWith('www.github.com')) {
    const [repoPart, atBranch] = trimmed.split('@');
    const parts = repoPart.replace(/^\/+|\/+$/g, '').split('/');
    if (parts.length !== 2 || !SEGMENT_RE.test(parts[0]) || !SEGMENT_RE.test(parts[1])) {
      throw new AppError(ERROR_CODES.INVALID_URL, 'Invalid GitHub repository URL or shorthand.');
    }
    owner = parts[0];
    repo = parts[1].replace(/\.git$/i, '');
    branchHint = (atBranch || '').trim();
  } else {
    const normalized = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    let parsed;
    try {
      parsed = new URL(normalized);
    } catch {
      throw new AppError(ERROR_CODES.INVALID_URL, 'Invalid URL format.');
    }

    const hostname = parsed.hostname.toLowerCase();
    if (hostname !== 'github.com' && hostname !== 'www.github.com') {
      throw new AppError(ERROR_CODES.INVALID_URL, 'URL must point to github.com.');
    }

    const pathParts = parsed.pathname
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .filter(Boolean);

    if (pathParts.length < 2) {
      throw new AppError(ERROR_CODES.INVALID_URL, 'Repository URL must include owner and repository name.');
    }

    owner = pathParts[0];
    repo = pathParts[1].replace(/\.git$/i, '');

    if (!SEGMENT_RE.test(owner) || !SEGMENT_RE.test(repo)) {
      throw new AppError(ERROR_CODES.INVALID_URL, 'Invalid owner or repository name.');
    }

    if ((pathParts[2] === 'tree' || pathParts[2] === 'blob') && pathParts.length >= 4) {
      branchHint = decodeURIComponent(pathParts.slice(3).join('/'));
      // Note: for /blob/branch/file.js we strip trailing segments only if resolved against branches later,
      // or let explicit branch override take precedence.
      if (pathParts[2] === 'blob' && pathParts.length > 4) {
        branchHint = decodeURIComponent(pathParts[3]);
      }
    }
  }

  const branch = (explicitBranch || '').trim() || branchHint || '';

  return {
    owner,
    repo,
    branch,
    fullName: `${owner}/${repo}`,
    canonicalUrl: `https://github.com/${owner}/${repo}`,
  };
}
