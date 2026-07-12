import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { SpendingDonut, type DonutSlice } from "./dashboard-donut";
import { ArrowDownLeft, ArrowUpRight, Wallet, TrendingUp, Receipt } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

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

function StatCard({
  label,
  amount,
  icon: Icon,
  tone,
  description,
}: {
  label: string;
  amount: string;
  icon: React.ElementType;
  tone: "neutral" | "positive" | "negative";
  description?: string;
}) {
  const toneClasses = {
    neutral: "bg-primary/10 text-primary",
    positive: "bg-success/10 text-success",
    negative: "bg-destructive/10 text-destructive",
  };

  return (
    <Card className="card-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardDescription className="text-sm font-medium">{label}</CardDescription>
        <div className={cn("flex size-9 items-center justify-center rounded-lg", toneClasses[tone])}>
          <Icon className="size-5" />
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <div dir="ltr" className="text-2xl font-bold tracking-tight">{amount}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );
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

  const netPositive = (cashFlow?.net ?? 0) >= 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Overview of your household finances this month"
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Inflow"
          amount={formatCurrency(cashFlow?.inflow ?? 0)}
          icon={ArrowDownLeft}
          tone="positive"
          description="Income & deposits"
        />
        <StatCard
          label="Outflow"
          amount={formatCurrency(Math.abs(cashFlow?.outflow ?? 0))}
          icon={ArrowUpRight}
          tone="negative"
          description="Spending & withdrawals"
        />
        <StatCard
          label="Net cash flow"
          amount={formatCurrency(cashFlow?.net ?? 0)}
          icon={TrendingUp}
          tone={netPositive ? "positive" : "negative"}
          description={netPositive ? "You're ahead this month" : "Spending exceeds income"}
        />
        <StatCard
          label="Net worth"
          amount={formatCurrency(netWorthTotal)}
          icon={Wallet}
          tone="neutral"
          description="Total household balance"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="card-shadow lg:col-span-4">
          <CardHeader>
            <CardTitle>Spending by category</CardTitle>
            <CardDescription>Where your money went this month</CardDescription>
          </CardHeader>
          <CardContent>
            <SpendingDonut data={donutData} />
          </CardContent>
        </Card>

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
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Wallet className="size-5" />
              </div>
              <div>
                <div dir="ltr" className="text-2xl font-bold tracking-tight">{formatCurrency(netWorthTotal)}</div>
                <p className="text-sm text-muted-foreground">Total across {(netWorthRows ?? []).length} accounts</p>
              </div>
            </div>
            <ul className="flex flex-col gap-2">
              {(netWorthRows ?? []).map((r, i) => {
                const value = Number(r.scraped_balance ?? 0) + Number(r.latest_manual_value ?? 0);
                const pct = netWorthTotal !== 0 ? Math.abs(value / netWorthTotal) * 100 : 0;
                return (
                  <li key={i} className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{r.display_name}</span>
                      <span dir="ltr" className="font-semibold">{formatCurrency(value)}</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground capitalize">{r.kind}</span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card className="card-shadow">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Recent transactions</CardTitle>
            <CardDescription>Latest completed activity across accounts</CardDescription>
          </div>
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Receipt className="size-5" />
          </div>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-col gap-3">
            {((recent ?? []) as unknown as RecentTransaction[]).map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-xl bg-muted/40 p-3 text-sm transition-colors hover:bg-muted">
                <div className="flex flex-col min-w-0">
                  <bdi className="truncate font-medium">{t.description}</bdi>
                  <span className="text-xs text-muted-foreground">
                    {t.date} · {t.categories?.name ?? "Uncategorized"}
                  </span>
                </div>
                <span dir="ltr" className="shrink-0 font-semibold">
                  {formatCurrency(t.charged_amount, t.charged_currency)}
                </span>
              </li>
            ))}
            {(recent ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">No recent transactions.</p>
            )}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
