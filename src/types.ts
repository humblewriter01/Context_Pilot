export type SubscriptionTier = 'free' | 'pro' | 'enterprise';

export interface SubscriptionPlan {
  tier: SubscriptionTier;
  name: string;
  monthlyTicketLimit: number; // -1 for unlimited
  priceUsd: number;
  priceNgn: number;
  features: {
    analysis: boolean;
    github_verification: boolean;
    history_retention_days: number;
    support: string;
    priority_processing?: boolean;
    custom_models?: boolean;
    team_features?: boolean;
  };
}

export interface UserProfile {
  id: number;
  firebaseUid: string;
  email: string;
  displayName: string;
  photoUrl?: string;
  subscriptionTier: SubscriptionTier;
  createdAt: string;
  lastLoginAt: string;
  status: 'active' | 'suspended';
}

export interface UsageStats {
  ticketsProcessedThisMonth: number;
  monthlyLimit: number;
  remainingTickets: number;
  canAnalyze: boolean;
  monthYear: string;
}

export interface CategorizedFiles {
  frontend_files: string[];
  backend_files: string[];
  database_files: string[];
  config_files: string[];
  test_files: string[];
  confidence_score: number;
  reasoning: string;
  total_files: number;
}

export interface AnalysisRecord extends CategorizedFiles {
  id: number;
  userId: number;
  ticketKey: string;
  ticketTitle: string;
  ticketText: string;
  processingTimeMs: number;
  createdAt: string;
  userTier: SubscriptionTier;
}

export interface FeedbackRecord {
  id: number;
  userId: number;
  analysisId: number;
  ticketKey: string;
  wasAccurate: boolean;
  accuracyRating: number; // 1 to 5
  missingFiles: string[];
  incorrectFiles: string[];
  userComment: string;
  createdAt: string;
}

export interface GitHubFileVerification {
  path: string;
  exists: boolean;
  url?: string;
  size?: number;
  last_modified?: string;
  reason?: string;
  suggestions?: string[];
}

export interface GitHubVerificationResult {
  repoName: string;
  branch: string;
  verifiedFiles: GitHubFileVerification[];
  missingFiles: GitHubFileVerification[];
  verificationRate: number;
  totalChecked: number;
  rateLimitRemaining?: number;
  checkedAt: string;
}

export interface JiraTicket {
  key: string;
  title: string;
  description: string;
  type: 'Bug' | 'Story' | 'Task' | 'Improvement';
  priority: 'Highest' | 'High' | 'Medium' | 'Low';
  status: 'To Do' | 'In Progress' | 'In Review' | 'Done';
  assignee: {
    name: string;
    avatar: string;
    email: string;
  };
  reporter: {
    name: string;
    avatar: string;
  };
  created: string;
  updated: string;
  components: string[];
}

export interface PaystackTransaction {
  id: string;
  reference: string;
  amount: number; // in NGN or USD
  currency: string;
  email: string;
  tier: SubscriptionTier;
  status: 'success' | 'failed' | 'pending';
  channel?: string;
  paidAt?: string;
  createdAt: string;
}

export interface AdminProfile {
  email: string;
  name: string;
  role: 'superadmin' | 'admin';
  token: string;
}

export interface PromoCode {
  id: string;
  code: string;
  discountType: 'percentage' | 'fixed';
  discountValue: number;
  applicableTiers: ('pro' | 'enterprise')[];
  maxUses: number;
  usedCount: number;
  isActive: boolean;
  expiresAt?: string;
  createdAt: string;
}

export interface AdminSystemSettings {
  paystackPublicKey: string;
  hasPaystackSecretKey: boolean;
  paystackSecretKeyMasked?: string;
  isLiveMode: boolean;
  currency: 'NGN' | 'USD';
  proPriceNgn: number;
  proPriceUsd: number;
  enterprisePriceNgn: number;
  enterprisePriceUsd: number;
  freeLimit: number;
  proLimit: number;
  adminPassword?: string;
  maintenanceMode: boolean;
  geminiModel: string;
  githubClientId?: string;
  hasGithubClientSecret?: boolean;
  githubClientSecretMasked?: string;
}
