import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { JiraSimulatorView } from './components/JiraSimulatorView';
import { DashboardView } from './components/DashboardView';
import { GitHubVerifierView } from './components/GitHubVerifierView';
import { HistoryFeedbackView } from './components/HistoryFeedbackView';
import { ExtensionSimulatorView } from './components/ExtensionSimulatorView';
import { SubscriptionPlansView } from './components/SubscriptionPlansView';
import { AdminPortal } from './components/AdminPortal';
import { AuthModal } from './components/AuthModal';
import { AccountModal } from './components/AccountModal';
import { SignInGate } from './components/SignInGate';
import { storageService } from './services/storage';
import {
  getSession,
  signOut,
  getOrInitSupabase,
  fetchUserFeedback,
  fetchUserSync,
  fetchAnalysisHistory,
  type UserSyncSnapshot,
  type RemoteAnalysisRecord,
} from './services/supabase';
import { readAuthRedirectError, clearAuthRedirectError } from './services/authErrors';
import { captureGitHubProviderToken, resetGitHubTokenCapture } from './services/github';
import ResetPasswordModal from './components/ResetPasswordModal';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { TermsOfService } from './components/TermsOfService';
import { formatDisplayName } from './components/UserAvatar';
import { getImpersonation, stopImpersonation, type ImpersonationInfo } from './services/impersonation';
import { Eye, LogOut } from 'lucide-react';
import { UserProfile, UsageStats, AnalysisRecord, FeedbackRecord, SubscriptionTier } from './types';

export const App: React.FC = () => {
  const [isCheckingSession, setIsCheckingSession] = useState<boolean>(true);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [usage, setUsage] = useState<UsageStats>(() => storageService.getUsage());
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>(() => storageService.getAnalyses());
  const [feedback, setFeedback] = useState<FeedbackRecord[]>(() => storageService.getFeedback());

  const [activeTab, setActiveTab] = useState<string>(() => {
    const hash = window.location.hash.replace('#', '').toLowerCase();
    if (['jira', 'dashboard', 'github', 'history', 'subscription', 'extension'].includes(hash)) {
      return hash;
    }
    const pinned = localStorage.getItem('cp_pinned_tab');
    if (pinned && ['jira', 'dashboard', 'github', 'history', 'subscription', 'extension'].includes(pinned)) {
      return pinned;
    }
    return 'jira';
  });
  const [gitHubFiles, setGitHubFiles] = useState<string[]>([]);
  const [impersonation, setImpersonation] = useState<ImpersonationInfo | null>(() => getImpersonation());
  // Responsive sidebar open state: open by default on desktop (>=768px), closed on mobile
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth >= 768;
    }
    return true;
  });

  // Modals
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);

  // A failed GitHub / e-mail-link redirect lands back here with the reason in the
  // URL. Capture it once so the sign-in screen can explain what happened.
  const [authRedirectError, setAuthRedirectError] = useState<string | null>(() => readAuthRedirectError());

  useEffect(() => {
    // Once somebody is signed in the old failure is no longer relevant.
    if (user) setAuthRedirectError(null);
  }, [user]);

  // Keep the impersonation banner in sync across tabs: the marker lives in
  // localStorage, so a Stop click in one tab (or a manual sign-out) clears it here too.
  useEffect(() => {
    const syncImpersonation = () => setImpersonation(getImpersonation());
    window.addEventListener('focus', syncImpersonation);
    window.addEventListener('storage', syncImpersonation);
    return () => {
      window.removeEventListener('focus', syncImpersonation);
      window.removeEventListener('storage', syncImpersonation);
    };
  }, []);

  const handleStopImpersonating = async () => {
    stopImpersonation();
    setImpersonation(null);
    try {
      await signOut();
    } catch (e) {
      console.warn('Sign out error:', e);
    }
    storageService.logoutUser();
    setUser(null);
    setUsage(storageService.getUsage());
  };

  // Password recovery (Supabase link -> update password)
  const [isRecoveryMode, setIsRecoveryMode] = useState(() => {
    if (typeof window === 'undefined') return false;
    const hash = window.location.hash.toLowerCase();
    return hash.includes('type=recovery') || hash.startsWith('#reset-password');
  });

  const clearRecoveryUrl = () => {
    if (typeof window !== 'undefined') {
      window.history.replaceState({}, '', window.location.pathname);
    }
    setIsRecoveryMode(false);
  };

  /**
   * Maps a Supabase analysis_history row into the local AnalysisRecord shape.
   */
  const mapRemoteAnalysis = (row: RemoteAnalysisRecord, tier: SubscriptionTier): AnalysisRecord => ({
    id: row.id,
    userId: 1,
    ticketKey: row.ticket_key,
    ticketTitle: row.ticket_title || row.ticket_key,
    ticketText: '',
    frontend_files: row.frontend_files || [],
    backend_files: row.backend_files || [],
    database_files: row.database_files || [],
    config_files: row.config_files || [],
    test_files: row.test_files || [],
    confidence_score: Number(row.confidence_score ?? 0),
    reasoning: row.reasoning || '',
    total_files: Number(row.total_files) || 0,
    processingTimeMs: Number(row.processing_time_ms) || 0,
    createdAt: row.created_at || new Date().toISOString(),
    userTier: tier,
  });

  /**
   * Pulls the authoritative tier, quota and history from the server and merges
   * them into local state so a new device or a cold serverless start stays in sync.
   */
  const hydrateFromServer = async (): Promise<void> => {
    const snapshot: UserSyncSnapshot | null = await fetchUserSync();
    if (!snapshot) return;

    const cached = storageService.getUser();
    if (cached) {
      const syncedUser: UserProfile = {
        ...cached,
        displayName: formatDisplayName(snapshot.displayName || cached.displayName, snapshot.email),
        photoUrl: snapshot.photoUrl || cached.photoUrl,
        subscriptionTier: snapshot.subscriptionTier,
        status: snapshot.status,
      };
      storageService.saveUser(syncedUser);
      setUser(syncedUser);
    }

    storageService.setUsageCount(snapshot.usage.ticketsProcessed, snapshot.usage.monthYear);
    setUsage(storageService.getUsage());

    const remoteRows = await fetchAnalysisHistory();
    if (remoteRows !== null) {
      const mapped = remoteRows.map((row) => mapRemoteAnalysis(row, snapshot.subscriptionTier));
      storageService.setAnalyses(mapped);
      setAnalyses(mapped);
    }
  };

  // URL route handling for /admin and public legal pages
  const checkIsAdmin = () => {
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    return path === '/admin' || path.startsWith('/admin/') || hash === '#/admin' || hash === '#admin';
  };

  const [isAdminRoute, setIsAdminRoute] = useState(checkIsAdmin);

  const checkLegalRoute = (): 'privacy' | 'terms' | null => {
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    if (path === '/privacy' || path.startsWith('/privacy/') || hash === '#/privacy' || hash === '#privacy') return 'privacy';
    if (path === '/terms' || path.startsWith('/terms/') || hash === '#/terms' || hash === '#terms') return 'terms';
    return null;
  };

  const [legalRoute, setLegalRoute] = useState<'privacy' | 'terms' | null>(checkLegalRoute);

  // Verify real Supabase session on app load
  useEffect(() => {
    let isMounted = true;

    async function verifyInitialSession() {
      try {
        const session = await getSession();
        if (!session || !session.user) {
          // No active Supabase session: purge any unverified local storage state
          if (isMounted) {
            storageService.logoutUser();
            setUser(null);
          }
        } else {
          // Legitimate Supabase session verified.
          // Right after a GitHub OAuth redirect the session still carries the
          // provider token; hand it to the backend once so the connection
          // survives refreshes and sign-outs. Never persisted in the browser.
          captureGitHubProviderToken(session).catch((e) =>
            console.warn('GitHub connection capture failed:', e?.message || e)
          );
          const u = session.user;
          const cached = storageService.getUser();
          const verifiedUser: UserProfile = {
            id: cached?.id || Date.now(),
            firebaseUid: u.id,
            email: u.email || cached?.email || '',
            displayName: formatDisplayName(
              u.user_metadata?.display_name ||
              u.user_metadata?.full_name ||
              cached?.displayName,
              u.email
            ),
            photoUrl: u.user_metadata?.avatar_url || cached?.photoUrl || '',
            subscriptionTier:
              (u.user_metadata?.subscription_tier as SubscriptionTier) ||
              cached?.subscriptionTier ||
              'free',
            createdAt: u.created_at || cached?.createdAt || new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
            status: 'active',
          };

          if (isMounted) {
            storageService.saveUser(verifiedUser);
            setUser(verifiedUser);
            setUsage(storageService.getUsage());
            setAnalyses(storageService.getAnalyses());
            hydrateFromServer().catch((e) => console.warn('Server hydration failed:', e));
            fetchUserFeedback().then((remote) => {
              if (isMounted && remote && remote.length > 0) {
                const mapped: FeedbackRecord[] = remote.map((r, idx) => ({
                  id: idx + 1,
                  userId: 1,
                  analysisId: r.analysis_id || 0,
                  ticketKey: r.ticket_key,
                  wasAccurate: r.was_accurate,
                  accuracyRating: r.rating || 5,
                  missingFiles: [],
                  incorrectFiles: r.actual_files || [],
                  userComment: r.comments || '',
                  createdAt: r.created_at || new Date().toISOString(),
                }));
                setFeedback(mapped);
              }
            }).catch(() => {});
          }
        }
      } catch (err) {
        console.warn('Initial session verification error:', err);
        if (isMounted) {
          storageService.logoutUser();
          setUser(null);
        }
      } finally {
        // The auth client has finished reading the redirect by now.
        clearAuthRedirectError();
        if (isMounted) {
          setIsCheckingSession(false);
        }
      }
    }

    verifyInitialSession();

    // Listen to real-time auth changes from Supabase
    let authUnsubscribe: (() => void) | null = null;
    getOrInitSupabase().then((client) => {
      if (!client || !isMounted) return;
      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (!isMounted) return;
        if (event === 'PASSWORD_RECOVERY') {
          setIsRecoveryMode(true);
          return;
        }
        if (event === 'SIGNED_OUT' || !session) {
          resetGitHubTokenCapture();
          stopImpersonation();
          setImpersonation(null);
          storageService.logoutUser();
          setUser(null);
        } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
          // Capture the GitHub provider token whenever Supabase hands us a
          // fresh one (only right after the OAuth redirect). The backend
          // stores it encrypted; the browser never keeps it.
          if (session.provider_token) {
            captureGitHubProviderToken(session).catch((e) =>
              console.warn('GitHub connection capture failed:', e?.message || e)
            );
          }
          if (event === 'INITIAL_SESSION') return; // handled by verifyInitialSession
          const u = session.user;
          const cached = storageService.getUser();
          const verifiedUser: UserProfile = {
            id: cached?.id || Date.now(),
            firebaseUid: u.id,
            email: u.email || cached?.email || '',
            displayName: formatDisplayName(
              u.user_metadata?.display_name ||
              u.user_metadata?.full_name ||
              cached?.displayName,
              u.email
            ),
            photoUrl: u.user_metadata?.avatar_url || cached?.photoUrl || '',
            subscriptionTier:
              (u.user_metadata?.subscription_tier as SubscriptionTier) ||
              cached?.subscriptionTier ||
              'free',
            createdAt: u.created_at || cached?.createdAt || new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
            status: 'active',
          };
          storageService.saveUser(verifiedUser);
          setUser(verifiedUser);
          hydrateFromServer().catch(() => {});
        }
      });
      authUnsubscribe = () => data.subscription.unsubscribe();
    });

    return () => {
      isMounted = false;
      if (authUnsubscribe) {
        authUnsubscribe();
      }
    };
  }, []);

  useEffect(() => {
    const handleLocationChange = () => {
      setIsAdminRoute(checkIsAdmin());
      setLegalRoute(checkLegalRoute());
      const hash = window.location.hash.replace('#', '').toLowerCase();
      if (['jira', 'dashboard', 'github', 'history', 'subscription', 'extension'].includes(hash)) {
        setActiveTab(hash);
      }
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);
    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  const navigateToApp = () => {
    window.history.pushState({}, '', '/');
    window.location.hash = '';
    setIsAdminRoute(false);
    setLegalRoute(null);
  };

  const refreshAllData = async () => {
    setUser(storageService.getUser());
    setUsage(storageService.getUsage());
    setAnalyses(storageService.getAnalyses());
    const localFb = storageService.getFeedback();
    try {
      const remote = await fetchUserFeedback();
      if (remote && remote.length > 0) {
        const mapped: FeedbackRecord[] = remote.map((r, idx) => ({
          id: idx + 1,
          userId: 1,
          analysisId: r.analysis_id || 0,
          ticketKey: r.ticket_key,
          wasAccurate: r.was_accurate,
          accuracyRating: r.rating || 5,
          missingFiles: [],
          incorrectFiles: r.actual_files || [],
          userComment: r.comments || '',
          createdAt: r.created_at || new Date().toISOString(),
        }));
        setFeedback(mapped);
        return;
      }
    } catch (e) {
      console.warn('Could not fetch remote feedback:', e);
    }
    setFeedback(localFb);
  };

  const handleTierChange = (tier: SubscriptionTier) => {
    const updatedUser = storageService.updateTier(tier);
    if (updatedUser) {
      setUser(updatedUser);
      setUsage(storageService.getUsage());
    }
  };

  const handleLogout = async () => {
    try {
      await signOut();
    } catch (e) {
      console.warn('Sign out error:', e);
    }
    stopImpersonation();
    setImpersonation(null);
    storageService.logoutUser();
    setUser(null);
    setUsage(storageService.getUsage());
  };

  const handleAccountDeleted = () => {
    setUser(null);
    setAnalyses([]);
    setFeedback([]);
    setUsage(storageService.getUsage());
    setActiveTab('jira');
  };

  const handleNavigateToGitHub = (files: string[]) => {
    setGitHubFiles(files);
    setActiveTab('github');
  };

  const handleSelectAnalysis = (record: AnalysisRecord) => {
    const files = [
      ...(record.frontend_files || []),
      ...(record.backend_files || []),
      ...(record.database_files || []),
      ...(record.config_files || []),
      ...(record.test_files || []),
    ];
    setGitHubFiles(files);
    setActiveTab('github');
  };

  // The marker lives in localStorage (shared across same-origin tabs by design), but
  // the warning only belongs in the tab that is actually signed in as the target
  // user. The admin tab that opened the impersonation link keeps its own session,
  // so comparing emails avoids showing a misleading banner there.
  const activeImpersonation =
    impersonation && user?.email && user.email.trim().toLowerCase() === impersonation.email
      ? impersonation
      : null;

  // Persistent warning shown while the app session is impersonating a user.
  const impersonationBanner = activeImpersonation ? (
    <div
      role="alert"
      className="fixed top-0 inset-x-0 z-[100] flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-400 text-amber-950 px-4 py-2 text-xs shadow-md"
    >
      <Eye className="w-4 h-4 shrink-0" />
      <span className="font-semibold text-center">
        You are viewing as <span className="font-extrabold">{activeImpersonation.email}</span>.
      </span>
      <button
        type="button"
        onClick={handleStopImpersonating}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-950 text-amber-50 text-[11px] font-bold uppercase tracking-wide hover:bg-amber-900 transition-colors"
      >
        <LogOut className="w-3.5 h-3.5" />
        Stop Impersonating
      </button>
    </div>
  ) : null;

  // Public legal pages — no authentication required
  if (legalRoute === 'privacy') {
    return <PrivacyPolicy onBackToHome={navigateToApp} />;
  }
  if (legalRoute === 'terms') {
    return <TermsOfService onBackToHome={navigateToApp} />;
  }

  // If path is /admin or #/admin, render protected Enterprise Admin Portal
  if (isAdminRoute) {
    return (
      <div className="bg-slate-950 min-h-screen">
        {impersonationBanner}
        {activeImpersonation && <div className="h-9" aria-hidden="true" />}
        <AdminPortal onBackToApp={navigateToApp} />
      </div>
    );
  }

  // Session verification loading screen on app load
  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-white">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white font-black text-lg shadow-lg shadow-indigo-500/30 mb-4 animate-pulse">
          CP
        </div>
        <div className="flex items-center gap-2.5 text-xs text-slate-300 font-medium">
          <svg className="animate-spin h-4 w-4 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Verifying your session...</span>
        </div>
      </div>
    );
  }

  // Password recovery takes precedence over the auth gate (the recovery link
  // establishes a temporary session, so the app would otherwise skip sign-in).
  if (isRecoveryMode) {
    return (
      <ResetPasswordModal
        onCompleted={() => {
          clearRecoveryUrl();
          hydrateFromServer().catch(() => {});
        }}
        onDismiss={clearRecoveryUrl}
      />
    );
  }

  // Strict Authentication Gate: User must sign in via Supabase before accessing any workspace features
  if (!user) {
    return (
      <SignInGate
        initialError={authRedirectError}
        onAuthSuccess={(authedUser) => {
          setUser(authedUser);
          setUsage(storageService.getUsage());
          setAnalyses(storageService.getAnalyses());
          setFeedback(storageService.getFeedback());
        }}
      />
    );
  }

  return (
    <div className={`min-h-screen bg-slate-50 flex text-slate-900 font-sans relative overflow-x-hidden ${activeImpersonation ? 'pt-9' : ''}`}>
      {impersonationBanner}
      {/* Responsive Left Sidebar */}
      <Sidebar
        user={user}
        usage={usage}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          // On mobile, auto-close drawer upon navigation
          if (typeof window !== 'undefined' && window.innerWidth < 768) {
            setSidebarOpen(false);
          }
        }}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
        onOpenAccountModal={() => setIsAccountModalOpen(true)}
        onLogout={handleLogout}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 w-full overflow-y-auto">
        <Header
          user={user}
          usage={usage}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          onOpenAccountModal={() => setIsAccountModalOpen(true)}
          onLogout={handleLogout}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          isSidebarOpen={sidebarOpen}
        />

        <main className="flex-1 pb-16">
          {activeTab === 'jira' && (
            <JiraSimulatorView
              usage={usage}
              onUsageUpdated={setUsage}
              onNavigateToGitHub={handleNavigateToGitHub}
              onNavigateToPlans={() => setActiveTab('subscription')}
            />
          )}

          {activeTab === 'dashboard' && (
            <DashboardView
              user={user}
              usage={usage}
              analyses={analyses}
              feedback={feedback}
              onSelectAnalysis={handleSelectAnalysis}
              onNavigateToPlans={() => setActiveTab('subscription')}
            />
          )}

          {activeTab === 'github' && (
            <GitHubVerifierView initialFiles={gitHubFiles} />
          )}

          {activeTab === 'history' && (
            <HistoryFeedbackView
              analyses={analyses}
              feedback={feedback}
              onVerifyOnGitHub={handleNavigateToGitHub}
              onRefreshData={refreshAllData}
              onAnalysesUpdated={setAnalyses}
            />
          )}

          {activeTab === 'extension' && (
            <ExtensionSimulatorView
              user={user}
              usage={usage}
              onNavigateToJira={() => setActiveTab('jira')}
            />
          )}

          {activeTab === 'subscription' && (
            <SubscriptionPlansView
              user={user}
              usage={usage}
              onTierChanged={handleTierChange}
              onOpenAuthModal={() => setIsAuthModalOpen(true)}
              onBackToApp={() => setActiveTab('jira')}
            />
          )}
        </main>

        {/* Professional Enterprise Footer */}
        <footer className="bg-white border-t border-slate-200 py-6 text-xs text-slate-500">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <div className="w-5 h-5 rounded-md bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white text-[10px] font-bold">
                CP
              </div>
              <span className="font-semibold text-slate-800">Context Pilot</span>
              <span>•</span>
              <span>AI Code Impact & Jira Prediction Engine</span>
            </div>

            <div className="flex items-center gap-4 text-slate-400">
              <span>Enterprise Architecture</span>
              <span>•</span>
              <span>Paystack Secured</span>
              <span>•</span>
              <span>© {new Date().getFullYear()} Hausa Cybertech</span>
            </div>
          </div>
        </footer>
      </div>

      {/* Auth Modal (Sign In, Sign Up, Forgot Password) */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        onAuthSuccess={(authedUser) => {
          setUser(authedUser);
          setUsage(storageService.getUsage());
          setIsAuthModalOpen(false);
        }}
      />

      {/* Account Settings & Danger Zone Modal (with Account Deletion) */}
      {user && (
        <AccountModal
          isOpen={isAccountModalOpen}
          onClose={() => setIsAccountModalOpen(false)}
          user={user}
          usage={usage}
          onUserUpdated={(updated) => {
            setUser(updated);
          }}
          onAccountDeleted={handleAccountDeleted}
          onNavigateToPlans={() => {
            setIsAccountModalOpen(false);
            setActiveTab('subscription');
          }}
        />
      )}
    </div>
  );
};
