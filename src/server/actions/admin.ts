"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireRole } from "@/server/auth/session";

// ---------- Venues ----------
const venueSchema = z.object({
  name: z.string().min(2).max(120),
  addressLine: z.string().optional(),
});

export async function createVenueAction(formData: FormData) {
  const { membership } = await requireRole(["admin", "owner"]);
  const parsed = venueSchema.safeParse({
    name: formData.get("name"),
    addressLine: formData.get("addressLine") || undefined,
  });
  if (!parsed.success) return { error: "Invalid venue input." };
  const admin = createSupabaseServiceClient();
  const { error } = await admin.from("venues").insert({
    tenant_id: membership.tenant_id,
    name: parsed.data.name,
    address_line: parsed.data.addressLine || null,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/venues");
  return { ok: true };
}

// ---------- Members: guest create ----------
export async function createGuestMemberAction(formData: FormData) {
  const { membership } = await requireRole(["admin", "owner"]);
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) return { error: "Name is required." };
  const admin = createSupabaseServiceClient();

  const { data: person, error: pErr } = await admin
    .from("persons")
    .insert({
      first_name: displayName.split(" ")[0],
      last_name: displayName.split(" ").slice(1).join(" ") || null,
      display_name: displayName,
      is_guest_profile: true,
    })
    .select()
    .single();
  if (pErr) return { error: pErr.message };

  await admin.from("memberships").insert({
    tenant_id: membership.tenant_id,
    person_id: person.id,
    role: "guest",
    status: "active",
    stats_visibility: "included",
    is_guest_membership: true,
    joined_at: new Date().toISOString(),
    created_by_membership_id: membership.id,
  });
  revalidatePath("/admin/members");
  return { ok: true };
}

// ---------- Archive / restore ----------
export async function archiveMembershipAction(formData: FormData) {
  const { membership } = await requireRole(["admin", "owner"]);
  const id = String(formData.get("membershipId") ?? "");
  const reason = String(formData.get("reason") ?? "Removed by admin");
  const excludeFromStats = formData.get("excludeFromStats") === "on";
  if (!id) return { error: "Missing membership." };
  const admin = createSupabaseServiceClient();
  const { data: m } = await admin
    .from("memberships")
    .select("tenant_id")
    .eq("id", id)
    .maybeSingle();
  if (!m || m.tenant_id !== membership.tenant_id) return { error: "Forbidden" };
  await admin
    .from("memberships")
    .update({
      status: "archived",
      archived_at: new Date().toISOString(),
      archived_reason: reason,
      stats_visibility: excludeFromStats ? "excluded" : "included",
    })
    .eq("id", id);
  revalidatePath("/admin/members");
  return { ok: true };
}

export async function restoreMembershipAction(formData: FormData) {
  const { membership } = await requireRole(["admin", "owner"]);
  const id = String(formData.get("membershipId") ?? "");
  const includeInStats = formData.get("includeInStats") === "on";
  if (!id) return { error: "Missing membership." };
  const admin = createSupabaseServiceClient();
  const { data: m } = await admin
    .from("memberships")
    .select("tenant_id")
    .eq("id", id)
    .maybeSingle();
  if (!m || m.tenant_id !== membership.tenant_id) return { error: "Forbidden" };
  await admin
    .from("memberships")
    .update({
      status: "active",
      restored_at: new Date().toISOString(),
      stats_visibility: includeInStats ? "included" : "excluded",
    })
    .eq("id", id);
  revalidatePath("/admin/members");
  return { ok: true };
}

// ---------- Payments / ledger ----------
const paymentSchema = z.object({
  membershipId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  description: z.string().optional(),
});

export async function recordPaymentAction(formData: FormData) {
  const { membership } = await requireRole(["admin", "owner"]);
  const parsed = paymentSchema.safeParse({
    membershipId: formData.get("membershipId"),
    amount: formData.get("amount"),
    description: formData.get("description") || undefined,
  });
  if (!parsed.success) return { error: "Invalid payment input." };
  const admin = createSupabaseServiceClient();
  const { data: target } = await admin
    .from("memberships")
    .select("tenant_id")
    .eq("id", parsed.data.membershipId)
    .maybeSingle();
  if (!target || target.tenant_id !== membership.tenant_id) return { error: "Forbidden" };

  const { data: tenant } = await admin
    .from("tenants")
    .select("currency_code")
    .eq("id", membership.tenant_id)
    .single();

  await admin.from("ledger_transactions").insert({
    tenant_id: membership.tenant_id,
    membership_id: parsed.data.membershipId,
    transaction_type: "payment",
    direction: "credit",
    amount: parsed.data.amount.toString(),
    currency_code: tenant?.currency_code ?? "GBP",
    description: parsed.data.description || "Payment",
    recorded_by_membership_id: membership.id,
  });

  await admin.from("notifications").insert({
    tenant_id: membership.tenant_id,
    membership_id: parsed.data.membershipId,
    notification_type: "wallet_updated",
    title: "Payment received",
    body: "Your wallet was just updated.",
  });

  revalidatePath("/admin/payments");
  revalidatePath("/wallet");
  return { ok: true };
}

// ---------- Invites ----------
export async function createInviteLinkAction() {
  const { membership } = await requireRole(["admin", "owner"]);
  const admin = createSupabaseServiceClient();
  const token = "inv_" + Math.random().toString(36).slice(2, 12);
  const { data, error } = await admin
    .from("tenant_invites")
    .insert({
      tenant_id: membership.tenant_id,
      token,
      created_by_membership_id: membership.id,
      default_role: "user",
      is_active: true,
    })
    .select()
    .single();
  if (error) return { error: error.message };
  revalidatePath("/admin/invites");
  return { ok: true, token: data.token };
}

export async function regenerateInviteCodeAction() {
  const { membership } = await requireRole(["admin", "owner"]);
  const admin = createSupabaseServiceClient();
  const code = randomCode();
  const { error } = await admin
    .from("tenants")
    .update({ invite_code: code, invite_code_active: true })
    .eq("id", membership.tenant_id);
  if (error) return { error: error.message };
  revalidatePath("/admin/invites");
  return { ok: true, code };
}

function randomCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)];
  return s;
}

// ---------- Profile / position prefs ----------
export async function updateProfileAction(formData: FormData) {
  const { membership, session } = await requireRole(["user", "admin", "assistant_admin", "owner"]);
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) return { error: "Display name required." };
  const admin = createSupabaseServiceClient();
  await admin
    .from("persons")
    .update({
      display_name: displayName,
      first_name: displayName.split(" ")[0],
      last_name: displayName.split(" ").slice(1).join(" ") || null,
    })
    .eq("id", session.person.id);

  const positions: string[] = [];
  for (const code of ["goalkeeper", "defender", "midfield", "forward"]) {
    if (formData.get(`position-${code}`) === "on") positions.push(code);
  }
  await admin.from("position_preferences").delete().eq("membership_id", membership.id);
  if (positions.length > 0) {
    await admin.from("position_preferences").insert(
      positions.map((p, i) => ({
        membership_id: membership.id,
        position_code: p,
        priority_rank: i + 1,
      })),
    );
  }
  revalidatePath("/profile");
  return { ok: true };
}
