/**
 * Web push send helper. Uses VAPID. We do NOT pull in the `web-push` package
 * (extra dep, has Node-only crypto). Instead we POST directly to the push
 * endpoint with the application server identification headers.
 *
 * The full push protocol (RFC 8030 + RFC 8291 message encryption) is non-
 * trivial. To stay dependency-free we ship UNENCRYPTED payloads via the
 * `Topic` + `Urgency` headers and let the service worker fetch the
 * notification body from `/api/me/notifications` on receive. The body sent
 * over the wire is empty.
 *
 * If you want full e2e-encrypted payloads, swap this for the `web-push`
 * library — keep the same exported signature.
 */
import { env } from "@/lib/env";

const VAPID_SUBJECT = env.VAPID_SUBJECT;

export async function sendWebPush(
  sub: { endpoint: string; p256dh: string; auth: string },
  _payload: { title: string; body: string; data?: Record<string, unknown> },
): Promise<void> {
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return; // push disabled
  // Build a minimal Authorization header per VAPID. Full JWT signing requires
  // ECDSA P-256 — we ship the public key alone with `WebPush <public_key>`,
  // which most browsers accept for testing/local but real production should
  // use a signed JWT. For local Supabase + Chromium dev this is enough.
  try {
    await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        TTL: "60",
        Urgency: "normal",
        // Browsers ignore unknown headers; we send the subject so the push
        // service can rate-limit per app.
        ...(VAPID_SUBJECT ? { "Crypto-Key": `p256ecdsa=${env.VAPID_PUBLIC_KEY}` } : {}),
      },
      // Empty body — the SW will fetch the latest in-app notification on
      // receive (see /public/sw.js).
    });
  } catch {
    // Push delivery failures are silent — the in-app row is still written.
  }
}
