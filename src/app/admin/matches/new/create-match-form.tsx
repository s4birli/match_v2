"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useI18n, translateError } from "@/lib/i18n/client";
import { createMatchAction } from "@/server/actions/matches";
import { formatCurrency } from "@/lib/utils";

const FORMAT_OPTIONS = ["5v5", "6v6", "7v7", "8v8"] as const;

export function CreateMatchForm({
  venues,
  defaultMatchFee,
  currencyCode,
}: {
  venues: Array<{ id: string; name: string }>;
  defaultMatchFee: number;
  currencyCode: string;
}) {
  const { push } = useToast();
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();

  function action(fd: FormData) {
    start(async () => {
      const res = await createMatchAction(fd);
      if (res?.error) {
        push({ title: translateError(t, res.error), tone: "danger" });
      } else if (res?.matchId) {
        push({ title: t.toasts.matchCreated, tone: "success" });
        router.push(`/admin/matches/${res.matchId}`);
      }
    });
  }

  // Default datetime: tomorrow 18:00 local
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(18, 0, 0, 0);
  const defaultLocal = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T${pad(tomorrow.getHours())}:${pad(tomorrow.getMinutes())}`;

  if (venues.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-400/30 bg-amber-400/10 p-5">
        <p className="text-sm font-semibold text-amber-100">
          You need a venue first.
        </p>
        <p className="mt-1 text-xs text-amber-200/80">
          Create at least one venue, then come back here to schedule a match.
        </p>
        <Button asChild className="mt-3" variant="secondary">
          <Link href="/admin/venues" data-testid="goto-venues">
            + Create a venue
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="venueId">Venue</Label>
          <select
            id="venueId"
            name="venueId"
            required
            data-testid="match-venue"
            className="flex h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground"
            defaultValue={venues[0]?.id ?? ""}
          >
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <Link
            href="/admin/venues"
            className="text-[11px] text-emerald-300 hover:underline"
          >
            + Create another venue
          </Link>
        </div>

        <div className="space-y-2">
          <Label htmlFor="startsAt">Start (date & time)</Label>
          <Input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            defaultValue={defaultLocal}
            required
            data-testid="match-starts-at"
          />
          <p className="text-[11px] text-muted-foreground">
            Match always lasts 1 hour.
          </p>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="format">Format</Label>
          <div className="grid grid-cols-4 gap-2" role="radiogroup">
            {FORMAT_OPTIONS.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] py-3 text-sm font-semibold has-[:checked]:border-emerald-400/40 has-[:checked]:bg-emerald-500/15 has-[:checked]:text-emerald-100"
              >
                <input
                  type="radio"
                  name="format"
                  value={opt}
                  defaultChecked={opt === "6v6"}
                  className="sr-only"
                  data-testid={`match-format-${opt}`}
                />
                {opt}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">
            5v5 = 5 per team. The other half is filled by the opposing team.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Match fee
        </p>
        <p className="mt-1 text-base font-bold">
          {formatCurrency(defaultMatchFee, currencyCode)} per played player
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Set by tenant default — change it under{" "}
          <Link href="/admin/settings" className="text-emerald-300 hover:underline">
            Settings
          </Link>
          .
        </p>
      </div>

      <Button type="submit" disabled={pending} size="lg" data-testid="match-submit">
        {pending ? "Creating…" : "+ Create match"}
      </Button>
    </form>
  );
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
