"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useI18n, translateError } from "@/lib/i18n/client";
import { addExistingPlayerToTenantAction } from "@/server/actions/admin";

/**
 * Picker for "I want to add an already-registered player from another group
 * to MY group" — admin-only. Lists every account that does not currently
 * have an active membership in this tenant.
 */
export function AddExistingPlayerForm({
  accounts,
}: {
  accounts: Array<{ id: string; email: string; display_name: string }>;
}) {
  const { push } = useToast();
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  function action(fd: FormData) {
    start(async () => {
      const res = await addExistingPlayerToTenantAction(fd);
      if (res?.error) push({ title: translateError(t, res.error), tone: "danger" });
      else {
        push({ title: t.toasts.memberAdded, tone: "success" });
        router.refresh();
      }
    });
  }

  if (accounts.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Every registered account is already a member of this group.
      </p>
    );
  }

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3 sm:items-end">
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="accountId">Existing account</Label>
        <select
          id="accountId"
          name="accountId"
          required
          data-testid="add-existing-account"
          className="flex h-12 w-full rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/70 dark:bg-white/[0.04] px-4 py-2 text-sm text-foreground"
          defaultValue=""
        >
          <option value="" disabled>
            — Pick an account —
          </option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.display_name} · {a.email}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending} data-testid="add-existing-submit">
        {pending ? "Adding…" : "+ Add existing"}
      </Button>
    </form>
  );
}
