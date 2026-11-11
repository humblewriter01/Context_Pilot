import { GitHubVerificationResult, GitHubFileVerification } from '../types';

/** A repository the connected GitHub account can access. */
export interface GitHubRepoSummary {
  id: number;
  /** `owner/repo` */
  fullName: string;
  name: string;
  owner: string;
  isPrivate: boolean;
  defaultBranch: string;
  description: string;
  language: string;
  /** Last push (falls back to the last metadata update), ISO 8601. */
  updatedAt: string;
  archived: boolean;
  fork: boolean;
}

export interface GitHubRepoListing {
  repos: GitHubRepoSummary[];
  /** True when the account has more repositories than were loaded. */
  truncated: boolean;
  /** OAuth scopes granted to the token, or null when GitHub does not report them. */
  scopes: string[] | null;
}

/** GitHub REST failure with the HTTP status preserved for the caller. */
export class GitHubApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
  }
}

/** Repositories of the authenticated user, most recently updated first. */
const USER_REPOS_ENDPOINT = 'https://api.github.com/user/repos?sort=updated';
const REPOS_PER_PAGE = 100;
const MAX_REPO_PAGES = 5;

const REPO_FULL_NAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/;

/** True for a well-formed `owner/repo` reference. */
export function isRepoFullName(value: string): boolean {
  const candidate = value.trim();
  return REPO_FULL_NAME_PATTERN.test(candidate) && !/\/\.{1,2}$/.test(candidate);
}

/**
 * Accepts what people actually paste (`owner/repo`, a github.com URL, a clone
 * URL) and returns `owner/repo`, or an empty string when nothing usable is found.
 */
export function normalizeRepoFullName(value: string): string {
  const candidate = value
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, '')
    .replace(/^git@github\.com:/i, '')
    .replace(/[?#].*$/, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');
  const [owner, repo] = candidate.split('/');
  const fullName = owner && repo ? `${owner}/${repo}` : candidate;
  return isRepoFullName(fullName) ? fullName : '';
}

function toRepoSummary(raw: any): GitHubRepoSummary | null {
  if (!raw || typeof raw.full_name !== 'string' || !raw.full_name.includes('/')) return null;
  return {
    id: typeof raw.id === 'number' ? raw.id : 0,
    fullName: raw.full_name,
    name: typeof raw.name === 'string' ? raw.name : raw.full_name.split('/')[1],
    owner: typeof raw.owner?.login === 'string' ? raw.owner.login : raw.full_name.split('/')[0],
    isPrivate: Boolean(raw.private),
    defaultBranch: typeof raw.default_branch === 'string' && raw.default_branch ? raw.default_branch : 'main',
    description: typeof raw.description === 'string' ? raw.description : '',
    language: typeof raw.language === 'string' ? raw.language : '',
    updatedAt: raw.pushed_at || raw.updated_at || '',
    archived: Boolean(raw.archived),
    fork: Boolean(raw.fork),
  };
}

async function toGitHubApiError(res: Response, action: string): Promise<GitHubApiError> {
  if (res.status === 401) {
    return new GitHubApiError(401, 'Your GitHub authorization has expired. Reconnect GitHub to continue.');
  }

  const rateLimited =
    res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0');
  if (rateLimited) {
    const resetAt = Number(res.headers.get('x-ratelimit-reset'));
    const when = Number.isFinite(resetAt) && resetAt > 0
      ? ` Try again after ${new Date(resetAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`
      : ' Please try again in a few minutes.';
    return new GitHubApiError(res.status, `GitHub API rate limit reached.${when}`);
  }

  let detail = '';
  try {
    const body = await res.json();
    if (typeof body?.message === 'string') detail = body.message;
  } catch {
    // Non-JSON error body
  }
  return new GitHubApiError(
    res.status,
    `GitHub could not ${action} (HTTP ${res.status}${detail ? `: ${detail}` : ''}).`
  );
}

export const githubService = {
  /**
   * Lists the repositories the connected account can access, most recently
   * updated first (GET /user/repos?sort=updated), following pagination up to
   * MAX_REPO_PAGES pages.
   */
  async listUserRepos(oauthAccessToken: string, signal?: AbortSignal): Promise<GitHubRepoListing> {
    const token = oauthAccessToken.trim();
    if (!token) throw new Error('Connect your GitHub account before loading repositories.');

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
    };

    const byFullName = new Map<string, GitHubRepoSummary>();
    let scopes: string[] | null = null;
    let truncated = false;

    for (let page = 1; page <= MAX_REPO_PAGES; page += 1) {
      const res = await fetch(`${USER_REPOS_ENDPOINT}&per_page=${REPOS_PER_PAGE}&page=${page}`, {
        headers,
        signal,
      });
      if (!res.ok) throw await toGitHubApiError(res, 'list your repositories');

      if (page === 1) {
        const scopeHeader = res.headers.get('x-oauth-scopes');
        if (scopeHeader !== null) {
          scopes = scopeHeader.split(',').map((scope) => scope.trim()).filter(Boolean);
        }
      }

      const batch = await res.json();
      if (!Array.isArray(batch)) break;
      for (const raw of batch) {
        const repo = toRepoSummary(raw);
        if (repo && !byFullName.has(repo.fullName.toLowerCase())) {
          byFullName.set(repo.fullName.toLowerCase(), repo);
        }
      }

      const link = res.headers.get('link');
      const hasNextPage = link !== null ? /rel="next"/.test(link) : batch.length === REPOS_PER_PAGE;
      if (!hasNextPage) break;
      if (page === MAX_REPO_PAGES) truncated = true;
    }

    return { repos: Array.from(byFullName.values()), truncated, scopes };
  },

  async verifyFiles(
    repoName: string,
    filePaths: string[],
    oauthAccessToken: string,
    branch: string = 'main'
  ): Promise<GitHubVerificationResult> {
    const verifiedFiles: GitHubFileVerification[] = [];
    const missingFiles: GitHubFileVerification[] = [];

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };
    if (!oauthAccessToken.trim()) throw new Error('Connect your GitHub account with OAuth before verifying repositories.');
    headers['Authorization'] = `Bearer ${oauthAccessToken.trim()}`;

    let rateLimitRemaining: number | undefined = undefined;

    // Check rate limit first
    try {
      const rateRes = await fetch('https://api.github.com/rate_limit', { headers });
      if (rateRes.ok) {
        const rateData = await rateRes.json();
        rateLimitRemaining = rateData.resources?.core?.remaining;
      }
    } catch {
      // ignore network errors on rate limit endpoint
    }

    const cleanRepo = repoName.trim();
    const [owner, repo] = cleanRepo.split('/');

    if (!owner || !repo) {
      throw new Error(`Invalid repository format "${repoName}". Expected "owner/repo" (e.g. facebook/react)`);
    }

    // Verify each file against real GitHub REST API
    for (const filePath of filePaths) {
      const cleanPath = filePath.trim().replace(/^\/+/, '').replace(/\/+$/, '');
      if (!cleanPath) continue;

      // Encode each path segment so spaces, "#" and unicode characters are safe.
      const encodedPath = cleanPath
        .split('/')
        .filter((segment) => segment.length > 0)
        .map((segment) => encodeURIComponent(segment))
        .join('/');

      try {
        const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
        const res = await fetch(url, { headers });

        if (res.ok) {
          const data = await res.json();
          verifiedFiles.push({
            path: cleanPath,
            exists: true,
            url: data.html_url || `https://github.com/${cleanRepo}/blob/${encodeURIComponent(branch)}/${encodedPath}`,
            size: data.size,
            last_modified: new Date().toISOString(),
          });
        } else if (res.status === 404) {
          const suggestions = generateSuggestions(cleanPath);
          missingFiles.push({
            path: cleanPath,
            exists: false,
            reason: `File not found in branch "${branch}"`,
            suggestions,
          });
        } else if (res.status === 403 || res.status === 429) {
          missingFiles.push({
            path: cleanPath,
            exists: false,
            reason: 'GitHub API rate limit exceeded or access forbidden',
          });
        } else {
          missingFiles.push({
            path: cleanPath,
            exists: false,
            reason: `GitHub API error (HTTP ${res.status})`,
          });
        }
      } catch (err: any) {
        missingFiles.push({
          path: cleanPath,
          exists: false,
          reason: `Network error verifying file: ${err?.message || 'Failed to fetch'}`,
          suggestions: generateSuggestions(cleanPath),
        });
      }
    }

    const total = verifiedFiles.length + missingFiles.length;
    const verificationRate = total > 0 ? verifiedFiles.length / total : 0;

    return {
      repoName: cleanRepo,
      branch,
      verifiedFiles,
      missingFiles,
      verificationRate: Math.round(verificationRate * 100) / 100,
      totalChecked: total,
      rateLimitRemaining: rateLimitRemaining ?? 60,
      checkedAt: new Date().toISOString(),
    };
  },

  async analyzeRepoStructure(repoName: string, oauthAccessToken: string, branch: string = 'main') {
    const cleanRepo = repoName.trim();
    const [owner, repo] = cleanRepo.split('/');
    if (!owner || !repo) {
      return {
        likelyFrontend: false,
        likelyBackend: false,
        likelyFullstack: false,
        detectedFiles: [],
      };
    }

    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
    };
    if (!oauthAccessToken.trim()) throw new Error('Connect your GitHub account with OAuth before verifying repositories.');
    headers['Authorization'] = `Bearer ${oauthAccessToken.trim()}`;

    const commonFiles = [
      'package.json',
      'tsconfig.json',
      'requirements.txt',
      'Dockerfile',
      'docker-compose.yml',
      'pom.xml',
      'go.mod',
      'Cargo.toml',
      'README.md',
    ];

    const detectedFiles: string[] = [];

    // Query real repository contents from GitHub
    try {
      const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents?ref=${encodeURIComponent(branch)}`;
      const res = await fetch(url, { headers });
      if (res.ok) {
        const contents = await res.json();
        if (Array.isArray(contents)) {
          const names = new Set(contents.map((item: any) => item.name));
          for (const cf of commonFiles) {
            if (names.has(cf)) {
              detectedFiles.push(cf);
            }
          }
        }
      }
    } catch {
      // fallback
    }

    const hasPackageJson = detectedFiles.includes('package.json');
    const hasPythonOrJava =
      detectedFiles.includes('requirements.txt') ||
      detectedFiles.includes('pom.xml') ||
      detectedFiles.includes('go.mod');
    const hasDocker = detectedFiles.includes('Dockerfile') || detectedFiles.includes('docker-compose.yml');

    return {
      likelyFrontend: hasPackageJson,
      likelyBackend: hasPythonOrJava || (hasPackageJson && hasDocker),
      likelyFullstack: hasPackageJson && (hasPythonOrJava || hasDocker),
      detectedFiles,
    };
  },
};

function generateSuggestions(filePath: string): string[] {
  const parts = filePath.split('/');
  const filename = parts[parts.length - 1];
  const commonDirs = ['src', 'app', 'components', 'pages', 'api', 'services', 'models', 'utils'];

  return commonDirs
    .slice(0, 3)
    .map((dir) => `${dir}/${filename}`)
    .filter((s) => s !== filePath);
}
