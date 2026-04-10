import { Bell } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireMembership } from "@/server/auth/session";
import { listNotifications } from "@/server/db/queries";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { relativeFromNow } from "@/lib/utils";
import { getServerDictionary } from "@/lib/i18n/server";
import { LiveRefresh } from "@/lib/realtime/use-realtime-refresh";

function localizedNotif(
  type: string,
  fallback: { title: string; body: string },
  t: Awaited<ReturnType<typeof getServerDictionary>>["t"],
) {
  const types = t.notifications.types as Record<string, { title: string; body: string }>;
  const known = types[type];
  return known ?? fallback;
}

export default async function NotificationsPage() {
  const { session, membership } = await requireMembership();
  const { t, locale } = await getServerDictionary();
  const notifs = await listNotifications(membership.id, 50);

  // Mark every unread notification as read on visit. The bell badge in
  // the AppShell observes the same membership_id via Supabase Realtime,
  // so it'll drop to 0 instantly via the UPDATE event.
  try {
    const admin = createSupabaseServiceClient();
    await admin
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("membership_id", membership.id)
      .eq("is_read", false);
  } catch {
    /* best effort — leaving rows unread is harmless */
  }

  return (
    <AppShell session={session} activePath="/notifications">
      <LiveRefresh
        watches={[
          { table: "notifications", filter: `membership_id=eq.${membership.id}`, event: "INSERT" },
        ]}
      />
      <header>
        <h1 className="text-2xl font-bold">{t.nav.notifications}</h1>
        <p className="text-sm text-muted-foreground">
          {notifs.length} {t.nav.notifications.toLowerCase()}
        </p>
      </header>

      <Card>
        {notifs.length === 0 ? (
          <EmptyState icon={<Bell size={24} />} title={t.notifications.empty} />
        ) : (
          <ul className="divide-y divide-white/5">
            {notifs.map((n) => {
              const localized = localizedNotif(
                n.notification_type,
                { title: n.title, body: n.body },
                t,
              );
              return (
                <li
                  key={n.id}
                  data-testid={`notif-${n.id}`}
                  className="flex items-start justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-100/70 dark:bg-white/[0.04]">
                      <Bell size={14} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{localized.title}</p>
                      <p className="text-xs text-muted-foreground">{localized.body}</p>
                    </div>
                  </div>
                  <span className="shrink-0 text-[10px] text-muted-foreground">
                    {relativeFromNow(n.created_at, locale)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
