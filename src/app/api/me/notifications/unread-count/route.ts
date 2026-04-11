import { NextResponse } from "next/server";
import { getSessionContext } from "@/server/auth/session";
import { countUnreadNotifications } from "@/server/db/queries";

/**
 * Lightweight unread-count endpoint for the bell badge.
 *
 * Why an API route instead of relying on Supabase Realtime
 * postgres_changes: the realtime channel was getting kicked into a
 * CHANNEL_ERROR ↔ CLOSED loop in this local dev setup, so the bell
 * never received live INSERT events. Polling this endpoint every ~10s
 * is way simpler and gives a worst-case ~10s lag — acceptable because
 * the OS-level push notification fires instantly anyway.
 *
 * Cached for zero seconds (always fresh), bound to the active member.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const session = await getSessionContext();
  if (!session?.activeMembership) {
    return NextResponse.json({ count: 0 });
  }
  const count = await countUnreadNotifications(session.activeMembership.id);
  return NextResponse.json({ count });
}
