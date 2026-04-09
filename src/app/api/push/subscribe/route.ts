import { NextResponse } from "next/server";
import { createSupabaseServiceClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/server/auth/session";

/**
 * Persist a Web Push subscription against the current account, so future
 * notify() calls can fan out via the Push API. POST body is the JSON shape
 * returned by `PushSubscription.toJSON()`.
 */
export async function POST(req: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  let body: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
    userAgent?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
    return NextResponse.json({ error: "Missing endpoint/keys" }, { status: 400 });
  }

  const admin = createSupabaseServiceClient();
  // Upsert by endpoint to avoid duplicates.
  const { data: existing } = await admin
    .from("push_subscriptions")
    .select("id")
    .eq("endpoint", body.endpoint)
    .maybeSingle();
  if (existing) {
    await admin
      .from("push_subscriptions")
      .update({
        account_id: session.account.id,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        user_agent: body.userAgent ?? null,
        is_active: true,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", existing.id);
  } else {
    await admin.from("push_subscriptions").insert({
      account_id: session.account.id,
      endpoint: body.endpoint,
      p256dh: body.keys.p256dh,
      auth: body.keys.auth,
      user_agent: body.userAgent ?? null,
      is_active: true,
    });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getSessionContext();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const url = new URL(req.url);
  const endpoint = url.searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "Missing endpoint" }, { status: 400 });
  const admin = createSupabaseServiceClient();
  await admin
    .from("push_subscriptions")
    .update({ is_active: false })
    .eq("account_id", session.account.id)
    .eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
