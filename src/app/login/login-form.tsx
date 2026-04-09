"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "@/server/actions/auth";

type LoginState = { error?: string };
const initialState: LoginState = {};

export function LoginForm({ next, labels }: { next?: string; labels: { email: string; password: string; submit: string; pending: string } }) {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, initialState);
  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="space-y-2">
        <Label htmlFor="email">{labels.email}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required data-testid="email-input" defaultValue="user.demo@example.com" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{labels.password}</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required data-testid="password-input" defaultValue="Test1234!" />
      </div>
      {state?.error ? (
        <p data-testid="login-error" className="text-xs text-red-300">{state.error}</p>
      ) : null}
      <Submit submit={labels.submit} pending={labels.pending} />
    </form>
  );
}

function Submit({ submit, pending }: { submit: string; pending: string }) {
  const { pending: isPending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" disabled={isPending} data-testid="login-submit">
      {isPending ? pending : submit}
    </Button>
  );
}
