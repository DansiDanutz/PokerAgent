-- Economy ledger: every APPLIED stats import is persisted as a session
-- (summary) + its per-member lines, giving the club a permanent per-period
-- history — sessions per day, rake splits over time, and each player's
-- hands/rake/P&L per period — instead of only lifetime profile totals.

create table pa_import_sessions (
  id text primary key,
  label text not null,
  created_at timestamptz not null default now(),
  applied_by text not null references pa_profiles(id),
  members int not null,
  matched int not null,
  unmatched int not null,
  hands bigint not null,
  total_rake bigint not null,
  player_rakeback bigint not null,
  agent_commission bigint not null,
  admin_kept bigint not null,
  pay_to_agents bigint not null,
  collect_from_agents bigint not null
);

create table pa_import_lines (
  id text primary key,
  session_id text not null references pa_import_sessions(id) on delete cascade,
  -- Null when the CSV row didn't match any linked member (kept for audit).
  user_id text references pa_profiles(id) on delete set null,
  clubgg_id text not null,
  nickname text,
  hands bigint not null,
  hours numeric not null default 0,
  rake bigint not null,
  net_profit bigint not null,
  buy_in bigint not null,
  cash_out bigint not null,
  rakeback_eligible boolean not null default false,
  player_rakeback bigint not null,
  agent_share bigint not null,
  admin_share bigint not null
);

create index pa_import_lines_session_idx on pa_import_lines (session_id);
create index pa_import_lines_user_idx on pa_import_lines (user_id);
create index pa_import_sessions_created_idx on pa_import_sessions (created_at desc);

-- Same fail-closed posture as every other pa_ table: RLS on, zero policies —
-- only the service-role key (server-side repository) can touch these rows.
alter table pa_import_sessions enable row level security;
alter table pa_import_lines enable row level security;
