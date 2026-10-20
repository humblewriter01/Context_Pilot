import React, { useState } from 'react';
import { JiraTicket, CategorizedFiles, UsageStats, AnalysisRecord } from '../types';
import { JiraAnalyzerPopover } from './JiraAnalyzerPopover';
import { analyzeTicket } from '../services/analyzer';
import { storageService } from '../services/storage';
import {
  AlertCircle,
  CheckCircle2,
  Share2,
  MoreHorizontal,
  Clock,
  Sparkles,
  Edit3,
  RefreshCw,
  AlertTriangle,
  FileCode2,
  Code
} from 'lucide-react';

interface JiraSimulatorViewProps {
  usage: UsageStats;
  onUsageUpdated: (usage: UsageStats) => void;
  onNavigateToGitHub: (files: string[]) => void;
  onNavigateToPlans: () => void;
}

export const JiraSimulatorView: React.FC<JiraSimulatorViewProps> = ({
  usage,
  onUsageUpdated,
  onNavigateToGitHub,
  onNavigateToPlans,
}) => {
  const [ticketKey, setTicketKey] = useState('');
  const [ticketTitle, setTicketTitle] = useState('');
  const [ticketDescription, setTicketDescription] = useState('');
  const [priority, setPriority] = useState<'Highest' | 'High' | 'Medium' | 'Low'>('Medium');
  const [status, setStatus] = useState<'To Do' | 'In Progress' | 'In Review' | 'Done'>('In Progress');
  const [componentsList, setComponentsList] = useState<string>('');

  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<
    (CategorizedFiles & { processingTimeMs?: number; id?: number }) | null
  >(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [activeAnalysisTicketKey, setActiveAnalysisTicketKey] = useState<string>('');

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
      const currentUser = storageService.getUser();
      const result = await analyzeTicket(
        fullText,
        ticketKey || 'TICKET-01',
        currentUser?.email,
        ticketTitle || 'Untitled Ticket'
      );
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
        userTier: storageService.getUser()?.subscriptionTier || 'pro',
      };

      storageService.saveAnalysis(record);
      if (result.usage) {
        const currentMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
        localStorage.setItem(`context_pilot_usage_${currentMonth}`, String(result.usage.ticketsProcessed));
      }
      const updatedUsage = storageService.getUsage();
      onUsageUpdated(updatedUsage);

      setActiveAnalysisTicketKey(ticketKey || 'TICKET-01');
      setAnalysisResult({
        ...result,
        processingTimeMs: processingTime,
        id: record.id,
      });
    } catch (err: any) {
      console.error('Analysis failed:', err);
      if (err?.message?.includes('Monthly ticket limit') || err?.message?.includes('quota exceeded') || err?.message?.includes('429')) {
        setQuotaExceeded(true);
      }
      setAnalysisError(err?.message || 'Failed to complete analysis. Please try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-slate-900 text-white shadow-md">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-base sm:text-lg tracking-tight">Code Impact Predictor</h2>
            <span className="px-2.5 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-bold uppercase tracking-wider">
              Intelligent Engine
            </span>
          </div>
          <p className="text-xs text-slate-300 max-w-xl">
            Analyze any feature request or bug report to identify impacted components across frontend, backend, database migrations, and test suites.
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {analysisError && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-900 text-sm animate-in fade-in">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="font-semibold">Analysis Failed:</strong>
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
              <strong>Monthly quota reached.</strong> You have analyzed {usage.ticketsProcessedThisMonth} of{' '}
              {usage.monthlyLimit} tickets this month.
            </div>
          </div>
          <button
            onClick={onNavigateToPlans}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg text-xs transition-colors shrink-0"
          >
            Upgrade Plan
          </button>
        </div>
      )}

      {/* Jira Browser Container */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {/* Atlassian Jira Header Chrome */}
        <div className="bg-slate-50 border-b border-slate-200 px-3.5 sm:px-6 py-2.5 sm:py-3 flex items-center justify-between gap-3 text-xs text-slate-500 overflow-hidden">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300" />
            </div>
            <span className="ml-1 sm:ml-2 font-mono text-[11px] sm:text-xs text-slate-400 truncate min-w-0">
              jira.company.com/browse/{ticketKey || 'PROJ-123'}
            </span>
          </div>
          <div className="flex items-center gap-1.5 font-medium text-slate-600 shrink-0 text-[11px] sm:text-xs whitespace-nowrap">
            <span className="hidden sm:inline-block w-2 h-2 rounded-full bg-emerald-500" />
            <span>Issue View</span>
          </div>
        </div>

        {/* Issue Content Layout */}
        <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Issue Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Breadcrumbs */}
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">Projects</span>
              <span>/</span>
              <span className="font-medium text-slate-700">Engineering</span>
              <span>/</span>
              <span className="font-semibold text-indigo-600">{ticketKey || 'PROJ-123'}</span>
            </div>

            {/* Editable Issue Header */}
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="e.g. PROJ-123"
                  value={ticketKey}
                  onChange={(e) => setTicketKey(e.target.value)}
                  className="w-full sm:w-36 px-3 py-1.5 border border-slate-300 rounded-lg text-sm font-bold text-slate-900 font-mono bg-white focus:outline-indigo-500"
                />
                <input
                  type="text"
                  placeholder="e.g. Implement Google OAuth 2.0 with session tokens"
                  value={ticketTitle}
                  onChange={(e) => setTicketTitle(e.target.value)}
                  className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-sm sm:text-base font-bold text-slate-900 bg-white focus:outline-indigo-500"
                />
              </div>

              {/* Action Bar with the Iconic Analyze Button */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  id="jira-analyzer-btn"
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="jira-analyzer-button group"
                >
                  {analyzing ? (
                    <>
                      <div className="spinner" />
                      <span>Analyzing Codebase Impact...</span>
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M8 2L2 6L8 10L14 6L8 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                        <path d="M2 10L8 14L14 10" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
                      </svg>
                      <span>Analyze Code Impact</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Description Section */}
            <div className="space-y-2 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  Issue Description & Acceptance Criteria
                </label>
                <span className="text-[11px] text-slate-400">Enter ticket details to predict affected files</span>
              </div>

              <textarea
                rows={9}
                placeholder="Paste or describe the issue requirements, expected behavior, or bug details here..."
                value={ticketDescription}
                onChange={(e) => setTicketDescription(e.target.value)}
                className="w-full p-4 border border-slate-300 rounded-xl text-xs sm:text-sm font-normal text-slate-800 bg-slate-50/50 focus:bg-white focus:outline-indigo-500 leading-relaxed font-mono"
              />
            </div>

            {/* Inline Popover Presentation when Analyzed */}
            {analysisResult && (
              <div className="mt-8 pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                    <h3 className="font-bold text-slate-900 text-base">
                      Predicted File Impact for {activeAnalysisTicketKey}
                    </h3>
                  </div>
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
                className="w-full px-3 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg font-semibold text-xs focus:outline-blue-500"
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
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 text-slate-800 rounded-lg font-semibold text-xs focus:outline-indigo-500"
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
                placeholder="e.g. Authentication, Backend, API"
                className="w-full px-3 py-2 bg-white border border-slate-300 text-slate-800 rounded-lg text-xs font-mono focus:outline-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
