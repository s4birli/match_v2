"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireRole } from "@/server/auth/session";

const createTenantSchema = z.object({
  name: z.string().min(2).max(120),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers and dashes."),
  currencyCode: z.string().length(3),
  defaultMatchFee: z.coerce.number().min(0),
  inviteCode: z.string().min(4).max(16).optional(),
});

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

export async function createTenantAction(formData: FormData) {
  const { session } = await requireRole(["owner"]);
  const parsed = createTenantSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    currencyCode: (formData.get("currencyCode") as string)?.toUpperCase() ?? "GBP",
    defaultMatchFee: formData.get("defaultMatchFee") ?? 0,
    inviteCode: formData.get("inviteCode") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const admin = createSupabaseServiceClient();
  const { data: tenant, error } = await admin
    .from("tenants")
    .insert({
      name: parsed.data.name,
      slug: parsed.data.slug,
      currency_code: parsed.data.currencyCode,
      default_match_fee: parsed.data.defaultMatchFee.toString(),
      invite_code: parsed.data.inviteCode ?? randomCode(),
      invite_code_active: true,
      invite_link_active: true,
      is_active: true,
      default_language: "en",
    })
    .select()
    .single();
  if (error) return { error: error.message };

  // System owners cannot be members of any group — DO NOT insert a
  // membership row for the owner. Per CLAUDE.md product rule:
  // "system owner hiç bir gruba dahil olamaz".

  await admin.from("audit_logs").insert({
    tenant_id: tenant.id,
    actor_account_id: session.account.id,
    entity_type: "tenant",
    entity_id: tenant.id,
    action_type: "create_tenant",
    after_json: { name: tenant.name, slug: tenant.slug },
  });

  revalidatePath("/owner/dashboard");
  revalidatePath("/owner/tenants");
  return { ok: true, tenantId: tenant.id };
}

const assignAdminSchema = z.object({
  tenantId: z.string().uuid(),
  email: z.string().email(),
  displayName: z.string().min(2).max(80),
});

export async function createAdminForTenantAction(formData: FormData) {
  const { session } = await requireRole(["owner"]);
  const parsed = assignAdminSchema.safeParse({
    tenantId: formData.get("tenantId"),
    email: formData.get("email"),
    displayName: formData.get("displayName"),
  });
  if (!parsed.success) return { error: "Invalid input." };

  const admin = createSupabaseServiceClient();

  // Check if a person with this email already exists
  let { data: person } = await admin
    .from("persons")
    .select("*")
    .eq("email", parsed.data.email)
    .maybeSingle();

  if (!person) {
    const { data: created, error: pErr } = await admin
      .from("persons")
      .insert({
        first_name: parsed.data.displayName.split(" ")[0],
        last_name: parsed.data.displayName.split(" ").slice(1).join(" ") || null,
        display_name: parsed.data.displayName,
        email: parsed.data.email,
        is_guest_profile: false,
      })
      .select()
      .single();
    if (pErr) return { error: pErr.message };
    person = created;
  }

  // Insert membership as admin
  const { error: mErr } = await admin.from("memberships").insert({
    tenant_id: parsed.data.tenantId,
    person_id: person!.id,
    role: "admin",
    status: "active",
    stats_visibility: "included",
    is_guest_membership: false,
    joined_at: new Date().toISOString(),
  });
  if (mErr) return { error: mErr.message };

  await admin.from("audit_logs").insert({
    tenant_id: parsed.data.tenantId,
    actor_account_id: session.account.id,
    entity_type: "membership",
    entity_id: person!.id,
    action_type: "assign_admin",
    after_json: { email: parsed.data.email },
  });

  revalidatePath(`/owner/tenants/${parsed.data.tenantId}`);
  revalidatePath("/owner/tenants");
  return { ok: true };
}

const updateTenantSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(2),
  currencyCode: z.string().length(3),
  defaultMatchFee: z.coerce.number().min(0),
  isActive: z.string().optional(),
});

export async function updateTenantAction(formData: FormData) {
  await requireRole(["owner"]);
  const parsed = updateTenantSchema.safeParse({
    tenantId: formData.get("tenantId"),
    name: formData.get("name"),
    currencyCode: (formData.get("currencyCode") as string)?.toUpperCase() ?? "GBP",
    defaultMatchFee: formData.get("defaultMatchFee"),
    isActive: formData.get("isActive") || undefined,
  });
  if (!parsed.success) return { error: "Invalid input." };

  const admin = createSupabaseServiceClient();
  await admin
    .from("tenants")
    .update({
      name: parsed.data.name,
      currency_code: parsed.data.currencyCode,
      default_match_fee: parsed.data.defaultMatchFee.toString(),
      is_active: parsed.data.isActive === "on",
    })
    .eq("id", parsed.data.tenantId);

  revalidatePath("/owner/tenants");
  revalidatePath(`/owner/tenants/${parsed.data.tenantId}`);
  return { ok: true };
}
