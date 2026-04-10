import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { requireRole } from "@/server/auth/session";
import {
  listAccountsNotInTenant,
  listArchivedMembers,
  listTenantMembers,
} from "@/server/db/queries";
import { initials } from "@/lib/utils";
import { CreateGuestForm } from "./create-guest-form";
import { AddExistingPlayerForm } from "./add-existing-form";
import {
  ArchiveMemberButton,
  ConvertGuestButton,
  RestoreMemberButton,
} from "./member-actions";
import { getServerDictionary } from "@/lib/i18n/server";

export default async function AdminMembersPage() {
  const { session, membership } = await requireRole(["admin", "owner"]);
  const { t } = await getServerDictionary();
  const [members, archived, candidateAccounts] = await Promise.all([
    listTenantMembers(membership.tenant_id),
    listArchivedMembers(membership.tenant_id),
    listAccountsNotInTenant(membership.tenant_id),
  ]);

  return (
    <AppShell session={session} activePath="/admin/members">
      <header>
        <h1 className="text-2xl font-bold">{t.nav.members}</h1>
        <p className="text-sm text-muted-foreground">{membership.tenant.name}</p>
      </header>

      <Card>
        <h2 className="mb-3 text-base font-semibold">{t.admin.addExistingPlayer}</h2>
        <p className="mb-3 text-xs text-muted-foreground">{t.admin.addExistingPlayerHint}</p>
        <AddExistingPlayerForm accounts={candidateAccounts} />
      </Card>

      <Card>
        <h2 className="mb-3 text-base font-semibold">{t.admin.addGuestPlayerTitle}</h2>
        <CreateGuestForm />
      </Card>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">{t.admin.activeTab} · {members.length}</TabsTrigger>
          <TabsTrigger value="archived">{t.admin.archivedTab} · {archived.length}</TabsTrigger>
        </TabsList>
        <TabsContent value="active">
          {members.length === 0 ? (
            <EmptyState title={t.admin.noMembers} />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {members.map((m) => {
                const display =
                  (m as { person?: { display_name?: string } }).person?.display_name ?? "Player";
                return (
                  <li
                    key={m.id}
                    data-testid={`member-${m.id}`}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200/60 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] px-3 py-2.5"
                  >
                    <Link
                      href={`/admin/members/${m.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3"
                      data-testid={`member-link-${m.id}`}
                    >
                      <Avatar className="h-9 w-9">
                        <AvatarFallback>{initials(display)}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold hover:text-emerald-300">{display}</p>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="default">{m.role}</Badge>
                          {m.is_guest_membership ? <Badge variant="warning">{t.admin.guestBadge}</Badge> : null}
                        </div>
                      </div>
                    </Link>
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
            <EmptyState title={t.admin.noArchivedMembers} />
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {archived.map((m) => {
                const display =
                  (m as { person?: { display_name?: string } }).person?.display_name ?? "Player";
                return (
                  <li
                    key={m.id}
                    className="flex items-center gap-3 rounded-2xl border border-slate-200/60 dark:border-white/5 bg-slate-50 dark:bg-white/[0.02] px-3 py-2.5"
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
