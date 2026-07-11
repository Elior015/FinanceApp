# Household Finance App — Project Context

Private finance app for a two-person Israeli household. Not a commercial product — security/privacy of two people's real bank data is the top priority. Full architecture, schema rationale, and the milestone roadmap live in the plan file: `~/.claude/plans/we-are-building-a-wild-crab.md`. This file is the fast-orientation doc — read that plan file for the "why," this file for "what's actually true right now."

## Fixed stack (do not change)
`israeli-bank-scrapers` (ingestion) · GitHub (VCS) · Vercel (deploy, web only) · Supabase (DB + auth).

## Repo layout
```
apps/web        Next.js 16 (App Router), deployed to Vercel — UI only, holds no secrets beyond the public anon key
apps/agent      Node 22 CLI/daemon — runs on the home box, holds bank credentials + Supabase service-role key
packages/shared Zod schemas for scraper data, dedup-hash logic, category seed, constants — imported by both apps
supabase/       migrations/ (SQL, source of truth) + seed.sql
```

## Environment on this dev machine (not the production home box)
- No Homebrew, no nvm. Node 22.13.0 is installed manually at `~/.local/node` (tarball from nodejs.org), symlinked from `~/.local/node-v22.13.0-darwin-arm64`. `pnpm` was installed via `npm install -g pnpm@9 --prefix ~/.local/node` (corepack is broken in this environment — its signature verification fails against the current npm registry keys, so don't use `corepack prepare`/`corepack enable`).
- `export PATH="$HOME/.local/node/bin:$PATH"` is appended to `~/.zshrc`. New shells pick it up automatically; if a command says "command not found: node/pnpm", export it manually for that shell.
- Docker Desktop is installed and used for one-off local Postgres validation of migrations (see below). It is not always running — `open -a Docker` and poll `docker info` if needed.

## Live infrastructure (already provisioned — do not recreate)
- **Supabase project**: `gdvutebllsocdaefcarj`, region `eu-central-1`, org `EliorZ Org` (only org available), free tier.
- Migration `20260710120000_initial_schema.sql` is applied, including a fix folded directly into that file: `accounts_connection_provider_number_idx` is a **plain** unique index, not partial — see "Real bugs found by actually running this" below for why. The three follow-up hardening migrations applied live via MCP (`harden_functions`, `harden_functions_v2`, `lock_down_signup_allowlist`) are now also captured as files in `supabase/migrations/` (`20260710145659_harden_functions.sql`, `20260710145741_harden_functions_v2.sql`, `20260710150009_lock_down_signup_allowlist.sql`), reconstructed verbatim from `supabase_migrations.schema_migrations` and verified against live grants/RLS state — applying them again would be a no-op.
- Seeded: `household_signup_allowlist` has Elior's real email only (wife's email is still a placeholder in `supabase/seed.sql` — ask before/if seeding it for real). One household row, 49 categories (12 parent + 37 child).
- `apps/web/.env.local` has the real project URL + publishable anon key. `apps/agent/.env` has the real service-role key (gitignored — never in `.env.example`, which is tracked; watch for this exact mistake, it happened once already in this project).
- **Real data now lives in the DB**: one auth user (Elior, `elior015@gmail.com`, no password set yet — see bootstrap script below), one `household_members` row, one `connections` row for Max, 2 `accounts`, 56 real `transactions`. This is genuine household financial data from a live scrape, not a fixture.
- **M1 backend**: `public.resolve_pending_transactions(household_id)` and `public.apply_rules(household_id)` SQL functions are live (migrations `20260711221000`/`20260711223000`), wired into `apps/agent/src/sync.ts` right after the per-account upsert loop. Both proven against real Max data plus a synthetic pending/completed pair and a synthetic rule (inserted and cleaned up via MCP — real data was untouched: still 56 transactions / 2 accounts / 0 rules afterward).
- **M1 web app**: shadcn/ui + TanStack Query + Recharts installed; responsive nav shell (`(app)` route group — desktop sidebar / mobile bottom tabs) wraps Dashboard (`/`), Transactions, Budgets, and Sync Health pages. PWA manifest + svg icon added. Sync Health's "Sync now" button inserts a `sync_requests` row that `apps/agent/src/daemon.ts` (new polling loop, ~30s interval) picks up — the daemon must be running (`pnpm exec tsx src/daemon.ts`) for that button to do anything.

## Known gaps / TODO
- `supabase/seed.sql` still has `REPLACE_WITH_WIFES_EMAIL@example.com` as a placeholder — the user chose to skip providing it for now.
- **Elior's auth account still has no password set.** This is now the single blocker on actually clicking through the M1 UI (Transactions/Dashboard/Budgets/Sync Health) in a browser — everything up to the login wall has been verified (dev server boots, unauthenticated routes correctly redirect to `/login`, `/login` itself renders 200, `/manifest.json` is publicly reachable). The assistant deliberately did not mint a session via the Supabase admin API to bypass this — the plan explicitly calls for Elior to set his password via Supabase's real password-reset-via-email flow, and that's a real-account auth action that should go through the user, not be silently automated. Once a password is set, sign in at `/login` and click through each M1 page for real.
- M0 field-audit / real sync has only been proven for **Max** (see below). Hapoalim, Leumi, Isracard are still pending — the user deferred them.
- The Sync Health "Sync now" button only does something while `apps/agent/src/daemon.ts` is actually running in a terminal — it's not a systemd service yet (that's real-home-box deployment, out of M1 scope by design, see the plan).

## `israeli-bank-scrapers` — real facts (verified from source + a live scrape, not assumed)
- The repo's own `package.json` `version` field is a stale placeholder ("1.0.4"). The real published npm `latest` is **6.8.0**. Pin `^6.8.0`, not `^1.0.4`.
- API is two calls, not one: `const scraper = createScraper(options); const result = await scraper.scrape(credentials);`
- `CompanyTypes` enum values used: `hapoalim`, `leumi`, `max`, `isracard` (all string-valued, matching their key names).
- Credential fields per provider (`SCRAPERS` map in the library): Hapoalim `userCode+password`, Leumi `username+password`, Max `username+password`, Isracard `id+card6Digits+password`.
- Error enum (`ScraperErrorTypes`): `TWO_FACTOR_RETRIEVER_MISSING | INVALID_PASSWORD | CHANGE_PASSWORD | TIMEOUT | ACCOUNT_BLOCKED | GENERIC | GENERAL_ERROR` — note `GENERAL_ERROR`, not `UNKNOWN_ERROR`.
- **Every field the library's TS types mark `optional` should be treated as nullable too** (`.nullish()` in Zod, not `.optional()`). Proven by a real M0 field-audit scrape against Max: `identifier` came back as explicit `null` on 7 of 56 transactions, not omitted — this is not reflected in the library's own `.d.ts` files. `packages/shared/src/transaction.ts` already reflects this; if you touch that schema, keep every field nullish.
- Corollary bug class to watch for: anywhere code checks "is this field present" using `!== undefined` alone, it will wrongly treat `null` as present (e.g. `String(null)` → the literal string `"null"`, silently corrupting a dedup key). Always check both — see `hasIdentifier()` in `packages/shared/src/dedup.ts` for the pattern, and `fieldAudit.ts`'s own report had this exact bug once (fixed).
- `TransactionsAccount` also carries `balanceDate`, `cardFrame` (credit-card cycle limit — useful for billing-cycle reconciliation later), `cardType`.
- `ScraperScrapingResult` also returns a top-level `futureDebits[]` array (separate from `accounts[].txns`) — some known future charges are reported directly by the library, not just inferable from installments.

## Next.js 16 — real facts (verified from bundled docs, not assumed)
- `middleware.ts` is **deprecated and renamed to `proxy.ts`** (function renamed `middleware` → `proxy`). The app's session-refresh logic lives at `apps/web/src/proxy.ts`, not `middleware.ts`. Don't recreate a `middleware.ts` file.
- `cookies()` from `next/headers` is still async (unchanged from 15).
- `searchParams`/`params` in `page.tsx` are still `Promise<...>`, must be awaited.
- Server Actions still work the same (`"use server"` directive) — Next 16 just renamed the umbrella term to "Server Functions"; no code-level change.
- If something Next-related looks off, check `apps/web/node_modules/next/dist/docs/` before assuming training-data knowledge is current — `apps/web/AGENTS.md` (auto-generated by create-next-app) says exactly this.

## Security-critical conventions — don't relax these
- **RLS on every table, no exceptions except `exchange_rates`** (public market data, explicitly documented in the migration). Every household-scoped table gets the same 4 policies via `public.is_member(household_id)`, applied through a single `DO $$ ... $$` loop in the migration — don't hand-write one-off policies per table.
- **Dedup identity** (`packages/shared/src/dedup.ts`): SHA-256 over `provider|id|<identifier>` when a real identifier exists, else a composite fallback key with an occurrence-ordinal for same-day duplicates. Never touch category/tags/notes columns on upsert — only scraper-owned columns are included in the upsert payload, which is what keeps re-scrapes idempotent without clobbering manual edits.
- **Bank credentials never enter this repo, Supabase, or the assistant's conversation.** They're stored AES-256-GCM encrypted at `~/.household-finance-agent/credentials.enc` via `apps/agent`'s CLI (`creds set`). When a human needs to type a real bank password during a Claude Code session, they should run the command themselves via the `!<command>` prefix (runs in their own terminal, only non-secret output returns to the conversation) — never paste a password into a chat message.
- **Redacting logger** (`apps/agent/src/log/logger.ts`): every credential value gets registered via `registerSecret()` the moment it's loaded, and all log output is scrubbed against that registry before printing — because scraper errors can embed raw page content.

## Real bugs found by actually running this (not caught by typecheck/lint/tests)
- **Partial unique index breaks Supabase upsert.** `accounts` originally had `unique index ... (connection_id, provider_account_number) WHERE connection_id IS NOT NULL` (needed since `connection_id` is nullable for manual_asset accounts). Supabase's `.upsert(data, {onConflict: 'col,col'})` goes through PostgREST, which emits a plain `ON CONFLICT (columns)` with no predicate — Postgres can only match that against a **non-partial** unique index/constraint, so every real upsert failed with "no unique or exclusion constraint matching the ON CONFLICT specification". Fixed by dropping the `WHERE` clause; standard SQL already treats `NULL` as distinct from `NULL` in a unique index, so multiple manual_asset rows still don't collide. **Lesson: if you ever add another partial unique index that Supabase's `.upsert()` needs to target, it won't work — either make it non-partial (verify NULL semantics cover your case first) or upsert via a raw RPC/SQL function instead.**
- **`.env` vs `.env.example` mixup.** The real service-role key was once pasted into the tracked `.env.example` instead of the gitignored `.env`. Caught before any commit existed (repo had zero commits at the time), moved to the correct file. Worth double-checking any time secrets are being placed into env files in this repo.
- **Nothing loads `.env` automatically.** `apps/agent` has no dotenv package; `process.loadEnvFile()` (built into Node ≥20.6, no dependency needed) is called at the top of `cli.ts` and of any standalone script (like `scripts/bootstrap-max-connection.ts`) that touches Supabase — if you add a new entry point that needs env vars, don't forget this, wrapped in try/catch since `creds`/`audit` shouldn't hard-fail without one.

## Gotcha specific to this assistant/tool pipeline
Writing literal invisible/control Unicode characters (bidi marks, Ctrl+C, DEL, etc.) directly into a file via the Write/Edit tools has silently produced corrupted bytes multiple times in this project (e.g. a stray `\x01` where a `\x1f` separator was intended). **Never embed a control character as a literal glyph in source.** Always construct it from its numeric code point in the code itself (`String.fromCharCode(31)`, a `Set` of codepoints, etc.), and if in doubt, verify a file with a byte-level scan before trusting it — see the pattern used throughout `packages/shared/src/normalize.ts` and `apps/agent/src/cli/prompt.ts`.

## Commands
```bash
pnpm install                      # from repo root
pnpm typecheck / pnpm lint / pnpm test    # workspace-wide, --if-present so partial packages don't fail the run

# agent (from apps/agent/)
pnpm exec tsx src/cli.ts creds set <ref> <provider>     # interactive, hidden input for secrets
pnpm exec tsx src/cli.ts creds list
pnpm exec tsx src/cli.ts audit <ref> <provider> [--start-date YYYY-MM-DD] [--show-browser]  # M0 dry-run, no DB writes
pnpm exec tsx src/cli.ts sync <connectionId> [--start-date YYYY-MM-DD] [--show-browser]      # writes to Supabase (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in apps/agent/.env)
pnpm exec tsx src/daemon.ts                              # M1: polls sync_requests every ~30s, runs syncConnection() for claimed rows — this is what makes the web app's "Sync now" button actually do something; no systemd unit yet, run it manually in a terminal while testing

# web (from apps/web/)
pnpm dev                                                 # Next dev server, needs NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local
```

## Provider/connection refs already in use
`max-main` — credentials stored locally on this dev machine (AES-256-GCM encrypted). Field-audited AND synced for real: connection id `7f694c90-9a27-4fdc-b1e8-03478a9af3cc`, 2 accounts, 56 real transactions live in Supabase, re-sync proven idempotent (identical row/hash counts across two runs). This was a deliberate, user-approved exception: the architecture calls for bank credentials to live only on the home box, but the user chose to test on this dev machine temporarily for the M0 gate. Don't assume this dev machine is the production location.

Bootstrapped via `apps/agent/scripts/bootstrap-max-connection.ts` (one-off, not part of the permanent CLI): creates Elior's `auth.users` row (no password — admin API, `email_confirm: true`), a `household_members` row, and the `connections` row above. Re-running it would try to create a second auth user for the same email and fail — it's not meant to be idempotent, just a stand-in for a real signup flow that doesn't exist yet.
