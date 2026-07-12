"use client";

import { useState, useTransition } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { updateTransactionDetails } from "./actions";
import { formatAmount } from "./format";
import { CalendarDays, Building2, Receipt, Tag } from "lucide-react";
import type { CategoryOption, TransactionListRow } from "./types";

export function TransactionSheet({
  transaction,
  categories,
  onOpenChange,
}: {
  transaction: TransactionListRow | null;
  categories: CategoryOption[];
  onOpenChange: (open: boolean) => void;
}) {
  const [categoryId, setCategoryId] = useState<string>(transaction?.category_id ?? "");
  const [isPersonal, setIsPersonal] = useState<boolean>(transaction?.is_personal ?? false);
  const [notes, setNotes] = useState<string>(transaction?.notes ?? "");
  const [isPending, startTransition] = useTransition();

  return (
    <Sheet
      open={transaction !== null}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false);
      }}
    >
      <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
        {transaction && (
          <div className="flex flex-col gap-5 p-2" key={transaction.id}>
            <SheetHeader className="p-0">
              <SheetTitle className="flex items-start gap-3 text-left text-lg">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Receipt className="size-5" />
                </div>
                <bdi className="leading-snug">{transaction.description}</bdi>
              </SheetTitle>
            </SheetHeader>

            <div className="flex items-baseline justify-between">
              <span dir="ltr" className="text-3xl font-bold tracking-tight">
                {formatAmount(transaction.charged_amount, transaction.charged_currency)}
              </span>
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <CalendarDays className="size-4" />
                {transaction.date}
              </div>
            </div>

            <Separator />

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Building2 className="size-4" />
                {transaction.accounts?.display_name ?? "—"}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground capitalize">
                <Tag className="size-4" />
                {transaction.status}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sheet-category">Category</Label>
              <select
                id="sheet-category"
                className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="sheet-personal"
                checked={isPersonal}
                onCheckedChange={(checked) => setIsPersonal(checked === true)}
              />
              <Label htmlFor="sheet-personal" className="text-sm font-normal">Personal (not shared)</Label>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sheet-notes">Notes</Label>
              <textarea
                id="sheet-notes"
                className="min-h-24 rounded-lg border border-input bg-transparent p-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add any notes about this transaction…"
              />
            </div>

            <Button
              disabled={isPending}
              className="gradient-primary"
              onClick={() => {
                startTransition(async () => {
                  await updateTransactionDetails(transaction.id, {
                    categoryId: categoryId || null,
                    isPersonal,
                    notes: notes || null,
                  });
                  onOpenChange(false);
                });
              }}
            >
              Save changes
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
