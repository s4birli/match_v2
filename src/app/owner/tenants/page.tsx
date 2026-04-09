import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/server";
import { CreateTenantForm } from "./create-tenant-form";

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  currency_code: string;
  invite_code: string;
  is_active: boolean;
  is_archived: boolean;
};

export default async function OwnerTenantsPage() {
  const { session } = await requireRole(["owner"]);
  const { t } = await getServerDictionary();
  const admin = createSupabaseServiceClient();
  const { data } = await admin
    .from("tenants")
    .select("*")
    .order("created_at", { ascending: false });

  const allTenants = (data ?? []) as TenantRow[];
  const activeTenants = allTenants.filter((tn) => !tn.is_archived);
  const archivedTenants = allTenants.filter((tn) => tn.is_archived);

  return (
    <AppShell session={session} activePath="/owner/tenants">
      <header>
        <h1 className="text-2xl font-bold">{t.owner.tenantsTitle}</h1>
        <p className="text-sm text-muted-foreground">{t.owner.tenantsSubtitle}</p>
      </header>

      <Card>
        <h2 className="mb-3 text-base font-semibold">+ {t.owner.createTenant}</h2>
        <CreateTenantForm
          labels={{
            name: t.owner.fieldName,
            namePlaceholder: t.owner.fieldNamePlaceholder,
            currency: t.owner.fieldCurrency,
            submit: t.owner.createTenant,
            submitting: t.owner.submitting,
            success: t.owner.createdSuccess,
            hint: t.owner.createTenantHint,
          }}
        />
      </Card>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active" data-testid="tab-active-tenants">
            {t.owner.allTenants} · {activeTenants.length}
          </TabsTrigger>
          <TabsTrigger value="archived" data-testid="tab-archived-tenants">
            Archived · {archivedTenants.length}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          <TenantGrid tenants={activeTenants} t={t} emptyText={t.owner.noTenantsYet} />
        </TabsContent>
        <TabsContent value="archived">
          <TenantGrid
            tenants={archivedTenants}
            t={t}
            emptyText="No archived groups."
          />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

type Dict = Awaited<ReturnType<typeof getServerDictionary>>["t"];

function TenantGrid({
  tenants,
  t,
  emptyText,
}: {
  tenants: TenantRow[];
  t: Dict;
  emptyText: string;
}) {
  if (tenants.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {tenants.map((tn) => {
        const status = tn.is_archived
          ? "archived"
          : tn.is_active
            ? "active"
            : "inactive";
        return (
          <li key={tn.id}>
            <Link
              href={`/owner/tenants/${tn.id}`}
              className="block"
              data-testid={`tenant-${tn.id}`}
            >
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:bg-white/[0.06]">
                <header className="flex items-start justify-between">
                  <div>
                    <p className="text-base font-bold">{tn.name}</p>
                    <p className="text-xs text-muted-foreground">/{tn.slug}</p>
                  </div>
                  <Badge
                    variant={
                      status === "active"
                        ? "success"
                        : status === "archived"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {status === "active"
                      ? t.owner.active
                      : status === "archived"
                        ? t.owner.statusArchived
                        : t.owner.inactive}
                  </Badge>
                </header>
                <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                  <span>{tn.currency_code}</span>
                  <code className="rounded-lg bg-white/[0.04] px-2 py-1">
                    {tn.invite_code}
                  </code>
                </div>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
