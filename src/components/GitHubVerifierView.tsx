import React, { useState, useEffect } from 'react';
import { GitHubVerificationResult, CategorizedFiles } from '../types';
import { githubService } from '../services/github';
import { storageService } from '../services/storage';
import {
  GitBranch,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ExternalLink,
  ShieldAlert,
  Search,
  Code2,
  FolderGit2,
  RefreshCw,
  Sparkles,
  Inbox
} from 'lucide-react';

interface GitHubVerifierViewProps {
  initialFiles?: string[];
}

export const GitHubVerifierView: React.FC<GitHubVerifierViewProps> = ({ initialFiles }) => {
  const savedSettings = storageService.getGitHubSettings();
  const [repoName, setRepoName] = useState(savedSettings.repo || 'humblewriter01/Context_Pilot');
  const [branch, setBranch] = useState('main');
  const [token, setToken] = useState(savedSettings.token || '');
  const [username, setUsername] = useState(savedSettings.username || '');
  const [avatarUrl, setAvatarUrl] = useState(savedSettings.avatarUrl || '');

  const [connectingOAuth, setConnectingOAuth] = useState(false);
  const [oauthHelperOpen, setOauthHelperOpen] = useState(false);
  const [oauthInfo, setOauthInfo] = useState<{ url?: string; redirectUri?: string; isConfigured?: boolean } | null>(null);

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

  useEffect(() => {
    const handleOAuthMessage = (event: MessageEvent) => {
      // Validate origin
      const origin = event.origin;
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && origin !== window.location.origin) {
        return;
      }

      if (event.data?.type === 'GITHUB_OAUTH_SUCCESS') {
        const { token: receivedToken, user: ghUser } = event.data;
        if (receivedToken) {
          setToken(receivedToken);
          setUsername(ghUser?.login || '');
          setAvatarUrl(ghUser?.avatar_url || '');
          storageService.saveGitHubSettings(receivedToken, repoName, ghUser?.login, ghUser?.avatar_url);
          setConnectingOAuth(false);
          setOauthHelperOpen(false);
          setSuccessNotice(`Connected to GitHub as @${ghUser?.login || 'user'}! Your repositories are now ready for verification.`);
          setTimeout(() => setSuccessNotice(null), 4000);
        }
      } else if (event.data?.type === 'GITHUB_OAUTH_ERROR') {
        setConnectingOAuth(false);
        setErrorMsg(`GitHub authorization failed: ${event.data.error}`);
      }
    };

    window.addEventListener('message', handleOAuthMessage);
    return () => window.removeEventListener('message', handleOAuthMessage);
  }, [repoName]);

  const handleConnectGitHub = async () => {
    setConnectingOAuth(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/auth/github/url?origin=${encodeURIComponent(window.location.origin)}`);
      const data = await res.json();
      setOauthInfo(data);

      if (!data.isConfigured) {
        setOauthHelperOpen(true);
        setConnectingOAuth(false);
        return;
      }

      const popup = window.open(
        data.url,
        'github_oauth_popup',
        'width=600,height=720,menubar=no,toolbar=no'
      );

      if (!popup) {
        setErrorMsg('Pop-up was blocked. Please allow popups for this site to connect GitHub.');
        setConnectingOAuth(false);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to initialize GitHub OAuth connection.');
      setConnectingOAuth(false);
    }
  };

  const handleDisconnectGitHub = () => {
    setToken('');
    setUsername('');
    setAvatarUrl('');
    storageService.clearGitHubAuth();
    setSuccessNotice('Disconnected from GitHub.');
    setTimeout(() => setSuccessNotice(null), 2500);
  };

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
    if (!repoName.trim()) {
      setErrorMsg('Please specify a repository name (e.g. owner/repo)');
      return;
    }

    const fileList = filesInput
      .split('\n')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    if (fileList.length === 0) {
      setErrorMsg('Please enter at least one file path to verify.');
      return;
    }

    setLoading(true);
    storageService.saveGitHubSettings(token, repoName);

    try {
      const res = await githubService.verifyFiles(repoName, fileList, branch, token);
      const struct = await githubService.analyzeRepoStructure(repoName, branch, token);
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

      {/* GitHub OAuth Setup Helper Modal */}
      {oauthHelperOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                  <GitBranch className="w-5 h-5 text-indigo-400" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">Enable 1-Click GitHub Connection</h3>
                  <p className="text-xs text-slate-500">Requires GitHub OAuth App credentials in your server</p>
                </div>
              </div>
              <button
                onClick={() => setOauthHelperOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              To let users connect their GitHub account with one click without creating manual tokens, create a free <strong>GitHub OAuth App</strong>:
            </p>

            <ol className="text-xs text-slate-700 space-y-2 list-decimal pl-4">
              <li>
                Open <strong><a href="https://github.com/settings/developers" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">github.com/settings/developers</a></strong>
              </li>
              <li>
                Click <strong>New OAuth App</strong>
              </li>
              <li>
                Set <strong>Application Name</strong>: <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-mono">Context Pilot</code>
              </li>
              <li>
                Set <strong>Homepage URL</strong>: <code className="bg-slate-100 px-1 py-0.5 rounded text-indigo-700 font-mono">{window.location.origin}</code>
              </li>
              <li>
                Set <strong>Authorization callback URL</strong>:
                <div className="mt-1 p-2 bg-slate-100 rounded text-slate-900 font-mono text-[11px] select-all break-all border border-slate-200">
                  {window.location.origin}/auth/github/callback
                </div>
              </li>
              <li>
                Add the generated <strong>Client ID</strong> and <strong>Client Secret</strong> into your <code className="bg-slate-100 px-1 rounded text-indigo-700">.env</code> or directly in <code className="bg-slate-100 px-1 rounded text-indigo-700">/admin</code> → <strong>Payment & Security</strong> tab.
              </li>
            </ol>

            <div className="pt-2 flex items-center justify-between border-t border-slate-100">
              <span className="text-[11px] text-slate-500">
                You can also continue using manual Personal Access Tokens.
              </span>
              <button
                onClick={() => setOauthHelperOpen(false)}
                className="px-4 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                Got It
              </button>
            </div>
          </div>
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
            {username && (
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                OAuth Active
              </span>
            )}
          </div>

          {/* 1-Click Connect Banner or Connected Account Header */}
          {username ? (
            <div className="p-3 bg-gradient-to-br from-slate-50 to-indigo-50/40 border border-indigo-100 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={username} className="w-8 h-8 rounded-full border border-indigo-200 shadow-2xs" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-xs">
                    {username.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                    <span>@{username}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  </div>
                  <div className="text-[10px] text-slate-500">Connected via GitHub OAuth</div>
                </div>
              </div>
              <button
                type="button"
                onClick={handleDisconnectGitHub}
                className="text-[11px] text-rose-500 hover:text-rose-700 font-medium px-2 py-1 rounded hover:bg-rose-50 transition-colors"
              >
                Disconnect
              </button>
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
                Connect your GitHub account directly with one click to verify private & public repositories without typing any tokens.
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

          <div className="relative flex items-center justify-center my-1">
            <div className="border-t border-slate-200 w-full"></div>
            <span className="bg-white px-2 text-[10px] uppercase font-bold text-slate-400 absolute tracking-wider">
              {username ? 'Repository Settings' : 'or enter token manually'}
            </span>
          </div>

          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                Repository (owner/repo)
              </label>
              <input
                type="text"
                placeholder="e.g. humblewriter01/Context_Pilot"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                required
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-indigo-500 font-mono"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">Branch</label>
                <input
                  type="text"
                  placeholder="main"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-indigo-500 font-mono"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-slate-700 uppercase">
                    GitHub Token <span className="text-slate-400 font-normal">(optional)</span>
                  </label>
                  {token && (
                    <button
                      type="button"
                      onClick={() => {
                        setToken('');
                        storageService.saveGitHubSettings('', repoName);
                      }}
                      className="text-[10px] text-rose-500 hover:text-rose-700 font-medium"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  placeholder="Enter personal access token (optional)"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-indigo-500 font-mono"
                />
                <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                  <span className="text-emerald-600 font-semibold">🔒 100% Client-side.</span> Never saved to our database. Read-only recommended.
                </p>
              </div>
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
                placeholder="Enter repository relative file paths (one per line)...&#10;src/components/MyComponent.tsx&#10;api/routes.ts"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-indigo-500 text-slate-800 leading-relaxed whitespace-nowrap overflow-x-auto"
                wrap="off"
                spellCheck={false}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !repoName.trim()}
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
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Verified Files in Repo ({result.verifiedFiles.length})
                  </h3>
                  <span className="text-xs text-emerald-600 font-medium">Direct match</span>
                </div>

                {result.verifiedFiles.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No exact file matches found in this branch.</p>
                ) : (
                  <div className="space-y-2">
                    {result.verifiedFiles.map((file) => (
                      <div
                        key={file.path}
                        className="flex items-center justify-between gap-3 p-2.5 bg-emerald-50/50 border border-emerald-200/60 rounded-lg text-xs"
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <code className="font-mono text-slate-800 truncate">{file.path}</code>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {file.size && (
                            <span className="text-slate-400 text-[11px]">
                              {(file.size / 1024).toFixed(1)} KB
                            </span>
                          )}
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-medium"
                          >
                            <span>View on GitHub</span>
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
                          <div className="min-w-0 flex-1">
                            <code className="font-mono text-rose-700 font-semibold line-through break-all text-xs">
                              {missing.path}
                            </code>
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
                                <code
                                  key={sug}
                                  title={sug}
                                  className="inline-block max-w-full sm:max-w-xs md:max-w-md truncate px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-mono text-[11px] border border-indigo-200/60 hover:bg-indigo-100/60 transition-colors cursor-default"
                                >
                                  {sug}
                                </code>
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
