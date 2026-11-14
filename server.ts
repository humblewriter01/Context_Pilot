import express from 'express';
import fs from 'fs';
import crypto from 'crypto';
import { GoogleGenAI, Type } from '@google/genai';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

// Resolve the module directory in both ESM (tsx / node) and bundled CJS
// (Vercel serverless) hosts. Falls back to the working directory when the
// module URL is unavailable, which is enough for the serverless entry point.
const __dirname = (() => {
  try {
    const metaUrl = typeof import.meta !== 'undefined' ? import.meta.url : '';
    return metaUrl ? path.dirname(fileURLToPath(metaUrl)) : process.cwd();
  } catch {
    return process.cwd();
  }
})();

const app = express();
app.set('trust proxy', true);

// Express JSON middleware with rawBody capture for Paystack signature verification
app.use(
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// ---------------------------------------------------------
// White-label guard
// API responses are rendered by the product UI, so the text fields of a JSON
// body must never name the infrastructure vendor. Messages written in this file
// are already neutral; this is the safety net for text forwarded from client
// libraries and upstream services. The original is kept in the server log.
// The /api/supabase/* routes are operator diagnostics and are left untouched.
// ---------------------------------------------------------
const VENDOR_NAME_RE = /supabase/i;
const WHITE_LABEL_TEXT_FIELDS = ['error', 'message', 'hint'] as const;
const WHITE_LABEL_FALLBACK = 'A backend service error occurred. Please try again.';

function whiteLabelBody(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  let sanitized: Record<string, unknown> | null = null;
  for (const field of WHITE_LABEL_TEXT_FIELDS) {
    const value = (body as Record<string, unknown>)[field];
    if (typeof value === 'string' && VENDOR_NAME_RE.test(value)) {
      console.warn(`[White-label] Replaced "${field}" in an API response: ${value}`);
      sanitized = sanitized || { ...(body as Record<string, unknown>) };
      sanitized[field] = WHITE_LABEL_FALLBACK;
    }
  }
  return sanitized || body;
}

app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/supabase/')) return next();
  const sendJson = res.json.bind(res);
  res.json = (body?: any) => sendJson(whiteLabelBody(body));
  next();
});

// Helper to get current YYYY-MM
function getCurrentMonthYear(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

// Initialize Supabase Admin Client using SUPABASE_SERVICE_ROLE_KEY to bypass RLS for webhook & admin operations
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabaseAdmin: SupabaseClient | null = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

export const supabaseServer = supabaseAdmin;

if (supabaseAdmin) {
  if (supabaseServiceRoleKey) {
    console.log('✅ Supabase Admin Client initialized with SERVICE_ROLE_KEY (RLS bypassed).');
  }
}

// Supported production Gemini model (override with GEMINI_MODEL if needed).
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

// Lazily create the Google Gen AI client so importing this module never throws
// when GEMINI_API_KEY is absent (e.g. during builds or cold starts).
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'context-pilot',
        },
      },
    });
  }
  return aiClient;
}

interface StoredUser {
  id: number;
  email: string;
  displayName: string;
  subscriptionTier: 'free' | 'pro' | 'enterprise';
  createdAt: string;
  lastLoginAt: string;
  status: 'active' | 'suspended';
  ticketsUsedThisMonth: number;
}

interface StoredTransaction {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  email: string;
  tier: 'free' | 'pro' | 'enterprise';
  status: 'success' | 'failed' | 'pending';
  channel?: string;
  paidAt?: string;
  createdAt: string;
  promoCode?: string;
}

interface StoredPromoCode {
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

const SERVER_STORE = {
  users: [] as StoredUser[],
  transactions: [] as StoredTransaction[],
  promos: [] as StoredPromoCode[],
  settings: {
    paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    paystackSecretKey: process.env.PAYSTACK_SECRET_KEY || '',
    isLiveMode: false,
    currency: 'NGN' as 'NGN' | 'USD',
    proPriceNgn: 15000,
    proPriceUsd: 10,
    enterprisePriceNgn: 75000,
    enterprisePriceUsd: 50,
    freeLimit: 10,
    proLimit: 150,
    maintenanceMode: false,
    adminEmail: process.env.ADMIN_EMAIL || '',
  },
};

// ==========================================
// Shared helpers: persistence, auth, escaping
// ==========================================

// Configurable conversion rate used when a fixed NGN promo discount is applied to a USD charge.
const USD_NGN_RATE = Number(process.env.USD_NGN_RATE) || 1500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type ServerSettings = typeof SERVER_STORE.settings;

async function fetchAllQueryRows(query: any, pageSize = 1000): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; offset < 100_000; offset += pageSize) {
    const { data, error } = await query.range(offset, offset + pageSize - 1);
    if (error) throw new Error(error.message || 'Database query failed.');
    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
  throw new Error('Admin statistics exceeded the supported pagination limit.');
}

// ---------------------------------------------------------
// Pricing / limits settings persisted in public.system_settings
// ---------------------------------------------------------
let settingsHydratedAt = 0;
let settingsHydration: Promise<void> | null = null;
const SETTINGS_TTL_MS = 15_000;

function mapSettingsRow(row: any, base: ServerSettings): ServerSettings {
  return {
    ...base,
    currency: row.currency === 'USD' ? 'USD' : 'NGN',
    proPriceNgn: Number(row.pro_price_ngn ?? base.proPriceNgn),
    proPriceUsd: Number(row.pro_price_usd ?? base.proPriceUsd),
    enterprisePriceNgn: Number(row.enterprise_price_ngn ?? base.enterprisePriceNgn),
    enterprisePriceUsd: Number(row.enterprise_price_usd ?? base.enterprisePriceUsd),
    freeLimit: Number(row.free_limit ?? base.freeLimit),
    proLimit: Number(row.pro_limit ?? base.proLimit),
    isLiveMode: Boolean(row.is_live_mode ?? base.isLiveMode),
  };
}

/**
 * Loads DB-backed pricing settings into the in-memory cache.
 * Safe no-op when Supabase is not configured or the table is missing.
 */
async function hydrateSettings(force = false): Promise<void> {
  if (!supabaseAdmin) return;
  if (!force && settingsHydratedAt && Date.now() - settingsHydratedAt < SETTINGS_TTL_MS) return;
  if (settingsHydration) return settingsHydration;

  settingsHydration = (async () => {
    try {
      const { data, error } = await supabaseAdmin!
        .from('system_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (!error && data) {
        SERVER_STORE.settings = mapSettingsRow(data, SERVER_STORE.settings);
      } else if (error) {
        console.warn('[Settings Hydration Warning]:', error.message);
      }
      settingsHydratedAt = Date.now();
    } catch (err) {
      console.warn('[Settings Hydration Error]:', err);
    } finally {
      settingsHydration = null;
    }
  })();

  return settingsHydration;
}

/** Persists the current pricing settings to Supabase (no-op without a service role). */
async function persistSettings(): Promise<void> {
  if (!supabaseAdmin) return;
  const s = SERVER_STORE.settings;
  try {
    const { error } = await supabaseAdmin.from('system_settings').upsert(
      {
        id: 1,
        currency: s.currency,
        pro_price_ngn: Math.round(s.proPriceNgn),
        pro_price_usd: s.proPriceUsd,
        enterprise_price_ngn: Math.round(s.enterprisePriceNgn),
        enterprise_price_usd: s.enterprisePriceUsd,
        free_limit: s.freeLimit,
        pro_limit: s.proLimit,
        is_live_mode: s.isLiveMode,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
    if (error) console.warn('[Settings Persist Warning]:', error.message);
    settingsHydratedAt = Date.now();
  } catch (err) {
    console.warn('[Settings Persist Error]:', err);
  }
}

// ---------------------------------------------------------
// Promo codes persisted in public.promo_codes
// ---------------------------------------------------------
function mapPromoRow(row: any): StoredPromoCode {
  const tiers: ('pro' | 'enterprise')[] = Array.isArray(row.applicable_tiers)
    ? row.applicable_tiers.filter((t: any) => t === 'pro' || t === 'enterprise')
    : ['pro', 'enterprise'];

  return {
    id: String(row.id ?? row.code),
    code: String(row.code || '').trim().toUpperCase(),
    discountType: row.discount_type === 'fixed' ? 'fixed' : 'percentage',
    discountValue: Number(row.discount_value ?? 0),
    applicableTiers: tiers.length > 0 ? tiers : ['pro', 'enterprise'],
    maxUses: typeof row.max_uses === 'number' ? row.max_uses : -1,
    usedCount: Number(row.times_used ?? 0),
    isActive: Boolean(row.is_active),
    expiresAt: row.expires_at || undefined,
    createdAt: row.created_at || new Date().toISOString(),
  };
}

async function listPromos(): Promise<StoredPromoCode[]> {
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from('promo_codes')
        .select('*')
        .order('created_at', { ascending: false });
      if (!error && data) {
        const promos = data.map(mapPromoRow);
        SERVER_STORE.promos = promos;
        return promos;
      }
      if (error) console.warn('[Promo Fetch Warning]:', error.message);
    } catch (err) {
      console.warn('[Promo Fetch Error]:', err);
    }
  }
  return [...SERVER_STORE.promos];
}

async function findPromoByCode(code: string): Promise<StoredPromoCode | null> {
  const normalized = (code || '').trim().toUpperCase();
  if (!normalized) return null;

  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from('promo_codes')
        .select('*')
        .eq('code', normalized)
        .maybeSingle();
      if (!error && data) return mapPromoRow(data);
      if (error) console.warn('[Promo Lookup Warning]:', error.message);
    } catch (err) {
      console.warn('[Promo Lookup Error]:', err);
    }
  }
  return SERVER_STORE.promos.find((p) => p.code.toUpperCase() === normalized) || null;
}

/** Increments a promo redemption count in memory and in Supabase. */
async function incrementPromoUsage(promo: StoredPromoCode): Promise<void> {
  const nextCount = (promo.usedCount || 0) + 1;
  promo.usedCount = nextCount;
  const mem = SERVER_STORE.promos.find((p) => p.id === promo.id);
  if (mem) mem.usedCount = nextCount;

  if (supabaseAdmin) {
    try {
      await supabaseAdmin.from('promo_codes').update({ times_used: nextCount }).eq('id', promo.id);
    } catch (err) {
      console.warn('[Promo Usage Update Warning]:', err);
    }
  }
}

/** Computes the discount for an amount. Fixed discounts are defined in NGN. */
function computePromoDiscount(promo: StoredPromoCode, amount: number, currency: 'NGN' | 'USD'): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (promo.discountType === 'percentage') {
    return Math.round(amount * promo.discountValue) / 100;
  }
  const fixed = currency === 'USD' ? promo.discountValue / USD_NGN_RATE : promo.discountValue;
  return Math.min(amount, Math.round(fixed * 100) / 100);
}

function isPromoRedeemable(promo: StoredPromoCode): string | null {
  if (!promo.isActive) return 'This promo code is currently disabled.';
  if (promo.expiresAt && new Date(promo.expiresAt).getTime() < Date.now()) {
    return 'This promo code has expired.';
  }
  if (promo.maxUses !== -1 && promo.usedCount >= promo.maxUses) {
    return 'This promo code has reached its maximum redemptions.';
  }
  return null;
}

// ---------------------------------------------------------
// Supabase user lookup helpers (safe, parameterised identifiers)
// ---------------------------------------------------------
function identifierColumn(identifier: string): { column: string; value: string } {
  const raw = decodeURIComponent(String(identifier || '')).trim();
  if (EMAIL_RE.test(raw)) return { column: 'email', value: raw.toLowerCase() };
  if (UUID_RE.test(raw)) return { column: 'id', value: raw };
  return { column: 'auth_id', value: raw };
}

async function findUserByIdentifier(identifier: string): Promise<any | null> {
  if (!supabaseServer) return null;
  const { column, value } = identifierColumn(identifier);
  if (!value) return null;
  try {
    const { data, error } = await supabaseServer
      .from('users')
      .select('*')
      .eq(column, value)
      .maybeSingle();
    if (error) {
      console.warn('[User Lookup Warning]:', error.message);
      return null;
    }
    return data || null;
  } catch (err) {
    console.warn('[User Lookup Error]:', err);
    return null;
  }
}

async function updateUserByIdentifier(identifier: string, patch: Record<string, unknown>): Promise<any | null> {
  if (!supabaseServer) return null;
  const { column, value } = identifierColumn(identifier);
  if (!value) return null;
  try {
    const { data, error } = await supabaseServer
      .from('users')
      .update(patch)
      .eq(column, value)
      .select()
      .maybeSingle();
    if (error) {
      console.warn('[User Update Warning]:', error.message);
      return null;
    }
    return data || null;
  } catch (err) {
    console.warn('[User Update Error]:', err);
    return null;
  }
}

/** Canonical form of an e-mail address: the key of a public.users profile. */
function normalizeEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

const PG_UNIQUE_VIOLATION = '23505';

/**
 * Points a profile at the auth identity that is signing in. An auth identity can
 * back only one profile, so it is first released from any other (stale) row.
 */
async function linkProfileToAuthUser(email: string, authUserId: string): Promise<void> {
  if (!supabaseAdmin) return;

  const { error: releaseError } = await supabaseAdmin
    .from('users')
    .update({ auth_id: null })
    .eq('auth_id', authUserId)
    .neq('email', email);
  if (releaseError) console.warn('[User Profile Link Warning]:', releaseError.message);

  const { error: linkError } = await supabaseAdmin
    .from('users')
    .update({ auth_id: authUserId })
    .eq('email', email);
  if (linkError) console.warn('[User Profile Link Warning]:', linkError.message);
}

/**
 * Guarantees exactly one public.users row per e-mail address, so quota checks
 * and history inserts never fail on foreign keys and no duplicate profile is
 * created when the same person signs in with another method.
 *
 * When the address already has a profile (for example it signed up with e-mail
 * and now signs in with GitHub), the signed-in auth identity is linked to that
 * existing profile instead of creating a new one. This mirrors the
 * public.handle_new_user() database trigger for requests that reach the API
 * before, or without, the trigger having run.
 */
async function ensureUserProfile(email: string, authUserId?: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  if (!supabaseAdmin || !normalizedEmail) return;

  try {
    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('users')
      .select('auth_id')
      .eq('email', normalizedEmail)
      .maybeSingle();
    if (lookupError) {
      console.warn('[User Profile Lookup Warning]:', lookupError.message);
      return;
    }

    if (existing) {
      if (authUserId && existing.auth_id !== authUserId) {
        await linkProfileToAuthUser(normalizedEmail, authUserId);
      }
      return;
    }

    const row: Record<string, unknown> = { email: normalizedEmail };
    if (authUserId) row.auth_id = authUserId;
    const { error: insertError } = await supabaseAdmin.from('users').insert(row);
    if (!insertError) return;

    if (insertError.code !== PG_UNIQUE_VIOLATION) {
      console.warn('[User Profile Insert Warning]:', insertError.message);
      return;
    }

    // Unique violation: either a parallel request (or the sign-up trigger) created
    // the profile first, or this auth identity is still attached to another row.
    if (authUserId) {
      await linkProfileToAuthUser(normalizedEmail, authUserId);
    }
    const { error: retryError } = await supabaseAdmin
      .from('users')
      .upsert(row, { onConflict: 'email', ignoreDuplicates: !authUserId });
    if (retryError) console.warn('[User Profile Upsert Warning]:', retryError.message);
  } catch (err) {
    console.warn('[User Profile Sync Error]:', err);
  }
}

// ---------------------------------------------------------
// Bearer token resolution (Supabase JWT verification)
// ---------------------------------------------------------
type AuthLookup = { status: 'none' | 'invalid' | 'valid'; user?: { id: string; email: string } };

async function resolveBearerUser(req: express.Request): Promise<AuthLookup> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return { status: 'none' };

  const token = header.slice('Bearer '.length).trim();
  if (!token || token === 'undefined' || token === 'null') return { status: 'none' };
  if (!supabaseServer) return { status: 'invalid' };

  try {
    const { data, error } = await supabaseServer.auth.getUser(token);
    const email = data?.user?.email;
    if (error || !data?.user || !email) return { status: 'invalid' };
    return { status: 'valid', user: { id: data.user.id, email: email.trim().toLowerCase() } };
  } catch {
    return { status: 'invalid' };
  }
}

// Helper middleware for Admin verification strictly using Supabase JWT and ADMIN_EMAIL
async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(403).json({ error: 'Forbidden. An authentication token is required.' });
  }

  const token = authHeader.split('Bearer ')[1]?.trim();
  if (!token) {
    return res.status(403).json({ error: 'Forbidden. An authentication token is required.' });
  }

  if (!supabaseServer) {
    return res.status(403).json({ error: 'Forbidden. Authentication is not configured on the server.' });
  }

  try {
    const { data: { user }, error } = await supabaseServer.auth.getUser(token);
    if (error || !user || !user.email) {
      return res.status(403).json({ error: 'Forbidden. Invalid or expired authentication session.' });
    }

    const adminEmail = (process.env.ADMIN_EMAIL || SERVER_STORE.settings.adminEmail || '').trim().toLowerCase();
    if (!adminEmail) {
      return res.status(503).json({ error: 'Administrator access is not configured on the server.' });
    }
    if (user.email.trim().toLowerCase() !== adminEmail) {
      return res.status(403).json({ error: `Forbidden. User ${user.email} is not authorized as administrator.` });
    }

    (req as any).adminUser = user;
    next();
  } catch (err: any) {
    return res.status(403).json({ error: 'Forbidden. Unable to verify administrator authorization.' });
  }
}

// ==========================================
// 1. Paystack Payment Gateway Endpoints
// ==========================================

// Get public Paystack config for client
app.get('/api/paystack/config', async (_req, res) => {
  await hydrateSettings();
  const activeKey = SERVER_STORE.settings.paystackPublicKey || process.env.PAYSTACK_PUBLIC_KEY || '';
  res.json({
    publicKey: activeKey,
    hasSecretKey: Boolean(SERVER_STORE.settings.paystackSecretKey || process.env.PAYSTACK_SECRET_KEY),
    isConfigured: Boolean(activeKey && (SERVER_STORE.settings.paystackSecretKey || process.env.PAYSTACK_SECRET_KEY)),
    currency: SERVER_STORE.settings.currency,
    proPriceNgn: SERVER_STORE.settings.proPriceNgn,
    proPriceUsd: SERVER_STORE.settings.proPriceUsd,
    enterprisePriceNgn: SERVER_STORE.settings.enterprisePriceNgn,
    enterprisePriceUsd: SERVER_STORE.settings.enterprisePriceUsd,
    freeLimit: SERVER_STORE.settings.freeLimit,
    proLimit: SERVER_STORE.settings.proLimit,
  });
});

// Monthly plan price from server settings for a given tier/currency
function planPriceFor(tier: 'free' | 'pro' | 'enterprise', currency: 'NGN' | 'USD'): number {
  const s = SERVER_STORE.settings;
  if (tier === 'enterprise') return currency === 'USD' ? s.enterprisePriceUsd : s.enterprisePriceNgn;
  if (tier === 'pro') return currency === 'USD' ? s.proPriceUsd : s.proPriceNgn;
  return 0;
}

// Initialize Paystack transaction with promo code support
app.post('/api/paystack/initialize', async (req, res) => {
  try {
    const {
      email,
      amount: clientAmount,
      tier,
      callback_url,
      promo_code,
      currency: clientCurrency,
      billing_cycle,
    } = req.body;
    await hydrateSettings();
    const secretKey = SERVER_STORE.settings.paystackSecretKey || process.env.PAYSTACK_SECRET_KEY;
    // Profiles are keyed by the canonical (lower-case) address.
    const customerEmail = normalizeEmail(email);

    if (!customerEmail || !tier || !['pro', 'enterprise'].includes(tier)) {
      return res.status(400).json({ error: 'Missing required fields: email and a paid tier (pro or enterprise)' });
    }

    if (!secretKey) {
      return res.status(400).json({
        error:
          'Paystack Secret Key is not configured on the server. Please add your PAYSTACK_SECRET_KEY in the Admin Portal (/admin) or environment.',
        needsKey: true,
      });
    }

    // The currency chosen on the pricing page; the store default applies only
    // when a client does not send one.
    const selectedCurrency: 'NGN' | 'USD' = (clientCurrency === 'USD' || clientCurrency === 'NGN')
      ? clientCurrency
      : SERVER_STORE.settings.currency;

    // Server-authoritative pricing: the client amount is never trusted.
    const billingCycle: 'monthly' | 'annual' = billing_cycle === 'annual' ? 'annual' : 'monthly';
    let finalAmount = planPriceFor(tier, selectedCurrency as 'NGN' | 'USD');
    if (billingCycle === 'annual') {
      finalAmount = Math.round(finalAmount * 12 * 0.8);
    }

    if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
      return res.status(500).json({ error: 'Plan pricing is not configured for this currency.' });
    }

    // Log any client/server price mismatch for observability.
    const parsedClientAmount = Number(clientAmount);
    if (Number.isFinite(parsedClientAmount) && Math.abs(parsedClientAmount - finalAmount) > 1) {
      console.warn(
        `[Pricing] Client amount ${parsedClientAmount} differs from server amount ${finalAmount} (${tier}/${selectedCurrency}/${billingCycle}).`
      );
    }

    let appliedPromo: StoredPromoCode | null = null;
    if (promo_code) {
      const promo = await findPromoByCode(String(promo_code));
      if (promo && !isPromoRedeemable(promo) && promo.applicableTiers.includes(tier)) {
        finalAmount = Math.max(1, Number((finalAmount - computePromoDiscount(promo, finalAmount, selectedCurrency as 'NGN' | 'USD')).toFixed(2)));
        appliedPromo = promo;
      }
    }

    // Amount in Paystack is in smallest currency unit (Kobo for NGN or Cents for USD: amount * 100)
    const amountInSubunits = Math.round(finalAmount * 100);
    const reference = `CP_${tier.toUpperCase()}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    const paystackPayload = {
      email: customerEmail,
      amount: amountInSubunits,
      currency: selectedCurrency,
      reference,
      callback_url: callback_url || `${req.protocol}://${req.get('host')}/?payment_ref=${reference}`,
      metadata: {
        tier,
        app: 'Context Pilot',
        customer_email: customerEmail,
        promo_code: appliedPromo ? appliedPromo.code : null,
        final_amount: finalAmount,
        currency: selectedCurrency,
        billing_cycle: billingCycle,
      },
    };

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paystackPayload),
    });

    const data = await response.json();

    if (!response.ok || !data.status) {
      const gatewayMessage = typeof data?.message === 'string' ? data.message : '';
      // The merchant account has not been enabled for this currency.
      if (/currency/i.test(gatewayMessage) && /not supported|unsupported|not enabled|invalid/i.test(gatewayMessage)) {
        console.warn(`[Paystack Initialize] ${selectedCurrency} rejected by the gateway: ${gatewayMessage}`);
        return res.status(400).json({
          error: `${selectedCurrency} payments are not enabled for this store yet. Please switch to ${
            selectedCurrency === 'USD' ? 'NGN (₦)' : 'USD ($)'
          } or contact support.`,
          code: 'currency_not_supported',
          currency: selectedCurrency,
        });
      }
      return res.status(400).json({
        error: gatewayMessage || 'Failed to initialize transaction with Paystack API',
        details: data,
      });
    }

    if (appliedPromo) {
      await incrementPromoUsage(appliedPromo);
    }

    const pendingTx: StoredTransaction = {
      id: reference,
      reference,
      amount: finalAmount,
      currency: selectedCurrency,
      email: customerEmail,
      tier,
      status: 'pending',
      createdAt: new Date().toISOString(),
      promoCode: appliedPromo ? appliedPromo.code : undefined,
    };
    SERVER_STORE.transactions.unshift(pendingTx);

    // Persist the pending transaction so the admin ledger survives serverless cold starts.
    if (supabaseAdmin) {
      try {
        // The ledger row references the profile by e-mail: reuse the existing
        // profile for this address, creating one only if none exists yet.
        await ensureUserProfile(customerEmail);
        await supabaseAdmin.from('transactions').upsert(
          {
            reference,
            user_email: customerEmail,
            tier,
            amount: finalAmount,
            currency: selectedCurrency,
            promo_code: appliedPromo ? appliedPromo.code : null,
            status: 'pending',
          },
          { onConflict: 'reference' }
        );
      } catch (persistErr) {
        console.warn('[Pending Transaction Persist Warning]:', persistErr);
      }
    }

    return res.json({
      success: true,
      authorization_url: data.data.authorization_url,
      access_code: data.data.access_code,
      reference: data.data.reference,
      finalAmount,
      currency: selectedCurrency,
    });
  } catch (error: any) {
    console.error('Paystack initialization error:', error);
    return res.status(500).json({ error: error?.message || 'Paystack server error' });
  }
});

// Verify Paystack transaction
app.get('/api/paystack/verify/:reference', async (req, res) => {
  try {
    const reference = req.params.reference as string;
    const secretKey = SERVER_STORE.settings.paystackSecretKey || process.env.PAYSTACK_SECRET_KEY;

    if (!secretKey) {
      return res.status(400).json({ error: 'Paystack Secret Key is missing.' });
    }

    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${secretKey.trim()}`,
      },
    });

    const data = await response.json();

    if (!response.ok || !data.status) {
      return res.status(400).json({
        error: data.message || 'Transaction verification failed on Paystack',
      });
    }

    const txData = data.data;
    const isSuccess = txData.status === 'success';
    const tier = (txData.metadata?.tier as 'free' | 'pro' | 'enterprise') || 'pro';
    const customerEmail = normalizeEmail(txData.customer?.email);

    const existingTxIndex = SERVER_STORE.transactions.findIndex((t) => t.reference === reference);
    const updatedTx: StoredTransaction = {
      id: reference,
      reference,
      amount: txData.amount / 100,
      currency: txData.currency,
      email: customerEmail,
      tier,
      status: isSuccess ? 'success' : 'failed',
      channel: txData.channel,
      paidAt: txData.paid_at,
      createdAt: txData.created_at || new Date().toISOString(),
    };

    if (existingTxIndex >= 0) {
      SERVER_STORE.transactions[existingTxIndex] = updatedTx;
    } else {
      SERVER_STORE.transactions.unshift(updatedTx);
    }

    // Guard against tampered metadata/underpayment before granting a tier upgrade.
    await hydrateSettings();
    const paidCurrency = (txData.currency === 'USD' ? 'USD' : 'NGN') as 'NGN' | 'USD';
    const expectedAmount = planPriceFor(tier, paidCurrency);
    const paidAmount = Number(txData.amount || 0) / 100;
    const hadPromo = Boolean(txData.metadata?.promo_code);
    const isUnderpaid = !hadPromo && expectedAmount > 0 && paidAmount < expectedAmount * 0.5;

    if (isSuccess && isUnderpaid) {
      console.warn(
        `[Paystack Verify] Underpaid transaction ${reference}: paid ${paidAmount} ${paidCurrency} for ${tier} (expected ~${expectedAmount}).`
      );
    }

    if (isSuccess && customerEmail && !isUnderpaid) {
      const user = SERVER_STORE.users.find((u) => u.email.toLowerCase() === customerEmail.toLowerCase());
      if (user) {
        user.subscriptionTier = tier;
      } else {
        SERVER_STORE.users.push({
          id: Date.now(),
          email: customerEmail,
          displayName: customerEmail.split('@')[0],
          subscriptionTier: tier,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          status: 'active',
          ticketsUsedThisMonth: 0,
        });
      }

      // Persist to the database when configured
      if (supabaseAdmin) {
        await ensureUserProfile(customerEmail);
        await supabaseAdmin.from('transactions').upsert(
          {
            reference,
            user_email: customerEmail,
            tier,
            amount: txData.amount / 100,
            currency: txData.currency,
            status: 'success',
            channel: txData.channel,
            paid_at: txData.paid_at,
          },
          { onConflict: 'reference' }
        );

        await supabaseAdmin
          .from('users')
          .update({
            subscription_tier: tier,
            last_login_at: new Date().toISOString(),
          })
          .eq('email', customerEmail);

        const currentMonth = getCurrentMonthYear();
        const limit = tier === 'enterprise' ? -1 : (tier === 'pro' ? (SERVER_STORE.settings.proLimit || 150) : 10);
        await supabaseAdmin.from('user_usage').upsert(
          {
            user_email: customerEmail,
            month_year: currentMonth,
            monthly_limit: limit,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_email,month_year' }
        );
      }
    }

    return res.json({
      success: isSuccess,
      status: txData.status,
      reference,
      amount: txData.amount / 100,
      currency: txData.currency,
      tier,
      customerEmail,
      gateway_response: txData.gateway_response,
    });
  } catch (error: any) {
    console.error('Paystack verification error:', error);
    return res.status(500).json({ error: error?.message || 'Verification error' });
  }
});

// ===================================================================
// Paystack Webhook Handler (/api/paystack/webhook)
// Verifies HMAC-SHA512 signature and processes charge.success
// ===================================================================
app.post('/api/paystack/webhook', async (req: any, res) => {
  try {
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY || SERVER_STORE.settings.paystackSecretKey;
    if (!paystackSecret) {
      console.warn('[Paystack Webhook] PAYSTACK_SECRET_KEY not set.');
      return res.status(400).json({ error: 'Paystack Secret Key is not configured on server' });
    }

    const signature = req.headers['x-paystack-signature'];
    if (!signature) {
      return res.status(400).json({ error: 'Missing x-paystack-signature header' });
    }

    // Verify HMAC-SHA512 signature using raw body buffer
    const hash = crypto
      .createHmac('sha512', paystackSecret.trim())
      .update(req.rawBody || JSON.stringify(req.body))
      .digest('hex');

    if (hash !== signature) {
      console.error('[Paystack Webhook] Signature verification failed');
      return res.status(401).json({ error: 'Invalid Paystack webhook signature' });
    }

    const event = req.body;
    if (event && event.event === 'charge.success') {
      const data = event.data;
      const userEmail = normalizeEmail(data.customer?.email);
      const reference = data.reference;
      const amount = (data.amount || 0) / 100;
      const currency = data.currency || 'NGN';
      const channel = data.channel || 'card';
      const paidAt = data.paid_at || new Date().toISOString();
      const metadata = data.metadata || {};
      const tier: 'free' | 'pro' | 'enterprise' =
        metadata.tier || (amount >= (currency === 'USD' ? 40 : 50000) ? 'enterprise' : 'pro');
      const promoCode = metadata.promo_code || null;

      console.log(`[Paystack Webhook] charge.success received: ${userEmail} -> ${tier} (${currency} ${amount}) [Ref: ${reference}]`);

      // 1. In-memory / server store update
      const existingTx = SERVER_STORE.transactions.find((t) => t.reference === reference);
      if (existingTx) {
        existingTx.status = 'success';
        existingTx.paidAt = paidAt;
      } else {
        SERVER_STORE.transactions.unshift({
          id: reference,
          reference,
          amount,
          currency,
          email: userEmail,
          tier,
          status: 'success',
          channel,
          paidAt,
          createdAt: new Date().toISOString(),
          promoCode: promoCode || undefined,
        });
      }

      const memUser = SERVER_STORE.users.find((u) => u.email.toLowerCase() === userEmail);
      if (memUser) {
        memUser.subscriptionTier = tier;
      }

      // 2. Persist with the service-role client (bypassing RLS)
      if (supabaseAdmin && userEmail) {
        // The transaction and tier upgrade both hang off the customer's profile.
        await ensureUserProfile(userEmail);

        // Record in transactions table
        const { error: txError } = await supabaseAdmin.from('transactions').upsert(
          {
            reference,
            user_email: userEmail,
            tier,
            amount,
            currency,
            promo_code: promoCode,
            status: 'success',
            channel,
            paid_at: paidAt,
          },
          { onConflict: 'reference' }
        );
        if (txError) {
          console.error('[Paystack Webhook] Transaction upsert error:', txError);
        }

        // Upgrade user subscription_tier in public.users table
        const { error: userError } = await supabaseAdmin
          .from('users')
          .update({
            subscription_tier: tier,
            last_login_at: new Date().toISOString(),
          })
          .eq('email', userEmail);
        if (userError) {
          console.error('[Paystack Webhook] User tier update error:', userError);
        } else {
          console.log(`[Paystack Webhook] Successfully updated ${userEmail} to ${tier} in public.users`);
        }

        // Update quota in user_usage table for current month
        const currentMonth = getCurrentMonthYear();
        const limit = tier === 'enterprise' ? -1 : (tier === 'pro' ? (SERVER_STORE.settings.proLimit || 150) : 10);
        await supabaseAdmin.from('user_usage').upsert(
          {
            user_email: userEmail,
            month_year: currentMonth,
            monthly_limit: limit,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_email,month_year' }
        );
      }
    }

    return res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('[Paystack Webhook Error]:', err);
    return res.status(500).json({ error: err?.message || 'Paystack webhook processing error' });
  }
});

// Validate Promo Code (Client Checkout)
app.post('/api/promos/validate', async (req, res) => {
  const { code, tier, amount, currency } = req.body;
  if (!code || !tier || typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Missing code, tier, or a valid amount' });
  }

  const selectedCurrency: 'NGN' | 'USD' = currency === 'USD' ? 'USD' : currency === 'NGN' ? 'NGN' : SERVER_STORE.settings.currency;

  const promo = await findPromoByCode(String(code));
  if (!promo) {
    return res.status(404).json({ error: 'Promo code does not exist.' });
  }

  const notRedeemable = isPromoRedeemable(promo);
  if (notRedeemable) {
    return res.status(400).json({ error: notRedeemable });
  }

  if (!promo.applicableTiers.includes(tier)) {
    return res.status(400).json({
      error: `This promo code is only valid for ${promo.applicableTiers.join(', ')} tiers.`,
    });
  }

  const discountAmount = computePromoDiscount(promo, amount, selectedCurrency);
  const finalAmount = Math.max(0, Math.round((amount - discountAmount) * 100) / 100);

  return res.json({
    valid: true,
    code: promo.code,
    applicableTiers: promo.applicableTiers,
    currency: selectedCurrency,
    discountType: promo.discountType,
    discountValue: promo.discountValue,
    discountAmount,
    finalAmount,
  });
});

// ==========================================
// 2. Professional Admin Authentication & Management
// ==========================================

// Admin Session Verification
app.get('/api/admin/verify', requireAdmin, (req: any, res) => {
  const user = req.adminUser;
  res.json({
    success: true,
    admin: {
      email: user.email,
      name: user.user_metadata?.full_name || user.user_metadata?.display_name || user.email.split('@')[0],
      role: 'superadmin',
    },
  });
});

// Admin System Overview & Analytics (database-backed; no in-memory/demo fallbacks).
app.get('/api/admin/overview', requireAdmin, async (_req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'The database service is not configured on the server.' });
  }

  try {
    const [dbUsers, dbTransactions] = await Promise.all([
      fetchAllQueryRows(supabaseAdmin.from('users').select('subscription_tier,created_at').order('created_at', { ascending: true })),
      fetchAllQueryRows(supabaseAdmin.from('transactions').select('amount,currency,status,created_at,tier').order('created_at', { ascending: true })),
    ]);

    const recentCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const successfulTx = dbTransactions.filter((tx) => tx.status === 'success');
    const totalNgn = successfulTx
      .filter((tx) => String(tx.currency).toUpperCase() === 'NGN')
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const totalUsd = successfulTx
      .filter((tx) => String(tx.currency).toUpperCase() === 'USD')
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const userCounts = dbUsers.reduce((counts: Record<string, number>, user) => {
      const tier = user.subscription_tier || 'free';
      counts[tier] = (counts[tier] || 0) + 1;
      return counts;
    }, {});

    return res.json({
      users: {
        total: dbUsers.length,
        free: userCounts.free || 0,
        pro: userCounts.pro || 0,
        enterprise: userCounts.enterprise || 0,
        createdLast14Days: dbUsers.filter((user) => {
          const created = Date.parse(user.created_at);
          return Number.isFinite(created) && created >= recentCutoff;
        }).length,
      },
      revenue: {
        totalNgn,
        totalUsd,
        transactionsCount: successfulTx.length,
        pendingCount: dbTransactions.filter((tx) => tx.status === 'pending').length,
      },
      promos: {
        total: SERVER_STORE.promos.length,
        active: SERVER_STORE.promos.filter((promo) => promo.isActive).length,
      },
      system: {
        gatewayConfigured: Boolean(SERVER_STORE.settings.paystackPublicKey && SERVER_STORE.settings.paystackSecretKey),
        isLiveMode: SERVER_STORE.settings.isLiveMode,
        currency: SERVER_STORE.settings.currency,
      },
    });
  } catch (err: any) {
    console.error('[Admin Overview Query Error]:', err?.message || err);
    return res.status(500).json({ error: 'Could not load live user and transaction totals from the database.' });
  }
});

// Admin visual analytics trends from persisted Supabase users, transactions,
// and analysis_history rows. Zero-filled dates are only chart buckets; empty
// data sources are flagged so the UI can render a clear empty state.
app.get('/api/admin/analytics', requireAdmin, async (req, res) => {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'The database service is not configured on the server.' });
  }

  const requestedDays = Number.parseInt(String(req.query.days || ''), 10) || 14;
  const days = Math.min(90, Math.max(1, requestedDays));
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const periodStart = new Date(todayUtc - (days - 1) * 24 * 60 * 60 * 1000);
  const periodEnd = new Date(todayUtc + 24 * 60 * 60 * 1000);
  const periodStartIso = periodStart.toISOString();
  const periodEndIso = periodEnd.toISOString();

  try {
    const [allUsers, periodTransactions, periodAnalyses] = await Promise.all([
      fetchAllQueryRows(supabaseAdmin.from('users').select('subscription_tier,created_at').order('created_at', { ascending: true })),
      fetchAllQueryRows(
        supabaseAdmin.from('transactions')
          .select('amount,currency,status,created_at,tier')
          .eq('status', 'success')
          .order('created_at', { ascending: true })
          .gte('created_at', periodStartIso)
          .lt('created_at', periodEndIso),
      ),
      fetchAllQueryRows(
        supabaseAdmin.from('analysis_history')
          .select('created_at,processing_time_ms,total_files,frontend_files,backend_files,database_files,config_files,test_files')
          .order('created_at', { ascending: true })
          .gte('created_at', periodStartIso)
          .lt('created_at', periodEndIso),
      ),
    ]);

    const trendByDate = new Map<string, any>();
    for (let i = 0; i < days; i += 1) {
      const date = new Date(todayUtc - (days - 1 - i) * 24 * 60 * 60 * 1000);
      const fullDate = date.toISOString().slice(0, 10);
      trendByDate.set(fullDate, {
        fullDate,
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }),
        signups: 0,
        cumSignups: 0,
        freeSignups: 0,
        proSignups: 0,
        enterpriseSignups: 0,
        revenueNgn: 0,
        revenueUsd: 0,
        cumRevenueNgn: 0,
        cumRevenueUsd: 0,
        apiCalls: 0,
        avgLatencyMs: 0,
        predictedFiles: 0,
      });
    }

    const dateKey = (value: unknown) => {
      const time = Date.parse(String(value || ''));
      return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
    };

    const recentUsersCutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const newUsersLast14Days = allUsers.filter((user) => {
      const created = Date.parse(user.created_at);
      return Number.isFinite(created) && created >= recentUsersCutoff;
    }).length;

    for (const user of allUsers) {
      const key = dateKey(user.created_at);
      const trend = key ? trendByDate.get(key) : null;
      if (!trend) continue;
      trend.signups += 1;
      if (user.subscription_tier === 'pro') trend.proSignups += 1;
      else if (user.subscription_tier === 'enterprise') trend.enterpriseSignups += 1;
      else trend.freeSignups += 1;
    }

    for (const tx of periodTransactions) {
      const key = dateKey(tx.created_at);
      const trend = key ? trendByDate.get(key) : null;
      if (!trend) continue;
      const amount = Number(tx.amount || 0);
      if (String(tx.currency).toUpperCase() === 'USD') trend.revenueUsd += amount;
      else if (String(tx.currency).toUpperCase() === 'NGN') trend.revenueNgn += amount;
    }

    const fileTotals = { frontend: 0, backend: 0, database: 0, config: 0, tests: 0 };
    const latencySamples: number[] = [];
    for (const analysis of periodAnalyses) {
      const key = dateKey(analysis.created_at);
      const trend = key ? trendByDate.get(key) : null;
      if (!trend) continue;
      trend.apiCalls += 1;
      const latency = Number(analysis.processing_time_ms);
      if (Number.isFinite(latency) && latency > 0) {
        latencySamples.push(latency);
        trend._latencyTotal = (trend._latencyTotal || 0) + latency;
        trend._latencySamples = (trend._latencySamples || 0) + 1;
      }
      trend.predictedFiles += Number(analysis.total_files || 0);
      fileTotals.frontend += Array.isArray(analysis.frontend_files) ? analysis.frontend_files.length : 0;
      fileTotals.backend += Array.isArray(analysis.backend_files) ? analysis.backend_files.length : 0;
      fileTotals.database += Array.isArray(analysis.database_files) ? analysis.database_files.length : 0;
      fileTotals.config += Array.isArray(analysis.config_files) ? analysis.config_files.length : 0;
      fileTotals.tests += Array.isArray(analysis.test_files) ? analysis.test_files.length : 0;
    }

    let cumulativeSignups = 0;
    let cumulativeNgn = 0;
    let cumulativeUsd = 0;
    const trends = [...trendByDate.values()].map((trend) => {
      cumulativeSignups += trend.signups;
      cumulativeNgn += trend.revenueNgn;
      cumulativeUsd += trend.revenueUsd;
      trend.cumSignups = cumulativeSignups;
      trend.cumRevenueNgn = cumulativeNgn;
      trend.cumRevenueUsd = cumulativeUsd;
      trend.avgLatencyMs = trend._latencySamples ? trend._latencyTotal / trend._latencySamples : 0;
      delete trend._latencyTotal;
      delete trend._latencySamples;
      return trend;
    });

    const tierCounts = allUsers.reduce((counts: Record<string, number>, user) => {
      const tier = user.subscription_tier || 'free';
      counts[tier] = (counts[tier] || 0) + 1;
      return counts;
    }, {});
    const tierDistribution = [
      { name: 'Free Plan', value: tierCounts.free || 0, color: '#94a3b8' },
      { name: 'Pro Plan', value: tierCounts.pro || 0, color: '#6366f1' },
      { name: 'Enterprise', value: tierCounts.enterprise || 0, color: '#a855f7' },
    ].filter((entry) => entry.value > 0);

    const fileCount = Object.values(fileTotals).reduce((sum, count) => sum + count, 0);
    const categories = [
      { name: 'Frontend', count: fileTotals.frontend, color: '#38bdf8' },
      { name: 'Backend', count: fileTotals.backend, color: '#818cf8' },
      { name: 'Database', count: fileTotals.database, color: '#34d399' },
      { name: 'Tests', count: fileTotals.tests, color: '#fbbf24' },
      { name: 'Config & Build', count: fileTotals.config, color: '#f472b6' },
    ];
    const apiCategories = fileCount
      ? categories.filter((category) => category.count > 0).map((category) => ({
          ...category,
          value: Math.round((category.count / fileCount) * 100),
        }))
      : [];
    const successfulRevenueNgn = periodTransactions
      .filter((tx) => String(tx.currency).toUpperCase() === 'NGN')
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const successfulRevenueUsd = periodTransactions
      .filter((tx) => String(tx.currency).toUpperCase() === 'USD')
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const usersInPeriod = trends.reduce((sum, trend) => sum + trend.signups, 0);
    const hasRevenue = periodTransactions.length > 0;
    const hasAnalyses = periodAnalyses.length > 0;

    return res.json({
      days,
      hasSignups: usersInPeriod > 0,
      hasRevenue,
      hasAnalyses,
      trends,
      summary: {
        totalUsers: allUsers.length,
        newUsersInPeriod: usersInPeriod,
        newUsersLast14Days,
        totalRevenueNgn: successfulRevenueNgn,
        totalRevenueUsd: successfulRevenueUsd,
        totalApiCalls: periodAnalyses.length,
        avgLatency: latencySamples.length
          ? latencySamples.reduce((sum, value) => sum + value, 0) / latencySamples.length
          : null,
        totalFilesPredicted: periodAnalyses.reduce((sum, analysis) => sum + Number(analysis.total_files || 0), 0),
      },
      tierDistribution,
      apiCategories,
    });
  } catch (err: any) {
    console.error('[Admin Analytics Query Error]:', err?.message || err);
    return res.status(500).json({ error: 'Could not load live analytics from the database.' });
  }
});

// Admin Users Management (Directly wired to Supabase public.users table)
app.get('/api/admin/users', requireAdmin, async (_req, res) => {
  if (supabaseServer) {
    try {
      const { data: dbUsers, error } = await supabaseServer
        .from('users')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && dbUsers) {
        // Fetch current month usage for these users and join on email (lowercased)
        const currentMonth = getCurrentMonthYear();
        const userEmails = dbUsers
          .map((u: any) => (u.email || '').toLowerCase())
          .filter((e: string) => Boolean(e));

        let usageData: Array<{ user_email?: string; tickets_processed?: number }> = [];
        if (userEmails.length > 0) {
          const { data, error: usageError } = await supabaseServer
            .from('user_usage')
            .select('user_email, tickets_processed')
            .eq('month_year', currentMonth)
            .in('user_email', userEmails);

          if (usageError) {
            console.warn('[Admin Users Usage Query Warning]:', usageError.message);
          } else {
            usageData = data || [];
          }
        }

        const usageMap = new Map<string, number>(
          usageData.map((u: any) => [(u.user_email || '').toLowerCase(), Number(u.tickets_processed) || 0])
        );

        const formatted = dbUsers.map((u: any) => ({
          id: u.id,
          email: u.email,
          displayName: u.display_name || u.email?.split('@')[0] || 'Developer',
          subscriptionTier: u.subscription_tier || 'free',
          status: u.status || 'active',
          createdAt: u.created_at,
          lastLoginAt: u.last_login_at || u.created_at,
          ticketsUsedThisMonth: usageMap.get(u.email?.toLowerCase()) || 0,
        }));
        return res.json(formatted);
      }
    } catch (err) {
      console.warn('Error querying Supabase public.users:', err);
    }
  }

  // Fallback to in-memory store if database is offline
  return res.json(SERVER_STORE.users);
});

app.put('/api/admin/users/:id/tier', requireAdmin, async (req, res) => {
  const userId = req.params.id as string;
  const { tier } = req.body;
  if (!['free', 'pro', 'enterprise'].includes(tier)) {
    return res.status(400).json({ error: 'Invalid subscription tier' });
  }

  if (supabaseServer) {
    try {
      const data = await updateUserByIdentifier(userId, { subscription_tier: tier });

      if (data) {
        const memUser = SERVER_STORE.users.find(
          (u) => u.email.toLowerCase() === data.email.toLowerCase()
        );
        if (memUser) memUser.subscriptionTier = tier;

        return res.json({
          success: true,
          user: {
            id: data.id,
            email: data.email,
            displayName: data.display_name,
            subscriptionTier: data.subscription_tier,
            status: data.status,
            createdAt: data.created_at,
          },
        });
      }
    } catch (err) {
      console.warn('Supabase update tier error:', err);
    }
  }

  const numId = parseInt(userId, 10);
  const user = SERVER_STORE.users.find((u) => u.id === numId || (u as any).id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.subscriptionTier = tier;
  res.json({ success: true, user });
});

app.post('/api/admin/users/:id/reset-quota', requireAdmin, async (req, res) => {
  const userId = req.params.id as string;
  const currentMonth = getCurrentMonthYear();

  if (supabaseServer) {
    try {
      const u = await findUserByIdentifier(userId);

      if (u?.email) {
        await supabaseServer
          .from('user_usage')
          .update({ tickets_processed: 0, updated_at: new Date().toISOString() })
          .eq('user_email', u.email)
          .eq('month_year', currentMonth);

        return res.json({ success: true, message: `Reset monthly quota for ${u.email} to 0` });
      }
    } catch (err) {
      console.warn('Supabase reset quota error:', err);
    }
  }

  const numId = parseInt(userId, 10);
  const user = SERVER_STORE.users.find((u) => u.id === numId || (u as any).id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.ticketsUsedThisMonth = 0;
  res.json({ success: true, user });
});

app.put('/api/admin/users/:id/status', requireAdmin, async (req, res) => {
  const userId = req.params.id as string;
  const { status } = req.body;
  if (!['active', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  if (supabaseServer) {
    try {
      const data = await updateUserByIdentifier(userId, { status });

      if (data) {
        const memUser = SERVER_STORE.users.find(
          (u) => u.email.toLowerCase() === data.email.toLowerCase()
        );
        if (memUser) memUser.status = status;

        return res.json({
          success: true,
          user: {
            id: data.id,
            email: data.email,
            displayName: data.display_name,
            subscriptionTier: data.subscription_tier,
            status: data.status,
            createdAt: data.created_at,
          },
        });
      }
    } catch (err) {
      console.warn('Supabase update status error:', err);
    }
  }

  const numId = parseInt(userId, 10);
  const user = SERVER_STORE.users.find((u) => u.id === numId || (u as any).id === userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  user.status = status;
  res.json({ success: true, user });
});

app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
  const userId = req.params.id as string;

  if (supabaseServer) {
    try {
      const targetUser = await findUserByIdentifier(userId);

      if (targetUser?.email) {
        await supabaseServer.from('feedback').delete().eq('user_email', targetUser.email);
        await supabaseServer.from('analysis_history').delete().eq('user_email', targetUser.email);
        await supabaseServer.from('user_usage').delete().eq('user_email', targetUser.email);
        await supabaseServer.from('transactions').delete().eq('user_email', targetUser.email);
        await supabaseServer.from('users').delete().eq('email', targetUser.email);
      }
    } catch (e) {
      console.warn('Admin user cascade delete warning:', e);
    }
  }

  const numId = parseInt(userId, 10);
  const idx = SERVER_STORE.users.findIndex((u) => u.id === numId || (u as any).id === userId);
  if (idx >= 0) {
    SERVER_STORE.users.splice(idx, 1);
  }

  res.json({ success: true, message: 'User and associated records deleted successfully' });
});

// Admin User Feedback Management (Queries public.feedback table)
app.get('/api/admin/feedback', requireAdmin, async (_req, res) => {
  if (supabaseServer) {
    try {
      const { data, error } = await supabaseServer
        .from('feedback')
        .select('*')
        .order('created_at', { ascending: false });

      if (!error && data) {
        return res.json(data);
      }
      if (error) {
        console.warn('Error querying public.feedback for admin:', error);
      }
    } catch (err) {
      console.warn('Supabase feedback fetch error:', err);
    }
  }
  return res.json([]);
});

// User Feedback Submission (Persists directly to public.feedback table)
app.post('/api/feedback', authenticateUser, async (req: express.Request, res: express.Response) => {
  try {
    const userEmail = (req as any).userEmail;
    const { analysis_id, ticket_key, was_accurate, rating, comments, actual_files } = req.body;

    if (!ticket_key || typeof was_accurate !== 'boolean') {
      return res.status(400).json({ error: 'ticket_key and was_accurate boolean are required.' });
    }

    if (supabaseServer) {
      // Ensure user profile exists in public.users to satisfy foreign key
      await ensureUserProfile(userEmail, (req as any).authUserId);

      const payload: any = {
        user_email: userEmail,
        ticket_key,
        was_accurate,
        comments: comments || null,
        rating: typeof rating === 'number' ? rating : 5,
        actual_files: Array.isArray(actual_files) ? actual_files : [],
        created_at: new Date().toISOString(),
      };

      if (analysis_id && typeof analysis_id === 'string' && analysis_id.length > 20) {
        payload.analysis_id = analysis_id;
      }

      const { data, error } = await supabaseServer
        .from('feedback')
        .insert(payload)
        .select()
        .single();

      if (error) {
        console.warn('[Supabase Feedback Insert Error]:', error);
        return res.status(500).json({ error: error.message || 'Failed to save feedback to database.' });
      }

      return res.json({ success: true, feedback: data });
    }

    return res.json({
      success: true,
      feedback: {
        id: String(Date.now()),
        ticket_key,
        user_email: userEmail,
        was_accurate,
        rating,
        comments,
        created_at: new Date().toISOString(),
      },
    });
  } catch (err: any) {
    console.error('Feedback submission error:', err);
    return res.status(500).json({ error: err?.message || 'Internal server error while saving feedback.' });
  }
});

// User Feedback Retrieval for the Authenticated User (from public.feedback table)
app.get('/api/feedback', authenticateUser, async (req: express.Request, res: express.Response) => {
  try {
    const userEmail = (req as any).userEmail;

    if (supabaseServer) {
      const { data, error } = await supabaseServer
        .from('feedback')
        .select('*')
        .eq('user_email', userEmail)
        .order('created_at', { ascending: false });

      if (!error && data) {
        return res.json(data);
      }
      if (error) {
        console.warn('[Supabase User Feedback Query Warning]:', error);
      }
    }

    return res.json([]);
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to fetch feedback' });
  }
});


// Admin Promo Codes Management (Supabase-backed, in-memory fallback)
app.get('/api/admin/promos', requireAdmin, async (_req, res) => {
  res.json(await listPromos());
});

app.post('/api/admin/promos', requireAdmin, async (req, res) => {
  const { code, discountType, discountValue, applicableTiers, maxUses, expiresAt } = req.body;
  if (!code || !discountType || typeof discountValue !== 'number' || !Number.isFinite(discountValue)) {
    return res.status(400).json({ error: 'Missing required promo code fields' });
  }
  if (discountValue <= 0) {
    return res.status(400).json({ error: 'Discount value must be greater than zero.' });
  }
  if (discountType === 'percentage' && discountValue > 95) {
    return res.status(400).json({ error: 'Percentage discount cannot exceed 95%.' });
  }

  const normalizedCode = String(code).trim().toUpperCase();
  const existing = await findPromoByCode(normalizedCode);
  if (existing) {
    return res.status(400).json({ error: `Promo code ${normalizedCode} already exists.` });
  }

  const tiers: ('pro' | 'enterprise')[] = Array.isArray(applicableTiers)
    ? applicableTiers.filter((t: any) => t === 'pro' || t === 'enterprise')
    : ['pro', 'enterprise'];

  const newPromo: StoredPromoCode = {
    id: `prm_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    code: normalizedCode,
    discountType: discountType === 'fixed' ? 'fixed' : 'percentage',
    discountValue: Number(discountValue),
    applicableTiers: tiers.length > 0 ? tiers : ['pro', 'enterprise'],
    maxUses: typeof maxUses === 'number' && Number.isFinite(maxUses) ? maxUses : -1,
    usedCount: 0,
    isActive: true,
    expiresAt: expiresAt || undefined,
    createdAt: new Date().toISOString(),
  };

  if (supabaseAdmin) {
    try {
      const { error } = await supabaseAdmin.from('promo_codes').insert({
        id: newPromo.id,
        code: newPromo.code,
        discount_type: newPromo.discountType,
        discount_value: newPromo.discountValue,
        applicable_tiers: newPromo.applicableTiers,
        max_uses: newPromo.maxUses,
        times_used: 0,
        is_active: true,
        expires_at: newPromo.expiresAt || null,
      });
      if (error) {
        console.warn('[Promo Insert Warning]:', error.message);
      }
    } catch (err) {
      console.warn('[Promo Insert Error]:', err);
    }
  }

  SERVER_STORE.promos.unshift(newPromo);
  res.json({ success: true, promo: newPromo });
});

app.patch('/api/admin/promos/:id/toggle', requireAdmin, async (req, res) => {
  const promoId = decodeURIComponent(req.params.id as string);
  const promos = await listPromos();
  const promo = promos.find((p) => p.id === promoId || p.code === promoId.toUpperCase());
  if (!promo) return res.status(404).json({ error: 'Promo code not found' });

  const nextState = !promo.isActive;
  promo.isActive = nextState;

  const mem = SERVER_STORE.promos.find((p) => p.id === promo.id);
  if (mem) mem.isActive = nextState;

  if (supabaseAdmin) {
    try {
      const { error } = await supabaseAdmin
        .from('promo_codes')
        .update({ is_active: nextState })
        .eq('id', promo.id);
      if (error) console.warn('[Promo Toggle Warning]:', error.message);
    } catch (err) {
      console.warn('[Promo Toggle Error]:', err);
    }
  }

  res.json({ success: true, promo });
});

app.delete('/api/admin/promos/:id', requireAdmin, async (req, res) => {
  const promoId = decodeURIComponent(req.params.id as string);
  const promos = await listPromos();
  const promo = promos.find((p) => p.id === promoId || p.code === promoId.toUpperCase());
  if (!promo) return res.status(404).json({ error: 'Promo code not found' });

  if (supabaseAdmin) {
    try {
      const { error } = await supabaseAdmin.from('promo_codes').delete().eq('id', promo.id);
      if (error) console.warn('[Promo Delete Warning]:', error.message);
    } catch (err) {
      console.warn('[Promo Delete Error]:', err);
    }
  }

  SERVER_STORE.promos = SERVER_STORE.promos.filter((p) => p.id !== promo.id);
  res.json({ success: true, message: 'Promo code deleted' });
});

// Admin Transactions Ledger
app.get('/api/admin/transactions', requireAdmin, async (_req, res) => {
  if (supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (!error && data) {
        const formatted: StoredTransaction[] = data.map((t: any) => ({
          id: t.reference,
          reference: t.reference,
          amount: Number(t.amount ?? 0),
          currency: t.currency || 'NGN',
          email: t.user_email,
          tier: t.tier,
          status: t.status,
          channel: t.channel || undefined,
          paidAt: t.paid_at || undefined,
          createdAt: t.created_at || new Date().toISOString(),
          promoCode: t.promo_code || undefined,
        }));
        return res.json(formatted);
      }
      if (error) console.warn('[Transactions Fetch Warning]:', error.message);
    } catch (err) {
      console.warn('[Transactions Fetch Error]:', err);
    }
  }
  res.json(SERVER_STORE.transactions);
});

// Admin Settings
app.get('/api/admin/settings', requireAdmin, async (_req, res) => {
  await hydrateSettings(true);
  const sec = SERVER_STORE.settings.paystackSecretKey || process.env.PAYSTACK_SECRET_KEY || '';
  const maskedSecret = sec ? `${sec.substring(0, 7)}...${sec.substring(sec.length - 4)}` : '';

  res.json({
    paystackPublicKey: SERVER_STORE.settings.paystackPublicKey || process.env.PAYSTACK_PUBLIC_KEY || '',
    hasPaystackSecretKey: Boolean(sec),
    paystackSecretKeyMasked: maskedSecret,
    isLiveMode: SERVER_STORE.settings.isLiveMode,
    currency: SERVER_STORE.settings.currency,
    proPriceNgn: SERVER_STORE.settings.proPriceNgn,
    proPriceUsd: SERVER_STORE.settings.proPriceUsd,
    enterprisePriceNgn: SERVER_STORE.settings.enterprisePriceNgn,
    enterprisePriceUsd: SERVER_STORE.settings.enterprisePriceUsd,
    freeLimit: SERVER_STORE.settings.freeLimit,
    proLimit: SERVER_STORE.settings.proLimit,
    maintenanceMode: SERVER_STORE.settings.maintenanceMode,
    adminEmail: SERVER_STORE.settings.adminEmail,
    geminiModel: GEMINI_MODEL,
    settingsPersisted: Boolean(supabaseAdmin && supabaseServiceRoleKey),
  });
});

app.post('/api/admin/settings', requireAdmin, async (req, res) => {
  const {
    paystackPublicKey,
    paystackSecretKey,
    isLiveMode,
    currency,
    proPriceNgn,
    proPriceUsd,
    enterprisePriceNgn,
    enterprisePriceUsd,
    freeLimit,
    proLimit,
  } = req.body;

  if (paystackPublicKey !== undefined) SERVER_STORE.settings.paystackPublicKey = paystackPublicKey.trim();
  if (paystackSecretKey && !paystackSecretKey.includes('...')) {
    SERVER_STORE.settings.paystackSecretKey = paystackSecretKey.trim();
  }
  if (isLiveMode !== undefined) SERVER_STORE.settings.isLiveMode = Boolean(isLiveMode);
  if (currency !== undefined) SERVER_STORE.settings.currency = currency;
  if (proPriceNgn !== undefined) SERVER_STORE.settings.proPriceNgn = Number(proPriceNgn);
  if (proPriceUsd !== undefined) SERVER_STORE.settings.proPriceUsd = Number(proPriceUsd);
  if (enterprisePriceNgn !== undefined) SERVER_STORE.settings.enterprisePriceNgn = Number(enterprisePriceNgn);
  if (enterprisePriceUsd !== undefined) SERVER_STORE.settings.enterprisePriceUsd = Number(enterprisePriceUsd);
  if (freeLimit !== undefined) SERVER_STORE.settings.freeLimit = Number(freeLimit);
  if (proLimit !== undefined) SERVER_STORE.settings.proLimit = Number(proLimit);

  if (currency !== undefined && currency !== 'NGN' && currency !== 'USD') {
    SERVER_STORE.settings.currency = 'NGN';
  }

  await persistSettings();

  res.json({
    success: true,
    message: supabaseAdmin
      ? 'System settings updated and saved to the database.'
      : 'System settings updated in memory only (database service key not configured).',
    persisted: Boolean(supabaseAdmin),
  });
});

// ==========================================
// Secure Admin Impersonation
// Mints a short-lived magic-link sign-in for a target user so support can
// reproduce issues in that user's context. Admin-only, audited, and never
// exposes credentials.
// ==========================================
app.post('/api/admin/impersonate', requireAdmin, async (req: express.Request, res: express.Response) => {
  const { user_email } = req.body || {};
  const targetEmail = normalizeEmail(user_email);

  if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    return res.status(400).json({ error: 'A valid user_email is required for impersonation.' });
  }

  const adminUser = (req as any).adminUser;
  const adminEmail = normalizeEmail(adminUser?.email);
  if (adminEmail && targetEmail === adminEmail) {
    return res.status(400).json({ error: 'You are already signed in as the administrator.' });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'The database service is not configured on the server.' });
  }

  try {
    // Confirm the account exists so the admin gets a clear error instead of a
    // cryptic auth failure from the magic-link service.
    const { data: targetRow, error: lookupError } = await supabaseAdmin
      .from('users')
      .select('email')
      .eq('email', targetEmail)
      .maybeSingle();

    if (lookupError) {
      console.warn('[Admin Impersonate Lookup Warning]:', lookupError.message);
      return res.status(500).json({ error: 'Could not verify the target user. Please try again.' });
    }
    if (!targetRow) {
      return res.status(404).json({ error: `No user found with email ${targetEmail}.` });
    }

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: targetEmail,
    });

    if (error) {
      console.warn('[Admin Impersonate Generate Link Error]:', error.message);
      return res.status(500).json({ error: error.message || 'Failed to generate an impersonation link.' });
    }

    const actionLink = data?.properties?.action_link;
    if (!actionLink) {
      return res.status(500).json({ error: 'The impersonation link could not be generated.' });
    }

    console.log(`[Admin Impersonate] ${adminEmail || 'admin'} generated an impersonation link for ${targetEmail} at ${new Date().toISOString()}`);

    return res.json({
      action_link: actionLink,
      email: targetEmail,
      message: 'Impersonation link generated. It signs in as the target user and expires shortly.',
    });
  } catch (err: any) {
    console.error('[Admin Impersonate Exception]:', err?.message || err);
    return res.status(500).json({ error: 'Failed to generate an impersonation link.' });
  }
});

// ==========================================
// Admin Email Broadcast (Resend)
// Sends an announcement to all users, or to the free/pro tiers, via the
// Resend API. Admin-only; requires RESEND_API_KEY on the server.
// ==========================================
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const BROADCAST_BATCH_SIZE = 100; // Resend batch API maximum

app.post('/api/admin/broadcast', requireAdmin, async (req: express.Request, res: express.Response) => {
  const { audience, subject, message } = req.body || {};
  const normalizedAudience = typeof audience === 'string' ? audience.trim().toLowerCase() : '';
  const cleanSubject = typeof subject === 'string' ? subject.trim() : '';
  const cleanMessage = typeof message === 'string' ? message.trim() : '';

  if (!['all', 'free', 'pro', 'enterprise'].includes(normalizedAudience)) {
    return res.status(400).json({ error: "audience must be one of 'all', 'free', 'pro', or 'enterprise'." });
  }
  if (!cleanSubject || cleanSubject.length > 200) {
    return res.status(400).json({ error: 'subject is required (max 200 characters).' });
  }
  if (!cleanMessage || cleanMessage.length > 10_000) {
    return res.status(400).json({ error: 'message is required (max 10,000 characters).' });
  }

  const resendKey = (process.env.RESEND_API_KEY || '').trim();
  if (!resendKey) {
    return res.status(503).json({ error: 'Email broadcast is not configured on the server. Set RESEND_API_KEY to enable it.' });
  }
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'The database service is not configured on the server.' });
  }

  const adminUser = (req as any).adminUser;
  const adminEmail = normalizeEmail(adminUser?.email);

  try {
    let recipientsQuery = supabaseAdmin
      .from('users')
      .select('email, subscription_tier, status')
      .order('created_at', { ascending: true });

    if (normalizedAudience !== 'all') {
      recipientsQuery = recipientsQuery.eq('subscription_tier', normalizedAudience);
    }

    const dbRecipients = await fetchAllQueryRows(recipientsQuery);
    const recipients = Array.from(
      new Set(
        dbRecipients
          .filter((row: any) => (row.status ?? 'active') === 'active')
          .map((row: any) => normalizeEmail(row.email))
          .filter((email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      )
    );

    if (recipients.length === 0) {
      return res.json({
        success: true,
        audience: normalizedAudience,
        recipients: 0,
        sent: 0,
        failed: 0,
        message: 'No active recipients matched the selected audience.',
      });
    }

    const from = (process.env.RESEND_FROM_EMAIL || 'Context Pilot <onboarding@resend.dev>').trim();
    const replyTo = (process.env.SUPPORT_REPLY_TO_EMAIL || 'support.contextpilot@gmail.com').trim();
    const resend = new Resend(resendKey);

    const htmlBody = escapeHtml(cleanMessage).replace(/\n/g, '<br>');
    const html = `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;">
      <div style="background:linear-gradient(135deg,#667eea,#764ba2);padding:18px 24px;">
        <span style="color:#ffffff;font-size:17px;font-weight:800;letter-spacing:-0.02em;">Context Pilot</span>
      </div>
      <div style="padding:22px 24px;color:#0f172a;font-size:14px;line-height:1.65;">
        ${htmlBody}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0 12px;" />
        <p style="margin:0;color:#64748b;font-size:12px;">You are receiving this because you have a Context Pilot account. Reply to this email to reach our support team.</p>
      </div>
    </div>
  </body>
</html>`;
    const text = cleanMessage;

    let sent = 0;
    let failed = 0;
    const failureSamples: string[] = [];

    for (let offset = 0; offset < recipients.length; offset += BROADCAST_BATCH_SIZE) {
      const chunk = recipients.slice(offset, offset + BROADCAST_BATCH_SIZE);
      const batch = chunk.map((email) => ({
        from,
        to: email,
        subject: cleanSubject,
        html,
        text,
        replyTo,
      }));

      try {
        const { data: batchData, error: batchError } = await resend.batch.send(batch, {
          batchValidation: 'permissive',
        });

        if (batchError) {
          failed += chunk.length;
          if (failureSamples.length < 5) failureSamples.push(...chunk.slice(0, 5 - failureSamples.length));
          console.warn('[Admin Broadcast Batch Error]:', batchError.message || batchError);
          continue;
        }

        const created = Array.isArray(batchData?.data) ? batchData.data.length : 0;
        const perItemErrors = Array.isArray((batchData as any)?.errors) ? (batchData as any).errors : [];
        sent += created;
        failed += perItemErrors.length;
        if (perItemErrors.length > 0 && failureSamples.length < 5) {
          for (const item of perItemErrors) {
            const failedEmail = chunk[item.index];
            if (failedEmail) failureSamples.push(failedEmail);
            if (failureSamples.length >= 5) break;
          }
        }
      } catch (batchErr: any) {
        failed += chunk.length;
        if (failureSamples.length < 5) failureSamples.push(...chunk.slice(0, 5 - failureSamples.length));
        console.warn('[Admin Broadcast Batch Exception]:', batchErr?.message || batchErr);
      }
    }

    console.log(
      `[Admin Broadcast] audience=${normalizedAudience} recipients=${recipients.length} sent=${sent} failed=${failed} by=${adminEmail || 'admin'} at ${new Date().toISOString()}`
    );

    const success = failed === 0;
    return res.json({
      success,
      audience: normalizedAudience,
      recipients: recipients.length,
      sent,
      failed,
      failures: failureSamples,
      message: success
        ? `Broadcast delivered to ${sent} recipient${sent === 1 ? '' : 's'}.`
        : `Broadcast partially delivered: ${sent} sent, ${failed} failed.`,
    });
  } catch (err: any) {
    console.error('[Admin Broadcast Exception]:', err?.message || err);
    return res.status(500).json({ error: err?.message || 'Failed to send the broadcast. Please try again.' });
  }
});

// User Account Self-Deletion Endpoint (requires a verified Supabase session)
app.post('/api/auth/delete-account', authenticateUser, async (req: express.Request, res: express.Response) => {
  const userEmail = (req as any).userEmail as string;
  const authUserId = (req as any).authUserId as string;

  try {
    if (supabaseAdmin) {
      // Delete dependent records first to satisfy foreign keys.
      await supabaseAdmin.from('feedback').delete().eq('user_email', userEmail);
      await supabaseAdmin.from('analysis_history').delete().eq('user_email', userEmail);
      await supabaseAdmin.from('user_usage').delete().eq('user_email', userEmail);
      await supabaseAdmin.from('transactions').delete().eq('user_email', userEmail);
      // Revoke the stored GitHub connection (also covered by the FK cascade).
      await supabaseAdmin.from('user_github_tokens').delete().eq('user_email', userEmail);
      await supabaseAdmin.from('users').delete().eq('email', userEmail);
    }

    // Remove the Supabase Auth identity when a service role key is configured.
    if (supabaseAdmin && supabaseServiceRoleKey && authUserId) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(authUserId);
      if (error) console.warn('[Delete Account Auth Warning]:', error.message);
    }

    const idx = SERVER_STORE.users.findIndex((u) => u.email.toLowerCase() === userEmail);
    if (idx >= 0) SERVER_STORE.users.splice(idx, 1);

    return res.json({ success: true, message: 'Account and associated data deleted.' });
  } catch (err: any) {
    console.error('Account deletion error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to delete account.' });
  }
});

// ==========================================
// 3. AI Analysis endpoint with robust fallback
// ==========================================

const MAX_TECH_STACK_LENGTH = 120;
const TECH_STACK_WARNING =
  'No tech stack was provided. Predictions defaulted to general software architecture — provide your project\'s tech stack (e.g. "C++ / Vulkan", "React / Node") to significantly increase accuracy.';

/**
 * Normalises the free-form "Tech Stack / Project Type" value supplied by the client.
 * Trims, strips control characters/newlines (so the value can be embedded in a prompt
 * safely), collapses runs of spaces and caps the length.
 */
function sanitizeTechStack(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(/[\u0000-\u001F\u007F]+/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
    .slice(0, MAX_TECH_STACK_LENGTH);
}

const snakeCase = (value: string): string =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[\s\-/]+/g, '_')
    .toLowerCase();

interface HeuristicStackProfile {
  /** True for JS/TS web ecosystems where the legacy web heuristics capture more detail. */
  isWeb: boolean;
  /** UI/frontend-layer paths for a PascalCase module name. */
  view: (name: string) => string[];
  /** Backend-layer paths for a path area and PascalCase module name. */
  service: (area: string, name: string) => string[];
  /** Database-layer paths for a snake_case-ish area and PascalCase module name. */
  repository: (area: string, name: string) => string[];
  /** Test file path for an area and PascalCase module name. */
  test: (area: string, name: string) => string;
  /** Build/config files that make sense for the stack. */
  buildFiles: string[];
}

interface ProfileOptions {
  ext: string;
  headerExt?: string;
  style?: 'pascal' | 'snake';
  srcRoot?: string;
  isWeb?: boolean;
  testPath: (area: string, snakeName: string, pascalName: string) => string;
  buildFiles: string[];
}

/** Factory producing conventional per-stack paths for the heuristic fallback engine. */
function makeStackProfile({ ext, headerExt = '', style = 'pascal', srcRoot = 'src', isWeb = false, testPath, buildFiles }: ProfileOptions): HeuristicStackProfile {
  const fmt = (name: string) => (style === 'snake' ? snakeCase(name) : name);
  const pair = (area: string, name: string): string[] => {
    const base = `${srcRoot}/${area}/${fmt(name)}${ext}`;
    return headerExt ? [base, `${srcRoot}/${area}/${fmt(name)}${headerExt}`] : [base];
  };
  return {
    isWeb,
    view: (name) => pair('ui', name),
    service: (area, name) => pair(area, name),
    repository: (_area, name) => pair('db', name),
    test: (area, name) => testPath(area, snakeCase(name), name),
    buildFiles,
  };
}

const GENERIC_STACK_PROFILE: HeuristicStackProfile = makeStackProfile({
  ext: '',
  style: 'snake',
  srcRoot: 'src',
  testPath: (area, sn) => `tests/test_${sn}`,
  buildFiles: ['.env.example'],
});

/**
 * Detector table for the heuristic fallback. Each detector pairs a pattern matching
 * stack keywords with the profile to use. When the free-form string mentions several
 * ecosystems, the one mentioned FIRST wins — e.g. "React / Node" is web, while
 * "C++ / Vulkan (replacing our React prototype)" stays C++.
 */
const STACK_DETECTORS: Array<{ pattern: RegExp; build: (s: string) => HeuristicStackProfile }> = [
  {
    // JavaScript / TypeScript web ecosystems — legacy web heuristics apply.
    pattern: /(react|next\.?js|vue|nuxt|angular|svelte|astro|gatsby|remix|solid\.?js|qwik|nest\.?js|express|fastify|node\.?js|javascript|typescript|jsx|tsx|\bjs\b|\bts\b)/,
    build: () =>
      makeStackProfile({
        ext: '.ts',
        srcRoot: 'src',
        isWeb: true,
        testPath: (_area, sn) => `tests/${sn}.test.ts`,
        buildFiles: ['package.json', '.env.example'],
      }),
  },
  {
    // C / C++ (Vulkan, Qt, CMake, game engines, embedded)
    pattern: /(c\+\+|cpp|vulkan|cmake|\bqt\b|unreal|imgui)/,
    build: () =>
      makeStackProfile({
        ext: '.cpp',
        headerExt: '.h',
        style: 'pascal',
        srcRoot: 'src',
        testPath: (_area, sn) => `tests/test_${sn}.cpp`,
        buildFiles: ['CMakeLists.txt', '.env.example'],
      }),
  },
  {
    // C# / .NET
    pattern: /(c#|\.net|dotnet|asp\.net|blazor)/,
    build: () =>
      makeStackProfile({
        ext: '.cs',
        style: 'pascal',
        srcRoot: 'src',
        testPath: (_area, _sn, pascal) => `tests/${pascal}Tests.cs`,
        buildFiles: ['ContextPilot.sln', 'src/App.csproj', 'appsettings.json', '.env.example'],
      }),
  },
  {
    // Python (Django, Flask, FastAPI)
    pattern: /(python|django|flask|fastapi|pandas|numpy)/,
    build: (s) =>
      makeStackProfile({
        ext: '.py',
        style: 'snake',
        srcRoot: 'src',
        testPath: (_area, sn) => `tests/test_${sn}.py`,
        buildFiles: s.includes('django')
          ? ['manage.py', 'requirements.txt', '.env.example']
          : ['pyproject.toml', 'requirements.txt', '.env.example'],
      }),
  },
  {
    // Java / Spring
    pattern: /(java|spring|maven|gradle)/,
    build: () =>
      makeStackProfile({
        ext: '.java',
        style: 'pascal',
        srcRoot: 'src/main/java',
        testPath: (area, _sn, pascal) => `src/test/java/${area}/${pascal}Test.java`,
        buildFiles: ['pom.xml', '.env.example'],
      }),
  },
  {
    // Kotlin / Android
    pattern: /(kotlin|android|kts)/,
    build: () =>
      makeStackProfile({
        ext: '.kt',
        style: 'pascal',
        srcRoot: 'app/src/main/java',
        testPath: (area, _sn, pascal) => `app/src/test/java/${area}/${pascal}Test.kt`,
        buildFiles: ['build.gradle.kts', 'settings.gradle.kts', '.env.example'],
      }),
  },
  {
    // Go
    pattern: /(golang|\bgo\b)/,
    build: () =>
      makeStackProfile({
        ext: '.go',
        style: 'snake',
        srcRoot: 'internal',
        testPath: (area, sn) => `internal/${area}/${sn}_test.go`,
        buildFiles: ['go.mod', '.env.example'],
      }),
  },
  {
    // Rust
    pattern: /(rust|cargo)/,
    build: () =>
      makeStackProfile({
        ext: '.rs',
        style: 'snake',
        srcRoot: 'src',
        testPath: (_area, sn) => `tests/${sn}.rs`,
        buildFiles: ['Cargo.toml', '.env.example'],
      }),
  },
  {
    // PHP (Laravel, Symfony)
    pattern: /(php|laravel|symfony|composer)/,
    build: (s) => {
      const laravel = s.includes('laravel');
      return makeStackProfile({
        ext: '.php',
        style: 'pascal',
        srcRoot: laravel ? 'app' : 'src',
        testPath: (_area, _sn, pascal) => (laravel ? `tests/Feature/${pascal}Test.php` : `tests/${pascal}Test.php`),
        buildFiles: ['composer.json', '.env.example'],
      });
    },
  },
  {
    // Ruby (Rails)
    pattern: /(ruby|rails|sinatra|rspec)/,
    build: () =>
      makeStackProfile({
        ext: '.rb',
        style: 'snake',
        srcRoot: 'app',
        testPath: (area, sn) => `spec/${area}/${sn}_spec.rb`,
        buildFiles: ['Gemfile', 'config/routes.rb', '.env.example'],
      }),
  },
  {
    // Swift / Objective-C (iOS / macOS)
    pattern: /(swift|swiftui|ios|macos|objective.?c)/,
    build: (s) => {
      const ext = /objective.?c/.test(s) ? '.m' : '.swift';
      return makeStackProfile({
        ext,
        style: 'pascal',
        srcRoot: 'Sources',
        testPath: (_area, _sn, pascal) => `Tests/${pascal}Tests${ext}`,
        buildFiles: ['Package.swift', '.env.example'],
      });
    },
  },
  {
    // Flutter / Dart
    pattern: /(flutter|dart)/,
    build: () =>
      makeStackProfile({
        ext: '.dart',
        style: 'snake',
        srcRoot: 'lib',
        testPath: (_area, sn) => `test/${sn}_test.dart`,
        buildFiles: ['pubspec.yaml', '.env.example'],
      }),
  },
  {
    // Elixir (Phoenix)
    pattern: /(elixir|phoenix|erlang)/,
    build: () =>
      makeStackProfile({
        ext: '.ex',
        style: 'snake',
        srcRoot: 'lib',
        testPath: (_area, sn) => `test/${sn}_test.exs`,
        buildFiles: ['mix.exs', '.env.example'],
      }),
  },
  {
    // Scala
    pattern: /(scala|sbt)/,
    build: () =>
      makeStackProfile({
        ext: '.scala',
        style: 'pascal',
        srcRoot: 'src/main/scala',
        testPath: (area, _sn, pascal) => `src/test/scala/${area}/${pascal}Spec.scala`,
        buildFiles: ['build.sbt', '.env.example'],
      }),
  },
];

/**
 * Maps a free-form tech stack string to conventional file paths for the heuristic
 * fallback. Returns null when the input is empty. JavaScript/TypeScript web stacks
 * resolve to a profile whose paths mirror the legacy web heuristics; every other
 * recognised (or unrecognised) stack resolves to a non-web profile so the heuristic
 * never emits .tsx/Node paths for a native codebase (e.g. C++ / Vulkan).
 *
 * When the string mentions several ecosystems, the one appearing FIRST in the
 * string wins.
 */
function detectStackProfile(techStack: string): HeuristicStackProfile | null {
  const s = techStack.toLowerCase();
  if (!s.trim()) return null;

  const matches: Array<{ index: number; order: number; build: () => HeuristicStackProfile }> = [];
  for (const [order, detector] of STACK_DETECTORS.entries()) {
    const m = detector.pattern.exec(s);
    if (m) matches.push({ index: m.index, order, build: () => detector.build(s) });
  }
  if (matches.length === 0) {
    // Any other tech stack: stay non-web and stack-agnostic rather than emitting
    // web/Node paths by accident.
    return GENERIC_STACK_PROFILE;
  }
  matches.sort((a, b) => a.index - b.index || a.order - b.order);
  return matches[0].build();
}

/** Dedupes file lists while preserving order. */
const uniquePaths = (paths: string[]): string[] => Array.from(new Set(paths));

function heuristicAnalyzeTicket(ticketText: string, ticketKey: string, techStack?: string) {
  const lower = ticketText.toLowerCase();
  const stack = sanitizeTechStack(techStack);
  // No tech stack (or a JS/TS web stack) keeps the historical web heuristics.
  const profile = stack ? detectStackProfile(stack) : null;
  const isWeb = !profile || profile.isWeb;

  const frontend: string[] = [];
  const backend: string[] = [];
  const database: string[] = [];
  const config: string[] = [];
  const tests: string[] = [];

  // Match keyword patterns
  if (lower.includes('auth') || lower.includes('oauth') || lower.includes('login') || lower.includes('jwt')) {
    if (isWeb) {
      frontend.push('src/components/AuthModal.tsx', 'src/context/AuthContext.tsx');
      backend.push('src/middleware/auth.ts', 'src/controllers/authController.ts', 'src/services/tokenService.ts');
      database.push('src/db/migrations/001_create_users.sql', 'src/db/schema/users.ts');
      config.push('.env.example');
      tests.push('tests/auth.test.ts', 'tests/jwt.test.ts');
    } else {
      frontend.push(...profile!.view('LoginView'), ...profile!.view('AuthView'));
      backend.push(...profile!.service('auth', 'AuthService'), ...profile!.service('auth', 'AuthController'), ...profile!.service('auth', 'TokenService'));
      database.push('db/migrations/001_create_users.sql', ...profile!.repository('db', 'UserRepository'));
      config.push(...profile!.buildFiles);
      tests.push(profile!.test('auth', 'Auth'), profile!.test('auth', 'Jwt'));
    }
  }

  if (lower.includes('pay') || lower.includes('stripe') || lower.includes('paystack') || lower.includes('billing') || lower.includes('checkout') || lower.includes('webhook')) {
    if (isWeb) {
      frontend.push('src/components/SubscriptionPlansView.tsx', 'src/components/PaymentModal.tsx');
      backend.push('src/services/paystack.ts', 'src/routes/paymentRoutes.ts', 'src/controllers/webhookController.ts');
      database.push('src/db/migrations/002_transactions.sql', 'src/db/schema/transactions.ts');
      config.push('config/payment.config.ts');
      tests.push('tests/paystack.test.ts', 'tests/webhooks.test.ts');
    } else {
      frontend.push(...profile!.view('PaymentView'), ...profile!.view('CheckoutView'));
      backend.push(...profile!.service('payments', 'PaymentService'), ...profile!.service('payments', 'PaymentController'), ...profile!.service('payments', 'WebhookController'));
      database.push('db/migrations/002_transactions.sql', ...profile!.repository('db', 'TransactionRepository'));
      config.push(...profile!.buildFiles);
      tests.push(profile!.test('payments', 'Payment'), profile!.test('payments', 'Webhook'));
    }
  }

  if (lower.includes('dark') || lower.includes('theme') || lower.includes('ui') || lower.includes('navbar') || lower.includes('sidebar') || lower.includes('responsive')) {
    if (isWeb) {
      frontend.push('src/components/Navbar.tsx', 'src/components/ThemeToggle.tsx', 'src/index.css');
      config.push('tailwind.config.ts');
      tests.push('tests/ui-theme.test.tsx');
    } else {
      frontend.push(...profile!.view('ThemeManager'), ...profile!.view('MainView'));
      config.push(...profile!.buildFiles);
      tests.push(profile!.test('ui', 'Theme'));
    }
  }

  if (lower.includes('github') || lower.includes('repo') || lower.includes('git')) {
    if (isWeb) {
      frontend.push('src/components/GitHubVerifierView.tsx');
      backend.push('src/services/githubService.ts', 'src/routes/githubRoutes.ts');
      tests.push('tests/github-verifier.test.ts');
    } else {
      frontend.push(...profile!.view('RepoBrowserView'));
      backend.push(...profile!.service('git', 'GitService'), ...profile!.service('git', 'GitHubClient'));
      tests.push(profile!.test('git', 'GitHub'));
    }
  }

  // Fallback defaults if few matched
  if (frontend.length === 0) {
    if (isWeb) {
      frontend.push('src/components/MainView.tsx', 'src/hooks/useData.ts');
    } else {
      frontend.push(...profile!.view('MainView'));
    }
  }
  if (backend.length === 0) {
    if (isWeb) {
      backend.push('src/controllers/apiController.ts', 'src/routes/api.ts');
    } else {
      backend.push(...profile!.service('core', 'ApiController'));
    }
  }
  if (database.length === 0) {
    if (isWeb) {
      database.push('src/db/schema.ts');
    } else {
      database.push('db/schema.sql');
    }
  }
  if (config.length === 0) {
    if (isWeb) {
      config.push('package.json');
    } else {
      config.push(...profile!.buildFiles);
    }
  }
  if (tests.length === 0) {
    if (isWeb) {
      tests.push(`tests/${ticketKey.toLowerCase()}.test.ts`);
    } else {
      tests.push(profile!.test('ticket', ticketKey.toLowerCase().replace(/[^a-z0-9]+/g, '_')));
    }
  }

  const uniqueFrontend = uniquePaths(frontend);
  const uniqueBackend = uniquePaths(backend);
  const uniqueDatabase = uniquePaths(database);
  const uniqueConfig = uniquePaths(config);
  const uniqueTests = uniquePaths(tests);

  const total = uniqueFrontend.length + uniqueBackend.length + uniqueDatabase.length + uniqueConfig.length + uniqueTests.length;

  return {
    frontend_files: uniqueFrontend,
    backend_files: uniqueBackend,
    database_files: uniqueDatabase,
    config_files: uniqueConfig,
    test_files: uniqueTests,
    confidence_score: 0.92,
    reasoning: stack
      ? `Identified ${total} impacted components across UI, backend services, schema migrations, and test coverage based on technical specifications in ${ticketKey}. Predictions targeted at the ${stack} tech stack.`
      : `Identified ${total} impacted components across UI, backend services, schema migrations, and test coverage based on technical specifications in ${ticketKey}. No tech stack was provided, so general software architecture was assumed — providing the project's tech stack increases accuracy.`,
    total_files: total,
    processingTimeMs: 180,
    ticket_key: ticketKey,
  };
}

// ==========================================
// Ticket Analysis Handler with Quota Enforcement
// Checks user_usage before analysis, increments after successful completion
// ==========================================
async function handleTicketAnalysis(req: express.Request, res: express.Response) {
  const startTime = Date.now();
  const { ticket_text, ticket_key, user_email, ticket_title, tech_stack } = req.body;
  const stack = sanitizeTechStack(tech_stack);

  if (!ticket_text || typeof ticket_text !== 'string' || ticket_text.trim().length < 5) {
    return res.status(400).json({ error: 'Missing or insufficient ticket_text for analysis' });
  }
  if (typeof ticket_key !== 'string' || !ticket_key.trim()) {
    return res.status(400).json({ error: 'ticket_key is required for analysis history.' });
  }

  await hydrateSettings();

  const key = ticket_key.trim();

  // Prefer the verified Supabase identity over any client-supplied email.
  const auth = await resolveBearerUser(req);
  if (auth.status === 'invalid') {
    return res.status(401).json({ error: 'Invalid or expired authentication session. Please sign in again.' });
  }
  const email = (auth.user?.email || user_email || (req.headers['x-user-email'] as string) || '').toLowerCase().trim();
  const currentMonth = getCurrentMonthYear();

  let userTier: 'free' | 'pro' | 'enterprise' = 'free';
  let monthlyLimit = SERVER_STORE.settings.freeLimit || 10;
  let ticketsProcessed = 0;
  let usageReadFailed = false;

  // 1. Quota Enforcement: Check user status and monthly limit before running AI
  if (email) {
    await ensureUserProfile(email, auth.user?.id);

    if (supabaseAdmin) {
      try {
        // Fetch user profile from Supabase
        const { data: userData } = await supabaseAdmin
          .from('users')
          .select('subscription_tier, status')
          .eq('email', email)
          .maybeSingle();

        if (userData) {
          if (userData.status === 'suspended') {
            return res.status(403).json({ error: 'Account is suspended. Please contact support.' });
          }
          userTier = userData.subscription_tier || 'free';
        }

        // Determine limit by tier
        monthlyLimit =
          userTier === 'enterprise'
            ? -1
            : userTier === 'pro'
            ? (SERVER_STORE.settings.proLimit || 150)
            : (SERVER_STORE.settings.freeLimit || 10);

        // Fetch monthly usage
        const { data: usageData, error: usageReadError } = await supabaseAdmin
          .from('user_usage')
          .select('tickets_processed, monthly_limit')
          .eq('user_email', email)
          .eq('month_year', currentMonth)
          .maybeSingle();

        if (usageReadError) {
          // Never overwrite a possibly-nonzero counter with a guessed value.
          // Skip the write below and surface the problem loudly in the logs.
          console.warn('[User Usage Read Warning]:', usageReadError.message);
          usageReadFailed = true;
        }

        if (usageData) {
          ticketsProcessed = usageData.tickets_processed || 0;
          if (typeof usageData.monthly_limit === 'number') {
            monthlyLimit = usageData.monthly_limit;
          }
        }

        // Enforce quota limit (if not unlimited -1)
        if (monthlyLimit !== -1 && ticketsProcessed >= monthlyLimit) {
          return res.status(429).json({
            error: `Monthly ticket limit reached (${ticketsProcessed}/${monthlyLimit}). Upgrade your subscription tier to continue.`,
            quotaExceeded: true,
            ticketsProcessed,
            monthlyLimit,
            remainingTickets: 0,
          });
        }
      } catch (quotaErr) {
        console.warn('[Quota Check Warning]:', quotaErr);
      }
    } else {
      // In-memory fallback
      const memUser = SERVER_STORE.users.find((u) => u.email.toLowerCase() === email);
      if (memUser) {
        userTier = memUser.subscriptionTier;
        monthlyLimit =
          userTier === 'enterprise'
            ? -1
            : userTier === 'pro'
            ? (SERVER_STORE.settings.proLimit || 150)
            : (SERVER_STORE.settings.freeLimit || 10);
        ticketsProcessed = memUser.ticketsUsedThisMonth || 0;

        if (monthlyLimit !== -1 && ticketsProcessed >= monthlyLimit) {
          return res.status(429).json({
            error: `Monthly ticket limit reached (${ticketsProcessed}/${monthlyLimit}). Upgrade your subscription tier to continue.`,
            quotaExceeded: true,
            ticketsProcessed,
            monthlyLimit,
            remainingTickets: 0,
          });
        }
      }
    }
  }

  // 2. Run AI Analysis
  let analysisResult: any = null;
  const ai = getAiClient();

  if (ai) {
    try {
      const stackContext = stack
        ? `Tech Stack / Project Type: ${stack}
The user's project is written in ${stack}. Only predict files that match this tech stack. Use the languages, file extensions, directory conventions, package managers, and build systems that are native to ${stack}. Do NOT predict files from unrelated ecosystems — for example, never output .tsx/.jsx, package.json, or Node.js paths for a C++ codebase. If a category genuinely has no impacted files in this stack, return an empty array for it rather than inventing files from another ecosystem.`
        : `Tech Stack / Project Type: Not specified (default to general software architecture)
No tech stack was provided for this project. Stay deliberately tech-stack agnostic: reason from general software architecture principles and avoid assuming a specific ecosystem. In your reasoning, note that providing the project's tech stack would increase prediction accuracy.`;

      const prompt = `Act as a senior software architect and tech lead. Analyze this Jira ticket carefully and predict all codebase files, components, and endpoints that will need to be added or modified.

${stackContext}

Ticket Key: ${key}
Ticket Content:
${ticket_text}

Categorize files into:
- frontend_files: UI components, pages, custom hooks, styles, view templates${stack ? ` (all native to ${stack})` : ''}
- backend_files: API routes, controllers, middleware, business services${stack ? ` (all native to ${stack})` : ''}
- database_files: ORM models, migration SQL, schemas, seeds
- config_files: env files, dockerfiles, build/package configs
- test_files: unit tests, integration tests, end-to-end tests

Be realistic, precise, and practical for production codebases. ${stack ? `Every predicted path must be valid for ${stack}.` : ''}`;

      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          systemInstruction:
            'You are a senior software engineer. Return structured JSON predicting impacted files for software tickets. When a tech stack is provided, only predict files that are native to that tech stack — never invent files from a different ecosystem.',
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              frontend_files: { type: Type.ARRAY, items: { type: Type.STRING } },
              backend_files: { type: Type.ARRAY, items: { type: Type.STRING } },
              database_files: { type: Type.ARRAY, items: { type: Type.STRING } },
              config_files: { type: Type.ARRAY, items: { type: Type.STRING } },
              test_files: { type: Type.ARRAY, items: { type: Type.STRING } },
              confidence_score: { type: Type.NUMBER },
              reasoning: { type: Type.STRING },
            },
            required: [
              'frontend_files',
              'backend_files',
              'database_files',
              'config_files',
              'test_files',
              'confidence_score',
              'reasoning',
            ],
          },
        },
      });

      const rawJson = response.text?.trim() || '{}';
      const parsed = JSON.parse(rawJson);

      const frontend_files = Array.isArray(parsed.frontend_files) ? parsed.frontend_files : [];
      const backend_files = Array.isArray(parsed.backend_files) ? parsed.backend_files : [];
      const database_files = Array.isArray(parsed.database_files) ? parsed.database_files : [];
      const config_files = Array.isArray(parsed.config_files) ? parsed.config_files : [];
      const test_files = Array.isArray(parsed.test_files) ? parsed.test_files : [];

      const total_files =
        frontend_files.length +
        backend_files.length +
        database_files.length +
        config_files.length +
        test_files.length;

      analysisResult = {
        frontend_files,
        backend_files,
        database_files,
        config_files,
        test_files,
        confidence_score: typeof parsed.confidence_score === 'number' ? parsed.confidence_score : 0.9,
        reasoning: parsed.reasoning || 'Identified impacted files based on technical requirements and architectural impact.',
        total_files,
        ticket_key: key,
      };
    } catch (err: any) {
      console.warn('Gemini API call warning, falling back to heuristic engine:', err?.message);
    }
  }

  // Fallback to heuristic engine if Gemini unavailable or failed
  if (!analysisResult) {
    analysisResult = heuristicAnalyzeTicket(ticket_text, key, stack);
  }

  // Surface the tech-stack context (and the fallback warning) to the client.
  analysisResult.tech_stack = stack || undefined;
  if (!stack) {
    analysisResult.tech_stack_warning = TECH_STACK_WARNING;
  }

  const processingTimeMs = Date.now() - startTime;
  analysisResult.processingTimeMs = processingTimeMs;

  // 3. Quota Update: Increment tickets_processed ONLY AFTER successful analysis
  if (email) {
    const updatedCount = ticketsProcessed + 1;

    if (supabaseAdmin && usageReadFailed) {
      console.warn('[Quota Update Skipped]: user_usage could not be read earlier this request; skipping the write to avoid corrupting the counter. See the User Usage Read Warning above.');
    } else if (supabaseAdmin) {
      try {
        // Upsert into user_usage (primary path; requires the unique (user_email, month_year) constraint)
        const { error: usageUpsertError } = await supabaseAdmin.from('user_usage').upsert(
          {
            user_email: email,
            month_year: currentMonth,
            tickets_processed: updatedCount,
            monthly_limit: monthlyLimit,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_email,month_year' }
        );

        if (usageUpsertError) {
          console.warn('[User Usage Upsert Warning]:', usageUpsertError.message);
          // Fallback for schemas where the upsert target is missing: try UPDATE first,
          // then INSERT only when no row exists yet.
          const { data: updatedRows, error: updateError } = await supabaseAdmin
            .from('user_usage')
            .update({
              tickets_processed: updatedCount,
              monthly_limit: monthlyLimit,
              updated_at: new Date().toISOString(),
            })
            .eq('user_email', email)
            .eq('month_year', currentMonth)
            .select('tickets_processed');

          if (updateError) {
            console.warn('[User Usage Update Fallback Warning]:', updateError.message);
          } else if (!updatedRows || updatedRows.length === 0) {
            const { error: insertError } = await supabaseAdmin.from('user_usage').insert({
              user_email: email,
              month_year: currentMonth,
              tickets_processed: updatedCount,
              monthly_limit: monthlyLimit,
              updated_at: new Date().toISOString(),
            });
            if (insertError) console.warn('[User Usage Insert Fallback Warning]:', insertError.message);
          }
        }

        // Record in analysis_history table
        const { data: historyRow, error: historyErr } = await supabaseAdmin.from('analysis_history').insert({
          user_email: email,
          ticket_key: key,
          ticket_title: ticket_title || key,
          reasoning: analysisResult.reasoning,
          frontend_files: analysisResult.frontend_files,
          backend_files: analysisResult.backend_files,
          database_files: analysisResult.database_files,
          config_files: analysisResult.config_files,
          test_files: analysisResult.test_files,
          apis: analysisResult.apis || [],
          confidence_score: analysisResult.confidence_score,
          total_files: analysisResult.total_files,
          processing_time_ms: processingTimeMs,
        }).select('id').single();

        if (historyErr) {
          console.warn('[Analysis History Persist Warning]:', historyErr.message);
        } else if (historyRow?.id) {
          analysisResult.historyId = historyRow.id;
        }
      } catch (persistErr) {
        console.warn('[Supabase Quota Update Warning]:', persistErr);
      }
    }

    const memUser = SERVER_STORE.users.find((u) => u.email.toLowerCase() === email);
    if (memUser) {
      memUser.ticketsUsedThisMonth = updatedCount;
    }

    analysisResult.usage = {
      ticketsProcessed: updatedCount,
      monthlyLimit,
      remainingTickets: monthlyLimit === -1 ? -1 : Math.max(0, monthlyLimit - updatedCount),
    };
  }

  return res.json(analysisResult);
}

// Support both /api/analyze-ticket and /api/analyze
app.post('/api/analyze-ticket', handleTicketAnalysis);
app.post('/api/analyze', handleTicketAnalysis);

// ==========================================
// User Authentication Middleware for History Operations
// ==========================================
async function authenticateUser(req: express.Request, res: express.Response, next: express.NextFunction) {
  try {
    const auth = await resolveBearerUser(req);

    if (auth.status === 'invalid') {
      return res.status(401).json({ error: 'Invalid or expired authentication session. Please sign in again.' });
    }

    if (auth.status !== 'valid' || !auth.user) {
      return res.status(401).json({ error: 'Authentication required. Please sign in to continue.' });
    }

    (req as any).userEmail = auth.user.email;
    (req as any).authUserId = auth.user.id;
    next();
  } catch (err: any) {
    return res.status(401).json({ error: 'Authentication failed: ' + (err?.message || 'Invalid token') });
  }
}

// ==========================================
// Authenticated History & Account Sync Endpoints
// ==========================================

// GET /api/history - List the signed-in user's analysis history from Supabase
app.get('/api/history', authenticateUser, async (req: express.Request, res: express.Response) => {
  const userEmail = (req as any).userEmail as string;

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'The database service is not configured on the server.' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('analysis_history')
      .select('*')
      .eq('user_email', userEmail)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.warn('[History Fetch Warning]:', error.message);
      return res.status(500).json({ error: 'Failed to load analysis history.' });
    }

    return res.json(data || []);
  } catch (err: any) {
    console.error('History fetch error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to load history.' });
  }
});

// GET /api/user/sync - Authoritative tier + quota snapshot for the signed-in user
app.get('/api/user/sync', authenticateUser, async (req: express.Request, res: express.Response) => {
  const userEmail = (req as any).userEmail as string;
  const authUserId = (req as any).authUserId as string | undefined;
  const currentMonth = getCurrentMonthYear();

  await hydrateSettings();
  await ensureUserProfile(userEmail, authUserId);

  let tier: 'free' | 'pro' | 'enterprise' = 'free';
  let status: 'active' | 'suspended' = 'active';
  let displayName = userEmail.split('@')[0];
  let photoUrl: string | undefined;
  let ticketsProcessed = 0;
  let monthlyLimit = SERVER_STORE.settings.freeLimit || 10;

  if (supabaseAdmin) {
    try {
      const { data: profile } = await supabaseAdmin
        .from('users')
        .select('display_name, photo_url, subscription_tier, status')
        .eq('email', userEmail)
        .maybeSingle();

      if (profile) {
        tier = (profile.subscription_tier as 'free' | 'pro' | 'enterprise') || 'free';
        status = (profile.status as 'active' | 'suspended') || 'active';
        displayName = profile.display_name || displayName;
        photoUrl = profile.photo_url || undefined;
      }

      monthlyLimit =
        tier === 'enterprise'
          ? -1
          : tier === 'pro'
          ? (SERVER_STORE.settings.proLimit || 150)
          : (SERVER_STORE.settings.freeLimit || 10);

      const { data: usageRow } = await supabaseAdmin
        .from('user_usage')
        .select('tickets_processed, monthly_limit')
        .eq('user_email', userEmail)
        .eq('month_year', currentMonth)
        .maybeSingle();

      if (usageRow) {
        ticketsProcessed = Number(usageRow.tickets_processed ?? 0);
        if (typeof usageRow.monthly_limit === 'number' && usageRow.monthly_limit !== 0) {
          monthlyLimit = usageRow.monthly_limit;
        }
      }
    } catch (err) {
      console.warn('[User Sync Warning]:', err);
    }
  }

  return res.json({
    email: userEmail,
    displayName,
    photoUrl,
    subscriptionTier: tier,
    status,
    usage: {
      monthYear: currentMonth,
      ticketsProcessed,
      monthlyLimit,
      remainingTickets: monthlyLimit === -1 ? -1 : Math.max(0, monthlyLimit - ticketsProcessed),
    },
  });
});

// ==========================================
// User Profile Editing
// ==========================================

// POST /api/user/profile - Persist profile edits (display name) to public.users.
// The browser roles hold no UPDATE privilege on public.users, so this is the
// only way a signed-in user can change their profile. Auth metadata is kept in
// sync too, so a refreshed Supabase session and the database agree.
app.post('/api/user/profile', authenticateUser, async (req: express.Request, res: express.Response) => {
  const userEmail = (req as any).userEmail as string;
  const authUserId = (req as any).authUserId as string;

  const rawName = typeof req.body?.displayName === 'string' ? req.body.displayName : '';
  const displayName = rawName.trim().replace(/\s+/g, ' ');

  if (!displayName) {
    return res.status(400).json({ error: 'Display name is required.' });
  }
  if (displayName.length > 80) {
    return res.status(400).json({ error: 'Display name must be 80 characters or fewer.' });
  }
  if (/[\u0000-\u001f\u007f]/.test(displayName)) {
    return res.status(400).json({ error: 'Display name contains invalid characters.' });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'The database service is not configured on the server.' });
  }

  try {
    await ensureUserProfile(userEmail, authUserId);

    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ display_name: displayName })
      .eq('email', userEmail)
      .select('display_name')
      .maybeSingle();

    if (error) {
      console.warn('[Profile Update Warning]:', error.message);
      return res.status(500).json({ error: 'Failed to save your profile. Please try again.' });
    }
    if (!data) {
      return res.status(404).json({ error: 'User profile not found.' });
    }

    // Mirror the change into auth metadata so the next session refresh carries
    // the new name as well (the UI reads metadata before server hydration).
    // A failure here must not fail the request: public.users is authoritative.
    try {
      const { data: authData } = await supabaseAdmin.auth.admin.getUserById(authUserId);
      const existingMeta = authData?.user?.user_metadata || {};
      const { error: metaError } = await supabaseAdmin.auth.admin.updateUserById(authUserId, {
        user_metadata: { ...existingMeta, display_name: displayName, full_name: displayName },
      });
      if (metaError) console.warn('[Profile Metadata Sync Warning]:', metaError.message);
    } catch (metaErr) {
      console.warn('[Profile Metadata Sync Warning]:', metaErr);
    }

    return res.json({ success: true, displayName: data.display_name });
  } catch (err: any) {
    console.error('Profile update error:', err);
    return res.status(500).json({ error: 'Failed to save your profile. Please try again.' });
  }
});

// ==========================================
// GitHub OAuth Connection (persistent, server-side)
// ==========================================
//
// Supabase only exposes session.provider_token right after the GitHub OAuth
// redirect. The frontend captures it once and posts it here; it is stored
// encrypted in public.user_github_tokens (service role only) and every GitHub
// API call is proxied by these endpoints. The raw token is NEVER included in
// any response, log line, or browser-visible storage.

const GITHUB_API = 'https://api.github.com';
const GITHUB_MAX_VERIFY_FILES = 200;
const GITHUB_VERIFY_CONCURRENCY = 6;
const GITHUB_REPO_FULL_NAME_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/;

/**
 * Key for encrypting GitHub tokens at rest (AES-256-GCM).
 * Prefer a dedicated GITHUB_TOKEN_ENCRYPTION_KEY; otherwise derive one from
 * the server-only service role key so tokens are still encrypted at rest
 * without extra configuration. Both inputs never reach the browser.
 */
let githubTokenKey: Buffer | null = null;
function getGitHubTokenKey(): Buffer | null {
  if (githubTokenKey) return githubTokenKey;
  const explicit = (process.env.GITHUB_TOKEN_ENCRYPTION_KEY || '').trim();
  if (explicit) {
    if (/^[0-9a-f]{64}$/i.test(explicit)) {
      githubTokenKey = Buffer.from(explicit, 'hex');
    } else {
      const decoded = Buffer.from(explicit, 'base64');
      githubTokenKey = decoded.length === 32 ? decoded : crypto.createHash('sha256').update(explicit).digest();
    }
    return githubTokenKey;
  }
  if (supabaseServiceRoleKey) {
    githubTokenKey = crypto.scryptSync(supabaseServiceRoleKey, 'context-pilot/github-token/v1', 32);
    return githubTokenKey;
  }
  return null;
}

function encryptGitHubToken(token: string): string | null {
  const key = getGitHubTokenKey();
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${tag.toString('base64url')}`;
}

function decryptGitHubToken(envelope: string): string | null {
  const key = getGitHubTokenKey();
  if (!key || typeof envelope !== 'string') return null;
  try {
    const [version, ivPart, dataPart, tagPart] = envelope.split('.');
    if (version !== 'v1' || !ivPart || !dataPart || !tagPart) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64url')), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    // Wrong key (rotation) or tampered ciphertext: treat as disconnected.
    return null;
  }
}

interface StoredGitHubConnection {
  token: string;
  login: string | null;
  avatarUrl: string | null;
  scopes: string[];
  connectedAt: string | null;
}

/** Loads and decrypts the caller's stored GitHub connection, if any. */
async function getStoredGitHubConnection(userEmail: string): Promise<StoredGitHubConnection | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('user_github_tokens')
    .select('token_encrypted, github_login, github_avatar_url, scopes, created_at')
    .eq('user_email', userEmail)
    .maybeSingle();

  if (error) {
    console.warn('[GitHub Connection Lookup Warning]:', error.message);
    return null;
  }
  if (!data) return null;

  const token = decryptGitHubToken(data.token_encrypted);
  if (!token) {
    // Undecryptable (key rotation or corruption): drop it so the UI asks for
    // a fresh connection instead of failing every call.
    await supabaseAdmin.from('user_github_tokens').delete().eq('user_email', userEmail);
    return null;
  }

  return {
    token,
    login: data.github_login || null,
    avatarUrl: data.github_avatar_url || null,
    scopes: Array.isArray(data.scopes) ? data.scopes : [],
    connectedAt: data.created_at || null,
  };
}

async function deleteStoredGitHubConnection(userEmail: string): Promise<void> {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin.from('user_github_tokens').delete().eq('user_email', userEmail);
  if (error) console.warn('[GitHub Connection Delete Warning]:', error.message);
}

/** Server-side GitHub REST call using the stored token. */
async function githubApiFetch(token: string, path: string): Promise<Response> {
  return fetch(`${GITHUB_API}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'context-pilot',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
}

/** Maps an upstream GitHub failure to a safe client response. */
async function githubUpstreamError(res: Response, userEmail: string, action: string): Promise<{ status: number; body: Record<string, unknown> }> {
  if (res.status === 401) {
    // Revoked or expired authorization: forget it so the UI offers reconnect.
    await deleteStoredGitHubConnection(userEmail);
    return {
      status: 401,
      body: { error: 'Your GitHub authorization has expired. Reconnect GitHub to continue.', code: 'github_reconnect_required' },
    };
  }

  const rateLimited = res.status === 429 || (res.status === 403 && res.headers.get('x-ratelimit-remaining') === '0');
  if (rateLimited) {
    const resetAt = Number(res.headers.get('x-ratelimit-reset'));
    const when = Number.isFinite(resetAt) && resetAt > 0
      ? ` Try again after ${new Date(resetAt * 1000).toISOString()}.`
      : ' Please try again in a few minutes.';
    return { status: 429, body: { error: `GitHub API rate limit reached.${when}`, code: 'github_rate_limited' } };
  }

  let detail = '';
  try {
    const body = await res.json();
    if (typeof body?.message === 'string') detail = body.message;
  } catch {
    // Non-JSON error body
  }
  return {
    status: 502,
    body: { error: `GitHub could not ${action} (HTTP ${res.status}${detail ? `: ${detail}` : ''}).` },
  };
}

// POST /api/user/github-token - Capture the OAuth provider token once.
// Body: { providerToken: string }. Response carries connection status only.
app.post('/api/user/github-token', authenticateUser, async (req: express.Request, res: express.Response) => {
  const userEmail = (req as any).userEmail as string;
  const authUserId = (req as any).authUserId as string;

  const providerToken = typeof req.body?.providerToken === 'string' ? req.body.providerToken.trim() : '';
  if (!providerToken || providerToken.length > 512 || /\s/.test(providerToken)) {
    return res.status(400).json({ error: 'A valid GitHub provider token is required.' });
  }

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'The database service is not configured on the server.' });
  }
  const encrypted = encryptGitHubToken(providerToken);
  if (!encrypted) {
    return res.status(503).json({ error: 'GitHub token storage is not configured on the server.' });
  }

  try {
    // Validate the token against GitHub and capture account details + scopes.
    let githubUserId: number | null = null;
    let githubLogin: string | null = null;
    let githubAvatarUrl: string | null = null;
    let scopes: string[] = [];

    let validation: Response;
    try {
      validation = await githubApiFetch(providerToken, '/user');
    } catch (err) {
      console.warn('[GitHub Token Validation Warning]: network error');
      return res.status(502).json({ error: 'Could not reach GitHub to validate the connection. Please try again.' });
    }

    if (validation.status === 401) {
      return res.status(400).json({ error: 'GitHub rejected this token. Please reconnect GitHub.' });
    }

    if (validation.ok) {
      const profile = await validation.json();
      githubUserId = typeof profile?.id === 'number' ? profile.id : null;
      githubLogin = typeof profile?.login === 'string' ? profile.login : null;
      githubAvatarUrl = typeof profile?.avatar_url === 'string' ? profile.avatar_url : null;
      const scopeHeader = validation.headers.get('x-oauth-scopes');
      if (scopeHeader !== null) {
        scopes = scopeHeader.split(',').map((s) => s.trim()).filter(Boolean);
      }
    } else {
      // Transient upstream problem (e.g. rate limit): the token came from
      // Supabase OAuth, so store it anyway; the next proxied call re-validates.
      console.warn(`[GitHub Token Validation Warning]: upstream HTTP ${validation.status}`);
    }

    await ensureUserProfile(userEmail, authUserId);

    // Upsert without created_at: the column default applies on first connect,
    // and ON CONFLICT only touches the payload columns, so the original
    // connected-at timestamp survives re-captures. Also safe under races.
    const { error } = await supabaseAdmin.from('user_github_tokens').upsert(
      {
        user_email: userEmail,
        auth_id: authUserId,
        github_user_id: githubUserId,
        github_login: githubLogin,
        github_avatar_url: githubAvatarUrl,
        token_encrypted: encrypted,
        scopes,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_email' }
    );

    if (error) {
      console.warn('[GitHub Token Store Warning]:', error.message);
      return res.status(500).json({ error: 'Failed to save the GitHub connection. Please try again.' });
    }

    // Never echo the token back.
    return res.json({ connected: true, login: githubLogin, avatarUrl: githubAvatarUrl, scopes });
  } catch (err) {
    console.error('GitHub token store error:', err);
    return res.status(500).json({ error: 'Failed to save the GitHub connection. Please try again.' });
  }
});

// GET /api/user/github-token - Connection status only (never the token).
app.get('/api/user/github-token', authenticateUser, async (req: express.Request, res: express.Response) => {
  const userEmail = (req as any).userEmail as string;

  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'The database service is not configured on the server.' });
  }

  try {
    const connection = await getStoredGitHubConnection(userEmail);
    if (!connection) {
      return res.json({ connected: false, login: null, avatarUrl: null, scopes: [] });
    }
    return res.json({
      connected: true,
      login: connection.login,
      avatarUrl: connection.avatarUrl,
      scopes: connection.scopes,
      connectedAt: connection.connectedAt,
    });
  } catch (err) {
    console.error('GitHub connection status error:', err);
    return res.status(500).json({ error: 'Failed to read the GitHub connection status.' });
  }
});

// DELETE /api/user/github-token - Disconnect (removes the stored token).
app.delete('/api/user/github-token', authenticateUser, async (req: express.Request, res: express.Response) => {
  const userEmail = (req as any).userEmail as string;
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'The database service is not configured on the server.' });
  }
  try {
    await deleteStoredGitHubConnection(userEmail);
    return res.json({ connected: false });
  } catch (err) {
    console.error('GitHub disconnect error:', err);
    return res.status(500).json({ error: 'Failed to disconnect GitHub.' });
  }
});

// GET /api/github/repos - List the connected account's repositories.
app.get('/api/github/repos', authenticateUser, async (req: express.Request, res: express.Response) => {
  const userEmail = (req as any).userEmail as string;
  const connection = await getStoredGitHubConnection(userEmail);
  if (!connection) {
    return res.status(404).json({ error: 'No GitHub account is connected. Connect GitHub to continue.', code: 'github_not_connected' });
  }

  try {
    const byFullName = new Map<string, any>();
    let scopes: string[] | null = null;
    let truncated = false;
    const perPage = 100;
    const maxPages = 5;

    for (let page = 1; page <= maxPages; page += 1) {
      const upstream = await githubApiFetch(connection.token, `/user/repos?sort=updated&per_page=${perPage}&page=${page}`);
      if (!upstream.ok) {
        const failure = await githubUpstreamError(upstream, userEmail, 'list your repositories');
        return res.status(failure.status).json(failure.body);
      }

      if (page === 1) {
        const scopeHeader = upstream.headers.get('x-oauth-scopes');
        if (scopeHeader !== null) {
          scopes = scopeHeader.split(',').map((s) => s.trim()).filter(Boolean);
        }
      }

      const batch = await upstream.json();
      if (!Array.isArray(batch)) break;
      for (const raw of batch) {
        if (!raw || typeof raw.full_name !== 'string' || !raw.full_name.includes('/')) continue;
        const key = raw.full_name.toLowerCase();
        if (byFullName.has(key)) continue;
        byFullName.set(key, {
          id: typeof raw.id === 'number' ? raw.id : 0,
          fullName: raw.full_name,
          name: typeof raw.name === 'string' ? raw.name : raw.full_name.split('/')[1],
          owner: typeof raw.owner?.login === 'string' ? raw.owner.login : raw.full_name.split('/')[0],
          isPrivate: Boolean(raw.private),
          defaultBranch: typeof raw.default_branch === 'string' && raw.default_branch ? raw.default_branch : 'main',
          description: typeof raw.description === 'string' ? raw.description : '',
          language: typeof raw.language === 'string' ? raw.language : '',
          updatedAt: raw.pushed_at || raw.updated_at || '',
          archived: Boolean(raw.archived),
          fork: Boolean(raw.fork),
        });
      }

      const link = upstream.headers.get('link');
      const hasNextPage = link !== null ? /rel="next"/.test(link) : batch.length === perPage;
      if (!hasNextPage) break;
      if (page === maxPages) truncated = true;
    }

    return res.json({ repos: Array.from(byFullName.values()), truncated, scopes: scopes ?? connection.scopes });
  } catch (err) {
    console.error('GitHub repos proxy error:', err);
    return res.status(502).json({ error: 'Could not reach GitHub to list your repositories. Please try again.' });
  }
});

// POST /api/github/verify - Verify file paths (and repo structure) server-side.
// Body: { repo: "owner/repo", branch?: string, files: string[] }
app.post('/api/github/verify', authenticateUser, async (req: express.Request, res: express.Response) => {
  const userEmail = (req as any).userEmail as string;

  const repo = typeof req.body?.repo === 'string' ? req.body.repo.trim().replace(/^\/+|\/+$/g, '') : '';
  const branch = typeof req.body?.branch === 'string' && req.body.branch.trim() ? req.body.branch.trim() : 'main';
  const files: string[] = Array.isArray(req.body?.files)
    ? req.body.files.filter((f: unknown): f is string => typeof f === 'string').map((f: string) => f.trim()).filter(Boolean)
    : [];

  if (!repo || !GITHUB_REPO_FULL_NAME_RE.test(repo) || /\/\.{1,2}$/.test(repo)) {
    return res.status(400).json({ error: 'Invalid repository. Use the owner/repo format (e.g. facebook/react).' });
  }
  if (branch.length > 255 || /[\u0000-\u001f\u007f]/.test(branch)) {
    return res.status(400).json({ error: 'Invalid branch name.' });
  }
  if (files.length === 0) {
    return res.status(400).json({ error: 'Please enter at least one file path to verify.' });
  }
  if (files.length > GITHUB_MAX_VERIFY_FILES) {
    return res.status(400).json({ error: `Too many file paths. Verify at most ${GITHUB_MAX_VERIFY_FILES} files at a time.` });
  }

  const connection = await getStoredGitHubConnection(userEmail);
  if (!connection) {
    return res.status(404).json({ error: 'No GitHub account is connected. Connect GitHub to continue.', code: 'github_not_connected' });
  }

  const [owner, repoName] = repo.split('/');
  const encodedRepo = `${encodeURIComponent(owner)}/${encodeURIComponent(repoName)}`;
  const encodedBranch = encodeURIComponent(branch);

  try {
    // Rate limit snapshot (best effort, mirrors the previous client behavior).
    let rateLimitRemaining: number | undefined;
    try {
      const rateRes = await githubApiFetch(connection.token, '/rate_limit');
      if (rateRes.ok) {
        const rateData = await rateRes.json();
        rateLimitRemaining = rateData.resources?.core?.remaining;
      }
    } catch {
      // ignore
    }

    const verifiedFiles: any[] = [];
    const missingFiles: any[] = [];
    let authExpired = false;

    const cleanPaths = Array.from(new Set(
      files.map((f) => f.replace(/^\/+/, '').replace(/\/+$/, '')).filter(Boolean)
    ));

    // Bounded concurrency keeps large lists fast without hammering GitHub.
    let cursor = 0;
    async function worker() {
      while (cursor < cleanPaths.length && !authExpired) {
        const cleanPath = cleanPaths[cursor++];
        const encodedPath = cleanPath
          .split('/')
          .filter((segment) => segment.length > 0)
          .map((segment) => encodeURIComponent(segment))
          .join('/');
        if (!encodedPath) continue;

        try {
          const upstream = await githubApiFetch(
            connection!.token,
            `/repos/${encodedRepo}/contents/${encodedPath}?ref=${encodedBranch}`
          );

          if (upstream.ok) {
            const data = await upstream.json();
            verifiedFiles.push({
              path: cleanPath,
              exists: true,
              url: data.html_url || `https://github.com/${repo}/blob/${encodedBranch}/${encodedPath}`,
              size: data.size,
              last_modified: new Date().toISOString(),
            });
          } else if (upstream.status === 401) {
            authExpired = true;
          } else if (upstream.status === 404) {
            missingFiles.push({
              path: cleanPath,
              exists: false,
              reason: `File not found in branch "${branch}"`,
              suggestions: generateFileSuggestions(cleanPath),
            });
          } else if (upstream.status === 403 || upstream.status === 429) {
            missingFiles.push({
              path: cleanPath,
              exists: false,
              reason: 'GitHub API rate limit exceeded or access forbidden',
            });
          } else {
            missingFiles.push({
              path: cleanPath,
              exists: false,
              reason: `GitHub API error (HTTP ${upstream.status})`,
            });
          }
        } catch {
          missingFiles.push({
            path: cleanPath,
            exists: false,
            reason: 'Network error verifying file. Please try again.',
            suggestions: generateFileSuggestions(cleanPath),
          });
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(GITHUB_VERIFY_CONCURRENCY, cleanPaths.length) }, () => worker())
    );

    if (authExpired) {
      await deleteStoredGitHubConnection(userEmail);
      return res.status(401).json({
        error: 'Your GitHub authorization has expired. Reconnect GitHub to continue.',
        code: 'github_reconnect_required',
      });
    }

    // Repository structure snapshot (root contents), best effort.
    const commonFiles = [
      'package.json', 'tsconfig.json', 'requirements.txt', 'Dockerfile',
      'docker-compose.yml', 'pom.xml', 'go.mod', 'Cargo.toml', 'README.md',
    ];
    const detectedFiles: string[] = [];
    try {
      const structureRes = await githubApiFetch(connection.token, `/repos/${encodedRepo}/contents?ref=${encodedBranch}`);
      if (structureRes.ok) {
        const contents = await structureRes.json();
        if (Array.isArray(contents)) {
          const names = new Set(contents.map((item: any) => item.name));
          for (const cf of commonFiles) {
            if (names.has(cf)) detectedFiles.push(cf);
          }
        }
      }
    } catch {
      // Structure is supplementary; verification results still stand.
    }

    const hasPackageJson = detectedFiles.includes('package.json');
    const hasPythonOrJava =
      detectedFiles.includes('requirements.txt') ||
      detectedFiles.includes('pom.xml') ||
      detectedFiles.includes('go.mod');
    const hasDocker = detectedFiles.includes('Dockerfile') || detectedFiles.includes('docker-compose.yml');

    const total = verifiedFiles.length + missingFiles.length;
    const verificationRate = total > 0 ? verifiedFiles.length / total : 0;

    // Preserve input ordering for a stable, readable result list.
    const order = new Map(cleanPaths.map((p, i) => [p, i]));
    verifiedFiles.sort((a, b) => (order.get(a.path) ?? 0) - (order.get(b.path) ?? 0));
    missingFiles.sort((a, b) => (order.get(a.path) ?? 0) - (order.get(b.path) ?? 0));

    return res.json({
      verification: {
        repoName: repo,
        branch,
        verifiedFiles,
        missingFiles,
        verificationRate: Math.round(verificationRate * 100) / 100,
        totalChecked: total,
        rateLimitRemaining: rateLimitRemaining ?? 60,
        checkedAt: new Date().toISOString(),
      },
      structure: {
        likelyFrontend: hasPackageJson,
        likelyBackend: hasPythonOrJava || (hasPackageJson && hasDocker),
        likelyFullstack: hasPackageJson && (hasPythonOrJava || hasDocker),
        detectedFiles,
      },
    });
  } catch (err) {
    console.error('GitHub verify proxy error:', err);
    return res.status(502).json({ error: 'Could not reach GitHub to verify files. Please try again.' });
  }
});

function generateFileSuggestions(filePath: string): string[] {
  const parts = filePath.split('/');
  const filename = parts[parts.length - 1];
  const commonDirs = ['src', 'app', 'components', 'pages', 'api', 'services', 'models', 'utils'];
  return commonDirs
    .slice(0, 3)
    .map((dir) => `${dir}/${filename}`)
    .filter((s) => s !== filePath);
}

// ==========================================
// Audit History Deletion Endpoints
// ==========================================

// DELETE /api/history/:id - Delete a single analysis record belonging to the authenticated user
app.delete('/api/history/:id', authenticateUser, async (req: express.Request, res: express.Response) => {
  try {
    const userEmail = (req as any).userEmail;
    const recordId = req.params.id as string;

    if (!recordId) {
      return res.status(400).json({ error: 'Missing record ID parameter.' });
    }

    if (supabaseAdmin) {
      // First verify record belongs to this user
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from('analysis_history')
        .select('id, user_email')
        .eq('id', recordId)
        .maybeSingle();

      if (fetchErr) {
        console.warn('[History Delete Warning]:', fetchErr);
      }

      if (existing) {
        if (existing.user_email && existing.user_email.toLowerCase() !== userEmail.toLowerCase()) {
          return res.status(403).json({ error: 'Forbidden: You can only delete your own analysis records.' });
        }

        const { error: deleteErr } = await supabaseAdmin
          .from('analysis_history')
          .delete()
          .eq('id', recordId)
          .eq('user_email', userEmail);

        if (deleteErr) {
          return res.status(500).json({ error: deleteErr.message || 'Failed to delete the record from the database.' });
        }
      } else {
        // Fallback delete by ticket key when the client did not have a database UUID.
        const decodedId = decodeURIComponent(recordId);
        const idColumn = UUID_RE.test(decodedId) ? 'id' : 'ticket_key';
        await supabaseAdmin
          .from('analysis_history')
          .delete()
          .eq('user_email', userEmail)
          .eq(idColumn, decodedId);
      }
    }

    return res.json({ success: true, message: 'Analysis record deleted successfully.' });
  } catch (err: any) {
    console.error('Delete history error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to delete record' });
  }
});

// DELETE /api/history - Clear all analysis history for the authenticated user
app.delete('/api/history', authenticateUser, async (req: express.Request, res: express.Response) => {
  try {
    const userEmail = (req as any).userEmail;

    if (supabaseAdmin) {
      const { error: deleteErr } = await supabaseAdmin
        .from('analysis_history')
        .delete()
        .eq('user_email', userEmail);

      if (deleteErr) {
        return res.status(500).json({ error: deleteErr.message || 'Failed to clear records from the database.' });
      }
    }

    return res.json({ success: true, message: 'All analysis history cleared successfully.' });
  } catch (err: any) {
    console.error('Clear history error:', err);
    return res.status(500).json({ error: err?.message || 'Failed to clear analysis history' });
  }
});

// Admin: Delete any analysis record by ID
app.delete('/api/admin/history/:id', requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const recordId = req.params.id as string;
    if (supabaseAdmin) {
      await supabaseAdmin.from('analysis_history').delete().eq('id', recordId);
    }
    return res.json({ success: true, message: 'Analysis record deleted by administrator.' });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to delete record' });
  }
});

// Admin: Delete all analysis records for a specific user email
app.delete('/api/admin/history/user/:email', requireAdmin, async (req: express.Request, res: express.Response) => {
  try {
    const targetEmail = (req.params.email as string)?.toLowerCase()?.trim();
    if (supabaseAdmin && targetEmail) {
      await supabaseAdmin.from('analysis_history').delete().eq('user_email', targetEmail);
    }
    return res.json({ success: true, message: `All analysis records for ${targetEmail} deleted by administrator.` });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Failed to delete user records' });
  }
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'healthy',
    service: 'Context Pilot API',
    timestamp: new Date().toISOString(),
    environment: process.env.VERCEL ? 'vercel' : process.env.NODE_ENV || 'development',
    integrations: {
      supabase: Boolean(supabaseUrl && supabaseServiceRoleKey),
      supabaseServiceRole: Boolean(supabaseServiceRoleKey),
      supabaseUrlConfigured: Boolean(supabaseUrl),
      gemini: Boolean((process.env.GEMINI_API_KEY || '').trim()),
      geminiModel: GEMINI_MODEL,
      paystack: Boolean(process.env.PAYSTACK_SECRET_KEY),
      adminEmailConfigured: Boolean(process.env.ADMIN_EMAIL),
    },
  });
});

// Supabase integration status endpoint
app.get('/api/supabase/status', (_req, res) => {
  res.json({
    configured: Boolean(supabaseServer),
    hasUrl: Boolean(process.env.SUPABASE_URL),
    hasServiceKey: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
  });
});

// Supabase schema/database reachability check (used to validate a fresh deployment).
// Uses direct PostgREST reads so missing tables and missing GRANTs are reported
// separately (supabase-js surfaces permission errors without a message).
app.get('/api/supabase/health', async (_req, res) => {
  const tables = [
    'users',
    'user_usage',
    'analysis_history',
    'feedback',
    'promo_codes',
    'transactions',
    'system_settings',
    'user_github_tokens',
  ];

  if (!supabaseAdmin) {
    return res.status(503).json({
      configured: false,
      error: 'Supabase service role client is not configured on the server.',
    });
  }

  const baseUrl = supabaseUrl.replace(/\/$/, '');
  const key = supabaseServiceRoleKey;

  const results: Record<string, string> = {};
  for (const table of tables) {
    try {
      const response = await fetch(`${baseUrl}/rest/v1/${table}?select=*&limit=1`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (response.ok) {
        results[table] = 'ok';
        continue;
      }
      const body = await response.text();
      let parsed: any = null;
      try {
        parsed = JSON.parse(body);
      } catch {
        // non-JSON error body
      }
      results[table] = `HTTP ${response.status} ${parsed?.code || ''} ${parsed?.message || body.slice(0, 120)}`.trim();
    } catch (err: any) {
      results[table] = `network error: ${err?.name || 'Error'} ${err?.message || ''}`.trim();
    }
  }

  const healthy = Object.values(results).every((value) => value === 'ok');
  const permissionDenied = Object.values(results).some((value) => value.includes('42501'));

  return res.status(healthy ? 200 : 500).json({
    configured: true,
    healthy,
    tables: results,
    hint: healthy
      ? 'All required tables are readable with the service role key.'
      : permissionDenied
      ? 'Tables exist but the service_role role lacks privileges. Run supabase/grants.sql in the Supabase SQL editor.'
      : 'Run supabase/schema.sql in the Supabase SQL editor to create the missing tables.',
  });
});

// Supabase password reset endpoint
app.post('/api/auth/reset-password', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' });
  }

  if (supabaseServer) {
    try {
      const { error } = await supabaseServer.auth.resetPasswordForEmail(email, {
        redirectTo: process.env.APP_URL
          ? `${process.env.APP_URL.replace(/\/$/, '')}/#reset-password`
          : `${req.protocol}://${req.get('host')}/#reset-password`,
      });
      if (error) {
        return res.status(400).json({ error: error.message });
      }
      return res.json({ success: true, message: 'Password reset link sent successfully.' });
    } catch (e: any) {
      return res.status(500).json({ error: e?.message || 'Failed to dispatch reset email' });
    }
  }

  return res.status(503).json({
    error: 'Authentication service is currently unavailable. Please try again later.',
  });
});

// API 404 guard so unknown API routes never fall through to the SPA shell.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'API endpoint not found.' });
});

// Central error handler (keeps stack traces out of API responses).
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Unhandled API Error]:', err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'Unexpected server error. Please try again.' });
});

const isProd = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const isServerless = Boolean(process.env.VERCEL);

async function startServer() {
  if (isServerless) {
    // On Vercel the platform invokes the exported handler; static assets come
    // from the build output, so no dev middleware or listener is needed.
    return;
  }

  if (!isProd) {
    // Imported lazily so serverless bundles never pull in Vite.
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, host: '0.0.0.0' },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const { build: buildVite } = await import('vite');
    const distPath = path.resolve(__dirname, 'dist');
    const indexHtmlPath = path.resolve(distPath, 'index.html');

    if (!fs.existsSync(indexHtmlPath)) {
      console.log('dist/index.html not found! Triggering automatic frontend Vite build...');
      try {
        await buildVite();
        console.log('Frontend built successfully!');
      } catch (buildErr) {
        console.error('Frontend build failed:', buildErr);
      }
    }

    app.use(express.static(distPath));
    app.use((_req, res) => {
      if (fs.existsSync(indexHtmlPath)) {
        res.sendFile(indexHtmlPath);
      } else {
        res.status(500).send('Frontend build was not found. Please verify build commands.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Context Pilot Server listening on port ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Context Pilot server:', err);
});

export default app;
