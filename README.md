# Household Finance

A private finance app for a two-person household: it scrapes Israeli bank/credit-card accounts, categorizes transactions, and gives a unified view of cash flow, budgets, and net worth. Not a commercial product — built for personal use by one household.

## Stack

- **Ingestion**: [`israeli-bank-scrapers`](https://github.com/eshaham/israeli-bank-scrapers), run by a Node CLI/daemon on an always-on home machine (needs headless Chromium — can't run on serverless).
- **Database/Auth**: Supabase (Postgres + RLS + Auth).
- **Web app**: Next.js (App Router), deployed to Vercel.
- **Package manager**: pnpm workspaces (monorepo).

## Repo layout

```
apps/web        Next.js app (Vercel) — UI only, never holds bank credentials or the Supabase service-role key
apps/agent      Node CLI/daemon (home machine) — holds encrypted bank credentials + the Supabase service-role key
packages/shared Shared types/schemas, dedup-hash logic, category seed — used by both apps
supabase/       SQL migrations (source of truth for the schema) + seed data
```

Architecture rationale, the full Supabase schema design, and the milestone roadmap are documented in detail elsewhere (see `CLAUDE.md` for a pointer). `CLAUDE.md` at the repo root also tracks environment-specific setup notes and gotchas discovered while building this — worth reading before making non-trivial changes.

## Setup

**Requirements**: Node ≥ 22.13, pnpm 9.

```bash
pnpm install
```

### Environment variables

**`apps/web/.env.local`** (public — safe for the browser; RLS is what actually protects data):
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

**`apps/agent/.env`** (secret — bypasses RLS entirely, never commit, never put on Vercel):
```
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
```

See `.env.example` in each app for the full list.

### Database

The schema lives in `supabase/migrations/` (apply via the Supabase CLI or dashboard) and `supabase/seed.sql` (category tree + signup allowlist — fill in real household emails before running against a project with signups enabled).

### Deploy to Vercel

1. Create a project in the [Vercel dashboard](https://vercel.com).
2. Set **Root Directory** to `apps/web`.
3. Add the environment variables from `apps/web/.env.example` in the dashboard.
4. `NEXT_PUBLIC_*` values are baked in at build time — if you rotate them, redeploy.
5. The agent (`apps/agent`) must **not** run on Vercel; it stays on the home box.

## Running things

```bash
# Workspace-wide checks
pnpm typecheck
pnpm lint
pnpm test

# Web app
pnpm --filter web dev

# Agent — store credentials for one bank/card connection (interactive, hidden input for secrets)
cd apps/agent
pnpm exec tsx src/cli.ts creds set <ref> <provider>      # provider: hapoalim | leumi | max | isracard
pnpm exec tsx src/cli.ts creds list
pnpm exec tsx src/cli.ts creds remove <ref>

# Agent — dry-run a scrape without writing to the database (useful for verifying a connection)
pnpm exec tsx src/cli.ts audit <ref> <provider> [--start-date YYYY-MM-DD] [--show-browser]

# Agent — real sync, writes to Supabase
pnpm exec tsx src/cli.ts sync <connectionId> [--start-date YYYY-MM-DD] [--show-browser]
```

## Security notes

- Bank credentials are encrypted at rest (AES-256-GCM) in the agent's local data directory and are never sent to Supabase or Vercel — only a reference name is stored in the database.
- The Supabase service-role key (which bypasses Row Level Security) lives only in the agent's environment, never in the web app.
- Row Level Security is enabled on every table; a non-member of the household sees zero rows anywhere.
- If you ever need to type a real bank password during an assisted coding session, prefer running the command yourself directly in your terminal rather than pasting the password into a chat message.
