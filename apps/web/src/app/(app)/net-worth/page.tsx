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
