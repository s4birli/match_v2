"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction } from "@/server/actions/auth";

type ResetState = { error?: string; success?: boolean };

export default function ResetPasswordPage() {
  const [state, formAction] = useActionState<ResetState, FormData>(
    resetPasswordAction,
    {} as ResetState,
  );
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="glass space-y-6 p-6">
        <h1 className="text-2xl font-bold">Pick a new password</h1>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <Input id="password" name="password" type="password" required minLength={8} />
          </div>
          {state?.error ? <p className="text-xs text-red-300">{state.error}</p> : null}
          {state?.success ? (
            <p className="text-xs text-emerald-300">Your password has been updated.</p>
          ) : null}
          <Submit />
        </form>
      </div>
    </div>
  );
}

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? "Saving…" : "Save"}
    </Button>
  );
}
