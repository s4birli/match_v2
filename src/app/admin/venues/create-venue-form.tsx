"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useI18n, translateError } from "@/lib/i18n/client";
import { createVenueAction } from "@/server/actions/admin";

export function CreateVenueForm() {
  const { push } = useToast();
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  function action(fd: FormData) {
    start(async () => {
      const res = await createVenueAction(fd);
      if (res?.error) push({ title: translateError(t, res.error), tone: "danger" });
      else {
        push({ title: t.toasts.venueAdded, tone: "success" });
        router.refresh();
      }
    });
  }
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3 sm:items-end">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required data-testid="venue-name" />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="addressLine">Address</Label>
        <Input id="addressLine" name="addressLine" data-testid="venue-address" />
      </div>
      <Button type="submit" disabled={pending} className="sm:col-span-3" data-testid="venue-submit">
        {pending ? "Saving…" : "Add venue"}
      </Button>
    </form>
  );
}
