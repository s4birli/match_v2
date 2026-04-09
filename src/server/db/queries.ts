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

/**
 * Aggregate-only post-match insights for the public match detail page.
 * Returns:
 *   - perPlayerAverages: Map<membership_id, { avg, raters }> — avg teammate
 *     rating each player received in this match. Privacy rule: only the
 *     average + the count of raters is exposed, never the individual rows
 *     or the rater identities.
 *   - motm: { membershipId, votes } | null — the membership_id with the
 *     highest player_of_match_votes count, and the count itself. Ties
 *     resolved by the first encountered.
 *
 * Both queries use the SERVICE client and bypass RLS, but only return
 * privacy-safe aggregates so the application layer can hand them straight
 * to the public match page (anyone in the tenant can see them — that's
 * the product rule from CLAUDE.md, "everyone sees match outcomes, MOTM,
 * and per-player averages, but never who voted for whom").
 */
export async function getMatchAggregateInsights(matchId: string): Promise<{
  perPlayerAverages: Map<string, { avg: number; raters: number }>;
  motm: { membershipId: string; votes: number } | null;
}> {
  const supabase = db();
  const [{ data: ratings }, { data: motmVotes }] = await Promise.all([
    supabase
      .from("teammate_ratings")
      .select("target_membership_id, rating_value")
      .eq("match_id", matchId)
      .eq("is_invalidated", false),
    supabase
      .from("player_of_match_votes")
      .select("target_membership_id")
      .eq("match_id", matchId),
  ]);

  // Per-player average (running total + count, no per-rater retention).
  const totals = new Map<string, { sum: number; n: number }>();
  for (const row of ratings ?? []) {
    const cur = totals.get(row.target_membership_id) ?? { sum: 0, n: 0 };
    cur.sum += Number(row.rating_value) || 0;
    cur.n += 1;
    totals.set(row.target_membership_id, cur);
  }
  const perPlayerAverages = new Map<string, { avg: number; raters: number }>();
  for (const [id, t] of totals) {
    perPlayerAverages.set(id, {
      avg: t.n > 0 ? t.sum / t.n : 0,
      raters: t.n,
    });
  }

  // MOTM = membership_id with the highest vote count.
  const voteCounts = new Map<string, number>();
  for (const v of motmVotes ?? []) {
    voteCounts.set(v.target_membership_id, (voteCounts.get(v.target_membership_id) ?? 0) + 1);
  }
  let motm: { membershipId: string; votes: number } | null = null;
  for (const [id, votes] of voteCounts) {
    if (!motm || votes > motm.votes) {
      motm = { membershipId: id, votes };
    }
  }

  return { perPlayerAverages, motm };
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

/**
 * Pair / chemistry analytics: count how often each PAIR of memberships
 * has played on the same team in COMPLETED matches, and how often that
 * pair won together. Used by /admin/stats and /admin/dashboard insight
 * panels for admin and assistant_admin.
 */
export async function getPairChemistry(tenantId: string, limit = 8) {
  const supabase = db();
  // Pull every team-assigned, played participant joined to its match result
  // and the membership display name. We aggregate in JS rather than SQL to
  // keep the query simple and avoid materialised views.
  const { data: rows } = await supabase
    .from("match_participants")
    .select(
      "match_id, team_id, membership_id, attendance_status, membership:memberships(id, person:persons(display_name))",
    )
    .eq("tenant_id", tenantId)
    .eq("attendance_status", "played");
  if (!rows || rows.length === 0) return [];

  const { data: results } = await supabase
    .from("match_results")
    .select("match_id, winner_team_id, is_draw")
    .eq("tenant_id", tenantId);
  const resultByMatch = new Map(
    (results ?? []).map((r) => [r.match_id, r as { winner_team_id: string | null; is_draw: boolean }]),
  );

  // Group played participants by (match_id, team_id).
  type Row = {
    match_id: string;
    team_id: string | null;
    membership_id: string;
    membership?: unknown;
  };
  const displayNameOf = (m: unknown): string => {
    // Supabase nested-select can return either an object or a 1-element
    // array depending on the join shape. Handle both.
    const obj = Array.isArray(m) ? m[0] : (m as { person?: unknown } | undefined);
    const person = (obj as { person?: unknown } | undefined)?.person;
    const personObj = Array.isArray(person) ? person[0] : person;
    return (personObj as { display_name?: string } | undefined)?.display_name ?? "Player";
  };
  const teamRosters = new Map<string, Row[]>();
  for (const row of rows as unknown as Row[]) {
    if (!row.team_id) continue;
    const key = `${row.match_id}::${row.team_id}`;
    const arr = teamRosters.get(key) ?? [];
    arr.push(row);
    teamRosters.set(key, arr);
  }

  type Pair = {
    a: string;
    b: string;
    aName: string;
    bName: string;
    matches: number;
    wins: number;
    draws: number;
    losses: number;
  };
  const pairs = new Map<string, Pair>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}::${b}` : `${b}::${a}`);

  for (const [key, roster] of teamRosters) {
    if (roster.length < 2) continue;
    const [matchId, teamId] = key.split("::");
    const result = resultByMatch.get(matchId);
    let outcome: "win" | "draw" | "loss" = "loss";
    if (result?.is_draw) outcome = "draw";
    else if (result?.winner_team_id === teamId) outcome = "win";

    for (let i = 0; i < roster.length; i++) {
      for (let j = i + 1; j < roster.length; j++) {
        const a = roster[i];
        const b = roster[j];
        const k = pairKey(a.membership_id, b.membership_id);
        let entry = pairs.get(k);
        if (!entry) {
          entry = {
            a: a.membership_id,
            b: b.membership_id,
            aName: displayNameOf(a.membership),
            bName: displayNameOf(b.membership),
            matches: 0,
            wins: 0,
            draws: 0,
            losses: 0,
          };
          pairs.set(k, entry);
        }
        entry.matches += 1;
        if (outcome === "win") entry.wins += 1;
        else if (outcome === "draw") entry.draws += 1;
        else entry.losses += 1;
      }
    }
  }

  // Sort: most matches together, then highest win rate.
  return Array.from(pairs.values())
    .filter((p) => p.matches >= 2)
    .map((p) => ({
      ...p,
      win_rate: p.matches > 0 ? Math.round((p.wins / p.matches) * 100) : 0,
    }))
    .sort((a, b) => b.matches - a.matches || b.win_rate - a.win_rate)
    .slice(0, limit);
}

/**
 * Members with a negative wallet balance — used by the admin overdue list.
 */
export async function listOverdueMembers(tenantId: string) {
  const supabase = db();
  const { data: rows } = await supabase
    .from("ledger_transactions")
    .select(
      "membership_id, amount, direction, currency_code, membership:memberships(id, status, person:persons(display_name))",
    )
    .eq("tenant_id", tenantId);
  const byMember = new Map<
    string,
    { balance: number; currency: string; displayName: string; status: string }
  >();
  for (const row of rows ?? []) {
    const key = row.membership_id;
    const cur = byMember.get(key) ?? {
      balance: 0,
      currency: row.currency_code,
      displayName:
        (row as { membership?: { person?: { display_name?: string } } }).membership?.person?.display_name ??
        "Player",
      status:
        (row as { membership?: { status?: string } }).membership?.status ?? "active",
    };
    cur.balance += (row.direction === "credit" ? 1 : -1) * Number(row.amount);
    cur.currency = row.currency_code;
    byMember.set(key, cur);
  }
  return Array.from(byMember, ([membership_id, v]) => ({ membership_id, ...v }))
    .filter((r) => r.balance < 0 && r.status !== "archived")
    .sort((a, b) => a.balance - b.balance);
}

/** All non-archived fund campaigns for a tenant, plus per-fund collected amount. */
export async function listFundCollections(tenantId: string) {
  const supabase = db();
  const { data: funds } = await supabase
    .from("tenant_fund_collections")
    .select("*")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false });
  if (!funds || funds.length === 0) return [];
  const fundIds = funds.map((f) => f.id);
  // Sum the related ledger debits per fund_id from metadata.
  const { data: txs } = await supabase
    .from("ledger_transactions")
    .select("metadata, amount, direction")
    .eq("tenant_id", tenantId)
    .eq("reason_code", "fund");
  const byFund = new Map<string, { charged: number; charged_count: number }>();
  for (const t of txs ?? []) {
    const fundId = (t.metadata as { fund_id?: string } | null)?.fund_id;
    if (!fundId || !fundIds.includes(fundId)) continue;
    const cur = byFund.get(fundId) ?? { charged: 0, charged_count: 0 };
    cur.charged += Number(t.amount);
    cur.charged_count += 1;
    byFund.set(fundId, cur);
  }
  return funds.map((f) => ({
    ...f,
    total_charged: byFund.get(f.id)?.charged ?? 0,
    charged_count: byFund.get(f.id)?.charged_count ?? 0,
  }));
}

/** Account picker for /admin/members "Add existing player" — accounts not in this tenant. */
export async function listAccountsNotInTenant(tenantId: string) {
  const supabase = db();
  const [{ data: accounts }, { data: existing }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, email, person:persons(id, display_name)")
      .eq("is_system_owner", false)
      .order("email"),
    supabase
      .from("memberships")
      .select("person_id")
      .eq("tenant_id", tenantId)
      .neq("status", "archived"),
  ]);
  const inTenant = new Set((existing ?? []).map((m) => m.person_id));
  return (accounts ?? [])
    .filter((a) => {
      const personId = (a as { person?: { id?: string } }).person?.id;
      return personId && !inTenant.has(personId);
    })
    .map((a) => ({
      id: a.id as string,
      email: a.email as string,
      display_name:
        (a as { person?: { display_name?: string } }).person?.display_name ?? a.email,
    }));
}

export async function listPositionPreferences(membershipId: string) {
  const { data } = await db()
    .from("position_preferences")
    .select("*")
    .eq("membership_id", membershipId)
    .order("priority_rank");
  return data ?? [];
}
