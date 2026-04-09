"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { createMatchAction } from "@/server/actions/matches";

export function CreateMatchForm({
  venues,
}: {
  venues: Array<{ id: string; name: string }>;
}) {
  const { push } = useToast();
  const router = useRouter();
  const [pending, start] = useTransition();

  function action(fd: FormData) {
    start(async () => {
      const res = await createMatchAction(fd);
      if (res?.error) {
        push({ title: res.error, tone: "danger" });
      } else if (res?.matchId) {
        push({ title: "Match created", tone: "success" });
        router.push(`/admin/matches/${res.matchId}`);
      }
    });
  }

  // default datetime: tomorrow 18:00
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(18, 0, 0, 0);
  const end = new Date(tomorrow);
  end.setHours(end.getHours() + 1);
  const fmt = (d: Date) => d.toISOString().slice(0, 16);

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" name="title" placeholder="Wednesday game" data-testid="match-title" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="venueId">Venue</Label>
          <select
            id="venueId"
            name="venueId"
            data-testid="match-venue"
            className="flex h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground"
            defaultValue=""
          >
            <option value="">— None —</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="startsAt">Starts at</Label>
          <Input id="startsAt" name="startsAt" type="datetime-local" defaultValue={fmt(tomorrow)} required data-testid="match-starts-at" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="endsAt">Ends at</Label>
          <Input id="endsAt" name="endsAt" type="datetime-local" defaultValue={fmt(end)} required data-testid="match-ends-at" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="teamFormatLabel">Format</Label>
          <Input id="teamFormatLabel" name="teamFormatLabel" defaultValue="6v6" required data-testid="match-format" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="playersPerTeam">Players per team</Label>
          <Input id="playersPerTeam" name="playersPerTeam" type="number" min={2} max={11} defaultValue={6} required data-testid="match-players" />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="matchFee">Match fee</Label>
          <Input id="matchFee" name="matchFee" type="number" min={0} step="0.01" defaultValue={4} required data-testid="match-fee" />
        </div>
      </div>
      <Button type="submit" disabled={pending} size="lg" data-testid="match-submit">
        {pending ? "Creating…" : "Create match"}
      </Button>
    </form>
  );
}
