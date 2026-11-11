import { SubscriptionTier } from '../types';

export const paystackService = {
  async getConfig() {
    const res = await fetch('/api/paystack/config');
    if (!res.ok) throw new Error('Failed to load Paystack gateway configuration');
    return await res.json();
  },

  /**
   * Initializes a Paystack transaction through the server, which owns the price.
   *
   * `amount` is in major units ($10, ₦15,000) and is informational: the server
   * recomputes the charge from the plan, `currency` and `billingCycle`, converts
   * it to subunits for Paystack ($10 -> 1000 cents, ₦15,000 -> 1,500,000 kobo)
   * and returns the currency it actually used. Metadata carries the tier and
   * promo code for the automatic webhook upgrade.
   */
  async initializeTransaction(
    email: string,
    tier: SubscriptionTier,
    amount: number,
    callbackUrl?: string,
    promoCode?: string,
    currency: 'NGN' | 'USD' = 'USD',
    billingCycle: 'monthly' | 'annual' = 'monthly'
  ): Promise<{
    authorization_url: string;
    reference: string;
    finalAmount?: number;
    currency?: 'NGN' | 'USD';
  }> {
    const res = await fetch('/api/paystack/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        amount,
        tier,
        callback_url: callbackUrl,
        promo_code: promoCode,
        currency,
        billing_cycle: billingCycle,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to initialize payment with Paystack');
    }

    return data;
  },

  async verifyTransaction(reference: string) {
    const res = await fetch(`/api/paystack/verify/${encodeURIComponent(reference)}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Failed to verify Paystack payment');
    }
    return data;
  },
};
