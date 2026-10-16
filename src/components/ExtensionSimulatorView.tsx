import React, { useState } from 'react';
import { UserProfile, UsageStats } from '../types';
import {
  Laptop,
  Globe,
  Key,
  Shield,
  CheckCircle2,
  ExternalLink,
  Code2,
  Sparkles,
  Info
} from 'lucide-react';

interface ExtensionSimulatorViewProps {
  user: UserProfile;
  usage: UsageStats;
  onNavigateToJira: () => void;
}

export const ExtensionSimulatorView: React.FC<ExtensionSimulatorViewProps> = ({
  user,
  usage,
  onNavigateToJira
}) => {
  const [signedIn, setSignedIn] = useState(true);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Globe className="w-6 h-6 text-indigo-600" />
          Chrome Extension Simulator
        </h1>
        <p className="text-sm text-slate-500">
          Replicating the Chrome Extension popup (<code className="text-indigo-600 font-mono text-xs">popup.html</code>), Firebase authentication (<code className="text-indigo-600 font-mono text-xs">firebase_auth.js</code>), and <code className="text-indigo-600 font-mono text-xs">manifest.json</code>.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Authentic Extension Popup Frame */}
        <div className="flex flex-col items-center">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Live Popup UI (as rendered in Chrome Toolbar)
          </div>

          <div
            className="w-[340px] rounded-2xl overflow-hidden shadow-2xl border border-slate-300"
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white'
            }}
          >
            {/* Header */}
            <div className="p-5 text-center">
              <div className="w-12 h-12 mx-auto mb-3 bg-white rounded-xl flex items-center justify-center shadow-md">
                <svg width="28" height="28" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2L2 6L8 10L14 6L8 2Z" stroke="#667eea" strokeWidth="1.8" strokeLinejoin="round"/>
                  <path d="M2 10L8 14L14 10" stroke="#667eea" strokeWidth="1.8" strokeLinejoin="round"/>
                </svg>
              </div>
              <h2 className="text-lg font-bold">Jira Ticket Analyzer</h2>
              <p className="text-xs text-white/80">AI-powered file prediction</p>
            </div>

            {/* Auth / User Status card */}
            <div className="mx-4 mb-3 p-3 bg-white/10 backdrop-blur-md rounded-xl text-xs space-y-2 border border-white/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-semibold">Firebase Auth: Active</span>
                </div>
                <span className="capitalize font-bold text-amber-300">{user.subscriptionTier}</span>
              </div>
              <div className="text-white/80 truncate text-[11px]">{user.email}</div>
              <div className="flex justify-between items-center text-[10px] text-white/70 pt-1 border-t border-white/15">
                <span>Usage this month:</span>
                <span className="font-bold text-white">{usage.ticketsProcessedThisMonth} / {usage.monthlyLimit === -1 ? '∞' : usage.monthlyLimit}</span>
              </div>
            </div>

            {/* Main instructions container */}
            <div className="bg-white m-4 rounded-xl p-5 text-slate-800 shadow-lg space-y-4">
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                To analyze a Jira ticket:
              </p>
              <ol className="space-y-3 text-xs text-slate-600">
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                    1
                  </span>
                  <span>Navigate to any Jira ticket page (e.g. Atlassian Cloud)</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                    2
                  </span>
                  <span>Look for the <strong>"Analyze Files"</strong> button near the ticket title</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                    3
                  </span>
                  <span>Click it to get AI-powered predictions of which files need changes</span>
                </li>
              </ol>

              <button
                onClick={onNavigateToJira}
                className="w-full py-2 bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-95 text-white font-semibold rounded-lg text-xs transition-opacity shadow-sm flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Launch Jira Simulator
              </button>
            </div>

            {/* Footer */}
            <div className="p-4 text-center text-xs text-white/75">
              Made with ❤️ for developers
            </div>
          </div>
        </div>

        {/* Extension Configuration & Manifest details */}
        <div className="space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Shield className="w-4 h-4 text-indigo-600" />
              Manifest V3 Configuration
            </h3>

            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="font-semibold text-slate-800 block mb-1">Declared Permissions:</span>
                <div className="flex flex-wrap gap-1.5">
                  <code className="px-2 py-0.5 rounded bg-white border text-slate-700">activeTab</code>
                  <code className="px-2 py-0.5 rounded bg-white border text-slate-700">storage</code>
                  <code className="px-2 py-0.5 rounded bg-white border text-slate-700">identity</code>
                </div>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <span className="font-semibold text-slate-800 block mb-1">Content Script Matches:</span>
                <code className="px-2 py-0.5 rounded bg-white border text-indigo-700 font-mono">
                  *://*.atlassian.net/browse/*
                </code>
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-1">
                <span className="font-semibold text-slate-800 block">Injected Bundle:</span>
                <div className="text-slate-600 text-[11px] font-mono">
                  firebase-auth.js + content.js + styles.css
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs space-y-3 text-xs text-slate-600">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-indigo-600" />
              Architecture Highlights
            </h4>
            <p>
              • <strong>DOM Observers:</strong> The content script watches for single-page app (SPA) URL changes and dynamically attaches the button next to Jira summary headings.
            </p>
            <p>
              • <strong>Token Propagation:</strong> Authorization Bearer tokens are attached to every analysis and feedback POST request.
            </p>
            <p>
              • <strong>Zero Page Interference:</strong> The floating popover is encapsulated with clean responsive CSS and z-index 10000.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
