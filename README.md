# ♠ Poker Agent

**AI-assisted poker player & agent management platform** with a built-in
**Texas Hold'em / Omaha odds calculator**.

Poker Agent manages the *people and money* around an external poker room:

- **Players** join (usually via an agent's referral code), track their bankroll, and use the odds calculator.
- **Agents** recruit a downline, see network-wide player stats, and earn rake-based commission.
- **Admins** oversee every user, approve cash movements, and run KYC.

> Money in Poker Agent is an internal **ledger of chips/credits** — it is **not** a
> payment processor. You run the real poker software; this app manages balances,
> transfers, referrals and reporting around it.

---

## ✨ Features

| Area | What's included |
|------|-----------------|
| **Odds calculator** | Equity, outs and pot odds for **Hold'em** and **Omaha**. Exact enumeration when the board is known, seeded Monte Carlo otherwise. Interactive card picker, 2–6 players, random opponents. |
| **Roles** | `player` · `agent` · `admin`, each with a tailored dashboard and navigation. |
| **Agent network** | Multi-level referral tree with rolled-up downline stats, rake leaderboard, and commission summary. |
| **Wallet** | Deposit / withdraw requests (admin-approved), P2P transfers by invite code, QR receive, full transaction history. |
| **Admin console** | Platform KPIs, pending-approval queue (approve / reject), and a full user-management table. |
| **Profile & KYC** | Personal info, achievements, KYC status, security settings. |
| **Notifications** | Referral / money / promo / security feed with read state. |

## 🧮 The poker engine

Pure, dependency-free TypeScript in [`src/lib/poker`](src/lib/poker):

- `cards.ts` — card model, parsing (`"As Kd"`), deck utilities.
- `handRank.ts` — 5-card hand scoring packed into a single comparable integer.
- `evaluator.ts` — best hand for Hold'em (best 5 of 7) and Omaha (exactly 2 hole + 3 board).
- `equity.ts` — multi-player equity via **exact enumeration** or **seeded Monte Carlo**.
- `odds.ts` — outs counting, draw probabilities, pot-odds / break-even.

Covered by **45 unit tests** (93%+ engine coverage), including known benchmarks
(AA vs KK ≈ 82/18) and Omaha's "exactly two hole cards" rule.

```ts
import { calculateEquity, parseCards } from "@/lib/poker";

calculateEquity({
  game: "holdem",
  players: [{ hole: parseCards("Ac Ad") }, { hole: parseCards("Kc Kd") }],
}); // → Player 1 ≈ 0.82 equity
```

## 🚀 Getting started

```bash
npm install
npm run dev          # http://localhost:3000
```

The app runs **out of the box** with an in-memory, seeded data source — no
database required. On the login screen, use the one-click **Player / Agent**
demo logins to explore each perspective. There's no one-click admin demo —
the seeded admin account (`semebitcoin@gmail.com`) gets a random password
printed to the server console on boot (`[data] In-memory driver: generated
admin password for ...`), by design, so a real credential is never bundled
into client JS or checked into source control.

### Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm test` | Run the Vitest suite |
| `npm run test:coverage` | Tests + engine coverage report |
| `npm run typecheck` | `tsc --noEmit` |

## 🗄️ Switching to Supabase

The app talks to data only through the [`Repository`](src/lib/data/repository.ts)
interface. The default driver is in-memory; a persistent Supabase backend is
ready via the schema in [`supabase/migrations/`](supabase/migrations/).

```bash
cp .env.example .env.local
# set NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY and DATA_DRIVER=supabase
```

The role model (a user sees themselves; an agent sees their whole downline
subtree; an admin sees everyone) is enforced in the app layer
(`SupabaseRepository`'s `assertUpline`/`assertAdmin`/`assertTransferAllowed`),
not by Postgres RLS. RLS is enabled on every `pa_*` table but has zero
policies attached, so it acts as a fail-closed backstop — only the
server-only service-role client (which bypasses RLS) can reach these tables
at all; there is currently no path where an authenticated Supabase session
queries them directly.

## 🎴 ClubGG integration

Poker Agent is built to manage a **[ClubGG](https://www.clubgg.com/)** club
(the social-poker app powered by GGPoker). ClubGG has **no public management
API**, so Poker Agent is your **book of record** — players, balances, rake and
referrals live here, and chip top-ups are mirrored in the ClubGG agent panel.

The platform's model maps directly onto ClubGG's:

| ClubGG concept | Poker Agent |
|---|---|
| Club ID players enter to join | `NEXT_PUBLIC_CLUBGG_CLUB_ID` + the **Join Club** card |
| Agent / superagent / subagent | the referral tree (`player` → `agent` → agent-of-agent) |
| Agent sets chip balance | wallet ledger (deposit/withdraw approvals, transfers) |
| Rake chain: union → club → agent → player | configurable `rakeSplit` + commission |
| In-app member id / nickname | `clubggId` / `clubggNickname` on each user |

Configure your club in [`src/lib/clubgg.ts`](src/lib/clubgg.ts) or via env
(`NEXT_PUBLIC_CLUBGG_*`). Set your real numeric **Club ID** to replace the
placeholder shown on the Join-Club card and admin settings.

## 🧱 Tech stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · Recharts ·
Vitest · Supabase (optional).

## 🔒 Security

Password hashing (scrypt), signed sessions, rate-limited auth, server-side
authorization on every mutation, atomic Postgres functions for all
balance-affecting operations, and locked-down database access — see
[SECURITY.md](SECURITY.md) for the full architecture and how to report a
vulnerability.

## 🎨 Design

"Luxury felt" — emerald-green table felt, antique-gold accents, deep near-black
surfaces. Tokens live in [`src/app/globals.css`](src/app/globals.css). Reference
mockups are in [`docs/mockups`](docs/mockups).

## 🗺️ Roadmap

- **AI Poker Coach** (live hand reader / real-time table assistant from the mockups) — a separate ML milestone.
- Agent commission payout automation.
- CI pipeline running `typecheck` / `test` / `build` on every pull request.

## ⚠️ Disclaimer

For management and educational use. Configure responsible-play and legal
compliance for your jurisdiction before any production deployment. 18+.
