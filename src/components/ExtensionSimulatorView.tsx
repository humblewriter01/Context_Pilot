import React, { useState } from 'react';
import { UserProfile, UsageStats } from '../types';
import {
  Globe,
  Shield,
  Download,
  Copy,
  Check,
  CheckCircle2,
  ExternalLink,
  Code2,
  Sparkles,
  Info,
  Key
} from 'lucide-react';

interface ExtensionSimulatorViewProps {
  user: UserProfile;
  usage: UsageStats;
  onNavigateToJira: () => void;
}

export const ExtensionSimulatorView: React.FC<ExtensionSimulatorViewProps> = ({
  user,
  usage,
  onNavigateToJira,
}) => {
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedManifest, setCopiedManifest] = useState(false);

  const apiToken = `cp_live_${btoa(user.email || 'developer')}_${user.id}`;

  const manifestJson = `{
  "manifest_version": 3,
  "name": "Context Pilot - Jira Code Impact",
  "version": "3.0.0",
  "description": "AI-powered Jira ticket code impact and file prediction",
  "permissions": ["activeTab", "storage"],
  "content_scripts": [
    {
      "matches": ["*://*.atlassian.net/browse/*"],
      "js": ["content.js"],
      "css": ["styles.css"]
    }
  ]
}`;

  const handleCopyToken = () => {
    navigator.clipboard.writeText(apiToken);
    setCopiedToken(true);
    setTimeout(() => setCopiedToken(false), 2000);
  };

  const handleCopyManifest = () => {
    navigator.clipboard.writeText(manifestJson);
    setCopiedManifest(true);
    setTimeout(() => setCopiedManifest(false), 2000);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Globe className="w-6 h-6 text-indigo-600" />
          Browser Extension & Jira Integration
        </h1>
        <p className="text-sm text-slate-500">
          Connect Context Pilot directly into your Atlassian Jira Cloud instance to predict codebase impact while browsing issues.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        {/* Authentic Extension Popup Frame */}
        <div className="flex flex-col items-center">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Toolbar Popup Interface
          </div>

          <div
            className="w-[340px] rounded-2xl overflow-hidden shadow-2xl border border-slate-300"
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
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
              <h2 className="text-lg font-bold">Context Pilot</h2>
              <p className="text-xs text-white/80">Jira Codebase Impact Predictor</p>
            </div>

            {/* Auth / User Status card */}
            <div className="mx-4 mb-3 p-3 bg-white/10 backdrop-blur-md rounded-xl text-xs space-y-2 border border-white/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-semibold">Workspace Connected</span>
                </div>
                <span className="capitalize font-bold text-amber-300">{user.subscriptionTier}</span>
              </div>
              <div className="text-white/80 truncate text-[11px]">{user.email}</div>
              <div className="flex justify-between items-center text-[10px] text-white/70 pt-1 border-t border-white/15">
                <span>Monthly usage:</span>
                <span className="font-bold text-white">
                  {usage.ticketsProcessedThisMonth} / {usage.monthlyLimit === -1 ? '∞' : usage.monthlyLimit} tickets
                </span>
              </div>
            </div>

            {/* Main instructions container */}
            <div className="bg-white m-4 rounded-xl p-5 text-slate-800 shadow-lg space-y-4">
              <p className="text-xs text-slate-600 font-medium leading-relaxed">
                How to use on any Atlassian Jira issue:
              </p>
              <ol className="space-y-3 text-xs text-slate-600">
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                    1
                  </span>
                  <span>Navigate to any Jira issue page (e.g. yourcompany.atlassian.net)</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                    2
                  </span>
                  <span>Look for the <strong>"Analyze Code Impact"</strong> button near the ticket title</span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-gradient-to-br from-[#667eea] to-[#764ba2] text-white font-bold flex items-center justify-center shrink-0 text-[11px]">
                    3
                  </span>
                  <span>View exact affected components, routes, database migrations, and tests</span>
                </li>
              </ol>

              <button
                onClick={onNavigateToJira}
                className="w-full py-2.5 bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-95 text-white font-semibold rounded-lg text-xs transition-opacity shadow-sm flex items-center justify-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Test Issue Analyzer in Web App</span>
              </button>
            </div>

            {/* Footer */}
            <div className="p-4 text-center text-xs text-white/75">
              Production Extension Package v3.0
            </div>
          </div>
        </div>

        {/* Extension Configuration & Installation */}
        <div className="space-y-6">
          {/* API Token Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Key className="w-4 h-4 text-indigo-600" />
              <span>Workspace Integration Token</span>
            </h3>
            <p className="text-xs text-slate-500">
              Use this bearer token to authenticate your browser extension requests with Context Pilot API.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={apiToken}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-800"
              />
              <button
                onClick={handleCopyToken}
                className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold shrink-0 transition-colors flex items-center gap-1.5"
              >
                {copiedToken ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedToken ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Manifest V3 details */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Shield className="w-4 h-4 text-indigo-600" />
                <span>Manifest V3 Package</span>
              </h3>
              <button
                onClick={handleCopyManifest}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold flex items-center gap-1"
              >
                {copiedManifest ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedManifest ? 'Copied' : 'Copy Manifest'}</span>
              </button>
            </div>

            <div className="p-3 bg-slate-900 rounded-xl overflow-x-auto text-slate-200 text-xs font-mono leading-relaxed max-h-48">
              <pre>{manifestJson}</pre>
            </div>
          </div>

          {/* Installation Instructions */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-3 text-xs text-slate-600">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Info className="w-4 h-4 text-indigo-600" />
              <span>3-Step Installation in Chrome / Edge / Brave</span>
            </h4>
            <div className="space-y-2 leading-relaxed">
              <p>
                1. Open <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-slate-800">chrome://extensions/</code> in your browser and enable <strong>Developer mode</strong> (toggle top right).
              </p>
              <p>
                2. Click <strong>Load unpacked</strong> and select the extension directory.
              </p>
              <p>
                3. Open any Jira issue on <code className="px-1.5 py-0.5 rounded bg-slate-100 font-mono text-slate-800">*.atlassian.net/browse/*</code> — the <strong>"Analyze Code Impact"</strong> button will automatically mount next to the issue header!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
