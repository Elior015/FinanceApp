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
                  <span className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleDateString()}
                  </span>
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
                {a.kind === "unusual_amount" && a.baseline && (
                  <span className="text-sm text-muted-foreground">
                    Amount {formatCurrency(Number(a.baseline.amount))} vs threshold{" "}
                    {formatCurrency(Number(a.baseline.threshold))}
                  </span>
                )}
                {a.kind === "subscription_increase" && a.baseline && (
                  <span className="text-sm text-muted-foreground">
                    Charged {formatCurrency(Number(a.baseline.amount))} vs expected{" "}
                    {formatCurrency(Number(a.baseline.expected_amount))}
                  </span>
                )}
                {a.kind === "missed_recurring" && a.baseline && (
                  <span className="text-sm text-muted-foreground">
                    Expected around {String(a.baseline.next_expected_date)}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <form action={updateAnomalyStatus.bind(null, a.id, "acknowledged")}>
                  <Button type="submit" variant="ghost" size="icon-sm" aria-label="Acknowledge">
                    <Check className="size-4" />
                  </Button>
                </form>
                <form action={updateAnomalyStatus.bind(null, a.id, "dismissed")}>
                  <Button type="submit" variant="ghost" size="icon-sm" aria-label="Dismiss">
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
                <div
                  key={a.id}
                  className="flex items-center justify-between rounded-lg bg-muted/30 p-3 text-sm opacity-70"
                >
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
