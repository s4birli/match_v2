/**
 * Bulk user importer.
 *
 * Reads a JSON file describing users + their tenant memberships and inserts
 * them into the local Supabase database. Idempotent on (email, tenant_slug):
 * re-running the same input file is a no-op.
 *
 * Usage:
 *   npx tsx scripts/import-users.ts <path-to-json>
 *
 * JSON shape (the importer accepts either):
 *
 *   // Form A — flat list
 *   [
 *     {
 *       "email": "ali@example.com",        // optional for guests
 *       "displayName": "Ali Kaya",         // required
 *       "tenantSlug": "stress-fc-a",       // tenant the membership goes to
 *       "role": "user",                    // user|admin|assistant_admin|guest
 *       "isGuest": false,                  // optional, defaults from role
 *       "password": "Test1234!",           // optional; if absent + email
 *                                          // present, the importer creates
 *                                          // an auth.users row using the
 *                                          // built-in Test1234! hash so
 *                                          // logins still work.
 *       "positions": ["midfield", "forward"]   // optional position prefs
 *     },
 *     ...
 *   ]
 *
 *   // Form B — grouped by tenant
 *   {
 *     "tenants": [
 *       {
 *         "slug": "stress-fc-a",
 *         "users": [ { "email": "...", "displayName": "...", "role": "..." }, ... ]
 *       },
 *       ...
 *     ]
 *   }
 *
 * Multi-group: if the same email appears under multiple tenantSlugs, the
 * importer reuses the same `persons` row across all of them — that's how
 * a single player can play in two clubs while keeping one identity
 * (CLAUDE.md: "Same person can belong to multiple groups").
 *
 * Stress / smoke teardown DOES NOT clean these rows. Pick distinctive
 * email prefixes if you want them auto-cleaned later.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const TEST_PASSWORD_HASH =
  "$2b$10$0c358zLo5Fr2SXFu6hnQlu7VQfyqK5QwWHPGI77OcXLEOoZPv2GyO";

type Role = "user" | "admin" | "assistant_admin" | "guest";

type UserRecord = {
  email?: string | null;
  displayName: string;
  tenantSlug: string;
  role?: Role;
  isGuest?: boolean;
  password?: string;
  positions?: string[];
};

type GroupedInput = {
  tenants: Array<{
    slug: string;
    users: Omit<UserRecord, "tenantSlug">[];
  }>;
};

type FlatInput = UserRecord[];

function loadInput(path: string): UserRecord[] {
  const raw = readFileSync(resolve(path), "utf-8");
  const parsed = JSON.parse(raw) as FlatInput | GroupedInput;
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object" && Array.isArray(parsed.tenants)) {
    return parsed.tenants.flatMap((t) =>
      (t.users ?? []).map((u) => ({ ...u, tenantSlug: t.slug })),
    );
  }
  throw new Error(
    "Unrecognized JSON shape. Expect a flat array of UserRecord or { tenants: [...] }.",
  );
}

async function findTenantBySlug(client: Client, slug: string): Promise<string | null> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM tenants WHERE slug = $1 LIMIT 1`,
    [slug],
  );
  return rows[0]?.id ?? null;
}

async function ensureAuthUser(
  client: Client,
  email: string,
  displayName: string,
  passwordHash: string,
): Promise<string> {
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
    [id, email, passwordHash, displayName],
  );
  return id;
}

async function ensureAccount(
  client: Client,
  authUserId: string,
  email: string,
): Promise<string> {
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

async function ensurePerson(
  client: Client,
  opts: {
    email?: string | null;
    displayName: string;
    primaryAccountId?: string | null;
    isGuest?: boolean;
  },
): Promise<string> {
  // Multi-group rule: a person with a real email is identified by that
  // email so the same row is reused across tenants. Persons without an
  // email (pure guests) are de-duped by display_name only.
  if (opts.email) {
    const { rows: byEmail } = await client.query<{ id: string }>(
      `SELECT id FROM persons WHERE email = $1 LIMIT 1`,
      [opts.email],
    );
    if (byEmail[0]) {
      // Backfill primary_account_id if it was NULL (e.g. created earlier
      // as a guest, now becoming a real account).
      if (opts.primaryAccountId) {
        await client.query(
          `UPDATE persons SET primary_account_id = $1
            WHERE id = $2 AND primary_account_id IS NULL`,
          [opts.primaryAccountId, byEmail[0].id],
        );
      }
      return byEmail[0].id;
    }
  } else {
    const { rows: byName } = await client.query<{ id: string }>(
      `SELECT id FROM persons
        WHERE display_name = $1
          AND email IS NULL
        LIMIT 1`,
      [opts.displayName],
    );
    if (byName[0]) return byName[0].id;
  }

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

async function ensureMembership(
  client: Client,
  opts: {
    tenantId: string;
    personId: string;
    role: Role;
    isGuest?: boolean;
  },
): Promise<{ id: string; created: boolean }> {
  const { rows: existing } = await client.query<{ id: string }>(
    `SELECT id FROM memberships WHERE tenant_id = $1 AND person_id = $2`,
    [opts.tenantId, opts.personId],
  );
  if (existing[0]) return { id: existing[0].id, created: false };
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO memberships
       (tenant_id, person_id, role, status, stats_visibility,
        is_guest_membership, joined_at)
     VALUES ($1, $2, $3, 'active', 'included', $4, now())
     RETURNING id`,
    [opts.tenantId, opts.personId, opts.role, opts.isGuest ?? false],
  );
  return { id: rows[0].id, created: true };
}

async function setPositionPreferences(
  client: Client,
  membershipId: string,
  positions: string[],
): Promise<void> {
  await client.query(
    `DELETE FROM position_preferences WHERE membership_id = $1`,
    [membershipId],
  );
  if (positions.length === 0) return;
  for (let i = 0; i < positions.length; i++) {
    await client.query(
      `INSERT INTO position_preferences (membership_id, position_code, priority_rank)
       VALUES ($1, $2, $3)`,
      [membershipId, positions[i], i + 1],
    );
  }
}

async function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error("Usage: npx tsx scripts/import-users.ts <path-to-json>");
    process.exit(2);
  }

  const records = loadInput(inputPath);
  console.log(`[import-users] loaded ${records.length} record(s) from ${inputPath}`);

  const url =
    process.env.DATABASE_URL ??
    "postgresql://postgres:postgres@127.0.0.1:64322/postgres";
  const client = new Client({ connectionString: url });
  await client.connect();

  let createdMemberships = 0;
  let reusedMemberships = 0;
  let createdAuthUsers = 0;
  const tenantsTouched = new Set<string>();
  const errors: Array<{ record: UserRecord; error: string }> = [];

  try {
    for (const r of records) {
      try {
        if (!r.displayName || !r.tenantSlug) {
          throw new Error("displayName and tenantSlug are required");
        }
        const tenantId = await findTenantBySlug(client, r.tenantSlug);
        if (!tenantId) {
          throw new Error(`Tenant slug "${r.tenantSlug}" not found`);
        }
        tenantsTouched.add(r.tenantSlug);

        let primaryAccountId: string | null = null;
        if (r.email) {
          // Bcrypt the supplied password? We use the seed hash for everyone
          // who didn't pass an explicit hash so all imports share Test1234!
          // unless the JSON includes a pre-hashed string under
          // `password` (advanced).
          const passwordHash = r.password ?? TEST_PASSWORD_HASH;
          const authUserBefore = await client.query<{ id: string }>(
            `SELECT id FROM auth.users WHERE email = $1`,
            [r.email],
          );
          const authUserId = await ensureAuthUser(
            client,
            r.email,
            r.displayName,
            passwordHash,
          );
          if (authUserBefore.rowCount === 0) createdAuthUsers++;
          primaryAccountId = await ensureAccount(client, authUserId, r.email);
        }

        const personId = await ensurePerson(client, {
          email: r.email ?? null,
          displayName: r.displayName,
          primaryAccountId,
          isGuest: r.isGuest ?? r.role === "guest",
        });

        const role: Role = r.role ?? "user";
        const m = await ensureMembership(client, {
          tenantId,
          personId,
          role,
          isGuest: r.isGuest ?? role === "guest",
        });
        if (m.created) createdMemberships++;
        else reusedMemberships++;

        if (r.positions && r.positions.length > 0) {
          await setPositionPreferences(client, m.id, r.positions);
        }
      } catch (err) {
        errors.push({
          record: r,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  } finally {
    await client.end();
  }

  console.log(
    `[import-users] done · ${createdMemberships} new membership(s), ${reusedMemberships} already-existed, ${createdAuthUsers} new auth user(s) across ${tenantsTouched.size} tenant(s)`,
  );
  if (errors.length > 0) {
    console.error(`[import-users] ${errors.length} error(s):`);
    for (const e of errors) {
      console.error(
        `  - ${e.record.displayName} (${e.record.email ?? "no-email"} → ${e.record.tenantSlug}): ${e.error}`,
      );
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
