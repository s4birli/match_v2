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
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-100">
          {t.admin.noVenueWarning}
        </p>
        <p className="mt-1 text-xs text-amber-700 dark:text-amber-200/80">
          {t.admin.noVenueHint}
        </p>
        <Button asChild className="mt-3" variant="secondary">
          <Link href="/admin/venues" data-testid="goto-venues">
            {t.admin.createVenueFirst}
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="venueId">{t.admin.venueLabel}</Label>
          <select
            id="venueId"
            name="venueId"
            required
            data-testid="match-venue"
            className="flex h-12 w-full rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/70 dark:bg-white/[0.04] px-4 py-2 text-sm text-foreground"
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
            {t.admin.createAnotherVenue}
          </Link>
        </div>

        <div className="space-y-2">
          <Label htmlFor="startsAt">{t.admin.startsAtLabel}</Label>
          <Input
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            defaultValue={defaultLocal}
            required
            data-testid="match-starts-at"
          />
          <p className="text-[11px] text-muted-foreground">
            {t.admin.matchOneHourHint}
          </p>
        </div>

        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="format">{t.admin.formatLabel}</Label>
          <div className="grid grid-cols-4 gap-2" role="radiogroup">
            {FORMAT_OPTIONS.map((opt) => (
              <label
                key={opt}
                className="flex cursor-pointer items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/70 dark:bg-white/[0.04] py-3 text-sm font-semibold has-[:checked]:border-emerald-400/40 has-[:checked]:bg-emerald-500/15 has-[:checked]:text-emerald-100"
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
            {t.admin.formatHint}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] p-4 text-sm">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
          {t.admin.matchFee}
        </p>
        <p className="mt-1 text-base font-bold">
          {t.admin.matchFeePerPlayer.replace(
            "{amount}",
            formatCurrency(defaultMatchFee, currencyCode),
          )}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t.admin.matchFeeFromSettings}
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
