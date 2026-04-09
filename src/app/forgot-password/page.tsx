"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { forgotPasswordAction } from "@/server/actions/auth";

type ForgotState = { error?: string; success?: boolean };

export default function ForgotPasswordPage() {
  const [state, formAction] = useActionState<ForgotState, FormData>(
    forgotPasswordAction,
    {} as ForgotState,
  );
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="glass space-y-6 p-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-bold">Reset your password</h1>
          <p className="text-sm text-muted-foreground">
            Enter your email and we'll send you a reset link.
          </p>
        </header>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required data-testid="forgot-email" />
          </div>
          {state?.error ? <p className="text-xs text-red-300">{state.error}</p> : null}
          {state?.success ? (
            <p className="text-xs text-emerald-300">Check your inbox.</p>
          ) : null}
          <Submit />
        </form>
        <Link href="/login" className="block text-center text-sm text-muted-foreground hover:underline">
          ← Back to sign in
        </Link>
      </div>
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? "Sending…" : "Send reset link"}
    </Button>
  );
}
