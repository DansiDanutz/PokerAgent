-- Poker Agent — initial schema (pa_* tables, custom email/password auth).
--
-- This replaces an earlier draft migration (0001_init.sql) that assumed
-- Supabase Auth (uuid ids referencing auth.users, RLS keyed off auth.uid())
-- and was never actually applied — it collided with pre-existing `profiles`/
-- `transactions` tables from other apps in this shared "Games" project.
-- The schema that shipped instead uses app-issued text ids and a custom
-- scrypt-hashed session, with every query going through the server-only
-- service-role client (see src/lib/data/supabase.ts). RLS is enabled below
-- as a fail-closed backstop with no policies attached: since the app never
-- authenticates a request as a Supabase Auth session, `auth.uid()`-scoped
-- policies would be meaningless here — the only way in is the service-role
-- key, which bypasses RLS entirely regardless of policy count.
--
-- Money is an internal ledger (chips/credits), not a payment processor. All
-- amounts are minor units (cents), stored as bigint to avoid float drift.

create table pa_profiles (
  id text primary key,
  username text unique not null,
  full_name text not null,
  email text not null,
  phone text,
  country text,
  avatar_url text,
  role text not null default 'player' check (role in ('player', 'agent', 'admin')),
  status text not null default 'active' check (status in ('active', 'suspended', 'banned')),
  kyc_status text not null default 'unverified' check (kyc_status in ('unverified', 'pending', 'verified', 'rejected')),
  upline_agent_id text references pa_profiles (id) on delete set null,
  referral_code text unique not null,
  clubgg_id text,
  clubgg_nickname text,
  balance bigint not null default 0,
  currency text not null default 'USD',
  -- denormalized lifetime stats
  hands_played bigint not null default 0,
  net_profit bigint not null default 0,
  rake_generated bigint not null default 0,
  win_rate_bb100 numeric not null default 0,
  sessions integer not null default 0,
  table_hours numeric not null default 0,
  created_at timestamptz not null default now(),
  last_active_at timestamptz
);

create index pa_profiles_upline_idx on pa_profiles (upline_agent_id);
create index pa_profiles_role_idx on pa_profiles (role);

create table pa_transactions (
  id text primary key,
  user_id text not null references pa_profiles (id) on delete cascade,
  counterparty_id text references pa_profiles (id) on delete set null,
  type text not null check (type in ('deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'rake_rebate', 'adjustment')),
  amount bigint not null,            -- signed: + credit, - debit
  currency text not null default 'USD',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'completed')),
  note text,
  processed_by text references pa_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index pa_transactions_user_idx on pa_transactions (user_id, created_at desc);
create index pa_transactions_status_idx on pa_transactions (status);

create table pa_notifications (
  id text primary key,
  user_id text not null references pa_profiles (id) on delete cascade,
  kind text not null check (kind in ('referral', 'money', 'system', 'promotion', 'security')),
  title text not null,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index pa_notifications_user_idx on pa_notifications (user_id, created_at desc);

-- Fail-closed backstop: enabled with zero policies, so only the service-role
-- key (used exclusively by the server-only repository) can read/write these
-- tables. See header comment.
alter table pa_profiles enable row level security;
alter table pa_transactions enable row level security;
alter table pa_notifications enable row level security;
