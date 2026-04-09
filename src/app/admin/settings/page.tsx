import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/server/auth/session";
import { TenantDefaultsForm } from "./settings-form";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function AdminSettingsPage() {
  const { session, membership } = await requireRole(["admin", "owner"]);
  const { t } = await getServerDictionary();
  return (
    <AppShell session={session} activePath="/admin/settings">
      <header>
        <h1 className="text-2xl font-bold">{t.admin.settingsTitle}</h1>
        <p className="text-sm text-muted-foreground">{membership.tenant.name}</p>
      </header>

      <Card>
        <h2 className="mb-3 text-base font-semibold">{t.admin.matchDefaults}</h2>
        <p className="mb-3 text-xs text-muted-foreground">{t.admin.matchDefaultsHint}</p>
        <TenantDefaultsForm
          tenantId={membership.tenant_id}
          initialFee={Number(membership.tenant.default_match_fee ?? 0)}
          currencyCode={membership.tenant.currency_code}
        />
      </Card>
    </AppShell>
  );
}
