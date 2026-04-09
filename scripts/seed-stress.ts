/**
 * Stress / scenario seed script.
 *
 * Idempotently builds two tenants ("Stress FC A", "Stress FC B") with the
 * 30 + 25 + 5 shared player setup described in docs/SCENARIOS.md, plus
 * historical matches, results, ratings, MOTM votes, ledger entries, and a
 * fund collection. The intent is to give the comprehensive UI test +
 * monkey runs realistic data that mirrors a real club.
 *
 * Usage:
 *   npx tsx scripts/seed-stress.ts
 *
 * Notes:
 *   - These rows are NOT cleaned by tests/global-teardown.ts. The user
 *     explicitly asked us to preserve them so they can re-drive failing
 *     scenarios manually with the same accounts.
 *   - Bulk players are persons without accounts (the "guest" pattern).
 *     Only admins/assistants get a real auth.users row so login still
 *     works. The stress.shared01..05 players are intentionally accountless
 *     because the multi-group rule doesn't depend on login.
 *   - Re-running the script is safe: the upserts are keyed on slug / email
 *     / display_name and will skip duplicates.
 */
import { Client } from "pg";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Connection
// ---------------------------------------------------------------------------
const url =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:64322/postgres";
const client = new Client({ connectionString: url });

// Pre-baked bcrypt hash of "Test1234!" used by the existing seed.sql.
const TEST_PASSWORD_HASH =
  "$2b$10$0c358zLo5Fr2SXFu6hnQlu7VQfyqK5QwWHPGI77OcXLEOoZPv2GyO";

const TENANT_A_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee0a";
const TENANT_B_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeee0b";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pad(n: number) {
  return n.toString().padStart(2, "0");
}

async function ensureAuthUser(email: string, displayName: string): Promise<string> {
  const { rows: existing } = await client.query<{ id: string }>(
    `SELECT id FROM auth.users WHERE email = $1`,
    [email],
  );
  if (existing[0]) return existing[0].id;
  const id = randomUUID();
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
    [id, email, TEST_PASSWORD_HASH, displayName],
  );
  return id;
}

async function ensureAccount(authUserId: string, email: string): Promise<string> {
  const { rows: existing } = await client.query<{ id: string }>(
    `SELECT id FROM accounts WHERE auth_user_id = $1`,
    [authUserId],
  );
  if (existing[0]) return existing[0].id;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO accounts (auth_user_id, email, preferred_language, is_system_owner)
     VALUES ($1, $2, 'en', false)
     RETURNING id`,
    [authUserId, email],
  );
  return rows[0].id;
}

async function ensurePerson(opts: {
  email?: string | null;
  displayName: string;
  primaryAccountId?: string | null;
  isGuest?: boolean;
}): Promise<string> {
  // De-dupe by display_name + email so re-runs don't double-insert.
  const { rows: existing } = await client.query<{ id: string }>(
    `SELECT id FROM persons
      WHERE display_name = $1
        AND COALESCE(email, '') = COALESCE($2, '')
      LIMIT 1`,
    [opts.displayName, opts.email ?? null],
  );
  if (existing[0]) return existing[0].id;
  const first = opts.displayName.split(" ")[0];
  const last = opts.displayName.split(" ").slice(1).join(" ") || null;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO persons
       (primary_account_id, first_name, last_name, display_name, email, is_guest_profile)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      opts.primaryAccountId ?? null,
      first,
      last,
      opts.displayName,
      opts.email ?? null,
      opts.isGuest ?? false,
    ],
  );
  return rows[0].id;
}

async function ensureMembership(opts: {
  tenantId: string;
  personId: string;
  role: "admin" | "assistant_admin" | "user" | "guest";
  isGuest?: boolean;
}): Promise<string> {
  const { rows: existing } = await client.query<{ id: string }>(
    `SELECT id FROM memberships
      WHERE tenant_id = $1 AND person_id = $2`,
    [opts.tenantId, opts.personId],
  );
  if (existing[0]) return existing[0].id;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO memberships
       (tenant_id, person_id, role, status, stats_visibility,
        is_guest_membership, joined_at)
     VALUES ($1, $2, $3, 'active', 'included', $4, now())
     RETURNING id`,
    [opts.tenantId, opts.personId, opts.role, opts.isGuest ?? false],
  );
  return rows[0].id;
}

async function ensureTenant(
  id: string,
  name: string,
  slug: string,
  currency: string,
  fee: string,
): Promise<void> {
  await client.query(
    `INSERT INTO tenants
       (id, name, slug, currency_code, default_match_fee,
        invite_code, invite_code_active, invite_link_active, is_active, default_language)
     VALUES ($1, $2, $3, $4, $5, upper(substr(md5(random()::text), 1, 8)), true, true, true, 'en')
     ON CONFLICT (id) DO UPDATE
       SET name = EXCLUDED.name,
           slug = EXCLUDED.slug,
           currency_code = EXCLUDED.currency_code,
           default_match_fee = EXCLUDED.default_match_fee`,
    [id, name, slug, currency, fee],
  );
}

async function ensureVenue(tenantId: string, name: string): Promise<string> {
  const { rows: existing } = await client.query<{ id: string }>(
    `SELECT id FROM venues WHERE tenant_id = $1 AND name = $2`,
    [tenantId, name],
  );
  if (existing[0]) return existing[0].id;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO venues (tenant_id, name, address_line, is_active)
     VALUES ($1, $2, 'Stress Lane', true)
     RETURNING id`,
    [tenantId, name],
  );
  return rows[0].id;
}

// ---------------------------------------------------------------------------
// Match builder — closed match with results, ratings, ledger
// ---------------------------------------------------------------------------
async function ensureClosedMatch(opts: {
  tenantId: string;
  venueId: string;
  title: string;
  startsAt: Date;
  fee: string;
  currency: string;
  redMembers: string[];
  blueMembers: string[];
  redScore: number;
  blueScore: number;
  creatorMembershipId: string;
}): Promise<string> {
  const { rows: existing } = await client.query<{ id: string }>(
    `SELECT id FROM matches WHERE tenant_id = $1 AND title = $2`,
    [opts.tenantId, opts.title],
  );
  if (existing[0]) return existing[0].id;

  const startsIso = opts.startsAt.toISOString();
  const endsIso = new Date(opts.startsAt.getTime() + 60 * 60 * 1000).toISOString();
  const { rows: matchRows } = await client.query<{ id: string }>(
    `INSERT INTO matches
       (tenant_id, venue_id, title, starts_at, ends_at, team_format_label,
        players_per_team, match_fee, currency_code, status, created_by_membership_id,
        score_entered_at, closed_by_membership_id)
     VALUES ($1, $2, $3, $4, $5, '6v6', 6, $6, $7, 'completed', $8, $9, $8)
     RETURNING id`,
    [
      opts.tenantId,
      opts.venueId,
      opts.title,
      startsIso,
      endsIso,
      opts.fee,
      opts.currency,
      opts.creatorMembershipId,
      endsIso,
    ],
  );
  const matchId = matchRows[0].id;

  // Create teams
  const { rows: teamRows } = await client.query<{ id: string; team_key: string }>(
    `INSERT INTO match_teams (match_id, tenant_id, team_key, display_name, sort_order)
     VALUES
       ($1, $2, 'red', 'Red Team', 1),
       ($1, $2, 'blue', 'Blue Team', 2)
     RETURNING id, team_key`,
    [matchId, opts.tenantId],
  );
  const redTeamId = teamRows.find((r) => r.team_key === "red")!.id;
  const blueTeamId = teamRows.find((r) => r.team_key === "blue")!.id;

  // Add participants — all played
  const allMembers = [
    ...opts.redMembers.map((m) => ({ m, team: redTeamId })),
    ...opts.blueMembers.map((m) => ({ m, team: blueTeamId })),
  ];
  for (const { m, team } of allMembers) {
    await client.query(
      `INSERT INTO match_participants
         (match_id, tenant_id, membership_id, attendance_status, team_id, joined_team_at)
       VALUES ($1, $2, $3, 'played', $4, now())`,
      [matchId, opts.tenantId, m, team],
    );
  }

  // Result row
  const isDraw = opts.redScore === opts.blueScore;
  const winnerTeamId = isDraw
    ? null
    : opts.redScore > opts.blueScore
      ? redTeamId
      : blueTeamId;
  await client.query(
    `INSERT INTO match_results
       (match_id, tenant_id, red_team_id, blue_team_id, red_score, blue_score,
        winner_team_id, is_draw, entered_by_membership_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      matchId,
      opts.tenantId,
      redTeamId,
      blueTeamId,
      opts.redScore,
      opts.blueScore,
      winnerTeamId,
      isDraw,
      opts.creatorMembershipId,
    ],
  );

  // Ledger fees on every played member
  for (const { m } of allMembers) {
    await client.query(
      `INSERT INTO ledger_transactions
         (tenant_id, membership_id, match_id, transaction_type, direction,
          amount, currency_code, description, recorded_by_membership_id)
       VALUES ($1, $2, $3, 'match_fee', 'debit', $4, $5, 'Match fee', $6)`,
      [opts.tenantId, m, matchId, opts.fee, opts.currency, opts.creatorMembershipId],
    );
  }

  // Some teammate ratings — each player rates their teammates 3..5
  for (const team of [opts.redMembers, opts.blueMembers]) {
    for (const rater of team) {
      for (const target of team) {
        if (rater === target) continue;
        await client.query(
          `INSERT INTO teammate_ratings
             (match_id, tenant_id, rater_membership_id, target_membership_id,
              rating_value, editable_until, locked_at)
           VALUES ($1, $2, $3, $4, $5, now() - interval '1 hour', now() - interval '1 hour')`,
          [matchId, opts.tenantId, rater, target, 3 + Math.floor(Math.random() * 3)],
        );
      }
    }
  }

  // MOTM vote: every played player votes for a random teammate from their team
  for (const team of [opts.redMembers, opts.blueMembers]) {
    for (const voter of team) {
      const candidates = team.filter((m) => m !== voter);
      if (candidates.length === 0) continue;
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      await client.query(
        `INSERT INTO player_of_match_votes
           (match_id, tenant_id, voter_membership_id, target_membership_id,
            editable_until, locked_at)
         VALUES ($1, $2, $3, $4, now() - interval '1 hour', now() - interval '1 hour')`,
        [matchId, opts.tenantId, voter, target],
      );
    }
  }

  return matchId;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  await client.connect();
  console.log("[seed-stress] connected, building world...");

  // ---- Tenants ----
  await ensureTenant(TENANT_A_ID, "Stress FC A", "stress-fc-a", "GBP", "8.00");
  await ensureTenant(TENANT_B_ID, "Stress FC B", "stress-fc-b", "USD", "10.00");

  // ---- Admins / assistants (real auth users so login works) ----
  const adminA = await ensureAuthUser("stress.admin.a@example.com", "Stress Admin A");
  const adminAaccount = await ensureAccount(adminA, "stress.admin.a@example.com");
  const adminApersonId = await ensurePerson({
    email: "stress.admin.a@example.com",
    displayName: "Stress Admin A",
    primaryAccountId: adminAaccount,
  });
  const adminAmembership = await ensureMembership({
    tenantId: TENANT_A_ID,
    personId: adminApersonId,
    role: "admin",
  });

  const adminB = await ensureAuthUser("stress.admin.b@example.com", "Stress Admin B");
  const adminBaccount = await ensureAccount(adminB, "stress.admin.b@example.com");
  const adminBpersonId = await ensurePerson({
    email: "stress.admin.b@example.com",
    displayName: "Stress Admin B",
    primaryAccountId: adminBaccount,
  });
  const adminBmembership = await ensureMembership({
    tenantId: TENANT_B_ID,
    personId: adminBpersonId,
    role: "admin",
  });

  const asstA = await ensureAuthUser("stress.asst.a@example.com", "Stress Assistant A");
  const asstAaccount = await ensureAccount(asstA, "stress.asst.a@example.com");
  const asstApersonId = await ensurePerson({
    email: "stress.asst.a@example.com",
    displayName: "Stress Assistant A",
    primaryAccountId: asstAaccount,
  });
  await ensureMembership({
    tenantId: TENANT_A_ID,
    personId: asstApersonId,
    role: "assistant_admin",
  });

  const asstB = await ensureAuthUser("stress.asst.b@example.com", "Stress Assistant B");
  const asstBaccount = await ensureAccount(asstB, "stress.asst.b@example.com");
  const asstBpersonId = await ensurePerson({
    email: "stress.asst.b@example.com",
    displayName: "Stress Assistant B",
    primaryAccountId: asstBaccount,
  });
  await ensureMembership({
    tenantId: TENANT_B_ID,
    personId: asstBpersonId,
    role: "assistant_admin",
  });

  // ---- Bulk players ----
  // 25 single-tenant for A
  const tenantAplayerMemberships: string[] = [];
  for (let i = 1; i <= 25; i++) {
    const name = `Stress A Player ${pad(i)}`;
    const personId = await ensurePerson({ displayName: name, isGuest: false });
    const m = await ensureMembership({
      tenantId: TENANT_A_ID,
      personId,
      role: "user",
    });
    tenantAplayerMemberships.push(m);
  }

  // 20 single-tenant for B
  const tenantBplayerMemberships: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = `Stress B Player ${pad(i)}`;
    const personId = await ensurePerson({ displayName: name, isGuest: false });
    const m = await ensureMembership({
      tenantId: TENANT_B_ID,
      personId,
      role: "user",
    });
    tenantBplayerMemberships.push(m);
  }

  // 5 SHARED players — same person, two memberships
  const sharedAmembers: string[] = [];
  const sharedBmembers: string[] = [];
  for (let i = 1; i <= 5; i++) {
    const name = `Stress Shared ${pad(i)}`;
    const personId = await ensurePerson({ displayName: name, isGuest: false });
    sharedAmembers.push(
      await ensureMembership({ tenantId: TENANT_A_ID, personId, role: "user" }),
    );
    sharedBmembers.push(
      await ensureMembership({ tenantId: TENANT_B_ID, personId, role: "user" }),
    );
  }

  const aMembers = [...tenantAplayerMemberships, ...sharedAmembers]; // 30
  const bMembers = [...tenantBplayerMemberships, ...sharedBmembers]; // 25

  // 4 guests on tenant A
  for (let i = 1; i <= 4; i++) {
    const name = `Stress Guest A${pad(i)}`;
    const personId = await ensurePerson({
      displayName: name,
      isGuest: true,
    });
    await ensureMembership({
      tenantId: TENANT_A_ID,
      personId,
      role: "guest",
      isGuest: true,
    });
  }

  // ---- Venues ----
  const venueA1 = await ensureVenue(TENANT_A_ID, "Stress Pitch North");
  await ensureVenue(TENANT_A_ID, "Stress Pitch South");
  const venueB1 = await ensureVenue(TENANT_B_ID, "Stress Astro 1");
  await ensureVenue(TENANT_B_ID, "Stress Astro 2");
  await ensureVenue(TENANT_B_ID, "Stress Astro 3");

  // ---- Matches ----
  // 5 historical for A
  for (let i = 0; i < 5; i++) {
    const startsAt = new Date(Date.now() - (i + 1) * 6 * 24 * 60 * 60 * 1000);
    const reds = aMembers.slice(i * 6, i * 6 + 6);
    const blues = aMembers.slice(i * 6 + 6, i * 6 + 12);
    if (reds.length < 6 || blues.length < 6) continue;
    await ensureClosedMatch({
      tenantId: TENANT_A_ID,
      venueId: venueA1,
      title: `Stress A · Past Match #${i + 1}`,
      startsAt,
      fee: "8.00",
      currency: "GBP",
      redMembers: reds,
      blueMembers: blues,
      redScore: Math.floor(Math.random() * 5),
      blueScore: Math.floor(Math.random() * 5),
      creatorMembershipId: adminAmembership,
    });
  }

  // 4 historical for B
  for (let i = 0; i < 4; i++) {
    const startsAt = new Date(Date.now() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
    const reds = bMembers.slice(i * 6, i * 6 + 6);
    const blues = bMembers.slice(i * 6 + 6, i * 6 + 12);
    if (reds.length < 6 || blues.length < 6) continue;
    await ensureClosedMatch({
      tenantId: TENANT_B_ID,
      venueId: venueB1,
      title: `Stress B · Past Match #${i + 1}`,
      startsAt,
      fee: "10.00",
      currency: "USD",
      redMembers: reds,
      blueMembers: blues,
      redScore: Math.floor(Math.random() * 5),
      blueScore: Math.floor(Math.random() * 5),
      creatorMembershipId: adminBmembership,
    });
  }

  // ---- Some payments to relieve a few players from debt ----
  const paymentTargets = aMembers.slice(0, 3);
  for (const m of paymentTargets) {
    await client.query(
      `INSERT INTO ledger_transactions
         (tenant_id, membership_id, transaction_type, direction, amount, currency_code,
          description, recorded_by_membership_id)
       VALUES ($1, $2, 'payment', 'credit', '40.00', 'GBP', 'Stress seed payment', $3)
       ON CONFLICT DO NOTHING`,
      [TENANT_A_ID, m, adminAmembership],
    );
  }

  console.log("[seed-stress] done.");
  console.log(`  Stress FC A : 30 players · adminAmembership=${adminAmembership}`);
  console.log(`  Stress FC B : 25 players · adminBmembership=${adminBmembership}`);
  console.log("  Login: Test1234! (admin/asst stress.* accounts)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => client.end());
