-- ===================================================================
-- Context Pilot — least privilege for the browser roles
--
-- Why
--   The app reads and writes its tables only through the backend (service
--   role). The two browser roles, "anon" (visitor without a session) and
--   "authenticated" (signed-in user), nevertheless held far more than they
--   can use: TRUNCATE, REFERENCES and TRIGGER on every table (platform
--   defaults), plus INSERT, UPDATE and DELETE on tables where no row level
--   security policy allows them. Row level security does not cover TRUNCATE
--   at all, and an unused privilege only waits for a mistaken policy to make
--   it dangerous.
--
-- What this script does
--   Takes everything away from both roles on the seven application tables,
--   then grants back only what a row level security policy can actually use:
--
--     table              anon     authenticated
--     system_settings    SELECT   SELECT            public prices
--     users              -        SELECT            own profile
--     analysis_history   -        SELECT, INSERT    own analyses
--     feedback           -        INSERT            own feedback
--     transactions       -        SELECT            own receipts
--     user_usage         -        -                 backend only
--     promo_codes        -        -                 backend only
--
--   The backend is not affected: it uses the service role, which keeps full
--   access. Sign-up is not affected: the trigger that creates the profile
--   runs with its owner's rights. The keep-alive workflow still works: it
--   reads system_settings as anon.
--
-- How to use
--   Existing project: run this file once in the SQL editor (Dashboard ->
--   SQL Editor -> Run). New project: supabase/schema.sql already does this,
--   so this file is not needed.
--   Safe to run multiple times.
-- ===================================================================

revoke all on
  public.users, public.user_usage, public.analysis_history, public.feedback,
  public.transactions, public.promo_codes, public.system_settings
from anon, authenticated;

grant select on public.system_settings to anon, authenticated;
grant select on public.users to authenticated;
grant select, insert on public.analysis_history to authenticated;
grant insert on public.feedback to authenticated;
grant select on public.transactions to authenticated;

-- REVOKE only takes back grants made by the role that runs it (or by the
-- table owner). A privilege handed out some other way (by another role, to
-- PUBLIC, or through role membership) would stay in place without an error,
-- so compare the result with the table above and stop loudly on any difference.
do $$
declare
  r record;
  v_actual boolean;
  v_problems text := '';
begin
  for r in
    select ro.role_name, t.table_name, p.privilege,
           (ro.role_name, t.table_name, p.privilege) in (
             ('anon', 'system_settings', 'SELECT'),
             ('authenticated', 'system_settings', 'SELECT'),
             ('authenticated', 'users', 'SELECT'),
             ('authenticated', 'analysis_history', 'SELECT'),
             ('authenticated', 'analysis_history', 'INSERT'),
             ('authenticated', 'feedback', 'INSERT'),
             ('authenticated', 'transactions', 'SELECT')
           ) as wanted
    from unnest(array['users', 'user_usage', 'analysis_history', 'feedback', 'transactions', 'promo_codes', 'system_settings']) as t(table_name)
    cross join unnest(array['anon', 'authenticated']) as ro(role_name)
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) as p(privilege)
    order by 1, 2, 3
  loop
    if r.wanted then
      v_actual := has_table_privilege(r.role_name::name, 'public.' || r.table_name, r.privilege);
    elsif r.privilege in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES') then
      -- these four can also be granted per column
      v_actual := has_any_column_privilege(r.role_name::name, 'public.' || r.table_name, r.privilege);
    else
      v_actual := has_table_privilege(r.role_name::name, 'public.' || r.table_name, r.privilege);
    end if;
    if v_actual is distinct from r.wanted then
      v_problems := v_problems || format(' %s %s on %s is %s;', r.role_name, r.privilege, r.table_name,
        case when r.wanted then 'missing' else 'still granted' end);
    end if;
  end loop;
  if v_problems <> '' then
    raise exception 'Browser role privileges are not as intended:% see who granted what with: select relname, relacl from pg_class where relnamespace = ''public''::regnamespace and relkind = ''r'';', v_problems;
  end if;
end
$$;
