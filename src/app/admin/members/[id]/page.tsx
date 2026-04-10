import { notFound } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Star, Trophy, Users, Wallet, Crown } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import {
  getMemberStats,
  getWalletBalance,
  listLedgerForMembership,
} from "@/server/db/queries";
import { formatCurrency, formatDate, initials , bcp47Locale } from "@/lib/utils";
import { getServerDictionary } from "@/lib/i18n/server";

/**
 * Per-player stats page that admins (and assistant admins) can drill into
 * from /admin/members. CLAUDE.md privacy rule still applies — we only show
 * the same aggregate data the player can already see on /stats. Raw rating
 * rows are never returned even to admins. The reason this page exists is
 * twofold: (1) the user explicitly asked for admins to inspect any player's
 * own stats so they can review the squad, and (2) admins ARE players too,
 * so this is also how an admin sees their own historical performance
 * without juggling accounts.
 */
export default async function AdminMemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session, membership: viewer } = await requireRole([
    "admin",
    "owner",
    "assistant_admin",
  ]);
  const { t, locale } = await getServerDictionary();
  const admin = createSupabaseServiceClient();

  // Fetch the target membership and tenant-isolate.
  const { data: target } = await admin
    .from("memberships")
    .select("*, person:persons(*)")
    .eq("id", id)
    .maybeSingle();
  if (!target || target.tenant_id !== viewer.tenant_id) notFound();

  const [stats, wallet, ledger, recentParticipations] = await Promise.all([
    getMemberStats(target.tenant_id, target.id),
    getWalletBalance(target.tenant_id, target.id),
    listLedgerForMembership(target.tenant_id, target.id, 20),
    admin
      .from("match_participants")
      .select("*, match:matches(id, title, starts_at, status, team_format_label)")
      .eq("membership_id", target.id)
      .eq("tenant_id", target.tenant_id)
      .order("attendance_updated_at", { ascending: false })
      .limit(15),
  ]);

  const display = (target.person as { display_name?: string } | null)?.display_name ?? "Player";
  const isSelf = target.id === viewer.id;
  const dateLocale = bcp47Locale(locale);

  return (
    <AppShell session={session} activePath="/admin/members">
      <header className="flex items-start gap-4">
        <Link
          href="/admin/members"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          {t.admin.back}
        </Link>
      </header>

      <Card>
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-lg">{initials(display)}</AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold">{display}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Badge variant="default">{target.role}</Badge>
              {target.is_guest_membership ? (
                <Badge variant="warning">{t.admin.guestBadge}</Badge>
              ) : null}
              {isSelf ? <Badge variant="accent">you</Badge> : null}
            </div>
          </div>
        </div>
      </Card>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        <StatBlock
          label={t.dashboard.played}
          value={stats?.total_matches_played ?? 0}
          icon={<Users size={16} />}
        />
        <StatBlock
          label={t.dashboard.winRate}
          value={`${stats?.win_rate ?? 0}%`}
          icon={<Trophy size={16} />}
          accent
        />
        <StatBlock
          label={t.dashboard.avgRating}
          value={
            stats?.avg_teammate_rating
              ? Number(stats.avg_teammate_rating).toFixed(1)
              : "—"
          }
          icon={<Star size={16} />}
        />
        <StatBlock
          label={t.dashboard.motm}
          value={stats?.motm_count ?? 0}
          icon={<Crown size={16} />}
        />
        <StatBlock
          label={t.dashboard.walletBalance}
          value={formatCurrency(wallet.balance, wallet.currency, dateLocale)}
          icon={<Wallet size={16} />}
        />
      </section>

      <Card>
        <h2 className="mb-3 text-base font-semibold">{t.dashboard.recentMatches}</h2>
        {recentParticipations.data && recentParticipations.data.length > 0 ? (
          <ul className="space-y-2">
            {recentParticipations.data.map((p) => {
              const m = (p as { match?: { id: string; title: string | null; starts_at: string; status: string; team_format_label: string | null } }).match;
              if (!m) return null;
              return (
                <li
                  key={p.id}
                  data-testid={`participation-${p.id}`}
                  className="flex items-center justify-between rounded-2xl border border-slate-200/60 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] px-3 py-2.5"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {m.title ?? `${m.team_format_label ?? ""} match`}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(m.starts_at, dateLocale)} · {p.attendance_status}
                    </p>
                  </div>
                  <Badge variant={m.status === "completed" ? "success" : "info"}>
                    {m.status}
                  </Badge>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={<CalendarDays size={24} />} title={t.common.empty} />
        )}
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold">{t.wallet.transactions}</h2>
        {ledger.length === 0 ? (
          <EmptyState title={t.wallet.noTransactions} />
        ) : (
          <ul className="space-y-2">
            {ledger.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center justify-between rounded-2xl border border-slate-200/60 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-semibold">{tx.description ?? tx.transaction_type}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {formatDate(tx.recorded_at, dateLocale)}
                  </p>
                </div>
                <span
                  className={`text-sm font-bold ${
                    tx.direction === "credit" ? "text-emerald-300" : "text-amber-300"
                  }`}
                >
                  {tx.direction === "credit" ? "+" : "−"}
                  {formatCurrency(Number(tx.amount), tx.currency_code, dateLocale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
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
      <div className="mt-1.5 text-2xl font-bold">{value}</div>
    </div>
  );
}
