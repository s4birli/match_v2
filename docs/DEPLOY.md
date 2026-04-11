# Match Club — Production Deployment Guide

This is the minimum-set checklist to take a fresh server from zero to a
running Match Club deployment.

> **Current local state**: the database has been wiped and seeded with a
> single system_owner account via `scripts/seed-production-owner.ts`.
> Use it as the template for the real production DB.

---

## 0. What you're deploying

- **App**: Next.js 16 (App Router, Turbopack dev / standard build for
  prod) listening on port `3737`.
- **Database + auth + realtime**: Supabase (hosted or self-hosted).
- **Push delivery**: VAPID web push via the `web-push` npm package.
- **Cron**: a single endpoint at `/api/cron` protected by a Bearer
  secret.

---

## 1. Provision

1. **Server**: any Node 22+ host. The app is small enough for a
   $5/month VPS or a Vercel project. If you go VPS, use `pm2` or
   systemd.
2. **Supabase**: either
   - **Hosted Supabase** (recommended): create a new project at
     supabase.com. Note the project URL, anon key, service-role key.
   - **Self-hosted**: spin up the standard supabase docker-compose. Use
     the same env shape.
3. **Domain + HTTPS**: web push **requires HTTPS** outside `localhost`.
   Cloudflare, Caddy, or Vercel auto-provisions. Without HTTPS,
   `pushManager.subscribe()` will throw on every browser.

---

## 2. Environment variables

Create `.env.local` (or set them in Vercel / your host's env panel):

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key from Supabase dashboard>
SUPABASE_SERVICE_ROLE_KEY=<service role key from Supabase dashboard>
DATABASE_URL=postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres

# App URL — must match how the user reaches the site, used by the
# password-reset and invite-link flows.
APP_URL=https://matchclub.example.com

# VAPID — generate one set per environment via:
#   npx web-push generate-vapid-keys
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<base64url public key>
VAPID_PUBLIC_KEY=<same as NEXT_PUBLIC_VAPID_PUBLIC_KEY>
VAPID_PRIVATE_KEY=<base64url private key>
VAPID_SUBJECT=mailto:owner@matchclub.example.com

# Cron auth — generate a long random string and use the SAME value when
# scheduling /api/cron.
CRON_SECRET=<random 32+ char secret>
```

`NEXT_PUBLIC_*` vars are baked into the client bundle at build time, so
**rebuild after changing them**.

---

## 3. Database bootstrap

Run, in order, against the production database:

```bash
# 1. Apply schema (tables, RLS policies, functions, indexes, views)
psql "$DATABASE_URL" -f .claude/schema.sql

# 2. Apply migrations on top (system owner role, fund collections,
#    realtime publication, etc.)
for f in supabase/migrations/*.sql; do
  echo "applying $f"
  psql "$DATABASE_URL" -f "$f"
done

# 3. Seed the system owner. This wipes any existing data and creates
#    exactly one account.
OWNER_EMAIL=owner@matchclub.example.com \
OWNER_PASSWORD='MatchClub.2026!Secure' \
OWNER_DISPLAY_NAME='System Owner' \
  npx tsx scripts/seed-production-owner.ts
```

The script prints the email + password once at the end. **Save them
somewhere safe and change the password from inside the app on first
login** (`/profile` or the password-reset flow).

If you want a different password than the default, generate a bcrypt
hash and add it to `KNOWN_PASSWORDS` inside the script:

```bash
python3 -c "import bcrypt; print(bcrypt.hashpw(b'YourNewPassword!', bcrypt.gensalt(rounds=10)).decode())"
```

---

## 4. Build and run the app

```bash
# Install
npm ci

# Build
npm run build

# Start
npm run start    # listens on PORT 3737
```

Reverse-proxy `:3737` behind your TLS terminator (Caddy/Nginx/Vercel).

---

## 5. Cron schedule

The single cron endpoint runs three jobs (rating-lock-sweep,
match-starting-soon, guest-eligibility) and is idempotent. Hit it every
minute.

**On Vercel** (`vercel.json`):

```json
{
  "crons": [
    {
      "path": "/api/cron",
      "schedule": "* * * * *"
    }
  ]
}
```

The Vercel cron sends an `Authorization: Bearer <CRON_SECRET>` header
automatically when the env var is named `CRON_SECRET`.

**On a VPS** (crontab):

```cron
* * * * * curl -sH "Authorization: Bearer <CRON_SECRET>" https://matchclub.example.com/api/cron > /dev/null
```

---

## 6. Email (forgot password / invites)

Supabase Auth needs an SMTP provider for the password-reset email and
the invite-by-email flow. Configure it in **Supabase Dashboard →
Authentication → Email Templates → SMTP Settings**:

- Resend, Postmark, SendGrid, AWS SES — any standard SMTP works.
- Sender address must match the domain you're sending from to avoid
  bouncing.
- Test by triggering `/forgot-password` and verifying the email arrives.

Without SMTP, the in-app `forgotPasswordAction` returns success but no
mail is sent.

---

## 7. First login

1. Visit `https://matchclub.example.com/login`.
2. Email: the value of `OWNER_EMAIL`.
3. Password: the value of `OWNER_PASSWORD`.
4. You land on `/owner/dashboard` because the account is
   `is_system_owner = true`.
5. Go to `/profile` and **change the password** via the profile form.
   (Or run the password-reset flow and set a new one — that gives you a
   recovery audit log entry, more secure.)
6. Create your first tenant (group) from `/owner/tenants`.
7. Generate an admin invite link from inside the tenant detail page and
   share it with the group's first admin.

---

## 8. Smoke test checklist

Tick these off after deploy:

- [ ] `https://matchclub.example.com/login` renders without console
      errors.
- [ ] Login as owner → lands on `/owner/dashboard`.
- [ ] `/owner/tenants` shows zero tenants.
- [ ] Create a tenant → succeeds.
- [ ] Open the tenant → invite link works.
- [ ] Theme toggle (top-right) switches Light / Dark / System.
- [ ] Language toggle (top-right) switches EN / TR / ES.
- [ ] `/api/cron` returns 200 with the Bearer secret, 401 without.
- [ ] (Optional, push) Enable push from `/profile` and trigger a test
      notification.

---

## 9. What's NOT in the bootstrap

These are intentionally LEFT OFF the production seed and need to be
created from inside the app or via a follow-up SQL run:

- **Tenants** — create from `/owner/tenants` after first login.
- **Admins / users** — invited via tenant detail page or imported via
  `scripts/import-users.ts` (see comments in that file for the JSON
  shape).
- **Venues** — created from `/admin/venues` once a tenant has an admin.
- **Demo / test data** — never on prod. The local dev DB has its own
  seed at `.claude/seed.sql` that's gitignored from production.

---

## 10. Production hardening leftovers

These were noted in `docs/AUDIT.md` and are still on the deferred queue
for the next pass:

- Real rate-limiter backend (currently in-memory; swap for Upstash
  Ratelimit / Vercel KV / Redis if you run multiple replicas).
- Stricter CSP header (currently relies on Next.js defaults).
- Push subscription cleanup cron (rows where `is_active = false` for
  more than 30 days can be deleted).

These are not blockers for going live with a single server, single
tenant, low-volume deployment.
