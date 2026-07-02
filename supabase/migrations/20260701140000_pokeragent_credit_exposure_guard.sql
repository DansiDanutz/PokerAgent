-- Credit-limit exposure guard: an agent's extended player credit limits are a
-- promise to have cash on hand to cover those players if they go negative.
-- pa_set_credit_limit already enforces "sum(limits) <= balance" at SET time,
-- but nothing stopped the agent from spending that balance away afterward via
-- pa_transfer / pa_credit_member — the two other paths that reduce an agent's
-- balance. This migration closes that gap by re-checking the same invariant,
-- under the same row lock, at the moment the balance would actually move:
-- an agent-initiated transfer/credit may never leave `balance < sum(limits)`.

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
  from_role text;
  to_currency text;
  agent_exposure bigint;
begin
  if p_amount <= 0 then
    raise exception 'pa_transfer: amount must be positive';
  end if;

  if p_from_id < p_to_id then
    select balance, currency, role into from_balance, from_currency, from_role from pa_profiles where id = p_from_id for update;
    select currency into to_currency from pa_profiles where id = p_to_id for update;
  else
    select currency into to_currency from pa_profiles where id = p_to_id for update;
    select balance, currency, role into from_balance, from_currency, from_role from pa_profiles where id = p_from_id for update;
  end if;

  if from_balance is null then raise exception 'pa_transfer: sender not found'; end if;
  if to_currency is null then raise exception 'pa_transfer: recipient not found'; end if;
  if from_balance < p_amount then raise exception 'pa_transfer: insufficient balance'; end if;

  if from_role = 'agent' then
    select coalesce(sum(credit_limit), 0) into agent_exposure from pa_profiles where upline_agent_id = p_from_id;
    if from_balance - p_amount < agent_exposure then
      raise exception 'pa_transfer: would breach credit exposure';
    end if;
  end if;

  update pa_profiles set balance = balance - p_amount where id = p_from_id;
  update pa_profiles set balance = balance + p_amount where id = p_to_id;

  insert into pa_transactions (id, user_id, counterparty_id, type, amount, currency, status, note, processed_by, created_at)
  values (p_out_tx_id, p_from_id, p_to_id, 'transfer_out', -p_amount, from_currency, 'completed', p_from_note, p_processed_by, p_created_at);
  insert into pa_transactions (id, user_id, counterparty_id, type, amount, currency, status, note, processed_by, created_at)
  values (p_in_tx_id, p_to_id, p_from_id, 'transfer_in', p_amount, to_currency, 'completed', p_to_note, p_processed_by, p_created_at);
end;
$$;

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
  agent_exposure bigint;
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

    -- Same reserved-capital invariant as pa_transfer: crediting a player
    -- (funding them from the agent's own balance) may not leave the agent
    -- unable to cover the credit limits they've extended to their players.
    select coalesce(sum(credit_limit), 0) into agent_exposure from pa_profiles where upline_agent_id = p_agent_id;
    if agent_balance - p_amount < agent_exposure then
      raise exception 'pa_credit_member: would breach credit exposure';
    end if;

    update pa_profiles set balance = balance - p_amount where id = p_agent_id;
    insert into pa_transactions (id, user_id, counterparty_id, type, amount, currency, status, note, processed_by, created_at)
    values (p_debit_tx_id, p_agent_id, p_member_id, 'transfer_out', -p_amount, agent_currency, 'completed', p_debit_note, p_agent_id, p_created_at);
  else
    select currency into member_currency from pa_profiles where id = p_member_id for update;
    if member_currency is null then raise exception 'pa_credit_member: member not found'; end if;
  end if;

  update pa_profiles set balance = balance + p_amount where id = p_member_id;
  insert into pa_transactions (id, user_id, counterparty_id, type, amount, currency, status, note, processed_by, created_at)
  values (p_credit_tx_id, p_member_id, p_agent_id, p_tx_type, p_amount, member_currency, 'completed', p_credit_note, p_agent_id, p_created_at);
end;
$$;

revoke execute on function pa_transfer(text, text, text, text, bigint, text, text, text, timestamptz) from public, anon, authenticated;
grant execute on function pa_transfer(text, text, text, text, bigint, text, text, text, timestamptz) to service_role;
revoke execute on function pa_credit_member(text, text, text, text, bigint, text, text, text, timestamptz, boolean) from public, anon, authenticated;
grant execute on function pa_credit_member(text, text, text, text, bigint, text, text, text, timestamptz, boolean) to service_role;
