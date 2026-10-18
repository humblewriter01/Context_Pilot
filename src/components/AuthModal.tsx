import React, { useState } from 'react';
import { UserProfile } from '../types';
import { storageService } from '../services/storage';
import {
  X,
  Mail,
  Lock,
  User,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  GitBranch,
  ArrowLeft,
  RefreshCw,
  Key
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: UserProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onAuthSuccess }) => {
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot' | 'github'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // GitHub Auth Inputs
  const [gitHubUsername, setGitHubUsername] = useState('');
  const [gitHubToken, setGitHubToken] = useState('');

  // Listen for GitHub OAuth popup message
  React.useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'GITHUB_OAUTH_SUCCESS') {
        const { token, user: ghUser } = event.data;
        const loggedUser = storageService.loginWithGitHub(
          ghUser?.login || 'github_user',
          ghUser?.name || ghUser?.login,
          token
        );
        onAuthSuccess(loggedUser);
        onClose();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onAuthSuccess, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      if (mode === 'forgot') {
        if (!email.trim() || !email.includes('@')) {
          throw new Error('Please enter a valid email address');
        }
        await new Promise((r) => setTimeout(r, 600));
        setSuccessMessage(`Password reset instructions have been dispatched to ${email}. Please check your inbox.`);
        return;
      }

      if (mode === 'signup') {
        if (!displayName.trim()) throw new Error('Please enter your full name');
        if (!email.trim() || !email.includes('@')) throw new Error('Please enter a valid work email');
        if (!password || password.length < 6) throw new Error('Password must be at least 6 characters');

        await new Promise((r) => setTimeout(r, 600));
        const newUser = storageService.signupUser(email, displayName);
        onAuthSuccess(newUser);
        onClose();
        return;
      }

      if (mode === 'github') {
        if (!gitHubUsername.trim()) throw new Error('Please enter your GitHub username or email');
        await new Promise((r) => setTimeout(r, 600));
        const ghUser = storageService.loginWithGitHub(gitHubUsername, displayName, gitHubToken);
        onAuthSuccess(ghUser);
        onClose();
        return;
      }

      // Default: Sign In mode
      if (!email.trim()) throw new Error('Please enter your work email');
      if (!password) throw new Error('Please enter your password');

      await new Promise((r) => setTimeout(r, 500));
      const user = storageService.loginUser(email, displayName || email.split('@')[0]);
      onAuthSuccess(user);
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Authentication error. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickGitHub = async () => {
    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/auth/github/url?origin=${encodeURIComponent(window.location.origin)}`);
      const data = await res.json();

      if (data.isConfigured && data.url) {
        const popup = window.open(
          data.url,
          'github_oauth_auth_popup',
          'width=600,height=720,menubar=no,toolbar=no'
        );

        if (!popup) {
          setMode('github');
          setLoading(false);
          return;
        }

        // Listener is registered in useEffect
        return;
      }

      // If OAuth App is not configured, fall back to GitHub username form
      setMode('github');
    } catch {
      setMode('github');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-700 p-1 rounded-lg transition-colors"
          title="Close"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Brand Header */}
        <div className="p-6 pb-2 text-center space-y-1.5">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white mx-auto shadow-md">
            <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
              <path d="M8 2L2 6L8 10L14 6L8 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
              <path d="M2 10L8 14L14 10" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
            </svg>
          </div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight">
            {mode === 'signin' && 'Sign In to Context Pilot'}
            {mode === 'signup' && 'Create Your Account'}
            {mode === 'forgot' && 'Reset Password'}
            {mode === 'github' && 'Continue with GitHub'}
          </h2>
          <p className="text-xs text-slate-500 max-w-xs mx-auto">
            {mode === 'signin' && 'Access AI code impact predictions, audit history, and Jira tools'}
            {mode === 'signup' && 'Start predicting codebase changes and impact with engineering precision'}
            {mode === 'forgot' && 'Enter your email address to receive password reset instructions'}
            {mode === 'github' && 'Link your GitHub account to verify file paths and repository impact'}
          </p>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Social GitHub Button for standard Signin / Signup */}
          {(mode === 'signin' || mode === 'signup') && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleQuickGitHub}
                disabled={loading}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2.5 transition-colors shadow-2xs disabled:opacity-50"
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

              <div className="flex items-center my-3">
                <div className="flex-1 border-t border-slate-200" />
                <span className="px-3 text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  Or with email
                </span>
                <div className="flex-1 border-t border-slate-200" />
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-3.5">
            {mode === 'signup' && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    placeholder="Alex Morgan"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 bg-white focus:outline-indigo-500"
                  />
                </div>
              </div>
            )}

            {mode === 'github' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    GitHub Username or Email
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      placeholder="e.g. humblewriter01"
                      value={gitHubUsername}
                      onChange={(e) => setGitHubUsername(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 bg-white focus:outline-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    GitHub Personal Access Token (Optional)
                  </label>
                  <div className="relative">
                    <Key className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      placeholder="Enter personal access token"
                      value={gitHubToken}
                      onChange={(e) => setGitHubToken(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 font-mono bg-white focus:outline-indigo-500"
                    />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Allows repository file checking and avoids public GitHub rate limits.
                  </p>
                </div>
              </>
            )}

            {(mode === 'signin' || mode === 'signup' || mode === 'forgot') && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Work Email</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 bg-white focus:outline-indigo-500"
                  />
                </div>
              </div>
            )}

            {(mode === 'signin' || mode === 'signup') && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">Password</label>
                  {mode === 'signin' && (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setSuccessMessage(null);
                        setMode('forgot');
                      }}
                      className="text-[11px] text-indigo-600 hover:text-indigo-800 font-semibold"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-9 pr-9 py-2 border border-slate-300 rounded-xl text-xs text-slate-800 bg-white focus:outline-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 text-slate-400 hover:text-slate-600 absolute right-2.5 top-1/2 -translate-y-1/2"
                  >
                    {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-95 text-white font-bold rounded-xl text-xs transition-opacity shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <span>
                  {mode === 'signin' && 'Sign In'}
                  {mode === 'signup' && 'Create Free Account'}
                  {mode === 'forgot' && 'Send Reset Link'}
                  {mode === 'github' && 'Authorize GitHub Account'}
                </span>
              )}
            </button>
          </form>

          {/* Mode Switchers */}
          <div className="pt-2 text-center text-xs text-slate-500 border-t border-slate-100">
            {mode === 'signin' && (
              <p>
                Don't have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage(null);
                    setMode('signup');
                  }}
                  className="text-indigo-600 font-bold hover:underline"
                >
                  Sign up
                </button>
              </p>
            )}

            {mode === 'signup' && (
              <p>
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMessage(null);
                    setMode('signin');
                  }}
                  className="text-indigo-600 font-bold hover:underline"
                >
                  Sign in
                </button>
              </p>
            )}

            {(mode === 'forgot' || mode === 'github') && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setSuccessMessage(null);
                  setMode('signin');
                }}
                className="text-indigo-600 font-semibold hover:underline flex items-center gap-1.5 mx-auto"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to Sign In</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
