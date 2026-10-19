import React, { useState, useEffect } from 'react';
import { SubscriptionPlan, SubscriptionTier, UsageStats, UserProfile } from '../types';
import { SUBSCRIPTION_PLANS, storageService } from '../services/storage';
import { paystackService } from '../services/paystack';
import { adminService } from '../services/admin';
import {
  Check,
  Zap,
  ShieldCheck,
  CreditCard,
  CheckCircle2,
  RefreshCw,
  Lock,
  Tag,
  Shield,
  HelpCircle,
  Clock,
  Sparkles
} from 'lucide-react';

interface SubscriptionPlansViewProps {
  user: UserProfile | null;
  usage: UsageStats;
  onTierChanged: (tier: SubscriptionTier) => void;
  onOpenAuthModal: () => void;
}

export const SubscriptionPlansView: React.FC<SubscriptionPlansViewProps> = ({
  user,
  usage,
  onTierChanged,
  onOpenAuthModal,
}) => {
  const plans = Object.values(SUBSCRIPTION_PLANS);
  const [paystackConfig, setPaystackConfig] = useState<any>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  const [selectedCurrency, setSelectedCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Promo Code State
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    discountAmount: number;
  } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [validatingPromo, setValidatingPromo] = useState(false);

  useEffect(() => {
    paystackService
      .getConfig()
      .then((cfg) => {
        setPaystackConfig(cfg);
        if (cfg?.currency === 'USD' || cfg?.currency === 'NGN') {
          setSelectedCurrency(cfg.currency);
        }
      })
      .catch(console.error);

    // Check if redirected from Paystack with ?payment_ref= or ?reference=
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('payment_ref') || params.get('reference');
    if (ref) {
      handleVerifyReference(ref);
    }
  }, []);

  const handleVerifyReference = async (ref: string) => {
    setPaymentNotice(null);
    try {
      const res = await paystackService.verifyTransaction(ref);
      if (res.success) {
        onTierChanged(res.tier);
        setPaymentNotice({
          type: 'success',
          message: `Payment confirmed on Paystack! Your workspace has been upgraded to ${res.tier.toUpperCase()} tier. Reference: ${res.reference}`,
        });
      } else {
        setPaymentNotice({
          type: 'error',
          message: `Payment verification notice: ${res.gateway_response || 'Transaction not yet finalized.'}`,
        });
      }
    } catch (err: any) {
      setPaymentNotice({
        type: 'error',
        message: err?.message || 'Verification error occurred.',
      });
    }
  };

  const handleApplyPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoInput.trim()) return;

    setValidatingPromo(true);
    setPromoError(null);

    try {
      // Check for Pro tier by default as baseline
      const baseAmount = paystackConfig?.proPriceNgn || 15000;
      const res = await adminService.validatePromo(promoInput.trim().toUpperCase(), 'pro', baseAmount);

      if (res.valid) {
        setAppliedPromo({
          code: res.code,
          discountType: res.discountType,
          discountValue: res.discountValue,
          discountAmount: res.discountAmount,
        });
        setPromoInput('');
      }
    } catch (err: any) {
      setPromoError(err?.message || 'Invalid or expired promo code.');
    } finally {
      setValidatingPromo(false);
    }
  };

  const handlePaystackCheckout = async (plan: SubscriptionPlan) => {
    if (!user) {
      onOpenAuthModal();
      return;
    }

    if (plan.tier === 'free') {
      onTierChanged('free');
      setPaymentNotice({
        type: 'success',
        message: 'Workspace set to Free tier.',
      });
      return;
    }

    setLoadingTier(plan.tier);
    setPaymentNotice(null);

    let baseAmount = 0;
    if (selectedCurrency === 'USD') {
      baseAmount =
        plan.tier === 'pro'
          ? paystackConfig?.proPriceUsd || 10
          : paystackConfig?.enterprisePriceUsd || 50;
    } else {
      baseAmount =
        plan.tier === 'pro'
          ? paystackConfig?.proPriceNgn || 15000
          : paystackConfig?.enterprisePriceNgn || 75000;
    }

    // Apply 20% discount for annual billing
    if (billingCycle === 'annual') {
      baseAmount = Math.round(baseAmount * 12 * 0.8);
    }

    // Apply promo code discount if active
    let promoCodeToPass: string | undefined = undefined;
    if (appliedPromo) {
      promoCodeToPass = appliedPromo.code;
      if (appliedPromo.discountType === 'percentage') {
        const disc = (baseAmount * appliedPromo.discountValue) / 100;
        baseAmount = Math.max(1, baseAmount - disc);
      } else {
        baseAmount = Math.max(1, baseAmount - appliedPromo.discountAmount);
      }
    }

    try {
      const initRes = await paystackService.initializeTransaction(
        user.email,
        plan.tier,
        baseAmount,
        window.location.href,
        promoCodeToPass,
        selectedCurrency
      );

      if (initRes.authorization_url) {
        // Direct redirect to Paystack secure checkout
        window.location.href = initRes.authorization_url;
      } else {
        throw new Error('No authorization URL returned from Paystack API');
      }
    } catch (err: any) {
      console.error(err);
      setPaymentNotice({
        type: 'error',
        message:
          err?.message ||
          'Failed to initialize Paystack checkout. Please verify payment gateway configuration.',
      });
    } finally {
      setLoadingTier(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Title & Billing Toggle Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-bold">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Simple, Transparent Engineering Plans</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          Accelerate your sprints with intelligent file impact prediction
        </h1>

        <p className="text-sm sm:text-base text-slate-500 max-w-xl mx-auto">
          Predict exact codebase files, API routes, database migrations, and test suites directly from Jira issues before writing code.
        </p>

        {/* Monthly vs Annual Toggle & Currency Switcher */}
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setBillingCycle('annual')}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                billingCycle === 'annual'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span>Annual Billing</span>
              <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                Save 20%
              </span>
            </button>
          </div>

          {/* Currency Toggle */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
            <button
              onClick={() => setSelectedCurrency('NGN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedCurrency === 'NGN'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              ₦ NGN
            </button>
            <button
              onClick={() => setSelectedCurrency('USD')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedCurrency === 'USD'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              $ USD
            </button>
          </div>
        </div>
      </div>

      {/* Payment Notice Banner */}
      {paymentNotice && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-start gap-3 max-w-3xl mx-auto animate-in fade-in ${
            paymentNotice.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {paymentNotice.type === 'success' ? (
            <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <Lock className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 text-xs sm:text-sm">{paymentNotice.message}</div>
        </div>
      )}

      {/* Promo Code Input Card */}
      <div className="max-w-md mx-auto p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row items-center gap-2">
        <div className="relative flex-1 w-full">
          <Tag className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Have a promo code? (e.g. LAUNCH25)"
            value={promoInput}
            onChange={(e) => setPromoInput(e.target.value.toUpperCase())}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-xl font-mono uppercase focus:outline-indigo-500"
          />
        </div>
        <button
          onClick={handleApplyPromo}
          disabled={validatingPromo || !promoInput.trim()}
          className="w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors shrink-0 disabled:opacity-50"
        >
          {validatingPromo ? 'Validating...' : 'Apply Code'}
        </button>
      </div>

      {promoError && (
        <p className="text-center text-xs text-rose-600 font-medium -mt-4">{promoError}</p>
      )}

      {appliedPromo && (
        <div className="max-w-md mx-auto p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>
              Promo code <strong className="font-mono">{appliedPromo.code}</strong> applied (
              {appliedPromo.discountType === 'percentage'
                ? `${appliedPromo.discountValue}% OFF`
                : `${selectedCurrency === 'USD' ? '$' : '₦'}${appliedPromo.discountValue} OFF`}
              )!
            </span>
          </div>
          <button
            onClick={() => setAppliedPromo(null)}
            className="text-xs text-slate-400 hover:text-slate-600 underline font-medium"
          >
            Remove
          </button>
        </div>
      )}

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch pt-2">
        {plans.map((plan) => {
          const isCurrent = user?.subscriptionTier === plan.tier;
          const isPro = plan.tier === 'pro';
          const isLoading = loadingTier === plan.tier;
          const isUsd = selectedCurrency === 'USD';
          const currencySymbol = isUsd ? '$' : '₦';

          let basePrice = 0;
          if (plan.tier === 'pro') {
            basePrice = isUsd ? (paystackConfig?.proPriceUsd || 10) : (paystackConfig?.proPriceNgn || 15000);
          } else if (plan.tier === 'enterprise') {
            basePrice = isUsd ? (paystackConfig?.enterprisePriceUsd || 50) : (paystackConfig?.enterprisePriceNgn || 75000);
          }

          let monthlyPrice = basePrice;
          if (billingCycle === 'annual') {
            monthlyPrice = Math.round(monthlyPrice * 0.8);
          }

          let discountedPrice = monthlyPrice;
          if (appliedPromo && plan.tier !== 'free') {
            if (appliedPromo.discountType === 'percentage') {
              discountedPrice = Math.round(monthlyPrice * (1 - appliedPromo.discountValue / 100));
            } else {
              discountedPrice = Math.max(1, monthlyPrice - appliedPromo.discountAmount);
            }
          }

          return (
            <div
              key={plan.tier}
              className={`bg-white rounded-3xl p-6 sm:p-8 border transition-all flex flex-col justify-between relative ${
                isPro
                  ? 'border-indigo-600 ring-2 ring-indigo-600/20 shadow-xl'
                  : 'border-slate-200 hover:border-slate-300 shadow-xs'
              }`}
            >
              {isPro && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white text-[11px] font-bold rounded-full uppercase tracking-wider shadow-sm">
                  Recommended for Teams
                </div>
              )}

              <div className="space-y-5">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">{plan.name}</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    {plan.tier === 'free' && 'For developers exploring automated Jira file predictions.'}
                    {plan.tier === 'pro' && 'For active software engineering teams running 2-week sprints.'}
                    {plan.tier === 'enterprise' && 'For engineering organizations auditing full multi-repo codebases.'}
                  </p>
                </div>

                <div>
                  <div className="flex items-baseline gap-1.5">
                    {plan.tier === 'free' ? (
                      <span className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                        {currencySymbol}0
                      </span>
                    ) : (
                      <>
                        <span className="text-3xl sm:text-4xl font-extrabold text-slate-900">
                          {currencySymbol}{discountedPrice.toLocaleString()}
                        </span>
                        {appliedPromo && (
                          <span className="text-sm text-slate-400 line-through">
                            {currencySymbol}{monthlyPrice.toLocaleString()}
                          </span>
                        )}
                      </>
                    )}
                    <span className="text-xs text-slate-400 font-medium">/ month</span>
                  </div>

                  {plan.tier !== 'free' && (
                    <div className="text-[11px] text-slate-400 font-mono mt-1">
                      {billingCycle === 'annual'
                        ? `Billed annually (${currencySymbol}${(discountedPrice * 12).toLocaleString()}/yr)`
                        : 'Billed monthly via Paystack'}
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-slate-100 space-y-3.5 text-xs text-slate-700">
                  <div className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>
                      <strong>
                        {plan.monthlyTicketLimit === -1 ? 'Unlimited' : plan.monthlyTicketLimit}
                      </strong>{' '}
                      ticket predictions per month
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <Check
                      className={`w-4 h-4 ${
                        plan.features.github_verification ? 'text-emerald-600' : 'text-slate-300'
                      } shrink-0`}
                    />
                    <span
                      className={
                        plan.features.github_verification
                          ? 'font-medium text-slate-800'
                          : 'text-slate-400 line-through'
                      }
                    >
                      GitHub Repository Verification
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{plan.features.history_retention_days} days audit history retention</span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="capitalize">{plan.features.support} support response</span>
                  </div>

                  {plan.features.priority_processing && (
                    <div className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Priority processing speed</span>
                    </div>
                  )}

                  {plan.features.custom_models && (
                    <div className="flex items-center gap-2.5">
                      <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>Custom architecture fine-tuning</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-8">
                <button
                  onClick={() => handlePaystackCheckout(plan)}
                  disabled={isLoading || isCurrent}
                  className={`w-full py-3 px-4 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-xs ${
                    isCurrent
                      ? 'bg-slate-100 text-slate-500 border border-slate-200 cursor-default'
                      : isPro
                      ? 'bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-95 text-white shadow-md'
                      : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                  }`}
                >
                  {isLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Securing Paystack Checkout...</span>
                    </>
                  ) : isCurrent ? (
                    'Current Plan'
                  ) : plan.tier === 'free' ? (
                    'Downgrade to Free'
                  ) : (
                    <>
                      <CreditCard className="w-4 h-4" />
                      <span>Upgrade via Paystack</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Enterprise Security Badges */}
      <div className="pt-6 border-t border-slate-200 max-w-4xl mx-auto flex flex-wrap items-center justify-center gap-8 text-xs text-slate-500">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Paystack PCI-DSS Level 1 Certified</span>
        </div>
        <div className="flex items-center gap-2">
          <Lock className="w-4 h-4 text-indigo-600" />
          <span>256-bit TLS Bank Encryption</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-purple-600" />
          <span>Instant Activation & Cancel Anytime</span>
        </div>
      </div>
    </div>
  );
};
