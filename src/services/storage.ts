import {
  UserProfile,
  SubscriptionPlan,
  SubscriptionTier,
  UsageStats,
  AnalysisRecord,
  FeedbackRecord
} from '../types';

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, SubscriptionPlan> = {
  free: {
    tier: 'free',
    name: 'Free Tier',
    monthlyTicketLimit: 10,
    priceUsd: 0.0,
    priceNgn: 0,
    features: {
      analysis: true,
      github_verification: false,
      history_retention_days: 14,
      support: 'community'
    }
  },
  pro: {
    tier: 'pro',
    name: 'Pro',
    monthlyTicketLimit: 150,
    priceUsd: 9.99,
    priceNgn: 15000,
    features: {
      analysis: true,
      github_verification: true,
      history_retention_days: 90,
      support: 'email',
      priority_processing: true
    }
  },
  enterprise: {
    tier: 'enterprise',
    name: 'Enterprise',
    monthlyTicketLimit: -1, // Unlimited
    priceUsd: 49.99,
    priceNgn: 75000,
    features: {
      analysis: true,
      github_verification: true,
      history_retention_days: 365,
      support: 'priority',
      priority_processing: true,
      custom_models: true,
      team_features: true
    }
  }
};

function getCurrentMonthYear(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

const STORAGE_KEYS = {
  USER: 'context_pilot_user',
  LOGGED_OUT: 'context_pilot_explicit_logged_out',
  USAGE: 'context_pilot_usage',
  ANALYSES: 'context_pilot_analyses',
  FEEDBACK: 'context_pilot_feedback',
  GITHUB_TOKEN: 'context_pilot_gh_token',
  GITHUB_REPO: 'context_pilot_gh_repo',
  GITHUB_USER: 'context_pilot_gh_user'
};

export const storageService = {
  getUser(): UserProfile | null {
    try {
      const isExplicitLoggedOut = localStorage.getItem(STORAGE_KEYS.LOGGED_OUT);
      if (isExplicitLoggedOut === 'true') {
        return null;
      }

      const data = localStorage.getItem(STORAGE_KEYS.USER);
      if (data) return JSON.parse(data);

      return null;
    } catch (e) {
      console.warn('Failed to load user', e);
      return null;
    }
  },

  saveUser(user: UserProfile) {
    localStorage.removeItem(STORAGE_KEYS.LOGGED_OUT);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  },

  updateProfile(updates: Partial<UserProfile>): UserProfile | null {
    const current = this.getUser();
    if (!current) return null;
    const updated: UserProfile = {
      ...current,
      ...updates
    };
    this.saveUser(updated);
    return updated;
  },

  logoutUser() {
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.setItem(STORAGE_KEYS.LOGGED_OUT, 'true');
  },

  async deleteAccount(): Promise<void> {
    const current = this.getUser();

    if (current?.email) {
      // Server-side cascade delete using the verified Supabase session.
      try {
        const { getAuthHeaders } = await import('./supabase');
        const headers = await getAuthHeaders();
        await fetch('/api/auth/delete-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...headers },
          body: JSON.stringify({ email: current.email })
        });
      } catch {
        // Offline / signed-out: local purge below is still applied.
      }
    }

    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.setItem(STORAGE_KEYS.LOGGED_OUT, 'true');
    localStorage.removeItem(STORAGE_KEYS.ANALYSES);
    localStorage.removeItem(STORAGE_KEYS.FEEDBACK);
    localStorage.removeItem(STORAGE_KEYS.GITHUB_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.GITHUB_REPO);
    localStorage.removeItem(STORAGE_KEYS.GITHUB_USER);
  },

  updateTier(tier: SubscriptionTier): UserProfile | null {
    const user = this.getUser();
    if (!user) return null;
    user.subscriptionTier = tier;
    this.saveUser(user);
    return user;
  },

  getUsage(): UsageStats {
    const user = this.getUser();
    const currentMonth = getCurrentMonthYear();
    const plan = user ? SUBSCRIPTION_PLANS[user.subscriptionTier] : SUBSCRIPTION_PLANS.free;
    
    let processed = 0;
    try {
      const stored = localStorage.getItem(`${STORAGE_KEYS.USAGE}_${currentMonth}`);
      if (stored !== null) {
        processed = parseInt(stored, 10);
      }
    } catch (e) {
      console.warn(e);
    }

    const limit = plan.monthlyTicketLimit;
    const canAnalyze = limit === -1 ? true : processed < limit;
    const remainingTickets = limit === -1 ? -1 : Math.max(0, limit - processed);

    return {
      ticketsProcessedThisMonth: processed,
      monthlyLimit: limit,
      remainingTickets,
      canAnalyze,
      monthYear: currentMonth
    };
  },

  incrementUsage(): UsageStats {
    const usage = this.getUsage();
    const newCount = usage.ticketsProcessedThisMonth + 1;
    localStorage.setItem(`${STORAGE_KEYS.USAGE}_${usage.monthYear}`, String(newCount));
    return this.getUsage();
  },

  resetUsage(): UsageStats {
    const currentMonth = getCurrentMonthYear();
    localStorage.setItem(`${STORAGE_KEYS.USAGE}_${currentMonth}`, '0');
    return this.getUsage();
  },

  /** Replaces the cached history with server-sourced records (no usage increment). */
  setAnalyses(list: AnalysisRecord[]): AnalysisRecord[] {
    try {
      localStorage.setItem(STORAGE_KEYS.ANALYSES, JSON.stringify(list));
    } catch (e) {
      console.warn('Failed to cache analyses', e);
    }
    return list;
  },

  /** Syncs the monthly counter with the authoritative server value. */
  setUsageCount(count: number, monthYear: string = getCurrentMonthYear()): void {
    try {
      localStorage.setItem(`${STORAGE_KEYS.USAGE}_${monthYear}`, String(Math.max(0, count)));
    } catch (e) {
      console.warn('Failed to cache usage', e);
    }
  },

  getAnalyses(): AnalysisRecord[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ANALYSES);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.warn(e);
    }
    return [];
  },

  saveAnalysis(analysis: AnalysisRecord): AnalysisRecord[] {
    const list = this.getAnalyses();
    const updated = [analysis, ...list];
    localStorage.setItem(STORAGE_KEYS.ANALYSES, JSON.stringify(updated));
    this.incrementUsage();
    return updated;
  },

  deleteAnalysis(id: number | string): AnalysisRecord[] {
    const list = this.getAnalyses();
    const updated = list.filter((a) => String(a.id) !== String(id));
    localStorage.setItem(STORAGE_KEYS.ANALYSES, JSON.stringify(updated));
    return updated;
  },

  clearAnalyses(): AnalysisRecord[] {
    localStorage.removeItem(STORAGE_KEYS.ANALYSES);
    return [];
  },

  getFeedback(): FeedbackRecord[] {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.FEEDBACK);
      if (stored) return JSON.parse(stored);
    } catch (e) {
      console.warn(e);
    }
    return [];
  },

  saveFeedback(fb: Omit<FeedbackRecord, 'id' | 'createdAt'>): FeedbackRecord {
    const list = this.getFeedback();
    const newRecord: FeedbackRecord = {
      ...fb,
      id: Date.now(),
      createdAt: new Date().toISOString()
    };
    const updated = [newRecord, ...list];
    localStorage.setItem(STORAGE_KEYS.FEEDBACK, JSON.stringify(updated));
    return newRecord;
  },

  getGitHubSettings(): { token: string; repo: string; username: string; avatarUrl?: string } {
    return {
      token: localStorage.getItem(STORAGE_KEYS.GITHUB_TOKEN) || '',
      repo: localStorage.getItem(STORAGE_KEYS.GITHUB_REPO) || 'humblewriter01/Context_Pilot',
      username: localStorage.getItem(STORAGE_KEYS.GITHUB_USER) || '',
      avatarUrl: localStorage.getItem('context_pilot_gh_avatar') || ''
    };
  },

  saveGitHubSettings(token: string, repo?: string, username?: string, avatarUrl?: string) {
    if (token) {
      localStorage.setItem(STORAGE_KEYS.GITHUB_TOKEN, token);
    } else {
      localStorage.removeItem(STORAGE_KEYS.GITHUB_TOKEN);
    }
    if (repo) localStorage.setItem(STORAGE_KEYS.GITHUB_REPO, repo);
    if (username !== undefined) {
      if (username) localStorage.setItem(STORAGE_KEYS.GITHUB_USER, username);
      else localStorage.removeItem(STORAGE_KEYS.GITHUB_USER);
    }
    if (avatarUrl !== undefined) {
      if (avatarUrl) localStorage.setItem('context_pilot_gh_avatar', avatarUrl);
      else localStorage.removeItem('context_pilot_gh_avatar');
    }
  },

  clearGitHubAuth() {
    localStorage.removeItem(STORAGE_KEYS.GITHUB_TOKEN);
    localStorage.removeItem(STORAGE_KEYS.GITHUB_USER);
    localStorage.removeItem('context_pilot_gh_avatar');
  }
};
