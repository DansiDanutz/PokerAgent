-- Balance-backed money flow: players can carry a negative balance up to
-- their agent-assigned credit limit, and agents can extend "agent_credit"
-- transactions to their downline.
alter table pa_profiles add column credit_limit bigint not null default 0;

alter table pa_transactions drop constraint pa_transactions_type_check;
alter table pa_transactions add constraint pa_transactions_type_check
  check (type in ('deposit', 'withdrawal', 'transfer_in', 'transfer_out', 'rake_rebate', 'adjustment', 'agent_credit'));
