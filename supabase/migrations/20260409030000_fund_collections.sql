-- Tenant fund collection campaigns: an admin can charge a chosen subset of
-- members for an off-match expense (e.g. equipment money). Each pick becomes
-- a row in `ledger_transactions` with reason_code='fund' and metadata.fund_id
-- pointing back to the campaign — the admin can then see who has paid (sum
-- of credits since the campaign) vs. who is still owing.

create table if not exists tenant_fund_collections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id),
  name text not null,
  description text null,
  amount_per_member numeric(10, 2) not null,
  currency_code text not null,
  created_by_membership_id uuid null references memberships(id),
  created_at timestamptz not null default now()
);
create index if not exists ix_fund_collections_tenant
  on tenant_fund_collections (tenant_id, created_at desc);

-- Helpful index for "find members with negative balance" queries.
create index if not exists ix_ledger_tenant_membership_amount
  on ledger_transactions (tenant_id, membership_id);
