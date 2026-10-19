-- ===================================================================
-- Context Pilot - Supabase Production Database Schema
-- Run this script in your Supabase Project -> SQL Editor
-- ===================================================================

-- 1. Enable UUID extension
create extension if not exists "uuid-ossp";

-- 2. Users Table
create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  auth_id uuid references auth.users(id) on delete cascade,
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
  user_email text not null,
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
  user_email text not null,
  was_accurate boolean not null,
  actual_files jsonb default '[]'::jsonb,
  comments text,
  rating integer check (rating between 1 and 5),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 6. Paystack Transactions Table
create table if not exists public.transactions (
  id uuid primary key default uuid_generate_v4(),
  reference text not null unique,
  user_email text not null,
  tier text not null check (tier in ('free', 'pro', 'enterprise')),
  amount integer not null, -- In smallest currency unit (e.g. Kobo for NGN or Cents for USD)
  currency text not null default 'NGN',
  status text not null default 'pending' check (status in ('success', 'failed', 'pending')),
  channel text,
  paid_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 7. Row Level Security (RLS) Configuration
alter table public.users enable row level security;
alter table public.user_usage enable row level security;
alter table public.analysis_history enable row level security;
alter table public.feedback enable row level security;
alter table public.transactions enable row level security;

-- Basic RLS Policies (allows authenticated users to query their own records)
create policy "Allow users to read own profile"
  on public.users for select
  using (auth.uid() = auth_id or auth.jwt() ->> 'email' = email);

create policy "Allow users to read own analyses"
  on public.analysis_history for select
  using (auth.jwt() ->> 'email' = user_email);

create policy "Allow users to insert own analyses"
  on public.analysis_history for insert
  with check (auth.jwt() ->> 'email' = user_email);

create policy "Allow users to insert feedback"
  on public.feedback for insert
  with check (auth.jwt() ->> 'email' = user_email);
