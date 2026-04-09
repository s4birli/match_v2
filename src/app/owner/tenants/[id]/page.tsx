import { notFound } from "next/navigation";
import Link from "next/link";
import { Building2, ShieldAlert, Users2, CalendarDays, Ticket, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/server/auth/session";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getServerDictionary } from "@/lib/i18n/server";
import { initials, formatDate } from "@/lib/utils";
import {
  listAllAccountsForOwner,
  listInvitesForTenant,
  listFeatureFlagsForTenant,
  listTenantMembersForOwner,
} from "@/server/db/queries-owner";
import {
  TenantSettingsForm,
  RegenerateCodeButton,
  CopyButton,
  CreateInviteButton,
  DeactivateInviteButton,
  FeatureFlagToggle,
  RemoveMemberButton,
  AssignAdminPanel,
  ArchiveTenantButton,
} from "./forms";

const APP_URL = process.env.APP_URL ?? "http://localhost:3737";

const FEATURE_KEYS: Array<{
  key: "push_notifications" | "bilingual_ui" | "stats_and_leaderboards";
  labelKey: "flagPushNotifications" | "flagBilingualUi" | "flagStatsLeaderboards";
}> = [
  { key: "push_notifications", labelKey: "flagPushNotifications" },
  { key: "bilingual_ui", labelKey: "flagBilingualUi" },
  { key: "stats_and_leaderboards", labelKey: "flagStatsLeaderboards" },
];

export default async function OwnerTenantDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { session } = await requireRole(["owner"]);
  const { t } = await getServerDictionary();
  const admin = createSupabaseServiceClient();

  const { data: tenant } = await admin.from("tenants").select("*").eq("id", id).maybeSingle();
  if (!tenant) notFound();

  const [members, invites, flags, accounts, { count: matchCount }] = await Promise.all([
    listTenantMembersForOwner(id),
    listInvitesForTenant(id),
    listFeatureFlagsForTenant(id),
    listAllAccountsForOwner(),
    admin.from("matches").select("id", { count: "exact", head: true }).eq("tenant_id", id),
  ]);

  const flagState = new Map(flags.map((f) => [f.feature_key, f.is_enabled]));
  const isArchived = tenant.is_archived === true;
  const status = isArchived ? "archived" : tenant.is_active ? "active" : "inactive";

  // Account picker pool: exclude system owners and accounts already in this tenant.
  const existingPersonIds = new Set(members.map((m) => m.person_id));
  const pickerAccounts = accounts.filter(
    (a) => !a.is_system_owner && !existingPersonIds.has(a.id),
  );

  return (
    <AppShell session={session} activePath="/owner/tenants">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Link
            href="/owner/tenants"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t.owner.backToTenants}
          </Link>
          <h1 className="mt-2 text-2xl font-bold">{tenant.name}</h1>
          <p className="text-sm text-muted-foreground">/{tenant.slug}</p>
        </div>
        <Badge
          variant={
            status === "active" ? "success" : status === "archived" ? "danger" : "warning"
          }
        >
          {status === "active"
            ? t.owner.active
            : status === "archived"
              ? t.owner.statusArchived
              : t.owner.inactive}
        </Badge>
      </header>

      {/* Stats */}
      <section className="grid gap-3 sm:grid-cols-3">
        <StatBlock
          label={t.owner.users}
          value={members.filter((m) => m.status !== "archived").length}
          icon={<Users2 size={16} />}
        />
        <StatBlock label={t.owner.matches} value={matchCount ?? 0} icon={<CalendarDays size={16} />} />
        <StatBlock
          label={t.owner.fieldCurrency}
          value={tenant.currency_code}
          icon={<Building2 size={16} />}
        />
      </section>

      {/* Tenant settings */}
      <Card>
        <h2 className="mb-3 text-base font-semibold">{t.owner.tenantSettings}</h2>
        <TenantSettingsForm
          tenant={tenant}
          labels={{
            name: t.owner.fieldName,
            currency: t.owner.fieldCurrency,
            active: t.owner.tenantActive,
            save: t.owner.saveSettings,
            saving: t.owner.saving,
            saved: t.owner.saved,
          }}
        />
      </Card>

      {/* Invite code */}
      <Card>
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t.owner.inviteCodeTitle}</h2>
          <Ticket size={16} className="text-muted-foreground" />
        </header>
        <p className="text-sm text-muted-foreground">{t.owner.inviteCodeHint}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
          <code className="flex-1 text-xl font-bold tracking-wider" data-testid="invite-code">
            {tenant.invite_code}
          </code>
          <CopyButton text={tenant.invite_code} label={t.common.copy} okLabel={t.owner.copied} />
          <RegenerateCodeButton tenantId={tenant.id} label={t.owner.regenerateCode} />
        </div>
      </Card>

      {/* Invite links */}
      <Card>
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">{t.owner.inviteLinksTitle}</h2>
        </header>
        <div className="mb-3 flex flex-wrap gap-2">
          <CreateInviteButton
            tenantId={tenant.id}
            role="user"
            label={t.owner.createUserInvite}
            testid="create-invite-user"
          />
          <CreateInviteButton
            tenantId={tenant.id}
            role="admin"
            label={t.owner.createAdminInvite}
            testid="create-invite-admin"
          />
        </div>
        {invites.length === 0 ? (
          <EmptyState icon={<Ticket size={20} />} title={t.owner.noInviteLinks} />
        ) : (
          <ul className="space-y-2">
            {invites.map((inv) => {
              const url = `${APP_URL}/invite/${inv.token}`;
              return (
                <li
                  key={inv.id}
                  data-testid={`invite-row-${inv.id}`}
                  className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
                >
                  <code className="text-[11px]">{inv.token}</code>
                  <Badge variant={inv.default_role === "admin" ? "accent" : "default"}>
                    {inv.default_role}
                  </Badge>
                  <span className="text-[11px] text-muted-foreground">
                    {inv.used_count} {t.owner.used}
                  </span>
                  <div className="ml-auto flex gap-2">
                    <CopyButton text={url} label={t.owner.copyLink} okLabel={t.owner.copied} />
                    {inv.is_active && (
                      <DeactivateInviteButton inviteId={inv.id} label={t.owner.deactivate} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {/* Feature flags */}
      <Card>
        <header className="mb-3 flex items-center gap-2">
          <Sparkles size={16} className="text-violet-300" />
          <h2 className="text-base font-semibold">{t.owner.featureFlagsTitle}</h2>
        </header>
        <ul className="space-y-2">
          {FEATURE_KEYS.map((f) => (
            <li
              key={f.key}
              className="flex items-center justify-between rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3"
            >
              <span className="text-sm font-semibold">{t.owner[f.labelKey]}</span>
              <FeatureFlagToggle
                tenantId={tenant.id}
                featureKey={f.key}
                initial={flagState.get(f.key) ?? false}
                savedLabel={t.owner.flagSaved}
              />
            </li>
          ))}
        </ul>
      </Card>

      {/* Members */}
      <Card>
        <header className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold">
            {t.owner.membersTitle} ({members.length})
          </h2>
          <Users2 size={16} className="text-muted-foreground" />
        </header>
        {members.length === 0 ? (
          <EmptyState icon={<Users2 size={20} />} title={t.owner.noMembers} />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {members.map((m) => (
              <li
                key={m.membership_id}
                data-testid={`tenant-member-${m.membership_id}`}
                className="flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback>{initials(m.display_name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{m.display_name}</p>
                  <div className="flex items-center gap-1.5">
                    <Badge variant="default">{m.role}</Badge>
                    {m.is_guest_membership && <Badge variant="warning">{t.owner.guest}</Badge>}
                    {!m.has_account && <Badge variant="info">{t.owner.pending}</Badge>}
                    {m.status === "archived" && (
                      <Badge variant="danger">{t.owner.statusArchived}</Badge>
                    )}
                  </div>
                </div>
                {m.status !== "archived" && (
                  <RemoveMemberButton
                    membershipId={m.membership_id}
                    label={t.owner.removeMember}
                    okLabel={t.owner.removed}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Assign admin */}
      <Card>
        <h2 className="mb-3 text-base font-semibold">{t.owner.assignAdminTitle}</h2>
        <AssignAdminPanel
          tenantId={tenant.id}
          accounts={pickerAccounts}
          appUrl={APP_URL}
          labels={{
            existingTitle: t.owner.assignFromExisting,
            pickAccount: t.owner.pickAccount,
            pickRole: t.owner.pickRole,
            roleAdmin: t.owner.roleAdmin,
            roleAssistant: t.owner.roleAssistant,
            roleUser: t.owner.roleUser,
            assigned: t.owner.assigned,
            newTitle: t.owner.assignNewByEmail,
            emailPlaceholder: t.owner.emailPlaceholder,
            generate: t.owner.generateInviteLink,
            shareHint: t.owner.shareInviteHint,
            copyLink: t.owner.copyLink,
            copied: t.owner.copied,
          }}
        />
      </Card>

      {/* Danger zone */}
      <Card>
        <header className="mb-3 flex items-center gap-2">
          <ShieldAlert size={16} className="text-red-300" />
          <h2 className="text-base font-semibold">Danger zone</h2>
        </header>
        <p className="mb-3 text-xs text-muted-foreground">
          {isArchived
            ? `Archived ${tenant.updated_at ? formatDate(tenant.updated_at) : ""}`
            : "Soft-delete (archive) this tenant. Members will lose access until restored."}
        </p>
        <ArchiveTenantButton
          tenantId={tenant.id}
          isArchived={isArchived}
          archiveLabel={t.owner.archiveTenant}
          restoreLabel={t.owner.restoreTenant}
        />
      </Card>
    </AppShell>
  );
}

function StatBlock({
  label,
  value,
  icon,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[11px] uppercase tracking-wider">{label}</span>
        {icon}
      </div>
      <div className="mt-1.5 text-2xl font-bold">{value}</div>
    </div>
  );
}
