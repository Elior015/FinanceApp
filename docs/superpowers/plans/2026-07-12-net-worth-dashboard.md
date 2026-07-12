# Net Worth Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a dedicated Net Worth page showing account balances + manual assets + installment forward-liability, backed by a new SQL function that populates the (currently empty) `installment_plans` table from transaction data.

**Architecture:** Two independent layers. (1) Agent-side: a new SQL function `sync_installment_plans` wired into the existing sync pipeline (same pattern as `resolve_pending_transactions`/`apply_rules`), populating `installment_plans` from transactions carrying installment metadata. (2) Web-side: a new `/net-worth` route (Server Component + Server Actions, no new client-state library) reading the already-existing `v_net_worth` view plus the newly-populated `installment_plans` table, with two small dialogs for manual-asset CRUD.

**Tech Stack:** Next.js 16 App Router (Server Actions), Supabase (Postgres + RLS + PostgREST), existing shadcn/ui components (Card/Button/Input/Label/Dialog), Node 22 agent (`@supabase/supabase-js`), plain SQL/plpgsql functions (no ORM).

## Global Constraints

- RLS already covers every table this plan touches (`accounts`, `asset_snapshots`, `installment_plans`) via the existing `is_member(household_id)` policy loop from the initial migration — **no new RLS policies needed**, verify this via `get_advisors` after the migration, don't add policies speculatively.
- Every raw merchant/description string renders inside `<bdi>`; amounts always in a separate `dir="ltr"` element — existing project-wide convention, applies to the new committed-future-charges widget too.
- Money columns are `numeric(14,2)` already — no schema change to precision.
- New migrations get applied live via the Supabase MCP `apply_migration` tool (project id `gdvutebllsocdaefcarj`), then `get_advisors` re-checked clean — matches the M0/M1 pattern already used for `resolve_pending_transactions`/`apply_rules`.
- `pnpm typecheck && pnpm lint && pnpm test` (run from repo root, `--if-present`) must pass after every task.
- No manual liabilities and no net-worth history/trend chart this cycle — explicit scope decisions from the spec (`docs/superpowers/specs/2026-07-12-net-worth-dashboard-design.md`), don't add them speculatively.
- Installment-plan logic ships **unverified against real data** (0 of the 56 real Max transactions have `installment_total` set) — this is a stated, accepted limitation, not a blocker; verification here uses synthetic fixtures inserted/cleaned up live via the Supabase MCP.
- Bank credentials are never touched by this plan — no scraper/credential code is in scope.

---

### Task 1: Installment forward-liability backend

**Files:**
- Create: `supabase/migrations/20260712120000_sync_installment_plans.sql`
- Create: `apps/agent/src/pipeline/installmentPlans.ts`
- Modify: `apps/agent/src/sync.ts:1-9` (imports), `apps/agent/src/sync.ts:81-108` (pipeline call + log line)

**Interfaces:**
- Produces: `syncInstallmentPlans(supabase: SupabaseClient, householdId: string): Promise<number>` — called by `sync.ts`; the `installment_plans` table it populates is consumed by Task 2's Net Worth page (`v_net_worth.remaining_installment_liability` and a direct `installment_plans` query).
- Consumes: existing `transactions` table columns `account_id`, `description`, `installment_number`, `installment_total`, `charged_amount`, `date` (all already present, no schema change).

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/20260712120000_sync_installment_plans.sql`:

```sql
-- Installment forward-liability sync (M2). Populates `installment_plans`
-- from transactions carrying `installment_number`/`installment_total`
-- (scraped with combineInstallments:false per the plan, so each monthly
-- charge is its own transaction row). Groups transactions by
-- (account_id, description, installment_total) as the natural key for
-- "same installment plan" -- transaction ids are already deduped
-- per-occurrence, so there's no better stable identifier available.
--
-- monthly_amount/total_amount are stored as POSITIVE magnitudes
-- (abs(charged_amount)), not the signed convention used elsewhere in
-- `transactions` -- these columns feed `v_net_worth.remaining_installment_
-- liability`, which is subtracted from net worth as a positive amount owed.
--
-- monthly_amount is taken from the occurrence with the HIGHEST
-- installment_number seen so far (the most recent charge) rather than
-- an arbitrary row -- if a provider ever revises a plan's amount
-- mid-cycle, the latest charge is the more trustworthy figure. In the
-- expected case (all occurrences agree), this is a no-op distinction.
--
-- origin_transaction_id is the EARLIEST transaction in the group by
-- date, not necessarily installment_number=1 -- a first-run backfill
-- window can start mid-plan (installment #1 scraped before the
-- configured start-date), so "earliest we've seen" is the only
-- available anchor, and it gets corrected on a later sync once/if an
-- earlier occurrence is discovered (can't happen with combineInstallments:
-- false backfill, but the logic handles it either way via re-upsert).
--
-- KNOWN LIMITATION: unverified against real data as of this migration.
-- Zero real installment transactions exist in the live Max data (56
-- real transactions, 0 with installment_total set) -- this logic is
-- proven only against synthetic fixtures inserted/cleaned up via the
-- Supabase MCP (see this migration's accompanying plan task). The
-- first real installment purchase is the actual proof.
create unique index if not exists installment_plans_account_desc_total_idx
  on installment_plans (account_id, merchant_description, total_count);

create or replace function public.sync_installment_plans(p_household_id uuid)
returns integer
language plpgsql
as $$
declare
  v_group record;
  v_origin_id uuid;
  v_synced_count integer := 0;
begin
  for v_group in
    select account_id, description, installment_total,
           max(installment_number) as max_installment_number,
           (array_agg(abs(charged_amount) order by installment_number desc nulls last))[1] as latest_amount
    from transactions
    where household_id = p_household_id
      and installment_total is not null
    group by account_id, description, installment_total
  loop
    select id into v_origin_id
    from transactions
    where household_id = p_household_id
      and account_id = v_group.account_id
      and description = v_group.description
      and installment_total = v_group.installment_total
    order by date asc
    limit 1;

    insert into installment_plans (
      household_id, origin_transaction_id, account_id, merchant_description,
      total_amount, total_count, monthly_amount, remaining_count
    )
    values (
      p_household_id, v_origin_id, v_group.account_id, v_group.description,
      v_group.latest_amount * v_group.installment_total, v_group.installment_total,
      v_group.latest_amount, greatest(v_group.installment_total - v_group.max_installment_number, 0)
    )
    on conflict (account_id, merchant_description, total_count)
    do update set
      origin_transaction_id = excluded.origin_transaction_id,
      total_amount = excluded.total_amount,
      monthly_amount = excluded.monthly_amount,
      remaining_count = excluded.remaining_count,
      updated_at = now();

    v_synced_count := v_synced_count + 1;
  end loop;

  return v_synced_count;
end;
$$;

-- Agent-only: called from the ingest pipeline right after apply_rules,
-- using the service-role key (which bypasses grants entirely). The web
-- app reads `installment_plans` directly via a normal RLS-scoped
-- select (already covered by the household RLS policy loop in the
-- initial migration) -- no web use case for calling this function.
revoke execute on function public.sync_installment_plans(uuid) from public, anon, authenticated;
```

- [ ] **Step 2: Apply the migration live**

Use the Supabase MCP `apply_migration` tool against project `gdvutebllsocdaefcarj` with the file contents above (name: `sync_installment_plans`). Then call `get_advisors` (type `security` and `performance`) and confirm no new findings versus the pre-migration baseline.

- [ ] **Step 3: Verify with synthetic fixtures (normal case + idempotency)**

Run via the Supabase MCP `execute_sql` tool against project `gdvutebllsocdaefcarj`:

```sql
insert into transactions (household_id, account_id, date, charged_amount, description, dedup_hash, installment_number, installment_total)
values
  ('00000000-0000-0000-0000-000000000001', '8e7d5ca6-af00-4908-af2b-29ae2a37f572', '2026-05-01', -100, 'ZZZ_TEST_INSTALLMENT_FIXTURE', 'zzz-fixture-1', 1, 3),
  ('00000000-0000-0000-0000-000000000001', '8e7d5ca6-af00-4908-af2b-29ae2a37f572', '2026-06-01', -100, 'ZZZ_TEST_INSTALLMENT_FIXTURE', 'zzz-fixture-2', 2, 3);

select public.sync_installment_plans('00000000-0000-0000-0000-000000000001');
-- expect: 1

select origin_transaction_id, merchant_description, total_amount, total_count, monthly_amount, remaining_count
from installment_plans where merchant_description = 'ZZZ_TEST_INSTALLMENT_FIXTURE';
-- expect: 1 row, total_count=3, monthly_amount=100, total_amount=300, remaining_count=1
-- expect: origin_transaction_id = the id of the 'zzz-fixture-1' row (earliest date)

select public.sync_installment_plans('00000000-0000-0000-0000-000000000001');
-- expect: 1 (still processes the group; upsert keeps it at exactly 1 row, same values — idempotent)
```

- [ ] **Step 4: Verify backfill-missing-origin scenario**

```sql
delete from transactions where dedup_hash = 'zzz-fixture-1';

select public.sync_installment_plans('00000000-0000-0000-0000-000000000001');
-- expect: 1

select origin_transaction_id, remaining_count, monthly_amount
from installment_plans where merchant_description = 'ZZZ_TEST_INSTALLMENT_FIXTURE';
-- expect: origin_transaction_id now = the id of the 'zzz-fixture-2' row
-- expect: remaining_count still 1, monthly_amount still 100 (max_installment_number seen is still 2)
```

- [ ] **Step 5: Clean up fixtures and verify real data untouched**

```sql
delete from transactions where dedup_hash = 'zzz-fixture-2';
delete from installment_plans where merchant_description = 'ZZZ_TEST_INSTALLMENT_FIXTURE';

select
  (select count(*) from transactions) as txn_count,
  (select count(*) from accounts) as account_count,
  (select count(*) from installment_plans) as installment_plans_count;
-- expect: txn_count=56, account_count=2, installment_plans_count=0
```

- [ ] **Step 6: Write the agent wrapper**

Create `apps/agent/src/pipeline/installmentPlans.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Populates installment_plans from transactions carrying installment
 * metadata. Runs once per household per sync, after applyRules — the
 * grouping key (account_id, description, installment_total) doesn't
 * depend on categorization, so ordering relative to applyRules doesn't
 * matter functionally, but it keeps the pipeline's "categorize, then
 * project forward liability" narrative in one consistent order.
 */
export async function syncInstallmentPlans(
  supabase: SupabaseClient,
  householdId: string,
): Promise<number> {
  const { data, error } = await supabase.rpc("sync_installment_plans", {
    p_household_id: householdId,
  });
  if (error) throw new Error(`sync_installment_plans failed: ${error.message}`);
  return (data as number) ?? 0;
}
```

- [ ] **Step 7: Wire into the sync pipeline**

In `apps/agent/src/sync.ts`, add the import alongside the existing pipeline imports (near line 6):

```ts
import { resolvePendingTransactions } from "./pipeline/resolve.js";
import { syncInstallmentPlans } from "./pipeline/installmentPlans.js";
```

Then in the `syncConnection` function, right after the existing `rulesApplied` line (currently line 82):

```ts
    const pendingResolved = await resolvePendingTransactions(supabase, connection.household_id);
    const rulesApplied = await applyRules(supabase, connection.household_id);
    const installmentPlansSynced = await syncInstallmentPlans(supabase, connection.household_id);
```

And update the closing log line (currently lines 105-108) to include the new count:

```ts
    logger.info(
      `sync complete for connection ${connectionId}: ${txnsAttempted} transactions processed, ` +
        `${pendingResolved} pending resolved, ${rulesApplied} categorized by rules, ` +
        `${installmentPlansSynced} installment plans synced`,
    );
```

- [ ] **Step 8: Typecheck, lint, test**

Run: `pnpm typecheck && pnpm lint && pnpm test` (from repo root)
Expected: all green, no new errors/warnings.

- [ ] **Step 9: Commit**

```bash
git add supabase/migrations/20260712120000_sync_installment_plans.sql apps/agent/src/pipeline/installmentPlans.ts apps/agent/src/sync.ts
git commit -m "Add installment forward-liability sync (sync_installment_plans)

Populates installment_plans from transactions carrying installment
metadata, wired into the agent sync pipeline after apply_rules.
Verified against synthetic fixtures via Supabase MCP (normal case,
idempotency, backfill-missing-origin) — zero real installment
transactions exist yet, so this ships unverified against real data,
same as documented in the design spec."
```

---

### Task 2: Net Worth page (manual assets + committed future charges)

**Files:**
- Create: `apps/web/src/app/(app)/net-worth/types.ts`
- Create: `apps/web/src/app/(app)/net-worth/actions.ts`
- Create: `apps/web/src/app/(app)/net-worth/add-asset-dialog.tsx`
- Create: `apps/web/src/app/(app)/net-worth/update-asset-dialog.tsx`
- Create: `apps/web/src/app/(app)/net-worth/page.tsx`
- Modify: `apps/web/src/components/nav/nav-links.ts` (full file, 15 lines)
- Modify: `apps/web/src/app/(app)/page.tsx:1-6` (import), `apps/web/src/app/(app)/page.tsx:137-141` (Net worth breakdown `CardHeader`)
- Modify: `CLAUDE.md` "Known gaps / TODO" section (append one bullet)

**Interfaces:**
- Consumes: `getHouseholdId(supabase)` from `@/lib/household`, `createClient()` from `@/lib/supabase/server`, `PageHeader` from `@/components/page-header`, existing `Card`/`Button`/`Input`/`Label`/`Dialog` components — all established in prior M1 pages, no new shared components needed.
- Produces: `createManualAsset(input: CreateManualAssetInput): Promise<void>` and `updateAssetValue(accountId: string, input: UpdateAssetValueInput): Promise<void>` Server Actions, used only within this route's own components (not consumed elsewhere).

- [ ] **Step 1: Write the row types**

Create `apps/web/src/app/(app)/net-worth/types.ts`:

```ts
export interface NetWorthRow {
  account_id: string;
  display_name: string;
  kind: "checking" | "credit_card" | "manual_asset";
  currency: string;
  scraped_balance: number;
  latest_manual_value: number;
  remaining_installment_liability: number;
}

export interface InstallmentPlanRow {
  id: string;
  merchant_description: string;
  monthly_amount: number;
  remaining_count: number;
}
```

- [ ] **Step 2: Write the Server Actions**

Create `apps/web/src/app/(app)/net-worth/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getHouseholdId } from "@/lib/household";

export interface CreateManualAssetInput {
  displayName: string;
  currency: string;
  initialValue: number;
  asOf: string;
}

export async function createManualAsset(input: CreateManualAssetInput): Promise<void> {
  const supabase = await createClient();
  const householdId = await getHouseholdId(supabase);

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .insert({
      household_id: householdId,
      connection_id: null,
      kind: "manual_asset",
      currency: input.currency,
      display_name: input.displayName,
    })
    .select("id")
    .single();
  if (accountError || !account) throw new Error(`failed to create manual asset: ${accountError?.message}`);

  const { error: snapshotError } = await supabase.from("asset_snapshots").insert({
    household_id: householdId,
    account_id: account.id,
    as_of: input.asOf,
    value: input.initialValue,
    currency: input.currency,
  });
  if (snapshotError) throw new Error(`failed to create initial snapshot: ${snapshotError.message}`);

  revalidatePath("/net-worth");
  revalidatePath("/");
}

export interface UpdateAssetValueInput {
  value: number;
  asOf: string;
}

/**
 * Inserts a NEW snapshot rather than mutating an existing one — this is
 * what preserves history for a future trend chart (out of scope this
 * cycle, but the data model shouldn't foreclose it).
 */
export async function updateAssetValue(accountId: string, input: UpdateAssetValueInput): Promise<void> {
  const supabase = await createClient();
  const householdId = await getHouseholdId(supabase);

  const { data: account, error: accountError } = await supabase
    .from("accounts")
    .select("currency")
    .eq("id", accountId)
    .single();
  if (accountError || !account) throw new Error(`asset account not found: ${accountError?.message}`);

  const { error } = await supabase.from("asset_snapshots").insert({
    household_id: householdId,
    account_id: accountId,
    as_of: input.asOf,
    value: input.value,
    currency: account.currency,
  });
  if (error) throw new Error(`failed to record asset value: ${error.message}`);

  revalidatePath("/net-worth");
  revalidatePath("/");
}
```

- [ ] **Step 3: Write the add-asset dialog**

Create `apps/web/src/app/(app)/net-worth/add-asset-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createManualAsset } from "./actions";
import { Plus, PiggyBank } from "lucide-react";

export function AddAssetDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="gap-2 gradient-primary" />}>
        <Plus className="size-4" />
        Add manual asset
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PiggyBank className="size-5 text-primary" />
            Add manual asset
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            startTransition(async () => {
              await createManualAsset({
                displayName: String(form.get("displayName")),
                currency: String(form.get("currency")),
                initialValue: Number(form.get("initialValue")),
                asOf: String(form.get("asOf")),
              });
              setOpen(false);
            });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="asset-name">Name</Label>
            <Input id="asset-name" name="displayName" required placeholder="e.g. Keren Hishtalmut" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="asset-currency">Currency</Label>
            <select
              id="asset-currency"
              name="currency"
              defaultValue="ILS"
              className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="ILS">ILS</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="asset-value">Current value</Label>
            <Input id="asset-value" name="initialValue" type="number" step="0.01" min="0" required placeholder="0.00" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="asset-as-of">As of</Label>
            <Input id="asset-as-of" name="asOf" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>

          <Button type="submit" disabled={isPending} className="gradient-primary">
            {isPending ? "Adding…" : "Add asset"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 4: Write the update-value dialog**

Create `apps/web/src/app/(app)/net-worth/update-asset-dialog.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateAssetValue } from "./actions";
import { Pencil } from "lucide-react";

export function UpdateAssetDialog({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label="Update value" />}>
        <Pencil className="size-4 text-muted-foreground" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update value</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            startTransition(async () => {
              await updateAssetValue(accountId, {
                value: Number(form.get("value")),
                asOf: String(form.get("asOf")),
              });
              setOpen(false);
            });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="update-value">New value</Label>
            <Input id="update-value" name="value" type="number" step="0.01" min="0" required placeholder="0.00" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="update-as-of">As of</Label>
            <Input id="update-as-of" name="asOf" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>

          <Button type="submit" disabled={isPending} className="gradient-primary">
            {isPending ? "Saving…" : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 5: Write the page**

Create `apps/web/src/app/(app)/net-worth/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { AddAssetDialog } from "./add-asset-dialog";
import { UpdateAssetDialog } from "./update-asset-dialog";
import { Wallet, CalendarClock } from "lucide-react";
import type { NetWorthRow, InstallmentPlanRow } from "./types";

function formatCurrency(amount: number, currency = "ILS"): string {
  return new Intl.NumberFormat("en-IL", { style: "currency", currency }).format(amount);
}

export default async function NetWorthPage() {
  const supabase = await createClient();

  const [{ data: netWorthRows }, { data: installmentPlans }] = await Promise.all([
    supabase
      .from("v_net_worth")
      .select("account_id, display_name, kind, currency, scraped_balance, latest_manual_value, remaining_installment_liability")
      .order("display_name"),
    supabase
      .from("installment_plans")
      .select("id, merchant_description, monthly_amount, remaining_count")
      .gt("remaining_count", 0)
      .order("remaining_count", { ascending: false }),
  ]);

  const rows = (netWorthRows ?? []) as unknown as NetWorthRow[];
  const plans = (installmentPlans ?? []) as unknown as InstallmentPlanRow[];

  const totalLiability = rows.reduce((sum, r) => sum + Number(r.remaining_installment_liability ?? 0), 0);
  const total =
    rows.reduce((sum, r) => sum + Number(r.scraped_balance ?? 0) + Number(r.latest_manual_value ?? 0), 0) -
    totalLiability;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Net Worth" description="Accounts, manual assets, and committed future charges">
        <AddAssetDialog />
      </PageHeader>

      <Card className="card-shadow">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardDescription className="text-sm font-medium">Total net worth</CardDescription>
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Wallet className="size-5" />
          </div>
        </CardHeader>
        <CardContent>
          <div dir="ltr" className="text-2xl font-bold tracking-tight">
            {formatCurrency(total)}
          </div>
        </CardContent>
      </Card>

      <Card className="card-shadow">
        <CardHeader>
          <CardTitle>Breakdown</CardTitle>
          <CardDescription>By account and asset type</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {rows.map((r) => (
            <div key={r.account_id} className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
              <div className="flex flex-col">
                <span className="font-medium">{r.display_name}</span>
                <span className="text-xs text-muted-foreground capitalize">{r.kind.replace("_", " ")}</span>
              </div>
              <div className="flex items-center gap-3">
                <span dir="ltr" className="font-semibold">
                  {formatCurrency(Number(r.scraped_balance) + Number(r.latest_manual_value), r.currency)}
                </span>
                {r.kind === "manual_asset" && <UpdateAssetDialog accountId={r.account_id} />}
              </div>
            </div>
          ))}
          {totalLiability > 0 && (
            <div className="flex items-center justify-between rounded-lg bg-destructive/10 p-3">
              <span className="font-medium">Installment liability</span>
              <span dir="ltr" className="font-semibold text-destructive">
                -{formatCurrency(totalLiability)}
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="card-shadow">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Committed future charges</CardTitle>
            <CardDescription>Remaining installment payments</CardDescription>
          </div>
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarClock className="size-5" />
          </div>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-3">
            {plans.map((p) => (
              <li key={p.id} className="flex items-center justify-between rounded-xl bg-muted/40 p-3 text-sm">
                <div className="flex flex-col min-w-0">
                  <bdi className="truncate font-medium">{p.merchant_description}</bdi>
                  <span className="text-xs text-muted-foreground">{p.remaining_count} payments remaining</span>
                </div>
                <span dir="ltr" className="shrink-0 font-semibold">
                  {formatCurrency(Number(p.monthly_amount))}/mo
                </span>
              </li>
            ))}
            {plans.length === 0 && <p className="text-sm text-muted-foreground">No active installment plans.</p>}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 6: Add the nav entry**

Replace the full contents of `apps/web/src/components/nav/nav-links.ts`:

```ts
import { LayoutDashboard, PiggyBank, Receipt, RefreshCw, Wallet } from "lucide-react";

export interface NavLink {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/budgets", label: "Budgets", icon: Wallet },
  { href: "/net-worth", label: "Net Worth", icon: PiggyBank },
  { href: "/sync", label: "Sync Health", icon: RefreshCw },
];
```

- [ ] **Step 7: Link the dashboard card to the new page**

In `apps/web/src/app/(app)/page.tsx`, add `Link` to the import block (currently lines 1-6):

```tsx
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { SpendingDonut, type DonutSlice } from "./dashboard-donut";
import { ArrowDownLeft, ArrowUpRight, Wallet, TrendingUp, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
```

Then replace the "Net worth breakdown" card's `CardHeader` (currently):

```tsx
        <Card className="card-shadow lg:col-span-3">
          <CardHeader>
            <CardTitle>Net worth breakdown</CardTitle>
            <CardDescription>By account and asset type</CardDescription>
          </CardHeader>
```

with:

```tsx
        <Card className="card-shadow lg:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle>Net worth breakdown</CardTitle>
              <CardDescription>By account and asset type</CardDescription>
            </div>
            <Link href="/net-worth" className="text-sm font-medium text-primary hover:underline">
              View details
            </Link>
          </CardHeader>
```

- [ ] **Step 8: Update CLAUDE.md's Known gaps section**

Append one bullet to the "Known gaps / TODO" section in `CLAUDE.md`:

```
- **Installment forward-liability (`sync_installment_plans`, migration `20260712120000`) is unverified against real data.** Zero of the 56 real Max transactions have `installment_total` set — no real installment purchase has happened yet. The function is proven only against synthetic fixtures (inserted/cleaned up live via Supabase MCP: normal multi-occurrence case, idempotency, backfill-missing-origin). The first real installment purchase is the actual proof — revisit this note once one occurs.
```

- [ ] **Step 9: Manual end-to-end verification**

Run: `cd apps/web && pnpm dev`
Then in a browser at `http://localhost:3000`:
1. Sign in, navigate to `/net-worth` via the sidebar/bottom nav.
2. Confirm the page loads with the two existing Max card accounts listed and a "No active installment plans" message (real `installment_plans` is empty per Task 1's cleanup).
3. Click "Add manual asset", fill in name "Test Savings", currency ILS, value 1000, today's date, submit.
4. Confirm the new row appears in the breakdown with an "update value" pencil icon, and the total net worth increased by 1000.
5. Click the pencil, update the value to 1500, submit — confirm the breakdown shows 1500 and total net worth updated accordingly (not 2500 — this catches the "insert new snapshot vs. double-count" class of bug).
6. From the Dashboard (`/`), confirm the "Net worth breakdown" card shows a working "View details" link back to `/net-worth`.
7. Delete the "Test Savings" test account and its snapshots afterward via the Supabase MCP `execute_sql` tool (`delete from asset_snapshots where account_id = '<id>'; delete from accounts where id = '<id>';`) so real household data stays clean — no "Test Savings" account should remain.

Expected: all of the above behave as described; no console errors in the browser dev tools during the walkthrough.

- [ ] **Step 10: Typecheck, lint**

Run: `pnpm typecheck && pnpm lint` (from repo root)
Expected: all green, no new errors/warnings. (No `pnpm test` addition needed — `apps/web` has no test runner configured, consistent with every prior M1 page; verification is the manual pass in Step 9.)

- [ ] **Step 11: Commit**

```bash
git add apps/web/src/app/\(app\)/net-worth apps/web/src/components/nav/nav-links.ts apps/web/src/app/\(app\)/page.tsx CLAUDE.md
git commit -m "Add Net Worth page: manual assets + committed future charges

New /net-worth route reads the existing v_net_worth view plus
installment_plans (populated by Task 1's sync_installment_plans).
Manual asset CRUD via two Server Actions; asset value updates insert
a new snapshot rather than mutating history, so a future trend chart
has data to work with. Dashboard's net-worth card links through."
```
