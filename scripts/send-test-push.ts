/**
 * One-off script to fire a test push at every active push_subscriptions
 * row. Resolves the membership for each subscribed account, calls
 * `notify()` (which writes the in-app row + delivers the encrypted push),
 * and reports the result per subscription.
 *
 * Usage:
 *   npx tsx scripts/send-test-push.ts
 *   npx tsx scripts/send-test-push.ts <email>      # only that account
 *
 * Notes:
 *   - The in-app row is always written, even if the push delivery fails
 *     or the device has no subscription.
 *   - Dead subscriptions (404 / 410) are auto-flipped to is_active=false
 *     by notify().
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { Client } from "pg";
// Dynamic import AFTER dotenv loads, so SUPABASE_SERVICE_ROLE_KEY is in
// process.env when src/lib/supabase/server.ts evaluates its `env`
// constants.
type NotifyFn = typeof import("../src/server/notifications/notify").notify;

const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:64322/postgres";

async function main() {
  const { notify } = (await import(
    "../src/server/notifications/notify"
  )) as { notify: NotifyFn };
  const filterEmail = process.argv[2];
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows: subs } = await client.query<{
      account_id: string;
      endpoint: string;
      email: string;
    }>(
      `SELECT s.account_id, s.endpoint, a.email
         FROM push_subscriptions s
         JOIN accounts a ON a.id = s.account_id
        WHERE s.is_active = TRUE
          ${filterEmail ? "AND a.email = $1" : ""}`,
      filterEmail ? [filterEmail] : [],
    );
    console.log(`[push-test] ${subs.length} active subscription(s)`);
    if (subs.length === 0) {
      console.log(
        "[push-test] No-one has clicked Enable on /profile yet, or the address filter matched nothing.",
      );
      return;
    }

    for (const sub of subs) {
      // Pick the first non-archived membership for this account so we can
      // route through the regular notify() pipeline.
      const { rows: members } = await client.query<{
        membership_id: string;
        tenant_id: string;
      }>(
        `SELECT m.id AS membership_id, m.tenant_id
           FROM memberships m
           JOIN persons p ON p.id = m.person_id
          WHERE p.primary_account_id = $1
            AND m.status != 'archived'
          ORDER BY m.created_at
          LIMIT 1`,
        [sub.account_id],
      );
      const member = members[0];
      if (!member) {
        console.log(`[push-test] ${sub.email}: no active membership, skipping`);
        continue;
      }

      const stamp = new Date().toLocaleTimeString();
      await notify({
        tenantId: member.tenant_id,
        membershipId: member.membership_id,
        notificationType: "wallet_updated",
        title: "Test push",
        body: `Hello from the audit test at ${stamp}`,
        payload: { url: "/notifications", kind: "manual_test" },
      });
      console.log(`[push-test] ${sub.email}: notify() returned`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
