"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useI18n, translateError } from "@/lib/i18n/client";
import { createGuestMemberAction } from "@/server/actions/admin";

export function CreateGuestForm() {
  const { push } = useToast();
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  function action(fd: FormData) {
    start(async () => {
      const res = await createGuestMemberAction(fd);
      if (res?.error) push({ title: translateError(t, res.error), tone: "danger" });
      else {
        push({ title: t.toasts.guestCreated, tone: "success" });
        router.refresh();
      }
    });
  }

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-3 sm:items-end">
      <div className="space-y-2">
        <Label htmlFor="firstName">{t.profile.firstName}</Label>
        <Input
          id="firstName"
          name="firstName"
          required
          autoComplete="given-name"
          data-testid="guest-first-name"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="lastName">{t.profile.lastName}</Label>
        <Input
          id="lastName"
          name="lastName"
          required
          autoComplete="family-name"
          data-testid="guest-last-name"
        />
      </div>
      <Button type="submit" disabled={pending} data-testid="guest-create">
        {pending ? t.admin.adding : t.admin.addGuestBtn}
      </Button>
    </form>
  );
}
