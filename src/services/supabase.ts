import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Reads directly from Vite client environment variables
const envUrl = ((import.meta as any).env?.VITE_SUPABASE_URL as string) || '';
const envAnonKey = ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string) || '';

let clientUrl = envUrl;
let clientAnonKey = envAnonKey;

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
 * If Vite environment variables were not baked into the client bundle at build time,
 * checks /api/supabase/config to retrieve runtime environment variables provided by the server.
 */
export async function getOrInitSupabase(): Promise<SupabaseClient | null> {
  if (supabase) return supabase;

  // Check if client env vars are available
  if (envUrl && envAnonKey) {
    clientUrl = envUrl;
    clientAnonKey = envAnonKey;
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

  // Fallback: check server environment variables exposed via /api/supabase/config
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
    console.warn('[Supabase Init] Notice checking server config:', err);
  }

  return null;
}

/**
 * Strictly authenticates user via Supabase Auth (signInWithPassword).
 */
export async function signInWithEmailPassword(email: string, password: string) {
  const client = await getOrInitSupabase();
  if (!client) {
    throw new Error('Authentication is currently unavailable. Please check server configuration.');
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
 * Strictly registers a new user via Supabase Auth (signUp).
 */
export async function signUpWithEmailPassword(email: string, password: string, displayName: string) {
  const client = await getOrInitSupabase();
  if (!client) {
    throw new Error('Authentication is currently unavailable. Please check server configuration.');
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
    throw new Error('Authentication is currently unavailable. Please check server configuration.');
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
 * Sends a password reset link strictly via Supabase.
 */
export async function resetPasswordForEmail(email: string, redirectTo?: string) {
  const client = await getOrInitSupabase();
  if (!client) {
    return {
      data: null,
      error: new Error('Authentication is currently unavailable. Please check server configuration.'),
    };
  }

  const dynamicRedirect = redirectTo || `${window.location.origin}/#reset-password`;
  return await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: dynamicRedirect,
  });
}

/**
 * Signs the user out strictly via Supabase.
 */
export async function signOut() {
  const client = await getOrInitSupabase();
  if (client) {
    try {
      await client.auth.signOut();
    } catch {
      // ignore
    }
  }
}

/**
 * Verifies active session strictly via Supabase (getSession).
 */
export async function getSession() {
  const client = await getOrInitSupabase();
  if (!client) return null;

  try {
    const { data, error } = await client.auth.getSession();
    if (error || !data.session) return null;
    return data.session;
  } catch {
    return null;
  }
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
