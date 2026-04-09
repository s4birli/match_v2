import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/server/auth/session";
import { listVenues } from "@/server/db/queries";
import { CreateVenueForm } from "./create-venue-form";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function AdminVenuesPage() {
  // Assistant admins can SEE venues (they need them to create matches),
  // and per CLAUDE.md they can also create venues for match operations.
  const { session, membership } = await requireRole([
    "admin",
    "owner",
    "assistant_admin",
  ]);
  const { t } = await getServerDictionary();
  const venues = await listVenues(membership.tenant_id);
  return (
    <AppShell session={session} activePath="/admin/venues">
      <header>
        <h1 className="text-2xl font-bold">{t.admin.venuesTitle}</h1>
        <p className="text-sm text-muted-foreground">{membership.tenant.name}</p>
      </header>
      <Card>
        <h2 className="mb-3 text-base font-semibold">{t.admin.addVenue}</h2>
        <CreateVenueForm />
      </Card>
      <Card>
        <h2 className="mb-3 text-base font-semibold">{t.admin.allVenues}</h2>
        {venues.length === 0 ? (
          <EmptyState title={t.admin.noVenues} />
        ) : (
          <ul className="space-y-2">
            {venues.map((v) => (
              <li
                key={v.id}
                data-testid={`venue-${v.id}`}
                className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
              >
                <div>
                  <p className="text-sm font-semibold">{v.name}</p>
                  <p className="text-xs text-muted-foreground">{v.address_line ?? "—"}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
