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
 * Completes a password-recovery flow by setting a new password on the
 * authenticated recovery session.
 */
export async function updatePassword(newPassword: string) {
  const client = await getOrInitSupabase();
  if (!client) {
    throw new Error('Authentication is currently unavailable. Please check server configuration.');
  }

  const { data, error } = await client.auth.updateUser({ password: newPassword });
  if (error) throw error;
  return data;
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

export interface UserSyncSnapshot {
  email: string;
  displayName: string;
  photoUrl?: string;
  subscriptionTier: 'free' | 'pro' | 'enterprise';
  status: 'active' | 'suspended';
  usage: {
    monthYear: string;
    ticketsProcessed: number;
    monthlyLimit: number;
    remainingTickets: number;
  };
}

export interface RemoteAnalysisRecord {
  id: string;
  ticket_key: string;
  ticket_title: string;
  reasoning: string;
  frontend_files: string[];
  backend_files: string[];
  database_files: string[];
  config_files: string[];
  test_files: string[];
  apis?: string[];
  confidence_score: number;
  total_files: number;
  processing_time_ms?: number;
  created_at: string;
}

/**
 * Builds Authorization headers for authenticated backend calls from the active
 * Supabase session. Returns an empty object when no session exists.
 */
export async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  try {
    const session = await getSession();
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }
    if (session?.user?.email) {
      headers['x-user-email'] = session.user.email;
    }
  } catch {
    // Anonymous call
  }
  return headers;
}

/**
 * Loads the authoritative tier and monthly quota from the server (Supabase-backed).
 */
export async function fetchUserSync(): Promise<UserSyncSnapshot | null> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/user/sync', { headers });
    if (!res.ok) return null;
    return (await res.json()) as UserSyncSnapshot;
  } catch (e) {
    console.warn('Failed to sync user profile with server:', e);
    return null;
  }
}

/**
 * Loads the signed-in user's persisted analysis history from Supabase.
 */
export async function fetchAnalysisHistory(): Promise<RemoteAnalysisRecord[]> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch('/api/history', { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? (data as RemoteAnalysisRecord[]) : [];
  } catch (e) {
    console.warn('Failed to fetch analysis history:', e);
    return [];
  }
}

/**
 * Submits user feedback for an analysis directly to the backend /api/feedback,
 * which persists it into the Supabase public.feedback table.
 */
export async function submitUserFeedback(feedback: {
  analysisId?: string | number;
  ticketKey: string;
  wasAccurate: boolean;
  rating: number;
  comments?: string;
  actualFiles?: string[];
}): Promise<any> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(await getAuthHeaders()),
  };

  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      analysis_id: feedback.analysisId ? String(feedback.analysisId) : undefined,
      ticket_key: feedback.ticketKey,
      was_accurate: feedback.wasAccurate,
      rating: feedback.rating,
      comments: feedback.comments,
      actual_files: feedback.actualFiles || [],
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to submit feedback');
  }

  return await res.json();
}

/**
 * Fetches feedback records submitted by the authenticated user from public.feedback.
 */
export async function fetchUserFeedback(): Promise<SupabaseFeedbackRecord[]> {
  const headers = await getAuthHeaders();

  try {
    const res = await fetch('/api/feedback', { headers });
    if (!res.ok) {
      return [];
    }
    return await res.json();
  } catch (e) {
    console.warn('Failed to fetch user feedback:', e);
    return [];
  }
}
