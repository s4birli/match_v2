# Match Club — End-to-end test scenarios

This file is the source of truth for the comprehensive UI / UX / data
integrity testing pass the user requested. The seed script
`scripts/seed-stress.ts` builds the world below; the spec
`tests/e2e/stress.spec.ts` drives the critical scenarios end-to-end; and
`docs/FINDINGS.md` records anything that fails or feels off so we can
review together.

> **Important**: the stress users are NOT cleaned up by the global teardown.
> Their email pattern is `stress.<name>@example.com` and the tenants are
> named `Stress FC A` / `Stress FC B`. This is intentional — the user
> explicitly asked us to preserve them so they can re-drive the same
> failing flow themselves.

---

## 1. World setup (seed-stress.ts)

### 1.1 Tenants
- **Stress FC A** (slug `stress-fc-a`, currency `GBP`, default match fee
  `£8.00`) — 30 active members.
- **Stress FC B** (slug `stress-fc-b`, currency `USD`, default match fee
  `$10.00`) — 25 active members.

### 1.2 People
- 5 "shared" players exist on BOTH tenants (`stress.shared01..05@example.com`)
  with the SAME persons row attached to two memberships. This validates
  the multi-group rule from CLAUDE.md.
- 25 single-tenant players for A (`stress.a01..25@example.com`).
- 20 single-tenant players for B (`stress.b01..20@example.com`).
- 1 admin per tenant: `stress.admin.a@example.com`, `stress.admin.b@example.com`.
- 1 assistant admin per tenant: `stress.asst.a@example.com`, `stress.asst.b@example.com`.
- 4 guests on tenant A (`stress.guest.a01..04`) — admin will convert one.

### 1.3 Venues
- Tenant A: "Stress Pitch North", "Stress Pitch South".
- Tenant B: "Stress Astro 1", "Stress Astro 2", "Stress Astro 3".

### 1.4 Matches
- Tenant A: 5 historical (closed) matches in the last 30 days, 2 upcoming.
- Tenant B: 4 historical, 1 upcoming.
- Closed matches have results, ratings, MOTM votes, and ledger fee debits
  applied to played participants.

### 1.5 Wallet state
- Some players are in negative balance (overdue), some positive
  (overpaid), most flat.
- Tenant A has one **fund collection** (`Equipment Box · 2026-04`) charging
  10 random members £5 each.

### 1.6 Notifications
- Each played-and-rated participant has a `wallet_updated` and
  `post_match_rating_open` notification.

---

## 2. Scenarios driven by stress.spec.ts

Each scenario asserts (a) the action succeeds, (b) the resulting state is
visible in the UI for the appropriate roles, and (c) the state is *invisible*
to the wrong role (privacy + tenant isolation).

### 2.1 Auth & language
- [ ] Login as `stress.admin.a` → lands on `/admin/dashboard`.
- [ ] Toggle TR → page renders Turkish strings (`Anasayfa`, `Maçlar`).
- [ ] Toggle EN → restored.
- [ ] Logout → cookies cleared (`locale`, `active_tenant`).
- [ ] Re-login as a different user → previous user's TR cookie does NOT
  bleed through.
- [ ] Forgot-password form renders without crashing.

### 2.2 Tenant isolation (CLAUDE.md non-negotiable)
- [ ] `stress.admin.a` cannot reach `stress-fc-b` admin pages.
- [ ] `stress.admin.b` cannot see Stress FC A members in `/admin/members`.
- [ ] A shared player (`stress.shared01`) sees BOTH tenants in their group
  switcher.
- [ ] Owner can list both tenants from `/owner/tenants`.

### 2.3 Membership lifecycle
- [ ] Admin creates a guest player.
- [ ] Admin converts the guest → invite link generated. Hitting the link in
  a fresh incognito session and registering preserves match history.
- [ ] Admin archives a member → hidden from active members list but
  appears under Archived.
- [ ] Admin restores → can choose include/exclude from stats.
- [ ] Multi-group player exists on both tenants without duplication.

### 2.4 Match lifecycle
- [ ] Admin creates match in past (backdated by 2h) → 6v6 / Stress Pitch.
- [ ] Admin adds 12 participants, assigns 6 red / 6 blue.
- [ ] Pre-match poll renders only after both teams full.
- [ ] Played player votes on the winner.
- [ ] Admin closes match with score 3–2 → ledger debits all played
  participants the match fee.
- [ ] Notification `post_match_rating_open` lands for played players.

### 2.5 Attendance edge cases
- [ ] Regular user (not added by admin) cannot self-add to a match.
- [ ] Regular user pulls themselves to **reserve**.
- [ ] Regular user **declines**.
- [ ] User toggles between reserve and declined repeatedly.
- [ ] User cannot directly set themselves to `confirmed` or `played`.

### 2.6 Ratings & MOTM
- [ ] Played participant submits ratings for their teammates only — server
  rejects rating opponents and rejects self-rating.
- [ ] MOTM vote works for any played player from either team, NOT for self.
- [ ] Rating window of 1 minute is enforced (server returns
  `editWindowExpired` after).
- [ ] Raw rating values are NOT visible anywhere — only aggregate average
  on /stats and /admin/members/[id].
- [ ] Admin viewing a player detail page sees only the average, never
  per-rater scores.

### 2.7 Finance / wallet / ledger
- [ ] Admin records a £20 cash payment for a debt-holding player → balance
  flips to positive, player wallet shows the credit row.
- [ ] Admin sends payment reminder to a debtor → notification appears for
  the player.
- [ ] Reminder action refuses to send if balance >= 0 (`notInDebt`).
- [ ] Admin opens a fund collection charging 6 members £4 each → 6 ledger
  debit rows with `reason_code='fund'`, all 6 players get a wallet
  notification.
- [ ] Owner /owner/ledger lists all transactions across both tenants
  (regression for the FK ambiguity bug).
- [ ] Assistant admin CANNOT see /admin/payments or wallet management.

### 2.8 Stats / leaderboards / analytics
- [ ] User sees their own avg rating on /dashboard AND /stats.
- [ ] User sees their MOTM count on /dashboard.
- [ ] Admin clicks any leaderboard row on /admin/stats → lands on
  `/admin/members/[id]` with full per-player drill-in (works for
  assistant_admin too).
- [ ] Pair chemistry section has rows after at least 2 shared matches.
- [ ] Cash-flow card shows positive collection rate.

### 2.9 Notifications
- [ ] /notifications page renders for the logged-in user with the seeded
  rows.
- [ ] Notification text is localized in TR when locale=tr.

### 2.10 PWA / offline / errors
- [ ] /offline page renders without a session.
- [ ] /not-found renders for an unknown route.
- [ ] error.tsx fallback renders if a server component throws.
- [ ] Service worker manifest is served at /manifest.webmanifest.

### 2.11 Mobile / responsive
- [ ] iPhone SE (375×667): bottom nav shows all primary items, no
  horizontal scroll on dashboard, /admin/matches, /admin/payments,
  /admin/stats.
- [ ] iPad portrait (768×1024): sidebar still hidden until lg breakpoint,
  layout grids reflow.
- [ ] Desktop 1440×900: sidebar visible, all stats grids fill.

### 2.12 Security smoke
- [ ] Direct fetch to `/api/...` (if any) without a session returns 401 /
  redirects.
- [ ] Direct GET to /admin/dashboard as a regular user → server-side
  redirect.
- [ ] Direct GET to /owner/dashboard as an admin → server-side redirect.
- [ ] Cookie inspection: `locale` is plain (no PII), `active_tenant` is a
  UUID, no auth tokens in localStorage.
- [ ] localStorage check: only PWA-related keys (no auth secrets, no PII).
- [ ] Page source does NOT contain raw rating rows or per-rater details.

### 2.13 Monkey test
- [ ] Existing monkey.spec.ts passes (clicks every safe control on every
  user-facing page).
- [ ] Extended monkey: also visit /admin/* and /owner/* as the right roles
  and click every visible button — record any 500/console errors.

---

## 3. Findings

Findings are recorded in `docs/FINDINGS.md` after the run. Each entry has
a severity (`blocker` / `major` / `minor` / `polish`) and a reproduction
recipe.
