import { createSupabaseServiceClient } from "@/lib/supabase/server";
import type { NotificationType } from "@/lib/supabase/types";
import { sendWebPush } from "./push";
import { buildLocalizedNotification, dictForMembership } from "./locale";

/**
 * Single source of truth for delivering a notification to a player.
 *
 * Behaviour:
 *   1. Look up the recipient's preferred_language and resolve the
 *      localized title/body from the dictionary (`t.notifications.types`).
 *      If the type has no dictionary entry the caller-supplied
 *      title/body fallback is used as-is.
 *   2. Insert the in-app `notifications` row with those localized
 *      strings — that way the historical row stays in the language
 *      the user was on when the event happened, and the /notifications
 *      page can render it without re-translating.
 *   3. Best-effort web push to every active subscription. The push
 *      payload also uses the localized title/body so the OS-level
 *      notification banner is in the right language.
 *
 * Failures never throw — `notify()` is fire-and-forget from the
 * caller's perspective and degrades gracefully if Realtime / web push
 * is unavailable.
 *
 * `params` is an optional placeholder map (e.g. `{ amount: "£8" }`)
 * that gets substituted into both title and body via the dictionary
 * `{name}` syntax.
 */
export async function notify(input: {
  tenantId: string;
  membershipId: string;
  notificationType: NotificationType;
  /** Fallback English title used when the dictionary has no entry. */
  title: string;
  /** Fallback English body used when the dictionary has no entry. */
  body: string;
  /** Optional placeholders for templated dictionary entries. */
  params?: Record<string, string | number>;
  payload?: Record<string, unknown> | null;
}) {
  const admin = createSupabaseServiceClient();

  // Localize at notify-time so the row + push payload speak the user's
  // language. Frozen at write time on purpose — if they switch languages
  // later, the historical notification still reads correctly.
  const { t } = await dictForMembership(input.membershipId);
  const localized = buildLocalizedNotification(
    t,
    input.notificationType,
    { title: input.title, body: input.body },
    input.params,
  );

  const { error } = await admin.from("notifications").insert({
    tenant_id: input.tenantId,
    membership_id: input.membershipId,
    notification_type: input.notificationType,
    title: localized.title,
    body: localized.body,
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
          title: localized.title,
          body: localized.body,
          url:
            typeof input.payload?.url === "string"
              ? input.payload.url
              : "/notifications",
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
 * Bulk version. Each recipient gets their own localized title/body so
 * a multi-language group still receives the right strings. We can't
 * batch the in-app insert as a single SQL call because each row has
 * potentially different localized text — but the cost is dwarfed by
 * the push fan-out anyway.
 */
export async function notifyMany(
  recipients: Array<{ tenantId: string; membershipId: string }>,
  message: {
    notificationType: NotificationType;
    title: string;
    body: string;
    params?: Record<string, string | number>;
    payload?: Record<string, unknown> | null;
  },
) {
  if (recipients.length === 0) return;
  await Promise.all(
    recipients.map((r) =>
      notify({ ...r, ...message }).catch(() => undefined),
    ),
  );
}
