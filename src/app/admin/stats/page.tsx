import Link from "next/link";
import {
  CalendarDays,
  Trophy,
  Wallet,
  Users2,
  Star,
  TrendingUp,
  CheckCheck,
  Sparkles,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getLeaderboard, getPairChemistry } from "@/server/db/queries";
import { formatCurrency, initials , bcp47Locale } from "@/lib/utils";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function AdminStatsPage() {
  const { session, membership } = await requireRole([
    "admin",
    "owner",
    "assistant_admin",
  ]);
  const { t, locale } = await getServerDictionary();
  const admin = createSupabaseServiceClient();
  const tenantId = membership.tenant_id;
  const isFullAdmin = membership.role === "admin" || membership.role === "owner";

  const pairChemistry = await getPairChemistry(tenantId, 8);
  const [
    leaderboard,
    { count: totalMatches },
    { count: completedMatches },
    { count: cancelledMatches },
    { count: totalMembers },
    { count: archivedMembers },
    { data: ledgerRows },
    { data: participantRows },
    { data: matchRows },
  ] = await Promise.all([
    getLeaderboard(tenantId),
    admin.from("matches").select("id", { count: "exact", head: true }).eq("tenant_id", tenantId),
    admin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "completed"),
    admin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "cancelled"),
    admin
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .neq("status", "archived"),
    admin
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "archived"),
    admin
      .from("ledger_transactions")
      .select("amount, direction, transaction_type, membership_id")
      .eq("tenant_id", tenantId),
    admin
      .from("match_participants")
      .select("attendance_status")
      .eq("tenant_id", tenantId),
    admin
      .from("matches")
      .select("starts_at, status")
      .eq("tenant_id", tenantId)
      .order("starts_at", { ascending: false })
      .limit(50),
  ]);

  // ---- Financial aggregates (admin only) ----
  let feesCharged = 0;
  let paymentsReceived = 0;
  const owedByMember = new Map<string, number>();
  for (const tx of ledgerRows ?? []) {
    const amt = Number(tx.amount);
    if (tx.direction === "debit") {
      feesCharged += amt;
      owedByMember.set(
        tx.membership_id,
        (owedByMember.get(tx.membership_id) ?? 0) + amt,
      );
    } else {
      paymentsReceived += amt;
      owedByMember.set(
        tx.membership_id,
        (owedByMember.get(tx.membership_id) ?? 0) - amt,
      );
    }
  }
  const collectionRate =
    feesCharged > 0 ? Math.round((paymentsReceived / feesCharged) * 100) : 0;
  const topOwed = Array.from(owedByMember, ([membership_id, balance]) => ({
    membership_id,
    balance,
  }))
    .filter((r) => r.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);
  const memberLookup = new Map(
    leaderboard.map((r) => [
      r.membership_id,
      (r as { membership?: { person?: { display_name?: string } } }).membership?.person
        ?.display_name ?? "Player",
    ]),
  );

  // ---- Attendance reliability ----
  const attendanceCounts = {
    invited: 0,
    confirmed: 0,
    played: 0,
    declined: 0,
    no_show: 0,
    reserve: 0,
    checked_in: 0,
  };
  for (const p of participantRows ?? []) {
    const k = p.attendance_status as keyof typeof attendanceCounts;
    if (k in attendanceCounts) attendanceCounts[k]++;
  }
  const reliability =
    (participantRows?.length ?? 0) > 0
      ? Math.round(
          (attendanceCounts.played /
            (participantRows?.length ?? 1)) *
            100,
        )
      : 0;

  // ---- Activity (last 30 days) ----
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent30 = (matchRows ?? []).filter(
    (m) => new Date(m.starts_at).getTime() >= cutoff,
  ).length;

  // ---- Rankings ----
  const ranked = leaderboard.filter(
    (r) => Number(r?.total_matches_played ?? 0) > 0,
  );
  const topRating = [...ranked]
    .sort(
      (a, b) =>
        Number(b?.avg_teammate_rating ?? 0) -
        Number(a?.avg_teammate_rating ?? 0),
    )
    .slice(0, 5);
  const topMotm = [...ranked]
    .sort((a, b) => Number(b?.motm_count ?? 0) - Number(a?.motm_count ?? 0))
    .slice(0, 5);
  const topAttendance = [...ranked]
    .sort(
      (a, b) =>
        Number(b?.total_matches_played ?? 0) -
        Number(a?.total_matches_played ?? 0),
    )
    .slice(0, 5);

  return (
    <AppShell session={session} activePath="/admin/stats">
      <header>
        <h1 className="text-2xl font-bold">{t.admin.groupAnalytics}</h1>
        <p className="text-sm text-muted-foreground">{membership.tenant.name}</p>
      </header>

      {/* Top metrics */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatBlock
          label={t.admin.totalMatches}
          value={totalMatches ?? 0}
          icon={<CalendarDays size={18} />}
        />
        <StatBlock
          label={t.admin.completed}
          value={completedMatches ?? 0}
          icon={<Trophy size={18} />}
          accent
        />
        <StatBlock
          label={t.admin.activeMembers}
          value={totalMembers ?? 0}
          icon={<Users2 size={18} />}
        />
        <StatBlock
          label={t.admin.last30Days}
          value={recent30}
          icon={<TrendingUp size={18} />}
        />
      </section>

      {/* Financial aggregates */}
      {isFullAdmin && (
        <section className="grid gap-4 lg:grid-cols-3">
          <Card>
            <header className="mb-3 flex items-center gap-2">
              <Wallet size={16} className="text-emerald-300" />
              <h2 className="text-base font-semibold">{t.admin.cashFlow}</h2>
            </header>
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
                <span className="text-muted-foreground">{t.admin.feesCharged}</span>
                <span className="font-bold">
                  {formatCurrency(
                    feesCharged,
                    membership.tenant.currency_code,
                    bcp47Locale(locale),
                  )}
                </span>
              </li>
              <li className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
                <span className="text-muted-foreground">{t.admin.paymentsReceived}</span>
                <span className="font-bold text-emerald-300">
                  +
                  {formatCurrency(
                    paymentsReceived,
                    membership.tenant.currency_code,
                    bcp47Locale(locale),
                  )}
                </span>
              </li>
              <li className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2.5">
                <span className="text-muted-foreground">{t.admin.collectionRate}</span>
                <span className="font-bold">{collectionRate}%</span>
              </li>
              <li className="flex items-center justify-between rounded-xl border border-emerald-400/20 bg-emerald-400/5 px-3 py-2.5">
                <span className="text-muted-foreground">{t.admin.outstanding}</span>
                <span
                  className={`font-bold ${feesCharged - paymentsReceived > 0 ? "text-amber-300" : "text-emerald-300"}`}
                >
                  {formatCurrency(
                    feesCharged - paymentsReceived,
                    membership.tenant.currency_code,
                    bcp47Locale(locale),
                  )}
                </span>
              </li>
            </ul>
          </Card>

          <Card className="lg:col-span-2">
            <header className="mb-3 flex items-center gap-2">
              <Wallet size={16} className="text-amber-300" />
              <h2 className="text-base font-semibold">{t.admin.topOwed}</h2>
            </header>
            {topOwed.length === 0 ? (
              <EmptyState title={t.admin.noOutstanding} />
            ) : (
              <ul className="space-y-2">
                {topOwed.map((row) => {
                  const display = memberLookup.get(row.membership_id) ?? "Player";
                  return (
                    <li
                      key={row.membership_id}
                      className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarFallback>{initials(display)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{display}</p>
                      </div>
                      <span className="text-sm font-bold text-amber-300">
                        {formatCurrency(
                          row.balance,
                          membership.tenant.currency_code,
                          bcp47Locale(locale),
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </section>
      )}

      {/* Attendance reliability */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Card>
          <header className="mb-3 flex items-center gap-2">
            <CheckCheck size={16} className="text-emerald-300" />
            <h2 className="text-base font-semibold">{t.admin.attendanceReliability}</h2>
          </header>
          <p className="text-3xl font-black text-emerald-300">{reliability}%</p>
          <p className="mt-1 text-xs text-muted-foreground">{t.admin.ofInvitedPlayed}</p>
          <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
            <li className="flex justify-between">
              <span>{t.admin.attPlayed}</span>
              <span className="font-semibold text-foreground">
                {attendanceCounts.played}
              </span>
            </li>
            <li className="flex justify-between">
              <span>{t.admin.attConfirmed}</span>
              <span className="font-semibold text-foreground">
                {attendanceCounts.confirmed}
              </span>
            </li>
            <li className="flex justify-between">
              <span>{t.admin.attReserve}</span>
              <span className="font-semibold text-foreground">
                {attendanceCounts.reserve}
              </span>
            </li>
            <li className="flex justify-between">
              <span>{t.admin.attDeclined}</span>
              <span className="font-semibold text-foreground">
                {attendanceCounts.declined}
              </span>
            </li>
            <li className="flex justify-between">
              <span>{t.admin.attNoShow}</span>
              <span className="font-semibold text-foreground">
                {attendanceCounts.no_show}
              </span>
            </li>
          </ul>
        </Card>

        <Card>
          <header className="mb-3 flex items-center gap-2">
            <CalendarDays size={16} className="text-blue-300" />
            <h2 className="text-base font-semibold">{t.admin.matchOutcomes}</h2>
          </header>
          <p className="text-3xl font-black">{totalMatches ?? 0}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t.admin.totalMatchesLabel}</p>
          <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
            <li className="flex justify-between">
              <span>{t.admin.stCompleted}</span>
              <span className="font-semibold text-emerald-300">
                {completedMatches ?? 0}
              </span>
            </li>
            <li className="flex justify-between">
              <span>{t.admin.stCancelled}</span>
              <span className="font-semibold text-red-300">
                {cancelledMatches ?? 0}
              </span>
            </li>
            <li className="flex justify-between">
              <span>{t.admin.stScheduled}</span>
              <span className="font-semibold text-blue-300">
                {(totalMatches ?? 0) -
                  (completedMatches ?? 0) -
                  (cancelledMatches ?? 0)}
              </span>
            </li>
          </ul>
        </Card>

        <Card>
          <header className="mb-3 flex items-center gap-2">
            <Users2 size={16} className="text-violet-300" />
            <h2 className="text-base font-semibold">{t.admin.membershipTitle}</h2>
          </header>
          <p className="text-3xl font-black">{totalMembers ?? 0}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t.admin.activeMembersLabel}</p>
          <ul className="mt-4 space-y-1.5 text-xs text-muted-foreground">
            <li className="flex justify-between">
              <span>{t.admin.archivedLabel}</span>
              <span className="font-semibold text-foreground">
                {archivedMembers ?? 0}
              </span>
            </li>
          </ul>
        </Card>
      </section>

      {/* Pair chemistry — duos that play (and win) together the most */}
      <Card>
        <header className="mb-3 flex items-center gap-2">
          <Sparkles size={16} className="text-violet-300" />
          <h2 className="text-base font-semibold">{t.admin.strongPairs}</h2>
        </header>
        {pairChemistry.length === 0 ? (
          <EmptyState
            title={t.admin.noPairData}
            description={t.admin.noPairDataHint}
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {pairChemistry.map((p) => (
              <li
                key={`${p.a}::${p.b}`}
                data-testid={`pair-${p.a}-${p.b}`}
                className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
              >
                <div className="flex items-center -space-x-2">
                  <Avatar className="h-9 w-9 ring-2 ring-slate-950">
                    <AvatarFallback>{initials(p.aName)}</AvatarFallback>
                  </Avatar>
                  <Avatar className="h-9 w-9 ring-2 ring-slate-950">
                    <AvatarFallback>{initials(p.bName)}</AvatarFallback>
                  </Avatar>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {p.aName} <span className="text-muted-foreground">+</span>{" "}
                    {p.bName}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {p.matches} matches · {p.wins}W / {p.draws}D / {p.losses}L
                  </p>
                </div>
                <span className="text-sm font-bold text-emerald-300">
                  {p.win_rate}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Top rankings */}
      <section className="grid gap-4 lg:grid-cols-3">
        <Leaderboard
          title={t.admin.topRated}
          icon={<Star size={16} />}
          rows={topRating}
          metric={(r) =>
            r?.avg_teammate_rating
              ? Number(r.avg_teammate_rating).toFixed(1)
              : "—"
          }
          memberLookup={memberLookup}
          emptyLabel={t.admin.noData}
        />
        <Leaderboard
          title={t.admin.mostMotm}
          icon={<Trophy size={16} />}
          rows={topMotm}
          metric={(r) => `${r?.motm_count ?? 0}`}
          memberLookup={memberLookup}
          emptyLabel={t.admin.noData}
        />
        <Leaderboard
          title={t.admin.mostActive}
          icon={<CalendarDays size={16} />}
          rows={topAttendance}
          metric={(r) => `${r?.total_matches_played ?? 0}`}
          memberLookup={memberLookup}
          emptyLabel={t.admin.noData}
        />
      </section>
    </AppShell>
  );
}

function StatBlock({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className={`stat-card ${accent ? "ring-1 ring-emerald-400/30" : ""}`}>
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="mt-1.5 text-3xl font-black">{value}</div>
    </div>
  );
}

type LbRow = Awaited<ReturnType<typeof getLeaderboard>>[number];

function Leaderboard({
  title,
  icon,
  rows,
  metric,
  memberLookup,
  emptyLabel,
}: {
  title: string;
  icon: React.ReactNode;
  rows: LbRow[];
  metric: (r: LbRow) => string;
  memberLookup: Map<string, string>;
  emptyLabel: string;
}) {
  return (
    <Card>
      <header className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-base font-semibold">{title}</h2>
      </header>
      {rows.length === 0 ? (
        <EmptyState title={emptyLabel} />
      ) : (
        <ul className="space-y-2">
          {rows.map((r, i) => {
            const display = memberLookup.get(r.membership_id) ?? "Player";
            return (
              <li key={r.membership_id}>
                <Link
                  href={`/admin/members/${r.membership_id}`}
                  data-testid={`leaderboard-row-${r.membership_id}`}
                  className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5 transition-colors hover:bg-white/[0.06]"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] text-xs font-bold">
                    {i + 1}
                  </div>
                  <Avatar className="h-9 w-9">
                    <AvatarFallback>{initials(display)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{display}</p>
                  </div>
                  <span className="text-sm font-bold text-emerald-300">
                    {metric(r)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// Unused but exported types kept for tests / future query helpers.
export type { LbRow };

// Silence unused-import in case admin-only Badge is wired in later.
export const _BADGE_PLACEHOLDER: typeof Badge | null = null;
