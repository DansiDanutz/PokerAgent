-- Tiered VIP referral & agent rakeback rates with monthly recount.
alter table pa_profiles add column current_rakeback_rate numeric;
alter table pa_profiles add column rakeback_tier_as_of timestamptz;
alter table pa_profiles add column last_monthly_snapshot_hours bigint not null default 0;
