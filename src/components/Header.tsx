import React from 'react';
import { UserProfile, UsageStats, SubscriptionTier } from '../types';
import { Layers, CheckCircle2, ShieldCheck, Zap, Compass, GitBranch, History, Laptop, CreditCard } from 'lucide-react';

interface HeaderProps {
  user: UserProfile;
  usage: UsageStats;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onTierChange: (tier: SubscriptionTier) => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  usage,
  activeTab,
  onTabChange,
  onTierChange
}) => {
  const tierColor = {
    free: 'bg-slate-100 text-slate-700 border-slate-300',
    pro: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    enterprise: 'bg-purple-50 text-purple-700 border-purple-200'
  }[user.subscriptionTier];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white shadow-md shadow-indigo-100">
              <svg width="22" height="22" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L2 6L8 10L14 6L8 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                <path d="M2 10L8 14L14 10" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-slate-900 tracking-tight">Context Pilot</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">v3.0</span>
              </div>
              <p className="text-xs text-slate-500">Jira Ticket Analyzer & Codebase Predictor</p>
            </div>
          </div>

          {/* Right Action / User & Quota */}
          <div className="flex items-center gap-4">
            {/* Quota indicator */}
            <div className="hidden md:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
              <div className="flex flex-col text-right">
                <span className="font-medium text-slate-700">
                  {usage.monthlyLimit === -1 ? (
                    'Unlimited Analyses'
                  ) : (
                    <span>
                      <strong className="text-indigo-600 font-bold">{usage.ticketsProcessedThisMonth}</strong> / {usage.monthlyLimit} tickets
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-slate-400">Monthly quota ({usage.monthYear})</span>
              </div>
              <div className="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#667eea] to-[#764ba2] rounded-full transition-all duration-300"
                  style={{
                    width: usage.monthlyLimit === -1
                      ? '100%'
                      : `${Math.min(100, (usage.ticketsProcessedThisMonth / usage.monthlyLimit) * 100)}%`
                  }}
                />
              </div>
            </div>

            {/* Subscription Badge */}
            <div className={`px-2.5 py-1 text-xs font-semibold rounded-md border capitalize flex items-center gap-1.5 ${tierColor}`}>
              <Zap className="w-3.5 h-3.5" />
              <span>{user.subscriptionTier} Plan</span>
            </div>

            {/* User Profile */}
            <div className="flex items-center gap-2.5 pl-2 border-l border-slate-200">
              <img
                src={user.photoUrl}
                alt={user.displayName}
                className="w-8 h-8 rounded-full border border-slate-300 object-cover"
              />
              <div className="hidden lg:block text-left text-xs">
                <div className="font-medium text-slate-800 leading-tight">{user.displayName}</div>
                <div className="text-slate-400 truncate max-w-[120px]">{user.email}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1 sm:space-x-4 border-t border-slate-100 overflow-x-auto no-scrollbar py-1">
          {[
            { id: 'jira', label: 'Jira Issue Analyzer', icon: Compass },
            { id: 'dashboard', label: 'Dashboard & Stats', icon: Layers },
            { id: 'github', label: 'GitHub Verifier', icon: GitBranch },
            { id: 'history', label: 'History & Feedback', icon: History },
            { id: 'extension', label: 'Extension Simulator', icon: Laptop },
            { id: 'subscription', label: 'Plans & Usage', icon: CreditCard }
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`flex items-center gap-2 px-3 py-2 text-xs sm:text-sm font-medium rounded-lg transition-all whitespace-nowrap ${
                  isActive
                    ? 'text-indigo-700 bg-indigo-50/70 border border-indigo-200 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 border border-transparent'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
