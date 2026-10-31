import { SubscriptionTier } from '../types';

declare global {
  interface Window {
    PaystackPop?: {
      setup: (options: {
        key: string;
        email: string;
        amount: number;
        currency: string;
        ref: string;
        metadata?: any;
        callback: (response: { reference: string; status: string }) => void;
        onClose: () => void;
      }) => {
        openIframe: () => void;
      };
    };
  }
}

export const paystackService = {
  async getConfig() {
    const res = await fetch('/api/paystack/config');
    if (!res.ok) throw new Error('Failed to load Paystack gateway configuration');
    return await res.json();
  },

  async loadPaystackScript(): Promise<boolean> {
    if (typeof window === 'undefined') return false;
    if (window.PaystackPop) return true;
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://js.paystack.co/v1/inline.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  },

  /**
   * Initializes a transaction with Paystack via server-side endpoint.
   * Ensures amount is in major units on input, while server converts to subunits (e.g. $10 -> 1000 cents, ₦15000 -> 1500000 kobo).
   * Metadata includes tier and promo_code for automatic webhook upgrade.
   */
  async initializeTransaction(
    email: string,
    tier: SubscriptionTier,
    amount: number,
    callbackUrl?: string,
    promoCode?: string,
    currency: 'NGN' | 'USD' = 'NGN',
    billingCycle: 'monthly' | 'annual' = 'monthly'
  ): Promise<{ authorization_url: string; reference: string; finalAmount?: number }> {
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

  /**
   * Client-side inline checkout popup handler using PaystackPop.
   * Formats amount to subunits (amount * 100) and passes tier & promo_code in metadata.
   */
  async openInlineCheckout(options: {
    publicKey: string;
    email: string;
    amount: number; // in major unit (e.g. 10 for $10 or 15000 for ₦15,000)
    currency: 'NGN' | 'USD';
    tier: SubscriptionTier;
    promoCode?: string;
    onSuccess: (reference: string) => void;
    onClose?: () => void;
  }): Promise<boolean> {
    const loaded = await this.loadPaystackScript();
    if (!loaded || !window.PaystackPop) {
      return false;
    }

    // Amount in subunits: $10 -> 1000 cents, ₦15,000 -> 1500000 kobo
    const amountInSubunits = Math.round(options.amount * 100);
    const ref = `CP_${options.tier.toUpperCase()}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const handler = window.PaystackPop.setup({
      key: options.publicKey,
      email: options.email,
      amount: amountInSubunits,
      currency: options.currency,
      ref,
      metadata: {
        tier: options.tier,
        app: 'Context Pilot',
        customer_email: options.email,
        promo_code: options.promoCode || null,
        final_amount: options.amount,
        currency: options.currency,
      },
      callback: (response: { reference: string; status: string }) => {
        options.onSuccess(response.reference);
      },
      onClose: () => {
        if (options.onClose) options.onClose();
      },
    });

    handler.openIframe();
    return true;
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
