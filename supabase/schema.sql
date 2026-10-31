-- ===================================================================
-- Context Pilot - Complete Supabase Production Database Schema
-- Run this entire script in Supabase Dashboard -> SQL Editor -> Run
-- ===================================================================

-- 1. Enable UUID Extension
create extension if not exists "uuid-ossp";

-- ===================================================================
-- TABLES CREATION
-- ===================================================================

-- 2. Users Table
create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  auth_id uuid references auth.users(id) on delete cascade unique,
  email text not null unique,
  display_name text,
  photo_url text,
  subscription_tier text not null default 'free' check (subscription_tier in ('free', 'pro', 'enterprise')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  last_login_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Monthly Usage Tracking Table
create table if not exists public.user_usage (
  id uuid primary key default uuid_generate_v4(),
  user_email text not null references public.users(email) on delete cascade,
  month_year text not null, -- Format: YYYY-MM
  tickets_processed integer not null default 0,
  monthly_limit integer not null default 10,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (user_email, month_year)
);

-- 4. Analysis History Table (Predictions & Impacted Files)
create table if not exists public.analysis_history (
  id uuid primary key default uuid_generate_v4(),
  user_email text not null references public.users(email) on delete cascade,
  ticket_key text not null,
  ticket_title text not null,
  reasoning text,
  frontend_files jsonb default '[]'::jsonb,
  backend_files jsonb default '[]'::jsonb,
  database_files jsonb default '[]'::jsonb,
  config_files jsonb default '[]'::jsonb,
  test_files jsonb default '[]'::jsonb,
  apis jsonb default '[]'::jsonb,
  confidence_score numeric(4, 2) default 0.85,
  total_files integer default 0,
  processing_time_ms integer default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 5. User Accuracy Feedback Table
create table if not exists public.feedback (
  id uuid primary key default uuid_generate_v4(),
  analysis_id uuid references public.analysis_history(id) on delete set null,
  ticket_key text not null,
  user_email text not null references public.users(email) on delete cascade,
  was_accurate boolean not null,
  actual_files jsonb default '[]'::jsonb,
  comments text,
  rating integer check (rating between 1 and 5),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. Promo Codes Table (Admin Management & Discounts)
create table if not exists public.promo_codes (
  id text primary key,
  code text not null unique,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(10, 2) not null,
  applicable_tiers text[] not null default '{"pro", "enterprise"}',
  max_uses integer not null default 100,
  times_used integer not null default 0,
  is_active boolean not null default true,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. Paystack Transactions Table (Multi-currency NGN & USD)
create table if not exists public.transactions (
  id uuid primary key default uuid_generate_v4(),
  reference text not null unique,
  user_email text not null references public.users(email) on delete cascade,
  tier text not null check (tier in ('free', 'pro', 'enterprise')),
  amount numeric(12, 2) not null,
  currency text not null default 'NGN' check (currency in ('NGN', 'USD')),
  promo_code text,
  status text not null default 'pending' check (status in ('success', 'failed', 'pending')),
  channel text,
  paid_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 8. System & Pricing Settings Table (Dual Currency NGN & USD)
create table if not exists public.system_settings (
  id integer primary key default 1 check (id = 1), -- Singleton row
  currency text not null default 'NGN' check (currency in ('NGN', 'USD')),
  pro_price_ngn integer not null default 15000,
  pro_price_usd numeric(10, 2) not null default 10.00,
  enterprise_price_ngn integer not null default 75000,
  enterprise_price_usd numeric(10, 2) not null default 50.00,
  free_limit integer not null default 10,
  pro_limit integer not null default 150,
  is_live_mode boolean not null default false,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Seed initial default system settings
insert into public.system_settings (id, currency, pro_price_ngn, pro_price_usd, enterprise_price_ngn, enterprise_price_usd, free_limit, pro_limit, is_live_mode)
values (1, 'NGN', 15000, 10.00, 75000, 50.00, 10, 150, false)
on conflict (id) do nothing;


-- ===================================================================
-- ROW LEVEL SECURITY (RLS) SETUP
-- ===================================================================

alter table public.users enable row level security;
alter table public.user_usage enable row level security;
alter table public.analysis_history enable row level security;
alter table public.feedback enable row level security;
alter table public.transactions enable row level security;
alter table public.promo_codes enable row level security;
alter table public.system_settings enable row level security;

-- Users RLS
drop policy if exists "Allow users to read own profile" on public.users;
create policy "Allow users to read own profile"
  on public.users for select
  using (auth.uid() = auth_id or auth.jwt() ->> 'email' = email);

drop policy if exists "Allow users to update own profile" on public.users;
create policy "Allow users to update own profile"
  on public.users for update
  using (auth.uid() = auth_id or auth.jwt() ->> 'email' = email);

-- Analysis History RLS
drop policy if exists "Allow users to read own analyses" on public.analysis_history;
create policy "Allow users to read own analyses"
  on public.analysis_history for select
  using (auth.jwt() ->> 'email' = user_email);

drop policy if exists "Allow users to insert own analyses" on public.analysis_history;
create policy "Allow users to insert own analyses"
  on public.analysis_history for insert
  with check (auth.jwt() ->> 'email' = user_email);

drop policy if exists "Users can delete own analyses" on public.analysis_history;
create policy "Users can delete own analyses"
  on public.analysis_history for delete
  using (auth.jwt() ->> 'email' = user_email);

-- ===================================================================
-- EXPLICIT PRIVILEGES (required on top of RLS)
-- service_role bypasses RLS but still needs table privileges; anon needs
-- to read pricing settings for the marketing/pricing screens.
-- ===================================================================

grant usage on schema public to anon, authenticated, service_role;

grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;

grant select, insert, update on public.users to authenticated;
grant select, insert, update, delete on public.user_usage to authenticated;
grant select, insert, delete on public.analysis_history to authenticated;
grant select, insert, delete on public.feedback to authenticated;
grant select on public.transactions to authenticated;
grant select on public.system_settings to authenticated;

grant select on public.system_settings to anon;
grant select on public.promo_codes to anon, authenticated;

alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- Explicitly grant DELETE permission to authenticated users
grant delete on public.analysis_history to authenticated;

-- Feedback RLS
drop policy if exists "Allow users to insert feedback" on public.feedback;
create policy "Allow users to insert feedback"
  on public.feedback for insert
  with check (auth.jwt() ->> 'email' = user_email);

-- Promo Codes RLS (Public read for active validation during checkout)
drop policy if exists "Allow public to validate active promos" on public.promo_codes;
create policy "Allow public to validate active promos"
  on public.promo_codes for select
  using (is_active = true);

-- System Settings RLS (Public read for plan prices in NGN and USD)
drop policy if exists "Allow public to read system settings" on public.system_settings;
create policy "Allow public to read system settings"
  on public.system_settings for select
  using (true);

-- Transactions RLS (Users can view their own receipts)
drop policy if exists "Allow users to read own transactions" on public.transactions;
create policy "Allow users to read own transactions"
  on public.transactions for select
  using (auth.jwt() ->> 'email' = user_email);


-- ===================================================================
-- AUTH TRIGGER (Auto-create user profile on signup)
-- ===================================================================

-- Create a function to handle new user signups
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.users (auth_id, email, display_name)
  values (
    new.id, 
    new.email, 
    coalesce(new.raw_user_meta_data->>'full_name', 'Developer')
  )
  on conflict (email) do update 
    set auth_id = excluded.auth_id; -- Syncs the auth_id if the user existed beforehand
  return new;
end;
$$ language plpgsql security definer;

-- Trigger the function every time a user is created
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
