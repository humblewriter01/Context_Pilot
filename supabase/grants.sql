-- ===================================================================
-- Context Pilot — Privilege Repair Script
--
-- Run this in Supabase Dashboard -> SQL Editor -> Run when
-- /api/supabase/health reports HTTP 403 / code 42501
-- ("permission denied for table ...").
--
-- Why is this needed?
--   * service_role bypasses Row Level Security, but it still needs table
--     level privileges. Tables created without grants (e.g. by a different
--     migration role) return 42501 for every API request.
--   * anon / authenticated (the browser roles) get the bare minimum: only
--     the privileges a row level security policy can actually use.
--
-- Safe to run multiple times.
-- ===================================================================

-- 1. Schema usage ---------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

-- 2. Full access for the backend service role ----------------------------
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

-- 3. Least privilege for the browser roles --------------------------------
-- anon = visitor without a session, authenticated = signed-in user. Start
-- from nothing (this also removes TRUNCATE, REFERENCES, TRIGGER and any write
-- access left over from platform defaults or earlier versions), then grant
-- only what a row level security policy can actually use.
revoke all on
  public.users, public.user_usage, public.analysis_history, public.feedback,
  public.transactions, public.promo_codes, public.system_settings
from anon, authenticated;

grant select on public.system_settings to anon, authenticated;    -- public prices (also the keep-alive ping)
grant select on public.users to authenticated;                     -- own profile
grant select, insert on public.analysis_history to authenticated;  -- own analyses
grant insert on public.feedback to authenticated;                  -- own feedback
grant select on public.transactions to authenticated;              -- own receipts
-- public.user_usage and public.promo_codes: backend only, no browser access.

-- 4. Future tables: the backend gets full access --------------------------
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- 5. Verify ---------------------------------------------------------------
-- Expect ALL privileges for service_role on every table, and for the browser
-- roles only the rows granted in section 3.
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
group by table_name, grantee
order by table_name, grantee;
