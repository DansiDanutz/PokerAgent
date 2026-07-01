-- pa_set_credit_limit — atomic credit-limit write, closing two gaps found
-- during a correctness review:
--  1. setPlayerCreditLimit's aggregate-cap check (sum of an agent's players'
--     limits vs. the agent's own balance) was a JS read-then-write with no
--     row locking, so two concurrent calls from the same agent could both
--     pass the same stale aggregate check.
--  2. Neither driver checked the TARGET PLAYER's own current balance against
--     the new limit — lowering a limit below what the player currently owes
--     violated pa_profiles_balance_floor_check on Supabase (an unfriendly
--     DB error) and silently corrupted the invariant on the in-memory driver.
-- Locks the agent row before the player row (or vice versa, in a consistent
-- id order) so concurrent calls can't deadlock against each other or against
-- a concurrent transfer/credit touching the same two rows.
create or replace function pa_set_credit_limit(
  p_actor_id text,
  p_player_id text,
  p_credit_limit bigint,
  p_is_admin boolean
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  player_balance bigint;
  player_upline text;
  actor_balance bigint;
  others_sum bigint;
begin
  if p_credit_limit < 0 then
    raise exception 'pa_set_credit_limit: negative limit';
  end if;

  if p_is_admin then
    select balance, upline_agent_id into player_balance, player_upline
    from pa_profiles where id = p_player_id for update;
  else
    if p_actor_id < p_player_id then
      select balance into actor_balance from pa_profiles where id = p_actor_id for update;
      select balance, upline_agent_id into player_balance, player_upline from pa_profiles where id = p_player_id for update;
    else
      select balance, upline_agent_id into player_balance, player_upline from pa_profiles where id = p_player_id for update;
      select balance into actor_balance from pa_profiles where id = p_actor_id for update;
    end if;

    if actor_balance is null then raise exception 'pa_set_credit_limit: actor not found'; end if;
    if player_upline is distinct from p_actor_id then
      raise exception 'pa_set_credit_limit: not your player';
    end if;

    select coalesce(sum(credit_limit), 0) into others_sum
    from pa_profiles where upline_agent_id = p_actor_id and id <> p_player_id;

    if others_sum + p_credit_limit > actor_balance then
      raise exception 'pa_set_credit_limit: aggregate cap exceeded';
    end if;
  end if;

  if player_balance is null then raise exception 'pa_set_credit_limit: player not found'; end if;
  if player_balance < -p_credit_limit then
    raise exception 'pa_set_credit_limit: balance floor';
  end if;

  update pa_profiles set credit_limit = p_credit_limit where id = p_player_id;
  return p_credit_limit;
end;
$$;

revoke execute on function pa_set_credit_limit(text, text, bigint, boolean) from anon, authenticated;
grant execute on function pa_set_credit_limit(text, text, bigint, boolean) to service_role;
