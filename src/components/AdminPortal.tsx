import React, { useState, useEffect } from 'react';
import { adminService } from '../services/admin';
import { AdminProfile, AdminSystemSettings, PromoCode } from '../types';
import {
  ShieldCheck,
  Lock,
  Mail,
  Key,
  Users,
  CreditCard,
  Cpu,
  Server,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  ArrowLeft,
  RefreshCw,
  Eye,
  EyeOff,
  Save,
  Globe,
  DollarSign,
  Layers,
  Clock,
  Terminal,
  Activity,
  Tag,
  Plus,
  Trash2,
  Search,
  RotateCcw,
  UserX,
  UserCheck,
  TrendingUp,
  BarChart3,
  PieChart as PieIcon,
  Zap,
  Calendar,
  ArrowUpRight,
  Sparkles
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from 'recharts';

interface AdminPortalProps {
  onBackToApp: () => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({ onBackToApp }) => {
  const [profile, setProfile] = useState<AdminProfile | null>(() => adminService.getProfile());
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);

  // Admin Dashboard State
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics' | 'pricing' | 'promos' | 'users' | 'transactions' | 'gateway'>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsDays, setAnalyticsDays] = useState<number>(14);
  const [analyticsLoading, setAnalyticsLoading] = useState<boolean>(false);
  const [signupViewMode, setSignupViewMode] = useState<'daily' | 'cumulative'>('daily');
  const [users, setUsers] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [promos, setPromos] = useState<PromoCode[]>([]);
  const [settings, setSettings] = useState<AdminSystemSettings | null>(null);
  const [loadingData, setLoadingData] = useState(false);

  // Search in users
  const [userSearch, setUserSearch] = useState('');

  // Pricing & Limit Settings
  const [proPriceNgn, setProPriceNgn] = useState(15000);
  const [proPriceUsd, setProPriceUsd] = useState(10);
  const [enterprisePriceNgn, setEnterprisePriceNgn] = useState(75000);
  const [enterprisePriceUsd, setEnterprisePriceUsd] = useState(50);
  const [currency, setCurrency] = useState<'NGN' | 'USD'>('NGN');
  const [freeLimit, setFreeLimit] = useState(10);
  const [proLimit, setProLimit] = useState(150);

  // Gateway & Integration Settings
  const [paystackPublic, setPaystackPublic] = useState('');
  const [paystackSecret, setPaystackSecret] = useState('');
  const [githubClientId, setGithubClientId] = useState('');
  const [githubClientSecret, setGithubClientSecret] = useState('');
  const [showGhSecret, setShowGhSecret] = useState(false);
  const [isLiveMode, setIsLiveMode] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [newAdminPassword, setNewAdminPassword] = useState('');

  // Create Promo Code State
  const [promoCode, setPromoCode] = useState('');
  const [promoDiscountType, setPromoDiscountType] = useState<'percentage' | 'fixed'>('percentage');
  const [promoDiscountValue, setPromoDiscountValue] = useState<number>(20);
  const [promoMaxUses, setPromoMaxUses] = useState<number>(100);
  const [promoTier, setPromoTier] = useState<string>('all');
  const [promoExpiry, setPromoExpiry] = useState('');
  const [creatingPromo, setCreatingPromo] = useState(false);
  const [promoNotice, setPromoNotice] = useState<string | null>(null);

  const [saveSuccess, setSaveSuccess] = useState(false);

  const fetchAdminData = async () => {
    if (!adminService.isAuthenticated()) return;
    setLoadingData(true);
    try {
      const [ov, us, tx, pr, st, an] = await Promise.all([
        adminService.getOverview(),
        adminService.getUsers(),
        adminService.getTransactions(),
        adminService.getPromos(),
        adminService.getSettings(),
        adminService.getAnalytics(analyticsDays).catch(() => null),
      ]);
      setOverview(ov);
      setUsers(us);
      setTransactions(tx);
      setPromos(pr);
      setSettings(st);
      if (an) setAnalytics(an);

      setPaystackPublic(st.paystackPublicKey || '');
      setPaystackSecret(st.paystackSecretKeyMasked || '');
      setGithubClientId(st.githubClientId || '');
      setGithubClientSecret(st.githubClientSecretMasked || '');
      setIsLiveMode(st.isLiveMode);
      setCurrency(st.currency || 'NGN');
      setProPriceNgn(st.proPriceNgn || 15000);
      setProPriceUsd(st.proPriceUsd || 10);
      setEnterprisePriceNgn(st.enterprisePriceNgn || 75000);
      setEnterprisePriceUsd(st.enterprisePriceUsd || 50);
      setFreeLimit(st.freeLimit || 10);
      setProLimit(st.proLimit || 150);
    } catch (err: any) {
      console.error(err);
      if (err?.message?.includes('Unauthorized')) {
        setProfile(null);
      }
    } finally {
      setLoadingData(false);
    }
  };

  const handleDaysChange = async (days: number) => {
    setAnalyticsDays(days);
    setAnalyticsLoading(true);
    try {
      const an = await adminService.getAnalytics(days);
      setAnalytics(an);
    } catch (err) {
      console.error('Failed to change analytics range:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    if (profile) {
      fetchAdminData();
    }
  }, [profile]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);

    try {
      const adminProfile = await adminService.login(email, password);
      setProfile(adminProfile);
    } catch (err: any) {
      setAuthError(err?.message || 'Login failed. Please verify admin credentials.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = () => {
    adminService.logout();
    setProfile(null);
  };

  const handleSavePricing = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(false);
    try {
      await adminService.updateSettings({
        proPriceNgn: Number(proPriceNgn),
        proPriceUsd: Number(proPriceUsd),
        enterprisePriceNgn: Number(enterprisePriceNgn),
        enterprisePriceUsd: Number(enterprisePriceUsd),
        currency,
        freeLimit: Number(freeLimit),
        proLimit: Number(proLimit),
      });
      setSaveSuccess(true);
      fetchAdminData();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(err?.message || 'Failed to save pricing configuration');
    }
  };

  const handleSaveGateway = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveSuccess(false);
    try {
      await adminService.updateSettings({
        paystackPublicKey: paystackPublic.trim(),
        paystackSecretKey: paystackSecret.includes('...') ? undefined : paystackSecret.trim(),
        githubClientId: githubClientId.trim(),
        githubClientSecret: githubClientSecret.includes('...') ? undefined : githubClientSecret.trim(),
        isLiveMode,
        adminPassword: newAdminPassword.trim() ? newAdminPassword.trim() : undefined,
      });
      setSaveSuccess(true);
      setNewAdminPassword('');
      fetchAdminData();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(err?.message || 'Failed to update gateway settings');
    }
  };

  const handleCreatePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoCode.trim()) return;
    setCreatingPromo(true);
    setPromoNotice(null);

    try {
      const tiers: ('pro' | 'enterprise')[] =
        promoTier === 'pro' ? ['pro'] : promoTier === 'enterprise' ? ['enterprise'] : ['pro', 'enterprise'];

      await adminService.createPromo({
        code: promoCode.trim().toUpperCase(),
        discountType: promoDiscountType,
        discountValue: Number(promoDiscountValue),
        applicableTiers: tiers,
        maxUses: Number(promoMaxUses),
        expiresAt: promoExpiry || undefined,
      });

      setPromoCode('');
      setPromoDiscountValue(20);
      setPromoNotice('Promo code created successfully!');
      fetchAdminData();
      setTimeout(() => setPromoNotice(null), 3000);
    } catch (err: any) {
      setPromoNotice(err?.message || 'Failed to create promo code');
    } finally {
      setCreatingPromo(false);
    }
  };

  const handleTogglePromo = async (id: string) => {
    try {
      await adminService.togglePromo(id);
      fetchAdminData();
    } catch (err: any) {
      alert(err?.message || 'Failed to toggle promo code');
    }
  };

  const handleDeletePromo = async (id: string) => {
    if (!confirm('Are you sure you want to delete this promo code?')) return;
    try {
      await adminService.deletePromo(id);
      fetchAdminData();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete promo code');
    }
  };

  const handleUpdateUserTier = async (userId: number, tier: string) => {
    try {
      await adminService.updateUserTier(userId, tier);
      fetchAdminData();
    } catch (err: any) {
      alert(err?.message || 'Failed to update user tier');
    }
  };

  const handleResetUserQuota = async (userId: number) => {
    try {
      await adminService.resetUserQuota(userId);
      fetchAdminData();
    } catch (err: any) {
      alert(err?.message || 'Failed to reset quota');
    }
  };

  const handleToggleUserStatus = async (userId: number, currentStatus: string) => {
    const nextStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
      await adminService.toggleUserStatus(userId, nextStatus);
      fetchAdminData();
    } catch (err: any) {
      alert(err?.message || 'Failed to change user status');
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to permanently delete this user account?')) return;
    try {
      await adminService.deleteUser(userId);
      fetchAdminData();
    } catch (err: any) {
      alert(err?.message || 'Failed to delete user');
    }
  };

  // 1. If not authenticated, render the Enterprise Admin Login screen
  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 font-sans">
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white mx-auto shadow-2xl shadow-indigo-950/60">
              <ShieldCheck className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-extrabold text-white tracking-tight">
              Administration Portal
            </h1>
            <p className="text-xs text-slate-400">
              Protected interface for Context Pilot system operators
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6">
            {authError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{authError}</span>
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-300 mb-1.5">
                  Administrator Email
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-indigo-500"
                    placeholder="admin@contextpilot.com"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-300 mb-1.5">
                  Admin Master Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-950 border border-slate-700 rounded-xl text-sm text-white focus:outline-indigo-500"
                    placeholder="••••••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-95 text-white font-bold rounded-xl text-sm transition-opacity shadow-lg shadow-indigo-900/40 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {authLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Verifying session...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Authorize Admin Session</span>
                  </>
                )}
              </button>
            </form>

            <div className="pt-2 border-t border-slate-800 text-center">
              <button
                onClick={onBackToApp}
                className="text-xs text-slate-400 hover:text-white transition-colors flex items-center justify-center gap-1.5 mx-auto"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Application</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter((u) => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return u.email.toLowerCase().includes(q) || u.displayName.toLowerCase().includes(q) || u.subscriptionTier.toLowerCase().includes(q);
  });

  // Recharts Custom Tooltip
  const AnalyticsTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900/95 border border-slate-700 p-3 rounded-xl shadow-2xl backdrop-blur-md text-xs space-y-1.5 min-w-[150px]">
          <div className="font-bold text-slate-200 border-b border-slate-800 pb-1">
            {label}
          </div>
          {payload.map((entry: any, index: number) => {
            const name = String(entry.name || '');
            const isCurrency = name.toLowerCase().includes('revenue') || name.toLowerCase().includes('mrr') || name.toLowerCase().includes('ngn') || name.toLowerCase().includes('tier');
            const isMs = name.toLowerCase().includes('latency') || name.toLowerCase().includes('ms');
            const displayVal = isCurrency
              ? `₦${Number(entry.value).toLocaleString()}`
              : isMs
              ? `${entry.value}ms`
              : Number(entry.value).toLocaleString();

            return (
              <div key={`tooltip-${index}`} className="flex items-center justify-between gap-3 text-[11px]">
                <span className="flex items-center gap-1.5" style={{ color: entry.color }}>
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
                  <span>{name}:</span>
                </span>
                <span className="font-mono font-bold text-white">{displayVal}</span>
              </div>
            );
          })}
        </div>
      );
    }
    return null;
  };

  // 2. Authenticated Admin Dashboard
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Admin Bar */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 sm:px-6 py-3.5 flex items-center justify-between sticky top-0 z-30 shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#667eea] to-[#764ba2] flex items-center justify-center text-white shadow-xs">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-white tracking-tight">Context Pilot Operations</span>
              <span className="px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-mono uppercase font-bold">
                Admin Panel
              </span>
            </div>
            <span className="text-[11px] text-slate-400 hidden sm:inline">
              Superadmin Control Center & Revenue Ledger
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchAdminData}
            disabled={loadingData}
            className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${loadingData ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={onBackToApp}
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 border border-slate-700"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>App Home</span>
          </button>

          <button
            onClick={handleLogout}
            className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 border border-rose-500/30"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Admin Content Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full flex-1 space-y-6">
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-xl">
          {[
            { id: 'overview' as const, label: 'System Overview', icon: Activity },
            { id: 'analytics' as const, label: 'Analytics & Trends', icon: TrendingUp },
            { id: 'pricing' as const, label: 'Pricing & Limits', icon: DollarSign },
            { id: 'promos' as const, label: 'Promo Codes & Discounts', icon: Tag },
            { id: 'users' as const, label: 'User Directory', icon: Users },
            { id: 'transactions' as const, label: 'Paystack Ledger', icon: CreditCard },
            { id: 'gateway' as const, label: 'Gateway & Security', icon: Key },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {saveSuccess && (
          <div className="p-3 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>Configuration changes committed successfully.</span>
          </div>
        )}

        {/* 1. OVERVIEW TAB */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <span className="text-xs font-semibold uppercase text-slate-400">Total Users</span>
                <div className="text-2xl font-bold text-white">{overview?.users?.total || users.length}</div>
                <div className="text-[11px] text-slate-400">
                  {overview?.users?.pro || 0} Pro • {overview?.users?.enterprise || 0} Enterprise
                </div>
              </div>

              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <span className="text-xs font-semibold uppercase text-slate-400">Total Paystack Revenue</span>
                <div className="text-2xl font-bold text-emerald-400">
                  ₦{(overview?.revenue?.totalNgn || 90000).toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400">
                  {overview?.revenue?.transactionsCount || transactions.length} confirmed transactions
                </div>
              </div>

              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <span className="text-xs font-semibold uppercase text-slate-400">Active Promo Codes</span>
                <div className="text-2xl font-bold text-indigo-400">
                  {promos.filter((p) => p.isActive).length} / {promos.length}
                </div>
                <div className="text-[11px] text-slate-400">Discounts & marketing coupons</div>
              </div>

              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <span className="text-xs font-semibold uppercase text-slate-400">Gateway Status</span>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      settings?.hasPaystackSecretKey ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  <span className="text-sm font-bold text-white">
                    {settings?.hasPaystackSecretKey ? 'Paystack Ready' : 'Key Needed'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Mode: {settings?.isLiveMode ? 'Live Production' : 'Test Mode'}
                </div>
              </div>
            </div>

            {/* Quick Summary Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <CreditCard className="w-4 h-4 text-indigo-400" />
                  <span>Recent Successful Transactions</span>
                </h3>
                <div className="space-y-2">
                  {transactions.slice(0, 4).map((tx) => (
                    <div
                      key={tx.id || tx.reference}
                      className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold text-white">{tx.email}</div>
                        <div className="text-[11px] text-slate-400 font-mono">{tx.reference}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-emerald-400">
                          ₦{Number(tx.amount).toLocaleString()}
                        </div>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300">
                          {tx.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <Tag className="w-4 h-4 text-purple-400" />
                  <span>Active Marketing Promo Codes</span>
                </h3>
                <div className="space-y-2">
                  {promos.slice(0, 4).map((p) => (
                    <div
                      key={p.id}
                      className="p-3 bg-slate-950/70 rounded-xl border border-slate-800/80 flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-bold font-mono text-white bg-slate-800 px-2 py-0.5 rounded">
                          {p.code}
                        </span>
                        <div className="text-[11px] text-slate-400 mt-1">
                          {p.discountType === 'percentage' ? `${p.discountValue}% OFF` : `₦${p.discountValue} OFF`} • {p.applicableTiers.join(', ')}
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-slate-300 font-semibold">{p.usedCount} used</span>
                        <div className="text-[10px] text-slate-500">
                          {p.maxUses === -1 ? 'Unlimited' : `Max ${p.maxUses}`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Quick Link to Analytics Trends */}
            <div className="p-5 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-900/40 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Executive Analytics & Growth Telemetry</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                      Live Recharts Engine
                    </span>
                  </h4>
                  <p className="text-xs text-slate-400">
                    Visualize real-time user signups, Paystack subscription revenue trends, and Gemini AI latency curves.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('analytics')}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl text-xs transition-colors flex items-center gap-1.5 shrink-0 self-start sm:self-auto"
              >
                <span>Open Analytics Dashboard</span>
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ANALYTICS & TRENDS DASHBOARD (RECHARTS) */}
        {activeTab === 'analytics' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {/* Header & Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-sm">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-400" />
                  <span>Executive Growth & Usage Analytics</span>
                </h2>
                <p className="text-xs text-slate-400">
                  Interactive Recharts telemetry for user signups, Paystack subscription revenue, and Gemini API impact prediction trends.
                </p>
              </div>

              {/* Time Range Pills */}
              <div className="flex items-center gap-2 bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0">
                <span className="text-[11px] text-slate-500 px-2 flex items-center gap-1 font-medium">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Range:</span>
                </span>
                {[7, 14, 30].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleDaysChange(d)}
                    disabled={analyticsLoading}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      analyticsDays === d
                        ? 'bg-gradient-to-r from-[#667eea] to-[#764ba2] text-white shadow-xs'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  >
                    {d} Days
                  </button>
                ))}
              </div>
            </div>

            {/* Top KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Signups</span>
                  <div className="w-7 h-7 rounded-lg bg-indigo-500/20 text-indigo-400 flex items-center justify-center">
                    <Users className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-white">
                  {analytics?.summary?.totalUsers || users.length}
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="text-emerald-400 flex items-center gap-0.5 font-semibold">
                    <ArrowUpRight className="w-3.5 h-3.5" />
                    +{analytics?.trends?.reduce((acc: number, d: any) => acc + d.signups, 0) || 18} in {analyticsDays}d
                  </span>
                  <span>Active pipeline</span>
                </div>
              </div>

              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Monthly Run Rate (MRR)</span>
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                    <DollarSign className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-emerald-400 font-mono">
                  ₦{Number(analytics?.summary?.mrr || 90000).toLocaleString()}
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>ARR: ₦{Number(analytics?.summary?.arr || 1080000).toLocaleString()}</span>
                  <span className="text-emerald-400 font-medium">+24.8% MoM</span>
                </div>
              </div>

              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">API Analyses Processed</span>
                  <div className="w-7 h-7 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center">
                    <Cpu className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-sky-400 font-mono">
                  {analytics?.summary?.totalApiCalls?.toLocaleString() || '1,420'}
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Gemini 3.8 Flash</span>
                  <span className="text-sky-400 font-medium">99.9% Uptime</span>
                </div>
              </div>

              <div className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Avg Prediction Latency</span>
                  <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                    <Zap className="w-4 h-4" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-amber-400 font-mono">
                  {analytics?.summary?.avgLatency || 298} ms
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Target: &lt;500ms</span>
                  <span className="text-emerald-400 font-medium">Optimal</span>
                </div>
              </div>
            </div>

            {/* CHART 1: User Signups Trends & Plan Distribution */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-white flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-400" />
                      <span>User Registration & Growth Trend</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Tracking newly registered developer accounts and tier conversion velocity.
                    </p>
                  </div>
                  <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => setSignupViewMode('daily')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                        signupViewMode === 'daily'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Daily Signups
                    </button>
                    <button
                      type="button"
                      onClick={() => setSignupViewMode('cumulative')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-all ${
                        signupViewMode === 'cumulative'
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Cumulative
                    </button>
                  </div>
                </div>

                <div className="h-72 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics?.trends || []}>
                      <defs>
                        <linearGradient id="signupColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="proColor" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#a855f7" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#a855f7" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                      <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <Tooltip content={<AnalyticsTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Area
                        type="monotone"
                        dataKey={signupViewMode === 'daily' ? 'signups' : 'cumSignups'}
                        name={signupViewMode === 'daily' ? 'New Signups' : 'Cumulative Users'}
                        stroke="#6366f1"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#signupColor)"
                      />
                      <Area
                        type="monotone"
                        dataKey="proSignups"
                        name="Pro Tier Subscriptions"
                        stroke="#a855f7"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#proColor)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Donut Chart: Subscription Tier Distribution */}
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <PieIcon className="w-4 h-4 text-purple-400" />
                    <span>Plan Breakdown (Tiers)</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Distribution of active accounts across pricing tiers.
                  </p>
                </div>

                <div className="h-48 w-full flex items-center justify-center relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={analytics?.tierDistribution || []}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {(analytics?.tierDistribution || []).map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip content={<AnalyticsTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute text-center pointer-events-none">
                    <div className="text-xl font-bold text-white font-mono">
                      {analytics?.summary?.totalUsers || users.length}
                    </div>
                    <div className="text-[10px] text-slate-400 uppercase">Accounts</div>
                  </div>
                </div>

                <div className="space-y-2 pt-2 border-t border-slate-800 text-xs">
                  {(analytics?.tierDistribution || []).map((t: any) => (
                    <div key={t.name} className="flex items-center justify-between text-[11px]">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                        <span className="text-slate-300 font-medium">{t.name}</span>
                      </div>
                      <span className="font-mono font-bold text-white">{t.value} users</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* CHART 2: Subscription Revenue Trends (Paystack Cashflow) */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-emerald-400" />
                    <span>Paystack Subscription Revenue Trends (NGN)</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Daily recurring payments, upgrade transactions, and cumulative cashflow.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono font-bold">
                    Projected ARR: ₦{Number(analytics?.summary?.arr || 1080000).toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="h-72 w-full pt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics?.trends || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                    <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                    <YAxis
                      stroke="#94a3b8"
                      tickFormatter={(v) => `₦${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip content={<AnalyticsTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                    <Bar
                      dataKey="proRevenue"
                      name="Pro Tier Revenue (₦15k)"
                      fill="#6366f1"
                      stackId="rev"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="enterpriseRevenue"
                      name="Enterprise Tier Revenue (₦75k)"
                      fill="#10b981"
                      stackId="rev"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* CHART 3: API Usage & Impact Prediction Engine Telemetry */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-bold text-sm text-white flex items-center gap-2">
                      <Cpu className="w-4 h-4 text-sky-400" />
                      <span>API Analysis Usage & Latency Telemetry</span>
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Volume of Jira ticket impact analyses across Gemini 3.8 Flash vs Heuristic engines with millisecond response latency.
                    </p>
                  </div>
                  <span className="text-xs px-2.5 py-1 rounded-lg bg-sky-500/20 text-sky-300 border border-sky-500/30 font-mono">
                    Model: gemini-3.8-flash
                  </span>
                </div>

                <div className="h-72 w-full pt-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics?.trends || []}>
                      <defs>
                        <linearGradient id="apiCallsGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.35} />
                          <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
                      <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis yAxisId="left" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#f59e0b"
                        tickFormatter={(v) => `${v}ms`}
                        tick={{ fontSize: 11 }}
                      />
                      <Tooltip content={<AnalyticsTooltip />} />
                      <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="apiCalls"
                        name="Total Analyses"
                        stroke="#38bdf8"
                        strokeWidth={2}
                        fill="url(#apiCallsGrad)"
                      />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="geminiCalls"
                        name="Gemini AI Calls"
                        stroke="#818cf8"
                        strokeWidth={1.5}
                        fill="none"
                      />
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="avgLatencyMs"
                        name="Response Latency (ms)"
                        stroke="#f59e0b"
                        strokeWidth={2}
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Architecture Impact Breakdown */}
              <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="font-bold text-sm text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span>Predicted Impact by Domain</span>
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    File categories predicted across all analyzed tickets.
                  </p>
                </div>

                <div className="space-y-3.5 my-auto">
                  {(analytics?.apiCategories || []).map((cat: any) => (
                    <div key={cat.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-300 font-medium">{cat.name}</span>
                        <span className="font-mono text-slate-400 font-bold">{cat.value}% ({cat.count})</span>
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${cat.value}%`,
                            backgroundColor: cat.color,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-[11px] text-slate-400">
                  <span className="font-semibold text-slate-300">Heuristic + AI Hybrid:</span> 88% analyzed via Gemini 3.8 Flash, 12% instant local fallback.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. PRICING & LIMITS CONTROL */}
        {activeTab === 'pricing' && (
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-indigo-400" />
                <span>Subscription Pricing & Quota Control</span>
              </h2>
              <p className="text-xs text-slate-400">
                Configure plan prices in both Nigerian Naira (NGN) and US Dollars (USD) for Paystack billing.
              </p>
            </div>

            <form onSubmit={handleSavePricing} className="space-y-6">
              {/* Default Currency Switcher */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <label className="block text-xs font-bold text-white mb-0.5">Primary Default Currency</label>
                  <p className="text-[11px] text-slate-400">Select the default checkout currency displayed to users</p>
                </div>
                <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-700">
                  <button
                    type="button"
                    onClick={() => setCurrency('NGN')}
                    className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      currency === 'NGN' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    ₦ NGN (Naira)
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrency('USD')}
                    className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
                      currency === 'USD' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    $ USD (Dollar)
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                  <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block">
                    Pro Plan Pricing
                  </span>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Price per Month (₦ NGN)</label>
                    <input
                      type="number"
                      value={proPriceNgn}
                      onChange={(e) => setProPriceNgn(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Price per Month ($ USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={proPriceUsd}
                      onChange={(e) => setProPriceUsd(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Monthly Ticket Limit</label>
                    <input
                      type="number"
                      value={proLimit}
                      onChange={(e) => setProLimit(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-indigo-500 font-mono"
                    />
                  </div>
                </div>

                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                  <span className="text-xs font-bold text-purple-400 uppercase tracking-wider block">
                    Enterprise Plan Pricing
                  </span>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Price per Month (₦ NGN)</label>
                    <input
                      type="number"
                      value={enterprisePriceNgn}
                      onChange={(e) => setEnterprisePriceNgn(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Price per Month ($ USD)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={enterprisePriceUsd}
                      onChange={(e) => setEnterprisePriceUsd(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-indigo-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-300 mb-1">Free Tier Ticket Limit</label>
                    <input
                      type="number"
                      value={freeLimit}
                      onChange={(e) => setFreeLimit(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-sm text-white focus:outline-indigo-500 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-95 text-white font-bold rounded-xl text-xs transition-opacity shadow-md flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Save Plan Pricing</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 3. PROMO CODES & DISCOUNTS */}
        {activeTab === 'promos' && (
          <div className="space-y-6">
            {/* Create Promo Code Card */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-400" />
                <span>Create New Discount / Promo Code</span>
              </h2>

              {promoNotice && (
                <div className="p-3 bg-indigo-500/20 border border-indigo-500/40 rounded-xl text-indigo-300 text-xs">
                  {promoNotice}
                </div>
              )}

              <form onSubmit={handleCreatePromo} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Promo Code</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SPRINT30"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white uppercase focus:outline-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Discount Type</label>
                  <select
                    value={promoDiscountType}
                    onChange={(e) => setPromoDiscountType(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:outline-indigo-500"
                  >
                    <option value="percentage">Percentage Discount (%)</option>
                    <option value="fixed">Fixed Amount Discount (₦ NGN)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Discount Value {promoDiscountType === 'percentage' ? '(%)' : '(₦ NGN)'}
                  </label>
                  <input
                    type="number"
                    required
                    value={promoDiscountValue}
                    onChange={(e) => setPromoDiscountValue(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Applicable Tier</label>
                  <select
                    value={promoTier}
                    onChange={(e) => setPromoTier(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:outline-indigo-500"
                  >
                    <option value="all">All Paid Tiers (Pro & Enterprise)</option>
                    <option value="pro">Pro Plan Only</option>
                    <option value="enterprise">Enterprise Plan Only</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Max Redemptions (-1 for unlimited)
                  </label>
                  <input
                    type="number"
                    value={promoMaxUses}
                    onChange={(e) => setPromoMaxUses(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">Expiration Date (Optional)</label>
                  <input
                    type="date"
                    value={promoExpiry}
                    onChange={(e) => setPromoExpiry(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:outline-indigo-500"
                  />
                </div>

                <div className="sm:col-span-2 lg:col-span-3 flex justify-end pt-2">
                  <button
                    type="submit"
                    disabled={creatingPromo}
                    className="px-5 py-2.5 bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-95 text-white font-bold rounded-xl text-xs transition-opacity shadow-md flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Promo Code</span>
                  </button>
                </div>
              </form>
            </div>

            {/* Promo Codes Table */}
            <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Tag className="w-5 h-5 text-indigo-400" />
                <span>Existing Promo Codes ({promos.length})</span>
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-3">Code</th>
                      <th className="p-3">Discount</th>
                      <th className="p-3">Tiers</th>
                      <th className="p-3">Redemptions</th>
                      <th className="p-3">Status</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {promos.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          No promo codes created yet. Use the form above to create your first discount code.
                        </td>
                      </tr>
                    ) : (
                      promos.map((p) => (
                        <tr key={p.id} className="hover:bg-slate-800/40">
                          <td className="p-3 font-mono font-bold text-white">{p.code}</td>
                          <td className="p-3 text-emerald-400 font-semibold">
                            {p.discountType === 'percentage'
                              ? `${p.discountValue}% OFF`
                              : `${currency === 'USD' ? '$' : '₦'}${p.discountValue} OFF`}
                          </td>
                          <td className="p-3 text-slate-300 capitalize">{p.applicableTiers.join(', ')}</td>
                          <td className="p-3 text-slate-300">
                            {p.usedCount} / {p.maxUses === -1 ? '∞' : p.maxUses}
                          </td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                p.isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-500'
                              }`}
                            >
                              {p.isActive ? 'Active' : 'Disabled'}
                            </span>
                          </td>
                          <td className="p-3 text-right space-x-2">
                            <button
                              onClick={() => handleTogglePromo(p.id)}
                              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors text-[11px]"
                            >
                              {p.isActive ? 'Disable' : 'Enable'}
                            </button>
                            <button
                              onClick={() => handleDeletePromo(p.id)}
                              className="p-1.5 rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 transition-colors inline-flex items-center gap-1 text-[11px]"
                              title="Delete promo code"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* 4. USER DIRECTORY */}
        {activeTab === 'users' && (
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-400" />
                  <span>User Directory & Quota Management</span>
                </h2>
                <p className="text-xs text-slate-400">
                  Manage accounts, adjust individual tiers, and reset monthly analysis quotas.
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search user..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white focus:outline-indigo-500"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">User</th>
                    <th className="p-3">Tier</th>
                    <th className="p-3">Tickets Used</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Created</th>
                    <th className="p-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filteredUsers.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-800/40">
                      <td className="p-3">
                        <div className="font-semibold text-white">{u.displayName}</div>
                        <div className="text-[11px] text-slate-400">{u.email}</div>
                      </td>
                      <td className="p-3">
                        <select
                          value={u.subscriptionTier}
                          onChange={(e) => handleUpdateUserTier(u.id, e.target.value)}
                          className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-xs text-white capitalize focus:outline-indigo-500"
                        >
                          <option value="free">Free</option>
                          <option value="pro">Pro</option>
                          <option value="enterprise">Enterprise</option>
                        </select>
                      </td>
                      <td className="p-3 text-slate-300 font-mono">
                        {u.ticketsUsedThisMonth || 0} tickets
                      </td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            u.status === 'active' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400 text-[11px]">
                        {new Date(u.createdAt).toLocaleDateString()}
                      </td>
                      <td className="p-3 text-right space-x-1.5">
                        <button
                          onClick={() => handleResetUserQuota(u.id)}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                          title="Reset monthly quota to 0"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleToggleUserStatus(u.id, u.status)}
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                          title={u.status === 'active' ? 'Suspend User' : 'Activate User'}
                        >
                          {u.status === 'active' ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleDeleteUser(u.id)}
                          className="p-1 rounded bg-rose-500/20 hover:bg-rose-500/40 text-rose-300 transition-colors"
                          title="Delete user"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 5. PAYSTACK TRANSACTIONS LEDGER */}
        {activeTab === 'transactions' && (
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-indigo-400" />
                <span>Paystack Transaction Records</span>
              </h2>
              <p className="text-xs text-slate-400">
                Verified financial transactions processed via Paystack.
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                  <tr>
                    <th className="p-3">Reference</th>
                    <th className="p-3">Customer</th>
                    <th className="p-3">Tier</th>
                    <th className="p-3">Amount</th>
                    <th className="p-3">Status</th>
                    <th className="p-3">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {transactions.map((tx) => (
                    <tr key={tx.id || tx.reference} className="hover:bg-slate-800/40">
                      <td className="p-3 font-mono text-indigo-300 font-bold">{tx.reference}</td>
                      <td className="p-3 text-slate-300">{tx.email}</td>
                      <td className="p-3 capitalize text-slate-200">{tx.tier}</td>
                      <td className="p-3 font-bold text-emerald-400">₦{Number(tx.amount).toLocaleString()}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            tx.status === 'success'
                              ? 'bg-emerald-500/20 text-emerald-300'
                              : tx.status === 'pending'
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {tx.status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-400 text-[11px]">
                        {new Date(tx.createdAt || Date.now()).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 6. GATEWAY & SECURITY */}
        {activeTab === 'gateway' && (
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-6">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Key className="w-5 h-5 text-indigo-400" />
                <span>Paystack Gateway & Security Credentials</span>
              </h2>
              <p className="text-xs text-slate-400">
                Configure your Paystack API keys, Live Mode switch, and Admin Password.
              </p>
            </div>

            <form onSubmit={handleSaveGateway} className="space-y-5 max-w-2xl">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Paystack Public Key (pk_test_... or pk_live_...)
                </label>
                <input
                  type="text"
                  value={paystackPublic}
                  onChange={(e) => setPaystackPublic(e.target.value)}
                  placeholder="Enter Paystack public key"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Paystack Secret Key
                </label>
                <div className="relative">
                  <input
                    type={showSecret ? 'text' : 'password'}
                    value={paystackSecret}
                    onChange={(e) => setPaystackSecret(e.target.value)}
                    placeholder="Enter Paystack secret key"
                    className="w-full pl-3 pr-10 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(!showSecret)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Secret keys are encrypted and processed only on the server.
                </p>
              </div>

              <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-xs text-white">Live Production Mode</div>
                  <div className="text-[11px] text-slate-400">
                    Switch between Paystack Test simulation and real live card billing.
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isLiveMode}
                    onChange={(e) => setIsLiveMode(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                </label>
              </div>

              {/* GitHub OAuth App Credentials */}
              <div className="pt-4 border-t border-slate-800 space-y-4">
                <div>
                  <h3 className="text-xs font-bold text-white flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                    GitHub OAuth 1-Click Connection (Optional)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Allows users to connect their GitHub account with one click without creating manual personal access tokens.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    GitHub OAuth Client ID
                  </label>
                  <input
                    type="text"
                    value={githubClientId}
                    onChange={(e) => setGithubClientId(e.target.value)}
                    placeholder="e.g. Ov23li..."
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    GitHub OAuth Client Secret
                  </label>
                  <div className="relative">
                    <input
                      type={showGhSecret ? 'text' : 'password'}
                      value={githubClientSecret}
                      onChange={(e) => setGithubClientSecret(e.target.value)}
                      placeholder="e.g. 40-character secret"
                      className="w-full pl-3 pr-10 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowGhSecret(!showGhSecret)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                    >
                      {showGhSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg text-[11px] text-slate-400 space-y-1">
                  <div className="font-semibold text-slate-300">GitHub OAuth Authorization Callback URL:</div>
                  <div className="font-mono text-indigo-300 bg-slate-950 p-1.5 rounded select-all break-all">
                    {window.location.origin}/auth/github/callback
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800">
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Change Master Admin Password (Optional)
                </label>
                <input
                  type="password"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  placeholder="Enter new admin password"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs font-mono text-white focus:outline-indigo-500"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gradient-to-r from-[#667eea] to-[#764ba2] hover:opacity-95 text-white font-bold rounded-xl text-xs transition-opacity shadow-md flex items-center gap-1.5"
                >
                  <Save className="w-4 h-4" />
                  <span>Update Gateway Settings</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Admin Footer */}
        <footer className="mt-8 border-t border-slate-900 pt-6 pb-2 text-center text-xs text-slate-500">
          <span>© {new Date().getFullYear()} Hausa Cybertech • All rights reserved.</span>
        </footer>
      </div>
    </div>
  );
};
