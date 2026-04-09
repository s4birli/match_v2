import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { CreateTenantForm } from "./create-tenant-form";

export default async function OwnerTenantsPage() {
  const { session } = await requireRole(["owner"]);
  const admin = createSupabaseServiceClient();
  const { data: tenants } = await admin
    .from("tenants")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <AppShell session={session} activePath="/owner/tenants">
      <header>
        <h1 className="text-2xl font-bold">Tenants</h1>
        <p className="text-sm text-muted-foreground">Create and manage groups in the system</p>
      </header>

      <Card>
        <h2 className="mb-3 text-base font-semibold">+ Create tenant</h2>
        <CreateTenantForm />
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold">All tenants ({(tenants ?? []).length})</h2>
        {(tenants ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No tenants yet — create the first one above.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {(tenants ?? []).map((t) => (
              <li key={t.id}>
                <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <header className="flex items-start justify-between">
                    <div>
                      <p className="text-base font-bold">{t.name}</p>
                      <p className="text-xs text-muted-foreground">/{t.slug}</p>
                    </div>
                    <Badge variant={t.is_active ? "success" : "warning"}>
                      {t.is_active ? "active" : "inactive"}
                    </Badge>
                  </header>
                  <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{t.currency_code} · fee {t.default_match_fee}</span>
                    <code className="rounded-lg bg-white/[0.04] px-2 py-1">{t.invite_code}</code>
                  </div>
                  <div className="mt-3">
                    <Link
                      href={`/owner/tenants/${t.id}`}
                      className="text-xs text-emerald-300 hover:underline"
                      data-testid={`tenant-${t.id}`}
                    >
                      Open →
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </AppShell>
  );
}
