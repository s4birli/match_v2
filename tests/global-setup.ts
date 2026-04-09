/**
 * Playwright global setup — runs ONCE before the entire test suite.
 *
 * Two responsibilities:
 *   1. Ensure Demo FC has a default venue. Without it, the create-match
 *      form shows "you need a venue first" empty state and the lifecycle
 *      tests fail.
 *   2. Reset every demo account's `preferred_language` to 'en'. The i18n
 *      spec toggles to TR mid-test and the locale is now persisted on the
 *      account row + force-stamped onto the cookie at login. If a previous
 *      run crashed before the afterEach restore, the next run would inherit
 *      Turkish strings on /dashboard and the auth assertion would fail.
 *      Resetting at globalSetup is the cheapest insurance.
 *
 * Idempotent: re-running on a populated DB is a no-op.
 */
import { Client } from "pg";

const DEMO_TENANT_ID = "22222222-2222-2222-2222-222222222222";

export default async function globalSetup() {
  const url =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:64322/postgres";
  const client = new Client({ connectionString: url });
  try {
    await client.connect();

    const { rows: venues } = await client.query<{ id: string }>(
      `SELECT id FROM venues WHERE tenant_id = $1 LIMIT 1`,
      [DEMO_TENANT_ID],
    );
    if (venues.length === 0) {
      await client.query(
        `INSERT INTO venues (tenant_id, name, address_line, is_active)
         VALUES ($1, 'Demo Pitch', 'Test Lane', TRUE)`,
        [DEMO_TENANT_ID],
      );
      // eslint-disable-next-line no-console
      console.log("[setup] seeded Demo Pitch venue for Demo FC");
    }

    // Reset persisted locale on every demo account so a previous failed
    // i18n test run can't bleed Turkish into the next suite. We don't
    // touch stress.* accounts here — those are kept for manual repro.
    const reset = await client.query(
      `UPDATE accounts
          SET preferred_language = 'en'
        WHERE email LIKE '%demo%'
          AND preferred_language IS DISTINCT FROM 'en'`,
    );
    if (reset.rowCount && reset.rowCount > 0) {
      // eslint-disable-next-line no-console
      console.log(`[setup] reset preferred_language=en on ${reset.rowCount} demo account(s)`);
    }
  } finally {
    await client.end();
  }
}
