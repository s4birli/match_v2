import Link from "next/link";
import { Building2, Users2, CalendarDays, Wallet, Sparkles, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";

export default async function OwnerDashboardPage() {
  const { session } = await requireRole(["owner"]);
  const admin = createSupabaseServiceClient();

  const [
    { count: tenantCount },
    { count: memberCount },
    { count: matchCount },
    { count: txCount },
    { count: adminCount },
  ] = await Promise.all([
    admin.from("tenants").select("id", { count: "exact", head: true }),
    admin
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .neq("status", "archived"),
    admin.from("matches").select("id", { count: "exact", head: true }),
    admin.from("ledger_transactions").select("id", { count: "exact", head: true }),
    admin
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .in("role", ["admin"]),
  ]);

  const { data: recentTenants } = await admin
    .from("tenants")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);

  return (
    <AppShell session={session} activePath="/owner/dashboard">
      {/* Hero */}
      <section className="hero-card overflow-hidden">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-200/80">
              System overview
            </p>
            <h1 className="mt-1 text-2xl font-bold">{session.person.display_name}</h1>
            <p className="mt-1 text-sm text-foreground/80">
              Global control · you do not belong to any group
            </p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 to-fuchsia-500 text-2xl">
            ⚡
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="accent">No group membership</Badge>
          <Badge variant="info">Owner-only access</Badge>
        </div>
      </section>

      {/* Metrics */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatBlock
          label="Groups"
          value={tenantCount ?? 0}
          icon={<Building2 size={18} />}
          accent
        />
        <StatBlock label="Users" value={memberCount ?? 0} icon={<Users2 size={18} />} />
        <StatBlock label="Admins" value={adminCount ?? 0} icon={<ShieldCheck size={18} />} />
        <StatBlock label="Matches" value={matchCount ?? 0} icon={<CalendarDays size={18} />} />
      </section>

      {/* Quick actions */}
      <section className="grid gap-3 sm:grid-cols-3">
        <ActionCard
          href="/owner/tenants"
          icon={<Building2 size={20} />}
          title="Manage groups"
          description="Create and configure tenants"
        />
        <ActionCard
          href="/owner/tenants"
          icon={<ShieldCheck size={20} />}
          title="Assign admins"
          description="Pick group admins per tenant"
        />
        <ActionCard
          href="/owner/dashboard"
          icon={<Wallet size={20} />}
          title="Ledger entries"
          description={`${txCount ?? 0} total ledger rows`}
        />
      </section>

      {/* Recent groups */}
      <Card>
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent groups</h2>
          <Link href="/owner/tenants" className="text-xs text-emerald-300 hover:underline">
            All →
          </Link>
        </header>
        {!recentTenants || recentTenants.length === 0 ? (
          <EmptyState
            icon={<Sparkles size={24} />}
            title="No groups yet"
            description="Create the first tenant on the Tenants page."
            action={
              <Button asChild className="mt-2">
                <Link href="/owner/tenants" data-testid="empty-create-tenant">
                  + Create your first tenant
                </Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-2">
            {recentTenants.map((t) => (
              <li
                key={t.id}
                data-testid={`recent-tenant-${t.id}`}
                className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-violet-600 text-sm font-black text-emerald-950">
                    {t.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{t.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {t.currency_code} · created {formatDate(t.created_at)}
                    </p>
                  </div>
                </div>
                <code className="rounded-lg bg-white/[0.04] px-2 py-1 text-[11px]">
                  {t.invite_code}
                </code>
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
    <div className={`stat-card ${accent ? "ring-1 ring-violet-400/30" : ""}`}>
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="mt-1.5 text-3xl font-black">{value}</div>
    </div>
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
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500/30 to-fuchsia-500/30 text-violet-200">
          {icon}
        </div>
        <p className="text-base font-bold group-hover:text-emerald-300">{title}</p>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>
    </Link>
  );
}
