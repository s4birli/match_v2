-- Adds the `is_system_owner` flag to the accounts table.
-- Per CLAUDE.md product rule: a system owner CANNOT belong to any group.
-- We identify system owners at the account level, NOT through a membership row.

alter table accounts
  add column if not exists is_system_owner boolean not null default false;

create index if not exists ix_accounts_system_owner
  on accounts (is_system_owner)
  where is_system_owner = true;

-- Mark the seeded owner@example.com as system owner.
update accounts set is_system_owner = true where email = 'owner@example.com';

-- Remove any owner-level memberships (system owners must not be members).
delete from memberships m
where m.role = 'owner'
  and m.person_id in (
    select p.id from persons p
    join accounts a on a.id = p.primary_account_id
    where a.is_system_owner = true
  );
