"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { joinWithCodeAction } from "@/server/actions/auth";

type JoinState = { error?: string };

export default function JoinPage() {
  const [state, formAction] = useActionState<JoinState, FormData>(
    joinWithCodeAction,
    {} as JoinState,
  );
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="glass space-y-6 p-6">
        <h1 className="text-2xl font-bold">Join with code</h1>
        <p className="text-sm text-muted-foreground">Enter the code your group admin shared with you.</p>
        <form action={formAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Invite code</Label>
            <Input id="code" name="code" required placeholder="READ123" data-testid="join-code" />
          </div>
          {state?.error ? <p className="text-xs text-red-300">{state.error}</p> : null}
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
