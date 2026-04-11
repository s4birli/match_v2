/**
 * Production owner bootstrap.
 *
 * Wipes ALL non-schema data from the database and creates exactly ONE
 * system_owner account. Idempotent — running it twice is safe and
 * resets to the same clean state.
 *
 * Read the credentials from env vars so the same script can be used
 * unchanged on every deployment target:
 *
 *   OWNER_EMAIL          (default: owner@matchclub.app)
 *   OWNER_PASSWORD       (default: MatchClub.2026!Secure — CHANGE on first login)
 *   OWNER_DISPLAY_NAME   (default: System Owner)
 *
 * Usage (local):
 *   npx tsx scripts/seed-production-owner.ts
 *
 * Usage (production):
 *   OWNER_EMAIL=admin@example.com OWNER_PASSWORD='strong!' \
 *     npx tsx scripts/seed-production-owner.ts
 *
 * What it does, in order:
 *   1. TRUNCATE every data table (matches, members, ledger, etc.)
 *      while preserving the schema, RLS policies, functions, and the
 *      `supabase_realtime` publication.
 *   2. Wipe auth.users.
 *   3. Create the auth.users row for the owner.
 *   4. Create the matching `accounts` row with `is_system_owner = true`
 *      and `preferred_language = 'en'`.
 *   5. Print the credentials so the deployer can save them once.
 *
 * After running, the only way into the app is via /login with the
 * printed credentials. Everything else is empty.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { Client } from "pg";
import { randomUUID } from "node:crypto";

// Pre-baked bcrypt hashes for the two default passwords. Use the matching
// hash if you keep the default password; if you supply OWNER_PASSWORD via
// the env, the script aborts because Node's bcrypt would need a real lib
// — see the README at the bottom of this file.
const KNOWN_PASSWORDS: Record<string, string> = {
  // Test1234! — same hash the existing seed.sql uses
  "Test1234!":
    "$2b$10$0c358zLo5Fr2SXFu6hnQlu7VQfyqK5QwWHPGI77OcXLEOoZPv2GyO",
  // MatchClub.2026!Secure — generated with bcrypt cost 10
  "MatchClub.2026!Secure":
    "$2b$10$6Q54a/P67kKdqgcMgRjIe.JkbeSYbt.mtW2ModKJ9OpN1c1mB1WKG",
};

const TABLES_TO_WIPE = [
  // Order matters because of FKs — wipe child tables first.
  "teammate_ratings",
  "player_of_match_votes",
  "pre_match_poll_votes",
  "pre_match_poll_options",
  "pre_match_polls",
  "ledger_transactions",
  "tenant_fund_collections",
  "match_results",
  "match_participants",
  "match_teams",
  "matches",
  "venues",
  "notifications",
  "push_subscriptions",
  "audit_logs",
  "invite_consumptions",
  "tenant_invites",
  "tenant_feature_flags",
  "position_preferences",
  "person_account_links",
  "memberships",
  "persons",
  "accounts",
  "tenants",
];

async function main() {
  const ownerEmail = (process.env.OWNER_EMAIL ?? "owner@matchclub.app")
    .trim()
    .toLowerCase();
  const ownerPassword = process.env.OWNER_PASSWORD ?? "MatchClub.2026!Secure";
  const ownerDisplayName = process.env.OWNER_DISPLAY_NAME ?? "System Owner";

  if (!KNOWN_PASSWORDS[ownerPassword]) {
    console.error(
      `\nERROR: OWNER_PASSWORD must be one of the pre-hashed values:\n  ${Object.keys(
        KNOWN_PASSWORDS,
      ).join("\n  ")}\n\nIf you want a different password, generate a bcrypt(10) hash and add it to KNOWN_PASSWORDS in this script, OR change the password from inside the app via the password reset flow after the initial bootstrap.\n`,
    );
    process.exit(1);
  }
  const passwordHash = KNOWN_PASSWORDS[ownerPassword];

  const url =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:64322/postgres";
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    // ── 1. Wipe everything ─────────────────────────────────────────
    console.log("[seed-prod] wiping data tables…");
    await client.query("BEGIN");
    for (const t of TABLES_TO_WIPE) {
      try {
        await client.query(`TRUNCATE TABLE public.${t} CASCADE`);
      } catch (err) {
        // Table may not exist in older schemas — keep going.
        const e = err as { message?: string };
        console.warn(`  - skip ${t}: ${e.message ?? "unknown error"}`);
      }
    }
    // Auth users live in the auth schema and need a separate wipe.
    await client.query("DELETE FROM auth.identities");
    await client.query("DELETE FROM auth.sessions");
    await client.query("DELETE FROM auth.refresh_tokens");
    await client.query("DELETE FROM auth.users");
    await client.query("COMMIT");
    console.log("[seed-prod] wipe complete.");

    // ── 2. Create the owner auth.users row ─────────────────────────
    const ownerAuthId = randomUUID();
    console.log(`[seed-prod] creating auth.users row for ${ownerEmail}…`);
    await client.query(
      `INSERT INTO auth.users (
         instance_id, id, aud, role, email, encrypted_password,
         email_confirmed_at, created_at, updated_at,
         confirmation_token, recovery_token,
         email_change, email_change_token_new, email_change_token_current,
         email_change_confirm_status, phone_change, phone_change_token,
         reauthentication_token, is_sso_user, is_anonymous,
         raw_app_meta_data, raw_user_meta_data
       ) VALUES (
         '00000000-0000-0000-0000-000000000000', $1,
         'authenticated', 'authenticated', $2, $3,
         now(), now(), now(), '', '',
         '', '', '', 0, '', '', '', false, false,
         '{"provider":"email","providers":["email"]}'::jsonb,
         jsonb_build_object('full_name', $4::text)
       )`,
      [ownerAuthId, ownerEmail, passwordHash, ownerDisplayName],
    );

    // ── 3. Create the matching accounts row ────────────────────────
    console.log("[seed-prod] creating accounts row with is_system_owner=true…");
    await client.query(
      `INSERT INTO accounts (auth_user_id, email, preferred_language, is_system_owner)
       VALUES ($1, $2, 'en', true)`,
      [ownerAuthId, ownerEmail],
    );

    // ── 4. Sanity check ────────────────────────────────────────────
    const { rows } = await client.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM accounts WHERE is_system_owner = TRUE`,
    );
    if (rows[0]?.count !== "1") {
      throw new Error(
        `Expected exactly 1 system owner, found ${rows[0]?.count}`,
      );
    }

    console.log("\n────────────────────────────────────────────");
    console.log("✅  Production bootstrap complete.");
    console.log("────────────────────────────────────────────");
    console.log(`  Email:    ${ownerEmail}`);
    console.log(`  Password: ${ownerPassword}`);
    console.log(`  Role:     system_owner`);
    console.log("────────────────────────────────────────────");
    console.log(
      "\n⚠️  CHANGE THE PASSWORD on first login via /profile or /reset-password.\n",
    );
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
