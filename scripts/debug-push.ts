/**
 * Direct web-push delivery test that bypasses notify() so we can see
 * EXACTLY what the push service says. Reads the first active
 * subscription out of the DB and POSTs an encrypted notification
 * straight at it.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { Client } from "pg";
import webpush from "web-push";

async function main() {
  console.log("[debug-push] VAPID_PUBLIC_KEY?", !!process.env.VAPID_PUBLIC_KEY);
  console.log("[debug-push] VAPID_PRIVATE_KEY?", !!process.env.VAPID_PRIVATE_KEY);
  console.log("[debug-push] VAPID_SUBJECT", process.env.VAPID_SUBJECT);

  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    console.error("VAPID keys not set in .env.local — aborting.");
    process.exit(1);
  }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:owner@example.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY,
  );

  const client = new Client({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://postgres:postgres@127.0.0.1:64322/postgres",
  });
  await client.connect();
  try {
    const { rows } = await client.query<{
      endpoint: string;
      p256dh: string;
      auth: string;
      email: string;
    }>(
      `SELECT s.endpoint, s.p256dh, s.auth, a.email
         FROM push_subscriptions s
         JOIN accounts a ON a.id = s.account_id
        WHERE s.is_active = TRUE
        LIMIT 1`,
    );
    if (rows.length === 0) {
      console.error("No active subscription. Click 'Enable push' on /profile first.");
      return;
    }
    const sub = rows[0];
    console.log(`[debug-push] target: ${sub.email}`);
    console.log(`[debug-push] endpoint host: ${new URL(sub.endpoint).host}`);
    console.log(`[debug-push] p256dh length: ${sub.p256dh.length}`);
    console.log(`[debug-push] auth length: ${sub.auth.length}`);

    const payload = JSON.stringify({
      title: "🚨 Direct test push",
      body: `Sent at ${new Date().toLocaleTimeString()} — if you see this, web-push works`,
      url: "/notifications",
    });

    try {
      const result = await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        payload,
        { TTL: 60 * 60, urgency: "high" },
      );
      console.log("[debug-push] ✅ delivery result:", {
        statusCode: result.statusCode,
        body: result.body,
      });
    } catch (err) {
      const e = err as { statusCode?: number; body?: string; message?: string };
      console.error("[debug-push] ❌ delivery FAILED:");
      console.error("  statusCode:", e.statusCode);
      console.error("  body:", e.body);
      console.error("  message:", e.message);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
