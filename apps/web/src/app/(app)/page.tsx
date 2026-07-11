import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpendingDonut, type DonutSlice } from "./dashboard-donut";

function formatCurrency(amount: number, currency = "ILS"): string {
  return new Intl.NumberFormat("en-IL", { style: "currency", currency }).format(amount);
}

function currentMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

interface RecentTransaction {
  id: string;
  date: string;
  description: string;
  charged_amount: number;
  charged_currency: string;
  categories: { name: string } | null;
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const monthStart = currentMonthStart();

  const [{ data: cashFlow }, { data: spendingRows }, { data: netWorthRows }, { data: recent }] = await Promise.all([
    supabase.from("v_monthly_cash_flow").select("inflow, outflow, net").eq("month", monthStart).maybeSingle(),
    supabase.from("v_spending_by_category").select("category_name, spent").eq("month", monthStart),
    supabase.from("v_net_worth").select("display_name, kind, scraped_balance, latest_manual_value, remaining_installment_liability"),
    supabase
      .from("transactions")
      .select("id, date, description, charged_amount, charged_currency, categories(name)")
      .eq("status", "completed")
      .order("date", { ascending: false })
      .limit(10),
  ]);

  const donutData: DonutSlice[] = (spendingRows ?? [])
    .filter((r) => (r.spent ?? 0) > 0)
    .map((r) => ({ name: r.category_name ?? "Uncategorized", value: Number(r.spent) }));

  const netWorthTotal = (netWorthRows ?? []).reduce(
    (sum, r) => sum + Number(r.scraped_balance ?? 0) + Number(r.latest_manual_value ?? 0) - Number(r.remaining_installment_liability ?? 0),
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">This month — inflow</CardTitle>
          </CardHeader>
          <CardContent dir="ltr" className="text-2xl font-semibold">
            {formatCurrency(cashFlow?.inflow ?? 0)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">This month — outflow</CardTitle>
          </CardHeader>
          <CardContent dir="ltr" className="text-2xl font-semibold">
            {formatCurrency(Math.abs(cashFlow?.outflow ?? 0))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm text-muted-foreground">This month — net</CardTitle>
          </CardHeader>
          <CardContent dir="ltr" className="text-2xl font-semibold">
            {formatCurrency(cashFlow?.net ?? 0)}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
          </CardHeader>
          <CardContent>
            <SpendingDonut data={donutData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Net worth</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <span dir="ltr" className="text-2xl font-semibold">
              {formatCurrency(netWorthTotal)}
            </span>
            <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
              {(netWorthRows ?? []).map((r, i) => (
                <li key={i} className="flex justify-between">
                  <span>{r.display_name}</span>
                  <span dir="ltr">{formatCurrency(Number(r.scraped_balance ?? 0) + Number(r.latest_manual_value ?? 0))}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-2">
            {((recent ?? []) as unknown as RecentTransaction[]).map((t) => (
              <li key={t.id} className="flex items-center justify-between text-sm">
                <div className="flex flex-col">
                  <bdi>{t.description}</bdi>
                  <span className="text-xs text-muted-foreground">
                    {t.date} · {t.categories?.name ?? "Uncategorized"}
                  </span>
                </div>
                <span dir="ltr" className="font-medium">
                  {formatCurrency(t.charged_amount, t.charged_currency)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
