import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AddBudgetDialog } from "./add-budget-dialog";
import { deleteBudget } from "./actions";
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Budgets</h1>
        <AddBudgetDialog categories={(categories ?? []) as CategoryOption[]} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {((budgets ?? []) as unknown as BudgetRow[]).map((b) => {
          const spent = spentByCategory.get(b.categories?.id ?? "") ?? 0;
          const pct = b.amount > 0 ? Math.min(100, (spent / b.amount) * 100) : 0;
          const over = spent > b.amount;

          return (
            <Card key={b.id}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{b.categories?.name ?? "Uncategorized"}</CardTitle>
                <form action={deleteBudget.bind(null, b.id)}>
                  <Button type="submit" variant="ghost" size="sm">
                    Delete
                  </Button>
                </form>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-center justify-between text-sm" dir="ltr">
                  <span className={over ? "font-semibold text-destructive" : "font-semibold"}>{formatCurrency(spent)}</span>
                  <span className="text-muted-foreground">of {formatCurrency(b.amount)}</span>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary">
                  <div
                    className={`h-2 rounded-full ${over ? "bg-destructive" : "bg-foreground"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {b.rollover && <span className="text-xs text-muted-foreground">Rolls over unused amount</span>}
              </CardContent>
            </Card>
          );
        })}
        {(budgets ?? []).length === 0 && <p className="text-sm text-muted-foreground">No budgets yet — add one to get started.</p>}
      </div>
    </div>
  );
}
