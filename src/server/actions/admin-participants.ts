"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { requireRole } from "@/server/auth/session";

export async function addParticipantsAction(formData: FormData) {
  const { membership } = await requireRole(["admin", "owner", "assistant_admin"]);
  const matchId = String(formData.get("matchId") ?? "");
  const ids = formData.getAll("membershipIds").map((v) => String(v));
  if (!matchId || ids.length === 0) return { error: "missingInput" };

  const admin = createSupabaseServiceClient();
  const { data: match } = await admin
    .from("matches")
    .select("tenant_id")
    .eq("id", matchId)
    .maybeSingle();
  if (!match || match.tenant_id !== membership.tenant_id) return { error: "forbidden" };

  const rows = ids.map((mid) => ({
    match_id: matchId,
    tenant_id: membership.tenant_id,
    membership_id: mid,
    attendance_status: "confirmed" as const,
  }));
  const { error } = await admin.from("match_participants").insert(rows);
  if (error) return { error: "generic" };

  revalidatePath(`/admin/matches/${matchId}`);
  revalidatePath(`/matches/${matchId}`);
  return { ok: true };
}
