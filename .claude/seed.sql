-- seed.sql
-- Minimal seed data for local/dev environments

-- ============================================================
-- Supabase Auth users (password: Test1234! for all)
-- ============================================================
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  confirmation_token, recovery_token,
  email_change, email_change_token_new, email_change_token_current,
  email_change_confirm_status, phone_change, phone_change_token,
  reauthentication_token, is_sso_user, is_anonymous,
  raw_app_meta_data, raw_user_meta_data
) values
(
  '00000000-0000-0000-0000-000000000000',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'authenticated', 'authenticated',
  'owner@example.com',
  '$2b$10$0c358zLo5Fr2SXFu6hnQlu7VQfyqK5QwWHPGI77OcXLEOoZPv2GyO',
  now(), now(), now(), '', '',
  '', '', '', 0, '', '', '', false, false,
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"System Owner"}'
),
(
  '00000000-0000-0000-0000-000000000000',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  'authenticated', 'authenticated',
  'admin.north@example.com',
  '$2b$10$0c358zLo5Fr2SXFu6hnQlu7VQfyqK5QwWHPGI77OcXLEOoZPv2GyO',
  now(), now(), now(), '', '',
  '', '', '', 0, '', '', '', false, false,
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"North Admin"}'
),
(
  '00000000-0000-0000-0000-000000000000',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
  'authenticated', 'authenticated',
  'assistant.north@example.com',
  '$2b$10$0c358zLo5Fr2SXFu6hnQlu7VQfyqK5QwWHPGI77OcXLEOoZPv2GyO',
  now(), now(), now(), '', '',
  '', '', '', 0, '', '', '', false, false,
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"North Assistant"}'
),
(
  '00000000-0000-0000-0000-000000000000',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4',
  'authenticated', 'authenticated',
  'levent@example.com',
  '$2b$10$0c358zLo5Fr2SXFu6hnQlu7VQfyqK5QwWHPGI77OcXLEOoZPv2GyO',
  now(), now(), now(), '', '',
  '', '', '', 0, '', '', '', false, false,
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Levent"}'
)
on conflict (id) do nothing;

-- auth identities (required for Supabase Auth to work)
insert into auth.identities (
  id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
) values
(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'owner@example.com',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1","email":"owner@example.com"}',
  'email', now(), now(), now()
),
(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  'admin.north@example.com',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2","email":"admin.north@example.com"}',
  'email', now(), now(), now()
),
(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
  'assistant.north@example.com',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3","email":"assistant.north@example.com"}',
  'email', now(), now(), now()
),
(
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4',
  'levent@example.com',
  '{"sub":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4","email":"levent@example.com"}',
  'email', now(), now(), now()
)
on conflict (provider_id, provider) do nothing;

-- ============================================================
-- Application data
-- ============================================================

insert into tenants (
  id, name, slug, currency_code, default_language, invite_code, default_match_fee
) values (
  '11111111-1111-1111-1111-111111111111',
  'North Reading FC',
  'north-reading-fc',
  'GBP',
  'en',
  'READ123',
  4.00
) on conflict (id) do nothing;

insert into tenants (
  id, name, slug, currency_code, default_language, invite_code, default_match_fee
) values (
  '22222222-2222-2222-2222-222222222222',
  'South Reading FC',
  'south-reading-fc',
  'GBP',
  'en',
  'SOUTH456',
  5.00
) on conflict (id) do nothing;

-- demo accounts
insert into accounts (
  id, auth_user_id, email, preferred_language
) values
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1',
  'owner@example.com',
  'en'
),
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  'admin.north@example.com',
  'en'
),
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb3',
  'assistant.north@example.com',
  'en'
),
(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb4',
  'levent@example.com',
  'tr'
)
on conflict (id) do nothing;

-- persons
insert into persons (
  id, primary_account_id, first_name, last_name, display_name, email, is_guest_profile
) values
(
  'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1',
  'System',
  'Owner',
  'System Owner',
  'owner@example.com',
  false
),
(
  'cccccccc-cccc-cccc-cccc-ccccccccccc2',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2',
  'North',
  'Admin',
  'North Admin',
  'admin.north@example.com',
  false
),
(
  'cccccccc-cccc-cccc-cccc-ccccccccccc3',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3',
  'North',
  'Assistant',
  'North Assistant',
  'assistant.north@example.com',
  false
),
(
  'cccccccc-cccc-cccc-cccc-ccccccccccc4',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa4',
  'Levent',
  null,
  'Levent',
  'levent@example.com',
  false
),
(
  'cccccccc-cccc-cccc-cccc-ccccccccccc5',
  null,
  'Guest',
  'Ahmet',
  'Guest Ahmet',
  null,
  true
)
on conflict (id) do nothing;

-- memberships
insert into memberships (
  id, tenant_id, person_id, role, status, stats_visibility, joined_at, is_guest_membership
) values
(
  'dddddddd-dddd-dddd-dddd-ddddddddddd1',
  '11111111-1111-1111-1111-111111111111',
  'cccccccc-cccc-cccc-cccc-ccccccccccc1',
  'owner',
  'active',
  'included',
  now(),
  false
),
(
  'dddddddd-dddd-dddd-dddd-ddddddddddd2',
  '11111111-1111-1111-1111-111111111111',
  'cccccccc-cccc-cccc-cccc-ccccccccccc2',
  'admin',
  'active',
  'included',
  now(),
  false
),
(
  'dddddddd-dddd-dddd-dddd-ddddddddddd3',
  '11111111-1111-1111-1111-111111111111',
  'cccccccc-cccc-cccc-cccc-ccccccccccc3',
  'assistant_admin',
  'active',
  'included',
  now(),
  false
),
(
  'dddddddd-dddd-dddd-dddd-ddddddddddd4',
  '11111111-1111-1111-1111-111111111111',
  'cccccccc-cccc-cccc-cccc-ccccccccccc4',
  'user',
  'active',
  'included',
  now(),
  false
),
(
  'dddddddd-dddd-dddd-dddd-ddddddddddd5',
  '22222222-2222-2222-2222-222222222222',
  'cccccccc-cccc-cccc-cccc-ccccccccccc4',
  'user',
  'active',
  'included',
  now(),
  false
),
(
  'dddddddd-dddd-dddd-dddd-ddddddddddd6',
  '11111111-1111-1111-1111-111111111111',
  'cccccccc-cccc-cccc-cccc-ccccccccccc5',
  'guest',
  'active',
  'included',
  now(),
  true
)
on conflict (tenant_id, person_id) do nothing;

-- tenant feature flags
insert into tenant_feature_flags (tenant_id, feature_key, is_enabled)
values
('11111111-1111-1111-1111-111111111111', 'post_match_rating', true),
('11111111-1111-1111-1111-111111111111', 'player_of_match', true),
('11111111-1111-1111-1111-111111111111', 'push_notifications', true)
on conflict (tenant_id, feature_key) do nothing;

-- invite
insert into tenant_invites (
  id, tenant_id, token, created_by_membership_id, default_role, is_active
) values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
  '11111111-1111-1111-1111-111111111111',
  'invite-token-north-001',
  'dddddddd-dddd-dddd-dddd-ddddddddddd2',
  'user',
  true
) on conflict (id) do nothing;

-- positions
insert into position_preferences (membership_id, position_code, priority_rank)
values
('dddddddd-dddd-dddd-dddd-ddddddddddd4', 'midfield', 1),
('dddddddd-dddd-dddd-dddd-ddddddddddd4', 'defender', 2),
('dddddddd-dddd-dddd-dddd-ddddddddddd6', 'forward', 1)
on conflict (membership_id, position_code) do nothing;

-- venue
insert into venues (id, tenant_id, name, address_line)
values (
  'ffffffff-ffff-ffff-ffff-fffffffffff1',
  '11111111-1111-1111-1111-111111111111',
  'River Park Pitch',
  'Reading'
) on conflict (id) do nothing;

-- match
insert into matches (
  id, tenant_id, venue_id, title, starts_at, ends_at, team_format_label,
  players_per_team, match_fee, currency_code, status, created_by_membership_id
) values (
  '12121212-1212-1212-1212-121212121212',
  '11111111-1111-1111-1111-111111111111',
  'ffffffff-ffff-ffff-ffff-fffffffffff1',
  'Wednesday Match',
  now() + interval '2 day',
  now() + interval '2 day 1 hour',
  '6v6',
  6,
  4.00,
  'GBP',
  'open',
  'dddddddd-dddd-dddd-dddd-ddddddddddd2'
) on conflict (id) do nothing;

insert into match_teams (
  id, match_id, tenant_id, team_key, display_name, sort_order
) values
(
  '13131313-1313-1313-1313-131313131313',
  '12121212-1212-1212-1212-121212121212',
  '11111111-1111-1111-1111-111111111111',
  'red',
  'Red Team',
  1
),
(
  '14141414-1414-1414-1414-141414141414',
  '12121212-1212-1212-1212-121212121212',
  '11111111-1111-1111-1111-111111111111',
  'blue',
  'Blue Team',
  2
)
on conflict (match_id, team_key) do nothing;

insert into match_participants (
  match_id, tenant_id, membership_id, team_id, attendance_status
) values
(
  '12121212-1212-1212-1212-121212121212',
  '11111111-1111-1111-1111-111111111111',
  'dddddddd-dddd-dddd-dddd-ddddddddddd4',
  '13131313-1313-1313-1313-131313131313',
  'confirmed'
),
(
  '12121212-1212-1212-1212-121212121212',
  '11111111-1111-1111-1111-111111111111',
  'dddddddd-dddd-dddd-dddd-ddddddddddd6',
  null,
  'reserve'
)
on conflict (match_id, membership_id) do nothing;

insert into pre_match_polls (
  id, match_id, tenant_id, poll_type, status, created_by_membership_id
) values (
  '15151515-1515-1515-1515-151515151515',
  '12121212-1212-1212-1212-121212121212',
  '11111111-1111-1111-1111-111111111111',
  'winner_prediction',
  'open',
  'dddddddd-dddd-dddd-dddd-ddddddddddd3'
) on conflict (id) do nothing;

insert into pre_match_poll_options (
  id, poll_id, team_id, label, sort_order
) values
(
  '16161616-1616-1616-1616-161616161616',
  '15151515-1515-1515-1515-151515151515',
  '13131313-1313-1313-1313-131313131313',
  'Red Team',
  1
),
(
  '17171717-1717-1717-1717-171717171717',
  '15151515-1515-1515-1515-151515151515',
  '14141414-1414-1414-1414-141414141414',
  'Blue Team',
  2
)
on conflict (poll_id, team_id) do nothing;

insert into notifications (
  tenant_id, membership_id, notification_type, title, body
) values
(
  '11111111-1111-1111-1111-111111111111',
  'dddddddd-dddd-dddd-dddd-ddddddddddd4',
  'match_starting_soon',
  'Upcoming match',
  'Your Wednesday match starts in 1 hour.'
);

-- archived example
insert into persons (
  id, first_name, last_name, display_name, is_guest_profile
) values (
  '18181818-1818-1818-1818-181818181818',
  'Archived',
  'Player',
  'Archived Player',
  false
) on conflict (id) do nothing;

insert into memberships (
  id, tenant_id, person_id, role, status, stats_visibility, archived_at, archived_reason
) values (
  '19191919-1919-1919-1919-191919191919',
  '11111111-1111-1111-1111-111111111111',
  '18181818-1818-1818-1818-181818181818',
  'user',
  'archived',
  'excluded',
  now(),
  'Left the group'
) on conflict (tenant_id, person_id) do nothing;
