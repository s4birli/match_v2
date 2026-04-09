import { Trophy, Star } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUserOnly } from "@/server/auth/session";
import { getLeaderboard, getMemberStats } from "@/server/db/queries";
import { initials } from "@/lib/utils";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function StatsPage() {
  const { session, membership } = await requireUserOnly();
  const { t } = await getServerDictionary();

  const [my, leaderboard] = await Promise.all([
    getMemberStats(membership.tenant_id, membership.id),
    getLeaderboard(membership.tenant_id),
  ]);

  // Only members who actually played at least one match should appear on
  // any leaderboard. Otherwise we'd be ranking people on 0/0/0 which is
  // both meaningless and ugly.
  const ranked = leaderboard.filter(
    (r) => Number(r?.total_matches_played ?? 0) > 0,
  );

  const sortedByRating = [...ranked].sort(
    (a, b) => Number(b?.avg_teammate_rating ?? 0) - Number(a?.avg_teammate_rating ?? 0),
  );
  const sortedByWinRate = [...ranked].sort(
    (a, b) => Number(b?.win_rate ?? 0) - Number(a?.win_rate ?? 0),
  );
  const sortedByMotm = [...ranked].sort(
    (a, b) => Number(b?.motm_count ?? 0) - Number(a?.motm_count ?? 0),
  );

  return (
    <AppShell session={session} activePath="/stats">
      <header>
        <h1 className="text-2xl font-bold">{t.nav.stats}</h1>
        <p className="text-sm text-muted-foreground">{membership.tenant.name}</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-4">
        <StatBlock label={t.dashboard.played} value={my?.total_matches_played ?? 0} />
        <StatBlock label={t.dashboard.wins} value={my?.wins ?? 0} />
        <StatBlock label={t.dashboard.winRate} value={`${my?.win_rate ?? 0}%`} accent />
        <StatBlock
          label={t.dashboard.avgRating}
          value={my?.avg_teammate_rating ? Number(my.avg_teammate_rating).toFixed(1) : "—"}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Leaderboard
          title={`${t.dashboard.leaderboard} · Rating`}
          icon={<Star size={16} />}
          rows={sortedByRating}
          metric={(r) => (r?.avg_teammate_rating ? Number(r.avg_teammate_rating).toFixed(1) : "—")}
        />
        <Leaderboard
          title={`${t.dashboard.winRate}`}
          icon={<Trophy size={16} />}
          rows={sortedByWinRate}
          metric={(r) => `${r?.win_rate ?? 0}%`}
        />
        <Leaderboard
          title={`${t.dashboard.motm}`}
          icon={<Trophy size={16} />}
          rows={sortedByMotm}
          metric={(r) => `${r?.motm_count ?? 0}`}
        />
      </section>
    </AppShell>
  );
}

function StatBlock({ label, value, accent }: { label: string; value: number | string; accent?: boolean }) {
  return (
    <div className={`stat-card ${accent ? "ring-1 ring-emerald-400/30" : ""}`}>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
}

type LbRow = Awaited<ReturnType<typeof getLeaderboard>>[number];

function Leaderboard({
  title,
  icon,
  rows,
  metric,
}: {
  title: string;
  icon: React.ReactNode;
  rows: LbRow[];
  metric: (r: LbRow) => string;
}) {
  if (!rows || rows.length === 0)
    return (
      <Card>
        <header className="mb-3 flex items-center gap-2">
          {icon}
          <h2 className="text-base font-semibold">{title}</h2>
        </header>
        <EmptyState title="No data yet." />
      </Card>
    );
  return (
    <Card>
      <header className="mb-3 flex items-center gap-2">
        {icon}
        <h2 className="text-base font-semibold">{title}</h2>
      </header>
      <ul className="space-y-2">
        {rows.slice(0, 6).map((r, i) => {
          const display =
            (r as { membership?: { person?: { display_name?: string } } }).membership?.person?.display_name ??
            "Player";
          return (
            <li
              key={r.membership_id}
              className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] text-xs font-bold">
                {i + 1}
              </div>
              <Avatar className="h-9 w-9">
                <AvatarFallback>{initials(display)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{display}</p>
                <p className="text-[11px] text-muted-foreground">
                  {r.total_matches_played ?? 0} played
                </p>
              </div>
              <span className="text-sm font-bold text-emerald-300">{metric(r)}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
