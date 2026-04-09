"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useI18n, translateError } from "@/lib/i18n/client";
import { closeMatchAction } from "@/server/actions/matches";

export function CloseMatchForm({ matchId }: { matchId: string }) {
  const { push } = useToast();
  const { t } = useI18n();
  const [pending, start] = useTransition();

  function action(fd: FormData) {
    start(async () => {
      const res = await closeMatchAction(fd);
      if (res?.error) {
        const params =
          "errorParams" in res ? (res.errorParams as Record<string, string | number>) : undefined;
        push({ title: translateError(t, res.error, params), tone: "danger" });
      } else {
        push({ title: t.toasts.matchClosed, tone: "success" });
      }
    });
  }

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="matchId" value={matchId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="redScore">Red score</Label>
          <Input id="redScore" name="redScore" type="number" min={0} defaultValue={0} required data-testid="close-red-score" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="blueScore">Blue score</Label>
          <Input id="blueScore" name="blueScore" type="number" min={0} defaultValue={0} required data-testid="close-blue-score" />
        </div>
      </div>
      <Button type="submit" disabled={pending} variant="destructive" data-testid="close-submit">
        {pending ? "Closing…" : "Close match"}
      </Button>
    </form>
  );
}
