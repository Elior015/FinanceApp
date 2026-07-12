"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createManualAsset } from "./actions";
import { Plus, PiggyBank } from "lucide-react";

export function AddAssetDialog() {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="gap-2 gradient-primary" />}>
        <Plus className="size-4" />
        Add manual asset
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PiggyBank className="size-5 text-primary" />
            Add manual asset
          </DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            startTransition(async () => {
              await createManualAsset({
                displayName: String(form.get("displayName")),
                currency: String(form.get("currency")),
                initialValue: Number(form.get("initialValue")),
                asOf: String(form.get("asOf")),
              });
              setOpen(false);
            });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="asset-name">Name</Label>
            <Input id="asset-name" name="displayName" required placeholder="e.g. Keren Hishtalmut" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="asset-currency">Currency</Label>
            <select
              id="asset-currency"
              name="currency"
              defaultValue="ILS"
              className="h-9 rounded-lg border border-input bg-transparent px-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="ILS">ILS</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="asset-value">Current value</Label>
            <Input id="asset-value" name="initialValue" type="number" step="0.01" min="0" required placeholder="0.00" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="asset-as-of">As of</Label>
            <Input id="asset-as-of" name="asOf" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>

          <Button type="submit" disabled={isPending} className="gradient-primary">
            {isPending ? "Adding…" : "Add asset"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
