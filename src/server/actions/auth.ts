"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { ACTIVE_TENANT_COOKIE_NAME } from "@/server/auth/session";
import { formatDisplayName } from "@/lib/utils";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  inviteCode: z.string().optional().nullable(),
  inviteToken: z.string().optional().nullable(),
});

export async function loginAction(prevState: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "invalidInput" };
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: error.message };

  // Set active tenant cookie to first membership
  const role = await syncActiveTenantCookie();
  // Role-based landing
  if (role === "system_owner") redirect("/owner/dashboard");
  if (role === "admin" || role === "assistant_admin") redirect("/admin/dashboard");
  redirect("/dashboard");
}

export async function registerAction(prevState: unknown, formData: FormData) {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    inviteCode: formData.get("inviteCode") || null,
    inviteToken: formData.get("inviteToken") || null,
  });
  if (!parsed.success) {
    return { error: "fillAllFields" };
  }
  const { email, password, firstName, lastName, inviteCode, inviteToken } = parsed.data;
  // Public display name = "Mehmet Y." — first name + last initial.
  const displayName = formatDisplayName(firstName, lastName);

  const supabase = await createSupabaseServerClient();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${process.env.APP_URL ?? "http://localhost:3737"}/login` },
  });
  if (signUpError) return { error: signUpError.message };
  const authUserId = signUpData.user?.id;
  if (!authUserId) return { error: "signUpFailed" };

  // Create the account row first.
  const admin = createSupabaseServiceClient();
  const { data: account, error: accountError } = await admin
    .from("accounts")
    .insert({ auth_user_id: authUserId, email, preferred_language: "en" })
    .select()
    .single();
  if (accountError) return { error: accountError.message };

  // ─────────────────────────────────────────────────────────────────────
  // GUEST CONVERSION fast-path: if the invite token is a `claim_*` token,
  // do NOT create a new person/membership. Instead, find the existing
  // guest membership recorded against this token in audit_logs and re-link
  // it. All FKs (match_participants, ledger, ratings, MOTM votes) stay
  // valid because we're updating the same row IDs.
  // ─────────────────────────────────────────────────────────────────────
  let tenantToActivate: string | null = null;
  let person: { id: string; email: string | null } | null = null;
  let claimedExistingMembership = false;

  if (inviteToken && inviteToken.startsWith("claim_")) {
    const { data: invite } = await admin
      .from("tenant_invites")
      .select("*")
      .eq("token", inviteToken)
      .eq("is_active", true)
      .maybeSingle();
    if (invite) {
      const { data: claim } = await admin
        .from("audit_logs")
        .select("metadata")
        .eq("entity_type", "guest_conversion")
        .eq("action_type", "start_guest_conversion")
        .contains("metadata", { invite_token: inviteToken })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const md = claim?.metadata as
        | { claim_membership_id?: string; claim_person_id?: string; recipient_email?: string }
        | undefined;
      if (md?.claim_membership_id && md?.claim_person_id) {
        if (md.recipient_email && md.recipient_email !== email) {
          return {
            error: "inviteEmailMismatch",
            errorParams: { email: md.recipient_email } as Record<string, string | number>,
          };
        }

        // Re-link the EXISTING person row to the brand new account.
        const { data: updatedPerson, error: linkErr } = await admin
          .from("persons")
          .update({
            primary_account_id: account.id,
            first_name: firstName,
            last_name: lastName,
            display_name: displayName,
            email,
            is_guest_profile: false,
          })
          .eq("id", md.claim_person_id)
          .select("id, email")
          .single();
        if (linkErr) return { error: linkErr.message };
        person = updatedPerson;

        // Promote the membership in place — same row id, all FKs survive.
        await admin
          .from("memberships")
          .update({
            role: "user",
            is_guest_membership: false,
            status: "active",
          })
          .eq("id", md.claim_membership_id);

        // Audit + invite bookkeeping.
        await admin.from("person_account_links").insert({
          person_id: md.claim_person_id,
          account_id: account.id,
          link_type: "claimed_guest",
        });
        await admin.from("invite_consumptions").insert({
          tenant_invite_id: invite.id,
          account_id: account.id,
          person_id: md.claim_person_id,
          membership_id: md.claim_membership_id,
          source_type: "link",
          metadata: { converted_from_guest: true },
        });
        await admin
          .from("tenant_invites")
          .update({
            used_count: (invite.used_count ?? 0) + 1,
            is_active: false,
          })
          .eq("id", invite.id);
        await admin.from("audit_logs").insert({
          tenant_id: invite.tenant_id,
          actor_account_id: account.id,
          entity_type: "guest_conversion",
          entity_id: md.claim_membership_id,
          action_type: "complete_guest_conversion",
          metadata: { account_id: account.id },
        });

        tenantToActivate = invite.tenant_id;
        claimedExistingMembership = true;
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Standard path: brand-new person row for a brand-new player.
  // ─────────────────────────────────────────────────────────────────────
  if (!claimedExistingMembership) {
    const { data: newPerson, error: personError } = await admin
      .from("persons")
      .insert({
        primary_account_id: account.id,
        first_name: firstName,
        last_name: lastName,
        display_name: displayName,
        email,
        is_guest_profile: false,
      })
      .select()
      .single();
    if (personError) return { error: personError.message };
    person = newPerson;
  }

  // Standard tenant invite token (non-claim) — attach via membership insert.
  if (!claimedExistingMembership && inviteToken) {
    const { data: invite } = await admin
      .from("tenant_invites")
      .select("*")
      .eq("token", inviteToken)
      .eq("is_active", true)
      .maybeSingle();
    if (invite && person) {
      const { data: m } = await admin
        .from("memberships")
        .insert({
          tenant_id: invite.tenant_id,
          person_id: person.id,
          role: invite.default_role,
          status: "active",
          stats_visibility: "included",
          joined_at: new Date().toISOString(),
          is_guest_membership: false,
        })
        .select()
        .single();
      tenantToActivate = invite.tenant_id;
      await admin.from("invite_consumptions").insert({
        tenant_invite_id: invite.id,
        account_id: account.id,
        person_id: person.id,
        membership_id: m?.id,
        source_type: "link",
      });
      await admin
        .from("tenant_invites")
        .update({ used_count: (invite.used_count ?? 0) + 1 })
        .eq("id", invite.id);
    }
  } else if (inviteCode && person) {
    const { data: tenant } = await admin
      .from("tenants")
      .select("*")
      .eq("invite_code", inviteCode)
      .eq("invite_code_active", true)
      .maybeSingle();
    if (tenant) {
      await admin.from("memberships").insert({
        tenant_id: tenant.id,
        person_id: person.id,
        role: "user",
        status: "active",
        stats_visibility: "included",
        joined_at: new Date().toISOString(),
        is_guest_membership: false,
      });
      tenantToActivate = tenant.id;
    }
  }

  if (tenantToActivate) {
    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_TENANT_COOKIE_NAME, tenantToActivate, { path: "/" });
  }

  // Auto-login for the brand new account so the user lands inside the app.
  await supabase.auth.signInWithPassword({ email, password });
  redirect("/dashboard");
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  // Clear the locale cookie so the next user on this device starts from
  // their own account.preferred_language (or browser header).
  try {
    const cookieStore = await cookies();
    cookieStore.delete("locale");
    cookieStore.delete(ACTIVE_TENANT_COOKIE_NAME);
  } catch {
    // ignore
  }
  redirect("/login");
}

export async function forgotPasswordAction(prevState: unknown, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.APP_URL ?? "http://localhost:3737"}/reset-password`,
  });
  if (error) return { error: error.message };
  return { success: true };
}

export async function resetPasswordAction(prevState: unknown, formData: FormData) {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) return { error: "passwordTooShort" };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { success: true };
}

export async function joinWithCodeAction(prevState: unknown, formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "inviteCodeRequired" };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "signInFirst" };

  const admin = createSupabaseServiceClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("*")
    .eq("invite_code", code)
    .eq("invite_code_active", true)
    .maybeSingle();
  if (!tenant) return { error: "invalidInviteCode" };

  const { data: account } = await admin
    .from("accounts")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!account) return { error: "accountNotFound" };
  const { data: person } = await admin
    .from("persons")
    .select("*")
    .eq("primary_account_id", account.id)
    .maybeSingle();
  if (!person) return { error: "profileNotFound" };

  const { data: existing } = await admin
    .from("memberships")
    .select("id")
    .eq("tenant_id", tenant.id)
    .eq("person_id", person.id)
    .maybeSingle();
  if (!existing) {
    await admin.from("memberships").insert({
      tenant_id: tenant.id,
      person_id: person.id,
      role: "user",
      status: "active",
      stats_visibility: "included",
      joined_at: new Date().toISOString(),
      is_guest_membership: false,
    });
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TENANT_COOKIE_NAME, tenant.id, { path: "/" });
  redirect("/dashboard");
}

export async function switchActiveTenantAction(tenantId: string) {
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TENANT_COOKIE_NAME, tenantId, { path: "/" });
  revalidatePath("/", "layout");
}

export async function setThemeAction(theme: "light" | "dark" | "system") {
  const cookieStore = await cookies();
  cookieStore.set("theme", theme, { path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/", "layout");
}

export async function setLocaleAction(locale: "en" | "tr" | "es") {
  const cookieStore = await cookies();
  cookieStore.set("locale", locale, { path: "/" });

  // Persist the choice on the account row when the user is logged in, so the
  // preference survives across sessions / devices.
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const admin = createSupabaseServiceClient();
      await admin
        .from("accounts")
        .update({ preferred_language: locale })
        .eq("auth_user_id", user.id);
    }
  } catch {
    // Anonymous user → cookie-only is fine.
  }

  revalidatePath("/", "layout");
}

async function syncActiveTenantCookie(): Promise<string | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const admin = createSupabaseServiceClient();
  const { data: account } = await admin
    .from("accounts")
    .select("id, is_system_owner, preferred_language")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!account) return null;

  // Always overwrite the locale cookie from the account on a fresh login.
  // The browser may have a stale cookie from a previous user on the same
  // device — we want every login to honour THIS user's saved preference.
  const cookieStore = await cookies();
  if (
    account.preferred_language === "tr" ||
    account.preferred_language === "en" ||
    account.preferred_language === "es"
  ) {
    cookieStore.set("locale", account.preferred_language, { path: "/" });
  }

  // System owners do NOT belong to any group, so they get no tenant cookie.
  if (account.is_system_owner) return "system_owner";

  const { data: person } = await admin
    .from("persons")
    .select("id")
    .eq("primary_account_id", account.id)
    .maybeSingle();
  if (!person) return null;
  // Prefer the highest-privilege membership for landing redirect.
  const { data: memberships } = await admin
    .from("memberships")
    .select("tenant_id, role")
    .eq("person_id", person.id)
    .neq("status", "archived")
    .order("created_at", { ascending: true });
  if (!memberships || memberships.length === 0) return null;
  const order: Record<string, number> = {
    admin: 1,
    assistant_admin: 2,
    user: 3,
    guest: 4,
  };
  const sorted = [...memberships].sort(
    (a, b) => (order[a.role] ?? 99) - (order[b.role] ?? 99),
  );
  const top = sorted[0];
  cookieStore.set(ACTIVE_TENANT_COOKIE_NAME, top.tenant_id, { path: "/" });
  return top.role;
}
