import React, { useState } from 'react';
import { AnalysisRecord, FeedbackRecord } from '../types';
import {
  History,
  MessageSquare,
  Star,
  ThumbsUp,
  ThumbsDown,
  Search,
  ChevronRight,
  Clock,
  Sparkles,
  ExternalLink,
  Layers
} from 'lucide-react';
import { JiraAnalyzerPopover } from './JiraAnalyzerPopover';

interface HistoryFeedbackViewProps {
  analyses: AnalysisRecord[];
  feedback: FeedbackRecord[];
  onVerifyOnGitHub: (files: string[]) => void;
  onRefreshData: () => void;
}

export const HistoryFeedbackView: React.FC<HistoryFeedbackViewProps> = ({
  analyses,
  feedback,
  onVerifyOnGitHub,
  onRefreshData
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<AnalysisRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'analyses' | 'feedback'>('analyses');

  const filteredAnalyses = analyses.filter(
    (a) =>
      a.ticketKey.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.ticketTitle.toLowerCase().includes(searchTerm.toLowerCase()) ||
      a.reasoning.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <History className="w-6 h-6 text-indigo-600" />
            Audit History & Feedback
          </h1>
          <p className="text-sm text-slate-500">
            Database records for <code className="text-indigo-600 font-mono text-xs">analysis_history</code> and{' '}
            <code className="text-indigo-600 font-mono text-xs">feedback</code> tables.
          </p>
        </div>

        {/* View toggle */}
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            onClick={() => setActiveTab('analyses')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === 'analyses' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Analysis Records ({analyses.length})
          </button>
          <button
            onClick={() => setActiveTab('feedback')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all ${
              activeTab === 'feedback' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            User Feedback ({feedback.length})
          </button>
        </div>
      </div>

      {activeTab === 'analyses' ? (
        <div className="space-y-4">
          {/* Search bar */}
          <div className="relative max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by ticket key or keyword..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm bg-white focus:outline-indigo-500"
            />
          </div>

          {/* Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Ticket</th>
                  <th className="py-3 px-4">Summary</th>
                  <th className="py-3 px-4">Total Files</th>
                  <th className="py-3 px-4">Confidence</th>
                  <th className="py-3 px-4">Processing</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredAnalyses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      {analyses.length === 0
                        ? 'No ticket analyses recorded yet. Run an analysis in the Jira simulator to build your audit log.'
                        : 'No matching analysis records found.'}
                    </td>
                  </tr>
                ) : (
                  filteredAnalyses.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                      onClick={() => setSelectedRecord(item)}
                    >
                      <td className="py-3.5 px-4 font-bold text-indigo-700">
                        <span className="bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                          {item.ticketKey}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 max-w-xs sm:max-w-md truncate font-medium text-slate-800">
                        {item.ticketTitle || 'Ticket Analysis'}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-slate-700">
                        {item.total_files} files
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold text-[11px]">
                          {Math.round((item.confidence_score || 0.85) * 100)}%
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-slate-500 font-mono">
                        {item.processingTimeMs}ms
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRecord(item);
                          }}
                          className="px-2.5 py-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded font-medium text-xs inline-flex items-center gap-1"
                        >
                          View Details
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Feedback Tab */
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs divide-y divide-slate-100">
          {feedback.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No feedback submitted yet. Analyze a ticket and click 'Rate accuracy' to add feedback.
            </div>
          ) : (
            feedback.map((item) => (
              <div key={item.id} className="p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                      {item.ticketKey}
                    </span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((s) => (
                        <Star
                          key={s}
                          className={`w-3.5 h-3.5 ${
                            s <= item.accuracyRating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-slate-300'
                          }`}
                        />
                      ))}
                    </div>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                        item.wasAccurate
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                      }`}
                    >
                      {item.wasAccurate ? <ThumbsUp className="w-3 h-3" /> : <ThumbsDown className="w-3 h-3" />}
                      {item.wasAccurate ? 'Accurate' : 'Inaccurate'}
                    </span>
                  </div>

                  {item.userComment && (
                    <p className="text-xs text-slate-700 italic">
                      "{item.userComment}"
                    </p>
                  )}
                </div>

                <div className="text-[11px] text-slate-400 shrink-0">
                  {new Date(item.createdAt).toLocaleDateString()}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Selected Detail Modal */}
      {selectedRecord && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <JiraAnalyzerPopover
              data={selectedRecord}
              ticketKey={selectedRecord.ticketKey}
              onClose={() => setSelectedRecord(null)}
              onVerifyOnGitHub={(files) => {
                setSelectedRecord(null);
                onVerifyOnGitHub(files);
              }}
              onFeedbackSubmitted={() => {
                onRefreshData();
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
