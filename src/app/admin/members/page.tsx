import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { requireRole } from "@/server/auth/session";
import { listArchivedMembers, listTenantMembers } from "@/server/db/queries";
import { initials } from "@/lib/utils";
import { CreateGuestForm } from "./create-guest-form";
import {
  ArchiveMemberButton,
  ConvertGuestButton,
  RestoreMemberButton,
} from "./member-actions";

export default async function AdminMembersPage() {
  const { session, membership } = await requireRole(["admin", "owner"]);
  const [members, archived] = await Promise.all([
    listTenantMembers(membership.tenant_id),
    listArchivedMembers(membership.tenant_id),
  ]);

  return (
    <AppShell session={session} activePath="/admin/members">
      <header>
        <h1 className="text-2xl font-bold">Members</h1>
        <p className="text-sm text-muted-foreground">{membership.tenant.name}</p>
      </header>

      <Card>
        <h2 className="mb-3 text-base font-semibold">Add guest player</h2>
        <CreateGuestForm />
      </Card>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active · {members.length}</TabsTrigger>
          <TabsTrigger value="archived">Archived · {archived.length}</TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          {members.length === 0 ? (
            <EmptyState title="No members." />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {members.map((m) => {
                const display =
                  (m as { person?: { display_name?: string } }).person?.display_name ?? "Player";
                return (
                  <li
                    key={m.id}
                    data-testid={`member-${m.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback>{initials(display)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{display}</p>
                      <div className="flex items-center gap-1.5">
                        <Badge variant="default">{m.role}</Badge>
                        {m.is_guest_membership ? <Badge variant="warning">guest</Badge> : null}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {m.is_guest_membership && <ConvertGuestButton id={m.id} />}
                      <ArchiveMemberButton id={m.id} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
        <TabsContent value="archived">
          {archived.length === 0 ? (
            <EmptyState title="No archived members." />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {archived.map((m) => {
                const display =
                  (m as { person?: { display_name?: string } }).person?.display_name ?? "Player";
                return (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
                  >
                    <Avatar className="h-9 w-9">
                      <AvatarFallback>{initials(display)}</AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{display}</p>
                      <p className="text-[11px] text-muted-foreground">{m.archived_reason}</p>
                    </div>
                    <RestoreMemberButton id={m.id} />
                  </li>
                );
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}
