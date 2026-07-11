"use client";

import { useState, useTransition } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { bulkCategorize, categorizeTransaction } from "./actions";
import { formatAmount } from "./format";
import { TransactionSheet } from "./transaction-sheet";
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
      className="h-8 rounded-md border bg-transparent px-2 text-sm"
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
        <div className="hidden items-center gap-3 rounded-md border bg-secondary/40 p-3 md:flex">
          <span className="text-sm">{selected.size} selected</span>
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
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {/* Desktop: dense table */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
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
              <TableRow key={t.id} data-state={selected.has(t.id) ? "selected" : undefined}>
                <TableCell>
                  <Checkbox checked={selected.has(t.id)} onCheckedChange={(checked) => toggleOne(t.id, checked === true)} />
                </TableCell>
                <TableCell className="whitespace-nowrap">{t.date}</TableCell>
                <TableCell>
                  <bdi>{t.description}</bdi>
                  {t.status === "pending" && (
                    <Badge variant="secondary" className="ml-2">
                      pending
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{t.accounts?.display_name ?? "—"}</TableCell>
                <TableCell>
                  <CategorySelect
                    value={t.category_id}
                    categories={categories}
                    onChange={(categoryId) => startTransition(() => categorizeTransaction(t.id, categoryId))}
                  />
                </TableCell>
                <TableCell className="text-right" dir="ltr">
                  {formatAmount(t.charged_amount, t.charged_currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Mobile: card list, tap to open detail sheet */}
      <div className="flex flex-col gap-2 md:hidden">
        {transactions.map((t) => (
          <button
            key={t.id}
            onClick={() => setOpenTransaction(t)}
            className="flex items-center justify-between rounded-md border p-3 text-left"
          >
            <div className="flex flex-col gap-1">
              <bdi className="text-sm font-medium">{t.description}</bdi>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{t.date}</span>
                {t.category_id && <Badge variant="outline">{categoryById.get(t.category_id) ?? "—"}</Badge>}
                {t.status === "pending" && <Badge variant="secondary">pending</Badge>}
              </div>
            </div>
            <span dir="ltr" className="font-semibold">
              {formatAmount(t.charged_amount, t.charged_currency)}
            </span>
          </button>
        ))}
      </div>

      <TransactionSheet transaction={openTransaction} categories={categories} onOpenChange={(open) => !open && setOpenTransaction(null)} />
    </div>
  );
}
