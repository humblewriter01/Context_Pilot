-- ===================================================================
-- Context Pilot — persistent GitHub OAuth connections
--
-- Why
--   Supabase only exposes session.provider_token in the moment right
--   after the GitHub OAuth redirect. A page refresh or a new sign-in
--   no longer carries it, so the Codebase Verifier used to lose the
--   connection and ask the user to reconnect every time.
--
--   The backend now captures that token once (POST /api/user/github-token),
--   stores it here ENCRYPTED (AES-256-GCM, server-side key), and makes every
--   GitHub API call itself. The raw token is never sent back to the browser.
--
--   This is a dedicated table instead of a column on public.users on
--   purpose: the browser role "authenticated" can SELECT its own row in
--   public.users, so a token column there would be readable through the
--   public data API. This table has no browser grants and no policies.
--
-- How to use
--   Existing project: run this file once in the SQL editor (Dashboard ->
--   SQL Editor -> Run). New project: supabase/schema.sql already creates
--   the table, so this file is not needed.
--   Safe to run multiple times.
-- ===================================================================

create table if not exists public.user_github_tokens (
  user_email text primary key references public.users(email) on delete cascade,
  auth_id uuid,
  github_user_id bigint,
  github_login text,
  github_avatar_url text,
  -- AES-256-GCM envelope: v1.<iv>.<ciphertext>.<authTag> (base64url parts).
  -- Never store or log the plaintext token.
  token_encrypted text not null,
  scopes text[] not null default '{}',
  created_at timestamp with time zone not null default timezone('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone('utc'::text, now())
);

comment on table public.user_github_tokens is
  'Encrypted GitHub OAuth tokens for the Codebase Verifier. Backend (service role) only; never exposed to browser roles or API responses.';

-- Row level security with no policies: even a mistaken GRANT below would
-- still return zero rows to the browser roles.
alter table public.user_github_tokens enable row level security;

-- Least privilege, matching the rest of the schema: the backend service
-- role gets full access, the browser roles get nothing at all.
revoke all on public.user_github_tokens from anon, authenticated;
grant all on public.user_github_tokens to service_role;

-- REVOKE only takes back grants made by the role that runs it (or by the
-- table owner). A privilege handed out some other way would stay in place
-- without an error, so check the result and stop loudly if that happened.
do $$
begin
  if has_table_privilege('anon', 'public.user_github_tokens', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     or has_table_privilege('authenticated', 'public.user_github_tokens', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     or has_any_column_privilege('anon', 'public.user_github_tokens', 'SELECT, INSERT, UPDATE, REFERENCES')
     or has_any_column_privilege('authenticated', 'public.user_github_tokens', 'SELECT, INSERT, UPDATE, REFERENCES') then
    raise exception 'public.user_github_tokens must not be readable or writable by a browser role. See who granted it with: select relacl from pg_class where oid = ''public.user_github_tokens''::regclass;';
  end if;
end
$$;
