"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n, translateError } from "@/lib/i18n/client";
import { forgotPasswordAction } from "@/server/actions/auth";

type ForgotState = { error?: string; success?: boolean };

export function ForgotForm({
  labels,
}: {
  labels: { email: string; sending: string; send: string; checkInbox: string };
}) {
  const [state, formAction] = useActionState<ForgotState, FormData>(
    forgotPasswordAction,
    {} as ForgotState,
  );
  const { t } = useI18n();
  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">{labels.email}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          data-testid="forgot-email"
        />
      </div>
      {state?.error ? (
        <p className="text-xs text-red-300">{translateError(t, state.error)}</p>
      ) : null}
      {state?.success ? (
        <p className="text-xs text-emerald-300">{labels.checkInbox}</p>
      ) : null}
      <Submit labels={labels} />
    </form>
  );
}

function Submit({ labels }: { labels: { send: string; sending: string } }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? labels.sending : labels.send}
    </Button>
  );
}
