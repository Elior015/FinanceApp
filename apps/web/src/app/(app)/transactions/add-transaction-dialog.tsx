"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createManualTransaction } from "./actions";
import type { AccountOption, CategoryOption } from "./types";

export function AddTransactionDialog({ accounts, categories }: { accounts: AccountOption[]; categories: CategoryOption[] }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Add transaction</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add manual transaction</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            const amountSign = form.get("direction") === "income" ? 1 : -1;
            startTransition(async () => {
              await createManualTransaction({
                accountId: String(form.get("accountId")),
                date: String(form.get("date")),
                description: String(form.get("description")),
                chargedAmount: amountSign * Math.abs(Number(form.get("amount"))),
                categoryId: (form.get("categoryId") as string) || null,
                isPersonal: form.get("isPersonal") === "on",
              });
              setOpen(false);
            });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="txn-date">Date</Label>
            <Input id="txn-date" name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="txn-description">Description</Label>
            <Input id="txn-description" name="description" required placeholder="e.g. Cash withdrawal" />
          </div>

          <div className="flex gap-3">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="txn-amount">Amount</Label>
              <Input id="txn-amount" name="amount" type="number" step="0.01" min="0" required />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="txn-direction">Direction</Label>
              <select id="txn-direction" name="direction" className="h-9 rounded-md border bg-transparent px-3 text-sm">
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="txn-account">Account</Label>
            <select id="txn-account" name="accountId" required className="h-9 rounded-md border bg-transparent px-3 text-sm">
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="txn-category">Category</Label>
            <select id="txn-category" name="categoryId" className="h-9 rounded-md border bg-transparent px-3 text-sm">
              <option value="">Uncategorized</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isPersonal" />
            Personal (not shared)
          </label>

          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding…" : "Add transaction"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
