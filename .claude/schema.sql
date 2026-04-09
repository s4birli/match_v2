-- schema.sql
-- PostgreSQL / Supabase oriented initial schema for the football group platform.

create extension if not exists pgcrypto;
create extension if not exists citext;

create type role as enum ('owner','admin','assistant_admin','user','guest');
create type membership_status as enum ('active','inactive','archived','invited');
create type stats_visibility as enum ('included','excluded');
create type match_status as enum ('draft','open','teams_ready','completed','cancelled');
create type attendance_status as enum ('invited','confirmed','declined','reserve','checked_in','played','no_show');
create type team_key as enum ('red','blue');
create type poll_status as enum ('open','closed');
create type poll_type as enum ('winner_prediction');
create type transaction_type as enum ('payment','match_fee','adjustment','bonus','penalty');
create type direction as enum ('debit','credit');
create type notification_type as enum ('match_starting_soon','pre_match_poll_open','post_match_rating_open','wallet_updated');
create type position_code as enum ('goalkeeper','defender','midfield','forward');
create type invite_source_type as enum ('link','code','manual');
create type link_type as enum ('primary','claimed_guest','migrated');

create table accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  email citext not null unique,
  password_managed_by_auth boolean not null default true,
  email_verified_at timestamptz null,
  last_login_at timestamptz null,
  is_active boolean not null default true,
  is_archived boolean not null default false,
  preferred_language text not null default 'en',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table persons (
  id uuid primary key default gen_random_uuid(),
  primary_account_id uuid null references accounts(id),
  first_name text not null,
  last_name text null,
  display_name text not null,
  email citext null,
  phone text null,
  date_of_birth date null,
  avatar_url text null,
  is_guest_profile boolean not null default false,
  global_notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ix_persons_primary_account_id on persons(primary_account_id);
create index ix_persons_display_name on persons(display_name);
create index ix_persons_email on persons(email);

create table person_account_links (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references persons(id),
  account_id uuid not null references accounts(id),
  link_type link_type not null,
  linked_at timestamptz not null default now(),
  unlinked_at timestamptz null,
  created_by_account_id uuid null references accounts(id)
);
create index ix_person_account_links_person on person_account_links(person_id);
create index ix_person_account_links_account on person_account_links(account_id);

create table tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  currency_code text not null default 'GBP',
  default_language text not null default 'en',
  invite_code text not null unique,
  invite_code_active boolean not null default true,
  invite_link_active boolean not null default true,
  default_match_fee numeric(10,2) not null default 0,
  is_active boolean not null default true,
  is_archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table tenant_feature_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  feature_key text not null,
  is_enabled boolean not null default true,
  config_json jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, feature_key)
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  person_id uuid not null references persons(id),
  role role not null,
  status membership_status not null default 'active',
  stats_visibility stats_visibility not null default 'included',
  joined_at timestamptz null,
  archived_at timestamptz null,
  archived_reason text null,
  restored_at timestamptz null,
  is_guest_membership boolean not null default false,
  created_by_membership_id uuid null references memberships(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, person_id)
);
create index ix_memberships_tenant_role_status on memberships(tenant_id, role, status);
create index ix_memberships_person_status on memberships(person_id, status);
create index ix_memberships_tenant_stats_visibility on memberships(tenant_id, stats_visibility);

create table tenant_invites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  token text not null unique,
  created_by_membership_id uuid not null references memberships(id),
  default_role role not null default 'user',
  max_uses int null,
  used_count int not null default 0,
  expires_at timestamptz null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index ix_tenant_invites_tenant_active on tenant_invites(tenant_id, is_active);

create table invite_consumptions (
  id uuid primary key default gen_random_uuid(),
  tenant_invite_id uuid not null references tenant_invites(id),
  account_id uuid null references accounts(id),
  person_id uuid null references persons(id),
  membership_id uuid null references memberships(id),
  consumed_at timestamptz not null default now(),
  source_type invite_source_type not null,
  metadata jsonb null
);

create table position_preferences (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references memberships(id),
  position_code position_code not null,
  priority_rank int not null default 1,
  created_at timestamptz not null default now(),
  unique (membership_id, position_code)
);

create table venues (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  address_line text null,
  notes text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table matches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  venue_id uuid null references venues(id),
  title text null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  team_format_label text not null,
  players_per_team int not null,
  match_fee numeric(10,2) not null,
  currency_code text not null,
  status match_status not null default 'draft',
  score_entered_at timestamptz null,
  closed_by_membership_id uuid null references memberships(id),
  created_by_membership_id uuid not null references memberships(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_matches_end_after_start check (ends_at > starts_at)
);
create index ix_matches_tenant_starts_at on matches(tenant_id, starts_at);
create index ix_matches_tenant_status_starts_at on matches(tenant_id, status, starts_at);

create table match_teams (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id),
  tenant_id uuid not null references tenants(id),
  team_key team_key not null,
  display_name text not null,
  sort_order int not null,
  created_at timestamptz not null default now(),
  unique (match_id, team_key)
);

create table match_participants (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id),
  tenant_id uuid not null references tenants(id),
  membership_id uuid not null references memberships(id),
  team_id uuid null references match_teams(id),
  attendance_status attendance_status not null default 'invited',
  entered_as_reserve boolean not null default false,
  position_played_code position_code null,
  joined_team_at timestamptz null,
  attendance_updated_at timestamptz not null default now(),
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, membership_id)
);
create index ix_match_participants_match_status on match_participants(match_id, attendance_status);
create index ix_match_participants_membership_status on match_participants(membership_id, attendance_status);
create index ix_match_participants_match_team on match_participants(match_id, team_id);

create table match_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references matches(id),
  tenant_id uuid not null references tenants(id),
  red_team_id uuid not null references match_teams(id),
  blue_team_id uuid not null references match_teams(id),
  red_score int not null,
  blue_score int not null,
  winner_team_id uuid null references match_teams(id),
  is_draw boolean not null default false,
  entered_by_membership_id uuid not null references memberships(id),
  entered_at timestamptz not null default now(),
  notes text null
);

create table pre_match_polls (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id),
  tenant_id uuid not null references tenants(id),
  poll_type poll_type not null default 'winner_prediction',
  status poll_status not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz null,
  created_by_membership_id uuid not null references memberships(id)
);

create table pre_match_poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references pre_match_polls(id),
  team_id uuid not null references match_teams(id),
  label text not null,
  sort_order int not null,
  unique (poll_id, team_id)
);

create table pre_match_poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references pre_match_polls(id),
  option_id uuid not null references pre_match_poll_options(id),
  membership_id uuid not null references memberships(id),
  tenant_id uuid not null references tenants(id),
  submitted_at timestamptz not null default now(),
  unique (poll_id, membership_id)
);

create table player_of_match_votes (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id),
  tenant_id uuid not null references tenants(id),
  voter_membership_id uuid not null references memberships(id),
  target_membership_id uuid not null references memberships(id),
  submitted_at timestamptz not null default now(),
  editable_until timestamptz not null,
  locked_at timestamptz null,
  is_invalidated boolean not null default false,
  invalidated_at timestamptz null,
  invalidated_reason text null,
  unique (match_id, voter_membership_id),
  constraint chk_player_of_match_not_self check (voter_membership_id <> target_membership_id)
);

create table teammate_ratings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id),
  tenant_id uuid not null references tenants(id),
  rater_membership_id uuid not null references memberships(id),
  target_membership_id uuid not null references memberships(id),
  rating_value smallint not null,
  submitted_at timestamptz not null default now(),
  editable_until timestamptz not null,
  locked_at timestamptz null,
  is_invalidated boolean not null default false,
  invalidated_at timestamptz null,
  invalidated_reason text null,
  unique (match_id, rater_membership_id, target_membership_id),
  constraint chk_teammate_rating_range check (rating_value between 1 and 5),
  constraint chk_teammate_rating_not_self check (rater_membership_id <> target_membership_id)
);
create index ix_teammate_ratings_match on teammate_ratings(match_id);
create index ix_teammate_ratings_target on teammate_ratings(target_membership_id);

create table rating_revisions (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  previous_value_json jsonb not null,
  new_value_json jsonb not null,
  changed_by_membership_id uuid not null references memberships(id),
  changed_at timestamptz not null default now()
);
create index ix_rating_revisions_entity on rating_revisions(entity_type, entity_id);

create table ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  membership_id uuid not null references memberships(id),
  match_id uuid null references matches(id),
  transaction_type transaction_type not null,
  direction direction not null,
  amount numeric(10,2) not null,
  currency_code text not null,
  description text null,
  reason_code text null,
  recorded_by_membership_id uuid null references memberships(id),
  recorded_at timestamptz not null default now(),
  is_reversed boolean not null default false,
  reversed_by_transaction_id uuid null references ledger_transactions(id),
  metadata jsonb null,
  constraint chk_ledger_positive_amount check (amount > 0)
);
create index ix_ledger_tenant_membership_recorded_at on ledger_transactions(tenant_id, membership_id, recorded_at desc);
create index ix_ledger_tenant_type_recorded_at on ledger_transactions(tenant_id, transaction_type, recorded_at desc);
create index ix_ledger_match_type on ledger_transactions(match_id, transaction_type);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  membership_id uuid not null references memberships(id),
  notification_type notification_type not null,
  title text not null,
  body text not null,
  payload_json jsonb null,
  is_read boolean not null default false,
  read_at timestamptz null,
  created_at timestamptz not null default now()
);
create index ix_notifications_membership_read_created on notifications(membership_id, is_read, created_at desc);

create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id),
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text null,
  is_active boolean not null default true,
  last_used_at timestamptz null,
  created_at timestamptz not null default now()
);
create index ix_push_subscriptions_account_active on push_subscriptions(account_id, is_active);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid null references tenants(id),
  actor_membership_id uuid null references memberships(id),
  actor_account_id uuid null references accounts(id),
  entity_type text not null,
  entity_id uuid not null,
  action_type text not null,
  before_json jsonb null,
  after_json jsonb null,
  metadata jsonb null,
  created_at timestamptz not null default now()
);
create index ix_audit_logs_tenant_created_at on audit_logs(tenant_id, created_at desc);
create index ix_audit_logs_entity on audit_logs(entity_type, entity_id);

-- Helpful derived views

create or replace view member_stats_view as
select
  m.tenant_id,
  m.id as membership_id,
  count(*) filter (where mp.attendance_status = 'played') as total_matches_played,
  count(*) filter (where mp.attendance_status = 'played' and mr.winner_team_id = mp.team_id) as wins,
  count(*) filter (where mp.attendance_status = 'played' and mr.is_draw = true) as draws,
  count(*) filter (where mp.attendance_status = 'played' and mr.winner_team_id is not null and mr.winner_team_id <> mp.team_id) as losses,
  case
    when count(*) filter (where mp.attendance_status = 'played') = 0 then 0::numeric
    else round(
      (
        count(*) filter (where mp.attendance_status = 'played' and mr.winner_team_id = mp.team_id)::numeric
        /
        count(*) filter (where mp.attendance_status = 'played')::numeric
      ) * 100, 2
    )
  end as win_rate,
  (
    select count(*)
    from player_of_match_votes pv
    where pv.target_membership_id = m.id
      and pv.is_invalidated = false
  ) as motm_count,
  (
    select round(avg(tr.rating_value)::numeric, 2)
    from teammate_ratings tr
    where tr.target_membership_id = m.id
      and tr.is_invalidated = false
  ) as avg_teammate_rating,
  max(mt.starts_at) filter (where mp.attendance_status = 'played') as last_match_at
from memberships m
left join match_participants mp on mp.membership_id = m.id
left join matches mt on mt.id = mp.match_id
left join match_results mr on mr.match_id = mp.match_id
where m.status = 'active'
  and m.stats_visibility = 'included'
group by m.tenant_id, m.id;

create or replace view leaderboard_metrics_view as
select
  s.tenant_id,
  s.membership_id,
  dense_rank() over (partition by s.tenant_id order by s.avg_teammate_rating desc nulls last) as avg_rating_rank,
  dense_rank() over (partition by s.tenant_id order by s.motm_count desc nulls last) as motm_rank,
  dense_rank() over (partition by s.tenant_id order by s.win_rate desc nulls last) as win_rate_rank
from member_stats_view s;
