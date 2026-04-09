import { Bell } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireNonOwner } from "@/server/auth/session";
import { listNotifications } from "@/server/db/queries";
import { relativeFromNow } from "@/lib/utils";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function NotificationsPage() {
  const { session, membership } = await requireNonOwner();
  const { t, locale } = await getServerDictionary();
  const notifs = await listNotifications(membership.id, 50);

  return (
    <AppShell session={session} activePath="/notifications">
      <header>
        <h1 className="text-2xl font-bold">{t.nav.notifications}</h1>
        <p className="text-sm text-muted-foreground">{notifs.length} items</p>
      </header>

      <Card>
        {notifs.length === 0 ? (
          <EmptyState icon={<Bell size={24} />} title="You're all caught up." />
        ) : (
          <ul className="divide-y divide-white/5">
            {notifs.map((n) => (
              <li
                key={n.id}
                data-testid={`notif-${n.id}`}
                className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
                    <Bell size={14} />
                  </div>
                  <div>
                    <p className="text-sm font-semibold">{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.body}</p>
                  </div>
                </div>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {relativeFromNow(n.created_at, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
