import { GitHubVerificationResult } from '../types';
import { getAuthHeaders } from './supabase';

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

/** Persisted GitHub connection status. Never contains the OAuth token. */
export interface GitHubConnectionStatus {
  connected: boolean;
  login: string | null;
  avatarUrl: string | null;
  scopes: string[];
  connectedAt?: string | null;
}

export interface GitHubRepoStructure {
  likelyFrontend: boolean;
  likelyBackend: boolean;
  likelyFullstack: boolean;
  detectedFiles: string[];
}

export interface GitHubVerifyResponse {
  verification: GitHubVerificationResult;
  structure: GitHubRepoStructure;
}

/** Backend/GitHub failure with the HTTP status preserved for the caller. */
export class GitHubApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = 'GitHubApiError';
    this.status = status;
    this.code = code;
  }
}

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

/** Reads a backend error body into a GitHubApiError, preserving status/code. */
async function toApiError(res: Response, fallback: string): Promise<GitHubApiError> {
  let message = fallback;
  let code: string | undefined;
  try {
    const body = await res.json();
    if (typeof body?.error === 'string' && body.error) message = body.error;
    if (typeof body?.code === 'string') code = body.code;
  } catch {
    // Non-JSON error body
  }
  return new GitHubApiError(res.status, message, code);
}

async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers: Record<string, string> = {
    ...(await getAuthHeaders()),
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body) headers['Content-Type'] = 'application/json';
  return fetch(path, { ...init, headers });
}

// ---------------------------------------------------------------------------
// One-time capture of the Supabase OAuth provider token.
//
// Supabase only exposes session.provider_token right after the GitHub OAuth
// redirect (SIGNED_IN / INITIAL_SESSION). It must be handed to the backend in
// that moment; afterwards the backend stores it encrypted and proxies every
// GitHub API call. The token is never written to localStorage, sessionStorage,
// or any long-lived frontend state, and never logged.
// ---------------------------------------------------------------------------

// De-duplication fingerprint (SHA-256) of the last captured token — never the
// token itself. Memory-only, cleared on sign-out, never persisted or logged.
let lastCapturedFingerprint: string | null = null;
let captureInFlight: Promise<GitHubConnectionStatus | null> | null = null;

/** Notifies listeners (e.g. the verifier) that the connection status changed. */
export const GITHUB_CONNECTION_EVENT = 'cp:github-connection-changed';

function notifyConnectionChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(GITHUB_CONNECTION_EVENT));
  }
}

async function fingerprintToken(token: string): Promise<string | null> {
  try {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
      return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }
  } catch {
    // Insecure context: skip de-duplication rather than keep the raw token.
  }
  return null;
}

/**
 * Posts a freshly issued GitHub provider token to the backend so the
 * connection survives refreshes and sign-outs. Safe to call repeatedly:
 * identical consecutive tokens are only sent once per page load.
 * Returns the connection status, or null when there was nothing to capture.
 */
export async function captureGitHubProviderToken(session: {
  access_token?: string;
  provider_token?: string | null;
  user?: { id?: string; identities?: Array<{ provider?: string }> | null };
} | null | undefined): Promise<GitHubConnectionStatus | null> {
  const providerToken = typeof session?.provider_token === 'string' ? session.provider_token : '';
  const accessToken = typeof session?.access_token === 'string' ? session.access_token : '';
  const hasGithubIdentity = Boolean(
    session?.user?.identities?.some((identity) => identity?.provider === 'github')
  );
  if (!providerToken || !accessToken || !hasGithubIdentity) return null;

  // De-duplicate: auth listeners and the initial session check can both fire
  // for the same redirect. Only a SHA-256 fingerprint is kept in memory —
  // never the raw token — and it is cleared on sign-out.
  if (captureInFlight) return captureInFlight;
  const fingerprint = await fingerprintToken(providerToken);
  // Re-check after the async fingerprint: another caller may have started or
  // completed the same capture while this one was hashing.
  if (captureInFlight) return captureInFlight;
  if (fingerprint && fingerprint === lastCapturedFingerprint) return null;

  captureInFlight = (async () => {
    try {
      const res = await fetch('/api/user/github-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ providerToken }),
      });
      if (!res.ok) throw await toApiError(res, 'Failed to save the GitHub connection.');
      lastCapturedFingerprint = fingerprint;
      const status = (await res.json()) as GitHubConnectionStatus;
      notifyConnectionChanged();
      return status;
    } finally {
      captureInFlight = null;
    }
  })();

  return captureInFlight;
}

/** Clears the capture de-duplication state on sign-out. */
export function resetGitHubTokenCapture(): void {
  lastCapturedFingerprint = null;
}

export const githubService = {
  /** Connection status from the backend (never includes the token). */
  async getConnectionStatus(): Promise<GitHubConnectionStatus> {
    const res = await authorizedFetch('/api/user/github-token');
    if (!res.ok) throw await toApiError(res, 'Could not read your GitHub connection status.');
    return (await res.json()) as GitHubConnectionStatus;
  },

  /** Removes the stored token server-side. */
  async disconnect(): Promise<void> {
    const res = await authorizedFetch('/api/user/github-token', { method: 'DELETE' });
    if (!res.ok) throw await toApiError(res, 'Failed to disconnect GitHub.');
    resetGitHubTokenCapture();
    notifyConnectionChanged();
  },

  /**
   * Lists the repositories the connected account can access through the
   * backend proxy (GET /api/github/repos), most recently updated first.
   */
  async listUserRepos(signal?: AbortSignal): Promise<GitHubRepoListing> {
    const res = await authorizedFetch('/api/github/repos', { signal });
    if (!res.ok) throw await toApiError(res, 'Could not load your repositories from GitHub.');
    return (await res.json()) as GitHubRepoListing;
  },

  /**
   * Verifies file paths and reads the repository structure through the backend
   * proxy (POST /api/github/verify). The GitHub token stays on the server.
   */
  async verifyFiles(
    repoName: string,
    filePaths: string[],
    branch: string = 'main'
  ): Promise<GitHubVerifyResponse> {
    const res = await authorizedFetch('/api/github/verify', {
      method: 'POST',
      body: JSON.stringify({ repo: repoName, branch, files: filePaths }),
    });
    if (!res.ok) throw await toApiError(res, 'Failed to verify files against GitHub.');
    return (await res.json()) as GitHubVerifyResponse;
  },
};
