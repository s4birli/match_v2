"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createTenantAction } from "@/server/actions/owner";

export function CreateTenantForm({
  labels,
}: {
  labels: {
    name: string;
    namePlaceholder: string;
    currency: string;
    submit: string;
    submitting: string;
    success: string;
    hint: string;
  };
}) {
  const { push } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  function action(fd: FormData) {
    start(async () => {
      const res = await createTenantAction(fd);
      if ("error" in res) {
        push({ title: res.error, tone: "danger" });
      } else {
        push({
          title: labels.success,
          description: `Code: ${res.inviteCode}`,
          tone: "success",
        });
        router.push(`/owner/tenants/${res.tenantId}`);
      }
    });
  }

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="name">{labels.name}</Label>
        <Input
          id="name"
          name="name"
          required
          placeholder={labels.namePlaceholder}
          data-testid="tenant-name"
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="currencyCode">{labels.currency}</Label>
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
      <p className="text-xs text-muted-foreground sm:col-span-2">{labels.hint}</p>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending} size="lg" data-testid="tenant-submit">
          {pending ? labels.submitting : `+ ${labels.submit}`}
        </Button>
      </div>
    </form>
  );
}
