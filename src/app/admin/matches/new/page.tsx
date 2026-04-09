import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/server/auth/session";
import { listVenues } from "@/server/db/queries";
import { CreateMatchForm } from "./create-match-form";

export default async function NewMatchPage() {
  const { session, membership } = await requireRole([
    "admin",
    "owner",
    "assistant_admin",
  ]);
  const venues = await listVenues(membership.tenant_id);
  const defaultFee = Number(membership.tenant.default_match_fee ?? 0);
  return (
    <AppShell session={session} activePath="/admin/matches">
      <header>
        <h1 className="text-2xl font-bold">Create match</h1>
        <p className="text-sm text-muted-foreground">{membership.tenant.name}</p>
      </header>
      <Card>
        <CreateMatchForm
          venues={venues.map((v) => ({ id: v.id, name: v.name }))}
          defaultMatchFee={defaultFee}
          currencyCode={membership.tenant.currency_code}
        />
      </Card>
    </AppShell>
  );
}
