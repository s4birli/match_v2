import { createSupabaseServiceClient } from "@/lib/supabase/server";

/**
 * Repository helpers. They use the SERVICE client (RLS bypass) and rely on
 * the application layer to enforce tenant + role checks before reading.
 *
 * The privacy guarantees from .claude/CLAUDE.md still apply:
 *  - never return raw teammate_ratings rows
 *  - never return raw player_of_match_votes rows
 *  - only safe aggregate views are returned to clients
 */
export const db = () => createSupabaseServiceClient();

export async function getTenantBySlug(slug: string) {
  const { data } = await db().from("tenants").select("*").eq("slug", slug).maybeSingle();
  return data;
}

export async function getTenantById(id: string) {
  const { data } = await db().from("tenants").select("*").eq("id", id).maybeSingle();
  return data;
}

export async function listTenantMembers(tenantId: string) {
  const { data } = await db()
    .from("memberships")
    .select("*, person:persons(*)")
    .eq("tenant_id", tenantId)
    .neq("status", "archived")
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function listArchivedMembers(tenantId: string) {
  const { data } = await db()
    .from("memberships")
    .select("*, person:persons(*)")
    .eq("tenant_id", tenantId)
    .eq("status", "archived");
  return data ?? [];
}

export async function listVenues(tenantId: string) {
  const { data } = await db()
    .from("venues")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name");
  return data ?? [];
}

export async function listMatches(tenantId: string, opts?: { upcoming?: boolean }) {
  let q = db().from("matches").select("*, venue:venues(*)").eq("tenant_id", tenantId);
  if (opts?.upcoming) {
    q = q.in("status", ["draft", "open", "teams_ready"]).order("starts_at", { ascending: true });
  } else {
    q = q.order("starts_at", { ascending: false });
  }
  const { data } = await q;
  return data ?? [];
}

export async function getMatchFull(matchId: string) {
  const supabase = db();
  const { data: match } = await supabase
    .from("matches")
    .select("*, venue:venues(*)")
    .eq("id", matchId)
    .maybeSingle();
  if (!match) return null;
  const [{ data: teams }, { data: participants }, { data: result }, { data: poll }] =
    await Promise.all([
      supabase.from("match_teams").select("*").eq("match_id", matchId).order("sort_order"),
      supabase
        .from("match_participants")
        .select("*, membership:memberships(*, person:persons(*))")
        .eq("match_id", matchId),
      supabase.from("match_results").select("*").eq("match_id", matchId).maybeSingle(),
      supabase
        .from("pre_match_polls")
        .select("*, options:pre_match_poll_options(*)")
        .eq("match_id", matchId)
        .maybeSingle(),
    ]);

  let pollVotes: Array<{ option_id: string; count: number }> = [];
  if (poll) {
    const { data: votes } = await supabase
      .from("pre_match_poll_votes")
      .select("option_id")
      .eq("poll_id", poll.id);
    const counts = new Map<string, number>();
    (votes ?? []).forEach((v: { option_id: string }) =>
      counts.set(v.option_id, (counts.get(v.option_id) ?? 0) + 1),
    );
    pollVotes = Array.from(counts, ([option_id, count]) => ({ option_id, count }));
  }

  return { match, teams: teams ?? [], participants: participants ?? [], result, poll, pollVotes };
}

export async function getWalletBalance(tenantId: string, membershipId: string) {
  const { data } = await db()
    .from("ledger_transactions")
    .select("amount, direction, currency_code")
    .eq("tenant_id", tenantId)
    .eq("membership_id", membershipId);
  let balance = 0;
  let currency = "GBP";
  for (const t of data ?? []) {
    const amt = Number(t.amount);
    if (t.direction === "credit") balance += amt;
    else balance -= amt;
    currency = t.currency_code ?? currency;
  }
  return { balance, currency };
}

export async function listLedgerForMembership(tenantId: string, membershipId: string, limit = 50) {
  const { data } = await db()
    .from("ledger_transactions")
    .select("*, match:matches(title, starts_at)")
    .eq("tenant_id", tenantId)
    .eq("membership_id", membershipId)
    .order("recorded_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function getMemberStats(tenantId: string, membershipId: string) {
  const { data } = await db()
    .from("safe_member_stats")
    .select("*")
    .eq("tenant_id", tenantId)
    .eq("membership_id", membershipId)
    .maybeSingle();
  return data;
}

export async function getLeaderboard(tenantId: string) {
  const { data } = await db()
    .from("safe_member_stats")
    .select("*, membership:memberships(*, person:persons(*))")
    .eq("tenant_id", tenantId);
  return data ?? [];
}

export async function listNotifications(membershipId: string, limit = 30) {
  const { data } = await db()
    .from("notifications")
    .select("*")
    .eq("membership_id", membershipId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function listPositionPreferences(membershipId: string) {
  const { data } = await db()
    .from("position_preferences")
    .select("*")
    .eq("membership_id", membershipId)
    .order("priority_rank");
  return data ?? [];
}
