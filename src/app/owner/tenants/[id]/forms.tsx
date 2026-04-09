"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, RefreshCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { useI18n, translateError } from "@/lib/i18n/client";
import {
  archiveTenantAction,
  assignExistingAccountAsRoleAction,
  createInviteLinkAction,
  deactivateInviteLinkAction,
  inviteNewUserToTenantAction,
  regenerateTenantInviteCodeAction,
  removeMembershipAction,
  restoreTenantAction,
  setTenantFeatureFlagAction,
  updateTenantAction,
} from "@/server/actions/owner";
import type { Tenant } from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Tenant settings form
// ---------------------------------------------------------------------------
export function TenantSettingsForm({
  tenant,
  labels,
}: {
  tenant: Tenant;
  labels: {
    name: string;
    currency: string;
    active: string;
    save: string;
    saving: string;
    saved: string;
  };
}) {
  const { push } = useToast();
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  function action(fd: FormData) {
    start(async () => {
      const res = await updateTenantAction(fd);
      if ("error" in res) push({ title: translateError(t, res.error), tone: "danger" });
      else {
        push({ title: labels.saved, tone: "success" });
        router.refresh();
      }
    });
  }
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-2">
      <input type="hidden" name="tenantId" value={tenant.id} />
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="name">{labels.name}</Label>
        <Input
          id="name"
          name="name"
          defaultValue={tenant.name}
          required
          data-testid="tenant-edit-name"
        />
      </div>
      <div className="space-y-2 sm:col-span-2">
        <Label htmlFor="currencyCode">{labels.currency}</Label>
        <select
          id="currencyCode"
          name="currencyCode"
          defaultValue={tenant.currency_code}
          data-testid="tenant-edit-currency"
          className="flex h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground"
        >
          <option value="GBP">GBP</option>
          <option value="USD">USD</option>
          <option value="EUR">EUR</option>
          <option value="TRY">TRY</option>
          <option value="MYR">MYR</option>
        </select>
      </div>
      <label className="flex items-center gap-2 text-sm sm:col-span-2">
        <input
          type="checkbox"
          name="isActive"
          defaultChecked={tenant.is_active}
          data-testid="tenant-edit-active"
          className="h-4 w-4 accent-emerald-500"
        />
        {labels.active}
      </label>
      <Button
        type="submit"
        disabled={pending}
        className="sm:col-span-2"
        data-testid="tenant-edit-submit"
      >
        {pending ? labels.saving : labels.save}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Regenerate invite code
// ---------------------------------------------------------------------------
export function RegenerateCodeButton({
  tenantId,
  label,
}: {
  tenantId: string;
  label: string;
}) {
  const { push } = useToast();
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  function go() {
    start(async () => {
      const fd = new FormData();
      fd.set("tenantId", tenantId);
      const res = await regenerateTenantInviteCodeAction(fd);
      if ("error" in res) push({ title: translateError(t, res.error), tone: "danger" });
      else {
        push({ title: t.toasts.codeRegenerated, tone: "success" });
        router.refresh();
      }
    });
  }
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={go}
      disabled={pending}
      data-testid="regenerate-code"
    >
      <RefreshCcw size={14} />
      {label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Copy to clipboard
// ---------------------------------------------------------------------------
export function CopyButton({
  text,
  label,
  okLabel,
}: {
  text: string;
  label: string;
  okLabel: string;
}) {
  const { push } = useToast();
  const { t } = useI18n();
  function copy() {
    navigator.clipboard.writeText(text).then(
      () => push({ title: okLabel, tone: "success" }),
      () => push({ title: t.toasts.copyFailed, tone: "danger" }),
    );
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={copy}
      data-testid="copy-button"
    >
      <Copy size={14} />
      {label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Create invite link (admin or user)
// ---------------------------------------------------------------------------
export function CreateInviteButton({
  tenantId,
  role,
  label,
  testid,
}: {
  tenantId: string;
  role: "admin" | "user" | "assistant_admin";
  label: string;
  testid: string;
}) {
  const { push } = useToast();
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  function go() {
    start(async () => {
      const fd = new FormData();
      fd.set("tenantId", tenantId);
      fd.set("role", role);
      const res = await createInviteLinkAction(fd);
      if ("error" in res) push({ title: translateError(t, res.error), tone: "danger" });
      else {
        push({ title: t.toasts.inviteCreated, tone: "success" });
        router.refresh();
      }
    });
  }
  return (
    <Button
      type="button"
      size="sm"
      variant={role === "admin" ? "accent" : "secondary"}
      onClick={go}
      disabled={pending}
      data-testid={testid}
    >
      {label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Deactivate invite link
// ---------------------------------------------------------------------------
export function DeactivateInviteButton({
  inviteId,
  label,
}: {
  inviteId: string;
  label: string;
}) {
  const { push } = useToast();
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  function go() {
    start(async () => {
      const fd = new FormData();
      fd.set("inviteId", inviteId);
      const res = await deactivateInviteLinkAction(fd);
      if ("error" in res) push({ title: translateError(t, res.error), tone: "danger" });
      else {
        push({ title: t.toasts.inviteDeactivated, tone: "success" });
        router.refresh();
      }
    });
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={go}
      disabled={pending}
      data-testid={`deactivate-${inviteId}`}
    >
      {label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Feature flag toggle (custom-styled checkbox)
// ---------------------------------------------------------------------------
export function FeatureFlagToggle({
  tenantId,
  featureKey,
  initial,
  savedLabel,
}: {
  tenantId: string;
  featureKey: string;
  initial: boolean;
  savedLabel: string;
}) {
  const { push } = useToast();
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [checked, setChecked] = useState(initial);

  function toggle() {
    const next = !checked;
    setChecked(next);
    start(async () => {
      const fd = new FormData();
      fd.set("tenantId", tenantId);
      fd.set("featureKey", featureKey);
      if (next) fd.set("enabled", "on");
      const res = await setTenantFeatureFlagAction(fd);
      if ("error" in res) {
        setChecked(!next);
        push({ title: translateError(t, res.error), tone: "danger" });
      } else {
        push({ title: savedLabel, tone: "success" });
        router.refresh();
      }
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={toggle}
      disabled={pending}
      data-testid={`flag-${featureKey}`}
      className={`relative h-7 w-12 rounded-full border transition-colors ${
        checked
          ? "border-emerald-400/40 bg-emerald-500/30"
          : "border-white/10 bg-white/[0.06]"
      }`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
          checked ? "left-[calc(100%-1.5rem)]" : "left-0.5"
        }`}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Remove member
// ---------------------------------------------------------------------------
export function RemoveMemberButton({
  membershipId,
  label,
  okLabel,
}: {
  membershipId: string;
  label: string;
  okLabel: string;
}) {
  const { push } = useToast();
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  function go() {
    if (!window.confirm("Remove this member from the tenant?")) return;
    start(async () => {
      const fd = new FormData();
      fd.set("membershipId", membershipId);
      const res = await removeMembershipAction(fd);
      if ("error" in res) push({ title: translateError(t, res.error), tone: "danger" });
      else {
        push({ title: okLabel, tone: "success" });
        router.refresh();
      }
    });
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={go}
      disabled={pending}
      data-testid={`remove-member-${membershipId}`}
    >
      <Trash2 size={14} />
      {label}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// Assign admin panel — picker (existing) + new email invite
// ---------------------------------------------------------------------------
export function AssignAdminPanel({
  tenantId,
  accounts,
  appUrl,
  labels,
}: {
  tenantId: string;
  accounts: Array<{ id: string; email: string; display_name: string | null }>;
  appUrl: string;
  labels: {
    existingTitle: string;
    pickAccount: string;
    pickRole: string;
    roleAdmin: string;
    roleAssistant: string;
    roleUser: string;
    assigned: string;
    newTitle: string;
    emailPlaceholder: string;
    generate: string;
    shareHint: string;
    copyLink: string;
    copied: string;
  };
}) {
  const { push } = useToast();
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);

  function assignExisting(fd: FormData) {
    fd.set("tenantId", tenantId);
    start(async () => {
      const res = await assignExistingAccountAsRoleAction(fd);
      if ("error" in res) push({ title: translateError(t, res.error), tone: "danger" });
      else {
        push({ title: labels.assigned, tone: "success" });
        router.refresh();
      }
    });
  }

  function inviteNew(fd: FormData) {
    fd.set("tenantId", tenantId);
    start(async () => {
      const res = await inviteNewUserToTenantAction(fd);
      if ("error" in res) push({ title: translateError(t, res.error), tone: "danger" });
      else {
        setGeneratedToken(res.token);
        push({ title: t.toasts.inviteLinkReady, tone: "success" });
        router.refresh();
      }
    });
  }

  function copy(text: string) {
    navigator.clipboard.writeText(text).then(
      () => push({ title: labels.copied, tone: "success" }),
      () => push({ title: t.toasts.copyFailed, tone: "danger" }),
    );
  }

  const generatedUrl = generatedToken ? `${appUrl}/invite/${generatedToken}` : null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Existing account picker */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="mb-3 text-sm font-semibold">{labels.existingTitle}</h3>
        <form action={assignExisting} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="accountId">{labels.pickAccount}</Label>
            <select
              id="accountId"
              name="accountId"
              required
              data-testid="assign-existing-account"
              className="flex h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground"
            >
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.display_name ?? a.email} · {a.email}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="roleExisting">{labels.pickRole}</Label>
            <select
              id="roleExisting"
              name="role"
              defaultValue="admin"
              data-testid="assign-existing-role"
              className="flex h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground"
            >
              <option value="admin">{labels.roleAdmin}</option>
              <option value="assistant_admin">{labels.roleAssistant}</option>
              <option value="user">{labels.roleUser}</option>
            </select>
          </div>
          <Button
            type="submit"
            disabled={pending || accounts.length === 0}
            className="w-full"
            data-testid="assign-existing-submit"
          >
            {labels.assigned}
          </Button>
        </form>
      </div>

      {/* New email invite */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h3 className="mb-3 text-sm font-semibold">{labels.newTitle}</h3>
        <form action={inviteNew} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              placeholder={labels.emailPlaceholder}
              data-testid="assign-new-email"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="roleNew">{labels.pickRole}</Label>
            <select
              id="roleNew"
              name="role"
              defaultValue="admin"
              data-testid="assign-new-role"
              className="flex h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-foreground"
            >
              <option value="admin">{labels.roleAdmin}</option>
              <option value="assistant_admin">{labels.roleAssistant}</option>
              <option value="user">{labels.roleUser}</option>
            </select>
          </div>
          <Button
            type="submit"
            disabled={pending}
            className="w-full"
            variant="accent"
            data-testid="assign-new-submit"
          >
            {labels.generate}
          </Button>
        </form>
        {generatedUrl && (
          <div className="mt-3 space-y-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3">
            <p className="text-[11px] text-emerald-200">{labels.shareHint}</p>
            <code
              className="block break-all rounded-lg bg-black/30 px-3 py-2 text-xs"
              data-testid="generated-invite-url"
            >
              {generatedUrl}
            </code>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => copy(generatedUrl)}
            >
              <Copy size={14} />
              {labels.copyLink}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Archive / restore tenant button
// ---------------------------------------------------------------------------
export function ArchiveTenantButton({
  tenantId,
  isArchived,
  archiveLabel,
  restoreLabel,
}: {
  tenantId: string;
  isArchived: boolean;
  archiveLabel: string;
  restoreLabel: string;
}) {
  const { push } = useToast();
  const { t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  function go() {
    if (!isArchived && !window.confirm("Archive this tenant?")) return;
    start(async () => {
      const fd = new FormData();
      fd.set("tenantId", tenantId);
      const res = isArchived
        ? await restoreTenantAction(fd)
        : await archiveTenantAction(fd);
      if ("error" in res) push({ title: translateError(t, res.error), tone: "danger" });
      else {
        push({
          title: isArchived ? t.toasts.tenantRestored : t.toasts.tenantArchived,
          tone: "success",
        });
        router.refresh();
      }
    });
  }
  return (
    <Button
      type="button"
      variant={isArchived ? "secondary" : "destructive"}
      onClick={go}
      disabled={pending}
      data-testid="archive-tenant"
    >
      {isArchived ? restoreLabel : archiveLabel}
    </Button>
  );
}
