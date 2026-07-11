"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBudget } from "./actions";
import type { CategoryOption } from "../transactions/types";

function currentMonthStart(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

export function AddBudgetDialog({ categories }: { categories: CategoryOption[] }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>Add budget</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add monthly budget</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            startTransition(async () => {
              await createBudget({
                categoryId: String(form.get("categoryId")),
                amount: Number(form.get("amount")),
                startsOn: String(form.get("startsOn")),
                rollover: form.get("rollover") === "on",
              });
              setOpen(false);
            });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="budget-category">Category</Label>
            <select id="budget-category" name="categoryId" required className="h-9 rounded-md border bg-transparent px-3 text-sm">
              {categories
                .filter((c) => !c.is_income)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="budget-amount">Monthly amount</Label>
            <Input id="budget-amount" name="amount" type="number" step="0.01" min="0" required />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="budget-starts">Starts on</Label>
            <Input id="budget-starts" name="startsOn" type="date" required defaultValue={currentMonthStart()} />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="rollover" />
            Roll over unused amount to next month
          </label>

          <Button type="submit" disabled={isPending}>
            {isPending ? "Adding…" : "Add budget"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
