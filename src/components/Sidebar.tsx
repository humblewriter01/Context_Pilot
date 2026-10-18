import React, { useState, useRef, useEffect } from 'react';
import { UserProfile, UsageStats } from '../types';
import {
  Compass,
  Layers,
  GitBranch,
  History,
  Laptop,
  CreditCard,
  LogOut,
  UserCheck,
  Settings,
  MoreVertical,
  Check,
  Pin,
  ExternalLink,
  X
} from 'lucide-react';

interface SidebarProps {
  user: UserProfile | null;
  usage: UsageStats;
  activeTab: string;
  onTabChange: (tab: string) => void;
  // Primary props
  isOpen?: boolean;
  onClose?: () => void;
  // Backwards compatibility props
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  onOpenAuthModal: () => void;
  onOpenAccountModal: () => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  usage,
  activeTab,
  onTabChange,
  isOpen: propIsOpen,
  onClose,
  collapsed,
  onToggleCollapse,
  onOpenAuthModal,
  onOpenAccountModal,
  onLogout,
}) => {
  // Determine if sidebar is open: propIsOpen takes precedence, then !collapsed fallback
  const isOpen = propIsOpen !== undefined ? propIsOpen : !collapsed;

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else if (onToggleCollapse) {
      onToggleCollapse();
    }
  };

  const [itemMenuOpen, setItemMenuOpen] = useState<string | null>(null);
  const [pinnedTab, setPinnedTab] = useState<string>(() => {
    try {
      return localStorage.getItem('cp_pinned_tab') || 'jira';
    } catch {
      return 'jira';
    }
  });
  const [copiedTab, setCopiedTab] = useState<string | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setItemMenuOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems = [
    { id: 'jira', label: 'Ticket Analyzer', icon: Compass, badge: 'Live' },
    { id: 'dashboard', label: 'Analytics & Impact', icon: Layers },
    { id: 'github', label: 'GitHub Verifier', icon: GitBranch },
    { id: 'history', label: 'Audit History', icon: History },
    { id: 'subscription', label: 'Plans & Pricing', icon: CreditCard },
    { id: 'extension', label: 'Browser Integration', icon: Laptop },
  ];

  const handlePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedTab(id);
    try {
      localStorage.setItem('cp_pinned_tab', id);
    } catch {
      // storage unavailable
    }
    setItemMenuOpen(null);
  };

  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCopiedTab(id);
    navigator.clipboard?.writeText?.(`${window.location.origin}#${id}`);
    setTimeout(() => {
      setCopiedTab(null);
      setItemMenuOpen(null);
    }, 1200);
  };

  return (
    <>
      {/* Mobile Overlay Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40 md:hidden transition-opacity duration-300"
          onClick={handleClose}
          aria-hidden="true"
        />
      )}

      {/* 
        Responsive Sidebar Container:
        - Mobile: fixed drawer overlaying content, translates off-screen when closed
        - Desktop: in-flow flex child that pushes the main content to the right when open;
                   transitions width to 0 when collapsed so the main content expands to 100% full width.
      */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 bg-white select-none
          md:static md:z-30 md:h-screen md:sticky md:top-0
          transition-all duration-300 ease-in-out shrink-0
          ${isOpen ? 'translate-x-0 shadow-2xl md:shadow-none' : '-translate-x-full md:translate-x-0'}
          ${isOpen ? 'w-64 md:w-64 md:opacity-100 border-r border-slate-200' : 'w-64 md:w-0 md:opacity-0 md:border-none overflow-hidden md:pointer-events-none'}
        `}
        aria-hidden={!isOpen}
      >
        {/* 
          Fixed-width inner container (w-64):
          Keeps text, logos, meters, and buttons at exact dimensions during open/collapse animation,
          preventing text from wrapping awkwardly or squishing as the parent width transitions.
        */}
        <div className="w-64 h-full flex flex-col justify-between overflow-y-auto">
          {/* Top Brand Header (Single Control: No chevron toggle button next to logo) */}
          <div>
            <div className="h-16 border-b border-slate-200 px-4 flex items-center justify-between">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white shrink-0 shadow-md">
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                    <path d="M8 2L2 6L8 10L14 6L8 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                    <path d="M2 10L8 14L14 10" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="truncate">
                  <span className="font-bold text-sm text-slate-900 tracking-tight block">Context Pilot</span>
                  <span className="text-[11px] text-slate-400 block truncate">Impact Prediction</span>
                </div>
              </div>

              {/* Close button visible only on mobile drawer for tactile closing convenience */}
              <button
                type="button"
                onClick={handleClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors md:hidden"
                title="Close sidebar"
                aria-label="Close sidebar"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Navigation list */}
            <div className="p-3 space-y-1 relative" ref={menuRef}>
              {/* Workspace Header */}
              <div className="px-3 py-1.5 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Workspace
                </span>
              </div>

              {/* Nav items list */}
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const isMenuOpen = itemMenuOpen === item.id;

                return (
                  <div key={item.id} className="relative group">
                    <div
                      className={`flex items-center justify-between rounded-xl text-xs font-semibold transition-all ${
                        isActive
                          ? 'bg-gradient-to-r from-indigo-50 to-purple-50/50 text-indigo-700 border border-indigo-200/80 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70 border border-transparent'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onTabChange(item.id)}
                        className="flex-1 flex items-center gap-3 px-3 py-2.5 truncate text-left focus:outline-none"
                      >
                        <Icon
                          className={`w-4 h-4 shrink-0 transition-colors ${
                            isActive ? 'text-indigo-600' : 'text-slate-400 group-hover:text-slate-600'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </button>

                      <div className="flex items-center gap-1 pr-2 shrink-0">
                        {pinnedTab === item.id && (
                          <Pin className="w-3 h-3 text-indigo-500 fill-indigo-500 shrink-0" />
                        )}

                        {/* Three Dots Item Action Button (Non-nested sibling button) */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setItemMenuOpen(isMenuOpen ? null : item.id);
                          }}
                          className={`p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 opacity-0 group-hover:opacity-100 transition-opacity ${
                            isMenuOpen ? 'opacity-100 bg-slate-200/60 text-slate-800' : ''
                          }`}
                          title="Options (•••)"
                          aria-label={`${item.label} actions`}
                        >
                          <MoreVertical className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Per-Item Ellipsis Popup Menu */}
                    {isMenuOpen && (
                      <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-slate-200 rounded-xl shadow-lg p-1.5 z-50 text-xs animate-in fade-in">
                        <button
                          type="button"
                          onClick={() => {
                            onTabChange(item.id);
                            setItemMenuOpen(null);
                          }}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 text-slate-700 text-left font-medium"
                        >
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Switch to view</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handlePin(item.id, e)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 text-slate-700 text-left"
                        >
                          <Pin className="w-3.5 h-3.5 text-indigo-500" />
                          <span>{pinnedTab === item.id ? 'Unpin default' : 'Pin as default view'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleCopy(item.id, e)}
                          className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 text-slate-700 text-left"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                          <span>{copiedTab === item.id ? 'Copied link!' : 'Copy direct link'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Profile & Usage */}
          <div className="p-3 border-t border-slate-200 space-y-3">
            {/* Monthly Ticket Meter */}
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-slate-600">Monthly Usage</span>
                <span className="font-bold text-slate-900">
                  {usage.ticketsProcessedThisMonth} / {usage.monthlyLimit === -1 ? 'Unlimited' : usage.monthlyLimit}
                </span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-[#667eea] to-[#764ba2] h-full rounded-full transition-all"
                  style={{
                    width:
                      usage.monthlyLimit === -1
                        ? '100%'
                        : `${Math.min(100, (usage.ticketsProcessedThisMonth / usage.monthlyLimit) * 100)}%`,
                  }}
                />
              </div>
            </div>

            {/* User Profile or Sign In CTA */}
            {user ? (
              <div className="flex items-center justify-between gap-2 pt-1">
                <div
                  onClick={onOpenAccountModal}
                  className="flex items-center gap-2.5 truncate cursor-pointer hover:opacity-80 transition-opacity flex-1"
                  title="Account Settings"
                >
                  <img
                    src={user.photoUrl}
                    alt={user.displayName}
                    className="w-8 h-8 rounded-full border border-slate-300 object-cover shrink-0"
                  />
                  <div className="truncate text-left text-xs">
                    <div className="font-bold text-slate-800 truncate leading-tight">{user.displayName}</div>
                    <div className="text-[11px] text-slate-400 truncate">{user.email}</div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={onOpenAccountModal}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                    title="Account Settings"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={onLogout}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                    title="Sign Out"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={onOpenAuthModal}
                className="w-full py-2 bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-95 text-white font-semibold rounded-xl text-xs transition-opacity shadow-xs"
              >
                Sign In / Sign Up
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
};
