import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, CheckCircle2, AlertCircle } from 'lucide-react';
import { updatePassword } from '../services/supabase';

interface ResetPasswordModalProps {
  /** Called after the password has been updated successfully. */
  onCompleted: () => void;
  /** Lets the user abandon the recovery flow and return to the app / sign-in screen. */
  onDismiss: () => void;
}

/**
 * Completes a Supabase password-recovery link.
 * The recovery session is established by `detectSessionInUrl`; this modal only
 * asks for the new password and calls `supabase.auth.updateUser({ password })`.
 */
export const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({ onCompleted, onDismiss }) => {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDone, setIsDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Your new password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter them.');
      return;
    }

    setIsSaving(true);
    try {
      await updatePassword(password);
      setIsDone(true);
      setTimeout(() => onCompleted(), 1200);
    } catch (err: any) {
      setError(err?.message || 'Could not update your password. Please request a new reset link.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="bg-gradient-to-br from-[#667eea] to-[#764ba2] px-6 py-7 text-white">
          <div className="w-11 h-11 rounded-2xl bg-white/15 flex items-center justify-center mb-4">
            <KeyRound className="w-5 h-5" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">Choose a new password</h1>
          <p className="text-xs text-indigo-100 mt-1.5 leading-relaxed">
            Your recovery link was verified. Set a new password to regain access to your Context Pilot workspace.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {isDone ? (
            <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-sm">
              <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" />
              <span>Password updated successfully. Redirecting to your workspace…</span>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-start gap-2 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">New password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder="At least 8 characters"
                    className="w-full px-3.5 py-2.5 pr-10 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Confirm new password</label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Repeat your new password"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSaving ? 'Updating password…' : 'Update password'}
              </button>

              <button
                type="button"
                onClick={onDismiss}
                className="w-full text-xs font-medium text-slate-500 hover:text-slate-700 cursor-pointer"
              >
                Back to sign in
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPasswordModal;
