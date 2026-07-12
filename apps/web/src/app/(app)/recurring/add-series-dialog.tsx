"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { addRecurringSeries } from "./actions";
import { Plus, Repeat } from "lucide-react";

export function AddSeriesDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="gap-2 gradient-primary" />}>
        <Plus className="size-4" />
        Add series
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="size-5 text-primary" />
            Add recurring series
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            startTransition(async () => {
              await addRecurringSeries({
                merchantKey: String(form.get("merchantKey")),
                cadence: String(form.get("cadence")) as Parameters<typeof addRecurringSeries>[0]["cadence"],
                expectedAmount: Number(form.get("expectedAmount")),
                nextExpectedDate: String(form.get("nextExpectedDate")),
                seriesType: String(form.get("seriesType")) as Parameters<typeof addRecurringSeries>[0]["seriesType"],
              });
              setOpen(false);
            });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="series-merchant">Merchant / description</Label>
            <Input
              id="series-merchant"
              name="merchantKey"
              required
              placeholder="e.g. Netflix"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="series-cadence">Cadence</Label>
              <select
                id="series-cadence"
                name="cadence"
                defaultValue="monthly"
                className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="irregular">Irregular</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="series-type">Type</Label>
              <select
                id="series-type"
                name="seriesType"
                defaultValue="subscription"
                className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="subscription">Subscription</option>
                <option value="bill">Bill</option>
                <option value="income">Income</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="series-amount">Expected amount</Label>
              <Input
                id="series-amount"
                name="expectedAmount"
                type="number"
                step="0.01"
                required
                placeholder="0.00"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="series-next-date">Next expected date</Label>
              <Input
                id="series-next-date"
                name="nextExpectedDate"
                type="date"
                required
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </div>
          </div>

          <Button type="submit" disabled={isPending} className="gradient-primary">
            {isPending ? "Adding…" : "Add series"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
