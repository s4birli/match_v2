import Link from "next/link";
import { CalendarDays, Trophy, Wallet, Sparkles, Users, Star, Crown } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import {
  getMemberStats,
  getWalletBalance,
  listMatches,
  listNotifications,
  getLeaderboard,
} from "@/server/db/queries";
import { requireMembership } from "@/server/auth/session";
import { formatCurrency, formatDate, initials, relativeFromNow } from "@/lib/utils";
import { getServerDictionary } from "@/lib/i18n/server";
import { AttendanceQuickActions } from "@/components/match/attendance-quick-actions";

export default async function DashboardPage() {
  const { session, membership } = await requireMembership();
  const { t, locale } = await getServerDictionary();

  const [matches, stats, wallet, notifs, leaderboard] = await Promise.all([
    listMatches(membership.tenant_id, { upcoming: true }),
    getMemberStats(membership.tenant_id, membership.id),
    getWalletBalance(membership.tenant_id, membership.id),
    listNotifications(membership.id, 5),
    getLeaderboard(membership.tenant_id),
  ]);

  const nextMatch = matches[0];
  // Only members who have actually played count for the dashboard top-list.
  const topPlayers = leaderboard
    .filter((r) => Number(r?.total_matches_played ?? 0) > 0)
    .sort((a, b) => Number(b?.avg_teammate_rating ?? 0) - Number(a?.avg_teammate_rating ?? 0))
    .slice(0, 4);

  return (
    <AppShell session={session} activePath="/dashboard">
      <section className="hero-card overflow-hidden">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200/80">
              {t.dashboard.hello}
            </p>
            <h1 className="mt-1 text-2xl font-bold">{session.person.display_name}</h1>
            <p className="mt-1 text-sm text-foreground/80">{membership.tenant.name}</p>
          </div>
          <Avatar className="h-14 w-14">
            <AvatarFallback>{initials(session.person.display_name)}</AvatarFallback>
          </Avatar>
        </div>

        {nextMatch ? (
          <div className="mt-5 rounded-2xl border border-white/15 bg-black/20 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-200/80">
                  {t.dashboard.yourNextMatch}
                </p>
                <p className="mt-1 text-base font-bold">
                  {nextMatch.title ?? `${nextMatch.team_format_label} match`}
                </p>
                <p className="text-xs text-foreground/70">
                  {formatDate(nextMatch.starts_at, locale === "tr" ? "tr-TR" : "en-GB")}
                </p>
              </div>
              <Badge variant="info">{nextMatch.team_format_label}</Badge>
            </div>
            <AttendanceQuickActions matchId={nextMatch.id} />
            <div className="mt-3 flex items-center gap-2 text-xs text-foreground/70">
              <CalendarDays size={14} />
              {(nextMatch as { venue?: { name?: string } }).venue?.name ?? "TBD venue"}
            </div>
          </div>
        ) : (
          <EmptyState
            icon={<CalendarDays size={28} />}
            title={t.dashboard.noUpcoming}
            className="mt-5 bg-black/10"
          />
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        <StatBlock label={t.dashboard.played} value={stats?.total_matches_played ?? 0} icon={<Users size={16} />} />
        <StatBlock label={t.dashboard.winRate} value={`${stats?.win_rate ?? 0}%`} icon={<Trophy size={16} />} accent />
        <StatBlock
          label={t.dashboard.avgRating}
          value={stats?.avg_teammate_rating ? Number(stats.avg_teammate_rating).toFixed(1) : "—"}
          icon={<Star size={16} />}
        />
        <StatBlock
          label={t.dashboard.motm}
          value={stats?.motm_count ?? 0}
          icon={<Crown size={16} />}
        />
        <StatBlock
          label={t.dashboard.walletBalance}
          value={formatCurrency(wallet.balance, wallet.currency, locale === "tr" ? "tr-TR" : "en-GB")}
          icon={<Wallet size={16} />}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">{t.dashboard.recentMatches}</h2>
            <Link href="/matches" className="text-xs text-emerald-300 hover:underline">
              All →
            </Link>
          </header>
          {matches.length === 0 ? (
            <EmptyState icon={<CalendarDays size={24} />} title={t.dashboard.noUpcoming} />
          ) : (
            <ul className="space-y-2">
              {matches.slice(0, 5).map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/matches/${m.id}`}
                    data-testid={`match-row-${m.id}`}
                    className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm transition-colors hover:bg-white/[0.06]"
                  >
                    <div>
                      <p className="font-semibold">{m.title ?? `${m.team_format_label} match`}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(m.starts_at, locale === "tr" ? "tr-TR" : "en-GB")} ·{" "}
                        {(m as { venue?: { name?: string } }).venue?.name ?? "—"}
                      </p>
                    </div>
                    <Badge variant={m.status === "completed" ? "success" : "info"}>
                      {m.status}
                    </Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">{t.dashboard.leaderboard}</h2>
            <Link href="/stats" className="text-xs text-emerald-300 hover:underline">
              All →
            </Link>
          </header>
          {topPlayers.length === 0 ? (
            <EmptyState icon={<Sparkles size={24} />} title={t.common.empty} />
          ) : (
            <ul className="space-y-2">
              {topPlayers.map((p, i) => {
                const display = (p as { membership?: { person?: { display_name?: string } } }).membership?.person?.display_name ?? "Player";
                return (
                  <li
                    key={p.membership_id}
                    className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.06] text-xs font-bold">
                      {i + 1}
                    </div>
                    <Avatar className="h-9 w-9">
                      <AvatarFallback>{initials(display)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-semibold">{display}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {p.total_matches_played ?? 0} played · {p.win_rate ?? 0}% win
                      </p>
                    </div>
                    <span className="text-sm font-bold text-emerald-300">
                      {p.avg_teammate_rating ? Number(p.avg_teammate_rating).toFixed(1) : "—"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      {notifs.length > 0 && (
        <Card>
          <h2 className="mb-3 text-base font-semibold">{t.nav.notifications}</h2>
          <ul className="space-y-2">
            {notifs.map((n) => {
              const types = t.notifications.types as Record<
                string,
                { title: string; body: string }
              >;
              const localized = types[n.notification_type] ?? {
                title: n.title,
                body: n.body,
              };
              return (
                <li
                  key={n.id}
                  className="flex items-start justify-between rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3 text-sm"
                >
                  <div>
                    <p className="font-semibold">{localized.title}</p>
                    <p className="text-xs text-muted-foreground">{localized.body}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {relativeFromNow(n.created_at, locale)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
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
    <div className={`stat-card ${accent ? "ring-1 ring-emerald-400/20" : ""}`}>
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="mt-1.5 text-2xl font-bold">{value}</div>
    </div>
  );
}
