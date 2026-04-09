"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireMembership, requireRole } from "@/server/auth/session";

const RATING_EDIT_WINDOW_MS = 60 * 1000;

// ---------- Attendance ----------
const attendanceSchema = z.object({
  matchId: z.string().uuid(),
  status: z.enum(["confirmed", "declined", "reserve"]),
});

export async function setMyAttendanceAction(formData: FormData) {
  const parsed = attendanceSchema.safeParse({
    matchId: formData.get("matchId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return { error: "Invalid input" };
  const { membership } = await requireMembership();
  const admin = createSupabaseServiceClient();

  const { data: existing } = await admin
    .from("match_participants")
    .select("id, tenant_id")
    .eq("match_id", parsed.data.matchId)
    .eq("membership_id", membership.id)
    .maybeSingle();

  if (existing) {
    if (existing.tenant_id !== membership.tenant_id) return { error: "Forbidden" };
    await admin
      .from("match_participants")
      .update({
        attendance_status: parsed.data.status,
        attendance_updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    // Verify match belongs to membership tenant
    const { data: match } = await admin
      .from("matches")
      .select("tenant_id")
      .eq("id", parsed.data.matchId)
      .maybeSingle();
    if (!match || match.tenant_id !== membership.tenant_id) return { error: "Forbidden" };
    await admin.from("match_participants").insert({
      match_id: parsed.data.matchId,
      tenant_id: membership.tenant_id,
      membership_id: membership.id,
      attendance_status: parsed.data.status,
    });
  }

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
  if (!parsed.success) return { error: "Invalid input" };
  const { membership } = await requireMembership();
  const admin = createSupabaseServiceClient();

  const { data: poll } = await admin
    .from("pre_match_polls")
    .select("id, tenant_id, status")
    .eq("match_id", parsed.data.matchId)
    .maybeSingle();
  if (!poll || poll.tenant_id !== membership.tenant_id) return { error: "Forbidden" };
  if (poll.status === "closed") return { error: "Poll is closed." };

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
  if (!parsed.success) return { error: "Invalid input" };
  const { membership } = await requireMembership();
  const admin = createSupabaseServiceClient();

  // Voter must have played
  const { data: voter } = await admin
    .from("match_participants")
    .select("id, attendance_status, tenant_id")
    .eq("match_id", parsed.data.matchId)
    .eq("membership_id", membership.id)
    .maybeSingle();
  if (!voter || voter.attendance_status !== "played" || voter.tenant_id !== membership.tenant_id) {
    return { error: "Only played participants can vote." };
  }
  if (parsed.data.targetMembershipId === membership.id) {
    return { error: "You cannot vote for yourself." };
  }
  // Target must have played in the same match
  const { data: target } = await admin
    .from("match_participants")
    .select("attendance_status, tenant_id")
    .eq("match_id", parsed.data.matchId)
    .eq("membership_id", parsed.data.targetMembershipId)
    .maybeSingle();
  if (!target || target.attendance_status !== "played") {
    return { error: "Target must be a played participant." };
  }

  const { data: existing } = await admin
    .from("player_of_match_votes")
    .select("id, submitted_at, locked_at")
    .eq("match_id", parsed.data.matchId)
    .eq("voter_membership_id", membership.id)
    .maybeSingle();

  const now = new Date();
  if (existing) {
    if (existing.locked_at) return { error: "Vote is locked." };
    const submittedAt = new Date(existing.submitted_at).getTime();
    if (Date.now() - submittedAt > RATING_EDIT_WINDOW_MS) {
      return { error: "Edit window has expired." };
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
  if (!matchId) return { error: "Missing match." };

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

  const { data: voter } = await admin
    .from("match_participants")
    .select("id, attendance_status, team_id, tenant_id")
    .eq("match_id", matchId)
    .eq("membership_id", membership.id)
    .maybeSingle();
  if (!voter || voter.attendance_status !== "played" || voter.tenant_id !== membership.tenant_id) {
    return { error: "Only played participants can rate." };
  }
  if (!voter.team_id) return { error: "You must be on a team to rate." };

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
  if (filtered.length === 0) return { error: "No valid teammates to rate." };

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
const createMatchSchema = z.object({
  venueId: z.string().uuid().nullable().optional(),
  title: z.string().optional(),
  startsAt: z.string(),
  endsAt: z.string(),
  teamFormatLabel: z.string().min(2),
  playersPerTeam: z.coerce.number().int().min(2).max(11),
  matchFee: z.coerce.number().min(0),
});

export async function createMatchAction(formData: FormData) {
  const { membership } = await requireRole(["admin", "owner", "assistant_admin"]);
  const parsed = createMatchSchema.safeParse({
    venueId: formData.get("venueId") || null,
    title: formData.get("title") || undefined,
    startsAt: formData.get("startsAt"),
    endsAt: formData.get("endsAt"),
    teamFormatLabel: formData.get("teamFormatLabel"),
    playersPerTeam: formData.get("playersPerTeam"),
    matchFee: formData.get("matchFee"),
  });
  if (!parsed.success) return { error: "Invalid match input." };
  const admin = createSupabaseServiceClient();

  const { data: tenant } = await admin
    .from("tenants")
    .select("currency_code")
    .eq("id", membership.tenant_id)
    .single();

  const { data: match, error } = await admin
    .from("matches")
    .insert({
      tenant_id: membership.tenant_id,
      venue_id: parsed.data.venueId || null,
      title: parsed.data.title || null,
      starts_at: parsed.data.startsAt,
      ends_at: parsed.data.endsAt,
      team_format_label: parsed.data.teamFormatLabel,
      players_per_team: parsed.data.playersPerTeam,
      match_fee: parsed.data.matchFee.toString(),
      currency_code: tenant?.currency_code ?? "GBP",
      status: "open",
      created_by_membership_id: membership.id,
    })
    .select()
    .single();
  if (error) return { error: error.message };

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
  if (!matchId || !participantId) return { error: "Missing input." };
  const admin = createSupabaseServiceClient();
  const { data: p } = await admin
    .from("match_participants")
    .select("tenant_id")
    .eq("id", participantId)
    .maybeSingle();
  if (!p || p.tenant_id !== membership.tenant_id) return { error: "Forbidden" };
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
  if (!parsed.success) return { error: "Invalid score." };
  const admin = createSupabaseServiceClient();
  const { data: match } = await admin
    .from("matches")
    .select("*, currency_code, match_fee, tenant_id")
    .eq("id", parsed.data.matchId)
    .maybeSingle();
  if (!match || match.tenant_id !== membership.tenant_id) return { error: "Forbidden" };
  if (match.status === "completed") return { error: "Match already closed." };

  const { data: teams } = await admin
    .from("match_teams")
    .select("*")
    .eq("match_id", parsed.data.matchId)
    .order("sort_order");
  if (!teams || teams.length !== 2) return { error: "Teams not configured." };
  const red = teams.find((t: { team_key: string }) => t.team_key === "red");
  const blue = teams.find((t: { team_key: string }) => t.team_key === "blue");
  if (!red || !blue) return { error: "Teams not configured." };

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

  // Notifications for played members
  if (playedMemberIds.length > 0) {
    await admin.from("notifications").insert(
      playedMemberIds.map((mid) => ({
        tenant_id: match.tenant_id,
        membership_id: mid,
        notification_type: "post_match_rating_open",
        title: "Rate your teammates",
        body: "The match is over — rate your teammates and pick the player of the match.",
      })),
    );
  }

  revalidatePath(`/matches/${parsed.data.matchId}`);
  revalidatePath(`/admin/matches/${parsed.data.matchId}`);
  revalidatePath("/matches");
  revalidatePath("/admin/matches");
  return { ok: true };
}
