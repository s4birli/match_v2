import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { InviteActions } from "./invite-actions";

export default async function AdminInvitesPage() {
  const { session, membership } = await requireRole(["admin", "owner"]);
  const admin = createSupabaseServiceClient();
  const { data: invites } = await admin
    .from("tenant_invites")
    .select("*")
    .eq("tenant_id", membership.tenant_id)
    .order("created_at", { ascending: false });

  return (
    <AppShell session={session} activePath="/admin/invites">
      <header>
        <h1 className="text-2xl font-bold">Invites</h1>
        <p className="text-sm text-muted-foreground">{membership.tenant.name}</p>
      </header>

      <Card>
        <h2 className="mb-3 text-base font-semibold">Group invite code</h2>
        <p className="text-sm text-muted-foreground">
          Members can join by entering this code on the join page.
        </p>
        <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <code className="text-xl font-bold tracking-wider" data-testid="invite-code">
            {membership.tenant.invite_code}
          </code>
        </div>
        <InviteActions />
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold">Active invite links</h2>
        {(!invites || invites.length === 0) && (
          <p className="text-sm text-muted-foreground">No invite links yet.</p>
        )}
        <ul className="space-y-2">
          {(invites ?? []).map((inv) => (
            <li
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
            >
              <code className="text-xs">{inv.token}</code>
              <a
                href={`/invite/${inv.token}`}
                className="text-xs text-emerald-300 hover:underline"
                data-testid={`invite-link-${inv.id}`}
              >
                /invite/{inv.token}
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </AppShell>
  );
}
