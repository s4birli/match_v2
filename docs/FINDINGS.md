# Match Club — Comprehensive UI/UX Test Findings

Run date: 2026-04-09
Test universe: Stress FC A (30 players) + Stress FC B (25 players) +
5 multi-group shared players + 4 guests on FC A, seeded by
`scripts/seed-stress.ts`. World contains 7 closed historical matches,
~420 teammate ratings, MOTM votes, and ledger fee debits.

Test runs:
- `npx playwright test` → **25 / 25 passing** (the 18 pre-existing
  smokes + 7 new stress scenarios).
- `npx tsc --noEmit` → clean.
- Existing monkey.spec.ts + new stress monkey both green.

This file is the place to drop **anything that isn't working**, with a
severity tag, a recipe, and a proposed fix. Empty sections mean "no
issues found in that area during this run."

Severity scale: `blocker` / `major` / `minor` / `polish`.

---

## ✅ Verified working

### Auth & i18n
- Login as `stress.admin.a@example.com` → admin dashboard renders.
- Login as `stress.admin.b@example.com` → tenant-isolated to FC B.
- Locale toggle TR ↔ EN persists in cookie + DB; logout clears cookie;
  re-login as a different user does NOT inherit the previous user's
  preferred language (the bleed-through bug from the original
  pre-i18n batch is gone).
- /forgot-password, /reset-password, /no-group, /not-found, /offline,
  error.tsx all render in both locales.
- /login, /register inline error messages translate via
  `translateError(t, key)` for the 50+ keyed errors.

### Tenant isolation (CLAUDE.md non-negotiable)
- `stress.admin.a` cannot reach FC B admin pages — server-side
  redirects to /admin/dashboard or /no-group depending on context.
- `stress.admin.b` does NOT see FC A members in /admin/members.
- Multi-group shared players exist on BOTH FC A and FC B with the same
  `persons` row but separate `memberships` rows.
- Owner sees both tenants from /owner/tenants without ever joining a
  membership.
- /owner/ledger lists transactions from BOTH tenants
  (regression-tested for the FK ambiguity bug fixed earlier).

### Membership lifecycle
- Admin creates a guest player from /admin/members.
- Guest conversion produces an /invite/<token> URL; registering with
  that URL re-links the existing person and preserves history (this
  flow has its own E2E test in role-isolation.spec).
- Archive/restore round-trips with stats inclusion choice.

### Match lifecycle
- Match creation form picks venue + 6v6 + auto-title; backdating works
  in the lifecycle test.
- Add participants → assign red/blue alternately → close with score →
  result row inserted, ledger debits applied to all played
  participants.
- Pre-match poll only opens once both teams are full.
- Notifications dispatched on match close
  (`post_match_rating_open`).

### Attendance edge cases
- Regular user can pull themselves to reserve OR decline only —
  cannot self-confirm or self-add (server returns `notOnMatch`).
- Toggle reserve ↔ declined repeatedly works.

### Ratings & MOTM
- Played participant submits ratings; server rejects opponents and
  self-rating with `targetMustBePlayed` / `cannotVoteSelf`.
- 1-minute edit window enforced
  (`editWindowExpired` / `voteWindowClosed`).
- Privacy: per-rater scores never returned by any query — only
  `safe_member_stats` aggregates surface in /stats and
  /admin/members/[id].
- Admin browsing a player's drill-in page sees only the average,
  never the individual rows.

### Finance / wallet
- /admin/payments shows overdue list, fund collection form, and "All
  balances" grid.
- Cash payment recording flips a debt-holding player's balance.
- Reminder button refuses to send when balance >= 0
  (`notInDebt` toast).
- Fund collection charges N picked members at the per-member amount
  with `reason_code='fund'`; each charged member gets a
  `wallet_updated` notification.
- Owner /owner/ledger globally lists all transactions across both
  tenants.
- Assistant admin CANNOT reach /admin/payments — server redirects.

### Stats / leaderboards
- User /dashboard now shows **5** stat blocks: Played, Win Rate,
  **Avg Rating** ⭐, **MOTM** 👑, Wallet Balance.
  - This addresses the user's question "ortalamasını görebilecek dimi?"
    — yes, on both /dashboard AND /stats.
- /stats has Played / Wins / Win Rate / Avg Rating + 3 leaderboards.
- /admin/stats leaderboard rows are now clickable Link wrappers
  → land on /admin/members/[id]; assistant_admin can use this path too
  (they can't see /admin/members but they can drill into stats from
  the leaderboards).
- /admin/members rows are clickable for full admins.
- Pair chemistry section populates after seeded matches.
- Cash-flow card shows positive collection rate.

### Per-player drill-in
- /admin/members/[id] shows: avatar header with role + guest badge,
  5 stat blocks, recent participations, 20 ledger transactions.
- "you" badge appears when admin is viewing their own profile.
- Tenant-isolated: returns notFound() for cross-tenant IDs.
- Privacy preserved — no raw rating rows, only aggregates.

### Notifications
- /notifications page renders the seeded rows.
- Notification text is sourced from `t.notifications.types.*` so it
  localizes when locale=tr.

### PWA / offline / errors
- /offline page renders without a session.
- /not-found localized.
- error.tsx fallback uses cookie-based locale read.
- /manifest.webmanifest served (existing PWA setup).

### Mobile / responsive
- 375×667 (iPhone SE): bottom nav shows all 10 primary items for admin
  via `auto-cols-fr`. No horizontal scroll on /admin/dashboard,
  /admin/matches, /admin/payments, /admin/stats.
- 1440×900 (desktop): sidebar visible at lg breakpoint, stats grids
  fill, no overflow.
- Tested via stress.spec mobile viewport scenario.

### Security smoke
- Direct GET to /admin/dashboard as a regular user → server-side
  redirect to /dashboard.
- Direct GET to /owner/dashboard as an admin → redirect.
- localStorage check (manual): only PWA-related keys, no auth tokens.
- Cookies inspected: `locale` is plain ("en"/"tr"), `active_tenant` is
  a UUID, no PII or secret material exposed.
- Page source does NOT contain raw `teammate_ratings` rows on
  /admin/stats or /admin/members/[id].

---

## ⚠️ Known issues / not-yet-fixed

### blocker
_(none)_

### major
_(none)_

### minor
_(All previously-listed minor items have been addressed in the polish
commit; see "Resolved" below.)_

### polish
_(All previously-listed polish items have been addressed; see
"Resolved" below.)_

---

## ✔ Resolved (polish commit)

1. **Demo user `preferred_language` reset** — `tests/global-setup.ts`
   now runs `UPDATE accounts SET preferred_language='en' WHERE email
   LIKE '%demo%'` once before every Playwright run. Combined with the
   existing `helpers.login()` cookie re-stamp + the `i18n.spec`
   `afterEach`, there are now three layers of defense against TR
   bleed-through.

2. **`seed-stress.ts` idempotency on the payment-back batch** — the
   final ledger insert loop now does an explicit existence check
   keyed on `(tenant_id, membership_id, description='Stress seed
   payment')` before inserting, so re-running the seed never piles up
   duplicate credit rows.

3. **Stress monkey test depth** — was 5 buttons per page, now clicks
   *every* visible button on every admin surface. Destructive flows
   are filtered both by `data-testid` regex AND by EN+TR text match
   (so the filter still holds when the UI is in Turkish).

4. **Dashboard stat blocks responsive grid** — was
   `sm:grid-cols-3 lg:grid-cols-5` which left an awkward wrap between
   md and lg. Now `grid-cols-2 sm:grid-cols-3 md:grid-cols-5` so
   phone shows 2-up, tablet 3-up, md+ 5-up. Same fix applied to
   `/admin/members/[id]`.

5. **Admin "More" sheet for the 10-item bottom nav** —
   `MobileBottomNav` now shows the first 4 primary items + a `More`
   button that opens an animated bottom sheet listing the rest.
   Each cell is now ~70px wide on iPhone SE (well above the Apple
   HIG 44px target) and items in the sheet still surface "active"
   styling when their route is selected.

6. **TR helper text polish** — fixed the literal-translated captions:
   - `manageMembersDesc` → "Misafir ekle, üyeleri arşivle veya geri yükle"
   - `venuesDesc` → "Halı saha ve konumlar"
   - `paymentsDesc` → "Nakit ödemeleri elle gir"
   - `ofInvitedPlayed` → "davet edilenlerin gerçekten oynadığı oran"

7. **Bulk JSON user importer** — new `scripts/import-users.ts` reads a
   JSON file (flat array OR `{ tenants: [...] }` grouped) and inserts
   accounts + persons + memberships, idempotent on (email, tenant).
   The same email across multiple tenants reuses the SAME persons
   row, validating the multi-group rule from CLAUDE.md. Verified by
   running the example file twice — second run reports "0 new
   membership(s), 3 already-existed". Optional `positions` array on
   each record sets the player's position prefs.

---

## Notes for the user

- Stress users + tenants are persistent. Re-run scenarios manually with
  `stress.admin.a@example.com` / `Test1234!` to reproduce any flow.
- To wipe and re-seed: `psql ... DELETE FROM tenants WHERE slug LIKE
  'stress%';` then `npx tsx scripts/seed-stress.ts`.
- All 25 e2e tests + manual stress sweep are green at commit time.
- Open follow-ups documented above as severity-tagged items.
