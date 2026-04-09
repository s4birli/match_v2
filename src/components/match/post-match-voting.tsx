"use client";

import { useState, useTransition } from "react";
import { Star, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { useI18n, translateError } from "@/lib/i18n/client";
import { castMotmVoteAction, submitTeammateRatingsAction } from "@/server/actions/matches";

export function PostMatchVoting({
  matchId,
  myMembershipId,
  myTeamId,
  playedParticipants,
  myRatingAvg,
}: {
  matchId: string;
  myMembershipId: string;
  myTeamId: string | null;
  playedParticipants: Array<{
    id: string;
    membershipId: string;
    teamId: string | null;
    displayName: string;
  }>;
  myRatingAvg: number | null;
}) {
  const { push } = useToast();
  const { t } = useI18n();
  const [pending, start] = useTransition();
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [motm, setMotm] = useState<string | null>(null);

  const teammates = playedParticipants.filter(
    (p) => p.teamId === myTeamId && p.membershipId !== myMembershipId,
  );
  const allPlayed = playedParticipants.filter((p) => p.membershipId !== myMembershipId);

  function setRating(target: string, value: number) {
    setRatings((r) => ({ ...r, [target]: value }));
  }

  function submitRatings() {
    start(async () => {
      const fd = new FormData();
      fd.set("matchId", matchId);
      Object.entries(ratings).forEach(([target, val]) => {
        fd.set(`rating-${target}`, String(val));
      });
      const res = await submitTeammateRatingsAction(fd);
      if (res?.error) push({ title: translateError(t, res.error), tone: "danger" });
      else push({ title: t.toasts.ratingsSubmitted, tone: "success" });
    });
  }

  function submitMotm() {
    if (!motm) return;
    start(async () => {
      const fd = new FormData();
      fd.set("matchId", matchId);
      fd.set("targetMembershipId", motm);
      const res = await castMotmVoteAction(fd);
      if (res?.error) push({ title: translateError(t, res.error), tone: "danger" });
      else push({ title: t.toasts.motmVoteSent, tone: "success" });
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card data-testid="rate-teammates-card">
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Rate your teammates</h2>
          {myRatingAvg !== null && (
            <span className="rounded-full border border-emerald-400/30 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">
              Your avg: {myRatingAvg.toFixed(1)} / 5
            </span>
          )}
        </header>
        {teammates.length === 0 ? (
          <p className="text-xs text-muted-foreground">No teammates to rate.</p>
        ) : (
          <ul className="space-y-3">
            {teammates.map((p) => (
              <li
                key={p.membershipId}
                className="rounded-2xl border border-white/5 bg-white/[0.02] p-3"
                data-testid={`rate-row-${p.membershipId}`}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{initials(p.displayName)}</AvatarFallback>
                  </Avatar>
                  <p className="flex-1 text-sm font-semibold">{p.displayName}</p>
                </div>
                <div className="mt-3 flex items-center justify-between gap-1">
                  {[1, 2, 3, 4, 5].map((v) => (
                    <button
                      key={v}
                      type="button"
                      data-testid={`rate-${p.membershipId}-${v}`}
                      onClick={() => setRating(p.membershipId, v)}
                      className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-all ${
                        ratings[p.membershipId] === v
                          ? "border-emerald-400/60 bg-emerald-400/20 text-emerald-200"
                          : "border-white/10 bg-white/[0.04] text-muted-foreground hover:bg-white/[0.08]"
                      }`}
                      aria-label={`Rate ${v}`}
                    >
                      <Star size={14} />
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        {teammates.length > 0 && (
          <Button
            className="mt-4 w-full"
            disabled={pending || Object.keys(ratings).length === 0}
            onClick={submitRatings}
            data-testid="submit-ratings"
          >
            Submit ratings
          </Button>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Edit window: 1 minute. Raw scores stay private — even from admins.
        </p>
      </Card>

      <Card data-testid="motm-card">
        <header className="mb-3 flex items-center gap-2">
          <Trophy size={16} className="text-amber-300" />
          <h2 className="text-base font-semibold">Player of the match</h2>
        </header>
        {allPlayed.length === 0 ? (
          <p className="text-xs text-muted-foreground">No candidates.</p>
        ) : (
          <ul className="space-y-2">
            {allPlayed.map((p) => (
              <li key={p.membershipId}>
                <button
                  type="button"
                  data-testid={`motm-pick-${p.membershipId}`}
                  onClick={() => setMotm(p.membershipId)}
                  className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all ${
                    motm === p.membershipId
                      ? "border-amber-400/40 bg-amber-400/10 text-amber-100"
                      : "border-white/10 bg-white/[0.02] hover:bg-white/[0.06]"
                  }`}
                >
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{initials(p.displayName)}</AvatarFallback>
                  </Avatar>
                  <span className="flex-1 text-sm font-semibold">{p.displayName}</span>
                  {motm === p.membershipId ? <Trophy size={14} /> : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        {allPlayed.length > 0 && (
          <Button
            className="mt-4 w-full"
            variant="accent"
            disabled={pending || !motm}
            onClick={submitMotm}
            data-testid="submit-motm"
          >
            Submit MOTM vote
          </Button>
        )}
      </Card>
    </div>
  );
}
