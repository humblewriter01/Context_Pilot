import React, { useState, useEffect, useRef } from 'react';
import { GitHubVerificationResult, CategorizedFiles } from '../types';
import { githubService, normalizeRepoFullName, type GitHubRepoSummary } from '../services/github';
import { storageService } from '../services/storage';
import { getOrInitSupabase } from '../services/supabase';
import { describeAuthError } from '../services/authErrors';
import { RepoPicker } from './RepoPicker';
import {
  GitBranch,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Search,
  Code2,
  FolderGit2,
  RefreshCw,
  Sparkles,
  Inbox,
  Copy,
  Check
} from 'lucide-react';

interface GitHubVerifierViewProps {
  initialFiles?: string[];
}

export const GitHubVerifierView: React.FC<GitHubVerifierViewProps> = ({ initialFiles }) => {
  const [repoName, setRepoName] = useState(storageService.getGitHubRepo());
  const [branch, setBranch] = useState('main');
  const [githubProviderToken, setGitHubProviderToken] = useState('');
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [connectingOAuth, setConnectingOAuth] = useState(false);

  // Repositories of the connected account (GitHub: GET /user/repos?sort=updated).
  const [repos, setRepos] = useState<GitHubRepoSummary[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposError, setReposError] = useState<string | null>(null);
  const [reposTruncated, setReposTruncated] = useState(false);
  const [tokenScopes, setTokenScopes] = useState<string[] | null>(null);
  const [repoReloadKey, setRepoReloadKey] = useState(0);
  // Manual owner/repo entry: the fallback for public repositories the account does not own.
  const [manualEntry, setManualEntry] = useState(false);

  // Latest values for async callbacks that must not re-run when they change.
  const repoNameRef = useRef(repoName);
  repoNameRef.current = repoName;
  const branchEditedRef = useRef(false);
  const sessionUserIdRef = useRef<string | null>(null);

  const [filesInput, setFilesInput] = useState<string>(() => {
    if (initialFiles && initialFiles.length > 0) {
      return initialFiles.join('\n');
    }
    const recentAnalyses = storageService.getAnalyses();
    if (recentAnalyses.length > 0) {
      const latest = recentAnalyses[0];
      const files = [
        ...(latest.frontend_files || []),
        ...(latest.backend_files || []),
        ...(latest.database_files || []),
        ...(latest.config_files || []),
        ...(latest.test_files || [])
      ];
      return files.join('\n');
    }
    return '';
  });

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [result, setResult] = useState<GitHubVerificationResult | null>(null);
  const [structure, setStructure] = useState<any>(null);

  // Search filter and copy states for verified files
  const [verifiedSearchTerm, setVerifiedSearchTerm] = useState('');
  const [copiedFilePath, setCopiedFilePath] = useState<string | null>(null);

  const handleCopyPath = (path: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    navigator.clipboard.writeText(path);
    setCopiedFilePath(path);
    setTimeout(() => {
      setCopiedFilePath((curr) => (curr === path ? null : curr));
    }, 2000);
  };

  useEffect(() => {
    let mounted = true;
    let unsubscribe: (() => void) | undefined;

    const updateFromSession = (session: any) => {
      const user = session?.user;
      const hasGithubIdentity = Boolean(
        user?.identities?.some((identity: any) => identity.provider === 'github')
      );
      const freshToken =
        hasGithubIdentity && typeof session?.provider_token === 'string' ? session.provider_token : '';
      const sameUser = Boolean(user?.id) && sessionUserIdRef.current === user.id;
      sessionUserIdRef.current = user?.id ?? null;
      if (!mounted) return;
      // A silent session refresh no longer carries the GitHub token. Keep the one
      // already held in memory for the same signed-in user; it is never persisted.
      setGitHubProviderToken((current) => freshToken || (hasGithubIdentity && sameUser ? current : ''));
      setUsername(hasGithubIdentity
        ? user?.user_metadata?.user_name || user?.user_metadata?.preferred_username || user?.email?.split('@')[0] || ''
        : '');
      setAvatarUrl(hasGithubIdentity ? user?.user_metadata?.avatar_url || '' : '');
    };

    const initialize = async () => {
      const client = await getOrInitSupabase();
      if (!client) {
        if (mounted) setErrorMsg('GitHub sign-in is unavailable because authentication is not configured for this deployment.');
        return;
      }
      const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
        updateFromSession(session);
      });
      unsubscribe = () => subscription.unsubscribe();
      const { data: { session } } = await client.auth.getSession();
      updateFromSession(session);
    };

    initialize().catch((error) => {
      console.error('[GitHub OAuth session]', error);
      if (mounted) setErrorMsg('Could not read your GitHub session. Please sign in again.');
    });

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, []);

  const handleConnectGitHub = async () => {
    setConnectingOAuth(true);
    setErrorMsg(null);
    try {
      const client = await getOrInitSupabase();
      if (!client) throw new Error('Authentication is not configured for this deployment.');
      const { error } = await client.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: window.location.origin,
          scopes: 'read:user,repo',
        },
      });
      if (error) throw error;
    } catch (err: any) {
      console.error('[GitHub OAuth start]', err);
      setErrorMsg(describeAuthError(err, 'Could not start GitHub sign-in. Please try again.'));
      setConnectingOAuth(false);
    }
  };

  // Load the connected account's repositories for the searchable picker.
  useEffect(() => {
    if (!githubProviderToken) {
      setRepos([]);
      setReposLoading(false);
      setReposError(null);
      setReposTruncated(false);
      setTokenScopes(null);
      return;
    }

    const controller = new AbortController();
    setReposLoading(true);
    setReposError(null);

    githubService
      .listUserRepos(githubProviderToken, controller.signal)
      .then((listing) => {
        if (controller.signal.aborted) return;
        setRepos(listing.repos);
        setReposTruncated(listing.truncated);
        setTokenScopes(listing.scopes);

        const saved = repoNameRef.current.trim().toLowerCase();
        if (!saved) return;
        const match = listing.repos.find((repo) => repo.fullName.toLowerCase() === saved);
        if (match) {
          setRepoName(match.fullName);
          if (!branchEditedRef.current) setBranch(match.defaultBranch);
        } else {
          // The remembered repository is not one of theirs: it was entered manually.
          setManualEntry(true);
        }
      })
      .catch((err: any) => {
        if (controller.signal.aborted) return;
        console.error('[GitHub repositories]', err);
        setRepos([]);
        setReposTruncated(false);
        if (err?.status === 401) {
          // Revoked or expired authorization: fall back to the connect banner.
          setGitHubProviderToken('');
          setErrorMsg(err.message);
          return;
        }
        setReposError(err?.message || 'Could not load your repositories from GitHub.');
        // The list is unavailable, so offer the manual owner/repo field instead.
        setManualEntry(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setReposLoading(false);
      });

    return () => controller.abort();
  }, [githubProviderToken, repoReloadKey]);

  const handleRepoSelect = (repo: GitHubRepoSummary) => {
    setRepoName(repo.fullName);
    setBranch(repo.defaultBranch);
    branchEditedRef.current = false;
    setErrorMsg(null);
  };

  const handleUseCustomRepo = (fullName: string) => {
    setRepoName(fullName);
    setManualEntry(true);
    setErrorMsg(null);
  };

  const reloadRepos = () => setRepoReloadKey((key) => key + 1);

  // Private repositories are only listed when the `repo` scope was granted.
  const privateReposHidden = tokenScopes !== null && !tokenScopes.includes('repo');

  useEffect(() => {
    if (initialFiles && initialFiles.length > 0) {
      setFilesInput(initialFiles.join('\n'));
    }
  }, [initialFiles]);

  const handleLoadLatestAnalyses = () => {
    const recentAnalyses = storageService.getAnalyses();
    if (recentAnalyses.length > 0) {
      const latest = recentAnalyses[0];
      const files = [
        ...(latest.frontend_files || []),
        ...(latest.backend_files || []),
        ...(latest.database_files || []),
        ...(latest.config_files || []),
        ...(latest.test_files || [])
      ];
      setFilesInput(files.join('\n'));
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    if (!githubProviderToken) {
      setErrorMsg('Connect with GitHub before verifying repository files.');
      return;
    }

    const targetRepo = normalizeRepoFullName(repoName);
    if (!targetRepo) {
      setErrorMsg(
        repoName.trim()
          ? `"${repoName.trim()}" is not a valid repository. Use the owner/repo format (e.g. facebook/react).`
          : 'Select a repository, or enter one as owner/repo (e.g. facebook/react).'
      );
      return;
    }
    if (targetRepo !== repoName) setRepoName(targetRepo);
    const targetBranch = branch.trim() || 'main';

    const fileList = filesInput
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (fileList.length === 0) {
      setErrorMsg('Please enter at least one file path to verify.');
      return;
    }

    setLoading(true);
    storageService.saveGitHubRepo(targetRepo);

    try {
      const res = await githubService.verifyFiles(targetRepo, fileList, githubProviderToken, targetBranch);
      const struct = await githubService.analyzeRepoStructure(targetRepo, githubProviderToken, targetBranch);
      setResult(res);
      setStructure(struct);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || 'Failed to verify files against GitHub.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <GitBranch className="w-6 h-6 text-indigo-600" />
            GitHub Codebase Verifier
          </h1>
          <p className="text-sm text-slate-500">
            Real GitHub REST API verification. Cross-references AI predicted file paths directly against your repository contents.
          </p>
        </div>
      </div>

      {successNotice && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs sm:text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successNotice}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs sm:text-sm flex items-center gap-2">
          <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Verification Controls */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <FolderGit2 className="w-4 h-4 text-indigo-600" />
              Target Repository
            </h2>
            {githubProviderToken && username && (
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                OAuth Active
              </span>
            )}
          </div>

          {/* 1-Click Connect Banner or Connected Account Header */}
          {githubProviderToken && username ? (
            <div className="p-3 bg-gradient-to-br from-slate-50 to-indigo-50/40 border border-indigo-100 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={username} className="w-8 h-8 rounded-full border border-indigo-200 shadow-2xs shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs shrink-0">
                    {username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span className="truncate">@{username}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  </div>
                  <div className="text-[10px] text-slate-500">Connected via GitHub OAuth</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-slate-900 text-white rounded-xl shadow-xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold flex items-center gap-1.5 text-white">
                  <GitBranch className="w-4 h-4 text-indigo-400" />
                  <span>1-Click GitHub Connect</span>
                </div>
                <span className="text-[10px] bg-indigo-500/30 text-indigo-200 px-1.5 py-0.5 rounded font-mono font-medium">
                  Instant
                </span>
              </div>
              <p className="text-[11px] text-slate-300 leading-snug">
                Authorize your GitHub account to browse and verify the repositories available to it.
              </p>
              <button
                type="button"
                onClick={handleConnectGitHub}
                disabled={connectingOAuth}
                className="w-full py-2 px-3 bg-white hover:bg-slate-100 text-slate-900 font-semibold rounded-lg text-xs flex items-center justify-center gap-2 transition-all shadow-xs"
              >
                {connectingOAuth ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-700" />
                    <span>Connecting with GitHub...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                    </svg>
                    <span>Connect with GitHub</span>
                  </>
                )}
              </button>
            </div>
          )}

          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label
                  htmlFor="verifier-repo-input"
                  className="block text-xs font-semibold text-slate-700 uppercase"
                >
                  {githubProviderToken ? 'Repository' : 'Repository (owner/repo)'}
                </label>
                {githubProviderToken && (
                  <button
                    type="button"
                    onClick={() => setManualEntry((manual) => !manual)}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium shrink-0 whitespace-nowrap"
                  >
                    {manualEntry ? 'Choose from my repositories' : 'Enter manually'}
                  </button>
                )}
              </div>

              {githubProviderToken && !manualEntry ? (
                <RepoPicker
                  id="verifier-repo-input"
                  repos={repos}
                  value={repoName}
                  onSelect={handleRepoSelect}
                  onUseCustom={handleUseCustomRepo}
                  onRefresh={reloadRepos}
                  loading={reposLoading}
                  error={reposError}
                  truncated={reposTruncated}
                />
              ) : (
                <input
                  id="verifier-repo-input"
                  type="text"
                  placeholder="owner/repository"
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  onBlur={() => {
                    // Accept pasted GitHub URLs and reduce them to owner/repo.
                    const normalized = normalizeRepoFullName(repoName);
                    if (normalized && normalized !== repoName) setRepoName(normalized);
                  }}
                  required
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-indigo-500 font-mono"
                />
              )}

              {githubProviderToken && manualEntry && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Works for any public repository, including ones you don't own (e.g.{' '}
                  <span className="font-mono">facebook/react</span>).
                </p>
              )}

              {githubProviderToken && reposError && (
                <p className="mt-1 text-[11px] text-amber-700">
                  {reposError}{' '}
                  <button
                    type="button"
                    onClick={reloadRepos}
                    disabled={reposLoading}
                    className="font-semibold underline hover:text-amber-900 disabled:opacity-50"
                  >
                    {reposLoading ? 'Retrying…' : 'Retry'}
                  </button>
                </p>
              )}

              {githubProviderToken && !manualEntry && privateReposHidden && (
                <p className="mt-1 text-[11px] text-slate-500">
                  Only public repositories are listed.{' '}
                  <button
                    type="button"
                    onClick={handleConnectGitHub}
                    disabled={connectingOAuth}
                    className="font-semibold text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                  >
                    Include private repositories
                  </button>
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Branch</label>
              <input
                type="text"
                placeholder="main"
                value={branch}
                onChange={(e) => {
                  branchEditedRef.current = true;
                  setBranch(e.target.value);
                }}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-indigo-500 font-mono"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-slate-700 uppercase">
                  File Paths to Verify
                </label>
                <button
                  type="button"
                  onClick={handleLoadLatestAnalyses}
                  className="text-[11px] text-indigo-600 hover:text-indigo-800 font-medium"
                >
                  Load from latest analysis
                </button>
              </div>
              <textarea
                rows={9}
                value={filesInput}
                onChange={(e) => setFilesInput(e.target.value)}
                placeholder="Enter repository relative file paths (one per line)...&#10;src/components/Component.tsx&#10;api/routes/handler.ts"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-indigo-500 text-slate-800 leading-relaxed whitespace-nowrap overflow-x-auto"
                wrap="off"
                spellCheck={false}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !repoName.trim() || !githubProviderToken}
              className="w-full py-2.5 px-4 bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-95 text-white font-semibold rounded-lg text-sm shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Checking Real GitHub API...</span>
                </>
              ) : (
                <>
                  <GitBranch className="w-4 h-4" />
                  <span>Verify Files in Repository</span>
                </>
              )}
            </button>
          </form>

          {structure && structure.detectedFiles?.length > 0 && (
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2">
              <span className="font-semibold text-slate-800 block">
                Verified Repository Structure:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {structure.detectedFiles.map((df: string) => (
                  <span
                    key={df}
                    className="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-mono text-[11px]"
                  >
                    {df}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2 space-y-6">
          {result ? (
            <div className="space-y-6">
              {/* Rate & Summary Banner */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase font-bold text-slate-500">Repository</span>
                    <span className="font-mono text-sm font-semibold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded">
                      {result.repoName} ({result.branch})
                    </span>
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">
                    Verification Rate: {(result.verificationRate * 100).toFixed(0)}%
                  </h3>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-center px-4 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
                    <div className="text-lg font-bold text-emerald-700">{result.verifiedFiles.length}</div>
                    <div className="text-[11px] text-emerald-600 font-medium">Verified</div>
                  </div>
                  <div className="text-center px-4 py-2 rounded-lg bg-rose-50 border border-rose-200">
                    <div className="text-lg font-bold text-rose-700">{result.missingFiles.length}</div>
                    <div className="text-[11px] text-rose-600 font-medium">Missing</div>
                  </div>
                </div>
              </div>

              {/* Verified Files */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Verified Files in Repo ({result.verifiedFiles.length})
                    </h3>
                    {verifiedSearchTerm && (
                      <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full font-medium">
                        {result.verifiedFiles.filter((f) => f.path.toLowerCase().includes(verifiedSearchTerm.trim().toLowerCase())).length} matches
                      </span>
                    )}
                  </div>

                  {/* Search Bar for filtering verified files by name or directory pattern */}
                  {result.verifiedFiles.length > 0 && (
                    <div className="relative w-full sm:w-72">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        placeholder="Filter by name or pattern (e.g. .tsx, auth/)..."
                        value={verifiedSearchTerm}
                        onChange={(e) => setVerifiedSearchTerm(e.target.value)}
                        className="w-full pl-8 pr-7 py-1.5 border border-slate-300 rounded-lg text-xs bg-slate-50/50 focus:bg-white focus:outline-indigo-500 font-mono text-slate-800 placeholder:font-sans placeholder:text-slate-400 transition-colors"
                      />
                      {verifiedSearchTerm && (
                        <button
                          type="button"
                          onClick={() => setVerifiedSearchTerm('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded"
                          title="Clear search"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {result.verifiedFiles.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No exact file matches found in this branch.</p>
                ) : result.verifiedFiles.filter((f) => !verifiedSearchTerm.trim() || f.path.toLowerCase().includes(verifiedSearchTerm.trim().toLowerCase())).length === 0 ? (
                  <div className="py-6 text-center text-slate-400 text-xs space-y-1">
                    <p>No verified files match "<span className="font-mono text-slate-700">{verifiedSearchTerm}</span>".</p>
                    <button
                      type="button"
                      onClick={() => setVerifiedSearchTerm('')}
                      className="text-indigo-600 hover:text-indigo-800 font-medium underline"
                    >
                      Clear filter
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {result.verifiedFiles
                      .filter((f) => !verifiedSearchTerm.trim() || f.path.toLowerCase().includes(verifiedSearchTerm.trim().toLowerCase()))
                      .map((file) => (
                        <div
                          key={file.path}
                          className="flex items-center justify-between gap-3 p-2.5 bg-emerald-50/50 hover:bg-emerald-50/90 border border-emerald-200/60 rounded-lg text-xs transition-colors group"
                        >
                          <div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            <code
                              className="font-mono text-slate-800 truncate block text-xs min-w-0 flex-1"
                              title={file.path}
                            >
                              {file.path}
                            </code>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            {file.size && (
                              <span className="text-slate-400 text-[11px] hidden sm:inline-block">
                                {(file.size / 1024).toFixed(1)} KB
                              </span>
                            )}

                            {/* Copy Path Button */}
                            <button
                              type="button"
                              onClick={(e) => handleCopyPath(file.path, e)}
                              className="px-2 py-1 text-slate-600 hover:text-indigo-700 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-md text-[11px] font-medium flex items-center gap-1 transition-all shadow-2xs"
                              title={`Copy path ${file.path}`}
                              aria-label={`Copy path ${file.path}`}
                            >
                              {copiedFilePath === file.path ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span className="hidden sm:inline text-emerald-700 font-semibold">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3 text-slate-400 group-hover:text-indigo-600" />
                                  <span className="hidden sm:inline">Copy Path</span>
                                </>
                              )}
                            </button>

                            <a
                              href={file.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium px-1.5 py-1 hover:bg-indigo-50/60 rounded transition-colors"
                              title="Open in GitHub"
                            >
                              <span className="hidden sm:inline">View</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>

              {/* Missing Files & Suggestions */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <XCircle className="w-4 h-4 text-rose-600" />
                    Missing Files ({result.missingFiles.length})
                  </h3>
                  <span className="text-xs text-slate-400">Path check results</span>
                </div>

                {result.missingFiles.length === 0 ? (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs">
                    All file paths exist in this repository branch!
                  </div>
                ) : (
                  <div className="space-y-3">
                    {result.missingFiles.map((missing) => (
                      <div
                        key={missing.path}
                        className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2.5 overflow-hidden"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-3">
                          <div className="min-w-0 flex-1 overflow-hidden flex items-center gap-2">
                            <code
                              className="font-mono text-rose-700 font-semibold line-through truncate block text-xs flex-1"
                              title={missing.path}
                            >
                              {missing.path}
                            </code>

                            {/* Copy Missing Path Button */}
                            <button
                              type="button"
                              onClick={(e) => handleCopyPath(missing.path, e)}
                              className="px-2 py-0.5 text-slate-600 hover:text-rose-700 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded text-[10px] font-medium flex items-center gap-1 transition-all shadow-2xs shrink-0"
                              title={`Copy path ${missing.path}`}
                              aria-label={`Copy path ${missing.path}`}
                            >
                              {copiedFilePath === missing.path ? (
                                <>
                                  <Check className="w-2.5 h-2.5 text-emerald-600" />
                                  <span className="hidden sm:inline text-emerald-700 font-semibold">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-2.5 h-2.5 text-slate-400" />
                                  <span className="hidden sm:inline">Copy</span>
                                </>
                              )}
                            </button>
                          </div>
                          <span className="self-start sm:self-auto shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-100/80 text-rose-700 border border-rose-200/60 whitespace-nowrap">
                            {missing.reason}
                          </span>
                        </div>

                        {missing.suggestions && missing.suggestions.length > 0 && (
                          <div className="pt-2 border-t border-slate-200/80 flex flex-col sm:flex-row sm:items-start gap-1.5 sm:gap-2">
                            <span className="text-indigo-600 font-medium shrink-0 flex items-center gap-1 text-[11px]">
                              <Sparkles className="w-3 h-3" /> Potential paths:
                            </span>
                            <div className="flex flex-wrap gap-1.5 min-w-0">
                              {missing.suggestions.map((sug) => (
                                <button
                                  key={sug}
                                  type="button"
                                  onClick={(e) => handleCopyPath(sug, e)}
                                  title={`Click to copy: ${sug}`}
                                  className="inline-flex items-center gap-1 max-w-[220px] sm:max-w-xs md:max-w-md truncate px-2 py-0.5 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-mono text-[11px] border border-indigo-200/60 transition-colors text-left"
                                >
                                  {copiedFilePath === sug ? (
                                    <Check className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                  ) : (
                                    <Copy className="w-2.5 h-2.5 text-indigo-400 shrink-0" />
                                  )}
                                  <span className="truncate">{sug}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white p-12 rounded-xl border border-dashed border-slate-300 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto">
                <GitBranch className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-800 text-base">Ready to Verify File Paths</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Enter or load file paths and click <strong>"Verify Files in Repository"</strong> to check live against GitHub.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
