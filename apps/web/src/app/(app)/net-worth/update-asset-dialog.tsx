"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateAssetValue } from "./actions";
import { Pencil } from "lucide-react";

export function UpdateAssetDialog({ accountId }: { accountId: string }) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="icon-xs" aria-label="Update value" />}>
        <Pencil className="size-4 text-muted-foreground" />
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update value</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = new FormData(e.currentTarget);
            startTransition(async () => {
              await updateAssetValue(accountId, {
                value: Number(form.get("value")),
                asOf: String(form.get("asOf")),
              });
              setOpen(false);
            });
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="update-value">New value</Label>
            <Input id="update-value" name="value" type="number" step="0.01" min="0" required placeholder="0.00" />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="update-as-of">As of</Label>
            <Input id="update-as-of" name="asOf" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
          </div>

          <Button type="submit" disabled={isPending} className="gradient-primary">
            {isPending ? "Saving…" : "Save"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
