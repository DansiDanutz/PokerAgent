-- Same gap as the 5 earlier pa_* RPCs: new functions get EXECUTE granted to
-- PUBLIC by default, on top of this project's ALTER DEFAULT PRIVILEGES that
-- also grants directly to anon/authenticated. Revoke from all three so only
-- service_role (used exclusively by SupabaseRepository) can call it.
revoke execute on function pa_set_credit_limit(text, text, bigint, boolean) from public, anon, authenticated;
grant execute on function pa_set_credit_limit(text, text, bigint, boolean) to service_role;
