# CLAUDE-DB-FIRST.md

## Purpose

This document is the **database-first technical companion** to `CLAUDE.md`.

It translates the approved product rules into:
- concrete database entities
- relationships
- constraints
- indexing strategy
- access-control guidance
- derived statistics strategy
- API-facing workflow expectations

This file should be treated as the **authoritative schema planning reference** for the MVP and near-future phases.

---

# 1. High-Level Architectural Principles

## 1.1 Non-Negotiable Design Rules
1. The system is **multi-tenant**.
2. A single person can belong to **multiple tenants/groups**.
3. Login identity must be separated from player identity.
4. Guest players must be supported without forcing full account creation.
5. Match fees must be recorded through a **ledger model**, not only a mutable balance.
6. Raw rating values must remain hidden from users and admins.
7. Soft delete / archive must be supported.
8. Statistics must be **derived from raw events**, not treated as the primary source of truth.

## 1.2 Recommended Database
- PostgreSQL on Supabase

## 1.3 ID Strategy
Use **UUID** primary keys for all major tables.

Recommended:
- `id UUID PRIMARY KEY DEFAULT gen_random_uuid()`

## 1.4 Time Strategy
Use:
- `TIMESTAMPTZ` for all timestamps
- store everything in UTC
- convert in UI based on locale/timezone

---

# 2. Core Entity Model

The system should be modelled around the following core domains:

1. Identity
2. Tenancy / membership
3. Match operations
4. Voting / rating
5. Finance
6. Notifications
7. Analytics / derived stats
8. Audit / lifecycle

---

# 3. Identity Domain

## 3.1 accounts
Represents login/auth identity.

### Purpose
- one row per authenticated account
- maps to Supabase auth user
- stores app-level metadata that is not purely auth-provider owned

### Columns
- `id UUID PK`
- `auth_user_id UUID UNIQUE NOT NULL`
- `email CITEXT UNIQUE NOT NULL`
- `password_managed_by_auth BOOLEAN NOT NULL DEFAULT TRUE`
- `email_verified_at TIMESTAMPTZ NULL`
- `last_login_at TIMESTAMPTZ NULL`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- `is_archived BOOLEAN NOT NULL DEFAULT FALSE`
- `preferred_language TEXT NOT NULL DEFAULT 'en'`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Notes
- Password should not be stored manually if Supabase Auth is used.
- This table is the app-side projection of auth identity.

### Indexes
- unique index on `auth_user_id`
- unique index on `email`

---

## 3.2 persons
Represents a real person/player identity, whether registered or guest.

### Purpose
This is the critical table that allows:
- guests without account
- later guest-to-account binding
- one person across multiple groups

### Columns
- `id UUID PK`
- `primary_account_id UUID NULL REFERENCES accounts(id)`
- `first_name TEXT NOT NULL`
- `last_name TEXT NULL`
- `display_name TEXT NOT NULL`
- `email CITEXT NULL`
- `phone TEXT NULL`
- `date_of_birth DATE NULL`
- `avatar_url TEXT NULL`
- `is_guest_profile BOOLEAN NOT NULL DEFAULT FALSE`
- `global_notes TEXT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Rules
- `primary_account_id` can be null for guests.
- `email` is optional because guests may have no email initially.
- Do not automatically merge people by name/email heuristics.

### Indexes
- index on `primary_account_id`
- index on `display_name`
- index on `email`

---

## 3.3 person_account_links
Optional but recommended if future support is needed for account reassignment / history.

### Purpose
Track the history of linking a person profile to an account.

### Columns
- `id UUID PK`
- `person_id UUID NOT NULL REFERENCES persons(id)`
- `account_id UUID NOT NULL REFERENCES accounts(id)`
- `link_type TEXT NOT NULL`  -- e.g. primary, claimed_guest, migrated
- `linked_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `unlinked_at TIMESTAMPTZ NULL`
- `created_by_account_id UUID NULL REFERENCES accounts(id)`

### Notes
MVP can work without this table if `persons.primary_account_id` is sufficient, but this table is safer long-term.

---

# 4. Tenancy / Membership Domain

## 4.1 tenants
Represents a group/customer.

### Columns
- `id UUID PK`
- `name TEXT NOT NULL`
- `slug TEXT UNIQUE NOT NULL`
- `currency_code TEXT NOT NULL DEFAULT 'GBP'`
- `default_language TEXT NOT NULL DEFAULT 'en'`
- `invite_code TEXT UNIQUE NOT NULL`
- `invite_code_active BOOLEAN NOT NULL DEFAULT TRUE`
- `invite_link_active BOOLEAN NOT NULL DEFAULT TRUE`
- `default_match_fee NUMERIC(10,2) NOT NULL DEFAULT 0`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- `is_archived BOOLEAN NOT NULL DEFAULT FALSE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Notes
- Currency is tenant-level.
- Invite code lives here for the “enter code” flow.
- Owner can change defaults, but tenant config remains authoritative for group operations.

### Indexes
- unique index on `slug`
- unique index on `invite_code`

---

## 4.2 tenant_feature_flags
Feature control per tenant.

### Columns
- `id UUID PK`
- `tenant_id UUID NOT NULL REFERENCES tenants(id)`
- `feature_key TEXT NOT NULL`
- `is_enabled BOOLEAN NOT NULL DEFAULT TRUE`
- `config_json JSONB NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Constraints
- unique `(tenant_id, feature_key)`

---

## 4.3 memberships
Represents a person’s relationship to a tenant.

### Roles
Allowed:
- `owner`
- `admin`
- `assistant_admin`
- `user`
- `guest`

### Columns
- `id UUID PK`
- `tenant_id UUID NOT NULL REFERENCES tenants(id)`
- `person_id UUID NOT NULL REFERENCES persons(id)`
- `role TEXT NOT NULL`
- `status TEXT NOT NULL DEFAULT 'active'`  
  Allowed examples:
  - active
  - inactive
  - archived
  - invited
- `stats_visibility TEXT NOT NULL DEFAULT 'included'`
  Allowed examples:
  - included
  - excluded
- `joined_at TIMESTAMPTZ NULL`
- `archived_at TIMESTAMPTZ NULL`
- `archived_reason TEXT NULL`
- `restored_at TIMESTAMPTZ NULL`
- `is_guest_membership BOOLEAN NOT NULL DEFAULT FALSE`
- `created_by_membership_id UUID NULL REFERENCES memberships(id)`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Constraints
- unique `(tenant_id, person_id)`

### Notes
This is the most important tenant-bound identity table.
A person can have one membership per tenant.

### Indexes
- index on `(tenant_id, role, status)`
- index on `(person_id, status)`
- index on `(tenant_id, stats_visibility)`

---

## 4.4 tenant_invites
Stores shareable invite links and invitation flows.

### Columns
- `id UUID PK`
- `tenant_id UUID NOT NULL REFERENCES tenants(id)`
- `token TEXT UNIQUE NOT NULL`
- `created_by_membership_id UUID NOT NULL REFERENCES memberships(id)`
- `default_role TEXT NOT NULL DEFAULT 'user'`
- `max_uses INT NULL`
- `used_count INT NOT NULL DEFAULT 0`
- `expires_at TIMESTAMPTZ NULL`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Notes
- A tenant can keep one main invite link or many historical links.
- Admin can regenerate by deactivating previous ones and creating a new one.

### Indexes
- unique index on `token`
- index on `(tenant_id, is_active)`

---

## 4.5 invite_consumptions
Tracks who used which invite.

### Columns
- `id UUID PK`
- `tenant_invite_id UUID NOT NULL REFERENCES tenant_invites(id)`
- `account_id UUID NULL REFERENCES accounts(id)`
- `person_id UUID NULL REFERENCES persons(id)`
- `membership_id UUID NULL REFERENCES memberships(id)`
- `consumed_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `source_type TEXT NOT NULL`  -- link / code / manual
- `metadata JSONB NULL`

---

# 5. Player Metadata

## 5.1 position_preferences
Stores position preferences per membership.

### Columns
- `id UUID PK`
- `membership_id UUID NOT NULL REFERENCES memberships(id)`
- `position_code TEXT NOT NULL`
  Allowed:
  - goalkeeper
  - defender
  - midfield
  - forward
- `priority_rank INT NOT NULL DEFAULT 1`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Constraints
- unique `(membership_id, position_code)`

### Notes
Allows multi-position support.
`priority_rank` supports future primary/secondary ordering.

---

# 6. Match Operations Domain

## 6.1 venues
Group-specific venue list.

### Columns
- `id UUID PK`
- `tenant_id UUID NOT NULL REFERENCES tenants(id)`
- `name TEXT NOT NULL`
- `address_line TEXT NULL`
- `notes TEXT NULL`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Constraints
- unique `(tenant_id, name)`

---

## 6.2 matches
Top-level match record.

### Columns
- `id UUID PK`
- `tenant_id UUID NOT NULL REFERENCES tenants(id)`
- `venue_id UUID NULL REFERENCES venues(id)`
- `title TEXT NULL`
- `starts_at TIMESTAMPTZ NOT NULL`
- `ends_at TIMESTAMPTZ NOT NULL`
- `team_format_label TEXT NOT NULL` -- e.g. 6v6, 7v7
- `players_per_team INT NOT NULL`
- `match_fee NUMERIC(10,2) NOT NULL`
- `currency_code TEXT NOT NULL`
- `status TEXT NOT NULL DEFAULT 'draft'`
  Allowed examples:
  - draft
  - open
  - teams_ready
  - completed
  - cancelled
- `score_entered_at TIMESTAMPTZ NULL`
- `closed_by_membership_id UUID NULL REFERENCES memberships(id)`
- `created_by_membership_id UUID NOT NULL REFERENCES memberships(id)`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Rules
- `match_fee` is copied from tenant defaults at creation time, but remains match-specific.
- `currency_code` is copied from tenant config at creation time, but remains match-specific.

### Indexes
- index on `(tenant_id, starts_at)`
- index on `(tenant_id, status, starts_at)`

---

## 6.3 match_teams
Exactly 2 teams per match.

### Columns
- `id UUID PK`
- `match_id UUID NOT NULL REFERENCES matches(id)`
- `tenant_id UUID NOT NULL REFERENCES tenants(id)`
- `team_key TEXT NOT NULL`  -- red / blue
- `display_name TEXT NOT NULL`
- `sort_order INT NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Constraints
- unique `(match_id, team_key)`

### Notes
MVP expects 2 rows per match.

---

## 6.4 match_participants
Participant lifecycle in a match.

### Columns
- `id UUID PK`
- `match_id UUID NOT NULL REFERENCES matches(id)`
- `tenant_id UUID NOT NULL REFERENCES tenants(id)`
- `membership_id UUID NOT NULL REFERENCES memberships(id)`
- `team_id UUID NULL REFERENCES match_teams(id)`
- `attendance_status TEXT NOT NULL DEFAULT 'invited'`
  Allowed examples:
  - invited
  - confirmed
  - declined
  - reserve
  - checked_in
  - played
  - no_show
- `entered_as_reserve BOOLEAN NOT NULL DEFAULT FALSE`
- `position_played_code TEXT NULL`
- `joined_team_at TIMESTAMPTZ NULL`
- `attendance_updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `notes TEXT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Constraints
- unique `(match_id, membership_id)`

### Notes
This table is critical.
It tells:
- who was invited
- who actually played
- which team they played for
- whether they came from reserve

### Indexes
- index on `(match_id, attendance_status)`
- index on `(membership_id, attendance_status)`
- index on `(match_id, team_id)`

---

## 6.5 match_results
Stores final score.

### Columns
- `id UUID PK`
- `match_id UUID UNIQUE NOT NULL REFERENCES matches(id)`
- `tenant_id UUID NOT NULL REFERENCES tenants(id)`
- `red_team_id UUID NOT NULL REFERENCES match_teams(id)`
- `blue_team_id UUID NOT NULL REFERENCES match_teams(id)`
- `red_score INT NOT NULL`
- `blue_score INT NOT NULL`
- `winner_team_id UUID NULL REFERENCES match_teams(id)`
- `is_draw BOOLEAN NOT NULL DEFAULT FALSE`
- `entered_by_membership_id UUID NOT NULL REFERENCES memberships(id)`
- `entered_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `notes TEXT NULL`

### Rules
- `winner_team_id` null when draw
- `is_draw = true` when red_score == blue_score

---

# 7. Polling and Rating Domain

## 7.1 pre_match_polls
Usually one “who will win?” poll per match.

### Columns
- `id UUID PK`
- `match_id UUID NOT NULL REFERENCES matches(id)`
- `tenant_id UUID NOT NULL REFERENCES tenants(id)`
- `poll_type TEXT NOT NULL DEFAULT 'winner_prediction'`
- `status TEXT NOT NULL DEFAULT 'open'`
- `opened_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `closed_at TIMESTAMPTZ NULL`
- `created_by_membership_id UUID NOT NULL REFERENCES memberships(id)`

### Constraints
- optionally unique `(match_id, poll_type)`

---

## 7.2 pre_match_poll_options
Poll options, typically red vs blue.

### Columns
- `id UUID PK`
- `poll_id UUID NOT NULL REFERENCES pre_match_polls(id)`
- `team_id UUID NOT NULL REFERENCES match_teams(id)`
- `label TEXT NOT NULL`
- `sort_order INT NOT NULL`

### Constraints
- unique `(poll_id, team_id)`

---

## 7.3 pre_match_poll_votes
Votes for the prediction poll.

### Columns
- `id UUID PK`
- `poll_id UUID NOT NULL REFERENCES pre_match_polls(id)`
- `option_id UUID NOT NULL REFERENCES pre_match_poll_options(id)`
- `membership_id UUID NOT NULL REFERENCES memberships(id)`
- `submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Constraints
- unique `(poll_id, membership_id)`

---

## 7.4 player_of_match_votes
Stores player-of-the-match vote.

### Columns
- `id UUID PK`
- `match_id UUID NOT NULL REFERENCES matches(id)`
- `tenant_id UUID NOT NULL REFERENCES tenants(id)`
- `voter_membership_id UUID NOT NULL REFERENCES memberships(id)`
- `target_membership_id UUID NOT NULL REFERENCES memberships(id)`
- `submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `editable_until TIMESTAMPTZ NOT NULL`
- `locked_at TIMESTAMPTZ NULL`
- `is_invalidated BOOLEAN NOT NULL DEFAULT FALSE`
- `invalidated_at TIMESTAMPTZ NULL`
- `invalidated_reason TEXT NULL`

### Constraints
- unique `(match_id, voter_membership_id)`

### Rules
- voter must be `played`
- target must be `played`
- voter cannot equal target
- editable window = submitted_at + 1 minute

### Important Privacy Rule
Application-level and API-level controls must ensure raw vote target visibility is not broadly exposed beyond allowed business functions.

---

## 7.5 teammate_ratings
Stores teammate rating submissions.

### Columns
- `id UUID PK`
- `match_id UUID NOT NULL REFERENCES matches(id)`
- `tenant_id UUID NOT NULL REFERENCES tenants(id)`
- `rater_membership_id UUID NOT NULL REFERENCES memberships(id)`
- `target_membership_id UUID NOT NULL REFERENCES memberships(id)`
- `rating_value SMALLINT NOT NULL`
- `submitted_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `editable_until TIMESTAMPTZ NOT NULL`
- `locked_at TIMESTAMPTZ NULL`
- `is_invalidated BOOLEAN NOT NULL DEFAULT FALSE`
- `invalidated_at TIMESTAMPTZ NULL`
- `invalidated_reason TEXT NULL`

### Constraints
- unique `(match_id, rater_membership_id, target_membership_id)`

### Rules
- allowed range 1..5
- rater must be `played`
- target must be in same team and `played`
- rater cannot rate self
- editable until submitted_at + 1 minute

### Important Privacy Rule
Raw rows must not be exposed to users or admins in normal application reporting.

---

## 7.6 rating_revisions
Optional audit trail for vote/rating edits inside the one-minute window.

### Columns
- `id UUID PK`
- `entity_type TEXT NOT NULL`  -- teammate_rating / player_of_match_vote
- `entity_id UUID NOT NULL`
- `previous_value_json JSONB NOT NULL`
- `new_value_json JSONB NOT NULL`
- `changed_by_membership_id UUID NOT NULL REFERENCES memberships(id)`
- `changed_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Notes
This supports “revision existence” without exposing raw values in reporting UIs.

---

# 8. Finance Domain

## 8.1 ledger_transactions
Authoritative financial ledger.

### Columns
- `id UUID PK`
- `tenant_id UUID NOT NULL REFERENCES tenants(id)`
- `membership_id UUID NOT NULL REFERENCES memberships(id)`
- `match_id UUID NULL REFERENCES matches(id)`
- `transaction_type TEXT NOT NULL`
  Allowed examples:
  - payment
  - match_fee
  - adjustment
  - bonus
  - penalty
- `direction TEXT NOT NULL`
  Allowed:
  - debit
  - credit
- `amount NUMERIC(10,2) NOT NULL`
- `currency_code TEXT NOT NULL`
- `description TEXT NULL`
- `reason_code TEXT NULL`
- `recorded_by_membership_id UUID NULL REFERENCES memberships(id)`
- `recorded_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `is_reversed BOOLEAN NOT NULL DEFAULT FALSE`
- `reversed_by_transaction_id UUID NULL REFERENCES ledger_transactions(id)`
- `metadata JSONB NULL`

### Rules
- `match_fee` inserted only when match closes and participant is `played`
- manual payments inserted by group admin
- balance is derived

### Important Rule
Never physically mutate prior transaction amounts in a hidden way.
If correction is needed, use reversing or adjustment entries.

### Indexes
- index on `(tenant_id, membership_id, recorded_at DESC)`
- index on `(tenant_id, transaction_type, recorded_at DESC)`
- index on `(match_id, transaction_type)`

---

## 8.2 member_balance_snapshots
Optional, not source of truth.

### Columns
- `id UUID PK`
- `tenant_id UUID NOT NULL REFERENCES tenants(id)`
- `membership_id UUID NOT NULL REFERENCES memberships(id)`
- `balance_amount NUMERIC(10,2) NOT NULL`
- `currency_code TEXT NOT NULL`
- `calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Notes
Optional optimisation only.

---

# 9. Notifications Domain

## 9.1 notifications
In-app notification records.

### Columns
- `id UUID PK`
- `tenant_id UUID NOT NULL REFERENCES tenants(id)`
- `membership_id UUID NOT NULL REFERENCES memberships(id)`
- `notification_type TEXT NOT NULL`
- `title TEXT NOT NULL`
- `body TEXT NOT NULL`
- `payload_json JSONB NULL`
- `is_read BOOLEAN NOT NULL DEFAULT FALSE`
- `read_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Notification Types
Initial:
- match_starting_soon
- pre_match_poll_open
- post_match_rating_open
- wallet_updated

### Indexes
- index on `(membership_id, is_read, created_at DESC)`

---

## 9.2 push_subscriptions
Web push subscription info.

### Columns
- `id UUID PK`
- `account_id UUID NOT NULL REFERENCES accounts(id)`
- `endpoint TEXT NOT NULL`
- `p256dh TEXT NOT NULL`
- `auth TEXT NOT NULL`
- `user_agent TEXT NULL`
- `is_active BOOLEAN NOT NULL DEFAULT TRUE`
- `last_used_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

---

# 10. Audit Domain

## 10.1 audit_logs
System-wide audit events.

### Columns
- `id UUID PK`
- `tenant_id UUID NULL REFERENCES tenants(id)`
- `actor_membership_id UUID NULL REFERENCES memberships(id)`
- `actor_account_id UUID NULL REFERENCES accounts(id)`
- `entity_type TEXT NOT NULL`
- `entity_id UUID NOT NULL`
- `action_type TEXT NOT NULL`
- `before_json JSONB NULL`
- `after_json JSONB NULL`
- `metadata JSONB NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Must Audit At Minimum
- payment entry
- admin wallet adjustment
- invite creation / regeneration / disable
- guest conversion
- membership archive / restore
- match close and score entry
- rating invalidation / reopen if implemented

---

# 11. Analytics / Derived Tables and Views

These are not the source of truth.
They are derived from raw data.

## 11.1 member_stats_view
Derived per tenant membership.

### Suggested fields
- `tenant_id`
- `membership_id`
- `total_matches_played`
- `wins`
- `losses`
- `draws`
- `win_rate`
- `motm_count`
- `avg_teammate_rating`
- `recent_form_score`
- `last_match_at`

### Inclusion Rule
Only memberships with:
- `status = active`
- `stats_visibility = included`

should participate in public leaderboard calculations.

---

## 11.2 pair_stats_view
Derived pair chemistry/performance.

### Suggested fields
- `tenant_id`
- `membership_a_id`
- `membership_b_id`
- `matches_together`
- `wins_together`
- `draws_together`
- `losses_together`
- `win_rate_together`
- `avg_joint_team_rating`
- `last_played_together_at`

---

## 11.3 leaderboard_metrics_view
Used for ranking screens.

### Suggested fields
- `tenant_id`
- `membership_id`
- `avg_rating_rank`
- `motm_rank`
- `win_rate_rank`
- `recent_form_rank`
- `career_points_rank`

---

# 12. Career Points Strategy

Because cumulative point totals can inflate over time, separate:
- **career points**
- **performance metrics**

## 12.1 career_points_ledger
Optional separate table, or derive from match events.

### Suggested events
- played match: +1
- won match: +3
- player of match: +3

### Recommendation
Store as derived event-based records, not as one mutable integer only.

### Important Rule
Leaderboards for “best player” should not rely only on cumulative career points.
They should prefer averaged and rate-based metrics as well.

---

# 13. Permission Model Summary

## Owner
Global access.
May manage:
- tenants
- package/features
- admin assignment

## Group Admin
Tenant-scoped.
May manage:
- members
- matches
- venues
- finances
- invites
- archived users
- restore + stats inclusion toggle

## Assistant Admin
Tenant-scoped.
May manage:
- matches
- attendance
- teams
- polls

May not manage:
- ledger
- financial views
- raw ratings

## User
Tenant-scoped.
May:
- manage own profile
- confirm attendance
- vote in pre-match poll
- vote/rate post-match only if played
- see own stats and public summaries

## Guest
No full login required initially.
Appears through person + membership records.

---

# 14. RLS and Access-Control Guidance

## Core Principle
Do not rely on frontend checks.
All access must be enforced at DB and/or server layer.

## Recommended Approach
- RLS for tenant-scoped reads/writes
- server-side role resolution for elevated operations
- owner operations through protected server functions

## Sensitive Data Protection
Even if admins are trusted operationally, raw rating rows must not be broadly queryable in application reporting endpoints.

If necessary:
- store raw rating tables in a restricted schema
- expose only aggregate SQL views

---

# 15. Constraints and Validation Rules

## Mandatory Validations
1. `teammate_ratings.rating_value` must be between 1 and 5.
2. A `player_of_match_vote` voter must not vote for self.
3. A `teammate_rating` rater must not rate self.
4. A `teammate_rating` target must be on the same team.
5. A participant must be `played` to submit post-match actions.
6. Archived memberships should not appear in active ranking views.
7. A restored membership’s ranking inclusion depends on `stats_visibility`.
8. Invite codes and tokens must be unique.
9. `matches.ends_at > matches.starts_at`
10. `ledger_transactions.amount > 0`

---

# 16. Suggested Indexing Plan

## High Priority
- `memberships (tenant_id, role, status)`
- `matches (tenant_id, starts_at)`
- `matches (tenant_id, status, starts_at)`
- `match_participants (match_id, attendance_status)`
- `match_participants (match_id, team_id)`
- `ledger_transactions (tenant_id, membership_id, recorded_at DESC)`
- `notifications (membership_id, is_read, created_at DESC)`

## Medium Priority
- `persons (display_name)`
- `tenants (invite_code)`
- `tenant_invites (tenant_id, is_active)`

---

# 17. Suggested API / Use-Case Mapping

## Auth / Identity
- register account
- verify email
- sign in
- reset password

## Membership
- join tenant via invite token
- join tenant via invite code
- create guest member
- convert guest to registered member
- archive member
- restore member
- update stats visibility

## Match Operations
- create match
- update match
- assign participants
- confirm attendance
- assign teams
- open pre-match poll
- close match with result

## Post-Match
- submit player-of-match vote
- update player-of-match vote within 1 minute
- submit teammate ratings
- update teammate ratings within 1 minute

## Finance
- record payment
- record manual adjustment
- list wallet history
- fetch derived balance

## Notifications
- register push subscription
- list notifications
- mark notification read

---

# 18. Migration Order Recommendation

1. accounts
2. persons
3. tenants
4. memberships
5. tenant_feature_flags
6. tenant_invites
7. invite_consumptions
8. position_preferences
9. venues
10. matches
11. match_teams
12. match_participants
13. match_results
14. pre_match_polls
15. pre_match_poll_options
16. pre_match_poll_votes
17. player_of_match_votes
18. teammate_ratings
19. rating_revisions
20. ledger_transactions
21. notifications
22. push_subscriptions
23. audit_logs
24. analytics views / materialized views

---

# 19. Open Design Options That Do Not Block MVP

These can be decided later if needed:
- whether owner is modelled only as a special role or also as a separate admin domain table
- whether person-account history needs a full link table in MVP
- whether career points are stored physically or derived dynamically
- whether archived users are shown in a dedicated restore screen only
- whether invite links support expiration and usage caps in MVP or later

---

# 20. Final Instruction

When implementing this schema:
- prioritise clean tenant boundaries
- keep raw data intact
- do not sacrifice guest conversion quality
- do not expose hidden rating values
- do not replace ledger with shortcut balance logic
- build for mobile-first product flows
- prefer auditability over silent mutation
