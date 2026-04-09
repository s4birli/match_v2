"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireRole } from "@/server/auth/session";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length = 8): string {
  let s = "";
  for (let i = 0; i < length; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return s;
}

function randomInviteToken(): string {
  return (
    "inv_" +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

/**
 * Compute a globally unique tenant slug derived from the name.
 * Collision strategy: append -2, -3, ... up to 50 attempts.
 */
async function computeUniqueSlug(
  admin: ReturnType<typeof createSupabaseServiceClient>,
  name: string,
): Promise<string> {
  const base = slugify(name) || "group";
  for (let attempt = 0; attempt < 50; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const { data } = await admin
      .from("tenants")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  // Extremely unlikely fallback.
  return `${base}-${Date.now()}`;
}

/**
 * Compute a globally unique short invite code for a tenant row.
 * `tenants.invite_code` has a UNIQUE constraint, so we retry on collision.
 */
async function computeUniqueInviteCode(
  admin: ReturnType<typeof createSupabaseServiceClient>,
): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = randomCode();
    const { data } = await admin
      .from("tenants")
      .select("id")
      .eq("invite_code", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return randomCode() + Date.now().toString(36).toUpperCase();
}

/**
 * Compute a globally unique tenant_invites.token.
 */
async function computeUniqueInviteLinkToken(
  admin: ReturnType<typeof createSupabaseServiceClient>,
): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = randomInviteToken();
    const { data } = await admin
      .from("tenant_invites")
      .select("id")
      .eq("token", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return randomInviteToken() + Date.now().toString(36);
}

/**
 * `tenant_invites.created_by_membership_id` is now NULLABLE (see migration
 * 20260409020000_owner_no_membership.sql) so we never need to attach the
 * system owner to any tenant. Per CLAUDE.md product rule:
 *   "system owner hiç bir gruba dahil olamaz"
 *
 * If a real active admin membership exists we credit them; otherwise the
 * column stays NULL.
 */
async function resolveCreatorMembershipIdForTenant(
  admin: ReturnType<typeof createSupabaseServiceClient>,
  tenantId: string,
): Promise<string | null> {
  const { data: adminMembership } = await admin
    .from("memberships")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("role", "admin")
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();
  if (adminMembership?.id) return adminMembership.id as string;

  const { data: anyActive } = await admin
    .from("memberships")
    .select("id")
    .eq("tenant_id", tenantId)
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();
  return (anyActive?.id as string | undefined) ?? null;
}

function revalidateTenantPaths(tenantId?: string) {
  revalidatePath("/owner/tenants", "layout");
  revalidatePath("/owner/dashboard");
  if (tenantId) {
    revalidatePath(`/owner/tenants/${tenantId}`);
  }
}

// ---------------------------------------------------------------------------
// 1. Create tenant
// ---------------------------------------------------------------------------

const createTenantSchema = z.object({
  name: z.string().min(2).max(120),
  currencyCode: z
    .string()
    .length(3)
    .transform((s) => s.toUpperCase()),
});

export async function createTenantAction(
  formData: FormData,
): Promise<
  | {
      ok: true;
      tenantId: string;
      slug: string;
      inviteCode: string;
      inviteToken: string;
    }
  | { error: string }
> {
  const { session } = await requireRole(["owner"]);
  const parsed = createTenantSchema.safeParse({
    name: formData.get("name"),
    currencyCode: formData.get("currencyCode"),
  });
  if (!parsed.success) {
    return { error: "invalidInput" };
  }

  const admin = createSupabaseServiceClient();
  const slug = await computeUniqueSlug(admin, parsed.data.name);
  const inviteCode = await computeUniqueInviteCode(admin);

  const { data: tenant, error: tenantErr } = await admin
    .from("tenants")
    .insert({
      name: parsed.data.name,
      slug,
      currency_code: parsed.data.currencyCode,
      default_match_fee: "0",
      invite_code: inviteCode,
      invite_code_active: true,
      invite_link_active: true,
      is_active: true,
      default_language: "en",
    })
    .select("id")
    .single();
  if (tenantErr || !tenant) {
    return { error: "generic" };
  }

  // Audit the tenant creation.
  await admin.from("audit_logs").insert({
    tenant_id: tenant.id,
    actor_account_id: session.account.id,
    entity_type: "tenant",
    entity_id: tenant.id,
    action_type: "create_tenant",
    after_json: { name: parsed.data.name, slug, currency_code: parsed.data.currencyCode },
  });

  // Immediately create an initial admin-default invite link for the UI to show.
  // System owner CANNOT belong to any group, so created_by_membership_id stays NULL
  // unless an admin already exists for this brand-new tenant (which it never does).
  const creatorMembershipId = await resolveCreatorMembershipIdForTenant(admin, tenant.id);

  const inviteToken = await computeUniqueInviteLinkToken(admin);
  const { error: inviteErr } = await admin.from("tenant_invites").insert({
    tenant_id: tenant.id,
    token: inviteToken,
    created_by_membership_id: creatorMembershipId,
    default_role: "admin",
    is_active: true,
  });
  if (inviteErr) {
    revalidateTenantPaths(tenant.id);
    return {
      ok: true,
      tenantId: tenant.id,
      slug,
      inviteCode,
      inviteToken: "",
    };
  }

  await admin.from("audit_logs").insert({
    tenant_id: tenant.id,
    actor_account_id: session.account.id,
    entity_type: "tenant_invite",
    entity_id: tenant.id,
    action_type: "create_invite_link",
    after_json: { default_role: "admin", token: inviteToken },
  });

  revalidateTenantPaths(tenant.id);
  return { ok: true, tenantId: tenant.id, slug, inviteCode, inviteToken };
}

// ---------------------------------------------------------------------------
// 2. Update tenant settings
// ---------------------------------------------------------------------------

const updateTenantSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(2).max(120),
  currencyCode: z
    .string()
    .length(3)
    .transform((s) => s.toUpperCase()),
  isActive: z.string().optional(),
});

export async function updateTenantAction(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { session } = await requireRole(["owner"]);
  const parsed = updateTenantSchema.safeParse({
    tenantId: formData.get("tenantId"),
    name: formData.get("name"),
    currencyCode: formData.get("currencyCode"),
    isActive: formData.get("isActive") || undefined,
  });
  if (!parsed.success) {
    return { error: "invalidInput" };
  }

  const admin = createSupabaseServiceClient();
  const { data: before } = await admin
    .from("tenants")
    .select("name, currency_code, is_active")
    .eq("id", parsed.data.tenantId)
    .maybeSingle();

  const { error } = await admin
    .from("tenants")
    .update({
      name: parsed.data.name,
      currency_code: parsed.data.currencyCode,
      is_active: parsed.data.isActive === "on",
    })
    .eq("id", parsed.data.tenantId);
  if (error) return { error: "generic" };

  await admin.from("audit_logs").insert({
    tenant_id: parsed.data.tenantId,
    actor_account_id: session.account.id,
    entity_type: "tenant",
    entity_id: parsed.data.tenantId,
    action_type: "update_tenant",
    before_json: before ?? null,
    after_json: {
      name: parsed.data.name,
      currency_code: parsed.data.currencyCode,
      is_active: parsed.data.isActive === "on",
    },
  });

  revalidateTenantPaths(parsed.data.tenantId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 3. Archive tenant
// ---------------------------------------------------------------------------

const tenantIdSchema = z.object({ tenantId: z.string().uuid() });

export async function archiveTenantAction(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { session } = await requireRole(["owner"]);
  const parsed = tenantIdSchema.safeParse({ tenantId: formData.get("tenantId") });
  if (!parsed.success) return { error: "invalidInput" };

  const admin = createSupabaseServiceClient();
  const { error } = await admin
    .from("tenants")
    .update({ is_active: false, is_archived: true })
    .eq("id", parsed.data.tenantId);
  if (error) return { error: "generic" };

  await admin.from("audit_logs").insert({
    tenant_id: parsed.data.tenantId,
    actor_account_id: session.account.id,
    entity_type: "tenant",
    entity_id: parsed.data.tenantId,
    action_type: "archive_tenant",
    after_json: { is_active: false, is_archived: true },
  });

  revalidateTenantPaths(parsed.data.tenantId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 4. Restore tenant
// ---------------------------------------------------------------------------

export async function restoreTenantAction(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { session } = await requireRole(["owner"]);
  const parsed = tenantIdSchema.safeParse({ tenantId: formData.get("tenantId") });
  if (!parsed.success) return { error: "invalidInput" };

  const admin = createSupabaseServiceClient();
  const { error } = await admin
    .from("tenants")
    .update({ is_active: true, is_archived: false })
    .eq("id", parsed.data.tenantId);
  if (error) return { error: "generic" };

  await admin.from("audit_logs").insert({
    tenant_id: parsed.data.tenantId,
    actor_account_id: session.account.id,
    entity_type: "tenant",
    entity_id: parsed.data.tenantId,
    action_type: "restore_tenant",
    after_json: { is_active: true, is_archived: false },
  });

  revalidateTenantPaths(parsed.data.tenantId);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 5. Regenerate short invite code on tenant row
// ---------------------------------------------------------------------------

export async function regenerateTenantInviteCodeAction(
  formData: FormData,
): Promise<{ ok: true; code: string } | { error: string }> {
  const { session } = await requireRole(["owner"]);
  const parsed = tenantIdSchema.safeParse({ tenantId: formData.get("tenantId") });
  if (!parsed.success) return { error: "invalidInput" };

  const admin = createSupabaseServiceClient();
  const code = await computeUniqueInviteCode(admin);
  const { error } = await admin
    .from("tenants")
    .update({ invite_code: code, invite_code_active: true })
    .eq("id", parsed.data.tenantId);
  if (error) return { error: "generic" };

  await admin.from("audit_logs").insert({
    tenant_id: parsed.data.tenantId,
    actor_account_id: session.account.id,
    entity_type: "tenant",
    entity_id: parsed.data.tenantId,
    action_type: "regenerate_invite_code",
    after_json: { code },
  });

  revalidateTenantPaths(parsed.data.tenantId);
  return { ok: true, code };
}

// ---------------------------------------------------------------------------
// 6. Create OR regenerate the (single) invite link of a given role
//
// Product rule: each tenant gets at most ONE active invite link per role
// (one for users, one for admins). Calling this action when a row already
// exists *regenerates* its token instead of inserting a duplicate. Any
// previously-active rows of the same role are deactivated first.
// ---------------------------------------------------------------------------

const createInviteLinkSchema = z.object({
  tenantId: z.string().uuid(),
  role: z.enum(["admin", "user", "assistant_admin"]).default("user"),
});

export async function createInviteLinkAction(
  formData: FormData,
): Promise<{ ok: true; token: string; replaced: boolean } | { error: string }> {
  const { session } = await requireRole(["owner"]);
  const parsed = createInviteLinkSchema.safeParse({
    tenantId: formData.get("tenantId"),
    role: (formData.get("role") as string) || "user",
  });
  if (!parsed.success) {
    return { error: "invalidInput" };
  }

  const admin = createSupabaseServiceClient();
  // System owner has no membership; this resolves to a real admin if one
  // exists, else NULL (the column is nullable per migration 20260409020000).
  const creatorMembershipId = await resolveCreatorMembershipIdForTenant(
    admin,
    parsed.data.tenantId,
  );

  const token = await computeUniqueInviteLinkToken(admin);

  // Look for an existing invite of the same role.
  const { data: existing } = await admin
    .from("tenant_invites")
    .select("id")
    .eq("tenant_id", parsed.data.tenantId)
    .eq("default_role", parsed.data.role)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let replaced = false;
  if (existing?.id) {
    // Refresh — regenerate the token of the existing row instead of creating a duplicate.
    const { error: updErr } = await admin
      .from("tenant_invites")
      .update({
        token,
        is_active: true,
        used_count: 0,
        created_by_membership_id: creatorMembershipId,
      })
      .eq("id", existing.id);
    if (updErr) return { error: "generic" };
    replaced = true;
  } else {
    const { error: insErr } = await admin.from("tenant_invites").insert({
      tenant_id: parsed.data.tenantId,
      token,
      created_by_membership_id: creatorMembershipId,
      default_role: parsed.data.role,
      is_active: true,
    });
    if (insErr) return { error: "generic" };
  }

  await admin.from("audit_logs").insert({
    tenant_id: parsed.data.tenantId,
    actor_account_id: session.account.id,
    entity_type: "tenant_invite",
    entity_id: parsed.data.tenantId,
    action_type: replaced ? "regenerate_invite_link" : "create_invite_link",
    after_json: { default_role: parsed.data.role, token },
  });

  revalidateTenantPaths(parsed.data.tenantId);
  return { ok: true, token, replaced };
}

// ---------------------------------------------------------------------------
// 7. Deactivate an invite link
// ---------------------------------------------------------------------------

const deactivateInviteSchema = z.object({ inviteId: z.string().uuid() });

export async function deactivateInviteLinkAction(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { session } = await requireRole(["owner"]);
  const parsed = deactivateInviteSchema.safeParse({
    inviteId: formData.get("inviteId"),
  });
  if (!parsed.success) return { error: "invalidInput" };

  const admin = createSupabaseServiceClient();
  const { data: invite } = await admin
    .from("tenant_invites")
    .select("id, tenant_id")
    .eq("id", parsed.data.inviteId)
    .maybeSingle();
  if (!invite) return { error: "inviteNotFound" };

  const { error } = await admin
    .from("tenant_invites")
    .update({ is_active: false })
    .eq("id", parsed.data.inviteId);
  if (error) return { error: "generic" };

  await admin.from("audit_logs").insert({
    tenant_id: invite.tenant_id,
    actor_account_id: session.account.id,
    entity_type: "tenant_invite",
    entity_id: parsed.data.inviteId,
    action_type: "deactivate_invite_link",
    after_json: { is_active: false },
  });

  revalidateTenantPaths(invite.tenant_id as string);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 8. Assign an existing account as a member of a tenant with a chosen role
// ---------------------------------------------------------------------------

const assignExistingAccountSchema = z.object({
  tenantId: z.string().uuid(),
  accountId: z.string().uuid(),
  role: z.enum(["admin", "assistant_admin", "user", "guest"]),
});

export async function assignExistingAccountAsRoleAction(
  formData: FormData,
): Promise<{ ok: true; membershipId: string } | { error: string }> {
  const { session } = await requireRole(["owner"]);
  const parsed = assignExistingAccountSchema.safeParse({
    tenantId: formData.get("tenantId"),
    accountId: formData.get("accountId"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: "invalidInput" };
  }

  const admin = createSupabaseServiceClient();

  const { data: account } = await admin
    .from("accounts")
    .select("id, email, is_system_owner")
    .eq("id", parsed.data.accountId)
    .maybeSingle();
  if (!account) return { error: "accountNotFound" };
  if (account.is_system_owner) {
    return { error: "ownerCannotBeMember" };
  }

  // Find or create the person linked to this account.
  let { data: person } = await admin
    .from("persons")
    .select("id, display_name")
    .eq("primary_account_id", parsed.data.accountId)
    .maybeSingle();

  if (!person) {
    const emailLocalPart = (account.email as string).split("@")[0];
    const { data: created, error: personErr } = await admin
      .from("persons")
      .insert({
        primary_account_id: parsed.data.accountId,
        first_name: emailLocalPart,
        last_name: null,
        display_name: emailLocalPart,
        email: account.email,
        is_guest_profile: false,
      })
      .select("id, display_name")
      .single();
    if (personErr || !created) {
      return { error: "generic" };
    }
    person = created;
  }

  // Guard against duplicate membership.
  const { data: existing } = await admin
    .from("memberships")
    .select("id, status")
    .eq("tenant_id", parsed.data.tenantId)
    .eq("person_id", person.id)
    .maybeSingle();
  if (existing) {
    // Re-activate + update role if necessary.
    const { error: updateErr } = await admin
      .from("memberships")
      .update({
        role: parsed.data.role,
        status: "active",
        archived_at: null,
        archived_reason: null,
        restored_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
    if (updateErr) return { error: "generic" };

    await admin.from("audit_logs").insert({
      tenant_id: parsed.data.tenantId,
      actor_account_id: session.account.id,
      entity_type: "membership",
      entity_id: existing.id,
      action_type: "assign_existing_account",
      after_json: { role: parsed.data.role, reactivated: true },
    });

    revalidateTenantPaths(parsed.data.tenantId);
    return { ok: true, membershipId: existing.id as string };
  }

  const { data: membership, error: membershipErr } = await admin
    .from("memberships")
    .insert({
      tenant_id: parsed.data.tenantId,
      person_id: person.id,
      role: parsed.data.role,
      status: "active",
      stats_visibility: "included",
      is_guest_membership: false,
      joined_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (membershipErr || !membership) {
    return { error: "generic" };
  }

  await admin.from("audit_logs").insert({
    tenant_id: parsed.data.tenantId,
    actor_account_id: session.account.id,
    entity_type: "membership",
    entity_id: membership.id,
    action_type: "assign_existing_account",
    after_json: {
      account_id: parsed.data.accountId,
      role: parsed.data.role,
    },
  });

  revalidateTenantPaths(parsed.data.tenantId);
  return { ok: true, membershipId: membership.id as string };
}

// ---------------------------------------------------------------------------
// 9. Invite a brand-new user (no account yet) to a tenant with a role
// ---------------------------------------------------------------------------

const inviteNewUserSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(["admin", "assistant_admin", "user", "guest"]),
});

export async function inviteNewUserToTenantAction(
  formData: FormData,
): Promise<{ ok: true; token: string } | { error: string }> {
  const { session } = await requireRole(["owner"]);
  const parsed = inviteNewUserSchema.safeParse({
    tenantId: formData.get("tenantId"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: "invalidInput" };
  }

  const admin = createSupabaseServiceClient();

  const creatorMembershipId = await resolveCreatorMembershipIdForTenant(
    admin,
    parsed.data.tenantId,
  );

  const token = await computeUniqueInviteLinkToken(admin);
  const { data: invite, error } = await admin
    .from("tenant_invites")
    .insert({
      tenant_id: parsed.data.tenantId,
      token,
      created_by_membership_id: creatorMembershipId,
      default_role: parsed.data.role,
      max_uses: 1,
      is_active: true,
    })
    .select("id")
    .single();
  if (error || !invite) {
    return { error: "generic" };
  }

  await admin.from("audit_logs").insert({
    tenant_id: parsed.data.tenantId,
    actor_account_id: session.account.id,
    entity_type: "tenant_invite",
    entity_id: invite.id,
    action_type: "invite_new_user",
    after_json: {
      email: parsed.data.email,
      role: parsed.data.role,
      token,
    },
    metadata: { recipient_email: parsed.data.email },
  });

  revalidateTenantPaths(parsed.data.tenantId);
  return { ok: true, token };
}

// ---------------------------------------------------------------------------
// 10. Remove a membership (soft-archive)
// ---------------------------------------------------------------------------

const removeMembershipSchema = z.object({ membershipId: z.string().uuid() });

export async function removeMembershipAction(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { session } = await requireRole(["owner"]);
  const parsed = removeMembershipSchema.safeParse({
    membershipId: formData.get("membershipId"),
  });
  if (!parsed.success) return { error: "invalidInput" };

  const admin = createSupabaseServiceClient();
  const { data: existing } = await admin
    .from("memberships")
    .select("id, tenant_id, status, role")
    .eq("id", parsed.data.membershipId)
    .maybeSingle();
  if (!existing) return { error: "membershipNotFound" };

  const { error } = await admin
    .from("memberships")
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
      archived_reason: "Removed by system owner",
    })
    .eq("id", parsed.data.membershipId);
  if (error) return { error: "generic" };

  await admin.from("audit_logs").insert({
    tenant_id: existing.tenant_id as string,
    actor_account_id: session.account.id,
    entity_type: "membership",
    entity_id: parsed.data.membershipId,
    action_type: "remove_membership",
    before_json: { status: existing.status, role: existing.role },
    after_json: { status: "archived", reason: "Removed by system owner" },
  });

  revalidateTenantPaths(existing.tenant_id as string);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// 11. Toggle a tenant feature flag
// ---------------------------------------------------------------------------

const featureFlagSchema = z.object({
  tenantId: z.string().uuid(),
  featureKey: z.string().min(1).max(80),
  enabled: z.string().optional(),
});

export async function setTenantFeatureFlagAction(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const { session } = await requireRole(["owner"]);
  const parsed = featureFlagSchema.safeParse({
    tenantId: formData.get("tenantId"),
    featureKey: formData.get("featureKey"),
    enabled: formData.get("enabled") || undefined,
  });
  if (!parsed.success) {
    return { error: "invalidInput" };
  }

  const isEnabled = parsed.data.enabled === "on";
  const admin = createSupabaseServiceClient();

  // Upsert on (tenant_id, feature_key).
  const { data: existing } = await admin
    .from("tenant_feature_flags")
    .select("id")
    .eq("tenant_id", parsed.data.tenantId)
    .eq("feature_key", parsed.data.featureKey)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await admin
      .from("tenant_feature_flags")
      .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) return { error: "generic" };
  } else {
    const { error } = await admin.from("tenant_feature_flags").insert({
      tenant_id: parsed.data.tenantId,
      feature_key: parsed.data.featureKey,
      is_enabled: isEnabled,
    });
    if (error) return { error: "generic" };
  }

  await admin.from("audit_logs").insert({
    tenant_id: parsed.data.tenantId,
    actor_account_id: session.account.id,
    entity_type: "tenant_feature_flag",
    entity_id: parsed.data.tenantId,
    action_type: "set_feature_flag",
    after_json: { feature_key: parsed.data.featureKey, is_enabled: isEnabled },
  });

  revalidateTenantPaths(parsed.data.tenantId);
  return { ok: true };
}
