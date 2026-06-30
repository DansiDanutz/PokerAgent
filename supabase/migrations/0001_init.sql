-- Poker Agent — initial schema with role-based Row Level Security.
--
-- Roles: player | agent | admin. Money is an internal ledger (chips/credits),
-- not a payment processor. All amounts are minor units (cents).

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type user_role as enum ('player', 'agent', 'admin');
create type kyc_status as enum ('unverified', 'pending', 'verified', 'rejected');
create type account_status as enum ('active', 'suspended', 'banned');
create type tx_type as enum (
  'deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'rake_rebate', 'adjustment'
);
create type tx_status as enum ('pending', 'approved', 'rejected', 'completed');
create type notification_kind as enum (
  'referral', 'money', 'system', 'promotion', 'security'
);

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  full_name text not null,
  email text not null,
  phone text,
  country text,
  avatar_url text,
  role user_role not null default 'player',
  status account_status not null default 'active',
  kyc_status kyc_status not null default 'unverified',
  upline_agent_id uuid references profiles (id) on delete set null,
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
  sessions int not null default 0,
  created_at timestamptz not null default now(),
  last_active_at timestamptz
);

create index profiles_upline_idx on profiles (upline_agent_id);
create index profiles_role_idx on profiles (role);

-- ---------------------------------------------------------------------------
-- transactions (ledger)
-- ---------------------------------------------------------------------------
create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  counterparty_id uuid references profiles (id) on delete set null,
  type tx_type not null,
  amount bigint not null,            -- signed: + credit, - debit
  currency text not null default 'USD',
  status tx_status not null default 'pending',
  note text,
  processed_by uuid references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index transactions_user_idx on transactions (user_id, created_at desc);
create index transactions_status_idx on transactions (status);

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles (id) on delete cascade,
  kind notification_kind not null,
  title text not null,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on notifications (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- Role of the current authenticated user.
create or replace function current_role_of()
returns user_role language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid()
$$;

-- Is the current user an (ancestor) agent of the target user? Walks the
-- upline chain so an agent can see their whole downline subtree.
create or replace function is_upline_of(target uuid)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  cur uuid;
  guard int := 0;
begin
  select upline_agent_id into cur from profiles where id = target;
  while cur is not null and guard < 50 loop
    if cur = auth.uid() then return true; end if;
    select upline_agent_id into cur from profiles where id = cur;
    guard := guard + 1;
  end loop;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table profiles enable row level security;
alter table transactions enable row level security;
alter table notifications enable row level security;

-- profiles: self, your downline (agents), or admin (everyone).
create policy profiles_select on profiles for select using (
  id = auth.uid()
  or current_role_of() = 'admin'
  or is_upline_of(id)
);
create policy profiles_update_self on profiles for update using (id = auth.uid());
create policy profiles_admin_all on profiles for all using (current_role_of() = 'admin');

-- transactions: owner, the agent upline of the owner, or admin.
create policy tx_select on transactions for select using (
  user_id = auth.uid()
  or current_role_of() = 'admin'
  or is_upline_of(user_id)
);
create policy tx_insert_self on transactions for insert with check (user_id = auth.uid());
create policy tx_admin_all on transactions for all using (current_role_of() = 'admin');

-- notifications: owner or admin.
create policy notif_select on notifications for select using (
  user_id = auth.uid() or current_role_of() = 'admin'
);
create policy notif_update_own on notifications for update using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- New-signup trigger: create a profile row when an auth user is created.
-- ---------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username, full_name, email, referral_code)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'full_name', 'New Player'),
    new.email,
    upper(substr(md5(new.id::text), 1, 8))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
