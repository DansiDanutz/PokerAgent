-- The 5 pa_* money RPCs are SECURITY DEFINER (they bypass RLS by design, so
-- the app can atomically mutate balances). Postgres grants EXECUTE on new
-- functions to PUBLIC by default, which was never revoked — meaning anon and
-- authenticated (the public/browser-facing Supabase roles) could call these
-- directly via supabase.rpc(...), completely bypassing every app-layer
-- authorization check (assertTransferAllowed, requireManager, requireAdmin).
-- Only the server-only service-role client (used exclusively by
-- SupabaseRepository) should ever be able to call them.
--
-- NOTE: this migration alone was insufficient — see the _v2 migration that
-- follows. This project has `ALTER DEFAULT PRIVILEGES` configured to grant
-- EXECUTE directly to anon/authenticated on new functions (not via the
-- PUBLIC pseudo-role), so `REVOKE ... FROM PUBLIC` didn't actually remove
-- their access. Kept here for the historical record; the real fix is v2.
revoke execute on function pa_adjust_balance(text, bigint) from public;
revoke execute on function pa_transfer(text, text, text, text, bigint, text, text, text, timestamptz) from public;
revoke execute on function pa_credit_member(text, text, text, text, bigint, text, text, text, timestamptz, boolean) from public;
revoke execute on function pa_approve_transaction(text, text, text) from public;
revoke execute on function pa_sweep_negative_balance(text, text) from public;

grant execute on function pa_adjust_balance(text, bigint) to service_role;
grant execute on function pa_transfer(text, text, text, text, bigint, text, text, text, timestamptz) to service_role;
grant execute on function pa_credit_member(text, text, text, text, bigint, text, text, text, timestamptz, boolean) to service_role;
grant execute on function pa_approve_transaction(text, text, text) to service_role;
grant execute on function pa_sweep_negative_balance(text, text) to service_role;
