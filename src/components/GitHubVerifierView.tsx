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
  const [result, setResult] = useState<GitHubVerificationResult | null>(null);
  const [structure, setStructure] = useState<any>(null);

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

      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-900 text-xs sm:text-sm">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Verification Controls */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-5">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <FolderGit2 className="w-4 h-4 text-indigo-600" />
            Target Repository
          </h2>

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
                <label className="block text-xs font-semibold text-slate-700 uppercase mb-1">
                  GitHub Token <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <input
                  type="password"
                  placeholder="ghp_xxx for private repos"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-indigo-500 font-mono"
                />
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
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-mono focus:outline-indigo-500 text-slate-800 leading-relaxed"
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
                        className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <code className="font-mono text-rose-700 font-semibold">{missing.path}</code>
                          <span className="text-[11px] text-slate-400">{missing.reason}</span>
                        </div>

                        {missing.suggestions && missing.suggestions.length > 0 && (
                          <div className="pt-1.5 border-t border-slate-200/80 flex items-start gap-2">
                            <span className="text-indigo-600 font-medium shrink-0 flex items-center gap-1">
                              <Sparkles className="w-3 h-3" /> Potential paths:
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {missing.suggestions.map((sug) => (
                                <code
                                  key={sug}
                                  className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 font-mono text-[11px] border border-indigo-200/60"
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
