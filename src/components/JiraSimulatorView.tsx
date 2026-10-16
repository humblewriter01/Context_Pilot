import React, { useState } from 'react';
import { JiraTicket, CategorizedFiles, UsageStats, AnalysisRecord } from '../types';
import { JiraAnalyzerPopover } from './JiraAnalyzerPopover';
import { analyzeTicket } from '../services/analyzer';
import { storageService } from '../services/storage';
import {
  FileCode,
  Tag,
  User,
  AlertCircle,
  CheckCircle2,
  Share2,
  MoreHorizontal,
  Bookmark,
  Clock,
  Sparkles,
  Edit3,
  RefreshCw,
  PlusCircle,
  Cpu,
  AlertTriangle
} from 'lucide-react';

interface JiraSimulatorViewProps {
  usage: UsageStats;
  onUsageUpdated: (usage: UsageStats) => void;
  onNavigateToGitHub: (files: string[]) => void;
  onNavigateToPlans: () => void;
}

interface TicketTemplate {
  label: string;
  key: string;
  title: string;
  description: string;
  priority: 'Highest' | 'High' | 'Medium' | 'Low';
  components: string[];
}

const TEMPLATES: TicketTemplate[] = [
  {
    label: 'OAuth 2.0 Auth Flow',
    key: 'PROJ-101',
    title: 'Implement Google OAuth 2.0 and JWT Refresh Session Tokens',
    description: `Implement Google OAuth 2.0 flow for web and mobile clients.
Users should be able to click 'Sign In with Google' from the login page and get redirected through the consent screen.

Requirements:
1. Handle callback at /auth/callback and exchange authorization code for Google profile and JWT tokens.
2. Store refresh tokens encrypted in PostgreSQL database (users table / user_sessions).
3. Implement express authentication middleware verifying bearer JWT tokens on all protected API endpoints.
4. Add client-side GoogleSignInButton component with loading states and session context provider.
5. Provide unit tests for token verification and integration tests for authentication lifecycle.`,
    priority: 'High',
    components: ['Authentication', 'Backend API', 'Frontend Client'],
  },
  {
    label: 'Stripe Webhook Bug',
    key: 'PROJ-102',
    title: 'Fix Stripe Webhook Signature Verification in Checkout Flow',
    description: `Users report subscription upgrades failing silently. Webhook endpoint /api/webhooks/stripe returns 400 bad signature because express.json() parses the raw payload before Stripe SDK can verify stripe-signature header.

Steps to reproduce:
1. Trigger checkout.session.completed test event from Stripe CLI.
2. Server logs: Error: Webhook signature verification failed.
3. Subscription status remains inactive.

Fix needed:
- Mount express.raw({ type: 'application/json' }) specifically on the webhook route before global JSON body parser.
- Update stripe.service.ts to handle customer.subscription.updated and invoice.payment_succeeded.
- Add database transaction updating user subscription tier and invoice history.`,
    priority: 'Highest',
    components: ['Billing', 'Payment Gateways'],
  },
  {
    label: 'Dark Mode & Navbar',
    key: 'PROJ-103',
    title: 'Responsive Dashboard Navigation Bar with Dark Mode Theme',
    description: `Redesign the main navigation bar to be fully responsive on mobile devices and support seamless dark mode switching.

Details:
- Add a sticky top navigation bar with collapsible hamburger sidebar for screens under 768px.
- Create ThemeToggle component supporting system preference, light, and dark mode.
- Store user preference in localStorage and synchronize with UserPreferences table on backend.
- Configure Tailwind CSS dark mode selector and audit contrast ratios for WCAG AA compliance.`,
    priority: 'Medium',
    components: ['Design System', 'Frontend Client'],
  },
];

export const JiraSimulatorView: React.FC<JiraSimulatorViewProps> = ({
  usage,
  onUsageUpdated,
  onNavigateToGitHub,
  onNavigateToPlans,
}) => {
  const [ticketKey, setTicketKey] = useState('PROJ-101');
  const [ticketTitle, setTicketTitle] = useState(
    'Implement Google OAuth 2.0 and JWT Refresh Session Tokens'
  );
  const [ticketDescription, setTicketDescription] = useState(
    TEMPLATES[0].description
  );
  const [priority, setPriority] = useState<'Highest' | 'High' | 'Medium' | 'Low'>('High');
  const [status, setStatus] = useState<'To Do' | 'In Progress' | 'In Review' | 'Done'>('In Progress');
  const [componentsList, setComponentsList] = useState<string>('Authentication, Backend API, Frontend');

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<
    (CategorizedFiles & { processingTimeMs?: number; id?: number }) | null
  >(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [activeAnalysisTicketKey, setActiveAnalysisTicketKey] = useState<string>('');

  const handleApplyTemplate = (tmpl: TicketTemplate) => {
    setTicketKey(tmpl.key);
    setTicketTitle(tmpl.title);
    setTicketDescription(tmpl.description);
    setPriority(tmpl.priority);
    setComponentsList(tmpl.components.join(', '));
    setAnalysisResult(null);
    setAnalysisError(null);
  };

  const handleAnalyze = async () => {
    setAnalysisError(null);

    if (!ticketTitle.trim() && !ticketDescription.trim()) {
      setAnalysisError('Please enter a ticket title or description to analyze.');
      return;
    }

    // Check usage limits
    if (!usage.canAnalyze) {
      setQuotaExceeded(true);
      return;
    }

    setQuotaExceeded(false);
    setAnalyzing(true);
    const startTime = Date.now();

    try {
      const fullText = `${ticketTitle}\n\n${ticketDescription}`;
      const result = await analyzeTicket(fullText, ticketKey || 'TICKET-01');
      const processingTime = Date.now() - startTime;

      const record: AnalysisRecord = {
        id: Date.now(),
        userId: 1,
        ticketKey: ticketKey || 'TICKET-01',
        ticketTitle: ticketTitle || 'Untitled Ticket',
        ticketText: fullText,
        ...result,
        processingTimeMs: processingTime,
        createdAt: new Date().toISOString(),
        userTier: storageService.getUser().subscriptionTier,
      };

      storageService.saveAnalysis(record);
      const updatedUsage = storageService.getUsage();
      onUsageUpdated(updatedUsage);

      setActiveAnalysisTicketKey(ticketKey || 'TICKET-01');
      setAnalysisResult({
        ...result,
        processingTimeMs: processingTime,
        id: record.id,
      });
    } catch (err: any) {
      console.error('Gemini Analysis failed:', err);
      setAnalysisError(err?.message || 'Failed to complete analysis. Please verify your Gemini connection.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Banner explaining Jira simulator and Gemini Model */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900 text-white shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center shrink-0">
            <Cpu className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-sm sm:text-base">Real-Time Jira Ticket Analyzer</h2>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold uppercase tracking-wider">
                Gemini 3.8 Flash
              </span>
            </div>
            <p className="text-xs text-slate-300">
              Live AI analysis without mock data. Evaluates requirements to predict impacted files across the full stack.
            </p>
          </div>
        </div>

        {/* Quick Template Picker */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <span className="text-xs text-slate-400">Load Template:</span>
          <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
            {TEMPLATES.map((tmpl) => (
              <button
                key={tmpl.key}
                onClick={() => handleApplyTemplate(tmpl)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                  ticketKey === tmpl.key
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                {tmpl.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {analysisError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-900 text-sm animate-in fade-in">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="font-semibold">Analysis Error:</strong>
            <p className="text-xs text-rose-800 leading-relaxed">{analysisError}</p>
          </div>
        </div>
      )}

      {/* Quota Exceeded Alert */}
      {quotaExceeded && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-between text-amber-900 text-sm">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <strong>Monthly ticket limit reached!</strong> You have processed {usage.ticketsProcessedThisMonth} of{' '}
              {usage.monthlyLimit} tickets on your current tier.
            </div>
          </div>
          <button
            onClick={onNavigateToPlans}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg text-xs transition-colors shrink-0"
          >
            Upgrade Plan or Reset Usage
          </button>
        </div>
      )}

      {/* Jira Browser Container */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {/* Atlassian Jira Header Chrome */}
        <div className="bg-slate-100/80 border-b border-slate-200 px-6 py-3 flex items-center justify-between text-xs text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            <span className="ml-3 font-mono text-slate-400">
              https://company.atlassian.net/browse/{ticketKey || 'PROJ-XXX'}
            </span>
          </div>
          <div className="flex items-center gap-2 font-medium text-slate-600">
            <span>Jira Software Cloud</span>
          </div>
        </div>

        {/* Jira Issue Content Layout */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Issue Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Breadcrumbs */}
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">Projects</span>
              <span>/</span>
              <span className="font-medium text-slate-700">Core Engineering</span>
              <span>/</span>
              <span className="font-semibold text-indigo-600">{ticketKey || 'PROJ-101'}</span>
            </div>

            {/* Editable Issue Header */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Ticket Key (e.g. CORE-101)"
                  value={ticketKey}
                  onChange={(e) => setTicketKey(e.target.value)}
                  className="w-full sm:w-36 px-3 py-1.5 border border-slate-300 rounded-md text-sm font-bold text-slate-900 font-mono bg-white focus:outline-indigo-500"
                />
                <input
                  type="text"
                  placeholder="Ticket Summary / Title"
                  value={ticketTitle}
                  onChange={(e) => setTicketTitle(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-slate-300 rounded-md text-sm sm:text-base font-bold text-slate-900 bg-white focus:outline-indigo-500"
                />
              </div>

              {/* Action Bar with the Iconic Analyze Button */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {/* INJECTED ANALYZE BUTTON */}
                <button
                  id="jira-analyzer-btn"
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="jira-analyzer-button group"
                >
                  {analyzing ? (
                    <>
                      <div className="spinner" />
                      <span>Gemini Analyzing...</span>
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M8 2L2 6L8 10L14 6L8 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                        <path d="M2 10L8 14L14 10" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                      </svg>
                      <span>Analyze Files (Gemini)</span>
                    </>
                  )}
                </button>

                <div className="text-xs text-slate-400 hidden sm:flex items-center gap-1.5 pl-2">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Powered by Gemini 3.8 Flash</span>
                </div>
              </div>
            </div>

            {/* Description Section */}
            <div className="space-y-2 pt-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Ticket Description & Acceptance Criteria
                </label>
                <span className="text-[11px] text-slate-400">Edit or paste directly from Jira</span>
              </div>

              <textarea
                rows={9}
                placeholder="Enter or paste the full ticket description, error traces, or acceptance criteria here..."
                value={ticketDescription}
                onChange={(e) => setTicketDescription(e.target.value)}
                className="w-full p-4 border border-slate-300 rounded-lg text-xs sm:text-sm font-normal text-slate-800 bg-slate-50/50 focus:bg-white focus:outline-indigo-500 leading-relaxed font-mono"
              />
            </div>

            {/* Inline Popover Presentation when Analyzed */}
            {analysisResult && (
              <div className="mt-8 pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <h3 className="font-bold text-slate-900 text-base">
                      Prediction Output for {activeAnalysisTicketKey}
                    </h3>
                  </div>
                  <span className="text-xs text-slate-500">Live Gemini 3.8 Flash Output</span>
                </div>

                <JiraAnalyzerPopover
                  data={analysisResult}
                  ticketKey={activeAnalysisTicketKey}
                  onClose={() => setAnalysisResult(null)}
                  onVerifyOnGitHub={onNavigateToGitHub}
                />
              </div>
            )}
          </div>

          {/* Right Sidebar: Jira Details */}
          <div className="space-y-6 lg:border-l lg:border-slate-200 lg:pl-8">
            {/* Status Dropdown */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</label>
              <select
                value={status}
                onChange={(e: any) => setStatus(e.target.value)}
                className="w-full px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-md font-semibold text-xs focus:outline-blue-500"
              >
                <option value="To Do">To Do</option>
                <option value="In Progress">In Progress</option>
                <option value="In Review">In Review</option>
                <option value="Done">Done</option>
              </select>
            </div>

            {/* Priority */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Priority</label>
              <select
                value={priority}
                onChange={(e: any) => setPriority(e.target.value)}
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-300 text-slate-800 rounded-md font-semibold text-xs focus:outline-indigo-500"
              >
                <option value="Highest">Highest</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>

            {/* Components */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Components</label>
              <input
                type="text"
                value={componentsList}
                onChange={(e) => setComponentsList(e.target.value)}
                placeholder="Comma separated components"
                className="w-full px-3 py-1.5 bg-white border border-slate-300 text-slate-800 rounded-md text-xs font-mono focus:outline-indigo-500"
              />
            </div>

            {/* Extension Active Helper */}
            <div className="p-4 rounded-xl bg-indigo-50/60 border border-indigo-100 text-xs space-y-2 text-indigo-900">
              <div className="flex items-center gap-1.5 font-semibold text-indigo-950">
                <Sparkles className="w-4 h-4 text-indigo-600" />
                <span>Live Gemini Integration</span>
              </div>
              <p className="text-slate-600 text-[11px] leading-relaxed">
                Every analysis invokes Google's Gemini 3.8 Flash model on the server to inspect the issue and return verified impacted files with architectural reasoning.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
