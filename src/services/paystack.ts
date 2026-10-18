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

  async initializeTransaction(
    email: string,
    tier: SubscriptionTier,
    amountNgn: number,
    callbackUrl?: string,
    promoCode?: string
  ): Promise<{ authorization_url: string; reference: string; finalAmount?: number }> {
    const res = await fetch('/api/paystack/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        amount: amountNgn,
        tier,
        callback_url: callbackUrl,
        promo_code: promoCode,
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
