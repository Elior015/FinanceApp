"use client";

import { useState, useTransition } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { updateTransactionDetails } from "./actions";
import { formatAmount } from "./format";
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
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
        {transaction && (
          <div className="flex flex-col gap-4 p-4" key={transaction.id}>
            <SheetHeader className="p-0">
              <SheetTitle>
                <bdi>{transaction.description}</bdi>
              </SheetTitle>
            </SheetHeader>
            <span dir="ltr" className="text-lg font-semibold">
              {formatAmount(transaction.charged_amount, transaction.charged_currency)}
            </span>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sheet-category">Category</Label>
              <select
                id="sheet-category"
                className="h-9 rounded-md border bg-transparent px-3 text-sm"
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
              <Label htmlFor="sheet-personal">Personal (not shared)</Label>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sheet-notes">Notes</Label>
              <textarea
                id="sheet-notes"
                className="min-h-20 rounded-md border bg-transparent p-2 text-sm"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <Button
              disabled={isPending}
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
              Save
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
