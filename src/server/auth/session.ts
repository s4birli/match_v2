import { cache } from "react";
import { createSupabaseServerClient, createSupabaseServiceClient } from "@/lib/supabase/server";
import type { Account, Membership, Person, Role, Tenant } from "@/lib/supabase/types";

export interface SessionContext {
  authUserId: string;
  account: Account;
  person: Person;
  memberships: Array<Membership & { tenant: Tenant }>;
  activeMembership: (Membership & { tenant: Tenant }) | null;
  /** True iff this account is a system owner. System owners belong to NO group. */
  isSystemOwner: boolean;
}

const ACTIVE_TENANT_COOKIE = "active_tenant";

export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Use service client to bypass RLS for the session resolution itself.
  // We're only reading the rows that belong to *this* auth user.
  const admin = createSupabaseServiceClient();

  const { data: account } = await admin
    .from("accounts")
    .select("*")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!account) return null;

  const isSystemOwner = account.is_system_owner === true;

  const { data: person } = await admin
    .from("persons")
    .select("*")
    .eq("primary_account_id", account.id)
    .maybeSingle();

  // System owner: no person/membership lookup needed for menus.
  if (isSystemOwner) {
    return {
      authUserId: user.id,
      account,
      person:
        person ??
        ({
          id: "",
          primary_account_id: account.id,
          first_name: "System",
          last_name: "Owner",
          display_name: "System Owner",
          email: account.email,
          avatar_url: null,
          is_guest_profile: false,
        } as Person),
      memberships: [],
      activeMembership: null,
      isSystemOwner: true,
    };
  }

  if (!person) {
    return {
      authUserId: user.id,
      account,
      person: {
        id: "",
        primary_account_id: account.id,
        first_name: account.email.split("@")[0],
        last_name: null,
        display_name: account.email.split("@")[0],
        email: account.email,
        avatar_url: null,
        is_guest_profile: false,
      },
      memberships: [],
      activeMembership: null,
      isSystemOwner: false,
    };
  }

  const { data: membershipRows } = await admin
    .from("memberships")
    .select("*, tenant:tenants(*)")
    .eq("person_id", person.id)
    .neq("status", "archived")
    .order("created_at", { ascending: true });

  const memberships = (membershipRows ?? []) as Array<Membership & { tenant: Tenant }>;

  const cookieStore = await (await import("next/headers")).cookies();
  const activeTenantId = cookieStore.get(ACTIVE_TENANT_COOKIE)?.value;
  const activeMembership =
    memberships.find((m) => m.tenant_id === activeTenantId) ?? memberships[0] ?? null;

  return {
    authUserId: user.id,
    account,
    person,
    memberships,
    activeMembership,
    isSystemOwner: false,
  };
});

export async function requireSession(): Promise<SessionContext> {
  const session = await getSessionContext();
  if (!session) {
    const { redirect } = await import("next/navigation");
    redirect("/login");
  }
  return session as SessionContext;
}

export async function requireMembership(): Promise<{
  session: SessionContext;
  membership: Membership & { tenant: Tenant };
}> {
  const session = await requireSession();
  if (session.isSystemOwner) {
    const { redirect } = await import("next/navigation");
    redirect("/owner/dashboard");
  }
  if (!session.activeMembership) {
    const { redirect } = await import("next/navigation");
    redirect("/no-group");
  }
  return { session, membership: session.activeMembership as Membership & { tenant: Tenant } };
}

export async function requireRole(roles: Role[]): Promise<{
  session: SessionContext;
  membership: Membership & { tenant: Tenant };
}> {
  const session = await requireSession();
  // Special case: system owner.
  if (session.isSystemOwner) {
    if (roles.includes("owner")) {
      // For owner-only routes we just return the session; there is no membership.
      return {
        session,
        membership: null as unknown as Membership & { tenant: Tenant },
      };
    }
    const { redirect } = await import("next/navigation");
    redirect("/owner/dashboard");
  }

  if (!session.activeMembership) {
    const { redirect } = await import("next/navigation");
    redirect("/no-group");
  }
  const active = session.activeMembership as Membership & { tenant: Tenant };

  if (!roles.includes(active.role)) {
    const { redirect } = await import("next/navigation");
    redirect(landingForRole(active.role));
  }
  return { session, membership: active };
}

export function landingForRole(role: Role): string {
  if (role === "owner") return "/owner/dashboard";
  if (role === "admin") return "/admin/dashboard";
  if (role === "assistant_admin") return "/admin/dashboard";
  return "/dashboard";
}

/** Block system owners from non-owner pages. */
export async function requireNonOwner(): Promise<{
  session: SessionContext;
  membership: Membership & { tenant: Tenant };
}> {
  return requireMembership();
}

/**
 * USER-ONLY surface: pages like /dashboard, /matches, /wallet, /stats are
 * for regular players. Admins/assistants get bounced to their own
 * /admin/dashboard. Owners go to /owner/dashboard.
 *
 * `profile` and `notifications` are SHARED — they don't use this helper.
 */
export async function requireUserOnly(): Promise<{
  session: SessionContext;
  membership: Membership & { tenant: Tenant };
}> {
  const ctx = await requireMembership();
  if (ctx.membership.role === "admin" || ctx.membership.role === "assistant_admin") {
    const { redirect } = await import("next/navigation");
    redirect("/admin/dashboard");
  }
  return ctx;
}

export const ACTIVE_TENANT_COOKIE_NAME = ACTIVE_TENANT_COOKIE;
