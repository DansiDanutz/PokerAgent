# Poker Agent — Design Spec

_Date: 2026-06-30_

## Problem

The operator runs external poker software where people play. They need a
companion app to **manage the people and money** around it — players, the agents
who recruit them, and admins — plus a **poker odds calculator** for Texas
Hold'em and Omaha.

## Scope (v1)

In scope:

1. **Odds calculator** — equity, outs, pot odds for Hold'em + Omaha.
2. **Role-based management** — `player`, `agent`, `admin` perspectives.
3. **Agent referral network** — multi-level tree, rolled-up stats, commission.
4. **Wallet ledger** — deposits/withdrawals (approved), P2P transfers, history.
5. **Profile/KYC, notifications, admin console.**

Out of scope (future milestone): the **AI Poker Coach** (live hand reader /
real-time table assistant shown in mockups) — a separate ML product.

## Key decisions

| Decision | Choice | Rationale |
|---|---|---|
| Platform | Next.js 15 responsive web | Matches mobile mockups; one codebase serves admin desktop; deploys to Vercel. |
| Backend | Repository interface; in-memory default, Supabase optional | Runs with zero setup; production persistence via RLS schema. |
| Money | Internal chip/credit ledger | Safe + legal; not a payment processor. |
| Theme | Emerald + gold "luxury felt" | Dominant brand across mockups. |
| Engine | Pure TS, exact enumeration + seeded Monte Carlo | Deterministic, testable, no native deps. |

## Architecture

- **`src/lib/poker`** — pure engine (cards → hand rank → evaluator → equity → odds). No UI/data deps.
- **`src/lib/data`** — `Repository` interface + `MemoryRepository` (seed) + Supabase migration. UI depends only on the interface.
- **`src/lib/auth`** — cookie session (`getCurrentUser`), swappable for Supabase auth.
- **`src/app`** — App Router. `(auth)` group (login/register), `(app)` group (role-guarded shell + pages).
- **`src/components`** — `ui` primitives, `layout` (role-aware shell), `poker` (calculator/cards), `network`, `wallet`, `charts`.

## Data model

`User` (role, upline, referralCode, balance, stats) · `Transaction` (signed
ledger entries, status) · `Notification` · derived `NetworkNode` / `NetworkSummary`
/ `AdminOverview`. See [`src/types/domain.ts`](../../../src/types/domain.ts).

## Security model (Supabase RLS)

- A user can read/update themselves.
- An agent can read any user in their **downline subtree** (recursive upline check).
- An admin can read/write everyone.
- Cash movements: users insert their own; admins approve.

## Testing

- 45 Vitest unit/integration tests; 93%+ coverage on the engine.
- Engine benchmarks (AA vs KK), Omaha hole-card rule, transfer/overdraft and
  network rollup logic.
- Verified end-to-end in-browser: all three role logins, agent dashboard,
  calculator correctness (top set vs set ≈ 95.7%), admin approval queue.

## Status

v1 implemented and verified. Build green, all tests pass.
