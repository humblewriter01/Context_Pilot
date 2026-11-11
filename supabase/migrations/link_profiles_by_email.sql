-- ===================================================================
-- Context Pilot — one profile per e-mail address (account linking)
--
-- Why
--   A person can reach the app through more than one sign-in method
--   (e-mail + password, GitHub OAuth). Whenever a sign-in creates a row in
--   auth.users, the on_auth_user_created trigger provisions the matching
--   profile in public.users. That profile must be reused, never duplicated,
--   when the e-mail address already has one.
--
-- What this script does
--   1. Merges existing profiles that differ only by letter case or surrounding
--      whitespace, and stores every address in lower case. Usage, analysis
--      history, feedback and transactions move to the surviving profile;
--      nothing is discarded. Does nothing when the data is already clean.
--   2. Enforces "one profile per e-mail address" case-insensitively.
--   3. Replaces public.handle_new_user(): when a new auth user (for example a
--      GitHub sign-in) carries an address that already owns a profile, the new
--      auth_id is linked to that existing profile instead of creating another.
--
-- How to use
--   Existing project: run this file once in the SQL editor (Dashboard ->
--   SQL Editor -> Run). New project: supabase/schema.sql already contains the
--   same index and function, so this file is not needed.
--   Safe to run multiple times.
-- ===================================================================


-- -------------------------------------------------------------------
-- 1. Merge profiles that share an address case-insensitively and store
--    every address in its canonical (trimmed, lower-case) form
-- -------------------------------------------------------------------
do $$
declare
  grp            record;
  v_keeper       uuid;
  v_keeper_email text;
  v_auth_id      uuid;
begin
  for grp in
    select
      lower(btrim(u.email)) as norm_email,
      count(*) as profile_count,
      case max(case u.subscription_tier when 'enterprise' then 3 when 'pro' then 2 else 1 end)
        when 3 then 'enterprise'
        when 2 then 'pro'
        else 'free'
      end as tier,
      case when bool_or(u.status = 'suspended') then 'suspended' else 'active' end as status,
      -- Prefer a real name over the 'Developer' placeholder, but keep either.
      (array_agg(u.display_name order by u.created_at, u.id)
         filter (where nullif(btrim(u.display_name), '') is not null
                   and btrim(u.display_name) <> 'Developer'))[1] as display_name,
      (array_agg(u.display_name order by u.created_at, u.id)
         filter (where nullif(btrim(u.display_name), '') is not null))[1] as placeholder_name,
      (array_agg(u.photo_url order by u.created_at, u.id)
         filter (where nullif(btrim(u.photo_url), '') is not null))[1] as photo_url,
      (array_agg(u.auth_id order by u.last_login_at desc, u.id)
         filter (where u.auth_id is not null))[1] as linked_auth_id,
      min(u.created_at) as created_at,
      max(u.last_login_at) as last_login_at
    from public.users u
    where btrim(u.email) <> ''
    group by lower(btrim(u.email))
    having count(*) > 1 or bool_or(u.email <> lower(btrim(u.email)))
  loop
    -- The auth user that owns the address wins; otherwise keep an existing link.
    select a.id
      into v_auth_id
      from auth.users a
     where lower(btrim(a.email)) = grp.norm_email
     order by a.created_at, a.id
     limit 1;
    v_auth_id := coalesce(v_auth_id, grp.linked_auth_id);

    -- The surviving profile keeps its id: the one already stored under the
    -- canonical address, otherwise the oldest one.
    select u.id, u.email
      into v_keeper, v_keeper_email
      from public.users u
     where lower(btrim(u.email)) = grp.norm_email
     order by (u.email = grp.norm_email) desc, u.created_at, u.id
     limit 1;

    if grp.profile_count > 1 then
      -- Monthly usage is unique per (address, month): add the counters together.
      insert into public.user_usage (user_email, month_year, tickets_processed, monthly_limit, updated_at)
      select
        v_keeper_email,
        uu.month_year,
        sum(uu.tickets_processed),
        case when bool_or(uu.monthly_limit = -1) then -1 else max(uu.monthly_limit) end,
        max(uu.updated_at)
      from public.user_usage uu
      join public.users d on d.email = uu.user_email
      where lower(btrim(d.email)) = grp.norm_email
        and d.id <> v_keeper
      group by uu.month_year
      on conflict (user_email, month_year) do update
        set tickets_processed = public.user_usage.tickets_processed + excluded.tickets_processed,
            monthly_limit = case
                              when public.user_usage.monthly_limit = -1 or excluded.monthly_limit = -1 then -1
                              else greatest(public.user_usage.monthly_limit, excluded.monthly_limit)
                            end,
            updated_at = greatest(public.user_usage.updated_at, excluded.updated_at);

      delete from public.user_usage uu
       using public.users d
       where d.email = uu.user_email
         and lower(btrim(d.email)) = grp.norm_email
         and d.id <> v_keeper;

      -- Everything else simply moves to the surviving profile.
      update public.analysis_history h
         set user_email = v_keeper_email
        from public.users d
       where d.email = h.user_email
         and lower(btrim(d.email)) = grp.norm_email
         and d.id <> v_keeper;

      update public.feedback f
         set user_email = v_keeper_email
        from public.users d
       where d.email = f.user_email
         and lower(btrim(d.email)) = grp.norm_email
         and d.id <> v_keeper;

      update public.transactions t
         set user_email = v_keeper_email
        from public.users d
       where d.email = t.user_email
         and lower(btrim(d.email)) = grp.norm_email
         and d.id <> v_keeper;

      delete from public.users d
       where lower(btrim(d.email)) = grp.norm_email
         and d.id <> v_keeper;
    end if;

    -- Store the address in its canonical form. The profile and the records that
    -- reference it change in one statement, because the foreign keys on the
    -- address are verified when a statement ends.
    if v_keeper_email <> grp.norm_email then
      with profile as (
        update public.users set email = grp.norm_email where id = v_keeper returning 1
      ), usage as (
        update public.user_usage set user_email = grp.norm_email where user_email = v_keeper_email returning 1
      ), history as (
        update public.analysis_history set user_email = grp.norm_email where user_email = v_keeper_email returning 1
      ), feedback as (
        update public.feedback set user_email = grp.norm_email where user_email = v_keeper_email returning 1
      )
      update public.transactions set user_email = grp.norm_email where user_email = v_keeper_email;
    end if;

    -- An auth identity can back only one profile.
    if v_auth_id is not null then
      update public.users set auth_id = null where auth_id = v_auth_id and id <> v_keeper;
    end if;

    update public.users
       set auth_id           = coalesce(v_auth_id, auth_id),
           subscription_tier = grp.tier,
           status            = grp.status,
           display_name      = coalesce(grp.display_name, grp.placeholder_name, display_name),
           photo_url         = coalesce(grp.photo_url, photo_url),
           created_at        = grp.created_at,
           last_login_at     = grp.last_login_at
     where id = v_keeper;

    raise notice 'Profile % now holds the records of % profile(s) stored for its e-mail address',
      v_keeper, grp.profile_count;
  end loop;
end
$$;


-- -------------------------------------------------------------------
-- 2. One profile per address, regardless of letter case
-- -------------------------------------------------------------------
create unique index if not exists users_email_lower_key on public.users (lower(email));


-- -------------------------------------------------------------------
-- 3. Link new sign-ins to the profile that already owns the address
--    (keep in sync with the copy in supabase/schema.sql)
-- -------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email      text;
  v_name       text;
  v_photo      text;
  v_profile_id uuid;
begin
  v_email := lower(nullif(btrim(new.email), ''));

  -- Sign-ins without an e-mail address (e.g. phone) have no profile key yet.
  if v_email is null then
    return new;
  end if;

  v_name := nullif(btrim(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'user_name'), ''),
    new.raw_user_meta_data ->> 'preferred_username'
  )), '');

  v_photo := nullif(btrim(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), ''),
    new.raw_user_meta_data ->> 'picture'
  )), '');

  -- 1. The address already has a profile: link this sign-in to it and keep
  --    its plan, status and history. Only blank details are filled in.
  update public.users as u
     set auth_id       = new.id,
         display_name  = case
                           when nullif(btrim(u.display_name), '') is null
                             or btrim(u.display_name) = 'Developer'
                             then coalesce(v_name, 'Developer')
                           else u.display_name
                         end,
         photo_url     = coalesce(nullif(btrim(u.photo_url), ''), v_photo),
         last_login_at = timezone('utc', now())
   where u.id = (
           select p.id
             from public.users as p
            where lower(p.email) = v_email
            order by (p.email = v_email) desc, p.created_at, p.id
            limit 1
         )
  returning u.id into v_profile_id;

  -- 2. First time this address is seen: create its profile.
  if v_profile_id is null then
    insert into public.users (auth_id, email, display_name, photo_url)
    values (new.id, v_email, coalesce(v_name, 'Developer'), v_photo)
    on conflict (email) do update
      set auth_id = excluded.auth_id;
  end if;

  return new;
exception
  when others then
    -- A profile problem must never block a sign-up or sign-in. The API links
    -- or creates the profile on the first authenticated request instead.
    raise warning 'handle_new_user: could not sync the profile for auth user % (SQLSTATE %): %',
      new.id, sqlstate, sqlerrm;
    return new;
end;
$$;

comment on function public.handle_new_user() is
  'Provisions public.users for a new auth user, linking to the existing profile when the e-mail address already has one.';


-- -------------------------------------------------------------------
-- 4. Make sure the trigger exists (left untouched when already present)
-- -------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
      from pg_trigger
     where tgname = 'on_auth_user_created'
       and tgrelid = 'auth.users'::regclass
       and not tgisinternal
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end
$$;
