"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useI18n, translateError } from "@/lib/i18n/client";
import { recordPaymentAction } from "@/server/actions/admin";

export function PaymentForm({ members }: { members: Array<{ id: string; name: string }> }) {
  const { push } = useToast();
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  function action(fd: FormData) {
    start(async () => {
      const res = await recordPaymentAction(fd);
      if (res?.error) push({ title: translateError(t, res.error), tone: "danger" });
      else {
        push({ title: t.toasts.paymentRecorded, tone: "success" });
        router.refresh();
      }
    });
  }

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3 sm:items-end">
      <div className="space-y-2">
        <Label htmlFor="membershipId">Member</Label>
        <select
          id="membershipId"
          name="membershipId"
          data-testid="payment-member"
          className="flex h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground"
          required
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="amount">Amount</Label>
        <Input id="amount" name="amount" type="number" min="0.01" step="0.01" required data-testid="payment-amount" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Input id="description" name="description" placeholder="Cash" data-testid="payment-description" />
      </div>
      <Button type="submit" disabled={pending} className="sm:col-span-3" data-testid="payment-submit">
        {pending ? "Saving…" : "Record payment"}
      </Button>
    </form>
  );
}
