"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { updateTenantDefaultsAction } from "@/server/actions/admin";

export function TenantDefaultsForm({
  tenantId,
  initialFee,
  currencyCode,
}: {
  tenantId: string;
  initialFee: number;
  currencyCode: string;
}) {
  const { push } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  function action(fd: FormData) {
    start(async () => {
      const res = await updateTenantDefaultsAction(fd);
      if (res?.error) push({ title: res.error, tone: "danger" });
      else {
        push({ title: "Saved", tone: "success" });
        router.refresh();
      }
    });
  }

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="tenantId" value={tenantId} />
      <div className="space-y-2">
        <Label htmlFor="defaultMatchFee">
          Default match fee ({currencyCode})
        </Label>
        <Input
          id="defaultMatchFee"
          name="defaultMatchFee"
          type="number"
          min="0"
          step="0.01"
          defaultValue={initialFee}
          required
          data-testid="settings-fee"
        />
        <p className="text-[11px] text-muted-foreground">
          Charged to each played player when the match is closed.
        </p>
      </div>
      <Button type="submit" disabled={pending} data-testid="settings-save">
        {pending ? "Saving…" : "Save"}
      </Button>
    </form>
  );
}
