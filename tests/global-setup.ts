/**
 * Playwright global setup — runs ONCE before the entire test suite.
 *
 * Ensures Demo FC has a default venue. Without it, the create-match form
 * shows "you need a venue first" empty state and the lifecycle tests fail.
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
  } finally {
    await client.end();
  }
}
