import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { AddSeriesDialog } from "./add-series-dialog";
import { confirmRecurringSeries, dismissRecurringSeries } from "./actions";
import { Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { RecurringSeriesRow } from "./types";

function formatCurrency(amount: number, currency = "ILS"): string {
  return new Intl.NumberFormat("en-IL", { style: "currency", currency }).format(amount);
}

function cadenceLabel(cadence: RecurringSeriesRow["cadence"]): string {
  const labels: Record<RecurringSeriesRow["cadence"], string> = {
    weekly: "Weekly",
    monthly: "Monthly",
    yearly: "Yearly",
    irregular: "Irregular",
  };
  return labels[cadence];
}

function typeLabel(type: RecurringSeriesRow["series_type"]): string {
  const labels: Record<RecurringSeriesRow["series_type"], string> = {
    income: "Income",
    bill: "Bill",
    subscription: "Subscription",
  };
  return labels[type];
}

function SeriesCard({
  series,
  actions,
}: {
  series: RecurringSeriesRow;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 p-4">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-center gap-2">
          <bdi className="truncate font-medium">{series.merchant_key}</bdi>
          <Badge variant="outline" className="shrink-0 capitalize">
            {typeLabel(series.series_type)}
          </Badge>
        </div>
        <span className="text-xs text-muted-foreground">
          {cadenceLabel(series.cadence)}
          {series.next_expected_date && ` · next ${series.next_expected_date}`}
        </span>
        {series.expected_amount !== null && (
          <span dir="ltr" className="text-sm text-muted-foreground">
            {formatCurrency(series.expected_amount)}
          </span>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}

export default async function RecurringPage() {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from("recurring_series")
    .select(
      "id, merchant_key, cadence, expected_amount, next_expected_date, series_type, status, is_manual, amount_history, created_at",
    )
    .order("created_at", { ascending: false });

  const series = (rows ?? []) as unknown as RecurringSeriesRow[];
  const proposed = series.filter((s) => s.status === "proposed");
  const confirmed = series.filter((s) => s.status === "confirmed");
  const dismissed = series.filter((s) => s.status === "dismissed");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Recurring" description="Subscriptions, bills, and income you track regularly">
        <AddSeriesDialog />
      </PageHeader>

      <Card className="card-shadow">
        <CardHeader>
          <CardTitle>Confirmed</CardTitle>
          <CardDescription>
            {confirmed.length === 0
              ? "No confirmed recurring series yet."
              : `${confirmed.length} series feed anomaly detection.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {confirmed.map((s) => (
            <SeriesCard key={s.id} series={s} />
          ))}
        </CardContent>
      </Card>

      {proposed.length > 0 && (
        <Card className="card-shadow">
          <CardHeader>
            <CardTitle>Proposed</CardTitle>
            <CardDescription>Confirm or dismiss detected patterns</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {proposed.map((s) => (
              <SeriesCard
                key={s.id}
                series={s}
                actions={
                  <>
                    <form action={confirmRecurringSeries.bind(null, s.id)}>
                      <Button type="submit" variant="ghost" size="icon-sm" aria-label="Confirm">
                        <Check className="size-4" />
                      </Button>
                    </form>
                    <form action={dismissRecurringSeries.bind(null, s.id)}>
                      <Button type="submit" variant="ghost" size="icon-sm" aria-label="Dismiss">
                        <X className="size-4" />
                      </Button>
                    </form>
                  </>
                }
              />
            ))}
          </CardContent>
        </Card>
      )}

      {dismissed.length > 0 && (
        <Card className="card-shadow opacity-70">
          <CardHeader>
            <CardTitle>Dismissed</CardTitle>
            <CardDescription>Ignored proposals</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {dismissed.map((s) => (
              <SeriesCard key={s.id} series={s} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
