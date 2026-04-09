import { notFound } from "next/navigation";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { initials, formatCurrency } from "@/lib/utils";
import { TenantSettingsForm, AssignAdminForm } from "./forms";

export default async function OwnerTenantDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session } = await requireRole(["owner"]);
  const admin = createSupabaseServiceClient();

  const { data: tenant } = await admin.from("tenants").select("*").eq("id", id).maybeSingle();
  if (!tenant) notFound();

  const { data: members } = await admin
    .from("memberships")
    .select("*, person:persons(*)")
    .eq("tenant_id", id)
    .neq("status", "archived")
    .order("role");

  const { count: matchCount } = await admin
    .from("matches")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", id);

  return (
    <AppShell session={session} activePath="/owner/tenants">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Link href="/owner/tenants" className="text-xs text-muted-foreground hover:text-foreground">
            ← Back to tenants
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{tenant.name}</h1>
          <p className="text-sm text-muted-foreground">/{tenant.slug}</p>
        </div>
        <Badge variant={tenant.is_active ? "success" : "warning"}>
          {tenant.is_active ? "active" : "inactive"}
        </Badge>
      </header>

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="stat-card">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Members</p>
          <p className="mt-1 text-2xl font-bold">{(members ?? []).length}</p>
        </div>
        <div className="stat-card">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Matches</p>
          <p className="mt-1 text-2xl font-bold">{matchCount ?? 0}</p>
        </div>
        <div className="stat-card">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Default fee</p>
          <p className="mt-1 text-2xl font-bold">
            {formatCurrency(Number(tenant.default_match_fee), tenant.currency_code)}
          </p>
        </div>
      </section>

      <Card>
        <h2 className="mb-3 text-base font-semibold">Tenant settings</h2>
        <TenantSettingsForm tenant={tenant} />
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold">Assign admin</h2>
        <AssignAdminForm tenantId={tenant.id} />
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold">Members</h2>
        {(!members || members.length === 0) && (
          <p className="text-sm text-muted-foreground">No members yet.</p>
        )}
        <ul className="grid gap-2 sm:grid-cols-2">
          {(members ?? []).map((m) => {
            const display =
              (m as { person?: { display_name?: string } }).person?.display_name ?? "Member";
            return (
              <li
                key={m.id}
                data-testid={`tenant-member-${m.id}`}
                className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback>{initials(display)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{display}</p>
                  <Badge variant="default">{m.role}</Badge>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </AppShell>
  );
}
