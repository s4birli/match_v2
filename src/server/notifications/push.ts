/**
 * Web push delivery via the `web-push` npm package.
 *
 * Replaces the previous "minimal VAPID" implementation that only sent the
 * public key in a `Crypto-Key` header — push services rejected those
 * because RFC 8292 requires a signed JWT in the `Authorization: vapid`
 * header. The `web-push` library handles JWT signing + RFC 8291 payload
 * encryption for us.
 *
 * The payload now includes the actual title + body + click URL, encrypted
 * end-to-end so the user sees the real notification (not the SW's "you
 * have a new notification" fallback).
 *
 * Failures stay silent and never throw — `notify()` always writes the
 * in-app row first, and push is best-effort.
 */
import webpush from "web-push";
import { env } from "@/lib/env";

let vapidConfigured = false;
function configureVapid() {
  if (vapidConfigured) return;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return;
  try {
    webpush.setVapidDetails(
      env.VAPID_SUBJECT || "mailto:owner@example.com",
      env.VAPID_PUBLIC_KEY,
      env.VAPID_PRIVATE_KEY,
    );
    vapidConfigured = true;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[push] vapid configure failed", (err as Error).message);
  }
}

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  data?: Record<string, unknown>;
};

export async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  payload: PushPayload,
): Promise<{ ok: boolean; gone?: boolean }> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return { ok: false }; // push disabled — no keys configured
  }
  configureVapid();
  if (!vapidConfigured) return { ok: false };

  const subscription = {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.p256dh, auth: sub.auth },
  };
  try {
    await webpush.sendNotification(
      subscription,
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url ?? "/notifications",
        data: payload.data ?? {},
      }),
      {
        TTL: 60 * 60, // 1 hour
        urgency: "normal",
      },
    );
    return { ok: true };
  } catch (err) {
    const e = err as { statusCode?: number };
    // 404 Not Found / 410 Gone → the subscription is dead, caller should
    // mark it inactive so we stop trying.
    if (e.statusCode === 404 || e.statusCode === 410) {
      return { ok: false, gone: true };
    }
    // eslint-disable-next-line no-console
    console.warn("[push] delivery failed", e.statusCode, (err as Error).message);
    return { ok: false };
  }
}
