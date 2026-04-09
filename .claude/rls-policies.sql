-- rls-policies.sql
-- Supabase/PostgreSQL Row Level Security starter policies
-- Assumptions:
-- 1. auth.uid() maps to accounts.auth_user_id
-- 2. application code resolves the current user's tenant memberships via memberships + persons + accounts
-- 3. owner operations for cross-tenant administration should go through secure server-side functions

-- =========================================================
-- Helper schema
-- =========================================================

create schema if not exists app_private;

create or replace function app_private.current_account_id()
returns uuid
language sql
stable
as $$
  select a.id
  from accounts a
  where a.auth_user_id = auth.uid()
  limit 1
$$;

create or replace function app_private.is_owner()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from memberships m
    join persons p on p.id = m.person_id
    join accounts a on a.id = p.primary_account_id
    where a.auth_user_id = auth.uid()
      and m.role = 'owner'
      and m.status = 'active'
  )
$$;

create or replace function app_private.is_member_of_tenant(target_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from memberships m
    join persons p on p.id = m.person_id
    join accounts a on a.id = p.primary_account_id
    where a.auth_user_id = auth.uid()
      and m.tenant_id = target_tenant_id
      and m.status = 'active'
  )
$$;

create or replace function app_private.is_admin_of_tenant(target_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from memberships m
    join persons p on p.id = m.person_id
    join accounts a on a.id = p.primary_account_id
    where a.auth_user_id = auth.uid()
      and m.tenant_id = target_tenant_id
      and m.status = 'active'
      and m.role in ('admin', 'owner')
  )
$$;

create or replace function app_private.is_assistant_or_admin_of_tenant(target_tenant_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from memberships m
    join persons p on p.id = m.person_id
    join accounts a on a.id = p.primary_account_id
    where a.auth_user_id = auth.uid()
      and m.tenant_id = target_tenant_id
      and m.status = 'active'
      and m.role in ('assistant_admin', 'admin', 'owner')
  )
$$;

create or replace function app_private.current_membership_ids_for_tenant(target_tenant_id uuid)
returns setof uuid
language sql
stable
as $$
  select m.id
  from memberships m
  join persons p on p.id = m.person_id
  join accounts a on a.id = p.primary_account_id
  where a.auth_user_id = auth.uid()
    and m.tenant_id = target_tenant_id
    and m.status = 'active'
$$;

-- =========================================================
-- Enable RLS
-- =========================================================

alter table tenants enable row level security;
alter table memberships enable row level security;
alter table tenant_feature_flags enable row level security;
alter table tenant_invites enable row level security;
alter table invite_consumptions enable row level security;
alter table position_preferences enable row level security;
alter table venues enable row level security;
alter table matches enable row level security;
alter table match_teams enable row level security;
alter table match_participants enable row level security;
alter table match_results enable row level security;
alter table pre_match_polls enable row level security;
alter table pre_match_poll_options enable row level security;
alter table pre_match_poll_votes enable row level security;
alter table player_of_match_votes enable row level security;
alter table teammate_ratings enable row level security;
alter table rating_revisions enable row level security;
alter table ledger_transactions enable row level security;
alter table notifications enable row level security;
alter table push_subscriptions enable row level security;
alter table audit_logs enable row level security;

-- =========================================================
-- Tenant-level visibility
-- =========================================================

drop policy if exists tenants_select_member_or_owner on tenants;
create policy tenants_select_member_or_owner
on tenants
for select
using (
  app_private.is_member_of_tenant(id)
  or app_private.is_owner()
);

drop policy if exists tenants_update_owner_only on tenants;
create policy tenants_update_owner_only
on tenants
for update
using (app_private.is_owner())
with check (app_private.is_owner());

drop policy if exists tenant_feature_flags_select_member_or_owner on tenant_feature_flags;
create policy tenant_feature_flags_select_member_or_owner
on tenant_feature_flags
for select
using (
  app_private.is_member_of_tenant(tenant_id)
  or app_private.is_owner()
);

drop policy if exists tenant_feature_flags_write_owner_only on tenant_feature_flags;
create policy tenant_feature_flags_write_owner_only
on tenant_feature_flags
for all
using (app_private.is_owner())
with check (app_private.is_owner());

-- =========================================================
-- Memberships
-- =========================================================

drop policy if exists memberships_select_same_tenant on memberships;
create policy memberships_select_same_tenant
on memberships
for select
using (
  app_private.is_member_of_tenant(tenant_id)
  or app_private.is_owner()
);

drop policy if exists memberships_insert_admin_owner on memberships;
create policy memberships_insert_admin_owner
on memberships
for insert
with check (
  app_private.is_admin_of_tenant(tenant_id)
  or app_private.is_owner()
);

drop policy if exists memberships_update_admin_owner on memberships;
create policy memberships_update_admin_owner
on memberships
for update
using (
  app_private.is_admin_of_tenant(tenant_id)
  or app_private.is_owner()
)
with check (
  app_private.is_admin_of_tenant(tenant_id)
  or app_private.is_owner()
);

-- =========================================================
-- Invites
-- =========================================================

drop policy if exists tenant_invites_select_member on tenant_invites;
create policy tenant_invites_select_member
on tenant_invites
for select
using (
  app_private.is_member_of_tenant(tenant_id)
  or app_private.is_owner()
);

drop policy if exists tenant_invites_write_admin on tenant_invites;
create policy tenant_invites_write_admin
on tenant_invites
for all
using (
  app_private.is_admin_of_tenant(tenant_id)
  or app_private.is_owner()
)
with check (
  app_private.is_admin_of_tenant(tenant_id)
  or app_private.is_owner()
);

drop policy if exists invite_consumptions_select_admin on invite_consumptions;
create policy invite_consumptions_select_admin
on invite_consumptions
for select
using (
  exists (
    select 1
    from tenant_invites ti
    where ti.id = invite_consumptions.tenant_invite_id
      and (
        app_private.is_admin_of_tenant(ti.tenant_id)
        or app_private.is_owner()
      )
  )
);

drop policy if exists invite_consumptions_insert_service_only on invite_consumptions;
create policy invite_consumptions_insert_service_only
on invite_consumptions
for insert
with check (true);

-- =========================================================
-- Position preferences
-- =========================================================

drop policy if exists position_preferences_select_same_tenant on position_preferences;
create policy position_preferences_select_same_tenant
on position_preferences
for select
using (
  exists (
    select 1
    from memberships m
    where m.id = position_preferences.membership_id
      and (
        app_private.is_member_of_tenant(m.tenant_id)
        or app_private.is_owner()
      )
  )
);

drop policy if exists position_preferences_insert_self_or_admin on position_preferences;
create policy position_preferences_insert_self_or_admin
on position_preferences
for insert
with check (
  exists (
    select 1
    from memberships m
    join persons p on p.id = m.person_id
    join accounts a on a.id = p.primary_account_id
    where m.id = position_preferences.membership_id
      and (
        a.auth_user_id = auth.uid()
        or app_private.is_admin_of_tenant(m.tenant_id)
        or app_private.is_owner()
      )
  )
);

drop policy if exists position_preferences_update_self_or_admin on position_preferences;
create policy position_preferences_update_self_or_admin
on position_preferences
for update
using (
  exists (
    select 1
    from memberships m
    join persons p on p.id = m.person_id
    join accounts a on a.id = p.primary_account_id
    where m.id = position_preferences.membership_id
      and (
        a.auth_user_id = auth.uid()
        or app_private.is_admin_of_tenant(m.tenant_id)
        or app_private.is_owner()
      )
  )
)
with check (
  exists (
    select 1
    from memberships m
    join persons p on p.id = m.person_id
    join accounts a on a.id = p.primary_account_id
    where m.id = position_preferences.membership_id
      and (
        a.auth_user_id = auth.uid()
        or app_private.is_admin_of_tenant(m.tenant_id)
        or app_private.is_owner()
      )
  )
);

-- =========================================================
-- Venues / matches / teams / participants / results
-- =========================================================

drop policy if exists venues_select_same_tenant on venues;
create policy venues_select_same_tenant
on venues
for select
using (
  app_private.is_member_of_tenant(tenant_id)
  or app_private.is_owner()
);

drop policy if exists venues_write_admin on venues;
create policy venues_write_admin
on venues
for all
using (
  app_private.is_admin_of_tenant(tenant_id)
  or app_private.is_owner()
)
with check (
  app_private.is_admin_of_tenant(tenant_id)
  or app_private.is_owner()
);

drop policy if exists matches_select_same_tenant on matches;
create policy matches_select_same_tenant
on matches
for select
using (
  app_private.is_member_of_tenant(tenant_id)
  or app_private.is_owner()
);

drop policy if exists matches_write_assistant_admin on matches;
create policy matches_write_assistant_admin
on matches
for all
using (
  app_private.is_assistant_or_admin_of_tenant(tenant_id)
  or app_private.is_owner()
)
with check (
  app_private.is_assistant_or_admin_of_tenant(tenant_id)
  or app_private.is_owner()
);

drop policy if exists match_teams_select_same_tenant on match_teams;
create policy match_teams_select_same_tenant
on match_teams
for select
using (
  app_private.is_member_of_tenant(tenant_id)
  or app_private.is_owner()
);

drop policy if exists match_teams_write_assistant_admin on match_teams;
create policy match_teams_write_assistant_admin
on match_teams
for all
using (
  app_private.is_assistant_or_admin_of_tenant(tenant_id)
  or app_private.is_owner()
)
with check (
  app_private.is_assistant_or_admin_of_tenant(tenant_id)
  or app_private.is_owner()
);

drop policy if exists match_participants_select_same_tenant on match_participants;
create policy match_participants_select_same_tenant
on match_participants
for select
using (
  app_private.is_member_of_tenant(tenant_id)
  or app_private.is_owner()
);

drop policy if exists match_participants_write_assistant_admin on match_participants;
create policy match_participants_write_assistant_admin
on match_participants
for all
using (
  app_private.is_assistant_or_admin_of_tenant(tenant_id)
  or app_private.is_owner()
)
with check (
  app_private.is_assistant_or_admin_of_tenant(tenant_id)
  or app_private.is_owner()
);

drop policy if exists match_results_select_same_tenant on match_results;
create policy match_results_select_same_tenant
on match_results
for select
using (
  app_private.is_member_of_tenant(tenant_id)
  or app_private.is_owner()
);

drop policy if exists match_results_write_admin_only on match_results;
create policy match_results_write_admin_only
on match_results
for all
using (
  app_private.is_admin_of_tenant(tenant_id)
  or app_private.is_owner()
)
with check (
  app_private.is_admin_of_tenant(tenant_id)
  or app_private.is_owner()
);

-- =========================================================
-- Pre-match polls
-- =========================================================

drop policy if exists pre_match_polls_select_same_tenant on pre_match_polls;
create policy pre_match_polls_select_same_tenant
on pre_match_polls
for select
using (
  app_private.is_member_of_tenant(tenant_id)
  or app_private.is_owner()
);

drop policy if exists pre_match_polls_write_assistant_admin on pre_match_polls;
create policy pre_match_polls_write_assistant_admin
on pre_match_polls
for all
using (
  app_private.is_assistant_or_admin_of_tenant(tenant_id)
  or app_private.is_owner()
)
with check (
  app_private.is_assistant_or_admin_of_tenant(tenant_id)
  or app_private.is_owner()
);

drop policy if exists pre_match_poll_options_select_same_tenant on pre_match_poll_options;
create policy pre_match_poll_options_select_same_tenant
on pre_match_poll_options
for select
using (
  exists (
    select 1
    from pre_match_polls p
    where p.id = pre_match_poll_options.poll_id
      and (
        app_private.is_member_of_tenant(p.tenant_id)
        or app_private.is_owner()
      )
  )
);

drop policy if exists pre_match_poll_options_write_assistant_admin on pre_match_poll_options;
create policy pre_match_poll_options_write_assistant_admin
on pre_match_poll_options
for all
using (
  exists (
    select 1
    from pre_match_polls p
    where p.id = pre_match_poll_options.poll_id
      and (
        app_private.is_assistant_or_admin_of_tenant(p.tenant_id)
        or app_private.is_owner()
      )
  )
)
with check (
  exists (
    select 1
    from pre_match_polls p
    where p.id = pre_match_poll_options.poll_id
      and (
        app_private.is_assistant_or_admin_of_tenant(p.tenant_id)
        or app_private.is_owner()
      )
  )
);

drop policy if exists pre_match_poll_votes_select_same_tenant on pre_match_poll_votes;
create policy pre_match_poll_votes_select_same_tenant
on pre_match_poll_votes
for select
using (
  app_private.is_member_of_tenant(tenant_id)
  or app_private.is_owner()
);

drop policy if exists pre_match_poll_votes_insert_member_same_tenant on pre_match_poll_votes;
create policy pre_match_poll_votes_insert_member_same_tenant
on pre_match_poll_votes
for insert
with check (
  (app_private.is_member_of_tenant(tenant_id) or app_private.is_owner())
  and membership_id in (
    select * from app_private.current_membership_ids_for_tenant(tenant_id)
  )
);

drop policy if exists pre_match_poll_votes_update_self_only on pre_match_poll_votes;
create policy pre_match_poll_votes_update_self_only
on pre_match_poll_votes
for update
using (
  membership_id in (
    select * from app_private.current_membership_ids_for_tenant(tenant_id)
  )
)
with check (
  membership_id in (
    select * from app_private.current_membership_ids_for_tenant(tenant_id)
  )
);

-- =========================================================
-- Sensitive votes / ratings
-- IMPORTANT:
-- raw values hidden from standard app roles.
-- only service-role/server functions should read these directly.
-- =========================================================

drop policy if exists player_of_match_votes_no_direct_select on player_of_match_votes;
create policy player_of_match_votes_no_direct_select
on player_of_match_votes
for select
using (false);

drop policy if exists player_of_match_votes_insert_self_only on player_of_match_votes;
create policy player_of_match_votes_insert_self_only
on player_of_match_votes
for insert
with check (
  (app_private.is_member_of_tenant(tenant_id) or app_private.is_owner())
  and voter_membership_id in (
    select * from app_private.current_membership_ids_for_tenant(tenant_id)
  )
);

drop policy if exists player_of_match_votes_update_self_only on player_of_match_votes;
create policy player_of_match_votes_update_self_only
on player_of_match_votes
for update
using (
  voter_membership_id in (
    select * from app_private.current_membership_ids_for_tenant(tenant_id)
  )
)
with check (
  voter_membership_id in (
    select * from app_private.current_membership_ids_for_tenant(tenant_id)
  )
);

drop policy if exists teammate_ratings_no_direct_select on teammate_ratings;
create policy teammate_ratings_no_direct_select
on teammate_ratings
for select
using (false);

drop policy if exists teammate_ratings_insert_self_only on teammate_ratings;
create policy teammate_ratings_insert_self_only
on teammate_ratings
for insert
with check (
  (app_private.is_member_of_tenant(tenant_id) or app_private.is_owner())
  and rater_membership_id in (
    select * from app_private.current_membership_ids_for_tenant(tenant_id)
  )
);

drop policy if exists teammate_ratings_update_self_only on teammate_ratings;
create policy teammate_ratings_update_self_only
on teammate_ratings
for update
using (
  rater_membership_id in (
    select * from app_private.current_membership_ids_for_tenant(tenant_id)
  )
)
with check (
  rater_membership_id in (
    select * from app_private.current_membership_ids_for_tenant(tenant_id)
  )
);

drop policy if exists rating_revisions_select_admin_only on rating_revisions;
create policy rating_revisions_select_admin_only
on rating_revisions
for select
using (false);

-- =========================================================
-- Ledger
-- =========================================================

drop policy if exists ledger_select_self_or_admin on ledger_transactions;
create policy ledger_select_self_or_admin
on ledger_transactions
for select
using (
  membership_id in (
    select * from app_private.current_membership_ids_for_tenant(tenant_id)
  )
  or app_private.is_admin_of_tenant(tenant_id)
  or app_private.is_owner()
);

drop policy if exists ledger_insert_admin_only on ledger_transactions;
create policy ledger_insert_admin_only
on ledger_transactions
for insert
with check (
  app_private.is_admin_of_tenant(tenant_id)
  or app_private.is_owner()
);

drop policy if exists ledger_update_admin_only on ledger_transactions;
create policy ledger_update_admin_only
on ledger_transactions
for update
using (
  app_private.is_admin_of_tenant(tenant_id)
  or app_private.is_owner()
)
with check (
  app_private.is_admin_of_tenant(tenant_id)
  or app_private.is_owner()
);

-- =========================================================
-- Notifications
-- =========================================================

drop policy if exists notifications_select_self on notifications;
create policy notifications_select_self
on notifications
for select
using (
  membership_id in (
    select * from app_private.current_membership_ids_for_tenant(tenant_id)
  )
  or app_private.is_owner()
);

drop policy if exists notifications_update_self on notifications;
create policy notifications_update_self
on notifications
for update
using (
  membership_id in (
    select * from app_private.current_membership_ids_for_tenant(tenant_id)
  )
)
with check (
  membership_id in (
    select * from app_private.current_membership_ids_for_tenant(tenant_id)
  )
);

drop policy if exists notifications_insert_service on notifications;
create policy notifications_insert_service
on notifications
for insert
with check (true);

-- =========================================================
-- Push subscriptions
-- =========================================================

drop policy if exists push_subscriptions_select_self on push_subscriptions;
create policy push_subscriptions_select_self
on push_subscriptions
for select
using (
  account_id = app_private.current_account_id()
);

drop policy if exists push_subscriptions_insert_self on push_subscriptions;
create policy push_subscriptions_insert_self
on push_subscriptions
for insert
with check (
  account_id = app_private.current_account_id()
);

drop policy if exists push_subscriptions_update_self on push_subscriptions;
create policy push_subscriptions_update_self
on push_subscriptions
for update
using (
  account_id = app_private.current_account_id()
)
with check (
  account_id = app_private.current_account_id()
);

-- =========================================================
-- Audit logs
-- =========================================================

drop policy if exists audit_logs_select_admin_or_owner on audit_logs;
create policy audit_logs_select_admin_or_owner
on audit_logs
for select
using (
  (tenant_id is not null and app_private.is_admin_of_tenant(tenant_id))
  or app_private.is_owner()
);

drop policy if exists audit_logs_insert_service on audit_logs;
create policy audit_logs_insert_service
on audit_logs
for insert
with check (true);

-- =========================================================
-- Recommended aggregate views for safe exposure
-- =========================================================

create or replace view safe_member_stats as
select *
from member_stats_view;

create or replace view safe_leaderboard_metrics as
select *
from leaderboard_metrics_view;

-- Notes:
-- 1. Expose only safe aggregate views to client code for ratings/statistics.
-- 2. Keep raw teammate_ratings and player_of_match_votes behind service-role / server-only workflows.
