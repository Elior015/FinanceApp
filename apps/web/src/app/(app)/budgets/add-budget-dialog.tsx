"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { createBudget } from "./actions";
import { Plus, Target } from "lucide-react";
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
      <DialogTrigger render={<Button size="sm" className="gap-2 gradient-primary" />}>
        <Plus className="size-4" />
        Add budget
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Target className="size-5 text-primary" />
            Add monthly budget
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
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
            <select
              id="budget-category"
              name="categoryId"
              required
              className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            >
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
            <Input id="budget-amount" name="amount" type="number" step="0.01" min="0" required placeholder="0.00" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="budget-starts">Starts on</Label>
            <Input id="budget-starts" name="startsOn" type="date" required defaultValue={currentMonthStart()} />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox id="budget-rollover" name="rollover" />
            <Label htmlFor="budget-rollover" className="text-sm font-normal">
              Roll over unused amount to next month
            </Label>
          </div>

          <Button type="submit" disabled={isPending} className="gradient-primary">
            {isPending ? "Adding…" : "Add budget"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
