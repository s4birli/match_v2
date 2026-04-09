import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Owner-scoped read helpers. These use the service-role client (RLS bypass)
 * and assume the caller has already verified `isSystemOwner` via requireRole.
 *
 * None of these helpers return raw teammate_ratings or player_of_match_votes
 * rows — owners still must not see individual private voting data.
 */
const db = () => createSupabaseServiceClient();

export async function listAllAccountsForOwner(): Promise<
  Array<{
    id: string;
    email: string;
    display_name: string | null;
    is_system_owner: boolean;
  }>
> {
  const supabase = db();
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, email, is_system_owner")
    .eq("is_system_owner", false)
    .order("email", { ascending: true });

  const rows = accounts ?? [];
  if (rows.length === 0) return [];

  const accountIds = rows.map((a) => a.id as string);
  const { data: persons } = await supabase
    .from("persons")
    .select("id, primary_account_id, display_name")
    .in("primary_account_id", accountIds);

  const nameByAccount = new Map<string, string>();
  for (const p of persons ?? []) {
    if (p.primary_account_id) {
      nameByAccount.set(p.primary_account_id as string, p.display_name as string);
    }
  }

  return rows.map((a) => ({
    id: a.id as string,
    email: a.email as string,
    display_name: nameByAccount.get(a.id as string) ?? null,
    is_system_owner: a.is_system_owner as boolean,
  }));
}

export async function listInvitesForTenant(tenantId: string): Promise<
  Array<{
    id: string;
    token: string;
    default_role: string;
    used_count: number;
    expires_at: string | null;
    is_active: boolean;
    created_at: string;
  }>
> {
  const { data } = await db()
    .from("tenant_invites")
    .select("id, token, default_role, used_count, expires_at, is_active, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });

  return (data ?? []).map((r) => ({
    id: r.id as string,
    token: r.token as string,
    default_role: r.default_role as string,
    used_count: (r.used_count as number) ?? 0,
    expires_at: (r.expires_at as string | null) ?? null,
    is_active: r.is_active as boolean,
    created_at: r.created_at as string,
  }));
}

const KNOWN_FEATURE_KEYS = [
  "push_notifications",
  "bilingual_ui",
  "stats_and_leaderboards",
] as const;

export async function listFeatureFlagsForTenant(
  tenantId: string,
): Promise<Array<{ feature_key: string; is_enabled: boolean }>> {
  const { data } = await db()
    .from("tenant_feature_flags")
    .select("feature_key, is_enabled")
    .eq("tenant_id", tenantId);

  const byKey = new Map<string, boolean>();
  for (const row of data ?? []) {
    byKey.set(row.feature_key as string, row.is_enabled as boolean);
  }

  return KNOWN_FEATURE_KEYS.map((key) => ({
    feature_key: key,
    is_enabled: byKey.get(key) ?? false,
  }));
}

export async function listAllArchivedMembers(): Promise<
  Array<{
    id: string;
    tenant_id: string;
    tenant_name: string;
    display_name: string;
    role: string;
    archived_at: string | null;
    archived_reason: string | null;
  }>
> {
  const { data } = await db()
    .from("memberships")
    .select(
      "id, tenant_id, role, archived_at, archived_reason, tenant:tenants(name), person:persons(display_name)",
    )
    .eq("status", "archived")
    .order("archived_at", { ascending: false });

  return (data ?? []).map((m) => {
    const tenant = m.tenant as { name?: string } | null;
    const person = m.person as { display_name?: string } | null;
    return {
      id: m.id as string,
      tenant_id: m.tenant_id as string,
      tenant_name: tenant?.name ?? "",
      display_name: person?.display_name ?? "",
      role: m.role as string,
      archived_at: (m.archived_at as string | null) ?? null,
      archived_reason: (m.archived_reason as string | null) ?? null,
    };
  });
}

export async function listAllLedgerForOwner(
  limit: number = 200,
): Promise<
  Array<{
    id: string;
    tenant_id: string;
    tenant_name: string;
    member_display_name: string;
    transaction_type: string;
    direction: string;
    amount: string;
    currency_code: string;
    description: string | null;
    recorded_at: string;
  }>
> {
  const cap = Math.min(Math.max(limit, 1), 200);
  // ledger_transactions has TWO FKs into memberships (membership_id and
  // recorded_by_membership_id). PostgREST refuses ambiguous joins — pin
  // the relationship to the explicit FK name.
  const { data, error } = await db()
    .from("ledger_transactions")
    .select(
      "id, tenant_id, transaction_type, direction, amount, currency_code, description, recorded_at, tenant:tenants(name), membership:memberships!ledger_transactions_membership_id_fkey(person:persons(display_name))",
    )
    .order("recorded_at", { ascending: false })
    .limit(cap);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[listAllLedgerForOwner]", error.message);
  }

  return (data ?? []).map((t) => {
    const tenant = t.tenant as { name?: string } | null;
    const membership = t.membership as
      | { person?: { display_name?: string } | null }
      | null;
    return {
      id: t.id as string,
      tenant_id: t.tenant_id as string,
      tenant_name: tenant?.name ?? "",
      member_display_name: membership?.person?.display_name ?? "",
      transaction_type: t.transaction_type as string,
      direction: t.direction as string,
      amount: String(t.amount),
      currency_code: t.currency_code as string,
      description: (t.description as string | null) ?? null,
      recorded_at: t.recorded_at as string,
    };
  });
}

export async function listTenantMembersForOwner(tenantId: string): Promise<
  Array<{
    membership_id: string;
    role: string;
    status: string;
    is_guest_membership: boolean;
    person_id: string;
    display_name: string;
    email: string | null;
    has_account: boolean;
  }>
> {
  const { data } = await db()
    .from("memberships")
    .select(
      "id, role, status, is_guest_membership, person_id, person:persons(id, display_name, email, primary_account_id)",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: true });

  return (data ?? []).map((m) => {
    const person = m.person as
      | {
          id?: string;
          display_name?: string;
          email?: string | null;
          primary_account_id?: string | null;
        }
      | null;
    return {
      membership_id: m.id as string,
      role: m.role as string,
      status: m.status as string,
      is_guest_membership: m.is_guest_membership as boolean,
      person_id: m.person_id as string,
      display_name: person?.display_name ?? "",
      email: person?.email ?? null,
      has_account: Boolean(person?.primary_account_id),
    };
  });
}
