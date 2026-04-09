"use client";

import { useTransition } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
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
  const [pending, start] = useTransition();

  function assign(participantId: string, teamId: string | null) {
    start(async () => {
      const fd = new FormData();
      fd.set("matchId", matchId);
      fd.set("participantId", participantId);
      fd.set("teamId", teamId ?? "");
      const res = await assignParticipantToTeamAction(fd);
      if (res?.error) push({ title: res.error, tone: "danger" });
      else push({ title: "Updated", tone: "success" });
    });
  }

  const unassigned = participants.filter((p) => !p.teamId);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card>
        <h2 className="mb-3 text-base font-semibold">Available</h2>
        {unassigned.length === 0 ? (
          <p className="text-xs text-muted-foreground">No unassigned players.</p>
        ) : (
          <ul className="space-y-2">
            {unassigned.map((p) => (
              <li
                key={p.id}
                className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
                data-testid={`unassigned-${p.id}`}
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback>{initials(p.displayName)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{p.displayName}</p>
                  <p className="text-[11px] text-muted-foreground">{p.status}</p>
                </div>
                <div className="flex gap-1">
                  {teams.map((t) => (
                    <Button
                      key={t.id}
                      size="sm"
                      variant={t.key === "red" ? "destructive" : "secondary"}
                      disabled={pending}
                      onClick={() => assign(p.id, t.id)}
                      data-testid={`assign-${t.key}-${p.id}`}
                    >
                      → {t.key}
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {teams.map((t) => {
        const teamPlayers = participants.filter((p) => p.teamId === t.id);
        return (
          <Card key={t.id}>
            <h2 className={`mb-3 text-base font-semibold ${t.key === "red" ? "text-red-300" : "text-blue-300"}`}>
              {t.label}
            </h2>
            {teamPlayers.length === 0 ? (
              <p className="text-xs text-muted-foreground">Empty.</p>
            ) : (
              <ul className="space-y-2">
                {teamPlayers.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback>{initials(p.displayName)}</AvatarFallback>
                    </Avatar>
                    <span className="flex-1 truncate text-sm font-semibold">{p.displayName}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => assign(p.id, null)}
                      data-testid={`unassign-${p.id}`}
                    >
                      Remove
                    </Button>
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
