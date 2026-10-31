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
--   * anon / authenticated need SELECT on the configuration tables the
--     browser reads directly (prices and active promo codes).
--
-- Safe to run multiple times.
-- ===================================================================

-- 1. Schema usage ---------------------------------------------------------
grant usage on schema public to anon, authenticated, service_role;

-- 2. Full access for the backend service role ----------------------------
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

-- 3. Least-privilege access for signed-in users --------------------------
grant select, insert, update on public.users to authenticated;
grant select, insert, update, delete on public.user_usage to authenticated;
grant select, insert, delete on public.analysis_history to authenticated;
grant select, insert, delete on public.feedback to authenticated;
grant select on public.transactions to authenticated;
grant select on public.system_settings to authenticated;

-- 4. Public reads required by the pricing / promo UI ---------------------
grant select on public.system_settings to anon;
grant select on public.promo_codes to anon, authenticated;

-- 5. Future tables inherit the same grants -------------------------------
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- 6. Verify ---------------------------------------------------------------
-- Expect one row per table with the privileges granted above.
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
group by table_name, grantee
order by table_name, grantee;
