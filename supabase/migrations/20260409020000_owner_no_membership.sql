-- System owners can NEVER be members of any group. Remove the bootstrap
-- workaround that placed an archived placeholder membership in their name
-- by allowing tenant_invites.created_by_membership_id to be NULL, so the
-- owner can spawn invite links without ever being a tenant member.

alter table tenant_invites
  alter column created_by_membership_id drop not null;

-- Sweep any existing placeholder memberships that the previous bootstrap path
-- may have created for system-owner accounts. Null out the FK on the invites
-- that reference them first, so the delete cascades cleanly.
with owner_persons as (
  select p.id as person_id
  from accounts a
  join persons p on p.primary_account_id = a.id
  where a.is_system_owner = true
)
update tenant_invites ti
set created_by_membership_id = null
from memberships m
where ti.created_by_membership_id = m.id
  and m.person_id in (select person_id from owner_persons);

delete from memberships m
using accounts a, persons p
where m.person_id = p.id
  and p.primary_account_id = a.id
  and a.is_system_owner = true;
