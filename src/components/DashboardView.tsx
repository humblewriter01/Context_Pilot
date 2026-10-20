import React from 'react';
import { UsageStats, UserProfile, AnalysisRecord, FeedbackRecord } from '../types';
import {
  Layers,
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Zap,
  ArrowUpRight,
  Calendar,
  Sparkles,
  Inbox
} from 'lucide-react';

interface DashboardViewProps {
  user: UserProfile | null;
  usage: UsageStats;
  analyses: AnalysisRecord[];
  feedback: FeedbackRecord[];
  onSelectAnalysis: (record: AnalysisRecord) => void;
  onNavigateToPlans: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  usage,
  analyses,
  feedback,
  onSelectAnalysis,
  onNavigateToPlans,
}) => {
  const totalAnalyses = analyses.length;
  const avgConfidence =
    totalAnalyses > 0
      ? Math.round(
          (analyses.reduce((acc, a) => acc + (a.confidence_score || 0), 0) /
            totalAnalyses) *
            100
        )
      : 0;

  const accurateCount = feedback.filter((f) => f.wasAccurate).length;
  const accuracyRate =
    feedback.length > 0 ? Math.round((accurateCount / feedback.length) * 100) : null;

  // File category distribution
  let totalFrontend = 0;
  let totalBackend = 0;
  let totalDatabase = 0;
  let totalConfig = 0;
  let totalTests = 0;

  analyses.forEach((a) => {
    totalFrontend += a.frontend_files?.length || 0;
    totalBackend += a.backend_files?.length || 0;
    totalDatabase += a.database_files?.length || 0;
    totalConfig += a.config_files?.length || 0;
    totalTests += a.test_files?.length || 0;
  });

  const grandTotal =
    totalFrontend + totalBackend + totalDatabase + totalConfig + totalTests;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Banner / Welcome */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Codebase Impact Analytics</h1>
          <p className="text-sm text-slate-500">
            Real-time insights and architectural impact metrics from your analyzed Jira issues.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={onNavigateToPlans}
            className="px-4 py-2 bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-95 text-white text-xs font-semibold rounded-xl shadow-xs transition-all flex items-center gap-2"
          >
            <Zap className="w-4 h-4" />
            <span>Manage Plan</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Monthly Quota */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Monthly Usage</span>
            <Calendar className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {usage.ticketsProcessedThisMonth}
            </span>
            <span className="text-sm font-medium text-slate-400">
              / {usage.monthlyLimit === -1 ? '∞' : `${usage.monthlyLimit} tickets`}
            </span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-indigo-600 h-full rounded-full transition-all"
              style={{
                width:
                  usage.monthlyLimit === -1
                    ? '100%'
                    : `${Math.min(
                        100,
                        (usage.ticketsProcessedThisMonth / usage.monthlyLimit) * 100
                      )}%`,
              }}
            />
          </div>
          <div className="text-[11px] text-slate-500 flex justify-between">
            <span>Current Billing Cycle</span>
            <span className="font-semibold text-indigo-600">
              {usage.remainingTickets === -1 ? 'Unlimited' : `${usage.remainingTickets} remaining`}
            </span>
          </div>
        </div>

        {/* Total Analyses */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Total Analyses</span>
            <Layers className="w-4 h-4 text-purple-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">{totalAnalyses}</span>
            <span className="text-xs font-medium text-emerald-600 flex items-center">
              Active
            </span>
          </div>
          <p className="text-xs text-slate-500">Processed issue specifications</p>
        </div>

        {/* Avg Confidence */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Prediction Confidence</span>
            <BarChart3 className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {totalAnalyses > 0 ? `${avgConfidence}%` : '--'}
            </span>
            {totalAnalyses > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                High
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500">Average model confidence rating</p>
        </div>

        {/* Feedback Accuracy */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
          <div className="flex items-center justify-between text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <span>Accuracy Rating</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {accuracyRate !== null ? `${accuracyRate}%` : '--'}
            </span>
            <span className="text-xs text-slate-400">
              ({feedback.length} {feedback.length === 1 ? 'rating' : 'ratings'})
            </span>
          </div>
          <p className="text-xs text-slate-500">Verified by engineering teams</p>
        </div>
      </div>

      {/* Main Content Grid: File Distribution & Recent Analyses */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Predicted Files by Category */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-5">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">Impact by Category</h3>
            <span className="text-xs text-slate-400 font-mono">
              {grandTotal} {grandTotal === 1 ? 'file' : 'files'}
            </span>
          </div>

          {grandTotal === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs space-y-2">
              <Inbox className="w-8 h-8 text-slate-300 mx-auto" />
              <p>No category metrics yet.</p>
              <p className="text-slate-400">Analyze an issue to see file distributions across your repository.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {[
                { label: 'Frontend Components', count: totalFrontend, barColor: '#3b82f6', icon: '🎨' },
                { label: 'Backend APIs & Services', count: totalBackend, barColor: '#8b5cf6', icon: '⚙️' },
                { label: 'Database & Schemas', count: totalDatabase, barColor: '#10b981', icon: '🗄️' },
                { label: 'Configuration & Env', count: totalConfig, barColor: '#f59e0b', icon: '⚙️' },
                { label: 'Test Suites', count: totalTests, barColor: '#ef4444', icon: '✓' },
              ].map((cat) => {
                const pct = grandTotal > 0 ? Math.round((cat.count / grandTotal) * 100) : 0;
                return (
                  <div key={cat.label} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-slate-700 flex items-center gap-1.5">
                        <span>{cat.icon}</span>
                        <span>{cat.label}</span>
                      </span>
                      <span className="font-semibold text-slate-900">
                        {cat.count} <span className="text-slate-400 font-normal">({pct}%)</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: cat.barColor }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Analyses List */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">Recent Predictions</h3>
            <span className="text-xs text-slate-500">Audit History</span>
          </div>

          <div className="divide-y divide-slate-100 overflow-hidden">
            {analyses.length === 0 ? (
              <div className="py-12 text-center text-slate-400 space-y-2">
                <Inbox className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-medium text-slate-600">No predictions recorded yet.</p>
                <p className="text-xs text-slate-400">
                  Switch to the Ticket Analyzer tab to run your first codebase impact prediction.
                </p>
              </div>
            ) : (
              analyses.slice(0, 5).map((record) => (
                <div
                  key={record.id}
                  onClick={() => onSelectAnalysis(record)}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/80 px-2 rounded-xl cursor-pointer transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded font-mono whitespace-nowrap inline-block shrink-0">
                        {record.ticketKey}
                      </span>
                      <h4 className="font-semibold text-sm text-slate-900 truncate max-w-md">
                        {record.ticketTitle || 'Issue Analysis'}
                      </h4>
                    </div>
                    <p className="text-xs text-slate-500 truncate max-w-lg">{record.reasoning}</p>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 text-xs">
                    <div className="text-right">
                      <div className="font-semibold text-slate-800">{record.total_files} files</div>
                      <div className="text-emerald-600 font-medium">
                        {Math.round((record.confidence_score || 0.85) * 100)}% conf
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
