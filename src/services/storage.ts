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
    monthlyTicketLimit: 5,
    priceUsd: 0.0,
    features: {
      analysis: true,
      github_verification: false,
      history_retention_days: 7,
      support: 'community'
    }
  },
  pro: {
    tier: 'pro',
    name: 'Pro',
    monthlyTicketLimit: 100,
    priceUsd: 9.99,
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

const DEFAULT_USER: UserProfile = {
  id: 1,
  firebaseUid: 'usr_context_pilot_session',
  email: 'ameenujaafar432@gmail.com',
  displayName: 'Ameenu Jaafar',
  photoUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&h=100&fit=crop&crop=faces',
  subscriptionTier: 'pro',
  createdAt: new Date().toISOString(),
  lastLoginAt: new Date().toISOString()
};

function getCurrentMonthYear(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

const STORAGE_KEYS = {
  USER: 'context_pilot_user',
  USAGE: 'context_pilot_usage',
  ANALYSES: 'context_pilot_analyses',
  FEEDBACK: 'context_pilot_feedback',
  GITHUB_TOKEN: 'context_pilot_gh_token',
  GITHUB_REPO: 'context_pilot_gh_repo'
};

export const storageService = {
  getUser(): UserProfile {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.USER);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.warn('Failed to load user', e);
    }
    return DEFAULT_USER;
  },

  saveUser(user: UserProfile) {
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
  },

  updateTier(tier: SubscriptionTier) {
    const user = this.getUser();
    user.subscriptionTier = tier;
    this.saveUser(user);
    return user;
  },

  getUsage(): UsageStats {
    const user = this.getUser();
    const currentMonth = getCurrentMonthYear();
    const plan = SUBSCRIPTION_PLANS[user.subscriptionTier];
    
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

  getGitHubSettings(): { token: string; repo: string } {
    return {
      token: localStorage.getItem(STORAGE_KEYS.GITHUB_TOKEN) || '',
      repo: localStorage.getItem(STORAGE_KEYS.GITHUB_REPO) || 'humblewriter01/Context_Pilot'
    };
  },

  saveGitHubSettings(token: string, repo: string) {
    localStorage.setItem(STORAGE_KEYS.GITHUB_TOKEN, token);
    localStorage.setItem(STORAGE_KEYS.GITHUB_REPO, repo);
  }
};
