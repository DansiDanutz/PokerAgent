# Security

Poker Agent manages real player balances and agent commissions, so the
security model is treated as a first-class part of the architecture, not an
afterthought. This document describes the current posture; see
[README.md](README.md) for the general architecture.

## Reporting a vulnerability

Please report suspected vulnerabilities privately rather than opening a
public issue:

- Preferred: open a [GitHub Security Advisory](../../security/advisories/new)
  for this repository (private by default).
- Alternative: email the maintainer directly.

Include reproduction steps and the affected area (auth, wallet/ledger,
network/referrals, admin console). We aim to acknowledge reports within a
few days and will credit reporters in the fix, unless you'd prefer to stay
anonymous.

## Authentication

- Passwords are hashed with Node's built-in `scrypt` (random 16-byte salt,
  64-byte key, constant-time comparison) — see
  [`src/lib/auth/password.ts`](src/lib/auth/password.ts).
- Sessions are an HMAC-signed cookie (`httpOnly`, `secure` in production,
  `sameSite: lax`) verified with a constant-time comparison —
  [`src/lib/auth/session.ts`](src/lib/auth/session.ts). `SESSION_SECRET` is
  required in production; the app refuses to sign sessions with a fallback
  secret outside local development.
- Login, registration, and password changes are rate-limited per email/IP
  with a lockout window — [`src/lib/auth/rateLimit.ts`](src/lib/auth/rateLimit.ts).
- Google OAuth (Supabase Auth, PKCE) is supported as an alternative to
  password login and is fully isolated from the password rate limiter.
- The platform admin is locked to a single hardcoded email
  ([`src/lib/governance.ts`](src/lib/governance.ts)); no other account can
  ever hold the `admin` role, and the check is enforced at the data layer,
  not just the UI.

## Authorization

Every state-changing operation is re-validated server-side inside the
repository layer (`SupabaseRepository`/`MemoryRepository`), independent of
what the UI shows — a client can't reach a mutation it isn't authorized for
by skipping past a disabled button. Role checks (`player` / `agent` /
`admin`), upline/downline network checks, and eligibility thresholds (e.g.
VIP-network count for agent promotion) are enforced identically in both data
drivers and covered by the test suite.

## Money-ledger integrity

Balance-affecting operations (transfers, credits, deposit/withdrawal
approval, credit-limit changes, negative-balance settlement) execute as
atomic Postgres functions with row-level locking, not application-level
read-then-write — see
[`supabase/migrations/`](supabase/migrations/) for the full set. This
closes the race-condition class where concurrent requests could double-apply
a credit or exceed a balance. Database-level `CHECK` constraints back the
core invariants (a balance can't exceed its credit limit; a ledger entry
can't be zero) as a second line of defense below the application layer.

## Database access

Row Level Security is enabled on every application table. All privileged
mutations run through `SECURITY DEFINER` Postgres functions whose `EXECUTE`
grant is restricted to the service-role client only — the anonymous and
authenticated Supabase roles cannot call them directly, even though they
bypass RLS by design. The application's Supabase client is server-only and
never bundled into client-side code.

## Transport & headers

Production responses set a Content-Security-Policy, HSTS, X-Frame-Options,
X-Content-Type-Options, Referrer-Policy, and a restrictive Permissions-Policy
— see [`next.config.mjs`](next.config.mjs).

## Testing

The security-relevant code paths (auth, rate limiting, session signing,
cron authorization, money formatting) have dedicated unit tests alongside
the broader application test suite. Run `npm test` to execute all of it.
