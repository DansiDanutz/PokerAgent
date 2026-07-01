-- The prior REVOKE ... FROM PUBLIC did not remove access: this project has
-- `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO
-- anon, authenticated` configured, which grants EXECUTE directly to those
-- roles (not via the PUBLIC pseudo-role) on every new function. Revoke from
-- them explicitly by name. Verified after this ran: only `postgres` (owner)
-- and `service_role` retain EXECUTE on all 5 pa_* functions.
revoke execute on function pa_adjust_balance(text, bigint) from anon, authenticated;
revoke execute on function pa_transfer(text, text, text, text, bigint, text, text, text, timestamptz) from anon, authenticated;
revoke execute on function pa_credit_member(text, text, text, text, bigint, text, text, text, timestamptz, boolean) from anon, authenticated;
revoke execute on function pa_approve_transaction(text, text, text) from anon, authenticated;
revoke execute on function pa_sweep_negative_balance(text, text) from anon, authenticated;
