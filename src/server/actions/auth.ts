"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import { ACTIVE_TENANT_COOKIE_NAME } from "@/server/auth/session";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2).max(80),
  inviteCode: z.string().optional().nullable(),
  inviteToken: z.string().optional().nullable(),
});

export async function loginAction(prevState: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Invalid input." };
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
    displayName: formData.get("displayName"),
    inviteCode: formData.get("inviteCode") || null,
    inviteToken: formData.get("inviteToken") || null,
  });
  if (!parsed.success) {
    return { error: "Please fill all fields correctly." };
  }
  const { email, password, displayName, inviteCode, inviteToken } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${process.env.APP_URL ?? "http://localhost:3737"}/login` },
  });
  if (signUpError) return { error: signUpError.message };
  const authUserId = signUpData.user?.id;
  if (!authUserId) return { error: "Sign-up failed." };

  // Create app rows via service client
  const admin = createSupabaseServiceClient();
  const { data: account, error: accountError } = await admin
    .from("accounts")
    .insert({ auth_user_id: authUserId, email, preferred_language: "en" })
    .select()
    .single();
  if (accountError) return { error: accountError.message };

  const { data: person, error: personError } = await admin
    .from("persons")
    .insert({
      primary_account_id: account.id,
      first_name: displayName.split(" ")[0],
      last_name: displayName.split(" ").slice(1).join(" ") || null,
      display_name: displayName,
      email,
      is_guest_profile: false,
    })
    .select()
    .single();
  if (personError) return { error: personError.message };

  // Optional: attach to a tenant via invite token / code
  let tenantToActivate: string | null = null;
  if (inviteToken) {
    const { data: invite } = await admin
      .from("tenant_invites")
      .select("*")
      .eq("token", inviteToken)
      .eq("is_active", true)
      .maybeSingle();
    if (invite) {
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
  } else if (inviteCode) {
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
  if (password.length < 8) return { error: "Password too short." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { success: true };
}

export async function joinWithCodeAction(prevState: unknown, formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  if (!code) return { error: "Invite code is required." };

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in first." };

  const admin = createSupabaseServiceClient();
  const { data: tenant } = await admin
    .from("tenants")
    .select("*")
    .eq("invite_code", code)
    .eq("invite_code_active", true)
    .maybeSingle();
  if (!tenant) return { error: "Invalid invite code." };

  const { data: account } = await admin
    .from("accounts")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!account) return { error: "Account not found." };
  const { data: person } = await admin
    .from("persons")
    .select("*")
    .eq("primary_account_id", account.id)
    .maybeSingle();
  if (!person) return { error: "Profile not found." };

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

export async function setLocaleAction(locale: "en" | "tr") {
  const cookieStore = await cookies();
  cookieStore.set("locale", locale, { path: "/" });
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
    .select("id, is_system_owner")
    .eq("auth_user_id", user.id)
    .maybeSingle();
  if (!account) return null;

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
  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TENANT_COOKIE_NAME, top.tenant_id, { path: "/" });
  return top.role;
}
