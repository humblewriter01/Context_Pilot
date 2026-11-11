/**
 * Turns raw authentication failures into copy that is safe to show to end users.
 *
 * Two guarantees live here so every sign-in surface behaves the same way:
 *   1. A sign-up for an address that is already registered always produces the
 *      same, explicit message (see EMAIL_ALREADY_EXISTS_MESSAGE).
 *   2. Infrastructure details (vendor names, database errors) never reach the UI.
 */

export const EMAIL_ALREADY_EXISTS_MESSAGE =
  'An account with this email already exists. Please sign in using your original method.';

export const AUTH_UNAVAILABLE_MESSAGE =
  'Sign-in is temporarily unavailable. Please try again in a moment.';

const NETWORK_ERROR_MESSAGE =
  'Unable to reach the sign-in service. Check your connection and try again.';

/** Error codes the auth API uses when an address is already taken. */
const DUPLICATE_EMAIL_CODES = new Set(['email_exists', 'user_already_exists']);

const DUPLICATE_EMAIL_PATTERNS: RegExp[] = [
  /user already registered/i,
  /(user|e-?mail|account|address)[^.]{0,60}already (exists|registered|been registered|in use|taken)/i,
  /multiple accounts with the same e-?mail/i,
];

/** Backend/vendor wording that must never be rendered verbatim. */
const INTERNAL_DETAIL_PATTERN = /supabase|gotrue|postgrest|postgres|database error|unexpected_failure/i;

const NETWORK_ERROR_PATTERN = /failed to fetch|networkerror|network request failed|load failed|fetch failed/i;

export class EmailAlreadyExistsError extends Error {
  readonly code = 'email_exists';

  constructor() {
    super(EMAIL_ALREADY_EXISTS_MESSAGE);
    this.name = 'EmailAlreadyExistsError';
  }
}

function readMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object') {
    const candidate = (err as { message?: unknown; error_description?: unknown });
    if (typeof candidate.message === 'string') return candidate.message;
    if (typeof candidate.error_description === 'string') return candidate.error_description;
  }
  return '';
}

function readCode(err: unknown): string {
  if (err && typeof err === 'object') {
    const candidate = err as { code?: unknown; error_code?: unknown };
    if (typeof candidate.code === 'string') return candidate.code;
    if (typeof candidate.error_code === 'string') return candidate.error_code;
  }
  return '';
}

/** True when the failure means "this email address already has an account". */
export function isEmailAlreadyExistsError(err: unknown): boolean {
  if (!err) return false;
  if (DUPLICATE_EMAIL_CODES.has(readCode(err))) return true;
  const message = readMessage(err);
  return Boolean(message) && DUPLICATE_EMAIL_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Sign-up responses hide whether an address is taken when e-mail confirmation is
 * required: instead of an error, the API returns a placeholder user that has no
 * identities, no session, and no e-mail is sent. Treat that as "already exists"
 * rather than telling the visitor to wait for a confirmation that never arrives.
 */
export function isObfuscatedExistingUser(data: {
  user?: { identities?: unknown[] | null } | null;
  session?: unknown;
} | null | undefined): boolean {
  const user = data?.user;
  if (!user || data?.session) return false;
  return Array.isArray(user.identities) && user.identities.length === 0;
}

/** Maps any authentication failure to a user-facing sentence. */
export function describeAuthError(err: unknown, fallback: string = AUTH_UNAVAILABLE_MESSAGE): string {
  if (isEmailAlreadyExistsError(err)) return EMAIL_ALREADY_EXISTS_MESSAGE;

  const message = readMessage(err).trim();
  if (!message) return fallback;
  if (NETWORK_ERROR_PATTERN.test(message)) return NETWORK_ERROR_MESSAGE;
  if (INTERNAL_DETAIL_PATTERN.test(message)) return fallback;
  return message;
}

const REDIRECT_ERROR_KEYS = ['error', 'error_code', 'error_description'];

function redirectParams(): URLSearchParams[] {
  if (typeof window === 'undefined') return [];
  const hash = window.location.hash.replace(/^#/, '');
  return [new URLSearchParams(window.location.search), new URLSearchParams(hash)];
}

/**
 * Reads a failed OAuth / e-mail-link redirect (`?error=…&error_description=…`,
 * also mirrored in the URL fragment) and returns a user-facing message.
 */
export function readAuthRedirectError(): string | null {
  for (const params of redirectParams()) {
    const description = params.get('error_description');
    const error = params.get('error');
    if (!description && !error) continue;

    if (error === 'access_denied' && !params.get('error_code') && /denied/i.test(description || '')) {
      return 'GitHub sign-in was cancelled. You can try again whenever you are ready.';
    }

    return describeAuthError(
      { message: description || '', code: params.get('error_code') || '' },
      'We could not complete your sign-in. Please try again.'
    );
  }
  return null;
}

/** Removes the failed-redirect parameters so a refresh does not replay the error. */
export function clearAuthRedirectError(): void {
  if (typeof window === 'undefined') return;

  const search = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const hashIsErrorPayload = hashParams.has('error') || hashParams.has('error_description');
  const searchHasError = REDIRECT_ERROR_KEYS.some((key) => search.has(key));
  if (!searchHasError && !hashIsErrorPayload) return;

  REDIRECT_ERROR_KEYS.forEach((key) => search.delete(key));
  const query = search.toString();
  const nextUrl =
    window.location.pathname + (query ? `?${query}` : '') + (hashIsErrorPayload ? '' : window.location.hash);
  window.history.replaceState(window.history.state, '', nextUrl);
}
