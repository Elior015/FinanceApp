# M3 — Intelligence: Anomaly Detection (Phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first M3 capability — automatic anomaly detection that runs after every sync, writes findings to the existing `anomalies` table, and surfaces them in a new "Insights" page where each anomaly can be acknowledged or dismissed. Also push sync-failure / anomaly notifications to a self-hosted or free ntfy topic so the household gets alerted without checking the app.

**Scope cut for Phase 1:**
- Implement the five anomaly kinds already declared in the schema: `unusual_amount`, `possible_duplicate`, `subscription_increase`, `missed_recurring`, `balance_drift`.
- Wire detection into the agent sync pipeline (after `syncInstallmentPlans`).
- Build the web UI: new `/insights` route, nav entry, list cards with acknowledge/dismiss actions.
- Add agent-side ntfy push for `sync_runs.status != 'success'` and any newly opened `anomalies` row.

**Out of scope for Phase 1 (later M3 phases):**
- Recurring/subscription detection and confirmation UI.
- Cash-flow forecast 30/60/90.
- Safe-to-Spend number.
- Month-close report.
- Budget rollover.

**Tech Stack:** Next.js 16 App Router + Server Actions, Supabase Postgres/plpgsql, existing shadcn/ui components, Node 22 agent, ntfy.sh HTTP API (no token needed for a public topic; a private topic can be used if the user provides one).

---

## Global Constraints

- RLS already covers every table touched (`anomalies`, `accounts`, `transactions`, `sync_runs`) via the existing `is_member(household_id)` policy loop from the initial migration — **no new RLS policies needed**. Verify via `get_advisors` after each migration.
- Every raw merchant/description string renders inside `<bdi>`; amounts always in a separate `dir="ltr"` element.
- Money columns stay `numeric(14,2)`.
- New migrations applied live via Supabase MCP `apply_migration` (project `gdvutebllsocdaefcarj`), then `get_advisors` re-checked.
- `pnpm typecheck && pnpm lint && pnpm test` must pass after every task.
- Bank credentials are untouched; no scraper code is in scope.
- Anomaly detection must be **idempotent** — re-running it on unchanged data must not create duplicate open rows. Use upsert/DO UPDATE on conflict keyed by `(household_id, kind, transaction_id / account_id / merchant_key)` as appropriate.

---

## Task 1: Anomaly-detection SQL backend

**Files:**
- Create: `supabase/migrations/20260712130000_anomaly_detection.sql`
- Create: `apps/agent/src/pipeline/anomalies.ts`
- Modify: `apps/agent/src/sync.ts` (imports and pipeline call)

**Interface:**
- `detectAnomalies(supabase: SupabaseClient, householdId: string): Promise<{ newOpen: number }>`
- Called once per household sync, after `syncInstallmentPlans`.

### Step 1.1: Write the migration

Create `supabase/migrations/20260712130000_anomaly_detection.sql`:

```sql
-- Anomaly detection (M3 Phase 1).
-- Runs after every sync and fills the existing `anomalies` table.
-- Each detection branch is idempotent: re-running on unchanged data
-- does not create duplicate open rows because the conflict key
-- (household_id, kind, ...) is stable.

-- 1) unusual_amount: a completed transaction whose absolute amount is
-- more than 2.5 standard deviations away from the mean for the same
-- merchant_key over the last 90 days, requiring at least 3 prior
-- occurrences so the baseline is meaningful.
create or replace function public.detect_anomalies(p_household_id uuid)
returns integer
language plpgsql
as $$
declare
  v_inserted integer := 0;
  v_merchant_key text;
  v_mean numeric;
  v_std numeric;
  v_threshold numeric;
  v_txn record;
begin
  -- Build a per-merchant baseline over the last 90 days.
  for v_merchant_key, v_mean, v_std in
    select
      normalized_description,
      avg(abs(charged_amount)) as mean,
      coalesce(stddev_samp(abs(charged_amount)), 0) as std
    from (
      select
        lower(regexp_replace(description, '\s+', ' ', 'g')) as normalized_description,
        charged_amount
      from transactions
      where household_id = p_household_id
        and status = 'completed'
        and exclude_from_totals = false
        and date >= current_date - interval '90 days'
    ) t
    group by normalized_description
    having count(*) >= 3 and stddev_samp(abs(charged_amount)) > 0
  loop
    v_threshold := v_mean + (2.5 * v_std);

    for v_txn in
      select id, account_id, charged_amount, description
      from transactions
      where household_id = p_household_id
        and status = 'completed'
        and exclude_from_totals = false
        and date >= current_date - interval '7 days'
        and lower(regexp_replace(description, '\s+', ' ', 'g')) = v_merchant_key
        and abs(charged_amount) > v_threshold
    loop
      insert into anomalies (
        household_id, kind, transaction_id, account_id,
        baseline, status
      ) values (
        p_household_id, 'unusual_amount', v_txn.id, v_txn.account_id,
        jsonb_build_object(
          'merchant_key', v_merchant_key,
          'mean', v_mean,
          'std', v_std,
          'threshold', v_threshold,
          'amount', abs(v_txn.charged_amount)
        ),
        'open'
      )
      on conflict do nothing;

      if found then
        v_inserted := v_inserted + 1;
      end if;
    end loop;
  end loop;

  -- 2) possible_duplicate: two completed transactions on the same
  -- account with the same normalized description and same absolute
  -- amount within a 7-day window. Only the later txn is flagged.
  for v_txn in
    select later.id, later.account_id, later.description, later.charged_amount
    from transactions earlier
    join transactions later
      on later.household_id = earlier.household_id
      and later.account_id = earlier.account_id
      and lower(regexp_replace(later.description, '\s+', ' ', 'g'))
        = lower(regexp_replace(earlier.description, '\s+', ' ', 'g'))
      and abs(later.charged_amount) = abs(earlier.charged_amount)
      and later.date > earlier.date
      and later.date <= earlier.date + interval '7 days'
      and later.status = 'completed'
      and earlier.status = 'completed'
      and later.exclude_from_totals = false
      and earlier.exclude_from_totals = false
    where later.household_id = p_household_id
      and later.date >= current_date - interval '7 days'
  loop
    insert into anomalies (
      household_id, kind, transaction_id, account_id,
      baseline, status
    ) values (
      p_household_id, 'possible_duplicate', v_txn.id, v_txn.account_id,
      jsonb_build_object(
        'description', v_txn.description,
        'amount', abs(v_txn.charged_amount)
      ),
      'open'
    )
    on conflict do nothing;

    if found then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  -- 3) subscription_increase: for rows already in recurring_series,
  -- flag the latest completed transaction when its absolute amount is
  -- more than 5% above the series expected_amount. recurring_series
  -- is empty until Phase 2, so this branch is a no-op until then.
  for v_txn in
    select t.id, t.account_id, t.charged_amount, rs.id as series_id, rs.merchant_key, rs.expected_amount
    from recurring_series rs
    join transactions t
      on t.household_id = rs.household_id
      and lower(regexp_replace(t.description, '\s+', ' ', 'g')) = rs.merchant_key
    where rs.household_id = p_household_id
      and rs.is_confirmed = true
      and rs.expected_amount is not null
      and t.status = 'completed'
      and t.date >= current_date - interval '7 days'
      and abs(t.charged_amount) > rs.expected_amount * 1.05
    order by t.date desc
    limit 1
  loop
    insert into anomalies (
      household_id, kind, transaction_id, account_id,
      baseline, status
    ) values (
      p_household_id, 'subscription_increase', v_txn.id, v_txn.account_id,
      jsonb_build_object(
        'series_id', v_txn.series_id,
        'merchant_key', v_txn.merchant_key,
        'expected_amount', v_txn.expected_amount,
        'amount', abs(v_txn.charged_amount)
      ),
      'open'
    )
    on conflict do nothing;

    if found then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  -- 4) missed_recurring: for confirmed recurring_series whose
  -- next_expected_date has passed by more than 3 days without a
  -- matching completed transaction. recurring_series is empty until
  -- Phase 2, so this branch is a no-op until then.
  for v_txn in
    select rs.id as series_id, rs.merchant_key, rs.expected_amount, rs.next_expected_date
    from recurring_series rs
    where rs.household_id = p_household_id
      and rs.is_confirmed = true
      and rs.next_expected_date < current_date - interval '3 days'
      and not exists (
        select 1
        from transactions t
        where t.household_id = rs.household_id
          and lower(regexp_replace(t.description, '\s+', ' ', 'g')) = rs.merchant_key
          and t.status = 'completed'
          and abs(t.charged_amount) between coalesce(rs.expected_amount, 0) * 0.8 and coalesce(rs.expected_amount, 0) * 1.2
          and t.date between rs.next_expected_date - interval '3 days' and current_date + interval '3 days'
      )
  loop
    insert into anomalies (
      household_id, kind, account_id,
      baseline, status
    ) values (
      p_household_id, 'missed_recurring', null,
      jsonb_build_object(
        'series_id', v_txn.series_id,
        'merchant_key', v_txn.merchant_key,
        'expected_amount', v_txn.expected_amount,
        'next_expected_date', v_txn.next_expected_date
      ),
      'open'
    )
    on conflict do nothing;

    if found then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  -- 5) balance_drift: compare the scraped account balance against the
  -- sum of completed transactions since the last balance_date (the
  -- balance's effective date). If the difference exceeds 1 ILS, flag it.
  -- This catches silently missed transactions. Only checks accounts
  -- where latest_balance and latest_balance_at are both present.
  for v_txn in
    select
      a.id as account_id,
      a.latest_balance,
      a.latest_balance_at,
      coalesce(sum(t.charged_amount), 0) as txn_sum,
      (a.latest_balance - coalesce(sum(t.charged_amount), 0)) as drift
    from accounts a
    left join transactions t
      on t.account_id = a.id
      and t.household_id = a.household_id
      and t.status = 'completed'
      and t.date > a.latest_balance_at::date
    where a.household_id = p_household_id
      and a.latest_balance is not null
      and a.latest_balance_at is not null
    group by a.id, a.latest_balance, a.latest_balance_at
    having abs(a.latest_balance - coalesce(sum(t.charged_amount), 0)) > 1
  loop
    insert into anomalies (
      household_id, kind, account_id,
      baseline, status
    ) values (
      p_household_id, 'balance_drift', v_txn.account_id,
      jsonb_build_object(
        'latest_balance', v_txn.latest_balance,
        'latest_balance_at', v_txn.latest_balance_at,
        'txn_sum_since_balance', v_txn.txn_sum,
        'drift', v_txn.drift
      ),
      'open'
    )
    on conflict do nothing;

    if found then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return v_inserted;
end;
$$;

-- Agent-only: called from the ingest pipeline using the service-role key.
revoke execute on function public.detect_anomalies(uuid) from public, anon, authenticated;
```

**Note:** The `on conflict do nothing` relies on a unique index covering `(household_id, kind, coalesce(transaction_id, '00000000-0000-0000-0000-000000000000'::uuid), coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid))` where status='open'. The existing `anomalies` table has no unique index. Add this inside the same migration:

```sql
create unique index if not exists anomalies_conflict_idx
  on anomalies (
    household_id,
    kind,
    coalesce(transaction_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'open';
```

- [ ] **Step 1.2: Apply the migration live**

Use Supabase MCP `apply_migration` against project `gdvutebllsocdaefcarj` (name: `anomaly_detection`). Then `get_advisors` (security + performance) and confirm no new findings.

- [ ] **Step 1.3: Verify with synthetic fixtures**

Use Supabase MCP `execute_sql`:

```sql
-- Duplicate fixture: two identical amounts + description within 3 days
insert into transactions (household_id, account_id, date, charged_amount, description, dedup_hash, status)
values
  ('00000000-0000-0000-0000-000000000001', '8e7d5ca6-af00-4908-af2b-29ae2a37f572', '2026-07-10', -50, 'ZZZ_DUPLICATE_ANOMALY', 'zzz-dup-1', 'completed'),
  ('00000000-0000-0000-0000-000000000001', '8e7d5ca6-af00-4908-af2b-29ae2a37f572', '2026-07-12', -50, 'ZZZ_DUPLICATE_ANOMALY', 'zzz-dup-2', 'completed');

select public.detect_anomalies('00000000-0000-0000-0000-000000000001');
-- expect at least 1 anomaly of kind possible_duplicate

select public.detect_anomalies('00000000-0000-0000-0000-000000000001');
-- expect 0 new inserts (idempotent)

-- unusual_amount fixture: need 3 prior occurrences of a merchant, then a large new one
insert into transactions (household_id, account_id, date, charged_amount, description, dedup_hash, status)
values
  ('00000000-0000-0000-0000-000000000001', '8e7d5ca6-af00-4908-af2b-29ae2a37f572', '2026-06-01', -10, 'ZZZ_USUAL_ANOMALY', 'zzz-usual-1', 'completed'),
  ('00000000-0000-0000-0000-000000000001', '8e7d5ca6-af00-4908-af2b-29ae2a37f572', '2026-06-02', -12, 'ZZZ_USUAL_ANOMALY', 'zzz-usual-2', 'completed'),
  ('00000000-0000-0000-0000-000000000001', '8e7d5ca6-af00-4908-af2b-29ae2a37f572', '2026-06-03', -11, 'ZZZ_USUAL_ANOMALY', 'zzz-usual-3', 'completed'),
  ('00000000-0000-0000-0000-000000000001', '8e7d5ca6-af00-4908-af2b-29ae2a37f572', '2026-07-12', -1000, 'ZZZ_USUAL_ANOMALY', 'zzz-usual-4', 'completed');

select public.detect_anomalies('00000000-0000-0000-0000-000000000001');
-- expect at least 1 anomaly of kind unusual_amount

-- Clean up
 delete from anomalies where household_id = '00000000-0000-0000-0000-000000000001';
 delete from transactions where dedup_hash like 'zzz-%';
```

- [ ] **Step 1.4: Write the agent wrapper**

Create `apps/agent/src/pipeline/anomalies.ts`:

```ts
import type { SupabaseClient } from "@supabase/supabase-js";

export async function detectAnomalies(
  supabase: SupabaseClient,
  householdId: string,
): Promise<{ newOpen: number }> {
  const { data, error } = await supabase.rpc("detect_anomalies", {
    p_household_id: householdId,
  });
  if (error) throw new Error(`detect_anomalies failed: ${error.message}`);
  return { newOpen: data ?? 0 };
}
```

- [ ] **Step 1.5: Wire into sync.ts**

Modify `apps/agent/src/sync.ts`:
- Add import: `import { detectAnomalies } from "./pipeline/anomalies.js";`
- After the `syncInstallmentPlans` call, add:
  ```ts
  const anomaliesDetected = await detectAnomalies(supabase, connection.household_id);
  ```
- Include `anomaliesDetected.newOpen` in the final log line.

---

## Task 2: Web UI — Insights page

**Files:**
- Create: `apps/web/src/app/(app)/insights/page.tsx`
- Create: `apps/web/src/app/(app)/insights/actions.ts`
- Create: `apps/web/src/app/(app)/insights/types.ts`
- Modify: `apps/web/src/components/nav/nav-links.ts`
- Modify: `apps/web/src/app/(app)/page.tsx` (add link widget)

**Interface:**
- Server Component reads `anomalies` joined to `accounts` and `transactions`.
- Server Actions: `acknowledgeAnomaly(anomalyId)`, `dismissAnomaly(anomalyId)`.

- [ ] **Step 2.1: Add nav entry**

Update `apps/web/src/components/nav/nav-links.ts`:

```ts
import { LayoutDashboard, PiggyBank, Receipt, RefreshCw, Wallet, Lightbulb } from "lucide-react";

export const NAV_LINKS: NavLink[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/transactions", label: "Transactions", icon: Receipt },
  { href: "/budgets", label: "Budgets", icon: Wallet },
  { href: "/net-worth", label: "Net Worth", icon: PiggyBank },
  { href: "/insights", label: "Insights", icon: Lightbulb },
  { href: "/sync", label: "Sync Health", icon: RefreshCw },
];
```

- [ ] **Step 2.2: Define types**

Create `apps/web/src/app/(app)/insights/types.ts`:

```ts
export interface AnomalyRow {
  id: string;
  kind:
    | "unusual_amount"
    | "possible_duplicate"
    | "subscription_increase"
    | "missed_recurring"
    | "balance_drift";
  status: "open" | "acknowledged" | "dismissed";
  created_at: string;
  baseline: Record<string, unknown> | null;
  transaction_id: string | null;
  account_id: string | null;
  transactions: { description: string; charged_amount: number; charged_currency: string; date: string } | null;
  accounts: { display_name: string; kind: string } | null;
}
```

- [ ] **Step 2.3: Server Actions**

Create `apps/web/src/app/(app)/insights/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function updateAnomalyStatus(anomalyId: string, status: "acknowledged" | "dismissed"): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("anomalies").update({ status }).eq("id", anomalyId);
  if (error) throw new Error(`failed to update anomaly: ${error.message}`);
  revalidatePath("/insights");
}
```

- [ ] **Step 2.4: Insights page**

Create `apps/web/src/app/(app)/insights/page.tsx`:

```tsx
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { updateAnomalyStatus } from "./actions";
import type { AnomalyRow } from "./types";
import { Lightbulb, Check, X } from "lucide-react";

function formatCurrency(amount: number, currency = "ILS"): string {
  return new Intl.NumberFormat("en-IL", { style: "currency", currency }).format(amount);
}

function formatKind(kind: AnomalyRow["kind"]): string {
  const labels: Record<AnomalyRow["kind"], string> = {
    unusual_amount: "Unusual amount",
    possible_duplicate: "Possible duplicate",
    subscription_increase: "Subscription increase",
    missed_recurring: "Missed recurring",
    balance_drift: "Balance drift",
  };
  return labels[kind];
}

export default async function InsightsPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("anomalies")
    .select(
      "id, kind, status, created_at, baseline, transaction_id, account_id, transactions(description, charged_amount, charged_currency, date), accounts(display_name, kind)",
    )
    .order("created_at", { ascending: false });

  const anomalies = (rows ?? []) as unknown as AnomalyRow[];
  const open = anomalies.filter((a) => a.status === "open");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Insights" description="Anomalies and alerts detected from your data">
        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Lightbulb className="size-5" />
        </div>
      </PageHeader>

      <Card className="card-shadow">
        <CardHeader>
          <CardTitle>Open anomalies</CardTitle>
          <CardDescription>
            {open.length === 0
              ? "Nothing unusual detected."
              : `${open.length} item${open.length === 1 ? "" : "s"} need attention.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {open.map((a) => (
            <div
              key={a.id}
              className="flex flex-col gap-3 rounded-xl bg-muted/40 p-4 sm:flex-row sm:items-start sm:justify-between"
            >
              <div className="flex flex-col gap-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{formatKind(a.kind)}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(a.created_at).toLocaleDateString()}</span>
                </div>
                {a.transactions && (
                  <div className="flex flex-col">
                    <bdi className="truncate font-medium">{a.transactions.description}</bdi>
                    <span className="text-xs text-muted-foreground">
                      {a.transactions.date} · {a.accounts?.display_name ?? "Unknown account"}
                    </span>
                  </div>
                )}
                {a.kind === "balance_drift" && a.baseline && (
                  <span className="text-sm text-muted-foreground">
                    Balance drift: {formatCurrency(Number(a.baseline.drift))}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <form action={updateAnomalyStatus.bind(null, a.id, "acknowledged")}>
                  <Button type="submit" variant="ghost" size="icon" aria-label="Acknowledge">
                    <Check className="size-4" />
                  </Button>
                </form>
                <form action={updateAnomalyStatus.bind(null, a.id, "dismissed")}>
                  <Button type="submit" variant="ghost" size="icon" aria-label="Dismiss">
                    <X className="size-4" />
                  </Button>
                </form>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {anomalies.some((a) => a.status !== "open") && (
        <Card className="card-shadow">
          <CardHeader>
            <CardTitle>History</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {anomalies
              .filter((a) => a.status !== "open")
              .map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-lg bg-muted/30 p-3 text-sm opacity-70">
                  <span>{formatKind(a.kind)}</span>
                  <Badge variant="secondary" className="capitalize">
                    {a.status}
                  </Badge>
                </div>
              ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
```

- [ ] **Step 2.5: Dashboard link widget**

In `apps/web/src/app/(app)/page.tsx`, add a small "Insights" card in the bottom grid that shows the count of open anomalies and links to `/insights`.

---

## Task 3: ntfy notifications

**Files:**
- Create: `apps/agent/src/notifications/ntfy.ts`
- Modify: `apps/agent/src/sync.ts` (call after sync)
- Modify: `apps/agent/.env.example` (add `NTFY_TOPIC`)

**Interface:**
- `sendNtfy(topic: string, title: string, message: string, priority?: 'low'|'default'|'high'|'urgent'): Promise<void>`
- `notifySyncResult(topic: string, connectionDisplayName: string, status: string, errorCode?: string): Promise<void>`
- `notifyNewAnomalies(topic: string, count: number): Promise<void>`

- [ ] **Step 3.1: Implement ntfy sender**

Create `apps/agent/src/notifications/ntfy.ts`:

```ts
import { logger } from "../log/logger.js";

export async function sendNtfy(
  topic: string,
  title: string,
  message: string,
  priority: "low" | "default" | "high" | "urgent" = "default",
): Promise<void> {
  if (!topic) return;
  try {
    const res = await fetch(`https://ntfy.sh/${encodeURIComponent(topic)}`, {
      method: "POST",
      headers: {
        Title: title,
        Priority: priority,
      },
      body: message,
    });
    if (!res.ok) {
      logger.warn(`ntfy push failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    logger.warn(`ntfy push error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

export async function notifySyncResult(
  topic: string,
  connectionDisplayName: string,
  status: string,
  errorCode?: string,
): Promise<void> {
  if (status === "success") return;
  await sendNtfy(
    topic,
    "Sync failed",
    `${connectionDisplayName}: ${status}${errorCode ? ` (${errorCode})` : ""}`,
    "high",
  );
}

export async function notifyNewAnomalies(topic: string, count: number): Promise<void> {
  if (count <= 0) return;
  await sendNtfy(
    topic,
    "New anomaly detected",
    `${count} new anomaly${count === 1 ? "" : "ies"} need${count === 1 ? "s" : ""} attention in the app.`,
    "default",
  );
}
```

- [ ] **Step 3.2: Wire into sync.ts**

Modify `apps/agent/src/sync.ts`:
- Add import: `import { notifyNewAnomalies, notifySyncResult } from "./notifications/ntfy.js";`
- Add `const NTFY_TOPIC = process.env.NTFY_TOPIC ?? "";` near the top.
- Extend `loadConnection` to also select `display_name`.
- On scrape failure: `await notifySyncResult(NTFY_TOPIC, connection.display_name, "failed", result.errorType);`
- After anomaly detection: `await notifyNewAnomalies(NTFY_TOPIC, anomaliesDetected.newOpen);`

- [ ] **Step 3.3: Update .env.example**

Add to `apps/agent/.env.example`:

```
# Optional: ntfy.sh topic for sync-failure / anomaly notifications
# NTFY_TOPIC=your-private-topic
```

---

## Task 4: Verification

- [ ] **Step 4.1: Typecheck / lint / test**

Run from repo root:

```bash
pnpm typecheck && pnpm lint && pnpm test
```

- [ ] **Step 4.2: Local Postgres validation of the migration**

Start Docker Desktop, run the migration through a local Postgres container with a stub `auth` schema (existing M0 pattern) to confirm syntax.

- [ ] **Step 4.3: Live migration + advisor check**

Apply via Supabase MCP `apply_migration`, then `get_advisors` (security + performance).

- [ ] **Step 4.4: Run a real Max sync**

From `apps/agent/`:

```bash
pnpm exec tsx src/daemon.ts
```

From the web app, click "Sync now" on `/sync`, wait for the daemon to pick it up, then confirm:
- `sync_runs` gets a new row with status `success`.
- The new log line includes anomaly count.
- `/insights` shows any detected anomalies (likely `balance_drift` if balances are present; others may be empty with only 56 txns).

- [ ] **Step 4.5: UI walkthrough**

With `pnpm dev` running in `apps/web/`:
1. Sign in at `/login`.
2. Click the new "Insights" nav item.
3. If anomalies exist, click acknowledge/dismiss and confirm the list updates.
4. Dashboard widget links to `/insights`.

- [ ] **Step 4.6: Update CLAUDE.md known gaps**

After M3 Phase 1 is verified, add a note in `CLAUDE.md` that anomaly detection is live but relies on `recurring_series` being empty until Phase 2.

---

## Appendix: Later M3 phases (do not implement now)

- **Phase 2: Recurring/subscription detection** — populate `recurring_series` from transaction history, confirm UI.
- **Phase 3: Cash-flow forecast** — 30/60/90-day projection using confirmed recurring + installment schedule + scraped future debits.
- **Phase 3b: Safe-to-Spend** — income minus remaining bills minus committed budgets, updated daily.
- **Phase 4: Month-close report** — automated monthly summary page.
- **Phase 5: Budget rollover** — SQL function + UI flag for rollover budgets.
