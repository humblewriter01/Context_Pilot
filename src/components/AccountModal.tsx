import React, { useState } from 'react';
import { UserProfile, UsageStats } from '../types';
import { storageService } from '../services/storage';
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
  Key,
  Calendar,
  Layers,
  ArrowRight
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
  const [displayName, setDisplayName] = useState(user.displayName);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // GitHub token settings
  const savedGh = storageService.getGitHubSettings();
  const [ghToken, setGhToken] = useState(savedGh.token);
  const [ghRepo, setGhRepo] = useState(savedGh.repo);
  const [ghUsername, setGhUsername] = useState(savedGh.username);
  const [ghSaved, setGhSaved] = useState(false);

  // Account deletion modal state
  const [confirmDeleteModal, setConfirmDeleteModal] = useState(false);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) return;

    const updated = storageService.updateProfile({
      displayName: displayName.trim(),
    });
    if (updated) {
      onUserUpdated(updated);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    }
  };

  const handleSaveGitHub = (e: React.FormEvent) => {
    e.preventDefault();
    storageService.saveGitHubSettings(ghToken.trim(), ghRepo.trim(), ghUsername.trim());
    setGhSaved(true);
    setTimeout(() => setGhSaved(false), 2500);
  };

  const handleConfirmAccountDeletion = () => {
    if (deleteConfirmationText.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm account deletion.');
      return;
    }

    storageService.deleteAccount();
    setConfirmDeleteModal(false);
    onAccountDeleted();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-6 pb-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img
              src={user.photoUrl}
              alt={user.displayName}
              className="w-11 h-11 rounded-full border border-slate-300 object-cover shadow-xs"
            />
            <div>
              <h2 className="text-lg font-bold text-slate-900">{user.displayName}</h2>
              <p className="text-xs text-slate-500">{user.email}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-200 px-6 bg-slate-50/70 text-xs font-semibold text-slate-600 gap-6">
          <button
            onClick={() => setActiveTab('profile')}
            className={`py-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'profile'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <User className="w-4 h-4" />
            <span>Profile & Subscription</span>
          </button>

          <button
            onClick={() => setActiveTab('integrations')}
            className={`py-3 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'integrations'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <GitBranch className="w-4 h-4" />
            <span>Connected Integrations</span>
          </button>

          <button
            onClick={() => setActiveTab('danger')}
            className={`py-3 border-b-2 transition-all flex items-center gap-1.5 ${
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
                  onClick={() => {
                    onClose();
                    onNavigateToPlans();
                  }}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs transition-colors shrink-0 flex items-center gap-1.5 shadow-2xs"
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

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs sm:text-sm bg-white focus:outline-indigo-500"
                  />
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
                    Your email address is managed through your primary login provider.
                  </p>
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
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

              {/* GitHub Integration */}
              <div className="p-4 rounded-xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-semibold text-slate-800 text-xs">GitHub Repository Access</div>
                      <div className="text-slate-500 text-[11px]">
                        {ghUsername ? `@${ghUsername}` : 'Used for file existence verification'}
                      </div>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold">
                    {ghToken ? 'Token Configured' : 'Public Access'}
                  </span>
                </div>

                <form onSubmit={handleSaveGitHub} className="space-y-3 pt-2 border-t border-slate-100">
                  {ghSaved && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>GitHub settings saved!</span>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      GitHub Username / Handle
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. humblewriter01"
                      value={ghUsername}
                      onChange={(e) => setGhUsername(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs bg-white focus:outline-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Personal Access Token (Optional)
                    </label>
                    <input
                      type="password"
                      placeholder="Enter personal access token"
                      value={ghToken}
                      onChange={(e) => setGhToken(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono bg-white focus:outline-indigo-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Enables verification of private repositories and 5,000 req/hr rate limits.
                    </p>
                  </div>

                  <div className="flex justify-end pt-1">
                    <button
                      type="submit"
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors"
                    >
                      Update GitHub Config
                    </button>
                  </div>
                </form>
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
                    onClick={() => {
                      setDeleteError(null);
                      setDeleteConfirmationText('');
                      setConfirmDeleteModal(true);
                    }}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 shadow-xs"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Delete Account...</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Account Deletion */}
      {confirmDeleteModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/70 animate-in fade-in">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4 border border-rose-300">
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
                className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAccountDeletion}
                className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
