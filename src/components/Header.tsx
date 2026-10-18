import React, { useState } from 'react';
import { UserProfile, UsageStats, SubscriptionTier } from '../types';
import {
  Menu,
  Zap,
  User,
  LogOut,
  ChevronDown,
  Settings,
  CreditCard
} from 'lucide-react';

interface HeaderProps {
  user: UserProfile | null;
  usage: UsageStats;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenAuthModal: () => void;
  onOpenAccountModal: () => void;
  onLogout: () => void;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  usage,
  activeTab,
  onTabChange,
  onOpenAuthModal,
  onOpenAccountModal,
  onLogout,
  onToggleSidebar,
  isSidebarOpen,
}) => {
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const tier = user?.subscriptionTier || 'free';
  const tierColor = {
    free: 'bg-slate-100 text-slate-700 border-slate-300',
    pro: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    enterprise: 'bg-purple-50 text-purple-700 border-purple-200',
  }[tier];

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left: Single Sidebar Toggle & Brand Title */}
          <div className="flex items-center gap-3 shrink-0">
            {onToggleSidebar && (
              <button
                type="button"
                onClick={onToggleSidebar}
                className="p-2 -ml-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 flex items-center justify-center cursor-pointer"
                title={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
                aria-expanded={isSidebarOpen}
              >
                <Menu className="w-5 h-5" />
              </button>
            )}

            <div className="flex items-center gap-2.5">
              <span className="font-bold text-base sm:text-lg text-slate-900 tracking-tight whitespace-nowrap">
                Context Pilot
              </span>
              <span className="hidden sm:inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 whitespace-nowrap">
                Code Impact Engine
              </span>
            </div>
          </div>

          {/* Right Action / Quota & Profile */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Quota indicator */}
            <div className="hidden lg:flex items-center gap-3 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
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
                <span className="text-[10px] text-slate-400">Monthly quota</span>
              </div>
            </div>

            {/* Subscription Badge */}
            {user && (
              <div className={`px-2.5 py-1 text-xs font-semibold rounded-md border capitalize flex items-center gap-1.5 ${tierColor}`}>
                <Zap className="w-3.5 h-3.5" />
                <span>{user.subscriptionTier} Plan</span>
              </div>
            )}

            {/* User Profile or Sign In Button */}
            {user ? (
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-50 transition-colors focus:outline-none"
                >
                  <img
                    src={user.photoUrl}
                    alt={user.displayName}
                    className="w-8 h-8 rounded-full border border-slate-300 object-cover"
                  />
                  <div className="hidden sm:block text-left text-xs">
                    <div className="font-bold text-slate-800 leading-tight truncate max-w-[120px]">
                      {user.displayName}
                    </div>
                    <div className="text-slate-400 truncate max-w-[120px] text-[11px]">{user.email}</div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
                </button>

                {/* Profile Dropdown */}
                {dropdownOpen && (
                  <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-2xl shadow-xl py-1 z-30 animate-in fade-in">
                    <div className="px-3.5 py-2.5 border-b border-slate-100 text-xs">
                      <div className="font-bold text-slate-900">{user.displayName}</div>
                      <div className="text-slate-400 truncate text-[11px]">{user.email}</div>
                    </div>

                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        onOpenAccountModal();
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                    >
                      <Settings className="w-3.5 h-3.5 text-slate-400" />
                      <span>Account Settings</span>
                    </button>

                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        onTabChange('subscription');
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                        <span>Plans & Pricing</span>
                      </div>
                      <span className="capitalize font-semibold text-indigo-600 text-[11px]">{user.subscriptionTier}</span>
                    </button>

                    <div className="border-t border-slate-100 my-1" />

                    <button
                      onClick={() => {
                        setDropdownOpen(false);
                        onLogout();
                      }}
                      className="w-full text-left px-3.5 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={onOpenAuthModal}
                className="px-3.5 py-1.5 bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-95 text-white font-semibold rounded-lg text-xs shadow-xs transition-opacity"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
