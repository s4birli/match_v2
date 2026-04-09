"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireRole } from "@/server/auth/session";
import { audit } from "@/server/audit/log";
import { notify, notifyMany } from "@/server/notifications/notify";

// ---------- Tenant defaults (used by /admin/settings) ----------
const tenantDefaultsSchema = z.object({
  tenantId: z.string().uuid(),
  defaultMatchFee: z.coerce.number().min(0),
});

export async function updateTenantDefaultsAction(formData: FormData) {
  const { membership } = await requireRole(["admin", "owner"]);
  const parsed = tenantDefaultsSchema.safeParse({
    tenantId: formData.get("tenantId"),
    defaultMatchFee: formData.get("defaultMatchFee"),
  });
  if (!parsed.success) return { error: "Invalid input." };
  if (parsed.data.tenantId !== membership.tenant_id) return { error: "Forbidden" };
  const admin = createSupabaseServiceClient();
  const { error } = await admin
    .from("tenants")
    .update({ default_match_fee: parsed.data.defaultMatchFee.toString() })
    .eq("id", membership.tenant_id);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  revalidatePath("/admin/matches/new");
  revalidatePath("/admin/dashboard");
  return { ok: true };
}

// ---------- Venues ----------
const venueSchema = z.object({
  name: z.string().min(2).max(120),
  addressLine: z.string().optional(),
});

export async function createVenueAction(formData: FormData) {
  const { membership } = await requireRole(["admin", "owner", "assistant_admin"]);
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

// ---------- Members: guest convert to registered member ----------
//
// Key product rule (CLAUDE.md): the guest's history (matches played, team
// assignments, ratings received, wallet, MOTM) MUST be preserved. We achieve
// this by NOT creating a new person/membership. Instead:
//
//   1. Admin clicks "Convert" on a guest row + enters an email.
//   2. We stamp the email on the existing persons row and create a single-use
//      tenant_invites row whose metadata holds `{ claim_guest_membership_id }`.
//   3. We return the /invite/<token> URL for the admin to share.
//   4. When the invitee registers via that link, registerAction sees the
//      claim metadata and re-links: persons.primary_account_id = new account,
//      persons.is_guest_profile = false, memberships.role = 'user',
//      memberships.is_guest_membership = false. Same row IDs → all FKs
//      (match_participants, ledger, ratings, motm votes) stay valid.
const convertGuestSchema = z.object({
  membershipId: z.string().uuid(),
  email: z.string().email(),
});

function randomConvertToken() {
  return (
    "claim_" +
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 10)
  );
}

export async function startGuestConversionAction(
  formData: FormData,
): Promise<{ ok: true; token: string; url: string } | { error: string }> {
  const { session, membership } = await requireRole(["admin", "owner"]);
  const parsed = convertGuestSchema.safeParse({
    membershipId: formData.get("membershipId"),
    email: formData.get("email"),
  });
  if (!parsed.success) return { error: "Invalid input" };
  const admin = createSupabaseServiceClient();

  const { data: target } = await admin
    .from("memberships")
    .select("id, tenant_id, person_id, is_guest_membership, role")
    .eq("id", parsed.data.membershipId)
    .maybeSingle();
  if (!target) return { error: "Membership not found" };
  if (target.tenant_id !== membership.tenant_id) return { error: "Forbidden" };
  if (!target.is_guest_membership && target.role !== "guest") {
    return { error: "This member is already a registered user." };
  }

  // Refuse if a real account already uses this email anywhere.
  const { data: clash } = await admin
    .from("accounts")
    .select("id")
    .eq("email", parsed.data.email)
    .maybeSingle();
  if (clash) {
    return { error: "An account with this email already exists." };
  }

  // Stamp the email on the existing person row so the registration flow can
  // double-check the match.
  await admin
    .from("persons")
    .update({ email: parsed.data.email })
    .eq("id", target.person_id);

  // Find an existing admin membership to satisfy the FK on tenant_invites.
  // (System owners aren't members of any tenant — see migration 20260409020000.)
  const { data: anyAdmin } = await admin
    .from("memberships")
    .select("id")
    .eq("tenant_id", membership.tenant_id)
    .eq("role", "admin")
    .neq("status", "archived")
    .limit(1)
    .maybeSingle();

  const token = randomConvertToken();
  const { data: invite, error: inviteErr } = await admin
    .from("tenant_invites")
    .insert({
      tenant_id: membership.tenant_id,
      token,
      created_by_membership_id: anyAdmin?.id ?? membership.id,
      default_role: "user",
      max_uses: 1,
      is_active: true,
      // Stash the claim payload + recipient email here.
      // (tenant_invites has no metadata column, so we re-purpose the
      // invite_consumptions metadata at consume time. We encode the
      // claim id into the token prefix instead.)
    })
    .select("id, token")
    .single();
  if (inviteErr || !invite) {
    return { error: inviteErr?.message ?? "Failed to create invite." };
  }

  // Persist the claim mapping in audit_logs so registerAction can look it up.
  await admin.from("audit_logs").insert({
    tenant_id: membership.tenant_id,
    actor_account_id: session.account.id,
    entity_type: "guest_conversion",
    entity_id: target.id,
    action_type: "start_guest_conversion",
    metadata: {
      invite_token: invite.token,
      claim_membership_id: target.id,
      claim_person_id: target.person_id,
      recipient_email: parsed.data.email,
    },
  });

  const baseUrl = process.env.APP_URL ?? "http://localhost:3737";
  const url = `${baseUrl}/invite/${invite.token}`;
  revalidatePath("/admin/members");
  return { ok: true, token: invite.token, url };
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
  const { session, membership } = await requireRole(["admin", "owner"]);
  const id = String(formData.get("membershipId") ?? "");
  const reason = String(formData.get("reason") ?? "Removed by admin");
  const excludeFromStats = formData.get("excludeFromStats") === "on";
  if (!id) return { error: "Missing membership." };
  const admin = createSupabaseServiceClient();
  const { data: m } = await admin
    .from("memberships")
    .select("tenant_id, role")
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
  await audit({
    tenantId: membership.tenant_id,
    actorAccountId: session.account.id,
    actorMembershipId: membership.id,
    entityType: "membership",
    entityId: id,
    actionType: "archive_membership",
    after: { reason, excludeFromStats },
  });
  revalidatePath("/admin/members");
  return { ok: true };
}

export async function restoreMembershipAction(formData: FormData) {
  const { session, membership } = await requireRole(["admin", "owner"]);
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
  await audit({
    tenantId: membership.tenant_id,
    actorAccountId: session.account.id,
    actorMembershipId: membership.id,
    entityType: "membership",
    entityId: id,
    actionType: "restore_membership",
    after: { includeInStats },
  });
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
  const { session, membership } = await requireRole(["admin", "owner"]);
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

  const { data: tx } = await admin
    .from("ledger_transactions")
    .insert({
      tenant_id: membership.tenant_id,
      membership_id: parsed.data.membershipId,
      transaction_type: "payment",
      direction: "credit",
      amount: parsed.data.amount.toString(),
      currency_code: tenant?.currency_code ?? "GBP",
      description: parsed.data.description || "Payment",
      recorded_by_membership_id: membership.id,
    })
    .select("id")
    .single();

  await notify({
    tenantId: membership.tenant_id,
    membershipId: parsed.data.membershipId,
    notificationType: "wallet_updated",
    title: "Payment received",
    body: `Your wallet was credited ${parsed.data.amount} ${tenant?.currency_code ?? ""}.`,
    payload: { amount: parsed.data.amount, kind: "payment" },
  });

  await audit({
    tenantId: membership.tenant_id,
    actorAccountId: session.account.id,
    actorMembershipId: membership.id,
    entityType: "ledger_transaction",
    entityId: tx?.id ?? parsed.data.membershipId,
    actionType: "record_payment",
    after: {
      target_membership_id: parsed.data.membershipId,
      amount: parsed.data.amount,
      currency: tenant?.currency_code,
      description: parsed.data.description,
    },
  });

  revalidatePath("/admin/payments");
  revalidatePath("/wallet");
  return { ok: true };
}

// ---------- Fund collections ----------
//
// Equipment money / referee money / pizza pool — admin defines a fund and
// picks WHICH members to charge. Each pick becomes a `ledger_transactions`
// debit row with reason_code='fund' and metadata.fund_id pointing back to
// the campaign. The picked members go into negative balance until they pay.
const createFundSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().optional(),
  amountPerMember: z.coerce.number().positive(),
  membershipIds: z.array(z.string().uuid()).min(1),
});

export async function createFundCollectionAction(formData: FormData) {
  const { session, membership } = await requireRole(["admin", "owner"]);
  const ids = formData.getAll("membershipIds").map(String);
  const parsed = createFundSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    amountPerMember: formData.get("amountPerMember"),
    membershipIds: ids,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const admin = createSupabaseServiceClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("currency_code")
    .eq("id", membership.tenant_id)
    .single();

  // Verify every chosen membership belongs to this tenant.
  const { data: validMemberships } = await admin
    .from("memberships")
    .select("id, tenant_id")
    .in("id", parsed.data.membershipIds)
    .eq("tenant_id", membership.tenant_id)
    .neq("status", "archived");
  const validIds = (validMemberships ?? []).map((m: { id: string }) => m.id);
  if (validIds.length === 0) return { error: "No valid members selected." };

  const { data: fund, error: fundErr } = await admin
    .from("tenant_fund_collections")
    .insert({
      tenant_id: membership.tenant_id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      amount_per_member: parsed.data.amountPerMember.toString(),
      currency_code: tenant?.currency_code ?? "GBP",
      created_by_membership_id: membership.id,
    })
    .select("id")
    .single();
  if (fundErr || !fund) return { error: fundErr?.message ?? "Failed to create fund." };

  const now = new Date().toISOString();
  const ledgerRows = validIds.map((mid) => ({
    tenant_id: membership.tenant_id,
    membership_id: mid,
    transaction_type: "adjustment" as const,
    direction: "debit" as const,
    amount: parsed.data.amountPerMember.toString(),
    currency_code: tenant?.currency_code ?? "GBP",
    description: `Fund: ${parsed.data.name}`,
    reason_code: "fund",
    recorded_by_membership_id: membership.id,
    recorded_at: now,
    metadata: { fund_id: fund.id, fund_name: parsed.data.name },
  }));
  const { error: ledgerErr } = await admin
    .from("ledger_transactions")
    .insert(ledgerRows);
  if (ledgerErr) return { error: ledgerErr.message };

  await notifyMany(
    validIds.map((mid) => ({ tenantId: membership.tenant_id, membershipId: mid })),
    {
      notificationType: "wallet_updated",
      title: `New charge: ${parsed.data.name}`,
      body: `Admin added a ${parsed.data.amountPerMember} ${tenant?.currency_code ?? ""} debit to your wallet.`,
      payload: { fund_id: fund.id, kind: "fund_charge" },
    },
  );

  await audit({
    tenantId: membership.tenant_id,
    actorAccountId: session.account.id,
    actorMembershipId: membership.id,
    entityType: "tenant_fund_collection",
    entityId: fund.id,
    actionType: "create_fund_collection",
    after: {
      name: parsed.data.name,
      amount_per_member: parsed.data.amountPerMember,
      member_count: validIds.length,
    },
  });

  revalidatePath("/admin/payments");
  revalidatePath("/wallet");
  return { ok: true, fundId: fund.id, charged: validIds.length };
}

// ---------- Payment reminder (overdue notify) ----------
const reminderSchema = z.object({ membershipId: z.string().uuid() });

export async function sendPaymentReminderAction(formData: FormData) {
  const { session, membership } = await requireRole(["admin", "owner"]);
  const parsed = reminderSchema.safeParse({
    membershipId: formData.get("membershipId"),
  });
  if (!parsed.success) return { error: "Invalid input" };
  const admin = createSupabaseServiceClient();
  const { data: target } = await admin
    .from("memberships")
    .select("tenant_id")
    .eq("id", parsed.data.membershipId)
    .maybeSingle();
  if (!target || target.tenant_id !== membership.tenant_id) return { error: "Forbidden" };

  // Compute current balance to include in the reminder body.
  const { data: txs } = await admin
    .from("ledger_transactions")
    .select("amount, direction, currency_code")
    .eq("tenant_id", membership.tenant_id)
    .eq("membership_id", parsed.data.membershipId);
  let balance = 0;
  let currency = "GBP";
  for (const t of txs ?? []) {
    const amt = Number(t.amount);
    balance += t.direction === "credit" ? amt : -amt;
    currency = t.currency_code ?? currency;
  }
  if (balance >= 0) return { error: "This member is not in debt." };

  await notify({
    tenantId: membership.tenant_id,
    membershipId: parsed.data.membershipId,
    notificationType: "wallet_updated",
    title: "Payment reminder",
    body: `You owe ${Math.abs(balance).toFixed(2)} ${currency}. Please settle with the admin.`,
    payload: { kind: "payment_reminder", balance },
  });

  await audit({
    tenantId: membership.tenant_id,
    actorAccountId: session.account.id,
    actorMembershipId: membership.id,
    entityType: "membership",
    entityId: parsed.data.membershipId,
    actionType: "send_payment_reminder",
    metadata: { balance, currency },
  });

  revalidatePath("/admin/payments");
  return { ok: true };
}

// ---------- Existing-user picker (admin adds an already-registered player) ----------
const addExistingSchema = z.object({ accountId: z.string().uuid() });

export async function addExistingPlayerToTenantAction(formData: FormData) {
  const { session, membership } = await requireRole(["admin", "owner"]);
  const parsed = addExistingSchema.safeParse({
    accountId: formData.get("accountId"),
  });
  if (!parsed.success) return { error: "Invalid input" };
  const admin = createSupabaseServiceClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id, email, is_system_owner")
    .eq("id", parsed.data.accountId)
    .maybeSingle();
  if (!account || account.is_system_owner) {
    return { error: "Account not eligible." };
  }
  const { data: person } = await admin
    .from("persons")
    .select("id")
    .eq("primary_account_id", account.id)
    .maybeSingle();
  if (!person) return { error: "Person not found." };

  // Refuse duplicate membership.
  const { data: existing } = await admin
    .from("memberships")
    .select("id, status")
    .eq("tenant_id", membership.tenant_id)
    .eq("person_id", person.id)
    .maybeSingle();
  if (existing) {
    if (existing.status === "archived") {
      // Restore in place.
      await admin
        .from("memberships")
        .update({ status: "active", restored_at: new Date().toISOString() })
        .eq("id", existing.id);
    } else {
      return { error: "Already a member of this tenant." };
    }
  } else {
    await admin.from("memberships").insert({
      tenant_id: membership.tenant_id,
      person_id: person.id,
      role: "user",
      status: "active",
      stats_visibility: "included",
      joined_at: new Date().toISOString(),
      is_guest_membership: false,
      created_by_membership_id: membership.id,
    });
  }

  await audit({
    tenantId: membership.tenant_id,
    actorAccountId: session.account.id,
    actorMembershipId: membership.id,
    entityType: "membership",
    entityId: person.id,
    actionType: "add_existing_player",
    metadata: { account_email: account.email },
  });

  revalidatePath("/admin/members");
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
