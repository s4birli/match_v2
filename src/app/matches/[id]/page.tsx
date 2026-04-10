import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, MapPin, Users, Trophy, Star, Crown } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { getMatchFull, getMatchAggregateInsights } from "@/server/db/queries";
import { requireMembership } from "@/server/auth/session";
import { formatDate, initials , bcp47Locale } from "@/lib/utils";
import { getServerDictionary } from "@/lib/i18n/server";
import { AttendanceQuickActions } from "@/components/match/attendance-quick-actions";
import { PreMatchPoll } from "@/components/match/pre-match-poll";
import { PostMatchVoting } from "@/components/match/post-match-voting";
import { createSupabaseServiceClient } from "@/lib/supabase/server";

export default async function MatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { session, membership } = await requireMembership();
  const { t, locale } = await getServerDictionary();

  const data = await getMatchFull(id);
  if (!data || data.match.tenant_id !== membership.tenant_id) notFound();
  const { match, teams, participants, result, poll, pollVotes } = data;

  const myParticipant = participants.find((p) => p.membership_id === membership.id);
  const playedParticipants = participants.filter((p) => p.attendance_status === "played");

  const red = teams.find((tt) => tt.team_key === "red");
  const blue = teams.find((tt) => tt.team_key === "blue");

  // Pre-match poll lock state — voting opens only when both teams are full.
  const ROSTER_STATUSES = new Set(["confirmed", "checked_in", "played"]);
  const required = match.players_per_team;
  const redCount = participants.filter(
    (p) => p.team_id === red?.id && ROSTER_STATUSES.has(p.attendance_status),
  ).length;
  const blueCount = participants.filter(
    (p) => p.team_id === blue?.id && ROSTER_STATUSES.has(p.attendance_status),
  ).length;
  const teamsReady = redCount >= required && blueCount >= required;
  const pollLockReason = teamsReady
    ? null
    : `Voting opens once both teams are full (${redCount}/${required} red · ${blueCount}/${required} blue).`;

  // Aggregate-only post-match data (privacy-safe). Pulled for every viewer
  // when the match is completed — anyone in the tenant can see the per-
  // player averages and the player of the match. CLAUDE.md still forbids
  // exposing the raw rating rows or per-rater identities.
  let perPlayerAverages = new Map<string, { avg: number; raters: number }>();
  let motm: { membershipId: string; votes: number } | null = null;
  if (match.status === "completed") {
    const insights = await getMatchAggregateInsights(match.id);
    perPlayerAverages = insights.perPlayerAverages;
    motm = insights.motm;
  }
  const myRatingAvg =
    perPlayerAverages.get(membership.id)?.avg ?? null;
  const motmName = motm
    ? (
        playedParticipants.find((p) => p.membership_id === motm.membershipId) as
          | { membership?: { person?: { display_name?: string } } }
          | undefined
      )?.membership?.person?.display_name ?? "Player"
    : null;

  const isAdmin = membership.role === "admin" || membership.role === "owner";
  const venueName = (match as { venue?: { name?: string } }).venue?.name;

  return (
    <AppShell session={session} activePath="/matches">
      <header className="hero-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link
              href="/matches"
              className="text-xs text-foreground/70 hover:text-foreground"
            >
              ← {t.common.back}
            </Link>
            <h1 className="mt-2 text-2xl font-bold">
              {match.title ?? `${match.team_format_label} match`}
            </h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground/80">
              <CalendarDays size={14} />
              {formatDate(match.starts_at, bcp47Locale(locale))}
            </p>
            {venueName && (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-foreground/80">
                <MapPin size={14} />
                {venueName}
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge
              variant={
                match.status === "completed"
                  ? "success"
                  : match.status === "cancelled"
                    ? "danger"
                    : "info"
              }
            >
              {match.status}
            </Badge>
            <Badge variant="default">{match.team_format_label}</Badge>
          </div>
        </div>

        {result && (
          <div className="mt-5 rounded-2xl border border-slate-200 dark:border-white/15 bg-black/30 p-4 text-center">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {t.match.finalScore}
            </p>
            <p className="mt-2 text-3xl font-black">
              <span className="text-red-600 dark:text-red-300">{result.red_score}</span>
              <span className="mx-3 text-muted-foreground">—</span>
              <span className="text-blue-300">{result.blue_score}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {result.is_draw
                ? t.common.draw
                : result.winner_team_id === red?.id
                  ? `${t.match.teamRed} wins`
                  : `${t.match.teamBlue} wins`}
            </p>
            {motm && motmName && (
              <div
                data-testid="match-motm"
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-200"
              >
                <Crown size={12} />
                {t.dashboard.motm}: {motmName}
                <span className="opacity-70">· {motm.votes}</span>
              </div>
            )}
          </div>
        )}

        {match.status !== "completed" && (
          <div className="mt-4">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
              {t.dashboard.attendance}
            </p>
            <AttendanceQuickActions
              matchId={match.id}
              currentStatus={myParticipant?.attendance_status}
            />
            {myParticipant && (
              <p className="mt-2 text-xs text-foreground/80">
                Status: <span className="font-semibold">{myParticipant.attendance_status}</span>
              </p>
            )}
          </div>
        )}
      </header>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <header className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Users size={16} className="text-red-600 dark:text-red-300" />
              {t.match.teamRed}
            </h2>
            <span className="text-xs text-muted-foreground">
              {participants.filter((p) => p.team_id === red?.id).length} / {match.players_per_team}
            </span>
          </header>
          <PlayerList
            participants={participants.filter((p) => p.team_id === red?.id)}
            isMe={(id) => id === membership.id}
            perPlayerAverages={perPlayerAverages}
            motmId={motm?.membershipId ?? null}
          />
        </Card>
        <Card>
          <header className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Users size={16} className="text-blue-300" />
              {t.match.teamBlue}
            </h2>
            <span className="text-xs text-muted-foreground">
              {participants.filter((p) => p.team_id === blue?.id).length} / {match.players_per_team}
            </span>
          </header>
          <PlayerList
            participants={participants.filter((p) => p.team_id === blue?.id)}
            isMe={(id) => id === membership.id}
            perPlayerAverages={perPlayerAverages}
            motmId={motm?.membershipId ?? null}
          />
        </Card>
      </section>

      <Card>
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t.match.participants}</h2>
          <span className="text-xs text-muted-foreground">
            {participants.length} {t.common.players}
          </span>
        </header>
        {participants.length === 0 ? (
          <EmptyState icon={<Users size={24} />} title="No players yet." />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {participants
              .filter((p) => !p.team_id)
              .map((p) => {
                const display =
                  (p as { membership?: { person?: { display_name?: string } } }).membership?.person?.display_name ?? "Player";
                return (
                  <li
                    key={p.id}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200/60 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] px-3 py-2.5"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback>{initials(display)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{display}</p>
                      <p className="text-[11px] text-muted-foreground">{p.attendance_status}</p>
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </Card>

      {poll && (
        <PreMatchPoll
          poll={poll}
          options={(poll as { options: { id: string; label: string; team_id: string; sort_order: number }[] }).options}
          votes={pollVotes}
          matchId={match.id}
          status={poll.status}
          locked={!teamsReady}
          lockReason={pollLockReason}
        />
      )}

      {match.status === "completed" && myParticipant?.attendance_status === "played" && (
        <PostMatchVoting
          matchId={match.id}
          myMembershipId={membership.id}
          myTeamId={myParticipant.team_id}
          playedParticipants={playedParticipants.map((p) => ({
            id: p.id,
            membershipId: p.membership_id,
            teamId: p.team_id,
            displayName:
              (p as { membership?: { person?: { display_name?: string } } }).membership?.person?.display_name ?? "Player",
          }))}
          myRatingAvg={myRatingAvg}
        />
      )}

      {isAdmin && (
        <Card>
          <header className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Trophy size={16} /> Admin tools
            </h2>
            <Link href={`/admin/matches/${match.id}`} className="text-xs text-emerald-300 hover:underline">
              Open admin →
            </Link>
          </header>
          {match.status !== "completed" && (
            <div className="text-sm text-muted-foreground">
              Use the admin view to assign teams and close the match.
            </div>
          )}
        </Card>
      )}
    </AppShell>
  );
}

type ParticipantRow = Awaited<ReturnType<typeof getMatchFull>> extends infer T
  ? T extends { participants: infer P }
    ? P extends ReadonlyArray<infer R>
      ? R
      : never
    : never
  : never;

function PlayerList({
  participants,
  isMe,
  perPlayerAverages,
  motmId,
}: {
  participants: ParticipantRow[];
  isMe: (membershipId: string) => boolean;
  perPlayerAverages?: Map<string, { avg: number; raters: number }>;
  motmId?: string | null;
}) {
  if (participants.length === 0) {
    return <p className="text-xs text-muted-foreground">No players assigned yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {participants.map((p) => {
        const display =
          (p as { membership?: { person?: { display_name?: string } } }).membership?.person?.display_name ?? "Player";
        const avg = perPlayerAverages?.get(p.membership_id);
        const isMotm = motmId === p.membership_id;
        return (
          <li
            key={p.id}
            data-testid={`player-row-${p.membership_id}`}
            className="flex items-center gap-3 rounded-2xl border border-slate-200/60 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] px-3 py-2.5"
          >
            <Avatar className="h-9 w-9">
              <AvatarFallback>{initials(display)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
                <span className="truncate">{display}</span>
                {isMe(p.membership_id) ? (
                  <span className="text-[10px] uppercase text-emerald-300">you</span>
                ) : null}
                {isMotm ? (
                  <span
                    title="Player of the match"
                    className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-amber-400/20 text-amber-300"
                  >
                    <Crown size={10} />
                  </span>
                ) : null}
              </p>
              <p className="text-[11px] text-muted-foreground">{p.attendance_status}</p>
            </div>
            {avg && avg.raters > 0 ? (
              <span
                data-testid={`player-avg-${p.membership_id}`}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-200"
                title={`${avg.raters} rater${avg.raters === 1 ? "" : "s"}`}
              >
                <Star size={10} />
                {avg.avg.toFixed(1)}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
