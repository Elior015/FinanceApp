-- Recurring-series population (M3 Phase 2).
-- Adds a propose-then-confirm lifecycle to `recurring_series` so the
-- `subscription_increase` and `missed_recurring` branches of
-- `public.detect_anomalies` can run against real data.
--
-- Design choices:
-- - `status` replaces `is_confirmed` as the source of truth.
-- - Auto-detection only ever creates/updates `status='proposed'` rows.
-- - Users confirm or dismiss proposals via the web UI.
-- - Dismissed and manually-created rows are protected from being
--   overwritten or auto-dismissed by later syncs.
-- - Detection remains idempotent: upsert keyed on (household_id, merchant_key).

-- ============================================================
-- 1. Lifecycle columns for recurring_series
-- ============================================================

-- Drop the deprecated is_confirmed column after the function migration below.
-- Until then we keep it so the existing detect_anomalies can compile.

alter table recurring_series
  add column if not exists status text not null default 'proposed'
  check (status in ('proposed', 'confirmed', 'dismissed'));

alter table recurring_series
  add column if not exists is_manual boolean not null default false;

-- Backfill: existing confirmed rows keep confirmed; everything else becomes proposed.
update recurring_series
set status = case when is_confirmed then 'confirmed' else 'proposed' end
where status = 'proposed' and is_confirmed is not null;

-- Unique index prevents duplicate proposals for the same normalized merchant.
create unique index if not exists recurring_series_household_merchant_idx
  on recurring_series (household_id, merchant_key);

-- ============================================================
-- 2. Anomalies conflict key must include series_id
-- ============================================================
--
-- The original anomalies_conflict_idx collapsed NULL transaction_id/account_id
-- to a sentinel UUID. For missed_recurring both columns are NULL, so only one
-- open missed-recurring anomaly per household was possible. Adding series_id
-- to the conflict key lets each recurring series raise its own anomaly.

alter table anomalies
  add column if not exists series_id uuid references recurring_series(id) on delete cascade;

drop index if exists anomalies_conflict_idx;

create unique index if not exists anomalies_conflict_idx
  on anomalies (
    household_id,
    kind,
    coalesce(transaction_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(series_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'open';

-- ============================================================
-- 3. Replace detect_anomalies to use status and set series_id
-- ============================================================

create or replace function public.detect_anomalies(p_household_id uuid)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_merchant_key text;
  v_mean numeric;
  v_std numeric;
  v_threshold numeric;
  v_txn record;
  v_series record;
  v_account record;
begin
  -- 1) unusual_amount: completed transaction whose absolute amount is
  -- more than 2.5 standard deviations above the mean for the same
  -- normalized description over the last 90 days, requiring at least 3
  -- prior occurrences so the baseline is meaningful.
  for v_txn in
    with candidates as (
      select
        id,
        account_id,
        charged_amount,
        lower(regexp_replace(description, '\s+', ' ', 'g')) as normalized_description,
        date
      from transactions
      where household_id = p_household_id
        and status = 'completed'
        and exclude_from_totals = false
        and date >= current_date - interval '7 days'
    ),
    baseline as (
      select
        c.id,
        avg(abs(b.charged_amount)) as mean,
        coalesce(stddev_samp(abs(b.charged_amount)), 0) as std
      from candidates c
      join transactions b
        on b.household_id = p_household_id
        and b.status = 'completed'
        and b.exclude_from_totals = false
        and lower(regexp_replace(b.description, '\s+', ' ', 'g')) = c.normalized_description
        and b.date >= current_date - interval '90 days'
        and b.date < c.date
      group by c.id
      having count(*) >= 3 and stddev_samp(abs(b.charged_amount)) > 0
    )
    select
      c.id,
      c.account_id,
      c.charged_amount,
      c.normalized_description,
      b.mean,
      b.std
    from candidates c
    join baseline b on b.id = c.id
    where abs(c.charged_amount) > b.mean + (2.5 * b.std)
  loop
    insert into anomalies (
      household_id, kind, transaction_id, account_id,
      baseline, status
    ) values (
      p_household_id, 'unusual_amount', v_txn.id, v_txn.account_id,
      jsonb_build_object(
        'merchant_key', v_txn.normalized_description,
        'mean', v_txn.mean,
        'std', v_txn.std,
        'threshold', v_txn.mean + (2.5 * v_txn.std),
        'amount', abs(v_txn.charged_amount)
      ),
      'open'
    )
    on conflict do nothing;

    if found then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  -- 2) possible_duplicate: two completed transactions on the same
  -- account with the same normalized description and same absolute
  -- amount within a 7-day window. Only the later txn is flagged.
  for v_txn in
    select later.id, later.account_id, later.description, later.charged_amount
    from transactions earlier
    join transactions later
      on later.household_id = earlier.household_id
      and later.account_id = earlier.account_id
      and lower(regexp_replace(later.description, '\s+', ' ', 'g'))
        = lower(regexp_replace(earlier.description, '\s+', ' ', 'g'))
      and abs(later.charged_amount) = abs(earlier.charged_amount)
      and later.date > earlier.date
      and later.date <= earlier.date + interval '7 days'
      and later.status = 'completed'
      and earlier.status = 'completed'
      and later.exclude_from_totals = false
      and earlier.exclude_from_totals = false
    where later.household_id = p_household_id
      and later.date >= current_date - interval '7 days'
  loop
    insert into anomalies (
      household_id, kind, transaction_id, account_id,
      baseline, status
    ) values (
      p_household_id, 'possible_duplicate', v_txn.id, v_txn.account_id,
      jsonb_build_object(
        'description', v_txn.description,
        'amount', abs(v_txn.charged_amount)
      ),
      'open'
    )
    on conflict do nothing;

    if found then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  -- 3) subscription_increase: for confirmed recurring_series, flag the
  -- latest completed transaction when its absolute amount is more than
  -- 5% above the series expected_amount.
  for v_txn in
    select distinct on (rs.id)
      t.id, t.account_id, t.charged_amount, rs.id as series_id, rs.merchant_key, rs.expected_amount
    from recurring_series rs
    join transactions t
      on t.household_id = rs.household_id
      and lower(regexp_replace(t.description, '\s+', ' ', 'g')) = rs.merchant_key
    where rs.household_id = p_household_id
      and rs.status = 'confirmed'
      and rs.expected_amount is not null
      and t.status = 'completed'
      and t.date >= current_date - interval '7 days'
      and abs(t.charged_amount) > rs.expected_amount * 1.05
    order by rs.id, t.date desc
  loop
    insert into anomalies (
      household_id, kind, transaction_id, account_id, series_id,
      baseline, status
    ) values (
      p_household_id, 'subscription_increase', v_txn.id, v_txn.account_id, v_txn.series_id,
      jsonb_build_object(
        'series_id', v_txn.series_id,
        'merchant_key', v_txn.merchant_key,
        'expected_amount', v_txn.expected_amount,
        'amount', abs(v_txn.charged_amount)
      ),
      'open'
    )
    on conflict do nothing;

    if found then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  -- 4) missed_recurring: for confirmed recurring_series whose
  -- next_expected_date has passed by more than 3 days without a
  -- matching completed transaction.
  for v_series in
    select rs.id as series_id, rs.merchant_key, rs.expected_amount, rs.next_expected_date
    from recurring_series rs
    where rs.household_id = p_household_id
      and rs.status = 'confirmed'
      and rs.next_expected_date is not null
      and rs.next_expected_date < current_date - interval '3 days'
      and not exists (
        select 1
        from transactions t
        where t.household_id = rs.household_id
          and lower(regexp_replace(t.description, '\s+', ' ', 'g')) = rs.merchant_key
          and t.status = 'completed'
          and t.date between rs.next_expected_date - interval '3 days' and current_date + interval '3 days'
          and abs(t.charged_amount) between coalesce(rs.expected_amount, 0) * 0.8 and coalesce(rs.expected_amount, 0) * 1.2
      )
  loop
    insert into anomalies (
      household_id, kind, account_id, series_id,
      baseline, status
    ) values (
      p_household_id, 'missed_recurring', null, v_series.series_id,
      jsonb_build_object(
        'series_id', v_series.series_id,
        'merchant_key', v_series.merchant_key,
        'expected_amount', v_series.expected_amount,
        'next_expected_date', v_series.next_expected_date
      ),
      'open'
    )
    on conflict do nothing;

    if found then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  -- 5) balance_drift: compare the scraped account balance against the
  -- sum of completed transactions since the balance's effective date.
  for v_account in
    select
      a.id as account_id,
      a.latest_balance,
      a.latest_balance_at,
      coalesce(sum(t.charged_amount), 0) as txn_sum,
      (a.latest_balance - coalesce(sum(t.charged_amount), 0)) as drift
    from accounts a
    left join transactions t
      on t.account_id = a.id
      and t.household_id = a.household_id
      and t.status = 'completed'
      and t.date > a.latest_balance_at::date
    where a.household_id = p_household_id
      and a.latest_balance is not null
      and a.latest_balance_at is not null
    group by a.id, a.latest_balance, a.latest_balance_at
    having abs(a.latest_balance - coalesce(sum(t.charged_amount), 0)) > 1
  loop
    insert into anomalies (
      household_id, kind, account_id,
      baseline, status
    ) values (
      p_household_id, 'balance_drift', v_account.account_id,
      jsonb_build_object(
        'latest_balance', v_account.latest_balance,
        'latest_balance_at', v_account.latest_balance_at,
        'txn_sum_since_balance', v_account.txn_sum,
        'drift', v_account.drift
      ),
      'open'
    )
    on conflict do nothing;

    if found then
      v_inserted := v_inserted + 1;
    end if;
  end loop;

  return v_inserted;
end;
$$;

-- Index on the new anomalies.series_id column for FK/join performance.
create index if not exists anomalies_series_id_idx on anomalies (series_id);

-- ============================================================
-- 4. Populate recurring_series from transaction history
-- ============================================================

create or replace function public.populate_recurring_series(p_household_id uuid)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v_inserted integer := 0;
  v_updated integer := 0;
  v_group record;
  v_merchant_key text;
  v_dates date[];
  v_amounts numeric[];
  v_median_amount numeric;
  v_median_gap numeric;
  v_cadence text;
  v_latest_date date;
  v_next_expected_date date;
  v_series_type text;
  v_existing_status text;
  v_existing_is_manual boolean;
  v_amount_history jsonb;
begin
  -- Scan normalized merchants with at least 3 completed occurrences in 180 days.
  for v_group in
    select
      lower(regexp_replace(description, '\s+', ' ', 'g')) as merchant_key,
      array_agg(date order by date) as dates,
      array_agg(abs(charged_amount) order by date) as amounts
    from transactions
    where household_id = p_household_id
      and status = 'completed'
      and exclude_from_totals = false
      and date >= current_date - interval '180 days'
    group by lower(regexp_replace(description, '\s+', ' ', 'g'))
    having count(*) >= 3
  loop
    v_merchant_key := v_group.merchant_key;
    v_dates := v_group.dates;
    v_amounts := v_group.amounts;

    -- Median absolute amount (robust to one-off variance).
    v_median_amount := v_amounts[array_length(v_amounts, 1) / 2 + 1];

    -- Median gap between consecutive dates.
    if array_length(v_dates, 1) > 1 then
      select percentile_cont(0.5) within group (order by gap)
      into v_median_gap
      from (
        select (v_dates[i + 1] - v_dates[i]) as gap
        from generate_series(1, array_length(v_dates, 1) - 1) as i
      ) g;
    else
      v_median_gap := 30;
    end if;

    -- Map median gap to cadence.
    case
      when v_median_gap <= 10 then v_cadence := 'weekly';
      when v_median_gap <= 40 then v_cadence := 'monthly';
      when v_median_gap <= 100 then v_cadence := 'yearly';
      else v_cadence := 'irregular';
    end case;

    v_latest_date := v_dates[array_length(v_dates, 1)];
    v_next_expected_date := v_latest_date + make_interval(days => v_median_gap::int);

    -- Simple type heuristic: positive median amount => income; else subscription.
    -- (bills are also negative in this household's data model, so they fall under subscription.)
    if v_median_amount > 0 then
      v_series_type := 'income';
    else
      v_series_type := 'subscription';
    end if;

    -- Build amount history from the last 12 occurrences.
    select jsonb_agg(jsonb_build_object('date', d, 'amount', a) order by d)
    into v_amount_history
    from (
      select v_dates[i] as d, v_amounts[i] as a
      from generate_series(
        greatest(1, array_length(v_dates, 1) - 11),
        array_length(v_dates, 1)
      ) as i
    ) h;

    -- Check existing row to respect dismissed/manual state.
    select status, is_manual
    into v_existing_status, v_existing_is_manual
    from recurring_series
    where household_id = p_household_id and merchant_key = v_merchant_key;

    if v_existing_status = 'dismissed' or v_existing_is_manual then
      -- Never overwrite dismissed or manual series.
      continue;
    end if;

    if v_existing_status is null then
      -- New proposal.
      insert into recurring_series (
        household_id, merchant_key, cadence, expected_amount,
        amount_history, next_expected_date, series_type, status, is_manual
      ) values (
        p_household_id, v_merchant_key, v_cadence, v_median_amount,
        v_amount_history, v_next_expected_date, v_series_type, 'proposed', false
      )
      on conflict (household_id, merchant_key)
      do update set
        cadence = excluded.cadence,
        expected_amount = excluded.expected_amount,
        amount_history = excluded.amount_history,
        next_expected_date = excluded.next_expected_date,
        series_type = excluded.series_type,
        status = excluded.status,
        is_manual = excluded.is_manual,
        updated_at = now();

      v_inserted := v_inserted + 1;
    elsif v_existing_status = 'proposed' then
      -- Refresh computed values while staying proposed.
      update recurring_series
      set cadence = v_cadence,
          expected_amount = v_median_amount,
          amount_history = v_amount_history,
          next_expected_date = v_next_expected_date,
          series_type = v_series_type,
          updated_at = now()
      where household_id = p_household_id and merchant_key = v_merchant_key;

      v_updated := v_updated + 1;
    elsif v_existing_status = 'confirmed' then
      -- Only refresh next_expected_date from latest transaction; do not
      -- silently move the expected_amount baseline (anomaly detection
      -- relies on a stable baseline).
      update recurring_series
      set next_expected_date = v_next_expected_date,
          amount_history = v_amount_history,
          updated_at = now()
      where household_id = p_household_id and merchant_key = v_merchant_key;

      v_updated := v_updated + 1;
    end if;
  end loop;

  return v_inserted + v_updated;
end;
$$;

-- Agent-only: both functions are called from the ingest pipeline using the
-- service-role key.
revoke execute on function public.detect_anomalies(uuid) from public, anon, authenticated;
revoke execute on function public.populate_recurring_series(uuid) from public, anon, authenticated;
