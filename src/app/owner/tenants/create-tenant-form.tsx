"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createTenantAction } from "@/server/actions/owner";

export function CreateTenantForm() {
  const { push } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  function action(fd: FormData) {
    start(async () => {
      const res = await createTenantAction(fd);
      if (res?.error) push({ title: res.error, tone: "danger" });
      else {
        push({ title: "Tenant created", tone: "success" });
        router.refresh();
      }
    });
  }

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" name="name" required placeholder="Riverside FC" data-testid="tenant-name" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">Slug</Label>
        <Input
          id="slug"
          name="slug"
          required
          pattern="[a-z0-9-]+"
          placeholder="riverside-fc"
          data-testid="tenant-slug"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="inviteCode">Invite code (optional)</Label>
        <Input id="inviteCode" name="inviteCode" placeholder="Auto-generated if empty" data-testid="tenant-invite" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="currencyCode">Currency</Label>
        <select
          id="currencyCode"
          name="currencyCode"
          defaultValue="GBP"
          data-testid="tenant-currency"
          className="flex h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground"
        >
          <option value="GBP">GBP — British Pound</option>
          <option value="USD">USD — US Dollar</option>
          <option value="EUR">EUR — Euro</option>
          <option value="TRY">TRY — Turkish Lira</option>
          <option value="MYR">MYR — Malaysian Ringgit</option>
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
          defaultValue="5"
          required
          data-testid="tenant-fee"
        />
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} size="lg" data-testid="tenant-submit">
          {pending ? "Creating…" : "+ Create tenant"}
        </Button>
      </div>
    </form>
  );
}
