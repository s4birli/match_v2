import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { listMatches } from "@/server/db/queries";
import { requireMembership } from "@/server/auth/session";
import { formatDate , bcp47Locale } from "@/lib/utils";
import { getServerDictionary } from "@/lib/i18n/server";
import { CalendarDays, MapPin } from "lucide-react";
import { LiveRefresh } from "@/lib/realtime/use-realtime-refresh";

export default async function MatchesPage() {
  const { session, membership } = await requireMembership();
  const { t, locale } = await getServerDictionary();
  const all = await listMatches(membership.tenant_id);

  const upcoming = all.filter((m) => ["draft", "open", "teams_ready"].includes(m.status));
  const past = all.filter((m) => ["completed", "cancelled"].includes(m.status));

  return (
    <AppShell session={session} activePath="/matches">
      <LiveRefresh
        watches={[{ table: "matches", filter: `tenant_id=eq.${membership.tenant_id}` }]}
      />
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t.nav.matches}</h1>
          <p className="text-sm text-muted-foreground">{membership.tenant.name}</p>
        </div>
        {(membership.role === "admin" || membership.role === "owner" || membership.role === "assistant_admin") && (
          <Link
            href="/admin/matches/new"
            className="rounded-2xl bg-emerald-500 px-4 py-2 text-xs font-semibold text-emerald-950 hover:bg-emerald-400"
            data-testid="create-match-link"
          >
            + {t.admin.createMatch}
          </Link>
        )}
      </header>

      <Tabs defaultValue="upcoming">
        <TabsList>
          <TabsTrigger value="upcoming">
            {t.common.upcoming} · {upcoming.length}
          </TabsTrigger>
          <TabsTrigger value="past">
            {t.common.past} · {past.length}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="upcoming">
          <MatchList matches={upcoming} locale={locale} t={t} empty={t.dashboard.noUpcoming} />
        </TabsContent>
        <TabsContent value="past">
          <MatchList matches={past} locale={locale} t={t} empty={t.common.empty} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

type Locale = "en" | "tr" | "es";
type Dict = Awaited<ReturnType<typeof getServerDictionary>>["t"];

function MatchList({
  matches,
  locale,
  t,
  empty,
}: {
  matches: Awaited<ReturnType<typeof listMatches>>;
  locale: Locale;
  t: Dict;
  empty: string;
}) {
  if (matches.length === 0)
    return <EmptyState icon={<CalendarDays size={24} />} title={empty} />;
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {matches.map((m) => {
        const venue = (m as { venue?: { name?: string } }).venue?.name;
        return (
          <Link
            key={m.id}
            href={`/matches/${m.id}`}
            data-testid={`match-card-${m.id}`}
            className="group"
          >
            <Card className="transition-all hover:-translate-y-0.5 hover:bg-slate-200/70 dark:hover:bg-white/[0.06]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold group-hover:text-emerald-300">
                    {m.title ?? `${m.team_format_label} ${t.common.players}`}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CalendarDays size={12} />
                    {formatDate(m.starts_at, bcp47Locale(locale))}
                  </p>
                  {venue && (
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <MapPin size={12} />
                      {venue}
                    </p>
                  )}
                </div>
                <Badge
                  variant={
                    m.status === "completed"
                      ? "success"
                      : m.status === "cancelled"
                        ? "danger"
                        : "info"
                  }
                >
                  {m.status}
                </Badge>
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>{m.team_format_label}</span>
                <span className="font-semibold text-foreground">
                  {m.match_fee} {m.currency_code}
                </span>
              </div>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
