import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { notifyMany } from "@/server/notifications/notify";
import { audit } from "@/server/audit/log";

/**
 * Multi-job cron endpoint, protected by `Authorization: Bearer <CRON_SECRET>`.
 *
 * Three jobs run on every invocation (idempotent):
 *
 *  1. rating-lock-sweep
 *     Mark teammate_ratings + player_of_match_votes whose editable_until has
 *     elapsed as locked. The user-facing actions also reject late submits,
 *     but the sweep makes the locked state queryable.
 *
 *  2. match-starting-soon
 *     Find matches that kick off in the next 60–65 minutes (open or
 *     teams_ready) and emit a `match_starting_soon` notification to every
 *     confirmed/checked_in/played participant exactly once. We dedupe by
 *     audit_logs row.
 *
 *  3. guest-eligibility
 *     Flag guests with 3+ consecutive played matches via audit_logs entries
 *     so the admin /admin/members page can surface a "promote" hint. We do
 *     NOT auto-promote — admin must confirm (CLAUDE.md product rule).
 *
 * Hit it with:
 *   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3737/api/cron
 */
export async function GET(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createSupabaseServiceClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const out: Record<string, unknown> = {};

  // ── 1. Rating lock sweep ─────────────────────────────────────────────
  const { data: rrLocked } = await admin
    .from("teammate_ratings")
    .update({ locked_at: nowIso })
    .lt("editable_until", nowIso)
    .is("locked_at", null)
    .select("id");
  const { data: pomLocked } = await admin
    .from("player_of_match_votes")
    .update({ locked_at: nowIso })
    .lt("editable_until", nowIso)
    .is("locked_at", null)
    .select("id");
  out.rating_lock_sweep = {
    teammate_ratings_locked: rrLocked?.length ?? 0,
    motm_votes_locked: pomLocked?.length ?? 0,
  };

  // ── 2. Match starting soon ───────────────────────────────────────────
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  const inSeventyFive = new Date(now.getTime() + 75 * 60 * 1000).toISOString();
  const { data: upcoming } = await admin
    .from("matches")
    .select("id, tenant_id, title, starts_at, status")
    .in("status", ["open", "teams_ready"])
    .gte("starts_at", inOneHour)
    .lte("starts_at", inSeventyFive);

  let notified = 0;
  for (const m of upcoming ?? []) {
    // Skip if we've already notified for this match.
    const { data: prior } = await admin
      .from("audit_logs")
      .select("id")
      .eq("entity_type", "match")
      .eq("entity_id", m.id)
      .eq("action_type", "cron_match_starting_soon")
      .limit(1)
      .maybeSingle();
    if (prior) continue;

    const { data: parts } = await admin
      .from("match_participants")
      .select("membership_id, attendance_status")
      .eq("match_id", m.id)
      .in("attendance_status", ["confirmed", "checked_in", "played"]);
    const recipients = (parts ?? []).map((p) => ({
      tenantId: m.tenant_id,
      membershipId: p.membership_id,
    }));
    if (recipients.length > 0) {
      await notifyMany(recipients, {
        notificationType: "match_starting_soon",
        title: "Match starts in 1 hour",
        body: m.title ?? "Your group's next match is about to start.",
        payload: { matchId: m.id, kind: "match_starting_soon" },
      });
      notified += recipients.length;
    }
    await audit({
      tenantId: m.tenant_id,
      entityType: "match",
      entityId: m.id,
      actionType: "cron_match_starting_soon",
      metadata: { recipients: recipients.length },
    });
  }
  out.match_starting_soon = {
    matches_processed: upcoming?.length ?? 0,
    players_notified: notified,
  };

  // ── 3. Guest eligibility ──────────────────────────────────────────────
  // A guest is eligible for the main squad once they have 3+ played matches.
  // We log eligibility once per guest so the admin UI can surface it.
  const { data: guests } = await admin
    .from("memberships")
    .select("id, tenant_id, person_id")
    .eq("is_guest_membership", true)
    .neq("status", "archived");
  let flagged = 0;
  for (const g of guests ?? []) {
    const { count: playedCount } = await admin
      .from("match_participants")
      .select("id", { count: "exact", head: true })
      .eq("membership_id", g.id)
      .eq("attendance_status", "played");
    if ((playedCount ?? 0) < 3) continue;

    const { data: prior } = await admin
      .from("audit_logs")
      .select("id")
      .eq("entity_type", "membership")
      .eq("entity_id", g.id)
      .eq("action_type", "cron_guest_eligible")
      .limit(1)
      .maybeSingle();
    if (prior) continue;

    await audit({
      tenantId: g.tenant_id,
      entityType: "membership",
      entityId: g.id,
      actionType: "cron_guest_eligible",
      metadata: { played_count: playedCount },
    });
    flagged += 1;
  }
  out.guest_eligibility = { flagged };

  return NextResponse.json({ ok: true, ranAt: nowIso, jobs: out });
}
