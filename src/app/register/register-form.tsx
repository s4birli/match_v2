"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n, translateError } from "@/lib/i18n/client";
import { registerAction } from "@/server/actions/auth";

type RegisterState = { error?: string; errorParams?: Record<string, string | number> };
const initialState: RegisterState = {};

export function RegisterForm({
  inviteToken,
  inviteCode,
  labels,
}: {
  inviteToken?: string;
  inviteCode?: string;
  labels: {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    inviteCode: string;
    submit: string;
    pending: string;
  };
}) {
  const [state, formAction] = useActionState<RegisterState, FormData>(registerAction, initialState);
  const { t } = useI18n();
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="inviteToken" value={inviteToken ?? ""} />
      <input type="hidden" name="inviteCode" value={inviteCode ?? ""} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="firstName">{labels.firstName}</Label>
          <Input
            id="firstName"
            name="firstName"
            required
            autoComplete="given-name"
            data-testid="register-first-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">{labels.lastName}</Label>
          <Input
            id="lastName"
            name="lastName"
            required
            autoComplete="family-name"
            data-testid="register-last-name"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{labels.email}</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" data-testid="register-email" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{labels.password}</Label>
        <Input id="password" name="password" type="password" required minLength={8} data-testid="register-password" />
      </div>
      {!inviteToken && (
        <div className="space-y-2">
          <Label htmlFor="inviteCode">{labels.inviteCode}</Label>
          <Input id="inviteCode" name="inviteCode" defaultValue={inviteCode ?? ""} data-testid="register-invite" />
        </div>
      )}
      {state?.error ? (
        <p data-testid="register-error" className="text-xs text-red-300">
          {translateError(t, state.error, state.errorParams)}
        </p>
      ) : null}
      <Submit submit={labels.submit} pending={labels.pending} />
    </form>
  );
}

function Submit({ submit, pending }: { submit: string; pending: string }) {
  const { pending: isPending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" disabled={isPending} data-testid="register-submit">
      {isPending ? pending : submit}
    </Button>
  );
}
