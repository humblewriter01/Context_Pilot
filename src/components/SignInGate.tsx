import React, { useState } from 'react';
import { UserProfile } from '../types';
import { storageService } from '../services/storage';
import { resetPasswordForEmail } from '../services/supabase';
import {
  Mail,
  Lock,
  User,
  ArrowRight,
  ShieldCheck,
  Zap,
  GitBranch,
  Sparkles,
  Eye,
  EyeOff,
  CheckCircle2,
  Key,
  Layers,
  ExternalLink
} from 'lucide-react';

interface SignInGateProps {
  onAuthSuccess: (user: UserProfile) => void;
}

export const SignInGate: React.FC<SignInGateProps> = ({ onAuthSuccess }) => {
  const [tab, setTab] = useState<'signin' | 'signup' | 'github' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  // GitHub Quick Sign-in fields
  const [gitHubUsername, setGitHubUsername] = useState('');
  const [gitHubToken, setGitHubToken] = useState('');

  // Handle GitHub OAuth popup message if opened
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GITHUB_OAUTH_SUCCESS') {
        const { token, user: ghUser } = event.data;
        const logged = storageService.loginWithGitHub(
          ghUser?.login || 'developer',
          ghUser?.name || ghUser?.login,
          token
        );
        onAuthSuccess(logged);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onAuthSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);

    try {
      if (tab === 'forgot') {
        if (!email.trim() || !email.includes('@')) throw new Error('Please enter a valid email address');
        const { error: resetErr } = await resetPasswordForEmail(email.trim());
        if (resetErr) {
          throw new Error(resetErr.message || 'Failed to dispatch reset link via Supabase');
        }
        setInfoMessage(`Password reset link sent to ${email.trim()} via Supabase! Please check your inbox.`);
        return;
      }

      if (tab === 'signup') {
        if (!displayName.trim()) throw new Error('Please enter your full name');
        if (!email.trim() || !email.includes('@')) throw new Error('Please enter a valid email address');
        if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');

        await new Promise((r) => setTimeout(r, 400));
        const newUser = storageService.signupUser(email, displayName);
        onAuthSuccess(newUser);
        return;
      }

      if (tab === 'github') {
        if (!gitHubUsername.trim()) throw new Error('Please enter your GitHub username or email');
        await new Promise((r) => setTimeout(r, 400));
        const ghUser = storageService.loginWithGitHub(gitHubUsername, displayName, gitHubToken);
        onAuthSuccess(ghUser);
        return;
      }

      // Default: Sign In
      if (!email.trim() || !email.includes('@')) throw new Error('Please enter your email address');
      if (!password) throw new Error('Please enter your password');

      await new Promise((r) => setTimeout(r, 350));
      const authed = storageService.loginUser(email, displayName || email.split('@')[0]);
      onAuthSuccess(authed);
    } catch (err: any) {
      setError(err?.message || 'Authentication failed. Please verify your details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 text-white flex flex-col justify-between font-sans selection:bg-indigo-500 selection:text-white">
      {/* Top Navbar */}
      <header className="border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-md sticky top-0 z-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white font-black text-sm shadow-md shadow-indigo-500/20">
              CP
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-white">Context Pilot</span>
              <span className="hidden sm:inline-block ml-2 text-xs text-indigo-400 font-mono bg-indigo-950/60 border border-indigo-800/40 px-2 py-0.5 rounded">
                v3.0 Production
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Authentication Section */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-12 relative overflow-hidden">
        {/* Decorative glow */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center relative z-10">
          {/* Left Column: Product Value Proposition */}
          <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Sign in required to access workspace</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-tight">
              Predict Codebase Impact from Jira Tickets.
            </h1>

            <p className="text-sm sm:text-base text-slate-300 leading-relaxed max-w-xl mx-auto lg:mx-0">
              Context Pilot analyzes issue descriptions, predicts which frontend, backend, database, and configuration files need modifications, and verifies them against your real GitHub repository.
            </p>

            {/* Feature Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left pt-2">
              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-indigo-300">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <span>AI File Prediction</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Maps Jira requirements to exact code files and REST/RPC endpoints.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                  <GitBranch className="w-4 h-4 text-emerald-400" />
                  <span>GitHub Verification</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Live verification against branches to confirm existing paths.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
                  <ShieldCheck className="w-4 h-4 text-purple-400" />
                  <span>Paystack Billing</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Tiered usage quotas with secure multi-tier subscription upgrades.
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-1">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Jira Extension</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Integrated extension simulator ready for workflow automation.
                </p>
              </div>
            </div>
          </div>

          {/* Right Column: Authentication Card */}
          <div className="lg:col-span-6 flex justify-center">
            <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-2xl shadow-2xl p-6 sm:p-8 backdrop-blur-xl space-y-6">
              {/* Card Tabs (Hidden when in Forgot mode) */}
              {tab !== 'forgot' ? (
                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setTab('signin');
                      setError(null);
                      setInfoMessage(null);
                    }}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                      tab === 'signin'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTab('signup');
                      setError(null);
                      setInfoMessage(null);
                    }}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                      tab === 'signup'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Create Account
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTab('github');
                      setError(null);
                      setInfoMessage(null);
                    }}
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${
                      tab === 'github'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    GitHub
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                  <span className="font-bold text-sm text-white">Reset Password via Supabase</span>
                  <button
                    type="button"
                    onClick={() => {
                      setTab('signin');
                      setError(null);
                      setInfoMessage(null);
                    }}
                    className="text-xs text-indigo-400 hover:text-indigo-300"
                  >
                    Back to Sign In
                  </button>
                </div>
              )}

              {/* Error & Info Alerts */}
              {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                  {error}
                </div>
              )}
              {infoMessage && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-xs text-emerald-300">
                  {infoMessage}
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                {tab === 'signup' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1.5">
                      Full Name
                    </label>
                    <div className="relative">
                      <User className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="e.g. Ameenu Jaafar"
                        className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-indigo-500 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}

                {tab === 'forgot' && (
                  <div className="space-y-3">
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Enter your registered email address and Supabase will dispatch a password recovery link.
                    </p>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Account Email Address
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="developer@company.com"
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {(tab === 'signin' || tab === 'signup') && (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Work Email Address
                      </label>
                      <div className="relative">
                        <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="developer@company.com"
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-medium text-slate-300">
                          Password
                        </label>
                        {tab === 'signin' && (
                          <button
                            type="button"
                            onClick={() => {
                              setTab('forgot');
                              setError(null);
                              setInfoMessage(null);
                            }}
                            className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="••••••••"
                          className="w-full pl-9 pr-10 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-indigo-500 focus:border-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      {tab === 'signup' && (
                        <p className="text-[10px] text-slate-500 mt-1">Must be at least 6 characters</p>
                      )}
                    </div>
                  </>
                )}

                {tab === 'github' && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        GitHub Username / Handle
                      </label>
                      <div className="relative">
                        <GitBranch className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          required
                          value={gitHubUsername}
                          onChange={(e) => setGitHubUsername(e.target.value)}
                          placeholder="e.g. humblewriter01"
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-indigo-500 focus:border-indigo-500"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-300 mb-1.5">
                        Personal Access Token (Optional)
                      </label>
                      <div className="relative">
                        <Key className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          type="password"
                          value={gitHubToken}
                          onChange={(e) => setGitHubToken(e.target.value)}
                          placeholder="Personal access token for private repos"
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-indigo-500 focus:border-indigo-500 font-mono"
                        />
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Optional: Enables verifying private repos and 5,000 req/hr rate limits.
                      </p>
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <span>Processing...</span>
                  ) : (
                    <>
                      <span>
                        {tab === 'signin'
                          ? 'Sign In to Workspace'
                          : tab === 'signup'
                          ? 'Create Account & Enter'
                          : tab === 'forgot'
                          ? 'Send Reset Link via Supabase'
                          : 'Connect with GitHub'}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Privacy Notice */}
              <div className="pt-2 border-t border-slate-800">
                <p className="text-[11px] text-center text-slate-500">
                  By continuing, you agree to our Terms of Service & Privacy Policy.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-4 text-xs text-slate-500 bg-slate-950/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-400">Context Pilot</span>
            <span>•</span>
            <span>Jira Ticket Codebase Impact Engine</span>
          </div>

          <div className="flex items-center gap-4 text-slate-500">
            <span>Supabase Enabled</span>
            <span>•</span>
            <span>Paystack Billing</span>
            <span>•</span>
            <span>© {new Date().getFullYear()} Hausa Cybertech</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
