"use client";

import { useTransition } from "react";
import { Lock } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { castPollVoteAction } from "@/server/actions/matches";
import { useToast } from "@/components/ui/toast";
import { useI18n, translateError } from "@/lib/i18n/client";

export function PreMatchPoll({
  matchId,
  poll,
  options,
  votes,
  status,
  locked,
  lockReason,
}: {
  matchId: string;
  poll: { id: string };
  options: Array<{ id: string; label: string; team_id: string; sort_order: number }>;
  votes: Array<{ option_id: string; count: number }>;
  status: string;
  /** True until both teams have a full roster — voting is then disallowed. */
  locked?: boolean;
  /** Human-readable reason shown to the user when locked. */
  lockReason?: string | null;
}) {
  const { push } = useToast();
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const total = votes.reduce((s, v) => s + v.count, 0) || 1;

  function vote(optionId: string) {
    start(async () => {
      const fd = new FormData();
      fd.set("matchId", matchId);
      fd.set("optionId", optionId);
      const res = await castPollVoteAction(fd);
      if (res?.error) {
        const errKey = res.error;
        const params =
          "errorParams" in res ? (res.errorParams as Record<string, string | number>) : undefined;
        push({ title: translateError(t, errKey, params), tone: "danger" });
      } else {
        push({ title: t.toasts.voteSaved, tone: "success" });
      }
    });
  }

  const canVote = status === "open" && !locked;
  const stateLabel =
    status === "closed" ? t.matchUi.pollClosed : locked ? t.matchUi.pollLocked : t.matchUi.pollOpen;

  return (
    <Card data-testid="pre-match-poll">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">{t.matchUi.winnerPrediction}</h2>
        <span className="text-[11px] uppercase text-muted-foreground">{stateLabel}</span>
      </header>

      {locked && status === "open" && (
        <div
          data-testid="poll-locked-banner"
          className="mb-3 flex items-start gap-3 rounded-2xl border border-amber-400/30 bg-amber-400/10 p-3 text-amber-100"
        >
          <Lock size={16} className="mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold">{t.matchUi.votingLocked}</p>
            <p className="text-xs text-amber-200/80">
              {lockReason ?? t.matchUi.votingLockedHint}
            </p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {options
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((opt) => {
            const count = votes.find((v) => v.option_id === opt.id)?.count ?? 0;
            const pct = Math.round((count / total) * 100);
            return (
              <div
                key={opt.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-3"
                data-testid={`poll-option-${opt.label.replace(/\s+/g, "-").toLowerCase()}`}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{opt.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {count} · {pct}%
                  </span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.05]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-blue-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                {canVote && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-3 w-full"
                    disabled={pending}
                    onClick={() => vote(opt.id)}
                    data-testid={`poll-vote-${opt.label.replace(/\s+/g, "-").toLowerCase()}`}
                  >
                    {t.matchUi.vote}
                  </Button>
                )}
              </div>
            );
          })}
      </div>
    </Card>
  );
}
