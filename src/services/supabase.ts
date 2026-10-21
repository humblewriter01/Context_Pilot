import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Reads from Vite client-side environment or window runtime config
let clientUrl =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env?.SUPABASE_URL) ||
  (typeof window !== 'undefined' && (window as any).__SUPABASE_URL__) ||
  '';

let clientAnonKey =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && process.env?.SUPABASE_ANON_KEY) ||
  (typeof window !== 'undefined' && (window as any).__SUPABASE_ANON_KEY__) ||
  '';

export let isSupabaseConfigured = Boolean(clientUrl && clientAnonKey);

export let supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(clientUrl, clientAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

/**
 * Initializes or retrieves the official Supabase client.
 * If Vite environment variables were not baked in at build time,
 * it fetches the public credentials from /api/supabase/config on the server.
 */
export async function getOrInitSupabase(): Promise<SupabaseClient | null> {
  if (supabase) return supabase;

  try {
    const res = await fetch('/api/supabase/config');
    if (res.ok) {
      const data = await res.json();
      if (data.url && data.anonKey) {
        clientUrl = data.url;
        clientAnonKey = data.anonKey;
        isSupabaseConfigured = true;
        supabase = createClient(clientUrl, clientAnonKey, {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true,
          },
        });
        return supabase;
      }
    }
  } catch (err) {
    console.warn('[Supabase Config] Error fetching server credentials:', err);
  }

  return supabase;
}

/**
 * Enforces real authentication against Supabase via signInWithPassword.
 * Returns the session and user, or throws the exact error.
 */
export async function signInWithEmailPassword(email: string, password: string) {
  const client = await getOrInitSupabase();
  if (!client) {
    throw new Error('Supabase is not configured. Please ensure SUPABASE_URL and SUPABASE_ANON_KEY are set.');
  }

  const { data, error } = await client.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Enforces real user registration against Supabase via signUp.
 * Returns the user/session or throws error.
 */
export async function signUpWithEmailPassword(email: string, password: string, displayName: string) {
  const client = await getOrInitSupabase();
  if (!client) {
    throw new Error('Supabase is not configured. Please ensure SUPABASE_URL and SUPABASE_ANON_KEY are set.');
  }

  const { data, error } = await client.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      data: {
        display_name: displayName.trim(),
        full_name: displayName.trim(),
      },
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Initiates GitHub OAuth authentication via Supabase.
 */
export async function signInWithGitHub(redirectTo?: string) {
  const client = await getOrInitSupabase();
  if (!client) {
    throw new Error('Supabase is not configured. Please ensure SUPABASE_URL and SUPABASE_ANON_KEY are set.');
  }

  const dynamicRedirect = redirectTo || window.location.origin;
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo: dynamicRedirect,
    },
  });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Sends a real password reset link via Supabase with dynamic redirectTo.
 */
export async function resetPasswordForEmail(email: string, redirectTo?: string) {
  const dynamicRedirect = redirectTo || `${window.location.origin}/#reset-password`;
  const client = await getOrInitSupabase();

  if (client) {
    return await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: dynamicRedirect,
    });
  }

  // Fallback to server-side endpoint if running in backend mode
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), redirectTo: dynamicRedirect }),
  });

  const data = await res.json();
  if (!res.ok) {
    return { data: null, error: new Error(data.error || 'Failed to send reset email') };
  }
  return { data, error: null };
}

/**
 * Signs the user out strictly via Supabase.
 */
export async function signOut() {
  const client = await getOrInitSupabase();
  if (client) {
    await client.auth.signOut();
  }
}

/**
 * Checks for an active, valid Supabase session on app load.
 */
export async function getSession() {
  const client = await getOrInitSupabase();
  if (!client) return null;
  const { data, error } = await client.auth.getSession();
  if (error || !data.session) return null;
  return data.session;
}

export interface SupabaseUserProfile {
  id: string;
  email: string;
  display_name: string;
  photo_url?: string;
  subscription_tier: 'free' | 'pro' | 'enterprise';
  created_at: string;
  last_login_at: string;
  status: 'active' | 'suspended';
}

export interface SupabaseAnalysisRecord {
  id?: string;
  user_email: string;
  ticket_key: string;
  ticket_title: string;
  reasoning: string;
  frontend_files: string[];
  backend_files: string[];
  database_files: string[];
  config_files: string[];
  test_files: string[];
  apis: string[];
  confidence_score: number;
  total_files: number;
  processing_time_ms?: number;
  created_at?: string;
}

export interface SupabaseFeedbackRecord {
  id?: string;
  analysis_id?: string;
  ticket_key: string;
  user_email: string;
  was_accurate: boolean;
  actual_files?: string[];
  comments?: string;
  rating?: number;
  created_at?: string;
}
