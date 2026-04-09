"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createAdminForTenantAction, updateTenantAction } from "@/server/actions/owner";
import type { Tenant } from "@/lib/supabase/types";

export function TenantSettingsForm({ tenant }: { tenant: Tenant }) {
  const { push } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  function action(fd: FormData) {
    start(async () => {
      const res = await updateTenantAction(fd);
      if (res?.error) push({ title: res.error, tone: "danger" });
      else {
        push({ title: "Saved", tone: "success" });
        router.refresh();
      }
    });
  }
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="tenantId" value={tenant.id} />
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" defaultValue={tenant.name} required data-testid="tenant-edit-name" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="currencyCode">Currency</Label>
        <select
          id="currencyCode"
          name="currencyCode"
          defaultValue={tenant.currency_code}
          className="flex h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground"
        >
          <option value="GBP">GBP</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="TRY">TRY</option>
          <option value="MYR">MYR</option>
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="defaultMatchFee">Default match fee</Label>
        <Input
          id="defaultMatchFee"
          name="defaultMatchFee"
          type="number"
          min="0"
          step="0.01"
          defaultValue={tenant.default_match_fee}
        />
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={tenant.is_active}
          className="h-4 w-4 accent-emerald-500"
        />
        Tenant active
      </label>
      <Button type="submit" disabled={pending} className="sm:col-span-2" data-testid="tenant-edit-submit">
        {pending ? "Saving…" : "Save settings"}
      </Button>
    </form>
  );
}

export function AssignAdminForm({ tenantId }: { tenantId: string }) {
  const { push } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();
  function action(fd: FormData) {
    start(async () => {
      const res = await createAdminForTenantAction(fd);
      if (res?.error) push({ title: res.error, tone: "danger" });
      else {
        push({ title: "Admin assigned", tone: "success" });
        router.refresh();
      }
    });
  }
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3">
      <input type="hidden" name="tenantId" value={tenantId} />
      <div className="space-y-2">
        <Label htmlFor="displayName">Display name</Label>
        <Input id="displayName" name="displayName" required data-testid="assign-admin-name" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required data-testid="assign-admin-email" />
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={pending} className="w-full" data-testid="assign-admin-submit">
          {pending ? "Assigning…" : "Assign admin"}
        </Button>
      </div>
    </form>
  );
}
