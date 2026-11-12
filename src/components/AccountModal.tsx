import React, { useState, useEffect } from 'react';
import { UserProfile, UsageStats } from '../types';
import { storageService } from '../services/storage';
import { updateUserProfile } from '../services/supabase';
import { UserAvatar, formatDisplayName } from './UserAvatar';
import {
  X,
  User,
  Mail,
  ShieldAlert,
  GitBranch,
  CreditCard,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Save,
  ArrowLeft,
  RefreshCw
} from 'lucide-react';

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: UserProfile;
  usage: UsageStats;
  onUserUpdated: (user: UserProfile) => void;
  onAccountDeleted: () => void;
  onNavigateToPlans: () => void;
}

export const AccountModal: React.FC<AccountModalProps> = ({
  isOpen,
  onClose,
  user,
  usage,
  onUserUpdated,
  onAccountDeleted,
  onNavigateToPlans,
}) => {
  const [activeTab, setActiveTab] = useState<'profile' | 'integrations' | 'danger'>('profile');
  const cleanDisplayName = formatDisplayName(user.displayName, user.email);
  const [displayName, setDisplayName] = useState(cleanDisplayName);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Sync display name state if user prop changes
  useEffect(() => {
    setDisplayName(formatDisplayName(user.displayName, user.email));
  }, [user.displayName, user.email]);

  // Handle ESC key press to close modal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);


  // Account deletion modal state
  const [confirmDeleteModal, setConfirmDeleteModal] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  if (!isOpen) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (!trimmed || savingProfile) return;

    setSavingProfile(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      // Persist to public.users through the backend (the browser cannot write
      // that table directly), then refresh the Supabase session. Only a
      // confirmed server save updates the local cache and shows success.
      const savedName = await updateUserProfile(trimmed);
      const updated = storageService.updateProfile({ displayName: savedName });
      if (updated) {
        onUserUpdated(updated);
      } else {
        onUserUpdated({ ...user, displayName: savedName });
      }
      setDisplayName(savedName);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      setSaveError(err?.message || 'Failed to save your profile. Please try again.');
    } finally {
      setSavingProfile(false);
    }
  };


  const handleConfirmAccountDeletion = async () => {
    if (deleteConfirmationText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm account deletion.');
      return;
    }

    setIsDeleting(true);
    try {
      await storageService.deleteAccount();
      setConfirmDeleteModal(false);
      onAccountDeleted();
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 cursor-pointer"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-modal-title"
    >
      <div
        className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-5 sm:p-6 pb-4 border-b border-slate-200 flex items-center justify-between bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <UserAvatar
              photoUrl={user.photoUrl}
              displayName={cleanDisplayName}
              email={user.email}
              size="lg"
            />
            <div className="min-w-0">
              <h2 id="account-modal-title" className="text-lg font-bold text-slate-900 truncate">
                {cleanDisplayName}
              </h2>
              <p className="text-xs text-slate-500 truncate">{user.email}</p>
            </div>
          </div>

          {/* Prominent Close "X" Button */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 -mr-1 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-all cursor-pointer border border-transparent hover:border-slate-200 shrink-0"
            title="Close (Esc)"
            aria-label="Close profile modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 px-6 bg-slate-50/70 text-xs font-semibold text-slate-600 gap-6">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`py-3 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'profile'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Profile & Subscription</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('integrations')}
            className={`py-3 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'integrations'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <GitBranch className="w-4 h-4" />
            <span>Connected Integrations</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('danger')}
            className={`py-3 border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'danger'
                ? 'border-rose-600 text-rose-600 font-bold'
                : 'border-transparent hover:text-rose-600 text-slate-500'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-rose-500" />
            <span>Danger Zone</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800 text-xs sm:text-sm">
          {activeTab === 'profile' && (
            <div className="space-y-6">
              {/* Subscription Overview Card */}
              <div className="p-4 bg-gradient-to-br from-indigo-50/60 to-purple-50/40 rounded-xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600">
                    Active Plan
                  </span>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 capitalize">
                      {user.subscriptionTier} Plan
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[11px]">
                      {usage.monthlyLimit === -1 ? 'Unlimited' : `${usage.monthlyLimit} tickets/mo`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500">
                    Used {usage.ticketsProcessedThisMonth} tickets this billing cycle.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onNavigateToPlans();
                  }}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs transition-colors shrink-0 flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  <span>Change Plan</span>
                </button>
              </div>

              {/* Profile details form */}
              <form onSubmit={handleSaveProfile} className="space-y-4">
                {saveSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Profile updated successfully!</span>
                  </div>
                )}

                {saveError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{saveError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    maxLength={80}
                    disabled={savingProfile}
                    placeholder="e.g. ameenujaafar432"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm bg-white focus:outline-indigo-500 disabled:opacity-60"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Used across analysis exports and audit log records.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={user.email}
                    disabled
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm bg-slate-50 text-slate-500 cursor-not-allowed font-mono"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    Your email address is tied to your sign-in method and cannot be changed here.
                  </p>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingProfile || !displayName.trim()}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {savingProfile ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving…</span>
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {activeTab === 'integrations' && (
            <div className="space-y-5">
              <div>
                <h3 className="font-bold text-slate-900 text-sm mb-1">Connected Accounts</h3>
                <p className="text-xs text-slate-500">
                  Manage your authentication methods and codebase integrations.
                </p>
              </div>

              {/* Email Authentication */}
              <div className="p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-800 text-xs">Work Email</div>
                    <div className="text-slate-500 text-[11px]">{user.email}</div>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-semibold">
                  Connected
                </span>
              </div>

              {/* GitHub OAuth status; token entry is intentionally not supported here. */}
              <div className="p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                      <GitBranch className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800 text-xs">GitHub Repository Access</div>
                      <div className="text-slate-500 text-[11px]">
                        Authorize from the GitHub Codebase Verifier
                      </div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full border text-[11px] font-semibold bg-slate-100 text-slate-700 border-slate-200">
                    GitHub OAuth
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 border-t border-slate-100 pt-3">
                  GitHub authorization is stored securely on the server and stays connected across refreshes and sign-ins. Manage it from the GitHub Codebase Verifier.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'danger' && (
            <div className="space-y-4">
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl space-y-3">
                <div className="flex items-center gap-2 text-rose-800 font-bold text-sm">
                  <AlertTriangle className="w-5 h-5 text-rose-600" />
                  <span>Permanent Account Deletion</span>
                </div>
                <p className="text-xs text-rose-700 leading-relaxed">
                  Deleting your account will immediately revoke access to your active subscription, erase all saved Jira ticket predictions, delete model accuracy feedback, and wipe your cached tokens. This action is irreversible.
                </p>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteConfirmationText('');
                      setConfirmDeleteModal(true);
                    }}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Account...</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer with explicit Close button */}
        <div className="p-4 px-6 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <span className="text-[11px] text-slate-400">Press ESC or click outside to close</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-semibold shadow-2xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Confirmation Modal for Account Deletion */}
      {confirmDeleteModal && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 animate-in fade-in cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            setConfirmDeleteModal(false);
          }}
        >
          <div
            className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4 border border-rose-300 cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-xl bg-rose-100 flex items-center justify-center text-rose-600 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-bold text-base text-slate-900">Confirm Account Deletion</h3>
              <p className="text-xs text-slate-500">
                Are you absolutely sure you want to delete <strong className="text-slate-800">{user.email}</strong>?
              </p>
            </div>

            {deleteError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 text-xs">
                {deleteError}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Type <span className="font-mono text-rose-600 font-bold">DELETE</span> to confirm:
              </label>
              <input
                type="text"
                value={deleteConfirmationText}
                onChange={(e) => setDeleteConfirmationText(e.target.value)}
                placeholder="DELETE"
                className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono text-center tracking-widest uppercase focus:outline-rose-500"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteModal(false)}
                disabled={isDeleting}
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAccountDeletion}
                disabled={isDeleting}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isDeleting ? 'Deleting…' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
