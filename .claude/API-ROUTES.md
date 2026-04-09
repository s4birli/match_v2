# API-ROUTES.md

This file lists the recommended MVP API surface for the football group platform.

Base assumption:
- Next.js App Router
- Route Handlers under `app/api/...`
- Protected server-side use-case layer under `src/server/...`

---

## 1. Auth

### POST /api/auth/register
Creates a new account.
Body:
- email
- password
- preferredLanguage?
- inviteToken?
- inviteCode?

Behaviour:
- create auth user
- create app account row
- if invite token/code exists, attach membership after registration

### POST /api/auth/login
Signs in an existing user.

### POST /api/auth/logout
Signs out current user.

### POST /api/auth/forgot-password
Starts reset flow.

### POST /api/auth/reset-password
Completes reset flow.

### GET /api/auth/session
Returns current authenticated session summary:
- account
- active memberships
- current tenant

---

## 2. Current User / Membership Context

### GET /api/me
Returns:
- account
- person summary
- memberships
- current tenant

### PATCH /api/me/preferences
Updates:
- language
- avatar
- notification preferences

### GET /api/me/notifications
Returns current user's notifications list.

### PATCH /api/me/notifications/:id/read
Marks one notification as read.

### POST /api/me/push-subscriptions
Registers web push subscription.

### DELETE /api/me/push-subscriptions/:id
Disables a subscription.

---

## 3. Join Group / Invite Flow

### GET /api/invites/:token
Returns invite landing metadata:
- tenant name
- whether token is active
- expiry
- default role

### POST /api/invites/:token/accept
Accepts invite for current account.

### POST /api/join-with-code
Body:
- code

Returns:
- target tenant preview
- membership joined or pending result

---

## 4. Owner Routes

### GET /api/owner/tenants
List all tenants.

### POST /api/owner/tenants
Create a tenant.
Body:
- name
- slug
- currencyCode
- defaultLanguage
- defaultMatchFee

### GET /api/owner/tenants/:tenantId
Tenant details.

### PATCH /api/owner/tenants/:tenantId
Update tenant config.

### GET /api/owner/tenants/:tenantId/features
List feature flags.

### PUT /api/owner/tenants/:tenantId/features
Bulk update feature flags.

### POST /api/owner/tenants/:tenantId/admins
Assign group admin.

### DELETE /api/owner/tenants/:tenantId/admins/:membershipId
Revoke group admin.

---

## 5. Group Admin / Membership Management

### GET /api/tenants/:tenantId/members
List active members.
Filters:
- role
- status
- search

### GET /api/tenants/:tenantId/members/archived
List archived members.

### POST /api/tenants/:tenantId/members/guests
Create guest member.
Body:
- firstName
- lastName?
- displayName
- notes?

### POST /api/tenants/:tenantId/members/:membershipId/convert-guest
Convert guest to registered member.
Body:
- email
- firstName?
- lastName?
- inviteNow?: boolean

### PATCH /api/tenants/:tenantId/members/:membershipId
Update member fields:
- role
- statsVisibility
- notes
- displayName
- positions

### POST /api/tenants/:tenantId/members/:membershipId/archive
Archive member.
Body:
- reason
- excludeFromStats?: boolean

### POST /api/tenants/:tenantId/members/:membershipId/restore
Restore member.
Body:
- includeInStats?: boolean

---

## 6. Invite Management

### GET /api/tenants/:tenantId/invites
List active and historical invites.

### POST /api/tenants/:tenantId/invites
Create invite link.

### POST /api/tenants/:tenantId/invites/regenerate-code
Regenerate tenant invite code.

### POST /api/tenants/:tenantId/invites/:inviteId/deactivate
Deactivate invite.

---

## 7. Venues

### GET /api/tenants/:tenantId/venues
List venues.

### POST /api/tenants/:tenantId/venues
Create venue.

### PATCH /api/tenants/:tenantId/venues/:venueId
Update venue.

### POST /api/tenants/:tenantId/venues/:venueId/archive
Deactivate venue.

---

## 8. Matches

### GET /api/tenants/:tenantId/matches
List matches.
Filters:
- status
- upcoming
- past

### POST /api/tenants/:tenantId/matches
Create match.
Body:
- venueId
- title?
- startsAt
- endsAt
- teamFormatLabel
- playersPerTeam
- matchFee?
- currencyCode?

### GET /api/tenants/:tenantId/matches/:matchId
Returns full match detail:
- match
- teams
- participants
- poll summary
- result summary

### PATCH /api/tenants/:tenantId/matches/:matchId
Update editable match fields.

### POST /api/tenants/:tenantId/matches/:matchId/cancel
Cancel match.

---

## 9. Match Attendance / Team Management

### POST /api/tenants/:tenantId/matches/:matchId/participants
Bulk assign participants.
Body:
- membershipIds[]

### PATCH /api/tenants/:tenantId/matches/:matchId/participants/:participantId
Update one participant:
- attendanceStatus
- teamId?
- enteredAsReserve?
- positionPlayedCode?

### POST /api/tenants/:tenantId/matches/:matchId/teams/auto-create
Ensures red/blue team rows exist.

### PUT /api/tenants/:tenantId/matches/:matchId/teams
Update team labels if needed.

### POST /api/tenants/:tenantId/matches/:matchId/teams/assign
Bulk assign participants to teams.
Body:
- assignments[] { participantId, teamId }

---

## 10. Pre-Match Poll

### POST /api/tenants/:tenantId/matches/:matchId/pre-match-poll/open
Open prediction poll.

### GET /api/tenants/:tenantId/matches/:matchId/pre-match-poll
Get poll with aggregate results.

### POST /api/tenants/:tenantId/matches/:matchId/pre-match-poll/vote
Cast or replace current user's vote.
Body:
- optionId

---

## 11. Match Closure / Post-Match Opening

### POST /api/tenants/:tenantId/matches/:matchId/close
Admin closes match and enters result.
Body:
- redScore
- blueScore
- playedParticipantIds[]
- reservePromotions[]?
- notes?

Behaviour:
- create/update match_result
- mark played participants
- assign winner/draw
- create match_fee ledger entries for played participants
- open post-match voting window
- create notifications

---

## 12. Player of the Match

### POST /api/tenants/:tenantId/matches/:matchId/player-of-match/vote
Create or replace current user's vote, within 1-minute edit window.
Body:
- targetMembershipId

### GET /api/tenants/:tenantId/matches/:matchId/player-of-match/summary
Returns safe aggregate:
- total votes count
- winner if match voting closed
- current user's own submitted state if allowed

No raw voter-target matrix should be exposed.

---

## 13. Teammate Ratings

### POST /api/tenants/:tenantId/matches/:matchId/ratings
Submit current user's teammate ratings.
Body:
- ratings[] { targetMembershipId, ratingValue }

### PATCH /api/tenants/:tenantId/matches/:matchId/ratings
Replace current user's ratings within 1-minute window.

### GET /api/tenants/:tenantId/matches/:matchId/ratings/summary
Safe aggregate only:
- current user's received average
- match average by player
- completion counts

No raw rater-to-target breakdown should be exposed.

---

## 14. Wallet / Payments

### GET /api/tenants/:tenantId/wallet/members/:membershipId
Returns:
- derived balance
- recent transactions
- currencyCode

Allowed for:
- self
- admin

### POST /api/tenants/:tenantId/payments
Record payment.
Body:
- membershipId
- amount
- currencyCode?
- description?

### POST /api/tenants/:tenantId/wallet/adjustments
Record manual adjustment.
Body:
- membershipId
- direction
- amount
- reasonCode
- description?

### GET /api/tenants/:tenantId/wallet/ledger
Admin ledger search.
Filters:
- membershipId
- transactionType
- date range

---

## 15. Stats / Leaderboards

### GET /api/tenants/:tenantId/stats/me
Current user's stats summary.

### GET /api/tenants/:tenantId/stats/members/:membershipId
Safe member stats summary.

### GET /api/tenants/:tenantId/leaderboards
Returns:
- avg rating leaderboard
- most MOTM leaderboard
- win rate leaderboard
- recent form leaderboard

### GET /api/tenants/:tenantId/chemistry/pairs
Aggregate strong pairs summary only.

---

## 16. Audit / Admin Support

### GET /api/tenants/:tenantId/audit-logs
Admin audit logs.
Filters:
- entityType
- actionType
- date range

### POST /api/tenants/:tenantId/matches/:matchId/post-match/reopen
Optional later-phase endpoint.
Allows controlled reopen of post-match flow.
Should be admin-only and audited.

---

## 17. Recommended Internal Server Modules

Suggested use-case service modules:

- auth/registerUser.ts
- auth/loginUser.ts
- invites/acceptInvite.ts
- invites/joinWithCode.ts
- memberships/createGuestMember.ts
- memberships/convertGuestToRegistered.ts
- memberships/archiveMember.ts
- memberships/restoreMember.ts
- matches/createMatch.ts
- matches/assignParticipants.ts
- matches/assignTeams.ts
- matches/closeMatch.ts
- polls/castWinnerPredictionVote.ts
- motm/castPlayerOfMatchVote.ts
- ratings/submitTeammateRatings.ts
- finance/recordPayment.ts
- finance/recordAdjustment.ts
- notifications/createNotification.ts
- stats/getTenantLeaderboards.ts

---

## 18. Important API Rules

1. Never expose raw teammate rating rows to admin or user APIs.
2. Never expose raw player-of-match vote rows to normal client APIs.
3. All tenant-scoped routes must validate membership inside the target tenant.
4. Assistant admin routes must not expose wallet data.
5. Use safe aggregate views for leaderboard/stat endpoints.
6. Match close endpoint must be idempotent or carefully guarded against double fee posting.
7. Invite acceptance must be atomic with membership creation.
