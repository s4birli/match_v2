import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/server/auth/session";
import { TenantDefaultsForm } from "./settings-form";

export default async function AdminSettingsPage() {
  const { session, membership } = await requireRole(["admin", "owner"]);
  return (
    <AppShell session={session} activePath="/admin/settings">
      <header>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">{membership.tenant.name}</p>
      </header>

      <Card>
        <h2 className="mb-3 text-base font-semibold">Match defaults</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Used every time you create a new match. You can still override per match
          later if you build a custom flow.
        </p>
        <TenantDefaultsForm
          tenantId={membership.tenant_id}
          initialFee={Number(membership.tenant.default_match_fee ?? 0)}
          currencyCode={membership.tenant.currency_code}
        />
      </Card>
    </AppShell>
  );
}
