-- ===================================================================
-- Context Pilot — profiles cannot be written from the browser (second barrier)
--
-- Why
--   Row level security already stops the browser from changing public.users:
--   the table has no INSERT or UPDATE policy. That is one barrier. The browser
--   roles still held the INSERT and UPDATE privileges on the table, so a single
--   permissive policy added by mistake would have re-opened it straight away.
--
-- What this script does
--   Takes INSERT and UPDATE on public.users away from both browser roles:
--   "authenticated" (signed-in users) and "anon" (visitors who are not signed
--   in). Without the privilege the database refuses the statement before it
--   even looks at the policies.
--
--   Reading is unchanged: a signed-in user can still read their own profile.
--   The backend is unchanged: it uses the service role, which keeps full
--   access. Sign-up is unchanged: the trigger that creates the profile runs
--   with its owner's rights.
--
--   Profile edits (display name, photo) belong in the API, which decides
--   which columns a user may change.
--
-- How to use
--   Existing project: run this file once in the SQL editor (Dashboard ->
--   SQL Editor -> Run). New project: supabase/schema.sql already does this,
--   so this file is not needed.
--   Safe to run multiple times.
-- ===================================================================

revoke insert, update on public.users from anon, authenticated;

-- REVOKE only takes back grants made by the role that runs it (or by the
-- table owner). A privilege handed out some other way would stay in place
-- without an error, so check the result and stop loudly if that happened.
do $$
begin
  if has_any_column_privilege('anon', 'public.users', 'INSERT, UPDATE')
     or has_any_column_privilege('authenticated', 'public.users', 'INSERT, UPDATE') then
    raise exception 'public.users is still writable by a browser role (anon or authenticated). See who granted it with: select relacl from pg_class where oid = ''public.users''::regclass;';
  end if;
end
$$;
