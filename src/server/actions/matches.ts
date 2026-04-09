"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireMembership, requireRole } from "@/server/auth/session";
import { audit } from "@/server/audit/log";
import { notifyMany } from "@/server/notifications/notify";

const RATING_EDIT_WINDOW_MS = 60 * 1000;

// ---------- Attendance ----------
//
// Product rule (per CLAUDE.md + user clarification):
//   Admins decide WHO plays. A regular user can only:
//     - pull themselves to RESERVE
//     - DECLINE
//   They cannot self-confirm. If they were never added as a participant by
//   the admin, they cannot self-add either: a player who is not invited has
//   nothing to opt out of.
const attendanceSchema = z.object({
  matchId: z.string().uuid(),
  status: z.enum(["declined", "reserve"]),
});

export async function setMyAttendanceAction(formData: FormData) {
  const parsed = attendanceSchema.safeParse({
    matchId: formData.get("matchId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: "invalidInput" };
  const { membership } = await requireMembership();
  const admin = createSupabaseServiceClient();

  const { data: existing } = await admin
    .from("match_participants")
    .select("id, tenant_id")
    .eq("match_id", parsed.data.matchId)
    .eq("membership_id", membership.id)
    .maybeSingle();

  if (!existing) {
    return { error: "notOnMatch" };
  }
  if (existing.tenant_id !== membership.tenant_id) return { error: "forbidden" };

  await admin
    .from("match_participants")
    .update({
      attendance_status: parsed.data.status,
      attendance_updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  revalidatePath(`/matches/${parsed.data.matchId}`);
  revalidatePath("/dashboard");
  revalidatePath("/matches");
  return { ok: true };
}

// ---------- Pre-match poll vote ----------
const pollVoteSchema = z.object({
  matchId: z.string().uuid(),
  optionId: z.string().uuid(),
});

export async function castPollVoteAction(formData: FormData) {
  const parsed = pollVoteSchema.safeParse({
    matchId: formData.get("matchId"),
    optionId: formData.get("optionId"),
  });
  if (!parsed.success) return { error: "invalidInput" };
  const { membership } = await requireMembership();
  const admin = createSupabaseServiceClient();

  const { data: poll } = await admin
    .from("pre_match_polls")
    .select("id, tenant_id, status")
    .eq("match_id", parsed.data.matchId)
    .maybeSingle();
  if (!poll || poll.tenant_id !== membership.tenant_id) return { error: "forbidden" };
  if (poll.status === "closed") return { error: "pollClosed" };

  // Voting is gated until BOTH teams are fully filled — predicting a winner
  // before the rosters are set is meaningless.
  const { data: match } = await admin
    .from("matches")
    .select("players_per_team, status")
    .eq("id", parsed.data.matchId)
    .maybeSingle();
  if (!match) return { error: "matchNotFound" };
  if (match.status === "completed" || match.status === "cancelled") {
    return { error: "matchNotAcceptingPredictions" };
  }
  const { data: counts } = await admin
    .from("match_participants")
    .select("team_id")
    .eq("match_id", parsed.data.matchId)
    .not("team_id", "is", null)
    .in("attendance_status", ["confirmed", "checked_in", "played"]);
  const perTeam = new Map<string, number>();
  for (const row of counts ?? []) {
    if (row.team_id) perTeam.set(row.team_id, (perTeam.get(row.team_id) ?? 0) + 1);
  }
  const required = match.players_per_team;
  const teamsReady = perTeam.size >= 2 && [...perTeam.values()].every((c) => c >= required);
  if (!teamsReady) {
    return {
      error: "votingOpensWhenTeamsReady",
      errorParams: { required } as Record<string, string | number>,
    };
  }

  const { data: existing } = await admin
    .from("pre_match_poll_votes")
    .select("id")
    .eq("poll_id", poll.id)
    .eq("membership_id", membership.id)
    .maybeSingle();

  if (existing) {
    await admin
      .from("pre_match_poll_votes")
      .update({ option_id: parsed.data.optionId, submitted_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await admin.from("pre_match_poll_votes").insert({
      poll_id: poll.id,
      option_id: parsed.data.optionId,
      membership_id: membership.id,
      tenant_id: membership.tenant_id,
    });
  }

  revalidatePath(`/matches/${parsed.data.matchId}`);
  return { ok: true };
}

// ---------- Player of the match vote ----------
const motmSchema = z.object({
  matchId: z.string().uuid(),
  targetMembershipId: z.string().uuid(),
});

export async function castMotmVoteAction(formData: FormData) {
  const parsed = motmSchema.safeParse({
    matchId: formData.get("matchId"),
    targetMembershipId: formData.get("targetMembershipId"),
  });
  if (!parsed.success) return { error: "invalidInput" };
  const { membership } = await requireMembership();
  const admin = createSupabaseServiceClient();

  // Refuse late first-time submissions: the rating window is the 1 minute
  // after the match closes. After that, votes are LOCKED.
  const { data: matchTime } = await admin
    .from("matches")
    .select("score_entered_at")
    .eq("id", parsed.data.matchId)
    .maybeSingle();
  if (matchTime?.score_entered_at) {
    const closedAtMs = new Date(matchTime.score_entered_at).getTime();
    if (Date.now() - closedAtMs > RATING_EDIT_WINDOW_MS) {
      return { error: "voteWindowClosed" };
    }
  }

  // Voter must have played
  const { data: voter } = await admin
    .from("match_participants")
    .select("id, attendance_status, tenant_id")
    .eq("match_id", parsed.data.matchId)
    .eq("membership_id", membership.id)
    .maybeSingle();
  if (!voter || voter.attendance_status !== "played" || voter.tenant_id !== membership.tenant_id) {
    return { error: "onlyPlayedCanVote" };
  }
  if (parsed.data.targetMembershipId === membership.id) {
    return { error: "cannotVoteSelf" };
  }
  // Target must have played in the same match
  const { data: target } = await admin
    .from("match_participants")
    .select("attendance_status, tenant_id")
    .eq("match_id", parsed.data.matchId)
    .eq("membership_id", parsed.data.targetMembershipId)
    .maybeSingle();
  if (!target || target.attendance_status !== "played") {
    return { error: "targetMustBePlayed" };
  }

  const { data: existing } = await admin
    .from("player_of_match_votes")
    .select("id, submitted_at, locked_at")
    .eq("match_id", parsed.data.matchId)
    .eq("voter_membership_id", membership.id)
    .maybeSingle();

  const now = new Date();
  if (existing) {
    if (existing.locked_at) return { error: "voteLocked" };
    const submittedAt = new Date(existing.submitted_at).getTime();
    if (Date.now() - submittedAt > RATING_EDIT_WINDOW_MS) {
      return { error: "editWindowExpired" };
    }
    await admin
      .from("player_of_match_votes")
      .update({
        target_membership_id: parsed.data.targetMembershipId,
      })
      .eq("id", existing.id);
  } else {
    await admin.from("player_of_match_votes").insert({
      match_id: parsed.data.matchId,
      tenant_id: membership.tenant_id,
      voter_membership_id: membership.id,
      target_membership_id: parsed.data.targetMembershipId,
      editable_until: new Date(now.getTime() + RATING_EDIT_WINDOW_MS).toISOString(),
    });
  }
  revalidatePath(`/matches/${parsed.data.matchId}`);
  return { ok: true };
}

// ---------- Teammate ratings ----------
export async function submitTeammateRatingsAction(formData: FormData) {
  const matchId = String(formData.get("matchId") ?? "");
  if (!matchId) return { error: "missingMatch" };

  const ratingsRaw: Array<{ targetMembershipId: string; rating: number }> = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("rating-")) {
      const target = key.replace("rating-", "");
      const rating = Number(value);
      if (rating >= 1 && rating <= 5) ratingsRaw.push({ targetMembershipId: target, rating });
    }
  }

  const { membership } = await requireMembership();
  const admin = createSupabaseServiceClient();

  // Lock teammate ratings the same way as MOTM votes — once 1 minute past
  // match close, the window is closed for everyone.
  const { data: matchTime } = await admin
    .from("matches")
    .select("score_entered_at")
    .eq("id", matchId)
    .maybeSingle();
  if (matchTime?.score_entered_at) {
    const closedAtMs = new Date(matchTime.score_entered_at).getTime();
    if (Date.now() - closedAtMs > RATING_EDIT_WINDOW_MS) {
      return { error: "ratingWindowClosed" };
    }
  }

  const { data: voter } = await admin
    .from("match_participants")
    .select("id, attendance_status, team_id, tenant_id")
    .eq("match_id", matchId)
    .eq("membership_id", membership.id)
    .maybeSingle();
  if (!voter || voter.attendance_status !== "played" || voter.tenant_id !== membership.tenant_id) {
    return { error: "onlyPlayedCanRate" };
  }
  if (!voter.team_id) return { error: "mustBeOnTeam" };

  // Targets must be played teammates (same team) and not self
  const { data: teammates } = await admin
    .from("match_participants")
    .select("membership_id")
    .eq("match_id", matchId)
    .eq("team_id", voter.team_id)
    .eq("attendance_status", "played");
  const allowedSet = new Set(
    (teammates ?? []).map((t: { membership_id: string }) => t.membership_id),
  );
  allowedSet.delete(membership.id);

  const filtered = ratingsRaw.filter((r) => allowedSet.has(r.targetMembershipId));
  if (filtered.length === 0) return { error: "noValidTeammates" };

  const now = new Date();
  const editableUntil = new Date(now.getTime() + RATING_EDIT_WINDOW_MS).toISOString();

  for (const r of filtered) {
    const { data: existing } = await admin
      .from("teammate_ratings")
      .select("id, submitted_at, locked_at")
      .eq("match_id", matchId)
      .eq("rater_membership_id", membership.id)
      .eq("target_membership_id", r.targetMembershipId)
      .maybeSingle();
    if (existing) {
      if (existing.locked_at) continue;
      const submittedAt = new Date(existing.submitted_at).getTime();
      if (Date.now() - submittedAt > RATING_EDIT_WINDOW_MS) continue;
      await admin
        .from("teammate_ratings")
        .update({ rating_value: r.rating })
        .eq("id", existing.id);
    } else {
      await admin.from("teammate_ratings").insert({
        match_id: matchId,
        tenant_id: membership.tenant_id,
        rater_membership_id: membership.id,
        target_membership_id: r.targetMembershipId,
        rating_value: r.rating,
        editable_until: editableUntil,
      });
    }
  }
  revalidatePath(`/matches/${matchId}`);
  return { ok: true, count: filtered.length };
}

// ---------- Admin: create match ----------
//
// Simplified flow per product feedback:
//   - Admin only enters startsAt (1 hour fixed duration; ends_at = +1h server-side)
//   - Format is a dropdown (5v5..8v8); players_per_team derived from the prefix
//   - Title is auto-generated as "{Venue} - {YYYYMMDD} - {HHmm}"
//   - Match fee comes from tenant.default_match_fee (admin sets it once in settings)
const FORMAT_OPTIONS = ["5v5", "6v6", "7v7", "8v8"] as const;
const createMatchSchema = z.object({
  venueId: z.string().uuid(),
  startsAt: z.string().min(10),
  format: z.enum(FORMAT_OPTIONS),
});

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function autoMatchTitle(venueName: string, startsAt: Date) {
  const ymd = `${startsAt.getFullYear()}${pad2(startsAt.getMonth() + 1)}${pad2(startsAt.getDate())}`;
  const hm = `${pad2(startsAt.getHours())}${pad2(startsAt.getMinutes())}`;
  return `${venueName} - ${ymd} - ${hm}`;
}

export async function createMatchAction(formData: FormData) {
  const { membership } = await requireRole(["admin", "owner", "assistant_admin"]);
  const parsed = createMatchSchema.safeParse({
    venueId: formData.get("venueId"),
    startsAt: formData.get("startsAt"),
    format: formData.get("format"),
  });
  if (!parsed.success) {
    return { error: "invalidMatchInput" };
  }
  const admin = createSupabaseServiceClient();

  const { data: tenant } = await admin
    .from("tenants")
    .select("currency_code, default_match_fee")
    .eq("id", membership.tenant_id)
    .single();

  const { data: venue } = await admin
    .from("venues")
    .select("name")
    .eq("id", parsed.data.venueId)
    .eq("tenant_id", membership.tenant_id)
    .maybeSingle();
  if (!venue) {
    return { error: "venueNotFound" };
  }

  const startsAtDate = new Date(parsed.data.startsAt);
  if (Number.isNaN(startsAtDate.getTime())) {
    return { error: "invalidStartDate" };
  }
  const endsAtDate = new Date(startsAtDate.getTime() + 60 * 60 * 1000);
  const playersPerTeam = parseInt(parsed.data.format[0], 10); // "6" from "6v6"

  const { data: match, error } = await admin
    .from("matches")
    .insert({
      tenant_id: membership.tenant_id,
      venue_id: parsed.data.venueId,
      title: autoMatchTitle(venue.name, startsAtDate),
      starts_at: startsAtDate.toISOString(),
      ends_at: endsAtDate.toISOString(),
      team_format_label: parsed.data.format,
      players_per_team: playersPerTeam,
      match_fee: (tenant?.default_match_fee ?? "0").toString(),
      currency_code: tenant?.currency_code ?? "GBP",
      status: "open",
      created_by_membership_id: membership.id,
    })
    .select()
    .single();
  if (error) return { error: "generic" };

  // Create teams
  await admin.from("match_teams").insert([
    {
      match_id: match.id,
      tenant_id: membership.tenant_id,
      team_key: "red",
      display_name: "Red Team",
      sort_order: 1,
    },
    {
      match_id: match.id,
      tenant_id: membership.tenant_id,
      team_key: "blue",
      display_name: "Blue Team",
      sort_order: 2,
    },
  ]);

  // Pre-create poll
  const { data: poll } = await admin
    .from("pre_match_polls")
    .insert({
      match_id: match.id,
      tenant_id: membership.tenant_id,
      poll_type: "winner_prediction",
      status: "open",
      created_by_membership_id: membership.id,
    })
    .select()
    .single();

  if (poll) {
    const { data: teams } = await admin
      .from("match_teams")
      .select("*")
      .eq("match_id", match.id)
      .order("sort_order");
    if (teams) {
      await admin.from("pre_match_poll_options").insert(
        teams.map((t: { id: string; display_name: string; sort_order: number }) => ({
          poll_id: poll.id,
          team_id: t.id,
          label: t.display_name,
          sort_order: t.sort_order,
        })),
      );
    }
  }

  await audit({
    tenantId: membership.tenant_id,
    actorMembershipId: membership.id,
    entityType: "match",
    entityId: match.id,
    actionType: "create_match",
    after: {
      title: match.title,
      starts_at: match.starts_at,
      format: parsed.data.format,
      players_per_team: playersPerTeam,
    },
  });

  revalidatePath("/matches");
  revalidatePath("/admin/matches");
  return { ok: true, matchId: match.id };
}

// ---------- Admin: assign team ----------
export async function assignParticipantToTeamAction(formData: FormData) {
  const { membership } = await requireRole(["admin", "owner", "assistant_admin"]);
  const matchId = String(formData.get("matchId") ?? "");
  const participantId = String(formData.get("participantId") ?? "");
  const teamId = String(formData.get("teamId") ?? "");
  if (!matchId || !participantId) return { error: "missingInput" };
  const admin = createSupabaseServiceClient();
  const { data: p } = await admin
    .from("match_participants")
    .select("tenant_id")
    .eq("id", participantId)
    .maybeSingle();
  if (!p || p.tenant_id !== membership.tenant_id) return { error: "forbidden" };
  await admin
    .from("match_participants")
    .update({ team_id: teamId || null, joined_team_at: new Date().toISOString() })
    .eq("id", participantId);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath(`/admin/matches/${matchId}`);
  return { ok: true };
}

// ---------- Admin: close match ----------
const closeSchema = z.object({
  matchId: z.string().uuid(),
  redScore: z.coerce.number().int().min(0),
  blueScore: z.coerce.number().int().min(0),
});

export async function closeMatchAction(formData: FormData) {
  const { membership } = await requireRole(["admin", "owner"]);
  const parsed = closeSchema.safeParse({
    matchId: formData.get("matchId"),
    redScore: formData.get("redScore"),
    blueScore: formData.get("blueScore"),
  });
  if (!parsed.success) return { error: "invalidScore" };
  const admin = createSupabaseServiceClient();
  const { data: match } = await admin
    .from("matches")
    .select("*, currency_code, match_fee, tenant_id")
    .eq("id", parsed.data.matchId)
    .maybeSingle();
  if (!match || match.tenant_id !== membership.tenant_id) return { error: "forbidden" };
  if (match.status === "completed") return { error: "matchAlreadyClosed" };

  // A match is fixed at 1 hour. We refuse to close it before that hour
  // is up — admins shouldn't be able to settle the score (and charge
  // fees!) before kickoff has even happened.
  const startsAtMs = new Date(match.starts_at).getTime();
  if (Date.now() < startsAtMs + 60 * 60 * 1000) {
    const minutesLeft = Math.ceil((startsAtMs + 60 * 60 * 1000 - Date.now()) / 60000);
    return {
      error: "matchNotOverYet",
      errorParams: { minutes: minutesLeft } as Record<string, string | number>,
    };
  }

  const { data: teams } = await admin
    .from("match_teams")
    .select("*")
    .eq("match_id", parsed.data.matchId)
    .order("sort_order");
  if (!teams || teams.length !== 2) return { error: "teamsNotConfigured" };
  const red = teams.find((t: { team_key: string }) => t.team_key === "red");
  const blue = teams.find((t: { team_key: string }) => t.team_key === "blue");
  if (!red || !blue) return { error: "teamsNotConfigured" };

  const isDraw = parsed.data.redScore === parsed.data.blueScore;
  const winnerTeamId = isDraw
    ? null
    : parsed.data.redScore > parsed.data.blueScore
      ? red.id
      : blue.id;

  // Mark assigned participants as played
  const { data: participants } = await admin
    .from("match_participants")
    .select("id, membership_id, attendance_status, team_id")
    .eq("match_id", parsed.data.matchId);

  const playedIds: string[] = [];
  const playedMemberIds: string[] = [];
  for (const p of participants ?? []) {
    if (p.team_id) {
      playedIds.push(p.id);
      playedMemberIds.push(p.membership_id);
    }
  }
  if (playedIds.length > 0) {
    await admin
      .from("match_participants")
      .update({ attendance_status: "played" })
      .in("id", playedIds);
  }

  // Insert match_results
  await admin.from("match_results").insert({
    match_id: parsed.data.matchId,
    tenant_id: match.tenant_id,
    red_team_id: red.id,
    blue_team_id: blue.id,
    red_score: parsed.data.redScore,
    blue_score: parsed.data.blueScore,
    winner_team_id: winnerTeamId,
    is_draw: isDraw,
    entered_by_membership_id: membership.id,
  });

  // Apply match fee to played participants
  if (Number(match.match_fee) > 0 && playedMemberIds.length > 0) {
    const ledgerRows = playedMemberIds.map((mid) => ({
      tenant_id: match.tenant_id,
      membership_id: mid,
      match_id: parsed.data.matchId,
      transaction_type: "match_fee",
      direction: "debit",
      amount: match.match_fee,
      currency_code: match.currency_code,
      description: "Match fee",
      recorded_by_membership_id: membership.id,
    }));
    await admin.from("ledger_transactions").insert(ledgerRows);
  }

  // Close pre-match poll
  await admin
    .from("pre_match_polls")
    .update({ status: "closed", closed_at: new Date().toISOString() })
    .eq("match_id", parsed.data.matchId);

  await admin
    .from("matches")
    .update({
      status: "completed",
      score_entered_at: new Date().toISOString(),
      closed_by_membership_id: membership.id,
    })
    .eq("id", parsed.data.matchId);

  // Notifications for played members (in-app + best-effort web push).
  if (playedMemberIds.length > 0) {
    await notifyMany(
      playedMemberIds.map((mid) => ({
        tenantId: match.tenant_id,
        membershipId: mid,
      })),
      {
        notificationType: "post_match_rating_open",
        title: "Rate your teammates",
        body: "The match is over — rate your teammates and pick the player of the match. You have 1 minute.",
        payload: { matchId: parsed.data.matchId, kind: "post_match_rating_open" },
      },
    );
  }

  // Audit the close + score + fee application.
  await audit({
    tenantId: match.tenant_id,
    actorAccountId: null,
    actorMembershipId: membership.id,
    entityType: "match",
    entityId: parsed.data.matchId,
    actionType: "close_match",
    after: {
      red_score: parsed.data.redScore,
      blue_score: parsed.data.blueScore,
      is_draw: isDraw,
      played_count: playedMemberIds.length,
      fee_charged: Number(match.match_fee) * playedMemberIds.length,
    },
  });

  revalidatePath(`/matches/${parsed.data.matchId}`);
  revalidatePath(`/admin/matches/${parsed.data.matchId}`);
  revalidatePath("/matches");
  revalidatePath("/admin/matches");
  return { ok: true };
}
