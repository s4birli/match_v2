"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n, translateError } from "@/lib/i18n/client";
import { joinWithCodeAction } from "@/server/actions/auth";

type JoinState = { error?: string };

export default function JoinPage() {
  const [state, formAction] = useActionState<JoinState, FormData>(
    joinWithCodeAction,
    {} as JoinState,
  );
  const { t } = useI18n();
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="glass space-y-6 p-6">
        <h1 className="text-2xl font-bold">{t.auth.joinWithCode}</h1>
        <p className="text-sm text-muted-foreground">{t.auth.inviteCodePlaceholder}</p>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">{t.auth.inviteCodePlaceholder}</Label>
            <Input id="code" name="code" required placeholder="READ123" data-testid="join-code" />
          </div>
          {state?.error ? <p className="text-xs text-red-600 dark:text-red-300">{translateError(t, state.error)}</p> : null}
          <Submit />
        </form>
      </div>
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending} data-testid="join-submit">
      {pending ? "Joining…" : "Join group"}
    </Button>
  );
}
