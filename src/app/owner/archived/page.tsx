import { Layers3 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/server/auth/session";
import { listAllArchivedMembers } from "@/server/db/queries-owner";
import { getServerDictionary } from "@/lib/i18n/server";
import { initials, formatDate } from "@/lib/utils";

export default async function OwnerArchivedPage() {
  const { session } = await requireRole(["owner"]);
  const { t, locale } = await getServerDictionary();
  const rows = await listAllArchivedMembers();

  return (
    <AppShell session={session} activePath="/owner/archived">
      <header>
        <h1 className="text-2xl font-bold">{t.owner.archivedPageTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.owner.archivedPageSubtitle}</p>
      </header>

      <Card>
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {rows.length} {t.owner.archivedUsers.toLowerCase()}
          </h2>
          <Layers3 size={16} className="text-muted-foreground" />
        </header>
        {rows.length === 0 ? (
          <EmptyState icon={<Layers3 size={24} />} title={t.owner.noArchivedUsers} />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {rows.map((m) => (
              <li
                key={m.id}
                data-testid={`archived-${m.id}`}
                className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-3"
              >
                <Avatar className="h-10 w-10">
                  <AvatarFallback>{initials(m.display_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{m.display_name}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{m.tenant_name}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="default">{m.role}</Badge>
                    <Badge variant="danger">{t.owner.statusArchived}</Badge>
                  </div>
                  {m.archived_reason && (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {m.archived_reason}
                    </p>
                  )}
                  {m.archived_at && (
                    <p className="text-[10px] text-muted-foreground">
                      {formatDate(m.archived_at, locale === "tr" ? "tr-TR" : "en-GB")}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
