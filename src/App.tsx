import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { JiraSimulatorView } from './components/JiraSimulatorView';
import { DashboardView } from './components/DashboardView';
import { GitHubVerifierView } from './components/GitHubVerifierView';
import { HistoryFeedbackView } from './components/HistoryFeedbackView';
import { ExtensionSimulatorView } from './components/ExtensionSimulatorView';
import { SubscriptionPlansView } from './components/SubscriptionPlansView';
import { storageService } from './services/storage';
import { UserProfile, UsageStats, AnalysisRecord, FeedbackRecord, SubscriptionTier } from './types';
import { CheckCircle2, GitBranch, Layers, ShieldCheck } from 'lucide-react';

export const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile>(() => storageService.getUser());
  const [usage, setUsage] = useState<UsageStats>(() => storageService.getUsage());
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>(() => storageService.getAnalyses());
  const [feedback, setFeedback] = useState<FeedbackRecord[]>(() => storageService.getFeedback());

  const [activeTab, setActiveTab] = useState<string>('jira');
  const [gitHubFiles, setGitHubFiles] = useState<string[]>([]);

  const refreshAllData = () => {
    setUser(storageService.getUser());
    setUsage(storageService.getUsage());
    setAnalyses(storageService.getAnalyses());
    setFeedback(storageService.getFeedback());
  };

  const handleTierChange = (tier: SubscriptionTier) => {
    const updatedUser = storageService.updateTier(tier);
    setUser(updatedUser);
    setUsage(storageService.getUsage());
  };

  const handleUsageReset = () => {
    const updatedUsage = storageService.resetUsage();
    setUsage(updatedUsage);
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
      ...(record.test_files || [])
    ];
    setGitHubFiles(files);
    setActiveTab('github');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900 font-sans">
      {/* Top Header */}
      <Header
        user={user}
        usage={usage}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onTierChange={handleTierChange}
      />

      {/* Main View Area */}
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
            onUsageReset={handleUsageReset}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded-md bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white text-[10px] font-bold">
              CP
            </div>
            <span className="font-semibold text-slate-700">Context Pilot</span>
            <span>•</span>
            <span>AI Code Impact & Jira Ticket Prediction System</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <span>Powered by Google Gemini 3.8 Flash</span>
            <span>•</span>
            <span className="text-indigo-600 font-semibold">Context Pilot v3.0</span>
          </div>
        </div>
      </footer>
    </div>
  );
};
