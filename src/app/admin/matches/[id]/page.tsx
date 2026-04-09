import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/server/auth/session";
import { getMatchFull, listTenantMembers } from "@/server/db/queries";
import { formatDate } from "@/lib/utils";
import { TeamAssignBoard } from "./team-assign-board";
import { CloseMatchForm } from "./close-match-form";
import { AddParticipantForm } from "./add-participant-form";

export default async function AdminMatchDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, membership } = await requireRole(["admin", "owner", "assistant_admin"]);

  const data = await getMatchFull(id);
  if (!data || data.match.tenant_id !== membership.tenant_id) notFound();
  const { match, teams, participants, result } = data;

  const allMembers = await listTenantMembers(membership.tenant_id);
  const existingIds = new Set(participants.map((p) => p.membership_id));
  const candidates = allMembers
    .filter((m) => !existingIds.has(m.id) && m.role !== "owner")
    .map((m) => ({
      id: m.id,
      displayName: (m as { person?: { display_name?: string } }).person?.display_name ?? "Player",
    }));

  const isAdmin = membership.role === "admin" || membership.role === "owner";

  return (
    <AppShell session={session} activePath="/admin/matches">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Link href="/admin/matches" className="text-xs text-muted-foreground hover:text-foreground">
            ← Back
          </Link>
          <h1 className="mt-2 text-2xl font-bold">
            {match.title ?? `${match.team_format_label} match`}
          </h1>
          <p className="text-sm text-muted-foreground">{formatDate(match.starts_at)}</p>
        </div>
        <Badge variant={match.status === "completed" ? "success" : "info"}>{match.status}</Badge>
      </header>

      <Card>
        <h2 className="mb-3 text-base font-semibold">Add participants</h2>
        {candidates.length === 0 ? (
          <p className="text-xs text-muted-foreground">All members are already added.</p>
        ) : (
          <AddParticipantForm matchId={match.id} candidates={candidates} />
        )}
      </Card>

      <TeamAssignBoard
        matchId={match.id}
        teams={teams.map((t) => ({ id: t.id, label: t.display_name, key: t.team_key }))}
        participants={participants.map((p) => ({
          id: p.id,
          membershipId: p.membership_id,
          teamId: p.team_id,
          status: p.attendance_status,
          displayName:
            (p as { membership?: { person?: { display_name?: string } } }).membership?.person?.display_name ?? "Player",
        }))}
      />

      {isAdmin && match.status !== "completed" && (
        <Card>
          <h2 className="mb-3 text-base font-semibold">Close match</h2>
          <CloseMatchForm matchId={match.id} />
        </Card>
      )}

      {match.status === "completed" && result && (
        <Card>
          <h2 className="text-base font-semibold">Final score</h2>
          <p className="mt-2 text-3xl font-black">
            <span className="text-red-300">{result.red_score}</span>
            <span className="mx-3 text-muted-foreground">—</span>
            <span className="text-blue-300">{result.blue_score}</span>
          </p>
          {result.is_draw ? (
            <Badge variant="warning">Draw</Badge>
          ) : (
            <Badge variant="success">Winner saved</Badge>
          )}
        </Card>
      )}

      {participants.length === 0 && (
        <EmptyState title="No participants yet." description="Add players to get started." />
      )}
    </AppShell>
  );
}
