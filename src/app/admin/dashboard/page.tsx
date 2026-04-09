import Link from "next/link";
import {
  CalendarDays,
  Users2,
  Wallet,
  Trophy,
  Plus,
  MapPin,
  Receipt,
  ShieldCheck,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { listMatches, listTenantMembers } from "@/server/db/queries";
import { formatCurrency, formatDate , bcp47Locale } from "@/lib/utils";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function AdminDashboardPage() {
  const { session, membership } = await requireRole([
    "admin",
    "owner",
    "assistant_admin",
  ]);
  const { t, locale } = await getServerDictionary();
  const admin = createSupabaseServiceClient();

  const isFullAdmin = membership.role === "admin" || membership.role === "owner";

  const [
    upcomingMatches,
    pastMatches,
    members,
    { count: totalMatches },
    { count: completedMatches },
    ledgerSums,
  ] = await Promise.all([
    listMatches(membership.tenant_id, { upcoming: true }),
    listMatches(membership.tenant_id),
    listTenantMembers(membership.tenant_id),
    admin.from("matches").select("id", { count: "exact", head: true }).eq("tenant_id", membership.tenant_id),
    admin
      .from("matches")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", membership.tenant_id)
      .eq("status", "completed"),
    admin
      .from("ledger_transactions")
      .select("amount, direction")
      .eq("tenant_id", membership.tenant_id),
  ]);

  // Net outstanding (admin can see this; assistant cannot, hide if not full admin).
  let totalOwed = 0;
  let totalPaid = 0;
  for (const tx of ledgerSums.data ?? []) {
    const amt = Number(tx.amount);
    if (tx.direction === "debit") totalOwed += amt;
    else totalPaid += amt;
  }
  const outstanding = totalOwed - totalPaid;

  const recentPast = pastMatches
    .filter((m) => m.status === "completed")
    .slice(0, 5);
  const nextMatch = upcomingMatches[0];
  const venueName = nextMatch
    ? (nextMatch as { venue?: { name?: string } }).venue?.name
    : null;

  return (
    <AppShell session={session} activePath="/admin/dashboard">
      {/* Hero */}
      <section className="hero-card overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-200/80">
              {membership.role === "assistant_admin" ? t.admin.assistantRole : t.admin.adminRole} ·{" "}
              {membership.tenant.name}
            </p>
            <h1 className="mt-1 text-2xl font-bold">{session.person.display_name}</h1>
            <p className="mt-1 text-sm text-foreground/80">
              {totalMatches ?? 0} matches · {members.length} members
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/matches/new" data-testid="hero-create-match">
              <Plus size={16} /> {t.admin.createMatch}
            </Link>
          </Button>
        </div>
      </section>

      {/* Metric cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatLink
          href="/admin/matches"
          label={t.nav.matches}
          value={totalMatches ?? 0}
          icon={<CalendarDays size={18} />}
          accent
        />
        {isFullAdmin ? (
          <StatLink
            href="/admin/members"
            label={t.nav.members}
            value={members.length}
            icon={<Users2 size={18} />}
          />
        ) : (
          <div className="stat-card">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] uppercase tracking-wider">{t.nav.members}</span>
              <Users2 size={18} />
            </div>
            <div className="mt-1.5 text-3xl font-black">{members.length}</div>
          </div>
        )}
        <StatLink
          href="/admin/stats"
          label={t.admin.completed}
          value={completedMatches ?? 0}
          icon={<Trophy size={18} />}
        />
        {isFullAdmin && (
          <StatLink
            href="/admin/payments"
            label={t.admin.outstanding}
            value={formatCurrency(
              outstanding,
              membership.tenant.currency_code,
              bcp47Locale(locale),
            )}
            icon={<Wallet size={18} />}
          />
        )}
      </section>

      {/* Quick actions — note: "Create match" lives in the hero CTA above
          (de-duplicated per UX feedback). */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {isFullAdmin && (
          <ActionCard
            href="/admin/members"
            icon={<Users2 size={18} />}
            title={t.admin.manageMembers}
            description={t.admin.manageMembersDesc}
          />
        )}
        <ActionCard
          href="/admin/venues"
          icon={<MapPin size={18} />}
          title={t.nav.venues}
          description={t.admin.venuesDesc}
        />
        {isFullAdmin && (
          <ActionCard
            href="/admin/payments"
            icon={<Receipt size={18} />}
            title={t.nav.payments}
            description={t.admin.paymentsDesc}
          />
        )}
      </section>

      {/* Next match + recent activity */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Card>
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">{t.admin.nextMatchTitle}</h2>
            <Link href="/admin/matches" className="text-xs text-emerald-300 hover:underline">
              {t.admin.seeAll}
            </Link>
          </header>
          {nextMatch ? (
            <Link
              href={`/admin/matches/${nextMatch.id}`}
              data-testid={`next-match-${nextMatch.id}`}
              className="block rounded-2xl border border-white/10 bg-white/[0.04] p-4 hover:bg-white/[0.08]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold">
                    {nextMatch.title ?? `${nextMatch.team_format_label} match`}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays size={12} />
                    {formatDate(
                      nextMatch.starts_at,
                      bcp47Locale(locale),
                    )}
                  </p>
                  {venueName && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin size={12} /> {venueName}
                    </p>
                  )}
                </div>
                <Badge variant="info">{nextMatch.status}</Badge>
              </div>
            </Link>
          ) : (
            <EmptyState
              icon={<CalendarDays size={24} />}
              title={t.admin.noUpcomingMatch}
              description={t.admin.noUpcomingHint}
              action={
                <Button asChild className="mt-2">
                  <Link href="/admin/matches/new">+ {t.admin.createMatch}</Link>
                </Button>
              }
            />
          )}
        </Card>

        <Card>
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">{t.admin.recentResults}</h2>
            <Link href="/admin/stats" className="text-xs text-emerald-300 hover:underline">
              {t.nav.stats} →
            </Link>
          </header>
          {recentPast.length === 0 ? (
            <EmptyState icon={<Trophy size={24} />} title={t.admin.noCompletedMatches} />
          ) : (
            <ul className="space-y-2">
              {recentPast.map((m) => (
                <li
                  key={m.id}
                  className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3"
                >
                  <div>
                    <p className="text-sm font-semibold">
                      {m.title ?? `${m.team_format_label} match`}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {formatDate(m.starts_at, bcp47Locale(locale))}
                    </p>
                  </div>
                  <Badge variant="success">completed</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* Role chip */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheck size={14} />
        <span>
          {t.admin.signedInAs} <strong>{membership.role.replace("_", " ")}</strong>.{" "}
          {t.admin.switchAccountsHint}
        </span>
      </div>
    </AppShell>
  );
}

function StatLink({
  href,
  label,
  value,
  icon,
  accent,
}: {
  href: string;
  label: string;
  value: number | string;
  icon: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <Link href={href} className="block">
      <div
        className={`stat-card transition-all hover:-translate-y-0.5 hover:bg-white/[0.07] ${
          accent ? "ring-1 ring-emerald-400/30" : ""
        }`}
      >
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="text-[11px] uppercase tracking-wider">{label}</span>
          {icon}
        </div>
        <div className="mt-1.5 text-3xl font-black">{value}</div>
      </div>
    </Link>
  );
}

function ActionCard({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="group">
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 transition-all hover:-translate-y-0.5 hover:bg-white/[0.07]">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400/30 to-violet-500/30 text-emerald-200">
          {icon}
        </div>
        <p className="text-sm font-bold group-hover:text-emerald-300">{title}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
