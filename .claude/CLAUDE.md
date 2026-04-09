CLAUDE.md

Project Overview

This project is a mobile-first football group management platform for amateur match organisers. The primary usage is through mobile devices, and the web app must behave like an installable Progressive Web App (PWA). The system is multi-tenant: each customer group is fully isolated from other groups.

The product supports:
	•	owner-level tenant administration
	•	group-level admins and assistant admins
	•	regular users and guests
	•	match scheduling and player assignment
	•	team setup and pre-match prediction polls
	•	post-match result entry, player ratings, and player-of-the-match voting
	•	wallet / balance management with manual payment entry
	•	long-term statistics, chemistry analysis, and future support for automatic team balancing

This file defines the authoritative product, architecture, coding, and workflow rules for the project.

⸻

Core Product Goals
	1.	Build a fast MVP with a single codebase.
	2.	Optimise for mobile UX first, desktop second.
	3.	Keep the UI simple, clean, and practical rather than visually flashy.
	4.	Store raw event data so advanced analytics can be derived later.
	5.	Enforce strict tenant isolation.
	6.	Support guests first, then allow conversion to registered members without losing history.
	7.	Keep sensitive voting data private even from admins.
	8.	Make the system easy to extend into advanced analytics and automatic team generation.

⸻

Mandatory Technology Stack

Use this stack unless there is a very strong reason to change it.

Frontend
	•	Next.js (App Router)
	•	TypeScript
	•	Tailwind CSS
	•	shadcn/ui for reusable UI primitives
	•	mobile-first responsive design
	•	PWA support with install prompt and manifest

Backend
	•	Next.js server actions / route handlers for application endpoints
	•	Separate backend service is not required for MVP
	•	Keep business logic in dedicated application/domain layers, not inside UI components

Database / Auth / Infra
	•	Supabase
	•	PostgreSQL
	•	Supabase Auth with email + password authentication
	•	Email verification and password reset flows must exist
	•	Use Row Level Security (RLS) to enforce tenant isolation wherever practical

Notifications
	•	In-app notifications
	•	Web push notifications for supported browsers/devices
	•	Start with these notification types:
	•	match starts in 1 hour
	•	teams announced / pre-match poll opened
	•	match finished / ratings opened
	•	balance updated

Internationalisation
	•	Default language: English
	•	Secondary language: Turkish
	•	All user-facing strings must be localisable from the start

⸻

Product Roles

The system has the following roles.

1. Owner

Global product/system-level operator.

Capabilities:
	•	create and manage groups / tenants
	•	assign or revoke group admins
	•	manage package/features for groups
	•	configure system-wide defaults
	•	view all tenants from the owner console

Constraints:
	•	should not be involved in day-to-day group operation by default

2. Group Admin

Responsible for one specific group.

Capabilities:
	•	manage users within their own group
	•	create matches
	•	manage venues
	•	manage payments / wallet adjustments
	•	assign teams
	•	close matches and enter final score
	•	open/close invitations
	•	reactivate archived users in their group
	•	decide whether restored users are included in rankings/statistics

Constraints:
	•	only sees their own tenant/group
	•	must not see raw individual rating values submitted by users

3. Assistant Admin

Operational helper inside one group.

Capabilities:
	•	create and manage matches
	•	manage player attendance
	•	assign teams
	•	open polls
	•	help run match-day workflows

Constraints:
	•	must not see financial data
	•	must not manage wallet transactions
	•	must not see raw user-to-user ratings

4. User

Standard player in a group.

Capabilities:
	•	log in
	•	manage profile
	•	select playable positions
	•	confirm match attendance
	•	participate in pre-match winner prediction polls
	•	vote for player of the match if they actually played
	•	rate teammates if they actually played
	•	view their own stats, balance, history, and public leaderboards

Constraints:
	•	cannot see raw rating submissions
	•	cannot see who gave what score to whom

5. Guest

Temporary participant, may not initially have a real account.

Capabilities:
	•	can be added to matches by admins
	•	can accumulate participation history
	•	can later be converted to a real registered member

Constraints:
	•	guest-to-member conversion is admin-controlled
	•	guest data must not be lost during conversion

⸻

Multi-Tenant Rules

This is a multi-tenant system. Every group is isolated.

Hard Rules
	•	One group must never see another group’s internal users, matches, finances, or stats.
	•	A single person can belong to multiple groups.
	•	Membership and role assignment are group-specific.
	•	Public invite links or invite codes must only grant access to the target group.

Data Design Principle

Separate these concepts:
	•	Account: login identity
	•	Person / Player profile: real participant identity
	•	Membership: relationship of a person to a group

This separation is mandatory to support:
	•	guests without login
	•	later account binding
	•	multi-group membership
	•	preserved history across guest conversion

⸻

Membership and Invite Model

Users can join groups in three ways.

1. Invite Link
	•	Group admin can generate a shareable invite link
	•	If the recipient has no account, they register and are added to the group automatically
	•	If the recipient already has an account, they sign in and are added to the group automatically

2. Invite Code
	•	Group has a short code that can be entered manually
	•	Useful when the user does not have the link
	•	Admin can regenerate or disable the code

3. Manual Admin Addition
	•	Admin can manually create a guest player or attach an existing registered player to the group

Invite Rules
	•	Registering without a valid invite should create only a system account, not automatic group membership
	•	Invite token / code must survive the register flow and be consumed after successful registration
	•	Default role after invite join: user

⸻

Guest Conversion Rules

Guest players are important and must be treated carefully.

Rules
	•	Guest player can exist without real email/login
	•	Admin may create a guest with name only, or with partial details
	•	Later the guest can become a full registered member
	•	Conversion must preserve:
	•	match history
	•	team assignments
	•	wallet history
	•	statistics
	•	player-of-the-match counts
	•	ratings received

Product Rule

The club/group has a business rule:
	•	if a guest plays 3 matches in a row, then for the 4th match they become eligible for the main squad

Implementation Rule

Treat this as:
	•	automatic eligibility detection
	•	manual admin confirmation

Do not auto-promote without admin action.

⸻

Authentication Requirements

Authentication must use:
	•	email + password
	•	email verification
	•	password reset flow

Do not use magic link as the default auth model.

Required Screens
	•	Login
	•	Register
	•	Forgot password
	•	Reset password
	•	Invite landing page
	•	Join with code

⸻

Soft Delete / Archiving Rules

The product must support non-destructive removal.

Required Behaviour
	•	Users are not hard-deleted in normal product flows
	•	Users can be marked inactive / archived
	•	Archived users disappear from normal admin and user lists
	•	Archived users must not appear in active rankings/statistics by default
	•	Archived users may be restored later

Important Product Rule

On restore, admin should be able to decide whether the user is:
	•	included in rankings/statistics
	•	excluded from rankings/statistics

Recommended State Model

Maintain separate flags or equivalent state for:
	•	account status
	•	membership status
	•	statistics visibility

This is important because a user may exist historically but should not always affect leaderboards.

⸻

Match Lifecycle

This is the expected match flow.

Match Setup

A group admin or assistant admin can create a match with:
	•	date
	•	time
	•	venue
	•	team format, e.g. 6v6 or 7v7
	•	match fee amount
	•	currency inherited from group settings unless overridden

Attendance Phase

Participants may be in statuses such as:
	•	invited
	•	confirmed
	•	declined
	•	reserve
	•	checked_in
	•	played
	•	no_show

Only actual played participants should gain post-match privileges.

Team Assignment

Each match has exactly 2 teams.
	•	Example labels: red and blue
	•	Future support for multiple matches at the same time is allowed, but each individual match still has only two teams

Pre-Match Poll

Once teams are set, all group users may vote on:
	•	which team will win

This poll is open to the wider group, not only match participants.

Match Close

When match ends:
	•	group admin enters score
	•	system computes win/loss/draw outcome
	•	system marks actual players as played
	•	system applies match fee debt to the played participants
	•	system opens post-match rating flow
	•	system opens player-of-the-match voting
	•	system triggers notifications

⸻

Match Fee and Currency Rules

Currency
	•	Default initial currency: GBP
	•	Architecture must support group-level currency setting from the start
	•	Each tenant/group should carry a currency code, e.g. GBP, USD, MYR

Match Fee Trigger

Do not charge at invite time or confirm time.

Charge when:
	•	match is completed
	•	admin closes the match and submits final result
	•	participant status is played

No-Show Policy
	•	Do not implement automatic penalties in MVP
	•	Leave room for future penalty rules
	•	Admin can later apply manual adjustments if needed

⸻

Wallet / Ledger Rules

Financial tracking is essential.

Critical Rule

Use a ledger / transaction model, not just a mutable balance field.

Every financial action must be stored as a transaction, for example:
	•	payment received
	•	match fee charged
	•	admin adjustment
	•	bonus / compensation
	•	penalty (future)

Why

This gives:
	•	auditability
	•	easy reconciliation
	•	support for overpayment / prepaid credit
	•	support for future reporting

Payment Entry

For MVP, payments are manual.
Example:
	•	admin records “Serdar paid £20”
	•	system updates wallet balance accordingly

Balance Rule

Displayed balance is derived from ledger entries.
If performance optimisation is needed later, snapshots can be added, but ledger remains source of truth.

⸻

Voting and Rating Rules

1. Pre-Match Winner Prediction Poll

Who can vote:
	•	all users in the group

What they can vote on:
	•	which team will win

2. Player of the Match

Who can vote:
	•	only participants whose status is played

Voting rule:
	•	a player may vote for any played player from either team
	•	self-vote must not be allowed
	•	reserves who never entered play cannot vote

3. Teammate Rating

Who can rate:
	•	only participants whose status is played

Who they can rate:
	•	only their own teammates
	•	not themselves

Rating Scale
	•	1 to 5 integer scale

Edit Window
	•	1 minute only
	•	after that, the vote/rating is locked

Visibility / Privacy Rule

This is extremely important.

Raw individual scores must be hidden from:
	•	regular users
	•	group admins
	•	assistant admins

Allowed visibility:
	•	user sees own averages and aggregate stats
	•	admin sees completion status, revision existence, and aggregate views
	•	admin must not see exact user-to-user score details

Admin Moderation Rule

If moderation is needed, prefer:
	•	reset/reopen rating flow
	•	invalidate a vote batch if required

Do not build admin tools that expose raw individual scoring values.

⸻

Statistics and Analytics Rules

Core Principle

Store raw event data, derive summaries later.

Do not rely on only precomputed top-level scores.

Raw Data Examples

Store at minimum:
	•	who played in which match
	•	which team they were in
	•	final score
	•	win/loss/draw
	•	player-of-the-match votes
	•	teammate ratings
	•	selected positions
	•	guest/member status changes
	•	wallet entries

User-Visible Stats

User should be able to see:
	•	total matches
	•	wins
	•	losses
	•	draws
	•	win rate
	•	player-of-the-match count
	•	general average rating
	•	per-match average rating summaries
	•	positions
	•	recent matches
	•	leaderboard positions

Public / Group-Level Stats

Users may also see aggregate ranking views such as:
	•	top performers by average rating
	•	most player-of-the-match awards
	•	highest win rate
	•	strongest recent form

Admin-Level Analytics

Admins may see aggregate analysis such as:
	•	team chemistry summaries
	•	strong pairings
	•	combinations that perform well
	•	completion rates for ratings/polls

Forbidden Visibility

Do not show:
	•	“Ahmet gave Mehmet a 2”
	•	exact rater identity or exact per-rater score breakdowns

Future Analytics Support

Architecture should support future features such as:
	•	automatic team balancing
	•	chemistry-based recommendations
	•	best combinations by position
	•	strongest partnerships
	•	venue / format-based performance trends

⸻

Position Rules

Players may select multiple playable positions.

Supported positions initially:
	•	goalkeeper
	•	defender
	•	midfield
	•	forward

A player may have more than one position.
This will later support better team creation and analytics.

⸻

Internationalisation Rules

The app must support both:
	•	English
	•	Turkish

Rules
	•	English is the default language
	•	All UI text must be extracted into translation dictionaries
	•	Do not hardcode user-facing strings directly into components
	•	Date/time/currency formatting must respect locale and group currency

⸻

Notification Rules

Notification channels:
	•	in-app notifications
	•	web push notifications

Initial Notification Types
	•	match starts in 1 hour
	•	teams ready / prediction poll open
	•	match completed / ratings open
	•	wallet updated

Rules
	•	If push fails, in-app notification must still exist
	•	Notification creation must be event-driven and auditable

⸻

UI / UX Rules

General Principles
	•	mobile-first always
	•	simple and fast interaction
	•	use large touch targets
	•	minimise text-heavy complexity on small screens
	•	avoid clutter

Required Product Areas

User side:
	•	login
	•	register
	•	join with code
	•	invite landing flow
	•	dashboard / home
	•	upcoming match
	•	match details
	•	post-match rating flow
	•	wallet / balance
	•	leaderboard / stats
	•	profile / positions
	•	notifications

Admin side:
	•	group dashboard
	•	match creation
	•	attendance management
	•	team assignment
	•	score entry
	•	wallet/payment management
	•	invite management
	•	archived users
	•	settings

Owner side:
	•	tenant list
	•	package/features
	•	owner dashboard
	•	admin assignment
	•	group management

Interaction Rules
	•	avoid modal-heavy UX on mobile unless necessary
	•	prefer bottom sheets, cards, segmented tabs, and simple forms
	•	critical actions must be confirmable
	•	preserve draft state during multi-step admin flows

⸻

Domain Model Guidance

The exact schema may evolve, but the model must support at least the following entities.

Identity / Membership
	•	accounts
	•	persons
	•	tenants
	•	memberships

Group Operations
	•	venues
	•	matches
	•	match_participants
	•	match_teams
	•	match_team_members
	•	match_results

Voting / Rating
	•	pre_match_polls
	•	pre_match_poll_votes
	•	player_of_match_votes
	•	teammate_ratings
	•	rating_revisions or equivalent audit structure

Finance
	•	ledger_transactions

Player Metadata
	•	position_preferences

Notifications
	•	notifications
	•	push_subscriptions

Analytics / Derived Views

Can be materialized views, cached tables, or computed queries for:
	•	member_stats
	•	pair_stats
	•	leaderboard_metrics
	•	recent_form_metrics

⸻

Architecture Rules

Code should be organised by responsibility, not as one large mixed layer.

Recommended Structure
	•	app/ for routes and pages
	•	components/ for reusable UI pieces
	•	features/ for domain-focused modules
	•	lib/ for shared utilities
	•	server/ or modules/ for business logic and persistence orchestration

Layering Principle

Avoid putting business rules directly inside page components.

Preferred conceptual layers:
	1.	Presentation layer
	2.	Application/use-case layer
	3.	Domain rules layer
	4.	Persistence/infrastructure layer

Examples of Use Cases
	•	create group
	•	generate invite
	•	join group with code
	•	create guest player
	•	convert guest to registered member
	•	create match
	•	confirm attendance
	•	assign teams
	•	submit prediction vote
	•	close match and apply fees
	•	submit player-of-the-match vote
	•	submit teammate ratings
	•	record payment
	•	archive user
	•	restore user

⸻

Security Rules

Hard Requirements
	•	enforce tenant isolation everywhere
	•	validate role permissions server-side
	•	never trust client role claims
	•	protect invite tokens
	•	hash passwords through the auth provider only
	•	never expose private rating data through APIs or debug endpoints

RLS Guidance

Where practical, RLS policies should ensure:
	•	users only read/write their own group data
	•	users only see their own allowed profile/ledger/stat views
	•	admins only act inside their tenant
	•	owner has dedicated elevated pathways

⸻

Auditability Rules

The system will manage finances, admin actions, and rating workflows.
Therefore important actions should be auditable.

Audit at minimum:
	•	payment entry
	•	admin wallet adjustment
	•	invite generation/regeneration
	•	guest conversion
	•	user archive/restore
	•	match close and score submission
	•	rating reopen/reset actions if implemented

Do not keep silent destructive flows.

⸻

Performance Rules

MVP Rules
	•	prioritise correctness and simplicity first
	•	add indexing for obvious hot paths
	•	keep list pages efficient on mobile
	•	paginate history-heavy views

Expected High-Usage Queries

Optimise for:
	•	upcoming matches by group
	•	user’s recent matches
	•	wallet history per member
	•	leaderboard queries by group
	•	player stats within one group
	•	archived user lookup

Later

If stats become expensive:
	•	add materialized views
	•	add scheduled summary recomputation
	•	do not destroy raw event integrity

⸻

Testing Rules

Minimum required coverage areas:
	•	tenant isolation
	•	role-based permissions
	•	invite join flow
	•	guest conversion flow
	•	match close + fee application
	•	rating eligibility rules
	•	one-minute edit lock
	•	archive/restore behaviour
	•	statistics inclusion/exclusion rules

Write tests for business rules before optimising implementation details.

⸻

Coding Rules

General
	•	Use TypeScript strictly
	•	Prefer explicit types over implicit any
	•	Keep functions focused and small
	•	Favour readable code over clever code
	•	Avoid mixing DB access directly in UI files

Validation
	•	Validate all server inputs
	•	Use a schema validation library such as Zod

Naming
	•	Use descriptive, domain-relevant names
	•	Avoid vague names like data, item, thing, helper

Error Handling
	•	Return meaningful domain-level errors
	•	Never leak internal DB details to end users

⸻

Product Decisions That Must Be Preserved

These are non-negotiable unless product direction explicitly changes.
	1.	Same person can belong to multiple groups.
	2.	Guest can later become a registered member without losing history.
	3.	Currency support must be group-aware, even if default is GBP.
	4.	Match fees are applied only after match completion and only to played participants.
	5.	Automatic no-show penalties are not part of MVP.
	6.	Each match has only 2 teams.
	7.	Draws are supported.
	8.	Player of the match can be chosen from either team.
	9.	Only played users can vote/rate after the match.
	10.	Teammate ratings use a 1–5 scale.
	11.	Rating edit window is 1 minute.
	12.	Raw rating values are hidden from users and admins.
	13.	Soft delete / archive behaviour is required.
	14.	English and Turkish are both supported.
	15.	Auth uses email + password, not magic link by default.
	16.	Invite link + invite code + manual add all exist.
	17.	Push and in-app notifications are part of the design.

⸻

Nice-to-Have Future Features

Design with extension in mind for:
	•	automatic team balancing
	•	chemistry scoring
	•	attendance penalties
	•	badge / achievements
	•	subscription billing / plan enforcement
	•	richer owner analytics
	•	multiple simultaneous matches per group and time slot
	•	calendar integration
	•	payment provider integration
	•	native mobile app wrapper if needed later

⸻

Working Style Instructions for Claude

When implementing or editing this codebase:
	•	preserve tenant isolation first
	•	do not simplify away the guest conversion model
	•	do not expose raw rating details for convenience
	•	do not replace ledger with only mutable balance fields
	•	keep mobile UX primary in layout decisions
	•	favour incremental MVP delivery with clean extension points
	•	always think in terms of reusable domain rules, not page-specific hacks
	•	if unsure, prefer auditability and data integrity over convenience

When making architectural decisions:
	•	ask whether the change breaks future analytics
	•	ask whether the change leaks private voting information
	•	ask whether the change harms multi-group membership
	•	ask whether the change makes guest conversion harder
	•	ask whether the change introduces hidden destructive behaviour

⸻

MVP Delivery Order

Suggested implementation order:
	1.	foundation
	•	project setup
	•	auth
	•	i18n
	•	PWA shell
	•	core layout
	2.	tenants and membership
	•	owner console basics
	•	group creation
	•	admin assignment
	•	invite code/link flow
	•	membership creation
	3.	player lifecycle
	•	profile
	•	guest creation
	•	guest conversion
	•	archive/restore
	4.	match operations
	•	venue management
	•	match creation
	•	attendance states
	•	team assignment
	•	pre-match poll
	5.	match completion
	•	final score entry
	•	result closure
	•	fee application
	•	notification triggers
	6.	post-match engagement
	•	player-of-the-match vote
	•	teammate rating
	•	one-minute edit lock
	7.	finance
	•	ledger
	•	payment entry
	•	wallet views
	8.	stats and leaderboards
	•	personal stats
	•	group leaderboards
	•	pair/chemistry summaries
	9.	polish
	•	archived users
	•	push notifications
	•	owner package/features

⸻

Final Reminder

This project is not just a scheduling app.
It is a football group operations + finance + statistics platform that must start simple but be capable of becoming an intelligent match analysis and team-building system.

Protect the data model accordingly.