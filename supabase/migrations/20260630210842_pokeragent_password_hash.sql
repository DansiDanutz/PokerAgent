-- Real email/password authentication: scrypt hash stored per profile.
-- Nullable — Google OAuth accounts have no password_hash.
alter table pa_profiles add column password_hash text;
