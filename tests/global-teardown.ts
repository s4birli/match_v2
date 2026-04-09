/**
 * Playwright global teardown — runs ONCE after the entire test suite finishes.
 *
 * Purpose: clean up any rows the tests created so the demo database keeps a
 * stable, predictable state for manual testing.
 *
 * What we wipe (all WHERE-scoped, never the seed data):
 *   - tenants whose name starts with "Smoke Tenant " (created by role-isolation
 *     "owner can create a new tenant"). Cascades to memberships / invites /
 *     feature flags via the children we wipe explicitly here.
 *   - matches whose title starts with "Smoke " or equals "E2E Test Match"
 *     (created by post-match.spec.ts and match-lifecycle.spec.ts). Wipes their
 *     match_teams / match_participants / match_results / ledger_transactions /
 *     pre_match_polls / pre_match_poll_options / pre_match_poll_votes /
 *     teammate_ratings / player_of_match_votes.
 *   - Stale notifications targeting test runs.
 *
 * Idempotent: re-running on a clean DB is a no-op.
 */
import { Client } from "pg";

export default async function globalTeardown() {
  const url =
    process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:64322/postgres";
  const client = new Client({ connectionString: url });
  try {
    await client.connect();

    // ---- Smoke matches ----
    // The new auto-title is "{Venue} - YYYYMMDD - HHmm" — anything titled
    // "Demo Pitch - %" came from a test run.
    const { rows: smokeMatches } = await client.query<{ id: string; tenant_id: string }>(
      `SELECT id, tenant_id FROM matches
        WHERE title LIKE 'Smoke %'
           OR title = 'E2E Test Match'
           OR title LIKE 'Demo Pitch -%'`,
    );
    if (smokeMatches.length > 0) {
      const ids = smokeMatches.map((m) => m.id);
      await client.query(`DELETE FROM teammate_ratings WHERE match_id = ANY($1::uuid[])`, [ids]);
      await client.query(`DELETE FROM player_of_match_votes WHERE match_id = ANY($1::uuid[])`, [ids]);
      await client.query(
        `DELETE FROM pre_match_poll_votes
          WHERE poll_id IN (SELECT id FROM pre_match_polls WHERE match_id = ANY($1::uuid[]))`,
        [ids],
      );
      await client.query(
        `DELETE FROM pre_match_poll_options
          WHERE poll_id IN (SELECT id FROM pre_match_polls WHERE match_id = ANY($1::uuid[]))`,
        [ids],
      );
      await client.query(`DELETE FROM pre_match_polls WHERE match_id = ANY($1::uuid[])`, [ids]);
      await client.query(`DELETE FROM ledger_transactions WHERE match_id = ANY($1::uuid[])`, [ids]);
      await client.query(`DELETE FROM match_results WHERE match_id = ANY($1::uuid[])`, [ids]);
      await client.query(`DELETE FROM match_participants WHERE match_id = ANY($1::uuid[])`, [ids]);
      await client.query(`DELETE FROM match_teams WHERE match_id = ANY($1::uuid[])`, [ids]);
      await client.query(`DELETE FROM matches WHERE id = ANY($1::uuid[])`, [ids]);
    }

    // ---- Smoke tenants ----
    const { rows: smokeTenants } = await client.query<{ id: string }>(
      `SELECT id FROM tenants WHERE name LIKE 'Smoke Tenant %' OR slug LIKE 'smoke-tenant-%'`,
    );
    if (smokeTenants.length > 0) {
      const tIds = smokeTenants.map((t) => t.id);
      // Sweep child rows referencing these tenants.
      await client.query(`DELETE FROM teammate_ratings WHERE tenant_id = ANY($1::uuid[])`, [tIds]);
      await client.query(`DELETE FROM player_of_match_votes WHERE tenant_id = ANY($1::uuid[])`, [tIds]);
      await client.query(`DELETE FROM pre_match_poll_votes WHERE tenant_id = ANY($1::uuid[])`, [tIds]);
      await client.query(
        `DELETE FROM pre_match_poll_options
          WHERE poll_id IN (SELECT id FROM pre_match_polls WHERE tenant_id = ANY($1::uuid[]))`,
        [tIds],
      );
      await client.query(`DELETE FROM pre_match_polls WHERE tenant_id = ANY($1::uuid[])`, [tIds]);
      await client.query(`DELETE FROM ledger_transactions WHERE tenant_id = ANY($1::uuid[])`, [tIds]);
      await client.query(`DELETE FROM match_results WHERE tenant_id = ANY($1::uuid[])`, [tIds]);
      await client.query(`DELETE FROM match_participants WHERE tenant_id = ANY($1::uuid[])`, [tIds]);
      await client.query(`DELETE FROM match_teams WHERE tenant_id = ANY($1::uuid[])`, [tIds]);
      await client.query(`DELETE FROM matches WHERE tenant_id = ANY($1::uuid[])`, [tIds]);
      await client.query(`DELETE FROM venues WHERE tenant_id = ANY($1::uuid[])`, [tIds]);
      await client.query(`DELETE FROM notifications WHERE tenant_id = ANY($1::uuid[])`, [tIds]);
      await client.query(`DELETE FROM audit_logs WHERE tenant_id = ANY($1::uuid[])`, [tIds]);
      await client.query(
        `DELETE FROM invite_consumptions
          WHERE tenant_invite_id IN (SELECT id FROM tenant_invites WHERE tenant_id = ANY($1::uuid[]))`,
        [tIds],
      );
      await client.query(`DELETE FROM tenant_invites WHERE tenant_id = ANY($1::uuid[])`, [tIds]);
      await client.query(`DELETE FROM tenant_feature_flags WHERE tenant_id = ANY($1::uuid[])`, [tIds]);
      await client.query(`DELETE FROM memberships WHERE tenant_id = ANY($1::uuid[])`, [tIds]);
      await client.query(`DELETE FROM tenants WHERE id = ANY($1::uuid[])`, [tIds]);
    }

    // ---- Stray notifications mentioning a smoke string ----
    await client.query(
      `DELETE FROM notifications WHERE title LIKE 'Smoke %' OR body LIKE '%smoke %'`,
    );

    const total = smokeTenants.length + smokeMatches.length;
    if (total > 0) {
      // eslint-disable-next-line no-console
      console.log(
        `[teardown] cleaned ${smokeTenants.length} smoke tenant(s) and ${smokeMatches.length} smoke match(es)`,
      );
    }
  } finally {
    await client.end();
  }
}
