-- Household Finance App — initial schema
--
-- Design: a single household with two members and a "fully pooled"
-- money model (per user decision). RLS therefore enforces *household
-- membership*, not per-row privacy — every table carries a
-- household_id and the same four-policy set (select/insert/update/
-- delete, each gated on membership). "Personal" spending is a tag
-- (is_personal + owner_user_id), not a visibility wall: both spouses
-- can always see everything, filters just group by it.
--
-- The agent (home box) writes via the Supabase service-role key,
-- which bypasses RLS entirely — that's the trusted single-writer
-- ingestion path described in the architecture. The web app only ever
-- gets a user JWT, so RLS is the only thing standing between one
-- browser tab and someone else's bank data.

create extension if not exists pgcrypto;

-- ============================================================
-- Households & membership
-- ============================================================

create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Note: a brand-new household's first member row can never satisfy its
-- own insert policy (is_member() has nothing to find yet) — that's
-- expected. Household + first-member seeding always happens via the
-- service-role key (seed.sql), which bypasses RLS entirely. There is
-- no in-app "create a household" flow for this two-person app.
create table household_members (
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member', 'admin')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

-- security definer: must bypass RLS on household_members itself, or
-- every policy that calls is_member() would recurse into itself when
-- checking household_members's own policies.
create or replace function public.is_member(target_household_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from household_members hm
    where hm.household_id = target_household_id
      and hm.user_id = auth.uid()
  );
$$;

grant execute on function public.is_member(uuid) to authenticated;

-- ============================================================
-- Signup guard (belt-and-suspenders alongside the dashboard's
-- "disable signups" toggle). Empty by default — seed.sql inserts the
-- two real household emails before auth signups are ever exercised.
-- ============================================================

create table household_signup_allowlist (
  email text primary key
);

create or replace function public.enforce_signup_allowlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from household_signup_allowlist a
    where lower(a.email) = lower(new.email)
  ) then
    raise exception 'signup not permitted for this application';
  end if;
  return new;
end;
$$;

create trigger enforce_signup_allowlist_trigger
  before insert on auth.users
  for each row
  execute function public.enforce_signup_allowlist();

-- ============================================================
-- updated_at helper
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- Categories
-- ============================================================

create table categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  slug text not null,
  name text not null,
  parent_id uuid references categories(id) on delete set null,
  is_income boolean not null default false,
  icon text,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, slug)
);

-- ============================================================
-- Rule engine & merchant map
-- ============================================================

create table rules (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  priority int not null,
  conditions jsonb not null,
  actions jsonb not null,
  is_active boolean not null default true,
  stop_processing boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, priority)
);

create trigger rules_set_updated_at
  before update on rules
  for each row execute function public.set_updated_at();

create table merchant_map (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  merchant_key text not null,
  display_name_en text,
  category_id uuid references categories(id) on delete set null,
  confidence numeric(3, 2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, merchant_key)
);

create trigger merchant_map_set_updated_at
  before update on merchant_map
  for each row execute function public.set_updated_at();

-- ============================================================
-- Connections & accounts
-- ============================================================

create table connections (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  provider text not null check (provider in ('hapoalim', 'leumi', 'max', 'isracard')),
  display_name text not null,
  owner_user_id uuid not null references auth.users(id),
  -- Name of the secret on the agent's local encrypted store. The
  -- secret value itself never enters this database — see the
  -- secrets-handling design in the plan.
  credential_ref text not null,
  status text not null default 'active' check (status in ('active', 'needs_attention', 'disabled')),
  last_success_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger connections_set_updated_at
  before update on connections
  for each row execute function public.set_updated_at();

create table accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  connection_id uuid references connections(id) on delete cascade,
  provider_account_number text,
  kind text not null check (kind in ('checking', 'credit_card', 'manual_asset')),
  currency text not null default 'ILS',
  display_name text not null,
  latest_balance numeric(14, 2),
  latest_balance_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Not a partial index (no WHERE clause), even though connection_id is
-- nullable for manual_asset accounts. Two reasons: (1) standard SQL
-- unique-index semantics already treat NULL as distinct from NULL, so
-- multiple manual_asset rows (connection_id IS NULL) never collide
-- here regardless; (2) Supabase's .upsert({onConflict: 'col,col'})
-- goes through PostgREST, which emits a plain `ON CONFLICT (columns)`
-- with no predicate — Postgres can only match that against a
-- non-partial unique index/constraint. A partial version of this
-- index was tried first and broke every real upsert with "no unique
-- or exclusion constraint matching the ON CONFLICT specification".
create unique index accounts_connection_provider_number_idx
  on accounts (connection_id, provider_account_number);

create trigger accounts_set_updated_at
  before update on accounts
  for each row execute function public.set_updated_at();

-- ============================================================
-- Billing cycles — created before `transactions` even though it
-- references transactions (matched_bank_txn_id), because transactions
-- also references billing_cycles (billing_cycle_id). This is a
-- genuine circular dependency between the two tables; both
-- cross-references are added via ALTER TABLE once both tables exist.
-- ============================================================

create table billing_cycles (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  cycle_month date not null,
  expected_charge_date date,
  expected_total numeric(14, 2),
  matched_bank_txn_id uuid, -- FK added below, after transactions exists
  status text not null default 'open' check (status in ('open', 'charged', 'matched', 'mismatch')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, cycle_month)
);

create trigger billing_cycles_set_updated_at
  before update on billing_cycles
  for each row execute function public.set_updated_at();

-- ============================================================
-- Transactions — the core table. See dedup-identity design in
-- packages/shared/src/dedup.ts for how dedup_hash is computed.
-- ============================================================

create table transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  date date not null,
  processed_date date,
  charged_amount numeric(14, 2) not null,
  charged_currency text not null default 'ILS',
  original_amount numeric(14, 2) not null,
  original_currency text not null default 'ILS',
  description text not null,
  memo text,
  status text not null default 'completed' check (status in ('pending', 'completed')),
  txn_type text not null default 'normal' check (txn_type in ('normal', 'installments')),
  installment_number int,
  installment_total int,
  provider_identifier text,
  dedup_hash text not null,
  category_id uuid references categories(id) on delete set null,
  categorization_source text not null default 'none'
    check (categorization_source in ('manual', 'rule', 'merchant_map', 'llm', 'none')),
  applied_rule_id uuid references rules(id) on delete set null,
  is_personal boolean not null default false,
  owner_user_id uuid references auth.users(id),
  exclude_from_totals boolean not null default false,
  tags text[] not null default '{}',
  notes text,
  billing_cycle_id uuid references billing_cycles(id) on delete set null,
  is_manual boolean not null default false,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index transactions_account_dedup_hash_idx
  on transactions (account_id, dedup_hash);

create index transactions_household_date_idx on transactions (household_id, date);
create index transactions_account_date_idx on transactions (account_id, date);
create index transactions_category_idx on transactions (category_id);
create index transactions_status_idx on transactions (status);
create index transactions_billing_cycle_idx on transactions (billing_cycle_id);

create trigger transactions_set_updated_at
  before update on transactions
  for each row execute function public.set_updated_at();

alter table billing_cycles
  add constraint billing_cycles_matched_bank_txn_fk
  foreign key (matched_bank_txn_id) references transactions(id) on delete set null;

-- ============================================================
-- Installment plans (forward liability schedule)
-- ============================================================

create table installment_plans (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  origin_transaction_id uuid not null references transactions(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  merchant_description text not null,
  total_amount numeric(14, 2) not null,
  total_count int not null,
  monthly_amount numeric(14, 2) not null,
  remaining_count int not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger installment_plans_set_updated_at
  before update on installment_plans
  for each row execute function public.set_updated_at();

-- ============================================================
-- Recurring series (subscriptions/bills/income detection)
-- ============================================================

create table recurring_series (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  merchant_key text not null,
  cadence text check (cadence in ('weekly', 'monthly', 'yearly', 'irregular')),
  expected_amount numeric(14, 2),
  amount_history jsonb not null default '[]'::jsonb,
  next_expected_date date,
  series_type text check (series_type in ('income', 'bill', 'subscription')),
  is_confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger recurring_series_set_updated_at
  before update on recurring_series
  for each row execute function public.set_updated_at();

-- ============================================================
-- Budgets
-- ============================================================

create table budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  category_id uuid references categories(id) on delete cascade,
  amount numeric(14, 2) not null,
  period text not null default 'monthly' check (period in ('monthly')),
  starts_on date not null,
  rollover boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger budgets_set_updated_at
  before update on budgets
  for each row execute function public.set_updated_at();

-- ============================================================
-- Manual net-worth assets
-- ============================================================

create table asset_snapshots (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  as_of date not null,
  value numeric(14, 2) not null,
  currency text not null default 'ILS',
  created_at timestamptz not null default now(),
  unique (account_id, as_of)
);

-- ============================================================
-- Exchange rates — deliberately NOT household-scoped. This is public
-- market data (Bank of Israel daily rates), not private household
-- financial data, so it has no household_id and no RLS write access
-- for regular users: any authenticated household member can read it,
-- only the agent (service role, bypasses RLS) writes it. This is an
-- intentional, explicit exception to the "every table carries
-- household_id" rule, made because the data itself isn't sensitive.
-- ============================================================

create table exchange_rates (
  id uuid primary key default gen_random_uuid(),
  as_of date not null,
  currency text not null,
  rate_to_ils numeric(18, 6) not null,
  created_at timestamptz not null default now(),
  unique (as_of, currency)
);

alter table exchange_rates enable row level security;

create policy exchange_rates_select_authenticated
  on exchange_rates for select
  to authenticated
  using (true);

-- ============================================================
-- Sync runs & manual-sync job queue
-- ============================================================

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  connection_id uuid not null references connections(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running' check (status in ('running', 'success', 'partial', 'failed')),
  error_code text,
  txns_new int not null default 0,
  txns_updated int not null default 0,
  pending_resolved int not null default 0,
  created_at timestamptz not null default now()
);

create index sync_runs_connection_idx on sync_runs (connection_id, started_at desc);

create table sync_requests (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  connection_id uuid references connections(id) on delete cascade, -- null = sync all connections
  requested_by uuid not null references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'claimed', 'done', 'failed')),
  claimed_at timestamptz,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Anomalies
-- ============================================================

create table anomalies (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  kind text not null check (
    kind in ('unusual_amount', 'possible_duplicate', 'subscription_increase', 'missed_recurring', 'balance_drift')
  ),
  transaction_id uuid references transactions(id) on delete cascade,
  account_id uuid references accounts(id) on delete cascade,
  baseline jsonb,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger anomalies_set_updated_at
  before update on anomalies
  for each row execute function public.set_updated_at();

-- ============================================================
-- Row Level Security — every household-scoped table gets the same
-- four policies, gated on public.is_member(household_id). No table
-- listed here is exempt; exchange_rates (handled above) is the only
-- deliberate exception in the whole schema, and it's a read-only
-- policy for a non-household-scoped table, not a gap in coverage.
-- ============================================================

do $$
declare
  t text;
  household_scoped_tables constant text[] := array[
    'households',
    'household_members',
    'categories',
    'rules',
    'merchant_map',
    'connections',
    'accounts',
    'billing_cycles',
    'transactions',
    'installment_plans',
    'recurring_series',
    'budgets',
    'asset_snapshots',
    'sync_runs',
    'sync_requests',
    'anomalies'
  ];
  household_id_column text;
begin
  foreach t in array household_scoped_tables loop
    execute format('alter table %I enable row level security', t);

    -- households' own primary key IS the household_id being checked;
    -- every other table has a household_id column.
    household_id_column := case when t = 'households' then 'id' else 'household_id' end;

    -- `to authenticated` is explicit defense-in-depth: even without it,
    -- the anon role would still be denied since is_member() is always
    -- false with no auth.uid(), but a reviewer shouldn't have to trace
    -- that through the function body to confirm anon has no access.
    execute format(
      'create policy %I on %I for select to authenticated using (public.is_member(%I))',
      t || '_select_member', t, household_id_column
    );
    execute format(
      'create policy %I on %I for insert to authenticated with check (public.is_member(%I))',
      t || '_insert_member', t, household_id_column
    );
    execute format(
      'create policy %I on %I for update to authenticated using (public.is_member(%I)) with check (public.is_member(%I))',
      t || '_update_member', t, household_id_column, household_id_column
    );
    execute format(
      'create policy %I on %I for delete to authenticated using (public.is_member(%I))',
      t || '_delete_member', t, household_id_column
    );
  end loop;
end $$;

-- ============================================================
-- Reporting views
-- ============================================================

create view v_spending_by_category
with (security_invoker = true) as
select
  t.household_id,
  date_trunc('month', t.date)::date as month,
  t.category_id,
  c.name as category_name,
  sum(t.charged_amount) filter (where c.is_income is not true) as spent,
  sum(t.charged_amount) filter (where c.is_income is true) as earned
from transactions t
left join categories c on c.id = t.category_id
where t.status = 'completed'
  and t.exclude_from_totals = false
group by t.household_id, date_trunc('month', t.date), t.category_id, c.name;

create view v_monthly_cash_flow
with (security_invoker = true) as
select
  household_id,
  date_trunc('month', date)::date as month,
  sum(charged_amount) filter (where charged_amount > 0) as inflow,
  sum(charged_amount) filter (where charged_amount < 0) as outflow,
  sum(charged_amount) as net
from transactions
where status = 'completed'
  and exclude_from_totals = false
group by household_id, date_trunc('month', date);

create view v_net_worth
with (security_invoker = true) as
select
  a.household_id,
  a.id as account_id,
  a.display_name,
  a.kind,
  a.currency,
  coalesce(a.latest_balance, 0) as scraped_balance,
  coalesce((
    select s.value
    from asset_snapshots s
    where s.account_id = a.id
    order by s.as_of desc
    limit 1
  ), 0) as latest_manual_value,
  coalesce((
    select sum(ip.remaining_count * ip.monthly_amount)
    from installment_plans ip
    where ip.account_id = a.id
  ), 0) as remaining_installment_liability
from accounts a;

create view v_upcoming_charges
with (security_invoker = true) as
select
  household_id,
  account_id,
  origin_transaction_id,
  merchant_description,
  monthly_amount,
  remaining_count
from installment_plans
where remaining_count > 0;
