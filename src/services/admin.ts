import { AdminProfile, AdminSystemSettings, PromoCode } from '../types';
import { getSession, signInWithEmailPassword } from './supabase';

const ADMIN_TOKEN_KEY = 'context_pilot_admin_token';
const ADMIN_PROFILE_KEY = 'context_pilot_admin_profile';

export const adminService = {
  async getToken(): Promise<string | null> {
    try {
      const session = await getSession();
      if (session?.access_token) {
        localStorage.setItem(ADMIN_TOKEN_KEY, session.access_token);
        return session.access_token;
      }
    } catch (e) {
      console.warn('Error reading Supabase session for admin:', e);
    }
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  },

  getProfile(): AdminProfile | null {
    const raw = localStorage.getItem(ADMIN_PROFILE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  logout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_PROFILE_KEY);
  },

  /**
   * Verifies the administrator's active Supabase session with the backend.
   * Backend strictly checks user.email === process.env.ADMIN_EMAIL.
   */
  async verifyAdminSession(): Promise<AdminProfile> {
    const token = await this.getToken();
    if (!token) {
      throw new Error('Forbidden. Please sign in with your administrator account.');
    }

    const res = await fetch('/api/admin/verify', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 403) {
        this.logout();
        throw new Error(data.error || 'Forbidden. Access restricted to administrator.');
      }
      throw new Error(data.error || 'Failed to verify admin authorization');
    }

    const profile: AdminProfile = {
      email: data.admin.email,
      name: data.admin.name,
      role: data.admin.role,
      token,
    };

    localStorage.setItem(ADMIN_TOKEN_KEY, token);
    localStorage.setItem(ADMIN_PROFILE_KEY, JSON.stringify(profile));
    return profile;
  },

  /**
   * Authenticates the administrator directly via Supabase Auth and verifies admin privileges.
   */
  async login(email: string, password: string): Promise<AdminProfile> {
    await signInWithEmailPassword(email, password);
    return await this.verifyAdminSession();
  },

  async getOverview() {
    const token = await this.getToken();
    const res = await fetch('/api/admin/overview', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 403) {
        this.logout();
        throw new Error('Forbidden. Administrator authorization required.');
      }
      throw new Error('Failed to load admin overview');
    }
    return await res.json();
  },

  async getAnalytics(days: number = 14) {
    const token = await this.getToken();
    const res = await fetch(`/api/admin/analytics?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 403) throw new Error('Forbidden. Administrator authorization required.');
      throw new Error('Failed to load analytics trends');
    }
    return await res.json();
  },

  async getUsers() {
    const token = await this.getToken();
    const res = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 403) throw new Error('Forbidden. Administrator authorization required.');
      throw new Error('Failed to load users');
    }
    return await res.json();
  },

  async updateUserTier(userId: number, tier: string) {
    const token = await this.getToken();
    const res = await fetch(`/api/admin/users/${userId}/tier`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tier }),
    });
    if (!res.ok) throw new Error('Failed to update user tier');
    return await res.json();
  },

  async resetUserQuota(userId: number) {
    const token = await this.getToken();
    const res = await fetch(`/api/admin/users/${userId}/reset-quota`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to reset user quota');
    return await res.json();
  },

  async toggleUserStatus(userId: number, status: 'active' | 'suspended') {
    const token = await this.getToken();
    const res = await fetch(`/api/admin/users/${userId}/status`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Failed to update user status');
    return await res.json();
  },

  async deleteUser(userId: number) {
    const token = await this.getToken();
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to delete user');
    return await res.json();
  },

  async getTransactions() {
    const token = await this.getToken();
    const res = await fetch('/api/admin/transactions', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 403) throw new Error('Forbidden. Administrator authorization required.');
      throw new Error('Failed to load transactions');
    }
    return await res.json();
  },

  async getFeedback() {
    const token = await this.getToken();
    const res = await fetch('/api/admin/feedback', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 403) throw new Error('Forbidden. Administrator authorization required.');
      throw new Error('Failed to load user feedback');
    }
    return await res.json();
  },

  async getPromos(): Promise<PromoCode[]> {
    const token = await this.getToken();
    const res = await fetch('/api/admin/promos', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 403) throw new Error('Forbidden. Administrator authorization required.');
      throw new Error('Failed to load promo codes');
    }
    return await res.json();
  },

  async createPromo(promo: {
    code: string;
    discountType: 'percentage' | 'fixed';
    discountValue: number;
    applicableTiers: ('pro' | 'enterprise')[];
    maxUses: number;
    expiresAt?: string;
  }): Promise<PromoCode> {
    const token = await this.getToken();
    const res = await fetch('/api/admin/promos', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(promo),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create promo code');
    return data.promo;
  },

  async togglePromo(promoId: string) {
    const token = await this.getToken();
    const res = await fetch(`/api/admin/promos/${promoId}/toggle`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to toggle promo code');
    return await res.json();
  },

  async deletePromo(promoId: string) {
    const token = await this.getToken();
    const res = await fetch(`/api/admin/promos/${promoId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Failed to delete promo code');
    return await res.json();
  },

  async validatePromo(code: string, tier: 'pro' | 'enterprise', amount: number, currency: 'NGN' | 'USD' = 'NGN') {
    const res = await fetch('/api/promos/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, tier, amount, currency }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Invalid promo code');
    return data;
  },

  async getSettings(): Promise<AdminSystemSettings> {
    const token = await this.getToken();
    const res = await fetch('/api/admin/settings', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      if (res.status === 403) throw new Error('Forbidden. Administrator authorization required.');
      throw new Error('Failed to load system settings');
    }
    return await res.json();
  },

  async updateSettings(settings: Partial<AdminSystemSettings & { paystackSecretKey?: string; githubClientSecret?: string }>) {
    const token = await this.getToken();
    const res = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(settings),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update settings');
    return data;
  },
};
