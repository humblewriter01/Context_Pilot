import React, { useState } from 'react';
import { CategorizedFiles, AnalysisRecord } from '../types';
import {
  X,
  Copy,
  Check,
  GitBranch,
  Star,
  ThumbsUp,
  ThumbsDown,
  Sparkles,
  ExternalLink,
  Clock,
  Layers
} from 'lucide-react';
import { storageService } from '../services/storage';
import { submitUserFeedback } from '../services/supabase';

interface JiraAnalyzerPopoverProps {
  data: CategorizedFiles & { processingTimeMs?: number; id?: number | string; ticketKey?: string };
  ticketKey: string;
  onClose: () => void;
  onVerifyOnGitHub?: (files: string[]) => void;
  onFeedbackSubmitted?: () => void;
}

export const JiraAnalyzerPopover: React.FC<JiraAnalyzerPopoverProps> = ({
  data,
  ticketKey,
  onClose,
  onVerifyOnGitHub,
  onFeedbackSubmitted
}) => {
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [wasAccurate, setWasAccurate] = useState<boolean | null>(null);
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState('');
  const [feedbackSent, setFeedbackSent] = useState(false);

  const confidence = data.confidence_score || 0.85;
  const confidencePercent = Math.round(confidence * 100);

  const getConfidenceLevel = (score: number) => {
    if (score >= 0.8) return { label: `${confidencePercent}% confidence`, cls: 'high' };
    if (score >= 0.6) return { label: `${confidencePercent}% confidence`, cls: 'medium' };
    return { label: `${confidencePercent}% confidence`, cls: 'low' };
  };

  const confInfo = getConfidenceLevel(confidence);

  const categories = [
    { key: 'frontend_files' as const, label: 'Frontend', icon: '🎨', color: '#3b82f6', border: 'border-blue-200', bg: 'bg-blue-50/50' },
    { key: 'backend_files' as const, label: 'Backend', icon: '⚙️', color: '#8b5cf6', border: 'border-purple-200', bg: 'bg-purple-50/50' },
    { key: 'database_files' as const, label: 'Database', icon: '🗄️', color: '#10b981', border: 'border-emerald-200', bg: 'bg-emerald-50/50' },
    { key: 'config_files' as const, label: 'Config', icon: '⚙️', color: '#f59e0b', border: 'border-amber-200', bg: 'bg-amber-50/50' },
    { key: 'test_files' as const, label: 'Tests', icon: '✓', color: '#ef4444', border: 'border-rose-200', bg: 'bg-rose-50/50' }
  ];

  const handleCopy = (path: string) => {
    navigator.clipboard.writeText(path);
    setCopiedFile(path);
    setTimeout(() => setCopiedFile(null), 2000);
  };

  const allFiles = [
    ...(data.frontend_files || []),
    ...(data.backend_files || []),
    ...(data.database_files || []),
    ...(data.config_files || []),
    ...(data.test_files || [])
  ];

  const handleCopyAll = () => {
    navigator.clipboard.writeText(allFiles.join('\n'));
    setCopiedFile('ALL');
    setTimeout(() => setCopiedFile(null), 2000);
  };

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (wasAccurate === null) return;

    // 1. Optimistically store in local storage cache
    storageService.saveFeedback({
      userId: 1,
      analysisId: data.id ?? Date.now(),
      ticketKey: ticketKey,
      wasAccurate,
      accuracyRating: rating,
      missingFiles: [],
      incorrectFiles: [],
      userComment: comment
    });

    setFeedbackSent(true);

    // 2. Persist directly to Supabase public.feedback table
    try {
      await submitUserFeedback({
        analysisId: data.id,
        ticketKey,
        wasAccurate,
        rating,
        comments: comment,
      });
    } catch (err) {
      console.warn('Could not save feedback to Supabase:', err);
    }

    if (onFeedbackSubmitted) onFeedbackSubmitted();
  };

  return (
    <div className="jira-analyzer-popover w-full max-w-xl mx-auto border border-slate-200 shadow-2xl rounded-xl animate-in fade-in duration-200">
      {/* Popover Header */}
      <div className="popover-header px-5 py-4 flex items-center justify-between text-white rounded-t-xl bg-gradient-to-r from-[#667eea] to-[#764ba2]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/15 backdrop-blur-xs flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-base leading-tight">File Analysis Results</h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`confidence-badge ${confInfo.cls}`}>
                {confInfo.label}
              </span>
              {data.processingTimeMs && (
                <span className="text-[11px] text-white/80 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {data.processingTimeMs}ms
                </span>
              )}
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          className="close-btn text-white/80 hover:text-white"
          title="Close Popover"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Popover Content */}
      <div className="p-5 max-h-[70vh] overflow-y-auto space-y-4 bg-white">
        {/* Full Ticket Summary */}
        {(data as any).ticketTitle && (
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs sm:text-sm text-slate-800 space-y-1">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
              Full Ticket Summary:
            </span>
            <p className="font-semibold text-slate-900 leading-relaxed break-words">
              {(data as any).ticketTitle}
            </p>
          </div>
        )}

        {/* Total files summary */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-200/80">
          <div className="flex items-center gap-2 text-sm text-slate-700">
            <Layers className="w-4 h-4 text-indigo-600" />
            <span className="font-medium">Identified Files to Change:</span>
            <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-xs">
              {data.total_files} files
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopyAll}
              className="text-xs px-2.5 py-1 rounded-md bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors flex items-center gap-1.5 font-medium"
            >
              {copiedFile === 'ALL' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
              {copiedFile === 'ALL' ? 'Copied All' : 'Copy All'}
            </button>
            {onVerifyOnGitHub && (
              <button
                onClick={() => onVerifyOnGitHub(allFiles)}
                className="text-xs px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors flex items-center gap-1.5 shadow-xs"
              >
                <GitBranch className="w-3.5 h-3.5" />
                Verify on GitHub
              </button>
            )}
          </div>
        </div>

        {/* Reasoning Section */}
        {data.reasoning && (
          <div className="p-3.5 rounded-lg bg-indigo-50/60 border border-indigo-100/80 text-xs sm:text-sm text-slate-700 space-y-1">
            <div className="flex items-center gap-1.5 font-semibold text-indigo-900 text-xs">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Architectural Impact Analysis:</span>
            </div>
            <p className="text-slate-600 leading-relaxed">{data.reasoning}</p>
          </div>
        )}

        {/* Categories breakdown */}
        <div className="space-y-4 pt-1">
          {categories.map((cat) => {
            const files = data[cat.key] || [];
            if (files.length === 0) return null;

            return (
              <div key={cat.key} className="file-category">
                <div className="category-header flex items-center justify-between text-xs font-semibold text-slate-800 mb-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{cat.icon}</span>
                    <span>{cat.label}</span>
                  </div>
                  <span className="category-count text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
                    {files.length} {files.length === 1 ? 'file' : 'files'}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {files.map((file) => (
                    <div
                      key={file}
                      className="file-item flex items-center justify-between gap-3 p-2.5 bg-slate-50/80 hover:bg-slate-100/80 border border-slate-200/80 rounded-lg group transition-all"
                    >
                      <div className="flex items-center gap-2 overflow-hidden min-w-0 flex-1">
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="shrink-0">
                          <path
                            d="M9 1H3C2.4 1 2 1.4 2 2V14C2 14.6 2.4 15 3 15H13C13.6 15 14 14.6 14 14V6L9 1Z"
                            stroke={cat.color}
                            strokeWidth="1.6"
                          />
                          <path d="M9 1V6H14" stroke={cat.color} strokeWidth="1.6" />
                        </svg>
                        <code
                          className="text-xs text-slate-800 font-mono truncate block flex-1"
                          title={file}
                        >
                          {file}
                        </code>
                      </div>

                      <button
                        onClick={() => handleCopy(file)}
                        className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-200/60 shrink-0"
                        title={`Copy: ${file}`}
                        aria-label={`Copy ${file}`}
                      >
                        {copiedFile === file ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Feedback Accordion */}
        <div className="border-t border-slate-200 pt-3">
          {!showFeedback && !feedbackSent ? (
            <div className="flex items-center justify-between text-xs text-slate-600">
              <span>Were these predicted files accurate?</span>
              <button
                onClick={() => setShowFeedback(true)}
                className="text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
              >
                Rate accuracy & give feedback
              </button>
            </div>
          ) : feedbackSent ? (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Thank you! Your feedback will help improve predictions.</span>
            </div>
          ) : (
            <form onSubmit={handleFeedbackSubmit} className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-200 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-800">Was the prediction accurate?</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setWasAccurate(true)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                      wasAccurate === true
                        ? 'bg-emerald-600 text-white border-emerald-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <ThumbsUp className="w-3 h-3" /> Yes
                  </button>
                  <button
                    type="button"
                    onClick={() => setWasAccurate(false)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded border text-xs font-medium transition-colors ${
                      wasAccurate === false
                        ? 'bg-rose-600 text-white border-rose-600'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <ThumbsDown className="w-3 h-3" /> No
                  </button>
                </div>
              </div>

              {/* Star rating */}
              <div className="flex items-center justify-between">
                <span className="text-slate-700 font-medium">Accuracy Rating:</span>
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      className="p-1 text-slate-300 hover:text-amber-400 focus:outline-none"
                    >
                      <Star
                        className={`w-4 h-4 ${
                          star <= rating ? 'fill-amber-400 text-amber-400' : 'text-slate-300'
                        }`}
                      />
                    </button>
                  ))}
                </div>
              </div>

              {/* Comments */}
              <div>
                <input
                  type="text"
                  placeholder="Optional: Which files were missing or unnecessary?"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded border border-slate-300 text-xs bg-white text-slate-800 focus:outline-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowFeedback(false)}
                  className="px-2.5 py-1 text-slate-500 hover:text-slate-700 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={wasAccurate === null}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded text-xs font-medium transition-colors"
                >
                  Submit Feedback
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Popover Footer */}
      <div className="popover-footer px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500 rounded-b-xl">
        <span>AI-powered analysis • {ticketKey}</span>
        <span className="font-mono text-[11px] text-slate-400">Context Pilot v3.0</span>
      </div>
    </div>
  );
};
