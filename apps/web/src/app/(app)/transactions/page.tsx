import { createClient } from "@/lib/supabase/server";
import { AddTransactionDialog } from "./add-transaction-dialog";
import { TransactionsView } from "./transactions-view";
import { PageHeader } from "@/components/page-header";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Search, SlidersHorizontal } from "lucide-react";
import type { AccountOption, CategoryOption, TransactionListRow } from "./types";

const PAGE_SIZE = 50;

interface TransactionsPageProps {
  searchParams: Promise<{
    q?: string;
    categoryId?: string;
    accountId?: string;
    from?: string;
    to?: string;
    personal?: "all" | "personal" | "shared";
    page?: string;
  }>;
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const params = await searchParams;
  const supabase = await createClient();
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("transactions")
    .select("id, date, description, charged_amount, charged_currency, status, category_id, is_personal, tags, notes, account_id, accounts(display_name)", {
      count: "exact",
    })
    .order("date", { ascending: false })
    .range(from, to);

  if (params.q) query = query.ilike("description", `%${params.q}%`);
  if (params.categoryId) query = query.eq("category_id", params.categoryId);
  if (params.accountId) query = query.eq("account_id", params.accountId);
  if (params.from) query = query.gte("date", params.from);
  if (params.to) query = query.lte("date", params.to);
  if (params.personal === "personal") query = query.eq("is_personal", true);
  if (params.personal === "shared") query = query.eq("is_personal", false);

  const [{ data: transactions, count }, { data: categories }, { data: accounts }] = await Promise.all([
    query,
    supabase.from("categories").select("id, name, is_income").order("sort"),
    supabase.from("accounts").select("id, display_name").order("display_name"),
  ]);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Transactions" description="Search, filter, and categorize household activity">
        <AddTransactionDialog
          accounts={(accounts ?? []) as AccountOption[]}
          categories={(categories ?? []) as CategoryOption[]}
        />
      </PageHeader>

      <Card className="card-shadow">
        <CardContent className="p-4">
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div className="flex min-w-[200px] flex-1 flex-col gap-1.5">
              <Label className="text-xs font-medium" htmlFor="filter-q">
                Search
              </Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="filter-q"
                  name="q"
                  defaultValue={params.q}
                  placeholder="Merchant contains…"
                  className="pl-9"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium" htmlFor="filter-category">
                Category
              </Label>
              <select
                id="filter-category"
                name="categoryId"
                defaultValue={params.categoryId}
                className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All categories</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium" htmlFor="filter-account">
                Account
              </Label>
              <select
                id="filter-account"
                name="accountId"
                defaultValue={params.accountId}
                className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">All accounts</option>
                {(accounts ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.display_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium" htmlFor="filter-from">
                From
              </Label>
              <Input id="filter-from" name="from" type="date" defaultValue={params.from} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium" htmlFor="filter-to">
                To
              </Label>
              <Input id="filter-to" name="to" type="date" defaultValue={params.to} />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium" htmlFor="filter-personal">
                Personal/Shared
              </Label>
              <select
                id="filter-personal"
                name="personal"
                defaultValue={params.personal ?? "all"}
                className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="all">All</option>
                <option value="shared">Shared only</option>
                <option value="personal">Personal only</option>
              </select>
            </div>

            <Button type="submit" variant="outline" className="gap-2">
              <SlidersHorizontal className="size-4" />
              Filter
            </Button>
          </form>
        </CardContent>
      </Card>

      <TransactionsView
        transactions={(transactions ?? []) as unknown as TransactionListRow[]}
        categories={(categories ?? []) as CategoryOption[]}
      />

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>
          Page {page} of {totalPages} ({count ?? 0} transactions)
        </span>
      </div>
    </div>
  );
}
