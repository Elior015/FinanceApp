# Net Worth Dashboard — Design Spec

## Context

M2 ("credit-card brain + net worth", per `~/.claude/plans/we-are-building-a-wild-crab.md`) bundles several independent subsystems: billing-cycle reconciliation, transfer detection, installment forward-liability, manual assets + net worth, multi-currency polish, tags/export, merchant_map, data-lifeboat backup.

Billing-cycle reconciliation and transfer detection were the original first pick, but both fundamentally depend on matching a credit-card purchase against the **bank-side debit** that pays the card off. Live data check (2026-07-12) confirmed only two Max credit-card accounts exist — no bank checking account has been synced (Hapoalim/Leumi still deferred from M0). A `connections` row for Hapoalim (`id afe47c26-31e4-4a46-abf2-5953c9c6de77`, `credential_ref hapoalim-main`, `status needs_attention`) was created in anticipation, but the user does not have the wife's Hapoalim credentials on hand. That row stays as a harmless placeholder; billing-cycle/transfer-detection work is deferred until a bank account is actually synced.

This spec instead covers the **net worth dashboard** sub-project: manual assets + installment forward-liability + a dedicated Net Worth page. This piece works fully against existing data (or the lack of it, in the installment case — see Known Limitations).

## Current state (verified live, 2026-07-12)

- `v_net_worth` view already exists (from the initial schema migration) and is already read by the M1 dashboard card:
  ```sql
  SELECT household_id, id AS account_id, display_name, kind, currency,
    COALESCE(latest_balance, 0) AS scraped_balance,
    COALESCE((SELECT s.value FROM asset_snapshots s WHERE s.account_id = a.id ORDER BY s.as_of DESC LIMIT 1), 0) AS latest_manual_value,
    COALESCE((SELECT sum(ip.remaining_count * ip.monthly_amount) FROM installment_plans ip WHERE ip.account_id = a.id), 0) AS remaining_installment_liability
  FROM accounts a;
  ```
- `installment_plans`: 0 rows. `asset_snapshots`: 0 rows. Both view inputs currently always resolve to 0.
- 56 real Max transactions exist; **none** have `installment_total` set — no real installment purchase has occurred yet.
- `accounts.kind` already supports `'manual_asset'` per schema (used by `v_net_worth`'s `kind` column), no migration needed for that part.

## Scope decisions (confirmed with user)

1. Build a **dedicated Net Worth page** (`/net-worth`), not just a data fix behind the existing dashboard card.
2. **Current point-in-time breakdown only** — no history/trend chart this cycle (app has 1 day of data; a trend chart would be meaningless yet). `asset_snapshots` still stores one row per update, so history exists in the data for a future cycle to chart.
3. **Assets only**, no manual liabilities (e.g. mortgage) this cycle — matches original plan wording (keren hishtalmut, pension, brokerage). Liabilities can be a small follow-on extension later if wanted.

## Design

### 1. Backend: manual asset CRUD

- Server Actions in `apps/web/src/app/(app)/net-worth/actions.ts`:
  - `createManualAsset({ displayName, currency, initialValue, asOf })` — two sequential RLS-scoped inserts: `accounts` row (`kind='manual_asset'`, `connection_id=null`) then `asset_snapshots` row referencing it. No wrapping RPC needed — both are insert-only with no partial-failure risk (if the second insert fails, an orphan manual-asset account with no snapshot is a harmless, visibly-empty row, not corrupted data).
  - `updateAssetValue(accountId, { value, asOf })` — inserts a **new** `asset_snapshots` row (never mutates existing ones — preserves history for a future trend chart).
  - No delete this cycle — out of scope, matches "assets only, keep simple."

### 2. Backend: installment forward-liability

New SQL function `public.sync_installment_plans(p_household_id uuid)`, added via a new migration (e.g. `20260712120000_installment_plans_sync.sql`). Called from `apps/agent/src/sync.ts` in the same pipeline position as `resolve_pending_transactions`/`apply_rules` (M1 pattern) — after upsert, per account.

Matching logic:
- Scans `transactions` where `installment_total IS NOT NULL`.
- Groups by `(account_id, description, installment_total)` as the natural key for "same installment plan" — description + total_count is the best available stable signal since transaction IDs are already deduped per-occurrence.
- For each group: `monthly_amount = charged_amount` of the row with the **highest `installment_number` seen** (most recent occurrence — if a provider ever revises a plan's amount mid-cycle, the latest charge is the more trustworthy figure; if all rows agree, as expected, this is a no-op distinction), `total_amount = monthly_amount * installment_total`, `remaining_count = installment_total - max(installment_number)` seen so far, `origin_transaction_id` = the transaction with the lowest `date` in the group (handles backfill windows that start mid-plan, i.e. installment #1 might be outside the scraped date range). The unit tests assert the equal-amounts case explicitly, so any real-world mismatch discovered later is a deliberate, visible design choice to revisit — not silent breakage.
- Upserts one `installment_plans` row per group (`ON CONFLICT` on a new unique index `(account_id, description, installment_total)`) — idempotent, safe to rerun like the rest of the M1 pipeline functions.
- Rows are **never deleted** — a plan with `remaining_count = 0` stays as history; the UI filters to `remaining_count > 0` for the "committed future charges" view.

### 3. Web: Net Worth page

New route `apps/web/src/app/(app)/net-worth/page.tsx`, added to `NAV_LINKS` (sidebar + bottom nav).

- **Top stat card**: total net worth — same formula as today's dashboard card (`sum(scraped_balance + latest_manual_value - remaining_installment_liability)` across `v_net_worth`), reusing the existing `PageHeader` pattern.
- **Breakdown list**: one card per `v_net_worth` row — bank/card scraped balance, manual assets (with an inline "update value" button opening a dialog), sign-flipped installment liability shown as a negative line, not a separate account row.
- **"Add manual asset" dialog**: name, currency (default ILS, reusing the existing `<select>` pattern from other dialogs), initial value, `as_of` date (default today) → `createManualAsset`.
- **"Committed future charges" widget**: card listing active installment plans (`remaining_count > 0`) — merchant description, monthly amount, remaining count, projected payoff date (`today + remaining_count months`, simple estimate, not calendar-precise). Reads `installment_plans` directly, no new view needed.
- Existing dashboard net-worth card stays as-is (small summary card), gets a "View details" link to `/net-worth`.
- All raw merchant/description text stays inside `<bdi>` per the project's Hebrew-text-safety convention; amounts stay in separate `dir="ltr"` elements — consistent with every other page in the app.

## Known limitations (stated plainly, not hidden)

- **Installment logic is unverified against real data.** No real installment transaction exists in the 56 live Max rows. `sync_installment_plans` ships tested only against synthetic fixtures (multiple installment numbers across two sync runs, a fixture simulating a backfill window that starts mid-plan). The first real installment purchase is the actual proof — flag this in `CLAUDE.md`'s "Known gaps" once this ships, same as the M0 field-audit gaps are flagged today.
- **No net-worth history/trend yet** — by design this cycle (see Scope decisions above). `asset_snapshots` already accumulates history, so a future cycle can chart it without a schema change.
- **Manual liabilities out of scope** this cycle.

## Verification approach

- `pnpm typecheck && pnpm lint && pnpm test` after each backend/schema change (existing repo-wide pattern).
- New migration validated against local Docker Postgres first, then applied live via Supabase MCP `apply_migration`, then `get_advisors` re-checked clean (M0/M1 pattern).
- `sync_installment_plans` unit-tested against synthetic fixtures covering: normal multi-occurrence plan, backfill window missing installment #1, re-run idempotency (same input twice → same row, no duplicates).
- Manual asset CRUD exercised live against real Supabase (low risk — new rows in existing RLS-covered tables, no synthetic fixture needed).
- End-to-end manual pass: sign in, add a manual asset, confirm net worth total updates on both `/net-worth` and the dashboard card, confirm RLS still blocks a non-member (reuse the existing RLS test pattern from M0/M1).
