# Match Club — $0 / month deployment guide

End-to-end recipe for deploying Match Club to a real public URL **with
no money out of pocket and no credit card**. Total wall-clock time:
~30 minutes.

| Layer | Service | Free tier |
| --- | --- | --- |
| App hosting | **Vercel Hobby** | Unlimited Next.js builds, automatic HTTPS, free `*.vercel.app` subdomain |
| DB + Auth + Realtime | **Supabase Cloud Free** | 500 MB Postgres, 50 k monthly active users, daily backups |
| Cron trigger | **cron-job.org** | Hits a URL on whatever schedule you set (every minute is fine) |
| SMTP (password reset, invites) | **Resend** | 100 emails/day, 3 000/month |
| Domain + HTTPS | Vercel default | `your-app.vercel.app`, auto TLS |
| VAPID push keys | local CLI | Generated once, free |

> **Why not use Vercel's built-in cron?** Vercel Hobby caps cron jobs at
> **one execution per day**. Match Club's `/api/cron` wants to run every
> minute (rating-lock-sweep, match-starting-soon). We bypass the limit
> by pointing **cron-job.org** at the same endpoint.

> **Supabase Free pauses after 1 week of inactivity.** A single login or
> a daily cron hit is enough to keep it awake. The cron-job.org schedule
> below already does this for you.

---

## Step 0 — Push the repo to GitHub

Vercel deploys from a Git repo. If your project isn't on GitHub yet:

```bash
gh repo create match-club --private --source=. --push
# or use the GitHub web UI to create an empty repo and push
```

Make sure `.env.local` is gitignored (it is in this repo).

---

## Step 1 — Create the Supabase project

1. Go to **https://supabase.com** → **Start your project** → sign in
   with GitHub.
2. Click **New project**:
   - Name: `match-club`
   - Database password: generate a strong one and **save it**
   - Region: closest to your users
   - Pricing plan: **Free**
3. Wait ~2 minutes for the project to provision.
4. Once it's up, grab these from **Project Settings → API**:
   - `Project URL` → this is your `NEXT_PUBLIC_SUPABASE_URL`
   - `anon` key → this is your `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → this is your `SUPABASE_SERVICE_ROLE_KEY`
     (treat this like a password)
5. From **Project Settings → Database** copy the **Connection string**
   under "Direct connection" — this is your `DATABASE_URL`. Replace
   `[YOUR-PASSWORD]` with the DB password from step 2.

### 1a — Apply the schema and migrations

From your local machine:

```bash
# 1. Schema (tables, RLS, functions, indexes, views)
psql "$DATABASE_URL" -f .claude/schema.sql

# 2. Migrations (system owner role, fund collections, realtime publication)
for f in supabase/migrations/*.sql; do
  echo "applying $f"
  psql "$DATABASE_URL" -f "$f"
done
```

If `psql` complains about SSL, append `?sslmode=require` to the
`DATABASE_URL`.

### 1b — Seed the system owner

Pick credentials you'll remember, then:

```bash
DATABASE_URL="postgresql://...your-prod-url..." \
OWNER_EMAIL=owner@yourdomain.com \
OWNER_PASSWORD='MatchClub.2026!Secure' \
OWNER_DISPLAY_NAME='Your Name' \
  npx tsx scripts/seed-production-owner.ts
```

The script wipes any test data and creates exactly one
`is_system_owner=true` account.

> If you want a non-default password, generate the bcrypt hash and add
> it to `KNOWN_PASSWORDS` in the script first:
>
> ```bash
> python3 -c "import bcrypt; print(bcrypt.hashpw(b'YourPwd!', bcrypt.gensalt(10)).decode())"
> ```

### 1c — Enable Realtime publication

The migration in `supabase/migrations/20260410010000_realtime.sql`
takes care of this automatically. Verify under **Database → Replication
→ supabase_realtime** that the 10 tables are listed.

---

## Step 2 — Generate VAPID keys

```bash
npx web-push generate-vapid-keys
```

You'll get a public + private base64url pair. Keep both — you'll paste
them into Vercel env vars in the next step.

---

## Step 3 — Set up Resend (SMTP for password reset)

1. Go to **https://resend.com** → sign up with GitHub, no credit card.
2. Verify your email.
3. **Domains → Add Domain** → enter the domain you want to send from.
   - If you don't have a domain, Resend gives you a sandbox sender
     `onboarding@resend.dev` which works for testing but mails go to a
     spam folder. For real users, use a real domain (Cloudflare gives
     you DNS for free).
4. **API Keys → Create API Key** → save it.
5. **In the Supabase dashboard** → **Authentication → Email →
   SMTP Settings** → enable custom SMTP and paste:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the API key from step 4
   - Sender email: `noreply@yourdomain.com` (or `onboarding@resend.dev`)
   - Sender name: `Match Club`
6. Hit **Save** and **Send test email** to confirm it works.

---

## Step 4 — Deploy to Vercel

1. Go to **https://vercel.com** → sign in with GitHub.
2. **Add New → Project** → import your `match-club` repo.
3. Framework preset: **Next.js** (auto-detected).
4. Root directory: `./` (default).
5. Build command: `npm run build` (default).
6. Output directory: `.next` (default).
7. **Environment variables** — add ALL of these (Production scope):

   ```
   NEXT_PUBLIC_SUPABASE_URL          = https://<ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY     = eyJ...anon...
   SUPABASE_SERVICE_ROLE_KEY         = eyJ...service_role...
   DATABASE_URL                      = postgresql://postgres:[pwd]@db.<ref>.supabase.co:5432/postgres?sslmode=require
   APP_URL                           = https://<your-vercel-subdomain>.vercel.app
   NEXT_PUBLIC_VAPID_PUBLIC_KEY      = BB...
   VAPID_PUBLIC_KEY                  = BB...                  (same as above)
   VAPID_PRIVATE_KEY                 = ...
   VAPID_SUBJECT                     = mailto:owner@yourdomain.com
   CRON_SECRET                       = <32+ char random string>
   ```

   To generate `CRON_SECRET`:
   `openssl rand -hex 32`

8. Click **Deploy**. First build takes ~2 minutes.
9. Visit `https://<your-app>.vercel.app/login` and log in with the
   owner credentials from Step 1b.

> **Important**: `NEXT_PUBLIC_*` env vars are baked into the client
> bundle at build time. If you change one later, you must trigger a
> redeploy from the Vercel dashboard.

---

## Step 5 — Schedule the cron via cron-job.org

1. Go to **https://cron-job.org** → sign up (free).
2. **Cronjobs → Create cronjob**:
   - Title: `Match Club /api/cron`
   - URL: `https://<your-app>.vercel.app/api/cron`
   - Schedule: **Every 1 minute**
   - **Advanced → Headers** → add header:
     - Name: `Authorization`
     - Value: `Bearer <YOUR_CRON_SECRET>` (the same value you set in
       Vercel)
3. Save and enable.
4. Open the job's history view to confirm `200 OK` responses.

This runs three jobs every minute:
- `rating-lock-sweep` — locks expired teammate ratings
- `match-starting-soon` — sends "match starts in 1 hour" notifications
- `guest-eligibility` — flags guests with 3+ played matches for
  promotion review

---

## Step 6 — Generate web push keys (browser, post-deploy)

1. Open the deployed site → log in.
2. Go to **Profile**.
3. Click **Enable push notifications**.
4. Browser asks for permission → **Allow**.
5. Confirmation toast: "Push notifications enabled".
6. Optional smoke test from your local machine:
   ```bash
   DATABASE_URL="postgresql://...prod..." \
     npx tsx scripts/debug-push.ts
   ```
   You should see a banner on your laptop within 1–2 seconds.

---

## Step 7 — First-tenant walkthrough

Once you're logged in as the system owner:

1. `/owner/tenants` → **+ Create tenant** → name your group, pick a
   currency, hit save.
2. The new tenant gets an admin invite link automatically generated.
   Copy it from the tenant detail page and send it to the first admin.
3. They register through that link → they're auto-promoted to admin.
4. Admin creates venues, members, the first match, and the rest is the
   normal product flow.

---

## Step 8 — Cost and limits to watch

| Limit | Free tier | When you'll hit it |
| --- | --- | --- |
| Vercel bandwidth | 100 GB/month | Probably never on a club app |
| Vercel function executions | 6 000 GB-hours/month | Never |
| Supabase DB | 500 MB | After ~10 000 matches with full ratings |
| Supabase realtime msgs | 2 GB/month | We use polling instead, so ~0 |
| Supabase pause | Inactive for 7 days | The cron-job hit prevents this |
| Resend emails | 100/day, 3 000/month | Plenty for invites + resets |
| cron-job.org | 50 jobs / 1 min interval | Plenty |

If any of these become a problem the upgrade path is:

- **Vercel Pro**: $20/month per user — only needed if you go commercial.
- **Supabase Pro**: $25/month — gets you 8 GB DB and 50 GB bandwidth.
- **Resend Pro**: $20/month — 50 000 emails/month.

---

## Step 9 — Custom domain (optional, free)

If you have a domain registered (Namecheap, Porkbun, etc.):

1. Vercel project → **Settings → Domains → Add**
2. Enter your domain → Vercel gives you DNS records to add.
3. Add the records at your registrar.
4. After DNS propagates (~5 minutes), Vercel auto-issues a TLS cert.
5. Update `APP_URL` env var to the new domain → redeploy.

If you don't have a domain, the `your-app.vercel.app` subdomain is
free, fast, and HTTPS-secured.

---

## Step 10 — Smoke test checklist

After deploy, tick these off:

- [ ] `https://your-app.vercel.app/login` renders, no console errors.
- [ ] Owner login → lands on `/owner/dashboard`.
- [ ] Theme toggle: Light / Dark / System.
- [ ] Language toggle: EN / TR / ES.
- [ ] Create a tenant → `/owner/tenants` shows it.
- [ ] Invite link works (open in incognito → register → land in tenant).
- [ ] `curl -H "Authorization: Bearer $CRON_SECRET" https://...vercel.app/api/cron`
      returns `{"ok":true,...}`. Without the header → `401`.
- [ ] Forgot password sends an email via Resend.
- [ ] Push: enable from `/profile`, fire a test push from your local
      machine via `scripts/debug-push.ts` against the prod DATABASE_URL,
      banner appears on your phone or laptop.

If everything's green: **you're live, $0/month**. 🎉

---

## Step 11 — What's NOT free forever

The plan above stays $0 until **one** of these happens:

1. **DB > 500 MB** — typically after thousands of matches with full
   ratings + push subscriptions. Bump to Supabase Pro ($25/month).
2. **Vercel bandwidth > 100 GB/month** — would mean ~5 million page
   views. Not realistic for a club app.
3. **Resend > 3 000 emails/month** — would mean ~100 password
   resets/day. Bump to Resend Pro ($20/month).
4. **You start charging users** — Vercel Hobby is non-commercial. Bump
   to Vercel Pro ($20/month per editor).

For a single 30-player football group, you'll never hit any of these.
For a 5-tenant amateur league, you might brush against #1 in 2-3 years.

---

## TL;DR

```bash
# 1. Push repo to GitHub
gh repo create match-club --private --source=. --push

# 2. Create Supabase project at supabase.com → grab DATABASE_URL +
#    keys → apply schema/migrations/owner-seed
psql "$DATABASE_URL" -f .claude/schema.sql
for f in supabase/migrations/*.sql; do psql "$DATABASE_URL" -f "$f"; done
DATABASE_URL=... OWNER_EMAIL=... OWNER_PASSWORD=... \
  npx tsx scripts/seed-production-owner.ts

# 3. Generate VAPID
npx web-push generate-vapid-keys

# 4. Sign up at resend.com → get API key → paste into Supabase Auth
#    SMTP settings

# 5. Sign in to vercel.com → import the repo → paste env vars → Deploy

# 6. Sign up at cron-job.org → schedule
#    https://your-app.vercel.app/api/cron every 1 minute
#    with header "Authorization: Bearer <CRON_SECRET>"

# 7. Visit your site → login with the owner creds → done.
```

Total spent: **$0**.
