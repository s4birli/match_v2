import Link from "next/link";
import { CalendarDays, Plus } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/server/auth/session";
import { listMatches } from "@/server/db/queries";
import { formatDate } from "@/lib/utils";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function AdminMatchesPage() {
  const { session, membership } = await requireRole(["admin", "owner", "assistant_admin"]);
  const { t, locale } = await getServerDictionary();
  const matches = await listMatches(membership.tenant_id);

  return (
    <AppShell session={session} activePath="/admin/matches">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manage matches</h1>
          <p className="text-sm text-muted-foreground">{membership.tenant.name}</p>
        </div>
        <Button asChild>
          <Link href="/admin/matches/new" data-testid="admin-create-match">
            <Plus size={16} /> {t.admin.createMatch}
          </Link>
        </Button>
      </header>

      {matches.length === 0 ? (
        <EmptyState icon={<CalendarDays size={24} />} title="No matches yet." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {matches.map((m) => {
            const venue = (m as { venue?: { name?: string } }).venue?.name;
            return (
              <Card key={m.id}>
                <header className="mb-2 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-bold">
                      {m.title ?? `${m.team_format_label} match`}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(m.starts_at, locale === "tr" ? "tr-TR" : "en-GB")}
                    </p>
                    {venue && <p className="text-xs text-muted-foreground">{venue}</p>}
                  </div>
                  <Badge variant={m.status === "completed" ? "success" : "info"}>{m.status}</Badge>
                </header>
                <div className="flex gap-2">
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/admin/matches/${m.id}`} data-testid={`admin-open-${m.id}`}>
                      Open
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/matches/${m.id}`}>View public</Link>
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
