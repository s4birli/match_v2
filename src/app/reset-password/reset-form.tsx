"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPasswordAction } from "@/server/actions/auth";

type ResetState = { error?: string; success?: boolean };

export function ResetForm({
  labels,
}: {
  labels: { password: string; saving: string; save: string; updated: string };
}) {
  const [state, formAction] = useActionState<ResetState, FormData>(
    resetPasswordAction,
    {} as ResetState,
  );
  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="password">{labels.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
        />
      </div>
      {state?.error ? <p className="text-xs text-red-300">{state.error}</p> : null}
      {state?.success ? (
        <p className="text-xs text-emerald-300">{labels.updated}</p>
      ) : null}
      <Submit labels={labels} />
    </form>
  );
}

function Submit({ labels }: { labels: { save: string; saving: string } }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" size="lg" disabled={pending}>
      {pending ? labels.saving : labels.save}
    </Button>
  );
}
