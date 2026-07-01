-- Atomic money-ledger operations + DB-level invariants for the chip ledger.
--
-- Every prior balance mutation was a read-in-app -> compute -> write-in-app
-- round trip (SupabaseRepository.setBalance), which races under concurrent
-- requests: two simultaneous approvals of the same pending deposit both read
-- status='pending' before either write lands, so both credit the balance
-- (double-credit); two concurrent transfers from the same sender can both
-- pass the "sufficient balance" check against the same stale read
-- (overdraft); a crash between the two legs of a transfer debits one side
-- without crediting the other (fund loss). These functions move the
-- read-check-write into a single Postgres statement/transaction with row
-- locking, so concurrent requests serialize correctly instead of racing.

-- ---------------------------------------------------------------------------
-- Invariants
-- ---------------------------------------------------------------------------
alter table pa_profiles add constraint pa_profiles_credit_limit_check check (credit_limit >= 0);
alter table pa_profiles add constraint pa_profiles_balance_floor_check check (balance >= -credit_limit);
alter table pa_transactions add constraint pa_transactions_amount_nonzero_check check (amount <> 0);

-- ---------------------------------------------------------------------------
-- pa_adjust_balance — atomic single-account delta (recordCash, adminAdjustBalance)
-- ---------------------------------------------------------------------------
create or replace function pa_adjust_balance(p_user_id text, p_delta bigint)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance bigint;
begin
  update pa_profiles
  set balance = balance + p_delta
  where id = p_user_id
  returning balance into new_balance;

  if new_balance is null then
    raise exception 'pa_adjust_balance: user % not found', p_user_id;
  end if;

  return new_balance;
end;
$$;

-- ---------------------------------------------------------------------------
-- pa_transfer — atomic two-account transfer + both ledger rows.
-- Locks both profile rows in a consistent order (by id) regardless of
-- transfer direction, so two opposite-direction concurrent transfers between
-- the same pair of accounts can't deadlock each other.
-- ---------------------------------------------------------------------------
create or replace function pa_transfer(
  p_out_tx_id text,
  p_in_tx_id text,
  p_from_id text,
  p_to_id text,
  p_amount bigint,
  p_from_note text,
  p_to_note text,
  p_processed_by text,
  p_created_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  from_balance bigint;
  from_currency text;
  to_currency text;
begin
  if p_amount <= 0 then
    raise exception 'pa_transfer: amount must be positive';
  end if;

  if p_from_id < p_to_id then
    select balance, currency into from_balance, from_currency from pa_profiles where id = p_from_id for update;
    select currency into to_currency from pa_profiles where id = p_to_id for update;
  else
    select currency into to_currency from pa_profiles where id = p_to_id for update;
    select balance, currency into from_balance, from_currency from pa_profiles where id = p_from_id for update;
  end if;

  if from_balance is null then raise exception 'pa_transfer: sender not found'; end if;
  if to_currency is null then raise exception 'pa_transfer: recipient not found'; end if;
  if from_balance < p_amount then raise exception 'pa_transfer: insufficient balance'; end if;

  update pa_profiles set balance = balance - p_amount where id = p_from_id;
  update pa_profiles set balance = balance + p_amount where id = p_to_id;

  insert into pa_transactions (id, user_id, counterparty_id, type, amount, currency, status, note, processed_by, created_at)
  values (p_out_tx_id, p_from_id, p_to_id, 'transfer_out', -p_amount, from_currency, 'completed', p_from_note, p_processed_by, p_created_at);
  insert into pa_transactions (id, user_id, counterparty_id, type, amount, currency, status, note, processed_by, created_at)
  values (p_in_tx_id, p_to_id, p_from_id, 'transfer_in', p_amount, to_currency, 'completed', p_to_note, p_processed_by, p_created_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- pa_credit_member — atomic agent debit (optional) + member credit + ledger rows.
-- p_debit_agent=false is the admin-credits-member path (no debit leg).
-- ---------------------------------------------------------------------------
create or replace function pa_credit_member(
  p_debit_tx_id text,
  p_credit_tx_id text,
  p_agent_id text,
  p_member_id text,
  p_amount bigint,
  p_debit_note text,
  p_credit_note text,
  p_tx_type text,
  p_created_at timestamptz,
  p_debit_agent boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  agent_balance bigint;
  agent_currency text;
  member_currency text;
begin
  if p_amount <= 0 then
    raise exception 'pa_credit_member: amount must be positive';
  end if;

  if p_debit_agent then
    if p_agent_id < p_member_id then
      select balance, currency into agent_balance, agent_currency from pa_profiles where id = p_agent_id for update;
      select currency into member_currency from pa_profiles where id = p_member_id for update;
    else
      select currency into member_currency from pa_profiles where id = p_member_id for update;
      select balance, currency into agent_balance, agent_currency from pa_profiles where id = p_agent_id for update;
    end if;

    if agent_balance is null then raise exception 'pa_credit_member: agent not found'; end if;
    if member_currency is null then raise exception 'pa_credit_member: member not found'; end if;
    if agent_balance < p_amount then raise exception 'pa_credit_member: insufficient balance'; end if;

    update pa_profiles set balance = balance - p_amount where id = p_agent_id;
    insert into pa_transactions (id, user_id, counterparty_id, type, amount, currency, status, note, processed_by, created_at)
    values (p_debit_tx_id, p_agent_id, p_member_id, 'transfer_out', -p_amount, agent_currency, 'completed', p_debit_note, p_agent_id, p_created_at);
  else
    select currency into member_currency from pa_profiles where id = p_member_id for update;
    if member_currency is null then raise exception 'pa_credit_member: member not found'; end if;
  end if;

  update pa_profiles set balance = balance + p_amount where id = p_member_id;
  insert into pa_transactions (id, user_id, counterparty_id, type, amount, currency, status, note, processed_by, created_at)
  values (
    p_credit_tx_id, p_member_id,
    case when p_debit_agent then p_agent_id else null end,
    p_tx_type, p_amount, member_currency, 'completed', p_credit_note, p_agent_id, p_created_at
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- pa_approve_transaction — atomic pending -> {completed|rejected} transition
-- with a conditional balance credit, guarded by `WHERE status = 'pending'` so
-- two concurrent approvals of the same transaction can't both apply.
-- `applied=false` in the result means the transaction was already decided
-- (or a genuinely concurrent decision won the race) — the caller should
-- surface that as a no-op, not a duplicate credit.
-- ---------------------------------------------------------------------------
create or replace function pa_approve_transaction(
  p_tx_id text,
  p_decision text,
  p_processed_by text
)
returns table (
  id text, user_id text, counterparty_id text, type text, amount bigint,
  currency text, status text, note text, processed_by text, created_at timestamptz,
  applied boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  r pa_transactions%rowtype;
  final_status text;
begin
  final_status := case when p_decision = 'approved' then 'completed' else p_decision end;

  update pa_transactions t
  set status = final_status, processed_by = p_processed_by
  where t.id = p_tx_id and t.status = 'pending'
  returning * into r;

  if r.id is null then
    select * into r from pa_transactions t where t.id = p_tx_id;
    if r.id is null then
      raise exception 'pa_approve_transaction: transaction % not found', p_tx_id;
    end if;
    return query select r.id, r.user_id, r.counterparty_id, r.type, r.amount, r.currency, r.status, r.note, r.processed_by, r.created_at, false;
    return;
  end if;

  if p_decision in ('approved', 'completed') then
    update pa_profiles set balance = balance + r.amount where id = r.user_id;
  end if;

  return query select r.id, r.user_id, r.counterparty_id, r.type, r.amount, r.currency, r.status, r.note, r.processed_by, r.created_at, true;
end;
$$;

-- ---------------------------------------------------------------------------
-- pa_sweep_negative_balance — atomic re-check-and-zero for the daily cron.
-- Re-reads the player's balance under lock at execution time (not the stale
-- snapshot the cron iterates over), so a balance that changed between the
-- cron's read and this call doesn't get zeroed based on stale data. Returns
-- the swept amount, or null if there was nothing to sweep by the time this
-- ran (caller should skip inserting ledger rows in that case).
-- ---------------------------------------------------------------------------
create or replace function pa_sweep_negative_balance(p_player_id text, p_agent_id text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  cur_balance bigint;
  swept bigint;
begin
  if p_player_id < p_agent_id then
    select balance into cur_balance from pa_profiles where id = p_player_id for update;
    perform 1 from pa_profiles where id = p_agent_id for update;
  else
    perform 1 from pa_profiles where id = p_agent_id for update;
    select balance into cur_balance from pa_profiles where id = p_player_id for update;
  end if;

  if cur_balance is null or cur_balance >= 0 then
    return null;
  end if;

  swept := -cur_balance;
  update pa_profiles set balance = 0 where id = p_player_id;
  update pa_profiles set balance = balance - swept where id = p_agent_id;
  return swept;
end;
$$;
