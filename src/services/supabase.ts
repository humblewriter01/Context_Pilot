import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Reads from Vite client-side environment or window runtime config
const supabaseUrl =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_URL) ||
  (typeof process !== 'undefined' && process.env?.SUPABASE_URL) ||
  (typeof window !== 'undefined' && (window as any).__SUPABASE_URL__) ||
  '';

const supabaseAnonKey =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_SUPABASE_ANON_KEY) ||
  (typeof process !== 'undefined' && process.env?.SUPABASE_ANON_KEY) ||
  (typeof window !== 'undefined' && (window as any).__SUPABASE_ANON_KEY__) ||
  '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export async function resetPasswordForEmail(email: string, redirectTo?: string) {
  const dynamicRedirect = redirectTo || `${window.location.origin}/#reset-password`;
  if (supabase) {
    return await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: dynamicRedirect,
    });
  }

  // Fallback to server-side endpoint if keys are stored in server env
  const res = await fetch('/api/auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, redirectTo: dynamicRedirect }),
  });

  const data = await res.json();
  if (!res.ok) {
    return { data: null, error: new Error(data.error || 'Failed to send reset email') };
  }
  return { data, error: null };
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
