"use client";

import { useTransition } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useI18n, translateError } from "@/lib/i18n/client";
import { initials } from "@/lib/utils";
import { assignParticipantToTeamAction } from "@/server/actions/matches";

export function TeamAssignBoard({
  matchId,
  teams,
  participants,
}: {
  matchId: string;
  teams: Array<{ id: string; label: string; key: string }>;
  participants: Array<{
    id: string;
    membershipId: string;
    teamId: string | null;
    status: string;
    displayName: string;
  }>;
}) {
  const { push } = useToast();
  const { t: tr } = useI18n();
  const [pending, start] = useTransition();

  function assign(participantId: string, teamId: string | null) {
    start(async () => {
      const fd = new FormData();
      fd.set("matchId", matchId);
      fd.set("participantId", participantId);
      fd.set("teamId", teamId ?? "");
      const res = await assignParticipantToTeamAction(fd);
      if (res?.error) push({ title: translateError(tr, res.error), tone: "danger" });
      else push({ title: tr.toasts.teamsUpdated, tone: "success" });
    });
  }

  const unassigned = participants.filter((p) => !p.teamId);
  const red = teams.find((t) => t.key === "red");
  const blue = teams.find((t) => t.key === "blue");

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Available — vertical card per player so the action buttons always fit */}
      <Card>
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{tr.admin.available}</h2>
          <span className="text-xs text-muted-foreground">{unassigned.length}</span>
        </header>
        {unassigned.length === 0 ? (
          <p className="text-xs text-muted-foreground">{tr.admin.noUnassigned}</p>
        ) : (
          <ul className="space-y-2.5">
            {unassigned.map((p) => (
              <li
                key={p.id}
                data-testid={`unassigned-${p.id}`}
                className="rounded-2xl border border-slate-200/60 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] p-3"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{initials(p.displayName)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{p.displayName}</p>
                    <p className="text-[11px] text-muted-foreground">{p.status}</p>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {red && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => assign(p.id, red.id)}
                      data-testid={`assign-red-${p.id}`}
                      className="flex items-center justify-center rounded-xl border border-red-400/30 bg-red-500/15 px-2 py-2 text-xs font-bold text-red-700 dark:text-red-200 transition-colors hover:bg-red-500/25 disabled:opacity-50"
                    >
                      {tr.admin.toRed}
                    </button>
                  )}
                  {blue && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => assign(p.id, blue.id)}
                      data-testid={`assign-blue-${p.id}`}
                      className="flex items-center justify-center rounded-xl border border-blue-400/30 bg-blue-500/15 px-2 py-2 text-xs font-bold text-blue-700 dark:text-blue-200 transition-colors hover:bg-blue-500/25 disabled:opacity-50"
                    >
                      {tr.admin.toBlue}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Each team column */}
      {teams.map((t) => {
        const teamPlayers = participants.filter((p) => p.teamId === t.id);
        const tone =
          t.key === "red"
            ? {
                heading: "text-red-600 dark:text-red-300",
                ring: "ring-1 ring-red-400/20",
              }
            : {
                heading: "text-blue-300",
                ring: "ring-1 ring-blue-400/20",
              };
        return (
          <Card key={t.id} className={tone.ring}>
            <header className="mb-3 flex items-center justify-between">
              <h2 className={`text-base font-semibold ${tone.heading}`}>{t.label}</h2>
              <span className="text-xs text-muted-foreground">{teamPlayers.length}</span>
            </header>
            {teamPlayers.length === 0 ? (
              <p className="text-xs text-muted-foreground">{tr.admin.emptyTeamHint}</p>
            ) : (
              <ul className="space-y-2">
                {teamPlayers.map((p) => (
                  <li
                    key={p.id}
                    data-testid={`team-${t.key}-${p.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200/60 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] px-3 py-2.5"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback>{initials(p.displayName)}</AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                      {p.displayName}
                    </span>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => assign(p.id, null)}
                      data-testid={`unassign-${p.id}`}
                      className="rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-100/70 dark:bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-slate-200 dark:hover:bg-white/[0.08] hover:text-foreground disabled:opacity-50"
                    >
                      {tr.admin.removeBtn}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        );
      })}
    </div>
  );
}
