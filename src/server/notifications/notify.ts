import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { NotificationType } from "@/lib/supabase/types";
import { sendWebPush } from "./push";

/**
 * Single source of truth for delivering a notification to a player.
 * Always writes the in-app row, and tries to send a web push if the
 * recipient has any active push_subscriptions.
 */
export async function notify(input: {
  tenantId: string;
  membershipId: string;
  notificationType: NotificationType;
  title: string;
  body: string;
  payload?: Record<string, unknown> | null;
}) {
  const admin = createSupabaseServiceClient();

  const { error } = await admin.from("notifications").insert({
    tenant_id: input.tenantId,
    membership_id: input.membershipId,
    notification_type: input.notificationType,
    title: input.title,
    body: input.body,
    payload_json: input.payload ?? null,
  });
  if (error) {
    // eslint-disable-next-line no-console
    console.warn("[notify] in-app insert failed", error.message);
  }

  // Best-effort web push — never throw, never block.
  try {
    // Resolve account_id from membership.person → person.primary_account_id.
    const { data: row } = await admin
      .from("memberships")
      .select("person:persons(primary_account_id)")
      .eq("id", input.membershipId)
      .maybeSingle();
    const accountId = (row as { person?: { primary_account_id?: string } } | null)?.person
      ?.primary_account_id;
    if (!accountId) return;

    const { data: subs } = await admin
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("account_id", accountId)
      .eq("is_active", true);

    await Promise.all(
      (subs ?? []).map(async (s) => {
        const sub = s as { endpoint: string; p256dh: string; auth: string };
        const res = await sendWebPush(sub, {
          title: input.title,
          body: input.body,
          url: typeof input.payload?.url === "string" ? input.payload.url : "/notifications",
          data: input.payload ?? {},
        });
        // Push service told us the subscription is gone — flip is_active=false
        // so we don't keep retrying every minute on a dead endpoint.
        if (res.gone) {
          await admin
            .from("push_subscriptions")
            .update({ is_active: false })
            .eq("endpoint", sub.endpoint);
        }
      }),
    );
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[notify] push delivery failed", (err as Error).message);
  }
}

/**
 * Bulk version. Use a single in-app insert for performance, then loop pushes.
 */
export async function notifyMany(
  recipients: Array<{ tenantId: string; membershipId: string }>,
  message: {
    notificationType: NotificationType;
    title: string;
    body: string;
    payload?: Record<string, unknown> | null;
  },
) {
  if (recipients.length === 0) return;
  const admin = createSupabaseServiceClient();
  await admin.from("notifications").insert(
    recipients.map((r) => ({
      tenant_id: r.tenantId,
      membership_id: r.membershipId,
      notification_type: message.notificationType,
      title: message.title,
      body: message.body,
      payload_json: message.payload ?? null,
    })),
  );
  // Push fan-out (best effort, in parallel).
  await Promise.all(
    recipients.map((r) =>
      notify({ ...r, ...message }).catch(() => undefined),
    ),
  );
}
