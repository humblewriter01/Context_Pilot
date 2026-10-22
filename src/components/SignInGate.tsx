import React, { useState } from 'react';
import { UserProfile, SubscriptionTier } from '../types';
import { storageService } from '../services/storage';
import { formatDisplayName } from './UserAvatar';
import {
  signInWithEmailPassword,
  signUpWithEmailPassword,
  resetPasswordForEmail,
  signInWithGitHub
} from '../services/supabase';
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
  Layers,
  AlertCircle,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

interface SignInGateProps {
  onAuthSuccess: (user: UserProfile) => void;
}

export const SignInGate: React.FC<SignInGateProps> = ({ onAuthSuccess }) => {
  const [tab, setTab] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfoMessage(null);
    setLoading(true);

    try {
      if (tab === 'forgot') {
        if (!email.trim() || !email.includes('@')) {
          throw new Error('Please enter a valid email address');
        }
        const dynamicRedirect = `${window.location.origin}/#reset-password`;
        const { error: resetErr } = await resetPasswordForEmail(email.trim(), dynamicRedirect);
        if (resetErr) {
          throw new Error(resetErr.message || 'Failed to dispatch password recovery link.');
        }
        setInfoMessage(`Password reset link dispatched to ${email.trim()}! Please check your inbox.`);
        return;
      }

      if (tab === 'signup') {
        if (!displayName.trim()) throw new Error('Please enter your full name');
        if (!email.trim() || !email.includes('@')) throw new Error('Please enter a valid email address');
        if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');

        const data = await signUpWithEmailPassword(email.trim(), password, displayName.trim());
        if (!data?.user) {
          throw new Error('Sign up failed: no user record returned by Supabase.');
        }

        // If email confirmation is required by Supabase configuration
        if (!data.session) {
          setInfoMessage(
            `Registration successful! A confirmation email has been sent to ${email.trim()}. Please verify your email before signing in.`
          );
          setTab('signin');
          return;
        }

        const u = data.user;
        const profile: UserProfile = {
          id: Date.now(),
          firebaseUid: u.id,
          email: u.email || email.trim().toLowerCase(),
          displayName: formatDisplayName(displayName.trim() || u.user_metadata?.display_name || u.user_metadata?.full_name, u.email || email),
          photoUrl: u.user_metadata?.avatar_url || '',
          subscriptionTier: 'free',
          createdAt: u.created_at || new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          status: 'active',
        };

        storageService.saveUser(profile);
        onAuthSuccess(profile);
        return;
      }

      // Default: Sign In strictly via Supabase auth.signInWithPassword
      if (!email.trim() || !email.includes('@')) throw new Error('Please enter your email address');
      if (!password) throw new Error('Please enter your password');

      const data = await signInWithEmailPassword(email.trim(), password);
      if (!data?.user) {
        throw new Error('Invalid login credentials');
      }

      const u = data.user;
      const profile: UserProfile = {
        id: Date.now(),
        firebaseUid: u.id,
        email: u.email || email.trim().toLowerCase(),
        displayName: formatDisplayName(
          u.user_metadata?.display_name ||
          u.user_metadata?.full_name ||
          displayName.trim(),
          u.email || email
        ),
        photoUrl: u.user_metadata?.avatar_url || '',
        subscriptionTier: (u.user_metadata?.subscription_tier as SubscriptionTier) || 'free',
        createdAt: u.created_at || new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        status: 'active',
      };

      storageService.saveUser(profile);
      onAuthSuccess(profile);
    } catch (err: any) {
      console.warn('[Authentication Notice]', err?.message || err);
      setError(err?.message || 'Invalid login credentials. Please check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  const handleGitHubAuth = async () => {
    setError(null);
    setInfoMessage(null);
    setLoading(true);
    try {
      await signInWithGitHub(`${window.location.origin}`);
    } catch (err: any) {
      console.warn('[GitHub Auth Notice]', err?.message || err);
      setError(err?.message || 'Authentication is currently unavailable. Please check server configuration.');
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
              <span>Supabase Authentication Required</span>
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
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
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
                    className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      tab === 'signup'
                        ? 'bg-indigo-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Create Account
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
                    className="text-xs text-indigo-400 hover:text-indigo-300 cursor-pointer"
                  >
                    Back to Sign In
                  </button>
                </div>
              )}

              {/* Error & Info Alerts */}
              {error && (
                <div className="p-3 bg-rose-500/15 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-start gap-2.5 animate-in fade-in duration-200">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}
              {infoMessage && (
                <div className="p-3 bg-emerald-500/15 border border-emerald-500/40 rounded-xl text-xs text-emerald-300 flex items-start gap-2.5 animate-in fade-in duration-200">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
                  <span className="leading-relaxed">{infoMessage}</span>
                </div>
              )}

              {/* GitHub OAuth Button */}
              {tab !== 'forgot' && (
                <div>
                  <button
                    type="button"
                    onClick={handleGitHubAuth}
                    disabled={loading}
                    className="w-full py-2.5 px-4 bg-slate-950 hover:bg-slate-800 border border-slate-700 hover:border-slate-600 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2.5 transition-all shadow-sm disabled:opacity-50 cursor-pointer"
                  >
                    <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                      <path
                        fillRule="evenodd"
                        clipRule="evenodd"
                        d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                      />
                    </svg>
                    <span>Continue with GitHub</span>
                  </button>

                  <div className="flex items-center my-3.5">
                    <div className="flex-1 border-t border-slate-800" />
                    <span className="px-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
                      Or continue with email
                    </span>
                    <div className="flex-1 border-t border-slate-800" />
                  </div>
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
                            className="text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors cursor-pointer"
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
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
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

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-bold rounded-xl text-xs transition-all shadow-md shadow-indigo-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Authenticating with Supabase...</span>
                    </>
                  ) : (
                    <>
                      <span>
                        {tab === 'signin'
                          ? 'Sign In to Workspace'
                          : tab === 'signup'
                          ? 'Create Account & Enter'
                          : 'Send Reset Link via Supabase'}
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
