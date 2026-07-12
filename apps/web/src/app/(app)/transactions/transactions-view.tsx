"use client";

import { useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { bulkCategorize, categorizeTransaction } from "./actions";
import { formatAmount } from "./format";
import { TransactionSheet } from "./transaction-sheet";
import { Tags, X } from "lucide-react";
import type { CategoryOption, TransactionListRow } from "./types";

function CategorySelect({
  value,
  categories,
  onChange,
}: {
  value: string | null;
  categories: CategoryOption[];
  onChange: (categoryId: string | null) => void;
}) {
  return (
    <select
      className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">Uncategorized</option>
      {categories.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

export function TransactionsView({
  transactions,
  categories,
}: {
  transactions: TransactionListRow[];
  categories: CategoryOption[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkCategoryId, setBulkCategoryId] = useState<string>("");
  const [openTransaction, setOpenTransaction] = useState<TransactionListRow | null>(null);
  const [isPending, startTransition] = useTransition();

  const categoryById = new Map(categories.map((c) => [c.id, c.name]));

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(transactions.map((t) => t.id)) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {selected.size > 0 && (
        <div className="hidden items-center gap-3 rounded-xl border bg-muted/60 p-3 md:flex">
          <Tags className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">{selected.size} selected</span>
          <CategorySelect value={bulkCategoryId || null} categories={categories} onChange={(v) => setBulkCategoryId(v ?? "")} />
          <Button
            size="sm"
            disabled={isPending}
            onClick={() => {
              const ids = Array.from(selected);
              startTransition(async () => {
                await bulkCategorize(ids, bulkCategoryId || null);
                setSelected(new Set());
              });
            }}
          >
            Apply
          </Button>
          <Button size="sm" variant="ghost" className="gap-1" onClick={() => setSelected(new Set())}>
            <X className="size-4" />
            Clear
          </Button>
        </div>
      )}

      {/* Desktop: dense table */}
      <Card className="card-shadow hidden overflow-hidden md:block">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8">
                  <Checkbox
                    checked={transactions.length > 0 && selected.size === transactions.length}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                  />
                </TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id} data-state={selected.has(t.id) ? "selected" : undefined} className="cursor-pointer">
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selected.has(t.id)} onCheckedChange={(checked) => toggleOne(t.id, checked === true)} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">{t.date}</TableCell>
                  <TableCell>
                    <bdi className="font-medium">{t.description}</bdi>
                    {t.status === "pending" && (
                      <Badge variant="secondary" className="ml-2">
                        pending
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{t.accounts?.display_name ?? "—"}</TableCell>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <CategorySelect
                      value={t.category_id}
                      categories={categories}
                      onChange={(categoryId) => startTransition(() => categorizeTransaction(t.id, categoryId))}
                    />
                  </TableCell>
                  <TableCell className="text-right" dir="ltr">
                    <span className="font-semibold">{formatAmount(t.charged_amount, t.charged_currency)}</span>
                  </TableCell>
                </TableRow>
              ))}
              {transactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                    No transactions match your filters.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Mobile: card list, tap to open detail sheet */}
      <div className="flex flex-col gap-2 md:hidden">
        {transactions.map((t) => (
          <button
            key={t.id}
            onClick={() => setOpenTransaction(t)}
            className="flex items-center justify-between rounded-xl border bg-card p-4 text-left card-shadow transition-colors hover:bg-muted/50 active:scale-[0.99]"
          >
            <div className="flex min-w-0 flex-col gap-1">
              <bdi className="truncate text-sm font-medium">{t.description}</bdi>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span>{t.date}</span>
                {t.category_id && <Badge variant="outline">{categoryById.get(t.category_id) ?? "—"}</Badge>}
                {t.status === "pending" && <Badge variant="secondary">pending</Badge>}
              </div>
            </div>
            <span dir="ltr" className="shrink-0 font-semibold">
              {formatAmount(t.charged_amount, t.charged_currency)}
            </span>
          </button>
        ))}
        {transactions.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">No transactions match your filters.</p>
        )}
      </div>

      <TransactionSheet transaction={openTransaction} categories={categories} onOpenChange={(open) => !open && setOpenTransaction(null)} />
    </div>
  );
}
