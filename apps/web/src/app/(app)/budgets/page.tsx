import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AddBudgetDialog } from "./add-budget-dialog";
import { deleteBudget } from "./actions";
import { PageHeader } from "@/components/page-header";
import { Wallet, Trash2, RotateCcw, Target } from "lucide-react";
import type { CategoryOption } from "../transactions/types";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-IL", { style: "currency", currency: "ILS" }).format(amount);
}

function currentMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

interface BudgetRow {
  id: string;
  amount: number;
  starts_on: string;
  rollover: boolean;
  categories: { id: string; name: string } | null;
}

export default async function BudgetsPage() {
  const supabase = await createClient();
  const monthStart = currentMonthStart();

  const [{ data: budgets }, { data: spendingRows }, { data: categories }] = await Promise.all([
    supabase.from("budgets").select("id, amount, starts_on, rollover, categories(id, name)").order("starts_on"),
    supabase.from("v_spending_by_category").select("category_id, spent").eq("month", monthStart),
    supabase.from("categories").select("id, name, is_income").order("sort"),
  ]);

  const spentByCategory = new Map((spendingRows ?? []).map((r) => [r.category_id, Number(r.spent ?? 0)]));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Budgets" description="Track spending limits by category">
        <AddBudgetDialog categories={(categories ?? []) as CategoryOption[]} />
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {((budgets ?? []) as unknown as BudgetRow[]).map((b) => {
          const spent = spentByCategory.get(b.categories?.id ?? "") ?? 0;
          const pct = b.amount > 0 ? Math.min(100, (spent / b.amount) * 100) : 0;
          const over = spent > b.amount;
          const remaining = b.amount - spent;

          return (
            <Card key={b.id} className="card-shadow">
              <CardHeader className="flex flex-row items-start justify-between pb-3">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Target className="size-5" />
                  </div>
                  <div>
                    <CardTitle>{b.categories?.name ?? "Uncategorized"}</CardTitle>
                    <CardDescription>
                      {new Date(b.starts_on).toLocaleDateString("en-IL", { month: "long", year: "numeric" })}
                    </CardDescription>
                  </div>
                </div>
                <form action={deleteBudget.bind(null, b.id)}>
                  <Button type="submit" variant="ghost" size="icon-xs" aria-label="Delete budget">
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </form>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-end justify-between" dir="ltr">
                  <div>
                    <div className={over ? "text-2xl font-bold text-destructive" : "text-2xl font-bold"}>
                      {formatCurrency(spent)}
                    </div>
                    <div className="text-sm text-muted-foreground">of {formatCurrency(b.amount)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{over ? "Over by" : "Remaining"}</div>
                    <div className={over ? "text-sm font-semibold text-destructive" : "text-sm font-semibold text-success"}>
                      {formatCurrency(Math.abs(remaining))}
                    </div>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={`h-full rounded-full transition-all ${over ? "bg-destructive" : "bg-primary"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{Math.round(pct)}% used</span>
                    {b.rollover && (
                      <span className="inline-flex items-center gap-1">
                        <RotateCcw className="size-3" /> Rolls over
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {(budgets ?? []).length === 0 && (
        <Card className="card-shadow">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-muted">
              <Wallet className="size-7 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold">No budgets yet</h3>
              <p className="text-sm text-muted-foreground">Add a budget to start tracking spending limits by category.</p>
            </div>
            <AddBudgetDialog categories={(categories ?? []) as CategoryOption[]} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
