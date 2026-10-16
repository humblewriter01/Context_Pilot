import React from 'react';
import { SubscriptionPlan, SubscriptionTier, UsageStats, UserProfile } from '../types';
import { SUBSCRIPTION_PLANS, storageService } from '../services/storage';
import {
  Check,
  Zap,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  CreditCard,
  CheckCircle2
} from 'lucide-react';

interface SubscriptionPlansViewProps {
  user: UserProfile;
  usage: UsageStats;
  onTierChanged: (tier: SubscriptionTier) => void;
  onUsageReset: () => void;
}

export const SubscriptionPlansView: React.FC<SubscriptionPlansViewProps> = ({
  user,
  usage,
  onTierChanged,
  onUsageReset
}) => {
  const plans = Object.values(SUBSCRIPTION_PLANS);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-indigo-600" />
            Subscription Plans & Quota Management
          </h1>
          <p className="text-sm text-slate-500">
            Backed by PostgreSQL <code className="text-indigo-600 font-mono text-xs">subscription_plans</code> and <code className="text-indigo-600 font-mono text-xs">can_analyze_ticket()</code> stored procedure.
          </p>
        </div>

        {/* Developer Testing Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={onUsageReset}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 border border-slate-300 shadow-2xs"
            title="Reset monthly usage counter to 0 for testing"
          >
            <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
            Reset Monthly Usage (Testing)
          </button>
        </div>
      </div>

      {/* Current Quota Status Banner */}
      <div className="p-5 rounded-xl bg-white border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-900 text-base">Current Plan:</span>
              <span className="uppercase text-xs font-extrabold px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-700">
                {user.subscriptionTier}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Processed {usage.ticketsProcessedThisMonth} of {usage.monthlyLimit === -1 ? 'Unlimited' : usage.monthlyLimit} tickets in {usage.monthYear}.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-600">Quick Test Tier:</span>
          {(['free', 'pro', 'enterprise'] as SubscriptionTier[]).map((t) => (
            <button
              key={t}
              onClick={() => onTierChanged(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                user.subscriptionTier === t
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Pricing Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {plans.map((plan) => {
          const isCurrent = user.subscriptionTier === plan.tier;
          const isPro = plan.tier === 'pro';

          return (
            <div
              key={plan.tier}
              className={`bg-white rounded-2xl p-6 border transition-all flex flex-col justify-between relative ${
                isCurrent
                  ? 'border-indigo-600 ring-2 ring-indigo-600/20 shadow-md'
                  : 'border-slate-200 hover:border-slate-300 shadow-2xs'
              }`}
            >
              {isPro && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white text-[11px] font-bold rounded-full uppercase tracking-wider shadow-sm">
                  Most Popular
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {plan.tier === 'free' && 'For individual developers trying out predictions.'}
                    {plan.tier === 'pro' && 'For engineering teams moving fast on active sprints.'}
                    {plan.tier === 'enterprise' && 'For large engineering organizations & custom models.'}
                  </p>
                </div>

                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-slate-900">
                    ${plan.priceUsd.toFixed(2)}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">/ month</span>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-3 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      <strong>
                        {plan.monthlyTicketLimit === -1 ? 'Unlimited' : plan.monthlyTicketLimit}
                      </strong>{' '}
                      ticket analyses per month
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Check
                      className={`w-4 h-4 ${
                        plan.features.github_verification ? 'text-emerald-600' : 'text-slate-300'
                      } shrink-0`}
                    />
                    <span className={plan.features.github_verification ? '' : 'text-slate-400 line-through'}>
                      GitHub Repository Verification
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{plan.features.history_retention_days} days audit history retention</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="capitalize">{plan.features.support} support</span>
                  </div>

                  {plan.features.priority_processing && (
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Priority processing speed</span>
                    </div>
                  )}

                  {plan.features.custom_models && (
                    <div className="flex items-center gap-2">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Fine-tuned models on company codebase</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-6">
                <button
                  onClick={() => onTierChanged(plan.tier)}
                  className={`w-full py-2.5 px-4 rounded-xl font-semibold text-xs transition-all ${
                    isCurrent
                      ? 'bg-slate-100 text-slate-800 border border-slate-300 hover:bg-slate-200'
                      : isPro
                      ? 'bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-95 text-white shadow-sm'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  {isCurrent ? 'Current Active Tier' : `Switch to ${plan.name}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
