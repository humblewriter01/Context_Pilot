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
import { UserProfile, UsageStats, AnalysisRecord, FeedbackRecord, SubscriptionTier } from './types';

export const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(() => storageService.getUser());
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

  // URL route handling for /admin
  const checkIsAdmin = () => {
    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();
    return path === '/admin' || path.startsWith('/admin/') || hash === '#/admin' || hash === '#admin';
  };

  const [isAdminRoute, setIsAdminRoute] = useState(checkIsAdmin);

  useEffect(() => {
    const handleLocationChange = () => {
      setIsAdminRoute(checkIsAdmin());
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
  };

  const refreshAllData = () => {
    setUser(storageService.getUser());
    setUsage(storageService.getUsage());
    setAnalyses(storageService.getAnalyses());
    setFeedback(storageService.getFeedback());
  };

  const handleTierChange = (tier: SubscriptionTier) => {
    const updatedUser = storageService.updateTier(tier);
    if (updatedUser) {
      setUser(updatedUser);
      setUsage(storageService.getUsage());
    }
  };

  const handleLogout = () => {
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

  // If path is /admin or #/admin, render protected Enterprise Admin Portal
  if (isAdminRoute) {
    return <AdminPortal onBackToApp={navigateToApp} />;
  }

  // Strict Authentication Gate: User must sign in before accessing any application features
  if (!user) {
    return (
      <SignInGate
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
    <div className="min-h-screen bg-slate-50 flex text-slate-900 font-sans relative overflow-x-hidden">
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

      {/* Auth Modal (Sign In, Sign Up, Forgot Password, GitHub) */}
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
