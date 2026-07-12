-- Anomaly detection (M3 Phase 1).
-- Runs after every sync and fills the existing `anomalies` table.
-- Each detection branch is idempotent: re-running on unchanged data
-- does not create duplicate open rows because the conflict key
-- (household_id, kind, transaction_id/account_id) is stable.

-- Unique index so `on conflict do nothing` prevents duplicate open
-- anomalies. transaction_id and account_id are both nullable, so we
-- coalesce to a sentinel UUID. status='open' is included in the partial
-- index predicate because once an anomaly is acked/dismissed we allow a
-- future re-detection of the same condition to open a fresh row.
create unique index if not exists anomalies_conflict_idx
  on anomalies (
    household_id,
    kind,
    coalesce(transaction_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(account_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  where status = 'open';

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
  -- The baseline is computed from strictly earlier transactions so the
  -- candidate transaction itself cannot inflate the mean/std.
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

  -- 3) subscription_increase: for rows already in recurring_series,
  -- flag the latest completed transaction when its absolute amount is
  -- more than 5% above the series expected_amount. recurring_series is
  -- empty until Phase 2, so this branch is a no-op until then.
  for v_txn in
    select distinct on (rs.id)
      t.id, t.account_id, t.charged_amount, rs.id as series_id, rs.merchant_key, rs.expected_amount
    from recurring_series rs
    join transactions t
      on t.household_id = rs.household_id
      and lower(regexp_replace(t.description, '\s+', ' ', 'g')) = rs.merchant_key
    where rs.household_id = p_household_id
      and rs.is_confirmed = true
      and rs.expected_amount is not null
      and t.status = 'completed'
      and t.date >= current_date - interval '7 days'
      and abs(t.charged_amount) > rs.expected_amount * 1.05
    order by rs.id, t.date desc
  loop
    insert into anomalies (
      household_id, kind, transaction_id, account_id,
      baseline, status
    ) values (
      p_household_id, 'subscription_increase', v_txn.id, v_txn.account_id,
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
  -- matching completed transaction. recurring_series is empty until
  -- Phase 2, so this branch is a no-op until then.
  for v_series in
    select rs.id as series_id, rs.merchant_key, rs.expected_amount, rs.next_expected_date
    from recurring_series rs
    where rs.household_id = p_household_id
      and rs.is_confirmed = true
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
      household_id, kind, account_id,
      baseline, status
    ) values (
      p_household_id, 'missed_recurring', null,
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
  -- If the absolute difference exceeds 1 ILS, flag it. Catches silently
  -- missed transactions. Only checks accounts where both balance fields
  -- are present.
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

-- Indexes to support the Insights page joins and FK lookups.
create index if not exists anomalies_account_id_idx on anomalies (account_id);
create index if not exists anomalies_transaction_id_idx on anomalies (transaction_id);

-- Agent-only: called from the ingest pipeline using the service-role key.
revoke execute on function public.detect_anomalies(uuid) from public, anon, authenticated;
