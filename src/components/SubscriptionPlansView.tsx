import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
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
  Sparkles,
  ArrowLeft
} from 'lucide-react';

type Currency = 'NGN' | 'USD';

/** Billing currency every visitor starts with. */
const DEFAULT_CURRENCY: Currency = 'USD';

const CURRENCY_STORAGE_KEY = 'cp_selected_currency';
const CURRENCY_MANUAL_FLAG_KEY = 'cp_currency_user_selected';
const GEO_LOOKUP_TIMEOUT_MS = 4000;

/** The currency remembered for this browser session, and whether the visitor picked it. */
function readStoredCurrency(): { currency: Currency; manual: boolean } | null {
  try {
    const value = sessionStorage.getItem(CURRENCY_STORAGE_KEY);
    if (value !== 'NGN' && value !== 'USD') return null;
    return { currency: value, manual: sessionStorage.getItem(CURRENCY_MANUAL_FLAG_KEY) === 'true' };
  } catch {
    return null; // Storage can be unavailable (private mode, embedded contexts).
  }
}

function storeCurrency(currency: Currency, manual: boolean): void {
  try {
    sessionStorage.setItem(CURRENCY_STORAGE_KEY, currency);
    if (manual) sessionStorage.setItem(CURRENCY_MANUAL_FLAG_KEY, 'true');
  } catch {
    // Not persisted: the choice still applies for as long as this view is open.
  }
}

/** Best effort: NGN for visitors located in Nigeria, USD for everyone else. */
async function detectVisitorCurrency(signal: AbortSignal): Promise<Currency> {
  try {
    const res = await fetch('https://ipapi.co/json/', { signal });
    if (!res.ok) throw new Error(`Geo-IP lookup failed (${res.status})`);
    const data = await res.json();
    if (!data || data.error) throw new Error('Geo-IP lookup was rejected');
    const isNigeria =
      data.country_code === 'NG' || data.country === 'NG' || data.country_name === 'Nigeria';
    return isNigeria ? 'NGN' : 'USD';
  } catch {
    // Lookup blocked, rate limited or timed out: fall back to the device time zone.
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    return timeZone === 'Africa/Lagos' ? 'NGN' : 'USD';
  }
}

interface SubscriptionPlansViewProps {
  user: UserProfile | null;
  usage: UsageStats;
  onTierChanged: (tier: SubscriptionTier) => void;
  onOpenAuthModal: () => void;
  onBackToApp?: () => void;
}

export const SubscriptionPlansView: React.FC<SubscriptionPlansViewProps> = ({
  user,
  usage,
  onTierChanged,
  onOpenAuthModal,
  onBackToApp,
}) => {
  const plans = Object.values(SUBSCRIPTION_PLANS);
  const [paystackConfig, setPaystackConfig] = useState<any>(null);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');
  // Billing currency. The state always starts as USD; a remembered choice or the
  // visitor's location may adjust it, but only through the effects below.
  const [selectedCurrency, setSelectedCurrency] = useState<Currency>(DEFAULT_CURRENCY);
  // True once the currency is decided (restored, chosen, or in use by a checkout),
  // so a late geo-IP answer can never change it under the visitor.
  const currencySettledRef = useRef(false);
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Promo Code State
  const [promoInput, setPromoInput] = useState('');
  const [appliedPromo, setAppliedPromo] = useState<{
    code: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    /** Discount in the currency it was validated against. */
    discountAmount: number;
    currency: Currency;
    applicableTiers: ('pro' | 'enterprise')[];
  } | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [validatingPromo, setValidatingPromo] = useState(false);

  // Restore the currency remembered for this session before the browser paints,
  // so returning to this view never flashes a different price.
  useLayoutEffect(() => {
    const stored = readStoredCurrency();
    if (!stored) return;
    currencySettledRef.current = true;
    setSelectedCurrency(stored.currency);
  }, []);

  // IP-based auto-detection. Runs strictly after the initial (USD) render, only
  // when nothing is known about the visitor yet, and never overrides a choice.
  useEffect(() => {
    if (currencySettledRef.current) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), GEO_LOOKUP_TIMEOUT_MS);
    let active = true;

    detectVisitorCurrency(controller.signal)
      .then((detected) => {
        if (!active || currencySettledRef.current) return;
        currencySettledRef.current = true;
        storeCurrency(detected, false);
        setSelectedCurrency(detected);
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    // 1. Fetch backend gateway config & live prices
    paystackService
      .getConfig()
      .then((cfg) => {
        setPaystackConfig(cfg);
      })
      .catch(console.error);

    // 2. Check if redirected from Paystack with ?payment_ref= or ?reference=
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('payment_ref') || params.get('reference');
    if (ref) {
      handleVerifyReference(ref);
    }
  }, []);

  const handleCurrencySelect = (curr: Currency) => {
    // An explicit choice is final for this session: auto-detection stands down.
    currencySettledRef.current = true;
    setSelectedCurrency(curr);
    storeCurrency(curr, true);
    // Promo discounts are validated per currency; clear so no stale amount is applied.
    setAppliedPromo(null);
  };

  const planPrice = (tier: 'pro' | 'enterprise', currency: Currency) => {
    if (currency === 'USD') {
      return tier === 'pro' ? paystackConfig?.proPriceUsd || 10 : paystackConfig?.enterprisePriceUsd || 50;
    }
    return tier === 'pro' ? paystackConfig?.proPriceNgn || 15000 : paystackConfig?.enterprisePriceNgn || 75000;
  };

  const promoDiscountFor = (amount: number) => {
    if (!appliedPromo || appliedPromo.currency !== selectedCurrency) return 0;
    if (appliedPromo.discountType === 'percentage') {
      return Math.round(amount * appliedPromo.discountValue) / 100;
    }
    return Math.min(amount, appliedPromo.discountAmount);
  };

  const promoAppliesTo = (tier: 'free' | 'pro' | 'enterprise') =>
    Boolean(
      appliedPromo &&
        appliedPromo.currency === selectedCurrency &&
        tier !== 'free' &&
        appliedPromo.applicableTiers.includes(tier)
    );

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
    // The code is validated against the currency on screen, so keep it fixed.
    currencySettledRef.current = true;

    try {
      const code = promoInput.trim().toUpperCase();
      const proAmount = planPrice('pro', selectedCurrency);

      let res: any = null;
      try {
        res = await adminService.validatePromo(code, 'pro', proAmount, selectedCurrency);
      } catch (proErr: any) {
        // Codes restricted to Enterprise are validated against the Enterprise price.
        const message = String(proErr?.message || '');
        if (!message.toLowerCase().includes('only valid for')) throw proErr;
        res = await adminService.validatePromo(
          code,
          'enterprise',
          planPrice('enterprise', selectedCurrency),
          selectedCurrency
        );
      }

      if (res?.valid) {
        setAppliedPromo({
          code: res.code,
          discountType: res.discountType,
          discountValue: res.discountValue,
          discountAmount: res.discountAmount,
          currency: res.currency === 'USD' ? 'USD' : 'NGN',
          applicableTiers: Array.isArray(res.applicableTiers) && res.applicableTiers.length > 0
            ? res.applicableTiers
            : ['pro', 'enterprise'],
        });
        setPromoError(null);
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
    // Charge exactly what is on screen: the currency can no longer auto-change.
    currencySettledRef.current = true;
    const checkoutCurrency: Currency = selectedCurrency;

    let baseAmount = plan.tier === 'pro' || plan.tier === 'enterprise'
      ? planPrice(plan.tier, checkoutCurrency)
      : 0;

    // Apply 20% discount for annual billing
    if (billingCycle === 'annual') {
      baseAmount = Math.round(baseAmount * 12 * 0.8);
    }

    // Promo codes only apply to the tiers they were issued for.
    const promoCodeToPass = promoAppliesTo(plan.tier) ? appliedPromo!.code : undefined;

    try {
      // Checkout is initialised by the server, which is the single source of truth
      // for the price: it charges the plan in the selected currency (Paystack
      // receives USD in cents and NGN in kobo) and applies the promo code once.
      // `baseAmount` is sent undiscounted and only used to flag price mismatches.
      const initRes = await paystackService.initializeTransaction(
        user.email,
        plan.tier,
        baseAmount,
        window.location.href,
        promoCodeToPass,
        checkoutCurrency,
        billingCycle
      );

      // Never send the customer to a checkout priced in a different currency.
      if (initRes.currency && initRes.currency !== checkoutCurrency) {
        throw new Error(
          `Checkout was prepared in ${initRes.currency} instead of ${checkoutCurrency}. No payment was taken. Please try again.`
        );
      }

      if (initRes.authorization_url) {
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
      {/* Back to App Navigation */}
      {onBackToApp && (
        <div className="flex items-center justify-between pb-4 border-b border-slate-200">
          <button
            type="button"
            onClick={onBackToApp}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-50 text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 text-slate-500" />
            <span>Back to Ticket Analyzer</span>
          </button>
          <span className="text-xs text-slate-400 font-medium hidden sm:inline">
            Context Pilot Subscription & Upgrades
          </span>
        </div>
      )}

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
              onClick={() => handleCurrencySelect('NGN')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                selectedCurrency === 'NGN'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              ₦ NGN
            </button>
            <button
              onClick={() => handleCurrencySelect('USD')}
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
                : `${selectedCurrency === 'USD' ? '$' : '₦'}${appliedPromo.discountAmount.toLocaleString()} OFF`}
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

          const promoActive = promoAppliesTo(plan.tier);
          const discountedPrice = promoActive
            ? Math.max(1, Math.round((monthlyPrice - promoDiscountFor(monthlyPrice)) * 100) / 100)
            : monthlyPrice;

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
                        {promoActive && (
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
