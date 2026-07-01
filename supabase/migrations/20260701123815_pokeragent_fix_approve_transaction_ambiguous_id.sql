-- Bug found during manual verification: pa_approve_transaction's RETURNS
-- TABLE output columns (id, user_id, ...) shadow real column names as
-- PL/pgSQL variables in scope for the whole function body, so the final
-- `update pa_profiles set balance = balance + r.amount where id = r.user_id`
-- raised "column reference id is ambiguous" (id could mean pa_profiles.id or
-- the OUT parameter). Every UPDATE/SELECT in the body now explicitly aliases
-- the table it targets so column names never resolve against OUT params.
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
    update pa_profiles pp set balance = pp.balance + r.amount where pp.id = r.user_id;
  end if;

  return query select r.id, r.user_id, r.counterparty_id, r.type, r.amount, r.currency, r.status, r.note, r.processed_by, r.created_at, true;
end;
$$;

revoke execute on function pa_approve_transaction(text, text, text) from anon, authenticated;
grant execute on function pa_approve_transaction(text, text, text) to service_role;
