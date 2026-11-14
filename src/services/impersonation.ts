/**
 * Impersonation session marker.
 *
 * When an administrator clicks "Impersonate" in the User Directory, the backend
 * mints a single-use magic-link sign-in for the target user and the link opens in
 * a new tab. This module records WHOSE account is being impersonated in the
 * browser so the app can render a persistent "You are viewing as …" banner with a
 * one-click way to stop. The marker is cleared on explicit stop, on sign-out, and
 * whenever the app observes a SIGNED_OUT event.
 */
const IMPERSONATION_STORAGE_KEY = 'context_pilot_impersonation';

export interface ImpersonationInfo {
  email: string;
  startedAt: string;
}

export function startImpersonation(email: string): ImpersonationInfo | null {
  const info: ImpersonationInfo = {
    email: email.trim().toLowerCase(),
    startedAt: new Date().toISOString(),
  };
  try {
    localStorage.setItem(IMPERSONATION_STORAGE_KEY, JSON.stringify(info));
  } catch {
    return null;
  }
  return info;
}

export function getImpersonation(): ImpersonationInfo | null {
  try {
    const raw = localStorage.getItem(IMPERSONATION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.email !== 'string' || !parsed.email.trim()) return null;
    return {
      email: String(parsed.email).trim().toLowerCase(),
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function stopImpersonation(): void {
  try {
    localStorage.removeItem(IMPERSONATION_STORAGE_KEY);
  } catch {
    // storage unavailable — nothing to clear
  }
}
